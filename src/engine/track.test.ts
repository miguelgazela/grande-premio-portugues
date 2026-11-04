import { describe, expect, it } from 'vitest';
import { HIDDEN_TRACK_IDS, SELECTABLE_TRACKS, TRACKS, trackFor } from './track';

describe('temas escondidos', () => {
  it('as pistas escondidas não são escolhíveis nem sorteadas', () => {
    expect(SELECTABLE_TRACKS.some((t) => HIDDEN_TRACK_IDS.includes(t.id))).toBe(false);
    for (let i = 0; i < 200; i++) expect(HIDDEN_TRACK_IDS).not.toContain(trackFor(`sessao-${i}`).id);
  });

  it('continuam definidas para sessões já criadas', () => {
    for (const id of HIDDEN_TRACK_IDS) expect(TRACKS.some((t) => t.id === id)).toBe(true);
  });
});
