-- Fase 4 (mais tipos de pergunta): save_quiz() passa a aceitar e validar os 7 tipos.
-- Só toca no schema "grandePremioPortugues". Não altera tabelas (question.type, payload e correct já existem).
--
-- Aplicar: Supabase dashboard → SQL Editor → colar tudo → Run (projeto partilhado: sem `db push`).
-- Pode correr-se mais de uma vez (create or replace).
--
-- p_questions: [{ id?, type, prompt, payload, correct, time_limit, explanation }]
--   multiple_choice  payload {options: [2–4 textos]}               correct {index}
--   true_false       payload {}                                    correct {value: bool}
--   tap_word         payload {sentence}                            correct {indices: [int]}  (palavras = separadas por espaços)
--   order            payload {items: [2–8], pela ordem certa}      correct {}
--   complete         payload {text com ___, options?: [2–6]}       correct {accepted: [[texto]] por lacuna}
--   excerpt          payload {excerpt, options: [2–4]}             correct {index}
--   match            payload {left: [2–6], right: [mesmo nº]}      correct {}   (left[i] liga a right[i])
-- Por compatibilidade, uma pergunta sem `type` com `options` e `correct: int` é tratada como multiple_choice.

begin;

set local search_path = "grandePremioPortugues";

-- Valida uma pergunta; levanta exceção com a posição se estiver mal formada.
create or replace function validate_question(p_pos integer, p_type text, p_prompt text, p_payload jsonb, p_correct jsonb)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_n integer;
  v_blanks integer;
  v_words integer;
  v_i jsonb;
begin
  if btrim(coalesce(p_prompt, '')) = '' then
    raise exception 'Pergunta %: falta o enunciado', p_pos using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_correct) is distinct from 'object' then
    raise exception 'Pergunta %: formato inválido', p_pos using errcode = '22023';
  end if;

  if p_type in ('multiple_choice', 'excerpt') then
    if jsonb_typeof(p_payload -> 'options') is distinct from 'array' then
      raise exception 'Pergunta %: faltam as opções', p_pos using errcode = '22023';
    end if;
    v_n := jsonb_array_length(p_payload -> 'options');
    if v_n not between 2 and 4 then
      raise exception 'Pergunta %: precisa de 2 a 4 opções', p_pos using errcode = '22023';
    end if;
    if jsonb_typeof(p_correct -> 'index') is distinct from 'number' or (p_correct ->> 'index')::integer not between 0 and v_n - 1 then
      raise exception 'Pergunta %: falta a resposta certa', p_pos using errcode = '22023';
    end if;
    if p_type = 'excerpt' and btrim(coalesce(p_payload ->> 'excerpt', '')) = '' then
      raise exception 'Pergunta %: falta o excerto', p_pos using errcode = '22023';
    end if;

  elsif p_type = 'true_false' then
    if jsonb_typeof(p_correct -> 'value') is distinct from 'boolean' then
      raise exception 'Pergunta %: falta a resposta certa (verdadeiro/falso)', p_pos using errcode = '22023';
    end if;

  elsif p_type = 'tap_word' then
    if btrim(coalesce(p_payload ->> 'sentence', '')) = '' then
      raise exception 'Pergunta %: falta a frase', p_pos using errcode = '22023';
    end if;
    v_words := array_length(regexp_split_to_array(btrim(p_payload ->> 'sentence'), '\s+'), 1);
    if jsonb_typeof(p_correct -> 'indices') is distinct from 'array' or jsonb_array_length(p_correct -> 'indices') = 0 then
      raise exception 'Pergunta %: marca as palavras certas', p_pos using errcode = '22023';
    end if;
    for v_i in select * from jsonb_array_elements(p_correct -> 'indices') loop
      if jsonb_typeof(v_i) is distinct from 'number' or (v_i #>> '{}')::integer not between 0 and v_words - 1 then
        raise exception 'Pergunta %: palavra marcada fora da frase', p_pos using errcode = '22023';
      end if;
    end loop;

  elsif p_type = 'order' then
    if jsonb_typeof(p_payload -> 'items') is distinct from 'array' or jsonb_array_length(p_payload -> 'items') not between 2 and 8 then
      raise exception 'Pergunta %: precisa de 2 a 8 itens', p_pos using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements_text(p_payload -> 'items') t where btrim(t) = '') then
      raise exception 'Pergunta %: há itens vazios', p_pos using errcode = '22023';
    end if;

  elsif p_type = 'complete' then
    if btrim(coalesce(p_payload ->> 'text', '')) = '' then
      raise exception 'Pergunta %: falta o texto', p_pos using errcode = '22023';
    end if;
    v_blanks := (length(p_payload ->> 'text') - length(replace(p_payload ->> 'text', '___', ''))) / 3;
    if v_blanks < 1 then
      raise exception 'Pergunta %: o texto precisa de pelo menos uma lacuna (___)', p_pos using errcode = '22023';
    end if;
    if jsonb_typeof(p_correct -> 'accepted') is distinct from 'array' or jsonb_array_length(p_correct -> 'accepted') <> v_blanks then
      raise exception 'Pergunta %: falta a resposta certa de cada lacuna', p_pos using errcode = '22023';
    end if;
    for v_i in select * from jsonb_array_elements(p_correct -> 'accepted') loop
      if jsonb_typeof(v_i) is distinct from 'array' or not exists (select 1 from jsonb_array_elements_text(v_i) t where btrim(t) <> '') then
        raise exception 'Pergunta %: falta a resposta certa de uma lacuna', p_pos using errcode = '22023';
      end if;
    end loop;
    if p_payload ? 'options' and jsonb_typeof(p_payload -> 'options') is distinct from 'null' then
      if jsonb_typeof(p_payload -> 'options') is distinct from 'array' or jsonb_array_length(p_payload -> 'options') not between 2 and 6 then
        raise exception 'Pergunta %: precisa de 2 a 6 opções', p_pos using errcode = '22023';
      end if;
      if v_blanks <> 1 then
        raise exception 'Pergunta %: com opções só pode haver uma lacuna', p_pos using errcode = '22023';
      end if;
    end if;

  elsif p_type = 'match' then
    if jsonb_typeof(p_payload -> 'left') is distinct from 'array' or jsonb_typeof(p_payload -> 'right') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'left') not between 2 and 6
       or jsonb_array_length(p_payload -> 'left') <> jsonb_array_length(p_payload -> 'right') then
      raise exception 'Pergunta %: precisa de 2 a 6 pares', p_pos using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements_text(p_payload -> 'left') t where btrim(t) = '')
       or exists (select 1 from jsonb_array_elements_text(p_payload -> 'right') t where btrim(t) = '') then
      raise exception 'Pergunta %: há pares vazios', p_pos using errcode = '22023';
    end if;

  else
    raise exception 'Pergunta %: tipo desconhecido (%)', p_pos, p_type using errcode = '22023';
  end if;
end;
$$;

revoke all on function validate_question(integer, text, text, jsonb, jsonb) from public;
grant execute on function validate_question(integer, text, text, jsonb, jsonb) to authenticated;

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
  v_type text;
  v_payload jsonb;
  v_correct jsonb;
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

    -- formato antigo (só escolha múltipla): options + correct inteiro
    if (v_q ->> 'type') is null then
      v_type := 'multiple_choice';
      v_payload := jsonb_build_object('options', v_q -> 'options');
      v_correct := jsonb_build_object('index', (v_q ->> 'correct')::integer);
    else
      v_type := v_q ->> 'type';
      v_payload := v_q -> 'payload';
      v_correct := v_q -> 'correct';
    end if;

    perform "grandePremioPortugues".validate_question(v_pos, v_type, v_q ->> 'prompt', v_payload, v_correct);

    v_id := null;
    if not v_bump and (v_q ->> 'id') is not null then
      select id into v_id from "grandePremioPortugues".question
       where id = (v_q ->> 'id')::uuid and quiz_id = p_quiz_id and version = v_version;
    end if;

    if v_id is not null then
      update "grandePremioPortugues".question set
        position = v_pos,
        type = v_type,
        prompt = btrim(v_q ->> 'prompt'),
        payload = v_payload,
        correct = v_correct,
        time_limit = coalesce((v_q ->> 'time_limit')::smallint, 20),
        explanation = nullif(btrim(coalesce(v_q ->> 'explanation', '')), '')
      where id = v_id;
    else
      insert into "grandePremioPortugues".question (quiz_id, version, position, type, prompt, payload, correct, time_limit, explanation)
      values (
        p_quiz_id, v_version, v_pos, v_type, btrim(v_q ->> 'prompt'),
        v_payload, v_correct,
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
