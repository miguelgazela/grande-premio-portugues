import { BLOCK_CONTAINS, BLOCK_WORDS } from '../data/nicknameBlocklist';

/**
 * Filtro de alcunhas. A base de dados repete esta lógica em `gpp_nickname_blocked` (migration da Fase 7):
 * se mudares um, muda o outro.
 */

export const NICK_MAX = 20;

const LEET: Record<string, string> = { '4': 'a', '3': 'e', '0': 'o', '1': 'i', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

/** Remove caracteres de controlo e invisíveis, junta espaços repetidos e apara. */
export function cleanNickname(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** "puuuta" → "puta". */
const collapse = (s: string) => s.replace(/(.)\1+/g, '$1');

/** Normaliza uma palavra da lista (minúsculas, sem acentos, sem repetições, só letras). */
export const normalizeWord = (w: string) => collapse(stripAccents(w).replace(/[^a-z]/g, ''));

const WORDS = new Set(BLOCK_WORDS.map(normalizeWord));
const CONTAINS = [...new Set(BLOCK_CONTAINS.map(normalizeWord))];

function matches(text: string, words: Set<string>, contains: string[]): boolean {
  const tokens = text.split(/[^a-z]+/).filter(Boolean).map(collapse);
  const hit = (t: string) => words.has(t) || (t.length > 3 && t.endsWith('s') && words.has(t.slice(0, -1)));
  if (tokens.some(hit)) return true;
  // p.u.t.a / p u t a: duas ou mais letras soltas seguidas juntam-se numa palavra.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].length !== 1) continue;
    let j = i;
    while (j < tokens.length && tokens[j].length === 1) j++;
    if (j - i >= 2 && hit(tokens.slice(i, j).join(''))) return true;
    i = j;
  }
  const joined = tokens.join('');
  return contains.some((c) => joined.includes(c));
}

/** A alcunha tem uma palavra recusada? (Duas leituras: "leet" 4→a, e sem os dígitos.) */
export function isBlocked(nick: string, words = WORDS, contains = CONTAINS): boolean {
  const base = stripAccents(nick);
  const symbols = base.replace(/[@$!|+]/g, (c) => LEET[c]);
  const leet = symbols.replace(/[0-9]/g, (c) => LEET[c] ?? ' ');
  const noDigits = symbols.replace(/[0-9]/g, '');
  return matches(leet, words, contains) || matches(noDigits, words, contains);
}

export type NickCheck = { ok: true; nick: string } | { ok: false; error: string };

export const NICK_INVALID = 'Alcunha inválida';
export const NICK_REFUSED = 'Escolhe outra alcunha';

export function checkNickname(raw: string): NickCheck {
  const nick = cleanNickname(raw);
  if (nick.length < 1 || nick.length > NICK_MAX) return { ok: false, error: NICK_INVALID };
  if (isBlocked(nick)) return { ok: false, error: NICK_REFUSED };
  return { ok: true, nick };
}
