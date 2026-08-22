-- 0126_app_feedback_anonymous.sql
-- Anonymous feedback: the SCHEMA and the write path, and nothing else.
--
-- WHY. 0053's box is a direct RLS-scoped insert whose WITH CHECK pins user_id
-- to auth.uid(), so the one person who cannot file a report is the person whose
-- sign-in is broken -- which is the report we most need. This migration makes an
-- authorless row possible, rate limits it, and stops there.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO. It does not revoke 0053's
-- insert policy or its grant, and it does not change one line of client code.
-- The deployed FeedbackBox keeps writing exactly the way it does today, through
-- exactly the same policy, for as long as it is deployed. The client cutover to
-- the RPC is the NEXT bundle; the revoke of the direct insert is the one after.
-- That order is the only one that works: a client naming a function that does
-- not exist yet is broken on the spot, while a function nothing calls is merely
-- inert.
--
-- THE SHAPE OF THE ANONYMOUS PATH, and why it is one function granted to one
-- role. The reporter's address is not something the database can see: PostgREST
-- has no notion of a client IP, so whatever stands in for "this reporter" has to
-- be handed IN. A parameter a caller supplies is a parameter a caller can lie
-- about, and a rate limit keyed on a value the rate-limited party chooses is
-- theatre. So the function is granted to `service_role` and to NOBODY else --
-- not public, not anon, not authenticated -- and the only thing that will ever
-- call it is a server route holding SUPABASE_SERVICE_ROLE_KEY, computing the
-- address itself from the request. That grant is the load-bearing part of the
-- whole design, not a detail of it.
--
-- ONE function, not two. Signed-in and anonymous differ by whether auth.uid()
-- is present, and that is the ONLY thing they differ by: same validation, same
-- caps, same table. Two functions would be two places for those rules to drift.
--
-- Apply manually in the Supabase SQL editor, after 0125.
--
-- TO UNDO: drop app_feedback_submit, the five private helper functions and the two
-- tables this file creates, then `alter table public.app_feedback drop
-- constraint app_feedback_author_xor_reporter, drop column reporter_hash, drop
-- column contact, alter column user_id set not null` -- which requires that no
-- authorless row has been written yet, and 0053's own policy is what has to be
-- put back to its pre-0126 text (it is restated here, not replaced in effect).

begin;

-- ===========================================================================
-- 1. The reporter-hash secret.
-- ===========================================================================
-- 0089's coin_public_id_secret doctrine, minted at apply time, readable by
-- nothing: no grant, RLS on, no policy of any kind. Only the definer function
-- below, running as the owner, ever selects it.
--
-- DELIBERATELY ITS OWN SALT rather than a reuse of 0089's. A shared salt would
-- make one address hash comparable across two unrelated namespaces, which is a
-- join nobody asked for and cannot be taken back once rows carry it.
create table if not exists public.app_feedback_reporter_secret (
	id boolean primary key default true check (id),
	salt text not null default (gen_random_uuid()::text || gen_random_uuid()::text),
	created_at timestamptz not null default now()
);

insert into public.app_feedback_reporter_secret (id) values (true) on conflict (id) do nothing;

revoke all on public.app_feedback_reporter_secret from anon, authenticated, service_role;
alter table public.app_feedback_reporter_secret enable row level security;

-- ===========================================================================
-- 2. app_feedback, widened. Additively, and in one direction only.
-- ===========================================================================

-- The author column. A signed-in row still has to match auth.uid() -- that is
-- 0053's policy, restated below unchanged in effect -- but the column itself can
-- now be absent.
alter table public.app_feedback alter column user_id drop not null;

-- Optional, and optional means optional: an anonymous reporter who wants an
-- answer can leave a way to be reached, and one who does not leaves it empty.
-- Never required, never derived from anything, never filled in on their behalf.
-- Free-form text on purpose (an email, a first name, a class period, "ask me in
-- 4th"): a validator here would only reject the spellings a person actually
-- used. The cap is the boundary; _app_feedback_contact_max() mirrors it so the
-- function can refuse gracefully, the way FEEDBACK_MAX_LEN mirrors 0053's.
alter table public.app_feedback
	add column if not exists contact text
		check (contact is null or char_length(btrim(contact)) between 1 and 200);

-- A SALTED HASH OF THE REPORTER'S ADDRESS. NOT THE ADDRESS.
--
-- The raw address buys nothing this does not: it is used to count recent reports
-- from one source and for nothing else, and a hash counts exactly as well. It is
-- a school app, the reporters are minors, and an address column is a log of who
-- was where that somebody would eventually be asked to hand over.
--
-- The value stored is md5(salt || whatever the caller passed), salted INSIDE the
-- definer function, which is why this column cannot hold an address even if a
-- future caller passes one by mistake (tests/feedback-anonymous.test.ts feeds a
-- literal address and asserts what lands here).
alter table public.app_feedback add column if not exists reporter_hash text;

-- EXACTLY ONE OF THE TWO, and this is "the own-row check widens for the
-- anonymous path only" written where it cannot be forgotten:
--
--   * a signed-in row has an author and NO address hash. Storing both would link
--     an account to an address, and therefore link that account to any ANONYMOUS
--     report carrying the same hash -- de-anonymising, to whoever reads the
--     table, the exact person this feature exists to protect. The signed-in path
--     ignores the hash parameter entirely for that reason.
--   * an anonymous row has no author and MUST carry a hash, so every row is
--     attributable to something and none is a free write.
--
-- Every row 0053 has already collected satisfies this (author present, hash
-- null), so the constraint validates against the live table without stranding
-- anything. Postgres has no `add constraint if not exists`, hence the guard.
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conrelid = 'public.app_feedback'::regclass
			and conname = 'app_feedback_author_xor_reporter'
	) then
		alter table public.app_feedback
			add constraint app_feedback_author_xor_reporter
			check ((user_id is null) <> (reporter_hash is null));
	end if;
end
$$;

-- 0053's insert policy, restated. This is NOT a widening: `user_id = auth.uid()`
-- already evaluated to NULL, and therefore refused, for a null user_id, and it
-- still does. The `is not null` is written out because the column's NOT NULL is
-- gone and the reader of this policy should not have to work that out. The
-- anonymous path does not come through here at all -- it comes through the
-- definer function, which is the only thing that can produce a valid
-- reporter_hash, because the salt is readable by nothing.
drop policy if exists "insert own feedback" on public.app_feedback;
create policy "insert own feedback"
	on public.app_feedback
	for insert
	to authenticated
	with check (user_id is not null and user_id = (select auth.uid()));

-- 0053's read policies are untouched: own rows, plus is_teacher() (= is_admin()
-- since 0067) reads everything. An anonymous row has no owner, so it is visible
-- to admins only, which is what an authorless report should be. 0085's console
-- read left-joins profiles on user_id and therefore keeps working over an
-- authorless row; giving that row a name of its own on screen is the console's
-- bundle, not this one.

-- ===========================================================================
-- 3. The rate limit.
-- ===========================================================================
-- A sliding window per address hash. Named constants rather than literals
-- scattered through the function: retuning the cap is then one replace, in one
-- place, with nothing to grep for.
--
-- THE NUMBERS ARE CHOSEN AGAINST A SCHOOL NETWORK, which NATs every student
-- behind one public address. A cap of one or two would mean the first reporter
-- during a first-period outage silences the rest of the building, which is the
-- failure this feature exists to prevent. Five in ten minutes still stops a
-- script, and still leaves a genuinely broken morning reportable.
create or replace function public._app_feedback_rate_window()
returns interval language sql immutable as $$ select interval '10 minutes' $$;

create or replace function public._app_feedback_rate_cap()
returns integer language sql immutable as $$ select 5 $$;

-- Mirrors of the two column CHECKs (2000 from 0053, 200 from section 2). The
-- CHECK is the boundary; these exist so the function can refuse GRACEFULLY, with
-- something a caller can show a person, instead of letting a constraint
-- violation come back as an exception nobody can render.
create or replace function public._app_feedback_message_max()
returns integer language sql immutable as $$ select 2000 $$;

create or replace function public._app_feedback_contact_max()
returns integer language sql immutable as $$ select 200 $$;

-- TRIMMED THE WAY THE PERSON TYPING MEANT, which is NOT what btrim() does.
-- btrim(x) with no second argument strips SPACES ONLY: a message of two
-- newlines is empty to whoever wrote it, empty to feedbackIssue()'s JavaScript
-- trim(), and NOT empty to btrim -- so without this the function would cheerfully
-- file a blank report, and 0053's own `length(trim(message)) > 0` CHECK would
-- pass it too. Spelled as a regex rather than btrim(x, E' \t\n\r\f\v') because an
-- escape Postgres does not recognise in an E'' string is kept as the bare
-- letter, and a trim set that quietly includes "v" is worse than the bug it was
-- fixing. One function, so the six call sites below cannot drift apart.
--
-- This is deliberately STRICTER than the column CHECK, and only ever for a NEW
-- path: nothing has been stored through this function, so refusing a
-- whitespace-only report strands nothing. The direct insert 0053 grants is
-- untouched and still answers exactly as it did.
create or replace function public._app_feedback_trim(p_text text)
returns text language sql immutable as $$
	select regexp_replace(coalesce(p_text, ''), '^\s+|\s+$', '', 'g')
$$;

revoke all on function public._app_feedback_rate_window() from public, anon, authenticated, service_role;
revoke all on function public._app_feedback_rate_cap() from public, anon, authenticated, service_role;
revoke all on function public._app_feedback_message_max() from public, anon, authenticated, service_role;
revoke all on function public._app_feedback_contact_max() from public, anon, authenticated, service_role;
revoke all on function public._app_feedback_trim(text) from public, anon, authenticated, service_role;

-- One row per ACCEPTED anonymous report. A refused call writes nothing, so a
-- refusal cannot extend its own block: a window that renews on every rejected
-- retry is a permanent ban with a friendly message.
--
-- Nothing references a row here and nothing ever reads one individually, so
-- there is no key worth carrying. It is a counter with timestamps.
create table if not exists public.app_feedback_rate (
	reporter_hash text not null,
	created_at timestamptz not null default now()
);

-- The count.
create index if not exists app_feedback_rate_hash_idx
	on public.app_feedback_rate (reporter_hash, created_at desc);
-- The prune. The count's index cannot serve it: it leads on the hash, and ageing
-- out is a question about time across every hash at once.
create index if not exists app_feedback_rate_aging_idx
	on public.app_feedback_rate (created_at);

revoke all on public.app_feedback_rate from anon, authenticated, service_role;
alter table public.app_feedback_rate enable row level security;
-- No policy, deliberately: only the definer function below touches this.

-- ===========================================================================
-- 4. The one write function.
-- ===========================================================================
-- SECURITY DEFINER because it writes tables with no grant to anybody and reads a
-- salt with no grant to anybody. Granted to service_role ONLY -- see the header
-- for why that is the design rather than a detail of it.
--
-- NO IDENTITY PARAMETER. The signed-in author is auth.uid() and cannot be
-- supplied, so "can only file as yourself" is a property of the signature.
--
-- WHAT IT REFUSES, AND HOW. A caller must be able to show a person something
-- useful, so anything a person could have caused comes back as structured
-- {ok:false, reason:...} rather than an exception. An exception is reserved for
-- what only OUR OWN CALLER can get wrong (an unknown app or kind, a missing
-- address hash on an anonymous call) -- those are bugs in the route, not in what
-- somebody typed.
--
-- A REFUSAL SAYS NOTHING ABOUT THE ADDRESS. Every refusal is the same shape and
-- carries no counts, no remaining quota, no window, no reset time and no
-- indication of whether this hash has ever been seen before; a refused call
-- writes nothing, so nothing about it is observable afterwards either. There is
-- no function anywhere that answers "is this address at its limit" without also
-- filing a report, and the only caller that could ask holds the service key
-- already.
create or replace function public.app_feedback_submit(
	p_app text,
	p_kind text,
	p_message text,
	p_context text default null,
	p_meta jsonb default '{}'::jsonb,
	p_contact text default null,
	p_address_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_app text := nullif(public._app_feedback_trim(p_app), '');
	v_kind text := lower(public._app_feedback_trim(p_kind));
	v_message text := public._app_feedback_trim(p_message);
	v_context text := nullif(public._app_feedback_trim(p_context), '');
	v_contact text := nullif(public._app_feedback_trim(p_contact), '');
	v_supplied text := nullif(public._app_feedback_trim(p_address_hash), '');
	v_hash text;
	v_recent integer;
	v_id uuid;
begin
	-- Our own caller's job to get right.
	if v_app is null then
		raise exception 'A feedback app id is required.';
	end if;
	if v_kind not in ('bug', 'idea', 'praise', 'other') then
		raise exception 'Unknown feedback kind.';
	end if;

	if v_uid is null then
		-- The anonymous path. An unattributable write is not on offer.
		if v_supplied is null then
			raise exception 'An anonymous report needs a reporter address hash.';
		end if;
		-- Salted here, which is what makes the column unable to hold an address:
		-- whatever arrived, what is stored is a digest of it.
		v_hash := md5(
			(select s.salt from public.app_feedback_reporter_secret s where s.id limit 1)
			|| v_supplied
		);
	end if;
	-- A signed-in call ignores p_address_hash entirely. See the XOR constraint
	-- above for why an account is never stored beside an address hash; and a
	-- signed-in report is attributable to an account already, which is the thing
	-- a rate limit stands in for when there is no account.

	-- What a person could have caused.
	if v_message = '' then
		return jsonb_build_object('ok', false, 'reason', 'message_empty');
	end if;
	if char_length(v_message) > public._app_feedback_message_max() then
		return jsonb_build_object('ok', false, 'reason', 'message_too_long');
	end if;
	if v_contact is not null and char_length(v_contact) > public._app_feedback_contact_max() then
		return jsonb_build_object('ok', false, 'reason', 'contact_too_long');
	end if;

	if v_hash is not null then
		-- Age out first. A row older than the window can never affect a decision
		-- again, and the window is therefore also the retention: holding an
		-- address hash past the point where it counts is a cost with no benefit.
		delete from public.app_feedback_rate r
		where r.created_at < now() - public._app_feedback_rate_window();

		select count(*) into v_recent
		from public.app_feedback_rate r
		where r.reporter_hash = v_hash
			and r.created_at > now() - public._app_feedback_rate_window();

		if v_recent >= public._app_feedback_rate_cap() then
			return jsonb_build_object('ok', false, 'reason', 'rate_limited');
		end if;
	end if;

	insert into public.app_feedback (user_id, app, context, kind, message, meta, contact, reporter_hash)
	values (
		v_uid, v_app, v_context, v_kind, v_message,
		coalesce(p_meta, '{}'::jsonb), v_contact, v_hash
	)
	returning id into v_id;

	if v_hash is not null then
		insert into public.app_feedback_rate (reporter_hash) values (v_hash);
	end if;

	return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.app_feedback_submit(text, text, text, text, jsonb, text, text)
	from public, anon, authenticated;
grant execute on function public.app_feedback_submit(text, text, text, text, jsonb, text, text)
	to service_role;

commit;
