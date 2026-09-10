-- 0195_classroom_html_assignments.sql
-- IDEA // CLASSROOM: a PORTED HTML ASSIGNMENT -- the whole document a student
-- works inside, stored against a classroom_items row with the manifest read out
-- of it at import.
--
-- ===========================================================================
-- DO NOT APPLY FROM THIS CONTAINER
-- ===========================================================================
-- The agent proxy accepts a CONNECT to port 5432 and carries no bytes, so a
-- `psql` or `tools/apply-migration.mjs` run from a cloud session hangs and then
-- reports a connection that never existed. Apply by hand in the Supabase SQL
-- editor, or from a machine that reaches the database directly. The
-- verification query at the foot of this file is what to paste afterwards.
--
-- ===========================================================================
-- WHAT THIS FILE DOES
-- ===========================================================================
--
--   1. `classroom_html_assignments` -- one row per assignment that IS an HTML
--      document. `item_id` is the primary key, exactly as
--      `classroom_assignment_specs` is, so an item carries at most one.
--
--   2. `classroom_items.assignment_schema_version` -- a nullable integer.
--      NULL is the v1 interactive spec engine, which is every assignment that
--      exists today and every one written after this; 3 is an HTML document.
--
--   3. `classroom_set_html_assignment(item, document, manifest, filename)` --
--      the ONE write. Validates the manifest, snapshots the displaced document
--      as a revision, upserts, and stamps the version column in the same
--      statement.
--
--   4. `_classroom_check_html_manifest(jsonb)` -- the SQL boundary. The RPCs
--      here are granted to `authenticated` and reachable straight through
--      PostgREST, so the browser validator is convenience and this is the gate.
--
--   5. `classroom_content_revisions.target` gains `'html_assignment'`, and
--      `classroom_restore_revision` gains the branch that goes with it.
--
-- ===========================================================================
-- WHAT IT DELIBERATELY DOES NOT DO
-- ===========================================================================
--
-- AN ANSWER IS AN ORDINARY `classroom_responses` ROW, AND NOTHING HERE MOVES
-- ONE. That is the whole reason this feature is additive: grading, extra
-- credit, bulk grading, the Grades tab and the FACTS export read
-- `(item_id, student_email, block_id)` and cannot tell an HTML assignment from
-- a spec-driven one. A manifest block id IS a `block_id`, which is why this
-- file validates it against the same `^[A-Za-z0-9_-]{1,40}$` every authored id
-- in 0086 is validated against -- a looser pattern here is a row 0086's own
-- CHECK would refuse, discovered by a student at the moment they answer.
--
-- `kind` STAYS THE THREE-VALUE CHECK. An HTML assignment IS an assignment: it
-- has points, a due date, a rubric, a submission and a grade. A fourth kind
-- would fork every list, every feed query, every export and every policy that
-- names the set, to record a fact about how the item RENDERS. The schema
-- version column is that fact, in one nullable integer, and nothing branches on
-- it except the loader that decides which surface to draw.
--
-- THE DOCUMENT IS SERVED FROM A HANDLE THAT IS NOT THE ITEM ID.
-- `document_id` is its own uuid, stable across every revision of the same item.
-- The serving origin holds no session -- that absence is the entire security
-- model of the sandbox -- so whatever appears in that URL is readable by anyone
-- who has it. An item id appears in the signed-in classroom URL a teacher
-- projects on a whiteboard, so reusing it as the public handle would make a
-- glance at that URL enough to pull the raw document off a host with no session.
-- One extra column buys a handle that appears nowhere else. It is STABLE rather
-- than per-revision so a re-upload does not change the frame src out from under
-- a student who is working in it.
--
-- THE COPY RULES AND THE FIELD CORRESPONDENCE ARE NOT CHECKED HERE, and the
-- boundary is deliberate rather than an omission. A weekday in student-facing
-- copy, a British spelling, a manifest `field` with no `[data-field]` and a
-- `[data-field]` absent from the manifest are all refused by
-- `src/lib/classroom/html-assignment/manifest.ts` and by
-- `tools/validate-assignment-spec.py`. Every one of them requires reading the
-- HTML, and a second HTML scanner written in plpgsql is a parser that drifts
-- from the one the importer actually runs -- which is worse than the gap,
-- because a document would then pass one and fail the other with nothing able
-- to say which was right. What this file refuses is everything that would
-- corrupt a ROW: ids, uniqueness, the level rules and the arithmetic.
--
-- ZERO CLIENT WRITE GRANTS on the new table, as everywhere in this module.
--
-- REVERSAL. `drop function public.classroom_set_html_assignment(uuid, text,
-- jsonb, text); drop function public._classroom_check_html_manifest(jsonb);
-- drop table public.classroom_html_assignments;` then re-run 0110's own
-- `classroom_restore_revision` body and restore the narrower `target` CHECK.
-- The column on `classroom_items` may be left: it is nullable and nothing reads
-- it once the table is gone. Dropping the table destroys every stored document
-- and its whole revision chain, so this is a reversal for a migration that has
-- just landed, not one for a term's work.

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_html_assignments (
	item_id uuid primary key references public.classroom_items (id) on delete cascade,
	-- The public serving handle. See the header: NOT the item id, and stable
	-- across revisions.
	document_id uuid not null unique default gen_random_uuid(),
	-- The document, verbatim. Nothing rewrites a stored byte: what a reviewer
	-- reads is what executes, and the manifest below was read out of exactly
	-- these bytes.
	document text not null,
	-- The manifest AS PARSED AT IMPORT. Every `field` -> `block_id` mapping the
	-- parent ever makes goes through THIS copy and never through anything the
	-- frame sends, because a frame naming a block_id directly is a frame writing
	-- to an arbitrary row.
	manifest jsonb not null,
	-- What the teacher uploaded, for the summary line and the failure list.
	filename text not null,
	imported_by text not null,
	updated_at timestamptz not null default now()
);

-- The serving route resolves a document by its handle and by nothing else.
create index if not exists classroom_html_assignments_document_idx
	on public.classroom_html_assignments (document_id);

-- ---------------------------------------------------------------------------
-- 2. The version discriminator on the item.
--
-- Written ONLY by the setter below, in the same transaction as the row it
-- describes, so the two cannot drift. The verification query checks that.
-- ---------------------------------------------------------------------------

alter table public.classroom_items
	add column if not exists assignment_schema_version integer;

do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_items_assignment_schema_version_check'
			and conrelid = 'public.classroom_items'::regclass
	) then
		alter table public.classroom_items
			add constraint classroom_items_assignment_schema_version_check
			check (assignment_schema_version is null or assignment_schema_version in (1, 3));
	end if;
end
$$;

comment on column public.classroom_items.assignment_schema_version is
	'Which interactive engine this assignment uses. NULL (and 1) is the v1 spec engine of 0086; 3 is a ported HTML document in classroom_html_assignments (0195). Written only by classroom_set_html_assignment.';

-- ---------------------------------------------------------------------------
-- 3. The revision target.
--
-- A FIFTH CONTENT HEAD, on 0110's existing machinery rather than a chain of its
-- own. The instructor edit path for a sandboxed document is RE-UPLOAD -- there
-- is no in-place editing of a document we do not parse and must not rewrite --
-- so "a new revision" is the entire edit story, and the table that already
-- records four kinds of that is the one to record the fifth.
--
-- `alter ... drop constraint` then `add`, guarded on the catalog, because
-- Postgres has no `add constraint if not exists` and a blind drop-then-add
-- raises 2BP01 on the second run. Nothing depends on this CHECK, so dropping it
-- is safe (an RLS policy or an index over it would not be).
-- ---------------------------------------------------------------------------

do $$
declare
	v_bad integer;
begin
	-- Refuse rather than destroy: a row carrying a target the new CHECK would
	-- reject cannot exist, but assert it rather than assume it.
	select count(*) into v_bad
	from public.classroom_content_revisions
	where target not in ('item', 'assignment_spec', 'reference_spec', 'rubric', 'html_assignment');
	if v_bad > 0 then
		raise exception '0195: % revision row(s) carry a target outside the widened set. Investigate before applying.', v_bad;
	end if;

	alter table public.classroom_content_revisions
		drop constraint if exists classroom_content_revisions_target_check;
	alter table public.classroom_content_revisions
		add constraint classroom_content_revisions_target_check
		check (target in ('item', 'assignment_spec', 'reference_spec', 'rubric', 'html_assignment'));
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Reads.
--
-- The spec table's own posture, restated by delegation rather than by
-- describing who staff are: the document follows its item. A student who may
-- read the assignment may read the document that IS the assignment.
--
-- NOTE THAT THIS IS NOT THE PATH THE SANDBOX ORIGIN USES. That origin holds no
-- session and cannot satisfy any policy; it reads with the service role and
-- re-checks in the route, exactly as the Foundry serving route does. This
-- policy governs the signed-in classroom surfaces.
-- ---------------------------------------------------------------------------

revoke all on public.classroom_html_assignments from public, anon, authenticated;
grant select on public.classroom_html_assignments to authenticated;
alter table public.classroom_html_assignments enable row level security;

drop policy if exists "classroom html assignments follow their item" on public.classroom_html_assignments;
create policy "classroom html assignments follow their item"
	on public.classroom_html_assignments
	for select
	to authenticated
	using (public.classroom_can_read_item(item_id));

-- ---------------------------------------------------------------------------
-- 5. Manifest validation -- the server-side boundary.
--
-- Mirrors src/lib/classroom/html-assignment/manifest.ts for everything that
-- would corrupt a row. See the header for what is deliberately not here.
--
-- Every raise is a sentence a teacher reads: this function is reached from the
-- importer, so its text lands in the same problem list the client's own
-- refusals do.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_check_html_manifest(p_manifest jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
	v_modules jsonb;
	v_mod jsonb;
	v_blocks jsonb;
	v_block jsonb;
	v_criteria jsonb;
	v_crit jsonb;
	v_levels jsonb;
	v_level jsonb;
	v_id text;
	v_field text;
	v_type text;
	v_name text;
	v_short text;
	v_module_ids text[] := '{}';
	v_block_ids text[] := '{}';
	v_fields text[] := '{}';
	v_crit_ids text[];
	v_declared integer;
	v_module_points integer := 0;
	v_crit_sum integer;
	v_top integer;
	v_prev integer;
	v_n integer;
	v_i integer;
	v_block_count integer := 0;
begin
	if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
		raise exception 'The manifest must be a JSON object.';
	end if;
	if p_manifest->'schemaVersion' is distinct from to_jsonb(3) then
		raise exception 'The manifest needs schemaVersion 3.';
	end if;
	if p_manifest->>'kind' is distinct from 'html-assignment' then
		raise exception 'The manifest needs kind "html-assignment".';
	end if;
	if coalesce(btrim(p_manifest->>'title'), '') = '' then
		raise exception 'The manifest needs a title.';
	end if;
	if coalesce(btrim(p_manifest->>'course'), '') = '' then
		raise exception 'The manifest needs a course.';
	end if;
	if jsonb_typeof(p_manifest->'points') is distinct from 'number'
		or (p_manifest->>'points')::numeric <> floor((p_manifest->>'points')::numeric)
		or (p_manifest->>'points')::numeric < 0
		or (p_manifest->>'points')::numeric > 10000 then
		raise exception 'The manifest needs a whole points value between 0 and 10000.';
	end if;

	v_modules := p_manifest->'modules';
	if v_modules is null or jsonb_typeof(v_modules) <> 'array' or jsonb_array_length(v_modules) = 0 then
		raise exception 'The manifest needs a non-empty modules array.';
	end if;
	if jsonb_array_length(v_modules) > 40 then
		raise exception 'At most 40 modules per document.';
	end if;

	for v_mod in select * from jsonb_array_elements(v_modules) loop
		v_id := v_mod->>'id';
		-- 0086's authored-id pattern, and it is not this format's to choose:
		-- a block id below lands in classroom_responses.block_id.
		if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' then
			raise exception 'Every module needs an id of letters, digits, - and _ (up to 40 characters).';
		end if;
		if v_id = any (v_module_ids) then
			raise exception 'Duplicate module id "%".', v_id;
		end if;
		v_module_ids := v_module_ids || v_id;
		v_name := v_id;

		if coalesce(btrim(v_mod->>'title'), '') = '' then
			raise exception 'Module "%" needs a title.', v_name;
		end if;
		if jsonb_typeof(v_mod->'points') is distinct from 'number'
			or (v_mod->>'points')::numeric <> floor((v_mod->>'points')::numeric)
			or (v_mod->>'points')::numeric < 0
			or (v_mod->>'points')::numeric > 10000 then
			raise exception 'Module "%" needs a whole points value between 0 and 10000.', v_name;
		end if;
		v_declared := (v_mod->>'points')::integer;
		v_module_points := v_module_points + v_declared;

		-- `is distinct from` and NOT `<>`: an ABSENT key makes the comparison
		-- NULL rather than true, so the guard falls straight through and the
		-- check never fires. Three times in this codebase, and once it accepted
		-- a write for four months.
		if v_mod->'audience' is not null
			and jsonb_typeof(v_mod->'audience') <> 'null'
			and v_mod->>'audience' not in ('team', 'individual') then
			raise exception 'Module "%" audience must be "team" or "individual" when present.', v_name;
		end if;

		-- --- blocks -------------------------------------------------------
		v_blocks := v_mod->'blocks';
		if v_blocks is null or jsonb_typeof(v_blocks) <> 'array' then
			raise exception 'Module "%" needs a blocks array.', v_name;
		end if;
		v_block_count := v_block_count + jsonb_array_length(v_blocks);
		for v_block in select * from jsonb_array_elements(v_blocks) loop
			v_id := v_block->>'id';
			if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' then
				raise exception 'Module "%": every block needs an id of letters, digits, - and _ (up to 40 characters).', v_name;
			end if;
			-- ACROSS THE WHOLE MANIFEST, not within the module: a block id is a
			-- response row's key, and two blocks sharing one write to one row.
			if v_id = any (v_block_ids) then
				raise exception 'Duplicate block id "%". Block ids key every stored answer, so two blocks sharing one would write to the same row.', v_id;
			end if;
			v_block_ids := v_block_ids || v_id;

			v_field := btrim(coalesce(v_block->>'field', ''));
			if v_field = '' then
				raise exception 'Block "%" needs a field naming the document''s data-field attribute.', v_id;
			end if;
			if v_field = any (v_fields) then
				raise exception 'Two blocks both claim the field "%". One input cannot answer two blocks.', v_field;
			end if;
			v_fields := v_fields || v_field;

			v_type := v_block->>'type';
			if v_type is null or v_type not in ('text', 'longText', 'checkbox', 'radio', 'image', 'table') then
				raise exception 'Block "%" has an unknown type "%".', v_id, coalesce(v_type, '(none)');
			end if;
			if v_block->'minSentences' is not null
				and jsonb_typeof(v_block->'minSentences') <> 'null'
				and (jsonb_typeof(v_block->'minSentences') <> 'number'
					or (v_block->>'minSentences')::numeric < 0
					or (v_block->>'minSentences')::numeric > 100
					or (v_block->>'minSentences')::numeric <> floor((v_block->>'minSentences')::numeric)) then
				raise exception 'Block "%" minSentences must be a whole number between 0 and 100.', v_id;
			end if;
		end loop;

		-- --- criteria -----------------------------------------------------
		v_criteria := v_mod->'criteria';
		if v_criteria is null or jsonb_typeof(v_criteria) <> 'array' or jsonb_array_length(v_criteria) = 0 then
			raise exception 'Module "%" needs a non-empty criteria array.', v_name;
		end if;
		v_crit_ids := '{}';
		v_crit_sum := 0;

		for v_crit in select * from jsonb_array_elements(v_criteria) loop
			v_id := v_crit->>'id';
			if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' then
				raise exception 'Module "%": every criterion needs an id of letters, digits, - and _ (up to 40 characters).', v_name;
			end if;
			-- WITHIN the module only. rubricFromSpec namespaces a criterion as
			-- `<moduleId>-<criterionId>`, so a cross-module repeat collides with
			-- nothing and refusing it would be refusing a legal document.
			if v_id = any (v_crit_ids) then
				raise exception 'Module "%" repeats the criterion id "%".', v_name, v_id;
			end if;
			v_crit_ids := v_crit_ids || v_id;

			if coalesce(btrim(v_crit->>'text'), '') = '' then
				raise exception 'Module "%" criterion "%" needs text.', v_name, v_id;
			end if;

			v_levels := v_crit->'levels';
			if v_levels is null or jsonb_typeof(v_levels) <> 'array' then
				raise exception 'Module "%" criterion "%" needs a levels array.', v_name, v_id;
			end if;
			v_n := jsonb_array_length(v_levels);
			if v_n < 3 or v_n > 4 then
				raise exception 'Module "%" criterion "%" has % level(s); a criterion carries 3 or 4. Two is a pass/fail check and belongs in a checkbox block.', v_name, v_id, v_n;
			end if;

			-- THE TOP LEVEL'S POINTS ARE THE CRITERION MAXIMUM, so they are read
			-- and validated BEFORE the loop -- three checks below need the
			-- number, and one of them has to fire before the descent rule.
			if jsonb_typeof(v_levels->0->'points') is distinct from 'number'
				or (v_levels->0->>'points')::numeric <> floor((v_levels->0->>'points')::numeric)
				or (v_levels->0->>'points')::numeric < 0
				or (v_levels->0->>'points')::numeric > 1000 then
				raise exception 'Module "%" criterion "%" level 1 needs a whole point value between 0 and 1000.', v_name, v_id;
			end if;
			v_top := (v_levels->0->>'points')::integer;

			-- A criterion worth less than the number of levels above its bottom
			-- cannot carry that many DISTINCT whole values, so a 1-point
			-- criterion cannot have three levels.
			--
			-- THIS RUNS BEFORE THE DESCENT RULE AND THAT ORDER IS THE WHOLE
			-- VALUE OF THE CHECK. Levels are whole numbers and the bottom is 0,
			-- so [1, 1, 0] is the only three-level shape a 1-point criterion can
			-- take -- which means the descent rule ALWAYS fires on it first and
			-- this message would be unreachable behind it. An author reading
			-- "level 3 must be worth less than the level above it" goes and
			-- rewrites levels that were never the problem; the problem is that
			-- the criterion has no room, and that is what this says.
			if v_top < v_n - 1 then
				raise exception 'Module "%" criterion "%" is worth % but carries % levels, which need % distinct values above zero. Give it at least % points, or merge it into another criterion.', v_name, v_id, v_top, v_n, v_n - 1, v_n - 1;
			end if;

			v_prev := null;
			v_i := 0;
			for v_level in select * from jsonb_array_elements(v_levels) loop
				v_i := v_i + 1;
				if jsonb_typeof(v_level->'points') is distinct from 'number'
					or (v_level->>'points')::numeric <> floor((v_level->>'points')::numeric)
					or (v_level->>'points')::numeric < 0
					or (v_level->>'points')::numeric > 1000 then
					raise exception 'Module "%" criterion "%" level % needs a whole point value between 0 and 1000.', v_name, v_id, v_i;
				end if;
				if coalesce(btrim(v_level->>'label'), '') = '' then
					raise exception 'Module "%" criterion "%" level % needs a label.', v_name, v_id, v_i;
				end if;
				if coalesce(btrim(v_level->>'descriptor'), '') = '' then
					raise exception 'Module "%" criterion "%" level % needs a descriptor.', v_name, v_id, v_i;
				end if;
				-- `short` IS REQUIRED, and it is required BECAUSE of the
				-- 2026-09-08 report: levelShort renders `short` ahead of the
				-- descriptor, so an instructor who edits descriptors on a level
				-- with no short sees nothing change. A manifest carries both,
				-- every level, or it is not stored.
				v_short := btrim(coalesce(v_level->>'short', ''));
				if v_short = '' then
					raise exception 'Module "%" criterion "%" level % needs a short form. The grading console renders it on the level button, ahead of the descriptor.', v_name, v_id, v_i;
				end if;
				if array_length(regexp_split_to_array(v_short, '\s+'), 1) > 6 then
					raise exception 'Module "%" criterion "%" level % short "%" is over the six-word maximum.', v_name, v_id, v_i, v_short;
				end if;
				if right(v_short, 1) in ('.', '!', '?') then
					raise exception 'Module "%" criterion "%" level % short "%" ends in punctuation.', v_name, v_id, v_i, v_short;
				end if;

				if v_prev is not null and (v_level->>'points')::integer >= v_prev then
					raise exception 'Module "%" criterion "%" level % must be worth less than the level above it.', v_name, v_id, v_i;
				end if;
				v_prev := (v_level->>'points')::integer;
			end loop;

			if v_prev <> 0 then
				raise exception 'Module "%" criterion "%": the bottom level must be worth 0.', v_name, v_id;
			end if;
			-- POINTS, WAY ONE OF THREE.
			if v_crit->'points' is not null
				and jsonb_typeof(v_crit->'points') <> 'null'
				and (v_crit->>'points')::numeric <> v_top then
				raise exception 'Module "%" criterion "%" declares % points but its top level is worth %.', v_name, v_id, v_crit->>'points', v_top;
			end if;
			if v_crit->'points' is null or jsonb_typeof(v_crit->'points') = 'null' then
				raise exception 'Module "%" criterion "%" needs a points value (it is the top level''s, %).', v_name, v_id, v_top;
			end if;

			v_crit_sum := v_crit_sum + v_top;
		end loop;

		-- POINTS, WAY TWO OF THREE.
		if v_crit_sum <> v_declared then
			raise exception 'Module "%" criteria sum to % but the module is worth % points.', v_name, v_crit_sum, v_declared;
		end if;
	end loop;

	if v_block_count > 400 then
		raise exception 'At most 400 blocks per document (this one has %).', v_block_count;
	end if;

	-- POINTS, WAY THREE OF THREE.
	if v_module_points <> (p_manifest->>'points')::integer then
		raise exception 'Modules sum to % points but the manifest declares %.', v_module_points, (p_manifest->>'points')::integer;
	end if;
end;
$$;

-- A NARROWING MUST NAME THE ROLES. `revoke ... from public` alone leaves the
-- direct `anon` grant a hosted Supabase project writes into every new
-- function's proacl at creation time, and 0137 is the sweep that had to repair
-- 360 functions written under that misreading. This function is a private
-- helper called only from the definer setter below, so it is granted to
-- nobody -- but `service_role` is deliberately left alone, because it is never
-- part of that narrowing anywhere in this schema.
revoke all on function public._classroom_check_html_manifest(jsonb)
	from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The write.
--
-- TWO GATES, IN THIS ORDER, AND THE ORDER IS THE POINT.
--
--   `_classroom_manages_item` is the PERMANENT bar -- the same one editing the
--   item carries, because a ported document changes what every posted class's
--   students are asked to do.
--
--   `is_admin()` is the SEASON bar, one of the four decisions the contract
--   states: upload is admin-only for the first season. It is written as its own
--   statement, named as the season gate, so lifting it is deleting one `if`.
--   Were it the only gate, deleting it would open the write to every signed-in
--   account, which is why the permanent bar goes first and stands on its own.
--
-- A null document REMOVES, and removing is recoverable: the displaced document
-- is snapshotted first, exactly as 0110 made "Remove" recoverable for a spec.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_html_assignment(
	p_item_id uuid,
	p_document text,
	p_manifest jsonb,
	p_filename text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_kind text;
	v_current jsonb;
	v_revision integer;
	v_document_id uuid;
	v_filename text;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That item does not exist.';
	end if;
	if v_kind <> 'assignment' then
		raise exception 'Only an assignment can carry an HTML document.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can set its document.';
	end if;
	-- THE SEASON GATE. Delete this one statement to open uploading beyond
	-- admins; the permanent bar above is what still holds after it goes.
	if not public.is_admin() then
		raise exception 'Uploading a ported HTML assignment is limited to site admins this season.';
	end if;

	-- The whole head, so the snapshot carries what a restore needs to put back.
	select jsonb_build_object(
		'document', h.document,
		'manifest', h.manifest,
		'filename', h.filename
	), h.document_id
	into v_current, v_document_id
	from public.classroom_html_assignments h
	where h.item_id = p_item_id
	for update;

	if p_document is null then
		v_revision := public._classroom_snapshot_content(p_item_id, 'html_assignment', v_current);
		delete from public.classroom_html_assignments where item_id = p_item_id;
		update public.classroom_items set assignment_schema_version = null where id = p_item_id;
		return jsonb_build_object(
			'ok', true, 'item_id', p_item_id, 'removed', true, 'revision', v_revision);
	end if;

	if btrim(p_document) = '' then
		raise exception 'The document is empty.';
	end if;
	-- The client refuses this before the request is made and states the limit
	-- beside the size (HTML_DOCUMENT_MAX_BYTES in store.ts). This is the same
	-- number as the boundary rather than as a courtesy.
	if octet_length(p_document) > 2097152 then
		raise exception 'The document is too large (2.0 MB cap).';
	end if;
	perform public._classroom_check_html_manifest(p_manifest);

	v_filename := btrim(coalesce(p_filename, ''));
	if v_filename = '' then
		raise exception 'The document needs a filename.';
	end if;
	if length(v_filename) > 300 then
		v_filename := left(v_filename, 300);
	end if;

	-- The no-op guard, on the same terms as every other head here: jsonb
	-- equality IS the whole question for a document stored verbatim. A re-upload
	-- of byte-identical content mints no revision, so a version list counts
	-- edits rather than saves.
	if v_current is distinct from jsonb_build_object(
		'document', p_document, 'manifest', p_manifest, 'filename', v_filename
	) then
		v_revision := public._classroom_snapshot_content(p_item_id, 'html_assignment', v_current);
	end if;

	insert into public.classroom_html_assignments
		(item_id, document, manifest, filename, imported_by, updated_at)
	values (p_item_id, p_document, p_manifest, v_filename, public.current_user_email(), now())
	on conflict (item_id) do update
		set document = excluded.document,
			manifest = excluded.manifest,
			filename = excluded.filename,
			imported_by = excluded.imported_by,
			updated_at = now()
	returning document_id into v_document_id;

	-- IN THE SAME TRANSACTION AS THE ROW IT DESCRIBES. That is what makes the
	-- column a fact rather than a cache: there is no window in which an item
	-- claims a schema version whose row is not there.
	update public.classroom_items set assignment_schema_version = 3 where id = p_item_id;

	return jsonb_build_object(
		'ok', true,
		'item_id', p_item_id,
		'document_id', v_document_id,
		'revision', v_revision
	);
end;
$$;

revoke all on function public.classroom_set_html_assignment(uuid, text, jsonb, text)
	from public, anon, authenticated;
grant execute on function public.classroom_set_html_assignment(uuid, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Restore.
--
-- 0110's body with ONE branch added. Recreated in full rather than patched,
-- because there is no way to add a branch to a plpgsql body in place -- and
-- diffed against 0110's source rather than reconstructed from memory, which is
-- how error semantics quietly change.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_restore_revision(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_rev public.classroom_content_revisions%rowtype;
	v_before integer;
	v_after integer;
	v_new_id uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;

	select r.* into v_rev
	from public.classroom_content_revisions r
	where r.id = p_revision_id;
	if not found then
		raise exception 'That revision does not exist.';
	end if;
	if not public._classroom_manages_item(v_rev.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can restore it.';
	end if;

	select max(r.revision) into v_before
	from public.classroom_content_revisions r
	where r.item_id = v_rev.item_id and r.target = v_rev.target;

	if v_rev.target = 'item' then
		perform public.classroom_update_item(
			v_rev.item_id,
			v_rev.payload ->> 'title',
			coalesce(v_rev.payload ->> 'body', ''),
			nullif(v_rev.payload ->> 'points', '')::integer,
			nullif(v_rev.payload ->> 'due_at', '')::timestamptz,
			v_rev.payload ->> 'category',
			null,
			null,
			case
				when jsonb_typeof(v_rev.payload -> 'body_doc') = 'null' then null
				else v_rev.payload -> 'body_doc'
			end,
			nullif(v_rev.payload ->> 'publish_at', '')::timestamptz
		);
	elsif v_rev.target = 'assignment_spec' then
		perform public.classroom_set_assignment_spec(v_rev.item_id, v_rev.payload);
	elsif v_rev.target = 'reference_spec' then
		perform public.classroom_set_reference_spec(v_rev.item_id, v_rev.payload);
	elsif v_rev.target = 'rubric' then
		perform public.classroom_set_rubric(v_rev.item_id, v_rev.payload);
	elsif v_rev.target = 'html_assignment' then
		-- THROUGH THE ORDINARY SETTER, like every other target, which is what
		-- makes the consequences free rather than remembered: the head it
		-- displaces is snapshotted, the manifest is validated AGAIN (so a
		-- document a later migration would refuse fails with that validator's
		-- own message rather than landing), and BOTH gates are re-checked --
		-- including the season gate, so restoring is admin-only exactly as
		-- uploading is.
		perform public.classroom_set_html_assignment(
			v_rev.item_id,
			v_rev.payload ->> 'document',
			v_rev.payload -> 'manifest',
			v_rev.payload ->> 'filename'
		);
	else
		raise exception 'That revision cannot be restored.';
	end if;

	select max(r.revision) into v_after
	from public.classroom_content_revisions r
	where r.item_id = v_rev.item_id and r.target = v_rev.target;

	if v_after is distinct from v_before then
		update public.classroom_content_revisions
		set restored_from_id = p_revision_id
		where item_id = v_rev.item_id and target = v_rev.target and revision = v_after
		returning id into v_new_id;
	end if;

	return jsonb_build_object(
		'ok', true,
		'item_id', v_rev.item_id,
		'target', v_rev.target,
		'restored', v_rev.revision,
		'snapshot_id', v_new_id,
		'changed', v_after is distinct from v_before
	);
end;
$$;

revoke all on function public.classroom_restore_revision(uuid) from public, anon, authenticated;
grant execute on function public.classroom_restore_revision(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Self-checks, and the counts for the operator.
--
-- The manifest checker is put to fixtures computed by hand from the rules
-- above, never read back from itself: a check derived from the implementation's
-- own answer cannot fail. Each one asserts a REFUSAL, and the last asserts an
-- acceptance -- an all-refusing validator passes every negative case and is
-- exactly as broken as an all-accepting one.
-- ---------------------------------------------------------------------------

do $checks$
declare
	v_ok jsonb;
	v_items integer;
	v_docs integer;
	v_stamped integer;
	v_anon boolean;
	v_refused integer := 0;
	v_src text;
begin
	-- A legal manifest: one module, 4 points, one criterion of 4 with 4 levels.
	v_ok := jsonb_build_object(
		'schemaVersion', 3,
		'kind', 'html-assignment',
		'title', 'Tolerance stack',
		'course', 'IDEA100',
		'points', 4,
		'modules', jsonb_build_array(jsonb_build_object(
			'id', 'stack', 'title', 'Stack up the tolerances', 'points', 4,
			'blocks', jsonb_build_array(jsonb_build_object(
				'id', 'stack-total', 'field', 'total', 'type', 'text')),
			'criteria', jsonb_build_array(jsonb_build_object(
				'id', 'arithmetic', 'text', 'The stack arithmetic is correct', 'points', 4,
				'levels', jsonb_build_array(
					jsonb_build_object('points', 4, 'label', 'Complete', 'short', 'All four correct', 'descriptor', 'All four dimensions summed correctly.'),
					jsonb_build_object('points', 3, 'label', 'Proficient', 'short', 'Three correct', 'descriptor', 'Three of four dimensions summed correctly.'),
					jsonb_build_object('points', 1, 'label', 'Developing', 'short', 'Two correct', 'descriptor', 'Two of four dimensions summed correctly.'),
					jsonb_build_object('points', 0, 'label', 'Absent', 'short', 'Fewer than two', 'descriptor', 'Fewer than two correct, or not attempted.')
				)))
		))
	);

	-- POSITIVE CONTROL FIRST. If this raises, every negative case below is
	-- passing for the wrong reason.
	begin
		perform public._classroom_check_html_manifest(v_ok);
	exception when others then
		raise exception '0195: the checker refuses a legal manifest: %', sqlerrm;
	end;

	-- Two levels.
	begin
		perform public._classroom_check_html_manifest(jsonb_set(v_ok,
			'{modules,0,criteria,0,levels}', jsonb_build_array(
				v_ok->'modules'->0->'criteria'->0->'levels'->0,
				v_ok->'modules'->0->'criteria'->0->'levels'->3)));
		raise exception '0195: the checker accepted a two-level criterion.';
	exception when others then
		if sqlerrm like '0195:%' then raise; end if;
		v_refused := v_refused + 1;
	end;

	-- A criterion worth 1 carrying three levels.
	begin
		perform public._classroom_check_html_manifest(jsonb_set(jsonb_set(jsonb_set(v_ok,
			'{points}', to_jsonb(1)),
			'{modules,0,points}', to_jsonb(1)),
			'{modules,0,criteria,0}', jsonb_build_object(
				'id', 'arithmetic', 'text', 'Correct', 'points', 1,
				'levels', jsonb_build_array(
					jsonb_build_object('points', 1, 'label', 'Complete', 'short', 'Correct', 'descriptor', 'Correct.'),
					jsonb_build_object('points', 1, 'label', 'Partial', 'short', 'Partly correct', 'descriptor', 'Partly correct.'),
					jsonb_build_object('points', 0, 'label', 'Absent', 'short', 'Not attempted', 'descriptor', 'Not attempted.')))));
		raise exception '0195: the checker accepted a 1-point criterion with three levels.';
	exception when others then
		if sqlerrm like '0195:%' then raise; end if;
		v_refused := v_refused + 1;
	end;

	-- A duplicated block id, across two modules.
	begin
		perform public._classroom_check_html_manifest(jsonb_set(jsonb_set(v_ok,
			'{points}', to_jsonb(8)),
			'{modules}', (v_ok->'modules') || jsonb_build_array(
				jsonb_set(jsonb_set(v_ok->'modules'->0, '{id}', to_jsonb('second'::text)),
					'{blocks,0,field}', to_jsonb('second-total'::text)))));
		raise exception '0195: the checker accepted a duplicated block id.';
	exception when others then
		if sqlerrm like '0195:%' then raise; end if;
		v_refused := v_refused + 1;
	end;

	-- A criterion id repeated INSIDE one module. (Across modules is harmless:
	-- rubricFromSpec namespaces as `<moduleId>-<criterionId>`.)
	begin
		perform public._classroom_check_html_manifest(jsonb_set(jsonb_set(v_ok,
			'{modules,0,points}', to_jsonb(8)),
			'{modules,0,criteria}', (v_ok->'modules'->0->'criteria') || (v_ok->'modules'->0->'criteria')));
		raise exception '0195: the checker accepted a repeated criterion id inside one module.';
	exception when others then
		if sqlerrm like '0195:%' then raise; end if;
		v_refused := v_refused + 1;
	end;

	-- Module points not summing to the declared total.
	begin
		perform public._classroom_check_html_manifest(jsonb_set(v_ok, '{points}', to_jsonb(5)));
		raise exception '0195: the checker accepted a manifest whose modules do not sum to its total.';
	exception when others then
		if sqlerrm like '0195:%' then raise; end if;
		v_refused := v_refused + 1;
	end;

	-- Criteria not summing to the module.
	begin
		perform public._classroom_check_html_manifest(jsonb_set(jsonb_set(v_ok,
			'{points}', to_jsonb(5)), '{modules,0,points}', to_jsonb(5)));
		raise exception '0195: the checker accepted a module its criteria do not sum to.';
	exception when others then
		if sqlerrm like '0195:%' then raise; end if;
		v_refused := v_refused + 1;
	end;

	-- A level with no short form -- the 2026-09-08 defect, in the schema.
	begin
		perform public._classroom_check_html_manifest(
			v_ok #- '{modules,0,criteria,0,levels,0,short}'::text[]);
		raise exception '0195: the checker accepted a level with no short form.';
	exception when others then
		if sqlerrm like '0195:%' then raise; end if;
		v_refused := v_refused + 1;
	end;

	if v_refused <> 7 then
		raise exception '0195: expected 7 refusals from the checker, got %.', v_refused;
	end if;

	-- The season gate is IN the setter body, so read it there rather than
	-- trusting that it was typed: a gate deleted by a later careless edit is
	-- invisible until somebody uploads.
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_set_html_assignment';
	if v_src not like '%is_admin()%' then
		raise exception '0195: the setter carries no admin season gate.';
	end if;
	if v_src not like '%_classroom_manages_item%' then
		raise exception '0195: the setter carries no manages-item gate.';
	end if;

	-- The ACL, not the self-check's verdict. A hosted Supabase project writes a
	-- direct `anon` grant into every new function at creation time, so `revoke
	-- from public` alone would leave this open and the migration would still
	-- report success.
	select has_function_privilege('anon', 'public.classroom_set_html_assignment(uuid, text, jsonb, text)', 'execute')
		into v_anon;
	if v_anon then
		raise exception '0195: classroom_set_html_assignment is still granted to anon.';
	end if;
	select has_function_privilege('anon', 'public._classroom_check_html_manifest(jsonb)', 'execute')
		into v_anon;
	if v_anon then
		raise exception '0195: _classroom_check_html_manifest is still granted to anon.';
	end if;
	select has_table_privilege('anon', 'public.classroom_html_assignments', 'select') into v_anon;
	if v_anon then
		raise exception '0195: classroom_html_assignments is still readable by anon.';
	end if;

	select count(*) into v_items from public.classroom_items where kind = 'assignment';
	select count(*) into v_docs from public.classroom_html_assignments;
	select count(*) into v_stamped from public.classroom_items where assignment_schema_version = 3;

	raise notice '0195: % assignment item(s) exist; % of them carry an HTML document and % are stamped schema 3 (both 0 on a first apply).', v_items, v_docs, v_stamped;
	raise notice '0195: the manifest checker refused all 7 malformed fixtures and accepted the legal one.';
	raise notice '0195: classroom_content_revisions.target now admits html_assignment; classroom_restore_revision gained the matching branch. No existing row was read, moved or rewritten by this file.';
end
$checks$;

-- ===========================================================================
-- VERIFICATION QUERY -- paste into the SQL editor after applying
-- ===========================================================================
--
-- select
--   (select count(*) from pg_tables
--      where schemaname = 'public' and tablename = 'classroom_html_assignments') as table_present,
--   (select count(*) from information_schema.columns
--      where table_schema = 'public' and table_name = 'classroom_items'
--        and column_name = 'assignment_schema_version')                          as version_column,
--   (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname in ('classroom_set_html_assignment',
--                          '_classroom_check_html_manifest'))                    as functions_present,
--   (select count(*) from pg_policies
--      where schemaname = 'public' and tablename = 'classroom_html_assignments') as policies,
--   (select relrowsecurity from pg_class
--      where oid = 'public.classroom_html_assignments'::regclass)                as rls_on,
--   has_function_privilege('anon',
--     'public.classroom_set_html_assignment(uuid, text, jsonb, text)', 'execute') as anon_can_write,
--   has_table_privilege('anon', 'public.classroom_html_assignments', 'select')    as anon_can_read,
--   has_function_privilege('authenticated',
--     'public.classroom_set_html_assignment(uuid, text, jsonb, text)', 'execute') as authed_can_write,
--   (select pg_get_constraintdef(oid) from pg_constraint
--      where conname = 'classroom_content_revisions_target_check')                as revision_targets,
--   (select count(*) from public.classroom_items i
--      left join public.classroom_html_assignments h on h.item_id = i.id
--      where (i.assignment_schema_version = 3) <> (h.item_id is not null))        as version_row_disagreements;
--
-- EXPECT: table_present 1, version_column 1, functions_present 2, policies 1,
-- rls_on true, anon_can_write false, anon_can_read false, authed_can_write true,
-- revision_targets naming all five including html_assignment, and
-- version_row_disagreements 0.
--
-- THE LAST ONE IS THE INTERESTING FIGURE and is worth re-running later: it is
-- the only thing that could drift, and a non-zero answer means something other
-- than classroom_set_html_assignment wrote that column.
