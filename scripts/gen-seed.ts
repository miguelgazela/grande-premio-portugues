import { writeFileSync } from 'node:fs';
import { EXAMPLE_QUIZZES, EXAMPLE_QUIZZES_TIPOS, toBody, type ExampleQuiz } from '../src/data/exampleQuizzes';

// Gera as migrations de seed a partir de src/data/exampleQuizzes.ts:
//  - 20261102120000_seed_exemplos.sql: os quizzes de escolha múltipla originais (já aplicada);
//  - 20261105000100_seed_tipos.sql: os quizzes da Fase 4, com todos os tipos de pergunta.
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;

function seedSql(quizzes: ExampleQuiz[], title: string): string {
const out: string[] = [
  title,
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
for (const quiz of quizzes) {
  out.push(
    `  insert into "grandePremioPortugues".quiz (teacher_id, title, year, topic)`,
    `  values (v_teacher, ${q(quiz.title)}, ${quiz.year}, ${q(quiz.topic)})`,
    '  returning id into v_quiz;',
    '',
    '  insert into "grandePremioPortugues".question (quiz_id, version, position, type, prompt, payload, correct, time_limit, explanation) values',
  );
  out.push(
    quiz.questions
      .map((x, i) => {
        const b = toBody(x);
        return `    (v_quiz, 1, ${i + 1}, '${b.type}', ${q(x.prompt)}, ${json(b.payload)}, ${json(b.correct)}, ${x.time_limit ?? 20}, ${x.explanation ? q(x.explanation) : 'null'})`;
      })
      .join(',\n') + ';',
    '',
  );
}
out.push('end $$;', '', 'commit;', '');
return out.join('\n');
}

const write = (file: string, quizzes: ExampleQuiz[], title: string) => {
  writeFileSync(file, seedSql(quizzes, title));
  console.log(`escrito ${file} (${quizzes.map((x) => x.questions.length).join(' + ')} perguntas)`);
};
write(
  'supabase/migrations/20261102120000_seed_exemplos.sql',
  EXAMPLE_QUIZZES,
  '-- Quizzes de exemplo (gerado por `npm run seed:sql` a partir de src/data/exampleQuizzes.ts).',
);
write(
  'supabase/migrations/20261105000100_seed_tipos.sql',
  EXAMPLE_QUIZZES_TIPOS,
  '-- Quizzes de exemplo da Fase 4, com todos os tipos de pergunta (gerado por `npm run seed:sql`).\n-- Aplicar DEPOIS de 20261105000000_fase4_tipos_pergunta.sql (não depende dela, mas os tipos novos só se editam com ela).',
);
