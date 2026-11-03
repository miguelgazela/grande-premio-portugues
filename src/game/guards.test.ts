import { describe, expect, it } from 'vitest';
import { RateLimiter, answerSizeOk, isId, senderOf } from './guards';

describe('senderOf', () => {
  it('aceita eventos de aluno bem formados', () => {
    expect(senderOf({ event: 'answer', payload: { player_id: 'abc-123', question_id: 'q', value: 1 } })).toBe('abc-123');
    expect(senderOf({ event: 'hello', payload: { player_id: 'p1' } })).toBe('p1');
  });
  it.each([
    null, undefined, 'x', 3, [], {}, { event: 'answer' }, { event: 'answer', payload: null }, { event: 'answer', payload: [] },
    { event: 'answer', payload: { player_id: 5 } }, { event: 'answer', payload: { player_id: '' } },
    { event: 'answer', payload: { player_id: 'x'.repeat(65) } }, { event: 'answer', payload: { player_id: 'a b' } },
    { event: 'lobby', payload: { player_id: 'p1' } }, { event: 'kicked', payload: { player_id: 'p1' } },
  ])('recusa %j', (m) => expect(senderOf(m)).toBeNull());
});

describe('isId / answerSizeOk', () => {
  it('ids', () => {
    expect(isId('0b9d3c1e-1111-4222-8333-444455556666')).toBe(true);
    expect(isId('<script>')).toBe(false);
    expect(isId(12)).toBe(false);
  });
  it('tamanho do valor', () => {
    expect(answerSizeOk([0, 2, 1])).toBe(true);
    expect(answerSizeOk('x'.repeat(2000))).toBe(false);
    expect(answerSizeOk(Array.from({ length: 5000 }, (_, i) => i))).toBe(false);
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(answerSizeOk(cyc)).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('deixa passar a rajada pequena e corta o excesso', () => {
    const r = new RateLimiter(5, 1);
    const ok = Array.from({ length: 8 }, () => r.allow('a', 0));
    expect(ok.filter(Boolean)).toHaveLength(5);
  });
  it('recupera com o tempo e é por aluno', () => {
    const r = new RateLimiter(2, 2);
    expect([r.allow('a', 0), r.allow('a', 0), r.allow('a', 0)]).toEqual([true, true, false]);
    expect(r.allow('b', 0)).toBe(true);
    expect(r.allow('a', 1000)).toBe(true); // 2 fichas por segundo
  });
  it('não cresce sem limite', () => {
    const r = new RateLimiter(1, 1, 3);
    for (let i = 0; i < 10; i++) r.allow(`k${i}`, 0);
    expect(r.allow('k0', 0)).toBe(true); // foi esquecido, volta a ter balde cheio
  });
});
