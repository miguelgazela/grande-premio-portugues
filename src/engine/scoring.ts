import { creditOf, type PlayerAnswer } from './outcome';

export interface PlayerScore {
  playerId: string;
  points: number;
  /** Certas por inteiro. */
  correct: number;
  /** Parcialmente certas (crédito entre 0 e 1). */
  partial: number;
  answered: number;
  bestStreak: number;
  heroCount: number;
  /** Average time fraction of correct answers (lower = faster). */
  avgCorrectTime: number;
}

export const POINTS = { correct: 100, speedMax: 50, perStreak: 10, streakCap: 50, hero: 50, heroBelow: 0.5 };

/**
 * Contribution points per player. A partially credited answer (order/complete/match) earns
 * (100 + speed) × credit and breaks the streak; `correct` counts only fully right ones.
 * correct 100 + up to 50 for speed + 10 per answer already in the streak
 * (capped at +50) + 50 "hero" bonus when the class was below 50% on that question.
 */
export function scoreRace(playerIds: string[], questions: { answers: PlayerAnswer[]; teamAccuracy: number }[]): PlayerScore[] {
  const scores = new Map<string, PlayerScore & { streak: number; timeSum: number }>();
  for (const id of playerIds) {
    scores.set(id, { playerId: id, points: 0, correct: 0, partial: 0, answered: 0, bestStreak: 0, heroCount: 0, avgCorrectTime: 1, streak: 0, timeSum: 0 });
  }
  for (const q of questions) {
    for (const a of q.answers) {
      const s = scores.get(a.playerId);
      if (!s) continue;
      if (a.answered) s.answered++;
      const credit = creditOf(a);
      if (credit <= 0) {
        s.streak = 0;
        continue;
      }
      // Crédito parcial: pontos proporcionais, sem bónus de série nem de herói, e a série quebra.
      if (credit < 1) {
        s.points += Math.round((POINTS.correct + POINTS.speedMax * (1 - a.timeFrac)) * credit);
        s.streak = 0;
        s.partial++;
        continue;
      }
      s.correct++;
      s.timeSum += a.timeFrac;
      s.points += POINTS.correct + Math.round(POINTS.speedMax * (1 - a.timeFrac)) + Math.min(POINTS.streakCap, POINTS.perStreak * s.streak);
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      if (q.teamAccuracy < POINTS.heroBelow) {
        s.points += POINTS.hero;
        s.heroCount++;
      }
    }
  }
  return [...scores.values()]
    .map(({ streak: _streak, timeSum, ...s }) => ({ ...s, avgCorrectTime: s.correct ? timeSum / s.correct : 1 }))
    .sort((a, b) => b.points - a.points);
}

export interface Award {
  key: 'fastest' | 'accurate' | 'streak' | 'hero';
  title: string;
  emoji: string;
  playerId: string;
  detail: string;
}

/**
 * One winner per category, only if somebody qualifies. Prefers a different
 * student for each award so more of the class gets recognised.
 */
export function pickAwards(scores: PlayerScore[]): Award[] {
  const awards: Award[] = [];
  const taken = new Set<string>();
  const best = (list: PlayerScore[], cmp: (a: PlayerScore, b: PlayerScore) => number) => {
    const sorted = [...list].sort(cmp);
    const pick = sorted.find((s) => !taken.has(s.playerId)) ?? sorted[0];
    if (pick) taken.add(pick.playerId);
    return pick;
  };

  const fast = best(scores.filter((s) => s.correct >= 3), (a, b) => a.avgCorrectTime - b.avgCorrectTime);
  if (fast) awards.push({ key: 'fastest', title: 'Mais rápido', emoji: '⚡', playerId: fast.playerId, detail: `${Math.round(fast.avgCorrectTime * 100)}% do tempo, em média` });

  const acc = best(scores.filter((s) => s.correct > 0), (a, b) => b.correct - a.correct || a.avgCorrectTime - b.avgCorrectTime);
  if (acc) awards.push({ key: 'accurate', title: 'Mais certeiro', emoji: '🎯', playerId: acc.playerId, detail: `${acc.correct} certas` });

  const streak = best(scores.filter((s) => s.bestStreak >= 3), (a, b) => b.bestStreak - a.bestStreak);
  if (streak) awards.push({ key: 'streak', title: 'Maior série', emoji: '🔥', playerId: streak.playerId, detail: `${streak.bestStreak} seguidas` });

  const hero = best(scores.filter((s) => s.heroCount > 0), (a, b) => b.heroCount - a.heroCount);
  if (hero) awards.push({ key: 'hero', title: 'Herói da corrida', emoji: '🦸', playerId: hero.playerId, detail: `salvou a equipa ${hero.heroCount}×` });

  return awards;
}
