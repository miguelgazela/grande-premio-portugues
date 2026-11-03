import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, totalQuestions, type RaceConfig } from '../engine/config';
import { BOT_FIELDS, makeBot, makeGhost } from '../engine/drivers';
import type { QuestionOutcome } from '../engine/outcome';
import { Race, type Driver } from '../engine/race';
import { mulberry32 } from '../engine/rng';
import { TRACKS } from '../engine/track';
import { bestPerClass, compatibleRecords, ghostMessage, makeTimeline, parseTimeline, sameTrackAs, trackRecord, type GhostRecord } from './ghosts';

const config: RaceConfig = { ...DEFAULT_CONFIG, laps: 2, questionsPerLap: 4 };
const outcomes = (seed: number, n: number): QuestionOutcome[] => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => ({ accuracy: r(), speedBonus: r() }));
};

/** Como o HostGame: pré-rolo de `overheadTime` antes da primeira pergunta. */
const run = (drivers: Driver[]) => {
  const race = new Race(drivers, config);
  race.time = config.overheadTime;
  race.runToEnd(0.25);
  return race;
};

describe('replay de fantasma', () => {
  it('tem o mesmo tempo que a corrida original, mesmo com outros bots', () => {
    const rec = outcomes(7, totalQuestions(config));
    const team: Driver = { id: 'team', name: 'Turma', kind: 'team', color: 1, outcome: (q) => rec[q] };
    const bots = (seed: number) => BOT_FIELDS.medio.map((s, i) => makeBot(mulberry32(seed), i, s));
    const original = run([team, ...bots(1)]);
    const replay = run([{ ...team, id: 'me', outcome: () => ({ accuracy: 0.3, speedBonus: 0 }) }, makeGhost('g', '9ºB', rec), ...bots(2)]);
    const ghost = replay.cars.find((c) => c.driver.kind === 'ghost')!;
    expect(ghost.finishTime).toBeCloseTo(original.team!.finishTime!, 6);
  });
});

describe('timeline', () => {
  it('lê o formato antigo (lista)', () => {
    const t = parseTimeline([{ accuracy: 0.5, speedBonus: 0.2 }]);
    expect(t).toEqual({ outcomes: [{ accuracy: 0.5, speedBonus: 0.2 }], trackId: null, config: null });
  });
  it('lê o formato novo e faz round-trip', () => {
    const o = outcomes(3, 8);
    const t = parseTimeline(JSON.parse(JSON.stringify(makeTimeline('losango', config, o))));
    expect(t.trackId).toBe('losango');
    expect(t.config).toEqual({ laps: 2, questionsPerLap: 4, questionTime: config.questionTime });
    expect(t.outcomes).toEqual(o);
  });
  it('lixo não rebenta', () => {
    expect(parseTimeline(null).outcomes).toEqual([]);
    expect(parseTimeline({ v: 2, config: { laps: 0 } }).config).toBeNull();
  });
});

const rec = (id: string, over: Partial<GhostRecord> = {}): GhostRecord => ({
  session_id: id, class_id: 'A', class_name: '9ºA', created_at: `2026-11-0${id}`, final_position: 2, finish_time_ms: 200_000,
  trackId: TRACKS[0].id, config: { laps: 2, questionsPerLap: 4, questionTime: 20 }, outcomes: outcomes(1, 8), ...over,
});

describe('seleção de compatíveis', () => {
  const shape = { laps: 2, questionsPerLap: 4, questionTime: 20 };
  const all = [
    rec('1'),
    rec('2', { class_id: 'B', class_name: '9ºB', finish_time_ms: 180_000, trackId: TRACKS[1].id }),
    rec('3', { finish_time_ms: 190_000 }),
    rec('4', { config: { ...shape, questionTime: 30 } }),
    rec('5', { outcomes: outcomes(1, 3) }),
    rec('6', { trackId: 'inexistente' }),
  ];
  it('só mesma configuração, perguntas a bater certo e pista conhecida', () => {
    expect(compatibleRecords(all, shape).map((g) => g.session_id)).toEqual(['3', '2', '1']);
  });
  it('melhor de cada turma', () => {
    expect([...bestPerClass(compatibleRecords(all, shape))].sort()).toEqual(['2', '3']);
  });
  it('mesma pista que o primeiro escolhido', () => {
    const c = compatibleRecords(all, shape);
    expect(sameTrackAs(c, [c.find((g) => g.session_id === '2')!]).map((g) => g.session_id)).toEqual(['2']);
    expect(sameTrackAs(c, []).length).toBe(3);
  });
  it('recorde = menor tempo compatível', () => {
    expect(trackRecord(all, shape)?.session_id).toBe('2');
    expect(trackRecord([], shape)).toBeNull();
  });
});

describe('mensagens', () => {
  it('ganhou e perdeu', () => {
    expect(ghostMessage({ name: '9ºB', diffMs: 2300 })).toBe('Batemos o 9ºB por 2,3 s!');
    expect(ghostMessage({ name: '9ºB', diffMs: -1100 })).toBe('O 9ºB ganhou por 1,1 s');
  });
});

describe('passos do motor', () => {
  it('um passo grande dá o mesmo que passos de 0,25 s', () => {
    const o = outcomes(11, totalQuestions(config));
    const mk = () => {
      const race = new Race([{ id: 't', name: 'T', kind: 'team', color: 1, outcome: (q) => o[q] }], config);
      race.time = config.overheadTime;
      return race;
    };
    const a = mk();
    a.runToEnd(0.25);
    const b = mk();
    while (!b.finished) b.step(5);
    expect(b.cars[0].finishTime).toBeCloseTo(a.cars[0].finishTime!, 6);
  });
});
