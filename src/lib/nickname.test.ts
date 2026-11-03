import { describe, expect, it } from 'vitest';
import { checkNickname, cleanNickname, isBlocked } from './nickname';

describe('cleanNickname', () => {
  it('apara, junta espaços e tira controlo/invisíveis', () => {
    expect(cleanNickname('  Ana   Maria ')).toBe('Ana Maria');
    expect(cleanNickname('A\u0000n​a‮')).toBe('Ana');
    expect(cleanNickname('a\t\nb')).toBe('a b');
  });
});

describe('filtro de alcunhas', () => {
  const bad = [
    'puta', 'PUTA', 'Pu7a', 'put4', 'p.u.t.a', 'p u t a', 'p_u_t_a', 'puuuuta', 'putaaa', 'puta123', 'puta1', 'putas',
    'caralho', 'karalho', 'c4r4lh0', 'carraalho', 'Caralhito', 'foda-se', 'fodase', 'fod4-se', 'FODA', 'merda', 'm3rd4', 'mérda',
    'filho da puta', 'filhodaputa', 'fdp', 'F.D.P', 'vai tomar no cu', 'cu', 'c u', 'paneleiro', 'p4nel31ro', 'cabrão', 'cabr@o',
    'fuck', 'fuuck', 'sh1t', 'b1tch', 'a$$hole', 'nigga', 'Hitler', 'hitler 88',
    'Idiota', 'imbecil', 'pila', 'MERDA!!!',
  ];
  const good = [
    'Cássio', 'Analisa', 'Pitágoras', 'Raquel', 'Cunha', 'Cuca', 'Scunthorpe', 'Computador', 'Pilar', 'Peniche', 'Mandarim',
    'Assunção', 'Sexta', 'Conan', 'Concha', 'Lucas', 'Marcos', 'Pinto', 'Puto', 'Rabelo', 'Ana 2', 'Ana Rita', 'João', 'Inês',
    'Beatriz', 'Tiago', 'Dinis', 'Cassandra', 'Anália', 'Fonseca', 'Caracol', 'Carolina', 'Mérida', 'Tracy', 'Fodora',
    'Tomás', 'Matilde', 'Bruna', 'Cláudia', 'Rafael', 'Leonor', 'Cunhal', 'Escudo', 'Cubo', 'Pita', 'Pitu', 'Put',
    'Cusco', 'Conceição', 'Margarida', 'Sara', 'Penélope', 'Análise', 'Hipólito', 'Mestre', 'Ás', 'X Æ A-12',
  ];
  it.each(bad)('recusa %s', (n) => expect(isBlocked(n)).toBe(true));
  it.each(good)('aceita %s', (n) => expect(isBlocked(n)).toBe(false));
});

describe('checkNickname', () => {
  it('devolve a alcunha limpa', () => expect(checkNickname('  Ana  ')).toEqual({ ok: true, nick: 'Ana' }));
  it('tamanho', () => {
    expect(checkNickname('')).toMatchObject({ ok: false, error: 'Alcunha inválida' });
    expect(checkNickname('a'.repeat(21))).toMatchObject({ ok: false, error: 'Alcunha inválida' });
    expect(checkNickname('a'.repeat(20)).ok).toBe(true);
  });
  it('recusada: mensagem clara e sem repetir a palavra', () => {
    const r = checkNickname('caralho');
    expect(r).toEqual({ ok: false, error: 'Escolhe outra alcunha' });
  });
});
