import { Assets, type Texture } from 'pixi.js';
import { carsOfCat } from '../game/teamStyle';

export const assetUrl = (file: string) => `${import.meta.env.BASE_URL}assets/${file}`;

/** Texturas que todas as corridas usam. As que faltarem (ou o manifest inteiro) ficam de fora e o render usa formas. */
export const BASE_KEYS = [
  'car-grey', ...carsOfCat('carro').map((c) => c.key),
  'prop-cone', 'prop-tires', 'prop-grandstand', 'prop-startline',
  'fx-turbo', 'fx-nitro', 'fx-smoke',
];

export type RaceTextures = Map<string, Texture>;

type Manifest = Record<string, { file: string }>;
let manifestP: Promise<Manifest> | null = null;
const loaded = new Map<string, Promise<Texture | null>>();

function manifest(): Promise<Manifest> {
  manifestP ??= (async () => {
    try {
      const res = await fetch(assetUrl('manifest.json'));
      return res.ok ? ((await res.json()) as Manifest) : {};
    } catch {
      return {};
    }
  })();
  return manifestP;
}

/** Carrega (uma só vez por chave) as texturas pedidas; as que faltarem ficam de fora. */
export async function loadRaceTextures(extra: string[] = []): Promise<RaceTextures> {
  const m = await manifest();
  const out: RaceTextures = new Map();
  await Promise.all(
    [...new Set([...BASE_KEYS, ...extra])].filter((k) => m[k]).map(async (k) => {
      let p = loaded.get(k);
      if (!p) {
        p = Assets.load<Texture>(assetUrl(m[k].file)).then(
          (tex) => {
            tex.source.autoGenerateMipmaps = true; // sprites 256px mostrados a ~32px: sem isto fica serrilhado
            tex.source.scaleMode = 'linear';
            return tex;
          },
          () => null,
        );
        loaded.set(k, p);
      }
      const tex = await p;
      if (tex) out.set(k, tex);
    }),
  );
  return out;
}

/** Avatares retirados da escolha; continuam no manifest para quem ainda os tenha guardados. */
const RETIRED_AVATARS = new Set(['avatar-pig', 'avatar-frog', 'avatar-owl', 'avatar-elephant']);

/** Lista de avatares (chaves `avatar-*` do manifest, sem os retirados). Vazia se não houver manifest. */
export async function loadAvatarKeys(): Promise<string[]> {
  return Object.keys(await manifest()).filter((k) => k.startsWith('avatar-') && !RETIRED_AVATARS.has(k));
}
