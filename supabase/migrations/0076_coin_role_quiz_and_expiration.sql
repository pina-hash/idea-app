-- 0076_coin_role_quiz_and_expiration.sql
-- Real question storage for coin role applications, replacing the hardcoded
-- placeholder set in src/lib/coin-desk/roles.ts (ROLE_APPLICATION_QUESTIONS),
-- plus expiration on coin_role_holders (0074).
--
-- ---------------------------------------------------------------------------
-- STRUCTURE ONLY -- REAL QUESTION CONTENT IS SEEDED OUTSIDE THIS MIGRATION
-- ---------------------------------------------------------------------------
-- This migration creates coin_role_quiz_questions and leaves it EMPTY. It
-- does not insert placeholder rows, and it does not insert real quiz
-- content either. Every role therefore has ZERO application questions until
-- someone populates this table by hand -- the SAME "price list edited by
-- hand in the SQL editor, no client write path" doctrine 0070 established
-- for coin_categories and 0074 already applied to coin_role_definitions.
-- There is deliberately no admin authoring UI for questions in this pass:
-- the real quiz content (per docs/coin-economy) lives outside this repo's
-- git history and gets pasted into this table directly by an admin, the
-- same way coin_categories' prices are maintained. Responsibility for
-- keeping that content current sits with whoever owns the SQL editor
-- access, not with a future commit -- see CLAUDE.md's Roles section for the
-- explicit statement of where that responsibility lives.
--
-- ---------------------------------------------------------------------------
-- ANSWERS: A REAL TABLE, LINKED TO THE QUESTION IT ANSWERED, SNAPSHOTTED
-- ---------------------------------------------------------------------------
-- coin_role_applications.answers (0074) was a freeform jsonb array of
-- {question, answer} pairs with no link back to a real question row. It is
-- DROPPED here (not migrated forward -- the role-application flow has never
-- gone live with real content, per 0074's own header, so there is no real
-- production data in this shape to preserve) and replaced by
-- coin_role_application_answers, one row per question per application,
-- referencing coin_role_quiz_questions(id).
--
-- Every field the review screen needs is SNAPSHOTTED at submission time
-- (question text, options, which option was correct, whether the selected
-- one matched) rather than joined live against the question bank. This
-- matters specifically because the question bank is maintained BY HAND
-- outside the normal migration/commit flow (see above) and can be edited or
-- replaced at any time -- a live join would let editing a question after
-- the fact silently rewrite what a teacher's already-completed review
-- looked like. A snapshot can't drift.
--
-- ---------------------------------------------------------------------------
-- EXPIRATION: COMPUTED, NEVER SCHEDULED
-- ---------------------------------------------------------------------------
-- coin_role_holders gains a nullable expires_at. "Currently active" becomes
-- a computed condition used everywhere a holder is counted or listed:
--   revoked_at is null and (expires_at is null or expires_at > now())
-- No cron, no scheduled job, nothing that runs on a timer -- a slot frees
-- itself the instant anything (a capacity check, a holders list, a stipend
-- run) evaluates that condition past the expiration date.
--
-- ONE place still needs a real WRITE, not just a read of the computed
-- condition: the partial unique index that makes "one active holder per
-- (student, role)" enforceable, coin_role_holders_active_unique, can only
-- reference `revoked_at is null` -- Postgres does not allow a volatile
-- expression like now() in an index predicate, so the index has no way to
-- know a row has lapsed. Approving a new application for a student whose
-- prior holder row expired naturally (revoked_at still null) would hit that
-- unique index. coin_role_admin_review's approve branch handles this by
-- lazily stamping revoked_at on any such lapsed-but-open row for that exact
-- (student, role) pair the moment a NEW approval needs the slot -- a write
-- triggered by a real action touching that row, not a background sweep. See
-- the function body below for the exact statement.
--
-- ---------------------------------------------------------------------------
-- APPROVAL: EXPIRATION SET AT REVIEW TIME, ALWAYS EDITABLE AFTER
-- ---------------------------------------------------------------------------
-- coin_role_admin_review gains p_expires_at (nullable, default null). The
-- SERVER never guesses a default from the role's suggested duration -- it
-- stores exactly what it's given, including null for "no expiration". The
-- suggested-duration default (coin_role_definitions.suggested_duration_days,
-- also added below) is applied CLIENT-SIDE only: the review UI pre-fills the
-- expiration date input from it before the admin clicks Approve, and the
-- admin can clear or change it before submitting. This keeps the RPC free of
-- the ambiguity a server-side "null means use the default" rule would create
-- (null would then be unable to also mean "no expiration, ever"). Whatever
-- was set at approval is independently editable afterward, any time, via
-- coin_role_admin_set_expiration -- with no requirement to revoke first.
--
-- ---------------------------------------------------------------------------
-- MC SCORING: INFORMATIONAL ONLY, NEVER A GATE
-- ---------------------------------------------------------------------------
-- Each multiple-choice answer snapshot carries is_correct (computed once,
-- at submission, from the question's answer key at that moment) plus the
-- correct option's index, so the review screen can show a right/wrong
-- indicator and the correct choice next to whatever the student picked.
-- Nothing reads is_correct to gate, hide, or auto-decide anything -- the
-- written portion is never blocked or hidden based on MC score, and
-- approve/reject stays a manual admin call regardless of how the MC
-- portion scored. This mirrors 0074's own application-fee stance: the
-- review is the real gate, not an automatic pass/fail.
--
-- Existing 0067 naming trap applies throughout: is_admin() is the check,
-- never is_teacher() (which now means the same thing, but a new call site
-- should still name the real check).
--
-- Apply manually in the Supabase SQL editor, after 0075.

-- ===========================================================================
-- 1. Question bank -- one row per question, per role. Structure only: this
--    table is intentionally left EMPTY by this migration. See the header.
-- ===========================================================================
create table if not exists public.coin_role_quiz_questions (
	id uuid primary key default gen_random_uuid(),
	role_id text not null references public.coin_role_definitions (id) on delete cascade,
	type text not null check (type in ('mc', 'written')),
	question_text text not null check (char_length(btrim(question_text)) between 1 and 1000),
	-- Display/answer order within the role. Unique per role so ordering is
	-- always unambiguous -- hand-editing this table means picking a free
	-- sequence value, the same discipline coin_categories' sort_order asks for.
	sequence integer not null check (sequence > 0),
	-- 'mc' only: a JSON array of 2-8 option strings, plus which index (0-based)
	-- is correct. 'written' questions carry neither.
	options jsonb,
	correct_option_index integer,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	check (
		(type = 'written' and options is null and correct_option_index is null)
		or (
			type = 'mc'
			and jsonb_typeof(options) = 'array'
			and jsonb_array_length(options) between 2 and 8
			and correct_option_index is not null
			and correct_option_index >= 0
			and correct_option_index < jsonb_array_length(options)
		)
	)
);

create unique index if not exists coin_role_quiz_questions_role_seq_unique
	on public.coin_role_quiz_questions (role_id, sequence);
create index if not exists coin_role_quiz_questions_role_idx
	on public.coin_role_quiz_questions (role_id, active, sequence);

revoke all on public.coin_role_quiz_questions from anon, authenticated;
grant select on public.coin_role_quiz_questions to authenticated;
alter table public.coin_role_quiz_questions enable row level security;

drop policy if exists "admins read coin role quiz questions" on public.coin_role_quiz_questions;
create policy "admins read coin role quiz questions"
	on public.coin_role_quiz_questions
	for select
	to authenticated
	using (public.is_admin());

-- No insert/update/delete policies: content is edited by hand in the SQL
-- editor (see the migration header) -- there is no client write path.

-- ===========================================================================
-- 2. Application answers -- one row per question per application, snapshot
--    at submission time. Replaces coin_role_applications.answers (dropped
--    below).
-- ===========================================================================
create table if not exists public.coin_role_application_answers (
	id uuid primary key default gen_random_uuid(),
	application_id uuid not null references public.coin_role_applications (id) on delete cascade,
	question_id uuid not null references public.coin_role_quiz_questions (id),
	question_type text not null check (question_type in ('mc', 'written')),
	sequence integer not null,
	question_text text not null,
	options jsonb,
	written_answer text,
	selected_option_index integer,
	correct_option_index integer,
	is_correct boolean,
	check (
		(
			question_type = 'written'
			and written_answer is not null
			and options is null
			and selected_option_index is null
			and correct_option_index is null
			and is_correct is null
		)
		or (
			question_type = 'mc'
			and written_answer is null
			and options is not null
			and selected_option_index is not null
			and correct_option_index is not null
			and is_correct is not null
		)
	)
);

create unique index if not exists coin_role_application_answers_app_question_unique
	on public.coin_role_application_answers (application_id, question_id);
create index if not exists coin_role_application_answers_app_idx
	on public.coin_role_application_answers (application_id, sequence);

revoke all on public.coin_role_application_answers from anon, authenticated;
grant select on public.coin_role_application_answers to authenticated;
alter table public.coin_role_application_answers enable row level security;

drop policy if exists "admins read coin role application answers" on public.coin_role_application_answers;
create policy "admins read coin role application answers"
	on public.coin_role_application_answers
	for select
	to authenticated
	using (public.is_admin());

-- No insert/update/delete policies: only coin_role_apply (SECURITY DEFINER,
-- below) writes these.

-- Drop the old freeform column -- see the migration header for why this is
-- a clean break rather than a data migration.
alter table public.coin_role_applications drop column if exists answers;

-- ===========================================================================
-- 3. Expiration on coin_role_holders, plus a per-role suggested duration
--    (a UI pre-fill convenience only -- see the migration header).
-- ===========================================================================
alter table public.coin_role_holders add column if not exists expires_at timestamptz;

alter table public.coin_role_definitions
	add column if not exists suggested_duration_days integer
	check (suggested_duration_days is null or suggested_duration_days > 0);

-- A reasonable starting default (roughly one semester) for the four seeded
-- roles -- same "proposed, always hand-editable, never enforced" status as
-- the ratio_is_default columns above it. Purely a client-side pre-fill; see
-- the migration header for why the server never applies this on its own.
update public.coin_role_definitions
	set suggested_duration_days = 90
	where id in ('shop_steward', 'quartermaster', 'safety_officer', 'lab_tech')
		and suggested_duration_days is null;

-- ===========================================================================
-- 4. Ratio capacity helpers -- now computed against the ACTIVE condition
--    (not revoked, not naturally expired), so a lapsed holder stops
--    counting the moment anyone asks, with no job needed to make that true.
-- ===========================================================================
create or replace function public._coin_role_active_holder_count(p_role_id text, p_section_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select count(*)::integer
	from public.coin_role_holders
	where role_id = p_role_id and section_id = p_section_id
		and revoked_at is null
		and (expires_at is null or expires_at > now());
$$;

revoke all on function public._coin_role_active_holder_count(text, text) from public;

-- Unchanged in shape from 0074; still reads the (now active-condition-aware)
-- helper above, so capacity previews stay honest for expired holders too.
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
-- 5. Reading the question bank -- admin-only (this whole surface is
--    is_admin()-gated, same as every other coin-desk read), used to render
--    the dynamic application form. Excludes inactive questions.
-- ===========================================================================
create or replace function public.coin_role_admin_list_role_questions(p_role_id text)
returns table (
	id uuid,
	role_id text,
	type text,
	question_text text,
	sequence integer,
	options jsonb,
	correct_option_index integer
)
language sql
stable
security definer
set search_path = ''
as $$
	select id, role_id, type, question_text, sequence, options, correct_option_index
	from public.coin_role_quiz_questions
	where public.is_admin()
		and role_id = p_role_id
		and active
	order by sequence;
$$;

revoke all on function public.coin_role_admin_list_role_questions(text) from public;
grant execute on function public.coin_role_admin_list_role_questions(text) to authenticated;

-- ===========================================================================
-- 6. Applying -- rewritten to answer against real questions. p_answers is
--    now [{question_id, written_answer?} | {question_id, selected_option_index?}, ...],
--    matched against every currently-active question for the role (a role
--    with zero questions configured yet -- see the header -- requires zero
--    answers, so applying still works before content is seeded). Every
--    answer is snapshotted into coin_role_application_answers, including
--    MC correctness, computed once, here, from the question's answer key at
--    submission time.
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
	v_id uuid;
	v_question public.coin_role_quiz_questions;
	v_elem jsonb;
	v_written text;
	v_selected integer;
	v_is_correct boolean;
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
	if jsonb_array_length(p_answers) > 50 then
		raise exception 'Too many answers (max 50).';
	end if;

	-- Active by the same computed condition everywhere else uses -- a
	-- student whose role lapsed naturally (never formally revoked) can
	-- apply again.
	if exists (
		select 1 from public.coin_role_holders
		where student_email = v_email and role_id = v_role.id
			and revoked_at is null and (expires_at is null or expires_at > now())
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_holds_role');
	end if;

	insert into public.coin_role_applications (student_email, role_id, section_id, submitted_by)
	values (v_email, v_role.id, v_section, public.current_user_email())
	returning id into v_id;

	for v_question in
		select * from public.coin_role_quiz_questions
		where role_id = v_role.id and active
		order by sequence
	loop
		select elem into v_elem
			from jsonb_array_elements(p_answers) elem
			where elem ->> 'question_id' = v_question.id::text
			limit 1;

		if v_question.type = 'written' then
			v_written := nullif(btrim(coalesce(v_elem ->> 'written_answer', '')), '');
			if v_written is null then
				raise exception 'Missing an answer for "%".', v_question.question_text;
			end if;
			insert into public.coin_role_application_answers
				(application_id, question_id, question_type, sequence, question_text, written_answer)
			values (v_id, v_question.id, 'written', v_question.sequence, v_question.question_text, left(v_written, 4000));
		else
			if v_elem is null or v_elem ->> 'selected_option_index' is null then
				raise exception 'Missing an answer for "%".', v_question.question_text;
			end if;
			v_selected := (v_elem ->> 'selected_option_index')::integer;
			if v_selected < 0 or v_selected >= jsonb_array_length(v_question.options) then
				raise exception 'Invalid option selected for "%".', v_question.question_text;
			end if;
			v_is_correct := (v_selected = v_question.correct_option_index);
			insert into public.coin_role_application_answers
				(application_id, question_id, question_type, sequence, question_text, options,
				 selected_option_index, correct_option_index, is_correct)
			values (v_id, v_question.id, 'mc', v_question.sequence, v_question.question_text, v_question.options,
				v_selected, v_question.correct_option_index, v_is_correct);
		end if;
	end loop;

	return jsonb_build_object('ok', true, 'application_id', v_id, 'section_id', v_section);
end;
$$;

revoke all on function public.coin_role_apply(text, text, jsonb) from public;
grant execute on function public.coin_role_apply(text, text, jsonb) to authenticated;

-- ===========================================================================
-- 7. Listing applications for review -- answers now aggregated from
--    coin_role_application_answers (the snapshot table), each element
--    carrying the question, the answer, and (for MC) the correctness
--    indicator. The output column stays named `answers jsonb` -- same shape
--    of information the caller needs, just built from the real table now
--    instead of read off the old freeform column.
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
		a.role_id, r.name as role_name, a.section_id,
		coalesce((
			select jsonb_agg(jsonb_build_object(
				'question_id', qa.question_id,
				'type', qa.question_type,
				'question', qa.question_text,
				'options', qa.options,
				'written_answer', qa.written_answer,
				'selected_option_index', qa.selected_option_index,
				'correct_option_index', qa.correct_option_index,
				'is_correct', qa.is_correct
			) order by qa.sequence)
			from public.coin_role_application_answers qa
			where qa.application_id = a.id
		), '[]'::jsonb) as answers,
		a.status,
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
-- 8. Reviewing -- gains p_expires_at. Adding a parameter changes this
--    function's real signature (types, not just defaults), so create or
--    replace would otherwise leave the old 3-argument version callable
--    alongside the new one as a second overload -- the exact "the naming
--    trap" lesson 0058 already documents for this codebase. Drop the old
--    overload explicitly first.
-- ===========================================================================
drop function if exists public.coin_role_admin_review(uuid, text, text);

create or replace function public.coin_role_admin_review(
	p_application_id uuid,
	p_decision text,
	p_note text default null,
	p_expires_at timestamptz default null
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

	-- Refuse only if a genuinely ACTIVE holder row already exists (not
	-- revoked, not naturally expired) -- a lapsed role can be re-approved.
	if exists (
		select 1 from public.coin_role_holders
		where student_email = v_app.student_email and role_id = v_app.role_id
			and revoked_at is null and (expires_at is null or expires_at > now())
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_holds_role');
	end if;

	-- Lazily close out any row that lapsed naturally but was never formally
	-- revoked -- see the migration header. The partial unique index below
	-- can't reference now() (a volatile expression isn't allowed in an
	-- index predicate), so it still treats an old, expired-but-open row as
	-- "the" active one for this (student, role) pair. This UPDATE is the
	-- one place a natural expiration is ever physically written, and it
	-- only runs because THIS approval needs the slot right now -- still no
	-- scheduled job, just a lazy write triggered by a real touch.
	update public.coin_role_holders
		set revoked_at = expires_at, revoked_by = 'system', revoke_reason = 'Closed automatically: role expired.'
		where student_email = v_app.student_email and role_id = v_app.role_id
			and revoked_at is null and expires_at is not null and expires_at <= now();

	insert into public.coin_role_holders (student_email, role_id, section_id, application_id, assigned_by, expires_at)
	values (v_app.student_email, v_app.role_id, v_app.section_id, v_app.id, public.current_user_email(), p_expires_at)
	returning id into v_holder_id;

	update public.coin_role_applications
		set status = 'approved', reviewed_by = public.current_user_email(), reviewed_at = now(), review_note = v_note
		where id = p_application_id;

	return jsonb_build_object(
		'ok', true, 'status', 'approved',
		'application_id', p_application_id, 'holder_id', v_holder_id, 'expires_at', p_expires_at
	);
end;
$$;

revoke all on function public.coin_role_admin_review(uuid, text, text, timestamptz) from public;
grant execute on function public.coin_role_admin_review(uuid, text, text, timestamptz) to authenticated;

-- ===========================================================================
-- 9. Current holders -- gains expires_at + a computed is_active flag. The
--    return column set changed (two new output columns), which -- like the
--    signature change above -- create or replace cannot apply in place for
--    a function with a RETURNS TABLE result; drop first.
-- ===========================================================================
drop function if exists public.coin_role_admin_list_holders(text, text, boolean);

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
	expires_at timestamptz,
	is_active boolean,
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
		h.expires_at,
		(h.revoked_at is null and (h.expires_at is null or h.expires_at > now())) as is_active,
		h.revoked_at, h.revoked_by, h.revoke_reason
	from public.coin_role_holders h
	join public.coin_role_definitions r on r.id = h.role_id
	left join public.profiles p on lower(btrim(coalesce(p.email, ''))) = h.student_email
	where public.is_admin()
		and (p_section_id is null or h.section_id = p_section_id)
		and (p_role_id is null or h.role_id = p_role_id)
		-- p_include_revoked=false shows only ACTIVE holders now -- neither
		-- revoked nor naturally expired. true still returns everything, so
		-- expired-but-unrevoked rows remain visible as history either way.
		and (p_include_revoked or (h.revoked_at is null and (h.expires_at is null or h.expires_at > now())))
	order by h.since desc;
$$;

revoke all on function public.coin_role_admin_list_holders(text, text, boolean) from public;
grant execute on function public.coin_role_admin_list_holders(text, text, boolean) to authenticated;

-- ===========================================================================
-- 10. Revoking -- unchanged in shape from 0074. A manual revoke still works
--     on a holder whose row has lapsed naturally but was never finalized
--     (revoked_at is still null in that case), which just lets an admin
--     explicitly stamp who closed it and why instead of leaving it to the
--     next lazy touch.
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
-- 11. Editing a holder's expiration -- independent of revoke, and works on
--     a holder in any state (active, expired, even already revoked -- an
--     admin correcting a mistaken date on an already-closed record is a
--     legitimate edit, not a special case worth blocking). p_expires_at
--     null clears it (no expiration).
-- ===========================================================================
create or replace function public.coin_role_admin_set_expiration(
	p_holder_id uuid,
	p_expires_at timestamptz default null
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
		raise exception 'Only site admins can edit a coin role''s expiration.';
	end if;

	select * into v_holder from public.coin_role_holders where id = p_holder_id;
	if v_holder.id is null then
		raise exception 'Unknown role holder.';
	end if;

	update public.coin_role_holders set expires_at = p_expires_at where id = p_holder_id;

	return jsonb_build_object('ok', true, 'holder_id', p_holder_id, 'expires_at', p_expires_at);
end;
$$;

revoke all on function public.coin_role_admin_set_expiration(uuid, timestamptz) from public;
grant execute on function public.coin_role_admin_set_expiration(uuid, timestamptz) to authenticated;

-- ===========================================================================
-- 12. Weekly Role Stipend bulk logging -- the holder roster it pays now
--     also uses the active condition, so a naturally-expired holder (never
--     formally revoked) stops being paid the moment their expiration passes,
--     same as they stop counting toward ratio capacity. Everything else
--     about this RPC (own nested coin_log_transaction call, structured
--     per-student results, `distinct` on email) is unchanged from 0074.
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
			and (expires_at is null or expires_at > now())
			and (p_role_id is null or role_id = p_role_id)
			and (p_section_id is null or section_id = p_section_id)
		order by student_email
	loop
		v_total := v_total + 1;
		begin
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
