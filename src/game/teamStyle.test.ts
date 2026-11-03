import { describe, expect, it } from 'vitest';
import { THEMES, themeForTrack, themeKeys } from '../engine/theme';
import { TRACKS } from '../engine/track';
import { DEFAULT_STYLE, TEAM_COLORS, cleanVote, parseStyle, tally } from './teamStyle';

describe('teamStyle', () => {
  it('sem votos dá o estilo por defeito', () => {
    expect(tally([]).style).toEqual(DEFAULT_STYLE);
  });
  it('escolhe o mais votado por campo e conta quem votou', () => {
    const r = tally([{ color: TEAM_COLORS[1].value, name: 'Tigres' }, { color: TEAM_COLORS[1].value }, { color: TEAM_COLORS[2].value, model: 'cartype-kart' }]);
    expect(r.style).toEqual({ name: 'Tigres', color: TEAM_COLORS[1].value, model: 'cartype-kart' });
    expect(r.count).toBe(3);
  });
  it('ignora votos inválidos (nomes livres, cores e modelos desconhecidos)', () => {
    expect(cleanVote({ name: 'Palavrão', color: 123, model: 'x', extra: 1 })).toEqual({});
    expect(cleanVote({ name: 'Tigres', color: TEAM_COLORS[0].value })).toEqual({ name: 'Tigres', color: TEAM_COLORS[0].value });
  });
  it('lê estilos gravados e tolera lixo', () => {
    expect(parseStyle(undefined)).toEqual(DEFAULT_STYLE);
    expect(parseStyle({ name: '  Os   Craques ', color: TEAM_COLORS[3].value, model: 'cartype-van' })).toMatchObject({ color: TEAM_COLORS[3].value, model: 'cartype-van' });
  });
});

describe('temas', () => {
  it('cada pista tem um tema fixo e pistas desconhecidas ficam com relva', () => {
    for (const t of TRACKS) expect(themeForTrack(t.id)).toBe(themeForTrack(t.id));
    expect(new Set(TRACKS.map((t) => themeForTrack(t.id).id)).size).toBe(THEMES.length);
    expect(themeForTrack('antiga').id).toBe('relva');
  });
  it('as chaves de textura seguem o manifest', () => {
    expect(themeKeys(THEMES[0])).toContain('bg-grass');
    expect(themeKeys(THEMES[1])).toEqual(expect.arrayContaining(['bg-desert', 'track-asphalt-desert', 'track-curb-desert']));
  });
});
