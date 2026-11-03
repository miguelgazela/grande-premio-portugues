import { toCsv, parseCsv } from './csv';
import { parseGrid, parseReport } from './formats';
import { type ImportResult, ImportError, LIMITS } from './types';
import { readXlsx } from './xlsx';

export type { ImportItem, ImportResult, ImportStatus, ImportFormat } from './types';
export { ImportError, LIMITS } from './types';

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

/** Lê um ficheiro .xlsx ou .csv e devolve as perguntas já mapeadas (nada é guardado aqui). */
export function parseImportFile(name: string, bytes: Uint8Array): ImportResult {
  if (!bytes.length) throw new ImportError('O ficheiro está vazio.');
  if (bytes.length > LIMITS.fileBytes) throw new ImportError(`O ficheiro é demasiado grande (máximo ${LIMITS.fileBytes / 1024 / 1024} MB).`);
  const lower = name.toLowerCase();
  const notes: string[] = [];

  if (isZip(bytes) || lower.endsWith('.xlsx')) {
    if (!isZip(bytes)) throw new ImportError('Não consegui abrir o ficheiro. Está mesmo em formato .xlsx?');
    const sheets = readXlsx(bytes);
    const report = parseReport(sheets);
    if (report) {
      notes.push(`Relatório de jogo do Kahoot (folha "${report.sheetName}"): uma pergunta por número, vindas das respostas dos jogadores.`);
      return { format: 'kahoot-report', items: report.items, notes };
    }
    for (const s of sheets) {
      try {
        const r = parseGrid(s.rows);
        if (sheets.length > 1) notes.push(`Usei a folha "${s.name}".`);
        return { ...r, notes };
      } catch (e) {
        if (!(e instanceof ImportError) || sheets.length === 1) throw e;
      }
    }
    throw new ImportError('Formato não reconhecido: nenhuma folha tem o cabeçalho do modelo do Kahoot (Pergunta, Resposta 1…) nem o do ficheiro-modelo.');
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {
      text = new TextDecoder('windows-1252').decode(bytes); // Excel antigo grava CSV em ANSI
      notes.push('O CSV não estava em UTF-8; li-o como Windows-1252. Confirma os acentos.');
    }
    return { ...parseGrid(parseCsv(text)), notes };
  }
  throw new ImportError('Formato não suportado. Escolhe um ficheiro .xlsx ou .csv.');
}

/** Ficheiro-modelo (CSV `;` com BOM, abre bem no Excel PT). */
export function templateCsv(): string {
  return '﻿' + toCsv([
    ['Pergunta', 'Resposta 1', 'Resposta 2', 'Resposta 3', 'Resposta 4', 'Resposta certa', 'Tempo (s)', 'Explicação'],
    ['Quem escreveu "Os Lusíadas"?', 'Luís de Camões', 'Fernando Pessoa', 'Eça de Queirós', 'Camilo Castelo Branco', '1', '20', 'Publicado em 1572.'],
    ['Os Lusíadas são um poema épico.', 'Verdadeiro', 'Falso', '', '', '1', '15', ''],
    ['Qual é o narrador de "Os Maias"?', 'Heterodiegético', 'Autodiegético', '', '', '1', '', 'Narrador que não participa na ação.'],
  ]);
}

/** Título sugerido a partir do nome do ficheiro. */
export const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Quiz importado';
