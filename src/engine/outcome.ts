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
  correct: boolean;
  /** Fraction of the answer time used (0 = instant, 1 = at the buzzer). */
  timeFrac: number;
}

/**
 * Class result for a question. Full bonus when correct answers average ≤20% of
 * the time, none at ≥60%.
 */
export function outcomeFromAnswers(answers: PlayerAnswer[], playerCount: number): QuestionOutcome {
  if (playerCount <= 0) return { accuracy: 0, speedBonus: 0 };
  const correct = answers.filter((a) => a.answered && a.correct);
  const accuracy = correct.length / playerCount;
  if (correct.length === 0) return { accuracy, speedBonus: 0 };
  const avgTime = correct.reduce((s, a) => s + a.timeFrac, 0) / correct.length;
  return { accuracy, speedBonus: clamp((0.6 - avgTime) / 0.4, 0, 1) };
}
