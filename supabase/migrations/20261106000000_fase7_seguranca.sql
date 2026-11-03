-- Grande Prémio de Português, Fase 7 (mínimo): proteção antes de usar com alunos menores.
--   1. Filtro de alcunhas no servidor (tabela nickname_blocklist + funções gpp_*), dentro de join_session.
--   2. join_session: limpeza da alcunha, limite de jogadores por sessão, limite de tentativas de PIN por dispositivo.
--   3. rename_player: a professora renomeia um aluno no lobby (o filtro também se aplica).
--   4. anonymize_old_players: anonimiza alcunhas e device_token passado um tempo (RGPD). NÃO é agendada.
--
-- Tudo em "grandePremioPortugues". Aplicar à mão: Supabase → SQL Editor → colar → Run (projeto partilhado: sem `db push`).
-- A lista de palavras vem de src/data/nicknameBlocklist.ts (`npm run gen:blocklist` gera o bloco "insert").
-- A lógica de gpp_nickname_matches tem de ficar igual a src/lib/nickname.ts.

begin;

set local search_path = "grandePremioPortugues";

-- ---------- Lista de alcunhas recusadas ----------
-- kind 'w' = palavra inteira (com ou sem "s" final); 'c' = aparece em qualquer parte.
-- Palavras já normalizadas (minúsculas, sem acentos, sem letras repetidas). Só funções security definer a leem.
create table if not exists nickname_blocklist (
  word text not null,
  kind char(1) not null check (kind in ('w', 'c')),
  primary key (word, kind)
);
alter table nickname_blocklist enable row level security;
revoke all on nickname_blocklist from anon, authenticated;

-- Tentativas falhadas de PIN (só o device_token aleatório do iPad e a hora; apagadas passada 1 h).
create table if not exists join_attempt (
  id bigint generated always as identity primary key,
  device_token text not null,
  at timestamptz not null default now()
);
create index if not exists join_attempt_device on join_attempt (device_token, at);
create index if not exists join_attempt_at on join_attempt (at);
alter table join_attempt enable row level security;
revoke all on join_attempt from anon, authenticated;

insert into "grandePremioPortugues".nickname_blocklist (word, kind) values
  ('puta', 'w'),
  ('putas', 'w'),
  ('putinha', 'w'),
  ('puteiro', 'w'),
  ('putedo', 'w'),
  ('fdp', 'w'),
  ('vsf', 'w'),
  ('pqp', 'w'),
  ('crlh', 'w'),
  ('foda', 'w'),
  ('fodase', 'w'),
  ('fodido', 'w'),
  ('fodida', 'w'),
  ('foder', 'w'),
  ('fodeste', 'w'),
  ('fodes', 'w'),
  ('fodi', 'w'),
  ('cona', 'w'),
  ('conas', 'w'),
  ('cu', 'w'),
  ('cus', 'w'),
  ('cuzao', 'w'),
  ('pila', 'w'),
  ('pilas', 'w'),
  ('piroca', 'w'),
  ('caralho', 'w'),
  ('caralhos', 'w'),
  ('merda', 'w'),
  ('merdas', 'w'),
  ('merdoso', 'w'),
  ('bosta', 'w'),
  ('cagalhao', 'w'),
  ('cagar', 'w'),
  ('cagoes', 'w'),
  ('cabrao', 'w'),
  ('cabroes', 'w'),
  ('corno', 'w'),
  ('cornudo', 'w'),
  ('cornos', 'w'),
  ('badalhoca', 'w'),
  ('vadia', 'w'),
  ('vagabunda', 'w'),
  ('vagabundo', 'w'),
  ('prostituta', 'w'),
  ('punheta', 'w'),
  ('punheteiro', 'w'),
  ('paneleiro', 'w'),
  ('paneleiros', 'w'),
  ('maricas', 'w'),
  ('maricon', 'w'),
  ('bicha', 'w'),
  ('idiota', 'w'),
  ('imbecil', 'w'),
  ('estupido', 'w'),
  ('estupida', 'w'),
  ('cretino', 'w'),
  ('cretina', 'w'),
  ('palerma', 'w'),
  ('mongo', 'w'),
  ('mongoloide', 'w'),
  ('retardado', 'w'),
  ('deficiente', 'w'),
  ('rabo', 'w'),
  ('tetas', 'w'),
  ('penis', 'w'),
  ('vagina', 'w'),
  ('anal', 'w'),
  ('anus', 'w'),
  ('sexo', 'w'),
  ('sexy', 'w'),
  ('porno', 'w'),
  ('porn', 'w'),
  ('nazi', 'w'),
  ('nazis', 'w'),
  ('hitler', 'w'),
  ('fuck', 'w'),
  ('fucker', 'w'),
  ('fucking', 'w'),
  ('fck', 'w'),
  ('shit', 'w'),
  ('shity', 'w'),
  ('bitch', 'w'),
  ('bastard', 'w'),
  ('ashole', 'w'),
  ('dick', 'w'),
  ('cock', 'w'),
  ('pusy', 'w'),
  ('cunt', 'w'),
  ('whore', 'w'),
  ('slut', 'w'),
  ('fag', 'w'),
  ('fagot', 'w'),
  ('retard', 'w'),
  ('niger', 'w'),
  ('niga', 'w'),
  ('rape', 'w'),
  ('rapist', 'w'),
  ('sex', 'w'),
  ('caralh', 'c'),
  ('karalh', 'c'),
  ('filhodaputa', 'c'),
  ('filhadaputa', 'c'),
  ('filhodputa', 'c'),
  ('tomanocu', 'c'),
  ('tomarnocu', 'c'),
  ('vaitomar', 'c'),
  ('fodase', 'c'),
  ('punhet', 'c'),
  ('paneleir', 'c'),
  ('merda', 'c'),
  ('putaria', 'c'),
  ('niger', 'c')
on conflict do nothing;

-- ---------- Funções do filtro ----------

-- Tira caracteres de controlo/invisíveis, junta espaços repetidos e apara.
create or replace function gpp_clean_nickname(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(regexp_replace(coalesce(p, ''), '\s', ' ', 'g'), '[\u0001-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]', '', 'g'),
    ' +', ' ', 'g'));
$$;

-- t já só tem a-z e separadores: palavras inteiras, letras soltas (p.u.t.a) e raízes.
create or replace function gpp_nickname_matches(t text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tokens text[];
  v_n int;
  v_i int;
  v_j int;
  v_run text;
begin
  select coalesce(array_agg(regexp_replace(x.tok, '(.)\1+', '\1', 'g') order by x.ord), '{}')
    into v_tokens
    from regexp_split_to_table(t, '[^a-z]+') with ordinality as x(tok, ord)
   where x.tok <> '';
  v_n := coalesce(array_length(v_tokens, 1), 0);
  if v_n = 0 then return false; end if;

  if exists (
    select 1 from unnest(v_tokens) as u(tok)
      join "grandePremioPortugues".nickname_blocklist b
        on b.kind = 'w' and (b.word = u.tok or (length(u.tok) > 3 and u.tok like '%s' and b.word = left(u.tok, -1)))
  ) then return true; end if;

  v_i := 1;
  while v_i <= v_n loop
    if length(v_tokens[v_i]) = 1 then
      v_j := v_i;
      v_run := '';
      while v_j <= v_n and length(v_tokens[v_j]) = 1 loop
        v_run := v_run || v_tokens[v_j];
        v_j := v_j + 1;
      end loop;
      if v_j - v_i >= 2 and exists (
        select 1 from "grandePremioPortugues".nickname_blocklist b
         where b.kind = 'w' and (b.word = v_run or (length(v_run) > 3 and v_run like '%s' and b.word = left(v_run, -1)))
      ) then return true; end if;
      v_i := v_j;
    else
      v_i := v_i + 1;
    end if;
  end loop;

  return exists (
    select 1 from "grandePremioPortugues".nickname_blocklist b
     where b.kind = 'c' and position(b.word in array_to_string(v_tokens, '')) > 0
  );
end;
$$;

create or replace function gpp_nickname_blocked(p text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_base text := lower(translate(coalesce(p, ''), 'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäåéèêëíìîïóòôõöúùûüçñ', 'AAAAAAEEEEIIIIOOOOOUUUUCNaaaaaaeeeeiiiiooooouuuucn'));
  v_sym text := translate(v_base, '@$!|+', 'asiit');
begin
  return "grandePremioPortugues".gpp_nickname_matches(translate(v_sym, '4301572689', 'aeoist    '))
      or "grandePremioPortugues".gpp_nickname_matches(translate(v_sym, '0123456789', ''));
end;
$$;

revoke all on function gpp_clean_nickname(text), gpp_nickname_matches(text), gpp_nickname_blocked(text) from public, anon, authenticated;

-- ---------- Entrada dos alunos (anon) ----------
-- Mesma assinatura e mesmos códigos de erro. Novidades:
--  * alcunha limpa e filtrada no servidor (22023 'Escolhe outra alcunha');
--  * no máximo 60 alunos ativos por sessão (P0001 'A sessão está cheia');
--  * PIN errado NÃO lança erro (o erro desfaria o registo da tentativa): devolve {"error": "PIN inválido"}
--    e o cliente converte em exceção. Mais de 8 falhas em 5 min no mesmo dispositivo, ou 400 falhas por
--    minuto no total, bloqueiam novas tentativas (P0001). Não se limita por IP (iPads da escola partilham-no).
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
  if (select count(*) from "grandePremioPortugues".player where session_id = v_session.id and not kicked) >= 60
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

-- ---------- Renomear um aluno (professora) ----------
create or replace function rename_player(p_player_id uuid, p_nickname text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nick text := "grandePremioPortugues".gpp_clean_nickname(p_nickname);
begin
  if not exists (
    select 1 from "grandePremioPortugues".player p
      join "grandePremioPortugues".session s on s.id = p.session_id
     where p.id = p_player_id and s.teacher_id = auth.uid()
  ) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if char_length(v_nick) not between 1 and 20 then
    raise exception 'Alcunha inválida' using errcode = '22023';
  end if;
  if "grandePremioPortugues".gpp_nickname_blocked(v_nick) then
    raise exception 'Escolhe outra alcunha' using errcode = '22023';
  end if;
  update "grandePremioPortugues".player set nickname = v_nick where id = p_player_id;
  return v_nick;
exception
  when unique_violation then
    raise exception 'Alcunha já em uso' using errcode = '23505';
end;
$$;

revoke all on function rename_player(uuid, text) from public, anon;
grant execute on function rename_player(uuid, text) to authenticated;

-- ---------- RGPD: anonimizar alunos de sessões antigas ----------
-- Sessões terminadas/abortadas há mais de p_days dias (por defeito 30): alcunha → "Aluno n", device_token → "anon-<id>",
-- e apaga o resumo final (state.final) que repete as alcunhas. Respostas, tempos e race_record ficam (relatórios e fantasmas).
-- Idempotente. Só o dono da base de dados / service_role a podem correr (não é agendada aqui):
--   select "grandePremioPortugues".anonymize_old_players();      -- 30 dias
--   select "grandePremioPortugues".anonymize_old_players(14);    -- outro prazo
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

  update "grandePremioPortugues".session s
     set state = s.state - 'final'
   where s.state ? 'final' and s.id in (select session_id from pg_temp._gpp_old);

  delete from "grandePremioPortugues".join_attempt where at < now() - interval '1 hour';
  drop table pg_temp._gpp_old;
  return v_count;
end;
$$;

revoke all on function anonymize_old_players(integer) from public, anon, authenticated;
grant execute on function anonymize_old_players(integer) to service_role;

commit;
