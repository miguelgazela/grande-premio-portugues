import { describe, expect, it } from 'vitest';
import { raceConfigFor } from '../game/raceSettings';
import { blankQuestion, moveItem, questionProblems, removeOption } from './quizEdit';
import { buildReport, reportToCsv } from './report';
import type { AnswerRow, QuestionRow } from './types';

const q = (i: number, over: Partial<QuestionRow> = {}): QuestionRow => ({ id: `q${i}`, position: i + 1, prompt: `P${i}`, type: 'multiple_choice', payload: { options: ['a', 'b', 'c', 'd'] }, correct: { index: 1 }, time_limit: 20, explanation: null, ...over }) as QuestionRow;
const many = (n: number) => Array.from({ length: n }, (_, i) => q(i));

describe('raceConfigFor', () => {
  it('usa todas as perguntas, reta final no último terço', () => {
    const { config, used } = raceConfigFor(many(20));
    expect([config.questions, config.finalCount, used, config.questionTime]).toEqual([20, 7, 20, 20]);
  });
  it('tempo da sessão substitui o do quiz', () => {
    expect(raceConfigFor(many(6), { botField: 'medio', questionTime: 12 }).config.questionTime).toBe(12);
    expect(raceConfigFor([q(0, { time_limit: 15 }), q(1, { time_limit: 30 }), q(2)]).config.questionTime).toBe(30);
  });
  it('quizzes muito curtos', () => {
    expect(raceConfigFor(many(1)).config).toMatchObject({ questions: 1, finalCount: 1 });
    expect(raceConfigFor(many(2), { botField: 'medio' }).used).toBe(2);
  });
});

describe('validação do editor', () => {
  it('pergunta em branco tem problemas', () => {
    expect(questionProblems(blankQuestion()).length).toBeGreaterThan(1);
  });
  it('pergunta completa passa', () => {
    expect(questionProblems(q(0))).toEqual([]);
  });
  it('falta resposta certa', () => {
    expect(questionProblems(q(0, { correct: { index: -1 } }))).toContain('falta marcar a resposta certa');
  });
  it('remover opção ajusta a certa', () => {
    const idx = (x: QuestionRow) => (x.type === 'multiple_choice' ? x.correct.index : NaN);
    expect(idx(removeOption(q(0, { correct: { index: 2 } }), 0))).toBe(1);
    expect(idx(removeOption(q(0, { correct: { index: 1 } }), 1))).toBe(-1);
    const two = removeOption(q(0, { payload: { options: ['a', 'b'] } }), 0);
    expect(two.type === 'multiple_choice' && two.payload.options).toHaveLength(2);
  });
  it('moveItem', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});

describe('relatório', () => {
  const qs = [q(0), q(1)];
  const ans = (qi: number, pid: string, value: number | null, correct: boolean): AnswerRow => ({ session_id: 's', question_id: `q${qi}`, player_id: pid, value, correct, ms_taken: 1000 });
  const answers = [ans(0, 'a', 1, true), ans(0, 'b', 2, false), ans(0, 'c', 2, false), ans(1, 'a', 1, true)];
  const r = buildReport(qs, answers, 3);
  it('percentagens e distribuição', () => {
    expect(r.questions[0].accuracy).toBeCloseTo(1 / 3);
    expect(r.questions[0].counts).toEqual([0, 1, 2, 0]);
    expect(r.questions[1].noAnswer).toBe(2);
    expect(r.participation).toBeCloseTo(4 / 6);
    expect(r.hardest[0].index).toBe(0);
  });
  it('csv', () => {
    const csv = reportToCsv(r);
    expect(csv).toContain('C: c'); // opção errada mais escolhida
    expect(csv.split('\r\n')[0]).toContain('% certas');
  });
});
