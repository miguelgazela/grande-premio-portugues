/** Aspeto do carro da turma: escolhido pelos alunos no lobby (votação) ou fixado pela professora. */
export interface TeamStyle {
  name: string;
  color: number;
  /** Chave `cartype-*` do manifest. */
  model: string;
}

export const TEAM_COLORS: { label: string; value: number }[] = [
  { label: 'Azul', value: 0x2f6bff },
  { label: 'Vermelho', value: 0xe74c3c },
  { label: 'Laranja', value: 0xf39c12 },
  { label: 'Verde', value: 0x2ecc71 },
  { label: 'Roxo', value: 0x9b59b6 },
  { label: 'Rosa', value: 0xe84393 },
  { label: 'Turquesa', value: 0x1abc9c },
  { label: 'Amarelo', value: 0xf7d21e },
];

export const TEAM_MODELS: { key: string; label: string }[] = [
  { key: 'cartype-coupe', label: 'Coupé' },
  { key: 'cartype-rally', label: 'Rali' },
  { key: 'cartype-pickup', label: 'Pickup' },
  { key: 'cartype-kart', label: 'Kart' },
  { key: 'cartype-van', label: 'Carrinha' },
];

/** Nomes para os alunos votarem (nada de texto livre dos alunos: o ecrã é visto pela turma toda). */
export const TEAM_NAMES = ['Turma', 'Foguetes', 'Trovões', 'Tigres', 'Águias', 'Dragões', 'Tubarões', 'Cometas', 'Panteras', 'Vikings'];

export const DEFAULT_STYLE: TeamStyle = { name: 'Turma', color: TEAM_COLORS[0].value, model: TEAM_MODELS[0].key };

export type StyleVote = Partial<TeamStyle>;

/** Valida um voto vindo da rede; ignora o que não conhecemos. */
export function cleanVote(raw: unknown): StyleVote {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: StyleVote = {};
  if (typeof r.color === 'number' && TEAM_COLORS.some((c) => c.value === r.color)) out.color = r.color;
  if (typeof r.model === 'string' && TEAM_MODELS.some((m) => m.key === r.model)) out.model = r.model;
  if (typeof r.name === 'string' && TEAM_NAMES.includes(r.name)) out.name = r.name;
  return out;
}

/** Nome livre da professora: curto e sem espaços a mais. */
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 16);

/** Mais votado por campo (empate: o que apareceu primeiro); sem votos, o valor por defeito. */
export function tally(votes: Iterable<StyleVote>): { style: TeamStyle; count: number } {
  const counts = { color: new Map<number, number>(), model: new Map<string, number>(), name: new Map<string, number>() };
  let count = 0;
  for (const v of votes) {
    let any = false;
    for (const k of ['color', 'model', 'name'] as const) {
      if (v[k] !== undefined) {
        const m = counts[k] as Map<unknown, number>;
        m.set(v[k], (m.get(v[k]) ?? 0) + 1);
        any = true;
      }
    }
    if (any) count++;
  }
  const best = <T,>(m: Map<T, number>, d: T): T => {
    let top = d;
    let n = 0;
    for (const [k, c] of m) if (c > n) [top, n] = [k, c];
    return top;
  };
  return {
    style: { name: best(counts.name, DEFAULT_STYLE.name), color: best(counts.color, DEFAULT_STYLE.color), model: best(counts.model, DEFAULT_STYLE.model) },
    count,
  };
}

/** Lê um estilo gravado em `session.state.team`; lixo dá o estilo por defeito. */
export function parseStyle(raw: unknown): TeamStyle {
  const r = (raw ?? {}) as Partial<TeamStyle>;
  const v = cleanVote(r);
  const name = typeof r.name === 'string' ? cleanName(r.name) : '';
  return { name: name || DEFAULT_STYLE.name, color: v.color ?? DEFAULT_STYLE.color, model: v.model ?? DEFAULT_STYLE.model };
}
