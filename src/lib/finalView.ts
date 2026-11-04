import type { FinalInfo, FinalStanding } from './protocol';
import { fmtSeconds, fmtTime, ghostMessage } from './ghosts';

/** Lógica pura do ecrã final do anfitrião (mensagem, pódio, notas do recorde). */

export type Tone = 'win' | 'podium' | 'other';

/** Título e subtítulo do resultado da turma. `total`: nº de carros na corrida (turma incluída). */
export function resultHeadline(position: number, total: number): { title: string; sub: string; tone: Tone } {
  if (position <= 1) {
    return { title: 'Vitória da turma!', sub: total > 1 ? `Primeiros entre ${total} carros` : 'Primeiros na pista', tone: 'win' };
  }
  const title = `A turma acabou em ${position}º lugar`;
  if (position === 2) return { title, sub: 'Só um carro ficou à frente', tone: 'podium' };
  if (position === 3) return { title, sub: 'No pódio!', tone: 'podium' };
  return { title, sub: `${position - 1} carros à frente, na próxima há mais`, tone: 'other' };
}

export interface PodiumSlot {
  /** Posição 0-based na classificação. */
  index: number;
  car: FinalStanding;
}

/** Os 3 primeiros em degraus (ordem visual 2.º, 1.º, 3.º) e os restantes em lista. */
export function splitStandings(standings: FinalStanding[]): { podium: PodiumSlot[]; rest: { index: number; car: FinalStanding }[] } {
  const top = standings.slice(0, 3).map((car, index) => ({ index, car }));
  const podium = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const rest = standings.slice(3).map((car, i) => ({ index: i + 3, car }));
  return { podium, rest };
}

/** Densidade da lista (4.º em diante): decide tamanho da letra e colunas para caber sem scroll. */
export function listDensity(count: number): 'roomy' | 'compact' | 'tight' {
  if (count <= 6) return 'roomy';
  if (count <= 14) return 'compact';
  return 'tight';
}

export interface Note {
  kind: 'record' | 'info' | 'ghost-win' | 'ghost-loss';
  text: string;
}

/** Notas do fantasma/recorde. Vazio quando não há nada a dizer (revisão, sem fantasma nem recorde). */
export function recordNotes(f: Pick<FinalInfo, 'ghost' | 'record' | 'standings'>): Note[] {
  const notes: Note[] = [];
  if (f.ghost) notes.push({ kind: f.ghost.diffMs >= 0 ? 'ghost-win' : 'ghost-loss', text: ghostMessage(f.ghost) });
  const r = f.record;
  if (r) {
    if (r.bestMs === null) {
      notes.push({ kind: 'info', text: `Primeiro tempo desta corrida: ${fmtTime(f.standings.find((c) => c.kind === 'team')?.timeMs ?? 0)}` });
    } else if (r.newRecord) {
      notes.push({ kind: 'record', text: `Novo recorde! Antes: ${fmtTime(r.bestMs)} (${r.holder ?? 'sem turma'})` });
    } else {
      notes.push({ kind: 'info', text: `Recorde da pista: ${fmtTime(r.bestMs)} (${r.holder ?? 'sem turma'}) · faltaram ${fmtSeconds(r.gapMs)}` });
    }
  }
  return notes;
}
