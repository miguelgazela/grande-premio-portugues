import { strFromU8, unzipSync } from 'fflate';
import { ImportError, LIMITS } from './types';

export interface Sheet { name: string; rows: string[][] }

const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] ?? m;
  });

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** Texto de um <si> / <is>: junta os <t> (ignora <rPh>, a fonética). */
const richText = (xml: string) => {
  const noPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  return [...noPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
};

/** "C12" → coluna 2 (0-based). */
const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? '') n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/**
 * Lê um .xlsx sem executar nada: só valores já calculados (fórmulas não são avaliadas, macros
 * e ligações externas são ignoradas). XML por expressões regulares, sem DOM nem eval.
 */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  let total = 0;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (f.originalSize > LIMITS.unzippedBytes || total > LIMITS.unzippedBytes) throw new ImportError('O ficheiro é demasiado grande depois de descomprimido.');
        return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name);
      },
    });
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('Não consegui abrir o ficheiro. Está mesmo em formato .xlsx (Excel 2007 ou mais recente)?');
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : '');
  const workbook = text('xl/workbook.xml');
  if (!workbook) throw new ImportError('Isto não parece um ficheiro Excel (.xlsx). Falta o livro de folhas.');

  const rels = new Map<string, string>();
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => richText(m[1]));

  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    if (attr(m[0], 'state') === 'hidden' || attr(m[0], 'state') === 'veryHidden') continue;
    const rid = attr(m[0], 'r:id');
    const xml = rid ? text(rels.get(rid) ?? '') : '';
    if (!xml) continue;
    sheets.push({ name: decode(attr(m[0], 'name') ?? ''), rows: readSheet(xml, shared) });
  }
  if (!sheets.length) throw new ImportError('O ficheiro Excel não tem folhas com dados.');
  return sheets;
}

function readSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let seen = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (++seen > LIMITS.rows) throw new ImportError(`A folha tem demasiadas linhas (máximo ${LIMITS.rows}).`);
    const r = Number(attr(rm[1], 'r')) - 1;
    const cells: string[] = [];
    let next = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      const ci = ref ? colIndex(ref) : next;
      next = ci + 1;
      if (ci < 0 || ci >= LIMITS.cols) continue;
      const type = attr(cm[1], 't');
      const body = cm[2] ?? '';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 'inlineStr') value = richText(body);
      else if (v !== undefined) {
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'e') value = '';
        else value = decode(v); // número ou texto de fórmula (str): só o valor em cache
      }
      cells[ci] = value;
    }
    if (cells.some((c) => c && c.trim())) rows[Number.isFinite(r) && r >= 0 ? r : rows.length] = Array.from(cells, (c) => c ?? '');
  }
  // Linhas vazias ficam como [] para o índice ser o número da linha no ficheiro.
  return Array.from(rows, (r) => r ?? []);
}
