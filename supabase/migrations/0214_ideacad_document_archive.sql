-- 0214_ideacad_document_archive.sql
--
-- Apply manually in the Supabase SQL editor, AFTER 0201, 0205 and 0207.
-- DO NOT APPLY FROM THE SESSION CONTAINER. This environment cannot reach
-- production and must not try.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE IS, AND THE DECISION BEHIND IT
-- ---------------------------------------------------------------------------
--
-- Decision 29 (docs/decisions/entries/29-ideacad-owner-leaves-a-section.md),
-- answered by Mr. Pina on 2026-09-13, in his own terms:
--
--   THE DOCUMENT AND ALL ITS WORK IS ARCHIVED, NOT DELETED, and stays
--   accessible to the admin instructor. If the instructor shares an archived
--   document with a class, those students get access to it too.
--
-- HIS REASON IS THE DESIGN CONSTRAINT AND NOT A FOOTNOTE: he regularly brings
-- up past student work to show current students as reference, and work from
-- students who have since left is exactly what he wants to be able to show.
-- Every narrowing below was checked against that sentence.
--
-- This file builds three of the four pieces decision 29 costed, plus the
-- fourth as its own narrowed shape:
--
--   1. A STATE on the document -- archived_at, archived_by -- with a pass over
--      every read and every write gate that does not know it exists.
--   2. A PATH into it -- ideacad_set_document_archived, an instructor's
--      DELIBERATE act, never a side effect of anything.
--   3. AN INSTRUCTOR READ KEYED ON THE ITEM -- ideacad_archive -- which is a
--      second function and not a parameter on ideacad_roster, for the
--      structural reason decision 29 gives.
--   4. THE RE-SHARE TO A CURRENT CLASS -- ideacad_section_grants and three
--      functions over it. This is the widest part and it reverses 0205's
--      written owner-only default, so section 6 states the four narrowings
--      that buy it and which of them are MY decision rather than his.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ALREADY TRUE, VERIFIED BY READING RATHER THAN ASSUMED
-- ---------------------------------------------------------------------------
--
-- THE INSTRUCTOR'S READ POLICIES WERE ALREADY ITEM-KEYED AND NEEDED NO CHANGE.
-- 0205 line 297's _ideacad_can_read_document is
--
--   role is not null or exists (select 1 from ideacad_documents d
--                                where d.id = p_document_id
--                                  and _classroom_manages_item(d.item_id))
--
-- and the four select policies on ideacad_documents, ideacad_concepts,
-- ideacad_predictions and ideacad_grants all delegate to it. _classroom_manages_item
-- (0085 line 467) reads classroom_postings and classroom_manages_section and
-- NEVER classroom_enrollments. So a teacher of record could already SELECT a
-- departed student's document and its concepts, and could already before this
-- file. The same is true one layer out: 0207's _ideacad_part_reader and 0209's
-- history policy both delegate to the same predicate.
--
-- WHAT WAS NOT TRUE IS THAT ANYTHING WOULD LIST IT. ideacad_roster (0201 line
-- 34) drives off the ENROLLMENT and left-joins the document onto it, so the
-- address leaving the driving set takes the document off the only surface that
-- names one. The reach was there; the listing was not. That is why (3) above is
-- a new function and not a new policy, and it is the whole of what "an archive
-- state is how" means here.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES NOT DO, AND THE FIRST ONE IS LOAD-BEARING
-- ---------------------------------------------------------------------------
--
-- IT DOES NOT WEAKEN 0213's CENSUS, AND ARCHIVING DOES NOT UNLOCK A REMOVAL.
-- 0213 widened classroom_remove_enrollment to count ideacad_documents rows and
-- REFUSE with the number. An archived row is still a row, that count has no
-- archived_at term, and this file does not name classroom_remove_enrollment at
-- all -- so a student with IdeaCAD work is refused before this file and refused
-- after it, archived or not. That is deliberate and it is the point: a silent
-- archive triggered by a removal is the same class of defect as the silent
-- delete 0213 closed, and 0082's own rule is that an enrollment DEACTIVATES
-- (active = false) rather than vanishing. Deactivation already preserves the
-- roster row, so the ordinary path needs nothing from this file; the archive is
-- what an instructor does on purpose to keep a part as reference material.
--
-- The two files are therefore INDEPENDENT and may be applied in EITHER ORDER.
-- 0213 replaces public.classroom_remove_enrollment(uuid, text) and nothing
-- else; this file names no classroom_* object for replacement at all. Section 9
-- asserts that from the catalog rather than from this paragraph.
--
-- IT DOES NOT RELEASE A DEPARTED OWNER'S HELD PARTS. Decision 29 records that
-- as a separate finding and it stays open: nothing clears ideacad_parts.held_by
-- on an enrollment change. On an archived document a hold is INERT rather than
-- harmful, because section 4 closes every write path the hold would authorize,
-- so this is a tidiness bundle of its own and not a hole this one leaves.
--
-- IT DOES NOT GO LOOKING FOR AN ORPHAN TO ARCHIVE. Section 10 REPORTS the
-- documents whose owner is already off the roster -- enrollments deleted while
-- the census was blind, before 0213 -- and writes nothing. Whether each of
-- those is reference work worth keeping is a person's decision with the list in
-- front of them, which is 0138's own convention for a widened refusal. They are
-- reachable the moment this file applies, because ideacad_archive lists an
-- off-roster document whether or not anybody has archived it.
--
-- ---------------------------------------------------------------------------
-- THE ONE QUESTION THIS HEADER IS REQUIRED TO ANSWER:
-- WHAT HAPPENS WHEN AN INSTRUCTOR SHARES AN ARCHIVED DOCUMENT WITH A CLASS
-- ---------------------------------------------------------------------------
--
-- 0205 lines 85-89 wrote the default down: ONLY THE OWNER GRANTS, a grantee
-- cannot re-share, one email at a time into ideacad_grants, and the grantee
-- must be actively enrolled. An archived document's owner is gone and cannot
-- grant, so Mr. Pina's second sentence cannot be served by widening an if.
--
-- WHO MAY GRANT ON THEIR BEHALF: a caller who manages the document's ITEM
-- (_classroom_manages_item, which is the same predicate that already lets them
-- READ the document, so this grants no new reach over the work itself) AND who
-- manages the TARGET SECTION (classroom_manages_section). Two independent
-- manage checks, both existing predicates, neither restated here. The owner
-- cannot do this and is not offered it -- the owner grants to a PERSON, an
-- instructor grants to a CLASS, and the two are different tables.
--
-- WHAT THE RECIPIENT SEES: a READ-ONLY copy, discovered through
-- ideacad_shared_with_me exactly as a person-share is, opened through
-- ideacad_open_shared_document exactly as a person-share is, with role
-- 'viewer' and canWrite false. They see the owner's address, the concepts, the
-- prediction, the assembly and the history -- the same payload a person-share
-- already returns, and no more.
--
-- WHICH PARTS ARE MY DECISION RATHER THAN HIS. He answered WHO (an instructor)
-- and WHAT (the class gets access). He did not answer the shape, and four
-- narrowings below are mine, stated so the next session can reverse any of them
-- knowing they are reversing a builder's judgement and not his:
--
--   (a) VIEWER, ALWAYS, AND IT IS A PROPERTY OF THE SCHEMA. ideacad_section_grants
--       has NO role column, so "a class can never be given write" is not a check
--       that could be got wrong. A current student editing a departed student's
--       reference part would have no owner left to undo it.
--   (b) THE DOCUMENT MUST BE ARCHIVED. His sentence says "an archived document",
--       and the narrow reading is the safe one: without it an instructor could
--       broadcast a LIVE student's in-progress work to a whole class, which is a
--       disclosure nobody has decided. Archiving first is one deliberate press.
--   (c) THE TARGET SECTION MUST BE ONE THE ITEM IS POSTED TO. This reuses the
--       population ideacad_share_document already computes, and it is what lets
--       ideacad_shared_with_me stay the ONE discovery path with no second
--       function keyed on a section. Re-posting one canonical item to this
--       year's section is this schema's own idiom (classroom_postings exists for
--       exactly that), so the ordinary workflow satisfies it. THE COST IS REAL
--       AND IS THE FIRST THING TO REVISIT: an instructor who authors a NEW item
--       each year cannot reach last year's work this way, and would have to post
--       the old item to the new section. That is the open half in decision 29.
--   (d) THE OWNER'S ADDRESS IS SHOWN, NOT REDACTED. Considered and rejected:
--       ideacad_open_shared_document returns to_jsonb(d), which carries
--       student_email, so a redacted LIST beside an unredacted OPEN is worse
--       than either -- it reads as a guarantee and is not one. Attribution is
--       also what showing reference work usually means. The surface therefore
--       SAYS SO IN WORDS before the press, the way FoundryShare does.
--
-- ---------------------------------------------------------------------------
-- HOW AN ARCHIVED DOCUMENT STOPS BEING WRITABLE -- ONE TERM, TWO PREDICATES,
-- AND THE SECOND ONE IS THE HALF THAT IS EASY TO MISS
-- ---------------------------------------------------------------------------
--
-- Decision 29: "An archived document must stop being WRITABLE and keep being
-- READABLE." Every write in the feature funnels through one of two predicates,
-- which is what makes that one term rather than a pass over nineteen functions:
--
--   _ideacad_can_write_document(uuid)  0205's rule. 0205's seven concept
--                                      writers call it, 0209's
--                                      ideacad_apply_actions calls it, and
--                                      0207's _ideacad_part_writer calls it on
--                                      its wide rung.
--   _ideacad_part_owner(uuid)          0207's rule, and THE ONE THAT DOES NOT
--                                      GO THROUGH THE FIRST. _ideacad_part_writer
--                                      short-circuits on it at 0207 line 482,
--                                      BEFORE consulting 0205's predicate, and
--                                      four part writes gate on it directly --
--                                      ideacad_add_part (line 630),
--                                      ideacad_update_part_meta (691),
--                                      ideacad_release_part's fallback (912)
--                                      and ideacad_assign_part (949). Narrowing
--                                      only the first would have left all five
--                                      open on an archived document, silently.
--
-- Both call ONE new predicate, _ideacad_document_archived(uuid), so the two
-- gates cannot come to disagree about what archived means. _ideacad_part_writer
-- itself needs NO CHANGE: both of its rungs are closed by their own terms,
-- which is one fewer 0207 function replaced.
--
-- _ideacad_part_owner's NAME IS NOW SLIGHTLY NARROWER THAN ITS BODY: it answers
-- "may act as the owner of this document's assembly", which on an archived
-- document is nobody. Noted rather than renamed, exactly as _classroom_doc_ok
-- and the normalizer's imageBlock hook are -- 0207 grants it by name and
-- renaming a private predicate to improve a comment is how a caller gets
-- missed. Its one non-gate use is ideacad_assembly's isOwner display flag
-- (0207 line 579), which now reads false on an archived document, and that is
-- CORRECT rather than collateral: it is what removes the owner controls from a
-- surface where every one of them would be refused.
--
-- THE READ SIDE IS UNTOUCHED BY THE ARCHIVE TERM, ON PURPOSE.
-- _ideacad_can_read_document, _ideacad_manages_document and the four policies
-- are not named in this file at all, so "keeps being READABLE" is structural:
-- there is no archived_at anywhere on the read path to get wrong.
--
-- ---------------------------------------------------------------------------
-- TWO MIGRATIONS MUST NOT REDEFINE THE SAME OBJECT
-- ---------------------------------------------------------------------------
--
-- Checked against every migration this bundle could collide with. The six
-- objects this file REPLACES, and who owned each:
--
--   public._ideacad_document_role(uuid)        0205  -- section-grant arm
--   public._ideacad_can_write_document(uuid)   0205  -- archive term
--   public._ideacad_part_owner(uuid)           0207  -- archive term
--   public.ideacad_roster(uuid)                0201  -- projects archivedAt
--   public.ideacad_shared_with_me(uuid)        0205  -- unions class grants
--   public.ideacad_open_shared_document(uuid)  0205  -- canWrite from the gate
--
-- All five belong to APPLIED migrations, which is the ordinary case: a later
-- file replaces an earlier one's function and the earlier text is never
-- rewritten. None of the five is named by 0212 (tournaments) or 0213
-- (classroom_remove_enrollment), the two files in flight beside this one.
--
-- 0206 is a GUARD and creates nothing, so there is nothing here to collide
-- with. It sweeps every ^_?ideacad function for the anon grant, which section 8
-- satisfies by name; its census of CLASSIFIED names is 0201's and 0205's only,
-- and its own header says an unclassified later function is a NOTICE and not a
-- refusal. This file's new names are classified in
-- tests/db/ideacad-grants-anon-execute-surface.test.ts, which DOES fail on an
-- unclassified one, and 0206 is left exactly as it is.
--
-- 0202 is superseded by 0206 for the same reason and is not re-pasted.
--
-- ---------------------------------------------------------------------------
-- NO SIGNATURE TRAP, AND NO DEPLOY ORDERING
-- ---------------------------------------------------------------------------
--
-- Not one of the six replacements changes an argument list or a return type,
-- so create or replace replaces the function rather than adding an overload
-- beside it and there is no drop. Section 9 asserts pg_proc holds exactly ONE
-- row for each of the five names, which is the assertion that catches it if
-- that ever stops being true.
--
-- The three payload widenings are ADDITIVE in the sense CLAUDE.md's deploy rule
-- names -- ideacad_roster's rows GAIN archivedAt, ideacad_shared_with_me's rows
-- GAIN via, and ideacad_open_shared_document GAINS archived and archivedAt,
-- none of them losing a key -- so a client that has not been
-- redeployed reads what it always read and ignores the rest. The six new
-- functions are new names, so no deployed client can call one. Migration and
-- deploy are therefore independent events and either may go first.
--
-- ---------------------------------------------------------------------------
-- RE-APPLIABLE
-- ---------------------------------------------------------------------------
--
-- add column if not exists, create table if not exists, catalog-guarded
-- constraints (Postgres has no add constraint if not exists), drop policy if
-- exists before each create, create or replace throughout, and one read-only
-- report. Nothing is dropped that a second paste would need, and no row is
-- written. tests/db/ideacad-archive-migration.test.ts applies the whole file
-- twice over one database.
--
-- WHAT UNDOES IT. In reverse order, and every step is available:
--   1. Re-apply 0205's own _ideacad_document_role, _ideacad_can_write_document,
--      ideacad_shared_with_me and ideacad_open_shared_document; 0207's
--      _ideacad_part_owner; 0201's ideacad_roster. create or replace preserves
--      each ACL. Note that step 1 alone RESTORES THE canWrite DEFECT described
--      beside that function in section 7, which was 0205's and not this file's.
--   2. drop function on the six new names.
--   3. drop table public.ideacad_section_grants.
--   4. alter table public.ideacad_documents drop column archived_by, drop
--      column archived_at.
-- Step 4 is the only lossy one: it discards which documents were archived and
-- by whom. Nothing else in the schema references either column.
--
-- ---------------------------------------------------------------------------
-- THE GRANT SHAPE IS 0166's
-- ---------------------------------------------------------------------------
--
-- revoke ... from public is NOT a narrowing on a hosted Supabase project. The
-- project bootstraps
--
--   alter default privileges in schema public
--     grant execute on functions to anon, authenticated, service_role;
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role;
--
-- so a function arrives with a DIRECT anon grant, and a table arrives holding
-- all seven privileges for both client roles -- RLS covers none of TRUNCATE,
-- REFERENCES or TRIGGER. That is what left 0201 with ten anon-executable
-- functions and 0201's four tables wide open, and what 0202 and 0203 had to
-- repair. Section 8 therefore revokes from public, anon, authenticated,
-- service_role BY NAME and grants back only what should be held, on both the
-- functions and the table.
--
-- THE SIX REPLACED FUNCTIONS ARE IN THAT REVOKE LIST even though 0202 already
-- closed them, because section 4 reaches them with create or replace and that
-- is exactly the case where a fresh anon grant can reappear on a database whose
-- default privileges are in force. Leaving them out would make this file a
-- silent partial revert of 0202.
--
-- ---------------------------------------------------------------------------
-- THE PASTE TRAP
-- ---------------------------------------------------------------------------
--
-- NO DOLLAR SIGN APPEARS IN ANY COMMENT IN THIS FILE, leading-dash or otherwise.
-- A dollar-quote token inside a comment balances in Postgres and breaks the
-- Supabase editor's client-side statement splitter, which cost 0194 a full
-- apply cycle. Every dollar-quote token below sits on a code line, in a
-- balanced pair. The verification query at the bottom is plain SELECT and
-- carries none.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. PRECONDITIONS. Refuse rather than ship functions that raise at call time.
--
--    plpgsql resolves a table reference when the statement first RUNS, so a
--    create or replace naming a table a missing migration would have created
--    succeeds quietly here and fails at every call. Refuse instead, naming the
--    file to apply first.
-- ---------------------------------------------------------------------------

do $guard$
begin
	if to_regclass('public.ideacad_documents') is null then
		raise exception
			'0214 needs public.ideacad_documents, which 0201_ideacad_blade_editor.sql creates. Apply 0201 first. Nothing was changed.';
	end if;
	if to_regprocedure('public._ideacad_document_role(uuid)') is null
		or to_regprocedure('public._ideacad_can_write_document(uuid)') is null
		or to_regclass('public.ideacad_grants') is null then
		raise exception
			'0214 replaces 0205 predicates and reads public.ideacad_grants, which 0205_ideacad_document_sharing.sql creates. Apply 0205 first. Nothing was changed.';
	end if;
	-- 0207 IS NOT REQUIRED, AND THAT IS A LADDER RATHER THAN A LOOSENING.
	-- A database without it has no ideacad_parts and therefore no assembly
	-- write to narrow, so section 4 SKIPS _ideacad_part_owner instead of
	-- creating it -- creating it here would put an un-narrowed copy in the way
	-- of 0207's own, or a narrowed one 0207 would silently replace. This is the
	-- same shape 0207 itself uses at its line 487 for 0205's predicate, and it
	-- is a real state rather than a hypothetical: the suite boots the whole
	-- chain WITHOUT 0207 on purpose (tests/db/ideacad-assembly-migration.test.ts
	-- is the world-as-it-was measurement 0207 was written against), and a hard
	-- precondition here failed it.
	if to_regprocedure('public._ideacad_part_owner(uuid)') is null then
		raise notice
			'0214: NOTE -- public._ideacad_part_owner(uuid) is not on this database, so the assembly write gate was not narrowed. 0207_ideacad_assembly_parts.sql creates it; APPLY 0214 AGAIN AFTER 0207, or an archived document stays writable through the assembly. Everything else in this file applied.';
	end if;
	if to_regprocedure('public._classroom_manages_item(uuid)') is null
		or to_regprocedure('public.classroom_manages_section(uuid)') is null then
		raise exception
			'0214 gates on the classroom manage predicates from 0085 and 0138. Nothing was changed.';
	end if;
end
$guard$;


-- ---------------------------------------------------------------------------
-- 2. THE STATE.
--
--    TWO COLUMNS, NOT ONE. archived_at is the state; archived_by is the record
--    of who decided, which is the same shape ideacad_grants.granted_by has and
--    is there for the same reason -- the predicate authorizes, the column says
--    who actually pressed it.
--
--    NULLABLE AND UNSTAMPED IS THE NORMAL STATE. Every document already in the
--    table is live, which is what it was, so there is NO BACKFILL here and
--    nothing to guard against a second run rewriting.
--
--    THE INDEX IS PARTIAL AND KEYED ON THE ITEM. ideacad_archive's whole job is
--    "the archived documents on this item", and an archived document is the
--    rare row -- a partial index is the one that stays small as the table grows.
-- ---------------------------------------------------------------------------

alter table public.ideacad_documents
	add column if not exists archived_at timestamptz;
alter table public.ideacad_documents
	add column if not exists archived_by text;

create index if not exists ideacad_documents_archived_idx
	on public.ideacad_documents (item_id)
	where archived_at is not null;

-- Postgres has no `add constraint if not exists`, so the catalog is the guard.
-- A blind drop-then-add raises 2BP01 on the second paste.
do $constraints$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_documents_archived_pair'
			and conrelid = 'public.ideacad_documents'::regclass
	) then
		-- The two move together or not at all. A stamp with no hand behind it,
		-- or a hand with no stamp, is a row nothing can explain.
		alter table public.ideacad_documents
			add constraint ideacad_documents_archived_pair
			check ((archived_at is null) = (archived_by is null));
	end if;
end
$constraints$;


-- ---------------------------------------------------------------------------
-- 3. THE CLASS GRANT TABLE.
--
--    A SECOND TABLE RATHER THAN A ROW SHAPE IN ideacad_grants, and the primary
--    key is why: that table is keyed (document_id, grantee_email) and a class
--    is not an email. Fanning a section out into one row per currently-enrolled
--    address was the rejected alternative -- it is a SNAPSHOT, so a student who
--    enrolls tomorrow gets nothing and a student who leaves keeps their row,
--    which is precisely the enrollment-drift this whole bundle exists to stop
--    reasoning from.
--
--    THERE IS NO ROLE COLUMN. See narrowing (a) in the header: a class is
--    always a viewer, and making that a property of the SCHEMA means it is not
--    a check that could be got wrong in a later widening.
--
--    granted_by IS THE INSTRUCTOR'S ADDRESS AT THE TIME OF THE GRANT, kept as a
--    record and never read as a check -- _classroom_manages_item is what
--    authorizes, on every call, so a teacher who stops teaching the item stops
--    being able to change this whatever the column says.
--
--    ON DELETE CASCADE ON BOTH SIDES. A deleted document takes its class grants
--    with it, and so does a deleted section: a grant naming a section that no
--    longer exists can never match an enrollment, so keeping it would be a row
--    that means nothing and lists as something.
-- ---------------------------------------------------------------------------

create table if not exists public.ideacad_section_grants(
	document_id uuid not null references public.ideacad_documents(id) on delete cascade,
	section_id uuid not null references public.classroom_sections(id) on delete cascade,
	granted_by text not null,
	granted_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (document_id, section_id)
);

do $sgconstraints$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_section_grants_granted_by_normalized'
			and conrelid = 'public.ideacad_section_grants'::regclass
	) then
		alter table public.ideacad_section_grants
			add constraint ideacad_section_grants_granted_by_normalized
			check (granted_by = lower(btrim(granted_by)) and granted_by like '%@%');
	end if;
end
$sgconstraints$;

-- The recipient's lookup is "does any grant on this document name a section I
-- am in", so the section is the leading column.
create index if not exists ideacad_section_grants_section_idx
	on public.ideacad_section_grants (section_id, document_id);

drop trigger if exists ideacad_section_grants_touch on public.ideacad_section_grants;
create trigger ideacad_section_grants_touch
	before update on public.ideacad_section_grants
	for each row execute function public.touch_updated_at();

alter table public.ideacad_section_grants enable row level security;

-- WHO MAY READ A CLASS GRANT ROW. The document's owner and a teacher of record
-- (which is _ideacad_manages_document, 0205's own predicate, called and not
-- restated), plus any student the grant actually reaches -- because that row is
-- the only thing on the read path that explains why a document they do not own
-- is open to them. A student sees the rows for their OWN sections only, so the
-- table cannot be used to enumerate what has been shared with anybody else.
--
-- EVERY CROSS-TABLE LOOKUP GOES THROUGH A SECURITY DEFINER PREDICATE, which is
-- 0205's own hard-won rule and not tidiness: a policy on this table that
-- selected ideacad_documents inline would re-enter that table's policy, which
-- calls back here through _ideacad_document_role, and Postgres answers
-- "infinite recursion detected in policy". The enrollment term is safe to spell
-- out because classroom_enrollments' own policy does not reach IdeaCAD.
drop policy if exists "owners, managers and reached students read ideacad section grants"
	on public.ideacad_section_grants;
create policy "owners, managers and reached students read ideacad section grants"
	on public.ideacad_section_grants
	for select
	to authenticated
	using (
		exists (
			select 1 from public.classroom_enrollments ce
			where ce.section_id = ideacad_section_grants.section_id
				and ce.student_email = public.current_user_email()
				and ce.active
		)
		or public._ideacad_manages_document(document_id)
	);


-- ---------------------------------------------------------------------------
-- 4. THE PREDICATES.
--
--    ONE new predicate, and THREE existing ones replaced. See the header for
--    why _ideacad_part_writer is not among them and why _ideacad_can_read_document
--    is deliberately untouched.
-- ---------------------------------------------------------------------------

-- The one spelling of "is this document archived". Both write gates call it, so
-- they cannot come to disagree. A missing document answers FALSE rather than
-- null: the callers ask it as one term of an `and`, and a null there would
-- propagate out of a boolean gate as SQL NULL, which `if not <gate> then raise`
-- does NOT fire on -- the fall-through that ACCEPTS a write, which is 0125's
-- lesson. exists() cannot return null, which is why it is written this way
-- rather than as a comparison against a selected column.
create or replace function public._ideacad_document_archived(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $archived$
	select exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id and d.archived_at is not null
	);
$archived$;

-- 0205's role resolution, with a THIRD rung under the existing two.
--
-- THE ORDER IS A TOTAL ORDER AND IT MATTERS: owner beats a personal grant beats
-- a class grant. A student holding a personal 'editor' grant who is also in a
-- class the document was shared with must keep 'editor' -- coalesce is what
-- makes the personal row win, and reversing the two arms would silently demote
-- them to a viewer with nothing on screen to say why their saves started
-- refusing.
--
-- THE CLASS RUNG READS ce.active. A student removed from the class stops
-- reading the reference work in the same statement that deactivates them, which
-- is the property a snapshot fan-out could not have had.
--
-- IT RETURNS THE LITERAL 'viewer' RATHER THAN A COLUMN, because there is no
-- role column to read -- see section 3.
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

-- 0205's write rule, with the archive term. Both operands are non-null
-- booleans, so the result cannot be null and no caller's `if not` can fall
-- through it.
create or replace function public._ideacad_can_write_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $canwrite$
	select coalesce(public._ideacad_document_role(p_document_id) in ('owner', 'editor'), false)
		and not public._ideacad_document_archived(p_document_id);
$canwrite$;

-- 0207's assembly-owner rule, with the SAME term. Its name is now slightly
-- narrower than its body -- see the header. 0207's body is otherwise verbatim,
-- including the current_user_email() <> '' guard, which is what keeps a caller
-- with no session from matching a row whose student_email is somehow empty.
--
-- REPLACED ONLY IF IT IS ALREADY THERE. See section 1: on a database without
-- 0207 this creates nothing, because a function created here would either be
-- an un-narrowed copy standing in 0207's way or a narrowed one 0207 would
-- silently replace -- and neither is better than the notice section 1 raises.
-- The `execute` is what makes that conditional; the body inside it is byte for
-- byte what an unconditional create would have written.
do $partownerwrap$
begin
	if to_regprocedure('public._ideacad_part_owner(uuid)') is null then
		return;
	end if;
	execute $partowner$
create or replace function public._ideacad_part_owner(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $partownerbody$
	select exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id
			and d.student_email = public.current_user_email()
			and public.current_user_email() <> ''
	)
	and not public._ideacad_document_archived(p_document_id);
$partownerbody$;
	$partowner$;
end
$partownerwrap$;


-- ---------------------------------------------------------------------------
-- 5. THE ARCHIVE PATH.
--
--    ONE function for both directions, which is foundry_set_app_hidden's shape
--    and is here for its reason: an archive that could not be undone by the
--    same call is a one-way door, and a Restore control with no function behind
--    it is worse than no control.
--
--    IT IS AN INSTRUCTOR'S ACT AND NOTHING ELSE CALLS IT. No trigger, no
--    cascade, no enrollment change reaches it. A silent archive is the defect
--    0213 just closed wearing a different hat.
--
--    A MISSING DOCUMENT AND ONE THE CALLER DOES NOT MANAGE ANSWER IDENTICALLY,
--    so a uuid cannot be probed. This is the same sentence
--    ideacad_open_shared_document uses.
--
--    archived_at IS NOT MOVED BY A SECOND ARCHIVE. coalesce keeps the original
--    stamp, so the column answers "when was this archived" rather than "when
--    was the button last pressed". The same goes for archived_by.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_set_document_archived(
	p_document_id uuid,
	p_archived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $setarchived$
declare
	v_email text := public.current_user_email();
	d public.ideacad_documents;
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_archived is null then
		raise exception 'Say whether to archive this document or restore it.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or not public._classroom_manages_item(d.item_id) then
		raise exception 'That document does not exist.';
	end if;

	if p_archived then
		update public.ideacad_documents
		set archived_at = coalesce(archived_at, now()),
			archived_by = coalesce(archived_by, v_email)
		where id = p_document_id
		returning * into d;
	else
		-- Restoring drops the class grants with it, and that is the decision
		-- rather than an omission: narrowing (b) says a class grant is only
		-- available on an ARCHIVED document, so a restored document holding one
		-- would be a live student's work shared with a whole class through a
		-- door that is closed to every other route. Re-archiving therefore does
		-- NOT bring the old grants back, which is the safe direction.
		delete from public.ideacad_section_grants where document_id = p_document_id;
		update public.ideacad_documents
		set archived_at = null, archived_by = null
		where id = p_document_id
		returning * into d;
	end if;

	return jsonb_build_object('ok', true, 'document', to_jsonb(d));
end
$setarchived$;


-- ---------------------------------------------------------------------------
-- 6. THE INSTRUCTOR READ, KEYED ON THE ITEM.
--
--    A SECOND FUNCTION AND NOT A PARAMETER ON ideacad_roster, for decision 29's
--    structural reason: that function's driving set IS the enrollment, so a
--    document belonging to nobody currently enrolled is invisible to it by
--    construction and no flag can change that.
--
--    IT LISTS TWO POPULATIONS AND SAYS WHICH IS WHICH. `archived` is a document
--    somebody deliberately archived. `off_roster` is a document whose owner has
--    no enrollment row in any section the item is posted to -- the orphans 0213
--    can no longer create and cannot retroactively find, which before this
--    function were in the table and on no surface at all. A row can be both;
--    `archived` wins the label, because it is the deliberate one.
--
--    THE reason FIELD IS NOT A FILTER AND MUST NOT BECOME ONE. An instructor
--    opening the archive wants everything the roster cannot show them, and
--    splitting it into two calls is how one of them stops being read.
--
--    conceptCount COUNTS LIVE CONCEPTS ONLY (deleted_at is null), matching what
--    ideacad_roster and ideacad_open_shared_document return, so the number
--    beside a row is the number of concepts opening it will show.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_archive(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $archive$
begin
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only a teacher for this class can open the archive.';
	end if;
	return (
		select coalesce(jsonb_agg(jsonb_build_object(
			'documentId', d.id,
			'ownerEmail', d.student_email,
			'archivedAt', d.archived_at,
			'archivedBy', d.archived_by,
			'onRoster', r.enrolled,
			'reason', case when d.archived_at is not null then 'archived' else 'off_roster' end,
			'conceptCount', (
				select count(*) from public.ideacad_concepts c
				where c.document_id = d.id and c.deleted_at is null
			),
			'updatedAt', d.updated_at,
			'sharedWithSections', (
				select coalesce(jsonb_agg(jsonb_build_object(
					'sectionId', s.id,
					'label', s.label,
					'grantedBy', sg.granted_by,
					'grantedAt', sg.granted_at
				) order by s.label), '[]')
				from public.ideacad_section_grants sg
				join public.classroom_sections s on s.id = sg.section_id
				where sg.document_id = d.id
			)
		) order by d.student_email), '[]')
		from public.ideacad_documents d
		cross join lateral (
			select exists (
				select 1
				from public.classroom_postings cp
				join public.classroom_enrollments ce on ce.section_id = cp.section_id
				where cp.item_id = p_item_id and ce.student_email = d.student_email
			) as enrolled
		) r
		where d.item_id = p_item_id
			and (d.archived_at is not null or not r.enrolled)
	);
end
$archive$;


-- ---------------------------------------------------------------------------
-- 7. THE CLASS GRANT FUNCTIONS, AND THE TWO READS THAT HAVE TO LEARN ABOUT
--    THEM.
--
--    Every one takes NO identity parameter. The caller is
--    current_user_email() and the manage checks are asked of them, so "can only
--    act as themselves" is a property of the signature.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_share_document_with_section(
	p_document_id uuid,
	p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $sharesection$
declare
	v_email text := public.current_user_email();
	d public.ideacad_documents;
	g public.ideacad_section_grants;
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id;
	-- Not found and not managed answer identically, so a uuid cannot be probed.
	if not found or not public._classroom_manages_item(d.item_id) then
		raise exception 'That document does not exist.';
	end if;
	-- Narrowing (b). The owner-only default this reverses was written for LIVE
	-- work, and it still holds for live work.
	if d.archived_at is null then
		raise exception 'Archive this document first. Sharing with a whole class is for archived reference work.';
	end if;
	-- Narrowing (c). Same population ideacad_share_document computes, so a
	-- class outside the item's own postings is refused rather than merely
	-- unlikely.
	if not exists (
		select 1 from public.classroom_postings cp
		where cp.item_id = d.item_id and cp.section_id = p_section_id
	) then
		raise exception 'You can only share this with a class this assignment is posted to.';
	end if;
	-- The second manage check. Managing the ITEM is not managing every section
	-- somebody might name, and this is what stops an instructor pushing work
	-- into a colleague's class.
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section''s teacher of record or a site admin can share work with that class.';
	end if;

	insert into public.ideacad_section_grants(document_id, section_id, granted_by)
	values (d.id, p_section_id, v_email)
	on conflict (document_id, section_id) do update
		set granted_by = excluded.granted_by
	returning * into g;
	return jsonb_build_object('ok', true, 'grant', to_jsonb(g));
end
$sharesection$;

create or replace function public.ideacad_unshare_document_from_section(
	p_document_id uuid,
	p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $unsharesection$
declare
	v_email text := public.current_user_email();
	d public.ideacad_documents;
	v_removed integer;
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id;
	if not found or not public._classroom_manages_item(d.item_id) then
		raise exception 'That document does not exist.';
	end if;
	-- NO ARCHIVED CHECK AND NO POSTING CHECK ON THE WAY OUT. Taking access away
	-- must never be refused by a precondition that has since stopped holding --
	-- a document restored while a grant existed, or a section the item was
	-- unposted from, would otherwise be a grant nobody could remove.
	delete from public.ideacad_section_grants
	where document_id = p_document_id and section_id = p_section_id;
	get diagnostics v_removed = row_count;
	-- Removing a grant that is not there is not an error: the instructor asked
	-- for that class not to have access and that class does not have access.
	return jsonb_build_object('ok', true, 'removed', v_removed);
end
$unsharesection$;

-- What an instructor has shared, on one document. The owner is admitted too,
-- through _ideacad_manages_document -- if their own work has been handed to a
-- class they are entitled to know which one.
create or replace function public.ideacad_document_section_grants(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $sectiongrants$
begin
	if coalesce(public.current_user_email(), '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if not public._ideacad_manages_document(p_document_id) then
		raise exception 'You can only read sharing on your own document.';
	end if;
	return (
		select coalesce(jsonb_agg(jsonb_build_object(
			'sectionId', s.id,
			'label', s.label,
			'grantedBy', sg.granted_by,
			'grantedAt', sg.granted_at
		) order by s.label), '[]')
		from public.ideacad_section_grants sg
		join public.classroom_sections s on s.id = sg.section_id
		where sg.document_id = p_document_id
	);
end
$sectiongrants$;

-- 0205's discovery function, unioned with the class grants.
--
-- WITHOUT THIS THE FEATURE IS UNREACHABLE. A recipient has no other way to
-- learn a document id: the roster is teacher-only and a classmate's document is
-- on no surface they can already read. Narrowing (c) is what lets this stay ONE
-- function keyed on the item rather than a second one keyed on a section.
--
-- THE ROWS GAIN `via` AND LOSE NOTHING, so a client that has not been
-- redeployed reads the five keys it always read.
--
-- A PERSON GRANT WINS A DUPLICATE, matching _ideacad_document_role's own
-- ordering: distinct on the document, person rows first. Without that term a
-- student holding an editor grant on a document their class also has would see
-- one row saying 'viewer' and another saying 'editor', in an order nothing
-- pins.
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
					g.granted_at, d.updated_at, 'person' as via, 0 as rank
				from public.ideacad_grants g
				join public.ideacad_documents d on d.id = g.document_id
				where g.grantee_email = v_email and d.item_id = p_item_id
				union all
				select d.id, d.student_email, 'viewer',
					sg.granted_at, d.updated_at, 'class', 1
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

-- 0205's open-a-shared-document payload, told about the archive.
--
-- THIS ONE IS A DEFECT AND NOT A WIDENING, and it was found by a test rather
-- than by reading. 0205 computes canWrite from the ROLE alone --
-- `coalesce(v_role in (''owner'', ''editor''), false)` -- and NOT from
-- _ideacad_can_write_document. So with the archive term added to that predicate
-- and nowhere else, an archived document answered `canWrite: true` to its own
-- owner while every single write refused: the surface would draw a full set of
-- editing controls whose only possible outcome is a refusal, which is the exact
-- failure "a control whose only outcome is a refusal must not be offered"
-- names. It now asks the SAME predicate the writes ask, so the payload and the
-- database cannot disagree.
--
-- AND IT PROJECTS `archived`, because "you cannot write this" and "this is
-- archived" are different sentences and a reader needs the second one. A
-- surface with only the first has to guess why.
--
-- THE ROLE IS UNCHANGED. An archived document''s owner is still its owner, and
-- a class grantee is still a viewer; what moved is only whether writing is
-- offered. Collapsing the role to null would take the document off
-- ideacad_shared_with_me and out of every read, which is the opposite of
-- decision 29.
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
		'canWrite', public._ideacad_can_write_document(p_document_id),
		'archived', d.archived_at is not null,
		'archivedAt', d.archived_at
	);
end
$openshared$;

-- 0201's roster, projecting the new state.
--
-- 0201's BODY VERBATIM apart from one key. The driving set, the left join, the
-- ordering, the concept filter and the prediction subquery are unchanged and
-- were diffed against 0201 to confirm it -- this function is NOT the archive
-- surface and must not become one, because its driving set cannot reach a
-- document whose owner has left.
--
-- WHY IT CHANGES AT ALL: an archived document whose owner IS still enrolled
-- stays on this list, and a live roster that renders it identically to a live
-- one is a teacher wondering why a student's saves are refusing. archivedAt
-- sits BESIDE the document rather than inside it because to_jsonb(d) already
-- carries the column -- the top-level key is what a surface can read without
-- knowing the row shape, and both agreeing is free.
create or replace function public.ideacad_roster(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $roster$
begin
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only a teacher for this class can open the live roster.';
	end if;
	return (
		select coalesce(jsonb_agg(jsonb_build_object(
			'studentEmail', e.student_email,
			'document', to_jsonb(d),
			'archivedAt', d.archived_at,
			'concepts', coalesce((
				select jsonb_agg(to_jsonb(c) order by c.position)
				from public.ideacad_concepts c
				where c.document_id = d.id and c.deleted_at is null
			), '[]'),
			'prediction', (
				select to_jsonb(p) from public.ideacad_predictions p where p.document_id = d.id
			)
		) order by e.student_email), '[]')
		from (
			select distinct ce.student_email
			from public.classroom_postings cp
			join public.classroom_enrollments ce on ce.section_id = cp.section_id
			where cp.item_id = p_item_id
		) e
		left join public.ideacad_documents d
			on d.item_id = p_item_id and d.student_email = e.student_email
	);
end
$roster$;


-- ---------------------------------------------------------------------------
-- 8. THE GRANTS, in 0166's shape. See the header for why the bare
--    `from public` form is not a narrowing on this project.
-- ---------------------------------------------------------------------------

-- The predicates. _ideacad_document_archived is reached only from SECURITY
-- DEFINER bodies (the two write gates), never from a policy and never from a
-- client, so no client role gets it -- the same call 0205 made for
-- _ideacad_document_role and _ideacad_can_write_document, which keep exactly
-- the grants 0205 gave them.
revoke all on function
	public._ideacad_document_archived(uuid),
	public._ideacad_document_role(uuid),
	public._ideacad_can_write_document(uuid)
	from public, anon, authenticated, service_role;

grant execute on function
	public._ideacad_document_archived(uuid),
	public._ideacad_document_role(uuid),
	public._ideacad_can_write_document(uuid)
	to service_role;

-- 0207's predicate, on the same ladder as its replacement in section 4: a
-- statement naming a function that is not there is a syntax-level failure, not
-- a no-op, so it cannot sit in the list above.
do $partownergrant$
begin
	if to_regprocedure('public._ideacad_part_owner(uuid)') is null then
		return;
	end if;
	revoke all on function public._ideacad_part_owner(uuid)
		from public, anon, authenticated, service_role;
	grant execute on function public._ideacad_part_owner(uuid) to service_role;
end
$partownergrant$;

-- The client RPCs, including the two replaced reads.
revoke all on function
	public.ideacad_set_document_archived(uuid,boolean),
	public.ideacad_archive(uuid),
	public.ideacad_share_document_with_section(uuid,uuid),
	public.ideacad_unshare_document_from_section(uuid,uuid),
	public.ideacad_document_section_grants(uuid),
	public.ideacad_shared_with_me(uuid),
	public.ideacad_open_shared_document(uuid),
	public.ideacad_roster(uuid)
	from public, anon, authenticated, service_role;

grant execute on function
	public.ideacad_set_document_archived(uuid,boolean),
	public.ideacad_archive(uuid),
	public.ideacad_share_document_with_section(uuid,uuid),
	public.ideacad_unshare_document_from_section(uuid,uuid),
	public.ideacad_document_section_grants(uuid),
	public.ideacad_shared_with_me(uuid),
	public.ideacad_open_shared_document(uuid),
	public.ideacad_roster(uuid)
	to authenticated, service_role;

-- The table. SELECT for authenticated is what makes the RLS policy in section 3
-- mean "your own class's rows, or the list on a document you manage"; RLS
-- covers none of TRUNCATE, REFERENCES or TRIGGER, which is why the revoke has
-- to name them rather than being left to the policy. Nothing writes this table
-- but the two SECURITY DEFINER functions above, so there is no insert, update
-- or delete grant to any client role and no write policy at all.
revoke all on table public.ideacad_section_grants from public, anon, authenticated, service_role;
grant select on table public.ideacad_section_grants to authenticated;


-- ---------------------------------------------------------------------------
-- 9. THE SELF-CHECK. 0131's convention: read the catalog back rather than
--    trust that the statements above ran. It raises, so a partial apply cannot
--    look like a clean one and the whole file rolls back.
--
--    IT ASSERTS THE ACL, NOT THE REVOKE'S VERDICT. A revoke that removed
--    nothing and a revoke that removed the right thing are the same statement
--    from the outside; has_function_privilege is what tells them apart.
--
--    AND IT CARRIES A POSITIVE CONTROL. A sweep that found no anon grant
--    because it was looking in the wrong place reports exactly what a clean
--    database reports.
-- ---------------------------------------------------------------------------

do $check$
declare
	r record;
	v_missing text[] := '{}';
	v_anon text[] := '{}';
	v_wide text[] := '{}';
	v_arity integer;
	v_control boolean;
	v_src text;
	v_seen integer := 0;
	-- Every function this file creates or replaces, with the client role each
	-- should end up holding.
	v_client text[] := array[
		'public.ideacad_set_document_archived(uuid,boolean)',
		'public.ideacad_archive(uuid)',
		'public.ideacad_share_document_with_section(uuid,uuid)',
		'public.ideacad_unshare_document_from_section(uuid,uuid)',
		'public.ideacad_document_section_grants(uuid)',
		'public.ideacad_shared_with_me(uuid)',
		'public.ideacad_open_shared_document(uuid)',
		'public.ideacad_roster(uuid)'
	];
	-- _ideacad_part_owner joins this list only where 0207 put it there. See
	-- section 1: on a chain without 0207 this file narrows no assembly gate,
	-- and asserting one it deliberately did not write would be a check that
	-- refuses a supported state.
	v_definer text[] := array[
		'public._ideacad_document_archived(uuid)',
		'public._ideacad_document_role(uuid)',
		'public._ideacad_can_write_document(uuid)'
	] || case
		when to_regprocedure('public._ideacad_part_owner(uuid)') is null then '{}'::text[]
		else array['public._ideacad_part_owner(uuid)']
	end;
	v_has_parts boolean := to_regprocedure('public._ideacad_part_owner(uuid)') is not null;
	v_sig text;
begin
	-- (a) THE INSTRUMENT CONTROL, read FIRST, so a broken sweep cannot be
	--     reported as a clean one. app_short_link_target is granted to anon on
	--     purpose (0137 keeps it: a printed handout resolves before any
	--     session exists), so it reads true on every correct database.
	select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute')
		into v_control;
	if v_control is distinct from true then
		raise exception '0214: the positive control failed -- app_short_link_target does not read as anon-executable, so this file cannot tell an anon grant from its absence and none of the checks below mean anything.';
	end if;

	-- (b) THE COLUMNS AND THE TABLE.
	if not exists (
		select 1 from pg_attribute
		where attrelid = 'public.ideacad_documents'::regclass
			and attname = 'archived_at' and not attisdropped
	) or not exists (
		select 1 from pg_attribute
		where attrelid = 'public.ideacad_documents'::regclass
			and attname = 'archived_by' and not attisdropped
	) then
		raise exception '0214: ideacad_documents is missing archived_at or archived_by.';
	end if;
	if to_regclass('public.ideacad_section_grants') is null then
		raise exception '0214: public.ideacad_section_grants was not created.';
	end if;
	if not exists (
		select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = 'ideacad_section_grants' and c.relrowsecurity
	) then
		raise exception '0214: row level security is not enabled on ideacad_section_grants. Without it the authenticated SELECT grant is every row in the table.';
	end if;
	-- THE SCHEMA IS THE GUARANTEE THAT A CLASS IS ALWAYS A VIEWER. A role
	-- column added later would make narrowing (a) a check somebody could get
	-- wrong, so its ABSENCE is asserted rather than left to a reader.
	if exists (
		select 1 from pg_attribute
		where attrelid = 'public.ideacad_section_grants'::regclass
			and attname = 'role' and not attisdropped
	) then
		raise exception '0214: ideacad_section_grants has a role column. A class grant is always a viewer, and that is meant to be a property of the schema rather than a check.';
	end if;

	-- (c) EXACTLY ONE ARITY FOR EACH REPLACED NAME. A surviving second arity is
	--     the signature trap, and a count of two passes on exactly the
	--     arrangement that breaks every call.
	for r in
		select unnest(array[
			'_ideacad_document_role', '_ideacad_can_write_document',
			'ideacad_roster', 'ideacad_shared_with_me', 'ideacad_open_shared_document',
			'_ideacad_document_archived', 'ideacad_set_document_archived',
			'ideacad_archive', 'ideacad_share_document_with_section',
			'ideacad_unshare_document_from_section', 'ideacad_document_section_grants'
		] || case when v_has_parts then array['_ideacad_part_owner'] else '{}'::text[] end) as nm
	loop
		select count(*) into v_arity
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = r.nm;
		if v_arity <> 1 then
			raise exception '0214: expected exactly one public.%, found %. A surviving second arity is the signature trap.', r.nm, v_arity;
		end if;
	end loop;

	-- (d) THE ARCHIVE TERM IS IN BOTH WRITE GATES. Narrowing only the first
	--     leaves four owner-gated part writes open on an archived document --
	--     see the header. Read out of prosrc, so this is what is DEPLOYED and
	--     not what this file intended.
	for r in select unnest(
		array['_ideacad_can_write_document']
		|| case when v_has_parts then array['_ideacad_part_owner'] else '{}'::text[] end
	) as nm
	loop
		select p.prosrc into v_src
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = r.nm;
		if position('_ideacad_document_archived' in v_src) = 0 then
			raise exception '0214: the deployed public.% does not call _ideacad_document_archived, so an archived document is still writable through it.', r.nm;
		end if;
	end loop;

	-- (e) THE READ SIDE IS UNTOUCHED. "Keeps being READABLE" is structural only
	--     if the archive term is genuinely absent from the read predicate.
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_ideacad_can_read_document';
	if v_src is null then
		raise exception '0214: public._ideacad_can_read_document is missing. 0205 creates it.';
	end if;
	if position('archived' in v_src) > 0 then
		raise exception '0214: _ideacad_can_read_document mentions the archive. An archived document must KEEP being readable -- that is the whole of decision 29.';
	end if;

	-- (f) THE CENSUS THIS FILE MUST NOT HAVE TOUCHED. 0213 may or may not be
	--     applied here; either way this file must not have redefined it, and
	--     an archived_at term inside it would be exactly the weakening the
	--     header refuses. Skipped, with a notice, when the function is absent.
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment';
	if v_src is null then
		raise notice '0214: NOTE -- public.classroom_remove_enrollment is not on this database, so the census check below was skipped. 0138 creates it and 0213 widens it.';
	elsif position('archived' in v_src) > 0 then
		raise exception '0214: classroom_remove_enrollment mentions the archive. Archiving must NOT unlock a removal -- a student with IdeaCAD work is refused before this file and after it.';
	end if;

	-- (g) THE anon CHECK, OVER THE FUNCTIONS THIS FILE WRITES AND NO OTHERS.
	--
	--     IT USED TO SWEEP THE WHOLE ^_?ideacad PREFIX AND THAT WAS WRONG, in
	--     the exact way 0206's own header names: an apply-time guard that
	--     sweeps a whole subsystem is asserting something about migrations
	--     that are not this file's. Measured rather than reasoned about --
	--     tests/db/ideacad-grants-anon-execute-surface.test.ts deliberately
	--     builds a chain with 0202 AND 0206 left out, to reproduce the defect
	--     0202 repaired as its own negative control, and the prefix sweep
	--     REFUSED TO APPLY there over nine 0201 functions this file never
	--     touches. A migration that cannot apply to a database because a file
	--     BEFORE it is missing its repair is a migration holding somebody
	--     else's ground.
	--
	--     0206 is the file that owns the subsystem-wide sweep, it is applied,
	--     and section D of that same test runs it over the database this one
	--     builds. Duplicating it here would also be a second copy of one rule.
	for r in
		select sig, has_function_privilege('anon', sig, 'execute') as anon_x
		from unnest(v_client || v_definer) as sig
		where to_regprocedure(sig) is not null
	loop
		v_seen := v_seen + 1;
		if r.anon_x then
			v_anon := v_anon || r.sig;
		end if;
	end loop;
	if v_seen = 0 then
		raise exception '0214: the anon check examined no function at all, which cannot be true after the statements above. It is not looking where it thinks it is.';
	end if;
	if array_length(v_anon, 1) is not null then
		raise exception '0214: % of this file''s own function(s) are executable by anon: %. Revoke in 0166 shape -- name public, anon, authenticated, service_role, then grant back.',
			array_length(v_anon, 1), array_to_string(v_anon, ', ');
	end if;

	-- (h) THE GRANTS THIS FILE OWES, in both directions.
	foreach v_sig in array v_client loop
		if to_regprocedure(v_sig) is null then
			v_missing := v_missing || v_sig;
		elsif not has_function_privilege('authenticated', v_sig, 'execute') then
			v_missing := v_missing || (v_sig || ' (authenticated cannot execute it)');
		end if;
	end loop;
	foreach v_sig in array v_definer loop
		if to_regprocedure(v_sig) is null then
			v_missing := v_missing || v_sig;
		elsif has_function_privilege('authenticated', v_sig, 'execute') then
			v_wide := v_wide || v_sig;
		end if;
	end loop;
	if array_length(v_missing, 1) is not null then
		raise exception '0214: % client function(s) are missing or ungranted: %.',
			array_length(v_missing, 1), array_to_string(v_missing, ', ');
	end if;
	if array_length(v_wide, 1) is not null then
		raise exception '0214: % definer-only predicate(s) hold the authenticated grant: %. No policy names any of them, so no client role should reach them.',
			array_length(v_wide, 1), array_to_string(v_wide, ', ');
	end if;

	-- (i) THE TABLE ACL, both directions.
	if not has_table_privilege('authenticated', 'public.ideacad_section_grants', 'SELECT') then
		raise exception '0214: authenticated LOST select on ideacad_section_grants. The RLS policy is what makes that grant mean "your own class''s rows"; without it the feature is down rather than narrowed.';
	end if;
	for r in
		select rp.role_name, rp.priv
		from (values ('anon'), ('authenticated'), ('service_role')) as rp0(role_name)
		cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
			('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as rp1(priv)
		cross join lateral (select rp0.role_name, rp1.priv) rp
		where has_table_privilege(rp.role_name, 'public.ideacad_section_grants'::regclass, rp.priv)
			and not (rp.role_name = 'authenticated' and rp.priv = 'SELECT')
	loop
		v_wide := v_wide || format('%s on ideacad_section_grants to %s', r.priv, r.role_name);
	end loop;
	if array_length(v_wide, 1) is not null then
		raise exception '0214: % client table privilege(s) on ideacad_section_grants survive beyond authenticated SELECT: %.',
			array_length(v_wide, 1), array_to_string(v_wide, ', ');
	end if;

	raise notice '0214: archived_at and archived_by on ideacad_documents; ideacad_section_grants with RLS and no role column; the archive term in the concept write gate and in NEITHER read predicate; the assembly write gate %; % of this file''s own function(s) checked, 0 executable by anon; 8 client functions granted to authenticated, % definer-only predicate(s) withheld from it.',
		case when v_has_parts then 'narrowed too' else 'SKIPPED -- 0207 is not on this database' end,
		v_seen, coalesce(array_length(v_definer, 1), 0);
end
$check$;


-- ---------------------------------------------------------------------------
-- 10. WHAT IS ALREADY IN THIS STATE, against the real table, at apply time.
--
--     NAMED RATHER THAN COUNTED, for 0138's reason: a number tells an operator
--     nothing they can act on, and the whole point is that somebody has to
--     decide about each of these. It WRITES NOTHING -- whether an orphan is
--     reference work worth archiving is a person's call with the list in front
--     of them, and a migration that guessed would be the silent archive this
--     file exists to refuse.
-- ---------------------------------------------------------------------------

do $report$
declare
	v_orphans integer;
	v_who text;
	v_archived integer;
begin
	select count(*), coalesce(string_agg(
		x.student_email || ' on "' || x.title || '" (' || x.concepts || ' concept(s))',
		'; ' order by x.student_email
	), '(none)')
	into v_orphans, v_who
	from (
		select d.student_email, i.title,
			(select count(*) from public.ideacad_concepts c
			  where c.document_id = d.id and c.deleted_at is null) as concepts
		from public.ideacad_documents d
		join public.classroom_items i on i.id = d.item_id
		where not exists (
			select 1
			from public.classroom_postings cp
			join public.classroom_enrollments ce on ce.section_id = cp.section_id
			where cp.item_id = d.item_id and ce.student_email = d.student_email
		)
	) x;

	select count(*) into v_archived
	from public.ideacad_documents where archived_at is not null;

	raise notice '0214: % IdeaCAD document(s) belong to somebody with no enrollment on the item and were on no surface before this file: %. They are listed by ideacad_archive from now on, under reason off_roster. Nothing here archived any of them -- that is a decision to make with this list in front of you.',
		v_orphans, v_who;
	raise notice '0214: % document(s) carry archived_at. On a first apply that is always 0, because this file backfills nothing.', v_archived;
end
$report$;


-- ---------------------------------------------------------------------------
-- 11. VERIFICATION QUERY. Run it in a NEW SQL editor tab after this file has
--     applied.
--
--     IT RETURNS ROWS. The Supabase editor shows only the LAST statement's
--     result set and displays no notice and no warning at all, so a check
--     written as a raise is a check nobody sees -- which is why sections 9 and
--     10 above cannot be the verification and this is.
--
--     IT NAMES WHAT IT EXAMINED rather than answering a bare count: each column
--     and table by name, the archive term read out of each deployed write gate
--     one at a time, its ABSENCE from the read predicate, the absence of a role
--     column, the arity of every replaced function, both grant directions, and
--     the 0213 census left alone. The last row is a POSITIVE CONTROL: if it
--     does not read true the instrument cannot see a grant at all and every
--     other row above it is meaningless.
--
--     It is safe to leave here as a comment because it is plain SELECT and
--     carries no dollar-quote token; the splitter trap that cost 0194 an apply
--     cycle needs one.
--
-- select 'column: ideacad_documents.archived_at' as examined,
--        (select count(*) = 1 from information_schema.columns
--          where table_schema = 'public' and table_name = 'ideacad_documents'
--            and column_name = 'archived_at') as ok
-- union all select 'column: ideacad_documents.archived_by',
--        (select count(*) = 1 from information_schema.columns
--          where table_schema = 'public' and table_name = 'ideacad_documents'
--            and column_name = 'archived_by')
-- union all select 'table: ideacad_section_grants exists with RLS on',
--        (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
--          where n.nspname = 'public' and c.relname = 'ideacad_section_grants')
-- union all select 'schema: ideacad_section_grants has NO role column (a class is always a viewer)',
--        (select count(*) = 0 from information_schema.columns
--          where table_schema = 'public' and table_name = 'ideacad_section_grants'
--            and column_name = 'role')
-- union all select 'write gate: _ideacad_can_write_document calls _ideacad_document_archived',
--        (select position('_ideacad_document_archived' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = '_ideacad_can_write_document')
-- union all select 'write gate: _ideacad_part_owner calls _ideacad_document_archived',
--        (select position('_ideacad_document_archived' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = '_ideacad_part_owner')
-- union all select 'read side: _ideacad_can_read_document does NOT mention the archive',
--        (select position('archived' in p.prosrc) = 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = '_ideacad_can_read_document')
-- union all select 'role: _ideacad_document_role reads ideacad_section_grants',
--        (select position('ideacad_section_grants' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = '_ideacad_document_role')
-- union all select 'discovery: ideacad_shared_with_me unions the class grants',
--        (select position('ideacad_section_grants' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'ideacad_shared_with_me')
-- union all select 'roster: ideacad_roster projects archivedAt',
--        (select position('archivedAt' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'ideacad_roster')
-- union all select 'census: classroom_remove_enrollment still has NO archive term (0213 unweakened)',
--        (select position('archived' in p.prosrc) = 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment')
-- union all select 'arity: exactly one row for each of the twelve names this file writes',
--        (select count(*) = 12 from (
--           select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'public' and p.proname in (
--              '_ideacad_document_archived', '_ideacad_document_role',
--              '_ideacad_can_write_document', '_ideacad_part_owner',
--              'ideacad_set_document_archived', 'ideacad_archive',
--              'ideacad_share_document_with_section',
--              'ideacad_unshare_document_from_section',
--              'ideacad_document_section_grants', 'ideacad_shared_with_me',
--              'ideacad_open_shared_document', 'ideacad_roster')
--            group by p.proname having count(*) = 1) one)
-- union all select 'payload: ideacad_open_shared_document reads the write GATE, not the role',
--        (select position('_ideacad_can_write_document' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'ideacad_open_shared_document')
-- union all select 'grant: anon can execute NONE of the eight client functions',
--        (select bool_and(not has_function_privilege('anon', sig, 'execute')) from unnest(array[
--           'public.ideacad_set_document_archived(uuid,boolean)', 'public.ideacad_archive(uuid)',
--           'public.ideacad_share_document_with_section(uuid,uuid)',
--           'public.ideacad_unshare_document_from_section(uuid,uuid)',
--           'public.ideacad_document_section_grants(uuid)',
--           'public.ideacad_shared_with_me(uuid)',
--           'public.ideacad_open_shared_document(uuid)', 'public.ideacad_roster(uuid)']) as sig)
-- union all select 'grant: authenticated CAN execute all eight',
--        (select bool_and(has_function_privilege('authenticated', sig, 'execute')) from unnest(array[
--           'public.ideacad_set_document_archived(uuid,boolean)', 'public.ideacad_archive(uuid)',
--           'public.ideacad_share_document_with_section(uuid,uuid)',
--           'public.ideacad_unshare_document_from_section(uuid,uuid)',
--           'public.ideacad_document_section_grants(uuid)',
--           'public.ideacad_shared_with_me(uuid)',
--           'public.ideacad_open_shared_document(uuid)', 'public.ideacad_roster(uuid)']) as sig)
-- union all select 'grant: authenticated holds SELECT on ideacad_section_grants and nothing else',
--        (has_table_privilege('authenticated', 'public.ideacad_section_grants', 'SELECT')
--         and not has_table_privilege('authenticated', 'public.ideacad_section_grants', 'INSERT')
--         and not has_table_privilege('anon', 'public.ideacad_section_grants', 'SELECT'))
-- union all select 'grant: anon holds nothing on this file''s four definer-only predicates',
--        (select bool_and(not has_function_privilege('anon', sig, 'execute')) from unnest(array[
--           'public._ideacad_document_archived(uuid)', 'public._ideacad_document_role(uuid)',
--           'public._ideacad_can_write_document(uuid)', 'public._ideacad_part_owner(uuid)']) as sig)
-- union all select 'POSITIVE CONTROL -- app_short_link_target IS anon-executable, so a grant is visible to this query at all',
--        has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute');
-- ---------------------------------------------------------------------------
