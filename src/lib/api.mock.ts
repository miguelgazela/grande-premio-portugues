// Base de dados falsa (localStorage + BroadcastChannel) para testar o fluxo todo em várias abas, sem Supabase.
// Só entra em desenvolvimento, com `?mock` no URL.
import { EXAMPLE_QUIZZES } from '../data/exampleQuizzes';
import { raceConfigFor } from '../game/raceSettings';
import type { Api } from './api';
import { channelName, type AnyEvent } from './protocol';
import type { AnswerRow, ClassRow, PlayerRow, QuestionRow, QuizRow, RaceRecordRow, RaceSummary, SessionRow } from './types';

interface Db {
  quizzes: { id: string; title: string; year: number | null; topic: string | null; version: number; archived?: boolean }[];
  questions: (QuestionRow & { quiz_id: string; version?: number })[];
  classes: ClassRow[];
  sessions: SessionRow[];
  players: (PlayerRow & { session_id: string; device_token: string })[];
  answers: AnswerRow[];
  records: (RaceRecordRow & { created_at?: string })[];
}

const KEY = 'gpp.mockdb';
const uid = () => crypto.randomUUID();

function seed(): Db {
  const db: Db = { quizzes: [], questions: [], classes: [], sessions: [], players: [], answers: [], records: [] };
  for (const q of EXAMPLE_QUIZZES) {
    const id = uid();
    db.quizzes.push({ id, title: q.title, year: q.year, topic: q.topic, version: 1 });
    q.questions.forEach((x, i) => db.questions.push({ id: uid(), quiz_id: id, version: 1, position: i + 1, prompt: x.prompt, options: [...x.options], correct: x.correct, time_limit: 20, explanation: x.explanation ?? null }));
  }
  return db;
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch { /* cai para o seed */ }
  const db = seed();
  save(db);
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

const quizRow = (db: Db, q: Db['quizzes'][number]): QuizRow => ({
  id: q.id, title: q.title, year: q.year, topic: q.topic, version: q.version,
  questionCount: questionsOf(db, q.id, q.version).length,
  lastPlayed: db.records.filter((r) => r.quiz_id === q.id).reduce<string | null>((m, r) => (r.created_at && (!m || r.created_at > m) ? r.created_at : m), null),
});

const raceOf = (db: Db, r: Db['records'][number]): RaceSummary => ({
  session_id: r.session_id, created_at: r.created_at ?? new Date(0).toISOString(), quiz_id: r.quiz_id,
  quiz_title: db.quizzes.find((q) => q.id === r.quiz_id)?.title ?? '', quiz_version: r.quiz_version,
  class_id: r.class_id, class_name: db.classes.find((c) => c.id === r.class_id)?.name ?? null, final_position: r.final_position,
  avg_accuracy: r.timeline.length ? r.timeline.reduce((s, t) => s + t.accuracy, 0) / r.timeline.length : 0,
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
      const bump = db.sessions.some((s) => s.quiz_id === quiz.id && s.quiz_version === quiz.version) || db.records.some((r) => r.quiz_id === quiz.id && r.quiz_version === quiz.version);
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
      for (const x of questionsOf(db, q.id, q.version)) db.questions.push({ ...x, id: uid(), quiz_id: copy.id, version: 1, options: [...x.options] });
      return quizRow(db, copy);
    });
  },
  async deleteQuiz(id) {
    return tx((db) => {
      const used = db.sessions.some((s) => s.quiz_id === id);
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
  async loadReport(sessionId) {
    return tx((db) => {
      const s = db.sessions.find((x) => x.id === sessionId);
      if (!s) throw new Error('Sessão não encontrada');
      const rec = db.records.find((r) => r.session_id === sessionId);
      const all = questionsOf(db, s.quiz_id, s.quiz_version);
      return {
        race: rec ? raceOf(db, rec) : null,
        questions: all.slice(0, raceConfigFor(all, s.settings).used),
        answers: db.answers.filter((a) => a.session_id === sessionId),
        playerCount: db.players.filter((p) => p.session_id === sessionId && !p.kicked).length,
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
    return tx((db) => db.sessions.filter((s) => s.status === 'lobby' || s.status === 'running'));
  },
  async createSession(quiz, classId, settings) {
    return tx((db) => {
      let pin = '';
      do pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
      while (db.sessions.some((s) => s.pin === pin && (s.status === 'lobby' || s.status === 'running')));
      const s: SessionRow = { id: uid(), teacher_id: 'mock-teacher', quiz_id: quiz.id, quiz_version: quiz.version, quiz_title: quiz.title, class_id: classId, pin, status: 'lobby', settings, state: null };
      db.sessions.push(s);
      return s;
    });
  },
  async getSession(id) {
    return tx((db) => {
      const s = db.sessions.find((x) => x.id === id);
      if (!s) throw new Error('Sessão não encontrada');
      return s;
    });
  },
  async loadQuestions(quizId, version) {
    return tx((db) => questionsOf(db, quizId, version));
  },
  async listPlayers(sessionId) {
    return tx((db) => db.players.filter((p) => p.session_id === sessionId).map(({ id, nickname, kicked }) => ({ id, nickname, kicked })));
  },
  async kickPlayer(playerId) {
    tx((db) => {
      const p = db.players.find((x) => x.id === playerId);
      if (p) p.kicked = true;
    });
  },
  async saveAnswers(rows) {
    tx((db) => {
      for (const r of rows) {
        const i = db.answers.findIndex((a) => a.player_id === r.player_id && a.question_id === r.question_id);
        if (i >= 0) db.answers[i] = r;
        else db.answers.push(r);
      }
    });
  },
  async loadAnswers(sessionId) {
    return tx((db) => db.answers.filter((a) => a.session_id === sessionId));
  },
  async updateSession(id, patch) {
    tx((db) => {
      const s = db.sessions.find((x) => x.id === id);
      if (!s) return;
      if (patch.status) s.status = patch.status;
      if (patch.state !== undefined) s.state = patch.state;
    });
  },
  async saveRaceRecord(row) {
    tx((db) => {
      db.records = db.records.filter((r) => r.session_id !== row.session_id);
      db.records.push({ ...row, created_at: new Date().toISOString() });
    });
  },
  async joinSession(pin, nickname, deviceToken) {
    return tx((db) => {
      const s = db.sessions.find((x) => x.pin === pin && (x.status === 'lobby' || x.status === 'running'));
      if (!s) throw new Error('PIN inválido');
      const existing = db.players.find((p) => p.session_id === s.id && p.device_token === deviceToken);
      if (existing) {
        if (existing.kicked) throw new Error('Removido pela professora');
        return { session_id: s.id, player_id: existing.id, nickname: existing.nickname, status: s.status };
      }
      if (s.status !== 'lobby') throw new Error('A corrida já começou');
      const nick = nickname.trim();
      if (nick.length < 1 || nick.length > 20) throw new Error('Alcunha inválida');
      if (db.players.some((p) => p.session_id === s.id && p.nickname.toLowerCase() === nick.toLowerCase())) throw new Error('Alcunha já em uso');
      const p = { id: uid(), session_id: s.id, nickname: nick, device_token: deviceToken, kicked: false };
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
