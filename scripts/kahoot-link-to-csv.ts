// Uso: npx tsx scripts/kahoot-link-to-csv.ts <link-do-kahoot> [saida.csv]
// Lê um quiz público do Kahoot e escreve um CSV no formato simples do importador (`;`, UTF-8 com BOM).
import { writeFileSync } from 'node:fs';
import { toCsv } from '../src/lib/import/csv';

const link = process.argv[2] ?? '';
const id = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(link)?.[0];
if (!id) throw new Error('Link sem identificador do quiz.');
const res = await fetch(`https://create.kahoot.it/rest/kahoots/${id}`);
if (!res.ok) throw new Error(`O Kahoot respondeu ${res.status} (o quiz é público?)`);
const quiz = (await res.json()) as { title: string; questions: { type: string; time: number; question: string; choices?: { answer: string; correct: boolean }[] }[] };

const rows = [['Pergunta', 'Resposta 1', 'Resposta 2', 'Resposta 3', 'Resposta 4', 'Resposta certa', 'Tempo (s)', 'Explicação']];
for (const q of quiz.questions) {
  const ch = q.choices ?? [];
  const certas = ch.flatMap((c, i) => (c.correct ? [i + 1] : []));
  if (q.type !== 'quiz' || ch.length < 2 || certas.length !== 1) { console.warn(`Saltada (${q.type}): ${q.question}`); continue; }
  const pt = (a: string) => ({ true: 'Verdadeiro', false: 'Falso' })[a.trim().toLowerCase() as 'true' | 'false'] ?? a;
  const isTf = ch.length === 2 && ch.every((c) => /^(true|false)$/i.test(c.answer.trim()));
  rows.push([q.question, ...[0, 1, 2, 3].map((i) => (ch[i] ? (isTf ? pt(ch[i].answer) : ch[i].answer) : '')), String(certas[0]), String(Math.round(q.time / 1000)), '']);
}
const out = process.argv[3] ?? `${quiz.title.replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`;
writeFileSync(out, '﻿' + toCsv(rows));
console.log(`${rows.length - 1} perguntas de "${quiz.title}" → ${out}`);
