import { describe, expect, it } from 'vitest';
import { fitAvatars } from './avatarRow';

describe('fitAvatars', () => {
  it('sem jogadores não ocupa nada', () => {
    expect(fitAvatars(0, 700, 24).size).toBe(0);
  });
  it('poucos jogadores: uma linha, tamanho limitado ao máximo e à altura', () => {
    const f = fitAvatars(5, 700, 24);
    expect(f.rows).toBe(1);
    expect(f.size).toBe(24);
  });
  it('28 jogadores cabem numa linha a 770−100 px com ≥ 20 px', () => {
    const f = fitAvatars(28, 670, 24);
    expect(f.rows).toBe(1);
    expect(f.size).toBeGreaterThanOrEqual(20);
    expect(f.cols * f.size + 3 * (f.cols - 1)).toBeLessThanOrEqual(670);
  });
  it('60 jogadores: duas linhas equilibradas que cabem na caixa', () => {
    const f = fitAvatars(60, 670, 28);
    expect(f.rows).toBe(2);
    expect(f.cols).toBe(30);
    expect(f.size).toBeGreaterThanOrEqual(10);
    expect(f.cols * f.size + 3 * (f.cols - 1)).toBeLessThanOrEqual(670);
    expect(f.rows * f.size + 3 * (f.rows - 1)).toBeLessThanOrEqual(28);
  });
  it('não diminui com mais jogadores', () => {
    let prev = Infinity;
    for (let n = 1; n <= 60; n++) {
      const s = fitAvatars(n, 670, 28).size;
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });
});
