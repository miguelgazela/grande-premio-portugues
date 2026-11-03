/** Aspeto do carro da turma: a cor é escolhida pelos alunos no lobby (votação) ou fixada pela professora. */
export interface TeamStyle {
  color: number;
}

/** Cores com carro próprio (`car` = chave do manifest). */
export const TEAM_COLORS: { label: string; value: number; car: string }[] = [
  { label: 'Azul', value: 0x2f6bff, car: 'car-team' },
  { label: 'Vermelho', value: 0xe74c3c, car: 'car-red' },
  { label: 'Laranja', value: 0xf39c12, car: 'car-orange' },
  { label: 'Verde', value: 0x2ecc71, car: 'car-green' },
  { label: 'Roxo', value: 0x9b59b6, car: 'car-purple' },
  { label: 'Rosa', value: 0xe84393, car: 'car-pink' },
  { label: 'Turquesa', value: 0x1abc9c, car: 'car-teal' },
  { label: 'Cinzento', value: 0x95a5a6, car: 'car-grey' },
];

export const TEAM_NAME = 'Turma';

export const DEFAULT_STYLE: TeamStyle = { color: TEAM_COLORS[0].value };

export const carKeyFor = (color: number) => (TEAM_COLORS.find((c) => c.value === color) ?? TEAM_COLORS[0]).car;

export type StyleVote = Partial<TeamStyle>;

/** Valida um voto vindo da rede; ignora o que não conhecemos. */
export function cleanVote(raw: unknown): StyleVote {
  const r = (raw ?? {}) as Record<string, unknown>;
  return typeof r.color === 'number' && TEAM_COLORS.some((c) => c.value === r.color) ? { color: r.color } : {};
}

/** Cor mais votada (empate: a que apareceu primeiro); sem votos, a cor por defeito. */
export function tally(votes: Iterable<StyleVote>): { style: TeamStyle; count: number } {
  const counts = new Map<number, number>();
  let count = 0;
  for (const v of votes) {
    if (v.color === undefined) continue;
    counts.set(v.color, (counts.get(v.color) ?? 0) + 1);
    count++;
  }
  let top = DEFAULT_STYLE.color;
  let n = 0;
  for (const [k, c] of counts) if (c > n) [top, n] = [k, c];
  return { style: { color: top }, count };
}

/** Lê um estilo gravado em `session.state.team`; lixo dá o estilo por defeito. */
export function parseStyle(raw: unknown): TeamStyle {
  return { color: cleanVote(raw).color ?? DEFAULT_STYLE.color };
}
