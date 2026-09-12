-- 0209_ideacad_history.sql
--
-- Apply manually in the Supabase SQL editor, AFTER 0208.
-- DO NOT APPLY FROM THE SESSION CONTAINER. This environment cannot reach
-- production and must not try.
--
-- ===========================================================================
-- WHAT THIS IS, AND THE SENTENCE IT COMES FROM
-- ===========================================================================
--
-- Mr. Pina, 2026-09-12: every action a student takes should be undoable, like
-- SolidWorks or Fusion 360, with a history you can scroll through, at MAXIMUM
-- RESOLUTION, going ALL THE WAY BACK TO THE CREATION OF THE PART.
--
-- What exists today is `src/lib/ideacad/ui/undo.ts` -- fifty deep, IN MEMORY
-- ONLY. Close the tab and it is gone. This file is the durable half.
--
-- ===========================================================================
-- THE SINGLE CONSTRAINT THAT DECIDES WHETHER THIS FITS
-- ===========================================================================
--
-- STORE ACTIONS, NEVER GEOMETRY.
--
-- A row here is a PARAMETER CHANGE: which feature, what changed, the new value,
-- who, when. It is not a mesh and it is not a serialized tree. A stored
-- snapshot is roughly a hundred times larger and would exhaust the free tier
-- inside a term. The budget, worked out with Mr. Pina: at ~400 bytes an action,
-- 100 students across three projects a year is about 192 MB against a 500 MB
-- tier shared with coins, notebooks, Foundry and tournaments. THAT HOLDS ONLY
-- IF ROWS ARE ACTIONS. `tests/db/ideacad-history-row-size.test.ts` measures the
-- real figure -- heap plus every index, `pg_total_relation_size` over a real
-- corpus -- against real Postgres rather than trusting this paragraph.
--
-- THE ONE SNAPSHOT IS `origin`, AND THERE IS EXACTLY ONE PER CONCEPT. "All the
-- way back to the creation of the part" is not answerable without the state the
-- part was created in, so seq 0 carries the seeded tree. Amortised over the
-- hundreds of actions that follow it that is noise; per action it would be the
-- thing this whole design refuses.
--
-- THERE IS NO RETENTION AND NO PRUNING, DELIBERATELY. He said as far back as
-- possible. Nothing in this file deletes a row, ages one out, or caps a log,
-- and a later file that wants to is making a decision rather than tidying up.
--
-- ===========================================================================
-- WHY UNDO APPENDS AN INVERSE RATHER THAN MOVING A POINTER
-- ===========================================================================
--
-- The rejected design is a per-document cursor: undo decrements it, redo
-- increments it, a fresh edit truncates the future. It is smaller and it is
-- wrong twice over here. It DISCARDS history, which is what "as far back as
-- possible" refuses; and a cursor is one mutable cell that two editors of a
-- shared document (0205) fight over, where appends serialise on their own.
--
-- So an undo is an ACTION: it appends the INVERSE of its target and names that
-- target in `undoes_seq`. Nothing is ever deleted or rewritten, which makes
-- this append-only in the sense `coin_transactions` and `notebook_entry_notes`
-- are. And REPLAY IS OBLIVIOUS TO UNDO -- reconstructing the state at any point
-- is applying rows 1..k on top of the origin, with no special case for an undo
-- row anywhere in it. `src/lib/ideacad/history.ts` carries the depth rule that
-- decides WHICH row an undo points at; the database does not need to know.
--
-- THE RACE IS CLOSED BY AN INDEX, NOT BY A CHECK. Two editors pressing undo at
-- the same moment would otherwise both invert the same row and apply that
-- inverse twice. `ideacad_history_undoes_once_idx` is a partial UNIQUE index on
-- (concept_id, undoes_seq): the second one loses on the constraint and re-reads,
-- which is the same shape 0134 established for a lazily created row -- the
-- unique index IS the serialisation point and the only question is who
-- apologises for it.
--
-- ===========================================================================
-- WHY THE TREE AND THE LOG MOVE IN ONE STATEMENT
-- ===========================================================================
--
-- `ideacad_apply_actions` writes the actions AND the resulting feature tree in
-- one transaction, and that is the whole of what makes the correctness claim --
-- REPLAY FROM THE ORIGIN EQUALS THE STORED TREE -- something the schema
-- upholds rather than something a client promises. Two RPCs would leave a
-- window in which one landed and the other did not, and the failure is silent:
-- the document renders perfectly and its history quietly no longer describes
-- it.
--
-- `ideacad_save_concept` IS LEFT EXACTLY AS 0205 WROTE IT, AND THAT IS NOT AN
-- OVERSIGHT. It is the arity a deployed client already calls, so there is no
-- ordering problem: the migration and the deploy are independent events and
-- either may go first. A deployment carrying 0209 with an older client keeps
-- saving through it and simply accrues no history, which is the feature being
-- off rather than the feature being broken. What a tree carrying this file must
-- not do is start routing NEW writes through the old function once it has the
-- new one -- the store's history region sends actions when the read RPC
-- answered, and falls back otherwise.
--
-- ===========================================================================
-- ORDER, AND UNDO
-- ===========================================================================
--
-- 0208 FIRST. This file needs `ideacad_concepts` (0201), the sharing write
-- predicate `_ideacad_can_write_document` (0205) and the read predicate
-- `_ideacad_can_read_document` (0205). It does not read parts (0207) or
-- materials (0208) at all; 0208 is named only because it is the file below it
-- in the chain.
--
-- UNDO: `drop trigger ideacad_concepts_history_origin on public.ideacad_concepts;`
-- then drop the three functions, then `drop table public.ideacad_history;`. That
-- is a destructive DDL sequence, so it is a paste a person makes rather than
-- something `tools/apply-migration.mjs` will run. Nothing else in the schema is
-- changed by this file, so nothing else has to be restored.
--
-- RE-PASTING IS ORDINARY AND THIS FILE IS WRITTEN FOR IT: every object is
-- created `if not exists` or `create or replace`, and the one-time backfill is
-- an `insert ... on conflict do nothing` keyed on the primary key, so a second
-- run writes nothing and rewrites nothing.

begin;

-- ---------------------------------------------------------------------------
-- 0. PRECONDITIONS.
--
--    Named rather than assumed, and read from the catalog: a file that half
--    applies over a chain it needs is worse than one that refuses.
-- ---------------------------------------------------------------------------

do $preflight$
begin
	if to_regclass('public.ideacad_concepts') is null then
		raise exception '0209 cannot apply: public.ideacad_concepts is missing. Apply 0201 first.';
	end if;
	if to_regprocedure('public._ideacad_can_write_document(uuid)') is null
		or to_regprocedure('public._ideacad_can_read_document(uuid)') is null then
		raise exception '0209 cannot apply: 0205''s sharing predicates are missing. Apply 0205 first -- this file delegates both its gates to them rather than restating who may write.';
	end if;
	if to_regprocedure('public.current_user_email()') is null then
		raise exception '0209 cannot apply: public.current_user_email() is missing.';
	end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. THE TABLE.
--
--    (concept_id, seq) IS THE PRIMARY KEY AND THERE IS NO SURROGATE ID. The
--    pair is the natural key, it is what every read orders by, and a uuid
--    beside it would cost sixteen bytes a row plus a whole second index for an
--    identity nothing needs -- which is exactly the kind of cost the budget
--    above cannot carry.
--
--    `before_value` AND `after_value` RATHER THAN `before`/`after`. Both are
--    unreserved keywords Postgres would accept, and both read as trigger timing
--    to anyone scanning this file. The columns are catalog names; the spelling
--    costs no storage.
--
--    WHAT THE TWO MEAN DEPENDS ON `kind`, and the asymmetry is what keeps a row
--    narrow:
--
--      origin  after_value  = the tree the part was created with.
--      set     before_value = the value that was there, after_value = now.
--      insert  after_value  = the value added at `path`.
--      remove  before_value = the value that was at `path`.
--      move    `path` names the ARRAY; before_value = the index moved FROM and
--              after_value = the index moved TO. Storing the element would put
--              a whole feature in every reorder row for no information at all.
--
--    `path` IS AN RFC 6901 JSON POINTER read against the state AT THAT POINT IN
--    THE LOG, which is why an index-based pointer is exact rather than fragile:
--    replay applies rows in order, so every pointer is resolved against the
--    same tree it was computed from. That is a property of the ORDER, and the
--    order is the primary key.
--
--    `actor` IS AN EMAIL AND IS THE WIDEST COLUMN HERE. It is kept because "who"
--    is half of what Mr. Pina asked for and because 0205 makes two people able
--    to edit one document, so the log has to be able to say which of them did
--    something. It is the first thing to normalise if the measured row size
--    ever misses the budget; it has not, and normalising it now would be a join
--    bought with a number nobody had measured.
-- ---------------------------------------------------------------------------

create table if not exists public.ideacad_history(
	concept_id uuid not null references public.ideacad_concepts(id) on delete cascade,
	seq bigint not null,
	kind text not null,
	path text not null,
	before_value jsonb,
	after_value jsonb,
	undoes_seq bigint,
	actor text not null,
	at timestamptz not null default now(),
	primary key (concept_id, seq)
);

do $constraints$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_history_kind_check'
			and conrelid = 'public.ideacad_history'::regclass
	) then
		alter table public.ideacad_history
			add constraint ideacad_history_kind_check
			check (kind in ('origin', 'set', 'insert', 'remove', 'move'));
	end if;

	-- THE ORIGIN IS SEQ 0 AND SEQ 0 IS THE ORIGIN, BOTH DIRECTIONS. Either half
	-- alone leaves a legal row that breaks replay: a second origin part way up
	-- the log would silently reset the document, and a plain action at seq 0
	-- would leave a concept whose history has no floor.
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_history_origin_is_seq_zero'
			and conrelid = 'public.ideacad_history'::regclass
	) then
		alter table public.ideacad_history
			add constraint ideacad_history_origin_is_seq_zero
			check ((kind = 'origin') = (seq = 0));
	end if;

	-- AN UNDO NAMES SOMETHING BELOW IT, AND NEVER ITSELF. A forward or self
	-- reference is a cycle the fold in history.ts would walk forever.
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_history_undoes_is_earlier'
			and conrelid = 'public.ideacad_history'::regclass
	) then
		alter table public.ideacad_history
			add constraint ideacad_history_undoes_is_earlier
			check (undoes_seq is null or undoes_seq < seq);
	end if;

	-- THE ORIGIN CANNOT BE UNDONE. Inverting the creation of the part would
	-- leave a concept whose stored tree no replay can produce; the floor of the
	-- history is the part existing. `invertAction` refuses it in TypeScript for
	-- the same reason and this is the half a hand-written call cannot route
	-- around.
	if not exists (
		select 1 from pg_constraint
		where conname = 'ideacad_history_undoes_not_origin'
			and conrelid = 'public.ideacad_history'::regclass
	) then
		alter table public.ideacad_history
			add constraint ideacad_history_undoes_not_origin
			check (undoes_seq is null or undoes_seq > 0);
	end if;
end
$constraints$;

-- The race closer. See the header: two editors pressing undo on the same row
-- at the same moment, and the loser re-reads rather than double-applying.
create unique index if not exists ideacad_history_undoes_once_idx
	on public.ideacad_history (concept_id, undoes_seq)
	where undoes_seq is not null;

alter table public.ideacad_history enable row level security;

-- ---------------------------------------------------------------------------
-- 2. THE READ POLICY.
--
--    IT DELEGATES, AND ADDS NO NEW PREDICATE FUNCTION. `_ideacad_can_read_document`
--    (0205) already answers "owner, grantee or teacher of record", so restating
--    any part of that here would be a second copy of the rule that could stop
--    matching -- the thing this repo's visibility rules exist to prevent.
--
--    The inner select also passes through `ideacad_concepts`' OWN policy, since
--    a policy expression is evaluated as the querying role. That is defence in
--    depth rather than redundancy: opening either layer alone still refuses.
-- ---------------------------------------------------------------------------

drop policy if exists "owners, grantees and managers read ideacad history" on public.ideacad_history;
create policy "owners, grantees and managers read ideacad history"
	on public.ideacad_history
	for select
	to authenticated
	using (
		exists (
			select 1 from public.ideacad_concepts c
			where c.id = concept_id
				and public._ideacad_can_read_document(c.document_id)
		)
	);

-- ---------------------------------------------------------------------------
-- 3. THE ORIGIN, WRITTEN BY A TRIGGER.
--
--    A TRIGGER RATHER THAN A LINE IN EACH RPC, AND THE REASON IS THE CENSUS.
--    Four functions across three migrations create a concept -- 0201's
--    `ideacad_open_document` (the first concept of a document) and
--    `ideacad_new_concept`, and 0207's `ideacad_add_part` and
--    `ideacad_new_part_concept` -- and a fifth will exist the day somebody adds
--    one. Editing four applied-adjacent functions to add the same insert four
--    times is four places to forget it; the trigger catches every path,
--    including paths written after this file.
--
--    THIS IS NOT THE DERIVED-STATE TRIGGER `CLAUDE.md` WARNS ABOUT. That rule
--    is about a mutable column drifting silently when a trigger stops firing.
--    This writes an append-only RECORD OF AN EVENT, and a missing one is
--    LOUD: replay has no floor, `ideacad_concept_history` says so, and
--    `tests/db/ideacad-history-origin.test.ts` asserts every concept every
--    creation path makes has one.
--
--    `security definer` BECAUSE THE CALLER HAS NO INSERT GRANT ON THIS TABLE
--    and must never get one. The insert is authorised by the fact that the
--    concept row was just created, which the RPC above it already gated.
-- ---------------------------------------------------------------------------

create or replace function public._ideacad_history_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $origin$
begin
	insert into public.ideacad_history(concept_id, seq, kind, path, after_value, actor)
	values (
		new.id,
		0,
		'origin',
		'',
		new.features,
		-- A concept can be created by a definer path with no session behind it
		-- (a backfill, a fixture, a future import). `current_user_email()`
		-- answers the empty string there rather than null, so the coalesce is
		-- over `nullif` and not over the call.
		coalesce(nullif(public.current_user_email(), ''), 'system')
	)
	on conflict (concept_id, seq) do nothing;
	return new;
end
$origin$;

drop trigger if exists ideacad_concepts_history_origin on public.ideacad_concepts;
create trigger ideacad_concepts_history_origin
	after insert on public.ideacad_concepts
	for each row execute function public._ideacad_history_origin();

-- ---------------------------------------------------------------------------
-- 4. THE BACKFILL, WHICH RUNS EXACTLY ONCE.
--
--    Every concept that predates this file has no origin row, so its history
--    has no floor and nothing about it can be replayed. The floor it gets is
--    its CURRENT tree, and the row SAYS SO rather than pretending: `actor` is
--    'migration:0209' and not the student, because claiming a student created
--    the part in the state it happens to be in today would be a fabricated
--    record in a table whose entire value is that it is not fabricated.
--
--    `on conflict do nothing` ON THE PRIMARY KEY is what makes it exactly once
--    without a catalog guard around it: a second paste finds seq 0 already
--    there for every concept and writes nothing. An unguarded
--    `insert ... where not exists` would be the same thing more loosely, and
--    the loose version is the one that rewrites a genuine row the day somebody
--    changes the predicate.
-- ---------------------------------------------------------------------------

do $backfill$
declare
	v_filled bigint;
begin
	insert into public.ideacad_history(concept_id, seq, kind, path, after_value, actor, at)
	select c.id, 0, 'origin', '', c.features, 'migration:0209', c.created_at
	from public.ideacad_concepts c
	on conflict (concept_id, seq) do nothing;
	get diagnostics v_filled = row_count;
	raise notice '0209: backfilled % origin row(s) for concepts that predate the action log. A re-paste reports 0, which is the expected second reading.', v_filled;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- 5. THE WRITE RPC.
--
--    ONE ROUND TRIP, ONE TRANSACTION: the actions and the tree they produced
--    land together or neither lands. See the header for why that is the whole
--    correctness claim rather than a convenience.
--
--    IT TAKES NO IDENTITY PARAMETER. The caller is `current_user_email()`
--    inside the definer, so "can only act as themselves" is a property of the
--    signature. The write gate is `_ideacad_can_write_document`, called and not
--    restated, with 0205's own viewer sentence ahead of it so a read-only
--    grantee is told which of the two refusals they hit.
--
--    IT RETURNS THE SAME STALE UNION `ideacad_save_concept` DOES. A client that
--    already knows how to read `{ok:false, reason:'stale', concept}` needs no
--    second shape to learn, and the store's conflict state is one branch rather
--    than two.
--
--    A CLIENT MAY NOT APPEND AN `origin`. Seq 0 is the trigger's and the
--    backfill's; a caller that could write one could silently reset a document
--    to anything and leave a log that replays to it perfectly.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_apply_actions(
	p_concept_id uuid,
	p_actions jsonb,
	p_features jsonb,
	p_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $apply$
declare
	c public.ideacad_concepts;
	v_action jsonb;
	v_kind text;
	v_undoes bigint;
	v_next bigint;
	v_first bigint;
	v_count integer := 0;
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

	if p_actions is null or jsonb_typeof(p_actions) is distinct from 'array' then
		-- `is distinct from` AND NOT `<>`: jsonb_typeof of an absent value is
		-- NULL, `NULL <> 'array'` is NULL, and a NULL in a boolean gate does not
		-- stop there -- it propagates out and every caller's `if not <gate>`
		-- fails to fire. That is 0078's four-month bug and 0125's repair.
		raise exception 'An IdeaCAD action batch is a JSON array.';
	end if;

	select coalesce(max(h.seq), 0) + 1 into v_next
	from public.ideacad_history h
	where h.concept_id = p_concept_id;
	v_first := v_next;

	for v_action in select * from jsonb_array_elements(p_actions)
	loop
		v_kind := v_action ->> 'kind';
		if v_kind is null or v_kind not in ('set', 'insert', 'remove', 'move') then
			raise exception 'Unknown IdeaCAD action kind: %. A client may not append an origin -- seq 0 belongs to the creation of the part.', coalesce(v_kind, '(none)');
		end if;
		if jsonb_typeof(v_action -> 'path') is distinct from 'string' then
			raise exception 'An IdeaCAD action carries a JSON Pointer path.';
		end if;

		v_undoes := null;
		if (v_action -> 'undoesSeq') is not null
			and jsonb_typeof(v_action -> 'undoesSeq') = 'number' then
			v_undoes := (v_action ->> 'undoesSeq')::bigint;
			if not exists (
				select 1 from public.ideacad_history h
				where h.concept_id = p_concept_id and h.seq = v_undoes
			) then
				raise exception 'That action is not in this part''s history.';
			end if;
			if exists (
				select 1 from public.ideacad_history h
				where h.concept_id = p_concept_id and h.undoes_seq = v_undoes
			) then
				-- The ordinary shape of two editors pressing undo at once. The
				-- unique index refuses it either way; this is the sentence.
				raise exception 'Somebody already undid that action. Reload the history and try again.';
			end if;
		end if;

		insert into public.ideacad_history(
			concept_id, seq, kind, path, before_value, after_value, undoes_seq, actor
		)
		values (
			p_concept_id,
			v_next,
			v_kind,
			v_action ->> 'path',
			case when jsonb_typeof(v_action -> 'before') = 'null' then null else v_action -> 'before' end,
			case when jsonb_typeof(v_action -> 'after') = 'null' then null else v_action -> 'after' end,
			v_undoes,
			public.current_user_email()
		);
		v_next := v_next + 1;
		v_count := v_count + 1;
	end loop;

	update public.ideacad_concepts
	set features = p_features, revision = p_revision
	where id = p_concept_id
	returning * into c;

	return jsonb_build_object(
		'ok', true,
		'concept', to_jsonb(c),
		'appended', v_count,
		'firstSeq', case when v_count = 0 then null else v_first end,
		'lastSeq', case when v_count = 0 then null else v_next - 1 end
	);
end
$apply$;

-- ---------------------------------------------------------------------------
-- 6. THE READ RPC.
--
--    NAMED `ideacad_concept_history` AND NOT `ideacad_history`. Postgres would
--    take a function sharing a name with a table, and PostgREST would route the
--    two separately; what it costs is every later reader of this file having to
--    work out which of the two a sentence means. The name is the cheap half.
--
--    IT PAGES FORWARD FROM A CURSOR RATHER THAN RETURNING THE WHOLE LOG. "All
--    the way back to the creation of the part" is the storage policy, not the
--    payload policy: a part with four thousand actions is a legitimate outcome
--    of that policy and a timeline that asks for all of them on every poll is
--    not. `p_after_seq` is exclusive, so the client's next page is its own
--    newest seq, and seq 0 is always included because a replay without a floor
--    is not a replay.
--
--    IT IS GATED ON `_ideacad_can_read_document`, WHICH IS WIDER THAN THE WRITE
--    GATE ON PURPOSE. A viewer and a teacher of record may READ a history they
--    may not add to -- that is what a shared document and a graded assignment
--    both mean -- and the RLS policy in section 2 says the same thing a second
--    time, so opening either alone still refuses.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_concept_history(
	p_concept_id uuid,
	p_after_seq bigint default -1,
	p_limit integer default 2000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $history$
declare
	v_document uuid;
	v_limit integer := least(greatest(coalesce(p_limit, 2000), 1), 5000);
	v_after bigint := coalesce(p_after_seq, -1);
begin
	select c.document_id into v_document
	from public.ideacad_concepts c
	where c.id = p_concept_id;
	-- "Not found" and "not yours" answer identically, so a concept id cannot be
	-- probed for existence from outside.
	if v_document is null or not public._ideacad_can_read_document(v_document) then
		raise exception 'That part is not one you can open.';
	end if;

	return jsonb_build_object(
		'conceptId', p_concept_id,
		'rows', coalesce((
			select jsonb_agg(to_jsonb(r) order by r.seq)
			from (
				select h.seq, h.kind, h.path,
				       h.before_value as before, h.after_value as after,
				       h.undoes_seq as "undoesSeq", h.actor, h.at
				from public.ideacad_history h
				where h.concept_id = p_concept_id
					and (h.seq > v_after or h.seq = 0)
				order by h.seq
				limit v_limit
			) r
		), '[]'::jsonb),
		'total', (select count(*) from public.ideacad_history h where h.concept_id = p_concept_id),
		'newestSeq', (select max(h.seq) from public.ideacad_history h where h.concept_id = p_concept_id)
	);
end
$history$;

-- ---------------------------------------------------------------------------
-- 7. THE GRANTS, IN 0166's SHAPE.
--
--    REVOKE FROM `public, anon, authenticated` BY NAME, then grant back
--    deliberately. `revoke ... from public` ALONE DOES NOT CLOSE A FUNCTION ON
--    THIS PROJECT: the hosted bootstrap runs
--
--      alter default privileges in schema public
--        grant execute on functions to anon, authenticated, service_role;
--
--    so every new function arrives holding a DIRECT `anon` grant that removing
--    the PUBLIC entry never touches. 0201 invented its own shape and all ten of
--    its functions came out anon-executable on production; 0202 repaired them
--    and 0206 is the standing guard. Section 8 demonstrates the trap on this
--    very database rather than citing it.
--
--    The identical bootstrap carries `grant all on tables`, so the table half
--    is the same decision: revoke all seven privileges from both client roles
--    and grant back the one that is meant. RLS covers none of TRUNCATE,
--    REFERENCES or TRIGGER.
--
--    THE CLASSIFICATION, which is what 0206 section 1 and
--    tests/db/ideacad-grants-anon-execute-surface.test.ts split on:
--
--      ideacad_apply_actions   CLIENT   an RPC the editor calls.
--      ideacad_concept_history CLIENT   an RPC the timeline calls.
--      _ideacad_history_origin DEFINER  a TRIGGER function. Nothing calls it by
--                                       name at all -- the executor fires it --
--                                       and no policy names it, so it holds no
--                                       client grant. It is on `_ideacad`'s
--                                       prefix, so 0206's sweep WILL see it and
--                                       would have reddened had it kept the
--                                       inherited anon grant.
--
--    0206 ITSELF IS NOT EDITED, and cannot be: it is an applied record. Its own
--    header says what to do instead -- classify a later migration's function
--    here and in that test, which DOES fail on an unclassified one. 0206 will
--    report these three under its "on neither list" NOTICE, which is the
--    designed reading and not a defect.
-- ---------------------------------------------------------------------------

revoke all on function
	public.ideacad_apply_actions(uuid, jsonb, jsonb, integer),
	public.ideacad_concept_history(uuid, bigint, integer),
	public._ideacad_history_origin()
	from public, anon, authenticated;

grant execute on function
	public.ideacad_apply_actions(uuid, jsonb, jsonb, integer),
	public.ideacad_concept_history(uuid, bigint, integer)
	to authenticated;

revoke all on table public.ideacad_history from public, anon, authenticated;
grant select on table public.ideacad_history to authenticated;

-- ---------------------------------------------------------------------------
-- 8. THE PASTE TRAP, CHECKED TWO WAYS AGAINST A PLANTED CONTROL.
--
--    WAY ONE -- THE TRAP, DEMONSTRATED. A scratch function is created here,
--    narrowed with `revoke ... from public` ALONE, and its anon privilege is
--    read back. On a database carrying the hosted default privileges it comes
--    back TRUE: the old shape did not close it. It is then narrowed again in
--    0166's shape and comes back FALSE. The pair is the trap and its fix, on
--    this database, in this transaction -- not a claim about somebody else's.
--    It REPORTS rather than raises, because a database without those default
--    privileges legitimately closes on the old shape, and refusing to apply
--    over a fact about the environment is the 0202 mistake in a milder costume.
--
--    WAY TWO -- THE OUTCOME. The three functions this file creates are read for
--    `anon` EXECUTE and the table for any anon privilege at all. This half
--    RAISES, because it is a fact about this file's own work.
--
--    THE POSITIVE CONTROL RUNS FIRST AND RAISES. `app_short_link_target` is
--    granted to anon deliberately (0137 keeps it: printed handouts and QR codes
--    resolve before any session exists). A sweep that cannot see a grant reports
--    the same clean result as a database that has none, so if the control does
--    not read TRUE, nothing below it means anything.
--
--    The scratch function is DROPPED before the check ends, and its absence is
--    asserted -- it is on the `_ideacad` prefix, so one left standing would show
--    up in 0206's sweep as an unclassified function forever.
-- ---------------------------------------------------------------------------

do $trap$
declare
	v_control boolean;
	v_after_public_only boolean;
	v_after_by_name boolean;
	v_open text[] := '{}';
	v_table text[] := '{}';
	r record;
begin
	select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute')
		into v_control;
	if v_control is distinct from true then
		raise exception '0209: the positive control failed -- app_short_link_target does not read as anon-executable, so this file cannot tell an anon grant from its absence and neither check below means anything.';
	end if;

	-- WAY ONE.
	execute $ctl$
		create function public._ideacad_history_paste_trap_control()
		returns integer language sql immutable as 'select 1'
	$ctl$;
	execute 'revoke all on function public._ideacad_history_paste_trap_control() from public';
	select has_function_privilege('anon', 'public._ideacad_history_paste_trap_control()', 'execute')
		into v_after_public_only;
	execute 'revoke all on function public._ideacad_history_paste_trap_control() from public, anon, authenticated';
	select has_function_privilege('anon', 'public._ideacad_history_paste_trap_control()', 'execute')
		into v_after_by_name;
	execute 'drop function public._ideacad_history_paste_trap_control()';
	if to_regprocedure('public._ideacad_history_paste_trap_control()') is not null then
		raise exception '0209: the planted control function survived its own drop. It is on the _ideacad prefix, so leaving it would put an unclassified function in 0206''s sweep permanently.';
	end if;

	if v_after_public_only then
		raise notice '0209: PASTE TRAP CONFIRMED LIVE on this database -- after `revoke ... from public` alone the planted control was STILL anon-executable, and naming the roles is what closed it (anon-executable afterwards: %). This is why every revoke in section 7 names them.',
			case when v_after_by_name then 'STILL YES, which section 7 then refuses' else 'no' end;
	else
		raise notice '0209: paste trap NOT reproduced here -- `revoke ... from public` alone closed the planted control, so this database does not carry the hosted `alter default privileges ... grant execute on functions to anon` bootstrap. Section 7 still names the roles, which is correct under both configurations; production DOES carry it (measured 2026-09-11 against 0201''s ten).';
	end if;
	if v_after_by_name then
		raise exception '0209: the planted control was STILL anon-executable after being revoked from public, anon and authenticated by name. 0166''s shape is not closing a grant on this database and section 7 cannot be trusted.';
	end if;

	-- WAY TWO.
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.proname in ('ideacad_apply_actions', 'ideacad_concept_history', '_ideacad_history_origin')
			and has_function_privilege('anon', p.oid, 'execute')
		order by 1
	loop
		v_open := v_open || r.sig;
	end loop;
	if array_length(v_open, 1) is not null then
		raise exception '0209: % of this file''s own function(s) are executable by anon: %. The revoke in section 7 did not take.',
			array_length(v_open, 1), array_to_string(v_open, ', ');
	end if;

	for r in
		select p.priv
		from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p(priv)
		where has_table_privilege('anon', 'public.ideacad_history'::regclass, p.priv)
		order by 1
	loop
		v_table := v_table || r.priv;
	end loop;
	if array_length(v_table, 1) is not null then
		raise exception '0209: anon holds % on ideacad_history: %.',
			array_length(v_table, 1), array_to_string(v_table, ', ');
	end if;

	for r in
		select p.priv
		from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p(priv)
		where has_table_privilege('authenticated', 'public.ideacad_history'::regclass, p.priv)
		order by 1
	loop
		raise exception '0209: authenticated holds % on ideacad_history. Every write is the definer RPC; a client write grant is a second way in.', r.priv;
	end loop;

	if not has_table_privilege('authenticated', 'public.ideacad_history'::regclass, 'SELECT') then
		raise exception '0209: authenticated lost select on ideacad_history. The RLS policy is what makes that grant mean "the histories you can already read"; without it the timeline is down rather than narrowed.';
	end if;

	raise notice '0209: grants verified -- 0 of 3 functions anon-executable, 2 client-callable holding authenticated, 1 trigger function holding nothing; ideacad_history holds SELECT for authenticated and nothing at all for anon.';
end
$trap$;

-- ---------------------------------------------------------------------------
-- 9. THE SELF-CHECK: every concept has a floor, and nothing is orphaned.
-- ---------------------------------------------------------------------------

do $selfcheck$
declare
	v_concepts bigint;
	v_origins bigint;
	v_actions bigint;
begin
	select count(*) into v_concepts from public.ideacad_concepts;
	select count(*) into v_origins from public.ideacad_history where kind = 'origin';
	select count(*) into v_actions from public.ideacad_history where kind <> 'origin';
	if v_origins <> v_concepts then
		raise exception '0209: % concept(s) exist but % have an origin row. Every concept needs a floor or its history cannot be replayed; the backfill in section 4 should have left these equal.',
			v_concepts, v_origins;
	end if;
	raise notice '0209: % concept(s), % origin row(s), % action row(s). Trigger, backfill, two RPCs and one policy are in place. Storage policy: NO PRUNING AND NO RETENTION -- the log goes all the way back, deliberately.',
		v_concepts, v_origins, v_actions;
end
$selfcheck$;

commit;

-- Verification query (run after applying):
select 'table public.ideacad_history' object, to_regclass('public.ideacad_history') is not null ok
union all select 'function public.ideacad_apply_actions', to_regprocedure('public.ideacad_apply_actions(uuid,jsonb,jsonb,integer)') is not null
union all select 'function public.ideacad_concept_history', to_regprocedure('public.ideacad_concept_history(uuid,bigint,integer)') is not null
union all select 'trigger ideacad_concepts_history_origin', exists(select 1 from pg_trigger where tgname='ideacad_concepts_history_origin' and tgrelid='public.ideacad_concepts'::regclass)
union all select 'unique index on (concept_id, undoes_seq)', to_regclass('public.ideacad_history_undoes_once_idx') is not null
union all select 'every concept has an origin row', (select count(*) from public.ideacad_concepts) = (select count(*) from public.ideacad_history where kind='origin')
union all select 'anon executes none of the three', not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ideacad_apply_actions','ideacad_concept_history','_ideacad_history_origin') and has_function_privilege('anon',p.oid,'execute'))
union all select 'anon holds nothing on ideacad_history', not exists(select 1 from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p(priv) where has_table_privilege('anon','public.ideacad_history'::regclass,p.priv))
union all select 'authenticated holds select on ideacad_history', has_table_privilege('authenticated','public.ideacad_history'::regclass,'SELECT');
