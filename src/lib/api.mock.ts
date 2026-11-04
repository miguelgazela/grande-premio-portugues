// Base de dados falsa (localStorage + BroadcastChannel) para testar o fluxo todo em várias abas, sem Supabase.
// Só entra em desenvolvimento, com `?mock` no URL.
import { ALL_EXAMPLE_QUIZZES, toBody } from '../data/exampleQuizzes';
import { raceConfigFor } from '../game/raceSettings';
import { parseTimeline, type GhostRecord } from './ghosts';
import { MAX_PLAYERS } from '../game/guards';
import type { Api } from './api';
import { checkNickname } from './nickname';
import { channelName, type AnyEvent } from './protocol';
import type { AnswerRow, ClassRow, PlayerRow, QuestionRow, QuizRow, RaceRecordRow, RaceSummary, ReviewQuestion, ReviewSession, SavedState, SessionRow, SessionSettings, SessionStatus } from './types';

/** A sala (PIN, turma, alunos); o `status` espelha o do último jogo, como o trigger na base de dados. */
interface Room {
  id: string;
  teacher_id: string;
  class_id: string | null;
  pin: string;
  status: SessionStatus;
  created_at: string;
}
interface Game {
  id: string;
  session_id: string;
  number: number;
  quiz_id: string;
  quiz_version: number;
  settings: SessionSettings;
  state: SavedState | null;
  status: SessionStatus;
  created_at: string;
}

interface Db {
  quizzes: { id: string; title: string; year: number | null; topic: string | null; version: number; archived?: boolean }[];
  questions: (QuestionRow & { quiz_id: string; version?: number })[];
  classes: ClassRow[];
  sessions: Room[];
  games: Game[];
  players: (PlayerRow & { session_id: string; device_token: string })[];
  answers: AnswerRow[];
  records: (RaceRecordRow & { created_at?: string })[];
}

const KEY = 'gpp.mockdb';
const uid = () => crypto.randomUUID();

function seed(): Db {
  const db: Db = { quizzes: [], questions: [], classes: [], sessions: [], games: [], players: [], answers: [], records: [] };
  for (const q of ALL_EXAMPLE_QUIZZES) {
    const id = uid();
    db.quizzes.push({ id, title: q.title, year: q.year, topic: q.topic, version: 1 });
    q.questions.forEach((x, i) => db.questions.push({ id: uid(), quiz_id: id, version: 1, position: i + 1, prompt: x.prompt, ...toBody(x), time_limit: x.time_limit ?? 20, explanation: x.explanation ?? null } as unknown as QuestionRow & { quiz_id: string }));
  }
  return db;
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return upgrade(JSON.parse(raw) as Db);
  } catch { /* cai para o seed */ }
  const db = seed();
  save(db);
  return db;
}
/** Bases gravadas antes de haver jogos (uma sala = um jogo): cada sala antiga vira o jogo nº 1, com o mesmo id. */
function upgrade(db: Db): Db {
  if (db.games) return db;
  const old = db.sessions as unknown as (Room & { quiz_id: string; quiz_version: number; settings: SessionSettings; state: SavedState | null })[];
  db.games = old.map((s) => ({ id: s.id, session_id: s.id, number: 1, quiz_id: s.quiz_id, quiz_version: s.quiz_version, settings: s.settings, state: s.state, status: s.status, created_at: s.created_at ?? new Date(0).toISOString() }));
  db.sessions = old.map(({ id, teacher_id, class_id, pin, status, created_at }) => ({ id, teacher_id, class_id, pin, status, created_at }));
  for (const a of db.answers as unknown as { session_id?: string; game_id?: string }[]) a.game_id ??= a.session_id;
  for (const r of db.records as unknown as { session_id?: string; game_id?: string }[]) r.game_id ??= r.session_id;
  for (const p of db.players) p.left ??= false;
  return db;
}
const save = (db: Db) => localStorage.setItem(KEY, JSON.stringify(db));
/** Lê e escreve sempre fresco: várias abas partilham a mesma "base de dados". */
function tx<T>(fn: (db: Db) => T): T {
  const db = load();
  const out = fn(db);
  save(db);
  return out;
}

const questionsOf = (db: Db, quizId: string, version: number): QuestionRow[] =>
  db.questions
    .filter((q) => q.quiz_id === quizId && (q.version ?? 1) === version)
    .sort((a, b) => a.position - b.position)
    .map(({ quiz_id: _q, version: _v, ...q }) => q);

/** Perguntas por id, pela ordem pedida, com o quiz de onde vêm (as apagadas ficam de fora). */
const refsOf = (db: Db, ids: string[]): ReviewQuestion[] =>
  ids.flatMap((id): ReviewQuestion[] => {
    const q = db.questions.find((x) => x.id === id);
    if (!q) return [];
    const { quiz_id, version, ...rest } = q;
    const quiz = db.quizzes.find((z) => z.id === quiz_id);
    return [{ ...rest, quiz_id, quiz_version: version ?? 1, quiz_title: quiz?.title ?? '', archived: !!quiz?.archived } as ReviewQuestion];
  });

const gamesOf = (db: Db, sessionId: string) => db.games.filter((g) => g.session_id === sessionId).sort((a, b) => b.number - a.number);

/** A sala com o seu último jogo (o formato que a app usa). */
const sessionOf = (db: Db, room: Room): SessionRow => {
  const g = gamesOf(db, room.id)[0];
  if (!g) throw new Error('A sala não tem nenhum jogo');
  const quiz = db.quizzes.find((q) => q.id === g.quiz_id);
  return {
    id: room.id, teacher_id: room.teacher_id, class_id: room.class_id, pin: room.pin, created_at: room.created_at,
    game_id: g.id, game_number: g.number, quiz_id: g.quiz_id, quiz_version: g.quiz_version,
    status: g.status, settings: g.settings, state: g.state, quiz_title: g.settings.review?.title ?? quiz?.title ?? '',
  };
};

/** Muda o estado de um jogo e, se for o último da sala, o da sala (o trigger do Supabase). */
function setGameStatus(db: Db, g: Game, status: SessionStatus) {
  g.status = status;
  const room = db.sessions.find((s) => s.id === g.session_id);
  if (room && gamesOf(db, room.id)[0]?.id === g.id) room.status = status;
}

const quizRow = (db: Db, q: Db['quizzes'][number]): QuizRow => ({
  id: q.id, title: q.title, year: q.year, topic: q.topic, version: q.version,
  questionCount: questionsOf(db, q.id, q.version).length,
  lastPlayed: db.records.filter((r) => r.quiz_id === q.id).reduce<string | null>((m, r) => (r.created_at && (!m || r.created_at > m) ? r.created_at : m), null),
});

const avgAccuracy = (raw: unknown) => {
  const o = parseTimeline(raw).outcomes;
  return o.length ? o.reduce((s, t) => s + t.accuracy, 0) / o.length : 0;
};

const raceOf = (db: Db, r: Db['records'][number]): RaceSummary => ({
  game_id: r.game_id, created_at: r.created_at ?? new Date(0).toISOString(), quiz_id: r.quiz_id,
  quiz_title: db.quizzes.find((q) => q.id === r.quiz_id)?.title ?? '', quiz_version: r.quiz_version,
  class_id: r.class_id, class_name: db.classes.find((c) => c.id === r.class_id)?.name ?? null, final_position: r.final_position,
  avg_accuracy: avgAccuracy(r.timeline),
});

export const mockApi: Api = {
  mock: true,
  async signIn() {
    localStorage.setItem('gpp.mockuser', '1');
  },
  async signOut() {
    localStorage.removeItem('gpp.mockuser');
  },
  async checkTeacher() {
    return localStorage.getItem('gpp.mockuser') ? { ok: true, id: 'mock-teacher', name: 'Professora (mock)' } : { ok: false, reason: 'anon' };
  },
  async listQuizzes() {
    return tx((db) => db.quizzes.filter((q) => !q.archived).map((q): QuizRow => quizRow(db, q)));
  },
  async getQuiz(id) {
    return tx((db) => {
      const q = db.quizzes.find((x) => x.id === id);
      if (!q) throw new Error('Quiz não encontrado');
      return { quiz: quizRow(db, q), questions: questionsOf(db, q.id, q.version) };
    });
  },
  async createQuiz(title, year, topic) {
    return tx((db) => {
      const q = { id: uid(), title, year, topic, version: 1 };
      db.quizzes.push(q);
      return quizRow(db, q);
    });
  },
  async saveQuiz(input) {
    return tx((db) => {
      const quiz = db.quizzes.find((x) => x.id === input.id);
      if (!quiz) throw new Error('Quiz não encontrado');
      if (!input.title.trim()) throw new Error('O quiz precisa de um título');
      // Mesma regra que a função SQL save_quiz: versão já jogada → nova versão.
      const bump = db.games.some((g) => g.quiz_id === quiz.id && g.quiz_version === quiz.version) || db.records.some((r) => r.quiz_id === quiz.id && r.quiz_version === quiz.version);
      const version = bump ? quiz.version + 1 : quiz.version;
      Object.assign(quiz, { title: input.title.trim(), year: input.year, topic: input.topic?.trim() || null, version });
      const old = db.questions.filter((x) => x.quiz_id === quiz.id && (x.version ?? 1) === version);
      db.questions = db.questions.filter((x) => !old.includes(x));
      const ids = input.questions.map((q, i) => {
        const reuse = !bump && old.some((o) => o.id === q.id);
        const id = reuse || !bump ? q.id : uid();
        db.questions.push({ ...q, id, quiz_id: quiz.id, version, position: i + 1 });
        return id;
      });
      return { version, bumped: bump, ids };
    });
  },
  async duplicateQuiz(id) {
    return tx((db) => {
      const q = db.quizzes.find((x) => x.id === id);
      if (!q) throw new Error('Quiz não encontrado');
      const copy = { id: uid(), title: `${q.title} (cópia)`, year: q.year, topic: q.topic, version: 1 };
      db.quizzes.push(copy);
      for (const x of questionsOf(db, q.id, q.version)) db.questions.push({ ...structuredClone(x), id: uid(), quiz_id: copy.id, version: 1 } as unknown as QuestionRow & { quiz_id: string });
      return quizRow(db, copy);
    });
  },
  async deleteQuiz(id) {
    return tx((db) => {
      const used = db.games.some((g) => g.quiz_id === id);
      if (used) {
        db.quizzes.find((q) => q.id === id)!.archived = true;
        return 'archived' as const;
      }
      db.quizzes = db.quizzes.filter((q) => q.id !== id);
      db.questions = db.questions.filter((q) => q.quiz_id !== id);
      db.records = db.records.filter((r) => r.quiz_id !== id);
      return 'deleted' as const;
    });
  },
  async listRaces(filter) {
    return tx((db) =>
      db.records
        .filter((r) => (!filter?.classId || r.class_id === filter.classId) && (!filter?.quizId || r.quiz_id === filter.quizId))
        .map((r) => raceOf(db, r))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    );
  },
  async loadReport(gameId) {
    return tx((db) => {
      const g = db.games.find((x) => x.id === gameId);
      if (!g) throw new Error('Jogo não encontrado');
      const rec = db.records.find((r) => r.game_id === gameId);
      const all = g.settings.review ? refsOf(db, g.settings.review.questionIds) : questionsOf(db, g.quiz_id, g.quiz_version);
      return {
        race: rec ? raceOf(db, rec) : null,
        questions: all.slice(0, raceConfigFor(all, g.settings).used),
        answers: db.answers.filter((a) => a.game_id === gameId),
        playerCount: g.state?.players ?? db.players.filter((p) => p.session_id === g.session_id && !p.kicked && !p.left).length,
      };
    });
  },
  async listClasses() {
    return tx((db) => db.classes);
  },
  async updateClass(id, name, year) {
    return tx((db) => {
      const c = db.classes.find((x) => x.id === id);
      if (!c) throw new Error('Turma não encontrada');
      if (db.classes.some((x) => x.id !== id && x.name === name)) throw new Error('Já existe uma turma com esse nome');
      Object.assign(c, { name, year });
      return { ...c };
    });
  },
  async deleteClass(id) {
    tx((db) => {
      db.classes = db.classes.filter((c) => c.id !== id);
      for (const s of db.sessions) if (s.class_id === id) s.class_id = null;
      for (const r of db.records) if (r.class_id === id) r.class_id = null;
    });
  },
  async createClass(name, year) {
    return tx((db) => {
      if (db.classes.some((x) => x.name === name)) throw new Error('Já existe uma turma com esse nome');
      const c = { id: uid(), name, year };
      db.classes.push(c);
      return c;
    });
  },
  async listOpenSessions() {
    return tx((db) => {
      const cutoff = Date.now() - 12 * 3600_000;
      for (const g of db.games) {
        if ((g.status === 'lobby' || g.status === 'running') && Date.parse(g.created_at) < cutoff) setGameStatus(db, g, 'aborted');
      }
      return db.sessions.filter((s) => s.status === 'lobby' || s.status === 'running').map((s) => sessionOf(db, s));
    });
  },
  async abortSession(id) {
    tx((db) => {
      for (const g of gamesOf(db, id)) if (g.status === 'lobby' || g.status === 'running') setGameStatus(db, g, 'aborted');
    });
  },
  async createSession(quiz, classId, settings) {
    return tx((db) => {
      let pin = '';
      do pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
      while (db.sessions.some((s) => s.pin === pin && (s.status === 'lobby' || s.status === 'running')));
      const now = new Date().toISOString();
      const room: Room = { id: uid(), teacher_id: 'mock-teacher', class_id: classId, pin, status: 'lobby', created_at: now };
      db.sessions.push(room);
      db.games.push({ id: uid(), session_id: room.id, number: 1, quiz_id: quiz.id, quiz_version: quiz.version, settings, state: null, status: 'lobby', created_at: now });
      return sessionOf(db, room);
    });
  },
  async createGame(sessionId, quiz, settings) {
    return tx((db) => {
      const room = db.sessions.find((x) => x.id === sessionId);
      if (!room) throw new Error('Sala não encontrada');
      if (room.status === 'lobby' || room.status === 'running') throw new Error('O jogo anterior ainda não terminou.');
      if (db.sessions.some((s) => s.id !== room.id && s.pin === room.pin && (s.status === 'lobby' || s.status === 'running'))) throw new Error('O PIN desta sala já foi ocupado por outra. Abre uma sala nova.');
      const number = (gamesOf(db, room.id)[0]?.number ?? 0) + 1;
      db.games.push({ id: uid(), session_id: room.id, number, quiz_id: quiz.id, quiz_version: quiz.version, settings, state: null, status: 'lobby', created_at: new Date().toISOString() });
      room.status = 'lobby';
      return sessionOf(db, room);
    });
  },
  async getSession(id) {
    return tx((db) => {
      const s = db.sessions.find((x) => x.id === id);
      if (!s) throw new Error('Sessão não encontrada');
      return sessionOf(db, s);
    });
  },
  async loadQuestions(quizId, version) {
    return tx((db) => questionsOf(db, quizId, version));
  },
  async loadQuestionsByIds(ids) {
    return tx((db) => refsOf(db, ids));
  },
  async loadReviewPool({ classId, quizIds, sessions }) {
    return tx((db) => {
      const list = db.games
        .filter((g) => g.status === 'finished' && db.sessions.find((s) => s.id === g.session_id)?.class_id === classId && (!quizIds?.length || quizIds.includes(g.quiz_id)))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, sessions)
        .map((g): ReviewSession => ({
          id: g.id, created_at: g.created_at, status: g.status, quiz_id: g.quiz_id, quiz_title: g.settings.review?.title ?? db.quizzes.find((q) => q.id === g.quiz_id)?.title ?? '', review: !!g.settings.review,
          answers: db.answers.filter((a) => a.game_id === g.id),
        }));
      const qids = [...new Set(list.flatMap((s) => s.answers.map((a) => a.question_id)))];
      return { sessions: list, questions: refsOf(db, qids) };
    });
  },
  async listPlayers(sessionId) {
    return tx((db) => db.players.filter((p) => p.session_id === sessionId).map(({ id, nickname, kicked, left }) => ({ id, nickname, kicked, left: !!left })));
  },
  async kickPlayer(playerId) {
    tx((db) => {
      const p = db.players.find((x) => x.id === playerId);
      if (p) p.kicked = true;
    });
  },
  async renamePlayer(playerId, nickname) {
    return tx((db) => {
      const p = db.players.find((x) => x.id === playerId);
      if (!p) throw new Error('Sem permissão');
      const c = checkNickname(nickname);
      if (!c.ok) throw new Error(c.error);
      if (db.players.some((x) => x.id !== p.id && x.session_id === p.session_id && x.nickname.toLowerCase() === c.nick.toLowerCase())) throw new Error('Alcunha já em uso');
      p.nickname = c.nick;
      return c.nick;
    });
  },
  async leavePlayer(playerId) {
    tx((db) => {
      const p = db.players.find((x) => x.id === playerId);
      if (p) p.left = true;
    });
  },
  async removePlayer(playerId) {
    tx((db) => {
      db.players = db.players.filter((x) => x.id !== playerId);
    });
  },
  async saveAnswers(rows) {
    tx((db) => {
      for (const r of rows) {
        const i = db.answers.findIndex((a) => a.game_id === r.game_id && a.player_id === r.player_id && a.question_id === r.question_id);
        if (i >= 0) db.answers[i] = r;
        else db.answers.push(r);
      }
    });
  },
  async loadAnswers(gameId) {
    return tx((db) => db.answers.filter((a) => a.game_id === gameId));
  },
  async updateGame(id, patch) {
    tx((db) => {
      const g = db.games.find((x) => x.id === id);
      if (!g) return;
      if (patch.status) setGameStatus(db, g, patch.status);
      if (patch.state !== undefined) g.state = patch.state;
    });
  },
  async saveRaceRecord(row) {
    tx((db) => {
      db.records = db.records.filter((r) => r.game_id !== row.game_id);
      db.records.push({ ...row, created_at: new Date().toISOString() });
    });
  },
  async listGhostRecords(quizId, version) {
    return tx((db) =>
      db.records.flatMap((r): GhostRecord[] => {
        if (r.quiz_id !== quizId || r.quiz_version !== version) return [];
        const t = parseTimeline(r.timeline);
        if (!t.trackId || !t.config) return [];
        return [{ game_id: r.game_id, class_id: r.class_id, class_name: db.classes.find((c) => c.id === r.class_id)?.name ?? null, created_at: r.created_at ?? new Date(0).toISOString(), final_position: r.final_position, finish_time_ms: r.finish_time_ms, trackId: t.trackId, config: t.config, outcomes: t.outcomes }];
      }),
    );
  },
  async joinSession(pin, nickname, deviceToken) {
    return tx((db) => {
      const s = db.sessions.find((x) => x.pin === pin && (x.status === 'lobby' || x.status === 'running'));
      if (!s) throw new Error('PIN inválido');
      const existing = db.players.find((p) => p.session_id === s.id && p.device_token === deviceToken);
      if (existing) {
        if (existing.kicked) throw new Error('Removido pela professora');
        if (existing.left) {
          if (s.status !== 'lobby') throw new Error('A corrida já começou');
          existing.left = false;
        }
        return { session_id: s.id, player_id: existing.id, nickname: existing.nickname, status: s.status };
      }
      if (s.status !== 'lobby') throw new Error('A corrida já começou');
      const c = checkNickname(nickname);
      if (!c.ok) throw new Error(c.error);
      const nick = c.nick;
      if (db.players.filter((p) => p.session_id === s.id && !p.kicked && !p.left).length >= MAX_PLAYERS) throw new Error('A sessão está cheia');
      if (db.players.some((p) => p.session_id === s.id && p.nickname.toLowerCase() === nick.toLowerCase())) throw new Error('Alcunha já em uso');
      const p = { id: uid(), session_id: s.id, nickname: nick, device_token: deviceToken, kicked: false, left: false };
      db.players.push(p);
      return { session_id: s.id, player_id: p.id, nickname: nick, status: s.status };
    });
  },
  openChannel(sessionId, onMessage, onStatus) {
    const bc = new BroadcastChannel(channelName(sessionId));
    bc.onmessage = (e) => onMessage(e.data as AnyEvent);
    setTimeout(() => onStatus?.(true), 30);
    return {
      send: (msg) => bc.postMessage(msg),
      close: () => bc.close(),
    };
  },
};

/**
 * Dados de exemplo para testar o modo revisão: a turma "9ºB" com 3 sessões terminadas (2 quizzes), 8 alunos
 * e perguntas com % de acerto variadas. Só existe em desenvolvimento (a base de dados falsa).
 */
export function seedReviewDemo(): void {
  tx((db) => {
    let cls = db.classes.find((c) => c.name === '9ºB');
    if (!cls) {
      cls = { id: uid(), name: '9ºB', year: 9 };
      db.classes.push(cls);
    }
    const quizzes = db.quizzes.filter((q) => questionsOf(db, q.id, q.version).length >= 6).slice(0, 2);
    const pcts = [0.2, 0.9, 0.5, 0.4, 0.8, 0.3, 0.7, 0.55, 0.1, 0.65];
    const plan = [
      { quiz: quizzes[0], days: 3, shift: 0 },
      { quiz: quizzes[1] ?? quizzes[0], days: 2, shift: 3 },
      { quiz: quizzes[0], days: 1, shift: 1 },
    ];
    for (const { quiz, days, shift } of plan) {
      if (!quiz) continue;
      const sid = uid();
      const created = new Date(Date.now() - days * 86400_000).toISOString();
      db.sessions.push({ id: sid, teacher_id: 'mock-teacher', class_id: cls.id, pin: '000000', status: 'finished', created_at: created });
      db.games.push({ id: sid, session_id: sid, number: 1, quiz_id: quiz.id, quiz_version: quiz.version, settings: { botField: 'medio' }, state: null, status: 'finished', created_at: created });
      const players = Array.from({ length: 8 }, (_, i) => ({ id: uid(), session_id: sid, nickname: `Aluno${i + 1}`, device_token: uid(), kicked: false, left: false }));
      db.players.push(...players);
      questionsOf(db, quiz.id, quiz.version).slice(0, 10).forEach((q, qi) => {
        const right = Math.round(pcts[(qi + shift) % pcts.length] * players.length);
        players.forEach((p, pi) => db.answers.push({ game_id: sid, question_id: q.id, player_id: p.id, value: null, correct: pi < right, ms_taken: 4000 + pi * 500 }));
      });
    }
  });
}
