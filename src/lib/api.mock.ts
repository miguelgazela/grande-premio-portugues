// Base de dados falsa (localStorage + BroadcastChannel) para testar o fluxo todo em várias abas, sem Supabase.
// Só entra em desenvolvimento, com `?mock` no URL.
import { EXAMPLE_QUIZZES } from '../data/exampleQuizzes';
import type { Api } from './api';
import { channelName, type AnyEvent } from './protocol';
import type { AnswerRow, ClassRow, PlayerRow, QuestionRow, RaceRecordRow, SessionRow } from './types';

interface Db {
  quizzes: { id: string; title: string; year: number; topic: string; version: number }[];
  questions: (QuestionRow & { quiz_id: string })[];
  classes: ClassRow[];
  sessions: SessionRow[];
  players: (PlayerRow & { session_id: string; device_token: string })[];
  answers: AnswerRow[];
  records: RaceRecordRow[];
}

const KEY = 'gpp.mockdb';
const uid = () => crypto.randomUUID();

function seed(): Db {
  const db: Db = { quizzes: [], questions: [], classes: [], sessions: [], players: [], answers: [], records: [] };
  for (const q of EXAMPLE_QUIZZES) {
    const id = uid();
    db.quizzes.push({ id, title: q.title, year: q.year, topic: q.topic, version: 1 });
    q.questions.forEach((x, i) => db.questions.push({ id: uid(), quiz_id: id, position: i + 1, prompt: x.prompt, options: [...x.options], correct: x.correct, time_limit: 20, explanation: x.explanation ?? null }));
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
    return tx((db) => db.quizzes.map((q) => ({ ...q, questionCount: db.questions.filter((x) => x.quiz_id === q.id).length })));
  },
  async listClasses() {
    return tx((db) => db.classes);
  },
  async createClass(name, year) {
    return tx((db) => {
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
    void version;
    return tx((db) => db.questions.filter((q) => q.quiz_id === quizId).sort((a, b) => a.position - b.position));
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
      db.records.push(row);
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
