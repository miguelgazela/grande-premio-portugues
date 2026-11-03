import { clamp } from './rng';

/** What one car achieved on one question. */
export interface QuestionOutcome {
  /** 0..1 share of players who got it right (no answer counts as wrong). */
  accuracy: number;
  /** 0..1 share of the max speed bonus earned. */
  speedBonus: number;
}

export interface PlayerAnswer {
  playerId: string;
  answered: boolean;
  /** Certa por inteiro. */
  correct: boolean;
  /** Crédito 0..1 (ordenar/completar/correspondência dão parcial). Omitido: 1 se `correct`, senão 0. */
  credit?: number;
  /** Fraction of the answer time used (0 = instant, 1 = at the buzzer). */
  timeFrac: number;
}

/**
 * Class result for a question; accuracy is the mean credit (partial answers count fractionally). Full bonus when correct answers average ≤20% of
 * the time, none at ≥60%.
 */
export function outcomeFromAnswers(answers: PlayerAnswer[], playerCount: number): QuestionOutcome {
  if (playerCount <= 0) return { accuracy: 0, speedBonus: 0 };
  const scored = answers.filter((a) => a.answered && creditOf(a) > 0);
  const total = scored.reduce((s, a) => s + creditOf(a), 0);
  const accuracy = clamp(total / playerCount, 0, 1);
  if (total === 0) return { accuracy, speedBonus: 0 };
  // Tempo médio ponderado pelo crédito: uma resposta meio certa pesa metade.
  const avgTime = scored.reduce((s, a) => s + a.timeFrac * creditOf(a), 0) / total;
  return { accuracy, speedBonus: clamp((0.6 - avgTime) / 0.4, 0, 1) };
}

/** Crédito efetivo de uma resposta (0..1). */
export const creditOf = (a: PlayerAnswer): number => (a.answered ? clamp(a.credit ?? (a.correct ? 1 : 0), 0, 1) : 0);
