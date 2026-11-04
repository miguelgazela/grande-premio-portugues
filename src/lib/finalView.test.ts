import { describe, expect, it } from 'vitest';
import { listDensity, recordNotes, resultHeadline, splitStandings } from './finalView';
import type { FinalStanding } from './protocol';

const car = (name: string, kind: FinalStanding['kind'] = 'bot', timeMs = 0): FinalStanding => ({ name, kind, color: 0, timeMs });

describe('resultHeadline', () => {
  it('vitória', () => {
    expect(resultHeadline(1, 7)).toMatchObject({ title: 'Vitória da turma!', tone: 'win' });
  });
  it('2.º e 3.º são pódio', () => {
    expect(resultHeadline(2, 7)).toMatchObject({ title: 'A turma acabou em 2º lugar', tone: 'podium' });
    expect(resultHeadline(3, 7).tone).toBe('podium');
  });
  it('4.º ou pior', () => {
    const h = resultHeadline(5, 7);
    expect(h.tone).toBe('other');
    expect(h.title).toBe('A turma acabou em 5º lugar');
    expect(h.sub).toContain('4 carros');
  });
  it('sozinha na pista', () => {
    expect(resultHeadline(1, 1).sub).toBe('Primeiros na pista');
  });
});

describe('splitStandings', () => {
  it('ordena os degraus 2.º, 1.º, 3.º e deixa o resto em lista', () => {
    const s = ['a', 'b', 'c', 'd', 'e'].map((n) => car(n));
    const { podium, rest } = splitStandings(s);
    expect(podium.map((p) => p.car.name)).toEqual(['b', 'a', 'c']);
    expect(podium.map((p) => p.index)).toEqual([1, 0, 2]);
    expect(rest.map((r) => [r.index, r.car.name])).toEqual([[3, 'd'], [4, 'e']]);
  });
  it('2 carros: 2.º à esquerda, 1.º à direita', () => {
    const { podium, rest } = splitStandings([car('a'), car('b')]);
    expect(podium.map((p) => p.car.name)).toEqual(['b', 'a']);
    expect(rest).toEqual([]);
  });
  it('1 carro e 0 carros', () => {
    expect(splitStandings([car('a')]).podium).toHaveLength(1);
    expect(splitStandings([]).podium).toEqual([]);
  });
  it('30+ carros: o resto mantém as posições reais', () => {
    const s = Array.from({ length: 34 }, (_, i) => car(`c${i}`));
    const { rest } = splitStandings(s);
    expect(rest).toHaveLength(31);
    expect(rest[30].index).toBe(33);
  });
});

describe('listDensity', () => {
  it('desce com o nº de linhas', () => {
    expect(listDensity(0)).toBe('roomy');
    expect(listDensity(6)).toBe('roomy');
    expect(listDensity(7)).toBe('compact');
    expect(listDensity(15)).toBe('tight');
  });
});

describe('recordNotes', () => {
  const standings = [car('Turma', 'team', 400_000)];
  it('sem fantasma nem recorde: nada', () => {
    expect(recordNotes({ standings })).toEqual([]);
  });
  it('novo recorde', () => {
    const n = recordNotes({ standings, record: { holder: 'Fantasma', bestMs: 396_000, newRecord: true, gapMs: -4000 } });
    expect(n).toHaveLength(1);
    expect(n[0].kind).toBe('record');
    expect(n[0].text).toContain('6:36');
  });
  it('quase: mostra a diferença', () => {
    const n = recordNotes({ standings, record: { holder: 'Fantasma', bestMs: 396_000, newRecord: false, gapMs: 200 } });
    expect(n[0]).toEqual({ kind: 'info', text: 'Recorde da pista: 6:36 (Fantasma) · faltaram 0,2 s' });
  });
  it('primeiro tempo da pista', () => {
    const n = recordNotes({ standings, record: { holder: null, bestMs: null, newRecord: false, gapMs: 0 } });
    expect(n[0].text).toBe('Primeiro tempo desta corrida: 6:40');
  });
  it('fantasma batido ou não', () => {
    expect(recordNotes({ standings, ghost: { name: 'X', diffMs: 3000 } })[0].kind).toBe('ghost-win');
    expect(recordNotes({ standings, ghost: { name: 'X', diffMs: -3000 } })[0].kind).toBe('ghost-loss');
  });
});
