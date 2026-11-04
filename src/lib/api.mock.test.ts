// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { QuizRow } from './types';

const store = new Map<string, string>();
beforeAll(() => {
  Object.assign(globalThis, {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  });
});

const quizOf = (id: string): QuizRow => ({ id, title: id, year: null, topic: null, version: 1, questionCount: 5, lastPlayed: null });
const record = (game_id: string) => ({ game_id, class_id: null, quiz_id: 'qa', quiz_version: 1, timeline: [], final_position: 1, finish_time_ms: 1000 });

describe('base de dados falsa: vários jogos na mesma sala', () => {
  it('o jogo seguinte mantém sala, PIN e alunos; respostas e relatório são por jogo', async () => {
    const { mockApi: api } = await import('./api.mock');
    const s1 = await api.createSession(quizOf('qa'), null, { botField: 'medio' });
    expect(s1.game_number).toBe(1);
    const joined = await api.joinSession(s1.pin, 'Ana', 'device-token-1');
    expect(joined.session_id).toBe(s1.id);

    await expect(api.createGame(s1.id, quizOf('qb'), { botField: 'medio' })).rejects.toThrow('ainda não terminou');

    // jogo 1: uma resposta, resultado, fim
    await api.saveAnswers([{ game_id: s1.game_id, question_id: 'q1', player_id: joined.player_id, value: 1, correct: true, ms_taken: 10 }]);
    await api.saveRaceRecord(record(s1.game_id));
    await api.updateGame(s1.game_id, { status: 'finished' });
    await expect(api.joinSession(s1.pin, 'Ana', 'device-token-1')).rejects.toThrow('PIN inválido'); // sala fechada entre jogos, como antes

    // jogo 2, mesmo quiz e mesma pergunta: não choca com a resposta do jogo 1
    const s2 = await api.createGame(s1.id, quizOf('qa'), { botField: 'facil' });
    expect(s2.id).toBe(s1.id);
    expect(s2.pin).toBe(s1.pin);
    expect(s2.game_number).toBe(2);
    expect(s2.game_id).not.toBe(s1.game_id);
    expect(s2.status).toBe('lobby');
    expect(s2.settings.botField).toBe('facil');
    expect((await api.getSession(s1.id)).game_id).toBe(s2.game_id);

    // a mesma alcunha/aluno volta com o mesmo player_id
    const again = await api.joinSession(s1.pin, 'Ana', 'device-token-1');
    expect(again.player_id).toBe(joined.player_id);

    await api.saveAnswers([{ game_id: s2.game_id, question_id: 'q1', player_id: joined.player_id, value: 0, correct: false, ms_taken: 20 }]);
    expect(await api.loadAnswers(s1.game_id)).toHaveLength(1);
    expect(await api.loadAnswers(s2.game_id)).toHaveLength(1);
    expect((await api.loadAnswers(s1.game_id))[0].correct).toBe(true);

    await api.updateGame(s2.game_id, { status: 'running' });
    expect((await api.listOpenSessions()).map((x) => x.game_number)).toEqual([2]);
    await api.abortSession(s1.id);
    expect((await api.listOpenSessions())).toEqual([]);
    expect((await api.getSession(s1.id)).status).toBe('aborted');
  });

  it('quem saiu a meio só volta no lobby; o expulso nunca', async () => {
    const { mockApi: api } = await import('./api.mock');
    const s = await api.createSession(quizOf('qa'), null, { botField: 'medio' });
    const a = await api.joinSession(s.pin, 'Rui', 'device-token-2');
    const b = await api.joinSession(s.pin, 'Eva', 'device-token-3');
    await api.updateGame(s.game_id, { status: 'running' });
    await api.leavePlayer(a.player_id);
    await api.kickPlayer(b.player_id);
    expect((await api.listPlayers(s.id)).map((p) => [p.nickname, p.left, p.kicked])).toEqual([['Rui', true, false], ['Eva', false, true]]);
    await expect(api.joinSession(s.pin, 'Rui', 'device-token-2')).rejects.toThrow('já começou');
    await api.updateGame(s.game_id, { status: 'finished' });
    await api.createGame(s.id, quizOf('qa'), { botField: 'medio' });
    await api.joinSession(s.pin, 'Rui', 'device-token-2'); // lobby: volta
    await expect(api.joinSession(s.pin, 'Eva', 'device-token-3')).rejects.toThrow('Removido');
    expect((await api.listPlayers(s.id)).find((p) => p.nickname === 'Rui')?.left).toBe(false);
  });
});
