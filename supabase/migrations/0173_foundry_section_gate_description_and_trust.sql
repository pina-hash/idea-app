-- ---------------------------------------------------------------------------
-- 0173  Foundry: the per-section class gate, a required description at
--       publication, and trusted publishers.
--
-- THREE DECISIONS IN ONE FILE, because they are three schema changes and the
-- bundle that carries them was given ONE migration number. They share no
-- table and no predicate; the only thing they have in common is the feature.
--
-- WHAT UNDOES THIS FILE, stated before it is applied, per the verification
-- standard. There is no automatic down migration; this is what to paste:
--
--   drop function if exists public.foundry_trusted_roster();
--   drop function if exists public.foundry_trusted_revoke(text);
--   drop function if exists public.foundry_trusted_grant(text, text);
--   drop function if exists public.foundry_is_trusted();
--   drop function if exists public._foundry_is_trusted_email(text);
--   drop table if exists public.foundry_trusted_publishers;
--   drop function if exists public.foundry_manageable_sections();
--   drop function if exists public.foundry_set_section_open(uuid, boolean, text);
--   drop function if exists public.foundry_section_access();
--   alter table public.classroom_sections
--     drop column if exists foundry_closed_at,
--     drop column if exists foundry_closed_by,
--     drop column if exists foundry_closed_note;
--   alter table public.student_app_versions drop column if exists auto_published_at;
--   drop function if exists public.foundry_list_apps(uuid, boolean, boolean);
--   -- then re-paste 0132's foundry_list_apps and foundry_get_app, and 0130's
--   -- _foundry_published_version_check, foundry_submit_version and
--   -- foundry_review_version bodies over the top. Re-run 0137's sweep after,
--   -- because a create-or-replace under this project's default privileges
--   -- hands every one of them a fresh `anon` grant.
--
-- RE-APPLIABLE. Every statement here is `if not exists`, `create or replace`,
-- or a `drop ... if exists` ahead of a create. Re-pasting it is ordinary and
-- must stay harmless.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. DECISION 01 -- the per-section class gate.
--
-- WHY IT IS A COLUMN ON THE SECTION AND NOT A SCHEDULE. The answer given was
-- "per-section toggle, checked on the server". A schedule would need to know
-- the bell timetable, which this database does not hold and which changes
-- three times a year; a toggle is a thing an instructor flips when they want
-- the room working on something else, and flips back.
--
-- WHY A STAMP AND NOT A BOOLEAN. `foundry_closed_at` records WHEN and
-- `foundry_closed_by` records WHO, which a boolean cannot. It is exactly the
-- shape `student_apps.hidden_at` / `hidden_by` / `hidden_reason` already has
-- one table over, so there is one idea of "an adult turned this off" in the
-- feature rather than two. NULL is open, which makes every section that
-- existed before this migration open with no backfill.
-- ===========================================================================

alter table public.classroom_sections
	add column if not exists foundry_closed_at timestamptz;
alter table public.classroom_sections
	add column if not exists foundry_closed_by uuid references auth.users (id) on delete set null;
alter table public.classroom_sections
	add column if not exists foundry_closed_note text;

do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_sections_foundry_closed_note_len'
	) then
		alter table public.classroom_sections
			add constraint classroom_sections_foundry_closed_note_len
			check (
				foundry_closed_note is null
				or char_length(public._foundry_norm(foundry_closed_note)) between 1 and 200
			);
	end if;
end;
$$;

-- THE READ. "Is the Foundry open for the person asking?"
--
-- ANY CLOSED SECTION CLOSES IT, AND THAT IS THE DELIBERATE READING. The
-- alternative -- every section the student is in must be closed -- makes the
-- control useless for the case it exists for: a teacher closing it for their
-- own period would be overruled by any other period the student is enrolled
-- in, which is every student. So one instructor's close is enough. It is
-- reversible by that same instructor in one press, and the refusal names the
-- class it came from so a student knows who to ask.
--
-- AN ADMIN IS NEVER LOCKED OUT. Staff have to be able to open the surface to
-- see what a student is looking at, and the review queue lives here.
--
-- IT PROJECTS THE CLASS TITLE, NEVER THE TEACHER'S ADDRESS. "No public
-- response ever carries an email" -- and this one is not even public, but the
-- rule is about what a payload carries, not about who reads it.
create or replace function public.foundry_section_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_rows jsonb;
begin
	if v_email = '' then
		-- No session. The route guard is what actually answers this case; a
		-- signed-out caller reaching the function gets the open answer rather
		-- than an error, because "closed" here would mean "closed by a class"
		-- and no class has said anything about them.
		return jsonb_build_object('ok', true, 'open', true, 'closed', '[]'::jsonb);
	end if;

	if public.is_admin() then
		return jsonb_build_object('ok', true, 'open', true, 'closed', '[]'::jsonb);
	end if;

	select coalesce(
		jsonb_agg(
			jsonb_build_object(
				'section_id', s.id,
				'label', s.label,
				'course_title', c.title,
				'note', s.foundry_closed_note,
				'closed_at', s.foundry_closed_at
			)
			order by c.title, s.label
		),
		'[]'::jsonb
	)
	into v_rows
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	join public.classroom_courses c on c.id = s.course_id
	where e.student_email = v_email
		and e.active
		and s.foundry_closed_at is not null;

	return jsonb_build_object(
		'ok', true,
		'open', jsonb_array_length(v_rows) = 0,
		'closed', v_rows
	);
end;
$$;

revoke all on function public.foundry_section_access() from public, anon, authenticated, service_role;
grant execute on function public.foundry_section_access() to authenticated;

-- THE WRITE. A SECTION MANAGER, never an admin-only act: the whole point is
-- that the teacher standing in the room can close it without finding an
-- administrator. `classroom_manages_section` is the existing predicate and no
-- second statement of "who runs this class" is written here.
create or replace function public.foundry_set_section_open(
	p_section_id uuid,
	p_open boolean,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_note text := nullif(public._foundry_norm(p_note), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_open is null then
		raise exception 'Open or closed? That has to be one or the other.';
	end if;
	if not exists (select 1 from public.classroom_sections s where s.id = p_section_id) then
		-- "Not found" and "not yours" answer identically.
		raise exception 'That class does not exist.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	if p_open then
		update public.classroom_sections s
		set foundry_closed_at = null, foundry_closed_by = null, foundry_closed_note = null
		where s.id = p_section_id;
	else
		update public.classroom_sections s
		set foundry_closed_at = now(), foundry_closed_by = v_uid, foundry_closed_note = v_note
		where s.id = p_section_id;
	end if;

	return jsonb_build_object('ok', true, 'section_id', p_section_id, 'open', p_open);
end;
$$;

revoke all on function public.foundry_set_section_open(uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_set_section_open(uuid, boolean, text) to authenticated;

-- What the instructor's own control lists: the sections they manage and the
-- state of each. Null-safe for staff who manage nothing, which is an ordinary
-- answer and not an error.
create or replace function public.foundry_manageable_sections()
returns table (
	section_id uuid,
	label text,
	block text,
	course_title text,
	course_code text,
	foundry_closed_at timestamptz,
	foundry_closed_note text
)
language sql
security definer
stable
set search_path = ''
as $$
	select s.id, s.label, s.block, c.title, c.code, s.foundry_closed_at, s.foundry_closed_note
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where public.classroom_manages_section(s.id)
	order by c.title, s.label;
$$;

revoke all on function public.foundry_manageable_sections() from public, anon, authenticated, service_role;
grant execute on function public.foundry_manageable_sections() to authenticated;

-- ===========================================================================
-- 2. DECISION 05 -- a description is required to PUBLISH.
--
-- THE GATE IS THE TRIGGER, WHICH IS THE SCHEMA, and that is what the answer
-- asked for. A check inside one RPC would be skipped by the other two paths
-- that set `published_version_id` (the review approve, the rollback) and by
-- section 3's auto-publish. The trigger is the one place all four meet.
--
-- IT FIRES ONLY WHEN THE PUBLICATION ACTUALLY MOVES. An app already published
-- with no description keeps serving, keeps being editable, and keeps being
-- rollable to the same version; what it cannot do is publish a NEW version
-- until somebody writes one. A gate that fired on every write of the row
-- would make existing work uneditable, which is the silent narrowing this
-- repository has been bitten by before.
--
-- THE COUNT IS TAKEN AND REPORTED, NOT ACTED ON. Nobody's row is rewritten
-- and nothing is deleted: the notice at the end of this file says how many
-- live apps have no description, so the operator can go and ask those
-- students for one.
create or replace function public._foundry_published_version_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_status text;
	v_app uuid;
	v_moved boolean;
begin
	if new.published_version_id is null then
		return new;
	end if;

	select sv.status, sv.app_id into v_status, v_app
	from public.student_app_versions sv
	where sv.id = new.published_version_id;

	if not found then
		raise exception 'That version does not exist.';
	end if;
	-- The composite foreign key also refuses this. It is checked here too
	-- because the trigger fires first, so this is the message a caller sees.
	if v_app <> new.id then
		raise exception 'A published version must belong to the app publishing it.';
	end if;
	if v_status <> 'approved' then
		raise exception 'Only an approved version can be published (that one is %).', v_status;
	end if;

	-- 0173. The publication is MOVING when this is an insert, or when the
	-- column genuinely changed. Re-writing the same id is not a publication
	-- and must not be gated, or an app published before this migration
	-- becomes unrollable to the build it is already serving.
	v_moved := (tg_op = 'INSERT')
		or (new.published_version_id is distinct from old.published_version_id);

	if v_moved and public._foundry_norm(new.description) = '' then
		raise exception 'Write a description before publishing. It is what somebody reading the gallery sees before they open your app.';
	end if;

	return new;
end;
$$;

-- ===========================================================================
-- 3. DECISION 06 -- trusted publishers.
--
-- AN ALLOWLIST, NEVER AN INFERENCE, and it mirrors `app_admins` and
-- `gauntlet_authors` column for column: lowercased-email keyed so a student
-- can be trusted before they next sign in, `@boscotech.net` OR
-- `@boscotech.edu` accepted because the people being trusted are STUDENTS,
-- which is the one place this differs from the other two rosters.
--
-- IT IS STRICTLY NARROWER THAN ADMIN AND CANNOT WIDEN ANYTHING ELSE. Being
-- trusted changes exactly one thing: `foundry_submit_version` publishes
-- instead of queueing. It grants no read, no other write, and no reach at
-- anybody else's app.
-- ===========================================================================

create table if not exists public.foundry_trusted_publishers (
	email text primary key check (email = lower(btrim(email)) and email like '%@%'),
	granted_by text,
	granted_at timestamptz not null default now(),
	note text check (note is null or char_length(note) <= 200)
);

alter table public.foundry_trusted_publishers enable row level security;
-- NO POLICY AND NO GRANT. The roster is read through `foundry_trusted_roster`,
-- which is admin-gated inside itself; RLS enabled with no policy plus no
-- grant is two independent refusals, either of which alone denies a select.
revoke all on table public.foundry_trusted_publishers from public, anon, authenticated;

-- The email-scoped RULE, per 0138's shape: ask this form only about a THIRD
-- PARTY (an app's owner). For "may the caller do this", call the wrapper.
create or replace function public._foundry_is_trusted_email(p_email text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
	select case
		when coalesce(btrim(p_email), '') = '' then false
		else exists (
			select 1 from public.foundry_trusted_publishers t
			where t.email = lower(btrim(p_email))
		)
	end;
$$;

revoke all on function public._foundry_is_trusted_email(text) from public, anon, authenticated, service_role;
grant execute on function public._foundry_is_trusted_email(text) to authenticated;

-- The CALLER-scoped wrapper. Admins are NOT folded in: an admin publishing
-- their own app through the trusted path would skip the queue silently, and
-- an admin already has `foundry_review_version`, which is the deliberate act.
create or replace function public.foundry_is_trusted()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
	select public._foundry_is_trusted_email(public.current_user_email());
$$;

revoke all on function public.foundry_is_trusted() from public, anon, authenticated, service_role;
grant execute on function public.foundry_is_trusted() to authenticated;

create or replace function public.foundry_trusted_grant(p_email text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_note text := nullif(public._foundry_norm(p_note), '');
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can mark a student as a trusted publisher.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'That is not an email address.';
	end if;
	if v_email not like '%@boscotech.net' and v_email not like '%@boscotech.edu' then
		raise exception 'Trusted publishers are Bosco Tech accounts only.';
	end if;

	insert into public.foundry_trusted_publishers (email, granted_by, note)
	values (v_email, public.current_user_email(), v_note)
	on conflict (email) do update
		set granted_by = excluded.granted_by,
			granted_at = now(),
			note = excluded.note;

	return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;

revoke all on function public.foundry_trusted_grant(text, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_trusted_grant(text, text) to authenticated;

create or replace function public.foundry_trusted_revoke(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_gone integer;
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can change the trusted publisher list.';
	end if;

	with removed as (
		delete from public.foundry_trusted_publishers t
		where t.email = v_email
		returning 1
	)
	select count(*) into v_gone from removed;

	-- Revoking touches NOTHING already published. A build that went live
	-- while the student was trusted stays live; what changes is their next
	-- submission, which queues like anybody else's.
	return jsonb_build_object('ok', true, 'email', v_email, 'removed', v_gone);
end;
$$;

revoke all on function public.foundry_trusted_revoke(text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_trusted_revoke(text) to authenticated;

create or replace function public.foundry_trusted_roster()
returns table (email text, granted_by text, granted_at timestamptz, note text)
language sql
security definer
stable
set search_path = ''
as $$
	select t.email, t.granted_by, t.granted_at, t.note
	from public.foundry_trusted_publishers t
	where public.is_admin()
	order by t.email;
$$;

revoke all on function public.foundry_trusted_roster() from public, anon, authenticated, service_role;
grant execute on function public.foundry_trusted_roster() to authenticated;

-- WHAT MAKES A LIVE BUILD DISTINGUISHABLE FROM A REVIEWED ONE. Not a sixth
-- status: `approved` already means "this may be published" and inventing
-- `auto_approved` would fork every status check in the feature. A STAMP
-- beside the status answers the queue's question -- "was a person asked
-- before this went live" -- without any existing predicate changing meaning.
--
--   auto_published_at is null           -> it went through review
--   auto_published_at set, reviewed_at null -> LIVE, NOT YET REVIEWED
--   auto_published_at set, reviewed_at set  -> live, reviewed after the fact
alter table public.student_app_versions
	add column if not exists auto_published_at timestamptz;

create index if not exists student_app_versions_awaiting_review_idx
	on public.student_app_versions (app_id)
	where auto_published_at is not null and reviewed_at is null;

-- SUBMIT, widened. A trusted owner's draft goes straight to `approved` and the
-- app publishes it in the same transaction; everybody else's behaviour is
-- byte-for-byte what 0130 shipped.
--
-- THE DESCRIPTION GATE IS ASKED HERE TOO, AND ON PURPOSE. The trigger in
-- section 2 is the boundary, but for a trusted student it would fire at the
-- END of a submit that looked like it was working, and for everybody else it
-- would fire days later in front of a reviewer. Asking here means the person
-- who can fix it hears it while they are looking at it.
create or replace function public.foundry_submit_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_version public.student_app_versions%rowtype;
	v_app public.student_apps%rowtype;
	v_withdrawn uuid[] := '{}'::uuid[];
	v_trusted boolean;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select v.* into v_version from public.student_app_versions v where v.id = p_version_id for update;
	if not found then
		raise exception 'That version does not exist.';
	end if;

	select a.* into v_app from public.student_apps a where a.id = v_version.app_id for update;
	-- Authorization before state, and not-yours answers as not-found.
	if v_app.owner <> v_uid then
		raise exception 'That version does not exist.';
	end if;
	if v_app.hidden_at is not null then
		raise exception 'That app has been hidden by staff, so nothing can be submitted from it.';
	end if;
	if v_version.status <> 'draft' then
		raise exception 'Only a draft can be submitted (that one is %).', v_version.status;
	end if;

	-- 0173, decision 05. Said here so the author hears it, and enforced by the
	-- trigger regardless of who calls what.
	if public._foundry_norm(v_app.description) = '' then
		raise exception 'Write a description before submitting. It is what somebody reading the gallery sees before they open your app.';
	end if;

	with pulled as (
		update public.student_app_versions v
		set status = 'draft', reviewed_by = null, reviewed_at = null
		where v.app_id = v_version.app_id
			and v.status = 'submitted'
			and v.id <> p_version_id
		returning v.id
	)
	select coalesce(array_agg(pulled.id), '{}'::uuid[]) into v_withdrawn from pulled;

	-- 0173, decision 06. The owner's own trust, asked about the OWNER rather
	-- than about the caller -- they are the same person here, because the
	-- ownership check above already refused anybody else, and asking the
	-- third-party form is what keeps that true if a staff-submits path is
	-- ever added.
	v_trusted := public._foundry_is_trusted_email(
		public._notebook_email_for_user(v_app.owner)
	);

	if v_trusted then
		update public.student_app_versions v
		set status = 'approved',
			auto_published_at = now(),
			reviewed_by = null, reviewed_at = null,
			review_note = null, reject_reason = null
		where v.id = p_version_id;

		-- The trigger re-checks the description and the ownership on the way
		-- past; this is the only publication in the feature with no
		-- administrator anywhere in the call chain, which is the whole of
		-- what being trusted buys.
		update public.student_apps a
		set published_version_id = p_version_id, updated_at = now()
		where a.id = v_version.app_id;

		return jsonb_build_object(
			'ok', true, 'version_id', p_version_id, 'status', 'approved',
			'auto_published', true, 'withdrew', to_jsonb(v_withdrawn)
		);
	end if;

	update public.student_app_versions v
	set status = 'submitted', reviewed_by = null, reviewed_at = null,
		review_note = null, reject_reason = null
	where v.id = p_version_id;

	update public.student_apps a set updated_at = now() where a.id = v_version.app_id;

	return jsonb_build_object(
		'ok', true, 'version_id', p_version_id, 'status', 'submitted',
		'auto_published', false, 'withdrew', to_jsonb(v_withdrawn)
	);
end;
$$;

revoke all on function public.foundry_submit_version(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_submit_version(uuid) to authenticated;

-- REVIEW, widened to the after-the-fact case.
--
-- WHAT IS NEW is that a version which is ALREADY LIVE because its author is
-- trusted can still be reviewed: `approved` + `auto_published_at` set +
-- `reviewed_at` null is the one other state this accepts. Approving it only
-- stamps who looked; rejecting it TAKES IT DOWN.
--
-- THE ORDER OF THE TWO WRITES ON A REJECT IS LOAD-BEARING AND IS NOT
-- COSMETIC. `_foundry_version_status_check` refuses `approved -> rejected`
-- while that version is what the app publishes, so the app must be moved off
-- it FIRST. Written the other way round the whole rejection raises, and it
-- raises only for trusted authors, which is the case nobody tests by hand.
--
-- IT ROLLS BACK RATHER THAN BLANKING WHERE IT CAN. If the app has an older
-- approved version, that one goes live again -- a student whose new build was
-- rejected keeps the working one on the gallery. Only when there is no such
-- version does the app go unpublished, and 0130's "there is no null here"
-- stands as it was written: that rule is about `foundry_set_published_version`
-- giving an OWNER a quiet unpublish. This is an administrator's recorded
-- rejection, with reviewed_by, reviewed_at and a note on the row.
create or replace function public.foundry_review_version(
	p_version_id uuid,
	p_decision text,
	p_review_note text default null,
	p_reject_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_version public.student_app_versions%rowtype;
	v_decision text := lower(public._foundry_norm(p_decision));
	v_note text := nullif(public._foundry_norm(p_review_note), '');
	v_reason text := nullif(public._foundry_norm(p_reject_reason), '');
	v_status text;
	v_published boolean := false;
	v_after boolean := false;
	v_was_live boolean := false;
	v_fallback uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only an administrator can review a Foundry submission.';
	end if;
	if v_decision not in ('approve', 'reject') then
		raise exception 'A review is either "approve" or "reject".';
	end if;

	select v.* into v_version from public.student_app_versions v where v.id = p_version_id for update;
	if not found then
		raise exception 'That version does not exist.';
	end if;

	v_after := v_version.status = 'approved'
		and v_version.auto_published_at is not null
		and v_version.reviewed_at is null;

	if v_version.status <> 'submitted' and not v_after then
		raise exception 'Only a submitted version can be reviewed (that one is %).', v_version.status;
	end if;
	if v_decision = 'reject' and v_note is null then
		raise exception 'A rejection needs a note saying what to change.';
	end if;

	v_status := case when v_decision = 'approve' then 'approved' else 'rejected' end;

	select exists (
		select 1 from public.student_apps a
		where a.id = v_version.app_id and a.published_version_id = p_version_id
	) into v_was_live;

	if v_decision = 'reject' and v_was_live then
		-- Off the app FIRST -- see the header. The fallback is the newest
		-- OTHER approved version of the same app, and null when there is none.
		select v.id into v_fallback
		from public.student_app_versions v
		where v.app_id = v_version.app_id
			and v.id <> p_version_id
			and v.status = 'approved'
		order by v.ordinal desc
		limit 1;

		update public.student_apps a
		set published_version_id = v_fallback, updated_at = now()
		where a.id = v_version.app_id;
	end if;

	update public.student_app_versions v
	set status = v_status,
		reviewed_by = v_uid,
		reviewed_at = now(),
		review_note = v_note,
		reject_reason = case when v_decision = 'reject' then v_reason else null end
	where v.id = p_version_id;

	if v_decision = 'approve' then
		-- Already live and merely being signed off: nothing to publish.
		if not v_was_live then
			update public.student_apps a
			set published_version_id = p_version_id, updated_at = now()
			where a.id = v_version.app_id;
		else
			update public.student_apps a set updated_at = now() where a.id = v_version.app_id;
		end if;
		v_published := true;
	else
		update public.student_apps a set updated_at = now() where a.id = v_version.app_id;
	end if;

	return jsonb_build_object(
		'ok', true, 'version_id', p_version_id, 'status', v_status,
		'published', v_published,
		'after_the_fact', v_after,
		'rolled_back_to', v_fallback
	);
end;
$$;

revoke all on function public.foundry_review_version(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_review_version(uuid, text, text, text) to authenticated;


-- ===========================================================================
-- 4. The queue has to be able to SEE a live-unreviewed build.
--
-- `queueOrder` filters on `submitted_version_id`, which an auto-published
-- version by definition never has -- so without this the review queue would be
-- a door a trusted student's work never comes through, which is the exact
-- failure "the queue shows it as ALREADY LIVE" was asked for.
--
-- ADDING A COLUMN TO A `returns table` NEEDS A DROP. `create or replace`
-- cannot change a function's return type. The ARGUMENT LIST is untouched, so
-- PostgREST resolution is unaffected and this is not the signature trap: the
-- new column is additive and a deployed client that does not read it carries
-- on unchanged. There is no deploy ordering to get right.
--
-- BOTH FUNCTIONS BELOW ARE 0132'S TEXT WITH ONE INSERTION EACH, produced by
-- patching the source rather than by retyping it. That is not fussiness: the
-- first draft of this file was a reconstruction from memory and it silently
-- dropped `submitted_version_id`'s owner-or-admin gate, the
-- `auth.uid() is not null` clause and the `created_at` tiebreaker from
-- `foundry_list_apps`, and rewrote `foundry_get_app` into a different function
-- with a different signature. Diff against the source.
-- ===========================================================================

drop function if exists public.foundry_list_apps(uuid, boolean, boolean);

create or replace function public.foundry_list_apps(
	p_owner uuid default null,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns table (
	id uuid,
	slug text,
	title text,
	tagline text,
	description text,
	cover_path text,
	build_notes text,
	owner uuid,
	owner_display_name text,
	owner_full_name text,
	owner_class text,
	published_version_id uuid,
	published_ordinal integer,
	version_count integer,
	submitted_version_id uuid,
	-- 0173. The app's OWN published version when it was auto-published by a
	-- trusted author and nobody has reviewed it yet. Null otherwise, which is
	-- every app that went through the queue.
	live_unreviewed_version_id uuid,
	metadata_flagged_at timestamptz,
	hidden_at timestamptz,
	created_at timestamptz,
	updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		a.id, a.slug, a.title, a.tagline, a.description, a.cover_path, a.build_notes,
		a.owner, p.display_name, p.full_name,
		public._foundry_author_class(a.owner),
		a.published_version_id,
		(select pv.ordinal from public.student_app_versions pv where pv.id = a.published_version_id),
		(select count(*)::integer from public.student_app_versions v where v.app_id = a.id),
		-- The review trail is the owner's and the staff's. Everyone else gets
		-- null here rather than a hint that something is sitting in the queue.
		case
			when a.owner = (select auth.uid()) or public.is_admin() then (
				select sv.id from public.student_app_versions sv
				where sv.app_id = a.id and sv.status = 'submitted'
			)
		end,
		-- 0173, decision 06. GATED THE SAME WAY the submitted id above is, and
		-- for the same reason: whether a build is waiting to be looked at is
		-- the owner's business and staff's, and nobody else's.
		--
		-- STRICTLY THE APP'S OWN PUBLISHED VERSION. A superseded auto-published
		-- build is history rather than a queue item, and offering a reviewer a
		-- take-down control for something already taken down is a control whose
		-- only possible answer is a refusal.
		case
			when a.owner = (select auth.uid()) or public.is_admin() then (
				select sv.id from public.student_app_versions sv
				where sv.id = a.published_version_id
					and sv.auto_published_at is not null
					and sv.reviewed_at is null
			)
		end,
		a.metadata_flagged_at, a.hidden_at, a.created_at, a.updated_at
	from public.student_apps a
	left join public.profiles p on p.id = a.owner
	where (select auth.uid()) is not null
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		)
		and (p_owner is null or a.owner = p_owner)
	order by a.updated_at desc, a.created_at desc;
$$;

revoke all on function public.foundry_list_apps(uuid, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_list_apps(uuid, boolean, boolean) to authenticated;

-- `foundry_get_app` returns jsonb, so this one needs no drop: the key is added
-- inside the payload and the signature does not move.
create or replace function public.foundry_get_app(
	p_slug text,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_slug text := lower(public._foundry_norm(p_slug));
	v_app record;
	v_privileged boolean;
	v_versions jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select a.*, p.display_name as owner_display_name, p.full_name as owner_full_name
	into v_app
	from public.student_apps a
	left join public.profiles p on p.id = a.owner
	where a.slug = v_slug
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		);

	if not found then
		return null;
	end if;

	v_privileged := (v_app.owner = v_uid) or public.is_admin();

	select coalesce(jsonb_agg(rows.payload order by rows.ordinal desc), '[]'::jsonb)
	into v_versions
	from (
		select v.ordinal, jsonb_build_object(
			'id', v.id,
			'ordinal', v.ordinal,
			'status', v.status,
			'manifest', v.manifest,
			'byte_size', v.byte_size,
			'file_count', v.file_count,
			'created_at', v.created_at,
			-- The zip and the review trail are privileged. A reader of a
			-- published app gets the build, never the paperwork around it.
			'zip_path', case when v_privileged then v.zip_path end,
			'reviewed_by', case when v_privileged then v.reviewed_by end,
			'reviewed_at', case when v_privileged then v.reviewed_at end,
			-- 0173. When a trusted author's submit published this without a
			-- review. Privileged beside the rest of the paperwork: a reader of a
			-- published app gets the build, never how it got there.
			'auto_published_at', case when v_privileged then v.auto_published_at end,
			'review_note', case when v_privileged then v.review_note end,
			'reject_reason', case when v_privileged then v.reject_reason end
		) as payload
		from public.student_app_versions v
		where v.app_id = v_app.id
			and (v_privileged or v.id = v_app.published_version_id)
	) rows;

	return jsonb_build_object(
		'id', v_app.id,
		'slug', v_app.slug,
		'title', v_app.title,
		'tagline', v_app.tagline,
		'description', v_app.description,
		'cover_path', v_app.cover_path,
		'build_notes', v_app.build_notes,
		'owner', v_app.owner,
		'owner_display_name', v_app.owner_display_name,
		'owner_full_name', v_app.owner_full_name,
		'owner_class', public._foundry_author_class(v_app.owner),
		'published_version_id', v_app.published_version_id,
		'metadata_flagged_at', v_app.metadata_flagged_at,
		'hidden_at', v_app.hidden_at,
		'created_at', v_app.created_at,
		'updated_at', v_app.updated_at,
		'versions', v_versions
	);
end;
$$;

revoke all on function public.foundry_get_app(text, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_get_app(text, boolean, boolean) to authenticated;

-- ===========================================================================
-- 5. Report, so the operator can check these against the deployed app.
-- ===========================================================================

do $$
declare
	v_blank integer;
	v_sections integer;
	v_trusted integer;
begin
	select count(*) into v_blank
	from public.student_apps a
	where a.published_version_id is not null
		and public._foundry_norm(a.description) = '';

	select count(*) into v_sections from public.classroom_sections;
	select count(*) into v_trusted from public.foundry_trusted_publishers;

	raise notice '0173: % section(s) gained the Foundry gate, all OPEN (foundry_closed_at is null).', v_sections;
	raise notice '0173: trusted publisher roster created, % row(s).', v_trusted;
	raise notice '0173: % PUBLISHED app(s) currently have no description.', v_blank;
	if v_blank > 0 then
		raise notice '0173: those % keep serving and keep their published version. What they cannot do is publish a NEW version until somebody writes a description. NOTHING WAS REWRITTEN.', v_blank;
	end if;
end;
$$;
