-- 0176_classroom_item_images.sql
--
-- Widen the CLASSROOM item-body gate to accept a picture, and NOTHING else.
-- No table, no column, no data, no grant that did not already exist: four new
-- private helpers, one gate re-signed into a pair, and the two item write RPCs
-- recreated so they ask the wider question. The notebook's guidance documents,
-- which share this gate, are deliberately left exactly where they were.
--
-- ===========================================================================
-- WHY THERE IS NO COLUMN IN HERE, WHICH IS THE FIRST THING TO CHECK
-- ===========================================================================
--
-- The feature this unlocks is a THUMBNAIL on a home-feed card, and the obvious
-- shape for it is a projected `cover_attachment_id` -- a column, a backfill, a
-- widened payload, a definer-side resolution of the alias. None of that is
-- here, because the read the home feed already makes carries both halves:
-- `ITEM_SELECT` has embedded
-- `classroom_attachments(id, filename, mime_type, size_bytes, sort_order)` and
-- `selectItemsWithDoc`'s three widest rungs carry `body_doc`. So the cover is a
-- pure function of rows already in memory (`feedCover` in
-- src/lib/classroom/feed.ts) and thirty cards cost thirty array lookups rather
-- than thirty signed URLs.
--
-- A STORED COVER WOULD ALSO BE A SECOND COPY OF "WHICH PICTURE LEADS", which is
-- the kind that stops matching: an author reorders the body, the column still
-- names yesterday's image, and nothing anywhere reports it.
--
-- ===========================================================================
-- THE STORED SHAPE
-- ===========================================================================
--
--     block := { type: 'img', src, alt }
--
-- and that is the whole of it. `src` is an AUTHORED REFERENCE, never a URL and
-- never an id: `attachment:<filename>`, resolved at RENDER time against the
-- item's own attachments, or an absolute path under the static prefix list.
-- The reasoning is `resolveFigureSrc`'s own and predates this file -- a spec is
-- authored before the item exists, has to survive the file being re-uploaded
-- under a new id, and has to still mean something in the exported copy under
-- `materials/` -- and it is why there is no second image vocabulary anywhere in
-- this codebase. A signed URL would additionally EXPIRE, and a stored body must
-- not.
--
-- `alt` IS REQUIRED AND HAS NO EMPTY FORM. This is a school; a student using a
-- screen reader is not a hypothetical. The requirement is in the TypeScript
-- type, in the editor's insert control, in the normalizer (which REFUSES the
-- save rather than dropping the image, so the person who left it blank finds
-- out) and here, so a direct PostgREST call on the RPC cannot store one either.
-- Emptiness is measured with the `^\s+|\s+$` normalization 0126 and 0130 use
-- and NOT with `btrim`: `btrim` strips spaces only, so a description of one
-- newline would pass a `btrim`-spelled gate and be empty to everybody who looks
-- at it, which is precisely the thing the gate exists to refuse.
--
-- WHAT IT DELIBERATELY DOES NOT CARRY: intrinsic dimensions (not knowable from
-- a reference that is resolved later, so a stored width is a claim that goes
-- quietly wrong) and a caption (the description IS the caption, exactly as it
-- is for a markdown figure, where one authored string is both).
--
-- ===========================================================================
-- WHY THE GATE BECOMES A PAIR AND NOT A WIDER SINGLE FUNCTION
-- ===========================================================================
--
-- `_classroom_doc_ok` reads as classroom-only and is not. 0123 pointed
-- `notebook_sessions.guidance_doc` at it deliberately -- one statement of "what
-- may a document contain", never a per-subsystem clone -- and that decision is
-- right and is not being undone here. But a NOTE'S GUIDANCE HAS NO PICTURES:
-- `CheckInGuidance` cannot render one, the notebook's normalizer supplies no
-- hook that could emit one, and widening the shared gate would mean a guidance
-- document could reach the table carrying a block its renderer walks straight
-- past. A stored body its own renderer cannot draw is the exact defect this
-- bundle exists to prevent one layer up.
--
-- So the rule stays in ONE function and gains a PARAMETER:
--
--   _classroom_doc_ok(jsonb, boolean)  -- the rule. No defaults, ever.
--   _classroom_doc_ok(jsonb)           -- a thin wrapper: (p_doc, false).
--
-- THE WIDE FORM CARRIES NO DEFAULT, and that is what makes the pair
-- unambiguous under any resolution rule rather than under a particular one:
-- the smallest call the wide form accepts is strictly larger than the largest
-- the narrow one accepts, so no payload can bind to both. It is the
-- keep-both-arities shape from CLAUDE.md's signature trap, and it is used here
-- for its OTHER property as well -- every existing caller
-- (`notebook_set_session_guidance`, and any client or migration naming the
-- one-argument form) keeps working with no edit at all, so this file has no
-- deploy ordering: it may be applied before or after the code that uses it.
--
-- DO NOT "SIMPLIFY" THIS BY ADDING A DEFAULT TO THE WIDE FORM. Two overloads
-- differing only by a defaulted trailing parameter is the 0058/0068/0096 trap,
-- and Postgres refuses to remove a default through `create or replace`, so the
-- wide form is dropped at its OWN exact signature first and this file stays
-- re-appliable over a machine that took an earlier draft.
--
-- ===========================================================================
-- WHY THE SRC PREDICATE IS MIRRORED HERE RATHER THAN SHARED
-- ===========================================================================
--
-- `_classroom_figure_src_ok` is the SQL twin of what `resolveFigureSrc`
-- (src/lib/classroom/classroom.ts) answers when it is asked with NO
-- attachments -- the same relationship `_classroom_safe_href` has to
-- `safeHref` and `_classroom_doc_text` has to `docText`. The database cannot
-- call TypeScript, so a mirror is the only available shape; what keeps a
-- mirror honest is a test that puts both to ONE corpus, which
-- tests/db/classroom-item-image-gate.test.ts does.
--
-- IT IS DELIBERATELY THE STRUCTURAL HALF ONLY. Whether the named file is
-- attached RIGHT NOW is a render-time question and must not be a storage one:
-- an author writes a reference before an upload finishes, a file is re-uploaded
-- under the same name, and an attachment removed next term must not
-- retroactively make a stored body unsavable. So an unresolvable alias is
-- STORABLE and renders as its description plus a visible marker, which is the
-- same degradation a typo already produces.
--
-- SVG IS REFUSED FROM EVERY SOURCE, by name here and by name AND stored mime in
-- the renderer. An SVG is a document, not a picture: it carries script,
-- external references and event handlers, and a same-origin one is the one
-- image format where being on our own domain makes it worse.
--
-- ===========================================================================
-- WHAT UNDOES THIS
-- ===========================================================================
--
-- Re-paste the `_classroom_doc_ok` block from 0122 (which restores the
-- one-argument form as the rule rather than a wrapper), then
-- `drop function if exists public._classroom_doc_ok(jsonb, boolean);` and the
-- three image helpers, then re-paste the `classroom_create_item` block from
-- 0109 and the `classroom_update_item` block from 0110. Nothing else has to be
-- touched: no column changed, no row was written, and a stored body containing
-- an image would simply become one the gate refuses on its NEXT save -- so run
-- the count in section 6 before undoing, and be told how many exist.
--
-- Do NOT undo it by re-applying 0122, 0109 or 0110 whole: each carries other
-- definitions that later migrations have replaced.
--
-- Apply manually in the Supabase SQL editor, after 0175. Re-applying it is
-- ordinary and does nothing the first application did not.

-- ---------------------------------------------------------------------------
-- 1. The authored reference: is it something an `img` could ever be given?
-- ---------------------------------------------------------------------------

-- The static path prefixes an authored image may sit under.
--
-- ONE ROW PER PREFIX AND A FUNCTION RATHER THAN A LITERAL, so the list is
-- greppable on this side exactly as `FIGURE_STATIC_PREFIXES` is on the other,
-- and so the test that pins the two against each other has something to read.
create or replace function public._classroom_figure_prefixes()
returns text[]
language sql
immutable
set search_path = ''
as $$
	select array['/IDEA/']::text[];
$$;

revoke all on function public._classroom_figure_prefixes() from public, anon, authenticated;

-- The mirror of `resolveFigureSrc(src, [])`: true where that function answers
-- `ok` or `unresolved`, false for every structural refusal it names.
--
-- THE ORDER OF THE TESTS IS THE ORDER `resolveFigureSrc` MAKES THEM, and it is
-- load-bearing in two places. `attachment:` is checked FIRST because it is
-- itself a scheme and the scheme test below would otherwise refuse the one form
-- this feature exists to support; `//host/x.png` is checked BEFORE the scheme
-- test because it carries no scheme at all and would sail past it, then fail
-- the leading-slash test for the wrong reason.
create or replace function public._classroom_figure_src_ok(p_src text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_src text := regexp_replace(coalesce(p_src, ''), '^\s+|\s+$', '', 'g');
	v_name text;
	v_path text;
	v_prefix text;
begin
	if v_src = '' then
		return false;
	end if;

	if lower(v_src) like 'attachment:%' then
		v_name := regexp_replace(substr(v_src, 12), '^\s+|\s+$', '', 'g');
		if v_name = '' then
			return false;
		end if;
		-- SVG by NAME. The stored mime is the other spelling and is checked at
		-- render time, on the row, which is the half an author cannot see.
		if v_name ~* '\.svgz?$' then
			return false;
		end if;
		return true;
	end if;

	-- Protocol-relative, before the scheme test. See the header.
	if v_src like '//%' then
		return false;
	end if;
	-- Any scheme at all: http, https, data, javascript, file, vbscript.
	if v_src ~* '^[a-z][a-z0-9+.-]*:' then
		return false;
	end if;
	if v_src not like '/%' then
		return false;
	end if;
	-- Traversal, plain and percent-encoded, and the Windows separator. A prefix
	-- test alone would accept `/IDEA/../../anything`.
	-- `chr(92)` and `strpos`, NOT `like '%\%'`: backslash is LIKE's own escape
	-- character, so that pattern means "contains a literal percent sign" and
	-- would refuse a perfectly ordinary percent-encoded name while letting a
	-- backslash straight through. The same reason `strpos` is used for the
	-- prefix test below rather than `like v_prefix || '%'`.
	if v_src like '%..%' or v_src ~* '%2e' or strpos(v_src, chr(92)) > 0 then
		return false;
	end if;

	-- The extension is read off the path with any query and fragment removed,
	-- so `/IDEA/x.svg?a=.png` cannot walk past the check.
	v_path := split_part(split_part(v_src, '#', 1), '?', 1);
	if v_path ~* '\.svgz?$' then
		return false;
	end if;

	foreach v_prefix in array public._classroom_figure_prefixes() loop
		if strpos(v_src, v_prefix) = 1 then
			return true;
		end if;
	end loop;
	return false;
end;
$$;

revoke all on function public._classroom_figure_src_ok(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. One image block
-- ---------------------------------------------------------------------------

-- Exactly three keys, both values strings, the description non-empty after the
-- normalizing trim, and the reference one an `img` could be given.
create or replace function public._classroom_img_ok(p_block jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_key text;
begin
	if jsonb_typeof(p_block) is distinct from 'object' then
		return false;
	end if;
	for v_key in select k from jsonb_object_keys(p_block) as k loop
		if v_key not in ('type', 'src', 'alt') then
			return false;
		end if;
	end loop;
	-- EVERY TYPE CHECK IS `is distinct from`, NEVER `<>`, for the reason 0108's
	-- header gives: `jsonb_typeof(absent) <> 'string'` is NULL, not true, so the
	-- guard falls through, the NULL propagates out as the function's answer, and
	-- every caller's `if not <gate> then raise` does NOT fire on NULL -- which
	-- does not merely skip a check, it ACCEPTS the write.
	if jsonb_typeof(p_block->'src') is distinct from 'string' then
		return false;
	end if;
	if jsonb_typeof(p_block->'alt') is distinct from 'string' then
		return false;
	end if;
	if regexp_replace(p_block->>'alt', '^\s+|\s+$', '', 'g') = '' then
		return false;
	end if;
	return public._classroom_figure_src_ok(p_block->>'src');
end;
$$;

revoke all on function public._classroom_img_ok(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The document gate, as a pair
-- ---------------------------------------------------------------------------

-- Dropped at its OWN exact signature first, so re-applying this file over a
-- machine that took an earlier draft cannot fail on "cannot change the default
-- of an existing parameter".
drop function if exists public._classroom_doc_ok(jsonb, boolean);

-- THE RULE. 0122's body, verbatim, with two additions and nothing else: `img`
-- joins the type list only when the caller asked for it, and it takes the
-- image arm instead of the runs arm.
create or replace function public._classroom_doc_ok(p_doc jsonb, p_allow_image boolean)
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
	v_allow boolean := coalesce(p_allow_image, false);
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
		if v_type is null then
			return false;
		end if;
		-- `img` IS NOT IN THE LIST WHEN THE CALLER DID NOT ASK FOR IT, so a
		-- guidance document carrying one is refused by the unknown-block-type
		-- arm below exactly as it was before this file existed.
		if v_type not in ('p', 'h3', 'h4', 'ul', 'ol') and not (v_allow and v_type = 'img') then
			return false;
		end if;

		if v_type = 'img' then
			if not public._classroom_img_ok(v_block) then
				return false;
			end if;
		elsif v_type in ('ul', 'ol') then
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

revoke all on function public._classroom_doc_ok(jsonb, boolean) from public, anon, authenticated;

-- THE WRAPPER. Same name, same signature, same OID-visible identity as the
-- function 0123's `notebook_set_session_guidance` calls and every earlier
-- migration named -- so nothing that already resolves this by name has to
-- change, and this file needs no deploy ordering of any kind.
--
-- IT DELEGATES RATHER THAN RESTATING, so there is still exactly one copy of
-- "what may a document contain". A second body here is the thing that stops
-- matching the first.
create or replace function public._classroom_doc_ok(p_doc jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
	select public._classroom_doc_ok(p_doc, false);
$$;

revoke all on function public._classroom_doc_ok(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The two item write RPCs, asking the wider question
--
-- Each is its latest shipped body -- 0109's create, 0110's update -- with the
-- single gate call changed and NOTHING else. Every signature is identical to
-- the one it replaces, so `create or replace` is all either needs and no second
-- overload can exist.
-- ---------------------------------------------------------------------------

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
	p_body_doc jsonb default null,
	p_publish_at timestamptz default null
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

	-- 0176: an item body may hold a picture. The refusal text is unchanged,
	-- because it is what a client already displays and what a student already
	-- reads; naming the image case here would mean a second sentence for the
	-- same outcome, and the browser-side normalizer already says which image
	-- and why before a request is ever made.
	if not public._classroom_doc_ok(p_body_doc, true) then
		raise exception 'That body could not be read.';
	end if;

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
			published, pinned, publish_at, first_published_at)
	values (v_kind, v_title, v_body, v_doc, p_points, p_due_at, v_category,
		public.current_user_email(), public._classroom_author_name(),
		v_published, coalesce(p_pinned, false), p_publish_at,
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
		'published', v_published,
		'live', public._classroom_item_live(v_published, p_publish_at)
	);
end;
$$;

revoke all on function public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb,
	timestamptz) from public;
grant execute on function public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb,
	timestamptz) to authenticated;

create or replace function public.classroom_update_item(
	p_id uuid,
	p_title text default null,
	p_body text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default null,
	p_resources jsonb default null,
	p_body_doc jsonb default null,
	p_publish_at timestamptz default null
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
	v_was_live boolean;
	v_doc jsonb;
	v_body text;
	v_revision integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	-- 0176, the same one-term change the create path takes.
	if not public._classroom_doc_ok(p_body_doc, true) then
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

	v_changed :=
		coalesce(v_title, '') is distinct from coalesce(v_old.title, '')
		or v_body is distinct from v_old.body
		or v_doc is distinct from coalesce(v_old.body_doc, public._classroom_doc_from_text(v_old.body))
		or p_points is distinct from v_old.points
		or p_due_at is distinct from v_old.due_at
		or coalesce(v_category, '') is distinct from coalesce(v_old.category, '')
		or v_links_changed;

	v_touched :=
		v_changed
		or v_published is distinct from v_old.published
		or p_publish_at is distinct from v_old.publish_at;

	v_was_live := public._classroom_item_live(v_old.published, v_old.publish_at);

	v_edited := case
		when v_changed and v_old.first_published_at is not null and v_was_live then now()
		else v_old.edited_at
	end;

	if v_changed then
		v_revision := public._classroom_snapshot_content(
			p_id, 'item', public._classroom_item_payload(v_old));
	end if;

	update public.classroom_items
	set title = v_title,
		body = v_body,
		body_doc = v_doc,
		points = p_points,
		due_at = p_due_at,
		category = v_category,
		published = v_published,
		publish_at = p_publish_at,
		first_published_at = coalesce(v_old.first_published_at, case when v_published then now() end),
		edited_at = v_edited,
		updated_at = case when v_touched then now() else v_old.updated_at end
	where id = p_id;

	if v_links_changed then
		perform public._classroom_write_resources(p_id, p_resources);
	end if;

	return jsonb_build_object(
		'item_id', p_id,
		'published', v_published,
		'edited', v_changed,
		'revision', v_revision,
		'live', public._classroom_item_live(v_published, p_publish_at)
	);
end;
$$;

revoke all on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz) from public;
grant execute on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The self-check: the pair is unambiguous, and it really is a pair
-- ---------------------------------------------------------------------------

-- A COUNT OF TWO PASSES ON EXACTLY THE ARRANGEMENT THAT BREAKS EVERY CALL, so
-- the structure is asserted rather than the number: both arities present, and
-- the WIDE one carrying no defaults at all.
do $$
declare
	v_narrow integer;
	v_wide integer;
	v_wide_defaults integer;
begin
	select count(*) into v_narrow
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = '_classroom_doc_ok' and p.pronargs = 1;
	select count(*), coalesce(max(p.pronargdefaults), 0) into v_wide, v_wide_defaults
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = '_classroom_doc_ok' and p.pronargs = 2;

	if v_narrow <> 1 or v_wide <> 1 then
		raise exception
			'0176: expected exactly one 1-arg and one 2-arg _classroom_doc_ok, found % and %.',
			v_narrow, v_wide;
	end if;
	if v_wide_defaults <> 0 then
		raise exception
			'0176: the 2-arg _classroom_doc_ok carries % default(s); it must carry none, or the two arities are ambiguous.',
			v_wide_defaults;
	end if;
	raise notice '0176: gate arities OK (1-arg wrapper, 2-arg rule, 0 defaults on the rule).';
end;
$$;

-- The behavioural half: the two forms must DISAGREE about an image and AGREE
-- about everything else, which is the whole claim this file makes.
do $$
declare
	v_img constant jsonb :=
		'[{"type":"img","src":"attachment:part.jpg","alt":"The bearing, exploded"}]'::jsonb;
	v_text constant jsonb := '[{"type":"p","runs":[{"text":"hello"}]}]'::jsonb;
begin
	if public._classroom_doc_ok(v_img) then
		raise exception '0176: the narrow gate accepted an image; the notebook contract has moved.';
	end if;
	if not public._classroom_doc_ok(v_img, true) then
		raise exception '0176: the wide gate refused a valid image.';
	end if;
	if public._classroom_doc_ok(v_img, false) then
		raise exception '0176: the wide gate accepted an image with the flag off.';
	end if;
	if not (public._classroom_doc_ok(v_text) and public._classroom_doc_ok(v_text, true)) then
		raise exception '0176: a plain paragraph stopped passing one of the two forms.';
	end if;
	-- The description is not optional, on any path.
	if public._classroom_doc_ok(
		'[{"type":"img","src":"attachment:part.jpg","alt":"   "}]'::jsonb, true) then
		raise exception '0176: an image with a blank description was accepted.';
	end if;
	-- Nor is the reference free.
	if public._classroom_doc_ok(
		'[{"type":"img","src":"https://evil.example/x.png","alt":"beacon"}]'::jsonb, true) then
		raise exception '0176: an off-site image reference was accepted.';
	end if;
	raise notice '0176: gate behaviour OK (narrow refuses an image, wide accepts one, both agree on text).';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. What the operator should see
-- ---------------------------------------------------------------------------

-- The one thing that can go wrong when a gate moves is that it REFUSES
-- something already stored, and that is silent: every existing row keeps
-- rendering and only the next save of it fails, mid-edit, in front of whoever
-- wrote it. This file only widens, so the count below must come out equal --
-- and it is taken as a BEHAVIOURAL PROBE against the real content in this
-- database rather than as a hand-written walk looking for a bad shape.
--
-- Both counts must be equal. If they are not, DO NOT DEPLOY: restore per the
-- header.
do $$
declare
	v_total bigint;
	v_ok bigint;
	v_img bigint;
	v_prefix text;
begin
	if exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_items' and column_name = 'body_doc'
	) then
		select count(*), count(*) filter (where public._classroom_doc_ok(body_doc, true))
			into v_total, v_ok
			from public.classroom_items;
		raise notice '0176: % of % stored item body_doc(s) accepted by the widened gate.', v_ok, v_total;

		-- How many bodies already hold a picture. Zero on first application, by
		-- construction: nothing could store one until this file ran.
		select count(*) into v_img
			from public.classroom_items
			where jsonb_typeof(body_doc) = 'array'
				and exists (
					select 1 from jsonb_array_elements(body_doc) b
					where b.value->>'type' = 'img'
				);
		raise notice '0176: % item body_doc(s) currently contain an image.', v_img;
	else
		raise notice '0176: classroom_items.body_doc is not in this database; body gate not exercised.';
	end if;

	-- The notebook side is untouched and this is what says so out loud, against
	-- the real column rather than against the intention.
	if exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'notebook_sessions'
			and column_name = 'guidance_doc'
	) then
		select count(*), count(*) filter (where public._classroom_doc_ok(guidance_doc))
			into v_total, v_ok
			from public.notebook_sessions;
		raise notice
			'0176: % of % stored guidance_doc(s) accepted by the UNCHANGED narrow gate.', v_ok, v_total;
	else
		raise notice '0176: notebook_sessions.guidance_doc is not in this database.';
	end if;

	-- The static prefix list, printed rather than assumed, so an operator can
	-- check it against FIGURE_STATIC_PREFIXES in src/lib/classroom/classroom.ts
	-- with their own eyes. A prefix added on one side and not the other is a
	-- body the editor accepts and the renderer refuses.
	foreach v_prefix in array public._classroom_figure_prefixes() loop
		raise notice '0176: static image prefix accepted: %', v_prefix;
	end loop;
end;
$$;
