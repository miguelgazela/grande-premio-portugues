import { Assets, type Texture } from 'pixi.js';

export const assetUrl = (file: string) => `${import.meta.env.BASE_URL}assets/${file}`;

/** Texturas necessárias à corrida. As que faltarem (ou o manifest inteiro) ficam de fora e o render usa formas. */
const RACE_KEYS = [
  'car-team', 'car-red', 'car-orange', 'car-purple', 'car-teal', 'car-pink', 'car-grey', 'car-green',
  'bg-grass', 'track-asphalt', 'track-curb',
  'prop-tree', 'prop-bush', 'prop-cone', 'prop-tires', 'prop-grandstand', 'prop-startline',
  'fx-turbo', 'fx-nitro', 'fx-smoke',
];

export type RaceTextures = Map<string, Texture>;

let cached: Promise<RaceTextures> | null = null;

export function loadRaceTextures(): Promise<RaceTextures> {
  cached ??= (async () => {
    const out: RaceTextures = new Map();
    try {
      const res = await fetch(assetUrl('manifest.json'));
      if (!res.ok) return out;
      const manifest = (await res.json()) as Record<string, { file: string }>;
      await Promise.allSettled(
        RACE_KEYS.filter((k) => manifest[k]).map(async (k) => {
          const tex = await Assets.load<Texture>(assetUrl(manifest[k].file));
          tex.source.autoGenerateMipmaps = true; // sprites 256px mostrados a ~32px: sem isto fica serrilhado
          tex.source.scaleMode = 'linear';
          out.set(k, tex);
        }),
      );
    } catch {
      /* sem manifest: placeholders */
    }
    return out;
  })();
  return cached;
}

/** Lista de avatares (chaves `avatar-*` do manifest). Vazia se não houver manifest. */
export async function loadAvatarKeys(): Promise<string[]> {
  try {
    const res = await fetch(assetUrl('manifest.json'));
    if (!res.ok) return [];
    return Object.keys((await res.json()) as Record<string, unknown>).filter((k) => k.startsWith('avatar-'));
  } catch {
    return [];
  }
}
