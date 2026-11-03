const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Texto simples: sem HTML, sem controlos, espaços repetidos juntos. Nunca é interpretado como HTML. */
export function cleanText(raw: unknown): string {
  let s = String(raw ?? '');
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<\/?[a-zA-Z][^<>]*>/g, '');
  s = s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‍﻿]/g, '').replace(/[\s ]+/g, ' ');
  return s.trim();
}

export const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Corta em `max` caracteres; devolve o texto e se cortou. */
export function clip(s: string, max: number): { text: string; clipped: boolean } {
  const chars = Array.from(s);
  return chars.length <= max ? { text: s, clipped: false } : { text: chars.slice(0, max - 1).join('').trimEnd() + '…', clipped: true };
}
