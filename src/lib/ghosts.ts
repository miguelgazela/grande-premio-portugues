// Fantasmas de turmas: formato da `timeline` gravada, compatibilidade entre corridas e recorde da pista.
import type { QuestionOutcome as Outcome } from '../engine/outcome';
import type { RaceConfig } from '../engine/config';
import { TRACKS } from '../engine/track';

export type RaceShape = Pick<RaceConfig, 'laps' | 'questionsPerLap' | 'questionTime'>;

/** Formato antigo: só os resultados por pergunta. Formato novo: acrescenta pista e configuração. */
export type TimelineV1 = Outcome[];
export interface TimelineV2 {
  v: 2;
  trackId: string;
  config: RaceShape;
  outcomes: Outcome[];
}
export type StoredTimeline = TimelineV1 | TimelineV2;

export interface ParsedTimeline {
  outcomes: Outcome[];
  /** null nos registos antigos (não dá para garantir um replay justo). */
  trackId: string | null;
  config: RaceShape | null;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const cleanOutcomes = (a: unknown): Outcome[] =>
  Array.isArray(a) ? a.map((o) => ({ accuracy: num((o as Outcome)?.accuracy), speedBonus: num((o as Outcome)?.speedBonus) })) : [];

/** Lê os dois formatos. Nunca lança: lixo dá uma timeline vazia. */
export function parseTimeline(raw: unknown): ParsedTimeline {
  if (Array.isArray(raw)) return { outcomes: cleanOutcomes(raw), trackId: null, config: null };
  if (raw && typeof raw === 'object' && (raw as TimelineV2).v === 2) {
    const t = raw as TimelineV2;
    const c = t.config as Partial<RaceShape> | undefined;
    const config = c && num(c.laps) > 0 && num(c.questionsPerLap) > 0 && num(c.questionTime) > 0 ? { laps: c.laps!, questionsPerLap: c.questionsPerLap!, questionTime: c.questionTime! } : null;
    return { outcomes: cleanOutcomes(t.outcomes), trackId: typeof t.trackId === 'string' ? t.trackId : null, config };
  }
  return { outcomes: [], trackId: null, config: null };
}

export function makeTimeline(trackId: string, config: RaceConfig, outcomes: Outcome[]): TimelineV2 {
  return {
    v: 2,
    trackId,
    config: { laps: config.laps, questionsPerLap: config.questionsPerLap, questionTime: config.questionTime },
    outcomes: outcomes.map((o) => ({ accuracy: o.accuracy, speedBonus: o.speedBonus })),
  };
}

export const configKey = (c: RaceShape) => `${c.laps}x${c.questionsPerLap}@${c.questionTime}`;

/** Corrida anterior de um quiz, pronta a ser usada como fantasma ou recorde. */
export interface GhostRecord {
  session_id: string;
  class_id: string | null;
  class_name: string | null;
  created_at: string;
  final_position: number;
  finish_time_ms: number;
  trackId: string;
  config: RaceShape;
  outcomes: Outcome[];
}

export const ghostLabel = (g: Pick<GhostRecord, 'class_name'>) => g.class_name ?? 'Fantasma';

/** Só os registos com pista e configuração conhecidas, a pista existente e perguntas a bater certo. */
export function usableRecords(all: GhostRecord[]): GhostRecord[] {
  return all.filter((g) => TRACKS.some((t) => t.id === g.trackId) && g.outcomes.length === g.config.laps * g.config.questionsPerLap);
}

/** Corridas com a mesma configuração, mais recentes primeiro. */
export function compatibleRecords(all: GhostRecord[], shape: RaceShape): GhostRecord[] {
  const key = configKey(shape);
  return usableRecords(all)
    .filter((g) => configKey(g.config) === key)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** A melhor corrida (menor tempo) de cada turma. */
export function bestPerClass(list: GhostRecord[]): Set<string> {
  const best = new Map<string, GhostRecord>();
  for (const g of list) {
    const k = g.class_id ?? '';
    const cur = best.get(k);
    if (!cur || g.finish_time_ms < cur.finish_time_ms) best.set(k, g);
  }
  return new Set([...best.values()].map((g) => g.session_id));
}

/** Os fantasmas partilham a pista do primeiro escolhido; os outros incompatíveis ficam de fora. */
export function sameTrackAs(list: GhostRecord[], chosen: GhostRecord[]): GhostRecord[] {
  if (!chosen.length) return list;
  return list.filter((g) => g.trackId === chosen[0].trackId);
}

/** Recorde da pista: o menor tempo entre as corridas compatíveis (qualquer pista com a mesma configuração). */
export function trackRecord(all: GhostRecord[], shape: RaceShape): GhostRecord | null {
  return compatibleRecords(all, shape).reduce<GhostRecord | null>((m, g) => (!m || g.finish_time_ms < m.finish_time_ms ? g : m), null);
}

export const fmtSeconds = (ms: number) => `${(Math.abs(ms) / 1000).toFixed(1).replace('.', ',')} s`;
export const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Mensagem do ecrã final contra o fantasma mais relevante. `diffMs` > 0: a turma ganhou. */
export function ghostMessage(g: { name: string; diffMs: number }): string {
  return g.diffMs >= 0 ? `Batemos o ${g.name} por ${fmtSeconds(g.diffMs)}!` : `O ${g.name} ganhou por ${fmtSeconds(g.diffMs)}`;
}
