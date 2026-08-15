-- 0108_classroom_rich_body.sql
-- An item body is a RICH DOCUMENT now: headings, bulleted and numbered lists,
-- bold, italic and links. The instructions field was a plain textarea, so a
-- teacher pasting a bulleted list out of a document got the words and lost the
-- list, and assignment instructions that run several paragraphs were being
-- written three visible lines at a time.
--
-- Apply manually in the Supabase SQL editor, after 0107.
--
-- ===========================================================================
-- TWO COLUMNS, AND WHY `body` STAYS
-- ===========================================================================
--
-- `body_doc` (jsonb) is the authored document. `body` (text) stays exactly
-- where it was, as its PLAIN-TEXT PROJECTION, because it has real readers that
-- have nothing to do with rendering:
--
--   * `_classroom_check_item_fields` requires an announcement to have one and
--     caps every body at 20,000 characters;
--   * an announcement with no title takes its headline from the body's first
--     line (classroom.ts `itemTitle`);
--   * the home feed and every future search read text, not a document tree.
--
-- Replacing the column would have meant rewriting all of that at once. Keeping
-- it also makes this migration safe to deploy in EITHER ORDER: a client that
-- has not been taught about `body_doc` still reads a faithful plain-text body,
-- and a client that has falls back to converting it (classroom-doc.ts
-- `itemBodyDoc`). Nothing already authored is lost or mangled in any
-- combination.
--
-- THE TWO CANNOT DISAGREE, and that is enforced HERE rather than trusted from
-- a caller: when a document is supplied the text column is DERIVED from it by
-- `_classroom_doc_text` and whatever `p_body` said is ignored. When one is not
-- (a pre-0108 client), the document is derived from the text instead. There is
-- no payload in which the rich version says one thing and the text version
-- another.
--
-- ===========================================================================
-- THE SANITIZATION BOUNDARY
-- ===========================================================================
--
-- `src/lib/server/classroom-doc.ts` is the normalizer: it translates the
-- editor's arbitrary ProseMirror JSON into the closed shape by BUILDING the
-- result from the node types it knows, so a type it does not name cannot
-- appear in the output. It runs in /api/classroom/item, server-side, under
-- $lib/server -- there is no build in which the browser's copy is the one
-- enforcing anything.
--
-- BUT THESE TWO RPCs ARE GRANTED TO `authenticated` AND REACHABLE STRAIGHT
-- THROUGH PostgREST, so a caller can skip that route entirely. Hence
-- `_classroom_doc_ok` below: a strict structural gate that REFUSES a document
-- outside the closed shape -- an unknown block type, an unknown key, a run
-- that is not text, a `javascript:` href. It is the boundary; the normalizer
-- is the thing that makes a real paste survive.
--
-- The third gate is the renderer (ItemBody.svelte), which walks the stored
-- document into real Svelte elements with no `{@html}` anywhere and re-checks
-- every href as it goes. So a document that reached this table by some other
-- door still cannot execute anything; it can only be text.
--
-- ===========================================================================
-- DEPLOY ORDERING
-- ===========================================================================
--
-- Both RPCs gain a parameter, which changes their REAL signature, so the old
-- arities are DROPPED first -- `create or replace` alone would leave them
-- callable as second overloads, and two overloads differing only by a
-- defaulted trailing parameter make PostgREST unable to resolve the call AT
-- ALL (the 0058 / 0068 / 0096 trap). APPLY THIS BEFORE DEPLOYING a client that
-- names `p_body_doc`. The route degrades on its own if you do it the other way
-- round (it retries without the parameter and saves plain text), but the
-- ordering above is the one that never loses formatting.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.classroom_items
	add column if not exists body_doc jsonb;

-- ---------------------------------------------------------------------------
-- 2. The link-scheme check, mirroring $lib/rich-text `safeHref` exactly
-- ---------------------------------------------------------------------------

-- A typed document cannot express a script tag or an event handler, so an href
-- is the ONLY place hostile input has anywhere to go. http/https/mailto only,
-- and no control character -- which is what stops `java\nscript:` slipping
-- past a prefix test.
create or replace function public._classroom_safe_href(p_href text)
returns boolean
language sql
immutable
set search_path = ''
as $$
	select p_href is not null
		and btrim(p_href) <> ''
		and (
			lower(btrim(p_href)) like 'http://%'
			or lower(btrim(p_href)) like 'https://%'
			or lower(btrim(p_href)) like 'mailto:%'
		)
		-- Any character at or below space, or DEL. The pattern is BUILT with
		-- chr() rather than written as a literal class: a control character
		-- typed straight into this file is invisible in every diff and every
		-- code review that will ever look at it, and a NUL cannot live in a
		-- Postgres text literal at all.
		and btrim(p_href) !~ ('[' || chr(1) || '-' || chr(32) || chr(127) || ']');
$$;

revoke all on function public._classroom_safe_href(text) from public;

-- ---------------------------------------------------------------------------
-- 3. The structural gate
-- ---------------------------------------------------------------------------

-- Is this a document in the closed shape, exactly?
--
-- Needs NO recursion and no depth limit, which is the quiet advantage of
-- validating the STORED shape rather than the editor's: a document is an array
-- of blocks, a block holds runs (or a list of run lists), and a run is flat.
-- Anything deeper is by definition not this shape.
--
-- Every object is checked for UNKNOWN KEYS as well as for the ones it must
-- have. A gate that only checks what it expects lets everything it did not
-- think of ride along in the same object.
--
-- EVERY TYPE CHECK IS `is distinct from`, NEVER `<>`. `jsonb_typeof(x)` is
-- SQL NULL for an ABSENT key, and `NULL <> 'string'` is NULL rather than true,
-- so a plain `<>` guard falls straight through for exactly the input it exists
-- to catch. Written with `<>` first here, and a run carrying no `text` key at
-- all was accepted -- the same trap 0097 hit, caught this time by the test.
create or replace function public._classroom_doc_ok(p_doc jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_block jsonb;
	v_item jsonb;
	v_run jsonb;
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
			if jsonb_typeof(v_block->'items') is distinct from 'array' then
				return false;
			end if;
			if jsonb_array_length(v_block->'items') > 2000 then
				return false;
			end if;
			for v_item in select value from jsonb_array_elements(v_block->'items') loop
				if jsonb_typeof(v_item) is distinct from 'array' then
					return false;
				end if;
				if not public._classroom_runs_ok(v_item) then
					return false;
				end if;
			end loop;
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

-- One run list. Split out because both branches above need it, and a second
-- copy of "what may a run contain" is how the two would drift.
create or replace function public._classroom_runs_ok(p_runs jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_run jsonb;
	v_key text;
begin
	if jsonb_typeof(p_runs) is distinct from 'array' then
		return false;
	end if;
	if jsonb_array_length(p_runs) > 2000 then
		return false;
	end if;
	for v_run in select value from jsonb_array_elements(p_runs) loop
		if jsonb_typeof(v_run) is distinct from 'object' then
			return false;
		end if;
		for v_key in select k from jsonb_object_keys(v_run) as k loop
			if v_key not in ('text', 'bold', 'italic', 'href') then
				return false;
			end if;
		end loop;
		if jsonb_typeof(v_run->'text') is distinct from 'string' then
			return false;
		end if;
		-- The flags are absent-means-off, so the only legal value is true.
		if v_run ? 'bold' and v_run->'bold' <> 'true'::jsonb then
			return false;
		end if;
		if v_run ? 'italic' and v_run->'italic' <> 'true'::jsonb then
			return false;
		end if;
		if v_run ? 'href' then
			if jsonb_typeof(v_run->'href') is distinct from 'string' then
				return false;
			end if;
			if not public._classroom_safe_href(v_run->>'href') then
				return false;
			end if;
		end if;
	end loop;
	return true;
end;
$$;

revoke all on function public._classroom_runs_ok(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 4. The two projections between text and document
-- ---------------------------------------------------------------------------

-- Document -> plain text: one line per block or list item. Mirrors
-- classroom-doc.ts `docText`; this is the authority, and it is what lands in
-- `classroom_items.body`.
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
				when b.value->>'type' in ('ul', 'ol') then (
					select string_agg(
						(select coalesce(string_agg(r.value->>'text', '' order by r.ord), '')
						 from jsonb_array_elements(i.value) with ordinality as r(value, ord)),
						e'\n' order by i.ord)
					from jsonb_array_elements(b.value->'items') with ordinality as i(value, ord)
				)
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

-- Plain text -> document. Mirrors classroom-doc.ts `docFromPlainText`.
--
-- Blank lines separate paragraphs, which is exactly how the old textarea
-- rendered (`white-space: pre-wrap` in the stream, one `<p>` on the item page),
-- so a body written before this migration comes out reading the way it always
-- did rather than collapsing into one wall of text. A single newline inside a
-- paragraph becomes a space: the shape has no hard break, and inventing one to
-- preserve a soft wrap would be a formatting change nobody asked for.
create or replace function public._classroom_doc_from_text(p_text text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
	select coalesce(
		jsonb_agg(
			jsonb_build_object('type', 'p', 'runs', jsonb_build_array(
				jsonb_build_object('text', para)
			))
			order by ord
		),
		'[]'::jsonb
	)
	from (
		select btrim(regexp_replace(p.value, '\s*\n\s*', ' ', 'g')) as para, p.ord
		from regexp_split_to_table(
			btrim(replace(replace(coalesce(p_text, ''), e'\r\n', e'\n'), e'\r', e'\n')),
			'\n[ \t]*\n+'
		) with ordinality as p(value, ord)
	) paras
	where para <> '';
$$;

revoke all on function public._classroom_doc_from_text(text) from public;

-- ---------------------------------------------------------------------------
-- 5. Backfill
-- ---------------------------------------------------------------------------

-- Every item authored before rich text existed gets the document its plain
-- text always meant. `where body_doc is null` so re-applying this file never
-- clobbers something since authored -- migrations here are pasted in by hand,
-- so a re-run is ordinary (0088's lesson, learned in the field).
do $$
declare
	v_count integer;
begin
	update public.classroom_items
	set body_doc = public._classroom_doc_from_text(body)
	where body_doc is null;
	get diagnostics v_count = row_count;
	raise notice '0108: backfilled body_doc on % item(s) from their plain text.', v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. classroom_create_item, re-signed
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean);

create or replace function public.classroom_create_item(
	p_kind text,
	p_section_ids uuid[],
	p_title text default null,
	p_body text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default true,
	p_resources jsonb default '[]'::jsonb,
	p_pinned boolean default false,
	p_body_doc jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_kind text := lower(btrim(coalesce(p_kind, '')));
	v_sections uuid[];
	v_section uuid;
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_published boolean := coalesce(p_published, true);
	v_doc jsonb;
	v_body text;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	-- The gate. A document outside the closed shape is refused outright rather
	-- than stripped, so a caller reaching this function straight through
	-- PostgREST cannot store markup, an unknown node, or an unsafe link.
	if not public._classroom_doc_ok(p_body_doc) then
		raise exception 'That body could not be read.';
	end if;

	-- A supplied document is the authority and the text column is derived from
	-- it; with none, the document is derived from the text. Either way the two
	-- agree by construction.
	if p_body_doc is null or p_body_doc = 'null'::jsonb then
		v_body := coalesce(p_body, '');
		v_doc := public._classroom_doc_from_text(v_body);
	else
		v_doc := p_body_doc;
		v_body := public._classroom_doc_text(v_doc);
	end if;

	perform public._classroom_check_item_fields(
		v_kind, v_title, v_body, p_points, p_due_at, v_category);

	v_sections := public._classroom_check_publish_targets(p_section_ids);

	insert into public.classroom_items
		(kind, title, body, body_doc, points, due_at, category, author_email, author_name,
			published, pinned, first_published_at)
	values (v_kind, v_title, v_body, v_doc, p_points, p_due_at, v_category,
		public.current_user_email(), public._classroom_author_name(),
		v_published, coalesce(p_pinned, false),
		case when v_published then now() end)
	returning id into v_id;

	foreach v_section in array v_sections loop
		insert into public.classroom_postings (item_id, section_id)
		values (v_id, v_section);
	end loop;

	perform public._classroom_write_resources(v_id, p_resources);

	return jsonb_build_object(
		'item_id', v_id,
		'section_ids', to_jsonb(v_sections),
		'published', v_published
	);
end;
$$;

revoke all on function public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb) from public;
grant execute on function public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. classroom_update_item, re-signed
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb);

create or replace function public.classroom_update_item(
	p_id uuid,
	p_title text default null,
	p_body text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default null,
	p_resources jsonb default null,
	p_body_doc jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.classroom_items%rowtype;
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_published boolean;
	v_links_changed boolean;
	v_changed boolean;
	v_touched boolean;
	v_edited timestamptz;
	v_doc jsonb;
	v_body text;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	if not public._classroom_doc_ok(p_body_doc) then
		raise exception 'That body could not be read.';
	end if;

	select i.* into v_old from public.classroom_items i where i.id = p_id for update;
	if not found then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_id) then
		raise exception 'Only the teacher of record for every class this is posted to can edit it.';
	end if;

	if p_body_doc is null or p_body_doc = 'null'::jsonb then
		v_body := coalesce(p_body, '');
		v_doc := public._classroom_doc_from_text(v_body);
	else
		v_doc := p_body_doc;
		v_body := public._classroom_doc_text(v_doc);
	end if;

	perform public._classroom_check_item_fields(
		v_old.kind, v_title, v_body, p_points, p_due_at, v_category);

	v_published := coalesce(p_published, v_old.published);

	v_links_changed := public._classroom_resources_changed(p_id, p_resources);

	-- 0104's rule, extended by exactly one term. The DOCUMENT is compared as
	-- well as the text, because a formatting-only edit -- bolding a step,
	-- turning three lines into a numbered list -- changes nothing about the
	-- plain-text projection and is still a change a student can see. Comparing
	-- only `body` would silently stop stamping `edited_at` for precisely the
	-- edits this migration exists to make possible.
	--
	-- Everything else is unchanged: publishing a draft is still not an edit,
	-- and neither is a pin or a reorder.
	v_changed :=
		coalesce(v_title, '') is distinct from coalesce(v_old.title, '')
		or v_body is distinct from v_old.body
		or v_doc is distinct from coalesce(v_old.body_doc, public._classroom_doc_from_text(v_old.body))
		or p_points is distinct from v_old.points
		or p_due_at is distinct from v_old.due_at
		or coalesce(v_category, '') is distinct from coalesce(v_old.category, '')
		or v_links_changed;

	v_touched := v_changed or v_published is distinct from v_old.published;

	v_edited := case
		when v_changed and v_old.first_published_at is not null then now()
		else v_old.edited_at
	end;

	update public.classroom_items
	set title = v_title,
		body = v_body,
		body_doc = v_doc,
		points = p_points,
		due_at = p_due_at,
		category = v_category,
		published = v_published,
		first_published_at = coalesce(v_old.first_published_at, case when v_published then now() end),
		edited_at = v_edited,
		updated_at = case when v_touched then now() else v_old.updated_at end
	where id = p_id;

	if v_links_changed then
		perform public._classroom_write_resources(p_id, p_resources);
	end if;

	return jsonb_build_object('item_id', p_id, 'published', v_published, 'edited', v_changed);
end;
$$;

revoke all on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb) from public;
grant execute on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Duplicate carries the document too
-- ---------------------------------------------------------------------------

-- 0090 recreated this to carry instructor materials; 0101 to carry a deck by
-- reference. It copies the authored columns BY NAME, so `body_doc` has to join
-- the list -- otherwise a duplicated item silently loses its formatting and
-- comes back as one flat paragraph, which looks like the copy worked.
--
-- 0101's body verbatim with that one column added; the signature is unchanged,
-- so `create or replace` is all this needs.
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
		(item_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by, sort_order)
	select v_id, t.drive_file_id, t.filename, t.mime_type, t.size_bytes,
		public.current_user_email(), t.sort_order
	from public.classroom_attachments t where t.item_id = p_item_id;

	insert into public.classroom_instructor_resources (item_id, label, url, sort_order)
	select v_id, r.label, r.url, r.sort_order
	from public.classroom_instructor_resources r where r.item_id = p_item_id;

	insert into public.classroom_instructor_attachments
		(item_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by, sort_order)
	select v_id, t.drive_file_id, t.filename, t.mime_type, t.size_bytes,
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

	return jsonb_build_object('ok', true, 'item_id', v_id, 'source_item_id', p_item_id);
end;
$$;

revoke all on function public.classroom_duplicate_item(uuid, uuid[]) from public;
grant execute on function public.classroom_duplicate_item(uuid, uuid[]) to authenticated;
