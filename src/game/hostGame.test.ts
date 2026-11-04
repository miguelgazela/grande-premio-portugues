// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Api } from '../lib/api';
import type { QuestionRow, SessionRow } from '../lib/types';

beforeAll(() => {
  Object.assign(globalThis, {
    window: { setInterval: () => 0, setTimeout: () => 0 },
    document: { addEventListener: () => {}, removeEventListener: () => {} },
  });
});

const questions = Array.from({ length: 6 }, (_, i) => ({
  id: `q${i}`, position: i + 1, prompt: `P${i}`, type: 'multiple_choice', payload: { options: ['a', 'b', 'c', 'd'] }, correct: { index: 1 }, time_limit: 20, explanation: null,
})) as QuestionRow[];
const session = { id: 's1', game_id: 'g1', game_number: 1, settings: { botField: 'medio' }, state: null, status: 'lobby' } as unknown as SessionRow;

async function setup() {
  const { HostGame } = await import('./hostGame');
  const sent: unknown[] = [];
  const api = { openChannel: () => ({ send: (m: unknown) => sent.push(m), close() {} }), listPlayers: async () => [], kickPlayer: async () => {}, renamePlayer: vi.fn(async (_id: string, n: string) => n.trim()), saveAnswers: async () => {}, updateGame: async () => {}, leavePlayer: async () => {}, removePlayer: async () => {} } as unknown as Api;
  const g = new HostGame(api, session, questions);
  const priv = g as unknown as {
    snap: { players: unknown[]; phase: string };
    roster: unknown[];
    startQuestion(i: number): void;
    onMessage(m: unknown): void;
    channel: unknown;
    answers: Map<string, unknown>;
    qElapsed: number;
  };
  priv.snap.players = [{ id: 'p1', nickname: 'Ana', kicked: false, left: false }, { id: 'p2', nickname: 'Rui', kicked: false, left: false }];
  priv.roster = [...priv.snap.players];
  priv.channel = { send: (m: unknown) => sent.push(m), close() {} };
  priv.startQuestion(0);
  return { g, priv, sent, api };
}
const ans = (player_id: string, question_id: string, value: unknown) => ({ event: 'answer', payload: { player_id, question_id, value } });

describe('HostGame: validação das respostas', () => {
  it('conta a primeira resposta válida e ignora a repetida', async () => {
    const { priv } = await setup();
    priv.onMessage(ans('p1', 'q0', 1));
    priv.onMessage(ans('p1', 'q0', 2));
    expect(priv.answers.size).toBe(1);
  });
  it('ignora alunos não registados, perguntas erradas, payloads inválidos e enormes', async () => {
    const { priv } = await setup();
    priv.onMessage(ans('intruso', 'q0', 1));
    priv.onMessage(ans('p1', 'q3', 1)); // não está ativa
    priv.onMessage(ans('p1', 'q0', 99)); // fora das opções
    priv.onMessage(ans('p1', 'q0', 'x'.repeat(5000)));
    priv.onMessage(ans('p1', 'q0', { a: [] }));
    priv.onMessage({ event: 'answer', payload: null });
    priv.onMessage({ event: 'answer' });
    priv.onMessage(null);
    expect(priv.answers.size).toBe(0);
  });
  it('ignora respostas fora do tempo e sem pergunta ativa', async () => {
    const { priv } = await setup();
    priv.qElapsed = 20.5;
    priv.onMessage(ans('p2', 'q0', 1));
    expect(priv.answers.size).toBe(0);
    priv.qElapsed = 1;
    priv.snap.phase = 'reveal';
    priv.onMessage(ans('p2', 'q0', 1));
    expect(priv.answers.size).toBe(0);
  });
  it('descarta rajadas de um aluno', async () => {
    const { priv } = await setup();
    // 30 mensagens seguidas: o balde (12) esvazia-se, mas uma resposta válida já foi contada.
    for (let i = 0; i < 30; i++) priv.onMessage({ event: 'hello', payload: { player_id: 'p1' } });
    priv.onMessage(ans('p1', 'q0', 1));
    expect(priv.answers.size).toBe(0);
  });
  it('expulso: deixa de contar e perde a resposta dada', async () => {
    const { g, priv } = await setup();
    priv.onMessage(ans('p2', 'q0', 1));
    expect(priv.answers.size).toBe(1);
    await g.kick('p2');
    expect(priv.answers.size).toBe(0);
    priv.onMessage(ans('p2', 'q0', 1)); // já não está na lista
    expect(priv.answers.size).toBe(0);
  });
});

describe('HostGame: renomear', () => {
  it('só no lobby, atualiza a lista e avisa o aluno', async () => {
    const { g, priv, sent } = await setup();
    priv.snap.phase = 'lobby';
    expect(await g.rename('p1', ' Ana Maria ')).toBe('Ana Maria');
    expect(g.getSnapshot().players.map((p) => p.nickname)).toEqual(['Ana Maria', 'Rui']);
    expect(sent).toContainEqual({ event: 'renamed', payload: { player_id: 'p1', nickname: 'Ana Maria' } });
    priv.snap.phase = 'question';
    expect(await g.rename('p1', 'Outra')).toBeNull();
  });
});

describe('HostGame: voto no carro', () => {
  it('conta o voto do vote e do hello; ignora formatos antigos; o lobby não leva o carro', async () => {
    const { g, priv, sent } = await setup();
    priv.snap.phase = 'lobby';
    priv.onMessage({ event: 'hello', payload: { player_id: 'p1', car: 'car-van-yellow' } });
    expect(g.getSnapshot().team.car).toBe('car-van-yellow');
    priv.onMessage({ event: 'vote', payload: { player_id: 'p2', car: 'car-red' } });
    priv.onMessage({ event: 'vote', payload: { player_id: 'p3', car: 'car-red' } });
    expect(g.getSnapshot().team.car).toBe('car-red');
    expect(g.getSnapshot().voters).toBe(3);
    const before = sent.length;
    priv.onMessage({ event: 'vote', payload: { player_id: 'p3', car: 'car-red' } }); // repetido: nada
    priv.onMessage({ event: 'vote', payload: { player_id: 'p4', color: 'red' } }); // formato antigo
    priv.onMessage({ event: 'hello', payload: { player_id: 'p5', car: 'car-inexistente' } });
    expect(g.getSnapshot().voters).toBe(3);
    expect(sent.slice(before).filter((m) => (m as { event: string }).event === 'vote')).toEqual([]);
    for (const m of sent as { event: string; payload: object }[]) if (m.event === 'lobby') expect(m.payload).toEqual({ count: expect.any(Number), game: 1 });
  });
});

describe('HostGame: re-sincronização', () => {
  const evs = (sent: unknown[]) => (sent as { event: string }[]).map((m) => m.event);

  it('o beacon repete a pergunta atual com o tempo que falta', async () => {
    const { priv, sent } = await setup();
    priv.qElapsed = 5;
    sent.length = 0;
    (priv as unknown as { beacon(): void }).beacon();
    const q = sent[0] as { event: string; payload: { question_id: string; time: number } };
    expect(q.event).toBe('question');
    expect(q.payload.question_id).toBe('q0');
    expect(q.payload.time).toBe(15);
  });

  it('o beacon não envia nada fora do jogo (ex.: terminado)', async () => {
    const { priv, sent } = await setup();
    priv.snap.phase = 'finished';
    sent.length = 0;
    (priv as unknown as { beacon(): void }).beacon();
    expect(sent).toEqual([]);
  });

  it('um hello apanhado pelo limite de 1 s recebe o estado logo a seguir', async () => {
    const { priv, sent } = await setup();
    const timers: (() => void)[] = [];
    (globalThis as unknown as { window: { setTimeout: unknown } }).window.setTimeout = (f: () => void) => timers.push(f);
    (priv as unknown as { resync(force: boolean): void }).resync(true);
    sent.length = 0;
    priv.onMessage({ event: 'hello', payload: { player_id: 'p1' } }); // dentro de 1 s: adiado, não perdido
    expect(evs(sent)).toEqual([]);
    expect(timers).toHaveLength(1);
    timers[0]();
    expect(evs(sent)).toEqual(['question']);
  });
});

describe('HostGame: vários jogos na mesma sala', () => {
  it('o lobby, a pergunta e o fim levam o nº do jogo', async () => {
    const { priv, sent } = await setup();
    const withGame = (ev: string) => (sent as { event: string; payload: { game?: number } }[]).filter((m) => m.event === ev).every((m) => m.payload.game === 1);
    (priv as unknown as { resync(force: boolean): void }).resync(true);
    expect(withGame('question')).toBe(true);
    expect((sent as { event: string }[]).some((m) => m.event === 'question')).toBe(true);
  });

  it('quem sai a meio do jogo fica de fora dele mas não é expulso (pode voltar no seguinte)', async () => {
    const { priv, api } = await setup();
    const leave = vi.fn(async () => {});
    const kick = vi.fn(async () => {});
    Object.assign(api, { leavePlayer: leave, kickPlayer: kick });
    priv.snap.phase = 'question';
    priv.onMessage({ event: 'leave', payload: { player_id: 'p1' } });
    await Promise.resolve();
    expect(leave).toHaveBeenCalledWith('p1');
    expect(kick).not.toHaveBeenCalled();
  });

  it('no ecrã final, sair ou expulsar não manda `lobby` (tirava os alunos do resultado)', async () => {
    const { g, priv, sent } = await setup();
    priv.snap.phase = 'finished';
    sent.length = 0;
    await g.kick('p1');
    expect((sent as { event: string }[]).map((m) => m.event)).not.toContain('lobby');
  });
});
