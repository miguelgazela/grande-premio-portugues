-- Quizzes de exemplo (gerado por `npm run seed:sql` a partir de src/data/exampleQuizzes.ts).
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
  values (v_teacher, 'Figuras de estilo', 9, 'Figuras de estilo')
  returning id into v_quiz;

  insert into "grandePremioPortugues".question (quiz_id, version, position, type, prompt, payload, correct, time_limit, explanation) values
    (v_quiz, 1, 1, 'multiple_choice', '«Os teus olhos são duas estrelas.» Que figura de estilo é esta?', '{"options":["Metáfora","Comparação","Hipérbole","Ironia"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Identifica-se uma coisa com outra sem usar nexo comparativo.'),
    (v_quiz, 1, 2, 'multiple_choice', '«Os teus olhos brilham como estrelas.» Que figura de estilo é esta?', '{"options":["Metáfora","Personificação","Comparação","Antítese"]}'::jsonb, '{"index":2}'::jsonb, 20, 'Há um nexo comparativo (como).'),
    (v_quiz, 1, 3, 'multiple_choice', '«O vento sussurrava segredos às árvores.» Que figura de estilo é esta?', '{"options":["Aliteração","Personificação","Eufemismo","Hipérbole"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Atribuem-se ações humanas ao vento.'),
    (v_quiz, 1, 4, 'multiple_choice', '«Já te disse mil vezes para arrumares o quarto!» Que figura de estilo é esta?', '{"options":["Hipérbole","Eufemismo","Metonímia","Apóstrofe"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Exagero expressivo.'),
    (v_quiz, 1, 5, 'multiple_choice', '«Ele partiu para um mundo melhor» (em vez de «morreu»). Que figura de estilo é esta?', '{"options":["Ironia","Eufemismo","Pleonasmo","Anáfora"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Suaviza-se uma ideia desagradável.'),
    (v_quiz, 1, 6, 'multiple_choice', '«Que belo dia para ficar preso no trânsito!» (num dia horrível). Que figura de estilo é esta?', '{"options":["Ironia","Antítese","Metáfora","Comparação"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Diz-se o contrário do que se pensa.'),
    (v_quiz, 1, 7, 'multiple_choice', '«Rato roeu a roupa do rei de Roma.» Que recurso expressivo predomina?', '{"options":["Anáfora","Aliteração","Onomatopeia","Gradação"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Repetição do som /r/.'),
    (v_quiz, 1, 8, 'multiple_choice', '«Tic-tac, tic-tac, fazia o relógio.» Que recurso expressivo está presente?', '{"options":["Onomatopeia","Aliteração","Hipérbole","Apóstrofe"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Palavras que imitam sons.'),
    (v_quiz, 1, 9, 'multiple_choice', '«Ó mar salgado, quanto do teu sal / São lágrimas de Portugal!» Que figura de estilo há em «Ó mar salgado»?', '{"options":["Apóstrofe","Antítese","Ironia","Eufemismo"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Interpelação direta a algo ou alguém.'),
    (v_quiz, 1, 10, 'multiple_choice', '«Era grande a alegria e pequena a tristeza.» Que figura de estilo é esta?', '{"options":["Pleonasmo","Antítese","Metáfora","Gradação"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Opõem-se ideias contrárias (grande/pequena, alegria/tristeza).'),
    (v_quiz, 1, 11, 'multiple_choice', '«Subi para cima e entrei para dentro.» Que figura de estilo é esta?', '{"options":["Pleonasmo","Anáfora","Eufemismo","Comparação"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Repete-se uma ideia já contida na expressão.'),
    (v_quiz, 1, 12, 'multiple_choice', '«Bebi um copo.» (em vez de «bebi o conteúdo do copo»). Que figura de estilo é esta?', '{"options":["Hipérbole","Metonímia","Ironia","Personificação"]}'::jsonb, '{"index":1}'::jsonb, 20, 'O continente toma o lugar do conteúdo.'),
    (v_quiz, 1, 13, 'multiple_choice', '«Amor é fogo que arde sem se ver.» Que figura de estilo domina o verso?', '{"options":["Comparação","Metáfora","Onomatopeia","Aliteração"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Amor = fogo, sem nexo comparativo.'),
    (v_quiz, 1, 14, 'multiple_choice', '«Vim, vi, venci.» Que recurso expressivo está presente?', '{"options":["Gradação","Anáfora","Hipérbole","Apóstrofe"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Sequência de ações com valor crescente.'),
    (v_quiz, 1, 15, 'multiple_choice', '«Chove, chove, chove sem parar.» Que figura de estilo é esta?', '{"options":["Repetição","Ironia","Metonímia","Eufemismo"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Repete-se uma palavra para dar ênfase.'),
    (v_quiz, 1, 16, 'multiple_choice', '«Leio Camões todas as noites.» (obra pelo autor). Que figura de estilo é esta?', '{"options":["Metonímia","Metáfora","Antítese","Comparação"]}'::jsonb, '{"index":0}'::jsonb, 20, 'O autor toma o lugar da obra.'),
    (v_quiz, 1, 17, 'multiple_choice', '«Morro de fome.» Que figura de estilo é esta?', '{"options":["Eufemismo","Hipérbole","Ironia","Aliteração"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Exagero.'),
    (v_quiz, 1, 18, 'multiple_choice', '«Não é nada feio» (para dizer que é bonito) é um exemplo de:', '{"options":["Litote","Hipérbole","Onomatopeia","Anáfora"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Afirma-se algo negando o seu contrário.');

  insert into "grandePremioPortugues".quiz (teacher_id, title, year, topic)
  values (v_teacher, 'Fernando Pessoa: ortónimo e heterónimos', 12, 'Fernando Pessoa')
  returning id into v_quiz;

  insert into "grandePremioPortugues".question (quiz_id, version, position, type, prompt, payload, correct, time_limit, explanation) values
    (v_quiz, 1, 1, 'multiple_choice', 'Quantos heterónimos «principais» se costumam estudar em Fernando Pessoa?', '{"options":["2","3","5","7"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Alberto Caeiro, Ricardo Reis e Álvaro de Campos.'),
    (v_quiz, 1, 2, 'multiple_choice', 'Qual é o mestre de todos os heterónimos?', '{"options":["Álvaro de Campos","Ricardo Reis","Alberto Caeiro","Bernardo Soares"]}'::jsonb, '{"index":2}'::jsonb, 20, 'Caeiro é o «mestre» do ortónimo e dos outros heterónimos.'),
    (v_quiz, 1, 3, 'multiple_choice', 'Quem é o poeta bucólico, pastor, que defende viver as sensações sem pensar?', '{"options":["Ricardo Reis","Alberto Caeiro","Álvaro de Campos","Fernando Pessoa ortónimo"]}'::jsonb, '{"index":1}'::jsonb, 20, '«O Guardador de Rebanhos» é a sua obra principal.'),
    (v_quiz, 1, 4, 'multiple_choice', 'Qual é o heterónimo médico, monárquico, de inspiração clássica e epicurista?', '{"options":["Ricardo Reis","Álvaro de Campos","Alberto Caeiro","Bernardo Soares"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Escreve odes inspiradas em Horácio.'),
    (v_quiz, 1, 5, 'multiple_choice', 'Qual é o heterónimo engenheiro naval, que passa por várias fases (decadentista, futurista, intimista)?', '{"options":["Alberto Caeiro","Ricardo Reis","Álvaro de Campos","Fernando Pessoa ortónimo"]}'::jsonb, '{"index":2}'::jsonb, 20, 'Escreve «Ode Triunfal» e «Tabacaria».'),
    (v_quiz, 1, 6, 'multiple_choice', 'Qual destes poemas é de Álvaro de Campos?', '{"options":["«Tabacaria»","«O Guardador de Rebanhos»","«Mar Português»","«Odes»"]}'::jsonb, '{"index":0}'::jsonb, 20, '«Tabacaria» é um dos seus poemas mais conhecidos.'),
    (v_quiz, 1, 7, 'multiple_choice', 'Em que obra se encontra o poema «Mar Português»?', '{"options":["Cancioneiro","Mensagem","Odes","Livro do Desassossego"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Mensagem é o único livro em português publicado em vida por Pessoa.'),
    (v_quiz, 1, 8, 'multiple_choice', 'Qual é o tema central de «Autopsicografia»?', '{"options":["A morte","O fingimento artístico","A natureza","O amor"]}'::jsonb, '{"index":1}'::jsonb, 20, '«O poeta é um fingidor».'),
    (v_quiz, 1, 9, 'multiple_choice', 'Quem escreveu «Livro do Desassossego» (como semi-heterónimo)?', '{"options":["Bernardo Soares","Ricardo Reis","Alberto Caeiro","Álvaro de Campos"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Obra em prosa fragmentária.'),
    (v_quiz, 1, 10, 'multiple_choice', 'Qual é a característica principal da poesia de Alberto Caeiro?', '{"options":["O sensacionismo e a simplicidade","O epicurismo e o carpe diem","A nostalgia da infância e a dor de pensar","O futurismo e a máquina"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Valoriza as sensações, a simplicidade e as coisas como são.'),
    (v_quiz, 1, 11, 'multiple_choice', 'Qual é a máxima epicurista associada a Ricardo Reis?', '{"options":["«Carpe diem»","«Penso, logo existo»","«Navegar é preciso»","«Quem vê caras...»"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Aproveitar o momento com moderação e serenidade.'),
    (v_quiz, 1, 12, 'multiple_choice', 'No ortónimo, a «dor de pensar» está ligada a:', '{"options":["Aceitar o mundo sem pensar","O desejo de ser simples como as coisas, sem a consciência que atormenta","Louvar a velocidade das máquinas","Defender o Império"]}'::jsonb, '{"index":1}'::jsonb, 20, 'O sujeito poético sofre por pensar demasiado.'),
    (v_quiz, 1, 13, 'multiple_choice', 'Qual é o tema de «Ode Triunfal»?', '{"options":["A natureza campestre","A força da civilização industrial e das máquinas","A morte do pai","O amor impossível"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Fase futurista de Álvaro de Campos.'),
    (v_quiz, 1, 14, 'multiple_choice', 'Que nome se dá ao fenómeno de Pessoa criar «outros autores» com biografia e estilo próprios?', '{"options":["Heteronímia","Pseudonímia","Anonímia","Ortografia"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Os heterónimos são personalidades poéticas distintas.'),
    (v_quiz, 1, 15, 'multiple_choice', 'O que distingue um heterónimo de um pseudónimo?', '{"options":["O heterónimo tem estilo e biografia próprios","O pseudónimo escreve em verso","O heterónimo é anónimo","Não há diferença"]}'::jsonb, '{"index":0}'::jsonb, 20, 'O pseudónimo é apenas um nome diferente; o heterónimo é outra personalidade.'),
    (v_quiz, 1, 16, 'multiple_choice', 'O sujeito poético de «Tabacaria» sente-se:', '{"options":["Realizado e feliz","Falhado e perdido entre a realidade e o sonho","Indiferente à vida","Orgulhoso da pátria"]}'::jsonb, '{"index":1}'::jsonb, 20, '«Não sou nada. Nunca serei nada.»'),
    (v_quiz, 1, 17, 'multiple_choice', 'Como se chama a poesia que Pessoa assina com o seu próprio nome?', '{"options":["Ortónima","Heterónima","Pseudónima","Anónima"]}'::jsonb, '{"index":0}'::jsonb, 20, 'Ortónimo = o próprio Fernando Pessoa.'),
    (v_quiz, 1, 18, 'multiple_choice', 'Em que ano nasceu Fernando Pessoa?', '{"options":["1788","1888","1920","1935"]}'::jsonb, '{"index":1}'::jsonb, 20, 'Nasceu em Lisboa, em 13 de junho de 1888.');

end $$;

commit;
