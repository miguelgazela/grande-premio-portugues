import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { Track, Road, roadSeed, DEFAULT_TRACK_POINTS, TRACKS, ROAD_W, CURB_W, type Vec } from './track';
import { Race, raceLengthFor, type Driver } from './race';
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
    const race = new Race([fixed('team', 0.6, 'team'), fixed('fast', 0.9), fixed('slow', 0.3)], { ...DEFAULT_CONFIG, rubberBand: 0 });
    race.runToEnd();
    expect(race.finished).toBe(true);
    expect(race.standings().map((c) => c.driver.id)).toEqual(['fast', 'team', 'slow']);
    expect(race.events).toHaveLength(18);
  });

  it('nobody finishes before the last question ends, whatever the accuracy', () => {
    for (const acc of [0.1, 0.5, 0.8, 1]) {
      const race = new Race([fixed('team', acc, 'team')], DEFAULT_CONFIG);
      race.runToEnd(0.05);
      expect(race.team!.finishTime!).toBeGreaterThanOrEqual(race.questionCount * race.cycle);
    }
  });

  it('a perfect class finishes right after the last question, a weak one later but within a minute or two', () => {
    const end = (acc: number) => {
      const race = new Race([fixed('team', acc, 'team')], DEFAULT_CONFIG);
      race.runToEnd(0.05);
      return race.team!.finishTime! - race.questionCount * race.cycle;
    };
    expect(end(1)).toBeLessThan(10);
    expect(end(0.65)).toBeLessThan(40);
    expect(end(0.2)).toBeLessThan(100);
    expect(end(0.2)).toBeGreaterThan(end(1));
  });

  it('cruise speed is constant while students think', () => {
    const race = new Race([fixed('team', 1, 'team')], DEFAULT_CONFIG);
    race.time = race.cycle * 3 + DEFAULT_CONFIG.overheadTime + 1;
    race.nextQuestion = 3;
    const d0 = race.team!.distance;
    race.step(2);
    expect((race.team!.distance - d0) / 2).toBeCloseTo(DEFAULT_CONFIG.cruiseSpeed, 6);
  });

  it('spins stop the car and nitro fires after 3 turbos', () => {
    const seq = [1, 1, 1, 0.1];
    const d: Driver = { ...fixed('team', 0, 'team'), outcome: (q) => ({ accuracy: seq[q] ?? 0.5, speedBonus: 0 }) };
    const race = new Race([d], DEFAULT_CONFIG);
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
      const r = new Race([fixed('team', 0.6, 'team'), makeGhost('g', '9ºB', rec)], DEFAULT_CONFIG);
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
    const { race, students, answersByQ } = buildRace(DEFAULT_CONFIG, DEFAULT_SIM, 42);
    race.runToEnd();
    const scores = scoreRace(students.map((s) => s.id), race.events.map((e) => ({ answers: answersByQ[e.q], teamAccuracy: e.results[0].accuracy })));
    expect(scores).toHaveLength(DEFAULT_SIM.classSize);
  });
});

describe('balance (Phase 0 targets)', () => {
  const pos = (mean: number) => runBatch(DEFAULT_CONFIG, { ...DEFAULT_SIM, classMean: mean }, 150);
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

describe.each(TRACKS)('Track geometry: $name', ({ points, samples }) => {
  const track = new Track(points, samples);
  const half = ROAD_W / 2 + CURB_W;
  const edge = (side: number) =>
    track.points.slice(0, -1).map((_, i) => {
      const p = track.poseAt(track.cum[i]);
      return { x: p.x + p.nx * half * side, y: p.y + p.ny * half * side };
    });
  const cross = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const intersects = (a: Vec, b: Vec, c: Vec, d: Vec) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

  it('road + curb edges never self-intersect', () => {
    for (const side of [-1, 1]) {
      const e = edge(side);
      const n = e.length;
      let hits = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue;
          if (intersects(e[i], e[(i + 1) % n], e[j], e[(j + 1) % n])) hits++;
        }
      }
      expect(hits).toBe(0);
    }
  });

  it('distant stretches of track keep clear of each other', () => {
    const pts = track.points.slice(0, -1);
    let min = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const arc = Math.min(track.cum[j] - track.cum[i], track.length - (track.cum[j] - track.cum[i]));
        if (arc < 300) continue;
        min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      }
    }
    expect(min).toBeGreaterThan(2 * half + 40);
  });
});

describe('Road (pista aberta gerada)', () => {
  const need = raceLengthFor(DEFAULT_CONFIG);
  const half = ROAD_W / 2 + CURB_W;

  it('is deterministic per seed and long enough for the race', () => {
    const a = new Road(roadSeed('sessao-1'), need);
    const b = new Road(roadSeed('sessao-1'), need);
    const c = new Road(roadSeed('sessao-2'), need);
    expect(a.length).toBeGreaterThanOrEqual(need);
    expect(a.points).toEqual(b.points);
    expect(a.points).not.toEqual(c.points);
  });

  it('never doubles back: distant stretches keep clear of each other and curves are gentle', () => {
    for (const seed of [1, 2, 3, 99]) {
      const r = new Road(seed, need);
      const pts = r.points;
      let min = Infinity;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          if (pts[j].x - pts[i].x > 600) break; // avança sempre em x: o resto está mais longe
          if (r.cum[j] - r.cum[i] < 300) continue;
          min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
        }
      }
      expect(min).toBeGreaterThan(2 * half + 40);
      // Raio de curvatura mínimo aproximado, a partir de 3 pontos a ~100 de distância.
      let worst = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const a = r.indexAt(r.cum[i] - 100);
        const b = r.indexAt(r.cum[i] + 100);
        if (a === i || b === i || r.cum[b] - r.cum[i] < 90) continue;
        const [p, q, s] = [pts[a], pts[i], pts[b]];
        const area = Math.abs((q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x)) / 2;
        const radius = (Math.hypot(q.x - p.x, q.y - p.y) * Math.hypot(s.x - q.x, s.y - q.y) * Math.hypot(s.x - p.x, s.y - p.y)) / (4 * area || 1e-9);
        worst = Math.min(worst, radius);
      }
      expect(worst).toBeGreaterThan(half + 30);
    }
  });
});
