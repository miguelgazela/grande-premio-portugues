import { mulberry32 } from './rng';
import { Race } from './race';
import { BOT_FIELDS, makeBot, makeClass, makeTeamDriver, type SimClassOptions } from './drivers';
import type { RaceConfig } from './config';

export interface SimOptions extends SimClassOptions {
  classSize: number;
  classMean: number;
  classSpread: number;
  botSkills: number[];
}

export const DEFAULT_SIM: SimOptions = {
  classSize: 25,
  classMean: 0.65,
  classSpread: 0.15,
  participation: 0.95,
  difficultySpread: 0.2,
  botSkills: [...BOT_FIELDS.medio],
};

export function buildRace(config: RaceConfig, sim: SimOptions, lapLength: number, seed: number) {
  const rng = mulberry32(seed);
  const students = makeClass(rng, sim.classSize, sim.classMean, sim.classSpread);
  const team = makeTeamDriver(rng, students, sim);
  const bots = sim.botSkills.map((skill, i) => makeBot(rng, i, skill));
  const race = new Race([team.driver, ...bots], lapLength, config);
  return { race, students, answersByQ: team.answersByQ };
}

export interface BatchStats {
  races: number;
  /** positionShare[i] = share of races the class finished in position i+1. */
  positionShare: number[];
  avgPosition: number;
  avgAccuracy: number;
  /** Share of races where the class finished within 2s of the car ahead or behind. */
  closeFinish: number;
  avgOvertakes: number;
  avgPositionsLost: number;
}

export function runBatch(config: RaceConfig, sim: SimOptions, lapLength: number, races: number, seed = 1): BatchStats {
  const cars = sim.botSkills.length + 1;
  const counts = new Array(cars).fill(0);
  let posSum = 0;
  let accSum = 0;
  let close = 0;
  let overtakes = 0;
  let lost = 0;

  for (let r = 0; r < races; r++) {
    const { race } = buildRace(config, sim, lapLength, seed + r * 7919);
    race.runToEnd(0.25);
    race.finalizeEvents();
    const team = race.team!;
    const standings = race.standings();
    const pos = standings.indexOf(team);
    counts[pos]++;
    posSum += pos + 1;
    accSum += race.events.reduce((s, e) => s + e.results[0].accuracy, 0) / race.events.length;
    const t = team.finishTime!;
    const neighbours = [standings[pos - 1], standings[pos + 1]].filter(Boolean);
    if (neighbours.some((n) => Math.abs(n.finishTime! - t) < 2)) close++;
    for (const e of race.events) {
      const d = e.teamRankBefore - e.teamRankAfter;
      if (d > 0) overtakes += d;
      else lost -= d;
    }
  }

  return {
    races,
    positionShare: counts.map((c) => c / races),
    avgPosition: posSum / races,
    avgAccuracy: accSum / races,
    closeFinish: close / races,
    avgOvertakes: overtakes / races,
    avgPositionsLost: lost / races,
  };
}
