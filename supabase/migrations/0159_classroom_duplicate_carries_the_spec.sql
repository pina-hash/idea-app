-- 0159_classroom_duplicate_carries_the_spec.sql
-- IDEA // CLASSROOM: duplicating an item carries the assignment spec, the
-- rubric and the reference spec with it.
--
-- Apply manually in the Supabase SQL editor. It is independent of 0160 and
-- either may be applied first.
--
-- ===========================================================================
-- WHAT IS WRONG TODAY, MEASURED ON PRODUCTION RATHER THAN REASONED ABOUT
-- ===========================================================================
-- Duplicating an interactive assignment produces a copy with NO spec and NO
-- rubric. The copy carries the title, the body, the points, the due date, the
-- resources, the attachments, the instructor-only resources and attachments
-- and the deck -- everything the five prior authors of this function added --
-- and then the one thing that makes an interactive assignment interactive is
-- silently absent. It reads as an empty worksheet rather than as a failure,
-- which is why it survived five rewrites.
--
-- The cost was already being paid by hand: of eleven live assignments, ten had
-- a rubric only because somebody attached one in a separate manual step after
-- duplicating.
--
-- ===========================================================================
-- WHAT THIS FILE DOES
-- ===========================================================================
-- It replaces `classroom_duplicate_item(uuid, uuid[])` with 0135'S BODY,
-- DIFFED AGAINST THAT FILE RATHER THAN RECONSTRUCTED FROM MEMORY OR FROM AN
-- EARLIER AUTHOR, plus three INSERT ... SELECT statements and nothing else.
-- The signature is unchanged, so `create or replace` is all it needs and no
-- `drop function` is required (the signature trap does not apply: no parameter
-- is added, removed or re-typed).
--
-- The function is on its SIXTH author -- 0085, 0090, 0101, 0108, 0135, this
-- one -- which is exactly where a reconstruction quietly loses a clause. The
-- three additions below are the whole diff against 0135.
--
--   classroom_assignment_specs  (0086)  item_id, spec, imported_by, updated_at
--   classroom_rubrics           (0086)  item_id, criteria, updated_by, updated_at
--   classroom_reference_specs   (0092)  item_id, spec, imported_by, updated_at
--
-- All three are keyed `item_id uuid primary key references
-- classroom_items(id) on delete cascade` -- one row per item, so each copy is
-- a single row and no `on conflict` clause is reachable: the destination item
-- was created three statements earlier and nothing else can have written to
-- it.
--
-- ALL THREE ARE COPIED UNCONDITIONALLY WHERE A SOURCE ROW EXISTS. An item is
-- either an assignment or a material, so in practice at most two of the three
-- find anything; a `select` that matches nothing inserts nothing, which is
-- cheaper and shorter than a `kind` branch that would have to be kept in step
-- with `classroom_items.kind` forever.
--
-- ===========================================================================
-- THE ATTRIBUTION DECISION: THE COPY NAMES THE DUPLICATING CALLER
-- ===========================================================================
-- `imported_by` and `updated_by` are `not null text` on all three tables, so
-- the copy has to name somebody. It names `current_user_email()` -- the person
-- who just pressed Copy -- and NOT the original importer.
--
-- The duplicate is a NEW ROW CREATED NOW. Stamping it with a fresh `updated_at`
-- of `now()` while attributing it to whoever imported the original says that
-- person did something today that they did not do, and the original importer
-- may no longer be at the school. This is the same choice 0135 and 0101 and
-- 0090 already made for every other copied row in this function:
-- `classroom_attachments.uploaded_by`, `classroom_instructor_attachments
-- .uploaded_by` and `classroom_decks.uploaded_by` all take
-- `current_user_email()` in the body above, and these three now match them.
--
-- `updated_at` is written as an explicit `now()` rather than left to the
-- column default, so the sentence above is verifiable by reading the body
-- rather than by also reading three table definitions.
--
-- ===========================================================================
-- WHAT THIS DELIBERATELY LEAVES ALONE
-- ===========================================================================
--   * EXISTING DUPLICATES ARE NOT REPAIRED, AND CANNOT BE. `classroom_items`
--     records no link back to the item a row was duplicated from --
--     `classroom_duplicate_item` RETURNS `source_item_id` to its caller and
--     stores it nowhere -- so there is no query that finds "copies whose
--     source had a spec". A heuristic over titles ending in " (copy)" is not
--     that query and would attach somebody else's rubric to an item on a
--     guess. Assignments duplicated before this file is applied keep needing
--     the manual step; assignments duplicated after it do not. No backfill.
--   * THE DUPLICATE IS STILL A DRAFT, still unpinned, still `sort_order` 0,
--     still titled "... (copy)" for everything but a post.
--   * IT STILL LANDS UNFILED (0111): no unit, deliberately.
--   * FILES ARE STILL CARRIED BY REFERENCE (0101 for Drive, 0135 for the
--     storage key), not re-uploaded.
--   * THE AUTHORIZATION IS UNCHANGED: `classroom_can_read_item` AND
--     `_classroom_manages_item`, both, exactly as 0135 left them. This file
--     adds no gate and removes none, and the three new statements sit AFTER
--     that check, inside the same function, so they are reachable only by a
--     caller who was already allowed to create the copy.
--   * `_classroom_check_publish_targets` still decides which sections a copy
--     may be posted to.
--   * NO CLIENT CODE CHANGES. `classroom_duplicate_item`'s return payload is
--     byte-for-byte the same three keys it has always had.
--
-- ===========================================================================
-- THE GRANTS
-- ===========================================================================
-- `create or replace` on this project arrives under default privileges that
-- write a DIRECT `anon` grant into the function's `proacl`, so the roles are
-- named explicitly. `revoke ... from public` alone does nothing here (0137's
-- whole subject); `public` is included in the list ANYWAY, beside `anon`,
-- because leaving PUBLIC's entry in place would let `anon` reach the function
-- through it after its own direct grant is gone.
--
-- `service_role` is NOT NAMED, in either direction, matching 0137: it holds
-- EXECUTE today and this file must not be what takes it away.
-- ===========================================================================

begin;

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
		'classroom_item_resources',
		'classroom_attachments',
		'classroom_instructor_resources',
		'classroom_instructor_attachments',
		'classroom_decks',
		'classroom_deck_files',
		'classroom_assignment_specs',
		'classroom_rubrics',
		'classroom_reference_specs'
	] loop
		if to_regclass('public.' || t) is null then
			v_missing := v_missing || t;
		end if;
	end loop;

	if array_length(v_missing, 1) is not null then
		raise exception '0159 cannot apply: missing table(s) %. Apply 0086 and 0092 first.', v_missing;
	end if;

	if to_regprocedure('public.classroom_duplicate_item(uuid, uuid[])') is null then
		raise exception '0159 cannot apply: classroom_duplicate_item(uuid, uuid[]) does not exist. Apply 0085 through 0135 first.';
	end if;

	-- The three column lists this file writes into, asserted rather than
	-- assumed: a renamed column would otherwise fail at the first duplicate
	-- somebody ran, in front of a teacher, instead of here.
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_assignment_specs'
			and column_name in ('item_id', 'spec', 'imported_by', 'updated_at')
		having count(*) = 4) then
		raise exception '0159 cannot apply: classroom_assignment_specs does not carry (item_id, spec, imported_by, updated_at).';
	end if;
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_rubrics'
			and column_name in ('item_id', 'criteria', 'updated_by', 'updated_at')
		having count(*) = 4) then
		raise exception '0159 cannot apply: classroom_rubrics does not carry (item_id, criteria, updated_by, updated_at).';
	end if;
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_reference_specs'
			and column_name in ('item_id', 'spec', 'imported_by', 'updated_at')
		having count(*) = 4) then
		raise exception '0159 cannot apply: classroom_reference_specs does not carry (item_id, spec, imported_by, updated_at).';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 2. THE FUNCTION. 0135's body verbatim, plus three INSERT ... SELECTs.
--
-- The additions are marked `-- 0159:` inline so the next author can find the
-- diff without leaving the file.
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
	insert into public.classroom_items
		(kind, title, body, body_doc, points, due_at, category, author_email, author_name,
			published, pinned, sort_order)
	values (v_old.kind,
		case when v_old.kind = 'post' then v_old.title
			else left(coalesce(v_old.title, '') || ' (copy)', 300) end,
		v_old.body,
		coalesce(v_old.body_doc, public._classroom_doc_from_text(v_old.body)),
		v_old.points, v_old.due_at, v_old.category,
		public.current_user_email(), public._classroom_author_name(),
		false, false, 0)
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
-- 3. GRANTS. Roles named explicitly; `service_role` untouched. See the header.
-- ---------------------------------------------------------------------------

revoke all on function public.classroom_duplicate_item(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.classroom_duplicate_item(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. SELF-CHECK. Every claim the header makes about the BODY is asserted
--    against the installed definition, not against the text above.
-- ---------------------------------------------------------------------------

do $checks$
declare
	v_src text := pg_get_functiondef('public.classroom_duplicate_item(uuid, uuid[])'::regprocedure);
	v_arities integer;
	v_specs integer;
	v_rubrics integer;
	v_refs integer;
	v_items integer;
begin
	-- The three additions are present.
	if v_src not like '%insert into public.classroom_assignment_specs%' then
		raise exception '0159 did not take: classroom_duplicate_item does not copy the assignment spec.';
	end if;
	if v_src not like '%insert into public.classroom_rubrics%' then
		raise exception '0159 did not take: classroom_duplicate_item does not copy the rubric.';
	end if;
	if v_src not like '%insert into public.classroom_reference_specs%' then
		raise exception '0159 did not take: classroom_duplicate_item does not copy the reference spec.';
	end if;

	-- 0135's body survived. Each of these is a clause a reconstruction from an
	-- earlier author would have dropped, so presence is the check that this is
	-- a diff and not a rewrite.
	if v_src not like '%storage_key%' then
		raise exception '0159 regressed 0135: the storage handle is no longer carried onto the copy.';
	end if;
	if v_src not like '%classroom_instructor_attachments%' then
		raise exception '0159 regressed 0090: instructor-only attachments are no longer carried onto the copy.';
	end if;
	if v_src not like '%classroom_deck_files%' then
		raise exception '0159 regressed 0101: the deck is no longer carried onto the copy.';
	end if;
	if v_src not like '%_classroom_doc_from_text%' then
		raise exception '0159 regressed 0108: the rich body is no longer carried onto the copy.';
	end if;
	if v_src not like '%_classroom_manages_item%' or v_src not like '%classroom_can_read_item%' then
		raise exception '0159 regressed the authorization check on classroom_duplicate_item.';
	end if;

	-- The copy is still a draft. `published` is written as a bare `false` in
	-- the VALUES list, so this is the narrowest string that says so.
	if v_src not like '%false, false, 0)%' then
		raise exception '0159 regressed: a duplicate is no longer created as an unpinned draft.';
	end if;

	-- Exactly one arity, so no old overload survives to be resolved instead.
	select count(*) into v_arities
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_duplicate_item';
	if v_arities <> 1 then
		raise exception '0159: classroom_duplicate_item resolves to % rows, expected exactly 1.', v_arities;
	end if;

	-- The grant partition, both directions: a file that closed everything
	-- would satisfy half of this.
	if has_function_privilege('anon', 'public.classroom_duplicate_item(uuid, uuid[])', 'EXECUTE') then
		raise exception '0159 leaked classroom_duplicate_item to anon.';
	end if;
	if not has_function_privilege('authenticated', 'public.classroom_duplicate_item(uuid, uuid[])', 'EXECUTE') then
		raise exception '0159 went too far: authenticated lost EXECUTE on classroom_duplicate_item.';
	end if;

	-- Counts. These are the material this change will now carry; they are NOT
	-- a count of what was repaired, because nothing was repaired (see the
	-- header: no link records what an item was duplicated from).
	select count(*) into v_items from public.classroom_items;
	select count(*) into v_specs from public.classroom_assignment_specs;
	select count(*) into v_rubrics from public.classroom_rubrics;
	select count(*) into v_refs from public.classroom_reference_specs;

	raise notice '0159: classroom_duplicate_item now copies the assignment spec, the rubric and the reference spec, attributed to the duplicating caller.';
	raise notice '0159: % item(s) exist today, carrying % assignment spec(s), % rubric(s) and % reference spec(s). Existing duplicates are NOT backfilled and cannot be.', v_items, v_specs, v_rubrics, v_refs;
end
$checks$;

commit;
