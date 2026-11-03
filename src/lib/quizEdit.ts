import { BLANK, DEFAULT_TIME, blankCount, normalizeAnswer, tokenize } from './questions';
import type { QuestionBody, QuestionRow, QuestionType } from './types';

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MIN_ITEMS = 2;
export const MAX_ITEMS = 8;
export const MAX_PAIRS = 6;
export const MIN_TIME = 5;
export const MAX_TIME = 60;

/** Corpo vazio de cada tipo (o editor parte daqui ao escolher o tipo). */
export function blankBody(type: QuestionType): QuestionBody {
  switch (type) {
    case 'multiple_choice': return { type, payload: { options: ['', ''] }, correct: { index: -1 } };
    case 'excerpt': return { type, payload: { excerpt: '', options: ['', ''] }, correct: { index: -1 } };
    case 'true_false': return { type, payload: {}, correct: { value: true } };
    case 'tap_word': return { type, payload: { sentence: '' }, correct: { indices: [] } };
    case 'order': return { type, payload: { items: ['', '', ''] }, correct: {} };
    case 'complete': return { type, payload: { text: '', options: undefined }, correct: { accepted: [] } };
    case 'match': return { type, payload: { left: ['', ''], right: ['', ''] }, correct: {} };
  }
}

export const blankQuestion = (position = 1, type: QuestionType = 'multiple_choice'): QuestionRow => ({
  id: crypto.randomUUID(),
  position,
  prompt: '',
  time_limit: DEFAULT_TIME[type],
  explanation: null,
  ...blankBody(type),
});

/** Muda o tipo mantendo enunciado, tempo (se ainda for o por defeito do tipo antigo) e explicação. */
export function changeType(q: QuestionRow, type: QuestionType): QuestionRow {
  if (q.type === type) return q;
  const time_limit = q.time_limit === DEFAULT_TIME[q.type] ? DEFAULT_TIME[type] : q.time_limit;
  return { id: q.id, position: q.position, prompt: q.prompt, explanation: q.explanation, time_limit, ...blankBody(type) };
}

const dupes = (xs: string[]) => new Set(xs.map(normalizeAnswer)).size < xs.length;

/** Problemas que impedem a pergunta de ser jogada (vazio = ok). */
export function questionProblems(q: QuestionRow): string[] {
  const out: string[] = [];
  if (!q.prompt.trim()) out.push('falta o enunciado');
  switch (q.type) {
    case 'multiple_choice':
    case 'excerpt': {
      if (q.type === 'excerpt' && !q.payload.excerpt.trim()) out.push('falta o excerto');
      const o = q.payload.options;
      const filled = o.filter((x) => x.trim()).length;
      if (o.length < MIN_OPTIONS || filled < o.length) out.push(filled < MIN_OPTIONS ? 'precisa de pelo menos 2 opções preenchidas' : 'há opções vazias');
      if (q.correct.index < 0 || q.correct.index >= o.length) out.push('falta marcar a resposta certa');
      else if (!o[q.correct.index]?.trim()) out.push('a resposta certa está vazia');
      if (filled === o.length && dupes(o)) out.push('há opções repetidas');
      break;
    }
    case 'true_false':
      break;
    case 'tap_word': {
      const n = tokenize(q.payload.sentence).length;
      if (!n) out.push('falta a frase');
      else if (!q.correct.indices.length) out.push('marca a(s) palavra(s) certa(s)');
      else if (q.correct.indices.some((i) => i >= n)) out.push('há palavras marcadas que já não existem na frase');
      break;
    }
    case 'order': {
      const it = q.payload.items;
      if (it.length < MIN_ITEMS || it.some((x) => !x.trim())) out.push('precisa de pelo menos 2 itens, todos preenchidos');
      else if (dupes(it)) out.push('há itens repetidos');
      break;
    }
    case 'complete': {
      const n = blankCount(q.payload.text);
      if (!q.payload.text.trim()) out.push('falta o texto');
      else if (n === 0) out.push(`o texto precisa de pelo menos uma lacuna (${BLANK})`);
      else if (q.correct.accepted.length !== n || q.correct.accepted.some((a) => !a.some((x) => x.trim()))) out.push('falta a resposta certa de cada lacuna');
      const opts = q.payload.options;
      if (opts) {
        if (n > 1) out.push('com opções só pode haver uma lacuna');
        if (opts.length < MIN_OPTIONS || opts.some((x) => !x.trim())) out.push('precisa de pelo menos 2 opções preenchidas');
        else if (dupes(opts)) out.push('há opções repetidas');
        else if (n === 1 && !opts.some((x) => q.correct.accepted[0]?.some((a) => normalizeAnswer(a) === normalizeAnswer(x)))) out.push('a resposta certa tem de estar entre as opções');
      }
      break;
    }
    case 'match': {
      const { left, right } = q.payload;
      if (left.length < 2 || left.some((x) => !x.trim()) || right.some((x) => !x.trim())) out.push('precisa de pelo menos 2 pares, todos preenchidos');
      else if (dupes(right)) out.push('há itens repetidos na coluna da direita');
      break;
    }
  }
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

export const renumber = <T extends QuestionRow>(qs: T[]): T[] => qs.map((q, i) => ({ ...q, position: i + 1 }));

/** Remove uma opção (escolha múltipla / excerto) mantendo a resposta certa coerente. */
export function removeOption(q: QuestionRow, i: number): QuestionRow {
  if (q.type !== 'multiple_choice' && q.type !== 'excerpt') return q;
  if (q.payload.options.length <= MIN_OPTIONS) return q;
  const options = q.payload.options.filter((_, k) => k !== i);
  const c = q.correct.index;
  const index = c === i ? -1 : c > i ? c - 1 : c;
  return { ...q, payload: { ...q.payload, options }, correct: { index } } as QuestionRow;
}

export function duplicateQuestion(q: QuestionRow): QuestionRow {
  return { ...structuredClone(q), id: crypto.randomUUID() };
}

/** Só o necessário para a base de dados / save_quiz. */
export const toSaveShape = (q: QuestionRow) => ({
  id: q.id, type: q.type, prompt: q.prompt.trim(), payload: cleanPayload(q), correct: cleanCorrect(q), time_limit: q.time_limit, explanation: q.explanation,
});

const cleanPayload = (q: QuestionRow) => (q.type === 'complete' && !q.payload.options ? { text: q.payload.text } : q.payload);
/** Tira respostas aceites vazias (o editor deixa-as enquanto se escreve). */
const cleanCorrect = (q: QuestionRow) => (q.type === 'complete' ? { accepted: q.correct.accepted.map((a) => a.map((x) => x.trim()).filter(Boolean)) } : q.correct);
