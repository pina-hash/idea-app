-- 0263_cert_awards.sql
--
-- IDEA CERTIFICATION PORTAL, PART FOUR OF FIVE (ledger 0391): AWARDS, THEIR
-- HISTORY, AND NOTIFICATIONS. docs/certifications/DATA_MODEL.md section 0263.
--
-- WHAT IT CREATES, all new and all cert_-prefixed:
--   tables     cert_awards, cert_award_history (append-only),
--              cert_notifications
--   helpers    _cert_award_status, _cert_signed_payload, _cert_notify,
--              _cert_normalize_serial, _cert_award_json,
--              _cert_award_prepare_checks
--   client     cert_award_prepare, cert_award_commit, cert_award_action,
--              cert_award_correct, cert_award_get, cert_awards_list,
--              cert_certificate, cert_verify (anon AND authenticated: the
--              public verify page), cert_holders, cert_notifications_mine,
--              cert_notifications_mark_read, cert_notifications_unread
--
-- THE AWARD IS SIGNED BY THE SERVER ROUTE AND CHECKED HERE (decision D9). The
-- route generates the serial, builds the canonical payload and signs it with
-- the Ed25519 key only it holds; cert_award_commit re-runs every requirement,
-- enforces the serial's format and uniqueness, requires the payload's
-- awarded_at to be within five minutes of now, and recomputes the payload's
-- VALUES from the record with _cert_signed_payload (email_sha256 is the hex
-- sha256 of the lowercase address; awarded_at is the canonical UTC instant with
-- a Z and no fraction), refusing a mismatch. The database cannot verify an
-- Ed25519 signature; the verify page re-checks it against the published key on
-- every load.
--
-- EXPIRED IS DERIVED, NEVER STORED (D8): _cert_award_status reads an active
-- award past its expires_at as expired, so the verify page, the holders board
-- and the mirror agree with no sweep. NOTHING IS EVER DELETED: suspend,
-- reinstate, revoke and correct each need a written reason and write a history
-- row; a correction re-signs under the same serial.
--
-- cert_verify IS GRANTED TO anon ON PURPOSE: it is the public verify page's
-- read, answers found or not and never a reason, never an address, and the
-- route rate-limits it per client address (D10). It is allowlisted in
-- tests/db/ideacad-grants-anon-execute-surface.test.ts with this reason.
--
-- ADDITIVE AND IDEMPOTENT; every table RLS on, no policy, no client grant; every
-- function revokes from public, anon, authenticated and service_role by name
-- and grants back only what its contract row lists. DEPLOY ORDER: none.
--
-- UNDO, for a person's paste:
--   drop function if exists public.cert_notifications_unread();
--   drop function if exists public.cert_notifications_mark_read(uuid[]);
--   drop function if exists public.cert_notifications_mine(integer);
--   drop function if exists public.cert_holders();
--   drop function if exists public.cert_verify(text);
--   drop function if exists public.cert_certificate(text);
--   drop function if exists public.cert_awards_list(uuid);
--   drop function if exists public.cert_award_get(uuid);
--   drop function if exists public.cert_award_correct(uuid, text, text, text, text, jsonb, text);
--   drop function if exists public.cert_award_action(uuid, text, text);
--   drop function if exists public.cert_award_commit(uuid, text, text, text, jsonb);
--   drop function if exists public.cert_award_prepare(uuid);
--   drop function if exists public._cert_award_prepare_checks(uuid);
--   drop function if exists public._cert_award_json(public.cert_awards, boolean, boolean);
--   drop function if exists public._cert_normalize_serial(text);
--   drop function if exists public._cert_notify(text, text, text, text, text, jsonb);
--   drop function if exists public._cert_signed_payload(text, text, integer, text, text, timestamptz, text);
--   drop function if exists public._cert_award_status(public.cert_awards);
--   drop table if exists public.cert_notifications;
--   drop table if exists public.cert_award_history;
--   drop table if exists public.cert_awards;

-- ===== PART A BEGIN =====
-- ===== PART A: TABLES =====

create table if not exists public.cert_awards (
	id uuid primary key default gen_random_uuid(),
	serial text not null unique check (serial ~ '^IDEA(-[0-9A-HJKMNP-TV-Z]{4}){4}$'),
	attempt_id uuid not null unique references public.cert_attempts (id),
	certification_id uuid not null references public.cert_certifications (id),
	revision_id uuid not null references public.cert_revisions (id),
	email text not null check (email = lower(btrim(email)) and email like '%@%'),
	holder_name text not null,
	code text not null,
	name text not null,
	level integer not null,
	category text not null,
	awarded_at timestamptz not null,
	awarded_by_email text not null,
	awarded_by_name text not null,
	expires_at timestamptz,
	status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
	signature text not null,
	signed_payload jsonb not null,
	key_id text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists cert_awards_email_idx on public.cert_awards (email, awarded_at desc);
create index if not exists cert_awards_cert_idx on public.cert_awards (certification_id, status);
alter table public.cert_awards enable row level security;
revoke all on table public.cert_awards from public, anon, authenticated;

-- Append-only: every change to an award, with who, when and why.
create table if not exists public.cert_award_history (
	id bigserial primary key,
	award_id uuid not null references public.cert_awards (id) on delete cascade,
	at timestamptz not null default now(),
	actor_email text,
	action text not null check (action in ('awarded', 'suspended', 'reinstated', 'revoked', 'corrected')),
	reason text not null,
	before jsonb,
	after jsonb
);
create index if not exists cert_award_history_award_idx on public.cert_award_history (award_id, at);
alter table public.cert_award_history enable row level security;
revoke all on table public.cert_award_history from public, anon, authenticated;
revoke all on sequence public.cert_award_history_id_seq from public, anon, authenticated;

-- The badge's rows. user_id is resolved at insert through the 0094 bridge so
-- the push sender needs no second lookup; null for an address that has never
-- signed in.
create table if not exists public.cert_notifications (
	id uuid primary key default gen_random_uuid(),
	email text not null,
	user_id uuid,
	kind text not null check (kind in ('part_checked', 'review_returned', 'sitting_approved', 'sitting_declined',
		'cooldown_ended', 'awarded', 'suspended', 'reinstated', 'revoked', 'expiring', 'queue_submission', 'queue_request')),
	title text not null,
	body text not null,
	href text not null,
	payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	read_at timestamptz,
	emailed_at timestamptz,
	pushed_at timestamptz
);
create index if not exists cert_notifications_email_idx on public.cert_notifications (email, read_at, created_at desc);
create index if not exists cert_notifications_unsent_idx on public.cert_notifications (created_at) where emailed_at is null;
alter table public.cert_notifications enable row level security;
revoke all on table public.cert_notifications from public, anon, authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: HELPERS =====

-- The shown status: active past its expiry reads expired.
create or replace function public._cert_award_status(a public.cert_awards)
returns text
language sql
immutable
set search_path = ''
as $fn$
	select case
		when a.status = 'revoked' then 'revoked'
		when a.status = 'suspended' then 'suspended'
		when a.expires_at is not null and a.expires_at < now() then 'expired'
		else 'valid'
	end;
$fn$;
revoke all on function public._cert_award_status(public.cert_awards) from public, anon, authenticated, service_role;

-- The signed payload's VALUES, recomputed from the record. The canonical BYTES
-- are the client's (canonicalPayload in signing-payload.ts); jsonb reorders
-- keys, so comparison here is by value.
create or replace function public._cert_signed_payload(
	p_serial text, p_code text, p_level integer, p_holder_name text, p_email text, p_awarded_at timestamptz, p_certifier_name text
)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
	select jsonb_build_object(
		'v', 1,
		'serial', p_serial,
		'code', p_code,
		'level', p_level,
		'holder_name', p_holder_name,
		'email_sha256', encode(sha256(convert_to(lower(public._cert_norm(p_email)), 'UTF8')), 'hex'),
		'awarded_at', to_char(date_trunc('second', p_awarded_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		'certifier_name', p_certifier_name
	);
$fn$;
revoke all on function public._cert_signed_payload(text, text, integer, text, text, timestamptz, text) from public, anon, authenticated, service_role;

-- One notification row, returned in the shape every notify array carries.
create or replace function public._cert_notify(p_email text, p_kind text, p_title text, p_body text, p_href text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	n public.cert_notifications%rowtype;
begin
	insert into public.cert_notifications (email, user_id, kind, title, body, href, payload)
	values (lower(btrim(p_email)), public._notebook_user_id_for_email(p_email), p_kind, p_title, p_body, p_href,
		-- The recipient's shown name rides along for the email's greeting; null when they have none.
		coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('recipient_name', public._cert_person_name(lower(btrim(p_email)))))
	returning * into n;
	return jsonb_build_object('id', n.id, 'email', n.email, 'user_id', n.user_id, 'kind', n.kind,
		'title', n.title, 'body', n.body, 'href', n.href, 'payload', n.payload, 'created_at', n.created_at);
end;
$fn$;
revoke all on function public._cert_notify(text, text, text, text, text, jsonb) from public, anon, authenticated, service_role;

-- What a person typed, folded to the one spelling (normalizeSerial in
-- serial.ts): uppercase, whitespace and hyphens dropped, an IDEA prefix
-- removed, I and L to 1, O to 0, regrouped. Null when it is not 16 Crockford
-- characters.
create or replace function public._cert_normalize_serial(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
	s text := regexp_replace(upper(coalesce(p, '')), '[\s-]+', '', 'g');
begin
	if left(s, 4) = 'IDEA' then
		s := substr(s, 5);
	end if;
	s := translate(s, 'ILO', '110');
	if s !~ '^[0-9A-HJKMNP-TV-Z]{16}$' then
		return null;
	end if;
	return 'IDEA-' || substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4) || '-' || substr(s, 13, 4);
end;
$fn$;
revoke all on function public._cert_normalize_serial(text) from public, anon, authenticated, service_role;

-- One award as a record page reads it, with its history when asked; the
-- holder sees actions and dates, never reasons.
create or replace function public._cert_award_json(a public.cert_awards, p_history boolean, p_reasons boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	return jsonb_build_object(
		'id', a.id, 'serial', a.serial, 'attempt_id', a.attempt_id, 'certification_id', a.certification_id,
		'revision_id', a.revision_id, 'email', a.email, 'holder_name', a.holder_name,
		'code', a.code, 'name', a.name, 'level', a.level, 'category', a.category,
		'awarded_at', a.awarded_at, 'awarded_by_email', a.awarded_by_email, 'awarded_by_name', a.awarded_by_name,
		'expires_at', a.expires_at, 'status', public._cert_award_status(a),
		'signature', a.signature, 'signed_payload', a.signed_payload, 'key_id', a.key_id
	) || case when p_history then jsonb_build_object('history', coalesce((
		select jsonb_agg(jsonb_build_object('at', h.at, 'actor_name', public._cert_person_name(h.actor_email),
			'action', h.action, 'reason', case when p_reasons then h.reason else null end,
			'before', case when p_reasons then h.before else null end,
			'after', case when p_reasons then h.after else null end) order by h.at, h.id)
		from public.cert_award_history h where h.award_id = a.id
	), '[]'::jsonb)) else '{}'::jsonb end;
end;
$fn$;
revoke all on function public._cert_award_json(public.cert_awards, boolean, boolean) from public, anon, authenticated, service_role;

-- Every requirement an award re-checks, shared by prepare and commit. Returns
-- a refusal, or ok with the record the confirm dialog shows.
create or replace function public._cert_award_prepare_checks(p_attempt uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	t public.cert_attempts%rowtype;
	c public.cert_certifications%rowtype;
	v_next text;
	v_name text;
	v_certifier text;
	v_expiry date;
	v_expires_at timestamptz;
	v_serial text;
begin
	select * into t from public.cert_attempts where id = p_attempt;
	if not found or not public._cert_can_certify(t.certification_id) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	-- Nobody acts on their own record (Mr. Pina's rule).
	if t.email = v_me then
		return public._cert_refuse('self', 'You cannot award your own attempt.');
	end if;
	select serial into v_serial from public.cert_awards where attempt_id = t.id;
	if v_serial is not null then
		return public._cert_refuse('awarded', 'This attempt was already awarded as ' || v_serial || '.') || jsonb_build_object('serial', v_serial);
	end if;
	if t.state not in ('active', 'dormant') then
		return public._cert_refuse('not_active', 'This attempt is ' || t.state || '.');
	end if;
	v_next := public._cert_next_part(t.id);
	if v_next is not null then
		return public._cert_refuse('incomplete', 'The ' || lower(public._cert_part_word(v_next)) || ' is not checked off yet.')
			|| jsonb_build_object('next_part', v_next);
	end if;
	v_name := public._cert_person_name(t.email);
	if v_name is null then
		return public._cert_refuse('no_name', 'This student has no name on their profile yet, and a certificate needs one. Ask them to set their name, then come back.');
	end if;
	v_certifier := public._cert_person_name(v_me);
	if v_certifier is null then
		return public._cert_refuse('no_certifier_name', 'Your own profile has no name yet, and the certificate names its certifier. Set your name, then come back.');
	end if;
	select * into c from public.cert_certifications where id = t.certification_id;
	if c.renewal = 'school_year' then
		select school_year_expiry into v_expiry from public.cert_settings where id;
		if v_expiry is null or v_expiry <= (now() at time zone 'America/Los_Angeles')::date then
			return public._cert_refuse('expiry_unset', 'This certification expires on the school-year date, and that date is not set or has passed. Set it in the engine settings, then come back.');
		end if;
		v_expires_at := (v_expiry::timestamp) at time zone 'America/Los_Angeles';
	end if;
	return jsonb_build_object('ok', true, 'record', jsonb_build_object(
		'attempt_id', t.id,
		'student', jsonb_build_object('email', t.email, 'name', v_name),
		'certification', jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name, 'level', c.level, 'category', c.category),
		'revision_id', t.revision_id,
		'awarded_at', date_trunc('second', now()),
		'expires_at', v_expires_at,
		'certifier', jsonb_build_object('email', v_me, 'name', v_certifier)
	));
end;
$fn$;
revoke all on function public._cert_award_prepare_checks(uuid) from public, anon, authenticated, service_role;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE AWARD =====

create or replace function public.cert_award_prepare(p_attempt uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	return public._cert_award_prepare_checks(p_attempt);
end;
$fn$;
revoke all on function public.cert_award_prepare(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_award_prepare(uuid) to authenticated;

-- The one press that records an award: every check again, a serial in the
-- right shape and unused, a payload no older than five minutes whose values
-- recompute from the record, then the award, its first history row, the
-- attempt complete, the event and the student's notification, in one
-- transaction.
create or replace function public.cert_award_commit(p_attempt uuid, p_serial text, p_signature text, p_key_id text, p_signed jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_checks jsonb;
	v_rec jsonb;
	v_awarded_at timestamptz;
	v_expected jsonb;
	a public.cert_awards%rowtype;
	v_notify jsonb := '[]'::jsonb;
	v_json jsonb;
begin
	-- Serialize two presses on one attempt.
	perform 1 from public.cert_attempts where id = p_attempt for update;
	v_checks := public._cert_award_prepare_checks(p_attempt);
	if (v_checks -> 'ok') is distinct from 'true'::jsonb then
		return v_checks;
	end if;
	v_rec := v_checks -> 'record';
	if p_serial is null or p_serial !~ '^IDEA(-[0-9A-HJKMNP-TV-Z]{4}){4}$' then
		return public._cert_refuse('serial', 'The serial is not in the IDEA-XXXX-XXXX-XXXX-XXXX shape.');
	end if;
	if exists (select 1 from public.cert_awards x where x.serial = p_serial) then
		return public._cert_refuse('serial_taken', 'That serial is already in use. Generate another and try again.');
	end if;
	if public._cert_norm(p_signature) = '' or public._cert_norm(p_key_id) = '' then
		return public._cert_refuse('unsigned', 'An award is recorded only with its signature and key id.');
	end if;
	if not public._cert_jt(p_signed, 'object') then
		return public._cert_refuse('payload_mismatch', 'The signed payload is not an object.');
	end if;
	begin
		v_awarded_at := (p_signed ->> 'awarded_at')::timestamptz;
	exception when others then
		return public._cert_refuse('payload_mismatch', 'The signed payload carries no readable awarded_at.');
	end;
	if v_awarded_at is null or abs(extract(epoch from (now() - v_awarded_at))) > 300 then
		return public._cert_refuse('stale', 'The signed payload is more than five minutes old. Prepare the award again.');
	end if;
	v_expected := public._cert_signed_payload(p_serial, v_rec -> 'certification' ->> 'code',
		(v_rec -> 'certification' ->> 'level')::integer, v_rec -> 'student' ->> 'name',
		v_rec -> 'student' ->> 'email', v_awarded_at, v_rec -> 'certifier' ->> 'name');
	if p_signed <> v_expected then
		return public._cert_refuse('payload_mismatch', 'The signed payload does not match the record. Prepare the award again.');
	end if;

	insert into public.cert_awards (serial, attempt_id, certification_id, revision_id, email, holder_name,
		code, name, level, category, awarded_at, awarded_by_email, awarded_by_name, expires_at,
		signature, signed_payload, key_id)
	values (p_serial, p_attempt, (v_rec -> 'certification' ->> 'id')::uuid, (v_rec ->> 'revision_id')::uuid,
		v_rec -> 'student' ->> 'email', v_rec -> 'student' ->> 'name',
		v_rec -> 'certification' ->> 'code', v_rec -> 'certification' ->> 'name',
		(v_rec -> 'certification' ->> 'level')::integer, v_rec -> 'certification' ->> 'category',
		v_awarded_at, v_me, v_rec -> 'certifier' ->> 'name', (v_rec ->> 'expires_at')::timestamptz,
		p_signature, v_expected, public._cert_norm(p_key_id))
	returning * into a;
	v_json := public._cert_award_json(a, false, false);
	insert into public.cert_award_history (award_id, actor_email, action, reason, before, after)
	values (a.id, v_me, 'awarded', 'Awarded through the portal.', null, v_json);
	update public.cert_attempts set state = 'complete', finished_at = v_awarded_at, last_activity_at = now() where id = p_attempt;
	perform public._cert_event('award.granted', v_me, a.email, a.certification_id, p_attempt,
		jsonb_build_object('award_id', a.id, 'serial', a.serial, 'code', a.code, 'expires_at', a.expires_at), null);
	perform public._cert_event('attempt.complete', v_me, a.email, a.certification_id, p_attempt,
		jsonb_build_object('award_id', a.id), null);
	v_notify := v_notify || public._cert_notify(a.email, 'awarded', 'Awarded: ' || a.name,
		'You earned ' || a.name || ' (' || a.code || '). Serial ' || a.serial || '. Your certificate is ready to print, and anyone can verify it at https://ideabosco.com/certifications/verify?serial=' || a.serial || '.',
		'/certifications/certificate/' || a.serial,
		jsonb_build_object('award_id', a.id, 'serial', a.serial, 'code', a.code,
			'verify_url', 'https://ideabosco.com/certifications/verify?serial=' || a.serial,
			'certificate_path', '/certifications/certificate/' || a.serial, 'expires_at', a.expires_at));
	return jsonb_build_object('ok', true, 'award', v_json, 'notify', v_notify, 'sync', true);
end;
$fn$;
revoke all on function public.cert_award_commit(uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cert_award_commit(uuid, text, text, text, jsonb) to authenticated;

-- Suspend, reinstate or revoke, with a written reason. Revoked is final.
create or replace function public.cert_award_action(p_award uuid, p_action text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	a public.cert_awards%rowtype;
	v_reason text := public._cert_norm(p_reason);
	v_before text;
	v_after text;
	v_kind text;
	v_action text;
	v_title text;
	v_body text;
	v_notify jsonb := '[]'::jsonb;
begin
	if coalesce(p_action, '') not in ('suspend', 'reinstate', 'revoke') then
		raise exception 'cert_award_action: action must be suspend, reinstate or revoke';
	end if;
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select * into a from public.cert_awards where id = p_award for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if v_reason = '' then
		return public._cert_refuse('reason_required', 'This change needs a written reason; it is logged with who, when and why.');
	end if;
	v_before := a.status;
	if p_action = 'suspend' then
		if a.status <> 'active' then
			return public._cert_refuse('state', 'Only an active award can be suspended; this one is ' || a.status || '.');
		end if;
		v_after := 'suspended'; v_action := 'suspended'; v_kind := 'suspended';
		v_title := 'Certification suspended: ' || a.code;
		v_body := 'Your ' || a.name || ' certification (' || a.serial || ') is suspended. Reason: ' || v_reason;
	elsif p_action = 'reinstate' then
		if a.status <> 'suspended' then
			return public._cert_refuse('state', 'Only a suspended award can be reinstated; this one is ' || a.status || '.');
		end if;
		v_after := 'active'; v_action := 'reinstated'; v_kind := 'reinstated';
		v_title := 'Certification reinstated: ' || a.code;
		v_body := 'Your ' || a.name || ' certification (' || a.serial || ') is in good standing again. Note: ' || v_reason;
	else
		if a.status = 'revoked' then
			return public._cert_refuse('state', 'This award is already revoked.');
		end if;
		v_after := 'revoked'; v_action := 'revoked'; v_kind := 'revoked';
		v_title := 'Certification revoked: ' || a.code;
		v_body := 'Your ' || a.name || ' certification (' || a.serial || ') was revoked. Reason: ' || v_reason;
	end if;
	update public.cert_awards set status = v_after, updated_at = now() where id = a.id returning * into a;
	insert into public.cert_award_history (award_id, actor_email, action, reason, before, after)
	values (a.id, v_me, v_action, v_reason, jsonb_build_object('status', v_before), jsonb_build_object('status', v_after));
	perform public._cert_event('award.' || v_action, v_me, a.email, a.certification_id, a.attempt_id,
		jsonb_build_object('award_id', a.id, 'serial', a.serial, 'from', v_before, 'to', v_after), v_reason);
	v_notify := v_notify || public._cert_notify(a.email, v_kind, v_title, v_body, '/certifications/me',
		jsonb_build_object('award_id', a.id, 'serial', a.serial, 'code', a.code, 'status', v_after));
	return jsonb_build_object('ok', true, 'award', public._cert_award_json(a, true, true), 'notify', v_notify, 'sync', true);
end;
$fn$;
revoke all on function public.cert_award_action(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_award_action(uuid, text, text) to authenticated;

-- A correction re-signs the same serial with the corrected name or address;
-- the old values stay in the history.
create or replace function public.cert_award_correct(
	p_award uuid, p_holder_name text, p_email text, p_signature text, p_key_id text, p_signed jsonb, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	a public.cert_awards%rowtype;
	v_reason text := public._cert_norm(p_reason);
	v_name text := public._cert_norm(p_holder_name);
	v_email text := lower(public._cert_norm(p_email));
	v_expected jsonb;
	v_before jsonb;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select * into a from public.cert_awards where id = p_award for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if v_reason = '' then
		return public._cert_refuse('reason_required', 'A correction needs a written reason; it is logged with who, when and why.');
	end if;
	if v_name = '' then
		return public._cert_refuse('invalid', 'The holder name cannot be empty.');
	end if;
	if v_email !~ '^[^@\s]+@[^@\s]+$' then
		return public._cert_refuse('invalid', 'The holder email is not an address.');
	end if;
	if public._cert_norm(p_signature) = '' or public._cert_norm(p_key_id) = '' then
		return public._cert_refuse('unsigned', 'A correction is recorded only with its new signature and key id.');
	end if;
	v_expected := public._cert_signed_payload(a.serial, a.code, a.level, v_name, v_email, a.awarded_at, a.awarded_by_name);
	if not public._cert_jt(p_signed, 'object') or p_signed <> v_expected then
		return public._cert_refuse('payload_mismatch', 'The signed payload does not match the corrected record.');
	end if;
	v_before := jsonb_build_object('holder_name', a.holder_name, 'email', a.email, 'signature', a.signature,
		'signed_payload', a.signed_payload, 'key_id', a.key_id);
	update public.cert_awards
	set holder_name = v_name, email = v_email, signature = p_signature, signed_payload = v_expected,
		key_id = public._cert_norm(p_key_id), updated_at = now()
	where id = a.id
	returning * into a;
	insert into public.cert_award_history (award_id, actor_email, action, reason, before, after)
	values (a.id, v_me, 'corrected', v_reason, v_before,
		jsonb_build_object('holder_name', a.holder_name, 'email', a.email, 'signature', a.signature,
			'signed_payload', a.signed_payload, 'key_id', a.key_id));
	perform public._cert_event('award.corrected', v_me, a.email, a.certification_id, a.attempt_id,
		jsonb_build_object('award_id', a.id, 'serial', a.serial, 'before', v_before - 'signature' - 'signed_payload' - 'key_id'), v_reason);
	return jsonb_build_object('ok', true, 'award', public._cert_award_json(a, true, true), 'notify', '[]'::jsonb, 'sync', true);
end;
$fn$;
revoke all on function public.cert_award_correct(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_award_correct(uuid, text, text, text, text, jsonb, text) to authenticated;

-- One award with its history: an admin or a certifier sees the reasons, the
-- holder sees the actions and dates.
create or replace function public.cert_award_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	a public.cert_awards%rowtype;
	v_staff boolean;
begin
	select * into a from public.cert_awards where id = p_id;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_staff := public._cert_can_certify(a.certification_id);
	if not v_staff and a.email <> v_me then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	return public._cert_award_json(a, true, v_staff);
end;
$fn$;
revoke all on function public.cert_award_get(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_award_get(uuid) to authenticated;

create or replace function public.cert_awards_list(p_cert uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_admin boolean;
begin
	if not public._cert_is_certifier() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_admin := public.is_admin();
	return coalesce((
		select jsonb_agg(public._cert_award_json(a, false, false) order by a.awarded_at desc)
		from public.cert_awards a
		where (p_cert is null or a.certification_id = p_cert)
			and (v_admin or exists (select 1 from public.cert_authority x where x.certification_id = a.certification_id and x.email = v_me and x.revoked_at is null))
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_awards_list(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_awards_list(uuid) to authenticated;

-- Every field the printed certificate shows, for the holder, a certifier of
-- its certification or an admin.
create or replace function public.cert_certificate(p_serial text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_serial text := public._cert_normalize_serial(p_serial);
	a public.cert_awards%rowtype;
begin
	if v_serial is null then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select * into a from public.cert_awards where serial = v_serial;
	if not found or (a.email <> v_me and not public._cert_can_certify(a.certification_id)) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	return jsonb_build_object(
		'serial', a.serial, 'holder_name', a.holder_name, 'code', a.code, 'name', a.name, 'level', a.level,
		'category', a.category, 'awarded_at', a.awarded_at, 'expires_at', a.expires_at,
		'awarded_by_name', a.awarded_by_name, 'status', public._cert_award_status(a),
		'signature', a.signature, 'signed_payload', a.signed_payload, 'key_id', a.key_id,
		'definition', coalesce((select r.package ->> 'definition' from public.cert_revisions r where r.id = a.revision_id), ''),
		'verify_url_path', '/certifications/verify?serial=' || a.serial
	);
end;
$fn$;
revoke all on function public.cert_certificate(text) from public, anon, authenticated, service_role;
grant execute on function public.cert_certificate(text) to authenticated;

-- THE PUBLIC VERIFY READ. Granted to anon on purpose (see the header): found
-- with the certificate's own fields, or found false. Never an address, never a
-- reason, no session needed.
create or replace function public.cert_verify(p_serial text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_serial text := public._cert_normalize_serial(p_serial);
	a public.cert_awards%rowtype;
begin
	if v_serial is null then
		return jsonb_build_object('found', false);
	end if;
	select * into a from public.cert_awards where serial = v_serial;
	if not found then
		return jsonb_build_object('found', false);
	end if;
	return jsonb_build_object(
		'found', true, 'holder_name', a.holder_name, 'code', a.code, 'name', a.name, 'level', a.level,
		'category', a.category, 'awarded_at', a.awarded_at, 'awarded_by_name', a.awarded_by_name,
		'expires_at', a.expires_at, 'status', public._cert_award_status(a),
		'signature', a.signature, 'signed_payload', a.signed_payload, 'key_id', a.key_id
	);
end;
$fn$;
revoke all on function public.cert_verify(text) from public, anon, authenticated, service_role;
grant execute on function public.cert_verify(text) to anon, authenticated;

-- The holders board: names only, grouped by certification and by person (an
-- email hash groups a person; no address leaves).
create or replace function public.cert_holders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	perform public._cert_caller();
	return jsonb_build_object(
		'by_certification', coalesce((
			select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'level', c.level, 'category', c.category,
				'holders', coalesce((
					select jsonb_agg(jsonb_build_object('name', a.holder_name, 'awarded_at', a.awarded_at,
						'status', public._cert_award_status(a)) order by a.holder_name, a.awarded_at)
					from public.cert_awards a where a.certification_id = c.id
				), '[]'::jsonb)) order by c.cat_sort, c.category, c.sort_order, c.level, c.code)
			from (
				select x.*, min(x.sort_order) over (partition by x.category) as cat_sort
				from public.cert_certifications x
				where x.state <> 'draft' and exists (select 1 from public.cert_awards a where a.certification_id = x.id)
			) c
		), '[]'::jsonb),
		'by_person', coalesce((
			select jsonb_agg(jsonb_build_object('name', p.name, 'email_hash', p.email_hash,
				'certifications', p.certifications) order by p.name, p.email_hash)
			from (
				select min(a.holder_name) as name,
					encode(sha256(convert_to(a.email, 'UTF8')), 'hex') as email_hash,
					jsonb_agg(jsonb_build_object('code', a.code, 'level', a.level, 'awarded_at', a.awarded_at,
						'status', public._cert_award_status(a)) order by a.awarded_at) as certifications
				from public.cert_awards a
				group by a.email
			) p
		), '[]'::jsonb)
	);
end;
$fn$;
revoke all on function public.cert_holders() from public, anon, authenticated, service_role;
grant execute on function public.cert_holders() to authenticated;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: NOTIFICATIONS =====

create or replace function public.cert_notifications_mine(p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
begin
	return coalesce((
		select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
			'href', n.href, 'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at) order by n.created_at desc)
		from (
			select * from public.cert_notifications x where x.email = v_me
			order by x.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
		) n
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_notifications_mine(integer) from public, anon, authenticated, service_role;
grant execute on function public.cert_notifications_mine(integer) to authenticated;

create or replace function public.cert_notifications_mark_read(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_n integer;
begin
	update public.cert_notifications set read_at = now()
	where email = v_me and read_at is null and id = any (coalesce(p_ids, '{}'::uuid[]));
	get diagnostics v_n = row_count;
	return jsonb_build_object('ok', true, 'marked', v_n,
		'unread', (select count(*) from public.cert_notifications n where n.email = v_me and n.read_at is null));
end;
$fn$;
revoke all on function public.cert_notifications_mark_read(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.cert_notifications_mark_read(uuid[]) to authenticated;

create or replace function public.cert_notifications_unread()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := lower(btrim(coalesce(public.current_user_email(), '')));
begin
	if v_me = '' then
		return 0;
	end if;
	return (select count(*)::integer from public.cert_notifications n where n.email = v_me and n.read_at is null);
end;
$fn$;
revoke all on function public.cert_notifications_unread() from public, anon, authenticated, service_role;
grant execute on function public.cert_notifications_unread() to authenticated;
-- ===== PART D END =====

-- ===== PART Z BEGIN =====
-- ===== SELF-CHECK (kept last) =====
do $z$
declare
	v_fn text;
	v_tbl text;
	v_bad text[] := '{}'::text[];
	v_oid oid;
	v_payload jsonb;
begin
	foreach v_fn in array array[
		'cert_award_prepare(uuid)',
		'cert_award_commit(uuid, text, text, text, jsonb)',
		'cert_award_action(uuid, text, text)',
		'cert_award_correct(uuid, text, text, text, text, jsonb, text)',
		'cert_award_get(uuid)',
		'cert_awards_list(uuid)',
		'cert_certificate(text)',
		'cert_holders()',
		'cert_notifications_mine(integer)',
		'cert_notifications_mark_read(uuid[])',
		'cert_notifications_unread()'
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

	-- The one deliberately public read.
	v_oid := to_regprocedure('public.cert_verify(text)');
	if v_oid is null then
		v_bad := array_append(v_bad, 'cert_verify(text) is missing');
	elsif not has_function_privilege('anon', v_oid, 'execute') or not has_function_privilege('authenticated', v_oid, 'execute') then
		v_bad := array_append(v_bad, 'cert_verify(text) is not executable by anon and authenticated');
	end if;

	foreach v_fn in array array[
		'_cert_award_status(public.cert_awards)',
		'_cert_signed_payload(text, text, integer, text, text, timestamptz, text)',
		'_cert_notify(text, text, text, text, text, jsonb)',
		'_cert_normalize_serial(text)',
		'_cert_award_json(public.cert_awards, boolean, boolean)',
		'_cert_award_prepare_checks(uuid)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute')
			or has_function_privilege('authenticated', v_oid, 'execute')
			or has_function_privilege('service_role', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by a client');
		end if;
	end loop;

	foreach v_tbl in array array['cert_awards', 'cert_award_history', 'cert_notifications'] loop
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
	end loop;
	if has_sequence_privilege('anon', 'public.cert_award_history_id_seq', 'usage,select,update')
		or has_sequence_privilege('authenticated', 'public.cert_award_history_id_seq', 'usage,select,update') then
		v_bad := array_append(v_bad, 'cert_award_history_id_seq carries a client grant');
	end if;

	-- The payload's spelling: the canonical instant and the email hash.
	v_payload := public._cert_signed_payload('IDEA-7K3Q-M9XD-2HTR-W4PB', 'MILL-1', 1, 'Ana Reyes', ' Ana@BoscoTech.net ',
		'2026-10-15T17:05:00.789+00:00'::timestamptz, 'Mr. Pina');
	if (v_payload ->> 'awarded_at') is distinct from '2026-10-15T17:05:00Z' then
		v_bad := array_append(v_bad, 'the signed payload instant is ' || coalesce(v_payload ->> 'awarded_at', 'null') || ', not canonical');
	end if;
	if (v_payload ->> 'email_sha256') is distinct from encode(sha256(convert_to('ana@boscotech.net', 'UTF8')), 'hex') then
		v_bad := array_append(v_bad, 'the signed payload email hash is not the lowercase sha256');
	end if;
	if public._cert_normalize_serial(' idea-7k3q-m9xd-2htr-w4pb ') is distinct from 'IDEA-7K3Q-M9XD-2HTR-W4PB'
		or public._cert_normalize_serial('7K3QM9XD2HTRW4PB') is distinct from 'IDEA-7K3Q-M9XD-2HTR-W4PB'
		or public._cert_normalize_serial('IDEA-7K3Q-M9XD-2HTR-W4P') is not null
		or public._cert_normalize_serial('IDEA-7K3Q-M9XD-2HTR-W4PU') is not null then
		v_bad := array_append(v_bad, 'serial normalization did not answer the planted readings');
	end if;

	if array_length(v_bad, 1) is not null then
		raise exception '0263 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0263 cert awards: 3 tables with RLS on and no client grant, 11 client functions closed to anon, cert_verify open to anon on purpose, 6 private helpers closed to every client.';
end $z$;
-- ===== PART Z END =====
