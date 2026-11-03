import { writeFileSync } from 'node:fs';
import { EXAMPLE_QUIZZES } from '../src/data/exampleQuizzes';

// Gera supabase/migrations/<timestamp>_seed_exemplos.sql a partir de src/data/exampleQuizzes.ts.
const FILE = 'supabase/migrations/20261102120000_seed_exemplos.sql';
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;

const out: string[] = [
  '-- Quizzes de exemplo (gerado por `npm run seed:sql` a partir de src/data/exampleQuizzes.ts).',
  '-- Liga-os à primeira professora em "grandePremioPortugues".teacher. Aplicar à mão no SQL Editor.',
  '-- Não é idempotente: correr duas vezes cria quizzes duplicados.',
  '',
  'begin;',
  '',
  'do $$',
  'declare',
  '  v_teacher uuid;',
  '  v_quiz uuid;',
  'begin',
  '  select id into v_teacher from "grandePremioPortugues".teacher limit 1;',
  "  if v_teacher is null then raise exception 'Sem professora em grandePremioPortugues.teacher'; end if;",
  '',
];
for (const quiz of EXAMPLE_QUIZZES) {
  out.push(
    `  insert into "grandePremioPortugues".quiz (teacher_id, title, year, topic)`,
    `  values (v_teacher, ${q(quiz.title)}, ${quiz.year}, ${q(quiz.topic)})`,
    '  returning id into v_quiz;',
    '',
    '  insert into "grandePremioPortugues".question (quiz_id, version, position, type, prompt, payload, correct, time_limit, explanation) values',
  );
  out.push(
    quiz.questions
      .map(
        (x, i) =>
          `    (v_quiz, 1, ${i + 1}, 'multiple_choice', ${q(x.prompt)}, ${json({ options: x.options })}, ${json({ index: x.correct })}, 20, ${x.explanation ? q(x.explanation) : 'null'})`,
      )
      .join(',\n') + ';',
    '',
  );
}
out.push('end $$;', '', 'commit;', '');
writeFileSync(FILE, out.join('\n'));
console.log(`escrito ${FILE} (${EXAMPLE_QUIZZES.map((x) => x.questions.length).join(' + ')} perguntas)`);
