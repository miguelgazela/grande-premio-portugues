/** Tamanho e linhas da fila de avatares do anfitrião (lógica pura, com testes). */

export interface AvatarFit {
  size: number;
  rows: number;
  cols: number;
}

/**
 * Escolhe 1 ou 2 linhas (equilibradas) para `n` avatares numa caixa `w`×`h` px,
 * com folga `gap`, de modo a maximizar o tamanho. Tamanho máximo `maxSize`.
 */
export function fitAvatars(n: number, w: number, h: number, gap = 3, maxSize = 40): AvatarFit {
  if (n <= 0 || w <= 0 || h <= 0) return { size: 0, rows: 1, cols: 0 };
  let best: AvatarFit = { size: 0, rows: 1, cols: n };
  for (const rows of [1, 2]) {
    const cols = Math.ceil(n / rows);
    const size = Math.floor(Math.min(maxSize, (w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows));
    if (size > best.size) best = { size: Math.max(size, 0), rows, cols };
  }
  return best;
}
