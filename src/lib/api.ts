import type { AnyEvent } from './protocol';
import type { AnswerRow, ClassRow, JoinResult, PlayerRow, QuestionRow, QuizRow, RaceRecordRow, SavedState, SessionRow, SessionSettings, SessionStatus } from './types';

export type TeacherCheck = { ok: true; id: string; name: string } | { ok: false; reason: 'anon' | 'noaccess' };

export interface Channel {
  send(msg: AnyEvent): void;
  close(): void;
}

export interface Api {
  /** true quando corre com a base de dados falsa (só em desenvolvimento). */
  readonly mock: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  checkTeacher(): Promise<TeacherCheck>;

  listQuizzes(): Promise<QuizRow[]>;
  listClasses(): Promise<ClassRow[]>;
  createClass(name: string, year: number): Promise<ClassRow>;
  listOpenSessions(): Promise<SessionRow[]>;
  createSession(quiz: QuizRow, classId: string | null, settings: SessionSettings): Promise<SessionRow>;
  getSession(id: string): Promise<SessionRow>;
  loadQuestions(quizId: string, version: number): Promise<QuestionRow[]>;
  listPlayers(sessionId: string): Promise<PlayerRow[]>;
  kickPlayer(playerId: string): Promise<void>;
  saveAnswers(rows: AnswerRow[]): Promise<void>;
  loadAnswers(sessionId: string): Promise<AnswerRow[]>;
  updateSession(id: string, patch: { status?: SessionStatus; state?: SavedState | null; started?: boolean; finished?: boolean }): Promise<void>;
  saveRaceRecord(row: RaceRecordRow): Promise<void>;

  joinSession(pin: string, nickname: string, deviceToken: string): Promise<JoinResult>;
  /** Liga ao canal; `onStatus` avisa quando fica ligado ou cai. */
  openChannel(sessionId: string, onMessage: (msg: AnyEvent) => void, onStatus?: (connected: boolean) => void): Channel;
}

let cached: Promise<Api> | null = null;

export function getApi(): Promise<Api> {
  cached ??= (async () => {
    if (import.meta.env.DEV && (new URLSearchParams(location.search).has('mock') || localStorage.getItem('gpp.mock') === '1')) {
      localStorage.setItem('gpp.mock', '1');
      return (await import('./api.mock')).mockApi;
    }
    return (await import('./api.supabase')).supabaseApi;
  })();
  return cached;
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
