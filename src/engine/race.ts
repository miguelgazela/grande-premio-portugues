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
 * Fator de velocidade médio do ciclo seguinte à pergunta `q`: o efeito da resposta, já comprimido por `effectScale`.
 * `streak` é o número de turbos seguidos *incluindo* esta pergunta; devolve também se o nitro disparou.
 */
export function questionMult(c: RaceConfig, q: number, accuracy: number, speedBonus: number, streak: number): { mult: number; nitro: boolean } {
  const finalLap = q >= (c.laps - 1) * c.questionsPerLap;
  let f = baseFactor(c, accuracy);
  if (effectFor(c, accuracy) === 'spin') f *= c.spinPenaltyMult;
  f *= 1 + c.speedBonusMax * speedBonus;
  if (finalLap) f = 1 + (f - 1) * c.finalLapMult;
  const nitro = streak >= c.nitroStreak;
  if (nitro) f *= c.nitroMult;
  return { mult: Math.max(0.2, 1 + c.effectScale * (f - 1)), nitro };
}

/** Ganho máximo (em segundos de cruzeiro) que um carro pode acumular com os efeitos de todas as perguntas. */
export function maxGain(c: RaceConfig): number {
  const n = totalQuestions(c);
  const cyc = cycleTime(c);
  let gain = 0;
  let streak = 0;
  for (let q = 0; q < n; q++) {
    streak++;
    const { mult, nitro } = questionMult(c, q, 1, 1, streak);
    if (nitro) streak = 0;
    gain += (mult - 1) * cyc;
  }
  return Math.max(0, gain);
}

/** Segundos de cruzeiro que o primeiro carro ainda faz, no mínimo, depois de a última pergunta fechar (a meta nunca "aparece em cima"). */
export const FINISH_TAIL = 3;

/**
 * Comprimento máximo possível da corrida (para gerar a estrada): `cruiseSpeed × (perguntas × ciclo + ganho máximo + cauda)`.
 * A meta real fica mais perto se as perguntas fecharem antes do tempo (ver `Race.finishLine`).
 */
export const raceLengthFor = (c: RaceConfig) => c.cruiseSpeed * (totalQuestions(c) * cycleTime(c) + maxGain(c) + FINISH_TAIL);

/**
 * Deterministic race simulation. Time advances with `step(dt)`. Cars cruise at constant speed; when a question is
 * resolved every driver's outcome is applied at once as a smooth push (or drag) that lasts `overheadTime`.
 * Por defeito as perguntas resolvem-se sozinhas ao fim de cada ciclo (simulador, testes, fantasmas); com `manual`
 * é o anfitrião que chama `resolveNow()` quando a pergunta fecha, e o tempo é o real.
 *
 * A meta só existe depois de a última pergunta fechar: fica a `cruiseSpeed × (tempo + ganho máximo + cauda)`.
 * Assim ninguém chega antes, e o tempo de meta de um carro depende só das respostas dele.
 */
export class Race {
  readonly cars: CarState[];
  readonly events: QuestionEvent[] = [];
  /** Comprimento máximo da corrida (estrada); a meta real é `finishLine`. */
  readonly maxLength: number;
  /** Distância da meta; `null` até a última pergunta fechar. */
  finishLine: number | null = null;
  /** Se verdadeiro, as perguntas só se resolvem com `resolveNow()`. */
  manual = false;
  /** Instante (tempo da corrida) da última resolução; o efeito dura `overheadTime` a partir daí. */
  private lastResolve = Number.NEGATIVE_INFINITY;
  /** Só para a rubber-band dos bots (diferença em "voltas"). */
  private readonly lapLength: number;
  readonly baseSpeed: number;
  readonly questionCount: number;
  readonly cycle: number;
  time = 0;
  nextQuestion = 0;

  constructor(
    drivers: Driver[],
    readonly config: RaceConfig,
  ) {
    this.questionCount = totalQuestions(config);
    this.cycle = cycleTime(config);
    this.maxLength = raceLengthFor(config);
    this.baseSpeed = config.cruiseSpeed;
    this.lapLength = this.maxLength / config.laps;
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

  /** Meta (ou, antes de existir, o comprimento máximo): para barras de progresso. */
  get raceLength(): number {
    return this.finishLine ?? this.maxLength;
  }

  /** Segundos desde a última resolução. */
  private get sinceResolve(): number {
    return this.time - this.lastResolve;
  }

  /** true enquanto o efeito da última resposta está a atuar (`overheadTime` depois de cada resolução). */
  get bursting(): boolean {
    return this.sinceResolve < this.config.overheadTime;
  }

  /**
   * Multiplicador de velocidade instantâneo. `car.mult` é a média de um ciclo; o efeito da resposta chega como uma
   * subida e descida suaves (seno) com o mesmo integral, por isso o efeito vale `(mult − 1) × ciclo` segundos de cruzeiro. Fora disso, cruzeiro.
   */
  private speedMult(car: CarState): number {
    if (!this.bursting) return 1;
    const x = clamp(this.sinceResolve / this.config.overheadTime, 0, 1);
    return Math.max(0.05, 1 + (car.mult - 1) * (this.cycle / this.config.overheadTime) * (Math.PI / 2) * Math.sin(Math.PI * x));
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

    while (!this.manual && this.nextQuestion < this.questionCount && this.time >= (this.nextQuestion + 1) * this.cycle) this.resolveNow();

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
      if (this.finishLine !== null && car.distance >= this.finishLine) {
        const overshoot = car.distance - this.finishLine;
        car.finishTime = this.time - overshoot / speed;
        car.distance = this.finishLine;
      }
    }

    // Safety net: never let a race run forever.
    if (this.time > this.questionCount * this.cycle * 4) {
      for (const car of this.cars) if (car.finishTime === null) car.finishTime = this.time + ((this.finishLine ?? this.maxLength) - car.distance);
    }
  }

  /** Run to completion (headless). */
  runToEnd(dt = 0.25): void {
    while (!this.finished) this.step(dt);
  }

  /** Resolve a pergunta em curso agora: aplica o efeito das respostas e, na última, põe a meta. */
  resolveNow(): void {
    if (this.nextQuestion >= this.questionCount) return;
    const q = this.nextQuestion;
    this.resolveQuestion(q);
    this.nextQuestion++;
    this.lastResolve = this.time;
    if (this.nextQuestion >= this.questionCount) {
      this.finishLine = this.baseSpeed * (this.time + maxGain(this.config) + FINISH_TAIL);
    }
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
      car.turboStreak = effect === 'turbo' ? car.turboStreak + 1 : 0;
      if (effect === 'spin') car.spinLeft = c.spinDuration;
      const { mult, nitro } = questionMult(c, q, o.accuracy, o.speedBonus, car.turboStreak);
      if (nitro) car.turboStreak = 0;
      car.nitroActive = nitro;
      car.mult = mult;
      car.lastEffect = effect;
      results.push({ driverId: car.driver.id, accuracy: o.accuracy, effect, mult: car.mult, nitro });
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
