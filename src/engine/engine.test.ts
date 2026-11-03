import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { Track, DEFAULT_TRACK_POINTS } from './track';
import { Race, type Driver } from './race';
import { makeGhost } from './drivers';
import { outcomeFromAnswers } from './outcome';
import { pickAwards, scoreRace } from './scoring';
import { DEFAULT_SIM, buildRace, runBatch } from './batch';

const track = new Track(DEFAULT_TRACK_POINTS);
const fixed = (id: string, accuracy: number, kind: Driver['kind'] = 'bot'): Driver => ({
  id,
  name: id,
  kind,
  color: 0,
  outcome: () => ({ accuracy, speedBonus: 0 }),
});

describe('Track', () => {
  it('is closed and continuous', () => {
    const a = track.poseAt(0);
    const b = track.poseAt(track.length);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
    expect(track.length).toBeGreaterThan(1000);
  });
});

describe('Race', () => {
  it('finishes and ranks better accuracy first', () => {
    const race = new Race([fixed('team', 0.6, 'team'), fixed('fast', 0.9), fixed('slow', 0.3)], track.length, { ...DEFAULT_CONFIG, rubberBand: 0 });
    race.runToEnd();
    expect(race.finished).toBe(true);
    expect(race.standings().map((c) => c.driver.id)).toEqual(['fast', 'team', 'slow']);
    expect(race.events).toHaveLength(18);
  });

  it('calibration: a 70% class finishes about when the last question ends', () => {
    const race = new Race([fixed('team', 0.7, 'team')], track.length, DEFAULT_CONFIG);
    race.runToEnd(0.05);
    const end = race.questionCount * race.cycle;
    expect(Math.abs(race.team!.finishTime! - end) / end).toBeLessThan(0.08);
  });

  it('spins stop the car and nitro fires after 3 turbos', () => {
    const seq = [1, 1, 1, 0.1];
    const d: Driver = { ...fixed('team', 0, 'team'), outcome: (q) => ({ accuracy: seq[q] ?? 0.5, speedBonus: 0 }) };
    const race = new Race([d], track.length, DEFAULT_CONFIG);
    const nitro: boolean[] = [];
    while (race.events.length < 4) {
      race.step(0.1);
      if (race.events.length && nitro.length < race.events.length) nitro.push(race.events.at(-1)!.results[0].nitro);
    }
    expect(nitro).toEqual([false, false, true, false]);
    expect(race.events[3].results[0].effect).toBe('spin');
    expect(race.cars[0].spinLeft).toBeGreaterThan(0);
  });

  it('ghost replay is deterministic', () => {
    const rec = Array.from({ length: 18 }, (_, i) => ({ accuracy: (i % 5) / 5, speedBonus: 0.5 }));
    const run = () => {
      const r = new Race([fixed('team', 0.6, 'team'), makeGhost('g', '9ºB', rec)], track.length, DEFAULT_CONFIG);
      r.runToEnd();
      return r.cars[1].finishTime;
    };
    expect(run()).toBe(run());
  });
});

describe('outcome & scoring', () => {
  it('no answer counts as wrong; fast answers earn bonus', () => {
    const o = outcomeFromAnswers(
      [
        { playerId: 'a', answered: true, correct: true, timeFrac: 0.1 },
        { playerId: 'b', answered: false, correct: false, timeFrac: 1 },
      ],
      2,
    );
    expect(o.accuracy).toBe(0.5);
    expect(o.speedBonus).toBe(1);
  });

  it('hero bonus when class is below 50%', () => {
    const scores = scoreRace(['a', 'b'], [
      { teamAccuracy: 0.3, answers: [{ playerId: 'a', answered: true, correct: true, timeFrac: 0 }, { playerId: 'b', answered: true, correct: false, timeFrac: 0.5 }] },
    ]);
    expect(scores[0]).toMatchObject({ playerId: 'a', points: 200, heroCount: 1 });
    expect(pickAwards(scores).find((a) => a.key === 'hero')?.playerId).toBe('a');
  });

  it('simulated race produces scores for every student', () => {
    const { race, students, answersByQ } = buildRace(DEFAULT_CONFIG, DEFAULT_SIM, track.length, 42);
    race.runToEnd();
    const scores = scoreRace(students.map((s) => s.id), race.events.map((e) => ({ answers: answersByQ[e.q], teamAccuracy: e.results[0].accuracy })));
    expect(scores).toHaveLength(DEFAULT_SIM.classSize);
  });
});

describe('balance (Phase 0 targets)', () => {
  const pos = (mean: number) => runBatch(DEFAULT_CONFIG, { ...DEFAULT_SIM, classMean: mean }, track.length, 150);
  it('average class mostly finishes 2nd–4th', () => {
    const s = pos(0.65);
    expect(s.positionShare[1] + s.positionShare[2] + s.positionShare[3]).toBeGreaterThan(0.6);
  });
  it('weak class is not always last', () => {
    expect(pos(0.35).positionShare[6]).toBeLessThan(0.8);
  });
  it('excellent class usually wins', () => {
    expect(pos(0.92).positionShare[0]).toBeGreaterThan(0.5);
  });
});
