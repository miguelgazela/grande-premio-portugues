export interface RaceConfig {
  laps: number;
  questionsPerLap: number;
  /** Seconds students have to answer. */
  questionTime: number;
  /** Seconds per question spent showing the prompt and revealing the result. */
  overheadTime: number;

  /** Speed factor at 0% and 100% accuracy (linear in between). */
  minFactor: number;
  maxFactor: number;

  turboThreshold: number;
  turboMult: number;
  slowThreshold: number;
  spinThreshold: number;
  /** Seconds the car stops when it spins. */
  spinDuration: number;
  spinPenaltyMult: number;

  /** Max extra speed (fraction) for answering fast. */
  speedBonusMax: number;
  /** Consecutive turbos that trigger nitro. */
  nitroStreak: number;
  nitroMult: number;
  /** Final-lap effects are amplified by this multiplier. */
  finalLapMult: number;

  /** Bot catch-up strength per lap of gap to the class car. */
  rubberBand: number;
  rubberBandCap: number;

  /** Accuracy at which the class car finishes right as the last question ends. */
  calibrationAccuracy: number;
}

export const DEFAULT_CONFIG: RaceConfig = {
  laps: 3,
  questionsPerLap: 6,
  questionTime: 20,
  overheadTime: 5,
  minFactor: 0.6,
  maxFactor: 1.4,
  turboThreshold: 0.8,
  turboMult: 1.12,
  slowThreshold: 0.5,
  spinThreshold: 0.25,
  spinDuration: 1.5,
  spinPenaltyMult: 0.9,
  speedBonusMax: 0.1,
  nitroStreak: 3,
  nitroMult: 1.25,
  finalLapMult: 2,
  rubberBand: 2,
  rubberBandCap: 0.25,
  calibrationAccuracy: 0.7,
};

export const totalQuestions = (c: RaceConfig) => c.laps * c.questionsPerLap;
export const cycleTime = (c: RaceConfig) => c.questionTime + c.overheadTime;
