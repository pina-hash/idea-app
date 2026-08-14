-- 0101_classroom_decks.sql
-- Presentation decks on classroom items: a Claude Design "Project HTML" export
-- (an entry .html plus its whole sibling tree -- _ds/, uploads/, assets/, the
-- runtime .js files and a HIDDEN .image-slots.state.json) uploaded as a zip,
-- unpacked server-side, stored file-by-file in Drive, and served back through
-- an RLS-enforcing proxy so the deck's own relative paths resolve exactly as
-- they do on the author's machine.
--
-- FOLLOWS THE CANONICAL ITEM, like everything else in this module since 0085.
-- A deck belongs to classroom_items (item_id, on delete cascade), NOT to a
-- posting and NOT to a section -- so a deck attached to an item posted to three
-- classes is ONE upload every one of those classes sees, exactly like that
-- item's attachments and its instructor materials.
--
-- ONE DECK PER ITEM (item_id is UNIQUE), deliberately. "Re-upload replaces the
-- deck" is only a well-defined sentence if there is one deck to replace, and
-- the viewer route resolves a deck FROM an item, which a second deck would make
-- ambiguous. An item that needs two decks is two items.
--
-- TWO TABLES, NOT ONE WITH A jsonb MANIFEST. The manifest is read one row at a
-- time -- the proxy resolves a single (deck, relative path) pair per request and
-- a deck pulls roughly thirty files per view -- so it wants to be an indexed
-- lookup, not a jsonb document fetched and scanned thirty times. It is also the
-- thing that keeps the serving route from ever LISTING Drive: the path a browser
-- asks for is resolved to a Drive file id by this index and nothing else.
--
-- THE HIDDEN FILE IS LOAD-BEARING, and this schema is where that fact is
-- written down. `.image-slots.state.json` is a SIBLING of the entry HTML that
-- image-slot.js fetches at runtime by that exact relative name; it carries the
-- per-slot scale and pan the author set by hand ({u, s, x, y} per slot id).
-- Drop it, skip it as a dotfile, or rename it, and every image in the deck
-- renders at its uncropped default -- which looks PLAUSIBLE rather than broken,
-- so nothing surfaces an error and the author's framing work is simply gone.
-- Hence: dotfiles are ordinary files here (nothing in the path rule below
-- excludes a leading dot from a NAME), and classroom_decks.has_state_file
-- records whether the upload carried one so the upload surface can warn.
--
-- PATH SAFETY IS A DATABASE RULE, not only an unpacker rule.
-- _classroom_deck_path_ok is enforced by a CHECK constraint on every stored
-- path AND re-run inside the write RPC, because the stored path is what the
-- serving route resolves: an escaping path must be unrepresentable, not merely
-- unlikely. The unpacker rejects them a third time, before anything reaches
-- Drive.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere in this module: SELECT only, and
-- every write is a SECURITY DEFINER RPC that re-checks the caller in its own
-- body. Reads delegate to classroom_can_read_item (0085) -- the single
-- visibility question this module asks -- so a deck is exactly as visible as
-- the item it hangs on: a draft's deck is unreachable for a student by
-- construction, and so is another section's.
--
-- WRITES take the stricter _classroom_manages_item bar (manage EVERY class the
-- item is posted to), the same rule classroom_add_attachment already applies:
-- replacing a deck changes what every one of those classes sees.
--
-- DRIVE CLEANUP IS REPORTED, NOT ASSUMED. Postgres cannot talk to Drive, so
-- both write RPCs return the Drive file ids (and the per-deck folder id) that
-- no surviving row references any more, and the HTTP route sweeps them -- the
-- classroom_delete_attachment `orphaned` convention, over a whole tree instead
-- of one file. classroom_delete_item and classroom_duplicate_item are recreated
-- below to stay correct about decks for the same reason.
--
-- Apply manually in the Supabase SQL editor, after 0100.

-- ---------------------------------------------------------------------------
-- 1. The path rule. ONE definition, used by the CHECK constraints and by the
--    write RPC, so the two can never disagree about what a legal deck path is.
-- ---------------------------------------------------------------------------

-- A deck path is RELATIVE, FORWARD-SLASHED and CONTAINED. It may name a hidden
-- file (`.image-slots.state.json`, `.thumbnail`) -- a leading dot on a SEGMENT
-- NAME is fine and necessary. What it may not do is leave the deck root or
-- address anything but a plain file inside it.
create or replace function public._classroom_deck_path_ok(p_path text)
returns boolean
language sql
immutable
as $$
	select p_path is not null
		and char_length(p_path) between 1 and 400
		-- No leading/trailing whitespace: a path is compared for equality by the
		-- serving route, so " index.html" would be a second, invisible entry.
		and p_path = btrim(p_path)
		-- Relative only. A leading slash would resolve against the site root.
		and left(p_path, 1) <> '/'
		-- Backslash is a separator on Windows and an escape everywhere else;
		-- chr(92) rather than a literal so no layer of quoting can eat it.
		and strpos(p_path, chr(92)) = 0
		-- There is deliberately NO null-byte check here, unlike the TypeScript
		-- mirror: Postgres `text` cannot hold one at all (the value is rejected
		-- on the way in), and `chr(0)` is itself an error, so writing the check
		-- would break the function rather than tighten it. A JS string CAN carry
		-- one, which is why deckPathOk still tests for it.
		-- No parent-directory segment, anywhere: this is the traversal check.
		and p_path !~ '(^|/)\.\.(/|$)'
		-- No bare "." segment. Note this matches a segment that IS ".", never a
		-- name that merely STARTS with one -- ".image-slots.state.json" has a
		-- letter after the dot and is deliberately allowed.
		and p_path !~ '(^|/)\.(/|$)'
		-- No empty segment, and no trailing slash: every row is a FILE.
		and p_path !~ '//'
		and right(p_path, 1) <> '/'
		-- No scheme and no Windows drive letter -- "https://evil/x" and "C:/x"
		-- are both rejected by the same rule.
		and strpos(p_path, ':') = 0
$$;

revoke all on function public._classroom_deck_path_ok(text) from public;

-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_decks (
	id uuid primary key default gen_random_uuid(),
	-- UNIQUE: one deck per item (see the header).
	item_id uuid not null unique references public.classroom_items (id) on delete cascade,
	title text not null check (char_length(btrim(title)) between 1 and 200),
	-- The root-level .html the viewer points its iframe at. Always one of this
	-- deck's own file paths (the write RPC enforces that).
	entry_path text not null check (public._classroom_deck_path_ok(entry_path)),
	-- The export's own `.thumbnail`, when it shipped one: a path into this same
	-- deck, served by the same proxy, so a preview image needs no second store.
	thumbnail_path text check (thumbnail_path is null or public._classroom_deck_path_ok(thumbnail_path)),
	-- The per-deck Drive subfolder holding every file. Kept so a delete can
	-- sweep the folder itself and not just its contents.
	drive_folder_id text not null check (char_length(btrim(drive_folder_id)) between 1 and 200),
	file_count integer not null default 0 check (file_count >= 0),
	total_bytes bigint not null default 0 check (total_bytes >= 0),
	-- Whether the upload carried .image-slots.state.json. False means every
	-- image in this deck will render UNFRAMED (header); the surfaces say so.
	has_state_file boolean not null default false,
	-- [{ "index": 0, "label": "..." }, ...], read out of the entry HTML at
	-- ingest. LABELS ONLY: data-speaker-notes is never extracted and never
	-- stored, so no surface of ours can show it to a student by accident.
	slides jsonb not null default '[]'::jsonb check (jsonb_typeof(slides) = 'array'),
	uploaded_by text not null,
	created_at timestamptz not null default now()
);

create table if not exists public.classroom_deck_files (
	id uuid primary key default gen_random_uuid(),
	deck_id uuid not null references public.classroom_decks (id) on delete cascade,
	-- Relative to the deck root, exactly as it sat in the zip. NEVER rewritten:
	-- every reference inside a Claude Design export is already correct relative
	-- to the entry file, so the tree is stored and served as a unit.
	path text not null check (public._classroom_deck_path_ok(path)),
	drive_file_id text not null check (char_length(btrim(drive_file_id)) between 1 and 200),
	mime_type text not null check (char_length(btrim(mime_type)) between 1 and 200),
	size_bytes bigint check (size_bytes is null or size_bytes >= 0),
	unique (deck_id, path)
);

-- The unique constraint above is the proxy's lookup index: one row read per
-- served file, keyed on exactly what the browser asked for.
create index if not exists classroom_deck_files_drive_idx
	on public.classroom_deck_files (drive_file_id);

-- ---------------------------------------------------------------------------
-- 3. Visibility + RLS. SELECT only, as everywhere else in this module.
-- ---------------------------------------------------------------------------

-- A deck's FILES are as visible as their deck, which is as visible as its item.
-- SECURITY DEFINER so the nested classroom_decks read inside is a plain lookup
-- rather than a second policy evaluation -- one policy expression per table,
-- each delegating to the one question (classroom_can_read_item) this module
-- has always asked.
create or replace function public.classroom_can_read_deck(p_deck_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.classroom_decks d
		where d.id = p_deck_id and public.classroom_can_read_item(d.item_id)
	);
$$;

revoke all on function public.classroom_can_read_deck(uuid) from public;
grant execute on function public.classroom_can_read_deck(uuid) to authenticated;

revoke all on public.classroom_decks from anon, authenticated;
grant select on public.classroom_decks to authenticated;
alter table public.classroom_decks enable row level security;

drop policy if exists "classroom decks follow their item" on public.classroom_decks;
create policy "classroom decks follow their item"
	on public.classroom_decks
	for select
	to authenticated
	using (public.classroom_can_read_item(item_id));

revoke all on public.classroom_deck_files from anon, authenticated;
grant select on public.classroom_deck_files to authenticated;
alter table public.classroom_deck_files enable row level security;

drop policy if exists "classroom deck files follow their deck" on public.classroom_deck_files;
create policy "classroom deck files follow their deck"
	on public.classroom_deck_files
	for select
	to authenticated
	using (public.classroom_can_read_deck(deck_id));

-- ---------------------------------------------------------------------------
-- 4. Writes.
-- ---------------------------------------------------------------------------

-- Everything a caller must sweep off Drive once a deck's rows are gone: the
-- file ids no surviving row references, plus the deck's own folder. Shared by
-- replace, delete-deck and delete-item so all three report the same shape and
-- none of them can quietly forget the folder.
--
-- The file ids are re-checked against the whole table rather than assumed
-- orphaned, because classroom_duplicate_item carries a deck BY REFERENCE (no
-- re-upload), so one Drive file can legitimately back rows under two decks.
create or replace function public._classroom_deck_orphans(
	p_file_ids text[],
	p_folder_id text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'orphaned_drive_file_ids', to_jsonb(coalesce((
			select array_agg(f) from unnest(coalesce(p_file_ids, '{}'::text[])) as f
			where not exists (
				select 1 from public.classroom_deck_files df where df.drive_file_id = f
			)
		), '{}'::text[])),
		-- The folder goes only when nothing at all still lives under this deck's
		-- folder id -- a duplicated deck shares it.
		'orphaned_folder_id', case
			when p_folder_id is not null and not exists (
				select 1 from public.classroom_decks d where d.drive_folder_id = p_folder_id
			) then p_folder_id
			else null
		end
	);
$$;

revoke all on function public._classroom_deck_orphans(text[], text) from public;

-- Attach a freshly uploaded deck to an item, REPLACING whatever deck was there.
--
-- One transaction: the old deck's rows go and the new ones land together, so
-- there is never a moment where an item has half a deck. The response carries
-- the previous deck's now-unreferenced Drive ids for the route to sweep --
-- Postgres cannot delete a Drive file, so "replaces cleanly without orphaning"
-- is a two-part contract and this is its first part.
create or replace function public.classroom_replace_deck(
	p_item_id uuid,
	p_title text,
	p_entry_path text,
	p_drive_folder_id text,
	p_files jsonb,
	p_thumbnail_path text default null,
	p_has_state_file boolean default false,
	p_slides jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_title text := left(btrim(coalesce(p_title, '')), 200);
	v_entry text := btrim(coalesce(p_entry_path, ''));
	v_folder text := btrim(coalesce(p_drive_folder_id, ''));
	v_thumb text := nullif(btrim(coalesce(p_thumbnail_path, '')), '');
	v_old public.classroom_decks%rowtype;
	v_old_files text[] := '{}'::text[];
	v_orphans jsonb;
	v_file jsonb;
	v_path text;
	v_drive text;
	v_mime text;
	v_count integer := 0;
	v_bytes bigint := 0;
	v_deck uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can attach a deck here.';
	end if;
	if v_title = '' then
		v_title := 'Presentation';
	end if;
	if v_folder = '' then
		raise exception 'A Drive folder id is required.';
	end if;
	if jsonb_typeof(coalesce(p_files, 'null'::jsonb)) <> 'array' then
		raise exception 'The deck manifest must be a list of files.';
	end if;
	if jsonb_array_length(p_files) = 0 then
		raise exception 'A deck must contain at least one file.';
	end if;
	if jsonb_array_length(p_files) > 500 then
		raise exception 'A deck may contain at most 500 files (this one has %).', jsonb_array_length(p_files);
	end if;
	if not public._classroom_deck_path_ok(v_entry) then
		raise exception 'The entry file path is not a legal deck path.';
	end if;
	if v_thumb is not null and not public._classroom_deck_path_ok(v_thumb) then
		raise exception 'The thumbnail path is not a legal deck path.';
	end if;

	-- Remember what the outgoing deck owned BEFORE deleting it, so the orphan
	-- report below can be computed against the table's post-delete state.
	select * into v_old from public.classroom_decks where item_id = p_item_id for update;
	if found then
		select coalesce(array_agg(distinct df.drive_file_id), '{}'::text[]) into v_old_files
		from public.classroom_deck_files df where df.deck_id = v_old.id;
		delete from public.classroom_decks where id = v_old.id;
	end if;

	insert into public.classroom_decks
		(item_id, title, entry_path, thumbnail_path, drive_folder_id,
			has_state_file, slides, uploaded_by)
	values (p_item_id, v_title, v_entry, v_thumb, v_folder,
		coalesce(p_has_state_file, false),
		case when jsonb_typeof(coalesce(p_slides, 'null'::jsonb)) = 'array'
			then p_slides else '[]'::jsonb end,
		public.current_user_email())
	returning id into v_deck;

	for v_file in select * from jsonb_array_elements(p_files) loop
		v_path := btrim(coalesce(v_file->>'path', ''));
		v_drive := btrim(coalesce(v_file->>'drive_file_id', ''));
		v_mime := left(btrim(coalesce(v_file->>'mime_type', '')), 200);
		if not public._classroom_deck_path_ok(v_path) then
			raise exception 'Deck file path % is not a legal deck path.', coalesce(v_path, '(null)');
		end if;
		if v_drive = '' then
			raise exception 'Deck file % is missing its Drive file id.', v_path;
		end if;
		if v_mime = '' then
			v_mime := 'application/octet-stream';
		end if;
		insert into public.classroom_deck_files (deck_id, path, drive_file_id, mime_type, size_bytes)
		values (v_deck, v_path, v_drive, v_mime,
			nullif(v_file->>'size_bytes', '')::bigint);
		v_count := v_count + 1;
		v_bytes := v_bytes + coalesce(nullif(v_file->>'size_bytes', '')::bigint, 0);
	end loop;

	-- The entry file and the thumbnail must be files this deck actually has,
	-- or the viewer would point an iframe at a 404.
	if not exists (select 1 from public.classroom_deck_files where deck_id = v_deck and path = v_entry) then
		raise exception 'The entry file (%) is not one of the deck''s files.', v_entry;
	end if;
	if v_thumb is not null
		and not exists (select 1 from public.classroom_deck_files where deck_id = v_deck and path = v_thumb) then
		raise exception 'The thumbnail (%) is not one of the deck''s files.', v_thumb;
	end if;

	update public.classroom_decks set file_count = v_count, total_bytes = v_bytes where id = v_deck;

	v_orphans := public._classroom_deck_orphans(
		v_old_files,
		case when v_old.id is not null then v_old.drive_folder_id else null end
	);

	return jsonb_build_object(
		'ok', true,
		'deck_id', v_deck,
		'item_id', p_item_id,
		'file_count', v_count,
		'replaced', v_old.id is not null
	) || v_orphans;
end;
$$;

revoke all on function public.classroom_replace_deck(uuid, text, text, text, jsonb, text, boolean, jsonb) from public;
grant execute on function public.classroom_replace_deck(uuid, text, text, text, jsonb, text, boolean, jsonb) to authenticated;

-- Removes an item's deck and reports what Drive still holds.
create or replace function public.classroom_delete_deck(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.classroom_decks%rowtype;
	v_files text[] := '{}'::text[];
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select * into v_old from public.classroom_decks where item_id = p_item_id for update;
	if not found then
		raise exception 'That item has no deck.';
	end if;
	if not public._classroom_manages_item(v_old.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can remove this deck.';
	end if;

	select coalesce(array_agg(distinct df.drive_file_id), '{}'::text[]) into v_files
	from public.classroom_deck_files df where df.deck_id = v_old.id;

	delete from public.classroom_decks where id = v_old.id;

	return jsonb_build_object('ok', true, 'deleted', true)
		|| public._classroom_deck_orphans(v_files, v_old.drive_folder_id);
end;
$$;

revoke all on function public.classroom_delete_deck(uuid) from public;
grant execute on function public.classroom_delete_deck(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. classroom_delete_item and classroom_duplicate_item, recreated to cover
--    decks. Same signatures as 0090, so `create or replace` is all either
--    needs. Both bodies are 0090's, with the deck handling added.
-- ---------------------------------------------------------------------------

-- Deleting the item cascades its deck rows away; without this the deck's ~30
-- Drive files and its folder would be left behind with nothing referencing
-- them. The orphan report is a superset now: attachments, instructor
-- attachments, and every deck file, plus the deck folder ids.
create or replace function public.classroom_delete_item(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_files text[];
	v_orphans text[];
	v_folders text[];
	v_orphan_folders text[];
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_id) then
		raise exception 'Only the teacher of record for every class this is posted to can delete it.';
	end if;

	select coalesce(array_agg(distinct f), '{}'::text[]) into v_files
	from (
		select drive_file_id as f from public.classroom_attachments where item_id = p_id
		union
		select drive_file_id as f from public.classroom_instructor_attachments where item_id = p_id
		union
		select df.drive_file_id as f
		from public.classroom_deck_files df
		join public.classroom_decks d on d.id = df.deck_id
		where d.item_id = p_id
	) x;

	select coalesce(array_agg(distinct d.drive_folder_id), '{}'::text[]) into v_folders
	from public.classroom_decks d where d.item_id = p_id;

	delete from public.classroom_items where id = p_id;

	select coalesce(array_agg(f), '{}'::text[]) into v_orphans
	from unnest(v_files) as f
	where not exists (
		select 1 from public.classroom_attachments t where t.drive_file_id = f
	) and not exists (
		select 1 from public.classroom_instructor_attachments t where t.drive_file_id = f
	) and not exists (
		select 1 from public.classroom_deck_files t where t.drive_file_id = f
	);

	select coalesce(array_agg(fo), '{}'::text[]) into v_orphan_folders
	from unnest(v_folders) as fo
	where not exists (
		select 1 from public.classroom_decks d where d.drive_folder_id = fo
	);

	return jsonb_build_object(
		'deleted', true,
		'orphaned_drive_file_ids', to_jsonb(v_orphans),
		'orphaned_deck_folder_ids', to_jsonb(v_orphan_folders)
	);
end;
$$;

-- A duplicate carries the deck BY REFERENCE -- same Drive files, same folder,
-- new rows -- the existing convention for attachments, and the reason
-- _classroom_deck_orphans re-checks every id against the table instead of
-- assuming a deleted deck's files are unreferenced.
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
		(kind, title, body, points, due_at, category, author_email, author_name,
			published, pinned, sort_order)
	values (v_old.kind,
		case when v_old.kind = 'post' then v_old.title
			else left(coalesce(v_old.title, '') || ' (copy)', 300) end,
		v_old.body, v_old.points, v_old.due_at, v_old.category,
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
