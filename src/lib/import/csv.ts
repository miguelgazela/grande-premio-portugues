import { ImportError, LIMITS } from './types';

/** Lê CSV (RFC 4180) com separador `;` (Excel PT), `,` ou tab, detetado na primeira linha. BOM é ignorado. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const sep = detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = '';
    rows.push(row.some((c) => c.trim()) ? row.slice(0, LIMITS.cols) : []); // vazias ficam: índice = nº da linha
    row = [];
    if (rows.length > LIMITS.rows) throw new ImportError(`O ficheiro tem demasiadas linhas (máximo ${LIMITS.rows}).`);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

function detectSeparator(text: string): string {
  let quoted = false;
  const n: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in n) n[ch]++;
  }
  return n[';'] >= n[','] && n[';'] >= n['\t'] && n[';'] > 0 ? ';' : n['\t'] > n[','] ? '\t' : ',';
}

/** Escreve CSV com `;`, aspas quando preciso (para o ficheiro-modelo). */
export function toCsv(rows: string[][]): string {
  const esc = (c: string) => (/[";\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}
