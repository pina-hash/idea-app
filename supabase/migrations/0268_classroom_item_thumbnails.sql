-- 0268_classroom_item_thumbnails.sql
--
-- A VISUAL IDENTITY FOR EVERY POST (ledger 0396, report a6a037f3). Mr. Pina,
-- 2026-10-16: finding an assignment at a glance on a class page "is not
-- convenient at all ... with all this text and with no real visual separation
-- in between posts". A post carries a THUMBNAIL now, and the thumbnail is a
-- SLOT rather than a picture: the shape it is drawn in (off, tile, wide,
-- banner) is a display setting of the person looking, never a property of the
-- post, so nothing here stores a shape for a post.
--
-- WHAT A POST'S THUMBNAIL IS, ONE OF THREE SOURCES:
--   image  an uploaded or pasted picture (a key in `classroom-attachments`),
--          one of the post's own pictures (an attachment), or a picture the
--          post's HTML document names in its manifest
--   html   a live HTML thumbnail the HTML document declares in its manifest
--          (`thumbnail: { "kind": "html", "template": "<template id>" }`),
--          served by `/hx/<document id>/thumbnail` under the document's own
--          sandbox and CSP
--   none   the generated identity (the post's type glyph on a tile tinted by
--          its unit), which is also what NO ROW means
--
-- A SOURCE SET BY HAND IS `manual` AND ALWAYS BEATS THE MANIFEST. Uploading or
-- re-uploading an HTML document re-reads its manifest's thumbnail (the trigger
-- below) and writes it only onto a row that is not manual. Clearing a manual
-- thumbnail ("Automatic") deletes the hand-set row and re-reads the manifest.
--
-- WHY A TABLE BESIDE THE ITEM, NOT COLUMNS ON IT. `classroom_items` is written
-- by a dozen definer functions, copied by `classroom_duplicate_item`,
-- snapshotted by the revision chain and exported to the repository; a column
-- there joins every one of those paths. A one-to-one table keyed on the item is
-- read through ONE embed on the item select (a ladder rung of its own, so a
-- deployment without this file reads exactly as before) and written by the
-- functions in this file and nothing else.
--
-- THE MANIFEST GATE IS NOT WIDENED. 0195's `_classroom_check_html_manifest`
-- reads schemaVersion, kind, title, course, points, header and modules and
-- nothing else, so a manifest carrying `thumbnail` is ALREADY accepted and
-- stored verbatim by the deployed setter (tests/db/classroom-item-thumbnails
-- .test.ts proves it against 0195 before this file is applied). The meaning of
-- the key is decided by one reader, `_classroom_manifest_thumbnail`, which
-- answers null for anything it does not understand, so a malformed thumbnail
-- is a post with the generated identity, never a refused upload.
--
-- WHAT IT CREATES, all new (no existing object is redefined):
--   table    classroom_item_thumbnails      -- RLS on, read by item readers,
--                                              no client write grant
--   column   classroom_sections.thumbnail_shape -- a class's default shape
--   helper   _classroom_manifest_thumbnail(jsonb)  -- the one manifest reader
--   helper   _classroom_html_may_carry_template(text, text) -- whether a
--                                                     document can be carrying
--                                                     the template it names
--   helper   _classroom_thumbnail_sync(uuid)       -- the manifest onto a row
--                                                     that is not manual
--   trigger  classroom_html_assignment_thumbnail on classroom_html_assignments
--            (after insert, update or delete), function
--            _classroom_thumbnail_follow_document()
--   client   classroom_set_item_thumbnail(uuid, text, text, uuid, integer,
--                                         integer, real, real)
--            classroom_set_item_thumbnail_focus(uuid, real, real)
--            classroom_set_section_thumbnail_shape(uuid, text)
--
-- WHO. Every write asks the gate the item and the class already have:
-- `_classroom_manages_item` (the teacher of record for every class the post is
-- in, or an admin) for a post's thumbnail, `classroom_manages_section` for a
-- class's default. "Not found" and "not yours" are the same sentence.
--
-- A STORAGE KEY IS CHECKED TO NAME ITS OWN ITEM, the 0133 rule: the bucket's
-- policy answered a question about the object, and the row is a second
-- decision, so a key minted for one post cannot be hung off another.
--
-- REVERSAL (this file only; it rewrites no existing row):
--   drop trigger classroom_html_assignment_thumbnail on public.classroom_html_assignments;
--   drop function public._classroom_thumbnail_follow_document();
--   drop function public.classroom_set_item_thumbnail(uuid, text, text, uuid, integer, integer, real, real);
--   drop function public.classroom_set_item_thumbnail_focus(uuid, real, real);
--   drop function public.classroom_set_section_thumbnail_shape(uuid, text);
--   drop function public._classroom_thumbnail_sync(uuid);
--   drop function public._classroom_html_may_carry_template(text, text);
--   drop function public._classroom_manifest_thumbnail(jsonb);
--   drop table public.classroom_item_thumbnails;
--   alter table public.classroom_sections drop column thumbnail_shape;
-- Every hand-set thumbnail and every class default is lost with them; the
-- uploaded pictures stay in the bucket (nothing deletes them). The client reads
-- the table through its own ladder rung, so it renders the generated identity
-- for every post once the table is gone.

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_item_thumbnails (
	item_id uuid primary key references public.classroom_items (id) on delete cascade,
	source text not null default 'none',
	manual boolean not null default false,
	-- A hand-set picture, as a key in `classroom-attachments` under the item's
	-- own prefix (`<item_id>/<uuid>.<ext>`).
	image_key text,
	-- Or one of the post's own pictures. SET NULL rather than cascade: deleting
	-- the attachment must not be refused or take the row's focal point with it;
	-- a manual image with neither reference reads as the generated identity.
	attachment_id uuid references public.classroom_attachments (id) on delete set null,
	-- The picture's natural size, so every shape can crop it well.
	image_width integer,
	image_height integer,
	-- Where the picture's subject is, as fractions of its width and height,
	-- nudged by the teacher so one picture serves every shape.
	focal_x real not null default 0.5,
	focal_y real not null default 0.5,
	-- The serving handle of the HTML document a live thumbnail comes from.
	html_document_id uuid,
	-- The manifest's `interactive: true`: the thumbnail keeps its own clicks.
	interactive boolean not null default false,
	updated_at timestamptz not null default now(),
	updated_by text
);

do $z$
begin
	if not exists (select 1 from pg_constraint where conname = 'classroom_item_thumbnails_source_check'
		and conrelid = 'public.classroom_item_thumbnails'::regclass) then
		alter table public.classroom_item_thumbnails
			add constraint classroom_item_thumbnails_source_check
			check (source in ('image', 'html', 'none'));
	end if;
	if not exists (select 1 from pg_constraint where conname = 'classroom_item_thumbnails_html_is_manifest'
		and conrelid = 'public.classroom_item_thumbnails'::regclass) then
		-- A live HTML thumbnail only ever comes from the document's manifest.
		alter table public.classroom_item_thumbnails
			add constraint classroom_item_thumbnails_html_is_manifest
			check (source <> 'html' or (not manual and html_document_id is not null));
	end if;
	if not exists (select 1 from pg_constraint where conname = 'classroom_item_thumbnails_refs_are_manual'
		and conrelid = 'public.classroom_item_thumbnails'::regclass) then
		-- An automatic row names no hand-set picture; a hand-set row names at
		-- most one. (Not "exactly one": SET NULL above must be able to clear it.)
		alter table public.classroom_item_thumbnails
			add constraint classroom_item_thumbnails_refs_are_manual
			check (
				(manual or (image_key is null and attachment_id is null))
				and (image_key is null or attachment_id is null)
			);
	end if;
	if not exists (select 1 from pg_constraint where conname = 'classroom_item_thumbnails_shape_check'
		and conrelid = 'public.classroom_item_thumbnails'::regclass) then
		alter table public.classroom_item_thumbnails
			add constraint classroom_item_thumbnails_shape_check
			check (
				(image_key is null or char_length(image_key) <= 400)
				and (image_width is null or image_width between 1 and 20000)
				and (image_height is null or image_height between 1 and 20000)
				and focal_x between 0 and 1
				and focal_y between 0 and 1
			);
	end if;
end
$z$;

alter table public.classroom_item_thumbnails enable row level security;

-- A post's thumbnail is read by exactly who can read the post, through the
-- function every classroom policy delegates to (granted to `authenticated`,
-- which a function named in a policy must be).
drop policy if exists "classroom item thumbnails follow their item" on public.classroom_item_thumbnails;
create policy "classroom item thumbnails follow their item"
	on public.classroom_item_thumbnails
	for select
	to authenticated
	using (public.classroom_can_read_item(item_id));

-- The hosted default privileges hand a new table every privilege for both
-- client roles; take them all back by name and grant the one read.
revoke all on table public.classroom_item_thumbnails from public, anon, authenticated;
grant select on table public.classroom_item_thumbnails to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A class's default shape.
--
-- NULL is "the built-in default" (Tile), which is what every class has until a
-- teacher chooses. A person's own Display settings choice beats it.
-- ---------------------------------------------------------------------------

alter table public.classroom_sections
	add column if not exists thumbnail_shape text;

do $z$
begin
	if not exists (select 1 from pg_constraint where conname = 'classroom_sections_thumbnail_shape_check'
		and conrelid = 'public.classroom_sections'::regclass) then
		alter table public.classroom_sections
			add constraint classroom_sections_thumbnail_shape_check
			check (thumbnail_shape is null or thumbnail_shape in ('off', 'tile', 'wide', 'banner'));
	end if;
end
$z$;

-- ---------------------------------------------------------------------------
-- 3. The one manifest reader.
--
-- Answers what a manifest's `thumbnail` key MEANS, or null. The client's
-- `manifestThumbnail` in `src/lib/classroom/html-assignment/thumbnail.ts` is its
-- mirror and the db test puts both to one corpus:
--
--   { "kind": "html", "template": "<id>", "interactive": true? }
--       -> { "source": "html", "template": "<id>", "interactive": bool }
--          the id is a plain element id; only the literal true is interactive
--   { "kind": "image", "src": "attachment:<filename>" }  (a name of 1 to 300 characters)
--   { "kind": "image", "src": "data:image/(png|jpeg|gif|webp);base64,..." }
--       -> { "source": "image" }
--          never SVG (a document, not a picture), never a remote URL (an img
--          fetches on its own, carrying the reader's address), a data URI at
--          most 400000 characters
--   anything else, or no key -> null
-- ---------------------------------------------------------------------------

create or replace function public._classroom_manifest_thumbnail(p_manifest jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_t jsonb;
	v_src text;
begin
	if p_manifest is null or jsonb_typeof(p_manifest) is distinct from 'object' then
		return null;
	end if;
	v_t := p_manifest->'thumbnail';
	if v_t is null or jsonb_typeof(v_t) is distinct from 'object' then
		return null;
	end if;
	if v_t->>'kind' = 'html' then
		if jsonb_typeof(v_t->'template') is distinct from 'string'
			or (v_t->>'template') !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$' then
			return null;
		end if;
		return jsonb_build_object(
			'source', 'html',
			'template', v_t->>'template',
			'interactive', coalesce(v_t->'interactive' = 'true'::jsonb, false)
		);
	end if;
	if v_t->>'kind' = 'image' then
		if jsonb_typeof(v_t->'src') is distinct from 'string' then
			return null;
		end if;
		v_src := v_t->>'src';
		if v_src ~ '^attachment:.+$' and char_length(v_src) <= 311 and v_src !~* '\.svgz?$' then
			return jsonb_build_object('source', 'image');
		end if;
		if char_length(v_src) <= 400000
			and v_src ~ '^data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$' then
			return jsonb_build_object('source', 'image');
		end if;
		return null;
	end if;
	return null;
end;
$$;

revoke all on function public._classroom_manifest_thumbnail(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3b. Whether the document can be carrying the template its manifest names.
--
-- A LIVE THUMBNAIL IS RECORDED ONLY FOR A DOCUMENT THAT CAN SERVE ONE (review
-- of ledger 0396). `/hx/<document id>/thumbnail` answers its bodyless 404 when
-- the document does not carry the `<template>` the manifest names, so a row
-- promising a live thumbnail for such a document made every viewer of the
-- class page ask for it, log the 404 and wait two and a half seconds before
-- the slot gave up and showed the generated look. With this asked first, a
-- manifest naming a template the document lacks leaves NO automatic row, which
-- is the generated look at once, on every list, with no request.
--
-- IT ERRS TOWARDS YES, ON PURPOSE, AND THE DIRECTION IS THE WHOLE CONTRACT.
-- The exact reader is the client's `extractThumbnailTemplate` (a walk over the
-- tags that skips comments and raw-text elements and counts nested
-- templates), which the serving route runs on every request; a second copy of
-- that walk here is the copy that stops matching. So this answers a WIDER
-- question: is there a `<template` start tag anywhere, followed anywhere after
-- it by an `id` attribute whose value ends in the id. Each piece is a looser
-- spelling of the exact reader's own (any character that cannot continue a
-- name where it wants whitespace, anything but an angle bracket or an equals
-- sign where it wants spaces and a quote), so no whitespace or quoting the
-- exact reader takes is refused here. Every document the
-- exact reader serves passes it (tests/db/classroom-item-thumbnails.test.ts
-- puts both to one corpus and asserts that direction case for case), so a real
-- live thumbnail is never lost to it. What it lets through that the exact
-- reader refuses (a template written only inside a comment or a script
-- string, an empty one) keeps the route's own answer: the 404, then the
-- generated look.
--
-- The id is checked here against the same id rule
-- `_classroom_manifest_thumbnail` applies (a letter, then up to 63 letters,
-- digits, `-` and `_`), so it carries no regular-expression metacharacter
-- (`-` and `_` are literal outside a bracket expression). `~*`
-- because a tag name and an attribute name are case-insensitive in HTML, and
-- a case-insensitive id match only widens the answer.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_html_may_carry_template(p_document text, p_template text)
returns boolean
language sql
immutable
set search_path = ''
as $$
	select coalesce(
		p_template ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'
		and p_document ~* (
			'<template(?![A-Za-z0-9-]).*[^A-Za-z0-9_-]id[^=<>]*=[^<>=`]*'
			|| p_template
			|| '(?![A-Za-z0-9_-])'
		),
		false
	);
$$;

revoke all on function public._classroom_html_may_carry_template(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The manifest onto a row that is not manual.
--
-- ONE function for the trigger, the "Automatic" write and the backfill, so
-- the three cannot disagree about what a document's thumbnail is. A manifest
-- with no usable thumbnail leaves NO automatic row, which is the generated
-- identity; a manual row is never touched.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_thumbnail_sync(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_manifest jsonb;
	v_document uuid;
	v_html text;
	v_t jsonb;
begin
	select h.manifest, h.document_id, h.document into v_manifest, v_document, v_html
	from public.classroom_html_assignments h
	where h.item_id = p_item_id;

	v_t := public._classroom_manifest_thumbnail(v_manifest);
	-- A live thumbnail the document cannot be carrying is no thumbnail (3b):
	-- the generated look at once, rather than a 404 every viewer waits on.
	if v_t->>'source' = 'html'
		and not public._classroom_html_may_carry_template(v_html, v_t->>'template') then
		v_t := null;
	end if;
	if v_t is null then
		delete from public.classroom_item_thumbnails t
		where t.item_id = p_item_id and not t.manual;
		return;
	end if;

	insert into public.classroom_item_thumbnails as t
		(item_id, source, manual, html_document_id, interactive, updated_at, updated_by)
	values (
		p_item_id,
		v_t->>'source',
		false,
		case when v_t->>'source' = 'html' then v_document end,
		coalesce((v_t->>'interactive')::boolean, false),
		now(),
		nullif(public.current_user_email(), '')
	)
	on conflict (item_id) do update
		set source = excluded.source,
			html_document_id = excluded.html_document_id,
			interactive = excluded.interactive,
			-- A manifest picture replacing a hand-measured one: its size is
			-- unknown until the client loads it.
			image_width = null,
			image_height = null,
			updated_at = now(),
			updated_by = excluded.updated_by
		where not t.manual;
end;
$$;

revoke all on function public._classroom_thumbnail_sync(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Uploading, re-uploading, restoring or removing the HTML document re-reads
--    its manifest.
--
-- An AFTER trigger on the one table every document write lands in
-- (`classroom_set_html_assignment`, `classroom_restore_revision`, a duplicate),
-- so no upload path can forget it, and it runs in the same transaction as the
-- write. `updated_at` moves on every document write, which is what tells a
-- browser holding the old live thumbnail to fetch the new one.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_thumbnail_follow_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if tg_op = 'DELETE' then
		perform public._classroom_thumbnail_sync(old.item_id);
		return old;
	end if;
	perform public._classroom_thumbnail_sync(new.item_id);
	return new;
end;
$$;

revoke all on function public._classroom_thumbnail_follow_document() from public, anon, authenticated;

drop trigger if exists classroom_html_assignment_thumbnail on public.classroom_html_assignments;
create trigger classroom_html_assignment_thumbnail
	after insert or update or delete on public.classroom_html_assignments
	for each row execute function public._classroom_thumbnail_follow_document();

-- ---------------------------------------------------------------------------
-- 6. Setting a post's thumbnail by hand.
--
--   p_source 'image'  exactly one of p_image_key (an uploaded picture under
--                     this item's prefix) and p_attachment_id (one of this
--                     post's own pictures); the natural size and focal point
--                     with it
--   p_source 'none'   the generated identity, chosen by hand: it beats the
--                     manifest too
--   p_source 'auto'   back to automatic: the hand-set row goes and the
--                     manifest (or the generated identity) is read again
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_item_thumbnail(
	p_item_id uuid,
	p_source text,
	p_image_key text,
	p_attachment_id uuid,
	p_width integer,
	p_height integer,
	p_focal_x real,
	p_focal_y real
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_raster constant text := '\.(png|jpe?g|gif|webp|avif|bmp)$';
	v_filename text;
	v_row public.classroom_item_thumbnails%rowtype;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if p_item_id is null or not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can change its thumbnail.';
	end if;
	if p_source is null or p_source not in ('image', 'none', 'auto') then
		raise exception 'A thumbnail is a picture, the generated look, or automatic.';
	end if;
	if p_focal_x is not null and (p_focal_x < 0 or p_focal_x > 1)
		or p_focal_y is not null and (p_focal_y < 0 or p_focal_y > 1) then
		raise exception 'The picture''s focus has to sit inside the picture.';
	end if;

	if p_source = 'auto' then
		delete from public.classroom_item_thumbnails t where t.item_id = p_item_id and t.manual;
		perform public._classroom_thumbnail_sync(p_item_id);
		select * into v_row from public.classroom_item_thumbnails t where t.item_id = p_item_id;
		return jsonb_build_object('ok', true, 'thumbnail', case when found then to_jsonb(v_row) end);
	end if;

	if p_source = 'image' then
		if (p_image_key is null) = (p_attachment_id is null) then
			raise exception 'Choose one picture for the thumbnail: an uploaded one or one of the post''s own.';
		end if;
		if p_image_key is not null then
			if char_length(p_image_key) > 400
				or public._classroom_storage_prefix_uuid(p_image_key) is distinct from p_item_id then
				raise exception 'That picture was uploaded for a different post.';
			end if;
			if p_image_key !~* v_raster then
				raise exception 'A thumbnail has to be a PNG, JPEG, GIF, WebP, AVIF or BMP picture.';
			end if;
		else
			select a.filename into v_filename
			from public.classroom_attachments a
			where a.id = p_attachment_id and a.item_id = p_item_id;
			if not found then
				raise exception 'That picture is not one of this post''s files.';
			end if;
			if coalesce(v_filename, '') !~* v_raster then
				raise exception 'A thumbnail has to be a PNG, JPEG, GIF, WebP, AVIF or BMP picture.';
			end if;
		end if;
		if p_width is not null and (p_width < 1 or p_width > 20000)
			or p_height is not null and (p_height < 1 or p_height > 20000) then
			raise exception 'The picture''s size could not be read. Pick it again.';
		end if;
	end if;

	insert into public.classroom_item_thumbnails as t
		(item_id, source, manual, image_key, attachment_id, image_width, image_height,
		 focal_x, focal_y, html_document_id, interactive, updated_at, updated_by)
	values (
		p_item_id,
		p_source,
		true,
		case when p_source = 'image' then p_image_key end,
		case when p_source = 'image' then p_attachment_id end,
		case when p_source = 'image' then p_width end,
		case when p_source = 'image' then p_height end,
		coalesce(p_focal_x, 0.5),
		coalesce(p_focal_y, 0.5),
		null,
		false,
		now(),
		nullif(public.current_user_email(), '')
	)
	on conflict (item_id) do update
		set source = excluded.source,
			manual = true,
			image_key = excluded.image_key,
			attachment_id = excluded.attachment_id,
			image_width = excluded.image_width,
			image_height = excluded.image_height,
			focal_x = excluded.focal_x,
			focal_y = excluded.focal_y,
			html_document_id = null,
			interactive = false,
			updated_at = now(),
			updated_by = excluded.updated_by
	returning * into v_row;

	return jsonb_build_object('ok', true, 'thumbnail', to_jsonb(v_row));
end;
$$;

revoke all on function public.classroom_set_item_thumbnail(uuid, text, text, uuid, integer, integer, real, real)
	from public, anon, authenticated;
grant execute on function public.classroom_set_item_thumbnail(uuid, text, text, uuid, integer, integer, real, real)
	to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Nudging where a picture's subject is, without changing whose it is.
--
-- It moves the focal point of whatever picture the post's thumbnail shows,
-- hand-set or the manifest's, and never the `manual` flag: framing a picture
-- the document chose is not choosing a different picture.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_item_thumbnail_focus(
	p_item_id uuid,
	p_focal_x real,
	p_focal_y real
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.classroom_item_thumbnails%rowtype;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if p_item_id is null or not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can change its thumbnail.';
	end if;
	if p_focal_x is null or p_focal_y is null
		or p_focal_x < 0 or p_focal_x > 1 or p_focal_y < 0 or p_focal_y > 1 then
		raise exception 'The picture''s focus has to sit inside the picture.';
	end if;
	update public.classroom_item_thumbnails t
		set focal_x = p_focal_x, focal_y = p_focal_y, updated_at = now(),
			updated_by = nullif(public.current_user_email(), '')
		where t.item_id = p_item_id and t.source = 'image'
		returning * into v_row;
	if not found then
		raise exception 'This post''s thumbnail is not a picture, so there is nothing to frame.';
	end if;
	return jsonb_build_object('ok', true, 'thumbnail', to_jsonb(v_row));
end;
$$;

revoke all on function public.classroom_set_item_thumbnail_focus(uuid, real, real)
	from public, anon, authenticated;
grant execute on function public.classroom_set_item_thumbnail_focus(uuid, real, real) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. A class's default shape, set by whoever manages the class.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_section_thumbnail_shape(
	p_section_id uuid,
	p_shape text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the teacher of record for this class can set its thumbnail shape.';
	end if;
	if p_shape is not null and p_shape not in ('off', 'tile', 'wide', 'banner') then
		raise exception 'A thumbnail shape is Off, Tile, Wide or Banner.';
	end if;
	update public.classroom_sections s set thumbnail_shape = p_shape where s.id = p_section_id;
	return jsonb_build_object('ok', true, 'section_id', p_section_id, 'shape', p_shape);
end;
$$;

revoke all on function public.classroom_set_section_thumbnail_shape(uuid, text)
	from public, anon, authenticated;
grant execute on function public.classroom_set_section_thumbnail_shape(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Documents already stored whose manifest names a thumbnail.
--
-- Runs inside a block so `tools/apply-migration.mjs` sees no top-level DML,
-- and is idempotent by construction: `_classroom_thumbnail_sync` writes only
-- an automatic row and only from the manifest stored now, so a second run
-- rewrites nothing a first run did not already write identically.
-- ---------------------------------------------------------------------------

do $z$
declare
	v_item uuid;
	v_count integer := 0;
begin
	for v_item in
		select h.item_id from public.classroom_html_assignments h
		where h.manifest ? 'thumbnail'
			and not exists (select 1 from public.classroom_item_thumbnails t where t.item_id = h.item_id)
	loop
		perform public._classroom_thumbnail_sync(v_item);
		v_count := v_count + 1;
	end loop;
	raise notice '0268: % stored document(s) named a thumbnail and had no row; each was read once.', v_count;
end
$z$;

-- ---------------------------------------------------------------------------
-- 10. Self-check. Refuses the apply rather than leaving a gate open.
-- ---------------------------------------------------------------------------

do $z$
declare
	v_bad text[] := '{}';
	v_fn text;
	v_oid oid;
begin
	foreach v_fn in array array[
		'classroom_set_item_thumbnail(uuid,text,text,uuid,integer,integer,real,real)',
		'classroom_set_item_thumbnail_focus(uuid,real,real)',
		'classroom_set_section_thumbnail_shape(uuid,text)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by anon');
		elsif not has_function_privilege('authenticated', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is not executable by authenticated');
		end if;
	end loop;
	foreach v_fn in array array[
		'_classroom_manifest_thumbnail(jsonb)',
		'_classroom_html_may_carry_template(text,text)',
		'_classroom_thumbnail_sync(uuid)',
		'_classroom_thumbnail_follow_document()'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute')
			or has_function_privilege('authenticated', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by a client');
		end if;
	end loop;
	if has_table_privilege('anon', 'public.classroom_item_thumbnails', 'select,insert,update,delete,truncate,references,trigger') then
		v_bad := array_append(v_bad, 'classroom_item_thumbnails carries an anon grant');
	end if;
	if has_table_privilege('authenticated', 'public.classroom_item_thumbnails', 'insert,update,delete,truncate,references,trigger') then
		v_bad := array_append(v_bad, 'classroom_item_thumbnails carries a client write grant');
	end if;
	if not has_table_privilege('authenticated', 'public.classroom_item_thumbnails', 'select') then
		v_bad := array_append(v_bad, 'classroom_item_thumbnails is not readable by authenticated');
	end if;
	if not exists (
		select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = 'classroom_item_thumbnails' and c.relrowsecurity
	) then
		v_bad := array_append(v_bad, 'classroom_item_thumbnails has no row level security');
	end if;
	if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'classroom_item_thumbnails') <> 1 then
		v_bad := array_append(v_bad, 'classroom_item_thumbnails does not carry exactly one policy');
	end if;
	if not exists (
		select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
		where c.relname = 'classroom_html_assignments' and t.tgname = 'classroom_html_assignment_thumbnail'
			and not t.tgisinternal
	) then
		v_bad := array_append(v_bad, 'the classroom_html_assignment_thumbnail trigger is missing');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0268 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0268 item thumbnails: 1 table (RLS on, one read policy, no client write), 1 section column, 1 document trigger, 3 client functions closed to anon, 4 private functions closed to every client.';
end
$z$;
