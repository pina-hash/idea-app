-- 0193_classroom_resource_layout.sql
-- IDEA // CLASSROOM: where an item's files and links SIT, the ORDER its files
-- are listed in, and what a file is CALLED -- three things a teacher could not
-- change after the fact without deleting and re-uploading.
--
-- ===========================================================================
-- DO NOT APPLY FROM THIS CONTAINER
-- ===========================================================================
-- The agent proxy accepts a CONNECT to port 5432 and carries no bytes, so a
-- `psql` or `tools/apply-migration.mjs` run from a cloud session hangs and then
-- reports a connection that never existed. Apply by hand in the Supabase SQL
-- editor, or from a machine that reaches the database directly. The
-- verification query below is what to paste afterwards.
--
-- ===========================================================================
-- WHAT THIS FILE DOES
-- ===========================================================================
--
--   1. Two columns on `classroom_items`: `files_placement` and
--      `links_placement`, each `text not null default 'bottom'` and checked
--      to `('top', 'bottom')`. Every row that exists today reads `bottom`,
--      which is exactly where the class pane has always drawn them, so no
--      page changes its arrangement when this file lands.
--
--   2. `classroom_set_item_layout(item, files, links)` -- the one write to
--      those columns. NOT AN EDIT: it stamps `updated_at` only. `edited_at`
--      is untouched, no content revision is minted and nothing can grow an
--      "Updated" badge from it, because placement is where things sit and
--      not what they say. 0104 made `edited_at` mean "the words changed" and
--      this file keeps that true.
--
--   3. `classroom_set_attachment_order(item, uuid[])` and its instructor
--      twin. The array must be EXACTLY the set of the item's rows -- every id
--      once, nothing foreign, nothing missing -- and is refused with the
--      counts otherwise. A partial order accepted "helpfully" would leave the
--      rows it did not name at whatever `sort_order` they had, which can tie
--      with the ones it did name, and a tie is an order the page then
--      resolves by row id: a list that reshuffles between two loads. The
--      client sends the whole list; the database insists on it.
--
--   4. `classroom_rename_attachment(id, name)` and its instructor twin. The
--      stored name is the SAME sanitization the record route applies to an
--      uploaded file's name (see THE SANITIZER below), so a renamed file and
--      an uploaded one cannot disagree about what a name becomes. Two
--      STRUCTURED refusals, `{ok:false, reason}` rather than a raise, because
--      the composer shows them where the teacher is working:
--        - `referenced`: the item's body carries a picture whose `src` is
--          `attachment:<current name>`, or its assignment/reference spec
--          mentions that alias. A rename would break a figure a class can
--          see; the teacher removes the figure first. Instructor files cannot
--          be figures (an item body resolves aliases against the
--          STUDENT-FACING list only, and no picker offers an instructor file),
--          so the instructor twin has no `referenced` arm at all.
--        - `taken`: another file on the same item already carries the name,
--          case-insensitively, because the alias resolver matches
--          case-insensitively and first match wins -- two rows with one name
--          are two rows the document cannot tell apart.
--      Also not an edit. A rename touches no item column.
--
--   5. `classroom_duplicate_item(uuid, uuid[])` is `create or replace`d with
--      0159's body VERBATIM plus the two placement columns in the copy's
--      insert. Same signature, so no drop and no signature trap. Without this
--      a duplicate of a top-placed item would silently land at the bottom.
--
-- ===========================================================================
-- THE SANITIZER, AND WHY IT IS WRITTEN OUT CHARACTER BY CHARACTER
-- ===========================================================================
-- `recordedAttachmentFilename` (src/lib/classroom/attachments.ts) is:
--
--     sanitize(String(raw ?? '').trim().slice(0, 300)) || 'attachment'
--     sanitize(f): trim; '' stays ''; runs of [\s()[\]] -> '-';
--                  '-{2,}' -> '-'; strip leading/trailing '-'; '' -> 'attachment'
--
-- `_classroom_attachment_filename` below is that, in SQL, and the two are
-- asserted equal on odd names in tests/db/classroom-attachment-layout.test.ts.
-- Three places where a naive transcription would silently disagree:
--
--   * JavaScript's `\s` and `trim()` cover Unicode whitespace: NO-BREAK SPACE,
--     the U+2000-U+200A family, LINE/PARAGRAPH SEPARATOR, NARROW NO-BREAK
--     SPACE (U+202F), IDEOGRAPHIC SPACE and the BOM. Postgres's `\s` and
--     `btrim` do not, and `btrim` strips SPACES ONLY. The gap is not academic:
--     macOS names every screenshot "Screenshot ... at 10.12.03 AM.png" with a
--     U+202F before the AM, so the most common file a teacher drags in is the
--     one the two rules would have disagreed on. The class is therefore built
--     from `chr()` calls, one per member, exactly as 0108 builds its control
--     character class -- an escape Postgres does not recognise in an `E''`
--     string is kept as the bare LETTER, which is the trap CLAUDE.md names.
--     The non-ASCII members are added only under a UTF8 server encoding
--     (production always is); on any other encoding the class is the ASCII
--     seven and the file still applies.
--
--   * `.slice(0, 300)` counts UTF-16 CODE UNITS, so a character outside the
--     Basic Multilingual Plane (an emoji) costs two. `left(x, 300)` counts
--     characters. The cap here counts units, and a two-unit character that
--     would straddle the boundary is dropped whole -- the TypeScript form
--     would keep a lone surrogate there, which is not encodable as UTF-8 and
--     could never have reached this column in the first place.
--
--   * `btrim` (spaces only) versus `trim()` -- see the first point; every
--     trim in this function uses the same explicit class.
--
-- ===========================================================================
-- WHO MAY CALL WHAT
-- ===========================================================================
-- Every RPC re-checks `_classroom_manages_item` -- the caller manages EVERY
-- section the item is posted to -- which is the gate `classroom_add_attachment`,
-- `classroom_delete_attachment` and `classroom_duplicate_item` already apply.
-- No new gate, no wider gate. A student is refused by it; so is a teacher who
-- manages some other section.
--
-- Grants name the roles explicitly. `create function` on this project arrives
-- under default privileges that write a DIRECT `anon` grant into the
-- function's `proacl`, so `revoke ... from public` alone closes nothing
-- (0137's whole subject). Each new function revokes from `public, anon,
-- authenticated, service_role` and grants back `authenticated` alone: no
-- server of ours calls these with the service key, the browser client is the
-- only caller, and a role that holds nothing it uses is one fewer thing to
-- keep authorized. The private helpers are granted to nobody.
-- `classroom_duplicate_item` keeps 0159's exact grant statement -- it is an
-- EXISTING function and `service_role`'s EXECUTE on it is not this file's to
-- take away.
--
-- ===========================================================================
-- VERIFICATION QUERY -- paste into the SQL editor after applying
-- ===========================================================================
--
--   select
--     (select count(*) from information_schema.columns
--       where table_schema = 'public' and table_name = 'classroom_items'
--         and column_name in ('files_placement', 'links_placement'))      as columns_expect_2,
--     (select count(*) from pg_constraint
--       where conname in ('classroom_items_files_placement',
--                         'classroom_items_links_placement'))              as checks_expect_2,
--     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname in (
--         'classroom_set_item_layout', 'classroom_set_attachment_order',
--         'classroom_set_instructor_attachment_order',
--         'classroom_rename_attachment', 'classroom_rename_instructor_attachment',
--         '_classroom_attachment_filename', '_classroom_attachment_referenced')) as functions_expect_7,
--     (select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
--       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname in (
--         'classroom_set_item_layout', 'classroom_set_attachment_order',
--         'classroom_set_instructor_attachment_order',
--         'classroom_rename_attachment', 'classroom_rename_instructor_attachment',
--         'classroom_duplicate_item'))                                     as anon_closed_expect_true,
--     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
--       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname in (
--         'classroom_set_item_layout', 'classroom_set_attachment_order',
--         'classroom_set_instructor_attachment_order',
--         'classroom_rename_attachment', 'classroom_rename_instructor_attachment',
--         'classroom_duplicate_item'))                                     as authenticated_open_expect_true,
--     (select pg_get_functiondef('public.classroom_duplicate_item(uuid, uuid[])'::regprocedure)
--        like '%files_placement%')                                         as duplicate_carries_placement_expect_true,
--     (select count(*) from public.classroom_items
--       where files_placement <> 'bottom' or links_placement <> 'bottom')  as moved_rows_expect_0_on_first_apply,
--     public._classroom_attachment_filename('  Bridge lab (final) [v2].png  ')
--                                                                         as sanitizer_expect_Bridge_lab_final_v2_png;
--
-- Expected: 2, 2, 7, true, true, true, 0 (on the day it is applied; teachers
-- move things afterwards), 'Bridge-lab-final-v2-.png'.
--
-- ===========================================================================
-- WHAT UNDOES THIS FILE
-- ===========================================================================
--
--   drop function if exists public.classroom_set_item_layout(uuid, text, text);
--   drop function if exists public.classroom_set_attachment_order(uuid, uuid[]);
--   drop function if exists public.classroom_set_instructor_attachment_order(uuid, uuid[]);
--   drop function if exists public.classroom_rename_attachment(uuid, text);
--   drop function if exists public.classroom_rename_instructor_attachment(uuid, text);
--   drop function if exists public._classroom_attachment_referenced(uuid, text);
--   drop function if exists public._classroom_attachment_filename(text);
--   alter table public.classroom_items drop column if exists files_placement;
--   alter table public.classroom_items drop column if exists links_placement;
--   -- then re-paste 0159's `create or replace function public.classroom_duplicate_item`
--   -- and its grant lines, so the copy no longer names the dropped columns.
--
-- Dropping the two columns FORGETS every placement a teacher has set (the
-- rows fall back to nothing, which the pane draws as bottom); it destroys no
-- file, no link and no order. The client degrades on its own: the item read's
-- widest rung fails on the missing column, `item.layout` comes back undefined,
-- and every placement, ordering and rename control is removed because the
-- transport is withheld -- absence is the mechanism, so nothing 500s.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. PRECONDITIONS. Refuse rather than half-apply.
-- ---------------------------------------------------------------------------

do $pre$
declare
	v_missing text[] := '{}';
	t text;
begin
	foreach t in array array[
		'classroom_items',
		'classroom_postings',
		'classroom_attachments',
		'classroom_instructor_attachments',
		'classroom_assignment_specs',
		'classroom_reference_specs',
		'classroom_item_resources',
		'classroom_instructor_resources',
		'classroom_decks',
		'classroom_deck_files',
		'classroom_rubrics'
	] loop
		if to_regclass('public.' || t) is null then
			v_missing := v_missing || t;
		end if;
	end loop;
	if array_length(v_missing, 1) is not null then
		raise exception '0193 cannot apply: missing table(s) %. Apply 0090, 0092 and 0135 first.', v_missing;
	end if;

	if to_regprocedure('public._classroom_manages_item(uuid)') is null then
		raise exception '0193 cannot apply: _classroom_manages_item(uuid) does not exist. Apply 0085 first.';
	end if;
	if to_regprocedure('public.classroom_duplicate_item(uuid, uuid[])') is null then
		raise exception '0193 cannot apply: classroom_duplicate_item(uuid, uuid[]) does not exist. Apply 0085 through 0159 first.';
	end if;
	-- 0159's body is what this file carries forward. If a later author has
	-- already replaced it, re-pasting 0159's text here would REVERT their work
	-- with the object present and nothing to say so (the 0151-over-0148
	-- shape). The three 0159 additions are the marker for "0159 is what is
	-- live"; a body that lacks one has moved on and this file stops.
	if pg_get_functiondef('public.classroom_duplicate_item(uuid, uuid[])'::regprocedure)
		not like '%insert into public.classroom_reference_specs%' then
		raise exception '0193 cannot apply: classroom_duplicate_item is not 0159''s body. Diff this file''s copy against the live definition before applying.';
	end if;

	-- The columns the two attachment tables must carry for the order and
	-- rename writes, asserted rather than assumed.
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_attachments'
			and column_name in ('id', 'item_id', 'filename', 'sort_order')
		having count(*) = 4) then
		raise exception '0193 cannot apply: classroom_attachments does not carry (id, item_id, filename, sort_order).';
	end if;
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_instructor_attachments'
			and column_name in ('id', 'item_id', 'filename', 'sort_order')
		having count(*) = 4) then
		raise exception '0193 cannot apply: classroom_instructor_attachments does not carry (id, item_id, filename, sort_order).';
	end if;
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_items'
			and column_name in ('body_doc', 'updated_at', 'edited_at')
		having count(*) = 3) then
		raise exception '0193 cannot apply: classroom_items does not carry (body_doc, updated_at, edited_at). Apply 0108 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 2. THE COLUMNS. `add column if not exists` is the catalog guard; the check
--    constraints are guarded on pg_constraint because Postgres has no
--    `add constraint if not exists`. Every existing row takes the default,
--    which is the arrangement every page draws today.
-- ---------------------------------------------------------------------------

alter table public.classroom_items
	add column if not exists files_placement text not null default 'bottom';
alter table public.classroom_items
	add column if not exists links_placement text not null default 'bottom';

do $cols$
begin
	if not exists (select 1 from pg_constraint where conname = 'classroom_items_files_placement') then
		alter table public.classroom_items
			add constraint classroom_items_files_placement
			check (files_placement in ('top', 'bottom'));
	end if;
	if not exists (select 1 from pg_constraint where conname = 'classroom_items_links_placement') then
		alter table public.classroom_items
			add constraint classroom_items_links_placement
			check (links_placement in ('top', 'bottom'));
	end if;
end
$cols$;

-- ---------------------------------------------------------------------------
-- 3. THE SANITIZER. See the header for the three places a transcription
--    would drift. Private: granted to nobody, called only from the rename
--    RPCs below.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_attachment_filename(p_raw text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
	-- JavaScript's WhiteSpace + LineTerminator, which is what both `\s` and
	-- `trim()` cover there. Built from chr() so every member is spelled as a
	-- number a reader can check against the ECMAScript table, never as an
	-- escape that might be kept as a letter. The seven ASCII members first.
	v_ws text := chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32);
	v_class text;
	v_name text;
	v_out text;
	v_units integer;
	v_i integer;
	v_ch text;
	v_cost integer;
begin
	if current_setting('server_encoding') = 'UTF8' then
		v_ws := v_ws
			|| chr(160)                       -- NO-BREAK SPACE
			|| chr(5760)                      -- OGHAM SPACE MARK
			|| chr(8192) || '-' || chr(8202)  -- EN QUAD .. HAIR SPACE (U+2000-U+200A)
			|| chr(8232)                      -- LINE SEPARATOR
			|| chr(8233)                      -- PARAGRAPH SEPARATOR
			|| chr(8239)                      -- NARROW NO-BREAK SPACE (macOS "10.12.03 AM")
			|| chr(8287)                      -- MEDIUM MATHEMATICAL SPACE
			|| chr(12288)                     -- IDEOGRAPHIC SPACE
			|| chr(65279);                    -- ZERO WIDTH NO-BREAK SPACE (BOM)
	end if;

	-- String(raw ?? '').trim()
	v_name := regexp_replace(coalesce(p_raw, ''), '^[' || v_ws || ']+|[' || v_ws || ']+$', '', 'g');

	-- .slice(0, 300), in UTF-16 code units. Only walked when the name could
	-- possibly exceed the cap: 150 characters is 300 units at most.
	if length(v_name) > 150 then
		v_out := '';
		v_units := 0;
		for v_i in 1 .. length(v_name) loop
			v_ch := substr(v_name, v_i, 1);
			v_cost := case when ascii(v_ch) > 65535 then 2 else 1 end;
			exit when v_units + v_cost > 300;
			v_out := v_out || v_ch;
			v_units := v_units + v_cost;
		end loop;
		v_name := v_out;
	end if;

	-- sanitizeAttachmentFilename: trim again (the cap can end on whitespace);
	-- an empty trimmed name is '' there and 'attachment' one call up.
	v_name := regexp_replace(v_name, '^[' || v_ws || ']+|[' || v_ws || ']+$', '', 'g');
	if v_name = '' then
		return 'attachment';
	end if;

	-- runs of whitespace, '(', ')', '[', ']' become one '-'. The ']' goes
	-- FIRST inside the bracket so it is literal; '[' is literal anywhere but
	-- before ':', '.' or '='. No backslash is used inside a bracket, so the
	-- expression reads the same under every regex flavour Postgres offers.
	v_class := '[]' || v_ws || '()[]+';
	v_name := regexp_replace(v_name, v_class, '-', 'g');
	v_name := regexp_replace(v_name, '-{2,}', '-', 'g');
	v_name := regexp_replace(v_name, '^-+|-+$', '', 'g');
	if v_name = '' then
		return 'attachment';
	end if;
	return v_name;
end;
$$;

revoke all on function public._classroom_attachment_filename(text)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. IS THIS NAME IN USE AS A FIGURE. One statement of the question, asked by
--    the student-facing rename only (see the header: an instructor file
--    cannot be a figure).
--
--    The body half is the RESOLVER's own rule (`resolveFigureSrc`): an `img`
--    block whose `src` starts with `attachment:`, the remainder trimmed and
--    compared case-insensitively. The spec half mirrors
--    `attachmentRefMentionedIn`: any string anywhere in the document that
--    carries `attachment:<name>` as a whole reference -- a markdown figure in
--    a prompt, an instructions block, a caption -- so a rename cannot break a
--    worksheet the way it could break a body. Every string value is visited
--    through jsonpath `$.**`, which walks arrays and objects to any depth.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_attachment_referenced(p_item_id uuid, p_filename text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_name text := regexp_replace(coalesce(p_filename, ''), '^\s+|\s+$', '', 'g');
	v_re text;
begin
	if v_name = '' then
		return false;
	end if;

	-- The body: an image block naming this file.
	if exists (
		select 1
		from public.classroom_items i
		cross join lateral jsonb_array_elements(
			case when jsonb_typeof(i.body_doc) = 'array' then i.body_doc else '[]'::jsonb end
		) b
		where i.id = p_item_id
			and b.value->>'type' = 'img'
			and lower(coalesce(b.value->>'src', '')) like 'attachment:%'
			and lower(regexp_replace(substr(b.value->>'src', 12), '^\s+|\s+$', '', 'g')) = lower(v_name)
	) then
		return true;
	end if;

	-- The specs: the alias as a whole reference inside any string. The name is
	-- escaped character by character so a '.' in 'rig.png' is a dot and not
	-- "any character"; the lookahead refuses 'rig.png' matching inside
	-- 'rig.png2' while letting the ')' of a markdown figure follow it. The
	-- backslashes inside this bracket are ARE escapes, the default flavour;
	-- the sanitizer's class in section 3 avoids them because it is built from
	-- chr() and has to read the same under any flavour.
	v_re := 'attachment:[[:space:]]*'
		|| regexp_replace(v_name, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
		|| '(?![^][:space:])"''<>,;])';

	if exists (
		select 1
		from public.classroom_assignment_specs a
		cross join lateral jsonb_path_query(a.spec, '$.**') s
		where a.item_id = p_item_id
			and jsonb_typeof(s) = 'string'
			and (s #>> '{}') ~* v_re
	) then
		return true;
	end if;
	if exists (
		select 1
		from public.classroom_reference_specs r
		cross join lateral jsonb_path_query(r.spec, '$.**') s
		where r.item_id = p_item_id
			and jsonb_typeof(s) = 'string'
			and (s #>> '{}') ~* v_re
	) then
		return true;
	end if;

	return false;
end;
$$;

revoke all on function public._classroom_attachment_referenced(uuid, text)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. PLACEMENT. Not an edit: `updated_at` only.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_item_layout(
	p_item_id uuid,
	p_files_placement text,
	p_links_placement text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	-- Exact values, not normalised: the CHECK constraint is exact and a
	-- client that sends ' Top' has a bug worth hearing about, not one worth
	-- absorbing. `is null or not in` because `null not in (...)` is NULL and
	-- `if not null` does not fire.
	if p_files_placement is null or p_files_placement not in ('top', 'bottom') then
		raise exception 'Files go at the top or the bottom of the text; % is not a place.', coalesce(quote_literal(p_files_placement), 'null');
	end if;
	if p_links_placement is null or p_links_placement not in ('top', 'bottom') then
		raise exception 'Links go at the top or the bottom of the text; % is not a place.', coalesce(quote_literal(p_links_placement), 'null');
	end if;
	-- Existence before the manage check is the shape every classroom RPC in
	-- this family already has (classroom_duplicate_item, _set_item_unit); a
	-- uuid is not guessable, so the two sentences disclose nothing an id
	-- probe could use. Kept as the precedent rather than folded into one.
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can arrange it.';
	end if;

	update public.classroom_items
		set files_placement = p_files_placement,
			links_placement = p_links_placement,
			updated_at = now()
		where id = p_item_id;

	return jsonb_build_object(
		'ok', true,
		'item_id', p_item_id,
		'files_placement', p_files_placement,
		'links_placement', p_links_placement
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. ORDER. The array is the whole list or it is refused. The two functions
--    are the same statement over two tables; the instructor twin is the
--    student-facing one with the table name changed and nothing else, kept
--    as two plain functions rather than one dynamic-SQL helper so each can
--    be read straight through.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_attachment_order(
	p_item_id uuid,
	p_attachment_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_ids uuid[] := coalesce(p_attachment_ids, '{}'::uuid[]);
	v_given integer := coalesce(array_length(coalesce(p_attachment_ids, '{}'::uuid[]), 1), 0);
	v_distinct integer;
	v_have integer;
	v_matched integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can reorder its files.';
	end if;

	select count(distinct x) into v_distinct from unnest(v_ids) as x;
	if v_distinct <> v_given then
		raise exception 'The order names a file more than once (% id(s), % distinct).', v_given, v_distinct;
	end if;
	select count(*) into v_have from public.classroom_attachments where item_id = p_item_id;
	select count(*) into v_matched
		from public.classroom_attachments t
		where t.item_id = p_item_id and t.id = any (v_ids);
	if v_given <> v_have or v_matched <> v_have then
		raise exception 'The order must name every file on this item exactly once: it has % file(s), the order named % id(s), of which % belong to it.', v_have, v_given, v_matched;
	end if;

	update public.classroom_attachments t
		set sort_order = o.ord
		from unnest(v_ids) with ordinality as o(id, ord)
		where t.id = o.id and t.item_id = p_item_id;

	return jsonb_build_object('ok', true, 'ordered', v_have);
end;
$$;

create or replace function public.classroom_set_instructor_attachment_order(
	p_item_id uuid,
	p_attachment_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_ids uuid[] := coalesce(p_attachment_ids, '{}'::uuid[]);
	v_given integer := coalesce(array_length(coalesce(p_attachment_ids, '{}'::uuid[]), 1), 0);
	v_distinct integer;
	v_have integer;
	v_matched integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can reorder its files.';
	end if;

	select count(distinct x) into v_distinct from unnest(v_ids) as x;
	if v_distinct <> v_given then
		raise exception 'The order names a file more than once (% id(s), % distinct).', v_given, v_distinct;
	end if;
	select count(*) into v_have from public.classroom_instructor_attachments where item_id = p_item_id;
	select count(*) into v_matched
		from public.classroom_instructor_attachments t
		where t.item_id = p_item_id and t.id = any (v_ids);
	if v_given <> v_have or v_matched <> v_have then
		raise exception 'The order must name every file on this item exactly once: it has % file(s), the order named % id(s), of which % belong to it.', v_have, v_given, v_matched;
	end if;

	update public.classroom_instructor_attachments t
		set sort_order = o.ord
		from unnest(v_ids) with ordinality as o(id, ord)
		where t.id = o.id and t.item_id = p_item_id;

	return jsonb_build_object('ok', true, 'ordered', v_have);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RENAME. Structured refusals for the two outcomes a teacher is shown;
--    a raise for misuse.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_rename_attachment(
	p_attachment_id uuid,
	p_filename text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_row public.classroom_attachments%rowtype;
	v_name text;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select t.* into v_row from public.classroom_attachments t where t.id = p_attachment_id;
	if not found then
		raise exception 'That file does not exist.';
	end if;
	if not public._classroom_manages_item(v_row.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can rename its files.';
	end if;

	v_name := public._classroom_attachment_filename(p_filename);

	-- The CURRENT name is what a figure names; the new one is irrelevant to
	-- whether something would break.
	if public._classroom_attachment_referenced(v_row.item_id, v_row.filename) then
		return jsonb_build_object('ok', false, 'reason', 'referenced');
	end if;
	if exists (
		select 1 from public.classroom_attachments s
		where s.item_id = v_row.item_id
			and s.id <> v_row.id
			and lower(s.filename) = lower(v_name)
	) then
		return jsonb_build_object('ok', false, 'reason', 'taken');
	end if;

	update public.classroom_attachments set filename = v_name where id = v_row.id;

	return jsonb_build_object('ok', true, 'attachment_id', v_row.id, 'filename', v_name);
end;
$$;

create or replace function public.classroom_rename_instructor_attachment(
	p_attachment_id uuid,
	p_filename text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_row public.classroom_instructor_attachments%rowtype;
	v_name text;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select t.* into v_row from public.classroom_instructor_attachments t where t.id = p_attachment_id;
	if not found then
		raise exception 'That file does not exist.';
	end if;
	if not public._classroom_manages_item(v_row.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can rename its files.';
	end if;

	v_name := public._classroom_attachment_filename(p_filename);

	-- No `referenced` arm, deliberately: an item body resolves an alias
	-- against the student-facing list only, so an instructor file is never a
	-- figure and a rename can break nothing a class sees.
	if exists (
		select 1 from public.classroom_instructor_attachments s
		where s.item_id = v_row.item_id
			and s.id <> v_row.id
			and lower(s.filename) = lower(v_name)
	) then
		return jsonb_build_object('ok', false, 'reason', 'taken');
	end if;

	update public.classroom_instructor_attachments set filename = v_name where id = v_row.id;

	return jsonb_build_object('ok', true, 'attachment_id', v_row.id, 'filename', v_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. THE DUPLICATE. 0159's body VERBATIM, diffed against that file rather
--    than reconstructed, plus the two placement columns in the copy's insert.
--    Same signature, so `create or replace` is all it needs. The addition is
--    marked `-- 0193:` inline so the next author can find the diff without
--    leaving the file; 0159's own `-- 0159:` markers are kept as they were.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_duplicate_item(
	p_item_id uuid,
	p_section_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.classroom_items%rowtype;
	v_sections uuid[];
	v_section uuid;
	v_id uuid;
	v_deck uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select i.* into v_old from public.classroom_items i where i.id = p_item_id;
	if not found then
		raise exception 'That item does not exist.';
	end if;
	if not public.classroom_can_read_item(p_item_id) or not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can duplicate it.';
	end if;

	if p_section_ids is null or array_length(p_section_ids, 1) is null then
		select array_agg(section_id) into v_sections
		from public.classroom_postings where item_id = p_item_id;
	else
		v_sections := p_section_ids;
	end if;
	v_sections := public._classroom_check_publish_targets(v_sections);

	-- Always a DRAFT: a duplicate is a starting point someone is about to edit,
	-- and publishing it the moment it is made would put an unfinished copy in
	-- front of a class.
	-- 0193: the copy carries the source's placement; the two columns are the
	-- only change to this statement.
	insert into public.classroom_items
		(kind, title, body, body_doc, points, due_at, category, author_email, author_name,
			published, pinned, sort_order, files_placement, links_placement)
	values (v_old.kind,
		case when v_old.kind = 'post' then v_old.title
			else left(coalesce(v_old.title, '') || ' (copy)', 300) end,
		v_old.body,
		coalesce(v_old.body_doc, public._classroom_doc_from_text(v_old.body)),
		v_old.points, v_old.due_at, v_old.category,
		public.current_user_email(), public._classroom_author_name(),
		false, false, 0, v_old.files_placement, v_old.links_placement)
	returning id into v_id;

	foreach v_section in array v_sections loop
		insert into public.classroom_postings (item_id, section_id) values (v_id, v_section);
	end loop;

	insert into public.classroom_item_resources (item_id, label, url, sort_order)
	select v_id, r.label, r.url, r.sort_order
	from public.classroom_item_resources r where r.item_id = p_item_id;

	insert into public.classroom_attachments
		(item_id, drive_file_id, storage_key, filename, mime_type, size_bytes, uploaded_by, sort_order)
	select v_id, t.drive_file_id, t.storage_key, t.filename, t.mime_type, t.size_bytes,
		public.current_user_email(), t.sort_order
	from public.classroom_attachments t where t.item_id = p_item_id;

	insert into public.classroom_instructor_resources (item_id, label, url, sort_order)
	select v_id, r.label, r.url, r.sort_order
	from public.classroom_instructor_resources r where r.item_id = p_item_id;

	insert into public.classroom_instructor_attachments
		(item_id, drive_file_id, storage_key, filename, mime_type, size_bytes, uploaded_by, sort_order)
	select v_id, t.drive_file_id, t.storage_key, t.filename, t.mime_type, t.size_bytes,
		public.current_user_email(), t.sort_order
	from public.classroom_instructor_attachments t where t.item_id = p_item_id;

	insert into public.classroom_decks
		(item_id, title, entry_path, thumbnail_path, drive_folder_id,
			file_count, total_bytes, has_state_file, slides, uploaded_by)
	select v_id, d.title, d.entry_path, d.thumbnail_path, d.drive_folder_id,
		d.file_count, d.total_bytes, d.has_state_file, d.slides,
		public.current_user_email()
	from public.classroom_decks d where d.item_id = p_item_id
	returning id into v_deck;

	if v_deck is not null then
		insert into public.classroom_deck_files (deck_id, path, drive_file_id, mime_type, size_bytes)
		select v_deck, df.path, df.drive_file_id, df.mime_type, df.size_bytes
		from public.classroom_deck_files df
		join public.classroom_decks d on d.id = df.deck_id
		where d.item_id = p_item_id;
	end if;

	-- 0159: THE WORKSHEET ITSELF. Without this a duplicated interactive
	-- assignment is an empty page -- the one failure that reads as content
	-- rather than as an error.
	insert into public.classroom_assignment_specs (item_id, spec, imported_by, updated_at)
	select v_id, a.spec, public.current_user_email(), now()
	from public.classroom_assignment_specs a where a.item_id = p_item_id;

	-- 0159: THE GRADED RUBRIC (classroom_rubrics), which is the record grading
	-- reads -- NOT the criteria embedded in the spec above. The two are
	-- different records on purpose and only this one is graded against, so
	-- copying the spec alone would leave the copy ungradeable.
	insert into public.classroom_rubrics (item_id, criteria, updated_by, updated_at)
	select v_id, r.criteria, public.current_user_email(), now()
	from public.classroom_rubrics r where r.item_id = p_item_id;

	-- 0159: THE REFERENCE DOCUMENT (0092), which is the material-side
	-- equivalent. An item is an assignment or a material, so this and the
	-- assignment spec above are not both expected to find a row.
	insert into public.classroom_reference_specs (item_id, spec, imported_by, updated_at)
	select v_id, s.spec, public.current_user_email(), now()
	from public.classroom_reference_specs s where s.item_id = p_item_id;

	return jsonb_build_object('ok', true, 'item_id', v_id, 'source_item_id', p_item_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. GRANTS. Roles named explicitly; see the header. The duplicate keeps
--    0159's exact statement, `service_role` untouched on that one.
-- ---------------------------------------------------------------------------

revoke all on function public.classroom_set_item_layout(uuid, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_set_item_layout(uuid, text, text) to authenticated;

revoke all on function public.classroom_set_attachment_order(uuid, uuid[])
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_set_attachment_order(uuid, uuid[]) to authenticated;

revoke all on function public.classroom_set_instructor_attachment_order(uuid, uuid[])
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_set_instructor_attachment_order(uuid, uuid[]) to authenticated;

revoke all on function public.classroom_rename_attachment(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_rename_attachment(uuid, text) to authenticated;

revoke all on function public.classroom_rename_instructor_attachment(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_rename_instructor_attachment(uuid, text) to authenticated;

revoke all on function public.classroom_duplicate_item(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.classroom_duplicate_item(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. SELF-CHECK. Every claim the header makes is asserted against the
--     installed catalog, not against the text above. A raise here rolls the
--     whole file back under the apply tool and under the SQL editor's
--     implicit transaction alike.
-- ---------------------------------------------------------------------------

do $checks$
declare
	v_fn text;
	v_n integer;
	v_src text := pg_get_functiondef('public.classroom_duplicate_item(uuid, uuid[])'::regprocedure);
	v_items integer;
	v_moved integer;
	v_files integer;
	v_ifiles integer;
	v_probe text;
begin
	-- The columns and their checks.
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_items'
			and column_name in ('files_placement', 'links_placement')
		having count(*) = 2) then
		raise exception '0193 did not take: the placement columns are missing.';
	end if;
	if not exists (select 1 from pg_constraint where conname = 'classroom_items_files_placement')
		or not exists (select 1 from pg_constraint where conname = 'classroom_items_links_placement') then
		raise exception '0193 did not take: a placement check constraint is missing.';
	end if;

	-- Exactly one arity per function, so no overload survives to be resolved
	-- instead of the one this file wrote. The private helpers are included:
	-- a second `_classroom_attachment_filename` would be a second sanitizer.
	foreach v_fn in array array[
		'classroom_set_item_layout',
		'classroom_set_attachment_order',
		'classroom_set_instructor_attachment_order',
		'classroom_rename_attachment',
		'classroom_rename_instructor_attachment',
		'classroom_duplicate_item',
		'_classroom_attachment_filename',
		'_classroom_attachment_referenced'
	] loop
		select count(*) into v_n
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = v_fn;
		if v_n <> 1 then
			raise exception '0193: % resolves to % rows, expected exactly 1.', v_fn, v_n;
		end if;
	end loop;

	-- The grant partition, BOTH directions, read from the ACL rather than
	-- from this file's own intent. A file that closed everything would
	-- satisfy half of this.
	foreach v_fn in array array[
		'public.classroom_set_item_layout(uuid, text, text)',
		'public.classroom_set_attachment_order(uuid, uuid[])',
		'public.classroom_set_instructor_attachment_order(uuid, uuid[])',
		'public.classroom_rename_attachment(uuid, text)',
		'public.classroom_rename_instructor_attachment(uuid, text)',
		'public.classroom_duplicate_item(uuid, uuid[])'
	] loop
		if has_function_privilege('anon', v_fn, 'EXECUTE') then
			raise exception '0193 leaked % to anon.', v_fn;
		end if;
		if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
			raise exception '0193 went too far: authenticated lost EXECUTE on %.', v_fn;
		end if;
	end loop;
	foreach v_fn in array array[
		'public._classroom_attachment_filename(text)',
		'public._classroom_attachment_referenced(uuid, text)'
	] loop
		if has_function_privilege('anon', v_fn, 'EXECUTE')
			or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
			raise exception '0193 leaked the private helper % to a client role.', v_fn;
		end if;
	end loop;

	-- The duplicate: 0159's markers survived (this is a diff, not a rewrite)
	-- and the one addition is present.
	if v_src not like '%files_placement%' or v_src not like '%links_placement%' then
		raise exception '0193 did not take: classroom_duplicate_item does not carry the placement onto the copy.';
	end if;
	if v_src not like '%insert into public.classroom_assignment_specs%'
		or v_src not like '%insert into public.classroom_rubrics%'
		or v_src not like '%insert into public.classroom_reference_specs%' then
		raise exception '0193 regressed 0159: the spec, rubric or reference document is no longer carried onto the copy.';
	end if;
	if v_src not like '%storage_key%' or v_src not like '%classroom_deck_files%'
		or v_src not like '%_classroom_doc_from_text%' then
		raise exception '0193 regressed 0135, 0101 or 0108 in classroom_duplicate_item.';
	end if;
	if v_src not like '%_classroom_manages_item%' or v_src not like '%classroom_can_read_item%' then
		raise exception '0193 regressed the authorization check on classroom_duplicate_item.';
	end if;
	if v_src not like '%false, false, 0, v_old.files_placement%' then
		raise exception '0193 regressed: a duplicate is no longer created as an unpinned draft carrying its placement.';
	end if;

	-- The sanitizer, against values computed by hand from the TypeScript rule
	-- rather than read back from itself. The test file puts the same names
	-- through `recordedAttachmentFilename` and asserts they agree; these are
	-- the ASCII cases, which hold under any server encoding.
	v_probe := public._classroom_attachment_filename('  Bridge lab (final) [v2].png  ');
	if v_probe <> 'Bridge-lab-final-v2-.png' then
		raise exception '0193: sanitizer disagrees with the record route on a spaced, bracketed name: got %.', v_probe;
	end if;
	v_probe := public._classroom_attachment_filename(chr(9) || chr(10) || '  ');
	if v_probe <> 'attachment' then
		raise exception '0193: sanitizer does not default a blank name: got %.', v_probe;
	end if;
	v_probe := public._classroom_attachment_filename('--- a  b ---');
	if v_probe <> 'a-b' then
		raise exception '0193: sanitizer does not collapse and trim dashes: got %.', v_probe;
	end if;
	v_probe := public._classroom_attachment_filename(null);
	if v_probe <> 'attachment' then
		raise exception '0193: sanitizer does not default a null name: got %.', v_probe;
	end if;
	if length(public._classroom_attachment_filename(repeat('x', 320) || '.png')) <> 300 then
		raise exception '0193: sanitizer does not cap at 300.';
	end if;

	-- Counts, for the operator to read against what the app holds.
	select count(*) into v_items from public.classroom_items;
	select count(*) into v_moved from public.classroom_items
		where files_placement <> 'bottom' or links_placement <> 'bottom';
	select count(*) into v_files from public.classroom_attachments;
	select count(*) into v_ifiles from public.classroom_instructor_attachments;

	raise notice '0193: % item(s) carry a placement; % of them sit anywhere but the bottom (0 on a first apply, since every existing row takes the default).', v_items, v_moved;
	raise notice '0193: % student-facing and % instructor-only attachment(s) can now be reordered and renamed. No row was moved, renamed or deleted by this file.', v_files, v_ifiles;
	raise notice '0193: five RPCs granted to authenticated only; two private helpers granted to nobody; classroom_duplicate_item now carries the placement onto a copy.';
end
$checks$;
