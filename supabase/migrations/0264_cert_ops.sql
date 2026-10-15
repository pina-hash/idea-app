-- 0264_cert_ops.sql
--
-- IDEA CERTIFICATION PORTAL, PART FIVE OF FIVE (ledger 0391): OPERATIONS.
-- docs/certifications/DATA_MODEL.md section 0264. The FRC app mirror snapshot
-- and its log, the error log, the scheduled jobs (dormancy, expiry reminders,
-- the email flush), the desk telemetry and the bulk exports.
--
-- WHAT IT CREATES, all new and all cert_-prefixed:
--   tables     cert_sync_log (append-only), cert_errors (append-only)
--   helpers    _cert_ops_caller_ok, _cert_scope
--   client     cert_mirror_snapshot (A, S), cert_sync_log_write (A, S),
--              cert_sync_log_list (A), cert_error_log (A, S),
--              cert_sweep_dormant (A, S), cert_expiry_reminders (A, S),
--              cert_notifications_unsent (S only),
--              cert_notifications_mark_sent (A, S), cert_telemetry (A),
--              cert_export (A)
--
-- THE SCHEDULED JOBS RUN WITH NO SESSION, so the job functions admit
-- service_role (auth.role() = 'service_role') as well as a signed-in admin
-- (decision D4). cert_mirror_snapshot builds the frc-app contract's snapshot
-- in SQL with its exact keys, every key present and null where the contract
-- allows it (its docs/IDEA_CERTIFICATIONS_SYNC.md, read character for
-- character); drafts are never sent, expired is derived at build time, and
-- the whole catalog and every holder row of every status ride every call.
--
-- ADDITIVE AND IDEMPOTENT; every table RLS on, no policy, no client grant; every
-- function revokes from public, anon, authenticated and service_role by name
-- and grants back only what its contract row lists. DEPLOY ORDER: none.
--
-- UNDO, for a person's paste:
--   drop function if exists public.cert_export(text, timestamptz, timestamptz);
--   drop function if exists public.cert_telemetry();
--   drop function if exists public.cert_notifications_mark_sent(uuid[], text);
--   drop function if exists public.cert_notifications_unsent(integer);
--   drop function if exists public.cert_expiry_reminders();
--   drop function if exists public.cert_sweep_dormant();
--   drop function if exists public.cert_error_log(text, text, jsonb, text);
--   drop function if exists public.cert_sync_log_list(integer);
--   drop function if exists public.cert_sync_log_write(jsonb);
--   drop function if exists public.cert_mirror_snapshot();
--   drop function if exists public._cert_scope();
--   drop function if exists public._cert_ops_caller_ok();
--   drop table if exists public.cert_errors;
--   drop table if exists public.cert_sync_log;

-- ===== PART A BEGIN =====
-- ===== PART A: TABLES =====

create table if not exists public.cert_sync_log (
	id bigserial primary key,
	at timestamptz not null default now(),
	trigger text not null check (trigger in ('award', 'catalog', 'daily', 'manual')),
	ok boolean not null,
	http_status integer,
	catalog_count integer,
	holder_count integer,
	source_revision text,
	error text,
	duration_ms integer,
	remote_log_id bigint
);
create index if not exists cert_sync_log_at_idx on public.cert_sync_log (at desc);
alter table public.cert_sync_log enable row level security;
revoke all on table public.cert_sync_log from public, anon, authenticated;
revoke all on sequence public.cert_sync_log_id_seq from public, anon, authenticated;

create table if not exists public.cert_errors (
	id bigserial primary key,
	at timestamptz not null default now(),
	where_ text not null,
	message text not null,
	detail jsonb not null default '{}'::jsonb,
	correlation_id text
);
create index if not exists cert_errors_at_idx on public.cert_errors (at desc);
alter table public.cert_errors enable row level security;
revoke all on table public.cert_errors from public, anon, authenticated;
revoke all on sequence public.cert_errors_id_seq from public, anon, authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: HELPERS =====

-- A scheduled job (service_role) or a signed-in admin.
create or replace function public._cert_ops_caller_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	if coalesce((select auth.role()), '') = 'service_role' then
		return true;
	end if;
	return public.is_admin();
end;
$fn$;
revoke all on function public._cert_ops_caller_ok() from public, anon, authenticated, service_role;

-- The certifications the caller may read as a certifier: every one for an
-- admin, the live authority rows otherwise. Empty for everybody else.
create or replace function public._cert_scope()
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := lower(btrim(coalesce(public.current_user_email(), '')));
begin
	if public.is_admin() then
		return coalesce((select array_agg(c.id) from public.cert_certifications c), '{}'::uuid[]);
	end if;
	if v_me = '' then
		return '{}'::uuid[];
	end if;
	return coalesce((
		select array_agg(a.certification_id) from public.cert_authority a where a.email = v_me and a.revoked_at is null
	), '{}'::uuid[]);
end;
$fn$;
revoke all on function public._cert_scope() from public, anon, authenticated, service_role;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE MIRROR =====

-- The frc-app snapshot, exactly its contract's keys. Drafts never; every
-- award of every status; status mapped from the shown status (valid to
-- active); instants in ISO 8601 UTC with a Z.
create or replace function public.cert_mirror_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_expiry date;
	v_renewal_words text;
	v_latest timestamptz;
begin
	if not public._cert_ops_caller_ok() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select school_year_expiry into v_expiry from public.cert_settings where id;
	v_renewal_words := case when v_expiry is null then 'Expires each school year'
		else 'Expires on ' || to_char(v_expiry, 'FMMonth FMDD, YYYY') || ' each school year' end;
	select greatest(
		(select max(c.updated_at) from public.cert_certifications c where c.state <> 'draft'),
		(select max(a.updated_at) from public.cert_awards a)
	) into v_latest;
	return jsonb_build_object(
		'source_revision', 'idea-certs-' || to_char(coalesce(v_latest, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		'catalog', coalesce((
			select jsonb_agg(jsonb_build_object(
				'code', c.code,
				'name', c.name,
				'level', c.level,
				'category', c.category,
				'definition', nullif(r.package ->> 'definition', ''),
				'allows', nullif(r.package ->> 'allows', ''),
				'does_not_allow', nullif(r.package ->> 'does_not_allow', ''),
				'prerequisites', coalesce((
					select jsonb_agg(q.code order by q.code) from public.cert_prerequisites pr
					join public.cert_certifications q on q.id = pr.requires_id
					where pr.certification_id = c.id and q.state <> 'draft'
				), '[]'::jsonb),
				'renewal', case when c.renewal = 'school_year' then v_renewal_words else null end,
				'active', c.state = 'published',
				'sort_order', c.sort_order
			) order by c.category, c.sort_order, c.level, c.code)
			from public.cert_certifications c
			left join public.cert_revisions r on r.id = c.current_revision_id
			where c.state <> 'draft'
		), '[]'::jsonb),
		'holders', coalesce((
			select jsonb_agg(jsonb_build_object(
				'serial', a.serial,
				'email', a.email,
				'holder_name', a.holder_name,
				'code', a.code,
				'status', case public._cert_award_status(a) when 'valid' then 'active' else public._cert_award_status(a) end,
				'awarded_at', to_char(a.awarded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
				'awarded_by_name', a.awarded_by_name,
				'expires_at', case when a.expires_at is null then null
					else to_char(a.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end
			) order by a.awarded_at, a.serial)
			from public.cert_awards a
			join public.cert_certifications c on c.id = a.certification_id
			where c.state <> 'draft'
		), '[]'::jsonb)
	);
end;
$fn$;
revoke all on function public.cert_mirror_snapshot() from public, anon, authenticated, service_role;
grant execute on function public.cert_mirror_snapshot() to authenticated, service_role;

create or replace function public.cert_sync_log_write(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_id bigint;
	v_actor text := nullif(lower(btrim(coalesce(public.current_user_email(), ''))), '');
begin
	if not public._cert_ops_caller_ok() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if not public._cert_jt(p, 'object') or coalesce(p ->> 'trigger', '') not in ('award', 'catalog', 'daily', 'manual')
		or not public._cert_jt(p -> 'ok', 'boolean') then
		raise exception 'cert_sync_log_write: expected an object with a trigger (award, catalog, daily, manual) and ok';
	end if;
	insert into public.cert_sync_log (trigger, ok, http_status, catalog_count, holder_count, source_revision, error, duration_ms, remote_log_id)
	values (p ->> 'trigger', (p ->> 'ok')::boolean,
		case when public._cert_jint(p -> 'http_status') then (p ->> 'http_status')::integer end,
		case when public._cert_jint(p -> 'catalog_count') then (p ->> 'catalog_count')::integer end,
		case when public._cert_jint(p -> 'holder_count') then (p ->> 'holder_count')::integer end,
		nullif(public._cert_norm(p ->> 'source_revision'), ''),
		nullif(public._cert_norm(p ->> 'error'), ''),
		case when public._cert_jint(p -> 'duration_ms') then (p ->> 'duration_ms')::integer end,
		case when public._cert_jint(p -> 'remote_log_id') then (p ->> 'remote_log_id')::bigint end)
	returning id into v_id;
	perform public._cert_event('sync.sent', v_actor, null, null, null,
		jsonb_build_object('sync_log_id', v_id, 'trigger', p ->> 'trigger', 'ok', (p ->> 'ok')::boolean,
			'http_status', p -> 'http_status', 'catalog_count', p -> 'catalog_count', 'holder_count', p -> 'holder_count'),
		nullif(public._cert_norm(p ->> 'error'), ''));
	return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn$;
revoke all on function public.cert_sync_log_write(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cert_sync_log_write(jsonb) to authenticated, service_role;

create or replace function public.cert_sync_log_list(p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	perform public._cert_caller();
	if not public._cert_is_certifier() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	return coalesce((
		select jsonb_agg(to_jsonb(l) order by l.at desc) from (
			select * from public.cert_sync_log x order by x.at desc limit least(greatest(coalesce(p_limit, 100), 1), 1000)
		) l
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_sync_log_list(integer) from public, anon, authenticated, service_role;
grant execute on function public.cert_sync_log_list(integer) to authenticated;

-- One error row from a server failure. The detail must not carry a secret;
-- that is the caller's duty.
create or replace function public.cert_error_log(p_where text, p_message text, p_detail jsonb, p_correlation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_id bigint;
	v_me text := lower(btrim(coalesce(public.current_user_email(), '')));
begin
	if v_me = '' and coalesce((select auth.role()), '') <> 'service_role' then
		raise exception 'cert: no session';
	end if;
	if public._cert_norm(p_where) = '' or public._cert_norm(p_message) = '' then
		raise exception 'cert_error_log: where and message are required';
	end if;
	insert into public.cert_errors (where_, message, detail, correlation_id)
	values (left(public._cert_norm(p_where), 200), left(public._cert_norm(p_message), 4000),
		case when public._cert_jt(p_detail, 'object') then p_detail else '{}'::jsonb end,
		nullif(public._cert_norm(p_correlation), ''))
	returning id into v_id;
	perform public._cert_event('error', nullif(v_me, ''), null, null, null,
		jsonb_build_object('error_id', v_id, 'where', left(public._cert_norm(p_where), 200),
			'correlation_id', nullif(public._cert_norm(p_correlation), '')), left(public._cert_norm(p_message), 4000));
	return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn$;
revoke all on function public.cert_error_log(text, text, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_error_log(text, text, jsonb, text) to authenticated, service_role;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: THE JOBS =====

-- Active attempts idle past the settings' dormancy days go dormant. Never
-- deleted; any activity brings one back (_cert_touch).
create or replace function public.cert_sweep_dormant()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_days integer;
	v_actor text := nullif(lower(btrim(coalesce(public.current_user_email(), ''))), '');
	t record;
	v_n integer := 0;
begin
	if not public._cert_ops_caller_ok() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select dormancy_days into v_days from public.cert_settings where id;
	v_days := coalesce(v_days, 60);
	for t in
		update public.cert_attempts x set state = 'dormant', dormant_at = now()
		where x.state = 'active' and x.last_activity_at < now() - (v_days * interval '1 day')
		returning x.id, x.email, x.certification_id, x.last_activity_at
	loop
		v_n := v_n + 1;
		perform public._cert_event('attempt.dormant', coalesce(v_actor, 'system'), t.email, t.certification_id, t.id,
			jsonb_build_object('last_activity_at', t.last_activity_at, 'dormancy_days', v_days), null);
	end loop;
	return jsonb_build_object('ok', true, 'marked', v_n, 'dormancy_days', v_days);
end;
$fn$;
revoke all on function public.cert_sweep_dormant() from public, anon, authenticated, service_role;
grant execute on function public.cert_sweep_dormant() to authenticated, service_role;

-- Thirty days before an active award expires (EXPIRY_REMINDER_DAYS), one
-- notice per award, keyed on the award.expiring event so it never repeats.
create or replace function public.cert_expiry_reminders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_actor text := nullif(lower(btrim(coalesce(public.current_user_email(), ''))), '');
	a record;
	v_notify jsonb := '[]'::jsonb;
begin
	if not public._cert_ops_caller_ok() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	for a in
		select x.* from public.cert_awards x
		where x.status = 'active' and x.expires_at is not null
			and x.expires_at > now() and x.expires_at <= now() + interval '30 days'
			and not exists (
				select 1 from public.cert_events e
				where e.kind = 'award.expiring' and (e.payload ->> 'award_id') = x.id::text
			)
		order by x.expires_at, x.serial
	loop
		perform public._cert_event('award.expiring', coalesce(v_actor, 'system'), a.email, a.certification_id, a.attempt_id,
			jsonb_build_object('award_id', a.id, 'serial', a.serial, 'expires_at', a.expires_at), null);
		v_notify := v_notify || public._cert_notify(a.email, 'expiring', 'Expiring soon: ' || a.code,
			'Your ' || a.name || ' certification expires on '
				|| to_char(a.expires_at at time zone 'America/Los_Angeles', 'FMMonth FMDD, YYYY')
				|| '. Start it again from the catalog to renew it; the same steps apply.',
			'/certifications/' || a.code,
			jsonb_build_object('award_id', a.id, 'serial', a.serial, 'code', a.code, 'expires_at', a.expires_at));
	end loop;
	return jsonb_build_object('ok', true, 'count', jsonb_array_length(v_notify), 'notify', v_notify);
end;
$fn$;
revoke all on function public.cert_expiry_reminders() from public, anon, authenticated, service_role;
grant execute on function public.cert_expiry_reminders() to authenticated, service_role;

-- The daily flush's read: notifications older than ten minutes that no route
-- has emailed. Service role only, because every row carries an address.
create or replace function public.cert_notifications_unsent(p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	if coalesce((select auth.role()), '') <> 'service_role' then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object('id', n.id, 'email', n.email, 'user_id', n.user_id, 'kind', n.kind,
			'title', n.title, 'body', n.body, 'href', n.href, 'payload', n.payload, 'created_at', n.created_at) order by n.created_at)
		from (
			select * from public.cert_notifications x
			where x.emailed_at is null and x.created_at < now() - interval '10 minutes'
			order by x.created_at limit least(greatest(coalesce(p_limit, 100), 1), 500)
		) n
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_notifications_unsent(integer) from public, anon, authenticated, service_role;
grant execute on function public.cert_notifications_unsent(integer) to service_role;

create or replace function public.cert_notifications_mark_sent(p_ids uuid[], p_channel text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_n integer;
begin
	-- A certifier stamps the rows the route it just ran emailed from its own
	-- client (an award, a review, a seat decision); the service role stamps
	-- the daily flush. A stamp is bookkeeping and discloses nothing.
	if not (public._cert_ops_caller_ok() or public._cert_is_certifier()) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if coalesce(p_channel, '') not in ('email', 'push') then
		raise exception 'cert_notifications_mark_sent: channel must be email or push';
	end if;
	if p_channel = 'email' then
		update public.cert_notifications set emailed_at = now() where id = any (coalesce(p_ids, '{}'::uuid[])) and emailed_at is null;
	else
		update public.cert_notifications set pushed_at = now() where id = any (coalesce(p_ids, '{}'::uuid[])) and pushed_at is null;
	end if;
	get diagnostics v_n = row_count;
	return jsonb_build_object('ok', true, 'marked', v_n);
end;
$fn$;
revoke all on function public.cert_notifications_mark_sent(uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.cert_notifications_mark_sent(uuid[], text) to authenticated, service_role;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: TELEMETRY AND EXPORTS =====

create or replace function public.cert_telemetry()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_scope uuid[];
begin
	perform public._cert_caller();
	if not public._cert_is_certifier() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_scope := public._cert_scope();
	return jsonb_build_object(
		'active_by_certification', coalesce((
			select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name,
				'active', (select count(*) from public.cert_attempts t where t.certification_id = c.id and t.state = 'active'),
				'dormant', (select count(*) from public.cert_attempts t where t.certification_id = c.id and t.state = 'dormant'))
				order by c.category, c.sort_order, c.level, c.code)
			from public.cert_certifications c where c.id = any (v_scope) and c.state <> 'draft'
		), '[]'::jsonb),
		'stalled', coalesce((
			select jsonb_agg(jsonb_build_object('attempt_id', s.id, 'student_name', public._cert_person_name(s.email),
				'code', s.code, 'days_idle', s.days_idle) order by s.days_idle desc)
			from (
				select t.id, t.email, c.code, floor(extract(epoch from (now() - t.last_activity_at)) / 86400)::integer as days_idle
				from public.cert_attempts t join public.cert_certifications c on c.id = t.certification_id
				where t.state in ('active', 'dormant') and t.certification_id = any (v_scope)
					and t.last_activity_at < now() - interval '7 days'
				order by t.last_activity_at limit 100
			) s
		), '[]'::jsonb),
		'pending', jsonb_build_array(
			jsonb_build_object('kind', 'review',
				'count', (select count(*) from public.cert_submissions s join public.cert_attempts t on t.id = s.attempt_id
					where s.state = 'pending' and t.certification_id = any (v_scope)),
				'oldest_wait_seconds', (select coalesce(floor(extract(epoch from (now() - min(s.submitted_at))))::bigint, 0)
					from public.cert_submissions s join public.cert_attempts t on t.id = s.attempt_id
					where s.state = 'pending' and t.certification_id = any (v_scope))),
			jsonb_build_object('kind', 'request',
				'count', (select count(*) from public.cert_seats x where x.state = 'requested' and x.certification_id = any (v_scope)),
				'oldest_wait_seconds', (select coalesce(floor(extract(epoch from (now() - min(x.requested_at))))::bigint, 0)
					from public.cert_seats x where x.state = 'requested' and x.certification_id = any (v_scope)))
		),
		'pass_rates', coalesce((
			select jsonb_agg(jsonb_build_object('code', p.code, 'part', p.part, 'passed', p.passed, 'failed', p.failed)
				order by p.code, array_position(array['training', 'guided', 'exam', 'autonomous', 'checkout'], p.part))
			from (
				select c.code, s.part,
					count(*) filter (where s.state = 'passed') as passed,
					count(*) filter (where s.state = 'failed') as failed
				from public.cert_submissions s join public.cert_attempts t on t.id = s.attempt_id
				join public.cert_certifications c on c.id = t.certification_id
				where s.state in ('passed', 'failed') and c.id = any (v_scope)
				group by c.code, s.part
				union all
				select c.code, 'exam',
					count(*) filter (where e.passed), count(*) filter (where not e.passed)
				from public.cert_exam_attempts e join public.cert_certifications c on c.id = e.certification_id
				where e.state = 'submitted' and c.id = any (v_scope)
				group by c.code
			) p
		), '[]'::jsonb),
		'exam_topics', coalesce((
			select jsonb_agg(jsonb_build_object('code', x.code, 'topic', x.topic, 'correct', x.correct, 'total', x.total) order by x.code, x.topic)
			from (
				select c.code, bt.key as topic,
					sum((bt.value ->> 'correct')::integer) as correct, sum((bt.value ->> 'total')::integer) as total
				from public.cert_exam_attempts e join public.cert_certifications c on c.id = e.certification_id,
					jsonb_each(coalesce(e.score -> 'by_topic', '{}'::jsonb)) bt
				where e.state = 'submitted' and c.id = any (v_scope)
				group by c.code, bt.key
			) x
		), '[]'::jsonb),
		'completion_days', coalesce((
			select jsonb_agg(jsonb_build_object('code', x.code, 'average', x.average, 'count', x.n) order by x.code)
			from (
				select c.code, round((avg(extract(epoch from (t.finished_at - t.started_at))) / 86400.0)::numeric, 1) as average, count(*) as n
				from public.cert_attempts t join public.cert_certifications c on c.id = t.certification_id
				where t.state = 'complete' and t.finished_at is not null and c.id = any (v_scope)
				group by c.code
			) x
		), '[]'::jsonb),
		'time_per_part_hours', coalesce((
			select jsonb_agg(jsonb_build_object('code', y.code, 'part', y.part, 'average', y.average)
				order by y.code, array_position(array['training', 'guided', 'exam', 'autonomous', 'checkout'], y.part))
			from (
				select x.code, x.part, round((avg(extract(epoch from (x.checked_at - x.from_at))) / 3600.0)::numeric, 1) as average
				from (
					select c.code, k.part, k.checked_at,
						coalesce(lag(k.checked_at) over (partition by k.attempt_id
							order by array_position(array['training', 'guided', 'exam', 'autonomous', 'checkout'], k.part)), t.started_at) as from_at
					from public.cert_checks k join public.cert_attempts t on t.id = k.attempt_id
					join public.cert_certifications c on c.id = t.certification_id
					where k.state = 'done' and k.checked_at is not null and c.id = any (v_scope)
				) x
				group by x.code, x.part
			) y
		), '[]'::jsonb),
		'most_missed_topics', coalesce((
			select jsonb_agg(jsonb_build_object('code', x.code, 'topic', x.topic, 'missed', x.missed) order by x.missed desc, x.code, x.topic)
			from (
				select c.code, m.topic, count(*) as missed
				from public.cert_exam_attempts e join public.cert_certifications c on c.id = e.certification_id,
					jsonb_array_elements_text(coalesce(e.score -> 'missed_topics', '[]'::jsonb)) m(topic)
				where e.state = 'submitted' and c.id = any (v_scope)
				group by c.code, m.topic
			) x
		), '[]'::jsonb),
		'withdrawals_30d', (select count(*) from public.cert_attempts t
			where t.withdrawn_at > now() - interval '30 days' and t.certification_id = any (v_scope)),
		'watch_sessions_30d', (select count(*) from public.cert_watch_sessions w
			where w.at > now() - interval '30 days' and w.certification_id = any (v_scope))
	);
end;
$fn$;
revoke all on function public.cert_telemetry() from public, anon, authenticated, service_role;
grant execute on function public.cert_telemetry() to authenticated;

-- The bulk export: one kind, one time range, flat rows, at most 50,000,
-- scoped to the caller's certifications; audit and errors are an admin's.
create or replace function public.cert_export(p_kind text, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_admin boolean;
	v_scope uuid[];
	v_from timestamptz := coalesce(p_from, '-infinity'::timestamptz);
	v_to timestamptz := coalesce(p_to, 'infinity'::timestamptz);
	v_rows jsonb;
	v_count integer;
begin
	if coalesce(p_kind, '') not in ('events', 'audit', 'sync', 'errors', 'attempts', 'awards', 'exams', 'watch', 'practice', 'notifications') then
		raise exception 'cert_export: unknown kind';
	end if;
	if not public._cert_is_certifier() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_admin := public.is_admin();
	if p_kind in ('audit', 'errors') and not v_admin then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_scope := public._cert_scope();

	if p_kind = 'events' or p_kind = 'audit' then
		select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) into v_rows from (
			select x.id, x.at, x.kind, x.actor_email, x.subject_email, x.certification_id, x.attempt_id, x.reason, x.payload
			from public.cert_events x
			where x.at >= v_from and x.at < v_to
				and (v_admin or x.certification_id = any (v_scope))
				and (p_kind = 'events' or x.reason is not null or x.kind like 'award.%' or x.kind like 'authority.%'
					or x.kind like 'catalog.%' or x.kind like 'settings.%')
			order by x.at, x.id limit 50000
		) e;
	elsif p_kind = 'sync' then
		select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) into v_rows from (
			select * from public.cert_sync_log x where x.at >= v_from and x.at < v_to order by x.at, x.id limit 50000
		) e;
	elsif p_kind = 'errors' then
		select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) into v_rows from (
			select * from public.cert_errors x where x.at >= v_from and x.at < v_to order by x.at, x.id limit 50000
		) e;
	elsif p_kind = 'attempts' then
		select coalesce(jsonb_agg(to_jsonb(e) order by e.started_at, e.id), '[]'::jsonb) into v_rows from (
			select t.id, c.code, t.email, t.state, t.started_at, t.finished_at, t.withdrawn_at, t.dormant_at, t.last_activity_at,
				(select k.state from public.cert_checks k where k.attempt_id = t.id and k.part = 'training') as training,
				(select k.state from public.cert_checks k where k.attempt_id = t.id and k.part = 'guided') as guided,
				(select k.state from public.cert_checks k where k.attempt_id = t.id and k.part = 'exam') as exam,
				(select k.state from public.cert_checks k where k.attempt_id = t.id and k.part = 'autonomous') as autonomous,
				(select k.state from public.cert_checks k where k.attempt_id = t.id and k.part = 'checkout') as checkout
			from public.cert_attempts t join public.cert_certifications c on c.id = t.certification_id
			where t.started_at >= v_from and t.started_at < v_to and c.id = any (v_scope)
			order by t.started_at, t.id limit 50000
		) e;
	elsif p_kind = 'awards' then
		select coalesce(jsonb_agg(to_jsonb(e) order by e.awarded_at, e.serial), '[]'::jsonb) into v_rows from (
			select a.id, a.serial, a.email, a.holder_name, a.code, a.name, a.level, a.category, a.awarded_at,
				a.awarded_by_email, a.awarded_by_name, a.expires_at, a.status as stored_status,
				public._cert_award_status(a) as status, a.key_id, a.updated_at
			from public.cert_awards a
			where a.awarded_at >= v_from and a.awarded_at < v_to and a.certification_id = any (v_scope)
			order by a.awarded_at, a.serial limit 50000
		) e;
	elsif p_kind = 'exams' then
		select coalesce(jsonb_agg(to_jsonb(e) order by e.released_at, e.id), '[]'::jsonb) into v_rows from (
			select x.id, x.attempt_id, c.code, x.email, x.proctor_email, x.state, x.released_at, x.started_at, x.submitted_at,
				x.time_limit_minutes, x.passed, (x.score ->> 'correct')::integer as correct, jsonb_array_length(x.draw) as total,
				jsonb_array_length(x.flags) as flags_count,
				(select string_agg(m, ', ') from jsonb_array_elements_text(coalesce(x.score -> 'missed_topics', '[]'::jsonb)) m) as missed_topics
			from public.cert_exam_attempts x join public.cert_certifications c on c.id = x.certification_id
			where x.released_at >= v_from and x.released_at < v_to and c.id = any (v_scope)
			order by x.released_at, x.id limit 50000
		) e;
	elsif p_kind = 'watch' then
		select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) into v_rows from (
			select w.id, w.email, c.code, w.item_key, w.at, w.played_seconds, w.max_rate, w.checkins_missed, w.coverage
			from public.cert_watch_sessions w join public.cert_certifications c on c.id = w.certification_id
			where w.at >= v_from and w.at < v_to and c.id = any (v_scope)
			order by w.at, w.id limit 50000
		) e;
	elsif p_kind = 'practice' then
		select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) into v_rows from (
			select r.id, r.email, c.code, r.kind, r.item_id, r.correct, r.at
			from public.cert_practice_results r join public.cert_certifications c on c.id = r.certification_id
			where r.at >= v_from and r.at < v_to and c.id = any (v_scope)
			order by r.at, r.id limit 50000
		) e;
	else
		select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at, e.id), '[]'::jsonb) into v_rows from (
			select n.id, n.email, n.kind, n.title, n.body, n.href, n.created_at, n.read_at, n.emailed_at, n.pushed_at
			from public.cert_notifications n
			where n.created_at >= v_from and n.created_at < v_to
				and (v_admin or n.email = v_me or exists (
					select 1 from public.cert_certifications c where c.id = any (v_scope) and c.code = (n.payload ->> 'code')))
			order by n.created_at, n.id limit 50000
		) e;
	end if;
	v_count := jsonb_array_length(v_rows);
	return jsonb_build_object('ok', true, 'kind', p_kind, 'from', p_from, 'to', p_to, 'count', v_count,
		'truncated', v_count >= 50000, 'rows', v_rows);
end;
$fn$;
revoke all on function public.cert_export(text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.cert_export(text, timestamptz, timestamptz) to authenticated;
-- ===== PART E END =====

-- ===== PART Z BEGIN =====
-- ===== SELF-CHECK (kept last) =====
do $z$
declare
	v_fn text;
	v_tbl text;
	v_bad text[] := '{}'::text[];
	v_oid oid;
begin
	-- authenticated AND service_role.
	foreach v_fn in array array[
		'cert_mirror_snapshot()',
		'cert_sync_log_write(jsonb)',
		'cert_error_log(text, text, jsonb, text)',
		'cert_sweep_dormant()',
		'cert_expiry_reminders()',
		'cert_notifications_mark_sent(uuid[], text)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		else
			if has_function_privilege('anon', v_oid, 'execute') then
				v_bad := array_append(v_bad, v_fn || ' is executable by anon');
			end if;
			if not has_function_privilege('authenticated', v_oid, 'execute') or not has_function_privilege('service_role', v_oid, 'execute') then
				v_bad := array_append(v_bad, v_fn || ' is not executable by authenticated and service_role');
			end if;
		end if;
	end loop;
	-- authenticated only.
	foreach v_fn in array array[
		'cert_sync_log_list(integer)',
		'cert_telemetry()',
		'cert_export(text, timestamptz, timestamptz)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		else
			if has_function_privilege('anon', v_oid, 'execute') then
				v_bad := array_append(v_bad, v_fn || ' is executable by anon');
			end if;
			if not has_function_privilege('authenticated', v_oid, 'execute') then
				v_bad := array_append(v_bad, v_fn || ' is not executable by authenticated');
			end if;
		end if;
	end loop;
	-- service_role only.
	v_oid := to_regprocedure('public.cert_notifications_unsent(integer)');
	if v_oid is null then
		v_bad := array_append(v_bad, 'cert_notifications_unsent(integer) is missing');
	elsif has_function_privilege('anon', v_oid, 'execute') or has_function_privilege('authenticated', v_oid, 'execute')
		or not has_function_privilege('service_role', v_oid, 'execute') then
		v_bad := array_append(v_bad, 'cert_notifications_unsent(integer) is not service_role only');
	end if;
	foreach v_fn in array array['_cert_ops_caller_ok()', '_cert_scope()'] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute')
			or has_function_privilege('authenticated', v_oid, 'execute')
			or has_function_privilege('service_role', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by a client');
		end if;
	end loop;

	foreach v_tbl in array array['cert_sync_log', 'cert_errors'] loop
		if not exists (
			select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relname = v_tbl and c.relrowsecurity
		) then
			v_bad := array_append(v_bad, v_tbl || ' has no row level security');
		end if;
		if has_table_privilege('anon', 'public.' || v_tbl, 'select,insert,update,delete,truncate,references,trigger')
			or has_table_privilege('authenticated', 'public.' || v_tbl, 'select,insert,update,delete,truncate,references,trigger') then
			v_bad := array_append(v_bad, v_tbl || ' carries a client grant');
		end if;
		if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl) then
			v_bad := array_append(v_bad, v_tbl || ' carries a policy');
		end if;
		if has_sequence_privilege('anon', 'public.' || v_tbl || '_id_seq', 'usage,select,update')
			or has_sequence_privilege('authenticated', 'public.' || v_tbl || '_id_seq', 'usage,select,update') then
			v_bad := array_append(v_bad, v_tbl || '_id_seq carries a client grant');
		end if;
	end loop;

	if array_length(v_bad, 1) is not null then
		raise exception '0264 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0264 cert ops: 2 tables with RLS on and no client grant, 10 client functions closed to anon (one service_role only), 2 private helpers closed to every client.';
end $z$;
-- ===== PART Z END =====
