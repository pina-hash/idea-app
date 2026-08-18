-- 0114: a notebook entry may be WRITING, on a scheduled check-in as well as on
-- the free-form path.
--
-- REPORTED AFTER THE FIRST DAY OF CLASSES: a student could not submit a
-- notebook entry without at least one photo. That was true wherever a check-in
-- was selected, which is the default state of the form -- it opens on the
-- outstanding check-in nearest today -- so in practice it was the notebook's
-- normal behaviour, not an edge of it. A written entry with no photograph is
-- legitimate work.
--
-- WHAT WAS ENFORCING IT, all four layers, because only two of them were here:
--
--   1. THE COMPOSER (NotebookView.svelte) offered "write a note" as an
--      EXCLUSIVE MODE, and only on the free-form path. A check-in showed a
--      photo stager and nothing else, and its submit stayed disabled without a
--      staged file. Fixed in the client, not here.
--   2. /api/notebook/upload requires a `photo` part by construction
--      (readPhotoForm). That is correct and unchanged: it is the PHOTO door.
--   3. notebook_create_entry raises on a session-linked call with no file. Kept
--      -- see below -- with its message rewritten.
--   4. notebook_create_note_entry took no session at all, so the note door
--      could not reach a check-in. THAT is the gap, and it is what this
--      migration closes.
--
-- THERE IS NO TABLE CONSTRAINT TO UNDO. notebook_entries has never required a
-- photo; the closest thing, notebook_entries_has_target, was dropped by 0071,
-- and notebook_entry_photos has no minimum-row rule (there is nowhere for one
-- to live -- a CHECK sees only its own row). So the whole requirement was
-- application logic, and nothing here weakens the schema.
--
-- THE RULE AFTER THIS MIGRATION, on every tier: an entry needs a photo OR
-- writing. Neither is still refused, by whichever door was used, and both
-- doors now say what is missing instead of naming a Drive file id at a
-- fifteen-year-old.
--
-- WHY THE NOTE DOOR RATHER THAN RELAXING THE PHOTO DOOR. notebook_create_entry
-- has no note parameter, so relaxing its session branch would let it create an
-- entry with nothing in it at all and leave "it must have a note" to a second
-- call the client might never make. notebook_create_note_entry already writes
-- the entry AND its first note in ONE transaction (0078's reason: a failed note
-- must not strand an empty entry in the feed), so extending it keeps "an entry
-- made by this door always has writing in it" structural rather than
-- remembered.
--
-- SIGNATURE TRAP. p_session_id is an ADDED parameter, not a re-defaulted one,
-- so the old four-argument form is DROPPED first (0068's lesson, which 0075's
-- header correctly says does NOT apply to defaulting a parameter that is
-- already there -- this is the other case). Two overloads differing only by a
-- defaulted trailing parameter leave PostgREST unable to resolve the call at
-- all.
--
-- DEPLOY ORDERING: apply this by hand BEFORE deploying a client that names
-- p_session_id. /api/notebook/note names it only when a check-in was actually
-- picked, which is the same rule p_folder_id already follows, so a client
-- deployed ahead of the migration keeps saving free-form notes and only the
-- check-in note fails -- degraded, not broken.
--
-- Apply manually in the Supabase SQL editor, after 0113.

-- ---------------------------------------------------------------------------
-- 1. notebook_create_note_entry: a note may be filed against a check-in.
-- ---------------------------------------------------------------------------

drop function if exists public.notebook_create_note_entry(jsonb, text, uuid, uuid);

create or replace function public.notebook_create_note_entry(
	p_content jsonb,
	p_custom_label text default null,
	p_section_id uuid default null,
	p_folder_id uuid default null,
	p_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_label text := nullif(btrim(coalesce(p_custom_label, '')), '');
	v_section uuid;
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
	if p_folder_id is not null and not exists (
		select 1 from public.notebook_folders f
		where f.id = p_folder_id and f.student_id = v_uid
	) then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	if p_session_id is not null then
		-- EXACTLY the resolution notebook_create_entry uses, called rather than
		-- restated: one canonical check-in runs in N sections since 0098, and the
		-- composite FK on notebook_entries only accepts a real (session, section)
		-- posting pair. A second copy of that lookup is how the two would come to
		-- disagree about which class an entry belongs to.
		v_section := public._notebook_resolve_session_section(p_session_id, p_section_id, v_uid);
	else
		v_section := p_section_id;
		-- 0094's rule, unchanged and deliberately NOT an enrollment check: filing
		-- your own entry against a class you are not in discloses your own work to
		-- that teacher and nobody else's to anyone.
		if v_section is not null and not exists (
			select 1 from public.classroom_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
	end if;

	insert into public.notebook_entries (student_id, section_id, session_id, custom_label, folder_id)
	values (v_uid, v_section, p_session_id, v_label, p_folder_id)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id)
	values (v_note_id, v_entry_id, v_note_id, 1, null, p_content, v_uid);

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'note_id', v_note_id,
		'session_id', p_session_id,
		'section_id', v_section,
		'folder_id', p_folder_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_note_entry(jsonb, text, uuid, uuid, uuid) from public;
grant execute on function public.notebook_create_note_entry(jsonb, text, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. notebook_create_entry: the same rules, said in words a student can act on.
--
-- Latest definition: 0098. NOT ONE RULE CHANGES -- this is 0098's body with two
-- messages rewritten, and the signature is untouched, so it is a plain
-- create-or-replace with no overload to drop.
--
-- The session branch still requires a photo, and that is not the requirement
-- this migration exists to remove: this function's only content IS a photo, so
-- a call to it with none has nothing in it. What was wrong is what it SAID. "A
-- Drive file id is required" names our storage vendor and one of the two things
-- that would satisfy it; a student reading it cannot tell that writing a note
-- would have worked. Both messages now name what is missing and what would fix
-- it, and neither names a photo alone.
-- ---------------------------------------------------------------------------

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

	if p_folder_id is not null and not exists (
		select 1 from public.notebook_folders f
		where f.id = p_folder_id and f.student_id = v_uid
	) then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	if p_session_id is not null then
		if v_file = '' then
			raise exception 'This entry has nothing in it. Add a photo, or write a note instead.';
		end if;
		v_section := public._notebook_resolve_session_section(p_session_id, p_section_id, v_uid);
	else
		if v_file = '' and v_label is null then
			raise exception 'This entry has nothing in it. Add a photo, write a note, or give it a title.';
		end if;
		v_section := p_section_id;
		-- DELIBERATELY STILL NOT AN ENROLLMENT CHECK, for 0094's reason: filing
		-- your own entry against a class you are not in discloses your own work
		-- to that teacher and nobody else's to anyone.
		if v_section is not null and not exists (
			select 1 from public.classroom_sections s where s.id = v_section
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
