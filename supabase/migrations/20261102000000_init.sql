-- Grande Prémio de Português: initial schema.
-- Lives in its own schema inside the shared Supabase project. Touches nothing else.
-- camelCase schema name → must always be double-quoted in SQL.
--
-- Apply: Supabase dashboard → SQL Editor → paste → Run (shared project: no `db push`).
-- After applying: Dashboard → Settings → API → "Exposed schemas" → add grandePremioPortugues.

begin;

create schema if not exists "grandePremioPortugues";
set local search_path = "grandePremioPortugues";

-- ---------- Tables ----------

-- Only users with a row here can act as teachers. Rows are added by hand
-- (auth.users is shared with other projects).
create table teacher (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table class (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teacher (id) on delete cascade,
  name text not null,                         -- "9ºA"
  year smallint not null check (year between 5 and 12),
  created_at timestamptz not null default now(),
  unique (teacher_id, name)
);

create table quiz (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teacher (id) on delete cascade,
  title text not null,
  year smallint check (year between 5 and 12),
  topic text,
  version integer not null default 1,         -- bumped on edit; ghosts are tied to a version
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table question (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quiz (id) on delete cascade,
  version integer not null,
  position integer not null,
  type text not null default 'multiple_choice'
    check (type in ('multiple_choice', 'true_false', 'tap_word', 'order', 'complete', 'excerpt', 'match')),
  prompt text not null,
  payload jsonb not null default '{}',        -- options, sentence, excerpt…
  correct jsonb not null,                     -- never sent to students
  time_limit smallint not null default 20 check (time_limit between 5 and 120),
  explanation text,
  unique (quiz_id, version, position)
);

create table session (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teacher (id) on delete cascade,
  quiz_id uuid not null references quiz (id) on delete restrict,
  quiz_version integer not null,
  class_id uuid references class (id) on delete set null,
  pin text not null check (pin ~ '^[0-9]{6}$'),
  status text not null default 'lobby' check (status in ('lobby', 'running', 'finished', 'aborted')),
  settings jsonb not null default '{}',       -- RaceConfig overrides, bot field, ghosts
  state jsonb,                                -- host snapshot, survives a refresh of the projector
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
-- A PIN is unique only among sessions still in play.
create unique index session_active_pin on session (pin) where status in ('lobby', 'running');

create table player (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references session (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  device_token text not null,                 -- one player per iPad per session
  joined_at timestamptz not null default now(),
  kicked boolean not null default false,
  unique (session_id, device_token)
);
create unique index player_nickname on player (session_id, lower(nickname));

create table answer (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references session (id) on delete cascade,
  question_id uuid not null references question (id) on delete cascade,
  player_id uuid not null references player (id) on delete cascade,
  value jsonb,
  correct boolean not null,
  ms_taken integer not null check (ms_taken >= 0),
  created_at timestamptz not null default now(),
  unique (player_id, question_id)
);
create index answer_session on answer (session_id);

-- One per finished race: replayed as a ghost by other classes.
create table race_record (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references session (id) on delete cascade,
  teacher_id uuid not null references teacher (id) on delete cascade,
  class_id uuid references class (id) on delete set null,
  quiz_id uuid not null references quiz (id) on delete cascade,
  quiz_version integer not null,
  timeline jsonb not null,                    -- [{accuracy, speedBonus}] per question
  final_position smallint not null,
  finish_time_ms integer not null,
  created_at timestamptz not null default now()
);
create index race_record_quiz on race_record (quiz_id, quiz_version);

-- ---------- Row Level Security ----------
-- Teachers see only their own data. Students (anon) get no table access:
-- they join through join_session() and send answers over Realtime to the host,
-- which writes them as the teacher.

alter table teacher enable row level security;
alter table class enable row level security;
alter table quiz enable row level security;
alter table question enable row level security;
alter table session enable row level security;
alter table player enable row level security;
alter table answer enable row level security;
alter table race_record enable row level security;

create policy teacher_self on teacher for select to authenticated using (id = auth.uid());
create policy teacher_update on teacher for update to authenticated using (id = auth.uid());

create policy class_owner on class for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy quiz_owner on quiz for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy session_owner on session for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy race_record_owner on race_record for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy question_owner on question for all to authenticated
  using (exists (select 1 from "grandePremioPortugues".quiz q where q.id = quiz_id and q.teacher_id = auth.uid()))
  with check (exists (select 1 from "grandePremioPortugues".quiz q where q.id = quiz_id and q.teacher_id = auth.uid()));
create policy player_owner on player for all to authenticated
  using (exists (select 1 from "grandePremioPortugues".session s where s.id = session_id and s.teacher_id = auth.uid()))
  with check (exists (select 1 from "grandePremioPortugues".session s where s.id = session_id and s.teacher_id = auth.uid()));
create policy answer_owner on answer for all to authenticated
  using (exists (select 1 from "grandePremioPortugues".session s where s.id = session_id and s.teacher_id = auth.uid()))
  with check (exists (select 1 from "grandePremioPortugues".session s where s.id = session_id and s.teacher_id = auth.uid()));

-- ---------- Student join (anon) ----------
-- Returns the session id (used as the Realtime channel name) and the player id.
-- Re-joining from the same iPad returns the same player (reconnects).
create or replace function join_session(p_pin text, p_nickname text, p_device_token text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session "grandePremioPortugues".session;
  v_player "grandePremioPortugues".player;
  v_nick text := btrim(p_nickname);
begin
  select * into v_session from "grandePremioPortugues".session
   where pin = p_pin and status in ('lobby', 'running')
   limit 1;
  if not found then
    raise exception 'PIN inválido' using errcode = 'P0002';
  end if;

  select * into v_player from "grandePremioPortugues".player
   where session_id = v_session.id and device_token = p_device_token;

  if found then
    if v_player.kicked then
      raise exception 'Removido pela professora' using errcode = '42501';
    end if;
    return json_build_object('session_id', v_session.id, 'player_id', v_player.id, 'nickname', v_player.nickname, 'status', v_session.status);
  end if;

  if v_session.status <> 'lobby' then
    raise exception 'A corrida já começou' using errcode = 'P0001';
  end if;
  if char_length(v_nick) not between 1 and 20 then
    raise exception 'Alcunha inválida' using errcode = '22023';
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

-- ---------- Grants ----------
grant usage on schema "grandePremioPortugues" to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema "grandePremioPortugues" to authenticated;
grant all on all tables in schema "grandePremioPortugues" to service_role;
revoke all on function join_session(text, text, text) from public;
grant execute on function join_session(text, text, text) to anon, authenticated;

alter default privileges in schema "grandePremioPortugues"
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema "grandePremioPortugues"
  grant all on tables to service_role;

commit;
