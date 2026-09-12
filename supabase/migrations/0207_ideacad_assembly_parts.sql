-- 0207_ideacad_assembly_parts.sql
--
-- Apply manually in the Supabase SQL editor, after 0205 and 0206.
-- DO NOT APPLY FROM THE SESSION CONTAINER. This environment cannot reach
-- production and must not try.
--
-- ---------------------------------------------------------------------------
-- THE BLOCKER THIS REMOVES, IN LEDGER 0179's OWN WORDS
-- ---------------------------------------------------------------------------
--
-- `ideacad_documents` holds EXACTLY ONE FEATURE TREE, so THERE IS NOTHING TO
-- CHECK OUT YET.
--
-- That reading was confirmed against 0201 before a line of this file was
-- written, and it is worth stating precisely because the schema LOOKS like it
-- already has several trees in it. It does: `ideacad_concepts` is one row per
-- feature tree and a document has many. But 0201's concepts are COMPETING
-- ALTERNATIVES OF ONE PART, not parts of one machine -- `ideacad_predictions`
-- exists to ask which of a student's concepts they think will win, and
-- `ideacad_documents.active_concept_id` names the single tree the editor is
-- showing. There is no row anywhere in 0201 that means "the hex shank" as
-- distinct from "the blade", so there is nothing a person could be given
-- exclusive hold of. A checkout needs a unit of ownership and the schema has
-- none.
--
-- MR. PINA'S DESIGN, 2026-09-12, in his terms: an assembly has several parts.
-- ONE PERSON HOLDS A PART AT A TIME -- industry checkout, not concurrent
-- editing of one part. He called concurrent editing of a single complex part a
-- real future feature and explicitly did NOT want it for IDEA-Blade. Switching
-- who holds what must be "extremely easy and intuitive". THE ASSEMBLY OWNER HAS
-- FULL CONTROL over who is editing what and can reassign teammates to parts
-- LIVE.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES
-- ---------------------------------------------------------------------------
--
--   1. `ideacad_parts` -- an ordered part list under a document. The document
--      IS the assembly; a part is the unit of work and the unit of checkout.
--   2. `ideacad_concepts.part_id` -- a concept now belongs to a PART, so each
--      part carries its own feature tree (and its own alternatives of it).
--   3. Every existing document becomes a ONE-PART assembly, backfilled, with
--      before-and-after counts raised as notices and asserted by the
--      self-check rather than assumed.
--   4. A transient exclusive HOLD on the part row: `held_by`, `held_at`,
--      `hold_beat_at`, `hold_revision`.
--   5. Nine RPCs, all new names, and four private predicates.
--
-- ---------------------------------------------------------------------------
-- IT DOES NOT REDEFINE ANY OF 0201's TEN FUNCTIONS, AND THAT IS A HARD
-- CONSTRAINT RATHER THAN A PREFERENCE
-- ---------------------------------------------------------------------------
--
-- 0205 replaces SEVEN of them to admit a shared editor. This file is pasted
-- AFTER 0205, so a `create or replace` of any of those seven here would revert
-- 0205's sharing widening silently -- the function would compile, the feature
-- would look present, and every grantee would start being refused again. So the
-- ten are left exactly as they are, and the compatibility this file owes them
-- is paid by a TRIGGER instead:
--
--   `_ideacad_concept_part_default` fills `part_id` on any insert that does not
--   name one, which is every insert 0201 writes. On a document with no parts it
--   CREATES the one-part assembly (this is the `ideacad_open_document` path for
--   a brand-new document). On a one-part document it points the concept at that
--   part. On a document with TWO OR MORE parts it RAISES, naming
--   `ideacad_new_part_concept`, because there is no honest way to guess which
--   part an unqualified concept belongs to.
--
-- So "the ten 0201 RPCs keep working on a single-part document" is literally
-- true, and the multi-part case fails LOUDLY instead of guessing. A trigger is
-- normally the wrong tool here -- CLAUDE.md's "derived, never stored" exists
-- because a trigger that stops firing leaves a subtly wrong value forever with
-- nothing to catch it. This one is the opposite shape: `part_id` is NOT NULL, so
-- a trigger that stops firing makes the insert FAIL, immediately and visibly.
-- It fills a column it cannot silently get wrong.
--
-- ---------------------------------------------------------------------------
-- CHECKOUT IS A TRANSIENT EXCLUSIVE CLAIM, NOT A STANDING GRANT
-- ---------------------------------------------------------------------------
--
-- The hold lives ON THE PART ROW, which is what makes the serialization
-- obvious: `select ... from ideacad_parts where id = p_part_id FOR UPDATE` is
-- the first statement of every function that changes a hold. There is exactly
-- one row to lock and it already exists, so this is not the count-then-insert
-- shape CLAUDE.md warns about -- a second claimant blocks on the lock, and when
-- it is released re-reads the committed row and sees the winner. Two students
-- pressing the same control cannot both acquire.
--
-- `hold_revision` is the generation counter and it is the NOTICE MECHANISM. It
-- increments every time the HOLDER CHANGES and never when the same person
-- merely extends. A client keeps the revision its claim returned and passes it
-- back to `ideacad_beat_part`; a heartbeat whose revision has moved answers
-- `{ok:false, reason:'lost'}` and names who holds it now. So a live
-- reassignment reaches the displaced holder through the poll floor, with no
-- dependence on realtime broadcast -- which is the same division of labour
-- 0201 already has (the database poll is the floor, broadcast is only the speed
-- layer, and no frame may write state). `ideacad_assembly` also returns
-- `holdRevisionTotal`, the sum over the assembly's parts, so a client watching
-- for "did anything move" compares one integer.
--
-- ---------------------------------------------------------------------------
-- THE STALENESS RULE IS THIS ASSISTANT'S, NOT MR. PINA'S. HE DID NOT SPECIFY
-- ONE.
-- ---------------------------------------------------------------------------
--
-- A holder who closes their laptop must not own a part for the rest of the
-- term, and nothing in his design says when a hold lapses. So:
--
--   A HOLD IS LIVE WHILE `hold_beat_at` IS WITHIN `_ideacad_hold_window()`,
--   WHICH IS TEN MINUTES. A LAPSED HOLD IS TAKEN OVER BY THE NEXT CLAIMANT.
--
-- Ten minutes because the client heartbeat is ten SECONDS
-- (`IDEACAD_HEARTBEAT_MS`), so a live tab is sixty beats inside the window and
-- survives a long wifi blip, a tab discarded under memory pressure and
-- restored, and a student thinking about a fillet without touching anything --
-- while a machine that was shut down frees its part inside one class period
-- rather than at the end of the unit. It is a number a person may want to
-- change; it is written down ONCE, in `_ideacad_hold_window()`, because "may a
-- new claimant take over" and "is my own hold still alive to extend" are the
-- same question about what one sitting is, and two literals in two functions is
-- how those two stop agreeing (the `_foundry_play_window()` lesson).
--
-- NOTHING SWEEPS LAPSED HOLDS. There is no cron in this repo and a stored
-- "expired" flag would be a derived value with nothing to keep it true. The
-- window is evaluated at read time, every time.
--
-- ---------------------------------------------------------------------------
-- WHO MAY CLAIM: A SELECT LADDER IN SQL, BECAUSE 0205 IS A SEPARATE PASTE
-- ---------------------------------------------------------------------------
--
-- Under 0201 alone, only the document's own student can write it, so "one
-- person at a time" would be vacuous. 0205 is what makes an assembly a team:
-- the owner shares the document with named classmates as `editor`, and
-- `_ideacad_can_write_document(uuid)` is its rule. This file therefore
-- DELEGATES to that predicate rather than restating it -- calling, never
-- copying -- but a deployment sitting between two hand-applied migrations is a
-- real state, so `_ideacad_part_writer` is written as a ladder: it asks
-- `to_regprocedure` whether 0205's predicate exists, uses it when it does, and
-- degrades to owner-only when it does not. Fail-closed in the degraded
-- direction, and the rung is exercised in both directions by
-- `tests/db/ideacad-assembly-claim-ladder.test.ts`.
--
-- A HOLD IS NECESSARY AND NOT SUFFICIENT, deliberately. Holding a part does not
-- grant the write; the write gate is still 0201's/0205's, on the concept path.
-- And `ideacad_assign_part` does NOT verify that the person named can write the
-- document, because there is no third-party form of 0205's rule to ask --
-- `_ideacad_document_role` reads `current_user_email()`. The owner's intention
-- is recorded and is visible in `ideacad_assembly`; reading a holder who cannot
-- yet write it is a state the owner created and can see.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT HERE
-- ---------------------------------------------------------------------------
--
--   * NO UI. `src/lib/ideacad/assembly.ts` carries the types, the channel name
--     and the pure predicates a client needs; no `.svelte` file is touched.
--   * NO PART DELETION and no part-level prediction. Both are real decisions
--     with their own answers for the work already stored.
--   * NO INSTRUCTOR FORCE PATH. `ideacad_assign_part` is the OWNER's, which is
--     Mr. Pina's own sentence. Ledger 0179 measured that a teacher cannot open
--     a student document at all (`_classroom_engine_student` raises for anyone
--     not enrolled), so a manager force here would grant a power with no
--     supported way to use it. Managers READ the assembly, as they read
--     everything else.
--   * NO REDEFINITION of `0202`'s or `0206`'s guard, and no sweep of any
--     ideacad function this file did not create. 0205 learned that the hard
--     way: a sweep over `^_?ideacad` falsified another migration's negative
--     control. Section 9's self-check HARD-FAILS on this file's own thirteen
--     objects and raises a NOTICE, by name, about anything else.
--
-- UNDO: drop the nine RPCs, the four predicates, the trigger and its function,
-- then `alter table public.ideacad_concepts drop column part_id` and
-- `drop table public.ideacad_parts`. Nothing 0201 or 0205 wrote is modified, so
-- there is nothing of theirs to restore.

begin;

-- ---------------------------------------------------------------------------
-- 1. PREFLIGHT. Refuse rather than half-apply.
-- ---------------------------------------------------------------------------

do $pre$
begin
	if to_regclass('public.ideacad_documents') is null
		or to_regclass('public.ideacad_concepts') is null then
		raise exception '0207 cannot apply: 0201 is missing (ideacad_documents / ideacad_concepts).';
	end if;
	if to_regprocedure('public.ideacad_open_document(uuid)') is null then
		raise exception '0207 cannot apply: 0201 is missing (ideacad_open_document).';
	end if;
	if to_regprocedure('public.touch_updated_at()') is null then
		raise exception '0207 cannot apply: touch_updated_at() is missing.';
	end if;
	if to_regprocedure('public.current_user_email()') is null
		or to_regprocedure('public._classroom_manages_item(uuid)') is null then
		raise exception '0207 cannot apply: 0067/0086 helpers are missing.';
	end if;
end;
$pre$;

-- ---------------------------------------------------------------------------
-- 2. THE BEFORE COUNTS. Read from the real tables, raised as notices, and
--    carried into the self-check in section 9 through a temp table so the
--    migration ASSERTS the backfill rather than reporting it.
-- ---------------------------------------------------------------------------

create temporary table _ideacad_0207_before(
	documents bigint not null,
	concepts bigint not null,
	parts bigint not null
) on commit drop;

do $before$
declare
	v_documents bigint;
	v_concepts bigint;
	v_parts bigint := 0;
begin
	select count(*) into v_documents from public.ideacad_documents;
	select count(*) into v_concepts from public.ideacad_concepts;
	if to_regclass('public.ideacad_parts') is not null then
		execute 'select count(*) from public.ideacad_parts' into v_parts;
	end if;
	insert into _ideacad_0207_before(documents, concepts, parts)
		values (v_documents, v_concepts, v_parts);
	raise notice '0207: BEFORE -- % ideacad document(s), % concept(s), % part(s).',
		v_documents, v_concepts, v_parts;
end;
$before$;

-- ---------------------------------------------------------------------------
-- 3. THE PART TABLE.
--
--    The hold columns are all-null or all-set, enforced by a CHECK, so "held
--    by nobody since a time" is not a representable state. `hold_revision`
--    survives a release: it counts holder CHANGES over the life of the part and
--    only ever increases, which is what lets a client compare it.
-- ---------------------------------------------------------------------------

create table if not exists public.ideacad_parts(
	id uuid primary key default gen_random_uuid(),
	document_id uuid not null references public.ideacad_documents(id) on delete cascade,
	position integer not null,
	name text not null check (length(btrim(name)) between 1 and 60),
	active_concept_id uuid,
	held_by text,
	held_at timestamptz,
	hold_beat_at timestamptz,
	hold_revision integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint ideacad_parts_hold_all_or_nothing check (
		(held_by is null and held_at is null and hold_beat_at is null)
		or (held_by is not null and held_at is not null and hold_beat_at is not null)
	)
);

create index if not exists ideacad_parts_document_position_idx
	on public.ideacad_parts(document_id, position);
create index if not exists ideacad_parts_held_by_idx
	on public.ideacad_parts(held_by) where held_by is not null;

drop trigger if exists ideacad_parts_touch on public.ideacad_parts;
create trigger ideacad_parts_touch before update on public.ideacad_parts
	for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. `ideacad_concepts.part_id`, AND THE BACKFILL THAT RUNS EXACTLY ONCE.
--
--    Guarded on the column's own existence, per CLAUDE.md: an unguarded
--    `update ... where part_id is null` on a second paste would be a no-op
--    today and is exactly the shape that rewrites real rows tomorrow. The whole
--    block is skipped once the column is there.
-- ---------------------------------------------------------------------------

do $backfill$
declare
	v_parts bigint;
	v_pointed bigint;
begin
	if exists (
		select 1 from pg_attribute
		where attrelid = 'public.ideacad_concepts'::regclass
			and attname = 'part_id'
			and not attisdropped
	) then
		raise notice '0207: ideacad_concepts.part_id already exists -- backfill skipped, this is a re-paste.';
		return;
	end if;

	alter table public.ideacad_concepts add column part_id uuid;

	-- The mutual reference between a part and its active concept, deferred
	-- exactly as 0201 defers the document's own. It is created BEFORE the
	-- backfill writes a part row: adding it afterwards is an ALTER TABLE against
	-- a table that already has pending deferred events, which Postgres refuses.
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_parts_active_concept_fkey'
			and conrelid = 'public.ideacad_parts'::regclass
	) then
		alter table public.ideacad_parts
			add constraint ideacad_parts_active_concept_fkey
			foreign key (active_concept_id) references public.ideacad_concepts(id)
			on delete set null deferrable initially deferred;
	end if;

	-- One part per document. Named "Part 1" because that is what a one-part
	-- assembly is; the owner renames it.
	insert into public.ideacad_parts(document_id, position, name, active_concept_id)
	select d.id, 1, 'Part 1', d.active_concept_id
	from public.ideacad_documents d
	where not exists (
		select 1 from public.ideacad_parts p where p.document_id = d.id
	);
	get diagnostics v_parts = row_count;

	-- Every concept joins its document's sole part. The join is on
	-- document_id, so a concept cannot land on another document's part.
	update public.ideacad_concepts c
	set part_id = p.id
	from public.ideacad_parts p
	where p.document_id = c.document_id
		and c.part_id is null;
	get diagnostics v_pointed = row_count;

	raise notice '0207: BACKFILL -- created % one-part assembly/assemblies, pointed % concept(s) at a part.',
		v_parts, v_pointed;
end;
$backfill$;

-- THE DEFERRED EVENTS THE BACKFILL QUEUED ARE FLUSHED HERE, AND THIS LINE IS
-- LOAD-BEARING RATHER THAN TIDY. Inserting a part whose `active_concept_id`
-- points at a concept row queues a deferred constraint check against
-- `ideacad_parts`, and Postgres then REFUSES any ALTER TABLE touching that
-- table -- including the `add constraint ... references public.ideacad_parts`
-- below, which has to install a trigger on it. Measured: without this the file
-- dies on `cannot ALTER TABLE "ideacad_parts" because it has pending trigger
-- events`. Every concept the checks reference exists by now, so bringing the
-- checks forward is a verification and not a relaxation.
set constraints all immediate;

-- On a RE-PASTE the block above returns early, so the deferred FK is asserted
-- here too. Idempotent either way.
do $fk$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_parts_active_concept_fkey'
			and conrelid = 'public.ideacad_parts'::regclass
	) then
		alter table public.ideacad_parts
			add constraint ideacad_parts_active_concept_fkey
			foreign key (active_concept_id) references public.ideacad_concepts(id)
			on delete set null deferrable initially deferred;
	end if;
end;
$fk$;

do $notnull$
begin
	if exists (
		select 1 from pg_attribute
		where attrelid = 'public.ideacad_concepts'::regclass
			and attname = 'part_id' and not attisdropped and not attnotnull
	) then
		alter table public.ideacad_concepts alter column part_id set not null;
	end if;
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_concepts_part_fkey'
			and conrelid = 'public.ideacad_concepts'::regclass
	) then
		alter table public.ideacad_concepts
			add constraint ideacad_concepts_part_fkey
			foreign key (part_id) references public.ideacad_parts(id) on delete cascade;
	end if;
end;
$notnull$;

create index if not exists ideacad_concepts_part_position_idx
	on public.ideacad_concepts(part_id, position);

-- ---------------------------------------------------------------------------
-- 5. THE COMPATIBILITY TRIGGER. See the header: this is what keeps 0201's ten
--    functions working without replacing one of them.
-- ---------------------------------------------------------------------------

create or replace function public._ideacad_concept_part_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $ptrig$
declare
	v_ids uuid[];
	v_new_part uuid;
begin
	select array_agg(p.id order by p.position, p.id) into v_ids
	from public.ideacad_parts p
	where p.document_id = new.document_id;

	if v_ids is null then
		-- A brand-new document: `ideacad_open_document` is inserting its first
		-- concept and there is no part yet. This is where a one-part assembly
		-- comes from after 0207. Column defaults are filled in before a BEFORE
		-- ROW trigger sees the tuple, so `new.id` is already the concept's real
		-- id, and the part's FK to it is deferred to commit.
		insert into public.ideacad_parts(document_id, position, name, active_concept_id)
			values (new.document_id, 1, 'Part 1', new.id)
			returning id into v_new_part;
		new.part_id := v_new_part;
		return new;
	end if;

	if array_length(v_ids, 1) > 1 then
		raise exception 'This assembly has % parts, so a concept has to name the part it belongs to. Use ideacad_new_part_concept.',
			array_length(v_ids, 1);
	end if;

	new.part_id := v_ids[1];
	update public.ideacad_parts
		set active_concept_id = new.id
		where id = new.part_id and active_concept_id is null;
	return new;
end;
$ptrig$;

drop trigger if exists ideacad_concepts_part_default on public.ideacad_concepts;
create trigger ideacad_concepts_part_default
	before insert on public.ideacad_concepts
	for each row when (new.part_id is null)
	execute function public._ideacad_concept_part_default();

-- ---------------------------------------------------------------------------
-- 6. THE PRIVATE PREDICATES.
--
--    `_ideacad_hold_window` is the one statement of the staleness rule.
--    `_ideacad_part_writer` and `_ideacad_part_reader` are the ladders onto
--    0205; `_ideacad_part_owner` is not a ladder, because the owner is the
--    owner in every deployment.
-- ---------------------------------------------------------------------------

create or replace function public._ideacad_hold_window()
returns interval
language sql
immutable
security definer
set search_path = ''
as $window$
	select interval '10 minutes';
$window$;

create or replace function public._ideacad_part_owner(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $owner$
	select exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id
			and d.student_email = public.current_user_email()
			and public.current_user_email() <> ''
	);
$owner$;

create or replace function public._ideacad_part_writer(p_document_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $writer$
declare
	v_shared boolean;
begin
	if public.current_user_email() = '' then
		return false;
	end if;
	if public._ideacad_part_owner(p_document_id) then
		return true;
	end if;
	-- The wide rung: 0205's own rule, called rather than restated. Absent, the
	-- ladder degrades to owner-only, which is 0201's world exactly.
	if to_regprocedure('public._ideacad_can_write_document(uuid)') is not null then
		execute 'select public._ideacad_can_write_document($1)'
			into v_shared using p_document_id;
		return coalesce(v_shared, false);
	end if;
	return false;
end;
$writer$;

create or replace function public._ideacad_part_reader(p_document_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $reader$
declare
	v_shared boolean;
begin
	if public.current_user_email() = '' then
		return false;
	end if;
	-- 0201's read rule: the owner, or a manager of the item it hangs off.
	if exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id
			and (
				d.student_email = public.current_user_email()
				or public._classroom_manages_item(d.item_id)
			)
	) then
		return true;
	end if;
	if to_regprocedure('public._ideacad_can_read_document(uuid)') is not null then
		execute 'select public._ideacad_can_read_document($1)'
			into v_shared using p_document_id;
		return coalesce(v_shared, false);
	end if;
	return false;
end;
$reader$;

-- ---------------------------------------------------------------------------
-- 7. RLS AND THE TABLE GRANT.
--
--    The policy delegates to a SECURITY DEFINER predicate rather than spelling
--    the cross-table lookup out inline. That is 0205's first measured lesson:
--    an inline `exists (select ... from ideacad_documents)` in this policy,
--    against 0205's policy on that table which looks back here, is mutual
--    recursion and Postgres answers `infinite recursion detected in policy`
--    on the first read a grantee makes.
--
--    `hold_revision` and `held_by` are readable by every reader of the
--    assembly, on purpose: "who is on which part" is the thing a teammate has
--    to be able to see. There is no token or secret in the row -- the
--    generation counter is not a credential, and every function that acts on a
--    hold re-checks `held_by = current_user_email()` independently of it.
-- ---------------------------------------------------------------------------

alter table public.ideacad_parts enable row level security;

drop policy if exists "assembly readers read ideacad parts" on public.ideacad_parts;
create policy "assembly readers read ideacad parts" on public.ideacad_parts
	for select to authenticated
	using (public._ideacad_part_reader(document_id));

revoke all on table public.ideacad_parts from public, anon, authenticated;
grant select on table public.ideacad_parts to authenticated;

-- ---------------------------------------------------------------------------
-- 8. THE RPCs. Nine, every one a new name.
-- ---------------------------------------------------------------------------

-- 8a. The read. One call answers the whole assembly, including the hold state
--     and the window the client needs in order to draw a lapsed hold honestly.
create or replace function public.ideacad_assembly(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $assembly$
declare
	v_email text := public.current_user_email();
	v_window interval := public._ideacad_hold_window();
begin
	if not public._ideacad_part_reader(p_document_id) then
		raise exception 'You cannot open this assembly.';
	end if;
	return jsonb_build_object(
		'documentId', p_document_id,
		'viewer', v_email,
		'isOwner', public._ideacad_part_owner(p_document_id),
		'canWrite', public._ideacad_part_writer(p_document_id),
		'holdWindowSeconds', (extract(epoch from v_window))::integer,
		'holdRevisionTotal', (
			select coalesce(sum(p.hold_revision), 0)::bigint
			from public.ideacad_parts p where p.document_id = p_document_id
		),
		'parts', (
			select coalesce(jsonb_agg(
				jsonb_build_object(
					'id', p.id,
					'position', p.position,
					'name', p.name,
					'activeConceptId', p.active_concept_id,
					'heldBy', p.held_by,
					'heldAt', p.held_at,
					'holdBeatAt', p.hold_beat_at,
					'holdRevision', p.hold_revision,
					'holdLive', (p.hold_beat_at is not null and p.hold_beat_at > now() - v_window),
					'holdIsMine', (p.held_by is not null and p.held_by = v_email),
					'conceptCount', (
						select count(*) from public.ideacad_concepts c
						where c.part_id = p.id and c.deleted_at is null
					)
				) order by p.position, p.id
			), '[]'::jsonb)
			from public.ideacad_parts p where p.document_id = p_document_id
		)
	);
end;
$assembly$;

-- 8b. Add a part. The OWNER's: the part list is the structure of the assembly.
--     It mints the part's first concept in the same call, so a part is never a
--     shell with no feature tree in it.
create or replace function public.ideacad_add_part(
	p_document_id uuid,
	p_name text,
	p_features jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $addpart$
declare
	v_doc public.ideacad_documents;
	v_part public.ideacad_parts;
	v_concept public.ideacad_concepts;
	v_features jsonb;
begin
	if not public._ideacad_part_owner(p_document_id) then
		raise exception 'Only the owner of this assembly can add a part.';
	end if;
	select * into v_doc from public.ideacad_documents where id = p_document_id for update;
	if not found then
		raise exception 'That assembly does not exist.';
	end if;
	if length(btrim(coalesce(p_name, ''))) = 0 then
		raise exception 'Give the part a name.';
	end if;

	v_features := p_features;
	if v_features is null then
		select e.config -> 'defaultFeatures' into v_features
		from public.ideacad_editors e where e.item_id = v_doc.item_id;
	end if;
	if v_features is null then
		raise exception 'This part has no feature tree and the assignment has no default to fall back on.';
	end if;

	insert into public.ideacad_parts(document_id, position, name)
	select p_document_id, coalesce(max(p.position), 0) + 1, btrim(p_name)
	from public.ideacad_parts p where p.document_id = p_document_id
	returning * into v_part;

	insert into public.ideacad_concepts(document_id, part_id, name, position, features)
		values (p_document_id, v_part.id, 'Concept 1', 1, v_features)
		returning * into v_concept;

	update public.ideacad_parts set active_concept_id = v_concept.id
		where id = v_part.id
		returning * into v_part;

	return jsonb_build_object(
		'ok', true,
		'partId', v_part.id,
		'position', v_part.position,
		'name', v_part.name,
		'activeConceptId', v_concept.id
	);
end;
$addpart$;

-- 8c. Rename and reorder. The OWNER's, for the same reason.
create or replace function public.ideacad_update_part_meta(
	p_part_id uuid,
	p_name text,
	p_position integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $partmeta$
declare
	v_part public.ideacad_parts;
begin
	select * into v_part from public.ideacad_parts where id = p_part_id for update;
	if not found then
		raise exception 'That part does not exist.';
	end if;
	if not public._ideacad_part_owner(v_part.document_id) then
		raise exception 'Only the owner of this assembly can rename or reorder a part.';
	end if;
	if length(btrim(coalesce(p_name, ''))) = 0 then
		raise exception 'Give the part a name.';
	end if;
	update public.ideacad_parts
		set name = btrim(p_name), position = p_position
		where id = p_part_id
		returning * into v_part;
	return jsonb_build_object('ok', true, 'partId', v_part.id,
		'name', v_part.name, 'position', v_part.position);
end;
$partmeta$;

-- 8d. A concept on a NAMED part -- the part-aware replacement for
--     `ideacad_new_concept`, which the trigger refuses once an assembly has
--     more than one part. A writer's, not only the owner's: a teammate holding
--     a part works on it.
create or replace function public.ideacad_new_part_concept(
	p_part_id uuid,
	p_name text,
	p_features jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $partconcept$
declare
	v_part public.ideacad_parts;
	v_concept public.ideacad_concepts;
begin
	select * into v_part from public.ideacad_parts where id = p_part_id;
	if not found then
		raise exception 'That part does not exist.';
	end if;
	if not public._ideacad_part_writer(v_part.document_id) then
		raise exception 'You can only add a concept to an assembly you can edit.';
	end if;
	if length(btrim(coalesce(p_name, ''))) = 0 then
		raise exception 'Give the concept a name.';
	end if;
	insert into public.ideacad_concepts(document_id, part_id, name, position, features)
	select v_part.document_id, v_part.id, btrim(p_name), coalesce(max(c.position), 0) + 1, p_features
	from public.ideacad_concepts c where c.part_id = v_part.id
	returning * into v_concept;
	update public.ideacad_parts set active_concept_id = v_concept.id where id = v_part.id;
	return to_jsonb(v_concept);
end;
$partconcept$;

-- 8e. Which concept a part is showing. A writer's.
create or replace function public.ideacad_set_part_active(
	p_part_id uuid,
	p_concept_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $setpartactive$
declare
	v_part public.ideacad_parts;
begin
	select * into v_part from public.ideacad_parts where id = p_part_id;
	if not found then
		raise exception 'That part does not exist.';
	end if;
	if not public._ideacad_part_writer(v_part.document_id) then
		raise exception 'You can only change an assembly you can edit.';
	end if;
	update public.ideacad_parts p
		set active_concept_id = p_concept_id
		where p.id = p_part_id
			and exists (
				select 1 from public.ideacad_concepts c
				where c.id = p_concept_id and c.part_id = p_part_id and c.deleted_at is null
			);
	if not found then
		raise exception 'Choose one of this part''s live concepts.';
	end if;
	return jsonb_build_object('ok', true, 'partId', p_part_id, 'activeConceptId', p_concept_id);
end;
$setpartactive$;

-- 8f. CLAIM. The row lock is the first thing that happens and it is the whole
--     of why two students cannot both acquire. A refusal here is a thing a
--     student reads, so it is structured rather than raised.
create or replace function public.ideacad_claim_part(p_part_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $claim$
declare
	v_part public.ideacad_parts;
	v_email text := public.current_user_email();
	v_window interval := public._ideacad_hold_window();
	v_live boolean;
	v_reason text;
begin
	if v_email = '' then
		raise exception 'Sign in to take a part.';
	end if;
	-- THE SERIALIZATION POINT. One row, it already exists, and every other
	-- caller that changes a hold takes the same lock on the same row first.
	select * into v_part from public.ideacad_parts where id = p_part_id for update;
	if not found then
		raise exception 'That part does not exist.';
	end if;
	if not public._ideacad_part_writer(v_part.document_id) then
		raise exception 'You are not on this assembly.';
	end if;

	v_live := v_part.hold_beat_at is not null and v_part.hold_beat_at > now() - v_window;

	-- Already mine and still live: extend it. The holder has not changed, so
	-- the generation counter does NOT move and the client's revision stays good.
	if v_live and v_part.held_by = v_email then
		update public.ideacad_parts set hold_beat_at = now()
			where id = p_part_id returning * into v_part;
		return jsonb_build_object('ok', true, 'reason', 'resumed',
			'partId', v_part.id, 'heldBy', v_part.held_by,
			'heldAt', v_part.held_at, 'holdRevision', v_part.hold_revision);
	end if;

	-- Somebody else has it and their hold is live. This is the refusal.
	if v_live and v_part.held_by <> v_email then
		return jsonb_build_object('ok', false, 'reason', 'held',
			'partId', v_part.id, 'heldBy', v_part.held_by,
			'heldAt', v_part.held_at, 'holdBeatAt', v_part.hold_beat_at,
			'holdRevision', v_part.hold_revision);
	end if;

	-- Free, or a hold that lapsed. A lapsed hold is TAKEN OVER rather than
	-- waited on -- see the staleness rule in the header.
	v_reason := case when v_part.held_by is null then 'claimed' else 'takeover' end;
	update public.ideacad_parts
		set held_by = v_email, held_at = now(), hold_beat_at = now(),
			hold_revision = hold_revision + 1
		where id = p_part_id
		returning * into v_part;
	return jsonb_build_object('ok', true, 'reason', v_reason,
		'partId', v_part.id, 'heldBy', v_part.held_by,
		'heldAt', v_part.held_at, 'holdRevision', v_part.hold_revision);
end;
$claim$;

-- 8g. HEARTBEAT, and the place a displaced holder finds out. The revision it
--     was handed at claim time is passed back; a revision that has moved means
--     somebody else holds the part now, and the answer names them.
create or replace function public.ideacad_beat_part(
	p_part_id uuid,
	p_hold_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $beat$
declare
	v_part public.ideacad_parts;
	v_email text := public.current_user_email();
	v_window interval := public._ideacad_hold_window();
begin
	if v_email = '' then
		raise exception 'Sign in to work on a part.';
	end if;
	select * into v_part from public.ideacad_parts where id = p_part_id for update;
	if not found then
		raise exception 'That part does not exist.';
	end if;

	-- Identity AND generation, independently. The revision is a marker, not a
	-- credential: holding somebody else's number gets nothing.
	if v_part.held_by is distinct from v_email or v_part.hold_revision <> p_hold_revision then
		return jsonb_build_object('ok', false, 'reason', 'lost',
			'partId', v_part.id, 'heldBy', v_part.held_by,
			'holdRevision', v_part.hold_revision);
	end if;

	if v_part.hold_beat_at <= now() - v_window then
		-- Still recorded as ours, but the hold lapsed. Say so rather than
		-- quietly reviving it: anyone could have taken it in the meantime, and
		-- a client that believes it never lost the part will overwrite work.
		return jsonb_build_object('ok', false, 'reason', 'lapsed',
			'partId', v_part.id, 'heldBy', v_part.held_by,
			'holdRevision', v_part.hold_revision);
	end if;

	update public.ideacad_parts set hold_beat_at = now()
		where id = p_part_id returning * into v_part;
	return jsonb_build_object('ok', true, 'reason', 'beating',
		'partId', v_part.id, 'holdRevision', v_part.hold_revision,
		'holdBeatAt', v_part.hold_beat_at);
end;
$beat$;

-- 8h. RELEASE. The holder, or the owner of the assembly.
create or replace function public.ideacad_release_part(p_part_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $release$
declare
	v_part public.ideacad_parts;
	v_email text := public.current_user_email();
begin
	if v_email = '' then
		raise exception 'Sign in to release a part.';
	end if;
	select * into v_part from public.ideacad_parts where id = p_part_id for update;
	if not found then
		raise exception 'That part does not exist.';
	end if;
	if v_part.held_by is null then
		return jsonb_build_object('ok', true, 'reason', 'already_free',
			'partId', v_part.id, 'holdRevision', v_part.hold_revision);
	end if;
	if v_part.held_by <> v_email and not public._ideacad_part_owner(v_part.document_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_yours',
			'partId', v_part.id, 'heldBy', v_part.held_by,
			'holdRevision', v_part.hold_revision);
	end if;
	update public.ideacad_parts
		set held_by = null, held_at = null, hold_beat_at = null,
			hold_revision = hold_revision + 1
		where id = p_part_id
		returning * into v_part;
	return jsonb_build_object('ok', true, 'reason', 'released',
		'partId', v_part.id, 'holdRevision', v_part.hold_revision);
end;
$release$;

-- 8i. FORCE. Mr. Pina's sentence, as a function: the assembly owner has full
--     control over who is editing what and can reassign LIVE. It does not ask
--     whether the part is held, because being able to override a live hold is
--     the whole point. `p_email` null takes the part off whoever has it.
create or replace function public.ideacad_assign_part(
	p_part_id uuid,
	p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $assign$
declare
	v_part public.ideacad_parts;
	v_target text := nullif(lower(btrim(coalesce(p_email, ''))), '');
	v_previous text;
begin
	select * into v_part from public.ideacad_parts where id = p_part_id for update;
	if not found then
		raise exception 'That part does not exist.';
	end if;
	if not public._ideacad_part_owner(v_part.document_id) then
		raise exception 'Only the owner of this assembly can reassign a part.';
	end if;

	v_previous := v_part.held_by;

	-- The same person already holds it: nothing changed, so the generation
	-- counter must not move -- their client's revision is still good.
	if v_target is not distinct from v_previous then
		return jsonb_build_object('ok', true, 'reason', 'unchanged',
			'partId', v_part.id, 'heldBy', v_previous,
			'holdRevision', v_part.hold_revision);
	end if;

	if v_target is null then
		update public.ideacad_parts
			set held_by = null, held_at = null, hold_beat_at = null,
				hold_revision = hold_revision + 1
			where id = p_part_id returning * into v_part;
	else
		update public.ideacad_parts
			set held_by = v_target, held_at = now(), hold_beat_at = now(),
				hold_revision = hold_revision + 1
			where id = p_part_id returning * into v_part;
	end if;

	return jsonb_build_object('ok', true,
		'reason', case when v_target is null then 'cleared' else 'assigned' end,
		'partId', v_part.id, 'heldBy', v_part.held_by,
		'previousHolder', v_previous, 'holdRevision', v_part.hold_revision);
end;
$assign$;

-- ---------------------------------------------------------------------------
-- 9. THE GRANTS. 0166's shape, which is the one this repo has: revoke from
--    the roles BY NAME, because a hosted Supabase project's default privileges
--    write a DIRECT `anon` grant into every new function's acl that
--    `revoke ... from public` never touches. 0201 invented its own shape and
--    all ten of its functions came out anon-executable; 0202 is the repair and
--    0206 replaces its guard.
--
--    The nine RPCs are held by `authenticated` and `service_role`.
--    `_ideacad_part_reader` is held by `authenticated` TOO, and that is not an
--    oversight: it is named directly inside the RLS `using` clause in section
--    7, where a function is evaluated as the QUERYING role, so revoking it
--    would break the read rather than narrow it (the 0070 lesson 0109 wrote
--    down). The other three are reached only from SECURITY DEFINER bodies and
--    hold nothing but `service_role`.
-- ---------------------------------------------------------------------------

revoke all on function
	public.ideacad_assembly(uuid),
	public.ideacad_add_part(uuid,text,jsonb),
	public.ideacad_update_part_meta(uuid,text,integer),
	public.ideacad_new_part_concept(uuid,text,jsonb),
	public.ideacad_set_part_active(uuid,uuid),
	public.ideacad_claim_part(uuid),
	public.ideacad_beat_part(uuid,integer),
	public.ideacad_release_part(uuid),
	public.ideacad_assign_part(uuid,text)
	from public, anon, authenticated;

grant execute on function
	public.ideacad_assembly(uuid),
	public.ideacad_add_part(uuid,text,jsonb),
	public.ideacad_update_part_meta(uuid,text,integer),
	public.ideacad_new_part_concept(uuid,text,jsonb),
	public.ideacad_set_part_active(uuid,uuid),
	public.ideacad_claim_part(uuid),
	public.ideacad_beat_part(uuid,integer),
	public.ideacad_release_part(uuid),
	public.ideacad_assign_part(uuid,text)
	to authenticated, service_role;

revoke all on function
	public._ideacad_hold_window(),
	public._ideacad_part_owner(uuid),
	public._ideacad_part_writer(uuid),
	public._ideacad_part_reader(uuid),
	public._ideacad_concept_part_default()
	from public, anon, authenticated;

grant execute on function
	public._ideacad_hold_window(),
	public._ideacad_part_owner(uuid),
	public._ideacad_part_writer(uuid),
	public._ideacad_concept_part_default()
	to service_role;

-- Named in an RLS policy, so `authenticated` must hold it.
grant execute on function public._ideacad_part_reader(uuid)
	to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. THE SELF-CHECK. It raises, so a partial apply cannot look like a clean
--     one and the whole file rolls back.
--
--     IT IS SCOPED TO THIS FILE'S OWN OBJECTS. A sweep over `^_?ideacad` is
--     the tempting shape and it is wrong here: 0205 measured that such a sweep
--     falsifies `tests/db/ideacad-grants-anon-execute-surface.test.ts`
--     section E, which deliberately boots the chain MINUS 0202 and asserts
--     0201's ten ARE anon-executable there, so that "0202 closes them" is a
--     measured difference rather than a claim. Anything else anon-executable
--     is raised as a NOTICE, by name -- the information is not lost and the
--     apply is not blocked over another migration's objects.
--
--     THE POSITIVE CONTROL IS THE LAST BLOCK AND IT IS THE POINT. A sweep that
--     found nothing because it was looking in the wrong place reports exactly
--     what a clean database reports, so the file also proves it can still SEE a
--     deliberate anon grant: `app_short_link_target` is granted to anon on
--     purpose (printed handouts resolve before any session exists).
-- ---------------------------------------------------------------------------

do $checks$
declare
	r record;
	v_before record;
	v_documents bigint;
	v_concepts bigint;
	v_parts bigint;
	v_orphans bigint;
	v_docs_without_part bigint;
	v_mine text[] := array[
		'public.ideacad_assembly(uuid)',
		'public.ideacad_add_part(uuid,text,jsonb)',
		'public.ideacad_update_part_meta(uuid,text,integer)',
		'public.ideacad_new_part_concept(uuid,text,jsonb)',
		'public.ideacad_set_part_active(uuid,uuid)',
		'public.ideacad_claim_part(uuid)',
		'public.ideacad_beat_part(uuid,integer)',
		'public.ideacad_release_part(uuid)',
		'public.ideacad_assign_part(uuid,text)',
		'public._ideacad_hold_window()',
		'public._ideacad_part_owner(uuid)',
		'public._ideacad_part_writer(uuid)',
		'public._ideacad_part_reader(uuid)',
		'public._ideacad_concept_part_default()'
	];
	v_sig text;
	v_bad text[] := '{}';
	v_control boolean;
	v_window interval;
begin
	-- (a) Every object this file names exists, at the signature the grants used.
	foreach v_sig in array v_mine loop
		if to_regprocedure(v_sig) is null then
			raise exception '0207: % is missing -- a definition or a signature drifted.', v_sig;
		end if;
	end loop;
	if to_regclass('public.ideacad_parts') is null then
		raise exception '0207: public.ideacad_parts was not created.';
	end if;
	if not exists (
		select 1 from pg_trigger
		where tgrelid = 'public.ideacad_concepts'::regclass
			and tgname = 'ideacad_concepts_part_default' and not tgisinternal
	) then
		raise exception '0207: the compatibility trigger is missing, so every 0201 concept insert would fail on part_id.';
	end if;
	if not exists (
		select 1 from pg_attribute
		where attrelid = 'public.ideacad_concepts'::regclass
			and attname = 'part_id' and not attisdropped and attnotnull
	) then
		raise exception '0207: ideacad_concepts.part_id is missing or still nullable.';
	end if;

	-- (b) THE MIGRATION ITSELF, counted rather than assumed.
	select * into v_before from _ideacad_0207_before;
	select count(*) into v_documents from public.ideacad_documents;
	select count(*) into v_concepts from public.ideacad_concepts;
	select count(*) into v_parts from public.ideacad_parts;
	select count(*) into v_orphans from public.ideacad_concepts where part_id is null;
	select count(*) into v_docs_without_part
	from public.ideacad_documents d
	where not exists (select 1 from public.ideacad_parts p where p.document_id = d.id);

	if v_documents <> v_before.documents or v_concepts <> v_before.concepts then
		raise exception '0207: the backfill changed the row counts -- documents % -> %, concepts % -> %. Nothing here may add or remove either.',
			v_before.documents, v_documents, v_before.concepts, v_concepts;
	end if;
	if v_docs_without_part <> 0 then
		raise exception '0207: % document(s) came out of the backfill with no part. Every document must be a one-part assembly.',
			v_docs_without_part;
	end if;
	if v_orphans <> 0 then
		raise exception '0207: % concept(s) came out of the backfill with no part_id.', v_orphans;
	end if;
	if v_parts < v_documents then
		raise exception '0207: % part(s) for % document(s) -- fewer parts than documents is impossible after the backfill.',
			v_parts, v_documents;
	end if;

	raise notice '0207: AFTER -- % document(s) (was %), % concept(s) (was %), % part(s) (was %). 0 concepts without a part, 0 documents without a part.',
		v_documents, v_before.documents, v_concepts, v_before.concepts,
		v_parts, v_before.parts;

	-- (c) The staleness rule reads back as the one number it is written as.
	select public._ideacad_hold_window() into v_window;
	if v_window <> interval '10 minutes' then
		raise exception '0207: _ideacad_hold_window() answered % rather than 10 minutes.', v_window;
	end if;

	-- (d) The grant surface of THIS FILE's thirteen functions.
	foreach v_sig in array v_mine loop
		if has_function_privilege('anon', v_sig, 'execute') then
			v_bad := v_bad || (v_sig || ' -> anon');
		end if;
	end loop;
	-- The nine public RPCs plus the policy predicate must be executable by
	-- authenticated; the other four -- three private predicates and the trigger
	-- function -- must not be.
	for r in
		select unnest(array[
			'public.ideacad_assembly(uuid)',
			'public.ideacad_add_part(uuid,text,jsonb)',
			'public.ideacad_update_part_meta(uuid,text,integer)',
			'public.ideacad_new_part_concept(uuid,text,jsonb)',
			'public.ideacad_set_part_active(uuid,uuid)',
			'public.ideacad_claim_part(uuid)',
			'public.ideacad_beat_part(uuid,integer)',
			'public.ideacad_release_part(uuid)',
			'public.ideacad_assign_part(uuid,text)',
			'public._ideacad_part_reader(uuid)'
		]) as sig
	loop
		if not has_function_privilege('authenticated', r.sig, 'execute') then
			v_bad := v_bad || (r.sig || ' -> authenticated MISSING');
		end if;
	end loop;
	for r in
		select unnest(array[
			'public._ideacad_hold_window()',
			'public._ideacad_part_owner(uuid)',
			'public._ideacad_part_writer(uuid)',
			'public._ideacad_concept_part_default()'
		]) as sig
	loop
		if has_function_privilege('authenticated', r.sig, 'execute') then
			v_bad := v_bad || (r.sig || ' -> authenticated, but nothing names it in a policy');
		end if;
	end loop;
	if array_length(v_bad, 1) is not null then
		raise exception '0207: % grant problem(s) on this file''s own functions: %. The revoke did not name the roles it needed to, or a regrant did not run.',
			array_length(v_bad, 1), array_to_string(v_bad, ', ');
	end if;

	-- (e) The table's own privileges: authenticated holds SELECT and nothing
	--     else, anon holds nothing. The identical bootstrap that hands a
	--     function anon EXECUTE hands a table all seven privileges, and RLS
	--     covers none of TRUNCATE, REFERENCES or TRIGGER.
	v_bad := '{}';
	for r in
		select rp.role_name, rp.priv
		from (
			select roles.role_name, privs.priv
			from (values ('anon'), ('authenticated')) as roles(role_name)
			cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
			                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as privs(priv)
		) rp
		where has_table_privilege(rp.role_name, 'public.ideacad_parts', rp.priv)
			and not (rp.role_name = 'authenticated' and rp.priv = 'SELECT')
	loop
		v_bad := v_bad || format('%s on ideacad_parts to %s', r.priv, r.role_name);
	end loop;
	if array_length(v_bad, 1) is not null then
		raise exception '0207: % client table privilege(s) survive beyond authenticated SELECT: %.',
			array_length(v_bad, 1), array_to_string(v_bad, ', ');
	end if;
	if not has_table_privilege('authenticated', 'public.ideacad_parts', 'SELECT') then
		raise exception '0207: authenticated LOST select on ideacad_parts -- the regrant in section 7 did not run.';
	end if;
	if not exists (
		select 1 from pg_policies
		where schemaname = 'public' and tablename = 'ideacad_parts'
			and policyname = 'assembly readers read ideacad parts'
	) then
		raise exception '0207: the select policy on ideacad_parts is missing, so the grant above reads nothing.';
	end if;

	-- (f) Every OTHER ideacad function, reported and not refused. See the
	--     header block: refusing here breaks another migration's negative
	--     control.
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.proname ~ '^_?ideacad'
			and has_function_privilege('anon', p.oid, 'execute')
			and not (p.oid::regprocedure::text = any (v_mine))
		order by 1
	loop
		raise notice '0207: NOTE -- % is executable by anon. Not this file''s object, so not refused here; 0202/0206 own it.', r.sig;
	end loop;

	-- (g) The instrument control.
	select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute')
		into v_control;
	if not v_control then
		raise exception '0207: the positive control failed -- app_short_link_target does not read as anon-executable, so this file cannot tell an anon grant from its absence and none of the grant checks above mean anything.';
	end if;

	raise notice '0207: 14 functions -- anon false on all 14; authenticated true on the 9 RPCs and the policy predicate, false on the 3 private predicates and the trigger function. ideacad_parts -- authenticated holds SELECT and nothing else, anon holds nothing. Hold window 10 minutes. Positive control reads true.';
end;
$checks$;

commit;

-- Verification query (run after applying, in the Supabase SQL editor):
--
-- select 'table public.ideacad_parts' as object, to_regclass('public.ideacad_parts') is not null as ok
-- union all select 'column ideacad_concepts.part_id not null',
--   exists(select 1 from pg_attribute where attrelid='public.ideacad_concepts'::regclass
--     and attname='part_id' and not attisdropped and attnotnull)
-- union all select 'trigger ideacad_concepts_part_default',
--   exists(select 1 from pg_trigger where tgrelid='public.ideacad_concepts'::regclass
--     and tgname='ideacad_concepts_part_default' and not tgisinternal)
-- union all select 'function public.ideacad_assembly',
--   to_regprocedure('public.ideacad_assembly(uuid)') is not null
-- union all select 'function public.ideacad_claim_part',
--   to_regprocedure('public.ideacad_claim_part(uuid)') is not null
-- union all select 'function public.ideacad_beat_part',
--   to_regprocedure('public.ideacad_beat_part(uuid,integer)') is not null
-- union all select 'function public.ideacad_release_part',
--   to_regprocedure('public.ideacad_release_part(uuid)') is not null
-- union all select 'function public.ideacad_assign_part',
--   to_regprocedure('public.ideacad_assign_part(uuid,text)') is not null
-- union all select 'hold window is 10 minutes',
--   public._ideacad_hold_window() = interval '10 minutes'
-- union all select 'every document has a part',
--   not exists(select 1 from public.ideacad_documents d
--     where not exists(select 1 from public.ideacad_parts p where p.document_id=d.id))
-- union all select 'every concept has a part',
--   not exists(select 1 from public.ideacad_concepts where part_id is null)
-- union all select 'anon holds no EXECUTE on this file''s 14 functions',
--   not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.proname in ('ideacad_assembly','ideacad_add_part',
--       'ideacad_update_part_meta','ideacad_new_part_concept','ideacad_set_part_active',
--       'ideacad_claim_part','ideacad_beat_part','ideacad_release_part','ideacad_assign_part',
--       '_ideacad_hold_window','_ideacad_part_owner','_ideacad_part_writer','_ideacad_part_reader',
--       '_ideacad_concept_part_default')
--     and has_function_privilege('anon', p.oid, 'execute'))
-- union all select 'anon holds nothing on ideacad_parts',
--   not exists(select 1 from (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
--     ('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(priv)
--     where has_table_privilege('anon','public.ideacad_parts',v.priv));
--
-- Expected: 13 rows, every `ok` column t.
