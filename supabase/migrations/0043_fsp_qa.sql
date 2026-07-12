-- 0043_fsp_qa.sql
-- FSP live Q&A (Phase 1): the audience-question feed for Freshman Summer
-- Program live sessions.
--
-- Two tables:
--   fsp_questions -- one row per submitted audience question, tagged with the
--                    active session_id. Signed-in users READ all rows (the live
--                    feed); nobody writes directly. The ONLY write path is the
--                    submit_fsp_question SECURITY DEFINER RPC, so a client can
--                    never forge created_at / answered or target another session
--                    via a raw insert.
--   fsp_config    -- a tiny key/value config table. The single seeded row
--                    (active_session) is the session the /fsp/ask picker submits
--                    to and the /fsp/live feed filters on. Everyone signed in
--                    reads it; only @boscotech.edu (staff) may update it.
--
-- Access model mirrors the existing app conventions (0001 / 0004 / 0040):
-- reads via RLS, all mutations via SECURITY DEFINER RPCs or a narrow RLS grant,
-- staff writes gated by the @boscotech.edu email domain.
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

-- ---------------------------------------------------------------------------
-- fsp_questions
-- ---------------------------------------------------------------------------
create table if not exists public.fsp_questions (
	id uuid primary key default gen_random_uuid(),
	question text not null,
	session_id text not null,
	created_at timestamptz not null default now(),
	answered boolean not null default false
);

create index if not exists fsp_questions_session_idx
	on public.fsp_questions (session_id, created_at desc);

-- Signed-in users read the whole feed; NO direct write grant (insert / update /
-- delete), so the only write paths are the definer RPCs below.
revoke all on public.fsp_questions from anon, authenticated;
grant select on public.fsp_questions to authenticated;

alter table public.fsp_questions enable row level security;

drop policy if exists "fsp questions select authenticated" on public.fsp_questions;
create policy "fsp questions select authenticated"
	on public.fsp_questions
	for select
	to authenticated
	using (true);

-- ---------------------------------------------------------------------------
-- fsp_config: key/value settings, seeded with the active session id.
-- ---------------------------------------------------------------------------
create table if not exists public.fsp_config (
	key text primary key,
	value text not null
);

insert into public.fsp_config (key, value)
values ('active_session', 'Day1-A')
on conflict (key) do nothing;

-- Everyone signed in reads config; only @boscotech.edu (staff) may update. No
-- insert / delete grant: the active_session row is seeded here and only its
-- value is ever changed.
revoke all on public.fsp_config from anon, authenticated;
grant select, update on public.fsp_config to authenticated;

alter table public.fsp_config enable row level security;

drop policy if exists "fsp config select authenticated" on public.fsp_config;
create policy "fsp config select authenticated"
	on public.fsp_config
	for select
	to authenticated
	using (true);

drop policy if exists "fsp config update staff" on public.fsp_config;
create policy "fsp config update staff"
	on public.fsp_config
	for update
	to authenticated
	using (lower(coalesce((select auth.jwt() ->> 'email'), '')) like '%@boscotech.edu')
	with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) like '%@boscotech.edu');

-- ---------------------------------------------------------------------------
-- submit_fsp_question: the ONLY write path into fsp_questions. Any signed-in
-- user may submit a question to a session; the row is stamped server-side
-- (created_at, answered = false). Returns the new row id.
-- ---------------------------------------------------------------------------
create or replace function public.submit_fsp_question(
	p_question text,
	p_session_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
	v_question text := btrim(coalesce(p_question, ''));
	v_session text := btrim(coalesce(p_session_id, ''));
begin
	if v_uid is null then
		raise exception 'You must be signed in to submit a question';
	end if;
	if v_question = '' then
		raise exception 'Question cannot be empty';
	end if;
	if v_session = '' then
		raise exception 'No active session';
	end if;

	insert into public.fsp_questions (question, session_id)
	values (v_question, v_session)
	returning id into v_id;

	return v_id;
end;
$$;

revoke all on function public.submit_fsp_question(text, text) from public;
grant execute on function public.submit_fsp_question(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- clear_fsp_session: staff-only SOFT clear. Marks every unanswered question in
-- the given session answered (never deletes), so a cleared session's feed goes
-- empty until new questions arrive. Gated to @boscotech.edu. Returns the count
-- cleared. This keeps fsp_questions with no direct client update grant.
-- ---------------------------------------------------------------------------
create or replace function public.clear_fsp_session(p_session_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
	v_session text := btrim(coalesce(p_session_id, ''));
	v_count integer;
begin
	if v_email not like '%@boscotech.edu' then
		raise exception 'Only staff can clear a session';
	end if;

	update public.fsp_questions
	set answered = true
	where session_id = v_session and answered = false;

	get diagnostics v_count = row_count;
	return v_count;
end;
$$;

revoke all on function public.clear_fsp_session(text) from public;
grant execute on function public.clear_fsp_session(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: add fsp_questions to the supabase_realtime publication so the
-- /fsp/live feed receives INSERT (new question) and UPDATE (soft-clear) events.
-- RLS still applies to the stream. Idempotent.
-- ---------------------------------------------------------------------------
do $$
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
		and not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'fsp_questions'
		)
	then
		alter publication supabase_realtime add table public.fsp_questions;
	end if;
end
$$;
