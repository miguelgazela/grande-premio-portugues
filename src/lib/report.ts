import { TYPE_LABEL, grade, normalizeAnswer, tokenize } from './questions';
import type { AnswerRow, AnswerValue, QuestionRow, QuestionType } from './types';

const safeGrade = (q: QuestionRow, v: AnswerValue): number => {
  try {
    return grade(q, v);
  } catch {
    return 0; // valor de uma versão antiga do formato
  }
};

export interface QuestionStat {
  index: number;
  type: QuestionType;
  prompt: string;
  /** Só nos tipos com opções (escolha múltipla, excerto, V/F): senão vazio. */
  options: string[];
  correct: number;
  /** Respostas por opção. */
  counts: number[];
  answered: number;
  noAnswer: number;
  /** Crédito médio das respostas dadas (0–1; as parciais contam por fração); 0 se ninguém respondeu. */
  accuracy: number;
  /** O erro mais comum, em texto; null se não houve erros. */
  commonError: { label: string; count: number } | null;
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

const top = (m: Map<string, number>): { label: string; count: number } | null => {
  let best: { label: string; count: number } | null = null;
  for (const [label, count] of m) if (!best || count > best.count) best = { label, count };
  return best;
};
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** O erro mais comum de uma pergunta, a partir das respostas (valores canónicos) com crédito < 1. */
function commonErrorOf(q: QuestionRow, values: AnswerValue[]): QuestionStat['commonError'] {
  const wrong = values.filter((v) => grade(q, v) < 1);
  if (!wrong.length) return null;
  const m = new Map<string, number>();
  switch (q.type) {
    case 'multiple_choice':
    case 'excerpt':
      for (const v of wrong) bump(m, `${LETTERS[v as number]}: ${q.payload.options[v as number]}`);
      break;
    case 'true_false':
      for (const v of wrong) bump(m, v ? 'Verdadeiro' : 'Falso');
      break;
    case 'tap_word': {
      const words = tokenize(q.payload.sentence);
      for (const v of wrong as number[][]) {
        for (const i of v) if (!q.correct.indices.includes(i)) bump(m, `«${words[i]}» marcada por engano`);
        for (const i of q.correct.indices) if (!v.includes(i)) bump(m, `«${words[i]}» esquecida`);
      }
      break;
    }
    case 'order':
      for (const v of wrong as number[][]) v.forEach((item, pos) => item !== pos && bump(m, `«${q.payload.items[pos]}» fora do sítio`));
      break;
    case 'match':
      for (const v of wrong as number[][]) v.forEach((r, i) => r !== i && r >= 0 && bump(m, `«${q.payload.left[i]}» ligado a «${q.payload.right[r]}»`));
      break;
    case 'complete':
      for (const v of wrong as string[][]) v.forEach((t, b) => {
        if (!q.correct.accepted[b]?.some((x) => normalizeAnswer(x) === normalizeAnswer(t))) bump(m, t.trim() ? `«${t.trim()}»` : '(em branco)');
      });
      break;
  }
  return top(m);
}

/** Nunca por aluno: só agregados da turma. */
export function buildReport(questions: QuestionRow[], answers: AnswerRow[], playerCount: number): Report {
  const stats = questions.map((q, index): QuestionStat => {
    const rows = answers.filter((a) => a.question_id === q.id);
    const options = q.type === 'multiple_choice' || q.type === 'excerpt' ? q.payload.options : q.type === 'true_false' ? ['Verdadeiro', 'Falso'] : [];
    const counts = options.map(() => 0);
    const correct = q.type === 'multiple_choice' || q.type === 'excerpt' ? q.correct.index : q.type === 'true_false' ? (q.correct.value ? 0 : 1) : -1;
    const values: AnswerValue[] = [];
    let credit = 0;
    for (const a of rows) {
      const v = a.value;
      if (v !== null && v !== undefined) {
        values.push(v);
        const k = q.type === 'true_false' ? (v === true ? 0 : v === false ? 1 : -1) : typeof v === 'number' ? v : -1;
        if (options.length && counts[k] !== undefined) counts[k]++;
        credit += safeGrade(q, v);
      } else if (a.correct) credit++;
    }
    return {
      index, type: q.type, prompt: q.prompt, options, correct, counts,
      answered: rows.length, noAnswer: Math.max(0, playerCount - rows.length),
      accuracy: rows.length ? credit / rows.length : 0,
      commonError: commonErrorOf(q, values.filter((v) => safeGrade(q, v) < 1)),
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
  const head = ['N.º', 'Tipo', 'Pergunta', 'Resposta certa', '% certas', 'Respondidas', 'Sem resposta', ...LETTERS.map((l) => `Opção ${l}`), 'Erro mais comum'];
  const lines = [head.map(cell).join(';')];
  for (const q of r.questions) {
    lines.push(
      [
        q.index + 1, TYPE_LABEL[q.type], q.prompt, q.correct >= 0 ? `${q.type === 'true_false' ? '' : `${LETTERS[q.correct]}: `}${q.options[q.correct]}` : '',
        Math.round(q.accuracy * 100), q.answered, q.noAnswer,
        ...LETTERS.map((_, i) => (i < q.options.length && q.type !== 'true_false' ? q.counts[i] : '')),
        q.commonError ? `${q.commonError.label} (${q.commonError.count})` : '',
      ].map(cell).join(';'),
    );
  }
  lines.push('');
  lines.push(['Alunos', r.playerCount].map(cell).join(';'));
  lines.push(['% média de certas', Math.round(r.avgAccuracy * 100)].map(cell).join(';'));
  lines.push(['Participação %', Math.round(r.participation * 100)].map(cell).join(';'));
  return '\ufeff' + lines.join('\r\n');
}
