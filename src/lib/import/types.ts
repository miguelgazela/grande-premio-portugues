import type { QuestionRow } from '../types';

export type ImportFormat = 'kahoot-template' | 'kahoot-report' | 'simple';

/** ok = entra como está; warn = entra com ajustes; skip = fica de fora (motivo em `notes`). */
export type ImportStatus = 'ok' | 'warn' | 'skip';

export interface ImportItem {
  /** Linha no ficheiro (1 = primeira), para a professora encontrar a pergunta. */
  row: number;
  prompt: string;
  status: ImportStatus;
  notes: string[];
  /** Só quando status != 'skip'. `id` e `position` são atribuídos ao criar o quiz. */
  question?: Omit<QuestionRow, 'id' | 'position'>;
}

export interface ImportResult {
  format: ImportFormat;
  items: ImportItem[];
  /** Avisos que não são de uma pergunta (ex.: folha ignorada). */
  notes: string[];
}

/** Erro com mensagem já pronta para a professora. */
export class ImportError extends Error {}

export const LIMITS = {
  fileBytes: 2 * 1024 * 1024,
  questions: 200,
  rows: 5000,
  cols: 40,
  unzippedBytes: 20 * 1024 * 1024,
  prompt: 300,
  option: 120,
  explanation: 400,
};
