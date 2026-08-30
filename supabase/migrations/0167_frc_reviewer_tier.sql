-- 0167_frc_reviewer_tier.sql
-- FRC Training: a REVIEWER tier -- an explicit allowlist that grants reading
-- student FRC progress, reading quiz attempt logs, reviewing modeling-gate
-- submissions and marking/unmarking unit completion, and nothing else.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS, AND WHAT 0067 ACTUALLY DECIDED
--
-- Every FRC teacher-facing gate (0039, 0040, 0041, 0042) was written against
-- `is_teacher()` before 0067 redefined that one function body to return
-- `is_admin()`. The comments in those files still read as though a teacher of
-- record had access; since 0067 they are all admin-only. The concrete
-- consequence: a Bosco Tech teacher with no `app_admins` row can see nothing
-- about any student's FRC progress and can approve no modeling-gate
-- submission. Five of the ten content-backed CAD units (MDM-4 through MDM-8)
-- are modeling gates that only a human reviewer can approve, so the top rank
-- is unreachable without a person in the loop five times -- and that person
-- can only be an admin.
--
-- 0067's narrowing was about BREADTH (role editing, the FSP/FRC interest
-- roster, every student's graded work, moderation, permanent deletion), not
-- about FRC training specifically. It could not separate "review an FRC gate"
-- from "edit anybody's role" because ~90 applied policies named one function
-- and redefining that function body was the only instrument available. FRC
-- gate review was collateral, not a target. That reason CONSTRAINS this file
-- rather than licensing it: the tier below may not reach one item on 0067's
-- list, and section 6 checks every gate it opens against that list and names
-- every gate it deliberately leaves shut.
--
-- `is_teacher()` IS NOT REDEFINED HERE AND MUST NEVER BE. It is called from
-- roughly thirty migration files; redefining it is exactly the 0067 trap and
-- would re-gate everything at once. This file is a PER-SITE re-gate: each of
-- the six live FRC sites is recreated from its latest applied definition with
-- `is_teacher()` replaced by `frc_can_review()` and nothing else changed.
--
-- ---------------------------------------------------------------------------
-- AN ALLOWLIST, NOT AN INFERENCE -- 0155's shape, for 0155's two reasons:
--
--   1. 0067's narrowing was DELIBERATE. Inferring review rights from some
--      other fact about a person (teaching a section, holding the domain
--      role) would silently undo it for a population nobody enumerated.
--   2. An inferred predicate grants the capability as a SIDE EFFECT of
--      unrelated data. A capability must arrive because somebody granted it.
--
-- AND ONE REASON OF ITS OWN: the decided population is a mix of
-- @boscotech.edu and, in some cases, @boscotech.net addresses, added by hand
-- by the site owner. NO DOMAIN PREDICATE DESCRIBES THAT SET. The grant
-- function therefore admits BOTH school domains (a deliberate deviation from
-- 0155's @boscotech.edu-only rule, because the decided population includes
-- .net accounts) and still refuses an outside address: whatever else is true
-- of a reviewer, review over student work never leaves school accounts.
--
-- WHAT IS MIRRORED FROM `app_admins` / `gauntlet_authors` (0155),
-- deliberately, rather than invented:
--
--   * IDENTITY IS THE LOWERCASED EMAIL, not a user id, with the same
--     `email = lower(btrim(email)) and email like '%@%'` CHECK. An account
--     can be authorized before it has ever signed in.
--   * The same column set: `granted_by`, `granted_at`, `note` (<= 200 chars).
--   * SECURITY DEFINER + `set search_path = ''` on every function.
--   * THE ROSTER IS ADMIN-ONLY TO READ (staff emails) and has NO CLIENT
--     WRITE PATH at all: only the definer RPCs in section 3.
--   * Grant / revoke / roster RPCs shaped like `gauntlet_author_grant` /
--     `_revoke` / `_roster`, admin-gated (not owner-gated: reviewing does not
--     propagate -- a reviewer cannot grant reviewing -- and every capability
--     in this tier is one the granting admin already holds).
--   * `frc_can_review()` FOLDS IN `is_admin()`, which is what makes every
--     re-gate in section 5 a pure widening: an admin cannot lose a gate by
--     this file, and nobody writes `is_admin() or ...` six times.
--   * NO OWNER COLUMN and no seed: this tier cannot lock anyone out of
--     anything (an empty roster degrades to exactly the world 0067 left
--     behind), and no individual grant is on record in the repo -- the owner
--     adds reviewers by hand, through `frc_reviewer_grant` in the SQL editor.
--
-- ---------------------------------------------------------------------------
-- ONE NEW READ SURFACE, AND WHY IT IS A DISCLOSURE DECISION MADE ON PURPOSE.
--
-- `frc_review_queue()` (section 4) returns the pending gate submissions WITH
-- each submitter's name and email. Without it the tier cannot function: the
-- review console joins submissions to students, `profiles` is own-row-or-
-- admin, and a non-admin reviewer reading the queue directly would get bare
-- uuids -- a queue nobody can review. The projection is deliberately narrow:
--
--   * NO PARAMETERS. A function taking uuid[] would be an id-to-identity
--     bridge for ANY account (the school-directory trap the notebook bridge
--     rules exist to prevent). This one projects identity ONLY for students
--     who currently have a submission awaiting review, only to callers
--     passing `frc_can_review()`, and only name + email.
--   * A non-reviewer gets an EMPTY SET, not an error -- the same answer an
--     empty queue gives, so the surface cannot be probed.
--
-- ---------------------------------------------------------------------------
-- APPLY MANUALLY in the Supabase SQL editor, after 0166. Idempotent: every
-- statement is create-or-replace, `if not exists`, or drop-then-create.
-- Re-pasting it is ordinary and safe.
--
-- NOTE ON GRANTS (the 0137 rule): on a hosted Supabase project a NEW function
-- arrives with a direct EXECUTE grant to anon/authenticated/service_role from
-- the bootstrap default privileges, and `revoke ... from public` alone leaves
-- those standing. `create or replace` over an EXISTING function instead
-- PRESERVES its current ACL (the correction recorded 2026-08-30 in the
-- standards bundle: a replace does not re-mint the default grants). Every
-- revoke below names the roles anyway, because that makes the end state
-- IDENTICAL on any database this file lands on -- a live project where the two
-- 0041 functions already exist post-0137 (replace, ACL preserved, revoke a
-- no-op), and a fresh chain where 0137 never ran and 0041's bare `from
-- public` revoke left the bootstrap anon grant standing (replace preserves
-- exactly that grant, and the named revoke is what removes it).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The roster
-- ---------------------------------------------------------------------------

create table if not exists public.frc_reviewers (
	-- Lowercased. The account need not exist yet. Same CHECK as app_admins.
	email text primary key check (email = lower(btrim(email)) and email like '%@%'),
	-- Email of whoever granted it; every row is hand-granted, so no seed rows.
	granted_by text,
	granted_at timestamptz not null default now(),
	note text check (note is null or char_length(note) <= 200)
);

comment on table public.frc_reviewers is
	'FRC reviewer tier (0167). An explicit allowlist, mirroring app_admins/gauntlet_authors. Grants FRC Training progress reads, quiz-log reads, gate review and completion mark/unmark ONLY -- never is_admin(). Read frc_can_review(), never this table.';

-- ---------------------------------------------------------------------------
-- 2. The predicate. Admin folded in; the ONLY predicate (no email-scoped twin,
-- per 0138's own rule: nothing here asks about a third party).
-- ---------------------------------------------------------------------------

create or replace function public.frc_can_review()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when (select auth.uid()) is null then false
		-- Every admin reviews. This is what keeps section 5 a widening.
		when public.is_admin() then true
		else exists (
			select 1 from public.frc_reviewers r
			where r.email = public.current_user_email()
		)
	end;
$$;

comment on function public.frc_can_review() is
	'True for a site admin OR an address on the frc_reviewers allowlist (0167). FRC Training review only. NEVER a substitute for is_admin().';

revoke all on function public.frc_can_review()
	from public, anon, authenticated, service_role;
grant execute on function public.frc_can_review() to authenticated;

-- Reads are admin-only: this is a list of staff emails, app_admins' own
-- reason. Writes have no client path -- section 3 only.
revoke all on public.frc_reviewers from public, anon, authenticated, service_role;
grant select on public.frc_reviewers to authenticated;
alter table public.frc_reviewers enable row level security;

drop policy if exists "admins read the reviewer roster" on public.frc_reviewers;
create policy "admins read the reviewer roster"
	on public.frc_reviewers
	for select
	to authenticated
	using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Managing the roster. Admin-gated inside the function bodies.
-- ---------------------------------------------------------------------------

create or replace function public.frc_reviewer_grant(p_email text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_admin() then
		raise exception 'Only site admins can grant FRC review.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid email address.';
	end if;
	-- BOTH school domains, deliberately (see the header): the decided reviewer
	-- population is a mix of .edu and .net accounts, so 0155's .edu-only rule
	-- does not carry over. An outside address still never reviews student work.
	if v_email not like '%@boscotech.edu' and v_email not like '%@boscotech.net' then
		raise exception 'FRC review is limited to @boscotech.edu and @boscotech.net accounts (got "%").', v_email;
	end if;

	insert into public.frc_reviewers (email, granted_by, note)
	values (v_email, public.current_user_email(), nullif(btrim(coalesce(p_note, '')), ''))
	on conflict (email) do update
		set granted_by = excluded.granted_by,
			granted_at = now(),
			note = coalesce(excluded.note, public.frc_reviewers.note);

	return jsonb_build_object('email', v_email, 'granted', true);
end;
$$;

create or replace function public.frc_reviewer_revoke(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_admin() then
		raise exception 'Only site admins can revoke FRC review.';
	end if;
	-- An admin's reviewing comes from is_admin() inside frc_can_review(), never
	-- from a row, so emptying this table cannot remove anybody's admin access.
	delete from public.frc_reviewers where email = v_email;
	return jsonb_build_object('email', v_email, 'revoked', true);
end;
$$;

-- The roster, for an admin surface. The gate is a WHERE clause inside the
-- definer body, so a non-admin gets an empty set rather than an error, which
-- is the same answer an empty roster gives.
create or replace function public.frc_reviewer_roster()
returns table (email text, granted_by text, granted_at timestamptz, note text)
language sql
stable
security definer
set search_path = ''
as $$
	select r.email, r.granted_by, r.granted_at, r.note
	from public.frc_reviewers r
	where public.is_admin()
	order by r.email;
$$;

revoke all on function public.frc_reviewer_grant(text, text)
	from public, anon, authenticated, service_role;
revoke all on function public.frc_reviewer_revoke(text)
	from public, anon, authenticated, service_role;
revoke all on function public.frc_reviewer_roster()
	from public, anon, authenticated, service_role;
grant execute on function public.frc_reviewer_grant(text, text) to authenticated;
grant execute on function public.frc_reviewer_revoke(text) to authenticated;
grant execute on function public.frc_reviewer_roster() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The review queue projection (see the header for the disclosure
-- reasoning). Pending submissions with the submitter's name and email, oldest
-- first, for the /frc/review console. `status = 'submitted'` mirrors
-- loadPendingSubmissions in src/lib/frc/gate-submissions.ts.
-- ---------------------------------------------------------------------------

create or replace function public.frc_review_queue()
returns table (
	user_id uuid,
	unit_id text,
	link text,
	notes text,
	submitted_at timestamptz,
	student_name text,
	student_email text
)
language sql
stable
security definer
set search_path = ''
as $$
	select s.user_id, s.unit_id, s.link, s.notes, s.submitted_at,
		coalesce(
			nullif(btrim(coalesce(p.display_name, '')), ''),
			nullif(btrim(coalesce(p.full_name, '')), ''),
			p.email
		) as student_name,
		p.email as student_email
	from public.frc_gate_submissions s
	left join public.profiles p on p.id = s.user_id
	where public.frc_can_review()
		and s.status = 'submitted'
	order by s.submitted_at asc;
$$;

comment on function public.frc_review_queue() is
	'Pending FRC gate submissions with submitter name/email, for reviewers (0167). Empty set for a non-reviewer. Deliberately parameterless: identity is projected only for students with a submission awaiting review.';

revoke all on function public.frc_review_queue()
	from public, anon, authenticated, service_role;
grant execute on function public.frc_review_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. THE RE-GATE. Exactly six live sites, each recreated from its LATEST
-- applied definition with `is_teacher()` replaced by `frc_can_review()` and
-- nothing else changed. Section 6 is the census.
--
-- TWO 0039 SITES ARE DEAD AND ARE NOT RE-GATED: the "frc progress insert" and
-- "frc progress delete" policies were dropped by 0041, which also revoked
-- client writes on frc_user_progress entirely. Recreating them would restore
-- a write path 0041 deliberately closed.
--
-- NO SIGNATURE TRAP HERE: `frc_mark_complete` and `frc_unmark_complete` each
-- exist at exactly ONE signature, (uuid, text), defined only in 0041 -- swept
-- every migration file for other arities and found none, and the self-check
-- below asserts pg_proc holds exactly one row for each. `create or replace`
-- at the same signature is therefore the correct instrument, not a drop.
-- ---------------------------------------------------------------------------

-- 5a. 0039: teachers read all progress rows (the dashboard/review roster
-- read). The own-row select policy beside it is untouched.
drop policy if exists "frc progress select teacher" on public.frc_user_progress;
create policy "frc progress select teacher"
	on public.frc_user_progress
	for select
	to authenticated
	using (public.frc_can_review());

-- 5b. 0040: teachers read all quiz attempts (the attempt log; the sealed
-- answer-key column is still withheld by 0040's column-level grant -- this
-- widens WHICH ROWS are visible, never which columns).
drop policy if exists "frc quiz select teacher" on public.frc_quiz_attempts;
create policy "frc quiz select teacher"
	on public.frc_quiz_attempts
	for select
	to authenticated
	using (public.frc_can_review());

-- 5c/5d. 0041's two completion-override RPCs, transcribed verbatim with only
-- the predicate swapped. These are the ONLY write path to frc_user_progress
-- besides frc_quiz_grade's inline quiz-pass write, which is a student path
-- and is NOT touched by this file.

create or replace function public.frc_mark_complete(p_user_id uuid, p_unit_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		return jsonb_build_object('error', 'unauthorized');
	end if;
	if not public.frc_can_review() then
		return jsonb_build_object('error', 'forbidden');
	end if;

	insert into public.frc_user_progress (user_id, unit_id)
	values (p_user_id, p_unit_id)
	on conflict (user_id, unit_id) do nothing;

	return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.frc_unmark_complete(p_user_id uuid, p_unit_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		return jsonb_build_object('error', 'unauthorized');
	end if;
	if not public.frc_can_review() then
		return jsonb_build_object('error', 'forbidden');
	end if;

	delete from public.frc_user_progress
	where user_id = p_user_id and unit_id = p_unit_id;

	return jsonb_build_object('ok', true);
end;
$$;

-- The replace preserved whatever ACL each function had (see the header's
-- grants note); these named-role statements pin the end state regardless of
-- which history this database carries. 0041's bare `from public` form never
-- removed the bootstrap grants, which is what the 0137 rule exists to correct.
revoke all on function public.frc_mark_complete(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.frc_mark_complete(uuid, text) to authenticated;
revoke all on function public.frc_unmark_complete(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.frc_unmark_complete(uuid, text) to authenticated;

-- 5e. 0042: teachers read all gate submissions (the review queue's direct
-- table read; frc_review_queue above adds the identity join).
drop policy if exists "frc gate select teacher" on public.frc_gate_submissions;
create policy "frc gate select teacher"
	on public.frc_gate_submissions
	for select
	to authenticated
	using (public.frc_can_review());

-- 5f. 0042: teachers set status + feedback on any submission. The student
-- own-row insert/update policies beside it are untouched, so a student still
-- can never self-approve.
drop policy if exists "frc gate update teacher" on public.frc_gate_submissions;
create policy "frc gate update teacher"
	on public.frc_gate_submissions
	for update
	to authenticated
	using (public.frc_can_review())
	with check (public.frc_can_review());

-- ---------------------------------------------------------------------------
-- 6. THE CENSUS. Every `is_teacher()` site the word "frc" appears near, and
-- whether this tier passes it. The SHUT list is as load-bearing as the open
-- one: a tier that widens one gate it was not meant to widen is the defect
-- this section exists to prevent.
--
-- OPEN (section 5, six sites):
--   0039  "frc progress select teacher"      reading any student's completions
--   0040  "frc quiz select teacher"          reading the quiz attempt log
--   0041  frc_mark_complete(uuid, text)      recording a completion (approval)
--   0041  frc_unmark_complete(uuid, text)    correcting a completion
--   0042  "frc gate select teacher"          reading the submission queue
--   0042  "frc gate update teacher"          approve / needs_revision + feedback
--
-- SHUT, and why each one stays shut:
--
--   0046  "teachers read frc interest" on fsp_frc_interest
--         NOT FRC TRAINING. The FSP prospective-student interest roster
--         shares the name and the predicate by accident. It holds student
--         phone numbers and (since 0047) parent emails, and it is explicitly
--         on 0067's list of what the narrowing was FOR. Moving it onto an FRC
--         allowlist would widen access to family contact details for a
--         population nobody enumerated. It stays on is_teacher() (i.e. the
--         admin check), and the self-check below asserts it.
--
--   0039  "frc progress insert" / "frc progress delete"
--         DEAD, dropped by 0041 along with the client write grants. Not
--         recreated -- that would restore a write path deliberately closed.
--
--   0040/0041  frc_quiz_start / frc_quiz_grade
--         THE STUDENT PATH. Both are scoped to the caller's own auth.uid()
--         and gate nothing on is_teacher(); a reviewer starts and grades
--         their own quizzes like anybody else. Untouched, and the self-check
--         asserts neither picked up the new predicate.
--
--   The /dashboard surface itself
--         An APP gate, not a database one, and it stays admin-only: it
--         carries the role editor, the full student roster and three
--         moderation queues. The reviewer's surface is /frc/review, which
--         reads only what the gates above grant.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 7. Self-check. Reads the catalog back rather than trusting the statements
-- above: the ACL and pg_policy/pg_proc, not the verdict.
-- ---------------------------------------------------------------------------

do $chk$
declare
	v_anon boolean;
	v_auth boolean;
	v_n int;
	v_reviewers int;
begin
	-- The predicate is reachable by a signed-in caller and by nobody else.
	select has_function_privilege('anon', 'public.frc_can_review()', 'execute'),
		has_function_privilege('authenticated', 'public.frc_can_review()', 'execute')
		into v_anon, v_auth;
	if v_anon then
		raise exception '0167: frc_can_review() is executable by anon. The revoke did not name the roles (the 0137 rule).';
	end if;
	if not v_auth then
		raise exception '0167: frc_can_review() is NOT executable by authenticated; every gate below would fail closed for everyone.';
	end if;

	-- NO OVERLOADS: exactly one pg_proc row per re-created function. Two rows
	-- for either name is the signature trap and this file must not proceed
	-- past it silently.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname in ('frc_mark_complete', 'frc_unmark_complete');
	if v_n <> 2 then
		raise exception '0167: expected exactly 2 rows for frc_mark_complete + frc_unmark_complete in pg_proc, found % -- an overload survived and the wrong arity may still answer.', v_n;
	end if;

	-- The two recreated functions carry the new predicate and no longer name
	-- the old one.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('frc_mark_complete', 'frc_unmark_complete')
		and p.prosrc like '%frc_can_review()%'
		and p.prosrc not like '%is_teacher%';
	if v_n <> 2 then
		raise exception '0167: expected both completion RPCs re-gated onto frc_can_review() with is_teacher() gone, found % qualifying.', v_n;
	end if;

	-- And neither is executable by anon after its create-or-replace re-minted
	-- the default grants.
	if has_function_privilege('anon', 'public.frc_mark_complete(uuid, text)', 'execute')
		or has_function_privilege('anon', 'public.frc_unmark_complete(uuid, text)', 'execute') then
		raise exception '0167: a completion RPC is executable by anon -- the post-replace revoke did not land.';
	end if;

	-- The four re-created policies name the new predicate.
	select count(*) into v_n
	from pg_policy pol
	where pol.polname in ('frc progress select teacher', 'frc quiz select teacher',
			'frc gate select teacher', 'frc gate update teacher')
		and pg_get_expr(pol.polqual, pol.polrelid) like '%frc_can_review%';
	if v_n <> 4 then
		raise exception '0167: expected 4 policies carrying frc_can_review(), found %.', v_n;
	end if;
	-- ... and "frc gate update teacher" carries it on BOTH halves.
	select count(*) into v_n
	from pg_policy pol
	where pol.polname = 'frc gate update teacher'
		and pg_get_expr(pol.polwithcheck, pol.polrelid) like '%frc_can_review%';
	if v_n <> 1 then
		raise exception '0167: "frc gate update teacher" WITH CHECK does not carry frc_can_review().';
	end if;

	-- THE NEGATIVE HALF. fsp_frc_interest is the accidental namesake and must
	-- still read is_teacher() (the admin check): it holds family contact data.
	-- The `like ''%is_teacher%''` clause doubles as the positive control for
	-- the frc_can_review absence -- the expression genuinely was read.
	select count(*) into v_n
	from pg_policy pol
	where pol.polname = 'teachers read frc interest'
		and pg_get_expr(pol.polqual, pol.polrelid) like '%is_teacher%'
		and pg_get_expr(pol.polqual, pol.polrelid) not like '%frc_can_review%';
	if v_n <> 1 then
		raise exception '0167: the fsp_frc_interest read policy is not in its expected admin-only state -- it must NOT join the FRC reviewer tier (family contact data, 0067''s own list).';
	end if;

	-- And the student quiz path did not pick up the reviewer predicate.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('frc_quiz_start', 'frc_quiz_grade')
		and p.prosrc like '%frc_can_review%';
	if v_n <> 0 then
		raise exception '0167: % student quiz function(s) now name frc_can_review(). The tier has widened a gate it must not reach.', v_n;
	end if;

	select count(*) into v_reviewers from public.frc_reviewers;
	raise notice '0167 APPLIED: frc_reviewers holds % row(s) (no seed -- grant by hand via frc_reviewer_grant); 2 functions and 4 policies re-gated onto frc_can_review(); frc_review_queue() created; fsp_frc_interest and the student quiz path verified unchanged.', v_reviewers;
end;
$chk$;

-- ---------------------------------------------------------------------------
-- 8. GRANTING A REVIEWER (for whoever applies this). The RPCs check
-- `is_admin()`, which reads the session's JWT claims -- so in the SQL editor,
-- where there is no JWT, `frc_reviewer_grant` RAISES ('Only site admins...').
-- That is the same state 0155 shipped in and is acceptable here too. Two
-- working paths:
--
--   * From the SQL editor (the editor role owns the table and bypasses RLS),
--     write the row directly, normalized the way the RPC would:
--       insert into public.frc_reviewers (email, note)
--       values (lower(btrim('Someone@boscotech.net')), 'FRC mentor')
--       on conflict (email) do nothing;
--       delete from public.frc_reviewers where email = 'someone@boscotech.net';
--   * From the app, a signed-in ADMIN can call the RPCs through PostgREST
--     (supabase.rpc('frc_reviewer_grant', ...)); no UI surface calls them yet.
--
-- ---------------------------------------------------------------------------
-- 9. WHAT UNDOES THIS.
--
-- Fast revert: `delete from public.frc_reviewers;` empties the tier in one
-- statement -- frc_can_review() then answers true only for admins and all six
-- gates behave exactly as they did before this file, with every function and
-- policy left in place and re-grantable later.
--
-- Full revert, in this order:
--   1. Re-paste 0039's "frc progress select teacher" policy.
--   2. Re-paste 0040's "frc quiz select teacher" policy.
--   3. Re-paste 0041 section 2 (frc_mark_complete, frc_unmark_complete, and
--      their grants; the replace preserves this file's authenticated-only
--      ACL, so anon does not come back).
--   4. Re-paste 0042's "frc gate select teacher" and "frc gate update
--      teacher" policies.
-- Then `drop function public.frc_review_queue();`,
-- `drop function public.frc_can_review();`,
-- `drop function public.frc_reviewer_grant(text, text);`,
-- `drop function public.frc_reviewer_revoke(text);`,
-- `drop function public.frc_reviewer_roster();` and
-- `drop table public.frc_reviewers;` -- the policies must be re-pasted BEFORE
-- the function drops, because an applied policy records a real dependency on
-- every function its expression names and the drops would otherwise be
-- refused.
-- ---------------------------------------------------------------------------
