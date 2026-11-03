import type { RaceConfig } from '../engine/config';
import { BOT_FIELDS, TEAM_COLOR, makeBot } from '../engine/drivers';
import { outcomeFromAnswers, type PlayerAnswer, type QuestionOutcome } from '../engine/outcome';
import { Race, type Driver } from '../engine/race';
import { mulberry32 } from '../engine/rng';
import { pickAwards, scoreRace } from '../engine/scoring';
import { DEFAULT_TRACK_POINTS, Track } from '../engine/track';
import type { Api, Channel } from '../lib/api';
import { play, unlockAudio } from '../lib/audio';
import type { AnyEvent, EndMsg, FinalInfo, HostEvent, PublicQuestion, RevealMsg } from '../lib/protocol';
import type { PlayerRow, QuestionRow, SavedState, SessionRow } from '../lib/types';
import { raceConfigFor } from './raceSettings';

export type Phase = 'lobby' | 'resume' | 'question' | 'ff' | 'reveal' | 'sprint' | 'finishing' | 'finished';

export interface HostSnapshot {
  phase: Phase;
  paused: boolean;
  /** Pausa automática por a página ter ficado escondida. */
  hidden: boolean;
  connected: boolean;
  players: PlayerRow[];
  qIndex: number;
  total: number;
  laps: number;
  questionTime: number;
  timeLeft: number;
  answered: number;
  question: { prompt: string; options: string[] } | null;
  reveal: RevealMsg | null;
  final: EndMsg | null;
  /** Aviso discreto (erros de rede a gravar, etc.). */
  notice: string | null;
}

const REVEAL_SECONDS = 5;
const FINISH_HOLD = 2.5;
const FF_SECONDS = 1.2;
const EPS = 0.0005;

export { raceConfigFor };

type Listener = () => void;

/**
 * O anfitrião é a autoridade do jogo: mede o tempo pela hora de chegada das respostas,
 * calcula a corrida com o motor e grava respostas e estado a cada pergunta.
 */
export class HostGame {
  readonly track = new Track(DEFAULT_TRACK_POINTS);
  readonly config: RaceConfig;
  readonly questions: QuestionRow[];
  race: Race;
  readonly seed: number;

  private snap: HostSnapshot;
  private listeners = new Set<Listener>();
  private frameListeners = new Set<(clock: number) => void>();
  private channel: Channel | null = null;
  private raf = 0;
  private lastTs = 0;
  private clock = 0;
  private stopped = false;

  private outcomes: QuestionOutcome[] = [];
  private answerLog: PlayerAnswer[][] = [];
  private current: { index: number; q: QuestionRow } | null = null;
  private answers = new Map<string, { value: number; correct: boolean; ms: number }>();
  private qElapsed = 0;
  private revealT = 0;
  private holdT = 0;
  private ffRate = 1;
  private roster: PlayerRow[] = [];
  private lastMsg: HostEvent | null = null;
  private lastResync = 0;
  private pollTimer = 0;
  private timeBucket = -1;
  private teacherPaused = false;
  private pageHidden = false;

  constructor(
    private api: Api,
    readonly session: SessionRow,
    questions: QuestionRow[],
  ) {
    const { config, used } = raceConfigFor(questions, session.settings);
    this.config = config;
    this.questions = questions.slice(0, used);
    this.seed = session.state?.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.race = this.buildRace();
    this.snap = {
      phase: 'lobby', paused: false, hidden: false, connected: false, players: [], qIndex: 0, total: this.questions.length, laps: config.laps,
      questionTime: config.questionTime, timeLeft: config.questionTime, answered: 0, question: null, reveal: null, final: null, notice: null,
    };
  }

  // ---------- React plumbing ----------
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snap;
  onFrame(l: (clock: number) => void) {
    this.frameListeners.add(l);
    return () => this.frameListeners.delete(l);
  }
  private set(patch: Partial<HostSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---------- Ciclo de vida ----------
  async init(): Promise<void> {
    const s = this.session;
    if (s.status === 'finished' && s.state?.final) {
      this.set({ phase: 'finished', final: s.state.final });
    } else if (s.status === 'running' && s.state) {
      await this.restore(s.state);
    }
    await this.refreshPlayers();
    this.connect();
    this.pollTimer = window.setInterval(() => {
      if (this.snap.phase === 'lobby' || this.snap.phase === 'resume') void this.refreshPlayers();
    }, 2500);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    clearInterval(this.pollTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.channel?.close();
  }

  private buildRace(): Race {
    const rng = mulberry32(this.seed);
    const team: Driver = {
      id: 'team', name: 'Turma', kind: 'team', color: TEAM_COLOR,
      outcome: (q) => this.outcomes[q] ?? { accuracy: 0, speedBonus: 0 },
    };
    const field = BOT_FIELDS[this.session.settings?.botField ?? 'medio'];
    const bots = field.map((skill, i) => makeBot(rng, i, skill));
    const race = new Race([team, ...bots], this.track.length, this.config);
    // Pré-rolo: a resolução de cada pergunta coincide com o fim do tempo de resposta.
    race.time = this.config.overheadTime;
    return race;
  }

  private async restore(state: SavedState): Promise<void> {
    this.outcomes = state.outcomes.slice(0, state.next);
    this.race = this.buildRace();
    for (let q = 0; q < state.next; q++) {
      while (this.race.nextQuestion <= q) this.race.step(0.25);
    }
    if (state.next > 0) this.race.step(this.config.overheadTime);
    this.race.finalizeEvents();

    const rows = await this.api.loadAnswers(this.session.id);
    const players = await this.api.listPlayers(this.session.id);
    this.roster = players.filter((p) => !p.kicked);
    const qt = this.config.questionTime * 1000;
    for (let q = 0; q < state.next; q++) {
      const qid = this.questions[q].id;
      this.answerLog[q] = this.roster.map((p): PlayerAnswer => {
        const a = rows.find((r) => r.player_id === p.id && r.question_id === qid);
        return { playerId: p.id, answered: !!a, correct: a?.correct ?? false, timeFrac: a ? Math.min(1, a.ms_taken / qt) : 1 };
      });
    }
    this.set({ phase: 'resume', qIndex: state.next, players: this.roster });
  }

  // ---------- Rede ----------
  private connect() {
    this.channel?.close();
    this.channel = this.api.openChannel(
      this.session.id,
      (m) => this.onMessage(m),
      (ok) => {
        this.set({ connected: ok });
        if (ok) this.resync(true);
      },
    );
  }

  private send(msg: HostEvent) {
    if (msg.event !== 'kicked') this.lastMsg = msg;
    this.channel?.send(msg);
  }

  /** Repete o último estado (alunos a reconectar). Limita a 1×/s para não inundar o canal. */
  private resync(force = false) {
    const now = performance.now();
    if (!force && now - this.lastResync < 1000) return;
    this.lastResync = now;
    const m = this.lastMsg;
    if (!m) {
      this.channel?.send({ event: 'lobby', payload: { count: this.snap.players.length } });
      return;
    }
    if (m.event === 'question' && this.current) {
      this.channel?.send({ event: 'question', payload: { ...m.payload, time: Math.max(0, this.config.questionTime - this.qElapsed) } });
    } else {
      this.channel?.send(m);
    }
  }

  private onMessage(m: AnyEvent) {
    if (m.event === 'hello') {
      if (this.snap.phase === 'lobby') void this.refreshPlayers();
      this.resync();
    } else if (m.event === 'answer') {
      this.onAnswer(m.payload.player_id, m.payload.question_id, m.payload.value);
    }
  }

  async refreshPlayers(): Promise<void> {
    try {
      const all = await this.api.listPlayers(this.session.id);
      const active = all.filter((p) => !p.kicked);
      if (this.snap.phase === 'lobby' || this.snap.phase === 'resume') {
        const changed = active.length !== this.snap.players.length || active.some((p, i) => this.snap.players[i]?.id !== p.id);
        if (changed) {
          this.set({ players: active });
          this.send({ event: 'lobby', payload: { count: active.length } });
        }
      }
    } catch (e) {
      this.notice(`Não consegui ler os alunos: ${(e as Error).message}`);
    }
  }

  async kick(playerId: string): Promise<void> {
    try {
      await this.api.kickPlayer(playerId);
      this.channel?.send({ event: 'kicked', payload: { player_id: playerId } });
      this.set({ players: this.snap.players.filter((p) => p.id !== playerId) });
      this.send({ event: 'lobby', payload: { count: this.snap.players.length } });
    } catch (e) {
      this.notice(`Não consegui expulsar: ${(e as Error).message}`);
    }
  }

  private notice(text: string) {
    this.set({ notice: text });
    window.setTimeout(() => this.snap.notice === text && this.set({ notice: null }), 6000);
  }

  // ---------- Pausa ----------
  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.pageHidden = true;
      this.set({ hidden: true, paused: true });
    } else {
      this.pageHidden = false;
      this.lastTs = performance.now();
      this.connect(); // o Safari suspende os websockets em segundo plano
      this.set({ hidden: false, paused: this.teacherPaused });
    }
  };

  togglePause(): void {
    this.teacherPaused = !this.teacherPaused;
    this.lastTs = performance.now();
    this.set({ paused: this.teacherPaused || this.pageHidden });
  }

  // ---------- Fluxo ----------
  async start(): Promise<void> {
    unlockAudio();
    if (!this.snap.players.length) return;
    this.roster = [...this.snap.players];
    try {
      await this.api.updateSession(this.session.id, { status: 'running', started: true, state: this.savedState(0) });
    } catch (e) {
      this.notice(`Não consegui gravar o início: ${(e as Error).message}`);
    }
    play('start');
    this.startQuestion(0);
  }

  /** Depois de um refresh/regresso do Safari: continua a partir de `session.state`. */
  resume(): void {
    unlockAudio();
    play('start');
    if (this.snap.qIndex >= this.questions.length) this.set({ phase: 'sprint' });
    else this.startQuestion(this.snap.qIndex);
  }

  private startQuestion(index: number) {
    const q = this.questions[index];
    this.current = { index, q };
    this.answers = new Map();
    this.qElapsed = 0;
    this.timeBucket = -1;
    const payload: PublicQuestion = { question_id: q.id, index, total: this.questions.length, prompt: q.prompt, options: q.options, time: this.config.questionTime };
    this.send({ event: 'question', payload });
    this.set({
      phase: 'question', qIndex: index, question: { prompt: q.prompt, options: q.options }, reveal: null, answered: 0, timeLeft: this.config.questionTime,
    });
  }

  private onAnswer(playerId: string, questionId: string, value: number) {
    const cur = this.current;
    if (this.snap.phase !== 'question' || !cur || cur.q.id !== questionId || this.snap.paused) return;
    if (!this.roster.some((p) => p.id === playerId) || this.answers.has(playerId)) return;
    if (!Number.isInteger(value) || value < 0 || value >= cur.q.options.length) return;
    this.answers.set(playerId, { value, correct: value === cur.q.correct, ms: Math.round(this.qElapsed * 1000) });
    this.set({ answered: this.answers.size });
  }

  /** Professora encerra a pergunta antes do tempo (ou passa a revelação). */
  skip(): void {
    if (this.snap.phase === 'question') this.closeQuestion();
    else if (this.snap.phase === 'reveal') this.revealT = REVEAL_SECONDS;
  }

  private closeQuestion() {
    const cur = this.current!;
    const qt = this.config.questionTime;
    const list = this.roster.map((p): PlayerAnswer => {
      const a = this.answers.get(p.id);
      return { playerId: p.id, answered: !!a, correct: a?.correct ?? false, timeFrac: a ? Math.min(1, a.ms / (qt * 1000)) : 1 };
    });
    this.answerLog[cur.index] = list;
    this.outcomes[cur.index] = outcomeFromAnswers(list, list.length);
    const rows = [...this.answers].map(([player_id, a]) => ({
      session_id: this.session.id, question_id: cur.q.id, player_id, value: a.value, correct: a.correct, ms_taken: a.ms,
    }));
    void this.api.saveAnswers(rows).catch((e) => this.notice(`Respostas por gravar: ${(e as Error).message}`));
    const remaining = this.boundary(cur.index) - this.race.time;
    this.ffRate = Math.max(1, remaining / FF_SECONDS);
    this.set({ phase: 'ff' });
  }

  private boundary(q: number) {
    return (q + 1) * this.race.cycle;
  }

  private onResolved() {
    const cur = this.current!;
    const q = cur.index;
    const ev = this.race.events[q];
    const res = ev.results[0];
    const results: Record<string, boolean> = {};
    for (const a of this.answerLog[q]) results[a.playerId] = a.correct && a.answered;
    const reveal: RevealMsg = {
      question_id: cur.q.id, correct_index: cur.q.correct, explanation: cur.q.explanation, accuracy: res.accuracy,
      effect: res.effect, nitro: res.nitro, rank: this.race.rankOf(this.race.team!), cars: this.race.cars.length, results,
    };
    this.send({ event: 'reveal', payload: reveal });
    play(res.nitro ? 'nitro' : res.effect);
    this.revealT = 0;
    this.set({ phase: 'reveal', reveal, answered: this.answers.size });
    void this.api
      .updateSession(this.session.id, { state: this.savedState(q + 1) })
      .catch((e) => this.notice(`Estado por gravar: ${(e as Error).message}`));
  }

  private savedState(next: number): SavedState {
    return { v: 1, seed: this.seed, next, outcomes: this.outcomes.slice(0, next) };
  }

  // ---------- Relógio ----------
  private loop = (ts: number) => {
    if (this.stopped) return;
    const dt = Math.min(0.1, Math.max(0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    this.clock += dt;
    if (!this.snap.paused) this.tick(dt);
    this.frameListeners.forEach((l) => l(this.clock));
    this.raf = requestAnimationFrame(this.loop);
  };

  private tick(dt: number) {
    const race = this.race;
    const phase = this.snap.phase;
    if (phase === 'question') {
      const cur = this.current!;
      const bound = this.boundary(cur.index) - EPS;
      race.step(Math.max(0, Math.min(dt, bound - race.time)));
      this.qElapsed += dt;
      const left = Math.max(0, this.config.questionTime - this.qElapsed);
      const bucket = Math.ceil(left * 4);
      if (bucket !== this.timeBucket) {
        this.timeBucket = bucket;
        this.set({ timeLeft: left });
      }
      const active = this.roster.length;
      if (this.qElapsed >= this.config.questionTime || (active > 0 && this.answers.size >= active)) this.closeQuestion();
    } else if (phase === 'ff') {
      const q = this.current!.index;
      const left = this.boundary(q) - EPS - race.time;
      if (left > 1e-6) {
        race.step(Math.min(left, dt * this.ffRate));
      } else {
        race.step(0.001); // atravessa a fronteira → o motor resolve a pergunta
        this.onResolved();
      }
    } else if (phase === 'reveal') {
      race.step(dt);
      this.revealT += dt;
      if (this.revealT >= REVEAL_SECONDS) {
        const next = this.current!.index + 1;
        if (next < this.questions.length) this.startQuestion(next);
        else this.set({ phase: 'sprint', question: null });
      }
    } else if (phase === 'sprint') {
      // Uma turma fraca pode ficar muito longe da meta: acelera o sprint para durar ~20s no máximo.
      const t = race.team!;
      const est = (race.raceLength - t.distance) / (race.baseSpeed * Math.max(0.3, t.mult));
      const rate = Math.min(10, Math.max(1, est / 20));
      for (let left = dt * rate; left > 0; left -= 0.25) race.step(Math.min(0.25, left));
      if (race.team!.finishTime !== null || race.finished) {
        this.holdT = 0;
        play('finish');
        this.set({ phase: 'finishing' });
      }
    } else if (phase === 'finishing') {
      race.step(dt);
      this.holdT += dt;
      if (this.holdT >= FINISH_HOLD || race.finished) void this.finish();
    }
  }

  private finishing = false;

  private async finish() {
    if (this.finishing) return;
    this.finishing = true;
    this.race.runToEnd(0.25);
    this.race.finalizeEvents();
    const race = this.race;
    const standings = race.standings();
    const names = new Map(this.roster.map((p) => [p.id, p.nickname]));
    const nick = (id: string) => names.get(id) ?? '?';
    const scores = scoreRace(
      this.roster.map((p) => p.id),
      this.outcomes.map((o, q) => ({ answers: this.answerLog[q] ?? [], teamAccuracy: o.accuracy })),
    );
    const top = scores.slice(0, 5).filter((s) => s.points > 0);
    const topIds = new Set(top.map((s) => s.playerId));
    const teamPosition = standings.indexOf(race.team!) + 1;
    const final: FinalInfo = {
      standings: standings.map((c) => ({ name: c.driver.name, kind: c.driver.kind, color: c.driver.color, timeMs: Math.round((c.finishTime ?? 0) * 1000) })),
      ranking: top.map((s) => ({ nickname: nick(s.playerId), points: s.points, correct: s.correct })),
      awards: pickAwards(scores).map((a) => ({ emoji: a.emoji, title: a.title, nickname: nick(a.playerId), detail: a.detail })),
      teamPosition,
      totalQuestions: this.questions.length,
    };
    const end: EndMsg = {
      final,
      players: Object.fromEntries(scores.map((s) => [s.playerId, { points: s.points, correct: s.correct, answered: s.answered, bestStreak: s.bestStreak, top: topIds.has(s.playerId) }])),
    };
    this.send({ event: 'end', payload: end });
    this.set({ phase: 'finished', final: end });
    const finishTime = Math.round((race.team!.finishTime ?? 0) * 1000);
    try {
      await this.api.saveRaceRecord({
        session_id: this.session.id, class_id: this.session.class_id, quiz_id: this.session.quiz_id, quiz_version: this.session.quiz_version,
        timeline: this.outcomes.map((o) => ({ accuracy: o.accuracy, speedBonus: o.speedBonus })), final_position: teamPosition, finish_time_ms: finishTime,
      });
      await this.api.updateSession(this.session.id, { status: 'finished', finished: true, state: { ...this.savedState(this.questions.length), final: end } });
    } catch (e) {
      this.notice(`Resultado por gravar: ${(e as Error).message}`);
    }
  }
}
