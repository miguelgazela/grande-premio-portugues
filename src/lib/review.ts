import { grade } from './questions';
import type { AnswerRow, QuestionRow, ReviewQuestion, ReviewResult, ReviewSession, ReviewSettings } from './types';

export const DEFAULT_THRESHOLD = 0.6;
export const DEFAULT_SESSIONS = 3;
export const DEFAULT_COUNT = 12;
export const MIN_COUNT = 5;
export const MAX_COUNT = 30;

/** Crédito 0–1 de uma resposta gravada (o parcial recalcula-se do valor; sem valor vale o `correct`). */
export function answerCredit(q: QuestionRow, a: AnswerRow): number {
  if (a.value !== null && a.value !== undefined) {
    try {
      return grade(q, a.value);
    } catch {
      return 0; // valor de uma versão antiga do formato
    }
  }
  return a.correct ? 1 : 0;
}

/** As `n` sessões terminadas mais recentes (as `aborted` e as abertas ficam de fora). */
export function lastSessions<T extends Pick<ReviewSession, 'status' | 'created_at'>>(sessions: T[], n: number): T[] {
  return sessions
    .filter((s) => s.status === 'finished')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, Math.max(0, n));
}

export interface FailureStat {
  id: string;
  prompt: string;
  quizId: string;
  quizTitle: string;
  /** Média do crédito das respostas dadas, juntando as sessões (0–1). */
  pct: number;
  answers: number;
  sessions: number;
}

/**
 * % de acerto da turma por pergunta, juntando as respostas de várias sessões terminadas.
 * A identificação é por `question.id` (cada versão de um quiz tem ids próprios), e o conteúdo é o da
 * versão em que foi jogada. Perguntas que já não existem ou de quizzes arquivados vêm em `skipped`.
 * Nunca por aluno: só agregados.
 */
export function questionStats(sessions: ReviewSession[], questions: ReviewQuestion[]): { stats: FailureStat[]; skipped: number } {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const acc = new Map<string, { credit: number; answers: number; sessions: Set<string> }>();
  const gone = new Set<string>();
  for (const s of sessions) {
    if (s.status !== 'finished') continue;
    for (const a of s.answers) {
      const q = byId.get(a.question_id);
      if (!q || q.archived) {
        gone.add(a.question_id);
        continue;
      }
      const e = acc.get(q.id) ?? { credit: 0, answers: 0, sessions: new Set<string>() };
      e.credit += answerCredit(q, a);
      e.answers++;
      e.sessions.add(s.id);
      acc.set(q.id, e);
    }
  }
  const stats = [...acc].map(([id, e]): FailureStat => {
    const q = byId.get(id)!;
    return { id, prompt: q.prompt, quizId: q.quiz_id, quizTitle: q.quiz_title, pct: e.credit / e.answers, answers: e.answers, sessions: e.sessions.size };
  });
  return { stats, skipped: gone.size };
}

/** Mais falhadas primeiro (menor %, depois mais respostas). */
export const byFailure = (a: FailureStat, b: FailureStat) => a.pct - b.pct || b.answers - a.answers || a.id.localeCompare(b.id);

export const clampCount = (n: number) => Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(n)));

/** Ids das perguntas falhadas (% < limiar), as `count` mais falhadas. */
export function selectFailed(stats: FailureStat[], threshold: number, count: number): string[] {
  return stats
    .filter((s) => s.pct < threshold)
    .sort(byFailure)
    .slice(0, clampCount(count))
    .map((s) => s.id);
}

/** Voltas que aproveitam mais perguntas (3, 2 ou 1; o motor deixa de fora o resto da divisão). */
export function reviewLaps(n: number): number {
  let best = 1;
  let bestUsed = 0;
  for (const laps of [3, 2, 1]) {
    if (laps > n) continue;
    const used = laps * Math.floor(n / laps);
    if (used > bestUsed) {
      best = laps;
      bestUsed = used;
    }
  }
  return best;
}

export const reviewTitle = (className: string | null, n: number) => `Revisão · ${className ?? 'sem turma'} · ${n} pergunta${n === 1 ? '' : 's'}`;

export function buildReviewSettings(
  className: string | null,
  ids: string[],
  threshold: number,
  before: ReviewSettings['before'],
): ReviewSettings {
  return { title: reviewTitle(className, ids.length), className, questionIds: ids, threshold, before };
}

/** Compara a revisão com o que havia antes. `after` = % por pergunta nesta corrida (só as respondidas). */
export function compareReview(review: ReviewSettings, questions: { id: string; prompt: string }[], after: Map<string, number>): ReviewResult {
  return {
    threshold: review.threshold,
    items: questions
      .filter((q) => after.has(q.id))
      .map((q) => ({ id: q.id, prompt: q.prompt, before: review.before[q.id]?.pct ?? null, after: after.get(q.id)!, sessions: review.before[q.id]?.sessions ?? 0 })),
  };
}

export const stillFailing = (r: ReviewResult) => r.items.filter((i) => i.after < r.threshold);
export const improved = (r: ReviewResult) => r.items.filter((i) => i.after >= r.threshold);

/** Base para a revisão seguinte: as ainda falhadas, com o resultado desta corrida como "antes". */
export function repeatSettings(prev: ReviewSettings, r: ReviewResult): ReviewSettings | null {
  const left = stillFailing(r);
  if (!left.length) return null;
  const before: ReviewSettings['before'] = {};
  for (const i of left) before[i.id] = { pct: i.after, sessions: 1 };
  return buildReviewSettings(prev.className, left.map((i) => i.id), prev.threshold, before);
}
