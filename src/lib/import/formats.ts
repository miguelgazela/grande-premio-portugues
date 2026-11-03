import { buildItem, cell, findColumns, parseCorrectNumbers } from './grid';
import { norm } from './text';
import { type ImportFormat, type ImportItem, ImportError, LIMITS } from './types';
import type { Sheet } from './xlsx';

/**
 * Modelo de importação do Kahoot e formato próprio simples: mesma leitura por cabeçalho.
 * A "Resposta certa" pode ser o(s) número(s) 1–4 (Kahoot) ou, no formato simples, o texto da opção.
 */
export function parseGrid(rows: string[][]): { format: ImportFormat; items: ImportItem[] } {
  const cols = findColumns(rows);
  if (!cols) {
    throw new ImportError('Formato não reconhecido: não encontrei a linha de cabeçalho com "Pergunta" e pelo menos duas colunas "Resposta 1", "Resposta 2"… Usa o modelo do Kahoot ou o ficheiro-modelo da página de importar.');
  }
  if (cols.correct < 0) throw new ImportError('Não encontrei a coluna da resposta certa (ex.: "Resposta certa" ou "Correct answer(s)").');
  const head = (rows[cols.headerRow] ?? [])[cols.question] ?? '';
  const format: ImportFormat = /\b(max|máx|caracteres|characters)\b/i.test(head) ? 'kahoot-template' : 'simple';

  const items: ImportItem[] = [];
  for (let r = cols.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (!row.some((c) => c && c.trim())) continue;
    if (items.length >= LIMITS.questions) throw new ImportError(`O ficheiro tem mais de ${LIMITS.questions} perguntas. Divide-o em vários quizzes.`);
    const prompt = cell(row, cols.question);
    const answers = cols.answers.map((c) => cell(row, c)); // por posição 1..4
    const options: string[] = [];
    const posOf = new Map<number, number>(); // nº original 0..3 → posição nas opções preenchidas
    answers.forEach((a, i) => { if (a) { posOf.set(i, options.length); options.push(a); } });

    const rawCorrect = cell(row, cols.correct);
    let correct: number[] = [];
    let reason: string | undefined;
    if (!rawCorrect) reason = 'não diz qual é a resposta certa';
    else {
      const nums = parseCorrectNumbers(rawCorrect);
      if (nums) {
        const mapped = nums.map((n) => posOf.get(n));
        if (mapped.some((m) => m === undefined)) reason = 'a resposta certa aponta para uma resposta vazia';
        else correct = mapped as number[];
      } else {
        const hit = options.findIndex((o) => norm(o) === norm(rawCorrect));
        if (hit >= 0) correct = [hit];
        else reason = `não percebi a resposta certa "${rawCorrect}" (usa o número 1–4 ou o texto exato de uma opção)`;
      }
    }
    items.push(buildItem({ row: r + 1, prompt, options, correct, correctUnknownReason: reason, time: cell(row, cols.time), explanation: cell(row, cols.explanation) }, format));
  }
  return { format, items };
}

/**
 * Relatório de um jogo do Kahoot: a folha "RawReportData Data" tem uma linha por resposta de cada
 * jogador, com a pergunta, as respostas 1–4 e a(s) resposta(s) certa(s). Juntamos por nº da pergunta.
 */
export function parseReport(sheets: Sheet[]): { items: ImportItem[]; sheetName: string } | null {
  for (const s of sheets) {
    const cols = findColumns(s.rows, { report: true });
    if (!cols || cols.correct < 0 || cols.number < 0) continue;
    const seen = new Map<string, number>();
    const items: ImportItem[] = [];
    for (let r = cols.headerRow + 1; r < s.rows.length; r++) {
      const row = s.rows[r] ?? [];
      const key = cell(row, cols.number) || cell(row, cols.question);
      if (!key || seen.has(key)) continue;
      seen.set(key, r);
      if (items.length >= LIMITS.questions) throw new ImportError(`O relatório tem mais de ${LIMITS.questions} perguntas.`);
      const options: string[] = [];
      const posOf = new Map<number, number>();
      cols.answers.forEach((c, i) => { const a = cell(row, c); if (a) { posOf.set(i, options.length); options.push(a); } });
      const rawCorrect = cell(row, cols.correct);
      const { correct, reason } = matchReportCorrect(rawCorrect, options, posOf);
      items.push(buildItem({ row: r + 1, prompt: cell(row, cols.question), options, correct, correctUnknownReason: reason, time: cell(row, cols.time), explanation: '' }, 'kahoot-report'));
    }
    if (items.length) return { items, sheetName: s.name };
  }
  return null;
}

function matchReportCorrect(raw: string, options: string[], posOf: Map<number, number>): { correct: number[]; reason?: string } {
  const bad = { correct: [] as number[], reason: 'não deu para identificar a resposta certa no relatório' };
  if (!raw) return bad;
  const whole = options.findIndex((o) => norm(o) === norm(raw));
  if (whole >= 0) return { correct: [whole] };
  // Várias respostas certas, separadas por nova linha ou ";" (a vírgula pode fazer parte do texto).
  const parts = raw.split(/\s*[\n;]\s*/).map(norm).filter(Boolean);
  const hits = parts.map((p) => options.findIndex((o) => norm(o) === p));
  if (parts.length > 1 && hits.every((h) => h >= 0)) return { correct: [...new Set(hits)] };
  const nums = /^[1-4]([,;\s]+[1-4])*$/.test(raw.trim()) ? raw.split(/[,;\s]+/).map((n) => posOf.get(Number(n) - 1)) : [];
  if (nums.length && nums.every((n) => n !== undefined)) return { correct: nums as number[] };
  return bad;
}
