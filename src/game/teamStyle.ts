import { mulberry32 } from '../engine/rng';

/** Carros disponíveis para a turma (cada um é um asset do manifest, com as cores originais). */
export interface CarDef {
  key: string;
  model: string;
  /** Cor dominante (minimapa, pontos). */
  color: number;
  label: string;
}

const C = { blue: 0x2f6bff, red: 0xe74c3c, orange: 0xf39c12, green: 0x2ecc71, purple: 0x9b59b6, pink: 0xe84393, teal: 0x1abc9c, grey: 0x95a5a6, yellow: 0xf7d21e, white: 0xf2f2f2 };
const NAMES: Record<string, string> = { blue: 'Azul', red: 'Vermelho', orange: 'Laranja', green: 'Verde', purple: 'Roxo', pink: 'Rosa', teal: 'Turquesa', grey: 'Cinzento', yellow: 'Amarelo', white: 'Branco' };

export const MODELS: { id: string; label: string; colors: (keyof typeof C)[] }[] = [
  { id: 'classico', label: 'Clássico', colors: ['blue', 'red', 'orange', 'green', 'purple', 'pink', 'teal', 'grey'] },
  { id: 'coupe', label: 'Coupé', colors: ['red', 'yellow', 'teal'] },
  { id: 'rally', label: 'Rali', colors: ['blue', 'orange', 'white'] },
  { id: 'pickup', label: 'Pickup', colors: ['green', 'red', 'purple'] },
  { id: 'van', label: 'Carrinha', colors: ['yellow', 'pink', 'blue'] },
  { id: 'kart', label: 'Kart', colors: ['orange', 'green', 'purple'] },
];

const classicKey = (c: string) => (c === 'blue' ? 'car-team' : `car-${c}`);

export const CARS: CarDef[] = MODELS.flatMap((m) =>
  m.colors.map((c) => ({ key: m.id === 'classico' ? classicKey(c) : `car-${m.id}-${c}`, model: m.id, color: C[c], label: `${m.label} ${NAMES[c].toLowerCase()}` })),
);

export const carDef = (key: string | undefined): CarDef | undefined => CARS.find((c) => c.key === key);
export const carsOfModel = (model: string) => CARS.filter((c) => c.model === model);

/** Aspeto do carro da turma: um dos carros do catálogo, votado pelos alunos ou fixado pela professora. */
export interface TeamStyle {
  car: string;
}
export type StyleVote = Partial<TeamStyle>;

export const TEAM_NAME = 'Turma';
export const DEFAULT_STYLE: TeamStyle = { car: 'car-team' };

/** Valida um voto vindo da rede; ignora o que não conhecemos. */
export function cleanVote(raw: unknown): StyleVote {
  const car = (raw as { car?: unknown } | null)?.car;
  return typeof car === 'string' && carDef(car) ? { car } : {};
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Carro mais votado; sem votos, o por defeito.
 * Num empate é sorteado um dos carros empatados. O sorteio é estável (depende só da sessão e
 * do empate), para o carro não mudar a cada atualização do lobby, e só volta a sortear quando
 * os votos mudarem.
 */
export function tally(votes: Iterable<StyleVote>, seed = ''): { style: TeamStyle; count: number; tie: boolean } {
  const counts = new Map<string, number>();
  let count = 0;
  for (const v of votes) {
    if (v.car === undefined) continue;
    counts.set(v.car, (counts.get(v.car) ?? 0) + 1);
    count++;
  }
  const top = Math.max(0, ...counts.values());
  const tied = [...counts].filter(([, n]) => n === top && n > 0).map(([k]) => k).sort();
  if (tied.length === 0) return { style: { car: DEFAULT_STYLE.car }, count, tie: false };
  if (tied.length === 1) return { style: { car: tied[0] }, count, tie: false };
  const pick = tied[Math.floor(mulberry32(hashSeed(`${seed}|${tied.join(',')}|${top}`))() * tied.length)];
  return { style: { car: pick }, count, tie: true };
}

/** Lê um estilo gravado em `session.state.team`; o formato antigo (`color`) e lixo dão um carro válido. */
export function parseStyle(raw: unknown): TeamStyle {
  const v = cleanVote(raw);
  if (v.car) return { car: v.car };
  const color = (raw as { color?: unknown } | null)?.color;
  return { car: CARS.find((c) => c.model === 'classico' && c.color === color)?.key ?? DEFAULT_STYLE.car };
}

/** Carros para os bots: variam de modelo e nunca repetem cor (nem a da turma). */
export function botCars(team: string, count: number): CarDef[] {
  const used = new Set([carDef(team)?.color]);
  const order: CarDef[] = [];
  const rows = MODELS.map((m) => carsOfModel(m.id));
  for (let i = 0; order.length < CARS.length; i++) {
    for (const r of rows) if (r[i]) order.push(r[i]);
  }
  const out: CarDef[] = [];
  for (const c of order) {
    if (out.length >= count) break;
    if (!used.has(c.color)) {
      used.add(c.color);
      out.push(c);
    }
  }
  return out;
}
