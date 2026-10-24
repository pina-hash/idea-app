-- 0299_feedback_bulk_spam_rewards.sql
--
-- THE FEEDBACK LISTS IN BULK, THE REPORT BOX AGAINST SPAM, THE FINE PROMPT
-- AND THE REWARD (ledger 0432, feedback 114d8101, 24a5156f, 4f1bdc96,
-- 7c869252, connector gap 7432f89f). Mr. Pina, 2026-10-23: reversible
-- changes (spam, status flips) need no confirm; a fine is 1 coin for a single
-- spam report and 5 for a burst; a reward is 1 to 10 coins he sets each time;
-- nothing pays without him.
--
-- PART 1. BULK STATUS. One call moves many rows of one list to one status:
--   app_feedback_set_status_many, armory_app_feedback_set_status_many,
--   armory_app_incidents_set_status_many. Each answers the status every row
--   had before, which its restore function (the undo) puts back:
--   app_feedback_restore_statuses, armory_app_feedback_restore_statuses,
--   armory_app_incidents_restore_statuses. An id that names nothing is
--   counted as missing and touches nothing; a row outside the ids is never
--   touched. Admin only, like the one-row functions they sit beside.
-- PART 2. ONE ARMORY INCIDENT, WHOLE: armory_app_incident_report, the report
--   JSON the list functions leave out, for an admin.
-- PART 3. THE REPORT BOX AGAINST SPAM: a trigger on app_feedback, before
--   insert, for both write paths.
--   * Rate shaping: a fifth report from one account (or one anonymous
--     address) inside two minutes, or a sixteenth inside an hour, is refused
--     with the message feedback_slow_down, which every client turns into a
--     plain sentence and keeps the words typed. Nothing is dropped silently.
--   * Obvious junk is kept and marked spam for review, never refused: under
--     two letters, one letter repeated, a short greeting or test word, or the
--     same words this account sent in the last day. meta.auto_spam says why,
--     and moving it back to new is the ordinary status change.
--   * Evidence is stamped by the server, never trusted from the client:
--     meta.evidence carries the sign-in session's start and browser (when the
--     auth sessions table is there to read) and the seconds since this
--     account's previous report. A meta.evidence the client sent is replaced.
-- PART 4. THE FINE PROMPT. app_feedback_spam_review lists every spam report
--   from a signed-in account that has no fine or dismissal yet, with the
--   evidence and, per device key, how many accounts used it. The page works
--   out bursts and amounts (src/lib/feedback/spam.ts, the one statement of
--   the rule). app_feedback_spam_fine(reports, amount, note) fines one account
--   for those reports as a system fine, so the student can dispute it from
--   their coin page; app_feedback_spam_dismiss(reports) records no fine.
--   Neither runs on its own: both need an admin who is a full coin admin.
-- PART 5. THE REWARD. app_feedback_reward(report, amount) pays the reporter
--   1 to 10 coins for a report that led to a change, once per report, and
--   marks it resolved; app_feedback_rewards_list says which were rewarded.
--
-- Two new coin categories, both unloggable by hand (only these functions
-- write them): Feedback Spam (a fine) and Feedback Reward (an award). The
-- category rows are inserted inside a do block and never overwrite an edit.
--
-- ADDITIVE, NO ORDERING: new names only, and the trigger refuses nothing a
-- real person sends at a human pace. IDEMPOTENT: create or replace, if not
-- exists, drop trigger if exists.
--
-- WHAT UNDOES IT: drop trigger app_feedback_spam_guard on public.app_feedback;
-- drop the functions this file creates and the tables app_feedback_spam_decisions
-- and app_feedback_rewards; set the two categories inactive. Fines and rewards
-- already paid stay in the ledger and are reversed like any other coin record.

do $pre$
begin
	if to_regclass('public.app_feedback') is null or to_regclass('public.armory_app_incidents') is null then
		raise exception '0299 cannot apply: the feedback tables do not exist. Apply 0053 and 0233 first.';
	end if;
	if to_regprocedure('public._coin_insert(text, text, numeric, numeric, text, jsonb, text, uuid, text)') is null
		or to_regprocedure('public._coin_full_staff()') is null then
		raise exception '0299 cannot apply: the coin writer or the coin staff gate is missing. Apply 0239 and 0244 first.';
	end if;
end
$pre$;

-- ===========================================================================
-- PART 1. BULK STATUS
-- ===========================================================================

create or replace function public._feedback_status_ok(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
	select coalesce(p_status, '') in ('new', 'seen', 'resolved', 'spam');
$$;
revoke all on function public._feedback_status_ok(text) from public, anon, authenticated, service_role;

create or replace function public.app_feedback_set_status_many(p_ids uuid[], p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_status text := lower(btrim(coalesce(p_status, '')));
	v_ids uuid[];
	v_previous jsonb;
	v_changed integer;
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Only a site admin can triage feedback.';
	end if;
	if not public._feedback_status_ok(v_status) then
		raise exception 'Status must be new, seen, resolved or spam.';
	end if;
	select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_ids, '{}')) x where x is not null;
	if cardinality(v_ids) > 2000 then
		return jsonb_build_object('ok', false, 'reason', 'too_many', 'limit', 2000);
	end if;
	select coalesce(jsonb_object_agg(f.id::text, f.status), '{}') into v_previous
	from public.app_feedback f where f.id = any(v_ids);
	update public.app_feedback
	set status = v_status, reviewed_at = now(), reviewed_by = public.current_user_email()
	where id = any(v_ids);
	get diagnostics v_changed = row_count;
	return jsonb_build_object('ok', true, 'status', v_status, 'total', cardinality(v_ids),
		'changed', v_changed, 'missing', cardinality(v_ids) - v_changed, 'previous', v_previous);
end;
$$;
revoke all on function public.app_feedback_set_status_many(uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_set_status_many(uuid[], text) to authenticated;

create or replace function public.app_feedback_restore_statuses(p_previous jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_now jsonb;
	v_changed integer;
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Only a site admin can triage feedback.';
	end if;
	if jsonb_typeof(coalesce(p_previous, 'null'::jsonb)) <> 'object' then
		raise exception 'Name each report with the status to put back.';
	end if;
	select coalesce(jsonb_object_agg(f.id::text, f.status), '{}') into v_now
	from public.app_feedback f
	join jsonb_each_text(p_previous) e on e.key ~ '^[0-9a-f-]{36}$' and f.id = e.key::uuid
	where public._feedback_status_ok(e.value);
	update public.app_feedback f
	set status = e.value, reviewed_at = now(), reviewed_by = public.current_user_email()
	from jsonb_each_text(p_previous) e
	where e.key ~ '^[0-9a-f-]{36}$' and f.id = e.key::uuid and public._feedback_status_ok(e.value);
	get diagnostics v_changed = row_count;
	return jsonb_build_object('ok', true, 'changed', v_changed, 'previous', v_now);
end;
$$;
revoke all on function public.app_feedback_restore_statuses(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_restore_statuses(jsonb) to authenticated;

create or replace function public.armory_app_feedback_set_status_many(p_ids uuid[], p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_status text := lower(btrim(coalesce(p_status, '')));
	v_ids uuid[];
	v_previous jsonb;
	v_changed integer;
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'Only a site admin can triage Armory feedback.' using errcode = '42501';
	end if;
	if not public._feedback_status_ok(v_status) then
		raise exception 'Status must be new, seen, resolved or spam.' using errcode = '22023';
	end if;
	select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_ids, '{}')) x where x is not null;
	if cardinality(v_ids) > 5000 then
		return jsonb_build_object('ok', false, 'reason', 'too_many', 'limit', 5000);
	end if;
	select coalesce(jsonb_object_agg(f.id::text, f.status), '{}') into v_previous
	from public.armory_app_feedback f where f.id = any(v_ids);
	update public.armory_app_feedback
	set status = v_status, reviewed_at = now(), reviewed_by = public.current_user_email()
	where id = any(v_ids);
	get diagnostics v_changed = row_count;
	return jsonb_build_object('ok', true, 'status', v_status, 'total', cardinality(v_ids),
		'changed', v_changed, 'missing', cardinality(v_ids) - v_changed, 'previous', v_previous);
end;
$$;
revoke all on function public.armory_app_feedback_set_status_many(uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.armory_app_feedback_set_status_many(uuid[], text) to authenticated;

create or replace function public.armory_app_feedback_restore_statuses(p_previous jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_now jsonb;
	v_changed integer;
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'Only a site admin can triage Armory feedback.' using errcode = '42501';
	end if;
	if jsonb_typeof(coalesce(p_previous, 'null'::jsonb)) <> 'object' then
		raise exception 'Name each note with the status to put back.' using errcode = '22023';
	end if;
	select coalesce(jsonb_object_agg(f.id::text, f.status), '{}') into v_now
	from public.armory_app_feedback f
	join jsonb_each_text(p_previous) e on e.key ~ '^[0-9a-f-]{36}$' and f.id = e.key::uuid
	where public._feedback_status_ok(e.value);
	update public.armory_app_feedback f
	set status = e.value, reviewed_at = now(), reviewed_by = public.current_user_email()
	from jsonb_each_text(p_previous) e
	where e.key ~ '^[0-9a-f-]{36}$' and f.id = e.key::uuid and public._feedback_status_ok(e.value);
	get diagnostics v_changed = row_count;
	return jsonb_build_object('ok', true, 'changed', v_changed, 'previous', v_now);
end;
$$;
revoke all on function public.armory_app_feedback_restore_statuses(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.armory_app_feedback_restore_statuses(jsonb) to authenticated;

create or replace function public.armory_app_incidents_set_status_many(p_ids uuid[], p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_status text := lower(btrim(coalesce(p_status, '')));
	v_ids uuid[];
	v_previous jsonb;
	v_changed integer;
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'Only a site admin can triage Armory incidents.' using errcode = '42501';
	end if;
	if not public._feedback_status_ok(v_status) then
		raise exception 'Status must be new, seen, resolved or spam.' using errcode = '22023';
	end if;
	select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_ids, '{}')) x where x is not null;
	if cardinality(v_ids) > 5000 then
		return jsonb_build_object('ok', false, 'reason', 'too_many', 'limit', 5000);
	end if;
	select coalesce(jsonb_object_agg(i.id::text, i.status), '{}') into v_previous
	from public.armory_app_incidents i where i.id = any(v_ids);
	update public.armory_app_incidents
	set status = v_status, reviewed_at = now(), reviewed_by = public.current_user_email()
	where id = any(v_ids);
	get diagnostics v_changed = row_count;
	return jsonb_build_object('ok', true, 'status', v_status, 'total', cardinality(v_ids),
		'changed', v_changed, 'missing', cardinality(v_ids) - v_changed, 'previous', v_previous);
end;
$$;
revoke all on function public.armory_app_incidents_set_status_many(uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.armory_app_incidents_set_status_many(uuid[], text) to authenticated;

create or replace function public.armory_app_incidents_restore_statuses(p_previous jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_now jsonb;
	v_changed integer;
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'Only a site admin can triage Armory incidents.' using errcode = '42501';
	end if;
	if jsonb_typeof(coalesce(p_previous, 'null'::jsonb)) <> 'object' then
		raise exception 'Name each incident with the status to put back.' using errcode = '22023';
	end if;
	select coalesce(jsonb_object_agg(i.id::text, i.status), '{}') into v_now
	from public.armory_app_incidents i
	join jsonb_each_text(p_previous) e on e.key ~ '^[0-9a-f-]{36}$' and i.id = e.key::uuid
	where public._feedback_status_ok(e.value);
	update public.armory_app_incidents i
	set status = e.value, reviewed_at = now(), reviewed_by = public.current_user_email()
	from jsonb_each_text(p_previous) e
	where e.key ~ '^[0-9a-f-]{36}$' and i.id = e.key::uuid and public._feedback_status_ok(e.value);
	get diagnostics v_changed = row_count;
	return jsonb_build_object('ok', true, 'changed', v_changed, 'previous', v_now);
end;
$$;
revoke all on function public.armory_app_incidents_restore_statuses(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.armory_app_incidents_restore_statuses(jsonb) to authenticated;

-- ===========================================================================
-- PART 2. ONE ARMORY INCIDENT, WHOLE
-- ===========================================================================

create or replace function public.armory_app_incident_report(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v public.armory_app_incidents;
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'Only a site admin can read Armory incidents.' using errcode = '42501';
	end if;
	select * into v from public.armory_app_incidents where id = p_id;
	if v.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return jsonb_build_object('ok', true, 'id', v.id, 'created_at', v.created_at, 'email', v.email,
		'device_name', v.device_name, 'app_version', v.app_version, 'kind', v.kind, 'summary', v.summary,
		'project_id', v.project_id, 'status', v.status, 'report_bytes', v.report_bytes, 'report', v.report);
end;
$$;
revoke all on function public.armory_app_incident_report(uuid) from public, anon, authenticated, service_role;
grant execute on function public.armory_app_incident_report(uuid) to authenticated;

-- ===========================================================================
-- PART 3. THE REPORT BOX AGAINST SPAM
-- ===========================================================================

-- The words a junk check compares, lowercased, letters and digits only.
create or replace function public._feedback_normal_words(p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
	select btrim(regexp_replace(lower(coalesce(p_message, '')), '[^a-z0-9]+', ' ', 'g'));
$$;
revoke all on function public._feedback_normal_words(text) from public, anon, authenticated, service_role;

-- Why a message is obvious junk, or null. Kept and marked spam, never refused.
create or replace function public._feedback_junk_reason(p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
	select case
		when char_length(regexp_replace(lower(coalesce(p_message, '')), '[^a-z]', '', 'g')) < 2 then 'too_short'
		when regexp_replace(lower(coalesce(p_message, '')), '[^a-z]', '', 'g') ~ '^(.)\1+$' then 'one_letter'
		when public._feedback_normal_words(p_message) in (
			'hi', 'hii', 'hiii', 'hey', 'hello', 'yo', 'sup', 'test', 'testing', 'asdf', 'qwerty', 'lol', 'lmao',
			'ok', 'okay', 'k', 'idk', 'bruh', 'stock', 'feedback stock', 'feedback', 'spam', 'abc', 'aaa', 'hi hi')
			then 'greeting_or_test'
		else null
	end;
$$;
revoke all on function public._feedback_junk_reason(text) from public, anon, authenticated, service_role;

-- The shaping limits, stated once.
create or replace function public._feedback_rate_rules()
returns jsonb
language sql
immutable
set search_path = ''
as $$
	select jsonb_build_object('short_seconds', 120, 'short_cap', 4, 'hour_cap', 15, 'repeat_hours', 24);
$$;
revoke all on function public._feedback_rate_rules() from public, anon, authenticated, service_role;

create or replace function public._app_feedback_spam_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_rules jsonb := public._feedback_rate_rules();
	v_short integer;
	v_hour integer;
	v_repeat boolean := false;
	v_reason text;
	v_prev timestamptz;
	v_session text;
	v_evidence jsonb := '{}'::jsonb;
	v_started timestamptz;
	v_agent text;
begin
	if new.user_id is null and new.reporter_hash is null then
		return new;
	end if;
	-- A site admin's own reports (the console, the connector's filing) are never shaped or judged.
	if new.user_id is not null and public.is_admin() then
		return new;
	end if;
	-- One account (or one address) at a time, so the counts below are exact.
	perform pg_advisory_xact_lock(hashtext('app_feedback_guard:' || coalesce(new.user_id::text, new.reporter_hash)));
	select count(*) filter (where f.created_at > now() - make_interval(secs => (v_rules ->> 'short_seconds')::integer)),
		count(*) filter (where f.created_at > now() - interval '1 hour'),
		max(f.created_at),
		coalesce(bool_or(public._feedback_normal_words(f.message) = public._feedback_normal_words(new.message)
			and f.created_at > now() - make_interval(hours => (v_rules ->> 'repeat_hours')::integer)), false)
	into v_short, v_hour, v_prev, v_repeat
	from public.app_feedback f
	where f.created_at > now() - make_interval(hours => (v_rules ->> 'repeat_hours')::integer)
		and ((new.user_id is not null and f.user_id = new.user_id)
			or (new.user_id is null and f.reporter_hash = new.reporter_hash));
	if v_short >= (v_rules ->> 'short_cap')::integer or v_hour >= (v_rules ->> 'hour_cap')::integer then
		raise exception 'feedback_slow_down' using errcode = 'P0429',
			hint = 'Several reports arrived from this account in a few minutes. Wait a minute and send it again.';
	end if;

	v_reason := public._feedback_junk_reason(new.message);
	if v_reason is null and v_repeat then
		v_reason := 'repeat';
	end if;

	-- Evidence the server stamps; whatever the client sent under this key is replaced.
	if new.user_id is not null then
		v_session := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id';
		if v_session is not null and v_session ~ '^[0-9a-f-]{36}$' and to_regclass('auth.sessions') is not null then
			begin
				execute 'select created_at, user_agent from auth.sessions where id = $1 and user_id = $2'
					into v_started, v_agent using v_session::uuid, new.user_id;
			exception when others then
				v_started := null;
				v_agent := null;
			end;
		end if;
		v_evidence := jsonb_strip_nulls(jsonb_build_object(
			'session_id', v_session,
			'session_started', v_started,
			'user_agent', left(v_agent, 300),
			'seconds_since_previous', case when v_prev is null then null else round(extract(epoch from now() - v_prev))::integer end));
	end if;
	new.meta := (coalesce(new.meta, '{}'::jsonb) - 'evidence' - 'auto_spam')
		|| case when v_evidence = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('evidence', v_evidence) end
		|| case when v_reason is null then '{}'::jsonb else jsonb_build_object('auto_spam', v_reason) end;
	if v_reason is not null then
		new.status := 'spam';
	end if;
	return new;
end;
$$;
revoke all on function public._app_feedback_spam_guard() from public, anon, authenticated, service_role;

drop trigger if exists app_feedback_spam_guard on public.app_feedback;
create trigger app_feedback_spam_guard
	before insert on public.app_feedback
	for each row execute function public._app_feedback_spam_guard();

-- ===========================================================================
-- PART 4. THE FINE PROMPT
-- ===========================================================================

create table if not exists public.app_feedback_spam_decisions (
	report_id uuid primary key references public.app_feedback (id) on delete cascade,
	decision text not null check (decision in ('fined', 'dismissed')),
	transaction_id uuid,
	amount numeric(12, 2),
	decided_by text not null,
	decided_at timestamptz not null default now()
);
alter table public.app_feedback_spam_decisions enable row level security;
revoke all on table public.app_feedback_spam_decisions from public, anon, authenticated, service_role;

create table if not exists public.app_feedback_rewards (
	report_id uuid primary key references public.app_feedback (id) on delete cascade,
	transaction_id uuid not null,
	amount integer not null check (amount between 1 and 10),
	rewarded_by text not null,
	rewarded_at timestamptz not null default now()
);
alter table public.app_feedback_rewards enable row level security;
revoke all on table public.app_feedback_rewards from public, anon, authenticated, service_role;

do $cat$
begin
	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes)
	values
		('feedback_spam', 'Feedback Spam', 'fine', 'core', 'variable', null, null, null, null, null, null, null, null,
		 false, true, 140, 'Ledger 0432: logged only when an admin confirms a ready fine for spam sent from the report box. The student can dispute it.'),
		('feedback_reward', 'Feedback Reward', 'award', 'core', 'variable', null, null, null, null, null, null, null, null,
		 false, true, 230, 'Ledger 0432: 1 to 10 coins an admin sets when a report led to a change on the site.')
	on conflict (id) do nothing;
end
$cat$;

-- Every spam report from a signed-in account with no decision yet, with the
-- evidence a person needs, newest first. The page decides bursts and amounts.
create or replace function public.app_feedback_spam_review(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_days integer := least(greatest(coalesce(p_days, 14), 1), 90);
	v_rows jsonb;
	v_devices jsonb;
	v_agents jsonb := '{}'::jsonb;
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Only a site admin can review feedback spam.';
	end if;
	with spam as (
		select f.id, f.user_id, f.created_at, f.message, f.app, f.context, f.meta, f.kind,
			lower(btrim(coalesce(p.email, ''))) as email,
			coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), 'A student') as name,
			p.role
		from public.app_feedback f
		join public.profiles p on p.id = f.user_id
		where f.status = 'spam' and f.user_id is not null
			and f.created_at > now() - make_interval(days => v_days)
			and not exists (select 1 from public.app_feedback_spam_decisions d where d.report_id = f.id)
			and p.role in ('student', 'visitor')
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', s.id, 'user_id', s.user_id, 'email', s.email, 'name', s.name, 'created_at', s.created_at,
		'message', left(s.message, 300), 'app', s.app, 'page', coalesce(s.meta ->> 'route', s.context),
		'auto_spam', s.meta ->> 'auto_spam', 'evidence', coalesce(s.meta -> 'evidence', '{}'::jsonb),
		'device_key', s.meta #>> '{device,key}', 'device_label', s.meta #>> '{device,label}'
	) order by s.created_at desc), '[]'::jsonb)
	into v_rows from spam s;

	-- How many accounts each device key in the list has sent reports from, in 90 days.
	select coalesce(jsonb_object_agg(k.key, k.accounts), '{}'::jsonb) into v_devices
	from (
		select f.meta #>> '{device,key}' as key, count(distinct f.user_id) as accounts
		from public.app_feedback f
		where f.created_at > now() - interval '90 days' and f.user_id is not null
			and f.meta #>> '{device,key}' in (select r ->> 'device_key' from jsonb_array_elements(v_rows) r)
		group by 1
	) k;

	-- Each account's usual browsers, from its sign-in sessions, where that table can be read.
	if to_regclass('auth.sessions') is not null then
		begin
			execute $q$
				select coalesce(jsonb_object_agg(a.user_id::text, a.agents), '{}'::jsonb)
				from (
					select s.user_id, jsonb_agg(jsonb_build_object('user_agent', left(s.user_agent, 300), 'sessions', s.n) order by s.n desc) as agents
					from (
						select x.user_id, x.user_agent, count(*) as n
						from auth.sessions x
						where x.user_id in (select (r ->> 'user_id')::uuid from jsonb_array_elements($1) r)
							and x.created_at > now() - interval '30 days'
						group by 1, 2
					) s
					group by s.user_id
				) a
			$q$ into v_agents using v_rows;
		exception when others then
			v_agents := '{}'::jsonb;
		end;
	end if;

	return jsonb_build_object('ok', true, 'days', v_days, 'reports', v_rows,
		'device_accounts', v_devices, 'usual_agents', coalesce(v_agents, '{}'::jsonb));
end;
$$;
revoke all on function public.app_feedback_spam_review(integer) from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_spam_review(integer) to authenticated;

-- Fine one account for spam reports it sent: a system fine the student can
-- dispute. Every report must be spam, undecided, and from that one account.
create or replace function public.app_feedback_spam_fine(p_report_ids uuid[], p_amount numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_ids uuid[];
	v_users integer;
	v_user uuid;
	v_bad integer;
	v_email text;
	v_role text;
	v_amount numeric := round(coalesce(p_amount, 0), 2);
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_row public.coin_transactions;
begin
	if (select auth.uid()) is null or not public.is_admin() or not public._coin_full_staff() then
		raise exception 'Only a site admin who is a full coin admin can fine for feedback spam.';
	end if;
	select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_report_ids, '{}')) x where x is not null;
	if cardinality(v_ids) = 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_reports');
	end if;
	if v_amount < 1 or v_amount > 50 or v_amount <> trunc(v_amount) then
		return jsonb_build_object('ok', false, 'reason', 'amount', 'min', 1, 'max', 50);
	end if;
	perform 1 from public.app_feedback f where f.id = any(v_ids) for update;
	select count(*) filter (where f.status <> 'spam' or f.user_id is null
			or exists (select 1 from public.app_feedback_spam_decisions d where d.report_id = f.id)),
		count(distinct f.user_id), min(f.user_id::text)::uuid
	into v_bad, v_users, v_user
	from public.app_feedback f where f.id = any(v_ids);
	if (select count(*) from public.app_feedback f where f.id = any(v_ids)) <> cardinality(v_ids) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_bad > 0 then
		return jsonb_build_object('ok', false, 'reason', 'not_open_spam');
	end if;
	if v_users <> 1 then
		return jsonb_build_object('ok', false, 'reason', 'more_than_one_account');
	end if;
	select lower(btrim(coalesce(p.email, ''))), p.role into v_email, v_role from public.profiles p where p.id = v_user;
	if coalesce(v_email, '') = '' or v_role not in ('student', 'visitor') or public._admin_is_email(v_email) then
		return jsonb_build_object('ok', false, 'reason', 'not_a_student');
	end if;
	v_row := public._coin_insert(v_email, 'feedback_spam', -v_amount, null,
		coalesce(v_note, case when cardinality(v_ids) = 1 then 'Spam sent from the feedback button.'
			else cardinality(v_ids) || ' spam reports sent from the feedback button.' end),
		jsonb_build_object('feedback_report_ids', to_jsonb(v_ids), 'confirmed_by', public.current_user_email()),
		'digital', null, 'system');
	insert into public.app_feedback_spam_decisions (report_id, decision, transaction_id, amount, decided_by)
	select x, 'fined', v_row.id, v_amount, public.current_user_email() from unnest(v_ids) x;
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'amount', v_amount,
		'reports', cardinality(v_ids), 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.app_feedback_spam_fine(uuid[], numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_spam_fine(uuid[], numeric, text) to authenticated;

create or replace function public.app_feedback_spam_dismiss(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_n integer;
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Only a site admin can review feedback spam.';
	end if;
	insert into public.app_feedback_spam_decisions (report_id, decision, decided_by)
	select f.id, 'dismissed', public.current_user_email()
	from public.app_feedback f
	where f.id = any(coalesce(p_report_ids, '{}')) and f.status = 'spam'
	on conflict (report_id) do nothing;
	get diagnostics v_n = row_count;
	return jsonb_build_object('ok', true, 'dismissed', v_n);
end;
$$;
revoke all on function public.app_feedback_spam_dismiss(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_spam_dismiss(uuid[]) to authenticated;

-- ===========================================================================
-- PART 5. THE REWARD
-- ===========================================================================

create or replace function public.app_feedback_reward(p_report_id uuid, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v public.app_feedback;
	v_email text;
	v_role text;
	v_row public.coin_transactions;
begin
	if (select auth.uid()) is null or not public.is_admin() or not public._coin_full_staff() then
		raise exception 'Only a site admin who is a full coin admin can reward a report.';
	end if;
	if p_amount is null or p_amount < 1 or p_amount > 10 then
		return jsonb_build_object('ok', false, 'reason', 'amount', 'min', 1, 'max', 10);
	end if;
	select * into v from public.app_feedback where id = p_report_id for update;
	if v.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v.user_id is null then
		return jsonb_build_object('ok', false, 'reason', 'anonymous');
	end if;
	if exists (select 1 from public.app_feedback_rewards r where r.report_id = v.id) then
		return jsonb_build_object('ok', false, 'reason', 'already_rewarded');
	end if;
	select lower(btrim(coalesce(p.email, ''))), p.role into v_email, v_role from public.profiles p where p.id = v.user_id;
	if coalesce(v_email, '') = '' or v_role not in ('student', 'visitor') or public._admin_is_email(v_email) then
		return jsonb_build_object('ok', false, 'reason', 'not_a_student');
	end if;
	v_row := public._coin_insert(v_email, 'feedback_reward', p_amount, null,
		'Your report helped change the site: "' || left(regexp_replace(v.message, '\s+', ' ', 'g'), 80) || '"',
		jsonb_build_object('feedback_report_id', v.id), 'digital', null, public.current_user_email());
	insert into public.app_feedback_rewards (report_id, transaction_id, amount, rewarded_by)
	values (v.id, v_row.id, p_amount, public.current_user_email());
	update public.app_feedback
	set status = 'resolved', reviewed_at = now(), reviewed_by = public.current_user_email()
	where id = v.id;
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'amount', p_amount);
end;
$$;
revoke all on function public.app_feedback_reward(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_reward(uuid, integer) to authenticated;

create or replace function public.app_feedback_rewards_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Only a site admin can read feedback rewards.';
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object('report_id', r.report_id, 'amount', r.amount,
		'rewarded_at', r.rewarded_at) order by r.rewarded_at desc) from public.app_feedback_rewards r), '[]'::jsonb);
end;
$$;
revoke all on function public.app_feedback_rewards_list() from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_rewards_list() to authenticated;

-- SAVED REQUESTS FOR THE ARMORY HALF OF THE NEW CONNECTOR TOOLS (ledger 0432),
-- so the nightly replay checks their routes. Inserted once each, keyed on the
-- normalized words; 0300 adds the coin and feedback half.
do $evals$
declare
	v_n integer;
begin
	if to_regclass('public.connector_evals') is null or to_regprocedure('public._connector_said_norm(text)') is null then
		raise notice '0299: no saved request list on this database; none added';
		return;
	end if;
	insert into public.connector_evals (seq, said, said_norm, level, must_happen, proof, proof_query, expected_path, source, created_by)
	select (select coalesce(max(seq), 0) from public.connector_evals) + v.n, v.said, public._connector_said_norm(v.said), v.level, v.must, v.proof, v.q, v.path, 'seed', 'ledger 0432'
	from (values
		(1, 'Resolve every new Armory incident from version 0.3.3', 'undo', 'One call resolves every new incident from 0.3.3 and no other', 'armory_app_incidents status resolved for exactly those', 'select status, count(*) from public.armory_app_incidents where app_version = ''0.3.3'' group by status', array['mark_feedback']::text[]),
		(2, 'Any new Armory incidents?', 'read', 'The open incidents with counts by status and version', 'Matches armory_app_incidents_admin_list', 'select status, count(*) from public.armory_app_incidents group by status', array['list_armory_reports']::text[]),
		(3, 'Read the newest Armory slow pass report', 'read', 'The whole report, events, phase timings and log lines', 'Matches the report JSON of that incident', 'select report from public.armory_app_incidents where kind = ''slowPass'' order by created_at desc limit 1', array['list_armory_reports', 'read_armory_incident']::text[])
	) as v(n, said, level, must, proof, q, path)
	on conflict (said_norm) do nothing;
	get diagnostics v_n = row_count;
	raise notice '0299: % saved requests added for the Armory lists', v_n;
end
$evals$;

do $post$
declare
	f text;
begin
	foreach f in array array[
		'public.app_feedback_set_status_many(uuid[], text)', 'public.app_feedback_restore_statuses(jsonb)',
		'public.armory_app_feedback_set_status_many(uuid[], text)', 'public.armory_app_feedback_restore_statuses(jsonb)',
		'public.armory_app_incidents_set_status_many(uuid[], text)', 'public.armory_app_incidents_restore_statuses(jsonb)',
		'public.armory_app_incident_report(uuid)', 'public.app_feedback_spam_review(integer)',
		'public.app_feedback_spam_fine(uuid[], numeric, text)', 'public.app_feedback_spam_dismiss(uuid[])',
		'public.app_feedback_reward(uuid, integer)', 'public.app_feedback_rewards_list()']
	loop
		if has_function_privilege('anon', f, 'execute') then
			raise exception '0299 self-check failed: % is executable by anon.', f;
		end if;
	end loop;
	foreach f in array array['public._app_feedback_spam_guard()', 'public._feedback_junk_reason(text)',
		'public._feedback_normal_words(text)', 'public._feedback_rate_rules()', 'public._feedback_status_ok(text)']
	loop
		if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
			raise exception '0299 self-check failed: % is executable by a client.', f;
		end if;
	end loop;
	if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'app_feedback_spam_guard' and not tgisinternal) then
		raise exception '0299 self-check failed: the spam guard trigger is missing.';
	end if;
	raise notice '0299: % spam reports waiting for a fine decision; the guard is on', (
		select count(*) from public.app_feedback f where f.status = 'spam' and f.user_id is not null
			and not exists (select 1 from public.app_feedback_spam_decisions d where d.report_id = f.id));
end
$post$;
