-- 0124_drop_orphaned_view_as.sql
-- Drops the five classroom "view as student" functions that no longer have a
-- caller anywhere. Nothing else changes: no table, no policy, and no grant on
-- anything that survives.
--
-- Apply manually in the Supabase SQL editor, after 0123.
--
-- ===========================================================================
-- WHY THESE FIVE, AND WHY NOT THE THREE BESIDE THEM
-- ===========================================================================
--
-- f734e7c deleted the classroom class and item previews under
-- `/classroom/view-as`. The reason is recorded in CLAUDE.md and does not
-- change here: the two roles differ by PAYLOAD rather than by render, so an
-- assignment "previewed as a student" showed a placeholder exactly where the
-- work surface belongs, and only a real student session could ever have fixed
-- it. Parity is what the preview was standing in for, and parity is already
-- real -- `ItemDetail` is ONE component gated by `canManage`.
--
-- That bundle deliberately shipped no SQL. A dropped function under a
-- still-deployed route is a 500, and the routes and the schema deploy
-- separately, so the functions were left applied and unreferenced with the
-- drop named as a later migration. This is that migration.
--
--   DROPPED, in this order, because the first two call the fifth:
--     public.classroom_view_as_section(text, uuid)             -- 0083, 0085, 0109, 0113
--     public.classroom_view_as_item(text, uuid, uuid)          -- 0085, 0109
--     public.classroom_view_as_can_read_attachment(text, uuid) -- 0083, 0085, 0109
--     public.classroom_view_as_sections(text)                  -- 0083
--     public._classroom_item_json(uuid)                        -- 0085, 0113
--
--   KEPT, each for a reason rather than by omission:
--     public.classroom_view_as_students()   -- the student PICKER, which is how
--       anyone reaches the notebook preview. The notebook preview survives
--       because no notebook payload splits by role.
--     public._classroom_view_as_guard(text) -- the admin + real-enrollment check
--       that both `classroom_view_as_students` and `notebook_view_as_notebook`
--       call.
--     public._classroom_item_live(...)      -- 0109 publish/schedule predicate,
--       with sixteen callers that have nothing to do with view-as.
--
-- `_classroom_item_json` is in the list because the two functions above it
-- were its ONLY callers, in every migration that ever named it (0085 twice,
-- 0109 twice, 0113 once). It is a private helper with no grant, so no client
-- could have reached it either way.
--
-- ===========================================================================
-- THIS MIGRATION REFUSES RATHER THAN DESTROYS
-- ===========================================================================
--
-- Postgres records a dependency from a policy, a view, a default or an index
-- to a function, and `drop function` without CASCADE already refuses on those.
-- What it does NOT record is one plpgsql function calling another: the body is
-- an opaque string until it runs, so dropping a helper out from under a caller
-- succeeds silently here and fails at that caller next invocation, in
-- production, with nothing raised at apply time.
--
-- So the guard below reads `pg_proc.prosrc` of every OTHER function in this
-- database and refuses, with names and a count, if any of them still mentions
-- one of the five. It runs FIRST, before a single drop, so a database this
-- migration is wrong about is left exactly as it was.
--
-- ===========================================================================
-- TO UNDO
-- ===========================================================================
--
-- Re-paste, in this order: `_classroom_item_json` and
-- `classroom_view_as_section` from 0113, `classroom_view_as_item` and
-- `classroom_view_as_can_read_attachment` from 0109, and
-- `classroom_view_as_sections` from 0083 -- each with the `revoke all` and
-- `grant execute ... to authenticated` lines that follow it there
-- (`_classroom_item_json` is revoke-only and takes no grant).
--
-- ===========================================================================
-- RE-APPLYING
-- ===========================================================================
--
-- Ordinary. Every drop is `if exists`, and the guard passes trivially on a
-- second run because what it is protecting is already gone.

-- ---------------------------------------------------------------------------
-- 1. Refuse if anything still calls one of them
-- ---------------------------------------------------------------------------

do $$
declare
	v_doomed text[] := array[
		'classroom_view_as_section',
		'classroom_view_as_item',
		'classroom_view_as_can_read_attachment',
		'classroom_view_as_sections',
		'_classroom_item_json'
	];
	v_callers text;
	v_count integer;
begin
	-- The reference being looked for is a CALL, which is always `<name>(` in a
	-- body. That is also what keeps `classroom_view_as_section` from matching
	-- inside `classroom_view_as_sections`, which contains it as a prefix.
	select string_agg(format('%s -> %s', c.caller, c.callee), ', ' order by c.caller, c.callee),
	       count(*)
		into v_callers, v_count
	from (
		select p.proname as caller, d.name as callee
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		cross join unnest(v_doomed) as d(name)
		where n.nspname = 'public'
		  and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
		  and p.proname <> all (v_doomed)
		  and position(d.name || '(' in p.prosrc) > 0
	) c;

	if v_count > 0 then
		raise exception
			'0124 REFUSED: % surviving function(s) still call one of the five, so dropping them would break those callers. Callers: %',
			v_count, v_callers;
	end if;

	raise notice '0124: no surviving function calls any of the five. Safe to drop.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The drops, callers before callee
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_view_as_section(text, uuid);
drop function if exists public.classroom_view_as_item(text, uuid, uuid);
drop function if exists public.classroom_view_as_can_read_attachment(text, uuid);
drop function if exists public.classroom_view_as_sections(text);
drop function if exists public._classroom_item_json(uuid);

-- ---------------------------------------------------------------------------
-- 3. What the operator should see
-- ---------------------------------------------------------------------------

do $$
declare
	v_left integer;
	v_kept integer;
begin
	select count(*) into v_left
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
	  and p.proname in (
		'classroom_view_as_section', 'classroom_view_as_item',
		'classroom_view_as_can_read_attachment', 'classroom_view_as_sections',
		'_classroom_item_json'
	  );

	-- THE POSITIVE CONTROL, on the same catalog read. A zero above says
	-- nothing at all unless the same query can still see a function that does
	-- exist, and these three are exactly the ones that must.
	select count(*) into v_kept
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
	  and p.proname in (
		'classroom_view_as_students', '_classroom_view_as_guard', '_classroom_item_live'
	  );

	raise notice '0124: % of the five remain (expect 0); % of the three kept are present (expect 3 on a full chain).',
		v_left, v_kept;

	if v_left <> 0 then
		raise exception '0124: % dropped function(s) survived. Investigate before deploying.', v_left;
	end if;
end;
$$;
