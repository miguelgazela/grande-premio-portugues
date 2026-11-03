-- Fase 2 (ferramentas da professora): arquivo de quizzes + save_quiz() com versões.
-- Só toca no schema "grandePremioPortugues".
--
-- Aplicar: Supabase dashboard → SQL Editor → colar tudo → Run (projeto partilhado: sem `db push`).
-- Depois de aplicar, o PostgREST apanha a função nova sozinho (se não: Settings → API → "Reload schema").

begin;

set local search_path = "grandePremioPortugues";

-- "Apagar" um quiz que já tem sessões não pode ser um delete a sério
-- (session.quiz_id é `on delete restrict` e o histórico precisa dele): fica arquivado.
alter table quiz add column if not exists archived_at timestamptz;

-- Guarda o quiz inteiro (metadados + perguntas) numa transação.
--
-- Versões: se a versão atual do quiz já tem uma sessão ou um race_record, as perguntas dessa
-- versão não podem mudar (as respostas e os fantasmas apontam para elas). Nesse caso a função
-- cria a versão seguinte com o conteúdo enviado e incrementa quiz.version. Caso contrário
-- edita no sítio (upsert pelo id, apaga as que saíram, reposiciona).
--
-- SECURITY INVOKER de propósito: corre com os direitos da professora, por isso a RLS
-- (quiz_owner / question_owner / session_owner / race_record_owner) continua a valer e
-- ninguém consegue mexer em quizzes de outra pessoa.
--
-- p_questions: [{ id?, prompt, options: [texto, ...], correct: índice, time_limit, explanation }]
-- devolve: { version, bumped, ids: [uuid, ...] }  (ids pela mesma ordem de p_questions)
create or replace function save_quiz(
  p_quiz_id uuid,
  p_title text,
  p_year smallint,
  p_topic text,
  p_questions jsonb
)
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quiz "grandePremioPortugues".quiz;
  v_version integer;
  v_bump boolean;
  v_ids uuid[] := '{}';
  v_q jsonb;
  v_pos integer := 0;
  v_id uuid;
  v_opts integer;
begin
  select * into v_quiz from "grandePremioPortugues".quiz where id = p_quiz_id for update;
  if not found then
    raise exception 'Quiz não encontrado' using errcode = 'P0002';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'O quiz precisa de um título' using errcode = '22023';
  end if;
  if jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Formato de perguntas inválido' using errcode = '22023';
  end if;

  v_version := v_quiz.version;
  v_bump :=
    exists (select 1 from "grandePremioPortugues".session s where s.quiz_id = p_quiz_id and s.quiz_version = v_version)
    or exists (select 1 from "grandePremioPortugues".race_record r where r.quiz_id = p_quiz_id and r.quiz_version = v_version);
  if v_bump then
    v_version := v_version + 1;
  end if;

  update "grandePremioPortugues".quiz
     set title = btrim(p_title), year = p_year, topic = nullif(btrim(coalesce(p_topic, '')), ''),
         version = v_version, updated_at = now()
   where id = p_quiz_id;

  if not v_bump then
    -- liberta as posições (unique quiz_id+version+position) antes de reposicionar
    update "grandePremioPortugues".question set position = position + 100000
     where quiz_id = p_quiz_id and version = v_version;
  end if;

  for v_q in select * from jsonb_array_elements(p_questions) loop
    v_pos := v_pos + 1;
    v_opts := jsonb_array_length(v_q -> 'options');
    if btrim(coalesce(v_q ->> 'prompt', '')) = '' then
      raise exception 'Pergunta % sem enunciado', v_pos using errcode = '22023';
    end if;
    if v_opts not between 2 and 4 then
      raise exception 'Pergunta %: precisa de 2 a 4 opções', v_pos using errcode = '22023';
    end if;
    if (v_q ->> 'correct')::integer not between 0 and v_opts - 1 then
      raise exception 'Pergunta %: falta a resposta certa', v_pos using errcode = '22023';
    end if;

    v_id := null;
    if not v_bump and (v_q ->> 'id') is not null then
      select id into v_id from "grandePremioPortugues".question
       where id = (v_q ->> 'id')::uuid and quiz_id = p_quiz_id and version = v_version;
    end if;

    if v_id is not null then
      update "grandePremioPortugues".question set
        position = v_pos,
        prompt = btrim(v_q ->> 'prompt'),
        payload = jsonb_build_object('options', v_q -> 'options'),
        correct = jsonb_build_object('index', (v_q ->> 'correct')::integer),
        time_limit = coalesce((v_q ->> 'time_limit')::smallint, 20),
        explanation = nullif(btrim(coalesce(v_q ->> 'explanation', '')), '')
      where id = v_id;
    else
      insert into "grandePremioPortugues".question (quiz_id, version, position, prompt, payload, correct, time_limit, explanation)
      values (
        p_quiz_id, v_version, v_pos, btrim(v_q ->> 'prompt'),
        jsonb_build_object('options', v_q -> 'options'),
        jsonb_build_object('index', (v_q ->> 'correct')::integer),
        coalesce((v_q ->> 'time_limit')::smallint, 20),
        nullif(btrim(coalesce(v_q ->> 'explanation', '')), '')
      )
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  if not v_bump then
    -- as que não foram reposicionadas saíram do quiz
    delete from "grandePremioPortugues".question
     where quiz_id = p_quiz_id and version = v_version and position > 100000;
  end if;

  return json_build_object('version', v_version, 'bumped', v_bump, 'ids', to_json(v_ids));
end;
$$;

revoke all on function save_quiz(uuid, text, smallint, text, jsonb) from public;
grant execute on function save_quiz(uuid, text, smallint, text, jsonb) to authenticated;

commit;
