-- Quizzes de exemplo da Fase 4, com todos os tipos de pergunta (gerado por `npm run seed:sql`).
-- Aplicar DEPOIS de 20261105000000_fase4_tipos_pergunta.sql (não depende dela, mas os tipos novos só se editam com ela).
-- Liga-os à primeira professora em "grandePremioPortugues".teacher. Aplicar à mão no SQL Editor.
-- Não é idempotente: correr duas vezes cria quizzes duplicados.

begin;

do $$
declare
  v_teacher uuid;
  v_quiz uuid;
begin
  select id into v_teacher from "grandePremioPortugues".teacher limit 1;
  if v_teacher is null then raise exception 'Sem professora em grandePremioPortugues.teacher'; end if;

  insert into "grandePremioPortugues".quiz (teacher_id, title, year, topic)
  values (v_teacher, 'Gramática e literatura: todos os tipos (9.º)', 9, 'Mistura')
  returning id into v_quiz;

  insert into "grandePremioPortugues".question (quiz_id, version, position, type, prompt, payload, correct, time_limit, explanation) values
    (v_quiz, 1, 1, 'true_false', '«Rapidamente» é um advérbio de modo.', '{}'::jsonb, '{"value":true}'::jsonb, 15, 'Termina em -mente e modifica o verbo.'),
    (v_quiz, 1, 2, 'true_false', '«Nós» é um pronome pessoal da 2.ª pessoa do singular.', '{}'::jsonb, '{"value":false}'::jsonb, 15, '«Nós» é 1.ª pessoa do plural.'),
    (v_quiz, 1, 3, 'tap_word', 'Toca no sujeito da frase.', '{"sentence":"Os alunos leram o poema ontem."}'::jsonb, '{"indices":[0,1]}'::jsonb, 25, 'Quem leu? «Os alunos».'),
    (v_quiz, 1, 4, 'tap_word', 'Toca no advérbio.', '{"sentence":"O gato dorme tranquilamente no sofá."}'::jsonb, '{"indices":[3]}'::jsonb, 25, '«Tranquilamente» modifica o verbo «dorme».'),
    (v_quiz, 1, 5, 'order', 'Ordena as partes da estrutura de uma narrativa.', '{"items":["Situação inicial","Complicação","Clímax","Desenlace"]}'::jsonb, '{}'::jsonb, 30, 'Apresenta-se, complica-se, atinge-se o ponto alto e resolve-se.'),
    (v_quiz, 1, 6, 'complete', 'Conjuga o verbo entre parênteses.', '{"text":"Ontem, eu ___ (fazer) o trabalho de casa."}'::jsonb, '{"accepted":[["fiz"]]}'::jsonb, 25, 'Pretérito perfeito de «fazer».'),
    (v_quiz, 1, 7, 'complete', 'Escolhe a forma que concorda com o sujeito.', '{"text":"Os alunos ___ muito atentos à aula.","options":["estava","estavam","estás"]}'::jsonb, '{"accepted":[["estavam"]]}'::jsonb, 20, 'Sujeito plural, verbo plural.'),
    (v_quiz, 1, 8, 'excerpt', 'Que figura de estilo há em «quanto do teu sal / São lágrimas de Portugal»?', '{"excerpt":"Ó mar salgado, quanto do teu sal\nSão lágrimas de Portugal!\n\nFernando Pessoa, «Mar Português»","options":["Metáfora","Hipérbole","Ironia","Comparação"]}'::jsonb, '{"index":0}'::jsonb, 40, 'O sal do mar identifica-se com as lágrimas, sem nexo comparativo.'),
    (v_quiz, 1, 9, 'match', 'Liga cada autor à sua obra.', '{"left":["Luís de Camões","Fernando Pessoa","Eça de Queirós","José Saramago"],"right":["Os Lusíadas","Mensagem","Os Maias","Ensaio sobre a Cegueira"]}'::jsonb, '{}'::jsonb, 35, 'Camões: epopeia; Pessoa: poesia; Eça: romance; Saramago: romance.');

  insert into "grandePremioPortugues".quiz (teacher_id, title, year, topic)
  values (v_teacher, 'Pessoa e os seus heterónimos: todos os tipos (12.º)', 12, 'Fernando Pessoa')
  returning id into v_quiz;

  insert into "grandePremioPortugues".question (quiz_id, version, position, type, prompt, payload, correct, time_limit, explanation) values
    (v_quiz, 1, 1, 'true_false', 'Ricardo Reis é o heterónimo de inspiração epicurista.', '{}'::jsonb, '{"value":true}'::jsonb, 15, 'Odes inspiradas em Horácio.'),
    (v_quiz, 1, 2, 'tap_word', 'Toca no sujeito.', '{"sentence":"O poeta é um fingidor."}'::jsonb, '{"indices":[0,1]}'::jsonb, 20, null),
    (v_quiz, 1, 3, 'complete', 'Completa.', '{"text":"Alberto Caeiro é o autor de «O Guardador de ___»."}'::jsonb, '{"accepted":[["Rebanhos"]]}'::jsonb, 20, null),
    (v_quiz, 1, 4, 'order', 'Ordena as fases da poesia de Álvaro de Campos.', '{"items":["Decadentista","Futurista e sensacionista","Intimista"]}'::jsonb, '{}'::jsonb, 25, 'Do esteticismo à máquina e, por fim, ao desencanto.'),
    (v_quiz, 1, 5, 'excerpt', 'Qual é a ideia central do poema?', '{"excerpt":"O poeta é um fingidor.\nFinge tão completamente\nQue chega a fingir que é dor\nA dor que deveras sente.\n\nFernando Pessoa, «Autopsicografia»","options":["O poeta transforma a sua emoção em arte através da imaginação","O poeta escreve apenas o que viveu","O poeta não sente nada","A poesia dispensa a emoção"]}'::jsonb, '{"index":0}'::jsonb, 45, 'Fingimento poético: a dor sentida é intelectualizada.'),
    (v_quiz, 1, 6, 'excerpt', 'Que sentimento domina o sujeito poético?', '{"excerpt":"Não sou nada.\nNunca serei nada.\nNão posso querer ser nada.\nÀ parte isso, tenho em mim todos os sonhos do mundo.\n\nÁlvaro de Campos, «Tabacaria»","options":["Frustração, mas com sonhos grandiosos","Orgulho da pátria","Alegria pela natureza","Indiferença total"]}'::jsonb, '{"index":0}'::jsonb, 45, 'Contraste entre o vazio e os sonhos.'),
    (v_quiz, 1, 7, 'match', 'Liga cada heterónimo ao que o caracteriza.', '{"left":["Alberto Caeiro","Ricardo Reis","Álvaro de Campos","Bernardo Soares"],"right":["Mestre e poeta das sensações","Epicurismo e carpe diem","Engenheiro e poeta da modernidade","Livro do Desassossego"]}'::jsonb, '{}'::jsonb, 40, null);

end $$;

commit;
