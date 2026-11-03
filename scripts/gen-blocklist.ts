import { BLOCK_CONTAINS, BLOCK_WORDS } from '../src/data/nicknameBlocklist';
import { normalizeWord } from '../src/lib/nickname';

// Imprime o SQL que carrega src/data/nicknameBlocklist.ts na tabela "grandePremioPortugues".nickname_blocklist.
// Usa-se na migration da Fase 7 e, mais tarde, para atualizar a lista: copiar o resultado para o SQL Editor.
const rows = [
  ...new Set(BLOCK_WORDS.map(normalizeWord)),
].map((w) => `('${w}', 'w')`).concat([...new Set(BLOCK_CONTAINS.map(normalizeWord))].map((w) => `('${w}', 'c')`));
console.log(`insert into "grandePremioPortugues".nickname_blocklist (word, kind) values\n  ${rows.join(',\n  ')}\non conflict do nothing;`);
