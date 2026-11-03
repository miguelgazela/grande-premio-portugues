import { mulberry32 } from '../engine/rng';
import type { PublicBody, Solution } from './protocol';
import type { AnswerValue, QuestionRow, QuestionType } from './types';

export const BLANK = '___';

export const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: 'Escolha múltipla',
  true_false: 'Verdadeiro / Falso',
  tap_word: 'Toca na palavra',
  order: 'Ordenar',
  complete: 'Completar',
  excerpt: 'Excerto + pergunta',
  match: 'Correspondência',
};
export const TYPES = Object.keys(TYPE_LABEL) as QuestionType[];

/** Tempo por defeito (s) ao criar uma pergunta de cada tipo. */
export const DEFAULT_TIME: Record<QuestionType, number> = {
  multiple_choice: 20, true_false: 15, tap_word: 25, order: 30, complete: 25, excerpt: 45, match: 35,
};

export const tokenize = (sentence: string): string[] => sentence.trim().split(/\s+/).filter(Boolean);
export const blankCount = (text: string): number => text.split(BLANK).length - 1;

/** Sem maiúsculas, acentos, espaços a mais nem pontuação nas pontas. */
export const normalizeAnswer = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/^[.,;:!?«»"'()\s]+|[.,;:!?«»"'()\s]+$/g, '');

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Permutação determinística (a mesma depois de um refresh do anfitrião); nunca a identidade se n ≥ 2. */
export function shuffledIndices(n: number, seed: number, key: string): number[] {
  const rng = mulberry32((seed ^ hash(key)) >>> 0);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n >= 2 && a.every((v, i) => v === i)) a.push(a.shift()!);
  return a;
}

export interface Prepared {
  body: PublicBody;
  /** order/match/complete-com-opções: posição pública → índice original. */
  perm: number[] | null;
}

/** O que sai para os alunos e para o projetor. Nunca inclui `correct`. */
export function prepare(q: QuestionRow, seed: number): Prepared {
  switch (q.type) {
    case 'multiple_choice':
      return { body: { type: q.type, options: [...q.payload.options] }, perm: null };
    case 'excerpt':
      return { body: { type: q.type, excerpt: q.payload.excerpt, options: [...q.payload.options] }, perm: null };
    case 'true_false':
      return { body: { type: q.type }, perm: null };
    case 'tap_word':
      return { body: { type: q.type, words: tokenize(q.payload.sentence) }, perm: null };
    case 'order': {
      const perm = shuffledIndices(q.payload.items.length, seed, q.id);
      return { body: { type: q.type, items: perm.map((i) => q.payload.items[i]) }, perm };
    }
    case 'match': {
      const perm = shuffledIndices(q.payload.right.length, seed, q.id);
      return { body: { type: q.type, left: [...q.payload.left], right: perm.map((i) => q.payload.right[i]) }, perm };
    }
    case 'complete': {
      const opts = q.payload.options;
      return { body: { type: q.type, text: q.payload.text, options: opts?.length ? shuffledIndices(opts.length, seed, q.id).map((i) => opts[i]) : undefined }, perm: null };
    }
  }
}

const isIntArray = (v: unknown, n: number, min: number, max: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every((x) => Number.isInteger(x) && x >= min && x <= max);

/** Valida uma resposta vinda da rede (coordenadas públicas) e converte-a para canónicas. null = inválida. */
export function toCanonical(q: QuestionRow, prep: Prepared, v: unknown): AnswerValue | null {
  switch (q.type) {
    case 'multiple_choice':
    case 'excerpt':
      return Number.isInteger(v) && (v as number) >= 0 && (v as number) < q.payload.options.length ? (v as number) : null;
    case 'true_false':
      return typeof v === 'boolean' ? v : null;
    case 'tap_word': {
      const n = tokenize(q.payload.sentence).length;
      if (!Array.isArray(v) || v.length > n || !v.every((x) => Number.isInteger(x) && x >= 0 && x < n)) return null;
      return [...new Set(v as number[])].sort((a, b) => a - b);
    }
    case 'order': {
      const n = q.payload.items.length;
      if (!isIntArray(v, n, 0, n - 1) || new Set(v).size !== n) return null;
      return v.map((i) => prep.perm![i]);
    }
    case 'match': {
      const n = q.payload.left.length;
      if (!isIntArray(v, n, -1, q.payload.right.length - 1)) return null;
      return v.map((i) => (i < 0 ? -1 : prep.perm![i]));
    }
    case 'complete': {
      const n = blankCount(q.payload.text);
      if (!Array.isArray(v) || v.length !== n || !v.every((x) => typeof x === 'string' && x.length <= 80)) return null;
      return v as string[];
    }
  }
}

/** Crédito 0..1 de uma resposta canónica. */
export function grade(q: QuestionRow, v: AnswerValue): number {
  switch (q.type) {
    case 'multiple_choice':
    case 'excerpt':
      return v === q.correct.index ? 1 : 0;
    case 'true_false':
      return v === q.correct.value ? 1 : 0;
    case 'tap_word': {
      const a = v as number[];
      const c = [...q.correct.indices].sort((x, y) => x - y);
      return a.length === c.length && a.every((x, i) => x === c[i]) ? 1 : 0;
    }
    case 'order':
      return (v as number[]).filter((x, i) => x === i).length / q.payload.items.length;
    case 'match':
      return (v as number[]).filter((x, i) => x === i).length / q.payload.left.length;
    case 'complete': {
      const a = v as string[];
      const ok = q.correct.accepted.filter((acc, b) => {
        const given = normalizeAnswer(a[b] ?? '');
        return given !== '' && acc.some((x) => normalizeAnswer(x) === given);
      }).length;
      return ok / q.correct.accepted.length;
    }
  }
}

/** Para a revelação. */
export function solutionOf(q: QuestionRow): Solution {
  switch (q.type) {
    case 'multiple_choice':
    case 'excerpt':
      return { type: q.type, index: q.correct.index };
    case 'true_false':
      return { type: q.type, value: q.correct.value };
    case 'tap_word':
      return { type: q.type, indices: [...q.correct.indices].sort((a, b) => a - b) };
    case 'order':
      return { type: q.type, items: [...q.payload.items] };
    case 'complete':
      return { type: q.type, answers: q.correct.accepted.map((a) => a[0] ?? '') };
    case 'match':
      return { type: q.type, pairs: q.payload.left.map((l, i): [string, string] => [l, q.payload.right[i]]) };
  }
}
