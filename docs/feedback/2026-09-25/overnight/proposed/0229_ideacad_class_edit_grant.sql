-- 0229_ideacad_class_edit_grant.sql
--
-- ===========================================================================
-- STATUS: A PROPOSAL. IT IS NOT A MIGRATION YET AND NOTHING APPLIES IT.
-- ===========================================================================
-- Written overnight on 2026-09-25 (ledger 0298, Tier F) while the automatic
-- apply was blocked on a rejected database password. It lives under
-- docs/feedback/2026-09-25/overnight/proposed/ and NEVER under
-- supabase/migrations/ until a session promotes it (see PROMOTING IT, below).
-- tests/db/proposed-0229-class-edit-grant.test.ts applies it from THIS path
-- over the real chain through 0224, after seeding through the real RPCs, so
-- every claim below about behaviour was measured against a real Postgres
-- rather than argued.
--
-- ===========================================================================
-- WHAT THIS FILE DOES, IN ONE SENTENCE
-- ===========================================================================
--
-- A TEACHER CAN GIVE A WHOLE CLASS EDIT ACCESS TO ONE LIVE IDEACAD DOCUMENT,
-- and "the class" is read from the roster at the moment of every write, so a
-- student who joins the class later can edit at once and a student who is
-- deactivated stops being able to in the same statement that deactivates them.
--
-- That is decision 38 (docs/decisions/entries/38-ideacad-class-edit-grant.md),
-- Mr. Pina, 2026-09-25: "I want to be able to share an idea CAD part with many
-- other people very quickly ... my entire class ... they can all work on it."
-- It REVERSES two of decision 29's four narrowings (0214's header, (a) and (b))
-- for a NEW grant only: a class may now be an editor, and a live document may
-- now be shared with a class. 0214's archived-only VIEWER share is untouched.
--
-- ===========================================================================
-- WHAT WAS TRUE BEFORE THIS FILE, READ OFF THE MIGRATIONS
-- ===========================================================================
--
-- EVERY WRITE GATE IN IDEACAD ALREADY ASKS ONE FUNCTION WHO THE CALLER IS.
-- _ideacad_document_role (0205, widened by 0214) answers owner, editor, viewer
-- or null for the caller, and:
--
--   _ideacad_can_write_document (0205/0214/0216)  role in (owner, editor),
--       blade documents, not archived. The seven concept writers and
--       ideacad_apply_actions gate on it.
--   _ideacad_direct_can_write (0216, replaced by 0217)  role in (owner,
--       editor) or a manager, solid documents, not archived, not trashed.
--       ideacad_save_direct_document gates on it.
--   _ideacad_part_writer (0207)  owner shortcut, then its wide rung CALLS
--       _ideacad_can_write_document. ideacad_new_part_concept,
--       ideacad_set_part_active and ideacad_claim_part gate on it.
--   _ideacad_realtime_can_send (0211/0216)  either write gate above.
--   _ideacad_can_read_document and so _ideacad_realtime_can_read  role is
--       not null, or a manager.
--
-- 0214's class rung inside the role function returns the LITERAL 'viewer',
-- because ideacad_section_grants has no role column. So ONE new arm in the role
-- function reaches every write gate a personal editor reaches, and no write
-- gate needs to be rewritten. That is the whole of the widening. Section 6's
-- self-check reads each gate back out of the catalog and REFUSES to apply if
-- any of them has stopped delegating to the role, because that gate would then
-- silently keep refusing the class editor.
--
-- _ideacad_part_owner IS THE ONE WRITE PREDICATE THAT DOES NOT ASK THE ROLE,
-- and this file deliberately leaves it that way. See decision 2 below.
--
-- ===========================================================================
-- THE DECISIONS IN THIS FILE THAT ARE MINE AND NOT HIS, RECORDED AS MINE
-- ===========================================================================
--
-- 1. A NEW TABLE, ideacad_section_edit_grants, NOT A ROLE COLUMN. Decision 38's
--    own default. Every existing ideacad_section_grants row stays a viewer by
--    construction, 0214's three class-share functions are not touched, and
--    0214's own self-check ("ideacad_section_grants has a role column") keeps
--    passing. The new table has NO ROLE COLUMN EITHER: every row in it means
--    editor, so the meaning of a row is a property of which table it is in,
--    and the self-check asserts that absence.
--
-- 2. A CLASS EDITOR IS EXACTLY A PERSONAL EDITOR, AND _ideacad_part_owner IS
--    NOT WIDENED. Decision 38 says both write predicates "must admit the class
--    editor, or five assembly writes silently stay closed". Read against the
--    code that sentence is only half right, and the half that is wrong matters:
--
--      * The part-WRITER writes open by themselves. _ideacad_part_writer's wide
--        rung calls _ideacad_can_write_document, so a class editor can claim a
--        part, add a concept to a part and choose a part's active concept (the
--        three RPCs that gate on _ideacad_part_writer), and then keep the
--        heartbeat and release their own hold (which gate on the hold itself,
--        held_by = the caller, and on no predicate) -- five assembly writes, all
--        measured in the test -- with no change to that function.
--      * The four writes that gate on _ideacad_part_owner DIRECTLY
--        (ideacad_add_part, ideacad_update_part_meta, ideacad_assign_part, and
--        releasing SOMEBODY ELSE'S hold in ideacad_release_part) are the
--        ASSEMBLY OWNER'S, and they are closed to a personal editor today.
--        0207's header records why, in Mr. Pina's words: "THE ASSEMBLY OWNER
--        HAS FULL CONTROL over who is editing what". ideacad_assign_part
--        overrides a LIVE hold by design. Handing that to thirty students at
--        once would let any one of them take a part out of a classmate's hands
--        mid-edit, which is the work loss the checkout exists to prevent.
--
--    So the class editor gets what a personal editor gets, no more, and the
--    test asserts the two are refused the same four writes. Giving a class the
--    owner's powers is one disjunct in _ideacad_part_owner (and it changes what
--    isOwner means in ideacad_assembly); that is a decision for Mr. Pina, not a
--    default. The self-check asserts _ideacad_part_owner does not read the new
--    table, so the day somebody changes this it is a deliberate edit.
--
-- 3. A GRANT CAN ONLY ADD. A student holding a personal VIEWER grant who is
--    also in a class given edit access is an EDITOR. 0214's rule was "owner
--    beats a personal grant beats a class grant" and its reason was that
--    nobody may be silently demoted; the same reason, applied to a class
--    editor arm, says the higher role wins. The new arm sits between the owner
--    arm and 0214's coalesce, so for everybody NOT reached by a class edit
--    grant the function answers exactly as 0214's does -- the test compares
--    the answers for every seeded person and document before and after this
--    file, case for case.
--
-- 4. ONLY THE TEACHER OF THE TARGET CLASS (OR A SITE ADMIN) MAY GRANT, and only
--    on a document they own or manage (_ideacad_manages_document). A class-wide
--    edit grant reaches people the granter never named, including people who
--    join later, so it is a teacher's act on a class they are responsible for.
--    A STUDENT OWNER IS REFUSED: per-person sharing stays their tool. Widening
--    this later is the cheap direction.
--
-- 5. REVOKING IS OPEN TO THE DOCUMENT'S OWNER, ITS MANAGER, OR THE TEACHER OF
--    THE CLASS, and is never refused by a precondition that has since stopped
--    holding (an archived document, a section the item was unposted from).
--    Taking access away is the safe direction. 0214's unshare says the same.
--
-- 6. LIVE DOCUMENTS ONLY. An archived or trashed document is refused with a
--    structured reason. An edit grant on a document archived LATER is inert
--    for writing (every write gate carries the archive term, asserted below)
--    and still lets the class READ it, which is what 0214's archived class
--    share gives anyway. Restoring does not delete edit grants: 0214/0216/0217
--    restore paths delete ideacad_section_grants rows only, and they are not
--    touched here.
--
-- 7. A BLADE DOCUMENT'S CLASS MUST BE ONE ITS ASSIGNMENT IS POSTED TO, because
--    a blade document is discovered through ideacad_shared_with_me, which is
--    keyed on the item (0214's narrowing (c), kept). A DIRECT (solid) document
--    has no such rule: ideacad_direct_documents already lists every document
--    the caller can read, so a class edit grant is discoverable with no change.
--
-- 8. REFUSALS ARE STRUCTURED: {ok: false, reason, message}. Only a signed-out
--    call raises. A missing document and one the caller does not manage answer
--    identically ('not_found'), so a uuid cannot be probed.
--
-- ===========================================================================
-- REALTIME FOLLOWS WITH NO CHANGE
-- ===========================================================================
--
-- Send on ideacad-doc:<id> is _ideacad_realtime_can_send, which asks both
-- write gates; receive is _ideacad_realtime_can_read, which asks
-- _ideacad_can_read_document. Both reach the role, so a class editor may join
-- and broadcast on the document channel and a deactivated one may not, from
-- the same statement. The rule that no frame writes state is unchanged: a
-- frame is a hint to re-read, and every write still goes through an RPC.
--
-- ===========================================================================
-- WHAT IT DOES NOT DO
-- ===========================================================================
--
--   * NO CLIENT. DocumentCard's share panel, the live PING and the conflict
--     sentence are the client half of decision 38 and are not here.
--   * NO CHANGE to ideacad_section_grants, to any of 0214's class-share
--     functions, to any write RPC, or to any write gate other than through the
--     role function they already call.
--   * NO CHANGE TO ideacad_beat_part, AND THAT LEAVES A KNOWN GAP. A hold is
--     "necessary and not sufficient" (0207): beat_part checks only that the
--     caller holds the part, never that they can still write. So a deactivated
--     class editor whose tab is still open keeps a part held until they close
--     it; every WRITE they try is refused, and the owner's reassign or release
--     clears the hold. This is true of a revoked personal editor today too.
--     Closing it is a NARROWING of beat_part with its own answer for holds
--     already stored, so it belongs in its own file.
--   * NO LOCKING. Overlap stays optimistic, as decision 38's default says: the
--     blade writers refuse a stale revision and ideacad_save_direct_document
--     answers {ok: false, reason: 'stale'}.
--
-- ===========================================================================
-- GRANTS FOLLOW 0166's SHAPE
-- ===========================================================================
--
-- This project's default privileges hand every new function a DIRECT anon
-- grant and every new table all seven privileges for both client roles, and a
-- revoke from public alone removes neither. So the four new functions and the
-- new table revoke from public, anon, authenticated and service_role BY NAME
-- and grant back exactly what they mean: EXECUTE on the three client functions
-- to authenticated and service_role, EXECUTE on the private reach-count helper
-- (_ideacad_class_edit_reach) to NOBODY (only the definer functions above it
-- call it), and SELECT on the table to authenticated.
--
-- THE TWO REPLACED FUNCTIONS ARE NOT RE-GRANTED, deliberately. A create or
-- replace preserves the whole ACL (0205 measured it), and touching the grant
-- surface of an object another file created is how 0205's first draft
-- falsified another migration's negative control. The self-check reads both
-- ACLs back and refuses if either became anon-executable or if the role
-- function gained an authenticated grant.
--
-- ===========================================================================
-- DEPLOY ORDERING: NONE, AND WHY
-- ===========================================================================
--
-- It is ADDITIVE. Two functions are replaced with their signatures and return
-- shapes unchanged (_ideacad_document_role gains one arm;
-- ideacad_shared_with_me gains one union arm and reorders its tie-break), a
-- table and four functions are new (three a client may call, one private
-- helper), and no deployed client names any of them. Apply it before or after
-- any deploy. The CLIENT that offers "Give the class edit access" must not
-- reach production before this is applied, or it
-- must treat PGRST202 on ideacad_grant_class_edit as "not available" and
-- remove the control, per CLAUDE.md's RPC degradation rule.
--
-- THE SIGNATURE TRAP DOES NOT ARISE: no function gains or loses a parameter,
-- and nothing is dropped, so there is no plpgsql caller to guard.
--
-- RE-PASTE HAZARD, WHICH IS REAL: re-pasting 0214 AFTER this file replaces
-- _ideacad_document_role and ideacad_shared_with_me with 0214's bodies and
-- SILENTLY REMOVES the class editor. Every edit grant row would survive and
-- mean nothing. If 0214 is ever re-pasted, re-paste this file after it.
--
-- IDEMPOTENT. Every create is "if not exists" or "or replace", the constraint
-- is added under a pg_constraint guard, the trigger and the policy are dropped
-- before they are created, and the test applies the whole file twice.
--
-- ===========================================================================
-- WHAT UNDOES IT, IN THIS ORDER
-- ===========================================================================
--
-- THE UNDO IS A FILE, undo-0229_ideacad_class_edit_grant.sql beside this one,
-- and the test applies it and asserts that every function in public comes back
-- to exactly the source and ACL it had before this file. It does, in order:
--
--   1. Re-creates 0214's _ideacad_document_role and ideacad_shared_with_me,
--      each copied byte for byte from 0214 (the test asserts the copy). FIRST,
--      because a SQL function body naming a table is not a recorded dependency:
--      drop the table while the role function still names it and EVERY IdeaCAD
--      read errors at its next call, since every read policy asks the role.
--      DO NOT RE-PASTE 0214'S SECTIONS 4 AND 7 WHOLE INSTEAD: they also hold
--      _ideacad_can_write_document, _ideacad_part_owner,
--      ideacad_share_document_with_section, ideacad_unshare_document_from_section
--      and ideacad_open_shared_document, which 0216 replaced, and re-pasting
--      them reverts 0216's solid-v1 refusals.
--   2. Refuses if anything other than this file's own functions still names
--      the table or any of the four functions (a plpgsql caller is not a
--      recorded dependency either).
--   3. Drops the four functions and then public.ideacad_section_edit_grants.
--      tools/apply-migration.mjs refuses a drop table by design, so the undo is
--      pasted by hand.
--
-- IT IS ONLY CORRECT WHILE THIS FILE IS THE LAST ONE TO REPLACE THOSE TWO
-- FUNCTIONS. A later file that replaces either one makes step 1 a revert of
-- that file too; grep supabase/migrations for both names before pasting it.
--
-- Nothing else moves. No existing row is written by this file.
--
-- ===========================================================================
-- PROMOTING IT
-- ===========================================================================
--
--   * Move it to supabase/migrations/0229_ideacad_class_edit_grant.sql and
--     point PROPOSED at the new path in the test.
--   * Classify the three client functions in
--     tests/db/ideacad-grants-anon-execute-surface.test.ts (kind client), the
--     helper _ideacad_class_edit_reach there too (kind definer), and add
--     ideacad_section_edit_grants to its IDEACAD_SELECT_TABLES; that test FAILS
--     on an unclassified ideacad function, deliberately.
--   * Move undo-0229_ideacad_class_edit_grant.sql with it (anywhere that is
--     NOT supabase/migrations/) and point UNDO at it in the test.
--   * Edit CLAUDE.md's "A CLASS GRANT IS A SECOND TABLE AND IS ALWAYS A
--     VIEWER" paragraph in place, naming decision 38 and this file.
--   * Write the client half and its classroom-updates entry.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT. Refuse rather than half-apply.
--
--    Everything this file calls or replaces has to be there at the exact
--    signature it is called at, and the two functions it replaces have to be
--    the shape it was written against. A role function that no longer reads
--    ideacad_section_grants is not 0214's, and replacing it with 0214's body
--    plus one arm would silently revert whatever changed it. Diff it against
--    the source first.
-- ---------------------------------------------------------------------------

do $preflight$
declare
	v_sig text;
	v_src text;
begin
	foreach v_sig in array array[
		'public.current_user_email()',
		'public.touch_updated_at()',
		'public.classroom_manages_section(uuid)',
		'public._ideacad_document_role(uuid)',
		'public._ideacad_can_read_document(uuid)',
		'public._ideacad_manages_document(uuid)',
		'public._ideacad_can_write_document(uuid)',
		'public._ideacad_direct_can_write(uuid)',
		'public._ideacad_part_writer(uuid)',
		'public._ideacad_part_owner(uuid)',
		'public._ideacad_document_archived(uuid)',
		'public._ideacad_realtime_can_send(text)',
		'public._ideacad_realtime_can_read(text)',
		'public.ideacad_shared_with_me(uuid)',
		'public.app_short_link_target(text)'
	] loop
		if to_regprocedure(v_sig) is null then
			raise exception '0229 cannot apply: % is missing. This file needs 0205, 0207, 0211, 0214, 0216 and 0217 applied first.', v_sig;
		end if;
	end loop;

	if to_regclass('public.ideacad_section_grants') is null then
		raise exception '0229 cannot apply: public.ideacad_section_grants is missing, so 0214 has not been applied.';
	end if;
	if to_regclass('public.classroom_enrollments') is null
		or to_regclass('public.classroom_sections') is null
		or to_regclass('public.classroom_postings') is null then
		raise exception '0229 cannot apply: the classroom roster tables are missing.';
	end if;
	if not exists (
		select 1 from pg_attribute
		where attrelid = 'public.ideacad_documents'::regclass
			and attname = 'deleted_at' and not attisdropped
	) or not exists (
		select 1 from pg_attribute
		where attrelid = 'public.ideacad_documents'::regclass
			and attname = 'model_format' and not attisdropped
	) then
		raise exception '0229 cannot apply: ideacad_documents is missing model_format or deleted_at, so 0216 or 0217 has not been applied.';
	end if;

	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_ideacad_document_role';
	if position('ideacad_grants' in v_src) = 0 or position('ideacad_section_grants' in v_src) = 0 then
		raise exception '0229 cannot apply: the deployed _ideacad_document_role is not 0214''s (it does not read both ideacad_grants and ideacad_section_grants). Diff it against this file before applying, or this file would revert whatever replaced it.';
	end if;

	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'ideacad_shared_with_me';
	if position('ideacad_section_grants' in v_src) = 0 then
		raise exception '0229 cannot apply: the deployed ideacad_shared_with_me is not 0214''s (it does not read ideacad_section_grants). Diff it against this file before applying.';
	end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. THE TABLE.
--
--    Keyed (document_id, section_id), exactly like 0214's viewer table, and
--    for its reason: a class is not an email, and fanning a class out into one
--    ideacad_grants row per student is the snapshot decision 38 rejected --
--    a student who enrols tomorrow would get nothing and one who leaves would
--    keep their row.
--
--    NO ROLE COLUMN. Every row means editor. See decision 1 in the header.
--
--    granted_by IS A RECORD, NEVER A CHECK. classroom_manages_section is what
--    authorizes, on every call, so a teacher who stops teaching the class stops
--    being able to change this whatever the column says.
--
--    ON DELETE CASCADE ON BOTH SIDES, as 0214's: a grant naming a document or a
--    section that no longer exists can never match anybody.
-- ---------------------------------------------------------------------------

create table if not exists public.ideacad_section_edit_grants(
	document_id uuid not null references public.ideacad_documents(id) on delete cascade,
	section_id uuid not null references public.classroom_sections(id) on delete cascade,
	granted_by text not null,
	granted_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (document_id, section_id)
);

do $segconstraints$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_section_edit_grants_granted_by_normalized'
			and conrelid = 'public.ideacad_section_edit_grants'::regclass
	) then
		alter table public.ideacad_section_edit_grants
			add constraint ideacad_section_edit_grants_granted_by_normalized
			check (granted_by = lower(btrim(granted_by)) and granted_by like '%@%');
	end if;
end
$segconstraints$;

-- The role function's lookup is "does any edit grant on this document name a
-- section I am actively enrolled in". The document is the leading column there;
-- the policy below and a teacher's "what has my class been given" read lead
-- with the section. The primary key covers the first, this covers the second.
create index if not exists ideacad_section_edit_grants_section_idx
	on public.ideacad_section_edit_grants (section_id, document_id);

drop trigger if exists ideacad_section_edit_grants_touch on public.ideacad_section_edit_grants;
create trigger ideacad_section_edit_grants_touch
	before update on public.ideacad_section_edit_grants
	for each row execute function public.touch_updated_at();

alter table public.ideacad_section_edit_grants enable row level security;

-- WHO MAY READ AN EDIT GRANT ROW: a student the grant actually reaches (the row
-- is the only thing that explains why a document they do not own is editable
-- for them), the document's owner or manager, and the class's own teacher.
-- A student sees rows for their OWN active sections only.
--
-- EVERY CROSS-TABLE LOOKUP INTO IDEACAD GOES THROUGH A SECURITY DEFINER
-- PREDICATE (_ideacad_manages_document), which is 0205's measured lesson: an
-- inline select of ideacad_documents here would re-enter that table's policy,
-- which calls back here through the role function, and Postgres answers
-- "infinite recursion detected in policy". The enrollment term is safe inline
-- for the reason 0214 gives: classroom_enrollments' own policy does not reach
-- IdeaCAD. classroom_manages_section is granted to authenticated (0138).
drop policy if exists "reached classes and managers read ideacad edit grants"
	on public.ideacad_section_edit_grants;
create policy "reached classes and managers read ideacad edit grants"
	on public.ideacad_section_edit_grants
	for select
	to authenticated
	using (
		exists (
			select 1 from public.classroom_enrollments ce
			where ce.section_id = ideacad_section_edit_grants.section_id
				and ce.student_email = public.current_user_email()
				and ce.active
		)
		or public._ideacad_manages_document(document_id)
		or public.classroom_manages_section(section_id)
	);

revoke all on table public.ideacad_section_edit_grants from public, anon, authenticated, service_role;
grant select on table public.ideacad_section_edit_grants to authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE ROLE. 0214's body, byte for byte, with ONE arm inserted between the
--    owner arm and the coalesce.
--
--    THE ARM READS ce.active, and that is the whole of "evaluated live": the
--    enrollment is joined on every call, so a student added to the class is an
--    editor from the statement that adds them and a student deactivated is not
--    from the statement that deactivates them. There is nothing to sweep and
--    nothing to go stale.
--
--    IT SITS ABOVE THE COALESCE ON PURPOSE (decision 3): a person with a
--    personal viewer grant who is also in an edit class is an editor. For
--    anybody no edit grant reaches, the arm is false and the function is
--    0214's exactly.
--
--    IT DOES NOT MENTION THE ARCHIVE. The role is who you are; whether you may
--    write an archived document is the write gates' question, and they each
--    carry the archive term (asserted in section 6).
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
		when exists (
			select 1
			from public.ideacad_section_edit_grants eg
			join public.classroom_enrollments ce on ce.section_id = eg.section_id
			where eg.document_id = p_document_id
				and ce.student_email = v.email
				and ce.active
		) then 'editor'
		else coalesce(
			(
				select g.role from public.ideacad_grants g
				where g.document_id = p_document_id and g.grantee_email = v.email
			),
			(
				select 'viewer'
				from public.ideacad_section_grants sg
				join public.classroom_enrollments ce on ce.section_id = sg.section_id
				where sg.document_id = p_document_id
					and ce.student_email = v.email
					and ce.active
				limit 1
			)
		)
	end
	from (select public.current_user_email() as email) v;
$role$;

-- ---------------------------------------------------------------------------
-- 3. DISCOVERY FOR A BLADE DOCUMENT. 0214's ideacad_shared_with_me with a third
--    union arm, because without it a class edit grant on a blade document is
--    unreachable: a student has no other way to learn the document id (0214
--    says the same of its own arm).
--
--    THE TIE-BREAK IS NOW BY PRIVILEGE, THEN BY SOURCE, so the row a student
--    sees says the same role the role function answers:
--
--      0  a personal editor grant
--      1  a class edit grant           (new)
--      2  a personal viewer grant
--      3  a class viewer grant
--
--    0214 ranked person 0 and class 1. For every row that existed before this
--    file the winner is unchanged -- a person row still beats a class viewer
--    row -- which the test asserts on the seeded corpus. Keys are unchanged, so
--    a client that has not been redeployed reads what it always read, with
--    'editor' now possible on a 'class' row.
-- ---------------------------------------------------------------------------

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
			'documentId', x.document_id,
			'ownerEmail', x.owner_email,
			'role', x.role,
			'grantedAt', x.granted_at,
			'updatedAt', x.updated_at,
			'via', x.via
		) order by x.owner_email), '[]')
		from (
			select distinct on (u.document_id)
				u.document_id, u.owner_email, u.role, u.granted_at, u.updated_at, u.via
			from (
				select d.id as document_id, d.student_email as owner_email, g.role,
					g.granted_at, d.updated_at, 'person' as via,
					case when g.role = 'editor' then 0 else 2 end as rank
				from public.ideacad_grants g
				join public.ideacad_documents d on d.id = g.document_id
				where g.grantee_email = v_email and d.item_id = p_item_id
				union all
				select d.id, d.student_email, 'editor',
					eg.granted_at, d.updated_at, 'class', 1
				from public.ideacad_section_edit_grants eg
				join public.ideacad_documents d on d.id = eg.document_id
				join public.classroom_enrollments ce on ce.section_id = eg.section_id
				where ce.student_email = v_email and ce.active and d.item_id = p_item_id
					and d.student_email <> v_email
				union all
				select d.id, d.student_email, 'viewer',
					sg.granted_at, d.updated_at, 'class', 3
				from public.ideacad_section_grants sg
				join public.ideacad_documents d on d.id = sg.document_id
				join public.classroom_enrollments ce on ce.section_id = sg.section_id
				where ce.student_email = v_email and ce.active and d.item_id = p_item_id
			) u
			order by u.document_id, u.rank, u.granted_at
		) x
	);
end
$sharedwithme$;

-- ---------------------------------------------------------------------------
-- 4. THE FOUR FUNCTIONS: the reach count, grant, revoke, and the list on one
--    document.
-- ---------------------------------------------------------------------------

-- HOW MANY STUDENTS A CLASS EDIT GRANT REACHES: the class's ACTIVE students,
-- less the document's owner, who could already edit. ONE definition, because
-- the grant answers it ("5 students can now edit this") and the list answers it
-- again beside each class, and two spellings of one count are two numbers a
-- teacher sees disagree on one screen: the first draft of this file counted the
-- owner in the list and not in the grant, and answered 5 and then 6 for the
-- same class. A count, never a list of addresses (see the grant).
--
-- is distinct from, not <>: a document id that matches nothing projects a
-- NULL owner, and <> against NULL would count nobody rather than the class.
create or replace function public._ideacad_class_edit_reach(
	p_document_id uuid,
	p_section_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $classeditreach$
	select count(*)::integer
	from public.classroom_enrollments ce
	where ce.section_id = p_section_id
		and ce.active
		and ce.student_email is distinct from (
			select d.student_email from public.ideacad_documents d where d.id = p_document_id
		);
$classeditreach$;

-- GRANT. The document row lock is taken FIRST, and it is the same lock the
-- archive paths and every direct save take, so a grant cannot interleave with
-- an archive: if the archive commits first, this re-reads the row and refuses.
--
-- THE ORDER OF THE REFUSALS IS THE ORDER A PERSON CAN ACT ON THEM: the document
-- (not yours, in the trash, archived), then the class (none chosen, not yours,
-- not posted). A missing document and one the caller does not manage answer
-- identically.
create or replace function public.ideacad_grant_class_edit(
	p_document_id uuid,
	p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $grantclassedit$
declare
	v_email text := public.current_user_email();
	d public.ideacad_documents;
	g public.ideacad_section_edit_grants;
	v_label text;
	v_reached integer;
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;

	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or not public._ideacad_manages_document(d.id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found',
			'message', 'That document does not exist.');
	end if;
	if d.deleted_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'trashed',
			'message', 'Restore this document from the trash before giving a class edit access.');
	end if;
	if d.archived_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'archived',
			'message', 'This document is archived, so nobody can edit it. Restore it first, or share it with the class as view-only reference.');
	end if;
	if p_section_id is null then
		return jsonb_build_object('ok', false, 'reason', 'no_section',
			'message', 'Choose a class.');
	end if;
	-- Decision 4. A missing section and a section the caller does not teach
	-- answer identically, for the same reason a document does.
	if not public.classroom_manages_section(p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_your_class',
			'message', 'Only the teacher of that class, or a site admin, can give the whole class edit access.');
	end if;
	-- Decision 7. The discovery path for a blade document is keyed on its item.
	if d.model_format = 'blade-v1' and not exists (
		select 1 from public.classroom_postings cp
		where cp.item_id = d.item_id and cp.section_id = p_section_id
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_posted',
			'message', 'You can only give edit access to a class this assignment is posted to.');
	end if;

	insert into public.ideacad_section_edit_grants(document_id, section_id, granted_by)
	values (d.id, p_section_id, v_email)
	on conflict (document_id, section_id) do update
		set granted_by = excluded.granted_by
	returning * into g;

	select s.label into v_label from public.classroom_sections s where s.id = g.section_id;
	-- A COUNT, NEVER A LIST OF ADDRESSES: what the surface needs is "27 students
	-- can now edit this", and a roster in a grant payload is a disclosure the
	-- button does not need. The owner is not counted: they could already.
	v_reached := public._ideacad_class_edit_reach(g.document_id, g.section_id);

	return jsonb_build_object('ok', true,
		'grant', jsonb_build_object(
			'documentId', g.document_id,
			'sectionId', g.section_id,
			'label', v_label,
			'grantedBy', g.granted_by,
			'grantedAt', g.granted_at
		),
		'activeStudents', v_reached);
end
$grantclassedit$;

-- REVOKE. Decision 5: the owner, the document's manager, or the class's own
-- teacher, and nothing about the document's current state is consulted.
-- Removing a grant that is not there is not an error: the caller asked for
-- that class not to have edit access, and it does not.
create or replace function public.ideacad_revoke_class_edit(
	p_document_id uuid,
	p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $revokeclassedit$
declare
	v_email text := public.current_user_email();
	v_removed integer;
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if not (
		public._ideacad_manages_document(p_document_id)
		or (p_section_id is not null and public.classroom_manages_section(p_section_id))
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_found',
			'message', 'That document does not exist.');
	end if;
	delete from public.ideacad_section_edit_grants
	where document_id = p_document_id and section_id = p_section_id;
	get diagnostics v_removed = row_count;
	return jsonb_build_object('ok', true, 'removed', v_removed);
end
$revokeclassedit$;

-- THE LIST ON ONE DOCUMENT, for its owner and its manager. Counts, not names,
-- for the same reason the grant answers a count, and the SAME count under the
-- same key (activeStudents), from the same helper.
create or replace function public.ideacad_class_edit_grants(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $classeditgrants$
begin
	if coalesce(public.current_user_email(), '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if not public._ideacad_manages_document(p_document_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found',
			'message', 'That document does not exist.');
	end if;
	return jsonb_build_object('ok', true, 'grants', (
		select coalesce(jsonb_agg(jsonb_build_object(
			'sectionId', s.id,
			'label', s.label,
			'grantedBy', eg.granted_by,
			'grantedAt', eg.granted_at,
			'activeStudents', public._ideacad_class_edit_reach(eg.document_id, eg.section_id)
		) order by s.label, s.id), '[]'::jsonb)
		from public.ideacad_section_edit_grants eg
		join public.classroom_sections s on s.id = eg.section_id
		where eg.document_id = p_document_id
	));
end
$classeditgrants$;

-- ---------------------------------------------------------------------------
-- 5. THE GRANTS, in 0166's shape: name every role, then grant back exactly who
--    should hold it. The two REPLACED functions are not re-granted; see the
--    header. Their ACLs are read back in section 6.
-- ---------------------------------------------------------------------------

revoke all on function
	public.ideacad_grant_class_edit(uuid, uuid),
	public.ideacad_revoke_class_edit(uuid, uuid),
	public.ideacad_class_edit_grants(uuid)
	from public, anon, authenticated, service_role;

grant execute on function
	public.ideacad_grant_class_edit(uuid, uuid),
	public.ideacad_revoke_class_edit(uuid, uuid),
	public.ideacad_class_edit_grants(uuid)
	to authenticated, service_role;

-- The reach count is called only from inside the definer functions above, which
-- run as its owner, so no client role holds it and nothing is granted back.
revoke all on function public._ideacad_class_edit_reach(uuid, uuid)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. THE SELF-CHECK. It reads the catalog back rather than trusting that the
--    statements above ran, and it raises, so a partial apply rolls back whole.
--    It asserts the objects THIS FILE WRITES and the delegation this file RELIES
--    ON, by name. It sweeps no prefix: an apply-time guard over a whole
--    subsystem asserts things about files that are not this one (0206's
--    header, and 0214's section 9 (g) for what it cost).
-- ---------------------------------------------------------------------------

do $check$
declare
	r record;
	v_src text;
	v_control boolean;
	v_seen integer := 0;
	v_bad text[] := '{}';
	v_sig text;
	v_client text[] := array[
		'public.ideacad_grant_class_edit(uuid,uuid)',
		'public.ideacad_revoke_class_edit(uuid,uuid)',
		'public.ideacad_class_edit_grants(uuid)',
		'public.ideacad_shared_with_me(uuid)'
	];
	v_definer text[] := array[
		'public._ideacad_document_role(uuid)',
		'public._ideacad_class_edit_reach(uuid,uuid)'
	];
	v_arm text;
begin
	-- (a) THE INSTRUMENT CONTROL, first. app_short_link_target is granted to
	--     anon on purpose, so a sweep that cannot see that grant cannot see any.
	select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute')
		into v_control;
	if v_control is distinct from true then
		raise exception '0229: the positive control failed -- app_short_link_target does not read as anon-executable, so the anon checks below cannot tell a grant from its absence.';
	end if;

	-- (b) THE TABLE: there, RLS on, one policy, and no role column on EITHER
	--     class table. The new table's rows mean editor because of which table
	--     they are in; the old table's rows mean viewer for the same reason.
	if to_regclass('public.ideacad_section_edit_grants') is null then
		raise exception '0229: public.ideacad_section_edit_grants was not created.';
	end if;
	if not exists (
		select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = 'ideacad_section_edit_grants' and c.relrowsecurity
	) then
		raise exception '0229: row level security is not enabled on ideacad_section_edit_grants. Without it the authenticated SELECT grant is every row in the table.';
	end if;
	if (select count(*) from pg_policies
		where schemaname = 'public' and tablename = 'ideacad_section_edit_grants') <> 1 then
		raise exception '0229: expected exactly one policy on ideacad_section_edit_grants.';
	end if;
	if exists (
		select 1 from pg_attribute
		where attrelid in ('public.ideacad_section_edit_grants'::regclass, 'public.ideacad_section_grants'::regclass)
			and attname = 'role' and not attisdropped
	) then
		raise exception '0229: a class grant table has a role column. Which table a row is in is what says viewer or editor, and a column would make that a check somebody could get wrong.';
	end if;

	-- (c) EXACTLY ONE ARITY FOR EVERY NAME THIS FILE WRITES. A count of two is
	--     the signature trap.
	for r in
		select unnest(array[
			'_ideacad_document_role', 'ideacad_shared_with_me', '_ideacad_class_edit_reach',
			'ideacad_grant_class_edit', 'ideacad_revoke_class_edit', 'ideacad_class_edit_grants'
		]) as nm
	loop
		if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = r.nm) <> 1 then
			raise exception '0229: expected exactly one public.%. A surviving second arity is the signature trap.', r.nm;
		end if;
	end loop;

	-- (d) THE ROLE READS THE ROSTER LIVE. Read out of prosrc, so this is what
	--     is DEPLOYED and not what this file intended. It reads the EDIT ARM
	--     ALONE -- the text from the table name to its own then 'editor' --
	--     because 0214's viewer arm below it already says classroom_enrollments
	--     and ce.active, so a check over the whole body passes with the new arm
	--     missing its roster terms entirely (measured: the first draft of this
	--     check did exactly that).
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_ideacad_document_role';
	v_arm := substring(v_src from 'ideacad_section_edit_grants(.*?)then ''editor''');
	if v_arm is null
		or position('classroom_enrollments' in v_arm) = 0
		or position('eg.document_id = p_document_id' in v_arm) = 0
		or position('ce.student_email = v.email' in v_arm) = 0
		or position('ce.active' in v_arm) = 0 then
		raise exception '0229: the class edit arm of the deployed _ideacad_document_role does not read ideacad_section_edit_grants against the caller''s ACTIVE enrollment on this document.';
	end if;

	-- (e) EVERY GATE THE CLASS EDITOR HAS TO REACH STILL ASKS THE ROLE. If one
	--     of these stopped delegating, the class editor would be refused there
	--     SILENTLY -- no error, just a control that does nothing -- which is the
	--     whole reason decision 38 names both write paths.
	for r in
		select * from (values
			('_ideacad_can_write_document', '_ideacad_document_role'),
			('_ideacad_direct_can_write', '_ideacad_document_role'),
			('_ideacad_can_read_document', '_ideacad_document_role'),
			('_ideacad_part_writer', '_ideacad_can_write_document'),
			('_ideacad_realtime_can_send', '_ideacad_can_write_document'),
			('_ideacad_realtime_can_send', '_ideacad_direct_can_write'),
			('_ideacad_realtime_can_read', '_ideacad_can_read_document')
		) as t(fn, needle)
	loop
		select p.prosrc into v_src
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = r.fn;
		if v_src is null or position(r.needle in v_src) = 0 then
			v_bad := v_bad || format('%s does not call %s', r.fn, r.needle);
		end if;
	end loop;
	if array_length(v_bad, 1) is not null then
		raise exception '0229: % gate(s) no longer reach the role, so a class editor would be refused there silently: %.',
			array_length(v_bad, 1), array_to_string(v_bad, '; ');
	end if;

	-- (f) A LIVE GRANT NEVER WRITES AN ARCHIVED DOCUMENT, because both write
	--     gates carry the archive term. This file relies on that rather than
	--     restating it, so it asserts it.
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_ideacad_can_write_document';
	if position('_ideacad_document_archived' in v_src) = 0 then
		raise exception '0229: _ideacad_can_write_document has lost its archive term, so a class edit grant would reach an archived blade document.';
	end if;
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_ideacad_direct_can_write';
	if position('archived_at is null' in v_src) = 0 then
		raise exception '0229: _ideacad_direct_can_write has lost its archive term, so a class edit grant would reach an archived direct document.';
	end if;

	-- (g) THE ASSEMBLY OWNER IS STILL THE OWNER. Decision 2 in the header. The
	--     day a class is given the owner's powers, this line is the one to edit,
	--     on purpose.
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_ideacad_part_owner';
	if position('ideacad_section_edit_grants' in v_src) > 0
		or position('_ideacad_document_role' in v_src) > 0 then
		raise exception '0229: _ideacad_part_owner now admits more than the document owner. Reassigning a live hold is the assembly owner''s power (0207); widening it is a decision, not a side effect.';
	end if;

	-- (h) anon, OVER THE FUNCTIONS THIS FILE WRITES AND NO OTHERS, with a seen
	--     count so a check that looked nowhere cannot pass.
	v_bad := '{}';
	for r in
		select sig, has_function_privilege('anon', sig, 'execute') as anon_x
		from unnest(v_client || v_definer) as sig
		where to_regprocedure(sig) is not null
	loop
		v_seen := v_seen + 1;
		if r.anon_x then
			v_bad := v_bad || r.sig;
		end if;
	end loop;
	if v_seen <> coalesce(array_length(v_client, 1), 0) + coalesce(array_length(v_definer, 1), 0) then
		raise exception '0229: the anon check examined % function(s), not all of this file''s own. It is not looking where it thinks it is.', v_seen;
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0229: % of this file''s own function(s) are executable by anon: %. Revoke in 0166 shape -- name public, anon, authenticated, service_role, then grant back.',
			array_length(v_bad, 1), array_to_string(v_bad, ', ');
	end if;

	-- (i) THE GRANTS THIS FILE OWES, both directions.
	foreach v_sig in array v_client loop
		if not has_function_privilege('authenticated', v_sig, 'execute') then
			v_bad := v_bad || (v_sig || ' (authenticated cannot execute it)');
		end if;
	end loop;
	foreach v_sig in array v_definer loop
		if has_function_privilege('authenticated', v_sig, 'execute') then
			v_bad := v_bad || (v_sig || ' (a definer-only predicate holds the authenticated grant)');
		end if;
	end loop;
	if array_length(v_bad, 1) is not null then
		raise exception '0229: % grant(s) are wrong: %.', array_length(v_bad, 1), array_to_string(v_bad, ', ');
	end if;

	-- (j) THE TABLE ACL: authenticated SELECT and nothing else, for anybody.
	if not has_table_privilege('authenticated', 'public.ideacad_section_edit_grants', 'SELECT') then
		raise exception '0229: authenticated cannot select ideacad_section_edit_grants. The policy is what narrows that grant; without it the feature is down.';
	end if;
	for r in
		select rp0.role_name, rp1.priv
		from (values ('anon'), ('authenticated'), ('service_role')) as rp0(role_name)
		cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
			('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as rp1(priv)
		where has_table_privilege(rp0.role_name, 'public.ideacad_section_edit_grants'::regclass, rp1.priv)
			and not (rp0.role_name = 'authenticated' and rp1.priv = 'SELECT')
	loop
		v_bad := v_bad || format('%s to %s', r.priv, r.role_name);
	end loop;
	if array_length(v_bad, 1) is not null then
		raise exception '0229: % client table privilege(s) on ideacad_section_edit_grants survive beyond authenticated SELECT: %.',
			array_length(v_bad, 1), array_to_string(v_bad, ', ');
	end if;

	raise notice '0229: ideacad_section_edit_grants with RLS, one policy and no role column; the role reads it against the active roster; 7 gate delegations confirmed; the assembly owner is still the owner; % of this file''s own function(s) checked, 0 executable by anon.', v_seen;
end
$check$;

-- ---------------------------------------------------------------------------
-- 7. WHAT IS ALREADY IN THIS STATE, against the real tables, at apply time.
--    Nothing is written. The viewer count is reported so an operator can see
--    it did not move.
-- ---------------------------------------------------------------------------

do $report$
declare
	v_viewer bigint;
	v_editor bigint;
	v_docs bigint;
begin
	select count(*) into v_viewer from public.ideacad_section_grants;
	select count(*), count(distinct document_id) into v_editor, v_docs
	from public.ideacad_section_edit_grants;
	raise notice '0229: % class VIEWER grant(s) (0214, unchanged by this file); % class EDIT grant(s) on % document(s).',
		v_viewer, v_editor, v_docs;
end
$report$;

commit;

-- ---------------------------------------------------------------------------
-- 8. VERIFICATION QUERY. Run it in a NEW SQL editor tab after this file has
--    applied. It is read-only, and every row should say ok = true. The test
--    strips the comment markers from the lines between the two marker lines
--    and runs it, so it cannot drift from what the file does.
-- ---------------------------------------------------------------------------
-- BEGIN VERIFICATION QUERY
-- select 'edit grant table exists, RLS on' as what,
--   coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.ideacad_section_edit_grants')), false) as ok
-- union all select 'neither class grant table has a role column',
--   not exists (select 1 from pg_attribute where attname = 'role' and not attisdropped
--     and attrelid in (to_regclass('public.ideacad_section_edit_grants'), to_regclass('public.ideacad_section_grants')))
-- union all select 'the role reads edit grants against the active roster',
--   coalesce(position('ce.active' in substring((select prosrc from pg_proc where oid = 'public._ideacad_document_role(uuid)'::regprocedure) from 'ideacad_section_edit_grants(.*?)then ''editor''')) > 0, false)
--   and coalesce(position('ce.student_email = v.email' in substring((select prosrc from pg_proc where oid = 'public._ideacad_document_role(uuid)'::regprocedure) from 'ideacad_section_edit_grants(.*?)then ''editor''')) > 0, false)
-- union all select 'discovery lists a blade document a class can edit',
--   position('ideacad_section_edit_grants' in (select prosrc from pg_proc where oid = 'public.ideacad_shared_with_me(uuid)'::regprocedure)) > 0
-- union all select 'the assembly owner is still only the owner',
--   position('ideacad_section_edit_grants' in (select prosrc from pg_proc where oid = 'public._ideacad_part_owner(uuid)'::regprocedure)) = 0
-- union all select 'anon cannot grant, revoke or list',
--   not has_function_privilege('anon', 'public.ideacad_grant_class_edit(uuid,uuid)', 'execute')
--   and not has_function_privilege('anon', 'public.ideacad_revoke_class_edit(uuid,uuid)', 'execute')
--   and not has_function_privilege('anon', 'public.ideacad_class_edit_grants(uuid)', 'execute')
-- union all select 'a signed-in person can call all three',
--   has_function_privilege('authenticated', 'public.ideacad_grant_class_edit(uuid,uuid)', 'execute')
--   and has_function_privilege('authenticated', 'public.ideacad_revoke_class_edit(uuid,uuid)', 'execute')
--   and has_function_privilege('authenticated', 'public.ideacad_class_edit_grants(uuid)', 'execute')
-- union all select 'no client role holds the reach-count helper',
--   not has_function_privilege('anon', 'public._ideacad_class_edit_reach(uuid,uuid)', 'execute')
--   and not has_function_privilege('authenticated', 'public._ideacad_class_edit_reach(uuid,uuid)', 'execute')
-- union all select 'no client role can write the table',
--   not has_table_privilege('anon', 'public.ideacad_section_edit_grants', 'SELECT')
--   and not has_table_privilege('authenticated', 'public.ideacad_section_edit_grants', 'INSERT')
--   and not has_table_privilege('authenticated', 'public.ideacad_section_edit_grants', 'UPDATE')
--   and not has_table_privilege('authenticated', 'public.ideacad_section_edit_grants', 'DELETE');
-- END VERIFICATION QUERY
