import type { BotField } from '../engine/drivers';

export interface QuizRow {
  id: string;
  title: string;
  year: number | null;
  topic: string | null;
  version: number;
  questionCount: number;
  /** ISO da última corrida gravada, ou null. */
  lastPlayed: string | null;
}

export interface ClassRow {
  id: string;
  name: string;
  year: number;
}

export interface QuestionRow {
  id: string;
  position: number;
  prompt: string;
  options: string[];
  correct: number;
  time_limit: number;
  explanation: string | null;
}

export type SessionStatus = 'lobby' | 'running' | 'finished' | 'aborted';

export interface SessionSettings {
  botField: BotField;
  /** Voltas (1–5). Omitido: 3 (ou 1 com menos de 3 perguntas). */
  laps?: number;
  /** Perguntas por volta. Omitido/null: "todas" (as perguntas repartem-se pelas voltas). */
  questionsPerLap?: number | null;
  /** Tempo por pergunta em segundos, a substituir o do quiz. */
  questionTime?: number | null;
}

/** Estado gravado pelo anfitrião a cada pergunta, para retomar depois de sair do Safari. */
export interface SavedState {
  v: 1;
  seed: number;
  /** Próxima pergunta a fazer. */
  next: number;
  outcomes: { accuracy: number; speedBonus: number }[];
  /** player_id → chave do avatar (vem do `hello` dos alunos). */
  avatars?: Record<string, string>;
  /** Presente quando a corrida acabou. */
  final?: import('./protocol').EndMsg;
}

export interface SessionRow {
  id: string;
  teacher_id: string;
  quiz_id: string;
  quiz_version: number;
  quiz_title: string;
  class_id: string | null;
  pin: string;
  status: SessionStatus;
  settings: SessionSettings;
  state: SavedState | null;
  /** Só preenchido pela base de dados falsa (limpeza de sessões antigas). */
  created_at?: string;
}

export interface PlayerRow {
  id: string;
  nickname: string;
  kicked: boolean;
}

export interface AnswerRow {
  session_id: string;
  question_id: string;
  player_id: string;
  value: number | null;
  correct: boolean;
  ms_taken: number;
}

export interface JoinResult {
  session_id: string;
  player_id: string;
  nickname: string;
  status: SessionStatus;
}

export interface RaceRecordRow {
  session_id: string;
  class_id: string | null;
  quiz_id: string;
  quiz_version: number;
  timeline: { accuracy: number; speedBonus: number }[];
  final_position: number;
  finish_time_ms: number;
}

export interface QuizInput {
  id: string;
  title: string;
  year: number | null;
  topic: string | null;
  questions: QuestionRow[];
}

export interface SaveQuizResult {
  version: number;
  bumped: boolean;
  /** Ids das perguntas, pela ordem enviada (mudam quando há nova versão). */
  ids: string[];
}

export interface RaceSummary {
  session_id: string;
  created_at: string;
  quiz_id: string;
  quiz_title: string;
  quiz_version: number;
  class_id: string | null;
  class_name: string | null;
  final_position: number;
  /** Média de respostas certas (0–1) ao longo da corrida. */
  avg_accuracy: number;
}

export interface ReportData {
  race: RaceSummary | null;
  questions: QuestionRow[];
  answers: AnswerRow[];
  playerCount: number;
}
