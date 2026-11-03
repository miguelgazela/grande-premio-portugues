import type { QuestionRow } from './types';

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MIN_TIME = 5;
export const MAX_TIME = 60;

export const blankQuestion = (position = 1): QuestionRow => ({
  id: crypto.randomUUID(),
  position,
  prompt: '',
  options: ['', ''],
  correct: -1,
  time_limit: 20,
  explanation: null,
});

/** Problemas que impedem a pergunta de ser jogada (vazio = ok). */
export function questionProblems(q: QuestionRow): string[] {
  const out: string[] = [];
  if (!q.prompt.trim()) out.push('falta o enunciado');
  const filled = q.options.filter((o) => o.trim()).length;
  if (q.options.length < MIN_OPTIONS || filled < q.options.length) out.push(filled < MIN_OPTIONS ? 'precisa de pelo menos 2 opções preenchidas' : 'há opções vazias');
  if (q.correct < 0 || q.correct >= q.options.length) out.push('falta marcar a resposta certa');
  else if (!q.options[q.correct]?.trim()) out.push('a resposta certa está vazia');
  if (new Set(q.options.map((o) => o.trim().toLowerCase())).size < q.options.length && filled === q.options.length) out.push('há opções repetidas');
  if (!(q.time_limit >= MIN_TIME && q.time_limit <= MAX_TIME)) out.push(`o tempo tem de estar entre ${MIN_TIME} e ${MAX_TIME}s`);
  return out;
}

export interface QuizProblem {
  /** Índice da pergunta, ou -1 para o quiz. */
  index: number;
  text: string;
}

export function quizProblems(title: string, questions: QuestionRow[]): QuizProblem[] {
  const out: QuizProblem[] = [];
  if (!title.trim()) out.push({ index: -1, text: 'O quiz precisa de um título.' });
  if (!questions.length) out.push({ index: -1, text: 'O quiz ainda não tem perguntas.' });
  questions.forEach((q, i) => {
    for (const p of questionProblems(q)) out.push({ index: i, text: `Pergunta ${i + 1}: ${p}.` });
  });
  return out;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export const renumber = (qs: QuestionRow[]): QuestionRow[] => qs.map((q, i) => ({ ...q, position: i + 1 }));

/** Remove uma opção mantendo a resposta certa coerente. */
export function removeOption(q: QuestionRow, i: number): QuestionRow {
  if (q.options.length <= MIN_OPTIONS) return q;
  const options = q.options.filter((_, k) => k !== i);
  const correct = q.correct === i ? -1 : q.correct > i ? q.correct - 1 : q.correct;
  return { ...q, options, correct };
}

export function duplicateQuestion(q: QuestionRow): QuestionRow {
  return { ...q, id: crypto.randomUUID(), options: [...q.options] };
}
