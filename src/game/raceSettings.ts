import { DEFAULT_CONFIG, type RaceConfig } from '../engine/config';
import type { QuestionRow, SessionSettings } from '../lib/types';

export const MAX_LAPS = 5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Máximo de perguntas por volta para um quiz de `n` perguntas com `laps` voltas. */
export const maxQuestionsPerLap = (n: number, laps: number) => Math.max(1, Math.floor(n / Math.max(1, laps)));

/**
 * Configuração da corrida a partir das perguntas e das definições da sessão.
 * - voltas: definição, ou 3 (1 com menos de 3 perguntas); nunca mais voltas que perguntas.
 * - perguntas por volta: definição (limitada ao que o quiz permite) ou "todas" (n / voltas, arredondado para baixo).
 * - tempo: definição, ou o maior `time_limit` das perguntas usadas (o motor usa um tempo único por corrida).
 */
export function raceConfigFor(questions: QuestionRow[], settings?: Partial<SessionSettings>): { config: RaceConfig; used: number } {
  const n = questions.length;
  const wantLaps = settings?.laps ?? (n >= 3 ? DEFAULT_CONFIG.laps : 1);
  const laps = clamp(Math.round(wantLaps), 1, Math.max(1, Math.min(MAX_LAPS, n)));
  const cap = maxQuestionsPerLap(n, laps);
  const questionsPerLap = settings?.questionsPerLap ? clamp(Math.round(settings.questionsPerLap), 1, cap) : cap;
  const used = laps * questionsPerLap;
  const fromQuiz = Math.max(0, ...questions.slice(0, used).map((q) => q.time_limit));
  const questionTime = clamp(Math.round(settings?.questionTime || fromQuiz || DEFAULT_CONFIG.questionTime), 5, 60);
  return { config: { ...DEFAULT_CONFIG, laps, questionsPerLap, questionTime }, used };
}
