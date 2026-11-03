/**
 * Alcunhas recusadas (português de Portugal + os mais comuns em inglês).
 *
 * Escreve em minúsculas, com ou sem acentos: a lista é normalizada (acentos, repetições de letras)
 * antes de ser usada, no código (`src/lib/nickname.ts`) e na base de dados.
 * Depois de mexer aqui, corre `npm run gen:blocklist` e aplica o SQL que sai na base de dados
 * (ou acrescenta/retira linhas diretamente na tabela "grandePremioPortugues".nickname_blocklist).
 *
 * - WORDS: palavra inteira (com ou sem "s" final). Evita falsos positivos: "cu" não apanha "Cunha".
 * - CONTAINS: aparece em qualquer parte da alcunha. Só para raízes longas e inequívocas.
 */
export const BLOCK_WORDS: string[] = [
  // palavrões e insultos (PT)
  'puta', 'putas', 'putinha', 'puteiro', 'putedo', 'fdp', 'vsf', 'pqp', 'crlh',
  'foda', 'fodasse', 'fodido', 'fodida', 'foder', 'fodeste', 'fodes', 'fodi',
  'cona', 'conas', 'cu', 'cus', 'cuzao', 'pila', 'pilas', 'piroca', 'caralho', 'caralhos',
  'merda', 'merdas', 'merdoso', 'bosta', 'cagalhao', 'cagar', 'cagoes',
  'cabrao', 'cabroes', 'corno', 'cornudo', 'cornos', 'badalhoca', 'vadia', 'vagabunda', 'vagabundo',
  'prostituta', 'punheta', 'punheteiro', 'paneleiro', 'paneleiros', 'maricas', 'maricon', 'bicha',
  'idiota', 'imbecil', 'estupido', 'estupida', 'cretino', 'cretina', 'palerma', 'mongo', 'mongoloide', 'retardado', 'deficiente',
  'rabo', 'tetas', 'penis', 'vagina', 'anal', 'anus', 'sexo', 'sexy', 'porno', 'porn',
  'nazi', 'nazis', 'hitler',
  // inglês
  'fuck', 'fucker', 'fucking', 'fck', 'shit', 'shitty', 'bitch', 'bastard', 'asshole', 'dick', 'cock', 'pussy', 'cunt',
  'whore', 'slut', 'fag', 'faggot', 'retard', 'nigger', 'nigga', 'rape', 'rapist', 'sex', 'penis',
];

export const BLOCK_CONTAINS: string[] = [
  'caralh', 'karalh', 'filhodaputa', 'filhadaputa', 'filhodputa', 'tomanocu', 'tomarnocu', 'vaitomar', 'fodase', 'foda-se',
  'punhet', 'paneleir', 'merda', 'putaria', 'nigger',
];
