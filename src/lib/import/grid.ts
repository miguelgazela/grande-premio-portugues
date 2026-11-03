import { DEFAULT_TIME } from '../questions';
import { MAX_TIME, MIN_TIME, questionProblems } from '../quizEdit';
import type { QuestionRow } from '../types';
import { clip, cleanText, norm } from './text';
import { type ImportFormat, type ImportItem, ImportError, LIMITS } from './types';

export interface Columns {
  headerRow: number;
  question: number;
  answers: number[]; // índice da coluna de cada resposta 1..4 (-1 se não existe)
  correct: number;
  time: number;
  explanation: number;
  number: number; // "Question Number" (relatório)
}

const find = (heads: string[], re: RegExp) => heads.findIndex((h) => re.test(h));

/** Procura a linha de cabeçalho (instruções vêm antes, no modelo do Kahoot) e mapeia as colunas pelo texto. */
export function findColumns(rows: string[][], opts: { report?: boolean } = {}): Columns | null {
  const answerRe = opts.report ? /^answers?\s*([1-4])\b/ : /^(?:answer|resposta|opcao|alternativa)\s*([1-4])\b/;
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const heads = (rows[r] ?? []).map((c) => norm(cleanText(c)));
    const question = find(heads, opts.report ? /^(question|pergunta)$/ : /^(question|pergunta|enunciado)\b/);
    const answers = [1, 2, 3, 4].map((n) => heads.findIndex((h) => answerRe.exec(h)?.[1] === String(n)));
    if (question < 0 || answers.filter((a) => a >= 0).length < 2) continue;
    return {
      headerRow: r,
      question,
      answers,
      correct: find(heads, /(correct|certa|correta|correcta)/),
      time: find(heads, /(time limit|time allotted|tempo|limite)/),
      explanation: find(heads, /(explic|explanation|justific)/),
      number: find(heads, /^(question number|n\.?o? da pergunta|numero)/),
    };
  }
  return null;
}

export const cell = (row: string[], i: number) => (i >= 0 ? cleanText(row[i]) : '');

const VERDADEIRO = new Set(['verdadeiro', 'true', 'certo', 'v']);
const FALSO = new Set(['falso', 'false', 'errado', 'f']);

export interface RawQuestion {
  row: number;
  prompt: string;
  options: string[];
  /** Posições (0-based, nas opções preenchidas) das respostas certas; vazio = não identificada. */
  correct: number[];
  correctUnknownReason?: string;
  time: string;
  explanation: string;
}

/** Aplica as regras de mapeamento, limites e validação do editor a uma pergunta lida. */
export function buildItem(raw: RawQuestion, format: ImportFormat): ImportItem {
  const notes: string[] = [];
  const skip = (why: string): ImportItem => ({ row: raw.row, prompt: raw.prompt, status: 'skip', notes: [why] });

  if (!raw.prompt) return skip('sem texto da pergunta');
  if (raw.options.length < 2) return skip('precisa de pelo menos 2 respostas (perguntas só de imagem, slider ou puzzle não são suportadas)');
  if (raw.correct.length > 1) return skip('tem várias respostas certas, que o jogo ainda não suporta');
  if (raw.correct.length === 0) return skip(raw.correctUnknownReason ?? 'não diz qual é a resposta certa');

  const p = clip(raw.prompt, LIMITS.prompt);
  if (p.clipped) notes.push(`enunciado cortado em ${LIMITS.prompt} caracteres`);
  const options = raw.options.map((o) => {
    const c = clip(o, LIMITS.option);
    if (c.clipped) notes.push(`resposta cortada em ${LIMITS.option} caracteres`);
    return c.text;
  });
  const ex = clip(raw.explanation, LIMITS.explanation);
  if (ex.clipped) notes.push(`explicação cortada em ${LIMITS.explanation} caracteres`);

  const body = trueFalseBody(options, raw.correct[0]);
  const type = body ? 'true_false' : 'multiple_choice';
  const tf = parseTime(raw.time, DEFAULT_TIME[type]);
  notes.push(...tf.notes);

  const question = {
    prompt: p.text,
    time_limit: tf.value,
    explanation: ex.text || null,
    ...(body ?? { type: 'multiple_choice' as const, payload: { options }, correct: { index: raw.correct[0] } }),
  } as Omit<QuestionRow, 'id' | 'position'>;

  const problems = questionProblems({ ...question, id: '', position: 0 } as QuestionRow);
  if (problems.length) return skip(problems.join('; '));
  void format;
  return { row: raw.row, prompt: p.text, status: notes.length ? 'warn' : 'ok', notes, question };
}

function trueFalseBody(options: string[], correct: number) {
  if (options.length !== 2) return null;
  const [a, b] = options.map((o) => norm(o).replace(/[.!]$/, ''));
  const aTrue = VERDADEIRO.has(a) && FALSO.has(b);
  const bTrue = VERDADEIRO.has(b) && FALSO.has(a);
  if (!aTrue && !bTrue) return null;
  return { type: 'true_false' as const, payload: {}, correct: { value: (correct === 0) === aTrue } };
}

/** Tempo do Kahoot (5…240 s) → tempo do jogo (5…60 s). */
export function parseTime(raw: string, fallback: number): { value: number; notes: string[] } {
  if (!raw) return { value: fallback, notes: [] };
  const n = Math.round(Number(raw.replace(',', '.').match(/\d+(?:[.,]\d+)?/)?.[0].replace(',', '.')));
  if (!Number.isFinite(n) || n <= 0) return { value: fallback, notes: [`tempo "${raw}" não reconhecido, usei ${fallback} s`] };
  if (n > MAX_TIME) return { value: MAX_TIME, notes: [`tempo de ${n} s passou a ${MAX_TIME} s (máximo do jogo)`] };
  if (n < MIN_TIME) return { value: MIN_TIME, notes: [`tempo de ${n} s passou a ${MIN_TIME} s (mínimo do jogo)`] };
  return { value: n, notes: [] };
}

/** "1", "2,3", "1;3", "A", "B" … → posições 0-based. Devolve null se não for esse formato. */
export function parseCorrectNumbers(raw: string): number[] | null {
  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) return null;
  const out: number[] = [];
  for (const p of parts) {
    const n = /^[1-4]$/.test(p) ? Number(p) : /^[a-dA-D]$/.test(p) ? p.toUpperCase().charCodeAt(0) - 64 : NaN;
    if (!Number.isFinite(n)) return null;
    out.push(n - 1);
  }
  return [...new Set(out)];
}

export function checkSize(rows: string[][]) {
  if (!rows.length) throw new ImportError('O ficheiro está vazio.');
}
