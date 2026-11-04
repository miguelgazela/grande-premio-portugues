import { DEFAULT_CONFIG, finalCountFor, type RaceConfig } from '../engine/config';
import type { QuestionRow, SessionSettings } from '../lib/types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Configuração da corrida a partir das perguntas e das definições da sessão.
 * - perguntas: todas as do quiz (a pista é aberta, sem voltas).
 * - tempo: definição, ou o maior `time_limit` das perguntas (o motor usa um tempo único por corrida).
 */
export function raceConfigFor(questions: QuestionRow[], settings?: Partial<SessionSettings>): { config: RaceConfig; used: number } {
  const used = questions.length;
  const fromQuiz = Math.max(0, ...questions.map((q) => q.time_limit));
  const questionTime = clamp(Math.round(settings?.questionTime || fromQuiz || DEFAULT_CONFIG.questionTime), 5, 60);
  return { config: { ...DEFAULT_CONFIG, questions: used, finalCount: finalCountFor(used), questionTime }, used };
}
