import type { RaceConfig } from '../engine/config';
import { BOT_FIELDS, makeBot, makeGhost } from '../engine/drivers';
import { outcomeFromAnswers, type PlayerAnswer, type QuestionOutcome } from '../engine/outcome';
import { Race, type Driver } from '../engine/race';
import { mulberry32 } from '../engine/rng';
import { pickAwards, scoreRace } from '../engine/scoring';
import { TRACKS, Track, trackFor } from '../engine/track';
import type { Api, Channel } from '../lib/api';
import { music, play, unlockAudio } from '../lib/audio';
import { ghostLabel, makeTimeline, type GhostRecord } from '../lib/ghosts';
import { compareReview } from '../lib/review';
import type { AnyEvent, EndMsg, FinalInfo, HostEvent, PublicBody, PublicQuestion, RevealMsg } from '../lib/protocol';
import { grade, prepare, solutionOf, toCanonical, type Prepared } from '../lib/questions';
import type { AnswerValue, PlayerRow, QuestionRow, ReviewResult, SavedState, SessionRow } from '../lib/types';
import { MAX_PLAYERS, RateLimiter, answerSizeOk, isId, senderOf } from './guards';
import { raceConfigFor } from './raceSettings';
import { DEFAULT_STYLE, TEAM_NAME, botCars, carDef, cleanVote, parseStyle, tally, type StyleVote, type TeamStyle } from './teamStyle';

export type Phase = 'lobby' | 'countdown' | 'resume' | 'question' | 'ff' | 'reveal' | 'sprint' | 'finishing' | 'finished';

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
  /** 3, 2, 1, 0 (VAI!) durante a contagem inicial. */
  count: number;
  avatars: Record<string, string>;
  answered: number;
  question: { prompt: string; body: PublicBody } | null;
  reveal: RevealMsg | null;
  final: EndMsg | null;
  /** Só nas revisões, no fim: o que melhorou e o que continua falhado (agregado da turma). */
  review: ReviewResult | null;
  /** Carro da turma: o mais votado pelos alunos (o por defeito, sem votos). */
  team: TeamStyle;
  /** Alunos que já votaram. */
  voters: number;
  /** Empate nos votos: o carro foi sorteado entre os empatados. */
  tie: boolean;
  /** Aviso discreto (erros de rede a gravar, etc.). */
  notice: string | null;
}

const REVEAL_SECONDS = 5;
const FINISH_HOLD = 2.5;
const FF_SECONDS = 1.2;
const COUNT_STEP = 0.9;
const EPS = 0.0005;

export { raceConfigFor };

type Listener = () => void;

/**
 * O anfitrião é a autoridade do jogo: mede o tempo pela hora de chegada das respostas,
 * calcula a corrida com o motor e grava respostas e estado a cada pergunta.
 */
export class HostGame {
  readonly track: Track;
  readonly trackId: string;
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
  private current: { index: number; q: QuestionRow; prep: Prepared } | null = null;
  /** `value` em coordenadas canónicas; `credit` 0..1. */
  private answers = new Map<string, { value: AnswerValue; credit: number; ms: number }>();
  private qElapsed = 0;
  private revealT = 0;
  private holdT = 0;
  private countT = 0;
  private sprintRate = 0;
  private ffRate = 1;
  private roster: PlayerRow[] = [];
  private lastMsg: HostEvent | null = null;
  private lastResync = 0;
  private pollTimer = 0;
  private timeBucket = -1;
  private votes = new Map<string, StyleVote>();
  private style: TeamStyle = DEFAULT_STYLE;
  private teacherPaused = false;
  private pageHidden = false;
  private perPlayer = new RateLimiter(12, 4);
  private overall = new RateLimiter(300, 150, 1);

  constructor(
    private api: Api,
    readonly session: SessionRow,
    questions: QuestionRow[],
    /** Fantasmas escolhidos e recorde da pista, carregados antes de criar o jogo. */
    readonly extras: { ghosts: GhostRecord[]; record: GhostRecord | null } = { ghosts: [], record: null },
  ) {
    const { config, used } = raceConfigFor(questions, session.settings);
    const def = TRACKS.find((t) => t.id === session.settings?.trackId) ?? trackFor(session.id);
    this.trackId = def.id;
    this.track = new Track(def.points, def.samples);
    this.config = config;
    this.questions = questions.slice(0, used);
    this.seed = session.state?.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.race = this.buildRace();
    if (import.meta.env.DEV) (window as unknown as { __game?: HostGame }).__game = this; // só para depurar no browser
    this.snap = {
      phase: 'lobby', paused: false, hidden: false, connected: false, players: [], qIndex: 0, total: this.questions.length, laps: config.laps,
      questionTime: config.questionTime, timeLeft: config.questionTime, count: 3, avatars: session.state?.avatars ?? {}, answered: 0, question: null, reveal: null, final: null, review: null, notice: null,
      team: DEFAULT_STYLE, voters: 0, tie: false,
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
      this.set({ phase: 'finished', final: s.state.final, review: s.state.review ?? null });
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
    music.stop();
    cancelAnimationFrame(this.raf);
    clearInterval(this.pollTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.channel?.close();
  }

  private buildRace(): Race {
    const rng = mulberry32(this.seed);
    const team: Driver = {
      id: 'team', name: TEAM_NAME, kind: 'team', color: carDef(this.style.car)?.color ?? 0x2f6bff, car: this.style.car,
      outcome: (q) => this.outcomes[q] ?? { accuracy: 0, speedBonus: 0 },
    };
    const field = BOT_FIELDS[this.session.settings?.botField ?? 'medio'];
    // Os fantasmas ocupam o lugar dos bots mais fracos: o número de carros não muda.
    const ghosts = this.extras.ghosts.slice(0, 3).map((g) => makeGhost(`ghost-${g.session_id}`, ghostLabel(g), g.outcomes));
    const bots = field.slice(ghosts.length).map((skill, i) => makeBot(rng, i, skill));
    // Cada bot tem um carro diferente (modelo e cor), nunca da cor da turma.
    const cars = botCars(this.style.car, bots.length);
    bots.forEach((b, i) => {
      b.car = cars[i]?.key;
      b.color = cars[i]?.color ?? b.color;
    });
    const race = new Race([team, ...bots, ...ghosts], this.track.length, this.config);
    // Pré-rolo: a resolução de cada pergunta coincide com o fim do tempo de resposta.
    race.time = this.config.overheadTime;
    return race;
  }

  private async restore(state: SavedState): Promise<void> {
    this.style = parseStyle(state.team);
    this.set({ team: this.style });
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
        const credit = a ? (a.value !== null ? grade(this.questions[q], a.value) : a.correct ? 1 : 0) : 0;
        return { playerId: p.id, answered: !!a, correct: credit === 1, credit, timeFrac: a ? Math.min(1, a.ms_taken / qt) : 1 };
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
    // Só mensagens bem formadas, de um aluno por vez, sem rajadas (o resto é descartado em silêncio).
    const from = senderOf(m);
    const now = performance.now();
    if (!from || !this.overall.allow('*', now) || !this.perPlayer.allow(from, now)) return;
    if (m.event === 'hello') {
      const a = m.payload.avatar;
      if (typeof a === 'string' && /^avatar-[a-z-]{1,30}$/.test(a) && this.snap.avatars[m.payload.player_id] !== a && Object.keys(this.snap.avatars).length < 200) {
        this.set({ avatars: { ...this.snap.avatars, [m.payload.player_id]: a } });
      }
      this.recordVote(m.payload.player_id, m.payload);
      if (this.snap.phase === 'lobby') void this.refreshPlayers();
      this.resync();
    } else if (m.event === 'vote') {
      this.recordVote(m.payload.player_id, m.payload);
    } else if (m.event === 'leave') {
      void this.onLeave(m.payload.player_id);
    } else if (m.event === 'answer') {
      this.onAnswer(m.payload.player_id, m.payload.question_id, m.payload.value);
    }
  }

  /** Guarda o voto de um aluno (vem num `vote` ou no `hello`); formatos antigos ou desconhecidos são ignorados. */
  private recordVote(playerId: string, raw: unknown): void {
    if (this.snap.phase !== 'lobby') return;
    const vote = cleanVote(raw);
    if (!vote.car || this.votes.get(playerId)?.car === vote.car) return;
    if (!this.votes.has(playerId) && this.votes.size >= 300) return;
    this.votes.set(playerId, vote);
    this.updateStyle();
  }

  /** O carro da turma é o mais votado pelos alunos (o por defeito, sem votos; sorteado, num empate). */
  private updateStyle(): void {
    const { style, count, tie } = tally(this.votes.values(), this.session.id);
    this.style = { car: style.car };
    this.set({ team: this.style, voters: count, tie });
    this.send({ event: 'lobby', payload: { count: this.snap.players.length } });
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

  /** Um aluno saiu pelo botão "Sair": no lobby é apagado (pode voltar); a meio da corrida deixa de contar. */
  private async onLeave(playerId: string): Promise<void> {
    if (!this.snap.players.some((p) => p.id === playerId)) return;
    const inLobby = this.snap.phase === 'lobby';
    try {
      if (inLobby) await this.api.removePlayer(playerId);
      else await this.api.kickPlayer(playerId);
    } catch (e) {
      this.notice(`Não consegui retirar o aluno: ${(e as Error).message}`);
      return;
    }
    this.votes.delete(playerId);
    this.dropFromRace(playerId);
    this.set({ players: this.snap.players.filter((p) => p.id !== playerId) });
    if (inLobby) this.updateStyle();
    else this.send({ event: 'lobby', payload: { count: this.snap.players.length } });
  }

  async kick(playerId: string): Promise<void> {
    try {
      await this.api.kickPlayer(playerId);
      this.channel?.send({ event: 'kicked', payload: { player_id: playerId } });
      this.votes.delete(playerId);
      this.dropFromRace(playerId);
      this.set({ players: this.snap.players.filter((p) => p.id !== playerId) });
      this.send({ event: 'lobby', payload: { count: this.snap.players.length } });
    } catch (e) {
      this.notice(`Não consegui expulsar: ${(e as Error).message}`);
    }
  }

  /** Expulso ou saído: deixa de contar nas respostas e nos resultados. */
  private dropFromRace(playerId: string) {
    this.roster = this.roster.filter((p) => p.id !== playerId);
    if (this.answers.delete(playerId)) this.set({ answered: this.answers.size });
  }

  /** A professora muda a alcunha (só no lobby). O servidor aplica o filtro e a unicidade. */
  async rename(playerId: string, nickname: string): Promise<string | null> {
    if (this.snap.phase !== 'lobby' || !this.snap.players.some((p) => p.id === playerId)) return null;
    try {
      const nick = await this.api.renamePlayer(playerId, nickname);
      const rename = (p: PlayerRow) => (p.id === playerId ? { ...p, nickname: nick } : p);
      this.roster = this.roster.map(rename);
      this.set({ players: this.snap.players.map(rename) });
      this.channel?.send({ event: 'renamed', payload: { player_id: playerId, nickname: nick } });
      return nick;
    } catch (e) {
      this.notice(`Não consegui mudar a alcunha: ${(e as Error).message}`);
      return null;
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
      music.stop();
      this.set({ hidden: true, paused: true });
    } else {
      this.pageHidden = false;
      this.lastTs = performance.now();
      this.connect(); // o Safari suspende os websockets em segundo plano
      this.set({ hidden: false, paused: this.teacherPaused });
      if (!this.teacherPaused && this.inRace()) music.start();
    }
  };

  togglePause(): void {
    this.teacherPaused = !this.teacherPaused;
    this.lastTs = performance.now();
    this.set({ paused: this.teacherPaused || this.pageHidden });
    if (this.teacherPaused) music.stop();
    else if (this.inRace()) music.start();
  }

  private inRace(): boolean {
    return ['question', 'ff', 'reveal', 'sprint'].includes(this.snap.phase);
  }

  // ---------- Fluxo ----------
  async start(): Promise<void> {
    unlockAudio();
    if (!this.snap.players.length) return;
    this.roster = this.snap.players.slice(0, MAX_PLAYERS);
    this.race = this.buildRace(); // o carro da turma já tem o aspeto final
    try {
      await this.api.updateSession(this.session.id, { status: 'running', started: true, state: this.savedState(0) });
    } catch (e) {
      this.notice(`Não consegui gravar o início: ${(e as Error).message}`);
    }
    this.countT = 0;
    this.set({ phase: 'countdown', count: 3 });
    play('tick');
  }

  /** Depois de um refresh/regresso do Safari: continua a partir de `session.state`. */
  resume(): void {
    unlockAudio();
    play('start');
    music.start();
    if (this.snap.qIndex >= this.questions.length) this.set({ phase: 'sprint' });
    else this.startQuestion(this.snap.qIndex);
  }

  private startQuestion(index: number) {
    const q = this.questions[index];
    music.setFinalLap(Math.floor(index / this.config.questionsPerLap) + 1 >= this.config.laps);
    const prep = prepare(q, this.seed);
    this.current = { index, q, prep };
    this.answers = new Map();
    this.qElapsed = 0;
    this.timeBucket = -1;
    const payload: PublicQuestion = { question_id: q.id, index, total: this.questions.length, prompt: q.prompt, body: prep.body, time: this.config.questionTime };
    this.send({ event: 'question', payload });
    this.set({
      phase: 'question', qIndex: index, question: { prompt: q.prompt, body: prep.body }, reveal: null, answered: 0, timeLeft: this.config.questionTime,
    });
  }

  private onAnswer(playerId: string, questionId: string, raw: unknown) {
    const cur = this.current;
    if (this.snap.phase !== 'question' || !cur || cur.q.id !== questionId || this.snap.paused) return;
    if (!isId(questionId) || this.qElapsed > this.config.questionTime) return;
    if (!this.roster.some((p) => p.id === playerId) || this.answers.has(playerId)) return;
    if (!answerSizeOk(raw)) return;
    const value = toCanonical(cur.q, cur.prep, raw);
    if (value === null) return;
    this.answers.set(playerId, { value, credit: grade(cur.q, value), ms: Math.round(this.qElapsed * 1000) });
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
      return { playerId: p.id, answered: !!a, correct: a?.credit === 1, credit: a?.credit ?? 0, timeFrac: a ? Math.min(1, a.ms / (qt * 1000)) : 1 };
    });
    this.answerLog[cur.index] = list;
    this.outcomes[cur.index] = outcomeFromAnswers(list, list.length);
    const rows = [...this.answers].map(([player_id, a]) => ({
      session_id: this.session.id, question_id: cur.q.id, player_id, value: a.value, correct: a.credit === 1, ms_taken: a.ms,
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
    const partial: Record<string, number> = {};
    for (const a of this.answerLog[q]) {
      results[a.playerId] = a.correct && a.answered;
      if (a.answered && !a.correct && (a.credit ?? 0) > 0) partial[a.playerId] = a.credit!;
    }
    const reveal: RevealMsg = {
      question_id: cur.q.id, solution: solutionOf(cur.q), partial, explanation: cur.q.explanation, accuracy: res.accuracy,
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
    return { v: 1, seed: this.seed, next, outcomes: this.outcomes.slice(0, next), avatars: this.snap.avatars, team: this.style };
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
    if (phase === 'countdown') {
      this.countT += dt;
      const count = 3 - Math.floor(this.countT / COUNT_STEP);
      if (count < 0) {
        play('start');
        music.start();
        this.startQuestion(0);
      } else if (count !== this.snap.count) {
        play(count === 0 ? 'start' : 'tick');
        this.set({ count });
      }
    } else if (phase === 'question') {
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
        else {
          music.setFinalLap(true);
          this.set({ phase: 'sprint', question: null });
        }
      }
    } else if (phase === 'sprint') {
      // Uma turma fraca pode ficar muito longe da meta: acelera o sprint (taxa fixa) para durar ~20s.
      const t = race.team!;
      if (this.sprintRate === 0) {
        const est = (race.raceLength - t.distance) / (race.baseSpeed * Math.max(0.3, t.mult));
        this.sprintRate = Math.min(40, Math.max(1, est / 20));
      }
      const rate = this.sprintRate;
      for (let left = dt * rate; left > 0; left -= 0.25) race.step(Math.min(0.25, left));
      if (race.team!.finishTime !== null || race.finished) {
        this.holdT = 0;
        play('finish');
        music.stop();
        this.set({ phase: 'finishing' });
      }
    } else if (phase === 'finishing') {
      race.step(dt);
      this.holdT += dt;
      if (this.holdT >= FINISH_HOLD || race.finished) void this.finish();
    }
  }

  private finishing = false;

  /** Mensagens do ecrã final: contra o fantasma mais rápido e contra o recorde da pista. */
  private ghostSummary(race: Race): Pick<FinalInfo, 'ghost' | 'record'> {
    const team = race.team!.finishTime;
    if (team === null || this.session.settings?.review) return {}; // revisão: sem fantasmas nem recorde
    const out: Pick<FinalInfo, 'ghost' | 'record'> = {};
    const ghosts = race.cars.filter((c) => c.driver.kind === 'ghost' && c.finishTime !== null);
    const fastest = ghosts.sort((a, b) => a.finishTime! - b.finishTime!)[0];
    if (fastest) out.ghost = { name: fastest.driver.name, diffMs: Math.round((fastest.finishTime! - team) * 1000) };
    const rec = this.extras.record;
    const ms = Math.round(team * 1000);
    out.record = rec
      ? { holder: ghostLabel(rec), bestMs: rec.finish_time_ms, newRecord: ms < rec.finish_time_ms, gapMs: ms - rec.finish_time_ms }
      : { holder: null, bestMs: null, newRecord: false, gapMs: 0 };
    return out;
  }

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
      ranking: top.map((s) => ({ nickname: nick(s.playerId), points: s.points, correct: s.correct, avatar: this.snap.avatars[s.playerId] })),
      awards: pickAwards(scores).map((a) => ({ emoji: a.emoji, title: a.title, nickname: nick(a.playerId), detail: a.detail })),
      teamPosition,
      teamCar: this.style.car,
      totalQuestions: this.questions.length,
      ...this.ghostSummary(race),
    };
    const end: EndMsg = {
      final,
      players: Object.fromEntries(scores.map((s) => [s.playerId, { points: s.points, correct: s.correct, answered: s.answered, bestStreak: s.bestStreak, top: topIds.has(s.playerId) }])),
    };
    this.send({ event: 'end', payload: end });
    if (teamPosition <= 3) play('cheer');
    const rv = this.session.settings?.review;
    let review: ReviewResult | undefined;
    if (rv) {
      // % de acerto da turma por pergunta nesta revisão (só entre quem respondeu), contra o que havia antes.
      const after = new Map<string, number>();
      this.questions.forEach((q, i) => {
        const given = (this.answerLog[i] ?? []).filter((a) => a.answered);
        if (given.length) after.set(q.id, given.reduce((t, a) => t + (a.credit ?? (a.correct ? 1 : 0)), 0) / given.length);
      });
      review = compareReview(rv, this.questions, after);
    }
    this.set({ phase: 'finished', final: end, review: review ?? null });
    const finishTime = Math.round((race.team!.finishTime ?? 0) * 1000);
    try {
      // Uma revisão tem outro conjunto de perguntas: não é fantasma nem recorde de nenhum quiz.
      if (!rv) await this.api.saveRaceRecord({
        session_id: this.session.id, class_id: this.session.class_id, quiz_id: this.session.quiz_id, quiz_version: this.session.quiz_version,
        timeline: makeTimeline(this.trackId, this.config, this.outcomes), final_position: teamPosition, finish_time_ms: finishTime,
      });
      await this.api.updateSession(this.session.id, { status: 'finished', finished: true, state: { ...this.savedState(this.questions.length), final: end, review } });
    } catch (e) {
      this.notice(`Resultado por gravar: ${(e as Error).message}`);
    }
  }
}
