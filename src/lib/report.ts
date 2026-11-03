import type { AnswerRow, QuestionRow } from './types';

export interface QuestionStat {
  index: number;
  prompt: string;
  options: string[];
  correct: number;
  /** Respostas por opção. */
  counts: number[];
  answered: number;
  noAnswer: number;
  /** Certas / respondidas (0–1); 0 se ninguém respondeu. */
  accuracy: number;
}

export interface Report {
  playerCount: number;
  questions: QuestionStat[];
  /** Média de respostas certas (0–1) sobre todas as respostas dadas. */
  avgAccuracy: number;
  /** Respostas dadas / (alunos × perguntas) (0–1). */
  participation: number;
  /** Perguntas mais falhadas (≤5), da pior para a melhor, só as que tiveram erros. */
  hardest: QuestionStat[];
}

/** Nunca por aluno: só agregados da turma. */
export function buildReport(questions: QuestionRow[], answers: AnswerRow[], playerCount: number): Report {
  const stats = questions.map((q, index): QuestionStat => {
    const rows = answers.filter((a) => a.question_id === q.id);
    const counts = q.options.map(() => 0);
    let right = 0;
    for (const a of rows) {
      if (a.value !== null && counts[a.value] !== undefined) counts[a.value]++;
      if (a.correct) right++;
    }
    return {
      index, prompt: q.prompt, options: q.options, correct: q.correct, counts,
      answered: rows.length, noAnswer: Math.max(0, playerCount - rows.length),
      accuracy: rows.length ? right / rows.length : 0,
    };
  });
  const given = stats.reduce((s, q) => s + q.answered, 0);
  const rightTotal = stats.reduce((s, q) => s + q.accuracy * q.answered, 0);
  const slots = playerCount * questions.length;
  return {
    playerCount,
    questions: stats,
    avgAccuracy: given ? rightTotal / given : 0,
    participation: slots ? Math.min(1, given / slots) : 0,
    hardest: stats.filter((q) => q.answered > 0 && q.accuracy < 1).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5),
  };
}

const LETTERS = ['A', 'B', 'C', 'D'];
const cell = (v: string | number) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV com ; (Excel PT) e BOM para os acentos abrirem bem. */
export function reportToCsv(r: Report): string {
  const head = ['N.º', 'Pergunta', 'Resposta certa', '% certas', 'Respondidas', 'Sem resposta', ...LETTERS.map((l) => `Opção ${l}`), 'Opção errada mais escolhida'];
  const lines = [head.map(cell).join(';')];
  for (const q of r.questions) {
    let worst = -1;
    q.counts.forEach((c, i) => {
      if (i !== q.correct && c > 0 && (worst < 0 || c > q.counts[worst])) worst = i;
    });
    lines.push(
      [
        q.index + 1, q.prompt, `${LETTERS[q.correct]}: ${q.options[q.correct]}`, Math.round(q.accuracy * 100), q.answered, q.noAnswer,
        ...LETTERS.map((_, i) => (i < q.options.length ? q.counts[i] : '')),
        worst >= 0 ? `${LETTERS[worst]}: ${q.options[worst]}` : '',
      ].map(cell).join(';'),
    );
  }
  lines.push('');
  lines.push(['Alunos', r.playerCount].map(cell).join(';'));
  lines.push(['% média de certas', Math.round(r.avgAccuracy * 100)].map(cell).join(';'));
  lines.push(['Participação %', Math.round(r.participation * 100)].map(cell).join(';'));
  return '﻿' + lines.join('\r\n');
}
