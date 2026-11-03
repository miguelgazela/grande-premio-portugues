import { describe, expect, it } from 'vitest';
import { ALL_EXAMPLE_QUIZZES, toBody } from '../data/exampleQuizzes';
import { outcomeFromAnswers } from '../engine/outcome';
import { scoreRace } from '../engine/scoring';
import { grade, normalizeAnswer, prepare, shuffledIndices, solutionOf, toCanonical, tokenize } from './questions';
import { blankQuestion, questionProblems } from './quizEdit';
import { buildReport } from './report';
import type { AnswerRow, QuestionBody, QuestionRow } from './types';

const mk = (body: QuestionBody, id = 'q'): QuestionRow => ({ id, position: 1, prompt: 'P', time_limit: 20, explanation: null, ...body }) as QuestionRow;

const order = mk({ type: 'order', payload: { items: ['a', 'b', 'c', 'd'] }, correct: {} });
const match = mk({ type: 'match', payload: { left: ['L0', 'L1', 'L2'], right: ['R0', 'R1', 'R2'] }, correct: {} });
const tap = mk({ type: 'tap_word', payload: { sentence: 'Os alunos leram o poema.' }, correct: { indices: [0, 1] } });
const cloze = mk({ type: 'complete', payload: { text: 'Eu ___ e tu ___.' }, correct: { accepted: [['fiz', 'fiz-o'], ['Estás']] } });
const tf = mk({ type: 'true_false', payload: {}, correct: { value: false } });

describe('shuffle e material público', () => {
  it('é determinístico e nunca a identidade', () => {
    expect(shuffledIndices(5, 7, 'x')).toEqual(shuffledIndices(5, 7, 'x'));
    for (let s = 0; s < 200; s++) expect(shuffledIndices(2, s, 'k')).toEqual([1, 0]);
  });
  it('o material público não leva soluções', () => {
    for (const quiz of ALL_EXAMPLE_QUIZZES) {
      for (const x of quiz.questions) {
        const q = mk(toBody(x));
        const json = JSON.stringify(prepare(q, 3).body);
        expect(json).not.toContain('"correct"');
        expect(json).not.toContain('"accepted"');
        expect(json).not.toContain('"indices"');
      }
    }
  });
  it('ordenar e correspondência chegam baralhados mas mapeiam de volta', () => {
    const o = prepare(order, 42);
    expect(o.body.type === 'order' && o.body.items).not.toEqual(['a', 'b', 'c', 'd']);
    const m = prepare(match, 42);
    const right = m.body.type === 'match' ? m.body.right : [];
    expect(right).not.toEqual(['R0', 'R1', 'R2']);
    // o aluno liga L_i ao R_i certo (em coordenadas públicas)
    const links = [0, 1, 2].map((i) => right.indexOf(`R${i}`));
    expect(grade(match, toCanonical(match, m, links)!)).toBe(1);
  });
});

describe('correção', () => {
  it('true_false', () => {
    expect(grade(tf, false)).toBe(1);
    expect(grade(tf, true)).toBe(0);
    expect(toCanonical(tf, prepare(tf, 1), 'x')).toBeNull();
  });
  it('tap_word: conjunto exato', () => {
    const p = prepare(tap, 1);
    expect(tokenize(tap.type === 'tap_word' ? tap.payload.sentence : '')).toHaveLength(5);
    expect(grade(tap, toCanonical(tap, p, [1, 0])!)).toBe(1);
    expect(grade(tap, toCanonical(tap, p, [0])!)).toBe(0);
    expect(grade(tap, toCanonical(tap, p, [0, 1, 2])!)).toBe(0);
    expect(toCanonical(tap, p, [9])).toBeNull();
  });
  it('order: fração de posições certas', () => {
    const p = prepare(order, 5);
    const perm = p.perm!;
    // o aluno põe tudo certo: ordem pública = posições dos itens 0,1,2,3
    const right = [0, 1, 2, 3].map((it) => perm.indexOf(it));
    expect(grade(order, toCanonical(order, p, right)!)).toBe(1);
    expect(grade(order, [1, 0, 2, 3])).toBe(0.5);
    expect(grade(order, [3, 2, 1, 0])).toBe(0);
    expect(toCanonical(order, p, [0, 0, 1, 2])).toBeNull();
  });
  it('match: fração de pares certos; -1 não conta', () => {
    expect(grade(match, [0, 1, -1])).toBeCloseTo(2 / 3);
    expect(grade(match, [1, 0, 2])).toBeCloseTo(1 / 3);
  });
  it('complete: normaliza maiúsculas, acentos e espaços; parcial por lacuna', () => {
    expect(normalizeAnswer('  ESTÁS. ')).toBe('estas');
    expect(grade(cloze, ['FIZ', 'estas'])).toBe(1);
    expect(grade(cloze, ['fiz-o', 'x'])).toBe(0.5);
    expect(grade(cloze, ['', ''])).toBe(0);
    expect(toCanonical(cloze, prepare(cloze, 1), ['só uma'])).toBeNull();
  });
  it('complete com lacuna vazia nas aceites não aceita resposta em branco', () => {
    const c = mk({ type: 'complete', payload: { text: 'a ___' }, correct: { accepted: [['x', '']] } });
    expect(grade(c, [''])).toBe(0);
  });
  it('a solução bate certo com a correção', () => {
    expect(solutionOf(order)).toEqual({ type: 'order', items: ['a', 'b', 'c', 'd'] });
    expect(solutionOf(cloze)).toEqual({ type: 'complete', answers: ['fiz', 'Estás'] });
  });
});

describe('crédito parcial na turma', () => {
  const ans = (id: string, credit: number, t = 0.1) => ({ playerId: id, answered: true, correct: credit === 1, credit, timeFrac: t });
  it('precisão = crédito médio', () => {
    const o = outcomeFromAnswers([ans('a', 1), ans('b', 0.5), ans('c', 0), { playerId: 'd', answered: false, correct: false, timeFrac: 1 }], 4);
    expect(o.accuracy).toBeCloseTo(1.5 / 4);
  });
  it('sem crédito explícito comporta-se como antes', () => {
    const o = outcomeFromAnswers([{ playerId: 'a', answered: true, correct: true, timeFrac: 0.1 }, { playerId: 'b', answered: true, correct: false, timeFrac: 0.1 }], 2);
    expect(o).toEqual({ accuracy: 0.5, speedBonus: 1 });
  });
  it('ranking: parcial dá pontos proporcionais, quebra a série e não conta como certa', () => {
    const q = (credit: number) => ({ answers: [ans('a', credit, 0)], teamAccuracy: 1 });
    const [s] = scoreRace(['a'], [q(1), q(0.5), q(1)]);
    // 150 (1ª, t=0) + 75 (parcial) + 150 (3ª: série recomeçou, sem bónus)
    expect(s.points).toBe(375);
    expect(s.correct).toBe(2);
    expect(s.partial).toBe(1);
    expect(s.bestStreak).toBe(1);
  });
});

describe('validação do editor por tipo', () => {
  it('perguntas em branco de cada tipo têm problemas', () => {
    for (const t of ['multiple_choice', 'true_false', 'tap_word', 'order', 'complete', 'excerpt', 'match'] as const) {
      const p = questionProblems(blankQuestion(1, t));
      expect(p).toContain('falta o enunciado');
      if (t !== 'true_false') expect(p.length).toBeGreaterThan(1);
    }
  });
  it('os exemplos da Fase 4 são todos válidos', () => {
    for (const quiz of ALL_EXAMPLE_QUIZZES) for (const x of quiz.questions) expect(questionProblems({ ...mk(toBody(x)), prompt: x.prompt })).toEqual([]);
  });
  it('lacuna com opções exige a certa entre elas', () => {
    const c = mk({ type: 'complete', payload: { text: 'a ___', options: ['x', 'y'] }, correct: { accepted: [['z']] } });
    expect(questionProblems(c)).toContain('a resposta certa tem de estar entre as opções');
  });
});

describe('relatório por tipo', () => {
  const row = (qid: string, pid: string, value: AnswerRow['value'], correct: boolean): AnswerRow => ({ session_id: 's', question_id: qid, player_id: pid, value, correct, ms_taken: 1 });
  it('parcial entra como fração e há erro mais comum', () => {
    const qs = [order, match, tap, cloze, tf].map((x, i) => ({ ...x, id: `t${i}` }) as QuestionRow);
    const r = buildReport(qs, [
      row('t0', 'a', [0, 1, 2, 3], true), row('t0', 'b', [1, 0, 2, 3], false), row('t0', 'c', [1, 0, 2, 3], false),
      row('t1', 'a', [0, 2, 1], false), row('t1', 'b', [0, 2, 1], false),
      row('t2', 'a', [0, 1], true), row('t2', 'b', [0, 1, 2], false), row('t2', 'c', [0], false),
      row('t3', 'a', ['fiz', 'estás'], true), row('t3', 'b', ['fiz', 'estas'], true), row('t3', 'c', ['fiz', 'estou'], false),
      row('t4', 'a', true, false), row('t4', 'b', true, false), row('t4', 'c', false, true),
    ], 3);
    expect(r.questions[0].accuracy).toBeCloseTo((1 + 0.5 + 0.5) / 3);
    expect(r.questions[0].commonError?.label).toContain('fora do sítio');
    expect(r.questions[1].commonError?.count).toBe(2);
    expect(r.questions[2].accuracy).toBeCloseTo(1 / 3);
    expect(r.questions[3].commonError?.label).toBe('«estou»');
    expect(r.questions[4].counts).toEqual([2, 1]);
    expect(r.questions[4].commonError?.label).toBe('Verdadeiro');
  });
});
