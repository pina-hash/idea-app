-- 0090_classroom_instructor_materials.sql
-- Instructor-only attachments and links on classroom items: answer keys,
-- facilitation guides, setup notes, source files -- readable and editable only
-- by the item's section teachers of record and admins, never by a student.
--
-- FOLLOWS THE CANONICAL ITEM, THE SAME WAY EVERYTHING ELSE IN THIS MODULE
-- DOES SINCE 0085. Instructor materials are two more tables owned by
-- classroom_items (item_id, on delete cascade) -- not per-posting, not
-- per-section -- so a handout posted to three classes has ONE answer key that
-- every one of that item's teachers sees, exactly like its student-facing
-- attachments and links.
--
-- A SEPARATE PAIR OF TABLES, not a `visibility` column on classroom_attachments
-- / classroom_item_resources. Two reasons: (1) the existing tables' RLS policy
-- delegates to classroom_can_read_item, which admits an actively-enrolled
-- student reading published content -- folding instructor-only rows into that
-- policy would mean the ONE mistake of forgetting a `and not instructor_only`
-- clause somewhere puts an answer key in front of a student, where a wrong
-- table name at least fails loudly; and (2) it keeps the proxy route that
-- serves them a completely separate piece of code from the one students can
-- reach, so there is no shared code path for a future edit to weaken.
--
-- VISIBILITY: readable by the teacher of record of ANY section this item is
-- posted to, or an admin -- classroom_can_read_instructor_material, the
-- manager-only half of classroom_can_read_item with the enrolled-student
-- branch removed entirely. A teacher who teaches only one of an item's several
-- classes still needs to see the answer key for their own class.
--
-- EDITING: the caller must manage EVERY section the item is posted to
-- (_classroom_manages_item, 0085's existing "who may edit the canonical
-- record" bar) -- an edit changes what every one of that item's classes'
-- teachers see, the same rule classroom_add_attachment already applies to the
-- student-facing files.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere in this module: every write is a
-- SECURITY DEFINER RPC re-checking the caller inside its own body.
--
-- SERVING. A new, separate proxy route (/api/classroom/instructor-attachment)
-- reads the row under the CALLER'S OWN session -- the RLS policy below is the
-- real boundary, the route only turns "no row" into 404 (never 403, the
-- existing convention: an empty result must read exactly like "does not
-- exist"). It carries NO ?as= (view-as-student) support at all: view-as exists
-- to preview what a STUDENT sees, and instructor-only content must never be
-- part of that answer regardless of who is doing the previewing. None of the
-- classroom_view_as_* functions below were touched, and none of them join
-- these two tables -- the surface area for leaking this into a student's
-- simulated view is exactly zero, by construction, not by discipline.
--
-- DRIVE STORAGE: its own subfolder INSIDE the existing classroom attachments
-- folder (classroomFolderId(), the app-side module), so student handouts and
-- instructor-only material are never interleaved in the folder an admin
-- browses by eye, while both still sit under the one classroom parent.
--
-- Apply manually in the Supabase SQL editor, after 0089.

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_instructor_attachments (
	id uuid primary key default gen_random_uuid(),
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	-- The Drive file id, the only handle to the bytes -- Postgres never stores
	-- the file itself (the notebook convention).
	drive_file_id text not null check (char_length(btrim(drive_file_id)) between 1 and 200),
	-- The browser-supplied name. Display + the Drive filename fallback only,
	-- never an access control input.
	filename text not null check (char_length(btrim(filename)) between 1 and 300),
	mime_type text not null check (char_length(btrim(mime_type)) between 1 and 200),
	size_bytes bigint check (size_bytes is null or size_bytes >= 0),
	uploaded_by text not null,
	sort_order integer not null default 1 check (sort_order >= 1),
	created_at timestamptz not null default now()
);

create index if not exists classroom_instructor_attachments_item_idx
	on public.classroom_instructor_attachments (item_id, sort_order);
create index if not exists classroom_instructor_attachments_drive_idx
	on public.classroom_instructor_attachments (drive_file_id);

create table if not exists public.classroom_instructor_resources (
	id uuid primary key default gen_random_uuid(),
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	label text not null check (char_length(btrim(label)) between 1 and 200),
	url text not null check (url ~* '^https?://' and char_length(url) <= 2000),
	sort_order integer not null default 1 check (sort_order >= 1),
	created_at timestamptz not null default now()
);

create index if not exists classroom_instructor_resources_item_idx
	on public.classroom_instructor_resources (item_id, sort_order);

-- ---------------------------------------------------------------------------
-- 2. Visibility helper + RLS. SELECT only, as everywhere else in this module.
-- ---------------------------------------------------------------------------

-- The manager-only half of classroom_can_read_item (0085), with the
-- enrolled-student branch removed on purpose: a student must have no read
-- path here at all, not even a published one.
create or replace function public.classroom_can_read_instructor_material(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.classroom_postings pg
		where pg.item_id = p_item_id
			and public.classroom_manages_section(pg.section_id)
	);
$$;

revoke all on function public.classroom_can_read_instructor_material(uuid) from public;
grant execute on function public.classroom_can_read_instructor_material(uuid) to authenticated;

revoke all on public.classroom_instructor_attachments from anon, authenticated;
grant select on public.classroom_instructor_attachments to authenticated;
alter table public.classroom_instructor_attachments enable row level security;

drop policy if exists "classroom instructor attachments follow their item" on public.classroom_instructor_attachments;
create policy "classroom instructor attachments follow their item"
	on public.classroom_instructor_attachments
	for select
	to authenticated
	using (public.classroom_can_read_instructor_material(item_id));

revoke all on public.classroom_instructor_resources from anon, authenticated;
grant select on public.classroom_instructor_resources to authenticated;
alter table public.classroom_instructor_resources enable row level security;

drop policy if exists "classroom instructor resources follow their item" on public.classroom_instructor_resources;
create policy "classroom instructor resources follow their item"
	on public.classroom_instructor_resources
	for select
	to authenticated
	using (public.classroom_can_read_instructor_material(item_id));

-- ---------------------------------------------------------------------------
-- 3. Writes.
-- ---------------------------------------------------------------------------

-- Full replacement, the _classroom_write_resources (0085) shape applied to the
-- instructor-only table. Internal only; classroom_set_instructor_resources
-- below is the checked, client-facing door.
create or replace function public._classroom_write_instructor_resources(p_item_id uuid, p_resources jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_item jsonb;
	v_label text;
	v_url text;
	v_i integer := 0;
begin
	if p_resources is null or p_resources = 'null'::jsonb then
		return;
	end if;
	if jsonb_typeof(p_resources) <> 'array' then
		raise exception 'Instructor links must be a list of {label, url} pairs.';
	end if;

	delete from public.classroom_instructor_resources where item_id = p_item_id;

	for v_item in select * from jsonb_array_elements(p_resources) loop
		v_i := v_i + 1;
		if v_i > 20 then
			raise exception 'At most 20 instructor links per item.';
		end if;
		v_url := btrim(coalesce(v_item->>'url', ''));
		if v_url = '' then
			raise exception 'Instructor link % is missing its URL.', v_i;
		end if;
		if v_url !~* '^https?://' then
			raise exception 'Instructor link URLs must start with http:// or https:// (link %).', v_i;
		end if;
		if char_length(v_url) > 2000 then
			raise exception 'Instructor link % has a URL longer than 2000 characters.', v_i;
		end if;
		v_label := left(coalesce(nullif(btrim(coalesce(v_item->>'label', '')), ''), v_url), 200);
		insert into public.classroom_instructor_resources (item_id, label, url, sort_order)
		values (p_item_id, v_label, v_url, v_i);
	end loop;
end;
$$;

revoke all on function public._classroom_write_instructor_resources(uuid, jsonb) from public;

create or replace function public.classroom_set_instructor_resources(
	p_item_id uuid,
	p_resources jsonb default '[]'::jsonb
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
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can edit instructor-only materials.';
	end if;

	perform public._classroom_write_instructor_resources(p_item_id, coalesce(p_resources, '[]'::jsonb));

	return jsonb_build_object('ok', true, 'item_id', p_item_id);
end;
$$;

revoke all on function public.classroom_set_instructor_resources(uuid, jsonb) from public;
grant execute on function public.classroom_set_instructor_resources(uuid, jsonb) to authenticated;

-- The classroom_add_attachment (0085) shape, for the instructor-only table.
create or replace function public.classroom_add_instructor_attachment(
	p_item_id uuid,
	p_drive_file_id text,
	p_filename text,
	p_mime_type text,
	p_size_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_file text := btrim(coalesce(p_drive_file_id, ''));
	v_name text := left(btrim(coalesce(p_filename, '')), 300);
	v_mime text := left(btrim(coalesce(p_mime_type, '')), 200);
	v_next integer;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_file = '' then
		raise exception 'A Drive file id is required.';
	end if;
	if v_name = '' then
		v_name := 'attachment';
	end if;
	if v_mime = '' then
		v_mime := 'application/octet-stream';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can attach instructor-only files here.';
	end if;

	select coalesce(max(sort_order), 0) + 1 into v_next
	from public.classroom_instructor_attachments where item_id = p_item_id;

	insert into public.classroom_instructor_attachments
		(item_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by, sort_order)
	values (p_item_id, v_file, v_name, v_mime, p_size_bytes, public.current_user_email(), v_next)
	returning id into v_id;

	return jsonb_build_object('ok', true, 'attachment_id', v_id, 'drive_file_id', v_file);
end;
$$;

revoke all on function public.classroom_add_instructor_attachment(uuid, text, text, text, bigint) from public;
grant execute on function public.classroom_add_instructor_attachment(uuid, text, text, text, bigint) to authenticated;

-- The classroom_delete_attachment (0085) shape: reports whether the Drive blob
-- is now unreferenced, since classroom_duplicate_item (recreated below) can
-- carry one file id onto a second row.
create or replace function public.classroom_delete_instructor_attachment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_row public.classroom_instructor_attachments%rowtype;
	v_remaining integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select * into v_row from public.classroom_instructor_attachments where id = p_id for update;
	if not found then
		raise exception 'That attachment does not exist.';
	end if;
	if not public._classroom_manages_item(v_row.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can remove this attachment.';
	end if;

	delete from public.classroom_instructor_attachments where id = p_id;

	select count(*) into v_remaining
	from public.classroom_instructor_attachments
	where drive_file_id = v_row.drive_file_id;

	return jsonb_build_object(
		'ok', true,
		'deleted', true,
		'drive_file_id', v_row.drive_file_id,
		'orphaned', v_remaining = 0
	);
end;
$$;

revoke all on function public.classroom_delete_instructor_attachment(uuid) from public;
grant execute on function public.classroom_delete_instructor_attachment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. classroom_delete_item and classroom_duplicate_item, recreated to cover
-- the two new tables. Same signatures as 0085, so `create or replace` is all
-- either needs.
-- ---------------------------------------------------------------------------

-- Deleting the item takes its instructor materials with it (the cascade); the
-- orphan sweep now looks across BOTH attachment tables, since a file that was
-- attached as instructor-only and (separately) as a student-facing file would
-- not happen in practice, but the check has to be correct either way.
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
	) x;

	delete from public.classroom_items where id = p_id;

	select coalesce(array_agg(f), '{}'::text[]) into v_orphans
	from unnest(v_files) as f
	where not exists (
		select 1 from public.classroom_attachments t where t.drive_file_id = f
	) and not exists (
		select 1 from public.classroom_instructor_attachments t where t.drive_file_id = f
	);

	return jsonb_build_object('deleted', true, 'orphaned_drive_file_ids', to_jsonb(v_orphans));
end;
$$;

-- Duplicating an item now also carries its instructor-only attachments (by
-- reference, no re-upload -- the existing student-facing convention) and
-- links onto the new draft. The caller already had to pass
-- _classroom_manages_item to reach this function at all, which is a STRICTER
-- bar than reading instructor material requires, so no extra check is needed
-- before copying it.
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

	return jsonb_build_object('ok', true, 'item_id', v_id, 'source_item_id', p_item_id);
end;
$$;
