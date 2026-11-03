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
const session = { id: 's1', settings: { botField: 'medio' }, state: null, status: 'lobby' } as unknown as SessionRow;

async function setup() {
  const { HostGame } = await import('./hostGame');
  const sent: unknown[] = [];
  const api = { openChannel: () => ({ send: (m: unknown) => sent.push(m), close() {} }), listPlayers: async () => [], kickPlayer: async () => {}, renamePlayer: vi.fn(async (_id: string, n: string) => n.trim()), saveAnswers: async () => {}, updateSession: async () => {} } as unknown as Api;
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
  priv.snap.players = [{ id: 'p1', nickname: 'Ana', kicked: false }, { id: 'p2', nickname: 'Rui', kicked: false }];
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
