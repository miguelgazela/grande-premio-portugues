import { carsOfCat, type Category } from '../game/teamStyle';

/** Temas visuais. O tema é uma função da pista (como a pista é da sessão), por isso fantasmas e refreshes coincidem sem gravar nada. */
export interface Theme {
  id: 'relva' | 'deserto' | 'neve' | 'cidade' | 'agua';
  name: string;
  /** Sufixo das chaves do manifest (`bg-<suffix>`); vazio = relva. */
  suffix: string;
  /** Cor de fundo do canvas enquanto a textura não existe. */
  background: number;
  /** Categoria de veículo que o tema oferece. */
  vehicle: Category;
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
    id: 'relva', vehicle: 'carro', name: 'Relva', suffix: '', background: 0x5cb85c, curbA: 0xf26b1d, curbB: 0xf5f5f5,
    props: [{ key: 'prop-tree', size: 70, count: 42, margin: 10, nearRoad: false, spin: true }, { key: 'prop-bush', size: 40, count: 26, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-cow', size: 56, count: 8, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-sheep', size: 46, count: 10, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-hay', size: 52, count: 8, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-pond', size: 80, count: 4, margin: 8, nearRoad: false }, { key: 'prop-g-picnic', size: 60, count: 4, margin: 8, nearRoad: false }, { key: 'prop-g-flowers', size: 40, count: 10, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-tractor', size: 64, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-windmill', size: 90, count: 2, margin: 8, nearRoad: false }, ...ROAD_PROPS],
  },
  {
    id: 'deserto', vehicle: 'carro', name: 'Deserto', suffix: 'desert', background: 0xe0b66a, curbA: 0xb9502f, curbB: 0xf0e4d0,
    props: [{ key: 'prop-cactus', size: 62, count: 34, margin: 10, nearRoad: false }, { key: 'prop-rocks-desert', size: 54, count: 22, margin: 8, nearRoad: false }, { key: 'prop-tumbleweed', size: 34, count: 18, margin: 8, nearRoad: false }, { key: 'prop-d-camel', size: 60, count: 5, margin: 8, nearRoad: false, spin: true }, { key: 'prop-d-oasis', size: 90, count: 3, margin: 8, nearRoad: false }, { key: 'prop-d-pyramid', size: 100, count: 2, margin: 8, nearRoad: false }, { key: 'prop-d-tent', size: 64, count: 4, margin: 8, nearRoad: false, spin: true }, { key: 'prop-d-cactus2', size: 56, count: 8, margin: 8, nearRoad: false }, { key: 'prop-d-chest', size: 36, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-d-fossil', size: 50, count: 5, margin: 8, nearRoad: false, spin: true }, { key: 'prop-d-balloon', size: 70, count: 3, margin: 8, nearRoad: false }, ...ROAD_PROPS],
  },
  {
    id: 'neve', vehicle: 'carro', name: 'Neve', suffix: 'snow', background: 0xe8f2fa, curbA: 0x7cc0f5, curbB: 0xffffff,
    props: [{ key: 'prop-pine', size: 70, count: 40, margin: 10, nearRoad: false }, { key: 'prop-snowman', size: 44, count: 10, margin: 8, nearRoad: false }, { key: 'prop-ice', size: 40, count: 18, margin: 8, nearRoad: false }, { key: 'prop-s-igloo', size: 76, count: 3, margin: 8, nearRoad: false }, { key: 'prop-s-penguins', size: 44, count: 6, margin: 8, nearRoad: false, spin: true }, { key: 'prop-s-polarbear', size: 60, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-s-sled', size: 48, count: 4, margin: 8, nearRoad: false, spin: true }, { key: 'prop-s-pond', size: 80, count: 3, margin: 8, nearRoad: false }, { key: 'prop-s-pine2', size: 70, count: 12, margin: 8, nearRoad: false }, { key: 'prop-s-cabin', size: 84, count: 2, margin: 8, nearRoad: false }, { key: 'prop-s-mound', size: 50, count: 8, margin: 8, nearRoad: false, spin: true }, ...ROAD_PROPS],
  },
  {
    id: 'cidade', vehicle: 'carro', name: 'Cidade', suffix: 'city', background: 0x6b7280, curbA: 0xffd100, curbB: 0x1d1d1d,
    props: [{ key: 'prop-rooftop', size: 84, count: 18, margin: 12, nearRoad: false }, { key: 'prop-rooftop2', size: 84, count: 14, margin: 12, nearRoad: false }, { key: 'prop-fountain', size: 60, count: 4, margin: 10, nearRoad: false }, { key: 'prop-c-glassroof', size: 90, count: 6, margin: 8, nearRoad: false }, { key: 'prop-c-pool', size: 80, count: 3, margin: 8, nearRoad: false }, { key: 'prop-c-helipad', size: 80, count: 2, margin: 8, nearRoad: false }, { key: 'prop-c-foodtruck', size: 64, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-c-bus', size: 70, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-c-taxi', size: 52, count: 4, margin: 8, nearRoad: false, spin: true }, { key: 'prop-c-billboard', size: 70, count: 4, margin: 8, nearRoad: false }, { key: 'prop-c-park', size: 90, count: 4, margin: 8, nearRoad: false }, ...ROAD_PROPS],
  },
  {
    id: 'agua', vehicle: 'barco', name: 'Água', suffix: 'water', background: 0x1f78b4, curbA: 0xff6a2b, curbB: 0xffffff,
    props: [{ key: 'prop-w-island', size: 100, count: 3, margin: 8, nearRoad: false }, { key: 'prop-w-lighthouse', size: 90, count: 2, margin: 8, nearRoad: false }, { key: 'prop-w-dolphin', size: 50, count: 6, margin: 8, nearRoad: false, spin: true }, { key: 'prop-w-whale', size: 100, count: 2, margin: 8, nearRoad: false, spin: true }, { key: 'prop-w-turtle', size: 44, count: 6, margin: 8, nearRoad: false, spin: true }, { key: 'prop-w-dock', size: 72, count: 4, margin: 8, nearRoad: false }, { key: 'prop-w-rocks', size: 54, count: 12, margin: 8, nearRoad: false }, { key: 'prop-w-cargo', size: 110, count: 2, margin: 8, nearRoad: false, spin: true }],
  },
];

const BY_TRACK: Record<string, Theme['id']> = { classico: 'relva', triangulo: 'deserto', losango: 'neve', tecnico: 'cidade', canal: 'agua' };

/** Tema de uma pista. Pistas desconhecidas (registos antigos) ficam com relva. */
export function themeForTrack(trackId: string): Theme {
  return THEMES.find((t) => t.id === BY_TRACK[trackId]) ?? THEMES[0];
}

/** Chaves de textura de um tema. */
export function themeKeys(t: Theme): string[] {
  const s = t.suffix ? `-${t.suffix}` : '';
  return [`bg${t.suffix ? s : '-grass'}`, `track-asphalt${s}`, `track-curb${s}`, ...t.props.map((p) => p.key), ...(t.vehicle === 'barco' ? [...carsOfCat('barco').map((c) => c.key), 'fx-wake', 'fx-splash'] : [])];
}

/** Categoria de veículo de uma pista (água = barcos; o resto, carros). */
export const vehicleForTrack = (trackId: string): Category => themeForTrack(trackId).vehicle;
