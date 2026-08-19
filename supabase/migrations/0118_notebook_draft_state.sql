-- 0118_notebook_draft_state.sql
--
-- A NOTEBOOK ENTRY CAN BE A DRAFT. One nullable column decides it:
--
--   notebook_entries.submitted_at   null = a draft, private to the student
--                                   set  = turned in, and staff can see it
--
-- Data layer only. Two RPCs turn an entry in and pull it back, the two creating
-- RPCs learn to make a draft, every staff-facing read learns to skip one, and
-- the privacy boundary moves to match. The controls that call any of it are a
-- separate change and are deliberately not here.
--
-- NO STATE OR STATUS COLUMN. `notebook_entries.status`
-- (compliant/flagged/pending_review) stays exactly what it has always been: the
-- INSTRUCTOR's verdict on work they have seen. Draft-ness is the student's own
-- question and answers a different one -- "has anybody else been shown this
-- yet" -- so folding the two into one column would make every existing status
-- rule ambiguous the moment a draft existed. A timestamp rather than a boolean
-- for the reason 0091's `pinned_at` is one: it records WHEN, which a later
-- lateness rule would need and which a flag would have thrown away. This file
-- deliberately builds no such rule.
--
-- THE BACKFILL IS THE DANGEROUS PART OF THIS MIGRATION, AND IT IS GUARDED.
-- Every entry that exists today was turned in the moment it was created -- there
-- was no other way to make one -- so every existing row must come out
-- `submitted_at = upload_timestamp`. A row left null becomes invisible to every
-- instructor grid, roster, payload and class page AT ONCE, which is a term of
-- student work disappearing with nothing raised anywhere. So section 1 asserts
-- that no row is left null and fails the whole migration if one is.
--
-- AND IT RUNS EXACTLY ONCE, ON THE APPLY THAT ADDS THE COLUMN. Re-pasting a
-- migration is ordinary here (a first attempt fails partway, or somebody
-- re-runs the file), and an unguarded `update ... where submitted_at is null`
-- on the SECOND run would stamp every genuine draft in the school as turned in
-- -- silently, and with no way to tell which ones. The whole of section 1 sits
-- inside a catalog guard on the column's own existence for that reason, and the
-- assertion sits inside it too: after this migration has landed, a null is a
-- draft and asserting there are none would be asserting the feature away.
--
-- THE PRIVACY BOUNDARY IS TWO SITES, NOT ONE (section 5). `notebook_entries`
-- has its own staff SELECT policy AND `notebook_can_read_entry`, which is what
-- photos, notes and folders delegate to and what /api/notebook/photo/[id]
-- authorizes through. Fixing only the lists that sit above them would leave a
-- staff member able to fetch a draft's photo by id.
--
-- Apply manually in the Supabase SQL editor, after 0117.

-- ---------------------------------------------------------------------------
-- 1. The column, the backfill, and the assertion -- all three inside one guard
-- on whether the column already exists. See the header: this block must run on
-- the apply that adds the column and never again.
-- ---------------------------------------------------------------------------

do $$
declare
	v_existed boolean;
	v_total bigint;
	v_null bigint;
begin
	select exists (
		select 1 from information_schema.columns
		where table_schema = 'public'
			and table_name = 'notebook_entries'
			and column_name = 'submitted_at'
	) into v_existed;

	if v_existed then
		raise notice '0118: submitted_at already exists -- backfill SKIPPED (a null is a real draft now).';
		return;
	end if;

	alter table public.notebook_entries add column submitted_at timestamptz;

	-- IMMEDIATELY, in the same block: every row that exists at this moment
	-- predates drafts and was turned in when it was made. `upload_timestamp`
	-- rather than now() so the stamp is when the work actually arrived, which is
	-- what any later reading of this column (a lateness rule, an audit) would
	-- want -- now() would rewrite the entire history to the minute of the apply.
	update public.notebook_entries set submitted_at = upload_timestamp;

	select count(*), count(*) filter (where submitted_at is null)
	into v_total, v_null
	from public.notebook_entries;

	if v_null > 0 then
		raise exception
			'0118 backfill left % of % notebook_entries rows with a null submitted_at. Every pre-0118 entry was turned in when it was created, so a null here would hide that work from every instructor read. Migration aborted; nothing was committed.',
			v_null, v_total;
	end if;

	raise notice '0118: added submitted_at and backfilled % existing entries as turned in (0 left null).', v_total;
end;
$$;

comment on column public.notebook_entries.submitted_at is
	'When the student turned this entry in. NULL = a draft: private to the student, invisible to staff, and not presence on any grid. Set by notebook_submit_entry (and at creation unless p_submitted is false); cleared by notebook_unsubmit_entry, which refuses once reviewed_at is set.';

-- ---------------------------------------------------------------------------
-- 2. The two creating RPCs learn to make a draft.
--
-- `p_submitted boolean default true` on both, and the DEFAULT is what preserves
-- every existing caller: /api/notebook/upload and /api/notebook/note keep making
-- turned-in entries without naming the parameter, so a client deployed ahead of
-- this migration behaves exactly as it did.
--
-- THE OLD SIGNATURE IS DROPPED EXPLICITLY, and this is the trap this codebase
-- has been caught by before (0058, 0068, 0096). Adding a parameter -- even a
-- defaulted one -- changes a function's REAL signature, so `create or replace`
-- alone CREATES A SECOND OVERLOAD and leaves the old arity callable beside it.
-- PostgREST resolves a call by the argument NAMES supplied, so a caller that
-- omits `p_submitted` would keep hitting the pre-0118 function forever: entries
-- made, no `submitted_at` written, nothing raised anywhere, and a student's work
-- silently invisible to their teacher. Silent-wrong-function, not stale-code.
-- ---------------------------------------------------------------------------

drop function if exists public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid);

-- 0114's body, with the submitted stamp threaded into the one insert. Nothing
-- else changes: the folder check, the session/section resolution, the two
-- "nothing in it" refusals and the deliberate absence of an enrollment check
-- (0094's rule) are all verbatim.
create or replace function public.notebook_create_entry(
	p_student_id uuid,
	p_drive_file_id text default null,
	p_session_id uuid default null,
	p_section_id uuid default null,
	p_custom_label text default null,
	p_original_filename text default null,
	p_folder_id uuid default null,
	p_submitted boolean default true
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
	v_submitted timestamptz;
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

	-- `coalesce(p_submitted, true)` so an explicit null reads as the default
	-- rather than quietly making a draft nobody asked for.
	if coalesce(p_submitted, true) then
		v_submitted := now();
	end if;

	insert into public.notebook_entries
		(student_id, section_id, session_id, custom_label, folder_id, submitted_at)
	values (v_uid, v_section, p_session_id, v_label, p_folder_id, v_submitted)
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
		'submitted_at', v_submitted,
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid, boolean) from public;
grant execute on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid, boolean) to authenticated;

drop function if exists public.notebook_create_note_entry(jsonb, text, uuid, uuid, uuid);

-- 0114's body, same one-line change. The entry and its first note still land in
-- ONE transaction (0078's reason: a failed note must not strand an empty entry),
-- and a draft note entry is no different -- it is simply not turned in yet.
create or replace function public.notebook_create_note_entry(
	p_content jsonb,
	p_custom_label text default null,
	p_section_id uuid default null,
	p_folder_id uuid default null,
	p_session_id uuid default null,
	p_submitted boolean default true
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
	v_submitted timestamptz;
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
		-- posting pair.
		v_section := public._notebook_resolve_session_section(p_session_id, p_section_id, v_uid);
	else
		v_section := p_section_id;
		-- 0094's rule, unchanged and deliberately NOT an enrollment check.
		if v_section is not null and not exists (
			select 1 from public.classroom_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
	end if;

	if coalesce(p_submitted, true) then
		v_submitted := now();
	end if;

	insert into public.notebook_entries
		(student_id, section_id, session_id, custom_label, folder_id, submitted_at)
	values (v_uid, v_section, p_session_id, v_label, p_folder_id, v_submitted)
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
		'submitted_at', v_submitted,
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_note_entry(jsonb, text, uuid, uuid, uuid, boolean) from public;
grant execute on function public.notebook_create_note_entry(jsonb, text, uuid, uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Turning in, and pulling back.
--
-- Both on the EXACT shape 0116 and 0117's write RPCs already use: SECURITY
-- DEFINER, `set search_path = ''`, revoked from public, granted to
-- authenticated, returning jsonb. No new table grant and no new policy -- there
-- is still no direct client write path to `submitted_at`.
--
-- OWNER ONLY, AND THE WHERE CLAUSE IS THE AUTHORIZATION. Neither function takes
-- a student id: the caller is `auth.uid()` and the select that finds the row
-- requires `student_id = v_uid`, so "you can only turn in your own work" is a
-- property of the signature rather than a check somebody could get wrong. A
-- missing row and somebody else's row answer identically (the 0102 claim
-- convention), so probing an id here tells an outsider nothing.
-- ---------------------------------------------------------------------------

-- REFUSES AN EMPTY ENTRY, counting LIVE photos only. 0116 made a photo
-- removable, so "has a photo" and "has a photo row" stopped being the same
-- question -- an entry whose only page was removed has nothing in it, and
-- turning it in would put an empty row on an instructor's grid as if it were
-- work. Any note revision counts: which one is current is derived (0078) and
-- nothing here needs to know, since the question is only whether the entry says
-- anything at all.
--
-- ORDER: not found -> already turned in -> empty -> submit. Already-turned-in
-- comes first because a double click is the common case and "you already did"
-- is the useful answer to it; an entry that is both submitted and empty cannot
-- exist anyway (creation requires content, and the shell guard in section 6
-- protects a submitted entry from being emptied).
create or replace function public.notebook_submit_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_photos bigint;
	v_notes bigint;
	v_submitted_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	if v_entry.submitted_at is not null then
		raise exception 'That entry has already been turned in.';
	end if;

	select count(*) into v_photos
	from public.notebook_entry_photos p
	where p.entry_id = p_entry_id and p.removed_at is null;

	select count(*) into v_notes
	from public.notebook_entry_notes n
	where n.entry_id = p_entry_id;

	if v_photos = 0 and v_notes = 0 then
		raise exception 'This entry has nothing in it to turn in. Add a photo or write a note first.';
	end if;

	update public.notebook_entries e
	set submitted_at = now()
	where e.id = p_entry_id
	returning e.submitted_at into v_submitted_at;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'submitted_at', v_submitted_at
	);
end;
$$;

revoke all on function public.notebook_submit_entry(uuid) from public;
grant execute on function public.notebook_submit_entry(uuid) to authenticated;

-- Pulling an entry back to a draft.
--
-- THIS EXISTS SO THAT "TURN IN" IS NOT A TRAP. Without it the button is a
-- one-way door a student can hit by mistake, which is exactly the pressure that
-- makes people not use a feature at all.
--
-- IT COSTS THE INSTRUCTOR NOTHING, and that is why it is safe to offer: a
-- student can already add photos and notes to an entry after turning it in
-- (notebook_add_photo and notebook_add_note have never cared about review
-- state), so what an instructor sees was always live. This only withdraws work
-- NOBODY HAS ACTED ON YET -- `reviewed_at` is set by notebook_flag_entry and
-- notebook_resolve_entry, and once either has run the entry is part of a record
-- somebody else is keeping and the student stops being the only party to it.
--
-- ORDER: not found -> reviewed -> not submitted. Reviewed first because it is
-- the refusal that needs explaining; in practice the two are disjoint (a draft
-- cannot be reviewed -- section 5 refuses both review actions on one), so the
-- order only decides which message an oddly-shaped row gets, and "your
-- instructor has already looked at this" is the more useful of the two.
create or replace function public.notebook_unsubmit_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	if v_entry.reviewed_at is not null then
		raise exception 'Your instructor has already reviewed that entry, so you cannot pull it back. Ask them if you need to change it.';
	end if;
	if v_entry.submitted_at is null then
		raise exception 'That entry has not been turned in.';
	end if;

	update public.notebook_entries e
	set submitted_at = null
	where e.id = p_entry_id;

	return jsonb_build_object('ok', true, 'entry_id', p_entry_id);
end;
$$;

revoke all on function public.notebook_unsubmit_entry(uuid) from public;
grant execute on function public.notebook_unsubmit_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Staff cannot act on what staff cannot see.
--
-- Three functions that write a verdict onto somebody else's entry, and all
-- three refuse a draft. This is not belt-and-braces on top of section 5: those
-- functions are SECURITY DEFINER and resolve the row themselves, so RLS never
-- runs inside them and the read boundary cannot be what stops them.
--
-- The refusal is stated AFTER the existing authorization check in each one, so
-- a caller who manages nothing still learns nothing: an outsider gets the
-- outsider's message, and only somebody who genuinely manages the class is told
-- the entry is a draft.
-- ---------------------------------------------------------------------------

-- 0094's body, one refusal added.
create or replace function public.notebook_flag_entry(
	p_entry_id uuid,
	p_flag_reason text,
	p_instructor_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section uuid;
	v_submitted timestamptz;
	v_comment text := nullif(btrim(coalesce(p_instructor_comment, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_flag_reason is null or p_flag_reason not in
		('not_dated', 'illegible', 'insufficient_detail', 'appears_reconstructed', 'other')
	then
		raise exception 'Flag reason must be one of: not_dated, illegible, insufficient_detail, appears_reconstructed, other.';
	end if;

	select e.section_id, e.submitted_at into v_section, v_submitted
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;
	if not public.classroom_manages_section(v_section) then
		raise exception 'Only the section instructor or a site admin can flag notebook entries.';
	end if;
	if v_submitted is null then
		raise exception 'That entry has not been turned in yet, so there is nothing to review.';
	end if;

	update public.notebook_entries
	set status = 'flagged',
		flag_reason = p_flag_reason,
		instructor_comment = v_comment,
		reviewed_by = v_uid,
		reviewed_at = now()
	where id = p_entry_id;

	return jsonb_build_object('entry_id', p_entry_id, 'status', 'flagged', 'flag_reason', p_flag_reason);
end;
$$;

revoke all on function public.notebook_flag_entry(uuid, text, text) from public;
grant execute on function public.notebook_flag_entry(uuid, text, text) to authenticated;

-- 0094's body, the same refusal.
create or replace function public.notebook_resolve_entry(
	p_entry_id uuid,
	p_instructor_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section uuid;
	v_submitted timestamptz;
	v_comment text := nullif(btrim(coalesce(p_instructor_comment, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select e.section_id, e.submitted_at into v_section, v_submitted
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;
	if not public.classroom_manages_section(v_section) then
		raise exception 'Only the section instructor or a site admin can resolve notebook entries.';
	end if;
	if v_submitted is null then
		raise exception 'That entry has not been turned in yet, so there is nothing to review.';
	end if;

	update public.notebook_entries
	set status = 'compliant',
		flag_reason = null,
		instructor_comment = coalesce(v_comment, instructor_comment),
		reviewed_by = v_uid,
		reviewed_at = now()
	where id = p_entry_id;

	return jsonb_build_object('entry_id', p_entry_id, 'status', 'compliant');
end;
$$;

revoke all on function public.notebook_resolve_entry(uuid, text) from public;
grant execute on function public.notebook_resolve_entry(uuid, text) to authenticated;

-- 0117's body (the widened gate), the same refusal -- and it matters most here.
-- The audit log this writes is a record of staff removing a student's work; a
-- draft is work staff were never shown, so there is nothing for them to be
-- removing and nothing worth logging.
create or replace function public.notebook_staff_delete_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_found boolean;
	v_deleted_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	v_found := found;

	-- Authorization BEFORE state, and the two failures share one message.
	if not v_found or not (
		public.classroom_manages_section(v_entry.section_id)
		or public.notebook_manages_student(v_entry.student_id)
	) then
		raise exception 'That entry does not exist, or is not in a class you manage.';
	end if;

	-- A DRAFT IS FOLDED INTO THAT SAME MESSAGE rather than given its own. Every
	-- other refusal in this file is told only to somebody who manages the class,
	-- which is safe because they can already see the entry. This one is
	-- different: naming a draft here would confirm to a manager that a student
	-- is holding unturned-in work, which is precisely what a draft is private
	-- about. So it reads as "no such entry", which is what it is to them.
	if v_entry.submitted_at is null then
		raise exception 'That entry does not exist, or is not in a class you manage.';
	end if;

	if v_entry.deleted_at is not null then
		raise exception 'That entry has already been deleted.';
	end if;

	update public.notebook_entries e
	set deleted_at = now(), deleted_by = v_uid
	where e.id = p_entry_id
	returning e.deleted_at into v_deleted_at;

	-- The audit row, which is why this is a separate function rather than a
	-- branch of the student's own path: a student tidying their own notebook is
	-- not an event anyone reviews, and staff removing somebody else's work is.
	perform public._notebook_log(
		'delete_entry',
		v_entry.section_id,
		v_entry.session_id,
		p_entry_id,
		v_entry.student_id,
		jsonb_build_object(
			'custom_label', v_entry.custom_label,
			'status', v_entry.status,
			'reviewed_at', v_entry.reviewed_at,
			'upload_timestamp', v_entry.upload_timestamp
		)
	);

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'student_id', v_entry.student_id,
		'deleted_at', v_deleted_at
	);
end;
$$;

revoke all on function public.notebook_staff_delete_entry(uuid) from public;
grant execute on function public.notebook_staff_delete_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. THE PRIVACY BOUNDARY, AND IT IS TWO SITES.
--
-- `notebook_entries` carries its own staff SELECT policy AND
-- `notebook_can_read_entry`. 0106's own header says why both exist: "the policy
-- governs a direct select and the function governs every delegated one". The
-- delegated ones are the photos (0069), the notes (0078) and the folder name
-- (0088) -- and /api/notebook/photo/[photo_id], which authorizes a Drive fetch
-- through exactly that chain.
--
-- SO FIXING ONLY THE LISTS IN SECTION 6 WOULD NOT BE A BOUNDARY. A draft
-- excluded from the grid, the roster and the payload but still readable by a
-- staff member holding its id is a draft whose pages can be fetched one by one
-- through the photo proxy. Both sites get the same clause here for the same
-- reason 0106 gave them one: they must not be able to disagree.
--
-- THE OWNER'S BRANCH IS UNTOUCHED IN BOTH. A student reads their own draft --
-- that is the entire point of one -- so the clause wraps only the staff half.
-- ---------------------------------------------------------------------------

drop policy if exists "section staff read notebook entries" on public.notebook_entries;
create policy "section staff read notebook entries"
	on public.notebook_entries
	for select
	to authenticated
	using (
		submitted_at is not null
		and (
			public.classroom_manages_section(section_id)
			or public.notebook_manages_student(student_id)
		)
	);

-- 0106's body, the same clause. The student's own branch is first and untouched.
create or replace function public.notebook_can_read_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.notebook_entries e
		where e.id = p_entry_id
			and (
				e.student_id = (select auth.uid())
				or (
					e.submitted_at is not null
					and (
						public.classroom_manages_section(e.section_id)
						or public.notebook_manages_student(e.student_id)
					)
				)
			)
	);
$$;

revoke all on function public.notebook_can_read_entry(uuid) from public;
grant execute on function public.notebook_can_read_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The shell guard relaxes FOR DRAFTS ONLY.
--
-- 0116 refuses to remove the last thing in an entry, because an entry with no
-- live photo and no note is a shell -- an untitled row in the feed with nothing
-- in it. That reasoning holds for a turned-in entry and gets in the way of a
-- draft: a student who photographed the wrong page has to be able to take it
-- out and put the right one in, and without this the only route is deleting the
-- whole draft and starting again.
--
-- A DRAFT MAY BE EMPTIED; A SUBMITTED ENTRY MAY NOT. An empty draft is
-- invisible to everyone but its author and cannot be turned in (section 3
-- refuses it), so it is a half-finished thing on the student's own screen --
-- which is what a draft is. An empty SUBMITTED entry would be a blank row on an
-- instructor's grid claiming presence, which is the outcome 0116's guard exists
-- to prevent, so it stays exactly as it was there.
--
-- 0116's body otherwise verbatim, including the entry-level lock that stops two
-- concurrent removals each seeing the other photo as remaining.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_remove_photo(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_photo public.notebook_entry_photos%rowtype;
	v_student uuid;
	v_submitted timestamptz;
	v_remaining bigint;
	v_notes bigint;
	v_removed_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_photo_id is null then
		raise exception 'Which photo?';
	end if;

	select p.* into v_photo
	from public.notebook_entry_photos p
	where p.id = p_photo_id
	for update;
	if not found then
		raise exception 'That photo does not exist or is not yours.';
	end if;

	-- Locks the ENTRY too, so two concurrent removals cannot each see the other
	-- photo as "remaining" and empty the entry between them.
	select e.student_id, e.submitted_at into v_student, v_submitted
	from public.notebook_entries e
	where e.id = v_photo.entry_id
	for update;

	if v_student is distinct from v_uid then
		raise exception 'That photo does not exist or is not yours.';
	end if;
	if v_photo.removed_at is not null then
		raise exception 'That photo has already been removed.';
	end if;

	select count(*) into v_remaining
	from public.notebook_entry_photos p
	where p.entry_id = v_photo.entry_id
		and p.removed_at is null
		and p.id <> p_photo_id;

	-- ANY note revision counts. Which revision is current is derived (0078) and
	-- nothing here needs to know: the question is only whether the entry still
	-- says something once this photo is gone.
	select count(*) into v_notes
	from public.notebook_entry_notes n
	where n.entry_id = v_photo.entry_id;

	if v_remaining = 0 and v_notes = 0 and v_submitted is not null then
		raise exception 'That is the only thing in this entry. Delete the whole entry instead.';
	end if;

	update public.notebook_entry_photos p
	set removed_at = now(), removed_by = v_uid
	where p.id = p_photo_id
	returning p.removed_at into v_removed_at;

	return jsonb_build_object(
		'ok', true,
		'photo_id', p_photo_id,
		'entry_id', v_photo.entry_id,
		'removed_at', v_removed_at
	);
end;
$$;

revoke all on function public.notebook_remove_photo(uuid) from public;
grant execute on function public.notebook_remove_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. THE EXCLUSION SWEEP. A draft is not presence.
--
-- Section 5 is the boundary; this is the half that decides what a staff member
-- is SHOWN. The two are separate jobs: the policy and the read function govern
-- the tables, and these four functions are SECURITY DEFINER, so RLS never runs
-- inside them at all and every one has to say so itself.
--
-- THE LIST WAS BUILT BY ENUMERATION, NOT FROM MEMORY -- every live function and
-- view in the schema whose body names `notebook_entries` was walked (24 of
-- them), which is how the detach count below turned up. What is NOT here, and
-- why, is recorded at the end of this section.
--
-- 0116's definitions, with one clause added in five places. Everything else is
-- verbatim; the base was diffed against 0116 to confirm nothing else moved.
-- ---------------------------------------------------------------------------

-- 7a. The grid roster. The `holders` branch keeps a student who LEFT a class
-- but filed work in it on the grid -- so a student whose only entries in this
-- section are DRAFTS must not be a holder, or a departed student would be put
-- back on the roster by work nobody in the class has been shown.
create or replace function public._notebook_section_roster(p_section_id uuid)
returns table (
	student_key text,
	student_id uuid,
	email text,
	name text,
	enrolled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
	with enrolled as (
		select
			ce.student_email as email,
			ce.display_name as roster_name,
			public._notebook_user_id_for_email(ce.student_email) as student_id
		from public.classroom_enrollments ce
		where ce.section_id = p_section_id
			and ce.active
	),
	holders as (
		select
			p.id as student_id,
			public._notebook_email_for_user(p.id) as email
		from public.profiles p
		where exists (
				select 1 from public.notebook_entries e
				where e.student_id = p.id
					and e.section_id = p_section_id
					and e.deleted_at is null
					and e.submitted_at is not null
			)
			or exists (
				select 1
				from public.notebook_session_excusals x
				join public.notebook_session_postings pg on pg.session_id = x.session_id
				where x.student_id = p.id and pg.section_id = p_section_id
			)
	),
	combined as (
		select e.email, e.student_id, e.roster_name, true as enrolled
		from enrolled e
		union all
		select h.email, h.student_id, null::text as roster_name, false as enrolled
		from holders h
		where not exists (
			select 1 from enrolled e
			where e.student_id = h.student_id
				or (h.email is not null and e.email = h.email)
		)
	)
	select
		coalesce(c.email, c.student_id::text) as student_key,
		c.student_id,
		coalesce(c.email, p.email) as email,
		coalesce(
			nullif(btrim(c.roster_name), ''),
			nullif(btrim(p.display_name), ''),
			nullif(btrim(p.full_name), ''),
			c.email,
			p.email,
			'Student'
		) as name,
		c.enrolled
	from combined c
	left join public.profiles p on p.id = c.student_id;
$$;

revoke all on function public._notebook_section_roster(uuid) from public;

-- 7b. The compliance grid. Three reads of notebook_entries plus the roster's,
-- and they are one question asked four ways:
--
--   * free_entries -- a count beside a student's name.
--   * latest       -- the distinct-on that picks WHICH entry a cell shows.
--                     Without the clause a draft can be the newest one and win
--                     the pick, so a cell would report a status for work the
--                     instructor has never been shown -- and, worst of all,
--                     would read as PRESENT for a check-in nobody turned in.
--   * counts       -- the multi-entry badge.
--   * (the roster, 7a.)
--
-- A STUDENT HOLDING ONLY A DRAFT THEREFORE READS AS `missing`, which is the
-- honest answer and the one the whole feature rests on: the cell falls through
-- to the same branch it takes for a student who filed nothing, because from the
-- instructor's side that is exactly what has happened.
--
-- The manager's own outstanding badge on the class page is `gridSummary` over
-- this same payload, so a draft counts as OUTSTANDING there for free -- no
-- separate change, and no way for the two numbers to disagree.
create or replace function public.notebook_get_section_grid(
	p_section_id uuid,
	p_unit_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section record;
	v_sessions jsonb;
	v_students jsonb;
	v_cells jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select s.id, s.label, s.block, s.teacher_email, c.code as course_code, c.title as course_title
	into v_section
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where s.id = p_section_id;
	if not found then
		raise exception 'That section does not exist.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section instructor or a site admin can view the notebook grid.';
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', ss.id,
			'unit_number', ss.unit_number,
			'session_date', ss.session_date,
			'session_label', ss.session_label,
			'section_ids', to_jsonb(public._notebook_session_sections(ss.id))
		) order by ss.session_date, ss.unit_number, ss.session_label, ss.id), '[]'::jsonb)
	into v_sessions
	from public.notebook_sessions ss
	join public.notebook_session_postings pg on pg.session_id = ss.id
	where pg.section_id = p_section_id
		and (p_unit_number is null or ss.unit_number = p_unit_number);

	select coalesce(jsonb_agg(jsonb_build_object(
			'student_key', r.student_key,
			'id', r.student_id,
			'name', r.name,
			'email', r.email,
			'enrolled', r.enrolled,
			'free_entries', (
				select count(*)
				from public.notebook_entries e
				where e.student_id = r.student_id
					and e.section_id = p_section_id
					and e.session_id is null
					and e.deleted_at is null
					and e.submitted_at is not null
			)
		) order by r.name, r.student_key), '[]'::jsonb)
	into v_students
	from public._notebook_section_roster(p_section_id) r;

	with roster as (
		select * from public._notebook_section_roster(p_section_id)
	),
	sess as (
		select ss.id, ss.session_date, ss.unit_number, ss.session_label
		from public.notebook_sessions ss
		join public.notebook_session_postings pg on pg.session_id = ss.id
		where pg.section_id = p_section_id
			and (p_unit_number is null or ss.unit_number = p_unit_number)
	),
	latest as (
		-- SCOPED TO THIS SECTION, which the single-section model got for free:
		-- a check-in shared with another class also holds that class's entries,
		-- and they belong on that class's grid, not this one.
		select distinct on (e.session_id, e.student_id)
			e.session_id, e.student_id, e.id, e.status, e.flag_reason, e.upload_timestamp
		from public.notebook_entries e
		where e.session_id in (select id from sess)
			and e.section_id = p_section_id
			and e.deleted_at is null
			and e.submitted_at is not null
		order by e.session_id, e.student_id, e.upload_timestamp desc, e.id desc
	),
	counts as (
		select e.session_id, e.student_id, count(*) as n
		from public.notebook_entries e
		where e.session_id in (select id from sess)
			and e.section_id = p_section_id
			and e.deleted_at is null
			and e.submitted_at is not null
		group by e.session_id, e.student_id
	)
	select coalesce(jsonb_agg(jsonb_build_object(
			'student_key', r.student_key,
			'student_id', r.student_id,
			'session_id', se.id,
			'status', case
				when l.id is not null then l.status
				when x.session_id is not null then 'excused'
				else 'missing'
			end,
			'entry_id', l.id,
			'entry_count', coalesce(c.n, 0),
			'upload_timestamp', l.upload_timestamp,
			'on_time', case
				when l.id is null then null
				else ((l.upload_timestamp at time zone 'America/Los_Angeles')::date <= se.session_date)
			end,
			'excused', (x.session_id is not null),
			'flag_reason', l.flag_reason
		) order by r.name, r.student_key, se.session_date, se.unit_number, se.session_label, se.id), '[]'::jsonb)
	into v_cells
	from roster r
	cross join sess se
	left join latest l on l.session_id = se.id and l.student_id = r.student_id
	left join counts c on c.session_id = se.id and c.student_id = r.student_id
	left join public.notebook_session_excusals x
		on x.session_id = se.id and x.student_id = r.student_id;

	return jsonb_build_object(
		'section', jsonb_build_object(
			'id', v_section.id,
			'course_code', v_section.course_code,
			'course_title', v_section.course_title,
			'label', v_section.label,
			'block', v_section.block,
			'teacher_email', v_section.teacher_email
		),
		'unit_number', p_unit_number,
		'generated_at', now(),
		'sessions', v_sessions,
		'students', v_students,
		'cells', v_cells
	);
end;
$$;

revoke all on function public.notebook_get_section_grid(uuid, integer) from public;
grant execute on function public.notebook_get_section_grid(uuid, integer) to authenticated;

-- 7c. Detaching a check-in's entries. THE UPDATE STILL COVERS EVERY ENTRY,
-- DRAFTS AND DELETED ONES INCLUDED, AND MUST: the composite key to
-- notebook_session_postings (0098) means a posting cannot be removed while any
-- entry still points at it, so leaving drafts attached would trade a wrong
-- count for a foreign-key violation.
--
-- Only the RETURNED COUNT changes -- the number a teacher reads as "N entries
-- were kept and relabelled". Counting a draft there would both overstate the
-- work in the class and tell a teacher that a student is holding something they
-- have not turned in, which is the one thing a draft is private about.
create or replace function public._notebook_detach_session_entries(
	p_session_id uuid,
	p_section_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_fallback text;
	v_detached integer;
begin
	select left(coalesce(
		nullif(btrim(ss.session_label), ''),
		'Unit ' || ss.unit_number || ' session (deleted)'
	), 200)
	into v_fallback
	from public.notebook_sessions ss
	where ss.id = p_session_id;

	-- Counted BEFORE the update, which is when `session_id` still identifies
	-- the rows in question.
	select count(*) into v_detached
	from public.notebook_entries e
	where e.session_id = p_session_id
		and (p_section_id is null or e.section_id = p_section_id)
		and e.deleted_at is null
		and e.submitted_at is not null;

	update public.notebook_entries e
	set session_id = null,
		custom_label = coalesce(nullif(btrim(e.custom_label), ''), v_fallback)
	where e.session_id = p_session_id
		and (p_section_id is null or e.section_id = p_section_id);

	return coalesce(v_detached, 0);
end;
$$;

revoke all on function public._notebook_detach_session_entries(uuid, uuid) from public;

-- 7d. One student's whole notebook as a payload (0117's definition, three
-- clauses added). This feeds BOTH notebook_review_student_notebook (an
-- instructor opening a name on the grid) and notebook_view_as_notebook (an
-- admin previewing a student's own screen), which is why the clauses belong
-- here rather than in either caller.
--
-- THE VIEW-AS PREVIEW IS DELIBERATELY LESS FAITHFUL THAN IT WAS, AND THIS IS
-- THE ONE PLACE THIS MIGRATION KNOWINGLY DIVERGES FROM 0116'S STATED REASON FOR
-- FILTERING THIS FUNCTION. 0116 excluded deleted entries here partly because
-- "the view-as preview's whole promise is that it shows what the student sees,
-- and a student does not see their deleted work" -- the filter and the promise
-- agreed. A student DOES see their own drafts, so here they disagree, and
-- privacy wins: an admin previewing a student's screen must not be the way an
-- unturned-in draft becomes visible. What the preview loses is a row the
-- student has not shown anybody; what it would otherwise cost is the whole
-- point of the feature.
--
-- `deleted_entries` gets the clause too. A deleted DRAFT is doubly not staff's
-- to see, and the surfaces that render that key offer a staff Restore control
-- -- restoring an entry they were never shown. The student's own trash reads
-- their deleted drafts through their own query, which is unfiltered by design.
create or replace function public._notebook_student_payload(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_uid uuid := public._notebook_user_id_for_email(v_email);
	v_name text;
	v_sections uuid[];
	v_section_label text;
	v_entries jsonb;
	v_deleted_entries jsonb;
	v_folders jsonb;
	v_sessions jsonb;
	v_activity jsonb;
begin
	select min(e.display_name) into v_name
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	select coalesce(array_agg(e.section_id), '{}'::uuid[]) into v_sections
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	select case
			when count(*) = 0 then null
			when count(*) = 1 then min(nullif(concat_ws(' · ', c.code, s.label), ''))
			else count(*)::text || ' classes'
		end
	into v_section_label
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where s.id = any(v_sections);

	-- THEIR ENTRIES, ALL OF THEM -- every section and none, which is the point
	-- of 0106. It matches what the staff policy allows either caller to select
	-- directly, so this payload can never be a wider door than the ordinary
	-- read; the deleted ones are the one thing it is now narrower by.
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', e.id,
			'session_id', e.session_id,
			'section_id', e.section_id,
			'folder_id', e.folder_id,
			'pinned_at', e.pinned_at,
			'custom_label', e.custom_label,
			'upload_timestamp', e.upload_timestamp,
			'status', e.status,
			'flag_reason', e.flag_reason,
			'instructor_comment', e.instructor_comment,
			'session', (
				select jsonb_build_object(
					'session_label', ss.session_label,
					'unit_number', ss.unit_number,
					'session_date', ss.session_date
				)
				from public.notebook_sessions ss where ss.id = e.session_id
			),
			'photos', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', p.id,
					'drive_file_id', p.drive_file_id,
					'variant', p.variant,
					'sequence_order', p.sequence_order,
					'original_filename', p.original_filename
				) order by p.sequence_order)
				from public.notebook_entry_photos p
				where p.entry_id = e.id and p.removed_at is null
			), '[]'::jsonb),
			-- EVERY revision: which one is current is derived client-side
			-- (noteThreads) and the feed shows the history.
			'notes', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', n.id,
					'entry_id', n.entry_id,
					'note_id', n.note_id,
					'revision', n.revision,
					'content', n.content,
					'created_at', n.created_at
				) order by n.created_at, n.revision)
				from public.notebook_entry_notes n where n.entry_id = e.id
			), '[]'::jsonb)
		) order by e.upload_timestamp desc), '[]'::jsonb)
	into v_entries
	from public.notebook_entries e
	where e.student_id = v_uid
		and e.deleted_at is null
		and e.submitted_at is not null;

	-- THEIR DELETED ENTRIES (0117), separately -- newest-removed first, and
	-- deliberately shallow (see the migration header).
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', e.id,
			'custom_label', e.custom_label,
			'session', (
				select jsonb_build_object(
					'session_label', ss.session_label,
					'unit_number', ss.unit_number,
					'session_date', ss.session_date
				)
				from public.notebook_sessions ss where ss.id = e.session_id
			),
			'upload_timestamp', e.upload_timestamp,
			'deleted_at', e.deleted_at,
			'deleted_by', e.deleted_by
		) order by e.deleted_at desc), '[]'::jsonb)
	into v_deleted_entries
	from public.notebook_entries e
	where e.student_id = v_uid
		and e.deleted_at is not null
		and e.submitted_at is not null;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', f.id, 'name', f.name, 'color', f.color, 'created_at', f.created_at
		) order by f.name), '[]'::jsonb)
	into v_folders
	from public.notebook_folders f
	where f.student_id = v_uid;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', ss.id,
			'section_id', pg.section_id,
			'unit_number', ss.unit_number,
			'session_date', ss.session_date,
			'session_label', ss.session_label
		) order by ss.session_date desc, ss.id), '[]'::jsonb)
	into v_sessions
	from public.notebook_session_postings pg
	join public.notebook_sessions ss on ss.id = pg.session_id
	where pg.section_id = any(v_sections);

	-- The view already excludes deleted entries (4a of 0116), so this needs no
	-- clause for those. IT DOES NEED ONE FOR DRAFTS, and the join is the whole
	-- reason: notebook_entry_activity is `security_invoker`, so selected by a
	-- staff member DIRECTLY it is already scoped by the policy in section 5 and
	-- a draft cannot come back. Read from inside a SECURITY DEFINER function it
	-- is not -- the invoker is this function's owner, which sees every row -- so
	-- the one place the view can leak a draft is exactly here, and it is the
	-- reason `student_id` is already filtered by hand two lines down.
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', a.id, 'last_activity_at', a.last_activity_at
		)), '[]'::jsonb)
	into v_activity
	from public.notebook_entry_activity a
	join public.notebook_entries e on e.id = a.id
	where a.student_id = v_uid
		and e.submitted_at is not null;

	return jsonb_build_object(
		'student', jsonb_build_object(
			'email', v_email,
			'display_name', v_name,
			-- null = on a roster, no account yet.
			'user_id', v_uid
		),
		'section_label', v_section_label,
		'entries', v_entries,
		'deleted_entries', v_deleted_entries,
		'folders', v_folders,
		'sessions', v_sessions,
		'activity', v_activity
	);
end;
$$;

revoke all on function public._notebook_student_payload(text) from public;

-- ---------------------------------------------------------------------------
-- 7e. WHAT WAS WALKED AND DELIBERATELY LEFT ALONE. Recorded because the next
-- person to add a reason to hide a row will read this list rather than redo the
-- enumeration -- and because "I checked it" is only useful written down.
--
--   notebook_entry_activity (the VIEW itself)
--     Untouched. It is `security_invoker`, so it can never return more than the
--     caller's own RLS allows: a staff member selecting it gets exactly the
--     entries section 5 lets them read, and the OWNER gets their drafts, which
--     they should -- a draft is real activity to the person writing it, and the
--     recent-activity sort on their own feed has to see it. The one caller that
--     bypasses invoker rights is _notebook_student_payload, and that is where
--     the clause went (7d). A filter on the view would have been the wrong
--     answer in both directions at once.
--
--   notebook_delete_folder (the "N entries moved to Unfiled" count)
--     Untouched, and its sibling in 7c was changed -- the difference is who
--     reads the number. The detach count is shown to a TEACHER; this one is
--     shown to the STUDENT deleting their own folder, and their drafts are
--     theirs, in it, and about to be unfiled. Excluding them would undercount
--     the student's own work to the student.
--
--   notebook_admin_override_entry
--     Untouched. It is the chair-tier repair hatch (0069) -- repoint a section,
--     fix a mis-set status, relabel -- not a review action: it never decides
--     whether work counts, and it logs before/after on every call. It is also
--     the ONLY path that can correct a draft filed against the wrong section,
--     and gating it would leave that row unrepairable by anyone. The three
--     functions section 4 does gate are the three that write a verdict.
--
--   notebook_staff_restore_entry
--     Untouched. It only ever acts on an already-deleted row, which is
--     invisible to staff whether or not it is a draft, and refusing would
--     strand the one row a staff member might legitimately be undoing their own
--     deletion of.
--
--   notebook_add_photo, notebook_add_note, notebook_edit_note,
--   notebook_move_entries, notebook_set_entry_pinned, notebook_set_entry_label,
--   notebook_delete_entry, notebook_restore_entry, notebook_restore_photo
--     Untouched. Every one is an OWNER-ONLY write against a row the caller
--     already named, so none can put a draft into anybody else's list and all
--     of them are things a student must be able to do to a draft -- adding to
--     one is what a draft is FOR.
--
--   notebook_admin_set_excusal, _notebook_resolve_session_section,
--   _notebook_session_sections, _notebook_manages_session
--     Untouched: none of them reads notebook_entries at all (confirmed by the
--     enumeration, not by memory).
-- ---------------------------------------------------------------------------
