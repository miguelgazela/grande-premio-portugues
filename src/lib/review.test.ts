import { describe, expect, it } from 'vitest';
import {
  buildReviewSettings, compareReview, improved, lastSessions, questionStats, repeatSettings, reviewTitle, selectFailed, stillFailing,
  type FailureStat,
} from './review';
import type { AnswerRow, ReviewQuestion, ReviewSession } from './types';

const mc = (id: string, quiz = 'q1', over: Record<string, unknown> = {}): ReviewQuestion => ({
  id, position: 1, prompt: `Pergunta ${id}`, time_limit: 20, explanation: null, type: 'multiple_choice', payload: { options: ['a', 'b'] }, correct: { index: 0 },
  quiz_id: quiz, quiz_version: 1, quiz_title: `Quiz ${quiz}`, archived: false, ...over,
} as ReviewQuestion);
const ans = (question_id: string, player: string, value: number, game_id = 's1'): AnswerRow => ({ game_id, question_id, player_id: player, value, correct: value === 0, ms_taken: 1000 });
const sess = (id: string, created_at: string, answers: AnswerRow[], status: ReviewSession['status'] = 'finished'): ReviewSession => ({
  id, created_at, status, quiz_id: 'q1', quiz_title: 'Quiz q1', review: false, answers,
});

describe('questionStats', () => {
  it('calcula a % de acerto por pergunta', () => {
    const s = sess('s1', '2026-11-01', [ans('a', 'p1', 0), ans('a', 'p2', 1), ans('a', 'p3', 1), ans('a', 'p4', 1), ans('b', 'p1', 0), ans('b', 'p2', 0)]);
    const { stats } = questionStats([s], [mc('a'), mc('b')]);
    expect(stats.find((x) => x.id === 'a')!.pct).toBeCloseTo(0.25);
    expect(stats.find((x) => x.id === 'b')!.pct).toBe(1);
    expect(stats.find((x) => x.id === 'a')!.sessions).toBe(1);
  });

  it('junta várias sessões da mesma pergunta', () => {
    const s1 = sess('s1', '2026-11-01', [ans('a', 'p1', 0, 's1'), ans('a', 'p2', 1, 's1')]);
    const s2 = sess('s2', '2026-11-02', [ans('a', 'p1', 1, 's2'), ans('a', 'p2', 1, 's2')]);
    const a = questionStats([s1, s2], [mc('a')]).stats[0];
    expect(a.answers).toBe(4);
    expect(a.sessions).toBe(2);
    expect(a.pct).toBeCloseTo(0.25);
  });

  it('versões diferentes têm ids diferentes: ficam separadas e com o conteúdo da versão jogada', () => {
    const v1 = mc('a-v1', 'q1', { prompt: 'Enunciado antigo', quiz_version: 1 });
    const v2 = mc('a-v2', 'q1', { prompt: 'Enunciado novo', quiz_version: 2 });
    const s1 = sess('s1', '2026-11-01', [ans('a-v1', 'p1', 1)]);
    const s2 = sess('s2', '2026-11-02', [ans('a-v2', 'p1', 0, 's2')]);
    const { stats } = questionStats([s1, s2], [v1, v2]);
    expect(stats.map((x) => [x.id, x.prompt, x.pct])).toEqual([['a-v1', 'Enunciado antigo', 0], ['a-v2', 'Enunciado novo', 1]]);
  });

  it('ignora sessões aborted', () => {
    const ok = sess('s1', '2026-11-01', [ans('a', 'p1', 0)]);
    const bad = sess('s2', '2026-11-02', [ans('a', 'p1', 1, 's2'), ans('a', 'p2', 1, 's2')], 'aborted');
    const a = questionStats([ok, bad], [mc('a')]).stats[0];
    expect(a.answers).toBe(1);
    expect(a.pct).toBe(1);
  });

  it('perguntas apagadas ou de quizzes arquivados saem das estatísticas e contam em skipped', () => {
    const s = sess('s1', '2026-11-01', [ans('a', 'p1', 1), ans('gone', 'p1', 1), ans('arch', 'p1', 1)]);
    const { stats, skipped } = questionStats([s], [mc('a'), mc('arch', 'q2', { archived: true })]);
    expect(stats.map((x) => x.id)).toEqual(['a']);
    expect(skipped).toBe(2);
  });

  it('respostas parciais contam por fração e sem valor vale o correct', () => {
    const order: ReviewQuestion = { ...mc('o'), type: 'order', payload: { items: ['x', 'y', 'z', 'w'] }, correct: {} } as ReviewQuestion;
    const half: AnswerRow = { game_id: 's1', question_id: 'o', player_id: 'p1', value: [0, 1, 3, 2], correct: false, ms_taken: 1 };
    const none: AnswerRow = { game_id: 's1', question_id: 'o', player_id: 'p2', value: null, correct: true, ms_taken: 1 };
    const o = questionStats([sess('s1', '2026-11-01', [half, none])], [order]).stats[0];
    expect(o.pct).toBeCloseTo((0.5 + 1) / 2);
  });
});

describe('lastSessions', () => {
  it('devolve as N terminadas mais recentes', () => {
    const list = [sess('a', '2026-11-01', []), sess('b', '2026-11-03', []), sess('c', '2026-11-02', []), sess('d', '2026-11-04', [], 'aborted'), sess('e', '2026-11-05', [], 'running')];
    expect(lastSessions(list, 2).map((s) => s.id)).toEqual(['b', 'c']);
  });
});

describe('selectFailed', () => {
  const st = (id: string, pct: number, answers = 10): FailureStat => ({ id, prompt: id, quizId: 'q', quizTitle: 'Q', pct, answers, sessions: 1 });
  it('só abaixo do limiar, da pior para a melhor', () => {
    const stats = [st('a', 0.7), st('b', 0.2), st('c', 0.59), st('d', 0.6), st('e', 0.4)];
    expect(selectFailed(stats, 0.6, 12)).toEqual(['b', 'e', 'c']);
  });
  it('desempata pelas respostas e respeita o máximo', () => {
    const stats = [st('a', 0.3, 5), st('b', 0.3, 20), ...Array.from({ length: 40 }, (_, i) => st(`x${i}`, 0.5))];
    expect(selectFailed(stats, 0.6, 12).slice(0, 2)).toEqual(['b', 'a']);
    expect(selectFailed(stats, 0.6, 12)).toHaveLength(12);
    expect(selectFailed(stats, 0.6, 99)).toHaveLength(30);
    expect(selectFailed(stats, 0.6, 1)).toHaveLength(5);
  });
  it('limiar configurável', () => {
    const stats = [st('a', 0.7), st('b', 0.5)];
    expect(selectFailed(stats, 0.8, 12)).toEqual(['b', 'a']);
    expect(selectFailed(stats, 0.4, 12)).toEqual([]);
  });
});

describe('comparação da revisão', () => {
  const review = buildReviewSettings('9ºB', ['a', 'b', 'c'], 0.6, { a: { pct: 0.4, sessions: 2 }, b: { pct: 0.5, sessions: 1 }, c: { pct: 0.2, sessions: 3 } });
  const qs = [{ id: 'a', prompt: 'A' }, { id: 'b', prompt: 'B' }, { id: 'c', prompt: 'C' }];
  const result = compareReview(review, qs, new Map([['a', 0.75], ['b', 0.3], ['c', 0.9]]));
  it('separa melhoradas e ainda falhadas', () => {
    expect(improved(result).map((i) => i.id)).toEqual(['a', 'c']);
    expect(stillFailing(result).map((i) => [i.id, i.before, i.after])).toEqual([['b', 0.5, 0.3]]);
  });
  it('repetir só as que ainda falham, com o novo "antes"', () => {
    const next = repeatSettings(review, result)!;
    expect(next.questionIds).toEqual(['b']);
    expect(next.before.b.pct).toBe(0.3);
    expect(next.title).toBe(reviewTitle('9ºB', 1));
  });
  it('sem falhadas não há repetição', () => {
    const all = compareReview(review, qs, new Map([['a', 1], ['b', 1], ['c', 1]]));
    expect(repeatSettings(review, all)).toBeNull();
  });
  it('título', () => expect(reviewTitle('9ºB', 12)).toBe('Revisão · 9ºB · 12 perguntas'));
});
