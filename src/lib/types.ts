import type { BotField } from '../engine/drivers';
import type { StoredTimeline } from './ghosts';

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

export type QuestionType = 'multiple_choice' | 'true_false' | 'tap_word' | 'order' | 'complete' | 'excerpt' | 'match';

/**
 * Formato de cada tipo, tal como fica em `question.payload` / `question.correct` (jsonb).
 * `payload` descreve o material; `correct` a solução. Nunca vão juntos para os alunos:
 * o anfitrião constrói a `PublicQuestion` só com o material (e baralhado onde faz falta).
 *
 * - multiple_choice: payload `{options}` (2–4), correct `{index}`.
 * - true_false:      payload `{}`, correct `{value: boolean}`.
 * - tap_word:        payload `{sentence}`; as palavras são `tokenize(sentence)` (separadas por espaços,
 *                    a pontuação fica colada à palavra); correct `{indices}` = palavras a tocar (exato).
 * - order:           payload `{items}` (2–8) JÁ NA ORDEM CERTA; correct `{}`. Baralha-se no anfitrião.
 *                    Crédito parcial = fração de itens na posição certa.
 * - complete:        payload `{text, options?}`; `text` tem uma ou mais lacunas `___`. correct `{accepted}`
 *                    = uma lista de respostas aceites por lacuna. Com `options` há uma só lacuna e o aluno
 *                    escolhe; sem `options` escreve. Crédito parcial = fração de lacunas certas.
 *                    Comparação sem maiúsculas, acentos nem espaços a mais (`normalizeAnswer`).
 * - excerpt:         payload `{excerpt, options}` (2–4), correct `{index}`; como escolha múltipla.
 * - match:           payload `{left, right}` (2–6 cada), em que `left[i]` liga a `right[i]`; correct `{}`.
 *                    Baralha-se a coluna da direita. Crédito parcial = fração de pares certos.
 */
export type QuestionBody =
  | { type: 'multiple_choice'; payload: { options: string[] }; correct: { index: number } }
  | { type: 'true_false'; payload: Record<string, never>; correct: { value: boolean } }
  | { type: 'tap_word'; payload: { sentence: string }; correct: { indices: number[] } }
  | { type: 'order'; payload: { items: string[] }; correct: Record<string, never> }
  | { type: 'complete'; payload: { text: string; options?: string[] }; correct: { accepted: string[][] } }
  | { type: 'excerpt'; payload: { excerpt: string; options: string[] }; correct: { index: number } }
  | { type: 'match'; payload: { left: string[]; right: string[] }; correct: Record<string, never> };

export type QuestionRow = {
  id: string;
  position: number;
  prompt: string;
  time_limit: number;
  explanation: string | null;
} & QuestionBody;

/**
 * Valor de uma resposta, em coordenadas "canónicas" (as do payload original, não as baralhadas):
 * - multiple_choice / excerpt: índice da opção;
 * - true_false: boolean;
 * - tap_word: índices das palavras tocadas, ordenados;
 * - order: índices originais dos itens, pela ordem que o aluno escolheu;
 * - complete: um texto por lacuna;
 * - match: para cada `left[i]`, o índice original de `right` escolhido (-1 = por ligar).
 */
export type AnswerValue = number | boolean | number[] | string[];

export type SessionStatus = 'lobby' | 'running' | 'finished' | 'aborted';

export interface SessionSettings {
  botField: BotField;
  /** Voltas (1–5). Omitido: 3 (ou 1 com menos de 3 perguntas). */
  laps?: number;
  /** Perguntas por volta. Omitido/null: "todas" (as perguntas repartem-se pelas voltas). */
  questionsPerLap?: number | null;
  /** Tempo por pergunta em segundos, a substituir o do quiz. */
  questionTime?: number | null;
  /** Pista escolhida (a dos fantasmas). Omitido: `trackFor(session.id)`. */
  trackId?: string;
  /** Corridas anteriores que correm como fantasmas (0–3). */
  ghosts?: { sessionId: string; name: string }[];
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
  /** Aspeto do carro da turma, fixado ao começar. */
  team?: import('../game/teamStyle').TeamStyle;
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
  value: AnswerValue | null;
  /** Certa por inteiro (crédito 1). O crédito parcial recalcula-se a partir do `value`. */
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
  /** Formato antigo (lista) ou `{ v: 2, trackId, config, outcomes }`. */
  timeline: StoredTimeline;
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
