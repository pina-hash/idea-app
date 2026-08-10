-- 0075: a free-form notebook entry may be a NOTE, with no photo at all.
--
-- 0071 made the LABEL optional. This makes the PHOTO optional too, but only
-- on the free-form tier -- a student writing "talked through the gearbox
-- ratio with Mr. Pina, no page to shoot yet" should not have to photograph
-- something to record it. A required check-in is the opposite case: the
-- session exists because an instructor asked for a page, so a session-linked
-- entry still requires a photo and is rejected exactly as it is today, with
-- the same message.
--
-- WHY THIS LIVES IN THE RPC AND NOT A TABLE CHECK. The rule spans two tables
-- -- "this entry has no session, so it needs a photo OR a label" is a
-- statement about notebook_entries AND notebook_entry_photos together -- and
-- a CHECK constraint can only see the row it is attached to. It is also
-- inherently a statement about the entry AT CREATION: notebook_add_photo can
-- legitimately take a note-only entry to one photo later, and a table
-- constraint would have no way to tell that apart from a violation. So the
-- conditional lives inside notebook_create_entry, the only door in, exactly
-- where 0071 already put the label rule it replaced.
--
-- SIGNATURE. The parameter LIST is unchanged (uuid, text, uuid, uuid, text,
-- text); only p_drive_file_id's default moves from "required" to null. That
-- means create-or-replace targets the existing function rather than leaving a
-- second overload behind (the 0068 lesson applies to ADDING a parameter, not
-- to defaulting one that is already there), and every existing caller --
-- which passes all six by name -- is unaffected.
--
-- notebook_add_photo is deliberately untouched: its sequence_order is
-- `coalesce(max(sequence_order), 0) + 1`, which already yields 1 for an entry
-- with zero photos, and nothing else in it reads the existing photo set. A
-- note-only entry gaining its first photo is therefore already a normal add.
--
-- Apply manually in the Supabase SQL editor, after 0074.

create or replace function public.notebook_create_entry(
	p_student_id uuid,
	p_drive_file_id text default null,
	p_session_id uuid default null,
	p_section_id uuid default null,
	p_custom_label text default null,
	p_original_filename text default null
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

	if p_session_id is not null then
		-- 0075: a scheduled check-in still REQUIRES a photo. Same raise, same
		-- message, same position (before the session lookup) as before.
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
		-- 0075: free-form needs SOMETHING to be, but either half will do --
		-- a photo (0071's fully-unlabeled entry) or a label (a written note).
		-- Only both missing is refused.
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

	insert into public.notebook_entries (student_id, section_id, session_id, custom_label)
	values (v_uid, v_section, p_session_id, v_label)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	if v_file <> '' then
		insert into public.notebook_entry_photos
			(entry_id, drive_file_id, variant, sequence_order, original_filename)
		values (v_entry_id, v_file, 'original', 1, left(v_original, 300))
		returning id into v_photo_id;
	end if;

	return jsonb_build_object(
		'entry_id', v_entry_id,
		-- null on a note-only entry; callers read entry_id, and the two that
		-- read photo_id already treat it as optional.
		'photo_id', v_photo_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text) from public;
grant execute on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text) to authenticated;
