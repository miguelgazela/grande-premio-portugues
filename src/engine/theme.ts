import { carsOfCat, type Category } from '../game/teamStyle';

/** Temas visuais. O tema é uma função da pista (como a pista é da sessão), por isso fantasmas e refreshes coincidem sem gravar nada. */
export interface Theme {
  id: 'relva' | 'deserto' | 'neve' | 'cidade' | 'agua' | 'doces' | 'espaco';
  name: string;
  /** Sufixo das chaves do manifest (`bg-<suffix>`); vazio = relva. */
  suffix: string;
  /** Cor de fundo do canvas enquanto a textura não existe. */
  background: number;
  /** Categoria de veículo que o tema oferece. */
  vehicle: Category;
  curbA: number;
  curbB: number;
  /** Tinge o tile de fundo (multiplica as cores); omitido = sem alteração. */
  bgTint?: number;
  /** Props: chave, tamanho, quantidade, margem e se ficam junto da estrada. */
  props: { key: string; size: number; count: number; margin: number; nearRoad: boolean; spin?: boolean }[];
}

const CONES = { key: 'prop-cone', size: 18, count: 20, margin: 6, nearRoad: true };
/** Pneus (bóias vermelhas e brancas) só fazem sentido na relva. */
const ROAD_PROPS = [{ key: 'prop-tires', size: 28, count: 14, margin: 8, nearRoad: true }, CONES];

export const THEMES: Theme[] = [
  {
    id: 'relva', vehicle: 'carro', name: 'Relva', suffix: '', background: 0x5cb85c, curbA: 0xf26b1d, curbB: 0xf5f5f5,
    props: [{ key: 'prop-tree', size: 70, count: 42, margin: 10, nearRoad: false, spin: true }, { key: 'prop-bush', size: 40, count: 26, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-cow', size: 56, count: 8, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-sheep', size: 46, count: 10, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-hay', size: 52, count: 8, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-pond', size: 80, count: 4, margin: 8, nearRoad: false }, { key: 'prop-g-picnic', size: 60, count: 4, margin: 8, nearRoad: false }, { key: 'prop-g-flowers', size: 40, count: 10, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-tractor', size: 64, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-g-windmill', size: 90, count: 2, margin: 8, nearRoad: false }, ...ROAD_PROPS],
  },
  {
    id: 'deserto', vehicle: 'carro', name: 'Deserto', suffix: 'desert', background: 0xe0b66a, curbA: 0xb9502f, curbB: 0xf0e4d0,
    props: [{ key: 'prop-cactus', size: 38, count: 34, margin: 10, nearRoad: false }, { key: 'prop-rocks-desert', size: 54, count: 22, margin: 8, nearRoad: false }, { key: 'prop-tumbleweed', size: 34, count: 18, margin: 8, nearRoad: false }, { key: 'prop-d-camel', size: 50, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-d-oasis', size: 90, count: 3, margin: 8, nearRoad: false }, { key: 'prop-d-pyramid', size: 70, count: 1, margin: 8, nearRoad: false }, { key: 'prop-d-tent', size: 64, count: 4, margin: 8, nearRoad: false, spin: true }, { key: 'prop-d-cactus2', size: 38, count: 8, margin: 8, nearRoad: false }, { key: 'prop-d-chest', size: 36, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-d-fossil', size: 50, count: 5, margin: 8, nearRoad: false, spin: true }, { key: 'prop-d-balloon', size: 70, count: 3, margin: 8, nearRoad: false }, CONES],
  },
  {
    id: 'neve', vehicle: 'carro', name: 'Neve', suffix: 'snow', background: 0xe8f2fa, curbA: 0x1f7fd6, curbB: 0xffffff,
    props: [{ key: 'prop-pine', size: 70, count: 40, margin: 10, nearRoad: false }, { key: 'prop-snowman', size: 44, count: 10, margin: 8, nearRoad: false }, { key: 'prop-ice', size: 40, count: 8, margin: 8, nearRoad: false }, { key: 'prop-s-igloo', size: 76, count: 3, margin: 8, nearRoad: false }, { key: 'prop-s-penguins', size: 44, count: 6, margin: 8, nearRoad: false, spin: true }, { key: 'prop-s-polarbear', size: 60, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-s-sled', size: 48, count: 4, margin: 8, nearRoad: false, spin: true }, { key: 'prop-s-pond', size: 80, count: 2, margin: 8, nearRoad: false }, { key: 'prop-s-pine2', size: 70, count: 12, margin: 8, nearRoad: false }, { key: 'prop-s-cabin', size: 84, count: 2, margin: 8, nearRoad: false }, { key: 'prop-s-mound', size: 50, count: 4, margin: 8, nearRoad: false, spin: true }, CONES],
  },
  {
    id: 'cidade', vehicle: 'carro', name: 'Cidade', suffix: 'city', background: 0x6b7280, curbA: 0xffd100, curbB: 0x1d1d1d, bgTint: 0xb0b6c2,
    props: [{ key: 'prop-rooftop', size: 84, count: 8, margin: 12, nearRoad: false }, { key: 'prop-rooftop2', size: 84, count: 14, margin: 12, nearRoad: false }, { key: 'prop-fountain', size: 60, count: 4, margin: 10, nearRoad: false }, { key: 'prop-c-glassroof', size: 90, count: 6, margin: 8, nearRoad: false }, { key: 'prop-c-pool', size: 80, count: 3, margin: 8, nearRoad: false }, { key: 'prop-c-helipad', size: 80, count: 2, margin: 8, nearRoad: false }, { key: 'prop-c-foodtruck', size: 64, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-c-bus', size: 70, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-c-taxi', size: 52, count: 4, margin: 8, nearRoad: false, spin: true }, { key: 'prop-c-billboard', size: 70, count: 4, margin: 8, nearRoad: false }, { key: 'prop-c-park', size: 90, count: 4, margin: 8, nearRoad: false }, CONES],
  },
  {
    id: 'agua', vehicle: 'barco', name: 'Água', suffix: 'water', background: 0x1f78b4, curbA: 0xff6a2b, curbB: 0xffffff,
    props: [{ key: 'prop-w-island', size: 100, count: 3, margin: 8, nearRoad: false }, { key: 'prop-w-lighthouse', size: 90, count: 2, margin: 8, nearRoad: false }, { key: 'prop-w-dolphin', size: 50, count: 6, margin: 8, nearRoad: false, spin: true }, { key: 'prop-w-whale', size: 100, count: 2, margin: 8, nearRoad: false, spin: true }, { key: 'prop-w-turtle', size: 44, count: 6, margin: 8, nearRoad: false, spin: true }, { key: 'prop-w-dock', size: 72, count: 4, margin: 8, nearRoad: false }, { key: 'prop-w-rocks', size: 54, count: 12, margin: 8, nearRoad: false }, { key: 'prop-w-cargo', size: 110, count: 2, margin: 8, nearRoad: false, spin: true }],
  },
  {
    id: 'doces', vehicle: 'carro', name: 'Doces', suffix: 'candy', background: 0xf6b6cf, curbA: 0xe8262b, curbB: 0xffffff,
    props: [{ key: 'prop-ca-cupcake', size: 60, count: 10, margin: 8, nearRoad: false, spin: true }, { key: 'prop-ca-lollipop', size: 70, count: 10, margin: 8, nearRoad: false, spin: true }, { key: 'prop-ca-donut', size: 70, count: 6, margin: 8, nearRoad: false, spin: true }, { key: 'prop-ca-icecream', size: 64, count: 6, margin: 8, nearRoad: false, spin: true }, { key: 'prop-ca-cake', size: 80, count: 3, margin: 8, nearRoad: false }, { key: 'prop-ca-gummies', size: 50, count: 8, margin: 8, nearRoad: false }, { key: 'prop-ca-gingerbread', size: 90, count: 2, margin: 8, nearRoad: false }, { key: 'prop-ca-cottoncandy', size: 80, count: 8, margin: 8, nearRoad: false }, ...ROAD_PROPS],
  },
  {
    id: 'espaco', vehicle: 'nave', name: 'Espaço', suffix: 'space', background: 0x0b0b3a, curbA: 0x19e6ff, curbB: 0xff3df0,
    props: [{ key: 'prop-sp-planet', size: 120, count: 3, margin: 8, nearRoad: false }, { key: 'prop-sp-asteroid', size: 48, count: 14, margin: 8, nearRoad: false }, { key: 'prop-sp-satellite', size: 56, count: 5, margin: 8, nearRoad: false, spin: true }, { key: 'prop-sp-station', size: 100, count: 2, margin: 8, nearRoad: false }, { key: 'prop-sp-ufo', size: 54, count: 5, margin: 8, nearRoad: false, spin: true }, { key: 'prop-sp-astronaut', size: 44, count: 6, margin: 8, nearRoad: false, spin: true }, { key: 'prop-sp-comet', size: 80, count: 3, margin: 8, nearRoad: false, spin: true }, { key: 'prop-sp-moon', size: 90, count: 2, margin: 8, nearRoad: false }],
  },
];

const BY_TRACK: Record<string, Theme['id']> = { classico: 'relva', triangulo: 'deserto', losango: 'neve', tecnico: 'cidade', canal: 'agua', caramelo: 'doces', orbita: 'espaco' };

/** Tema de uma pista. Pistas desconhecidas (registos antigos) ficam com relva. */
export function themeForTrack(trackId: string): Theme {
  return THEMES.find((t) => t.id === BY_TRACK[trackId]) ?? THEMES[0];
}

/** Chaves de textura de um tema. */
export function themeKeys(t: Theme): string[] {
  const s = t.suffix ? `-${t.suffix}` : '';
  return [`bg${t.suffix ? s : '-grass'}`, `track-asphalt${s}`, `track-curb${s}`, ...(t.suffix ? [`prop-grandstand${s}`] : []), ...t.props.map((p) => p.key), ...(t.vehicle === 'barco' ? [...carsOfCat('barco').map((c) => c.key), 'fx-wake', 'fx-splash'] : []), ...(t.vehicle === 'nave' ? [...carsOfCat('nave').map((c) => c.key), 'fx-trail-space'] : [])];
}

/** Categoria de veículo de uma pista (água = barcos; espaço = naves; o resto, carros). */
export const vehicleForTrack = (trackId: string): Category => themeForTrack(trackId).vehicle;
