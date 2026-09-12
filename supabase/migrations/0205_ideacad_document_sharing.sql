-- 0205_ideacad_document_sharing.sql
--
-- Apply manually in the Supabase SQL editor, after 0204.
-- DO NOT APPLY FROM THE SESSION CONTAINER. This environment cannot reach
-- production and must not try.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS
-- ---------------------------------------------------------------------------
--
-- Mr. Pina's decision 24, 2026-09-12, in his words: like Google Docs. A student
-- makes a document and it is PRIVATE BY DEFAULT. The owner may share it with
-- named classmates as VIEW-ONLY or as EDITOR. Mr. Pina and Mr. Cosso see and
-- edit everything by default, without asking and without a student granting
-- anything -- he called that "very convenient and powerful" and wants it kept.
--
-- docs/decisions/entries/24-ideacad-document-sharing.md is the record, and it
-- also records which half of that sentence this file does NOT deliver.
--
-- ---------------------------------------------------------------------------
-- WHAT IS ALREADY TRUE, MEASURED BEFORE ANYTHING WAS WRITTEN
-- ---------------------------------------------------------------------------
--
-- 0201 created ideacad_documents with student_email text not null and
-- unique(item_id, student_email), so a document already HAS exactly one owner
-- and private-by-default is the state it ships in.
--
-- THE INSTRUCTOR HALF OF THE READ PATH ALREADY WORKS AND IS NOT REBUILT HERE.
-- All three of 0201's read policies are
--
--   student_email = public.current_user_email()
--     or public._classroom_manages_item(item_id)
--
-- so a teacher of record already reads every document, concept and prediction
-- on an item they manage, with no grant and nothing to ask for. This file adds
-- a THIRD disjunct to each and changes neither of the existing two. The
-- teacher-of-record term is the same call to the same function, and
-- tests/db/ideacad-sharing-instructor-path.test.ts proves it still admits a
-- teacher of record and still refuses a teacher of a different section.
--
-- WHAT IS MISSING IS THE STUDENT-TO-STUDENT HALF, and that is all this adds.
--
-- ---------------------------------------------------------------------------
-- THE WRITE HALF OF "TEACHERS EDIT EVERYTHING" IS NOT IN THIS FILE, AND THAT
-- IS DELIBERATE RATHER THAN AN OVERSIGHT
-- ---------------------------------------------------------------------------
--
-- Measured on 0201: a teacher of record can READ every document and CANNOT
-- WRITE one. All seven student write functions resolve their row through
-- student_email = public.current_user_email() and there is no manager term in
-- any of them. So the "and edit" half of Mr. Pina's sentence is not true of the
-- code today and is not made true here.
--
-- It is a separate bundle rather than one more disjunct because a predicate is
-- not the missing piece. ideacad_open_document resolves a document through
-- _classroom_engine_student, which RAISES for anyone not enrolled in a section
-- the item is posted to -- so a teacher cannot open a document at all, and the
-- roster function is their whole read path. Widening only the write predicate
-- would give a teacher permission to save a concept they have no supported way
-- to open. Teacher edit needs a teacher-side document entry point, and that is
-- work with its own answer for what a teacher's edit means next to a student's.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE ADDS
-- ---------------------------------------------------------------------------
--
-- 1. public.ideacad_grants, one row per (document, grantee), carrying a role
--    of 'viewer' or 'editor'.
-- 2. Two private predicates over it, so "who may read this" and "who may write
--    this" each have ONE implementation.
-- 3. The three read policies widened by one disjunct each.
-- 4. The seven student write functions widened to admit an EDITOR grantee and
--    to keep refusing a VIEWER.
-- 5. Four new functions: share, unshare, read the grant list, open a document
--    somebody shared with you, and list what has been shared with you.
--
-- ideacad_roster is UNTOUCHED. It is the teacher view, it already enumerates
-- the enrolled population and left-joins each student's own document, and
-- sharing does not change who is on a roster.
--
-- ---------------------------------------------------------------------------
-- FOUR DECISIONS THAT ARE MINE AND NOT HIS, RECORDED AS MINE
-- ---------------------------------------------------------------------------
--
-- ONLY THE OWNER GRANTS. A grantee cannot re-share, at either role. He did not
-- say this. It is the conservative default: re-sharing makes the set of people
-- who can read a student's work unbounded by anything the owner did, and an
-- owner who wants a wider audience can grant it themselves. Reversing it later
-- is a widening, which is the cheap direction.
--
-- A GRANTEE MUST BE IN THE ITEM'S OWN ENROLLED POPULATION. He said "named
-- classmates"; the enforcement is mine. It makes "a stranger sees nothing"
-- structural instead of resting on nobody typing an outside address, and it
-- stops a student mailing their coursework to an arbitrary account by typing it
-- into a share box. The population is the same one ideacad_roster computes:
-- every active enrollment in every section the item is posted to.
--
-- A GRANTEE SEES ONLY THEIR OWN GRANT ROW. The owner and a teacher of record
-- read the whole grant list; a grantee reads the one row naming them. Who else
-- a student shared their work with is the owner's business, and a viewer does
-- not need the list to use their own access. This is a disclosure decision, so
-- it is written down rather than left to whichever policy got written first.
--
-- ONE ROW PER (DOCUMENT, GRANTEE), NOT PER (DOCUMENT, GRANTEE, ROLE). The key
-- is the pair, so one person holding BOTH viewer and editor on one document is
-- unrepresentable rather than resolved by an ordering somebody has to remember.
-- Re-sharing at a different role UPDATES the row.
--
-- ---------------------------------------------------------------------------
-- GRANTS FOLLOW 0166's SHAPE, WHICH IS WHY THIS SECTION EXISTS AT ALL
-- ---------------------------------------------------------------------------
--
-- This project bootstraps
--
--   alter default privileges in schema public
--     grant execute on functions to anon, authenticated, service_role;
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role;
--
-- so a new function arrives holding a DIRECT anon grant and a new table
-- arrives holding all seven privileges for both client roles. The SQL default
-- is one grant to PUBLIC, which is what "revoke from public" removes; it never
-- touches the direct entries. 0201 used the bare form and came out with ten
-- open functions and four open tables, closed by 0202 and 0203. So every
-- revoke below names public, anon and authenticated BY NAME.
--
-- THE SEVEN WIDENED FUNCTIONS ARE DELIBERATELY *NOT* IN THAT LIST, AND BOTH
-- HALVES OF THAT DECISION WERE MEASURED RATHER THAN ASSUMED.
--
-- The worry was that reaching them with create or replace would hand each one a
-- fresh anon grant and make 0205 a silent partial revert of 0202. Measured on
-- the embedded fixture, which carries this project's default privileges: a
-- function is anon-executable AT CREATE, FALSE after
-- `revoke all ... from public, anon, authenticated`, and STILL FALSE after a
-- create or replace of its body. A replace preserves the whole acl, the
-- authenticated grant included, so the seven were never at risk and re-revoking
-- them buys nothing. The FIVE NEW functions genuinely are at risk -- they
-- arrive anon-executable, which is 0201's defect exactly -- confirmed by
-- reverting the statements below to the bare `from public` form, where the
-- self-check refuses the apply and names those five and only those five.
--
-- A first draft re-revoked the seven anyway, as defence in depth. IT HAD A REAL
-- COST AND THE SUITE FOUND IT. `tests/db/ideacad-grants-anon-execute-surface.test.ts`
-- section E is a deliberate NEGATIVE CONTROL: it boots the chain MINUS 0202 and
-- asserts all TEN of 0201's functions are anon-executable there, so that
-- "0202 closes them" is a measured difference rather than a claim about a file.
-- Re-revoking seven of those ten from here closed them in that world too and
-- quietly falsified another migration's control. So this file touches the grant
-- surface of what it INTRODUCES and nothing else, which is the correct scope
-- anyway: the three 0201 functions this file never mentions
-- (ideacad_open_document, ideacad_roster, ideacad_set_editor) are 0202's, and a
-- migration that refused to apply because another migration's objects were
-- mis-granted would be overreaching -- it would block a legitimate apply order.
--
-- SECTION 7 IS SCOPED THE SAME WAY, for the same reason, and still REPORTS what
-- it is not responsible for: it hard-fails only on the objects this file owns
-- and raises a notice naming any other anon-executable ideacad function, so the
-- information is not lost. The durable whole-surface enforcement is that test,
-- which runs the entire chain on every suite run -- the same split between an
-- apply-time guard and a standing test that 0199's header describes.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENT, AND WHAT UNDOES IT
-- ---------------------------------------------------------------------------
--
-- Re-pasting is ordinary. Every create is "or replace" or guarded on the
-- catalog, every policy is dropped before it is created, and the table is
-- "if not exists" with its constraints added under a pg_constraint guard.
--
-- TO UNDO: drop the five new functions and the two new predicates, drop table
-- public.ideacad_grants, and restore the three read policies and the seven
-- write function bodies from 0201. Nothing in 0201 is dropped by this file and
-- no column of any existing table is altered, so the undo is a revert of this
-- file and not a repair.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT. Refuse rather than half-apply. 0201 is what this widens, so
--    its table and one of its write functions both have to be there, and the
--    two helpers the predicates below delegate to have to exist at the exact
--    signatures they are called at.
-- ---------------------------------------------------------------------------

do $preflight$
begin
	if to_regclass('public.ideacad_documents') is null then
		raise exception '0205 cannot apply: public.ideacad_documents is missing, so 0201 has not been applied.';
	end if;
	if to_regprocedure('public.ideacad_save_concept(uuid,jsonb,integer)') is null then
		raise exception '0205 cannot apply: public.ideacad_save_concept(uuid,jsonb,integer) is missing, so 0201 has not been applied.';
	end if;
	if to_regprocedure('public._classroom_manages_item(uuid)') is null then
		raise exception '0205 cannot apply: public._classroom_manages_item(uuid) is missing.';
	end if;
	if to_regprocedure('public.current_user_email()') is null then
		raise exception '0205 cannot apply: public.current_user_email() is missing.';
	end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. THE TABLE.
--
--    grantee_email carries the same normalized-form CHECK 0082 puts on
--    classroom_enrollments.student_email, so a row can only exist in the one
--    spelling current_user_email() returns. Without it "Alice@x" and "alice@x"
--    are two grants to one person and the predicate matches neither reliably.
--
--    granted_by is the owner's address at the time of the grant, kept as a
--    record rather than as a check: the owner column on the document is what
--    authorizes, and this says who actually pressed it.
-- ---------------------------------------------------------------------------

create table if not exists public.ideacad_grants(
	document_id uuid not null references public.ideacad_documents(id) on delete cascade,
	grantee_email text not null,
	role text not null,
	granted_by text not null,
	granted_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (document_id, grantee_email)
);

do $constraints$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_grants_role_check'
			and conrelid = 'public.ideacad_grants'::regclass
	) then
		alter table public.ideacad_grants
			add constraint ideacad_grants_role_check
			check (role in ('viewer', 'editor'));
	end if;
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_grants_grantee_email_normalized'
			and conrelid = 'public.ideacad_grants'::regclass
	) then
		alter table public.ideacad_grants
			add constraint ideacad_grants_grantee_email_normalized
			check (grantee_email = lower(btrim(grantee_email)) and grantee_email like '%@%');
	end if;
end
$constraints$;

create index if not exists ideacad_grants_grantee_idx
	on public.ideacad_grants (grantee_email, document_id);

drop trigger if exists ideacad_grants_touch on public.ideacad_grants;
create trigger ideacad_grants_touch
	before update on public.ideacad_grants
	for each row execute function public.touch_updated_at();

alter table public.ideacad_grants enable row level security;

-- ---------------------------------------------------------------------------
-- 2. THE PREDICATES. Two functions, and every gate below delegates to one of
--    them rather than restating the rule.
--
--    _ideacad_document_role answers the STUDENT-SIDE role only: 'owner',
--    'editor', 'viewer', or null. Manager-ness is NOT folded into it, and that
--    is the whole reason the instructor path can be described as unchanged:
--    every gate keeps asking _classroom_manages_item itself, exactly as 0201
--    wrote it, and a teacher's access never travels through the sharing table.
--
--    A person is at most one of these. The document's own owner column wins
--    over a grant row, because an owner cannot be demoted by a grant, and the
--    share function refuses to write a row naming the owner anyway -- so the
--    ordering here is a second refusal and not the only one.
-- ---------------------------------------------------------------------------

create or replace function public._ideacad_document_role(p_document_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $role$
	select case
		when v.email = '' then null
		when exists (
			select 1 from public.ideacad_documents d
			where d.id = p_document_id and d.student_email = v.email
		) then 'owner'
		else (
			select g.role from public.ideacad_grants g
			where g.document_id = p_document_id and g.grantee_email = v.email
		)
	end
	from (select public.current_user_email() as email) v;
$role$;

create or replace function public._ideacad_can_read_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $canread$
	select public._ideacad_document_role(p_document_id) is not null
		or exists (
			select 1 from public.ideacad_documents d
			where d.id = p_document_id
				and public._classroom_manages_item(d.item_id)
		);
$canread$;

create or replace function public._ideacad_manages_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $manages$
	select exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id
			and (
				d.student_email = public.current_user_email()
				or public._classroom_manages_item(d.item_id)
			)
	);
$manages$;

create or replace function public._ideacad_can_write_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $canwrite$
	select coalesce(public._ideacad_document_role(p_document_id) in ('owner', 'editor'), false);
$canwrite$;

-- ---------------------------------------------------------------------------
-- 3. THE READ POLICIES, widened by one disjunct each.
--
--    ideacad_editors is not touched: it carries the assignment's editor
--    configuration, is already readable by every reader of the item through
--    classroom_can_read_item, and has no owner to share.
--
--    EVERY CROSS-TABLE LOOKUP GOES THROUGH A SECURITY DEFINER PREDICATE, AND
--    THAT IS NOT TIDINESS -- IT IS WHAT STOPS THE POLICIES RECURSING.
--
--    The first draft of this file spelled the lookups out inline: the
--    ideacad_documents policy carried "exists (select ... from ideacad_grants)"
--    and the ideacad_grants policy carried "exists (select ... from
--    ideacad_documents)". Each policy then queried the other table, whose
--    policy queried back, and Postgres answered
--
--      infinite recursion detected in policy for relation "ideacad_documents"
--
--    on the FIRST read a grantee made. Measured, not reasoned about: it is what
--    tests/db/ideacad-sharing-viewer.test.ts reported before this was changed.
--    A SECURITY DEFINER predicate runs as the owner and so does not re-enter
--    RLS, which breaks the cycle -- and it is also this repo's standing rule
--    that visibility delegates to one function rather than restating who may
--    read what.
--
--    THE TWO EXISTING DISJUNCTS SURVIVE INSIDE THOSE PREDICATES, TERM FOR TERM.
--    _ideacad_can_read_document is
--
--      role is not null  (owner, or a grantee of either role)
--        or _classroom_manages_item(the document's item)
--
--    and _ideacad_document_role's 'owner' arm is student_email =
--    current_user_email(). So the teacher-of-record term is still the same call
--    to the same function 0201 made, one level down, which is what
--    tests/db/ideacad-sharing-instructor-path.test.ts asserts off pg_policies.
-- ---------------------------------------------------------------------------

drop policy if exists "owners and managers read ideacad documents" on public.ideacad_documents;
drop policy if exists "owners, grantees and managers read ideacad documents" on public.ideacad_documents;
create policy "owners, grantees and managers read ideacad documents"
	on public.ideacad_documents
	for select
	to authenticated
	using (
		public._ideacad_can_read_document(id)
	);

drop policy if exists "owners and managers read ideacad concepts" on public.ideacad_concepts;
drop policy if exists "owners, grantees and managers read ideacad concepts" on public.ideacad_concepts;
create policy "owners, grantees and managers read ideacad concepts"
	on public.ideacad_concepts
	for select
	to authenticated
	using (
		public._ideacad_can_read_document(document_id)
	);

drop policy if exists "owners and managers read ideacad predictions" on public.ideacad_predictions;
drop policy if exists "owners, grantees and managers read ideacad predictions" on public.ideacad_predictions;
create policy "owners, grantees and managers read ideacad predictions"
	on public.ideacad_predictions
	for select
	to authenticated
	using (
		public._ideacad_can_read_document(document_id)
	);

-- BOTH THE OLD NAME AND THE NEW ONE ARE DROPPED BEFORE EACH CREATE, and the
-- second drop is what makes a re-paste work. Dropping only 0201's name leaves
-- this file's own policy standing on a second apply, and the create then fails
-- with "policy ... already exists" -- which is a migration that works exactly
-- once, with the schema half-built, and is the state re-applying is supposed to
-- be ordinary out of.
-- tests/db/ideacad-sharing-grant-surface.test.ts applies the whole file twice
-- and is what found this.

-- The grant table's own read policy. The owner and a teacher of record see the
-- whole list; a grantee sees the one row naming them, per the disclosure
-- decision in this file's header. Written with the grantee term FIRST so the
-- common case is one index lookup on ideacad_grants_grantee_idx.
drop policy if exists "owners, grantees and managers read ideacad grants" on public.ideacad_grants;
create policy "owners, grantees and managers read ideacad grants"
	on public.ideacad_grants
	for select
	to authenticated
	using (
		grantee_email = public.current_user_email()
		or public._ideacad_manages_document(document_id)
	);


-- ---------------------------------------------------------------------------
-- 4. THE SEVEN STUDENT WRITE FUNCTIONS, widened to admit an EDITOR grantee.
--
--    EVERY SIGNATURE IS UNCHANGED, so there is no drop, no overload and no
--    deploy ordering: the widening is additive in the sense CLAUDE.md's deploy
--    rule names, the already-deployed client keeps calling the same shapes, and
--    this file and the client that uses sharing may land in either order.
--
--    EACH BODY IS 0201's BODY WITH ONE TERM CHANGED. The ownership resolution
--    "and d.student_email = public.current_user_email()" becomes a resolution
--    by id followed by a call to _ideacad_can_write_document. Everything else
--    -- the for-update locks, the stale-revision union, the keep-at-least-one
--    guard, the active-concept promotion, the prediction upsert -- is carried
--    over unchanged, and each was diffed against the 0201 source rather than
--    reconstructed from memory.
--
--    THE TWO REFUSALS ARE DIFFERENT SENTENCES ON PURPOSE.
--
--    A VIEWER reads "You have view-only access to this document." They already
--    know they can see it, so naming their role tells them nothing they did not
--    have, and it is the difference between a control that refuses and a
--    control that appears broken.
--
--    EVERYBODY ELSE reads 0201's original sentence, unchanged and verbatim. A
--    stranger and a nonexistent id therefore answer identically, so an id
--    cannot be probed -- which is the same rule the 404 convention states for
--    routes, one layer down.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_new_concept(p_document_id uuid, p_name text, p_features jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $newconcept$
declare
	d public.ideacad_documents;
	c public.ideacad_concepts;
begin
	select * into d from public.ideacad_documents where id = p_document_id;
	if not found or not public._ideacad_can_write_document(p_document_id) then
		if public._ideacad_document_role(p_document_id) = 'viewer' then
			raise exception 'You have view-only access to this document.';
		end if;
		raise exception 'You can only add a concept to your own document.';
	end if;
	insert into public.ideacad_concepts(document_id, name, position, features)
	select d.id, btrim(p_name), coalesce(max(position), 0) + 1, p_features
	from public.ideacad_concepts where document_id = d.id
	returning * into c;
	update public.ideacad_documents set active_concept_id = c.id where id = d.id;
	return to_jsonb(c);
end
$newconcept$;

create or replace function public.ideacad_save_concept(p_concept_id uuid, p_features jsonb, p_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $saveconcept$
declare
	c public.ideacad_concepts;
begin
	select c0.* into c
	from public.ideacad_concepts c0
	where c0.id = p_concept_id
	for update;
	if not found or not public._ideacad_can_write_document(c.document_id) then
		if public._ideacad_document_role(c.document_id) = 'viewer' then
			raise exception 'You have view-only access to this document.';
		end if;
		raise exception 'You can only save your own concept.';
	end if;
	if p_revision <= c.revision then
		return jsonb_build_object('ok', false, 'reason', 'stale', 'concept', to_jsonb(c));
	end if;
	update public.ideacad_concepts set features = p_features, revision = p_revision
	where id = p_concept_id
	returning * into c;
	return jsonb_build_object('ok', true, 'concept', to_jsonb(c));
end
$saveconcept$;

create or replace function public.ideacad_update_concept_meta(p_concept_id uuid, p_name text, p_position integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $updatemeta$
declare
	c public.ideacad_concepts;
	v_document uuid;
begin
	select document_id into v_document from public.ideacad_concepts where id = p_concept_id;
	if v_document is null or not public._ideacad_can_write_document(v_document) then
		if public._ideacad_document_role(v_document) = 'viewer' then
			raise exception 'You have view-only access to this document.';
		end if;
		raise exception 'You can only change your own concept.';
	end if;
	update public.ideacad_concepts set name = btrim(p_name), position = p_position
	where id = p_concept_id
	returning * into c;
	return to_jsonb(c);
end
$updatemeta$;

create or replace function public.ideacad_delete_concept(p_concept_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $deleteconcept$
declare
	c public.ideacad_concepts;
	n integer;
	next_id uuid;
begin
	select c0.* into c
	from public.ideacad_concepts c0
	where c0.id = p_concept_id
	for update;
	if not found or not public._ideacad_can_write_document(c.document_id) then
		if public._ideacad_document_role(c.document_id) = 'viewer' then
			raise exception 'You have view-only access to this document.';
		end if;
		raise exception 'You can only delete your own concept.';
	end if;
	select count(*) into n from public.ideacad_concepts
	where document_id = c.document_id and deleted_at is null;
	if n <= 1 then
		raise exception 'Keep at least one concept.';
	end if;
	update public.ideacad_concepts set deleted_at = now() where id = p_concept_id;
	select id into next_id from public.ideacad_concepts
	where document_id = c.document_id and deleted_at is null
	order by position limit 1;
	update public.ideacad_documents set active_concept_id = next_id
	where id = c.document_id and active_concept_id = p_concept_id;
	return jsonb_build_object('ok', true, 'activeConceptId', next_id);
end
$deleteconcept$;

create or replace function public.ideacad_set_active(p_document_id uuid, p_concept_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $setactive$
begin
	if not public._ideacad_can_write_document(p_document_id) then
		if public._ideacad_document_role(p_document_id) = 'viewer' then
			raise exception 'You have view-only access to this document.';
		end if;
		raise exception 'Choose one of your live concepts.';
	end if;
	update public.ideacad_documents d set active_concept_id = p_concept_id
	where d.id = p_document_id
		and exists (
			select 1 from public.ideacad_concepts c
			where c.id = p_concept_id and c.document_id = d.id and c.deleted_at is null
		);
	if not found then
		raise exception 'Choose one of your live concepts.';
	end if;
	return jsonb_build_object('ok', true);
end
$setactive$;

create or replace function public.ideacad_set_prediction(p_document_id uuid, p_concept_id uuid, p_rationale text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $setprediction$
declare
	p public.ideacad_predictions;
begin
	if not public._ideacad_can_write_document(p_document_id) then
		if public._ideacad_document_role(p_document_id) = 'viewer' then
			raise exception 'You have view-only access to this document.';
		end if;
		raise exception 'Choose one of your live concepts.';
	end if;
	if not exists (
		select 1 from public.ideacad_documents d
		join public.ideacad_concepts c on c.document_id = d.id
		where d.id = p_document_id
			and c.id = p_concept_id
			and c.deleted_at is null
	) then
		raise exception 'Choose one of your live concepts.';
	end if;
	insert into public.ideacad_predictions(document_id, predicted_concept_id, rationale, made_at)
	values (p_document_id, p_concept_id, btrim(p_rationale), now())
	on conflict (document_id) do update
		set predicted_concept_id = excluded.predicted_concept_id,
			rationale = excluded.rationale,
			made_at = excluded.made_at
	returning * into p;
	return to_jsonb(p);
end
$setprediction$;

create or replace function public.ideacad_commit_concept(p_concept_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $commitconcept$
declare
	c public.ideacad_concepts;
	v_document uuid;
begin
	select document_id into v_document from public.ideacad_concepts where id = p_concept_id;
	if v_document is null or not public._ideacad_can_write_document(v_document) then
		if public._ideacad_document_role(v_document) = 'viewer' then
			raise exception 'You have view-only access to this document.';
		end if;
		raise exception 'You can only commit your own concept.';
	end if;
	update public.ideacad_concepts set committed_at = now()
	where id = p_concept_id
	returning * into c;
	return to_jsonb(c);
end
$commitconcept$;

-- ---------------------------------------------------------------------------
-- 5. THE SHARING FUNCTIONS.
--
--    Every one of them takes NO identity parameter. The caller is
--    current_user_email(), so "can only act as themselves" is a property of the
--    signature rather than a check that could be got wrong -- which is the
--    write-path rule this repo already applies to every student-facing RPC.
--
--    THE GRANTEE POPULATION IS THE ITEM'S OWN, and it is computed here exactly
--    as ideacad_roster computes it: distinct active enrollments across every
--    section the item is posted to. That is the definition of "classmate" this
--    feature uses, and it is the reason a stranger cannot be granted anything
--    rather than merely being unlikely to be.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_share_document(
	p_document_id uuid,
	p_grantee_email text,
	p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $share$
declare
	d public.ideacad_documents;
	v_owner text := public.current_user_email();
	v_grantee text := lower(btrim(coalesce(p_grantee_email, '')));
	g public.ideacad_grants;
begin
	if coalesce(v_owner, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	-- ONLY THE OWNER GRANTS. A teacher of record is not offered this either:
	-- they already read everything, and a teacher sharing a student's work with
	-- another student is a decision nobody has made.
	select * into d from public.ideacad_documents
	where id = p_document_id and student_email = v_owner;
	if not found then
		raise exception 'You can only share your own document.';
	end if;
	if p_role is null or p_role not in ('viewer', 'editor') then
		raise exception 'Share as a viewer or as an editor.';
	end if;
	if v_grantee = '' or v_grantee not like '%@%' then
		raise exception 'Enter the school email address of the classmate you are sharing with.';
	end if;
	if v_grantee = v_owner then
		raise exception 'This document is already yours.';
	end if;
	if not exists (
		select 1
		from public.classroom_postings cp
		join public.classroom_enrollments ce on ce.section_id = cp.section_id
		where cp.item_id = d.item_id
			and ce.student_email = v_grantee
			and ce.active
	) then
		raise exception 'You can only share this with a classmate in this class.';
	end if;
	insert into public.ideacad_grants(document_id, grantee_email, role, granted_by)
	values (d.id, v_grantee, p_role, v_owner)
	on conflict (document_id, grantee_email) do update
		set role = excluded.role,
			granted_by = excluded.granted_by
	returning * into g;
	return to_jsonb(g);
end
$share$;

create or replace function public.ideacad_unshare_document(
	p_document_id uuid,
	p_grantee_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $unshare$
declare
	v_owner text := public.current_user_email();
	v_grantee text := lower(btrim(coalesce(p_grantee_email, '')));
	v_removed integer;
begin
	if coalesce(v_owner, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if not exists (
		select 1 from public.ideacad_documents
		where id = p_document_id and student_email = v_owner
	) then
		raise exception 'You can only change sharing on your own document.';
	end if;
	delete from public.ideacad_grants
	where document_id = p_document_id and grantee_email = v_grantee;
	get diagnostics v_removed = row_count;
	-- Removing a grant that is not there is not an error. The owner asked for
	-- this person not to have access and they do not have access.
	return jsonb_build_object('ok', true, 'removed', v_removed);
end
$unshare$;

create or replace function public.ideacad_document_grants(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $grants$
declare
	v_email text := public.current_user_email();
	v_owner boolean;
	v_manager boolean;
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select d.student_email = v_email, public._classroom_manages_item(d.item_id)
	into v_owner, v_manager
	from public.ideacad_documents d where d.id = p_document_id;
	-- A nonexistent document and one that is not yours answer identically, so
	-- an id cannot be probed.
	if not coalesce(v_owner, false) and not coalesce(v_manager, false) then
		raise exception 'You can only read sharing on your own document.';
	end if;
	return (
		select coalesce(jsonb_agg(jsonb_build_object(
			'granteeEmail', g.grantee_email,
			'role', g.role,
			'grantedBy', g.granted_by,
			'grantedAt', g.granted_at
		) order by g.grantee_email), '[]')
		from public.ideacad_grants g where g.document_id = p_document_id
	);
end
$grants$;

-- Opening a document somebody shared with you.
--
-- ideacad_open_document CANNOT serve this and must not be taught to. It takes
-- an ITEM and resolves the caller's OWN document through
-- _classroom_engine_student, creating the document and seeding Concept 1 if
-- they are absent. A grantee's access is to somebody else's document, so the
-- lookup key is different (a document id, not an item id) and the creation is
-- wrong: a viewer must not mint rows in a document they cannot write, and an
-- owner who has not opened theirs yet has nothing for a classmate to read.
--
-- So this function NEVER WRITES. It returns the same payload shape as
-- ideacad_open_document plus the caller's own role, which is what lets a client
-- render a read-only surface without asking a second question.
create or replace function public.ideacad_open_shared_document(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $openshared$
declare
	d public.ideacad_documents;
	v_role text;
	v_manager boolean := false;
	cfg jsonb;
begin
	if coalesce(public.current_user_email(), '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id;
	v_role := public._ideacad_document_role(p_document_id);
	if found then
		v_manager := public._classroom_manages_item(d.item_id);
	end if;
	if v_role is null and not v_manager then
		raise exception 'That document does not exist.';
	end if;
	select config into cfg from public.ideacad_editors where item_id = d.item_id;
	return jsonb_build_object(
		'document', to_jsonb(d),
		'concepts', (
			select coalesce(jsonb_agg(to_jsonb(x) order by x.position), '[]')
			from public.ideacad_concepts x
			where x.document_id = d.id and x.deleted_at is null
		),
		'prediction', (
			select to_jsonb(p) from public.ideacad_predictions p where p.document_id = d.id
		),
		'config', cfg,
		'role', coalesce(v_role, 'manager'),
		'canWrite', coalesce(v_role in ('owner', 'editor'), false)
	);
end
$openshared$;

-- What has been shared WITH the caller on one item. This is the grantee's own
-- entry point: they have no way to learn a document id otherwise, because the
-- roster is teacher-only and a classmate's document is not on any surface they
-- can already read.
--
-- IT READS THE GRANT TABLE FOR THE CALLER ONLY, by construction: the where
-- clause is their own address, so there is no parameter through which another
-- person's shares could be requested.
create or replace function public.ideacad_shared_with_me(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $sharedwithme$
declare
	v_email text := public.current_user_email();
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	return (
		select coalesce(jsonb_agg(jsonb_build_object(
			'documentId', d.id,
			'ownerEmail', d.student_email,
			'role', g.role,
			'grantedAt', g.granted_at,
			'updatedAt', d.updated_at
		) order by d.student_email), '[]')
		from public.ideacad_grants g
		join public.ideacad_documents d on d.id = g.document_id
		where g.grantee_email = v_email
			and d.item_id = p_item_id
	);
end
$sharedwithme$;

-- ---------------------------------------------------------------------------
-- 6. THE GRANTS, in 0166's shape.
--
--    Every revoke names public, anon AND authenticated. The bare "from public"
--    form is what left 0201 with ten anon-executable functions, because this
--    project's default privileges write a DIRECT anon grant into every new
--    function's acl that removing the PUBLIC entry never touches.
--
--    THE SEVEN WIDENED FUNCTIONS ARE IN THE LIST even though 0202 already
--    closed them, because section 4 reached them with create or replace and
--    that is exactly the case where a fresh anon grant can reappear. Leaving
--    them out would make this file a silent partial revert of 0202.
--
--    service_role is granted back on the functions for 0166's stated reason:
--    it is the one role 0137 never touches, and after a blanket revoke it
--    should still hold what it held. It is NOT granted on the table, matching
--    0202's own choice for the four ideacad tables.
--
--    TWO OF THE FOUR PRIVATE PREDICATES ARE GRANTED TO authenticated, AND THAT
--    IS FORCED RATHER THAN CHOSEN. A function named inside an RLS policy is
--    evaluated as the QUERYING role, so without the grant the whole read breaks
--    with "permission denied for function" -- 0109's lesson about
--    classroom_can_read_item. _ideacad_can_read_document and
--    _ideacad_manages_document are named in the four policies in section 3, so
--    they hold it; _ideacad_document_role and _ideacad_can_write_document are
--    reached only from SECURITY DEFINER bodies, as the owner, so they do not.
-- ---------------------------------------------------------------------------

revoke all on function
	public._ideacad_document_role(uuid),
	public._ideacad_can_read_document(uuid),
	public._ideacad_can_write_document(uuid),
	public._ideacad_manages_document(uuid)
	from public, anon, authenticated;

-- Named inside the four policies in section 3, so authenticated MUST hold
-- EXECUTE or every read of these tables fails with "permission denied for
-- function" instead of returning the caller's own rows.
grant execute on function
	public._ideacad_can_read_document(uuid),
	public._ideacad_manages_document(uuid)
	to authenticated, service_role;

-- Reached only from SECURITY DEFINER bodies, as the owner. No client role needs
-- them, so no client role gets them.
grant execute on function
	public._ideacad_document_role(uuid),
	public._ideacad_can_write_document(uuid)
	to service_role;

revoke all on function
	public.ideacad_share_document(uuid,text,text),
	public.ideacad_unshare_document(uuid,text),
	public.ideacad_document_grants(uuid),
	public.ideacad_open_shared_document(uuid),
	public.ideacad_shared_with_me(uuid)
	from public, anon, authenticated;

grant execute on function
	public.ideacad_share_document(uuid,text,text),
	public.ideacad_unshare_document(uuid,text),
	public.ideacad_document_grants(uuid),
	public.ideacad_open_shared_document(uuid),
	public.ideacad_shared_with_me(uuid)
	to authenticated, service_role;

-- The table. SELECT for authenticated is what makes the RLS policy above mean
-- "your own grant row, or the list on your own document"; everything else both
-- client roles hold here arrived by inheritance and no migration asked for it.
-- RLS covers none of TRUNCATE, REFERENCES or TRIGGER, which is why the revoke
-- has to be explicit rather than left to the policy.
revoke all on table public.ideacad_grants from public, anon, authenticated;
grant select on table public.ideacad_grants to authenticated;

-- ---------------------------------------------------------------------------
-- 7. THE SELF-CHECK. Read the catalog back rather than trust that the
--    statements above ran. It raises, so a partial apply cannot look like a
--    clean one and the whole file rolls back.
--
--    IT SWEEPS BY NAME PREFIX, not by section 6's lists, so a function those
--    statements failed to name -- including one a later migration adds -- is
--    caught here rather than passing because the list was short.
--
--    THE POSITIVE CONTROL IS THE POINT OF THE LAST BLOCK. A sweep that found
--    nothing because it was looking in the wrong place reports exactly what a
--    clean database reports. app_short_link_target is granted to anon on
--    purpose (0137 keeps it: printed handouts resolve before any session
--    exists), so if that read comes back false the instrument is broken and
--    every assertion above it is worthless.
-- ---------------------------------------------------------------------------

do $checks$
declare
	r record;
	v_total integer := 0;
	v_bad_anon text[] := '{}';
	v_bad_authed text[] := '{}';
	v_private text[] := '{}';
	v_foreign_anon text[] := '{}';
	-- The objects THIS FILE owns: the five new RPCs and the four predicates.
	-- Everything else matching the prefix belongs to 0201 and 0202, is reported
	-- rather than refused, and is why this array exists instead of a bare sweep.
	v_mine text[] := array[
		'ideacad_share_document', 'ideacad_unshare_document', 'ideacad_document_grants',
		'ideacad_open_shared_document', 'ideacad_shared_with_me',
		'_ideacad_document_role', '_ideacad_can_read_document',
		'_ideacad_can_write_document', '_ideacad_manages_document'
	];
	v_grants_anon boolean;
	v_grants_authed_write boolean;
	v_control boolean;
	v_policies integer;
begin
	for r in
		select p.oid::regprocedure::text as sig,
		       p.proname,
		       has_function_privilege('anon', p.oid, 'execute') as anon_x,
		       has_function_privilege('authenticated', p.oid, 'execute') as authed_x
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
		  and p.proname ~ '^_?ideacad'
		order by 1
	loop
		v_total := v_total + 1;
		if not (r.proname = any(v_mine)) then
			-- Not this file's object. Report an open one, never refuse over it.
			if r.anon_x then
				v_foreign_anon := v_foreign_anon || r.sig;
			end if;
			continue;
		end if;
		if r.anon_x then
			v_bad_anon := v_bad_anon || r.sig;
		end if;
		if r.proname like '\_%' then
			-- A private helper. Exactly two of them are named inside the section
			-- 3 policies and so MUST hold authenticated EXECUTE; the rest are
			-- reached only from SECURITY DEFINER bodies and must not.
			v_private := v_private || r.sig;
			if r.proname in ('_ideacad_can_read_document', '_ideacad_manages_document') then
				if not r.authed_x then
					v_bad_authed := v_bad_authed || r.sig;
				end if;
			elsif r.authed_x then
				v_bad_authed := v_bad_authed || r.sig;
			end if;
		elsif not r.authed_x then
			-- A public ideacad RPC that authenticated cannot call is a feature
			-- that is off, which is the failure this whole section exists for.
			v_bad_authed := v_bad_authed || r.sig;
		end if;
	end loop;

	if array_length(v_bad_anon, 1) > 0 then
		raise exception '0205: % of this file''s own function(s) are still executable by anon: % -- a revoke did not name the roles it needed to.',
			array_length(v_bad_anon, 1), array_to_string(v_bad_anon, ', ');
	end if;
	if array_length(v_bad_authed, 1) > 0 then
		raise exception '0205: % ideacad function(s) hold the wrong authenticated EXECUTE: %',
			array_length(v_bad_authed, 1), array_to_string(v_bad_authed, ', ');
	end if;

	select has_table_privilege('anon', 'public.ideacad_grants', 'select')
		or has_table_privilege('anon', 'public.ideacad_grants', 'insert')
		or has_table_privilege('anon', 'public.ideacad_grants', 'update')
		or has_table_privilege('anon', 'public.ideacad_grants', 'delete')
		or has_table_privilege('anon', 'public.ideacad_grants', 'truncate')
		or has_table_privilege('anon', 'public.ideacad_grants', 'references')
		or has_table_privilege('anon', 'public.ideacad_grants', 'trigger')
	into v_grants_anon;
	if v_grants_anon then
		raise exception '0205: anon still holds a privilege on public.ideacad_grants.';
	end if;

	select has_table_privilege('authenticated', 'public.ideacad_grants', 'insert')
		or has_table_privilege('authenticated', 'public.ideacad_grants', 'update')
		or has_table_privilege('authenticated', 'public.ideacad_grants', 'delete')
		or has_table_privilege('authenticated', 'public.ideacad_grants', 'truncate')
		or has_table_privilege('authenticated', 'public.ideacad_grants', 'references')
		or has_table_privilege('authenticated', 'public.ideacad_grants', 'trigger')
	into v_grants_authed_write;
	if v_grants_authed_write then
		raise exception '0205: authenticated holds a WRITE privilege on public.ideacad_grants -- every write must go through the RPCs.';
	end if;
	if not has_table_privilege('authenticated', 'public.ideacad_grants', 'select') then
		raise exception '0205: authenticated cannot SELECT public.ideacad_grants, so no grantee can see their own access.';
	end if;
	if not (select relrowsecurity from pg_class where oid = 'public.ideacad_grants'::regclass) then
		raise exception '0205: row level security is not enabled on public.ideacad_grants.';
	end if;

	-- The four widened read policies are present under their new names, and the
	-- three old names are gone rather than sitting alongside them.
	select count(*) into v_policies
	from pg_policies
	where schemaname = 'public'
		and tablename in ('ideacad_documents', 'ideacad_concepts', 'ideacad_predictions', 'ideacad_grants')
		and policyname like 'owners, grantees and managers read%';
	if v_policies <> 4 then
		raise exception '0205: expected 4 widened read policies, found %.', v_policies;
	end if;
	if exists (
		select 1 from pg_policies
		where schemaname = 'public' and policyname like 'owners and managers read ideacad%'
	) then
		raise exception '0205: a pre-0205 read policy is still present beside its replacement.';
	end if;

	-- The policies are EXERCISED, not merely counted. A mutual recursion
	-- between the documents policy and the grants policy raises
	-- "infinite recursion detected in policy" on the first read rather than at
	-- create time, so counting four policies would not have caught the shape
	-- this file's first draft shipped. A select returning zero rows is enough:
	-- the planner still evaluates the policy expression.
	begin
		perform 1 from public.ideacad_documents limit 1;
		perform 1 from public.ideacad_concepts limit 1;
		perform 1 from public.ideacad_predictions limit 1;
		perform 1 from public.ideacad_grants limit 1;
	exception when others then
		raise exception '0205: reading the ideacad tables under the new policies failed with "%" -- if that is a recursion, a policy is querying a table whose own policy queries back.', SQLERRM;
	end;

	-- The positive control.
	v_control := has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute');
	if not v_control then
		raise exception '0205: the anon sweep cannot see app_short_link_target, which IS granted to anon on purpose -- the instrument is broken and every assertion above is worthless.';
	end if;

	raise notice '0205: % ideacad functions swept, % of them this file''s own (% private); none of ours executable by anon; ideacad_grants is RLS-enabled with SELECT-only for authenticated; 4 widened read policies in place and 0 pre-0205 policies left; the four policies read without recursing; anon control reads true.',
		v_total, array_length(v_mine, 1), coalesce(array_length(v_private, 1), 0);
	if array_length(v_foreign_anon, 1) > 0 then
		-- NOT a refusal: these are 0201's functions and 0202's to close. On a
		-- database carrying 0202 this is silent; on one without it, it names
		-- exactly what is still open rather than letting the apply hide it.
		raise notice '0205: FYI, % ideacad function(s) outside this file are executable by anon and are 0202''s to close: %',
			array_length(v_foreign_anon, 1), array_to_string(v_foreign_anon, ', ');
	end if;
end
$checks$;

commit;

-- ---------------------------------------------------------------------------
-- Verification query (run after applying):
-- ---------------------------------------------------------------------------

select 'table public.ideacad_grants' as object,
       to_regclass('public.ideacad_grants') is not null as ok
union all select 'function public.ideacad_share_document',
       to_regprocedure('public.ideacad_share_document(uuid,text,text)') is not null
union all select 'function public.ideacad_unshare_document',
       to_regprocedure('public.ideacad_unshare_document(uuid,text)') is not null
union all select 'function public.ideacad_document_grants',
       to_regprocedure('public.ideacad_document_grants(uuid)') is not null
union all select 'function public.ideacad_open_shared_document',
       to_regprocedure('public.ideacad_open_shared_document(uuid)') is not null
union all select 'function public.ideacad_shared_with_me',
       to_regprocedure('public.ideacad_shared_with_me(uuid)') is not null
union all select 'no ideacad function is anon-executable',
       not exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname ~ '^_?ideacad'
           and has_function_privilege('anon', p.oid, 'execute')
       )
union all select 'anon holds nothing on ideacad_grants',
       not has_table_privilege('anon', 'public.ideacad_grants', 'select')
union all select 'authenticated cannot write ideacad_grants',
       not has_table_privilege('authenticated', 'public.ideacad_grants', 'insert')
union all select '4 widened read policies',
       (select count(*) from pg_policies
        where schemaname = 'public'
          and policyname like 'owners, grantees and managers read%') = 4;
