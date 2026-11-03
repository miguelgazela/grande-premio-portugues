import type { GhostRecord } from './ghosts';
import type { AnyEvent } from './protocol';
import type { AnswerRow, ClassRow, JoinResult, PlayerRow, QuestionRow, QuizInput, QuizRow, RaceRecordRow, RaceSummary, ReportData, SavedState, SaveQuizResult, SessionRow, SessionSettings, SessionStatus } from './types';

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
  updateClass(id: string, name: string, year: number): Promise<ClassRow>;
  deleteClass(id: string): Promise<void>;

  getQuiz(id: string): Promise<{ quiz: QuizRow; questions: QuestionRow[] }>;
  createQuiz(title: string, year: number | null, topic: string | null): Promise<QuizRow>;
  /** Guarda quiz + perguntas; cria nova versão se a atual já foi jogada. */
  saveQuiz(quiz: QuizInput): Promise<SaveQuizResult>;
  duplicateQuiz(id: string): Promise<QuizRow>;
  /** Apaga; se já tem sessões, arquiva (esconde da biblioteca, mantém o histórico). */
  deleteQuiz(id: string): Promise<'deleted' | 'archived'>;
  listRaces(filter?: { classId?: string; quizId?: string }): Promise<RaceSummary[]>;
  loadReport(sessionId: string): Promise<ReportData>;
  /** Sessões em lobby/running. Antes de listar, termina as que estão abertas há mais de 12 h. */
  listOpenSessions(): Promise<SessionRow[]>;
  /** Termina uma sessão a meio: `aborted` + `finished_at`, sem race_record (fica fora do histórico). */
  abortSession(id: string): Promise<void>;
  createSession(quiz: QuizRow, classId: string | null, settings: SessionSettings): Promise<SessionRow>;
  getSession(id: string): Promise<SessionRow>;
  loadQuestions(quizId: string, version: number): Promise<QuestionRow[]>;
  listPlayers(sessionId: string): Promise<PlayerRow[]>;
  kickPlayer(playerId: string): Promise<void>;
  saveAnswers(rows: AnswerRow[]): Promise<void>;
  loadAnswers(sessionId: string): Promise<AnswerRow[]>;
  updateSession(id: string, patch: { status?: SessionStatus; state?: SavedState | null; started?: boolean; finished?: boolean }): Promise<void>;
  saveRaceRecord(row: RaceRecordRow): Promise<void>;
  /** Corridas gravadas de um quiz+versão com dados para replay (formato v2). */
  listGhostRecords(quizId: string, version: number): Promise<GhostRecord[]>;

  joinSession(pin: string, nickname: string, deviceToken: string): Promise<JoinResult>;
  /** Liga ao canal; `onStatus` avisa quando fica ligado ou cai. */
  openChannel(sessionId: string, onMessage: (msg: AnyEvent) => void, onStatus?: (connected: boolean) => void): Channel;
}

let cached: Promise<Api> | null = null;

export function getApi(): Promise<Api> {
  cached ??= (async () => {
    // Mock only while `?mock` is in the address. It is deliberately not remembered:
    // a sticky flag made other tabs of the same browser silently use the fake DB.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
      return (await import('./api.mock')).mockApi;
    }
    localStorage.removeItem('gpp.mock'); // flag left behind by older versions
    return (await import('./api.supabase')).supabaseApi;
  })();
  return cached;
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
