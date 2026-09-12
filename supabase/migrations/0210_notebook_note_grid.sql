-- 0210_notebook_note_grid.sql
--
-- Apply manually in the Supabase SQL editor, after 0209.
--
-- WHAT THIS DOES: widens the notebook note gate,
-- `_notebook_note_content_ok`, to accept ONE new block type -- `grid`, a
-- rectangular spreadsheet whose cells store what a student typed -- and adds
-- the private helper that measures one. Nothing else changes: no table, no
-- column, no policy, no view, and no other function's body.
--
-- THIS IS DECISION 08'S ITEM 2, and it is the last thing between the formula
-- engine ledger 0187 shipped (`src/lib/notebook/formula/`) and a spreadsheet a
-- student can save. Ledger 0180 MEASURED the blocker against real PostgreSQL
-- 17.10 rather than reading it: the deployed gate answers FALSE for `sheet`,
-- `table` and `grid`, and `false` rather than NULL, which matters because NULL
-- out of this family of gates means the write is ACCEPTED (`if not NULL then`
-- does not fire) -- the exact hole 0125 was written to close. The refusal is
-- real, so the widening is genuinely the only door.
--
-- ===========================================================================
-- IT LANDS ALONE, BEFORE ANY PRODUCER CAN EMIT THE SHAPE
-- ===========================================================================
--
-- CLAUDE.md's validation-gate rule, and the asymmetry is the whole argument: a
-- gate accepting a shape nothing produces is INERT, while a producer emitting a
-- shape the gate refuses breaks every save on the notebook at once. So this
-- widens and ships by itself.
--
-- WHAT SHIPS BESIDE IT IS NOT A PRODUCER, and the distinction is worth stating
-- precisely because it looks like one. The same bundle adds
-- `src/lib/notebook/grid/` -- the shape's declaration and a ProseMirror node
-- with its NodeView -- which is the EDITOR half. Nothing in it can write a
-- grid to this table: the one path from an editor document into
-- `notebook_entry_notes.content` is `$lib/server/rich-text-normalize.ts`, a
-- WHITELIST TRANSLATOR that BUILDS its output from the node types it names, and
-- it does not name `grid`. Those files are not in this bundle's surface and are
-- deliberately untouched, so a note containing a grid, saved today, stores the
-- note WITHOUT the grid -- the "content disappears" failure mode that
-- normalizer's own header describes, never a corrupt row. The producer is the
-- next bundle, and by then this gate is applied.
--
-- `_classroom_doc_ok` IS NOT TOUCHED, and that is decision 08's item 2 in its
-- own words: a grid in an item body or in a check-in's guidance is a SECOND
-- decision and not a free consequence of this one. `CheckInGuidance` has no
-- renderer for a grid, so widening that gate would accept content one of its
-- two surfaces cannot draw.
--
-- ===========================================================================
-- THE TEXT FLOOR: THE DECISION, IN WRITING
-- ===========================================================================
--
-- 0125's last line is
--
--     return v_total is not null and v_total > 0 and v_total <= 20000;
--
-- and the comment above it states an INTENT rather than an oversight: "A note
-- with no text at all is a mistake, not a note." A student who opens a note,
-- builds a materials table and writes no sentences is the ORDINARY case for
-- this feature, not an edge -- so leaving that line to see a grid as
-- contributing nothing would ship a spreadsheet that cannot be saved on its
-- own, and the student would find out at the moment they pressed save.
--
-- Ledger 0187 named three answers. THIS FILE TAKES THE FIRST, which is also the
-- one it recommended: **a grid's own cell text counts toward `v_total`.**
--
--   * A grid with any filled cell makes the note non-empty. A materials table
--     of pure numbers still does, because a cell stores TEXT -- what the
--     student typed -- so `12.5` is four characters exactly as `steel` is five.
--   * A grid whose every cell is empty contributes 0 and the note is refused,
--     which is the intent above holding rather than being worked around: an
--     empty spreadsheet is a note with nothing in it.
--   * The 20,000 ceiling covers grid text too, for the same reason it covers
--     list text -- it is a ceiling on a NOTE, not on prose.
--
-- WHY THE OTHER TWO WERE NOT TAKEN.
--
--   * A SEPARATE has-content TERM beside the character total would mean the
--     gate carried two ideas of "is there anything here", and the day they
--     disagreed -- an empty grid beside an empty paragraph, say -- the answer
--     would depend on which one a later reader happened to edit. It also buys
--     nothing this does not: the only case they answer differently is a grid
--     whose cells are all empty, and refusing that is correct.
--   * REQUIRING A SENTENCE is a product decision, and it is the one Mr. Pina
--     did not ask for: his bar is that a sheet works as well inside a note as
--     the text does, and a sheet you must write a sentence to keep does not.
--
-- THE LAST LINE IS THEREFORE BYTE-IDENTICAL TO 0125'S, and that is the point of
-- taking this answer: what widens is what FEEDS `v_total`, never the floor
-- itself, so a note with no grid in it cannot change answer by arithmetic.
--
-- ===========================================================================
-- WHAT THIS DOES TO EVERY NOTE ALREADY STORED: NOTHING, AND IT IS PROVEN
-- ===========================================================================
--
-- This is a WIDENING and not a narrowing, so the usual danger runs the other
-- way -- but "widening" is a claim about a diff, and the obligation that
-- outranks it is behavioural: **it must answer every already-stored note
-- exactly as the deployed gate does, refusals included.**
--
--   * NO STORED NOTE CAN CONTAIN A GRID. The deployed gate refuses one
--     outright (measured), the per-block key whitelists refuse a grid smuggled
--     onto a paragraph or a run (also measured, decision 08's own table), and
--     the write RPCs are the only door into the column. So every stored
--     document is one this file's new branch never reaches.
--   * EVERY OTHER BRANCH IS RE-PASTED FROM 0125 BYTE FOR BYTE, extracted from
--     the file rather than retyped -- including the `<>` on the `ul`/`ol`
--     `items` guard, which 0122 and 0125 each deliberately preserved and which
--     this file preserves for the same reason: correcting it here would make a
--     widening migration quietly REFUSE something the deployed gate accepts.
--     That is a separate narrowing with its own answer owed about stored rows.
--   * AND IT IS MEASURED RATHER THAN ARGUED. The block below counts, at apply
--     time against the REAL table, every stored revision whose answer MOVES,
--     and REFUSES rather than applying if there is one. The count is taken the
--     behavioural way 0125 established -- the deployed function's answer
--     against the new one, over the same rows -- and not by a second
--     hand-written search for the shapes that ought to be affected, because a
--     second copy of "what a grid is" is the thing that stops matching.
--
-- The survey needs BOTH functions at once, so the new gate is created under a
-- temporary name, compared, and only then installed. That is why section 2 sits
-- before section 3 rather than the survey coming first as it does in 0125: 0125
-- could take its count with the deployed function alone because the question
-- there was `IS NULL`; the question here is "do the two disagree", which needs
-- two functions.
--
-- ===========================================================================
-- WHAT A GRID IS
-- ===========================================================================
--
--     { "type": "grid", "rows": [ ["Part", "Qty"], ["Angle", "4"] ] }
--
-- Keys `type` and `rows`, nothing else -- the whitelist every other block in
-- this gate already carries, and the reason there is nowhere to hang a field
-- nobody validates. `rows` is RECTANGULAR: 1..100 rows, each an array of
-- 1..20 strings, every row the same length, each cell at most 500 characters.
-- The column count IS the first row's length; a `cols` field beside it would be
-- a second source of truth for one number.
--
-- ONE BLOCK OWNS THE WHOLE GRID, NEVER A BLOCK PER CELL, and that is 0195's
-- precedent rather than a simplification. A per-cell id in a note would be a
-- join key against `notebook_entry_notes`, where a block id is permanent by
-- construction, and 0128's real port is what happens when a runtime-minted
-- per-cell key meets a parent that can only drop it silently. A cell is
-- addressed by its POSITION, which is also what `A1` means.
--
-- A CELL STORES ITS SOURCE, NEVER ITS COMPUTED VALUE. `=SUM(A1:A3)` is stored;
-- the number is derived at render by `src/lib/notebook/formula`. Derive, never
-- store: a stored value is a second copy of an answer the engine already gives,
-- and it goes stale the moment a precedent changes with nothing to report it.
-- The gate therefore does not know what a formula is and must never learn --
-- a cell is text, and every cell is valid text.
--
-- THE CAPS ARE A BOUND ON THE GATE'S OWN WORK, not a feature limit. 100 x 20 is
-- 2,000 cells, expressed as two caps whose product is that number rather than
-- as a third `MAX_CELLS` -- a third cap would make two of them unreachable in
-- some shapes and the refusal would depend on which bit first. Twenty columns
-- is `A` through `T`, one letter each, which is the readable half of `A1`
-- notation. None of the three is the binding cap in practice: the note's own
-- 20,000-character ceiling refuses a full grid long before any of them, and
-- they exist so that the work is bounded BEFORE that total is reached, which a
-- character ceiling alone cannot do.
--
-- THEY ARE STATED IN TWO PLACES, DELIBERATELY, AND PINNED AGAINST EACH OTHER.
-- `src/lib/notebook/grid/grid-doc.ts` carries the same three numbers because a
-- surface has to refuse a too-large grid with a SENTENCE, which a CHECK
-- predicate cannot give. `tests/db/notebook-sheet-gate.test.ts` reads this
-- file's text and fails if either side moves alone. The alternative -- one
-- number in one place -- is not available across a language boundary, and an
-- unpinned mirror is the shape this repository has been bitten by.
--
-- ===========================================================================
-- THE SIGNATURE TRAP DOES NOT APPLY, STATED RATHER THAN ASSUMED
-- ===========================================================================
--
-- `_notebook_note_content_ok(jsonb)` is replaced at its EXACT existing argument
-- list, so `create or replace` cannot leave a second overload behind and no
-- `drop function` is needed. `_notebook_note_grid_len(jsonb)` is new and has no
-- earlier arity to collide with. Section 5 reads `pg_proc` back and raises if
-- either name resolves to more than one row.
--
-- DEPLOY ORDERING: none. Both functions are private helpers called only from
-- inside SECURITY DEFINER write RPCs whose signatures do not change, so no
-- client names anything new and the migration and any deploy are independent
-- events. What DOES have an order is the widening against the producer, and
-- that order is the reason this file is alone.
--
-- RE-APPLYING IS ORDINARY. Every statement is `create or replace` or a
-- catalog-guarded `do` block; the survey answers 0 on a database that already
-- has this file, because the two functions being compared are then identical.
--
-- ===========================================================================
-- TO UNDO
-- ===========================================================================
--
-- Re-paste `_notebook_note_content_ok` from
-- `0125_notebook_run_text_parity.sql` (lines 206-287), which restores the
-- deployed body exactly, then
-- `drop function if exists public._notebook_note_grid_len(jsonb);`. Do that
-- ONLY while no stored note contains a grid: once one does, the old gate
-- refuses it and that note stops being saveable, which is the narrowing this
-- file's own survey exists to prevent in the other direction. The query that
-- answers whether any does is in section 6.

-- ---------------------------------------------------------------------------
-- 1. The new helper: one grid's character total, or -1
-- ---------------------------------------------------------------------------
--
-- THE `-1` CONVENTION IS `_notebook_note_run_len`'s AND `_notebook_note_list_len`'s,
-- and it is followed rather than invented so the caller's arithmetic is
-- unchanged: a negative is "not a valid grid" and anything else is a character
-- count that flows into the same running total. A third convention here would
-- mean a third shape of `if v_len < 0` in the block loop.
--
-- `is distinct from` THROUGHOUT, WHICH IS 0125'S WHOLE LESSON. `jsonb_typeof`
-- of an ABSENT key is SQL NULL and `NULL <> 'array'` is NULL, so a `<>` guard
-- does not fire, the function falls through, and the NULL propagates out of the
-- gate -- where every caller's `if not <gate> then raise` does NOT fire on
-- NULL, so the fall-through ACCEPTS the write. This helper can never return
-- NULL: every guard is `is distinct from`, every arithmetic input is a
-- `char_length` of a value already proven to be a string, and section 5 asserts
-- that behaviourally over a corpus that includes every absent-key shape.

create or replace function public._notebook_note_grid_len(p_grid jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_row jsonb;
	v_cell jsonb;
	v_width integer;
	v_rows integer;
	v_len integer;
	v_total integer := 0;
begin
	if p_grid is null or jsonb_typeof(p_grid) is distinct from 'object' then
		return -1;
	end if;

	-- The per-block key whitelist. `p` and `ul`/`ol` each carry one; without it
	-- there is somewhere to hang a field nobody validates.
	if exists (
		select 1 from jsonb_object_keys(p_grid) k where k not in ('type', 'rows')
	) then
		return -1;
	end if;

	if jsonb_typeof(p_grid -> 'rows') is distinct from 'array' then
		return -1;
	end if;

	v_rows := jsonb_array_length(p_grid -> 'rows');
	-- 1..100. A grid with no rows has no honest column count and is not a grid.
	if v_rows < 1 or v_rows > 100 then
		return -1;
	end if;

	-- The width comes from the FIRST row and every other row is measured against
	-- it, which is what makes the shape rectangular rather than merely capped.
	if jsonb_typeof(p_grid -> 'rows' -> 0) is distinct from 'array' then
		return -1;
	end if;
	v_width := jsonb_array_length(p_grid -> 'rows' -> 0);
	if v_width < 1 or v_width > 20 then
		return -1;
	end if;

	for v_row in select value from jsonb_array_elements(p_grid -> 'rows') loop
		if jsonb_typeof(v_row) is distinct from 'array' then
			return -1;
		end if;
		if jsonb_array_length(v_row) is distinct from v_width then
			return -1;
		end if;

		for v_cell in select value from jsonb_array_elements(v_row) loop
			-- A CELL IS TEXT, ALWAYS. A number here would be a second spelling
			-- of a cell's value -- `12.5` and `"12.5"` meaning the same thing
			-- with two encodings -- and the engine coerces a source string to a
			-- number anyway. One encoding is what keeps `char_length` below a
			-- true count of what somebody typed.
			if jsonb_typeof(v_cell) is distinct from 'string' then
				return -1;
			end if;
			v_len := char_length(v_cell #>> '{}');
			if v_len > 500 then
				return -1;
			end if;
			v_total := v_total + v_len;
		end loop;
	end loop;

	return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The widened gate, under a TEMPORARY name so the survey can compare
-- ---------------------------------------------------------------------------
--
-- Byte for byte 0125's `_notebook_note_content_ok` (lines 206-287), extracted
-- from that file rather than retyped, with exactly two changes:
--
--   (a) one `elsif` arm for `grid`, between the `ul`/`ol` arm and the `else`;
--   (b) nothing else. The final `return` is unchanged, the `p` arm is
--       unchanged, and the `ul`/`ol` arm keeps its `<>` verbatim with 0125's
--       own comment about why.
--
-- Installed under the real name in section 4, once the survey in section 3 has
-- said the two agree on every stored row.

create or replace function public._notebook_note_content_ok_0210(p_content jsonb)
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

		elsif v_type = 'grid' then
			-- THE WHOLE WIDENING. The key whitelist, the shape and the caps are
			-- the helper's; what happens here is only that its answer joins the
			-- same running total every other block's does, which is the text
			-- floor decision in the header expressed as one line of arithmetic.
			v_len := public._notebook_note_grid_len(v_block);
			if v_len < 0 then
				return false;
			end if;
			v_total := v_total + v_len;

		else
			-- An unknown block type is the whole point of this function.
			return false;
		end if;
	end loop;

	-- Matches NOTE_MAX_CHARS in src/lib/notebook-notes.ts. A note with no text
	-- at all is a mistake, not a note. Text inside a sublist counts, which is
	-- what the helper's return value is for -- and since 0210 so does the text
	-- in a grid's cells, which is what lets a note whose only content is a
	-- materials table be saved at all. UNCHANGED FROM 0125: what widened is what
	-- feeds v_total, never this line.
	return v_total is not null and v_total > 0 and v_total <= 20000;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The survey, and the refusal. BEFORE the real name is replaced.
-- ---------------------------------------------------------------------------
--
-- The question is not "does this document contain a grid" -- that is a second
-- hand-written idea of the shape, and it is also the wrong question. It is
-- "does this document CHANGE ANSWER", which is the two functions put to the
-- same row and compared, `is distinct from` so a NULL on either side counts as
-- a disagreement rather than vanishing into a three-valued comparison.
--
-- The expected count is 0 and the reasoning is in the header. A NON-ZERO count
-- means something in this file's re-paste of the other branches is not byte
-- identical after all, and the honest response to that is to stop, not to
-- decide at apply time whose work to strand.

do $$
declare
	v_total bigint;
	v_moved bigint;
	v_grids bigint;
begin
	if to_regclass('public.notebook_entry_notes') is null then
		raise notice '0210: notebook_entry_notes is not in this database; nothing to survey.';
		return;
	end if;

	select
		count(*),
		count(*) filter (
			where public._notebook_note_content_ok(content)
				is distinct from public._notebook_note_content_ok_0210(content)
		),
		count(*) filter (where content @> '[{"type":"grid"}]'::jsonb)
		into v_total, v_moved, v_grids
		from public.notebook_entry_notes;

	raise notice '0210: % of % stored note revision(s) change answer under the widened gate.',
		v_moved, v_total;
	-- Reported beside it because it is the ONE fact that would make a non-zero
	-- count above expected rather than alarming, and because a reader should be
	-- able to see it is zero rather than infer it.
	raise notice '0210: % stored note revision(s) already contain a grid block (expected 0 before this file).',
		v_grids;

	if v_moved > 0 then
		raise exception
			'0210 REFUSED: % of % stored note revision(s) would change answer. This file is a WIDENING and must answer every stored note exactly as the deployed gate does, so a non-zero count means a branch re-pasted from 0125 is not byte identical. Nothing has been changed; the temporary function _notebook_note_content_ok_0210 is left in place so the disagreeing rows can be found with the query in section 6.',
			v_moved, v_total;
	end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Install it under the real name, and drop the temporary one
-- ---------------------------------------------------------------------------
--
-- Same body as section 2. `create or replace` at the EXACT existing argument
-- list, so no second overload can survive and no policy, view or default that
-- names this function is disturbed.

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
			-- PURPOSE. See 0125's own comment at this line: correcting it here
			-- would make a widening migration quietly refuse something the
			-- deployed gate accepts.
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

		elsif v_type = 'grid' then
			v_len := public._notebook_note_grid_len(v_block);
			if v_len < 0 then
				return false;
			end if;
			v_total := v_total + v_len;

		else
			-- An unknown block type is the whole point of this function.
			return false;
		end if;
	end loop;

	-- Matches NOTE_MAX_CHARS in src/lib/notebook-notes.ts. A note with no text
	-- at all is a mistake, not a note. Text inside a sublist counts, and since
	-- 0210 so does the text in a grid's cells. UNCHANGED FROM 0125.
	return v_total is not null and v_total > 0 and v_total <= 20000;
end;
$$;

drop function if exists public._notebook_note_content_ok_0210(jsonb);

-- ---------------------------------------------------------------------------
-- 5. The grants, NAMING THE ROLES, and the self-check
-- ---------------------------------------------------------------------------
--
-- `revoke ... from public` DOES NOT CLOSE A FUNCTION ON THIS PROJECT. A hosted
-- Supabase project bootstraps `alter default privileges in schema public grant
-- execute on functions to anon, authenticated, service_role`, which writes a
-- DIRECT grant to each of those roles into every NEW function's ACL at creation
-- time -- so removing the single PUBLIC entry leaves `anon` holding it.
-- `_notebook_note_grid_len` is new here and is exactly that case.
--
-- 0166 IS THE SHAPE AND IT IS COPIED RATHER THAN REINVENTED. 0201 invented its
-- own (`revoke ... from public` then `grant ... to authenticated`) and all ten
-- of its functions came out anon-executable on production; 0202 is the repair.
-- Both functions below are PRIVATE HELPERS -- their only callers are the three
-- SECURITY DEFINER note-write RPCs, which run them as the owner -- so neither
-- `anon` nor `authenticated` needs to hold either, and `service_role` is
-- granted back because it is the one role 0137 never touches and should still
-- hold what it held. This is the end state 0137 already put
-- `_notebook_note_content_ok` in; restating it keeps that true after a replace.

revoke all on function public._notebook_note_grid_len(jsonb)
	from public, anon, authenticated;
grant execute on function public._notebook_note_grid_len(jsonb) to service_role;

revoke all on function public._notebook_note_content_ok(jsonb)
	from public, anon, authenticated;
grant execute on function public._notebook_note_content_ok(jsonb) to service_role;

-- ASSERT THE ACL AND THE BEHAVIOUR, NOT THE FACT THAT THE STATEMENTS RAN.
-- 0131's convention: read the catalog back. A migration's own guard passing
-- tells you the guard ran; `has_function_privilege` tells you what is granted.

do $$
declare
	v_n integer;
begin
	-- EXACTLY ONE ROW EACH. The signature trap: a function that gained a
	-- parameter and was not dropped first leaves the old arity callable, and
	-- two overloads differing by a defaulted trailing parameter make PostgREST
	-- unable to resolve the call at all. Neither applies here and this is what
	-- says so rather than the header claiming it.
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = '_notebook_note_content_ok';
	if v_n <> 1 then
		raise exception '0210: expected exactly 1 _notebook_note_content_ok, found %.', v_n;
	end if;
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = '_notebook_note_grid_len';
	if v_n <> 1 then
		raise exception '0210: expected exactly 1 _notebook_note_grid_len, found %.', v_n;
	end if;
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = '_notebook_note_content_ok_0210';
	if v_n <> 0 then
		raise exception '0210: the temporary comparison function is still present (% rows).', v_n;
	end if;

	-- THE ACL, both roles, both functions.
	if has_function_privilege('anon', 'public._notebook_note_content_ok(jsonb)', 'execute')
		or has_function_privilege('authenticated', 'public._notebook_note_content_ok(jsonb)', 'execute')
		or has_function_privilege('anon', 'public._notebook_note_grid_len(jsonb)', 'execute')
		or has_function_privilege('authenticated', 'public._notebook_note_grid_len(jsonb)', 'execute')
	then
		raise exception '0210: a client role still holds EXECUTE on a private note helper.';
	end if;
	if not has_function_privilege('service_role', 'public._notebook_note_grid_len(jsonb)', 'execute') then
		raise exception '0210: service_role lost EXECUTE on _notebook_note_grid_len.';
	end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. What the operator should see
-- ---------------------------------------------------------------------------
--
-- The gate, asked directly, WITH A POSITIVE CONTROL BESIDE EVERY REFUSAL so a
-- probe that is somehow reaching nothing cannot report clean. Every one of
-- these is `true` or `false` and never NULL -- which is the thing to read first,
-- because NULL out of this gate is the 0125 hole and means ACCEPTED.

do $$
declare
	r record;
	v_cases integer := 0;
begin
	raise notice '0210: --- the gate, asked directly ---';
	for r in
		select * from (values
			-- The two controls: nothing about the widening may move these.
			('control: a paragraph',            '[{"type":"p","runs":[{"text":"hello"}]}]'::jsonb, true),
			('control: a list',                 '[{"type":"ul","items":[[{"text":"a"}]]}]'::jsonb, true),
			('control: an unknown block type',  '[{"type":"sheet","rows":[["a"]]}]'::jsonb,        false),
			('control: a note with no text',    '[{"type":"p","runs":[]}]'::jsonb,                 false),
			-- THE WIDENING, and the text floor decision with it.
			('a grid beside a paragraph',       '[{"type":"p","runs":[{"text":"x"}]},{"type":"grid","rows":[["a","b"],["c","d"]]}]'::jsonb, true),
			('A GRID ALONE, no prose at all',   '[{"type":"grid","rows":[["Part","Qty"],["Angle","4"]]}]'::jsonb, true),
			('a grid of pure numbers alone',    '[{"type":"grid","rows":[["1","2"],["3","4"]]}]'::jsonb, true),
			('a grid holding a formula',        '[{"type":"grid","rows":[["1"],["=SUM(A1:A1)"]]}]'::jsonb, true),
			('a grid with EVERY cell empty',    '[{"type":"grid","rows":[["",""],["",""]]}]'::jsonb, false),
			-- The shape rules.
			('a ragged grid',                   '[{"type":"grid","rows":[["a","b"],["c"]]}]'::jsonb, false),
			('a grid with no rows',             '[{"type":"grid","rows":[]}]'::jsonb,              false),
			('a grid with a numeric cell',      '[{"type":"grid","rows":[[1]]}]'::jsonb,           false),
			('a grid with an extra key',        '[{"type":"grid","rows":[["a"]],"cols":1}]'::jsonb, false),
			('a grid with NO rows key at all',  '[{"type":"grid"}]'::jsonb,                        false),
			('a grid whose rows is an object',  '[{"type":"grid","rows":{"0":["a"]}}]'::jsonb,     false),
			('a grid nested inside a paragraph','[{"type":"p","runs":[],"grid":{"rows":[["a"]]}}]'::jsonb, false)
		) as t(label, doc, expected)
	loop
		-- `rpad`, NOT a `%-36s` width specifier: plpgsql's `raise` format takes
		-- `%` and nothing else, so a printf width is printed as literal text --
		-- which is exactly what the first run of this block did.
		-- `::text` on the boolean too, so the column reads `true`/`false` rather
		-- than the `t`/`f` a bare `%` gives, and so a NULL is VISIBLE as the
		-- 0125 hole instead of rendering as an empty column.
		raise notice '0210:   % -> %  (expected %)',
			rpad(r.label, 36),
			rpad(coalesce(public._notebook_note_content_ok(r.doc)::text, 'NULL -- THE 0125 HOLE'), 5),
			r.expected::text;
		if public._notebook_note_content_ok(r.doc) is distinct from r.expected then
			raise exception '0210: the gate answered wrongly for "%".', r.label;
		end if;
		v_cases := v_cases + 1;
	end loop;
	-- COUNTED, never written down. A hardcoded total is a number that stays
	-- right until somebody adds a case, and then it is a sentence claiming
	-- coverage it does not have.
	raise notice '0210: all % cases answered as expected.', v_cases;
end;
$$;

-- THE VERIFICATION QUERY, for the SQL editor after this file has been applied.
-- It is the survey's own question asked from outside, plus the two facts a
-- reader wants: that a grid-only note is now storable, and that nothing already
-- stored holds one.
--
--   select
--     (select count(*) from public.notebook_entry_notes)                       as notes,
--     (select count(*) from public.notebook_entry_notes
--        where content @> '[{"type":"grid"}]'::jsonb)                          as notes_with_a_grid,
--     public._notebook_note_content_ok(
--       '[{"type":"grid","rows":[["Part","Qty"],["Angle","4"]]}]'::jsonb)      as grid_only_note_ok,
--     public._notebook_note_content_ok(
--       '[{"type":"grid","rows":[["",""],["",""]]}]'::jsonb)                   as empty_grid_note_ok,
--     public._notebook_note_content_ok(
--       '[{"type":"p","runs":[{"text":"hello"}]}]'::jsonb)                     as control_paragraph_ok,
--     has_function_privilege('anon',
--       'public._notebook_note_grid_len(jsonb)', 'execute')                    as anon_holds_the_helper;
--
-- EXPECTED: notes = whatever production holds, notes_with_a_grid = 0,
-- grid_only_note_ok = true, empty_grid_note_ok = false,
-- control_paragraph_ok = true, anon_holds_the_helper = false.
