-- 0074_coin_roles.sql
-- IDEA Coin roles: Shop Steward, Quartermaster, Safety Officer, Lab Tech.
--
-- Builds the role system docs/coin-economy/idea_coin_economy_draft_v3.md
-- Part 5 calls out as ready to launch: "The Role Questions sheet already has
-- a full application quiz written for all four roles and it's never gone
-- live." That quiz's actual question TEXT lives in the legacy Google Sheet
-- behind getRoleQuestions/submitRoleApplication (src/lib/server/coin-ledger.ts,
-- src/routes/api/coin-ledger/apply/+server.ts) -- OUTSIDE this repo, never
-- committed here, and this migration does not attempt to reproduce it. What
-- this migration builds is the STRUCTURE the real quiz content slots into:
-- role definitions, section-scoped ratio caps, applications carrying
-- free-response answers, and current holders -- keyed off 0073's real
-- coin_sections/coin_section_students, not a parallel section concept, the
-- same "reuse real infrastructure" doctrine 0073 itself established for
-- bulk logging. src/lib/coin-desk/roles.ts's ROLE_APPLICATION_QUESTIONS is a
-- functional STAND-IN prompt set for the admin apply form until the real
-- quiz text is ported in; nothing here or there claims to be that content.
--
-- ---------------------------------------------------------------------------
-- APPLICATION FEE: 0i¢, ON PURPOSE
-- ---------------------------------------------------------------------------
-- Per the doc: "Application fee: 0i¢, the free-response question is the real
-- gate." Nothing here touches coin_transactions at apply or approve time --
-- the only coin ever tied to a role is the RECURRING Weekly Role Stipend
-- (2i¢/week while holding it, already seeded in 0070 as `weekly_role_stipend`,
-- scope '209h'), logged separately via coin_bulk_log_role_stipend below.
-- This migration is purely about WHO is eligible, WHO applied, and WHO
-- currently holds a role -- not a payment.
--
-- ---------------------------------------------------------------------------
-- RATIOS: TWO ARE REAL, TWO ARE A PROPOSED DEFAULT -- SEE THE SEED BELOW
-- ---------------------------------------------------------------------------
-- Shop Steward and Quartermaster have real, documented ratios (Part 5):
--   - Shop Steward: 3 per ~25 students, scaled proportionally for smaller
--     sections -- floor(3 x section size / 25), where section size is the
--     LIVE count of coin_section_students (0073) for that section, real
--     roster infrastructure, never a hardcoded curriculum headcount. Checked
--     against the doc's own worked examples: Junior (20 students) ->
--     floor(60/25) = 2, Sophomore (10) -> floor(30/25) = 1, Senior (11) ->
--     floor(33/25) = 1. All three match exactly.
--   - Quartermaster: 1 per section, regardless of size. A fixed cap, not a
--     ratio.
-- Safety Officer and Lab Tech were NOT specified in the original quiz -- the
-- doc's own words: "Safety Officer and Lab Tech ratios weren't specified in
-- the quiz -- propose 1-2 per section, your call." This migration proposes
-- 2 per section (fixed) for BOTH, flagged `ratio_is_default = true` on both
-- rows -- a DEFAULT the admin UI displays as unsettled, not policy this
-- migration is claiming to have decided. Enforcement is identical either
-- way (the flag changes nothing about how the cap is checked). Changing the
-- actual number is a hand-edit in the SQL editor, the same "price list is
-- edited by hand for now, no client write path" doctrine 0070 already
-- established for coin_categories -- there is no ratio-editing UI here.
--
-- ---------------------------------------------------------------------------
-- RATIO CAP ENFORCEMENT: ON APPROVAL, NOT ON APPLICATION -- EXTRA CREDIT'S
-- SHAPE, NOT A NEW ONE
-- ---------------------------------------------------------------------------
-- Applying never checks the cap (coin_role_apply). Only APPROVING one does
-- (coin_role_admin_review), and it is the exact same shape as Extra Credit's
-- point cap (0070's coin_log_extra_credit): a hard block, returned as
-- structured {ok:false, reason:...} jsonb rather than an exception, so the
-- admin UI displays it gracefully instead of a crashed request. A pending
-- application that hits the cap stays pending -- nothing is silently
-- dropped or auto-rejected; the admin can revoke an existing holder to free
-- a slot, or reject the new application, and try again.
--
-- ---------------------------------------------------------------------------
-- BULK STIPEND LOGGING: ITS OWN RPC, NOT coin_bulk_log_section -- HERE IS WHY
-- ---------------------------------------------------------------------------
-- coin_bulk_log_section (0073) logs one category against every student IN A
-- SECTION. Weekly Role Stipend is not "every student in a section" money --
-- it is "every student who currently holds a role in that section" money.
-- Routing it through coin_bulk_log_section would pay every student in the
-- class, role or no role, which is wrong. So Weekly Role Stipend is
-- EXCLUDED from isBulkEligible() on the client (src/lib/coin-desk/sections.ts,
-- alongside Extra Credit) and gets its own coin_bulk_log_role_stipend RPC
-- below, which iterates ACTIVE ROLE HOLDERS (optionally filtered by role
-- and/or section) instead of a section's whole roster. It reuses the exact
-- same nested-coin_log_transaction, one-round-trip, structured-per-student-
-- results pattern coin_bulk_log_section already established -- same jsonb
-- shape, same "one failure never blocks the rest" guarantee -- just over a
-- different roster.
--
-- Apply manually in the Supabase SQL editor, after 0073.

-- ===========================================================================
-- 1. Role definitions -- Shop Steward, Quartermaster, Safety Officer, Lab
--    Tech. Admin-tool infrastructure like coin_sections, so reads are
--    is_admin()-gated the same way (no student-facing surface reads this
--    yet; loosening that is a later pass's call, same as 0070's own
--    doctrine for coin_sections vs the broader-read coin_categories).
-- ===========================================================================
create table if not exists public.coin_role_definitions (
	id text primary key check (id = lower(id) and id ~ '^[a-z0-9_]+$'),
	name text not null,
	description text,
	-- 'fixed': ratio_count is the flat per-section cap, ratio_per_students is
	-- null. 'per_students': cap = floor(ratio_count * section_size /
	-- ratio_per_students), where section_size is read live from
	-- coin_section_students, never a stored/duplicated headcount.
	ratio_kind text not null check (ratio_kind in ('fixed', 'per_students')),
	ratio_count integer not null check (ratio_count > 0),
	ratio_per_students integer check (ratio_per_students is null or ratio_per_students > 0),
	check (
		(ratio_kind = 'fixed' and ratio_per_students is null)
		or (ratio_kind = 'per_students' and ratio_per_students is not null)
	),
	-- True only for a ratio this migration PROPOSED because the source quiz
	-- never specified one (Safety Officer, Lab Tech) -- a marker for the
	-- admin UI to flag as unsettled, never a behavioral flag: enforcement is
	-- identical whether this is true or false.
	ratio_is_default boolean not null default false,
	active boolean not null default true,
	sort_order integer not null default 0,
	notes text
);

revoke all on public.coin_role_definitions from anon, authenticated;
grant select on public.coin_role_definitions to authenticated;
alter table public.coin_role_definitions enable row level security;

drop policy if exists "admins read coin role definitions" on public.coin_role_definitions;
create policy "admins read coin role definitions"
	on public.coin_role_definitions
	for select
	to authenticated
	using (public.is_admin());

-- No insert/update/delete policies: the role list (like coin_categories'
-- price list) is edited by hand in the SQL editor for now.

insert into public.coin_role_definitions
	(id, name, description, ratio_kind, ratio_count, ratio_per_students, ratio_is_default, sort_order, notes)
values
	('shop_steward', 'Shop Steward', 'Keeps the shop floor safe and organized between classes.', 'per_students', 3, 25, false, 10, 'Documented ratio: 3 per ~25 students, scaled proportionally. floor(3 x section size / 25) -- matches the doc''s worked examples (Junior 20 students -> 2, Sophomore 10 -> 1, Senior 11 -> 1).'),
	('quartermaster', 'Quartermaster', 'Tracks and issues shared tools and materials.', 'fixed', 1, null, false, 20, 'Documented ratio: 1 per section, regardless of size.'),
	('safety_officer', 'Safety Officer', 'Watches for and flags safety issues during independent work time.', 'fixed', 2, null, true, 30, 'DEFAULT, not settled: the source quiz never specified a ratio for this role ("propose 1-2 per section, your call"). Proposed at 2. Change by hand in the SQL editor once confirmed.'),
	('lab_tech', 'Lab Tech', 'Keeps shared lab and print equipment running and reset between users.', 'fixed', 2, null, true, 40, 'DEFAULT, not settled: the source quiz never specified a ratio for this role ("propose 1-2 per section, your call"). Proposed at 2. Change by hand in the SQL editor once confirmed.')
on conflict (id) do update set
	name = excluded.name,
	description = excluded.description,
	ratio_kind = excluded.ratio_kind,
	ratio_count = excluded.ratio_count,
	ratio_per_students = excluded.ratio_per_students,
	ratio_is_default = excluded.ratio_is_default,
	sort_order = excluded.sort_order,
	notes = excluded.notes;

-- ===========================================================================
-- 2. Applications -- student email, role, free-response answers, status.
--    section_id is captured at APPLICATION time from the student's current
--    coin_section_students row (0073) -- the ratio cap is checked against
--    THIS section at review time, so an application is meaningless without
--    one; see coin_role_apply below for the refusal when a student has no
--    section assigned yet.
-- ===========================================================================
create table if not exists public.coin_role_applications (
	id uuid primary key default gen_random_uuid(),
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	role_id text not null references public.coin_role_definitions (id),
	section_id text not null references public.coin_sections (id) on delete cascade,
	-- [{ "question": "...", "answer": "..." }, ...]. The real question TEXT
	-- lives in the legacy Sheet (see the migration header) -- this column
	-- stores whatever was actually asked and answered, verbatim.
	answers jsonb not null default '[]'::jsonb,
	status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
	-- No student-facing apply flow exists yet (see CLAUDE.md's Roles section
	-- for the explicit scope call) -- every application is logged by an
	-- admin on the student's behalf, the same way every other coin-desk
	-- write is admin-entered. submitted_by is that admin's own email, never
	-- client-claimed.
	submitted_by text not null,
	submitted_at timestamptz not null default now(),
	reviewed_by text,
	reviewed_at timestamptz,
	review_note text check (review_note is null or char_length(review_note) <= 500)
);

create index if not exists coin_role_applications_status_idx
	on public.coin_role_applications (status, submitted_at desc);
create index if not exists coin_role_applications_student_idx
	on public.coin_role_applications (student_email);

revoke all on public.coin_role_applications from anon, authenticated;
grant select on public.coin_role_applications to authenticated;
alter table public.coin_role_applications enable row level security;

drop policy if exists "admins read coin role applications" on public.coin_role_applications;
create policy "admins read coin role applications"
	on public.coin_role_applications
	for select
	to authenticated
	using (public.is_admin());

-- No insert/update/delete policies: only coin_role_apply / coin_role_admin_review write.

-- ===========================================================================
-- 3. Current holders -- email, role, section, since-date, revoked state.
--    Every row traces to exactly one approved application (application_id
--    not null, unique) -- there is no way to grant a role that skips
--    review. A partial unique index is what makes "current holder" a real,
--    checkable state: at most one ACTIVE (revoked_at is null) row per
--    (student_email, role_id), so a student can be re-approved for the same
--    role after a revoke (a fresh row) -- the same "earned once, can still
--    be lost, can be re-earned" shape the Eating Pass strike system already
--    uses.
-- ===========================================================================
create table if not exists public.coin_role_holders (
	id uuid primary key default gen_random_uuid(),
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	role_id text not null references public.coin_role_definitions (id),
	section_id text not null references public.coin_sections (id) on delete cascade,
	application_id uuid not null unique references public.coin_role_applications (id),
	since timestamptz not null default now(),
	assigned_by text not null,
	revoked_at timestamptz,
	revoked_by text,
	revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500),
	check ((revoked_at is null) = (revoked_by is null))
);

-- The capacity check's whole boundary: an active row counts, a revoked one
-- doesn't, so revoking is exactly "free a slot" with no separate bookkeeping.
create unique index if not exists coin_role_holders_active_unique
	on public.coin_role_holders (student_email, role_id)
	where revoked_at is null;
create index if not exists coin_role_holders_section_idx
	on public.coin_role_holders (section_id, role_id)
	where revoked_at is null;

revoke all on public.coin_role_holders from anon, authenticated;
grant select on public.coin_role_holders to authenticated;
alter table public.coin_role_holders enable row level security;

drop policy if exists "admins read coin role holders" on public.coin_role_holders;
create policy "admins read coin role holders"
	on public.coin_role_holders
	for select
	to authenticated
	using (public.is_admin());

-- No insert/update/delete policies: only coin_role_admin_review (approve)
-- and coin_role_admin_revoke write.

-- ===========================================================================
-- 4. Ratio capacity -- the ONE place the cap formula lives. Internal
--    helpers (no grant, the _coin_insert convention), called from both the
--    admin-facing preview RPC and the review RPC's hard block, so the two
--    can never disagree about what the cap or the current count is.
-- ===========================================================================
create or replace function public._coin_role_capacity(p_role_id text, p_section_id text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_role public.coin_role_definitions;
	v_size integer;
begin
	select * into v_role from public.coin_role_definitions where id = p_role_id;
	if v_role.id is null then
		raise exception 'Unknown coin role "%".', p_role_id;
	end if;

	if v_role.ratio_kind = 'fixed' then
		return v_role.ratio_count;
	end if;

	select count(*) into v_size from public.coin_section_students where section_id = p_section_id;
	return floor(v_role.ratio_count::numeric * v_size / v_role.ratio_per_students)::integer;
end;
$$;

revoke all on function public._coin_role_capacity(text, text) from public;

create or replace function public._coin_role_active_holder_count(p_role_id text, p_section_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select count(*)::integer
	from public.coin_role_holders
	where role_id = p_role_id and section_id = p_section_id and revoked_at is null;
$$;

revoke all on function public._coin_role_active_holder_count(text, text) from public;

-- Admin-facing preview: cap, current holder count, and section size in one
-- round trip, so the review UI can show "2 of 2 filled" before a decision.
create or replace function public.coin_role_admin_capacity(p_role_id text, p_section_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_cap integer;
	v_held integer;
	v_size integer;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can view role capacity.';
	end if;
	v_cap := public._coin_role_capacity(p_role_id, p_section_id);
	v_held := public._coin_role_active_holder_count(p_role_id, p_section_id);
	select count(*) into v_size from public.coin_section_students where section_id = p_section_id;
	return jsonb_build_object(
		'role_id', p_role_id, 'section_id', p_section_id,
		'cap', v_cap, 'held', v_held, 'section_size', v_size
	);
end;
$$;

revoke all on function public.coin_role_admin_capacity(text, text) from public;
grant execute on function public.coin_role_admin_capacity(text, text) to authenticated;

-- ===========================================================================
-- 5. Applying. Admin-entered (see the applications table comment above),
--    NOT ratio-checked -- the cap is enforced at approval, not application,
--    per the prompt's own instruction and Extra Credit's own precedent
--    (coin_log_extra_credit checks its cap at the write, not earlier).
-- ===========================================================================
create or replace function public.coin_role_apply(
	p_student_email text,
	p_role_id text,
	p_answers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_role public.coin_role_definitions;
	v_section text;
	v_answers jsonb;
	v_id uuid;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log a role application.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;

	select * into v_role from public.coin_role_definitions where id = p_role_id;
	if v_role.id is null or not v_role.active then
		raise exception 'Unknown or inactive coin role "%".', p_role_id;
	end if;

	select section_id into v_section from public.coin_section_students where student_email = v_email;
	if v_section is null then
		raise exception 'This student has no coin section assigned yet -- assign one above before logging a role application (the ratio cap is checked against their section).';
	end if;

	if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
		raise exception 'Answers must be a list.';
	end if;
	if jsonb_array_length(p_answers) > 10 then
		raise exception 'Too many answers (max 10).';
	end if;
	select coalesce(
		jsonb_agg(jsonb_build_object(
			'question', left(coalesce(elem ->> 'question', ''), 500),
			'answer', left(coalesce(elem ->> 'answer', ''), 4000)
		)),
		'[]'::jsonb
	)
	into v_answers
	from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) elem;

	if exists (
		select 1 from public.coin_role_holders
		where student_email = v_email and role_id = v_role.id and revoked_at is null
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_holds_role');
	end if;

	insert into public.coin_role_applications (student_email, role_id, section_id, answers, submitted_by)
	values (v_email, v_role.id, v_section, v_answers, public.current_user_email())
	returning id into v_id;

	return jsonb_build_object('ok', true, 'application_id', v_id, 'section_id', v_section);
end;
$$;

revoke all on function public.coin_role_apply(text, text, jsonb) from public;
grant execute on function public.coin_role_apply(text, text, jsonb) to authenticated;

-- ===========================================================================
-- 6. Listing applications for review. Mirrors coin_admin_list_sections'
--    inline `where public.is_admin()` shape -- a non-admin gets zero rows,
--    not an exception, since this is a plain read.
-- ===========================================================================
create or replace function public.coin_role_admin_list_applications(p_status text default 'pending')
returns table (
	id uuid,
	student_email text,
	display_name text,
	full_name text,
	role_id text,
	role_name text,
	section_id text,
	answers jsonb,
	status text,
	submitted_by text,
	submitted_at timestamptz,
	reviewed_by text,
	reviewed_at timestamptz,
	review_note text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		a.id, a.student_email, p.display_name, p.full_name,
		a.role_id, r.name as role_name, a.section_id, a.answers, a.status,
		a.submitted_by, a.submitted_at, a.reviewed_by, a.reviewed_at, a.review_note
	from public.coin_role_applications a
	join public.coin_role_definitions r on r.id = a.role_id
	left join public.profiles p on lower(btrim(coalesce(p.email, ''))) = a.student_email
	where public.is_admin()
		and (p_status is null or a.status = p_status)
	order by a.submitted_at desc;
$$;

revoke all on function public.coin_role_admin_list_applications(text) from public;
grant execute on function public.coin_role_admin_list_applications(text) to authenticated;

-- ===========================================================================
-- 7. Reviewing -- approve or reject. The ratio cap is enforced HERE, hard-
--    blocked, structured refusal -- Extra Credit's cap_exceeded shape, not a
--    new pattern (see the migration header). A rejected application stays a
--    permanent record (status='rejected'), never deleted. Any admin may
--    review any application -- no owner-only step, the "works identically
--    for any admin" rule already established elsewhere in this schema.
-- ===========================================================================
create or replace function public.coin_role_admin_review(
	p_application_id uuid,
	p_decision text,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_app public.coin_role_applications;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_cap integer;
	v_held integer;
	v_holder_id uuid;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can review role applications.';
	end if;
	if p_decision not in ('approve', 'reject') then
		raise exception 'Decision must be "approve" or "reject".';
	end if;

	select * into v_app from public.coin_role_applications where id = p_application_id;
	if v_app.id is null then
		raise exception 'Unknown application.';
	end if;
	if v_app.status <> 'pending' then
		raise exception 'This application was already %.', v_app.status;
	end if;

	if p_decision = 'reject' then
		update public.coin_role_applications
			set status = 'rejected', reviewed_by = public.current_user_email(), reviewed_at = now(), review_note = v_note
			where id = p_application_id;
		return jsonb_build_object('ok', true, 'status', 'rejected', 'application_id', p_application_id);
	end if;

	v_cap := public._coin_role_capacity(v_app.role_id, v_app.section_id);
	v_held := public._coin_role_active_holder_count(v_app.role_id, v_app.section_id);

	if v_held >= v_cap then
		return jsonb_build_object(
			'ok', false, 'reason', 'ratio_cap_reached',
			'role_id', v_app.role_id, 'section_id', v_app.section_id,
			'cap', v_cap, 'held', v_held
		);
	end if;

	-- A student can already hold the role from an earlier, separately
	-- approved application (re-earned after a revoke, or two applications
	-- somehow both pending at once) -- refuse rather than let the partial
	-- unique index reject the insert with a raw constraint error.
	if exists (
		select 1 from public.coin_role_holders
		where student_email = v_app.student_email and role_id = v_app.role_id and revoked_at is null
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_holds_role');
	end if;

	insert into public.coin_role_holders (student_email, role_id, section_id, application_id, assigned_by)
	values (v_app.student_email, v_app.role_id, v_app.section_id, v_app.id, public.current_user_email())
	returning id into v_holder_id;

	update public.coin_role_applications
		set status = 'approved', reviewed_by = public.current_user_email(), reviewed_at = now(), review_note = v_note
		where id = p_application_id;

	return jsonb_build_object(
		'ok', true, 'status', 'approved',
		'application_id', p_application_id, 'holder_id', v_holder_id
	);
end;
$$;

revoke all on function public.coin_role_admin_review(uuid, text, text) from public;
grant execute on function public.coin_role_admin_review(uuid, text, text) to authenticated;

-- ===========================================================================
-- 8. Current holders -- by section, for the /coin-desk roster view.
-- ===========================================================================
create or replace function public.coin_role_admin_list_holders(
	p_section_id text default null,
	p_role_id text default null,
	p_include_revoked boolean default false
)
returns table (
	id uuid,
	student_email text,
	display_name text,
	full_name text,
	role_id text,
	role_name text,
	section_id text,
	since timestamptz,
	assigned_by text,
	revoked_at timestamptz,
	revoked_by text,
	revoke_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		h.id, h.student_email, p.display_name, p.full_name,
		h.role_id, r.name as role_name, h.section_id, h.since, h.assigned_by,
		h.revoked_at, h.revoked_by, h.revoke_reason
	from public.coin_role_holders h
	join public.coin_role_definitions r on r.id = h.role_id
	left join public.profiles p on lower(btrim(coalesce(p.email, ''))) = h.student_email
	where public.is_admin()
		and (p_section_id is null or h.section_id = p_section_id)
		and (p_role_id is null or h.role_id = p_role_id)
		and (p_include_revoked or h.revoked_at is null)
	order by h.since desc;
$$;

revoke all on function public.coin_role_admin_list_holders(text, text, boolean) from public;
grant execute on function public.coin_role_admin_list_holders(text, text, boolean) to authenticated;

-- ===========================================================================
-- 9. Revoking -- frees the slot immediately (a revoked row stops counting
--    toward _coin_role_active_holder_count the instant revoked_at is set),
--    never a delete -- history stays queryable via p_include_revoked above.
-- ===========================================================================
create or replace function public.coin_role_admin_revoke(
	p_holder_id uuid,
	p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_holder public.coin_role_holders;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can revoke a coin role.';
	end if;

	select * into v_holder from public.coin_role_holders where id = p_holder_id;
	if v_holder.id is null then
		raise exception 'Unknown role holder.';
	end if;
	if v_holder.revoked_at is not null then
		raise exception 'This role was already revoked.';
	end if;

	update public.coin_role_holders
		set revoked_at = now(), revoked_by = public.current_user_email(),
			revoke_reason = nullif(btrim(coalesce(p_reason, '')), '')
		where id = p_holder_id;

	return jsonb_build_object('ok', true, 'holder_id', p_holder_id);
end;
$$;

revoke all on function public.coin_role_admin_revoke(uuid, text) from public;
grant execute on function public.coin_role_admin_revoke(uuid, text) to authenticated;

-- ===========================================================================
-- 10. Weekly Role Stipend bulk logging -- its OWN RPC, not
--     coin_bulk_log_section. See the migration header for why. Same
--     nested-coin_log_transaction, one-round-trip, structured-per-student-
--     results shape as coin_bulk_log_section, over a different roster:
--     ACTIVE ROLE HOLDERS, not a section's whole enrollment. `distinct` on
--     student_email is deliberate: a student holding two roles at once (no
--     rule against it) is paid the stipend ONCE per run, not once per role.
-- ===========================================================================
create or replace function public.coin_bulk_log_role_stipend(
	p_role_id text default null,
	p_section_id text default null,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_holder record;
	v_call jsonb;
	v_entry jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'weekly_role_stipend' and active) then
		raise exception 'The Weekly Role Stipend category is not configured.';
	end if;
	if p_role_id is not null and not exists (select 1 from public.coin_role_definitions where id = p_role_id) then
		raise exception 'Unknown coin role "%".', p_role_id;
	end if;
	if p_section_id is not null and not exists (select 1 from public.coin_sections where id = p_section_id) then
		raise exception 'Unknown coin section "%".', p_section_id;
	end if;

	for v_holder in
		select distinct student_email from public.coin_role_holders
		where revoked_at is null
			and (p_role_id is null or role_id = p_role_id)
			and (p_section_id is null or section_id = p_section_id)
		order by student_email
	loop
		v_total := v_total + 1;
		begin
			-- The EXISTING single-student RPC, nested -- exactly the pattern
			-- coin_bulk_log_section already relies on: SECURITY DEFINER nesting
			-- does not change what is_admin()/current_user_email() resolve to,
			-- so this inner call is authorized as the same admin who called us.
			v_call := public.coin_log_transaction(v_holder.student_email, 'weekly_role_stipend', null, null, v_note);
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_entry := jsonb_build_object('email', v_holder.student_email) || v_call;
		v_results := v_results || jsonb_build_array(v_entry);
	end loop;

	return jsonb_build_object(
		'ok', true,
		'role_id', p_role_id,
		'section_id', p_section_id,
		'total', v_total,
		'succeeded', v_succeeded,
		'refused', v_refused,
		'results', v_results
	);
end;
$$;

revoke all on function public.coin_bulk_log_role_stipend(text, text, text) from public;
grant execute on function public.coin_bulk_log_role_stipend(text, text, text) to authenticated;
