-- 0288: VIEW AS, ACT AS, AND TEST STUDENT ACCOUNTS (ledger 0422, feedback d1c9ed15).
--
-- An admin can look at the site AS any user, exactly as that user sees it, or
-- act on that user's account. The server mints a real session for the target
-- (the connector's pattern) and the browser carries it, so every page, every
-- policy and every function answers as the target, on the server and in the
-- browser alike. What this file adds is the database half: knowing that a
-- given SESSION is a view-as or act-as session, and acting on that.
--
--   * view  -- READ-ONLY. A statement-level guard trigger on every table in
--              `public` refuses any insert, update, delete or truncate made
--              by that session. It is the database refusing, not the page,
--              so a client-side write, a definer RPC and a form action are
--              all refused alike. Storage writes are refused by restrictive
--              policies on storage.objects.
--   * act   -- the writes land, as the target, and the same guard writes one
--              act_as_log row per (transaction, table, operation) naming the
--              admin. A submission or answer written this way carries
--              `acted_by`, so grading shows it. The target gets a notice.
--
-- HOW A SESSION BECOMES ONE. `view_as_grant` (as the admin) records a grant;
-- the server mints the target's session and calls `view_as_claim` AS THE
-- TARGET, which binds the grant to that session's own `session_id` claim. So
-- no caller can name a session id: the binding reads it off the verified JWT.
--
-- NEW TABLES ARE COVERED WITHOUT ANYONE REMEMBERING. `_view_as_attach_guards`
-- puts the guard on every public table that lacks it, and `view_as_claim`
-- runs it each time a session starts, so a table a later migration adds is
-- guarded before any view-as session can touch it.
--
-- TEST STUDENT ACCOUNTS. `test_accounts` lists accounts (addresses at
-- test.ideabosco.com) that behave as students and are hidden from every list
-- of people (0289 does the hiding). They are created by the server (an auth
-- user needs the service role) and registered here.
--
-- UNDO: drop the triggers named zz_view_as_guard and view_as_acted_by, the
-- four storage policies named view_as_read_only_*, the functions below, the
-- columns acted_by/acted_at on classroom_submissions and classroom_responses,
-- and the tables view_as_grants, view_as_sessions, act_as_log,
-- account_notices and test_accounts. Nothing existing is rewritten.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.test_accounts (
	email text primary key check (email = lower(btrim(email)) and email like '%@test.ideabosco.com'),
	user_id uuid unique,
	label text not null check (char_length(btrim(label)) between 1 and 80),
	created_by text not null,
	created_at timestamptz not null default now(),
	retired_at timestamptz
);
alter table public.test_accounts enable row level security;
revoke all on table public.test_accounts from public, anon, authenticated;

create table if not exists public.view_as_grants (
	id uuid primary key default gen_random_uuid(),
	admin_email text not null,
	admin_name text,
	target_user uuid not null,
	target_email text not null,
	target_name text,
	mode text not null check (mode in ('view', 'act')),
	created_at timestamptz not null default now(),
	claimed_at timestamptz
);
alter table public.view_as_grants enable row level security;
revoke all on table public.view_as_grants from public, anon, authenticated;

create table if not exists public.view_as_sessions (
	session_id uuid primary key,
	grant_id uuid not null references public.view_as_grants (id),
	admin_email text not null,
	admin_name text,
	target_user uuid not null,
	target_email text not null,
	target_name text,
	mode text not null check (mode in ('view', 'act')),
	started_at timestamptz not null default now(),
	expires_at timestamptz not null,
	ended_at timestamptz,
	notice_id uuid
);
create index if not exists view_as_sessions_open_idx on public.view_as_sessions (session_id) where ended_at is null;
create index if not exists view_as_sessions_started_idx on public.view_as_sessions (started_at desc);
alter table public.view_as_sessions enable row level security;
revoke all on table public.view_as_sessions from public, anon, authenticated;

create table if not exists public.act_as_log (
	id bigserial primary key,
	session_id uuid not null references public.view_as_sessions (session_id),
	admin_email text not null,
	target_email text not null,
	txid bigint not null default txid_current(),
	table_name text not null,
	operation text not null,
	path text,
	at timestamptz not null default now()
);
create index if not exists act_as_log_session_idx on public.act_as_log (session_id, at);
alter table public.act_as_log enable row level security;
revoke all on table public.act_as_log from public, anon, authenticated;

create table if not exists public.account_notices (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null,
	kind text not null check (kind in ('acted_as')),
	title text not null,
	body text not null,
	created_at timestamptz not null default now(),
	seen_at timestamptz
);
create index if not exists account_notices_user_idx on public.account_notices (user_id, created_at desc);
alter table public.account_notices enable row level security;
revoke all on table public.account_notices from public, anon, authenticated;

alter table public.classroom_submissions add column if not exists acted_by text;
alter table public.classroom_submissions add column if not exists acted_at timestamptz;
alter table public.classroom_responses add column if not exists acted_by text;
alter table public.classroom_responses add column if not exists acted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Test accounts: the one test of "is this a test account"
-- ---------------------------------------------------------------------------

create or replace function public._idea_test_emails()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
	select t.email from public.test_accounts t;
$$;

create or replace function public._idea_test_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
	select t.user_id from public.test_accounts t where t.user_id is not null;
$$;

create or replace function public._idea_is_test_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (select 1 from public.test_accounts t where t.email = lower(btrim(coalesce(p_email, ''))));
$$;

create or replace function public._idea_is_test_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (select 1 from public.test_accounts t where t.user_id = p_user);
$$;

revoke all on function public._idea_test_emails() from public, anon, authenticated;
revoke all on function public._idea_test_user_ids() from public, anon, authenticated;
revoke all on function public._idea_is_test_email(text) from public, anon, authenticated;
revoke all on function public._idea_is_test_user(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The current session, if it is a view-as or act-as one
-- ---------------------------------------------------------------------------

-- Reads the session id off the verified JWT claims PostgREST (and Storage)
-- set for the request. Anything unreadable is "not a view-as session": this
-- runs before every write in the database, so it never raises.
create or replace function public._view_as_session()
returns public.view_as_sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_claims text := current_setting('request.jwt.claims', true);
	v_sid uuid;
	v_row public.view_as_sessions;
begin
	if v_claims is null or v_claims = '' or position('session_id' in v_claims) = 0 then
		return null;
	end if;
	begin
		v_sid := nullif(v_claims::jsonb ->> 'session_id', '')::uuid;
	exception when others then
		return null;
	end;
	if v_sid is null then
		return null;
	end if;
	select * into v_row from public.view_as_sessions s where s.session_id = v_sid and s.ended_at is null;
	return v_row;
end;
$$;
revoke all on function public._view_as_session() from public, anon, authenticated;

-- For policies (storage.objects), which run as the caller: false only inside
-- a read-only (view, or expired) session.
create or replace function public.view_as_write_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v public.view_as_sessions := public._view_as_session();
begin
	return v.session_id is null or (v.mode = 'act' and v.expires_at > now());
end;
$$;
revoke all on function public.view_as_write_allowed() from public, anon, authenticated;
grant execute on function public.view_as_write_allowed() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------

create or replace function public._view_as_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v public.view_as_sessions := public._view_as_session();
	v_path text := nullif(current_setting('request.path', true), '');
begin
	if v.session_id is null then
		return null;
	end if;
	if v.mode = 'view' or v.expires_at <= now() then
		raise exception 'You are viewing the site as %. This view is read-only, so nothing was changed.',
			coalesce(nullif(btrim(v.target_name), ''), v.target_email)
			using errcode = '42501', hint = 'view_as_read_only';
	end if;
	if not exists (
		select 1 from public.act_as_log l
		where l.session_id = v.session_id and l.txid = txid_current()
			and l.table_name = tg_table_name and l.operation = tg_op
	) then
		insert into public.act_as_log (session_id, admin_email, target_email, table_name, operation, path)
		values (v.session_id, v.admin_email, v.target_email, tg_table_name, tg_op, v_path);
	end if;
	return null;
end;
$$;
revoke all on function public._view_as_guard() from public, anon, authenticated;

-- Puts the guard on every ordinary or partitioned table in `public` that does
-- not have it, except the three tables this mechanism writes for itself.
create or replace function public._view_as_attach_guards()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	r record;
	n integer := 0;
begin
	for r in
		select c.oid::regclass::text as t
		from pg_catalog.pg_class c
		join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
		where ns.nspname = 'public'
			and c.relkind in ('r', 'p')
			and not c.relispartition
			and c.relname not in ('view_as_grants', 'view_as_sessions', 'act_as_log')
			and not exists (
				select 1 from pg_catalog.pg_trigger tg
				where tg.tgrelid = c.oid and tg.tgname = 'zz_view_as_guard'
			)
			-- A table an extension owns is the extension's, not the site's.
			and not exists (
				select 1 from pg_catalog.pg_depend d
				where d.classid = 'pg_catalog.pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
			)
	loop
		begin
			execute format(
				'create trigger zz_view_as_guard before insert or update or delete or truncate on %s for each statement execute function public._view_as_guard()',
				r.t
			);
			n := n + 1;
		exception when insufficient_privilege then
			-- A table this role cannot put a trigger on is not one the site
			-- writes through its own functions; skip it rather than fail.
			null;
		end;
	end loop;
	return n;
end;
$$;
revoke all on function public._view_as_attach_guards() from public, anon, authenticated;

do $$
declare
	v_n integer;
begin
	v_n := public._view_as_attach_guards();
	raise notice '0288: the view-as guard was put on % tables', v_n;
end;
$$;

-- A submission or an answer written in an act-as session carries the admin.
-- When the student later writes the same row themselves, the mark clears:
-- for a submission only when the student submits again, so a grade or a
-- return by the teacher never clears it.
create or replace function public._view_as_mark_acted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v public.view_as_sessions := public._view_as_session();
	v_me text;
begin
	if v.session_id is not null and v.mode = 'act' then
		new.acted_by := v.admin_email;
		new.acted_at := now();
		return new;
	end if;
	v_me := public.current_user_email();
	if v_me = '' or new.student_email <> v_me then
		return new;
	end if;
	if tg_table_name = 'classroom_submissions' then
		if new.state = 'submitted' and (tg_op = 'INSERT' or old.state is distinct from 'submitted') then
			new.acted_by := null;
			new.acted_at := null;
		end if;
	else
		new.acted_by := null;
		new.acted_at := null;
	end if;
	return new;
end;
$$;
revoke all on function public._view_as_mark_acted() from public, anon, authenticated;

drop trigger if exists view_as_acted_by on public.classroom_submissions;
create trigger view_as_acted_by before insert or update on public.classroom_submissions
	for each row execute function public._view_as_mark_acted();
drop trigger if exists view_as_acted_by on public.classroom_responses;
create trigger view_as_acted_by before insert or update on public.classroom_responses
	for each row execute function public._view_as_mark_acted();

-- Storage: a read-only session uploads, replaces and deletes nothing.
drop policy if exists view_as_read_only_insert on storage.objects;
create policy view_as_read_only_insert on storage.objects as restrictive for insert to authenticated
	with check (public.view_as_write_allowed());
drop policy if exists view_as_read_only_update on storage.objects;
create policy view_as_read_only_update on storage.objects as restrictive for update to authenticated
	using (public.view_as_write_allowed()) with check (public.view_as_write_allowed());
drop policy if exists view_as_read_only_delete on storage.objects;
create policy view_as_read_only_delete on storage.objects as restrictive for delete to authenticated
	using (public.view_as_write_allowed());

-- ---------------------------------------------------------------------------
-- Starting, reading and ending a session
-- ---------------------------------------------------------------------------

create or replace function public._view_as_person_name(p_user uuid, p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), '')) from public.profiles p where p.id = p_user),
		split_part(p_email, '@', 1)
	);
$$;
revoke all on function public._view_as_person_name(uuid, text) from public, anon, authenticated;

-- As the admin. Names the target by account id; answers the grant the
-- server then claims as the target.
create or replace function public.view_as_grant(p_user uuid, p_mode text default 'view')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_admin text := public.current_user_email();
	v_mode text := lower(btrim(coalesce(p_mode, 'view')));
	v_email text;
	v_id uuid;
begin
	if not public.is_admin() then
		raise exception 'Not found.';
	end if;
	if v_mode not in ('view', 'act') then
		raise exception 'Choose view or act.';
	end if;
	if p_user is null or p_user = (select auth.uid()) then
		raise exception 'Choose someone other than yourself.';
	end if;
	select lower(btrim(coalesce(u.email, ''))) into v_email from auth.users u where u.id = p_user;
	if v_email is null or v_email = '' then
		raise exception 'That account has never signed in, so there is nothing to view yet.';
	end if;
	if v_mode = 'act' and public._admin_is_email(v_email) then
		raise exception 'You cannot act as another site admin. Viewing is allowed.';
	end if;
	insert into public.view_as_grants (admin_email, admin_name, target_user, target_email, target_name, mode)
	values (v_admin, public._view_as_person_name((select auth.uid()), v_admin), p_user, v_email,
		public._view_as_person_name(p_user, v_email), v_mode)
	returning id into v_id;
	return jsonb_build_object('grant', v_id, 'email', v_email, 'mode', v_mode,
		'name', public._view_as_person_name(p_user, v_email));
end;
$$;
revoke all on function public.view_as_grant(uuid, text) from public, anon, authenticated;
grant execute on function public.view_as_grant(uuid, text) to authenticated;

-- As the target, in the freshly minted session. Binds the grant to this
-- session's own id. A grant is claimed once, by its own target, within two
-- minutes of being made.
create or replace function public.view_as_claim(p_grant uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_claims text := current_setting('request.jwt.claims', true);
	v_sid uuid;
	g public.view_as_grants;
	v_notice uuid;
	v_hours integer := 3;
begin
	begin
		v_sid := nullif(nullif(v_claims, '')::jsonb ->> 'session_id', '')::uuid;
	exception when others then
		v_sid := null;
	end;
	if v_sid is null then
		raise exception 'Not found.';
	end if;
	select * into g from public.view_as_grants x
	where x.id = p_grant and x.claimed_at is null and x.created_at > now() - interval '2 minutes'
	for update;
	if g.id is null or g.target_user is distinct from (select auth.uid()) then
		raise exception 'Not found.';
	end if;
	if exists (select 1 from public.view_as_sessions s where s.session_id = v_sid) then
		raise exception 'Not found.';
	end if;

	perform public._view_as_attach_guards();

	-- The notice goes in BEFORE the session row exists, so the guard does not
	-- count it as something the admin did on the account.
	if g.mode = 'act' then
		insert into public.account_notices (user_id, kind, title, body)
		values (g.target_user, 'acted_as',
			coalesce(g.admin_name, 'A site admin') || ' worked on your account',
			coalesce(g.admin_name, 'A site admin') || ' opened your account to make changes for you on '
				|| to_char(now() at time zone 'America/Los_Angeles', 'FMMonth FMDD "at" FMHH12:MI AM')
				|| '. Anything changed is logged under their name.')
		returning id into v_notice;
	end if;

	insert into public.view_as_sessions (session_id, grant_id, admin_email, admin_name, target_user, target_email,
		target_name, mode, expires_at, notice_id)
	values (v_sid, g.id, g.admin_email, g.admin_name, g.target_user, g.target_email, g.target_name, g.mode,
		now() + make_interval(hours => v_hours), v_notice);
	update public.view_as_grants set claimed_at = now() where id = g.id;

	return public.view_as_current();
end;
$$;
revoke all on function public.view_as_claim(uuid) from public, anon, authenticated;
grant execute on function public.view_as_claim(uuid) to authenticated;

-- As anyone: is THIS session a view-as or act-as session? Null when not.
create or replace function public.view_as_current()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v public.view_as_sessions := public._view_as_session();
begin
	if v.session_id is null then
		return null;
	end if;
	return jsonb_build_object(
		'mode', v.mode,
		'target_email', v.target_email,
		'target_name', coalesce(nullif(btrim(v.target_name), ''), split_part(v.target_email, '@', 1)),
		'admin_email', v.admin_email,
		'admin_name', v.admin_name,
		'started_at', v.started_at,
		'expires_at', v.expires_at,
		'expired', v.expires_at <= now(),
		'test_account', public._idea_is_test_email(v.target_email),
		'changes', (select count(*) from public.act_as_log l where l.session_id = v.session_id)
	);
end;
$$;
revoke all on function public.view_as_current() from public, anon, authenticated;
grant execute on function public.view_as_current() to authenticated;

-- As the target session, on the way out. The notice then says how many
-- changes were logged; that update runs after the session has ended, so it
-- is not itself counted as one.
create or replace function public.view_as_end()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v public.view_as_sessions := public._view_as_session();
	v_changes integer;
begin
	if v.session_id is null then
		return jsonb_build_object('ended', false);
	end if;
	update public.view_as_sessions set ended_at = now() where session_id = v.session_id;
	select count(*) into v_changes from public.act_as_log l where l.session_id = v.session_id;
	if v.notice_id is not null then
		update public.account_notices
		set body = body || case
			when v_changes = 0 then ' Nothing was changed.'
			when v_changes = 1 then ' One change was logged.'
			else ' ' || v_changes || ' changes were logged.' end
		where id = v.notice_id;
	end if;
	return jsonb_build_object('ended', true, 'mode', v.mode, 'changes', v_changes, 'target_email', v.target_email);
end;
$$;
revoke all on function public.view_as_end() from public, anon, authenticated;
grant execute on function public.view_as_end() to authenticated;

-- As an admin: the record. Every session, newest first, with what each act
-- session changed.
create or replace function public.view_as_history(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public.is_admin() then
		raise exception 'Not found.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'session', s.session_id, 'mode', s.mode, 'admin_email', s.admin_email, 'admin_name', s.admin_name,
			'target_email', s.target_email, 'target_name', s.target_name, 'started_at', s.started_at,
			'ended_at', s.ended_at, 'expires_at', s.expires_at,
			'changes', coalesce((
				select jsonb_agg(jsonb_build_object('table', l.table_name, 'operation', l.operation, 'path', l.path, 'at', l.at)
					order by l.at)
				from public.act_as_log l where l.session_id = s.session_id), '[]'::jsonb)
		) order by s.started_at desc)
		from (select * from public.view_as_sessions order by started_at desc
			limit greatest(1, least(coalesce(p_limit, 50), 200))) s
	), '[]'::jsonb);
end;
$$;
revoke all on function public.view_as_history(integer) from public, anon, authenticated;
grant execute on function public.view_as_history(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Notices to the account holder
-- ---------------------------------------------------------------------------

create or replace function public.account_notices_mine()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
			'created_at', n.created_at) order by n.created_at desc), '[]'::jsonb)
	from public.account_notices n
	where n.user_id = (select auth.uid()) and n.seen_at is null and n.created_at > now() - interval '30 days';
$$;
revoke all on function public.account_notices_mine() from public, anon, authenticated;
grant execute on function public.account_notices_mine() to authenticated;

create or replace function public.account_notice_dismiss(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	-- Only the account holder clears a notice, never an admin acting as them.
	if (public._view_as_session()).session_id is not null then
		raise exception 'Only % can clear this notice.', 'the account holder' using errcode = '42501';
	end if;
	update public.account_notices set seen_at = now()
	where id = p_id and user_id = (select auth.uid()) and seen_at is null;
	return jsonb_build_object('ok', found);
end;
$$;
revoke all on function public.account_notice_dismiss(uuid) from public, anon, authenticated;
grant execute on function public.account_notice_dismiss(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Test student accounts
-- ---------------------------------------------------------------------------

-- As an admin, after the server has created the auth user. Makes the account
-- a student and records it as a test account.
create or replace function public.test_account_register(p_user uuid, p_label text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text;
	v_label text := btrim(coalesce(p_label, ''));
begin
	if not public.is_admin() then
		raise exception 'Not found.';
	end if;
	if v_label = '' or char_length(v_label) > 80 then
		raise exception 'Give the test account a name of 1 to 80 characters.';
	end if;
	select lower(btrim(coalesce(u.email, ''))) into v_email from auth.users u where u.id = p_user;
	if v_email is null or v_email not like '%@test.ideabosco.com' then
		raise exception 'Only an account at test.ideabosco.com can be a test account.';
	end if;
	insert into public.test_accounts (email, user_id, label, created_by)
	values (v_email, p_user, v_label, public.current_user_email())
	on conflict (email) do update set label = excluded.label, user_id = excluded.user_id, retired_at = null;
	update public.profiles
	set role = 'student', full_name = v_label, display_name = v_label
	where id = p_user;
	return jsonb_build_object('ok', true, 'email', v_email, 'user_id', p_user, 'label', v_label);
end;
$$;
revoke all on function public.test_account_register(uuid, text) from public, anon, authenticated;
grant execute on function public.test_account_register(uuid, text) to authenticated;

create or replace function public.test_accounts_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public.is_admin() then
		raise exception 'Not found.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'email', t.email, 'user_id', t.user_id, 'label', t.label, 'created_by', t.created_by,
			'created_at', t.created_at, 'retired_at', t.retired_at,
			'classes', coalesce((
				select jsonb_agg(jsonb_build_object('section_id', e.section_id,
					'label', coalesce(c.code, '') || ' ' || coalesce(s.label, ''), 'active', e.active)
					order by c.code, s.label)
				from public.classroom_enrollments e
				join public.classroom_sections s on s.id = e.section_id
				left join public.classroom_courses c on c.id = s.course_id
				where e.student_email = t.email), '[]'::jsonb),
			'last_session', (select max(v.started_at) from public.view_as_sessions v where v.target_email = t.email)
		) order by t.retired_at nulls first, t.created_at)
		from public.test_accounts t
	), '[]'::jsonb);
end;
$$;
revoke all on function public.test_accounts_list() from public, anon, authenticated;
grant execute on function public.test_accounts_list() to authenticated;

-- Retiring takes the account out of every class. Its row stays, so anything
-- it ever wrote stays hidden from every list.
create or replace function public.test_account_retire(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_admin() then
		raise exception 'Not found.';
	end if;
	update public.test_accounts set retired_at = now() where email = v_email and retired_at is null;
	if not found then
		raise exception 'That is not an active test account.';
	end if;
	update public.classroom_enrollments set active = false, updated_at = now() where student_email = v_email and active;
	return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;
revoke all on function public.test_account_retire(text) from public, anon, authenticated;
grant execute on function public.test_account_retire(text) to authenticated;
