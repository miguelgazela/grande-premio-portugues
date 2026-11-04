import { describe, expect, it } from 'vitest';
import { THEMES, themeForTrack, themeKeys, vehicleForTrack } from '../engine/theme';
import { TRACKS, trackFor } from '../engine/track';
import { CARS, DEFAULT_STYLE, MODELS, botCars, carDef, carsOfCat, carsOfModel, cleanVote, defaultCar, modelsOf, modelDef, modelShowcase, parseStyle, tally } from './teamStyle';

describe('teamStyle', () => {
  it('sem votos dá o carro por defeito', () => {
    expect(tally([]).style).toEqual(DEFAULT_STYLE);
  });
  it('escolhe o carro mais votado e conta quem votou', () => {
    const r = tally([{ car: 'car-red' }, { car: 'car-red' }, { car: 'car-kart-green' }]);
    expect(r.style).toEqual({ car: 'car-red' });
    expect(r.count).toBe(3);
  });
  it('num empate sai um dos empatados, sempre o mesmo para o mesmo empate', () => {
    const votes = [{ car: 'car-van-yellow' }, { car: 'car-red' }];
    const a = tally(votes, 'sessao-1');
    expect(a.tie).toBe(true);
    expect(['car-van-yellow', 'car-red']).toContain(a.style.car);
    expect(tally(votes, 'sessao-1').style).toEqual(a.style); // estável
    expect(tally([...votes].reverse(), 'sessao-1').style).toEqual(a.style); // não depende da ordem dos votos
    const saidos = new Set(Array.from({ length: 40 }, (_, i) => tally(votes, `s${i}`).style.car));
    expect(saidos).toEqual(new Set(['car-van-yellow', 'car-red'])); // varia com a sessão, só entre os empatados
  });
  it('desempate: um voto a mais volta a escolher o mais votado', () => {
    const r = tally([{ car: 'car-van-yellow' }, { car: 'car-red' }, { car: 'car-van-yellow' }], 's');
    expect(r).toMatchObject({ style: { car: 'car-van-yellow' }, tie: false });
  });
  it('empate a 3 sorteia entre os 3', () => {
    const r = tally([{ car: 'car-red' }, { car: 'car-van-yellow' }, { car: 'car-kart-green' }], 's');
    expect(r.tie).toBe(true);
    expect(['car-red', 'car-van-yellow', 'car-kart-green']).toContain(r.style.car);
  });
  it('ignora votos inválidos', () => {
    expect(cleanVote({ car: 'car-inexistente' })).toEqual({});
    expect(cleanVote({ name: 'Palavrão' })).toEqual({});
    expect(cleanVote({ car: 'car-van-pink' })).toEqual({ car: 'car-van-pink' });
  });
  it('lê estilos gravados, inclusive o formato antigo com cor, e tolera lixo', () => {
    expect(parseStyle(undefined)).toEqual(DEFAULT_STYLE);
    expect(parseStyle({ car: 'car-rally-white' })).toEqual({ car: 'car-rally-white' });
    expect(parseStyle({ color: 0xe74c3c })).toEqual({ car: 'car-red' });
  });
  it('o catálogo tem chaves únicas e cada modelo novo tem 3 cores', () => {
    expect(new Set(CARS.map((c) => c.key)).size).toBe(CARS.length);
    expect(CARS.filter((c) => c.model === 'kart')).toHaveLength(3);
  });
  it('os bots têm cores distintas entre si e da turma', () => {
    const team = carDef('car-team')!;
    const bots = botCars(team.key, 6);
    expect(bots).toHaveLength(6);
    const colors = bots.map((b) => b.color);
    expect(new Set(colors).size).toBe(6);
    expect(colors).not.toContain(team.color);
    expect(new Set(bots.map((b) => b.model)).size).toBeGreaterThan(2);
  });
});

describe('barcos (tema água)', () => {
  it('a pista de água usa barcos e as outras carros', () => {
    expect(themeForTrack('canal').id).toBe('agua');
    expect(themeForTrack('canal').suffix).toBe('water');
    expect(vehicleForTrack('canal')).toBe('barco');
    for (const id of ['classico', 'triangulo', 'losango', 'tecnico', 'antiga']) expect(vehicleForTrack(id)).toBe('carro');
    expect(carsOfCat('barco').map((c) => c.key).sort()).toEqual(['boat-dragao', 'boat-lancha', 'boat-mota', 'boat-veleiro']);
    expect(modelsOf('barco').every((m) => m.colors.length === 1)).toBe(true);
  });
  it('o voto é validado contra a categoria', () => {
    expect(cleanVote({ car: 'boat-mota' }, 'barco')).toEqual({ car: 'boat-mota' });
    expect(cleanVote({ car: 'car-red' }, 'barco')).toEqual({});
    expect(cleanVote({ car: 'boat-mota' })).toEqual({});
    expect(cleanVote({ car: 'boat-mota' }, 'carro')).toEqual({});
  });
  it('sem votos fica o barco por defeito; registos antigos com carros dão um barco válido', () => {
    expect(tally([], 's', 'barco').style.car).toBe(defaultCar('barco'));
    expect(parseStyle({ car: 'car-red' }, 'barco')).toEqual({ car: 'boat-lancha' });
    expect(parseStyle({ car: 'boat-veleiro' }, 'barco')).toEqual({ car: 'boat-veleiro' });
    expect(parseStyle({ car: 'boat-veleiro' })).toEqual(DEFAULT_STYLE);
  });
  it('bots na água são todos barcos, mesmo havendo mais bots que barcos', () => {
    const bots = botCars('boat-lancha', 7, 'barco');
    expect(bots).toHaveLength(7);
    expect(bots.every((b) => b.cat === 'barco' && b.key !== 'boat-lancha')).toBe(true);
    expect(botCars('car-team', 6).every((b) => b.cat === 'carro')).toBe(true);
  });
  it('a pista sorteada por sessão nunca é a de água (sessões antigas mantêm a pista)', () => {
    for (let i = 0; i < 200; i++) expect(trackFor(`s${i}`).id).not.toBe('canal');
  });
  it('as chaves de textura do tema água incluem barcos e efeitos', () => {
    expect(themeKeys(themeForTrack('canal'))).toEqual(expect.arrayContaining(['bg-water', 'track-asphalt-water', 'track-curb-water', 'prop-w-whale', 'boat-lancha', 'fx-wake', 'fx-splash']));
  });
});

describe('temas', () => {
  it('cada pista tem um tema fixo e pistas desconhecidas ficam com relva', () => {
    expect(new Set(TRACKS.map((t) => themeForTrack(t.id).id)).size).toBe(THEMES.length);
    expect(THEMES).toHaveLength(5);
    expect(themeForTrack('antiga').id).toBe('relva');
  });
  it('as chaves de textura seguem o manifest', () => {
    expect(themeKeys(THEMES[0])).toContain('bg-grass');
    expect(themeKeys(THEMES[1])).toEqual(expect.arrayContaining(['bg-desert', 'track-asphalt-desert', 'track-curb-desert']));
  });
});

describe('escolha em 2 passos', () => {
  it('cada modelo agrupa as suas cores e os carros somam o catálogo', () => {
    for (const m of MODELS) {
      const cars = carsOfModel(m.id);
      expect(cars).toHaveLength(m.colors.length);
      expect(cars.every((c) => c.model === m.id)).toBe(true);
    }
    expect(MODELS.reduce((n, m) => n + carsOfModel(m.id).length, 0)).toBe(CARS.length);
    expect(carsOfModel('classico')).toHaveLength(8);
    expect(carsOfModel('coupe')).toHaveLength(3);
  });
  it('a montra e o modelo de um voto vêm do catálogo', () => {
    expect(modelShowcase('coupe')?.model).toBe('coupe');
    expect(modelDef(carDef('car-coupe-red')?.model)?.label).toBe('Coupé');
    expect(modelDef('x')).toBeUndefined();
  });
});
