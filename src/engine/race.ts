import { clamp } from './rng';
import { cycleTime, totalQuestions, type RaceConfig } from './config';
import type { QuestionOutcome } from './outcome';

const MAX_STEP = 0.25;

export type DriverKind = 'team' | 'bot' | 'ghost';
export type Effect = 'turbo' | 'normal' | 'slow' | 'spin';

export interface Driver {
  id: string;
  name: string;
  kind: DriverKind;
  color: number;
  /** Chave do manifest do carro (`car-*`); sem ela usa-se o cinzento. */
  car?: string;
  /** Result of question `q`. Called once per question, in order. */
  outcome(q: number): QuestionOutcome;
}

export interface CarState {
  driver: Driver;
  distance: number;
  mult: number;
  spinLeft: number;
  turboStreak: number;
  nitroActive: boolean;
  lastEffect: Effect | null;
  finishTime: number | null;
}

export interface QuestionResult {
  driverId: string;
  accuracy: number;
  effect: Effect;
  mult: number;
  nitro: boolean;
}

export interface QuestionEvent {
  q: number;
  time: number;
  finalLap: boolean;
  results: QuestionResult[];
  /** Team rank (1-based) right before and after this question. */
  teamRankBefore: number;
  teamRankAfter: number;
}

/** Speed factor before final-lap amplification, nitro and spin handling. */
export function baseFactor(c: RaceConfig, accuracy: number): number {
  let f = c.minFactor + (c.maxFactor - c.minFactor) * accuracy;
  if (accuracy >= c.turboThreshold) f *= c.turboMult;
  return f;
}

export function effectFor(c: RaceConfig, accuracy: number): Effect {
  if (accuracy >= c.turboThreshold) return 'turbo';
  if (accuracy >= c.slowThreshold) return 'normal';
  if (accuracy >= c.spinThreshold) return 'slow';
  return 'spin';
}

/**
 * Deterministic race simulation. Time advances with `step(dt)`; at the end of
 * each question cycle every driver's outcome sets its speed for the next cycle.
 */
export class Race {
  readonly cars: CarState[];
  readonly events: QuestionEvent[] = [];
  readonly raceLength: number;
  readonly baseSpeed: number;
  readonly questionCount: number;
  readonly cycle: number;
  time = 0;
  nextQuestion = 0;

  constructor(
    drivers: Driver[],
    readonly lapLength: number,
    readonly config: RaceConfig,
  ) {
    this.questionCount = totalQuestions(config);
    this.cycle = cycleTime(config);
    this.raceLength = lapLength * config.laps;
    this.baseSpeed = this.raceLength / (this.questionCount * this.cycle * baseFactor(config, config.calibrationAccuracy));
    this.cars = drivers.map((driver) => ({
      driver,
      distance: 0,
      mult: 1,
      spinLeft: 0,
      turboStreak: 0,
      nitroActive: false,
      lastEffect: null,
      finishTime: null,
    }));
  }

  get team(): CarState | undefined {
    return this.cars.find((c) => c.driver.kind === 'team');
  }

  get finished(): boolean {
    return this.cars.every((c) => c.finishTime !== null);
  }

  /** Question currently being answered (may equal questionCount once all are done). */
  get currentQuestion(): number {
    return Math.min(this.nextQuestion, this.questionCount);
  }

  /** Segundos desde o início do ciclo da pergunta em curso (os primeiros `overheadTime` são o reveal da anterior). */
  private get cyclePhase(): number {
    return this.time - this.nextQuestion * this.cycle;
  }

  /**
   * true durante o reveal (e no sprint final): o efeito da última resposta está a atuar.
   * Enquanto os alunos pensam, todos os carros andam ao ritmo neutro.
   */
  get bursting(): boolean {
    if (this.nextQuestion >= this.questionCount) return true;
    return this.nextQuestion > 0 && this.cyclePhase < this.config.overheadTime;
  }

  /**
   * Multiplicador de velocidade instantâneo. `car.mult` é a média do ciclo; a rajada no reveal é
   * calculada para que a distância por ciclo seja a mesma de antes: cruise·questionTime + burst·overhead = mult·cycle.
   */
  private speedMult(car: CarState): number {
    const c = this.config;
    if (this.nextQuestion >= this.questionCount) return car.mult;
    if (!this.bursting) return c.cruiseMult;
    return Math.max(0.05, (car.mult * this.cycle - c.cruiseMult * c.questionTime) / c.overheadTime);
  }

  /** 0..1 progress through the current question cycle. */
  get cycleProgress(): number {
    return clamp((this.time - this.nextQuestion * this.cycle) / this.cycle, 0, 1);
  }

  /** Cars ordered by race position. */
  standings(): CarState[] {
    return [...this.cars].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.distance - a.distance;
    });
  }

  rankOf(car: CarState): number {
    return this.standings().indexOf(car) + 1;
  }

  lapOf(car: CarState): number {
    return Math.min(this.config.laps, Math.floor(car.distance / this.lapLength) + 1);
  }

  step(dt: number): void {
    // Passos grandes (avanço rápido do anfitrião) dão resultados diferentes dos do simulador:
    // parte-os, para o mesmo conjunto de respostas dar sempre o mesmo tempo (fantasmas justos).
    if (dt > MAX_STEP) {
      const n = Math.ceil(dt / MAX_STEP);
      for (let i = 0; i < n && !this.finished; i++) this.step(dt / n);
      return;
    }
    if (this.finished) return;
    this.time += dt;

    while (this.nextQuestion < this.questionCount && this.time >= (this.nextQuestion + 1) * this.cycle) {
      this.resolveQuestion(this.nextQuestion);
      this.nextQuestion++;
    }

    const team = this.team;
    for (const car of this.cars) {
      if (car.finishTime !== null) continue;
      if (car.spinLeft > 0) {
        car.spinLeft = Math.max(0, car.spinLeft - dt);
        continue;
      }
      let m = this.speedMult(car);
      if (car.driver.kind === 'bot' && team) {
        const gapLaps = (car.distance - team.distance) / this.lapLength;
        m *= 1 + clamp(-gapLaps * this.config.rubberBand, -this.config.rubberBandCap, this.config.rubberBandCap);
      }
      const speed = this.baseSpeed * m;
      car.distance += speed * dt;
      if (car.distance >= this.raceLength) {
        const overshoot = car.distance - this.raceLength;
        car.finishTime = this.time - overshoot / speed;
        car.distance = this.raceLength;
      }
    }

    // Safety net: never let a race run forever.
    if (this.time > this.questionCount * this.cycle * 4) {
      for (const car of this.cars) if (car.finishTime === null) car.finishTime = this.time + (this.raceLength - car.distance);
    }
  }

  /** Run to completion (headless). */
  runToEnd(dt = 0.25): void {
    while (!this.finished) this.step(dt);
  }

  private resolveQuestion(q: number): void {
    const c = this.config;
    const finalLap = q >= (c.laps - 1) * c.questionsPerLap;
    const team = this.team;
    const teamRankBefore = team ? this.rankOf(team) : 0;
    const results: QuestionResult[] = [];

    for (const car of this.cars) {
      const o = car.driver.outcome(q);
      const effect = effectFor(c, o.accuracy);
      let f = baseFactor(c, o.accuracy);
      car.turboStreak = effect === 'turbo' ? car.turboStreak + 1 : 0;
      if (effect === 'spin') {
        f *= c.spinPenaltyMult;
        car.spinLeft = c.spinDuration;
      }
      f *= 1 + c.speedBonusMax * o.speedBonus;
      if (finalLap) f = 1 + (f - 1) * c.finalLapMult;
      car.nitroActive = false;
      if (car.turboStreak >= c.nitroStreak) {
        f *= c.nitroMult;
        car.nitroActive = true;
        car.turboStreak = 0;
      }
      car.mult = Math.max(0.2, f);
      car.lastEffect = effect;
      results.push({ driverId: car.driver.id, accuracy: o.accuracy, effect, mult: car.mult, nitro: car.nitroActive });
    }

    this.events.push({
      q,
      time: this.time,
      finalLap,
      results,
      teamRankBefore,
      teamRankAfter: teamRankBefore, // updated lazily below
    });
  }

  /**
   * Rank changes happen while cars drive, not at the instant of a question, so
   * the "after" rank of question q is the rank right before question q+1.
   */
  finalizeEvents(): void {
    const team = this.team;
    if (!team) return;
    for (let i = 0; i < this.events.length; i++) {
      const next = this.events[i + 1];
      this.events[i].teamRankAfter = next ? next.teamRankBefore : this.rankOf(team);
    }
  }
}
