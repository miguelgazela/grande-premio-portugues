import { describe, expect, it } from 'vitest';
import { THEMES, themeForTrack, themeKeys } from '../engine/theme';
import { TRACKS } from '../engine/track';
import { DEFAULT_STYLE, TEAM_COLORS, carKeyFor, cleanVote, parseStyle, tally } from './teamStyle';

describe('teamStyle', () => {
  it('sem votos dá a cor por defeito', () => {
    expect(tally([]).style).toEqual(DEFAULT_STYLE);
  });
  it('escolhe a cor mais votada e conta quem votou', () => {
    const r = tally([{ color: TEAM_COLORS[1].value }, { color: TEAM_COLORS[1].value }, { color: TEAM_COLORS[2].value }]);
    expect(r.style).toEqual({ color: TEAM_COLORS[1].value });
    expect(r.count).toBe(3);
  });
  it('ignora votos inválidos (cores desconhecidas, nomes)', () => {
    expect(cleanVote({ name: 'Palavrão', color: 123 })).toEqual({});
    expect(cleanVote({ color: TEAM_COLORS[0].value })).toEqual({ color: TEAM_COLORS[0].value });
  });
  it('lê estilos gravados (inclusive os antigos com nome/modelo) e tolera lixo', () => {
    expect(parseStyle(undefined)).toEqual(DEFAULT_STYLE);
    expect(parseStyle({ name: 'X', model: 'cartype-van', color: TEAM_COLORS[3].value })).toEqual({ color: TEAM_COLORS[3].value });
    expect(carKeyFor(TEAM_COLORS[1].value)).toBe('car-red');
  });
});

describe('temas', () => {
  it('cada pista tem um tema fixo e pistas desconhecidas ficam com relva', () => {
    expect(new Set(TRACKS.map((t) => themeForTrack(t.id).id)).size).toBe(THEMES.length);
    expect(themeForTrack('antiga').id).toBe('relva');
  });
  it('as chaves de textura seguem o manifest', () => {
    expect(themeKeys(THEMES[0])).toContain('bg-grass');
    expect(themeKeys(THEMES[1])).toEqual(expect.arrayContaining(['bg-desert', 'track-asphalt-desert', 'track-curb-desert']));
  });
});
