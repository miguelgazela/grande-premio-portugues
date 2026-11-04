-- Grande Prémio de Português: vários jogos na mesma sala.
--
-- Até aqui uma `session` era uma corrida. Agora a `session` é a SALA (PIN, turma, alunos, canal Realtime)
-- e cada corrida é um `game` (jogo) dessa sala:
--   * `game` tem o quiz, as definições, o estado e o estado (lobby/running/finished/aborted) de cada jogo;
--   * `answer` e `race_record` passam a apontar para o `game` (histórico, relatório e fantasmas são por jogo);
--   * `session.status/started_at/finished_at` espelham o ÚLTIMO jogo (trigger), por isso o PIN fica livre quando
--     o jogo acaba e volta a ser reservado quando a professora abre o jogo seguinte;
--   * `player.left`: o aluno saiu a meio de um jogo (pode voltar no lobby do seguinte); `kicked` continua a ser
--     só da professora e vale para a sala toda.
--
-- Dados existentes: cada sessão antiga vira o jogo nº 1 dela, com o MESMO id (relatórios, fantasmas e
-- `settings.ghosts[].sessionId` continuam a apontar para o sítio certo).
--
-- Aplicar à mão: Supabase → SQL Editor → colar tudo → Run (projeto partilhado: sem `db push`). Uma vez só.
-- Depois de aplicar, publicar a versão nova da app (a antiga deixa de funcionar com este esquema).

begin;

set local search_path = "grandePremioPortugues";

-- ---------- Jogos ----------
create table game (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references session (id) on delete cascade,
  number integer not null check (number >= 1),
  quiz_id uuid not null references quiz (id) on delete restrict,
  quiz_version integer not null,
  settings jsonb not null default '{}',
  state jsonb,
  status text not null default 'lobby' check (status in ('lobby', 'running', 'finished', 'aborted')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (session_id, number)
);
create index game_quiz on game (quiz_id, quiz_version);

alter table game enable row level security;
create policy game_owner on game for all to authenticated
  using (exists (select 1 from "grandePremioPortugues".session s where s.id = session_id and s.teacher_id = auth.uid()))
  with check (exists (select 1 from "grandePremioPortugues".session s where s.id = session_id and s.teacher_id = auth.uid()));

insert into game (id, session_id, number, quiz_id, quiz_version, settings, state, status, created_at, started_at, finished_at)
select id, id, 1, quiz_id, quiz_version, settings, state, status, created_at, started_at, finished_at from session;

-- ---------- answer → game ----------
alter table answer add column game_id uuid references game (id) on delete cascade;
update answer set game_id = session_id;
alter table answer alter column game_id set not null;

drop policy answer_owner on answer;
drop index answer_session;
do $$
declare
  c record;
begin
  -- a restrição única antiga (player_id, question_id), seja qual for o nome
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = '"grandePremioPortugues".answer'::regclass
       and con.contype = 'u'
       and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
             where a.attrelid = con.conrelid and a.attnum = any (con.conkey)) = array['player_id', 'question_id']
  loop
    execute format('alter table "grandePremioPortugues".answer drop constraint %I', c.conname);
  end loop;
end $$;
alter table answer drop column session_id;
alter table answer add constraint answer_game_player_question_key unique (game_id, player_id, question_id);
create index answer_game on answer (game_id);

create policy answer_owner on answer for all to authenticated
  using (exists (
    select 1 from "grandePremioPortugues".game g join "grandePremioPortugues".session s on s.id = g.session_id
     where g.id = game_id and s.teacher_id = auth.uid()))
  with check (exists (
    select 1 from "grandePremioPortugues".game g join "grandePremioPortugues".session s on s.id = g.session_id
     where g.id = game_id and s.teacher_id = auth.uid()));

-- ---------- race_record → game ----------
alter table race_record add column game_id uuid references game (id) on delete cascade;
update race_record set game_id = session_id;
alter table race_record alter column game_id set not null;
alter table race_record drop column session_id;  -- leva consigo a restrição única e a chave estrangeira
alter table race_record add constraint race_record_game_id_key unique (game_id);

-- ---------- session deixa de ter o quiz e o estado (vivem no jogo) ----------
alter table session drop column quiz_id;
alter table session drop column quiz_version;
alter table session drop column settings;
alter table session drop column state;

-- ---------- player.left ----------
alter table player add column "left" boolean not null default false;

-- ---------- session.status espelha o último jogo ----------
create or replace function gpp_sync_session_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number = (select max(g.number) from "grandePremioPortugues".game g where g.session_id = new.session_id) then
    update "grandePremioPortugues".session s
       set status = new.status, started_at = new.started_at, finished_at = new.finished_at
     where s.id = new.session_id
       and (s.status, s.started_at, s.finished_at) is distinct from (new.status, new.started_at, new.finished_at);
  end if;
  return null;
end;
$$;
revoke all on function gpp_sync_session_status() from public, anon, authenticated;

create trigger game_sync_session
  after insert or update of status, started_at, finished_at on game
  for each row execute function gpp_sync_session_status();

-- ---------- save_quiz: "já foi jogada" passa a olhar para os jogos ----------
-- Troca só essa condição, sem reescrever a função inteira.
do $$
declare
  v_old text;
  v_new text;
begin
  v_old := pg_get_functiondef('"grandePremioPortugues".save_quiz(uuid, text, smallint, text, jsonb)'::regprocedure);
  v_new := replace(
    v_old,
    'exists (select 1 from "grandePremioPortugues".session s where s.quiz_id = p_quiz_id and s.quiz_version = v_version)',
    'exists (select 1 from "grandePremioPortugues".game g where g.quiz_id = p_quiz_id and g.quiz_version = v_version)'
  );
  if v_new = v_old then
    raise exception 'save_quiz: não encontrei a condição a trocar (a função mudou?)';
  end if;
  execute v_new;
end $$;

-- ---------- Entrada dos alunos (anon) ----------
-- Igual à versão anterior, mais:
--  * quem saiu a meio de um jogo (`left`) só volta quando a sala está em lobby (e deixa de estar "saído");
--  * o limite de 60 alunos conta só os ativos (nem expulsos nem saídos).
create or replace function join_session(p_pin text, p_nickname text, p_device_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session "grandePremioPortugues".session;
  v_player "grandePremioPortugues".player;
  v_nick text := "grandePremioPortugues".gpp_clean_nickname(p_nickname);
begin
  if p_device_token is null or char_length(p_device_token) not between 8 and 100 then
    raise exception 'Dispositivo inválido' using errcode = '22023';
  end if;

  if (select count(*) from "grandePremioPortugues".join_attempt where device_token = p_device_token and at > now() - interval '5 minutes') >= 8
     or (select count(*) from "grandePremioPortugues".join_attempt where at > now() - interval '1 minute') >= 400 then
    raise exception 'Demasiadas tentativas. Espera um minuto.' using errcode = 'P0001';
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{6}$' then
    select * into v_session from "grandePremioPortugues".session
     where pin = p_pin and status in ('lobby', 'running')
     limit 1
     for update;
  end if;
  if v_session.id is null then
    insert into "grandePremioPortugues".join_attempt (device_token) values (p_device_token);
    if random() < 0.05 then
      delete from "grandePremioPortugues".join_attempt where at < now() - interval '1 hour';
    end if;
    return json_build_object('error', 'PIN inválido');
  end if;

  select * into v_player from "grandePremioPortugues".player
   where session_id = v_session.id and device_token = p_device_token;

  if found then
    if v_player.kicked then
      raise exception 'Removido pela professora' using errcode = '42501';
    end if;
    if v_player."left" then
      if v_session.status <> 'lobby' then
        raise exception 'A corrida já começou' using errcode = 'P0001';
      end if;
      update "grandePremioPortugues".player set "left" = false where id = v_player.id;
    end if;
    return json_build_object('session_id', v_session.id, 'player_id', v_player.id, 'nickname', v_player.nickname, 'status', v_session.status);
  end if;

  if v_session.status <> 'lobby' then
    raise exception 'A corrida já começou' using errcode = 'P0001';
  end if;
  if char_length(v_nick) not between 1 and 20 then
    raise exception 'Alcunha inválida' using errcode = '22023';
  end if;
  if "grandePremioPortugues".gpp_nickname_blocked(v_nick) then
    raise exception 'Escolhe outra alcunha' using errcode = '22023';
  end if;
  if (select count(*) from "grandePremioPortugues".player where session_id = v_session.id and not kicked and not "left") >= 60
     or (select count(*) from "grandePremioPortugues".player where session_id = v_session.id) >= 200 then
    raise exception 'A sessão está cheia' using errcode = 'P0001';
  end if;

  insert into "grandePremioPortugues".player (session_id, nickname, device_token)
  values (v_session.id, v_nick, p_device_token)
  returning * into v_player;

  return json_build_object('session_id', v_session.id, 'player_id', v_player.id, 'nickname', v_player.nickname, 'status', v_session.status);
exception
  when unique_violation then
    raise exception 'Alcunha já em uso' using errcode = '23505';
end;
$$;

revoke all on function join_session(text, text, text) from public;
grant execute on function join_session(text, text, text) to anon, authenticated;

-- ---------- RGPD: o resumo final (state.final) agora vive no jogo ----------
-- Mesma lógica de antes (sessões terminadas/abortadas há mais de p_days dias), mas apaga `state.final` em
-- todos os jogos da sala.
create or replace function anonymize_old_players(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_days is null or p_days < 0 then
    raise exception 'p_days inválido' using errcode = '22023';
  end if;

  create temporary table _gpp_old on commit drop as
    select p.id, p.session_id,
           row_number() over (partition by p.session_id order by p.joined_at, p.id) as rn
      from "grandePremioPortugues".player p
      join "grandePremioPortugues".session s on s.id = p.session_id
     where s.status in ('finished', 'aborted')
       and coalesce(s.finished_at, s.created_at) < now() - make_interval(days => p_days)
       and s.id in (
         select p2.session_id from "grandePremioPortugues".player p2 where p2.device_token not like 'anon-%');

  -- Duas fases: o índice único (sessão, alcunha) não admite trocas a meio.
  update "grandePremioPortugues".player p
     set nickname = 'x' || left(replace(p.id::text, '-', ''), 19)
    from pg_temp._gpp_old o where o.id = p.id and p.device_token not like 'anon-%';

  update "grandePremioPortugues".player p
     set nickname = 'Aluno ' || o.rn, device_token = 'anon-' || p.id::text
    from pg_temp._gpp_old o where o.id = p.id and p.device_token not like 'anon-%';
  get diagnostics v_count = row_count;

  update "grandePremioPortugues".game g
     set state = g.state - 'final'
   where g.state ? 'final' and g.session_id in (select session_id from pg_temp._gpp_old);

  delete from "grandePremioPortugues".join_attempt where at < now() - interval '1 hour';
  drop table pg_temp._gpp_old;
  return v_count;
end;
$$;

revoke all on function anonymize_old_players(integer) from public, anon, authenticated;
grant execute on function anonymize_old_players(integer) to service_role;

-- ---------- Permissões ----------
grant select, insert, update, delete on game to authenticated;
grant all on game to service_role;

commit;
