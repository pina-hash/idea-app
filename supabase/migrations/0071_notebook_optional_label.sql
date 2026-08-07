-- 0071: notebook entries no longer REQUIRE a label or session, and photos
-- remember the browser's original filename.
--
-- Real-feedback change: requiring a typed label for a free-form entry was
-- unwanted friction, especially when the uploaded file already has a
-- meaningful name of its own. Two additive changes (0069 is untouched, per
-- the immutable-applied-record convention):
--
--   1. The notebook_entries_has_target CHECK is dropped: an entry is now
--      valid session-linked, custom-labelled, or fully unlabeled. Every RPC
--      that duplicated the old rule in application logic is recreated to
--      match (notebook_create_entry's "needs a session or a custom label"
--      raise, and notebook_admin_override_entry's "an entry with no session
--      needs a custom label" raise -- leaving either would keep the stricter
--      rule alive in the app layer while the table allows more). The
--      session-implies-section CHECK and the composite session/section FK
--      are untouched; notebook_admin_delete_session's label backfill on
--      detach is kept as-is (no longer REQUIRED by any constraint, but
--      preserving the deleted session's label on its entries is still the
--      right behavior).
--
--   2. notebook_entry_photos.original_filename (text, nullable): the
--      filename the browser submitted with the upload. PURELY INFORMATIONAL
--      -- display and the Drive-naming fallback only, never access control,
--      never read back as an identifier. Stored via a new defaulted
--      parameter on notebook_create_entry / notebook_add_photo; both are
--      DROPPED and recreated because create-or-replace keys on the exact
--      parameter list (the 0068 overload lesson) and a defaulted extra
--      parameter would otherwise leave the old signature callable as an
--      ambiguous second overload.
--
-- Apply manually in the Supabase SQL editor, after 0070.

-- ---------------------------------------------------------------------------
-- 1. Constraint + column
-- ---------------------------------------------------------------------------

alter table public.notebook_entries
	drop constraint if exists notebook_entries_has_target;

alter table public.notebook_entry_photos
	add column if not exists original_filename text
		check (original_filename is null or char_length(original_filename) between 1 and 300);

-- ---------------------------------------------------------------------------
-- 2. notebook_create_entry: label optional, original filename stored
-- ---------------------------------------------------------------------------

drop function if exists public.notebook_create_entry(uuid, text, uuid, uuid, text);

create or replace function public.notebook_create_entry(
	p_student_id uuid,
	p_drive_file_id text,
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
	if v_file = '' then
		raise exception 'A Drive file id is required.';
	end if;

	if p_session_id is not null then
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
		-- 0071: no label required; a fully unlabeled free entry is valid.
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

	insert into public.notebook_entry_photos
		(entry_id, drive_file_id, variant, sequence_order, original_filename)
	values (v_entry_id, v_file, 'original', 1, left(v_original, 300))
	returning id into v_photo_id;

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'photo_id', v_photo_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text) from public;
grant execute on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. notebook_add_photo: original filename stored
-- ---------------------------------------------------------------------------

drop function if exists public.notebook_add_photo(uuid, text, text);

create or replace function public.notebook_add_photo(
	p_entry_id uuid,
	p_drive_file_id text,
	p_variant text default 'original',
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
	v_original text := nullif(btrim(coalesce(p_original_filename, '')), '');
	v_status text;
	v_seq integer;
	v_photo_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_file = '' then
		raise exception 'A Drive file id is required.';
	end if;
	if p_variant is null or p_variant not in ('original', 'enhanced') then
		raise exception 'Variant must be ''original'' or ''enhanced''.';
	end if;

	-- FOR UPDATE serializes concurrent adds on one entry, so sequence_order
	-- can never collide.
	select e.status into v_status
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	select coalesce(max(ph.sequence_order), 0) + 1 into v_seq
	from public.notebook_entry_photos ph
	where ph.entry_id = p_entry_id;

	if v_status = 'flagged' then
		update public.notebook_entries
		set status = 'pending_review'
		where id = p_entry_id;
		v_status := 'pending_review';
	end if;

	insert into public.notebook_entry_photos
		(entry_id, drive_file_id, variant, sequence_order, original_filename)
	values (p_entry_id, v_file, p_variant, v_seq, left(v_original, 300))
	returning id into v_photo_id;

	return jsonb_build_object(
		'photo_id', v_photo_id,
		'sequence_order', v_seq,
		'status', v_status
	);
end;
$$;

revoke all on function public.notebook_add_photo(uuid, text, text, text) from public;
grant execute on function public.notebook_add_photo(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. notebook_admin_override_entry: drop the app-layer copy of the old rule
-- ---------------------------------------------------------------------------
-- Same signature, so create-or-replace is safe here. The ONLY body change is
-- removing the "an entry with no session needs a custom label" raise; every
-- other line is verbatim 0069.

create or replace function public.notebook_admin_override_entry(
	p_entry_id uuid,
	p_set_session boolean default false,
	p_session_id uuid default null,
	p_set_section boolean default false,
	p_section_id uuid default null,
	p_custom_label text default null,
	p_status text default null,
	p_flag_reason text default null,
	p_instructor_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.notebook_entries%rowtype;
	v_session uuid;
	v_section uuid;
	v_label text;
	v_status text;
	v_reason text;
	v_comment text;
	v_reviewed_by uuid;
	v_reviewed_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can override notebook entries.';
	end if;

	select e.* into v_old
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;

	v_session := case when p_set_session then p_session_id else v_old.session_id end;
	v_label := case
		when p_custom_label is not null then nullif(btrim(p_custom_label), '')
		else v_old.custom_label
	end;

	if v_session is not null then
		select ss.section_id into v_section
		from public.notebook_sessions ss
		where ss.id = v_session;
		if not found then
			raise exception 'That session does not exist.';
		end if;
		-- The section follows the session; an explicit conflicting section is
		-- a mistake, not a preference.
		if p_set_section and p_section_id is distinct from v_section then
			raise exception 'That session belongs to a different section; the entry''s section follows its session.';
		end if;
	else
		v_section := case when p_set_section then p_section_id else v_old.section_id end;
		if v_section is not null and not exists (
			select 1 from public.notebook_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
		-- 0071: an unlabeled, session-less entry is valid now; the old
		-- "an entry with no session needs a custom label" raise is gone.
	end if;

	v_status := coalesce(p_status, v_old.status);
	if v_status not in ('compliant', 'flagged', 'pending_review') then
		raise exception 'Status must be one of: compliant, flagged, pending_review.';
	end if;
	if p_flag_reason is not null and p_flag_reason not in
		('not_dated', 'illegible', 'insufficient_detail', 'appears_reconstructed', 'other')
	then
		raise exception 'Flag reason must be one of: not_dated, illegible, insufficient_detail, appears_reconstructed, other.';
	end if;
	if p_flag_reason is not null and v_status <> 'flagged' then
		raise exception 'A flag reason only applies when the status is flagged.';
	end if;
	if v_status = 'flagged' then
		v_reason := coalesce(p_flag_reason, v_old.flag_reason, 'other');
	else
		v_reason := null;
	end if;

	v_comment := case
		when p_instructor_comment is not null then nullif(btrim(p_instructor_comment), '')
		else v_old.instructor_comment
	end;

	if p_status is not null then
		v_reviewed_by := v_uid;
		v_reviewed_at := now();
	else
		v_reviewed_by := v_old.reviewed_by;
		v_reviewed_at := v_old.reviewed_at;
	end if;

	update public.notebook_entries
	set session_id = v_session,
		section_id = v_section,
		custom_label = v_label,
		status = v_status,
		flag_reason = v_reason,
		instructor_comment = v_comment,
		reviewed_by = v_reviewed_by,
		reviewed_at = v_reviewed_at
	where id = p_entry_id;

	perform public._notebook_log('override_entry', v_section, v_session, p_entry_id, v_old.student_id,
		jsonb_build_object(
			'before', jsonb_build_object(
				'session_id', v_old.session_id, 'section_id', v_old.section_id,
				'custom_label', v_old.custom_label, 'status', v_old.status,
				'flag_reason', v_old.flag_reason),
			'after', jsonb_build_object(
				'session_id', v_session, 'section_id', v_section,
				'custom_label', v_label, 'status', v_status,
				'flag_reason', v_reason)
		));

	return jsonb_build_object(
		'entry_id', p_entry_id,
		'session_id', v_session,
		'section_id', v_section,
		'custom_label', v_label,
		'status', v_status
	);
end;
$$;

revoke all on function public.notebook_admin_override_entry(uuid, boolean, uuid, boolean, uuid, text, text, text, text) from public;
grant execute on function public.notebook_admin_override_entry(uuid, boolean, uuid, boolean, uuid, text, text, text, text) to authenticated;
