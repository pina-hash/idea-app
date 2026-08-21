-- 0122_rich_text_nested_lists.sql
--
-- Widen BOTH rich-text storage gates to accept a nested list, and nothing
-- else. No table, no column, no grant, no data: five `create or replace`s and
-- four new internal helpers.
--
-- ===========================================================================
-- WHY THIS SHIPS ON ITS OWN, AND WHY IT SHIPS FIRST
-- ===========================================================================
--
-- `src/lib/server/rich-text-normalize.ts` FLATTENS a sublist today: its items
-- become more items of the same list, because the stored shape (`ul`/`ol` with
-- one run list per item) has nowhere to put a level. That flattening is the
-- fix for a data-loss defect and is correct as far as it goes; what it costs
-- is the indentation the author wrote.
--
-- Undoing it needs three things -- a wider stored shape, a wider gate on both
-- sides, and a renderer that can nest -- and THE ORDER IS NOT SYMMETRIC:
--
--   * A gate that accepts nesting while the normalizer still flattens is
--     INERT. Nothing emits the shape, so nothing changes.
--   * A normalizer that emits nesting before the gate accepts it REFUSES
--     EVERY WRITE, on both features at once, with a message about the content
--     being unreadable.
--
-- So the gate goes first, always, and it goes alone. This file changes no
-- component, no normalizer and no renderer. Applying it is observable only by
-- calling the gates directly.
--
-- ===========================================================================
-- THE STORED SHAPE, AND WHY THIS ONE
-- ===========================================================================
--
-- A list item STAYS AN ARRAY. What widens is what may sit in it:
--
--     item := ( run | list )*
--     run  := { text, bold?, italic?, href? }          -- unchanged
--     list := { type: 'ul' | 'ol', items: item[] }     -- unchanged
--
-- So `[{"text":"Materials"}, {"type":"ul","items":[[{"text":"beaker"}]]}]` is
-- an item reading "Materials" with a two-deep sublist under it.
--
-- WHY NOT THE OBVIOUS CANDIDATE -- an item that holds BLOCKS, ProseMirror's
-- own `listItem: paragraph block*`, where the item's own text is wrapped in a
-- `p`. Because that makes every item stored to date a SECOND, LEGACY
-- VOCABULARY that can never be retired. `notebook_entry_notes` is append-only
-- and has no UPDATE grant at all, by design, so a stored revision cannot be
-- rewritten into the new shape by any migration that respects the rest of this
-- schema; the gate and the renderer would both have to carry "is this item a
-- run list or a block list?" forever, and two vocabularies for one thing is
-- precisely what quietly stops matching.
--
-- The shape above has no legacy branch, because a run can never carry a `type`
-- key -- `type` is not in the run whitelist, on either side, and has not been
-- since 0078. So `type` is a TOTAL discriminator per element, and every
-- document stored to date is exactly the case with no nested element in it.
-- The gate does not widen for old content; old content is a subset.
--
-- WHY ONLY `ul`/`ol` MAY NEST, and not `p`/`h3`/`h4`. Allowing a `p` inside an
-- item would give an item's own text two spellings -- bare runs, or runs
-- wrapped in a paragraph -- and the two would drift the first time anything
-- read one without the other. One spelling.
--
-- WHAT IT COSTS THE RENDERER LATER, stated plainly because that bill comes
-- due in the next bundle and not this one:
--
--   * The list renderer becomes RECURSIVE. It already walks an item's
--     elements; it gains one branch (an element with a `type` is a sublist,
--     rendered as a nested <ul>/<ol> INSIDE the <li>) and has to carry the
--     depth cap down with it, because a renderer that trusts the gate is a
--     renderer that breaks the day something reaches the table another way.
--   * A list item still cannot hold TWO PARAGRAPHS. An item's own text is one
--     run sequence, so a multi-paragraph list item arrives as several items,
--     exactly as it does today. That is a real limit of this shape and it is
--     accepted deliberately: the block-list alternative buys it at the price
--     of the permanent legacy vocabulary above.
--   * The plain-text projections have to descend. The SQL one does so here
--     (section 4); `docText` in `src/lib/classroom/classroom-doc.ts` and
--     `src/lib/notebook-notes.ts` still do not, which is a CLIENT change
--     belonging to the normalizer bundle. It cannot be observed until
--     something emits nesting, which nothing does.
--
-- ===========================================================================
-- THE DEPTH CAPS
-- ===========================================================================
--
-- 12 for a note, 16 for an item body: the `maxDepth` each normalizer already
-- walks with (`src/lib/server/notebook-notes.ts`,
-- `src/lib/server/classroom-doc.ts`). A list at the top of a document is depth
-- 1; a list inside one of its items is depth 2. Twelve levels are permitted in
-- a note and the thirteenth is refused; sixteen in a body and the seventeenth
-- is refused.
--
-- THE CAP IS CHECKED ON THE WAY IN, BEFORE ANY RECURSION, so a document nested
-- ten thousand deep is refused at level 13 (or 17) and the recursion never
-- goes deeper than that. jsonb holds a TREE and cannot express a reference
-- cycle, so unbounded self-similar nesting is the only thing a "cycle" can be
-- here, and the depth check is what answers it -- with `false`, not with a
-- stack error.
--
-- The two numbers are wider than they look. The normalizer's `maxDepth` counts
-- ProseMirror TREE levels, and one real list level costs two of them
-- (`list -> listItem -> list`, which is why `listItems` recurses at
-- `depth + 2`), so a normalizer capped at 12 can emit about six list levels.
-- A gate must accept everything the normalizer can produce and is under no
-- obligation to be tighter; being tighter is how a legitimate save starts
-- failing.
--
-- ===========================================================================
-- WHAT UNDOES THIS
-- ===========================================================================
--
-- Re-paste the `_notebook_note_content_ok` block from 0078 and the
-- `_classroom_runs_ok`, `_classroom_doc_ok` and `_classroom_doc_text` blocks
-- from 0108, in that order; the four helpers this file adds then have no
-- callers and can be dropped. Nothing else has to be touched, because nothing
-- else changed -- there is no data to migrate back and no schema to rebuild.
-- Do NOT undo it by re-applying 0078 or 0108 whole: both files also carry RPC
-- definitions that six later migrations have replaced.
--
-- Apply manually in the Supabase SQL editor, after 0121. Re-applying it is
-- ordinary and does nothing the first application did not.

-- ---------------------------------------------------------------------------
-- 1. The notebook gate (0078), widened
-- ---------------------------------------------------------------------------

-- One list's items, at nesting depth `p_depth`. Returns the total character
-- count of everything under it, or -1 for anything that is not a valid list --
-- the `_notebook_note_run_len` convention, which is what lets the running
-- total flow back up through a sublist instead of being lost at the boundary.
create or replace function public._notebook_note_list_len(p_items jsonb, p_depth integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_item jsonb;
	v_node jsonb;
	v_type text;
	v_len integer;
	v_total integer := 0;
begin
	-- FIRST, before a single element is looked at. See the header.
	if p_depth is null or p_depth > 12 then
		return -1;
	end if;
	if jsonb_typeof(p_items) is distinct from 'array' then
		return -1;
	end if;

	for v_item in select value from jsonb_array_elements(p_items) loop
		-- An item is an array. 0078 said so and it still does; what changed is
		-- what may be IN it.
		if jsonb_typeof(v_item) is distinct from 'array' then
			return -1;
		end if;

		for v_node in select value from jsonb_array_elements(v_item) loop
			if jsonb_typeof(v_node) is distinct from 'object' then
				return -1;
			end if;

			if v_node ? 'type' then
				-- A `type` key means this element is claiming to be a block, and
				-- the only block an item may hold is a list. A run cannot reach
				-- here: `type` is not in its whitelist.
				v_type := v_node ->> 'type';
				if v_type is null or v_type not in ('ul', 'ol') then
					return -1;
				end if;
				if exists (
					select 1 from jsonb_object_keys(v_node) k where k not in ('type', 'items')
				) then
					return -1;
				end if;
				v_len := public._notebook_note_list_len(v_node -> 'items', p_depth + 1);
			else
				v_len := public._notebook_note_run_len(v_node);
			end if;

			if v_len < 0 then
				return -1;
			end if;
			v_total := v_total + v_len;
		end loop;
	end loop;

	return v_total;
end;
$$;

revoke all on function public._notebook_note_list_len(jsonb, integer) from public;

-- The whole note document. Identical to 0078 except that the `ul`/`ol` branch
-- delegates its items to the helper above instead of walking them itself.
create or replace function public._notebook_note_content_ok(p_content jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_block jsonb;
	v_run jsonb;
	v_type text;
	v_len integer;
	v_total integer := 0;
begin
	if p_content is null or jsonb_typeof(p_content) <> 'array' then
		return false;
	end if;
	if jsonb_array_length(p_content) = 0 or jsonb_array_length(p_content) > 2000 then
		return false;
	end if;

	for v_block in select value from jsonb_array_elements(p_content) loop
		if jsonb_typeof(v_block) <> 'object' then
			return false;
		end if;
		v_type := v_block ->> 'type';

		if v_type = 'p' then
			if exists (
				select 1 from jsonb_object_keys(v_block) k where k not in ('type', 'runs')
			) then
				return false;
			end if;
			if jsonb_typeof(v_block -> 'runs') <> 'array' then
				return false;
			end if;
			for v_run in select value from jsonb_array_elements(v_block -> 'runs') loop
				v_len := public._notebook_note_run_len(v_run);
				if v_len < 0 then
					return false;
				end if;
				v_total := v_total + v_len;
			end loop;

		elsif v_type in ('ul', 'ol') then
			if exists (
				select 1 from jsonb_object_keys(v_block) k where k not in ('type', 'items')
			) then
				return false;
			end if;
			-- CARRIED OVER VERBATIM FROM 0078, `<>` AND ALL, AND LEFT ALONE ON
			-- PURPOSE. `jsonb_typeof` is SQL NULL for an ABSENT key and
			-- `NULL <> 'array'` is NULL, so this guard does not fire for a
			-- `{"type":"ul"}` carrying no `items` at all -- 0078 then walked
			-- `jsonb_array_elements(NULL)`, got no rows, and accepted it as an
			-- empty list. That is the `is distinct from` trap, and fixing it
			-- here would be this file quietly REFUSING something the deployed
			-- gate accepts, in a migration whose whole job is to accept more.
			-- The `? 'items'` below is what reproduces the old answer exactly.
			-- (0108's classroom gate does not have the trap and is strict.)
			if jsonb_typeof(v_block -> 'items') <> 'array' then
				return false;
			end if;
			if v_block ? 'items' then
				v_len := public._notebook_note_list_len(v_block -> 'items', 1);
				if v_len < 0 then
					return false;
				end if;
				v_total := v_total + v_len;
			end if;

		else
			-- An unknown block type is the whole point of this function.
			return false;
		end if;
	end loop;

	-- Matches NOTE_MAX_CHARS in src/lib/notebook-notes.ts. A note with no text
	-- at all is a mistake, not a note. Text inside a sublist counts, which is
	-- what the helper's return value is for.
	return v_total > 0 and v_total <= 20000;
end;
$$;

revoke all on function public._notebook_note_content_ok(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 2. The classroom gate (0108), widened
-- ---------------------------------------------------------------------------

-- ONE run. Lifted out of 0108's `_classroom_runs_ok` unchanged, because two
-- callers now need it and a second copy of "what may a run contain" is how the
-- two would drift -- the same reason 0108 split the run list out in the first
-- place. `_notebook_note_run_len` is this function's opposite number.
create or replace function public._classroom_run_ok(p_run jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_key text;
begin
	if jsonb_typeof(p_run) is distinct from 'object' then
		return false;
	end if;
	for v_key in select k from jsonb_object_keys(p_run) as k loop
		if v_key not in ('text', 'bold', 'italic', 'href') then
			return false;
		end if;
	end loop;
	if jsonb_typeof(p_run->'text') is distinct from 'string' then
		return false;
	end if;
	-- The flags are absent-means-off, so the only legal value is true.
	if p_run ? 'bold' and p_run->'bold' <> 'true'::jsonb then
		return false;
	end if;
	if p_run ? 'italic' and p_run->'italic' <> 'true'::jsonb then
		return false;
	end if;
	if p_run ? 'href' then
		if jsonb_typeof(p_run->'href') is distinct from 'string' then
			return false;
		end if;
		if not public._classroom_safe_href(p_run->>'href') then
			return false;
		end if;
	end if;
	return true;
end;
$$;

revoke all on function public._classroom_run_ok(jsonb) from public;

-- One run list. Same signature and same answer as 0108's; the per-run rules
-- moved up one function and nothing else changed.
create or replace function public._classroom_runs_ok(p_runs jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_run jsonb;
begin
	if jsonb_typeof(p_runs) is distinct from 'array' then
		return false;
	end if;
	if jsonb_array_length(p_runs) > 2000 then
		return false;
	end if;
	for v_run in select value from jsonb_array_elements(p_runs) loop
		if not public._classroom_run_ok(v_run) then
			return false;
		end if;
	end loop;
	return true;
end;
$$;

revoke all on function public._classroom_runs_ok(jsonb) from public;

-- One list's items, at nesting depth `p_depth`. Every check 0108 made against
-- a flat list is here, at every level: the items array, the 2000-item cap, the
-- item being an array, the 2000-element cap that used to live in
-- `_classroom_runs_ok`, and the run rules themselves.
create or replace function public._classroom_list_ok(p_items jsonb, p_depth integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_item jsonb;
	v_node jsonb;
	v_type text;
	v_key text;
begin
	if p_depth is null or p_depth > 16 then
		return false;
	end if;
	if jsonb_typeof(p_items) is distinct from 'array' then
		return false;
	end if;
	if jsonb_array_length(p_items) > 2000 then
		return false;
	end if;

	for v_item in select value from jsonb_array_elements(p_items) loop
		if jsonb_typeof(v_item) is distinct from 'array' then
			return false;
		end if;
		if jsonb_array_length(v_item) > 2000 then
			return false;
		end if;

		for v_node in select value from jsonb_array_elements(v_item) loop
			if jsonb_typeof(v_node) is distinct from 'object' then
				return false;
			end if;

			if v_node ? 'type' then
				v_type := v_node->>'type';
				if v_type is null or v_type not in ('ul', 'ol') then
					return false;
				end if;
				for v_key in select k from jsonb_object_keys(v_node) as k loop
					if v_key not in ('type', 'items') then
						return false;
					end if;
				end loop;
				if not public._classroom_list_ok(v_node->'items', p_depth + 1) then
					return false;
				end if;
			else
				if not public._classroom_run_ok(v_node) then
					return false;
				end if;
			end if;
		end loop;
	end loop;

	return true;
end;
$$;

revoke all on function public._classroom_list_ok(jsonb, integer) from public;

-- The whole item body. Identical to 0108 except that the `ul`/`ol` branch
-- delegates its items to the helper above. EVERY TYPE CHECK IS
-- `is distinct from`, NEVER `<>`, for the reason 0108's header gives.
create or replace function public._classroom_doc_ok(p_doc jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_block jsonb;
	v_type text;
	v_key text;
	v_runs jsonb;
begin
	if p_doc is null or p_doc = 'null'::jsonb then
		return true;
	end if;
	if jsonb_typeof(p_doc) is distinct from 'array' then
		return false;
	end if;
	-- A ceiling on the structure, separate from the character cap on the text.
	if jsonb_array_length(p_doc) > 4000 then
		return false;
	end if;

	for v_block in select value from jsonb_array_elements(p_doc) loop
		if jsonb_typeof(v_block) is distinct from 'object' then
			return false;
		end if;
		v_type := v_block->>'type';
		if v_type is null or v_type not in ('p', 'h3', 'h4', 'ul', 'ol') then
			return false;
		end if;

		if v_type in ('ul', 'ol') then
			for v_key in select k from jsonb_object_keys(v_block) as k loop
				if v_key not in ('type', 'items') then
					return false;
				end if;
			end loop;
			if not public._classroom_list_ok(v_block->'items', 1) then
				return false;
			end if;
		else
			for v_key in select k from jsonb_object_keys(v_block) as k loop
				if v_key not in ('type', 'runs') then
					return false;
				end if;
			end loop;
			v_runs := v_block->'runs';
			if jsonb_typeof(v_runs) is distinct from 'array' then
				return false;
			end if;
			if not public._classroom_runs_ok(v_runs) then
				return false;
			end if;
		end if;
	end loop;

	return true;
end;
$$;

revoke all on function public._classroom_doc_ok(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 3. The plain-text projection, widened with it
-- ---------------------------------------------------------------------------

-- WHY THIS IS IN A BUNDLE THAT ONLY WIDENS GATES. `classroom_items.body` is
-- DERIVED from `body_doc` by `_classroom_doc_text`, inside the write RPCs and
-- after the gate has passed -- a caller's `p_body` is ignored when a document
-- is supplied. So the moment the gate accepts a nested list, a document
-- reaching those RPCs straight through PostgREST would have its sublists
-- silently dropped from the text column that the stream, the announcement
-- fallback and the export all read. That is not a client change and it is not
-- next bundle's problem: it is this gate's other half, in SQL, and it is inert
-- for exactly as long as the widened gate is.

-- One list item's line. Its own runs concatenated, then a line for each item
-- of each sublist under it.
--
-- INTERLEAVING RESOLVES TO OWN-TEXT-FIRST. An item holding a run AFTER a
-- sublist has no honest line to put that run on, and the normalizer emits no
-- such item; rather than invent an ordering, all of the item's own runs make
-- its line and every sublist line follows. Total, and stated rather than
-- discovered.
create or replace function public._classroom_item_text(p_item jsonb, p_depth integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_node jsonb;
	v_own text := '';
	v_nested text := '';
	v_line text;
begin
	if p_depth is null or p_depth > 16 or jsonb_typeof(p_item) is distinct from 'array' then
		return '';
	end if;

	for v_node in
		select value from jsonb_array_elements(p_item) with ordinality as e(value, ord)
		order by e.ord
	loop
		if jsonb_typeof(v_node) = 'object'
			and v_node ? 'type'
			and v_node->>'type' in ('ul', 'ol')
			and jsonb_typeof(v_node->'items') = 'array'
		then
			v_line := public._classroom_list_text(v_node->'items', p_depth + 1);
			if coalesce(v_line, '') <> '' then
				v_nested := v_nested || e'\n' || v_line;
			end if;
		else
			-- `->> 'text'` is NULL for anything without one, exactly as the
			-- string_agg this replaces was: a run with no text contributes
			-- nothing rather than refusing.
			v_own := v_own || coalesce(v_node->>'text', '');
		end if;
	end loop;

	return v_own || v_nested;
end;
$$;

revoke all on function public._classroom_item_text(jsonb, integer) from public;

-- One list: one line per item, in order. The shape 0108 wrote inline for the
-- top level, now named so every level uses it -- including its NULL, which is
-- load-bearing. A list block with no items at all aggregates to NULL, and the
-- outer `string_agg` in `_classroom_doc_text` SKIPS a NULL line, so such a
-- block contributes no line rather than a blank one. That is 0108's behaviour
-- and it is preserved deliberately.
create or replace function public._classroom_list_text(p_items jsonb, p_depth integer)
returns text
language sql
immutable
set search_path = ''
as $$
	select string_agg(public._classroom_item_text(i.value, p_depth), e'\n' order by i.ord)
	from jsonb_array_elements(p_items) with ordinality as i(value, ord);
$$;

revoke all on function public._classroom_list_text(jsonb, integer) from public;

-- Document -> plain text: one line per block or list item, now including a
-- nested item's. Identical to 0108 except that the list branch calls
-- `_classroom_list_text` instead of spelling the same aggregate out.
create or replace function public._classroom_doc_text(p_doc jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
	select btrim(coalesce(string_agg(line, e'\n'), ''))
	from (
		select
			case
				when b.value->>'type' in ('ul', 'ol')
					then public._classroom_list_text(b.value->'items', 1)
				else (
					select coalesce(string_agg(r.value->>'text', '' order by r.ord), '')
					from jsonb_array_elements(b.value->'runs') with ordinality as r(value, ord)
				)
			end as line
		from jsonb_array_elements(p_doc) with ordinality as b(value, ord)
		order by b.ord
	) lines
	where p_doc is not null and jsonb_typeof(p_doc) = 'array';
$$;

revoke all on function public._classroom_doc_text(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 4. What the operator should see
-- ---------------------------------------------------------------------------

-- The one thing that can go wrong here is a widened gate that REFUSES
-- something already stored, and that would be silent: every existing row keeps
-- rendering, and only the next save of it fails. So the migration asks the new
-- gates about the real content, in this database, and says so. Both counts
-- must be equal. If either is not, DO NOT DEPLOY -- restore per the header.
--
-- Guarded on the catalog rather than assumed, because these two features live
-- in different migration chains and a database may legitimately have only one.
do $$
declare
	v_total bigint;
	v_ok bigint;
begin
	if to_regclass('public.notebook_entry_notes') is not null then
		select count(*), count(*) filter (where public._notebook_note_content_ok(content))
			into v_total, v_ok
			from public.notebook_entry_notes;
		raise notice '0122: % of % stored note revision(s) accepted by the widened gate.', v_ok, v_total;
	else
		raise notice '0122: notebook_entry_notes is not in this database; note gate not exercised.';
	end if;

	if exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_items' and column_name = 'body_doc'
	) then
		select count(*), count(*) filter (where public._classroom_doc_ok(body_doc))
			into v_total, v_ok
			from public.classroom_items;
		raise notice '0122: % of % stored item body_doc(s) accepted by the widened gate.', v_ok, v_total;
	else
		raise notice '0122: classroom_items.body_doc is not in this database; body gate not exercised.';
	end if;
end;
$$;
