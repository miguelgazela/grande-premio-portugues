export interface RaceConfig {
  /** Número de perguntas da corrida (sem voltas: a pista é aberta). */
  questions: number;
  /** Quantas das últimas perguntas formam a reta final (efeitos amplificados). */
  finalCount: number;
  /** Seconds students have to answer. */
  questionTime: number;
  /** Seconds per question spent showing the prompt and revealing the result. */
  overheadTime: number;

  /** Speed factor at 0% and 100% accuracy (linear in between). */
  minFactor: number;
  maxFactor: number;

  /** Velocidade de cruzeiro (unidades do mundo por segundo), constante para todos os carros. */
  cruiseSpeed: number;
  /** Quanto do efeito de cada resposta chega à velocidade (0..1). Pequeno: os efeitos mexem nas posições, não no ritmo da corrida. */
  effectScale: number;

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
  /** Os efeitos da reta final são amplificados por este multiplicador. */
  finalLapMult: number;

  /** Força do regresso dos bots por cada terço da corrida de diferença para o carro da turma. */
  rubberBand: number;
  rubberBandCap: number;
}

export const DEFAULT_CONFIG: RaceConfig = {
  questions: 18,
  finalCount: 6,
  questionTime: 20,
  overheadTime: 5,
  minFactor: 0.6,
  maxFactor: 1.4,
  cruiseSpeed: 160,
  effectScale: 0.05,
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
};

export const totalQuestions = (c: RaceConfig) => c.questions;

/** Reta final: o último terço das perguntas (pelo menos uma). */
export const finalCountFor = (questions: number) => Math.max(1, Math.round(questions / 3));

/** A pergunta `q` está na reta final? */
export const inFinalStretch = (c: RaceConfig, q: number) => q >= c.questions - c.finalCount;
export const cycleTime = (c: RaceConfig) => c.questionTime + c.overheadTime;
