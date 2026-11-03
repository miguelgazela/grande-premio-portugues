import { clamp, gaussian, type Rng } from './rng';
import { outcomeFromAnswers, type PlayerAnswer, type QuestionOutcome } from './outcome';
import type { Driver } from './race';

export const BOT_NAMES = ['Relâmpago', 'Foguete', 'Trovão', 'Cometa', 'Furacão', 'Faísca', 'Turbina'];
export const BOT_COLORS = [0xe74c3c, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe84393, 0x95a5a6, 0x2ecc71];
export const TEAM_COLOR = 0x2f6bff;

/** Bot fields tuned with the simulator (see scripts/calibrate.ts). */
export const BOT_FIELDS = {
  facil: [0.3, 0.4, 0.45, 0.52, 0.58, 0.65],
  medio: [0.4, 0.5, 0.55, 0.62, 0.68, 0.75],
  dificil: [0.5, 0.6, 0.65, 0.72, 0.78, 0.85],
} as const;
export type BotField = keyof typeof BOT_FIELDS;

/** Bot with a target accuracy plus per-question noise. */
export function makeBot(rng: Rng, index: number, skill: number, noise = 0.15): Driver {
  const cache: QuestionOutcome[] = [];
  return {
    id: `bot-${index}`,
    name: BOT_NAMES[index % BOT_NAMES.length],
    kind: 'bot',
    color: BOT_COLORS[index % BOT_COLORS.length],
    outcome(q) {
      cache[q] ??= {
        accuracy: clamp(skill + gaussian(rng) * noise, 0, 1),
        speedBonus: clamp(rng() * skill, 0, 1),
      };
      return cache[q];
    },
  };
}

/** Replays a recorded race of another class. */
export function makeGhost(id: string, name: string, record: QuestionOutcome[]): Driver {
  return {
    id,
    name,
    kind: 'ghost',
    color: 0xffffff,
    outcome: (q) => record[q] ?? { accuracy: 0.5, speedBonus: 0 },
  };
}

// ---------- Simulated class (for the mechanics simulator) ----------

export interface SimStudent {
  id: string;
  nickname: string;
  skill: number;
}

const NICKS = ['Ana', 'Bruno', 'Carla', 'Diogo', 'Eva', 'Filipe', 'Gil', 'Helena', 'Inês', 'João', 'Kiko', 'Lara', 'Miguel', 'Nuno', 'Olga', 'Pedro', 'Quim', 'Rita', 'Sara', 'Tiago', 'Ulisses', 'Vera', 'Xavi', 'Zé', 'Beatriz', 'Rui', 'Marta', 'Leonor', 'Tomás', 'Duarte'];

export function makeClass(rng: Rng, size: number, mean: number, spread: number): SimStudent[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `s${i}`,
    nickname: NICKS[i % NICKS.length] + (i >= NICKS.length ? ` ${Math.floor(i / NICKS.length) + 1}` : ''),
    skill: clamp(mean + gaussian(rng) * spread, 0.05, 0.98),
  }));
}

export interface SimClassOptions {
  /** Chance a student answers at all. */
  participation: number;
  /** How much question difficulty varies (shifts every student's odds). */
  difficultySpread: number;
}

/** Team driver backed by simulated students. Keeps every answer for scoring. */
export function makeTeamDriver(rng: Rng, students: SimStudent[], opts: SimClassOptions) {
  const answersByQ: PlayerAnswer[][] = [];
  const cache: QuestionOutcome[] = [];
  const driver: Driver = {
    id: 'team',
    name: 'Turma',
    kind: 'team',
    color: TEAM_COLOR,
    outcome(q) {
      if (cache[q]) return cache[q];
      const difficulty = (rng() * 2 - 1) * opts.difficultySpread;
      const answers = students.map((s): PlayerAnswer => {
        const answered = rng() < opts.participation;
        const correct = answered && rng() < clamp(s.skill - difficulty, 0.02, 0.98);
        // Correct answers tend to come faster.
        const timeFrac = answered ? clamp(rng() * (correct ? 0.7 : 1) + 0.08, 0.05, 1) : 1;
        return { playerId: s.id, answered, correct, timeFrac };
      });
      answersByQ[q] = answers;
      cache[q] = outcomeFromAnswers(answers, students.length);
      return cache[q];
    },
  };
  return { driver, answersByQ };
}
