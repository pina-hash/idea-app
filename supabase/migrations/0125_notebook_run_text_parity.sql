-- 0125_notebook_run_text_parity.sql
-- Closes the `is distinct from` hole in the notebook note gate, so a run
-- carrying no `text` key is REFUSED on the notebook side exactly as it already
-- is on the classroom side. Two functions are replaced. Nothing else changes:
-- no table, no column, no policy, no grant.
--
-- Apply manually in the Supabase SQL editor, after 0124.
--
-- ===========================================================================
-- THE DEFECT
-- ===========================================================================
--
-- 0078 wrote `_notebook_note_run_len` guard as:
--
--     if jsonb_typeof(p_run -> 'text') <> 'string' then return -1; end if;
--
-- For an ABSENT key, `p_run -> 'text'` is SQL NULL, `jsonb_typeof(NULL)` is
-- NULL, and `NULL <> 'string'` is NULL -- so the guard does not fire. Control
-- falls through to `char_length(NULL)` and the function returns SQL NULL,
-- which is neither the -1 that means "not a run" nor a length.
--
-- AND THE NULL DOES NOT STOP THERE, which is what makes this a hole and not a
-- tidiness complaint. It propagates:
--
--   1. Every caller asks `if v_len < 0 then return -1 / false`. `NULL < 0` is
--      NULL, so no caller refuses.
--   2. `v_total := v_total + v_len` makes the running total NULL for the rest
--      of the walk, at every level, including back up out of a sublist.
--   3. `_notebook_note_content_ok` ends `return v_total > 0 and v_total <=
--      20000`, which is NULL, so the GATE returns NULL rather than false.
--   4. Every write RPC in front of it asks `if not public.
--      _notebook_note_content_ok(p_content) then raise`. `not NULL` is NULL,
--      and `if NULL then` does not fire.
--
-- So the fall-through does not merely skip a check. It ACCEPTS THE WRITE. The
-- notebook stores a run with no text; 0108 classroom gate, written `is
-- distinct from` throughout, refuses the identical input. Two gates over one
-- document shape, giving two answers.
--
-- 0122 FOUND THIS AND DELIBERATELY DID NOT FIX IT, which was right: that
-- bundle job was to accept MORE (nested lists), and a widening migration that
-- quietly starts refusing something the deployed gate takes is the exact
-- failure mode it existed to guard against. It pinned the divergence at both
-- depths instead and named the fix as a migration of its own. This is that
-- migration, and the thing 0122 could not answer -- what to do about rows
-- already stored -- is answered below.
--
-- ===========================================================================
-- THIS IS A NARROWING, SO IT REFUSES RATHER THAN TIGHTENS
-- ===========================================================================
--
-- A gate that starts refusing something already in the table is silent: every
-- stored row keeps rendering, and only the NEXT SAVE of it fails. On this
-- surface that means a student who can save their work today cannot save it
-- tomorrow, and finds out mid-edit.
--
-- That is not a call this file may make. So it does not: the guard below
-- COUNTS the affected rows in the real database, and if there are any it
-- raises with the count and changes nothing. Whether to strand those notes is
-- then a decision made by a person, with the number in front of them, not a
-- side effect of pasting a migration.
--
-- HOW THE COUNT IS TAKEN, and why it is the behavioural test rather than a
-- structural search. A second hand-written walk looking for `a run with no
-- text key at any depth` would be a second implementation of "what a run is",
-- which is the thing that quietly stops matching. It would also answer a
-- slightly different question. The question that matters is not "does this
-- document contain such a run" but "does this document CHANGE ANSWER when the
-- gate is fixed", and that is exactly `_notebook_note_content_ok(content) IS
-- NULL` under the deployed function:
--
--   * NULL is reachable through one path only. `v_total` starts at 0 and is
--     only ever added to, so it can be NULL only if some `v_len` was, and a
--     `v_len` can be NULL only from this one fall-through. A `text` key
--     holding JSON `null` is jsonb_typeof `null`, which IS distinct from
--     `string`, so that case already returns -1 and is not it.
--   * A document refused for some OTHER reason first answers false, not NULL,
--     and its answer does not move. Correctly excluded: it is already refused.
--
-- After this migration the same probe returns 0 rows on any database, so
-- re-pasting the file is ordinary and does nothing the first application did
-- not.
--
-- ===========================================================================
-- WHAT IS REPLACED, AND WHAT IS NOT
-- ===========================================================================
--
-- `_notebook_note_run_len` (0078)      -- the root cause. One guard,
--     `<>` to `is distinct from`. Re-pasted from 0078 otherwise byte for byte.
--
-- `_notebook_note_content_ok` (0122)   -- DEFENCE IN DEPTH, and inert once the
--     line above lands. Its final `return` is wrapped so a NULL total is
--     FALSE rather than NULL. With the run fix applied nothing can produce a
--     NULL total, which is the point: if a future edit reopens the hole one
--     level down, the gate still refuses instead of accepting. Re-pasted from
--     0122 otherwise byte for byte, extracted from the file rather than
--     retyped.
--
-- NOT TOUCHED, and it is a near neighbour, so stated rather than left silent:
-- 0078 `{"type":"ul"}` with no `items` key rides the same `<>` trap in
-- `_notebook_note_content_ok` and is ACCEPTED as an empty list. 0122
-- preserved that on purpose. It stays exactly as it is here too. That is a
-- separate narrowing, with its own answer owed about rows already stored, and
-- folding it in would make this file refuse content nobody has counted.
--
-- ===========================================================================
-- TO UNDO
-- ===========================================================================
--
-- Re-paste `_notebook_note_run_len` from 0078 (lines 120-163) and
-- `_notebook_note_content_ok` from 0122 (lines 198-279), which restores both
-- bodies exactly and puts the hole back.

-- ---------------------------------------------------------------------------
-- 1. The survey, and the refusal. BEFORE anything is replaced.
-- ---------------------------------------------------------------------------

do $$
declare
	v_total bigint;
	v_affected bigint;
begin
	if to_regclass('public.notebook_entry_notes') is null then
		raise notice '0125: notebook_entry_notes is not in this database; nothing to survey.';
		return;
	end if;

	select count(*), count(*) filter (where public._notebook_note_content_ok(content) is null)
		into v_total, v_affected
		from public.notebook_entry_notes;

	raise notice '0125: % of % stored note revision(s) hold a run with no text key.',
		v_affected, v_total;

	if v_affected > 0 then
		raise exception
			'0125 REFUSED: % of % stored note revision(s) would stop being saveable. Tightening the gate here would take away a student ability to save work they can save today. Decide what happens to those rows first; this file changes nothing until the count is 0.',
			v_affected, v_total;
	end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The root cause: one guard, `<>` to `is distinct from`
-- ---------------------------------------------------------------------------

create or replace function public._notebook_note_run_len(p_run jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_text text;
begin
	if p_run is null or jsonb_typeof(p_run) <> 'object' then
		return -1;
	end if;
	if exists (
		select 1 from jsonb_object_keys(p_run) k
		where k not in ('text', 'bold', 'italic', 'href')
	) then
		return -1;
	end if;
	if jsonb_typeof(p_run -> 'text') is distinct from 'string' then
		return -1;
	end if;
	-- The flags are present-and-true or absent; nothing else.
	if p_run ? 'bold' and p_run -> 'bold' <> 'true'::jsonb then
		return -1;
	end if;
	if p_run ? 'italic' and p_run -> 'italic' <> 'true'::jsonb then
		return -1;
	end if;
	if p_run ? 'href' then
		if jsonb_typeof(p_run -> 'href') <> 'string' then
			return -1;
		end if;
		-- http/https/mailto only, and no whitespace or control characters
		-- (which is how a scheme gets smuggled past a prefix check).
		if p_run ->> 'href' !~ '^(https?://|mailto:)[^[:space:][:cntrl:]]+$' then
			return -1;
		end if;
	end if;

	v_text := p_run ->> 'text';
	return char_length(v_text);
end;
$$;

revoke all on function public._notebook_note_run_len(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 3. Defence in depth: a NULL total is FALSE, not NULL
-- ---------------------------------------------------------------------------
--
-- Inert as long as section 2 holds. It is here so that opening ONE layer is
-- not enough to accept a document again -- reverting the guard above on its
-- own leaves this function answering false, which is what "defence in depth"
-- has to mean if it is to mean anything. Verified by opening both, not by a
-- test staying green while one is open.
--
-- Otherwise byte-identical to 0122 (lines 198-279): only the final `return`
-- moved.

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
	return v_total is not null and v_total > 0 and v_total <= 20000;
end;
$$;

revoke all on function public._notebook_note_content_ok(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 4. What the operator should see
-- ---------------------------------------------------------------------------
--
-- The two gates now answer one document shape one way. Asked directly, with a
-- POSITIVE CONTROL beside each refusal so a probe that is somehow reaching
-- nothing cannot report clean.

do $$
declare
	v_flat_bad boolean;
	v_deep_bad boolean;
	v_flat_ok boolean;
	v_item_bad boolean;
	v_stored bigint;
begin
	select public._notebook_note_content_ok(
		'[{"type":"p","runs":[{"bold":true}]}]'::jsonb
	) into v_flat_bad;

	select public._notebook_note_content_ok(
		'[{"type":"ul","items":[[{"text":"a"},{"type":"ul","items":[[{"italic":true}]]}]]}]'::jsonb
	) into v_deep_bad;

	-- The control: an ordinary note, which must still be accepted.
	select public._notebook_note_content_ok(
		'[{"type":"p","runs":[{"text":"an ordinary note"}]}]'::jsonb
	) into v_flat_ok;

	if v_flat_bad is not false or v_deep_bad is not false then
		raise exception
			'0125: the notebook gate did not refuse a text-less run (flat=%, nested=%). It must answer false, not null.',
			v_flat_bad, v_deep_bad;
	end if;
	if v_flat_ok is not true then
		raise exception
			'0125: the notebook gate refused an ordinary note (%). Restore per the header.', v_flat_ok;
	end if;

	if to_regproc('public._classroom_doc_ok(jsonb)') is not null then
		select public._classroom_doc_ok(
			'[{"type":"p","runs":[{"bold":true}]}]'::jsonb
		) into v_item_bad;
		raise notice '0125: parity -- notebook refuses a text-less run (%), classroom refuses it (%).',
			v_flat_bad, v_item_bad;
	else
		raise notice '0125: notebook refuses a text-less run (%); the classroom gate is not in this database.',
			v_flat_bad;
	end if;

	if to_regclass('public.notebook_entry_notes') is not null then
		select count(*) filter (where public._notebook_note_content_ok(content) is not true)
			into v_stored from public.notebook_entry_notes;
		raise notice '0125: % stored note revision(s) are now refused by the gate (expect 0).', v_stored;
	end if;
end;
$$;
