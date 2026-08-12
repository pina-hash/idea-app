-- 0088: notebook FOLDERS -- the student's own organizing scheme over their
-- entries, plus the ability to file an entry at creation time and to move
-- entries (one or many) afterwards.
--
-- WHY. The notebook has had exactly one view since 0069: every entry the
-- student has ever made, newest first, in one flat list. That was right when
-- an entry was a rare thing; it is not right once a term's worth of pages and
-- notes have piled up. Folders are the organizing layer; the collapsing and
-- searching that go with them are UI and need no schema.
--
-- A FOLDER IS ORGANIZATION, NOT A RECORD, and every rule here follows from
-- that:
--   * Deleting a folder never deletes an entry. notebook_delete_folder unfiles
--     its entries and then removes the folder, so the worst a delete can cost
--     is the filing. This is why folders get a real delete at all, unlike the
--     archive-not-delete rule the rest of this schema runs on (coin sections,
--     role holders, greenline tracks) -- those all hold history, and a folder
--     holds none.
--   * An entry sits in at most ONE folder. Not tags: the ask was folders, and
--     one-of is what makes "unfiled" a meaningful state to sort down to.
--   * Folders are per STUDENT. There is no shared or instructor-owned folder;
--     an instructor's view of the notebook is the section grid, which is
--     organized by check-in and is untouched by any of this.
--
-- THE COMPOSITE FK IS THE POINT. notebook_entries.folder_id references
-- (id, student_id), not just id -- the exact idiom 0069 already uses to tie an
-- entry's session to its section. That makes "an entry filed into somebody
-- else's folder" UNREPRESENTABLE rather than merely refused by an RPC, and it
-- means no RPC below has to re-check ownership of a folder it was handed.
-- MATCH SIMPLE skips the check entirely when folder_id is null, which is what
-- keeps "unfiled" free.
--
-- Deliberately NO on-delete action on that FK. `on delete set null` would need
-- Postgres 15's column-list form to avoid nulling the not-null student_id, and
-- leaning on a cascade for something this consequential hides it; the delete
-- RPC spells the teardown out instead (the tournament_delete convention).
--
-- FOLDER NAMES ARE VISIBLE TO SECTION STAFF, on purpose, and the UI says so
-- where a folder is named. An instructor reading an entry sees what it was
-- filed under, which is useful context; a student who wants a private thought
-- writes it in a note, which is equally visible. Nothing here is a place to
-- hide something from staff, and pretending otherwise would be worse.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere else in the notebook: select only,
-- and every write is a SECURITY DEFINER RPC that resolves the caller from
-- auth.uid(). None of the four RPCs takes a student id at all, so "you can
-- only touch your own folders and your own entries" is a property of the
-- signatures rather than a check that could be got wrong.
--
-- Apply manually in the Supabase SQL editor, after 0087.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.notebook_folders (
	id uuid primary key default gen_random_uuid(),
	student_id uuid not null references auth.users (id) on delete cascade,
	name text not null check (char_length(btrim(name)) between 1 and 60),
	-- A small allowlist rather than free-form: the palette is the notebook's
	-- own (notebook-theme.css), and a stored arbitrary colour would be a
	-- string the UI has to defend against rather than a choice it can render.
	color text check (color is null or color in
		('slate', 'gold', 'sage', 'clay', 'sky', 'plum')),
	created_at timestamptz not null default now()
);

-- What the entries' composite FK points at (the notebook_sessions
-- (id, section_id) idiom). Redundant with the primary key on its own, and
-- that is fine: it exists so the pair is referenceable.
alter table public.notebook_folders
	drop constraint if exists notebook_folders_id_student_key;
alter table public.notebook_folders
	add constraint notebook_folders_id_student_key unique (id, student_id);

-- One folder name per student, case- and whitespace-insensitively: two folders
-- called "Gearbox" and "gearbox " are the same idea typed twice, and having
-- both is how a filing system stops being one.
create unique index if not exists notebook_folders_owner_name_key
	on public.notebook_folders (student_id, lower(btrim(name)));

alter table public.notebook_entries
	add column if not exists folder_id uuid;

alter table public.notebook_entries
	drop constraint if exists notebook_entries_folder_owner_fkey;
alter table public.notebook_entries
	add constraint notebook_entries_folder_owner_fkey
	foreign key (folder_id, student_id)
	references public.notebook_folders (id, student_id);

-- The feed's own query: one student's entries, optionally within one folder,
-- newest first.
create index if not exists notebook_entries_folder_idx
	on public.notebook_entries (student_id, folder_id, upload_timestamp desc);

-- ---------------------------------------------------------------------------
-- 2. Privileges + RLS. Select only; there is no client write path.
-- ---------------------------------------------------------------------------

grant select on public.notebook_folders to authenticated;
alter table public.notebook_folders enable row level security;

drop policy if exists "students read own notebook folders" on public.notebook_folders;
create policy "students read own notebook folders"
	on public.notebook_folders
	for select
	to authenticated
	using (student_id = (select auth.uid()));

-- Staff see a folder only through an entry they can already read, which
-- delegates the whole question to notebook_can_read_entry rather than restating
-- who an instructor is (the notebook_entry_photos / notebook_entry_notes
-- pattern). An empty folder is therefore invisible to staff, which is correct:
-- there is nothing of the student's in it to give it context.
drop policy if exists "section staff read notebook folders" on public.notebook_folders;
create policy "section staff read notebook folders"
	on public.notebook_folders
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.notebook_entries e
			where e.folder_id = notebook_folders.id
			  and public.notebook_can_read_entry(e.id)
		)
	);

-- ---------------------------------------------------------------------------
-- 3. Folder writes
-- ---------------------------------------------------------------------------

-- Create or rename/recolour, in one function (the notebook_admin_upsert_session
-- convention): a null p_folder_id creates, a set one edits.
--
-- A duplicate name is a STRUCTURED refusal, not an exception -- it is the one
-- failure a student can reach by ordinary use, and the UI has to be able to
-- say "you already have a folder called that" next to the field rather than in
-- a crash banner. Everything else here is genuine misuse and raises.
create or replace function public.notebook_upsert_folder(
	p_name text,
	p_color text default null,
	p_folder_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_name text := nullif(btrim(coalesce(p_name, '')), '');
	v_color text := nullif(btrim(coalesce(p_color, '')), '');
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_name is null then
		raise exception 'A folder needs a name.';
	end if;
	if char_length(v_name) > 60 then
		raise exception 'Folder names are capped at 60 characters.';
	end if;

	-- Checked here so a bad value is a readable message rather than a CHECK
	-- violation; the constraint on the column is still the real backstop.
	if v_color is not null and v_color not in ('slate', 'gold', 'sage', 'clay', 'sky', 'plum') then
		raise exception 'That is not a folder colour.';
	end if;

	if exists (
		select 1 from public.notebook_folders f
		where f.student_id = v_uid
		  and lower(btrim(f.name)) = lower(v_name)
		  and (p_folder_id is null or f.id <> p_folder_id)
	) then
		return jsonb_build_object('ok', false, 'reason', 'duplicate_name', 'name', v_name);
	end if;

	if p_folder_id is null then
		insert into public.notebook_folders (student_id, name, color)
		values (v_uid, v_name, v_color)
		returning id into v_id;
	else
		update public.notebook_folders f
		set name = v_name,
		    color = v_color
		where f.id = p_folder_id and f.student_id = v_uid
		returning f.id into v_id;
		if v_id is null then
			raise exception 'That folder does not exist or is not yours.';
		end if;
	end if;

	return jsonb_build_object('ok', true, 'folder_id', v_id, 'name', v_name, 'color', v_color);
end;
$$;

revoke all on function public.notebook_upsert_folder(text, text, uuid) from public;
grant execute on function public.notebook_upsert_folder(text, text, uuid) to authenticated;

-- Removes a folder and UNFILES everything that was in it. Entries, photos and
-- notes are untouched; only the filing goes.
--
-- The unfile is written out rather than left to a cascade so the blast radius
-- is visible in one place, and it is what the composite FK's lack of an
-- on-delete action requires. Both statements are one transaction, so a folder
-- can never be removed while entries still point at it.
create or replace function public.notebook_delete_folder(p_folder_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_unfiled integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	perform 1
	from public.notebook_folders f
	where f.id = p_folder_id and f.student_id = v_uid
	for update;
	if not found then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	with unfiled as (
		update public.notebook_entries e
		set folder_id = null
		where e.folder_id = p_folder_id and e.student_id = v_uid
		returning 1
	)
	select count(*) into v_unfiled from unfiled;

	delete from public.notebook_folders f
	where f.id = p_folder_id and f.student_id = v_uid;

	return jsonb_build_object('ok', true, 'unfiled_entries', v_unfiled);
end;
$$;

revoke all on function public.notebook_delete_folder(uuid) from public;
grant execute on function public.notebook_delete_folder(uuid) to authenticated;

-- Files one or MANY entries. The array is the point: sorting a pile that has
-- already accumulated means moving entries in handfuls, and a client-side loop
-- of single moves can be interrupted halfway leaving nobody able to say how
-- much of the selection actually landed (the coin_bulk_log_section reasoning,
-- over a much smaller roster).
--
-- A null p_folder_id unfiles. Entries that are not the caller's are simply not
-- matched by the update -- the WHERE clause is the authorization -- and the
-- returned count is what genuinely moved, so a caller can tell.
create or replace function public.notebook_move_entries(
	p_entry_ids uuid[],
	p_folder_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_requested integer := coalesce(array_length(p_entry_ids, 1), 0);
	v_moved integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_requested = 0 then
		return jsonb_build_object('ok', true, 'requested', 0, 'moved', 0);
	end if;

	-- The composite FK would refuse a foreign folder anyway; this is the
	-- readable version of the same refusal.
	if p_folder_id is not null and not exists (
		select 1 from public.notebook_folders f
		where f.id = p_folder_id and f.student_id = v_uid
	) then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	with moved as (
		update public.notebook_entries e
		set folder_id = p_folder_id
		where e.id = any(p_entry_ids) and e.student_id = v_uid
		returning 1
	)
	select count(*) into v_moved from moved;

	return jsonb_build_object('ok', true, 'requested', v_requested, 'moved', v_moved);
end;
$$;

revoke all on function public.notebook_move_entries(uuid[], uuid) from public;
grant execute on function public.notebook_move_entries(uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Filing AT CREATION.
--
-- Both creating RPCs gain p_folder_id. Adding a parameter changes a function's
-- real signature, so `create or replace` alone would leave the old arity
-- callable as a SECOND OVERLOAD -- the trap this repo has already been caught
-- by twice (0058's rename, 0068's tournament_delete). Each is therefore
-- dropped at its exact old signature first.
-- ---------------------------------------------------------------------------

drop function if exists public.notebook_create_entry(uuid, text, uuid, uuid, text, text);

-- Unchanged from 0075 apart from the folder: same conditional photo rule
-- (a session-linked entry still requires one, a free-form entry needs a photo
-- or a label), same messages, same return shape.
create or replace function public.notebook_create_entry(
	p_student_id uuid,
	p_drive_file_id text default null,
	p_session_id uuid default null,
	p_section_id uuid default null,
	p_custom_label text default null,
	p_original_filename text default null,
	p_folder_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_file text := btrim(coalesce(p_drive_file_id, ''));
	v_label text := nullif(btrim(coalesce(p_custom_label, '')), '');
	v_original text := nullif(btrim(coalesce(p_original_filename, '')), '');
	v_section uuid;
	v_session_section uuid;
	v_entry_id uuid;
	v_photo_id uuid;
	v_uploaded timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_student_id is null or p_student_id <> v_uid then
		raise exception 'You can only create notebook entries for your own account.';
	end if;

	-- A folder is available on BOTH tiers: filing is the student's own view of
	-- their notebook and is orthogonal to whether an instructor asked for the
	-- page.
	if p_folder_id is not null and not exists (
		select 1 from public.notebook_folders f
		where f.id = p_folder_id and f.student_id = v_uid
	) then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	if p_session_id is not null then
		if v_file = '' then
			raise exception 'A Drive file id is required.';
		end if;

		select ss.section_id into v_session_section
		from public.notebook_sessions ss
		where ss.id = p_session_id;
		if not found then
			raise exception 'That session does not exist.';
		end if;
		if p_section_id is not null and p_section_id <> v_session_section then
			raise exception 'That session belongs to a different section.';
		end if;
		v_section := v_session_section;
	else
		if v_file = '' and v_label is null then
			raise exception 'A free-form entry needs a photo or a label.';
		end if;
		v_section := p_section_id;
		if v_section is not null and not exists (
			select 1 from public.notebook_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
	end if;

	insert into public.notebook_entries (student_id, section_id, session_id, custom_label, folder_id)
	values (v_uid, v_section, p_session_id, v_label, p_folder_id)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	if v_file <> '' then
		insert into public.notebook_entry_photos
			(entry_id, drive_file_id, variant, sequence_order, original_filename)
		values (v_entry_id, v_file, 'original', 1, left(v_original, 300))
		returning id into v_photo_id;
	end if;

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'photo_id', v_photo_id,
		'folder_id', p_folder_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid) from public;
grant execute on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid) to authenticated;

drop function if exists public.notebook_create_note_entry(jsonb, text, uuid);

-- Unchanged from 0078 apart from the folder: still one transaction for the
-- entry and its first note, so a refused note cannot strand an empty entry.
create or replace function public.notebook_create_note_entry(
	p_content jsonb,
	p_custom_label text default null,
	p_section_id uuid default null,
	p_folder_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_label text := nullif(btrim(coalesce(p_custom_label, '')), '');
	v_entry_id uuid;
	v_note_id uuid := gen_random_uuid();
	v_uploaded timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._notebook_note_content_ok(p_content) then
		raise exception 'That note could not be saved: its content is not a valid note.';
	end if;
	if p_section_id is not null and not exists (
		select 1 from public.notebook_sections s where s.id = p_section_id
	) then
		raise exception 'That section does not exist.';
	end if;
	if p_folder_id is not null and not exists (
		select 1 from public.notebook_folders f
		where f.id = p_folder_id and f.student_id = v_uid
	) then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	insert into public.notebook_entries (student_id, section_id, session_id, custom_label, folder_id)
	values (v_uid, p_section_id, null, v_label, p_folder_id)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id)
	values (v_note_id, v_entry_id, v_note_id, 1, null, p_content, v_uid);

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'note_id', v_note_id,
		'folder_id', p_folder_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_note_entry(jsonb, text, uuid, uuid) from public;
grant execute on function public.notebook_create_note_entry(jsonb, text, uuid, uuid) to authenticated;
