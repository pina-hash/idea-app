-- 0295_html_assignment_duplicate_and_live_lock.sql
--
-- TWO FIXES FOR PORTED HTML ASSIGNMENTS (ledger 0431, feedback round
-- 2026-10-23, items 2954e260 and 9f746072).
--
-- A. A DUPLICATE CARRIES ITS DOCUMENT. classroom_duplicate_item (0193, and
--    0159 before it) copied the post, its resources, attachments, deck, spec,
--    rubric and reference spec, and never the HTML document: the copy of a
--    ported worksheet was a plain assignment with a rubric and no worksheet,
--    on the site and through the connector's duplicate_post alike (both call
--    this one function). 0268's comment on the thumbnail trigger already says
--    "a duplicate" writes the document table; after this file it is true.
--
--    What the copy now takes from the source, and nothing else:
--      * the classroom_html_assignments row: document, manifest, filename,
--        show_title. A NEW document_id (the column default), because the id is
--        the public serving handle and two items must never share one.
--        imported_by is the person duplicating, updated_at is now.
--      * classroom_items.assignment_schema_version = 3, written in the same
--        transaction as the row it describes, the setter's own rule.
--      * an IdeaCAD editor (schema 4) the same way: the ideacad_editors row
--        and the version, because a duplicated Blade post lost its editor by
--        the identical omission.
--    No answer, hand-in, revision or instructor working copy is copied: a
--    duplicate is a fresh draft.
--
--    THE DOCUMENT IS COPIED WITHOUT THE ADMIN SEASON GATE of
--    classroom_set_html_assignment, deliberately. The gate exists so that only
--    an admin puts NEW bytes in front of a class; a duplicate puts the same
--    bytes an admin already imported, byte for byte, so it adds nothing a
--    reviewer has not seen. The caller still has to manage every class the
--    source and the copy are posted to, which is the duplicate's own check.
--
-- B. THE HEARTBEAT SAYS WHETHER THE ASSIGNMENT IS STILL OPEN. A student's open
--    worksheet took its lock from page-load data, so an instructor closing the
--    assignment left the frame editable while every save was refused with the
--    closed sentence. The item page already beats every 40 seconds
--    (classroom_presence_ping, 0200 then 0238), and its call budget is spent
--    (tests/classroom-poll.test.ts), so the beat now also answers the caller's
--    own submission state on the item, under the key lock: state and
--    submitted_at, or null for no row. The page flips the frame read-only or
--    back from that, and sooner from the class's live notice. 0238's body,
--    copied, with the two returns each gaining the one marked key.
--
-- DEPLOY ORDERING: none. Every signature is unchanged; the new key is extra
-- JSON a deployed client ignores, and a client that reads it treats its
-- absence as "no news".
--
-- WHAT UNDOES IT, a person's paste:
--   re-run 0193's classroom_duplicate_item and its two grant lines;
--   re-run 0238's PART C (classroom_presence_ping and its grants);
--   drop function if exists public._classroom_duplicate_work_surface(uuid, uuid);
-- Copies already made keep their documents, which is the point of the fix.

do $pre$
begin
	if to_regclass('public.classroom_html_assignments') is null then
		raise exception '0295 cannot apply: classroom_html_assignments does not exist. Apply 0195 first.';
	end if;
	if to_regclass('public.ideacad_editors') is null then
		raise exception '0295 cannot apply: ideacad_editors does not exist. Apply 0201 first.';
	end if;
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_html_assignments' and column_name = 'show_title') then
		raise exception '0295 cannot apply: classroom_html_assignments.show_title does not exist. Apply 0284 first.';
	end if;
	if to_regclass('public.classroom_feedback_threads') is null then
		raise exception '0295 cannot apply: classroom_feedback_threads does not exist. Apply 0238 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- A1. THE WORK SURFACE, COPIED. Private: called only by the duplicate below,
--     which has already checked the caller. THE FIRST OBJECT IS NEW, so the
--     apply probe can see this file landed.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_duplicate_work_surface(
	p_from uuid,
	p_to uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_version integer;
	v_n integer := 0;
begin
	select i.assignment_schema_version into v_version
	from public.classroom_items i where i.id = p_from;

	if v_version = 3 then
		insert into public.classroom_html_assignments
			(item_id, document, manifest, filename, imported_by, updated_at, show_title)
		select p_to, h.document, h.manifest, h.filename, public.current_user_email(), now(), h.show_title
		from public.classroom_html_assignments h
		where h.item_id = p_from;
		get diagnostics v_n = row_count;
	elsif v_version = 4 then
		insert into public.ideacad_editors (item_id, editor, config)
		select p_to, e.editor, e.config
		from public.ideacad_editors e
		where e.item_id = p_from;
		get diagnostics v_n = row_count;
	end if;

	-- THE VERSION ONLY WITH ITS ROW. A source claiming 3 with no document is
	-- already the broken shape; copying the claim would make a second one.
	if v_n > 0 then
		update public.classroom_items set assignment_schema_version = v_version where id = p_to;
	end if;
	return v_n;
end;
$fn$;

revoke all on function public._classroom_duplicate_work_surface(uuid, uuid)
	from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A2. THE DUPLICATE. 0193's body VERBATIM, plus the one marked call before
--     the return. Same signature, so create or replace is all it needs, and
--     the connector's duplicate_post gets the fix without a change of its own.
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

	-- ledger 0431: THE PORTED HTML DOCUMENT (schema 3) OR THE IDEACAD EDITOR
	-- (schema 4), with the version that names it. Before this a duplicated
	-- HTML assignment was a rubric with no worksheet.
	perform public._classroom_duplicate_work_surface(p_item_id, v_id);

	return jsonb_build_object('ok', true, 'item_id', v_id, 'source_item_id', p_item_id);
end;
$$;

revoke all on function public.classroom_duplicate_item(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.classroom_duplicate_item(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- B. THE HEARTBEAT ANSWERS THE CALLER'S OWN LOCK. 0238's body, copied, with
--    the declaration and the two returns each gaining the one marked key.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_presence_ping(
	p_item_id uuid,
	p_typed boolean default false,
	p_page_visible boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_now timestamptz := now();
	v_typed boolean := coalesce(p_typed, false);
	v_visible boolean := coalesce(p_page_visible, true);
	v_last_seen timestamptz;
	v_credit integer := 0;
	v_active integer;
	v_purged integer := 0;
	-- 0238: when this student's feedback on this item last moved.
	v_feedback timestamptz := (
		select max(t.updated_at) from public.classroom_feedback_threads t
		where t.item_id = p_item_id and t.student_email = v_email and t.removed_at is null
	);
	-- ledger 0431: the caller's OWN submission state on this item, the two
	-- columns assignmentLockState reads, or null for no row.
	v_lock jsonb := (
		select jsonb_build_object('state', s.state, 'submitted_at', s.submitted_at)
		from public.classroom_submissions s
		where s.item_id = p_item_id and s.student_email = v_email
	);
begin
	select p.last_seen_at into v_last_seen
	from public.classroom_presence p
	where p.item_id = p_item_id and p.student_email = v_email;

	-- THE RATE LIMIT IS HERE AND NOT IN THE BROWSER. Nothing is written and
	-- nothing is credited; the caller is told it was heard and ignored.
	if v_last_seen is not null
		and v_now - v_last_seen < public._classroom_presence_min_gap() then
		return jsonb_build_object('ok', true, 'throttled', true,
			'feedback_at', v_feedback, -- 0238
			'lock', v_lock); -- ledger 0431
	end if;

	if v_last_seen is not null and v_typed and v_visible then
		v_credit := greatest(
			0,
			floor(extract(epoch from least(
				v_now - v_last_seen,
				public._classroom_presence_credit_cap()
			)))::integer
		);
	end if;

	-- ON CONFLICT PLUS THE RETURNING, NOT SELECT-THEN-INSERT. Two tabs of one
	-- student beating in the same second are serialized by the primary key
	-- rather than racing a read (the 0134 lesson): the loser's insert becomes
	-- the update arm and credits against whatever the winner just wrote.
	insert into public.classroom_presence as p (
		item_id, student_email, first_seen_at, last_seen_at, last_input_at,
		page_visible, active_seconds
	)
	values (
		p_item_id, v_email, v_now, v_now,
		case when v_typed then v_now end,
		v_visible, 0
	)
	on conflict (item_id, student_email) do update set
		last_seen_at = v_now,
		last_input_at = case when v_typed then v_now else p.last_input_at end,
		page_visible = v_visible,
		active_seconds = p.active_seconds + v_credit
	returning p.active_seconds into v_active;

	-- THE OPPORTUNISTIC SWEEP, BOUNDED, ON THE PATH THAT ALREADY WROTE. A
	-- throttled beat returns above and never reaches this, so the sweep runs at
	-- most once per student per 20 seconds per assignment and deletes at most 50
	-- rows when it does.
	v_purged := public._classroom_presence_purge_before(
		v_now - public._classroom_presence_retention(),
		public._classroom_presence_purge_batch()
	);

	return jsonb_build_object(
		'ok', true,
		'throttled', false,
		'credited_seconds', v_credit,
		'active_seconds', v_active,
		'purged', v_purged,
		'feedback_at', v_feedback, -- 0238
		'lock', v_lock -- ledger 0431
	);
end;
$fn$;

revoke all on function public.classroom_presence_ping(uuid, boolean, boolean)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_presence_ping(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Z. SELF-CHECK. The installed catalog, not the text above. A raise rolls the
--    whole file back.
-- ---------------------------------------------------------------------------

do $z$
declare
	v_dup text := pg_get_functiondef('public.classroom_duplicate_item(uuid, uuid[])'::regprocedure);
	v_ping text := pg_get_functiondef('public.classroom_presence_ping(uuid, boolean, boolean)'::regprocedure);
	v_html integer;
	v_versioned integer;
begin
	if position('_classroom_duplicate_work_surface' in v_dup) = 0 then
		raise exception '0295: classroom_duplicate_item does not call the work surface copy.';
	end if;
	if position('''lock''' in v_ping) = 0 or position('feedback_at' in v_ping) = 0 then
		raise exception '0295: classroom_presence_ping lost a key.';
	end if;
	if has_function_privilege('anon', 'public._classroom_duplicate_work_surface(uuid, uuid)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_duplicate_work_surface(uuid, uuid)', 'execute') then
		raise exception '0295: the private copy helper is callable by a client role.';
	end if;
	if has_function_privilege('anon', 'public.classroom_duplicate_item(uuid, uuid[])', 'execute')
		or not has_function_privilege('authenticated', 'public.classroom_duplicate_item(uuid, uuid[])', 'execute') then
		raise exception '0295: classroom_duplicate_item grants are wrong.';
	end if;
	if has_function_privilege('anon', 'public.classroom_presence_ping(uuid, boolean, boolean)', 'execute')
		or not has_function_privilege('authenticated', 'public.classroom_presence_ping(uuid, boolean, boolean)', 'execute') then
		raise exception '0295: classroom_presence_ping grants are wrong.';
	end if;

	-- THE COUNT AN OPERATOR CAN CHECK: HTML assignments with a document, and
	-- items marked schema 3; the two should be equal. A duplicate left empty
	-- before this file carries no version at all, so it is in neither count;
	-- the RESULTS file carries the read-only SELECT that lists those. Nothing
	-- here repairs one.
	select count(*) into v_html from public.classroom_html_assignments;
	select count(*) into v_versioned from public.classroom_items where assignment_schema_version = 3;
	raise notice '0295: % HTML documents, % items marked as HTML assignments.', v_html, v_versioned;
end
$z$;
