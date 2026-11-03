/** Temas visuais. O tema é uma função da pista (como a pista é da sessão), por isso fantasmas e refreshes coincidem sem gravar nada. */
export interface Theme {
  id: 'relva' | 'deserto' | 'neve' | 'cidade';
  name: string;
  /** Sufixo das chaves do manifest (`bg-<suffix>`); vazio = relva. */
  suffix: string;
  /** Cor de fundo do canvas enquanto a textura não existe. */
  background: number;
  curbA: number;
  curbB: number;
  /** Props: chave, tamanho, quantidade, margem e se ficam junto da estrada. */
  props: { key: string; size: number; count: number; margin: number; nearRoad: boolean; spin?: boolean }[];
}

const ROAD_PROPS = [
  { key: 'prop-tires', size: 28, count: 14, margin: 8, nearRoad: true },
  { key: 'prop-cone', size: 18, count: 20, margin: 6, nearRoad: true },
];

export const THEMES: Theme[] = [
  {
    id: 'relva', name: 'Relva', suffix: '', background: 0x5cb85c, curbA: 0xf26b1d, curbB: 0xf5f5f5,
    props: [{ key: 'prop-tree', size: 70, count: 42, margin: 10, nearRoad: false, spin: true }, { key: 'prop-bush', size: 40, count: 26, margin: 8, nearRoad: false, spin: true }, ...ROAD_PROPS],
  },
  {
    id: 'deserto', name: 'Deserto', suffix: 'desert', background: 0xe0b66a, curbA: 0xb9502f, curbB: 0xf0e4d0,
    props: [{ key: 'prop-cactus', size: 62, count: 34, margin: 10, nearRoad: false }, { key: 'prop-rocks-desert', size: 54, count: 22, margin: 8, nearRoad: false }, { key: 'prop-tumbleweed', size: 34, count: 18, margin: 8, nearRoad: false }, ...ROAD_PROPS],
  },
  {
    id: 'neve', name: 'Neve', suffix: 'snow', background: 0xe8f2fa, curbA: 0x7cc0f5, curbB: 0xffffff,
    props: [{ key: 'prop-pine', size: 70, count: 40, margin: 10, nearRoad: false }, { key: 'prop-snowman', size: 44, count: 10, margin: 8, nearRoad: false }, { key: 'prop-ice', size: 40, count: 18, margin: 8, nearRoad: false }, ...ROAD_PROPS],
  },
  {
    id: 'cidade', name: 'Cidade', suffix: 'city', background: 0x6b7280, curbA: 0xffd100, curbB: 0x1d1d1d,
    props: [{ key: 'prop-rooftop', size: 84, count: 18, margin: 12, nearRoad: false }, { key: 'prop-rooftop2', size: 84, count: 14, margin: 12, nearRoad: false }, { key: 'prop-fountain', size: 60, count: 4, margin: 10, nearRoad: false }, ...ROAD_PROPS],
  },
];

const BY_TRACK: Record<string, Theme['id']> = { classico: 'relva', triangulo: 'deserto', losango: 'neve', tecnico: 'cidade' };

/** Tema de uma pista. Pistas desconhecidas (registos antigos) ficam com relva. */
export function themeForTrack(trackId: string): Theme {
  return THEMES.find((t) => t.id === BY_TRACK[trackId]) ?? THEMES[0];
}

/** Chaves de textura de um tema. */
export function themeKeys(t: Theme): string[] {
  const s = t.suffix ? `-${t.suffix}` : '';
  return [`bg${t.suffix ? s : '-grass'}`, `track-asphalt${s}`, `track-curb${s}`, ...t.props.map((p) => p.key)];
}
