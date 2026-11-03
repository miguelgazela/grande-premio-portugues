import { strToU8, zipSync } from 'fflate';

export type Cell = string | number | null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colName = (i: number) => String.fromCharCode(65 + i);

/** Monta um .xlsx mínimo (strings partilhadas e números) para testes e para o modo de teste. */
export function buildXlsx(sheets: { name: string; rows: Cell[][] }[]): Uint8Array {
  const shared: string[] = [];
  const sid = (s: string) => { let i = shared.indexOf(s); if (i < 0) { i = shared.length; shared.push(s); } return i; };
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0"?><workbook xmlns="x" xmlns:r="r"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0"?><Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="t" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
  };
  sheets.forEach((s, i) => {
    const rows = s.rows.map((r, ri) => {
      const cells = r.map((v, ci) => {
        if (v === null || v === '') return '';
        const ref = `${colName(ci)}${ri + 1}`;
        return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${sid(v)}</v></c>`;
      }).join('');
      return cells ? `<row r="${ri + 1}">${cells}</row>` : '';
    }).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`);
  });
  files['xl/sharedStrings.xml'] = strToU8(`<?xml version="1.0"?><sst>${shared.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')}</sst>`);
  return zipSync(files);
}

/** Aproxima o modelo do Kahoot: instruções no topo, cabeçalho, depois uma linha por pergunta. */
export const kahootTemplateRows = (data: Cell[][]): Cell[][] => [
  ['Add questions, answers and time limit'],
  ['Remember: questions have a limit of 95 characters'],
  [],
  [],
  ['', 'Question - max 95 characters', 'Answer 1 - max 60 characters', 'Answer 2 - max 60 characters', 'Answer 3 - max 60 characters', 'Answer 4 - max 60 characters', 'Time limit (sec) – 5, 10, 20, 30, 60, 90, 120, or 240 secs', 'Correct answer(s) – choose at least one'],
  ...data,
];

/** Exemplo com erros e avisos, para testar a pré-visualização. */
export const sampleRows = (): Cell[][] => kahootTemplateRows([
  [1, 'Quem escreveu "Os Lusíadas"?', 'Luís de Camões', 'Fernando Pessoa', 'Eça de Queirós', 'Camilo Castelo Branco', 20, 1],
  [2, 'Os Lusíadas são um poema épico.', 'Verdadeiro', 'Falso', null, null, 10, 1],
  [3, 'Que figuras de estilo há em "Mar português, <b>quanto</b> do teu sal"?', 'Metáfora', 'Apóstrofe', 'Hipérbole', null, 120, '1,2'],
  [4, 'Qual destes é um heterónimo de Pessoa?', 'Álvaro de Campos', 'Ricardo Reis', 'Alberto Caeiro', 'Bernardo Soares', 240, 3],
  [5, 'Só uma resposta?', 'Única', null, null, null, 20, 1],
  [6, 'Sem resposta certa', 'A', 'B', null, null, 20, null],
  [7, 'Vírgulas, “aspas curvas” e acentos: ação, coração', 'Sim, claro', 'Não', null, null, 20, 1],
]);
