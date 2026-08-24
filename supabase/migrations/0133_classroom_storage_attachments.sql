-- ---------------------------------------------------------------------------
-- 0133 -- CLASSROOM ATTACHMENTS AND SUBMISSION FILES MOVE TO SUPABASE STORAGE.
--
-- WHAT THIS IS FOR. Every classroom attachment byte in production today lives
-- in the school Google shared drive, and every one of them travelled there
-- THROUGH the serverless function: browser -> multipart POST -> whole file
-- buffered in memory -> a second multipart/related POST to Drive. That shape
-- is what forced MAX_ATTACHMENT_BYTES to 4 MiB, and a 4 MiB ceiling is not a
-- ceiling an engineering class can work under. A 60 MB SLDASM is an ordinary
-- thing for a student to hand in.
--
-- So the bytes stop going through the app. The browser writes them straight
-- into a PRIVATE Supabase bucket against a signed upload URL the app mints,
-- and reads them back through a short-lived signed download URL. The app
-- server carries the AUTHORIZATION and the ROW, never the payload.
--
-- THE TYPE LISTS ARE GONE ON PURPOSE, AND THIS IS WHERE THAT IS SAFE.
-- `allowed_mime_types` is NULL on both buckets: nothing here refuses a file
-- for what it is. What makes that safe is not a list, it is three properties
-- this migration and its route half establish together:
--   1. The buckets are PRIVATE. There is no public URL for any object.
--   2. Every read is a signed URL carrying `download=<filename>`, so the
--      response is Content-Disposition: attachment. Nothing a person uploaded
--      is ever rendered inline, in any origin, ever.
--   3. Every object is stored as application/octet-stream (the route's job),
--      so a browser is never handed a content type a student chose.
-- A bucket that refused `.exe` and served `.svg` inline would have the safety
-- exactly backwards. Do not add an allowlist here; if one is ever wanted, it
-- belongs in front of a rule about DISPOSITION, not instead of one.
--
-- THE KEY LAYOUT IS THE AUTHORIZATION, WHICH IS WHY IT IS NOT COSMETIC:
--   classroom-attachments/<item_id>/<uuid>.<ext>
--   submission-files/<submission_id>/<uuid>.<ext>
-- The FIRST PATH SEGMENT is the owning row's id, and every policy below reads
-- it and asks the classroom's OWN existing predicate about it. There is no
-- second authorization model here: `classroom_can_read_item`,
-- `_classroom_manages_item` and `classroom_can_review_submission` are the same
-- functions the tables' own policies already use. Nothing about who may see a
-- handout is restated in this file.
--
-- The rest of the key is a uuid and the lowercased original extension. It is
-- OPAQUE: the name a person typed is stored in `filename` and shown to them,
-- and never appears in a path. That is what removes filename sanitization from
-- the security surface entirely rather than making it careful.
--
-- WHAT IS DELIBERATELY NOT HERE: `classroom_instructor_attachments`. Its read
-- rule is manager-only (`classroom_can_read_instructor_material`), which is
-- NOT "anyone who can read the item" -- so an instructor-only answer key
-- cannot share the classroom-attachments prefix without leaking to every
-- enrolled student, and giving it a bucket of its own is a third bucket this
-- bundle was not scoped for. Instructor-only material keeps the Drive path
-- unchanged, including its 4 MiB ceiling. That is a stated gap, not an
-- oversight.
--
-- NOTHING IS BACKFILLED AND NOTHING IS MOVED. `drive_file_id` stops being NOT
-- NULL and gains `storage_key` beside it, exactly one of the two per row (a
-- CHECK, not a convention). Every attachment already posted keeps its Drive id
-- and keeps serving through the existing proxy, byte for byte, with no change
-- to its route. A row is a storage row if and only if `storage_key` is set.
--
-- WHAT UNDOES THIS MIGRATION is at the bottom of the file, in a comment.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The two buckets.
--
-- PRIVATE, no mime list, 200 MiB (209715200 bytes). The size limit is the one
-- gate that stays, because an unbounded bucket is a billing incident rather
-- than a policy decision -- and it is enforced by STORAGE, so it applies to
-- the signed upload URL too and cannot be talked past by a client.
--
-- `on conflict do update` rather than `do nothing`: re-pasting this file must
-- reassert the three properties, not silently accept whatever is there.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('classroom-attachments', 'classroom-attachments', false, 209715200, null)
on conflict (id) do update
	set public = false,
		file_size_limit = 209715200,
		allowed_mime_types = null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submission-files', 'submission-files', false, 209715200, null)
on conflict (id) do update
	set public = false,
		file_size_limit = 209715200,
		allowed_mime_types = null;

-- ---------------------------------------------------------------------------
-- 2. Where the bytes are, on the row.
--
-- `drive_file_id` loses NOT NULL and `storage_key` arrives beside it, with a
-- CHECK that exactly one is present. Not a nullable pair with a convention:
-- a row with both is a row two sweepers would each think they own, and a row
-- with neither is an attachment with no bytes that still renders in a list.
-- ---------------------------------------------------------------------------

alter table public.classroom_attachments
	add column if not exists storage_key text;

alter table public.classroom_attachments
	alter column drive_file_id drop not null;

alter table public.classroom_submission_files
	add column if not exists storage_key text;

alter table public.classroom_submission_files
	alter column drive_file_id drop not null;

-- Postgres has no `add constraint if not exists`, and a blind drop-then-add
-- raises 2BP01 on a re-paste. Guard on the catalog.
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_attachments_one_handle'
			and conrelid = 'public.classroom_attachments'::regclass
	) then
		alter table public.classroom_attachments
			add constraint classroom_attachments_one_handle check (
				(drive_file_id is not null and storage_key is null)
				or (drive_file_id is null and storage_key is not null)
			);
	end if;

	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_attachments_storage_key_shape'
			and conrelid = 'public.classroom_attachments'::regclass
	) then
		alter table public.classroom_attachments
			add constraint classroom_attachments_storage_key_shape check (
				storage_key is null
				or char_length(btrim(storage_key)) between 1 and 400
			);
	end if;

	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_submission_files_one_handle'
			and conrelid = 'public.classroom_submission_files'::regclass
	) then
		alter table public.classroom_submission_files
			add constraint classroom_submission_files_one_handle check (
				(drive_file_id is not null and storage_key is null)
				or (drive_file_id is null and storage_key is not null)
			);
	end if;

	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_submission_files_storage_key_shape'
			and conrelid = 'public.classroom_submission_files'::regclass
	) then
		alter table public.classroom_submission_files
			add constraint classroom_submission_files_storage_key_shape check (
				storage_key is null
				or char_length(btrim(storage_key)) between 1 and 400
			);
	end if;
end;
$$;

-- The orphan count on delete reads this the way it already reads drive_file_id.
create index if not exists classroom_attachments_storage_key_idx
	on public.classroom_attachments (storage_key);
create index if not exists classroom_submission_files_storage_key_idx
	on public.classroom_submission_files (storage_key);

-- ---------------------------------------------------------------------------
-- 3. The path predicates.
--
-- ONE reader of the key layout, used by every policy below and by the write
-- RPCs, so "what does the first segment mean" is stated once. It returns NULL
-- for anything that is not a bare uuid in segment 1 -- a traversal attempt, a
-- flat key, an empty name -- and every caller is written so that NULL FAILS
-- CLOSED rather than matching a row.
--
-- `split_part` rather than `storage.foldername`: this must be readable outside
-- a storage context (the RPCs check it too), and a pure text function is one
-- fewer thing that has to exist for a test to evaluate the rule.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_storage_prefix_uuid(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
	select case
		when split_part(coalesce(p_name, ''), '/', 1)
			~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		then split_part(p_name, '/', 1)::uuid
	end;
$$;

revoke all on function public._classroom_storage_prefix_uuid(text) from public;
grant execute on function public._classroom_storage_prefix_uuid(text) to authenticated, service_role;

-- May the caller WRITE (or remove) an object under this key? The teacher of
-- record for every class the item is posted to, and an admin -- which is what
-- `_classroom_manages_item` already means, and `classroom_manages_section`
-- inside it is where `is_admin()` enters. There is no separate admin branch
-- here, deliberately: a second spelling of "or admin" is a second thing that
-- can stop agreeing with the first.
--
-- SECURITY DEFINER because `_classroom_manages_item` is revoked from public;
-- an inner call from a definer runs with the owner's rights while
-- `auth.uid()` / `current_user_email()` still read the CALLER'S claims. That
-- is the established reuse mechanism here, not a widening.
create or replace function public.classroom_can_write_attachment_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public._classroom_manages_item(public._classroom_storage_prefix_uuid(p_name));
$$;

revoke all on function public.classroom_can_write_attachment_object(text) from public;
grant execute on function public.classroom_can_write_attachment_object(text) to authenticated;

-- May the caller READ an object under this key? Whoever may read the item --
-- its managers, and an actively enrolled student once it is PUBLISHED. A
-- draft's files are unreachable for a student by construction, and so are
-- another section's, because that is what `classroom_can_read_item` says and
-- this file does not restate it.
create or replace function public.classroom_can_read_attachment_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public.classroom_can_read_item(public._classroom_storage_prefix_uuid(p_name));
$$;

revoke all on function public.classroom_can_read_attachment_object(text) from public;
grant execute on function public.classroom_can_read_attachment_object(text) to authenticated;

-- Is this the caller's OWN submission? Insert, select and delete on a
-- submission file are all this: a student reaches their own work and nothing
-- else. Keyed on the email, which is what the submission row carries.
create or replace function public.classroom_owns_submission_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.classroom_submissions s
		where s.id = public._classroom_storage_prefix_uuid(p_name)
			and s.student_email = public.current_user_email()
	);
$$;

revoke all on function public.classroom_owns_submission_object(text) from public;
grant execute on function public.classroom_owns_submission_object(text) to authenticated;

-- READ is the owner OR the teacher of record for that student in that section
-- (and an admin, again via `classroom_manages_section` inside the review
-- predicate). `classroom_can_review_submission` is the SAME function
-- `classroom_submission_files`' own policy uses, so a student can no more read
-- another student's object than they can read their row.
create or replace function public.classroom_can_read_submission_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.classroom_submissions s
		where s.id = public._classroom_storage_prefix_uuid(p_name)
			and (
				s.student_email = public.current_user_email()
				or public.classroom_can_review_submission(s.item_id, s.student_email)
			)
	);
$$;

revoke all on function public.classroom_can_read_submission_object(text) from public;
grant execute on function public.classroom_can_read_submission_object(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage RLS.
--
-- `storage.objects` already has RLS on, and a bucket no policy names is denied
-- to `authenticated` and `anon` by default (the foundry-bundles mechanism).
-- These policies are therefore the WHOLE of what either bucket permits.
--
-- There is deliberately no UPDATE policy on either bucket. A key is a fresh
-- uuid every time, so nothing legitimately overwrites an object; an upsert
-- that could would let a re-upload silently replace bytes a teacher has
-- already graded against.
--
-- No existing bucket is touched by this file.
-- ---------------------------------------------------------------------------

drop policy if exists "classroom attachments insert by item manager" on storage.objects;
create policy "classroom attachments insert by item manager"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'classroom-attachments'
		and public.classroom_can_write_attachment_object(name)
	);

drop policy if exists "classroom attachments readable by item readers" on storage.objects;
create policy "classroom attachments readable by item readers"
	on storage.objects
	for select
	to authenticated
	using (
		bucket_id = 'classroom-attachments'
		and public.classroom_can_read_attachment_object(name)
	);

drop policy if exists "classroom attachments delete by item manager" on storage.objects;
create policy "classroom attachments delete by item manager"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'classroom-attachments'
		and public.classroom_can_write_attachment_object(name)
	);

drop policy if exists "submission files insert own submission" on storage.objects;
create policy "submission files insert own submission"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'submission-files'
		and public.classroom_owns_submission_object(name)
	);

drop policy if exists "submission files readable by owner or reviewer" on storage.objects;
create policy "submission files readable by owner or reviewer"
	on storage.objects
	for select
	to authenticated
	using (
		bucket_id = 'submission-files'
		and public.classroom_can_read_submission_object(name)
	);

drop policy if exists "submission files delete own submission" on storage.objects;
create policy "submission files delete own submission"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'submission-files'
		and public.classroom_owns_submission_object(name)
	);

-- ---------------------------------------------------------------------------
-- 5. The write RPCs gain a storage key.
--
-- THE SIGNATURE TRAP. Both functions GAIN a parameter, so the old arity is
-- dropped at its exact argument types first. `create or replace` keys on the
-- parameter list, so merely adding one would leave the old arity callable as a
-- second overload -- and two overloads differing only by a defaulted trailing
-- parameter make PostgREST unable to resolve the call AT ALL.
--
-- DEPLOY ORDERING: apply this file BY HAND before deploying a client that
-- names `p_storage_key`. The drops mean the old arities stop existing the
-- moment it runs.
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_add_attachment(uuid, text, text, text, bigint);

create or replace function public.classroom_add_attachment(
	p_item_id uuid,
	p_drive_file_id text default null,
	p_filename text default null,
	p_mime_type text default null,
	p_size_bytes bigint default null,
	p_storage_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_file text := nullif(btrim(coalesce(p_drive_file_id, '')), '');
	v_key text := nullif(btrim(coalesce(p_storage_key, '')), '');
	v_name text := left(btrim(coalesce(p_filename, '')), 300);
	v_mime text := left(btrim(coalesce(p_mime_type, '')), 200);
	v_next integer;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	-- Exactly one handle. `(a is null) = (b is null)` catches both directions in
	-- one test: both absent, and both present.
	if (v_file is null) = (v_key is null) then
		raise exception 'Attach exactly one of a Drive file id or a storage key.';
	end if;
	-- THE KEY MUST NAME THIS ITEM. The storage policy already asked whether the
	-- caller may write under that prefix, but the ROW is written here, and a row
	-- pointing at another item's object would be a readable file listed under an
	-- item whose readers are a different set of people. Re-checked rather than
	-- trusted, exactly as the Foundry mint re-reads the version row.
	if v_key is not null and public._classroom_storage_prefix_uuid(v_key) is distinct from p_item_id then
		raise exception 'That storage key does not belong to this item.';
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
		raise exception 'Only the teacher of record for every class this is posted to can attach files here.';
	end if;

	select coalesce(max(sort_order), 0) + 1 into v_next
	from public.classroom_attachments where item_id = p_item_id;

	insert into public.classroom_attachments
		(item_id, drive_file_id, storage_key, filename, mime_type, size_bytes, uploaded_by, sort_order)
	values (p_item_id, v_file, v_key, v_name, v_mime, p_size_bytes, public.current_user_email(), v_next)
	returning id into v_id;

	return jsonb_build_object(
		'ok', true,
		'attachment_id', v_id,
		'drive_file_id', v_file,
		'storage_key', v_key
	);
end;
$$;

revoke all on function public.classroom_add_attachment(uuid, text, text, text, bigint, text) from public;
grant execute on function public.classroom_add_attachment(uuid, text, text, text, bigint, text) to authenticated;

-- The delete counterpart now reports BOTH handles and which one is orphaned,
-- because the route has two sweepers and each must be told only about its own.
-- The orphan count is taken against the handle the row actually carried: one
-- upload can still back several rows (duplicating an item copies its
-- attachment rows by reference), so the blob goes only with the last row.
create or replace function public.classroom_delete_attachment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_row public.classroom_attachments%rowtype;
	v_remaining integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select * into v_row from public.classroom_attachments where id = p_id for update;
	if not found then
		raise exception 'That attachment does not exist.';
	end if;
	if not public._classroom_manages_item(v_row.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can remove this attachment.';
	end if;

	delete from public.classroom_attachments where id = p_id;

	if v_row.storage_key is not null then
		select count(*) into v_remaining
		from public.classroom_attachments
		where storage_key = v_row.storage_key;
	else
		select count(*) into v_remaining
		from public.classroom_attachments
		where drive_file_id = v_row.drive_file_id;
	end if;

	return jsonb_build_object(
		'ok', true,
		'deleted', true,
		'drive_file_id', v_row.drive_file_id,
		'storage_key', v_row.storage_key,
		'orphaned', v_remaining = 0
	);
end;
$$;

revoke all on function public.classroom_delete_attachment(uuid) from public;
grant execute on function public.classroom_delete_attachment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The student half.
--
-- A submission file's key is prefixed by the SUBMISSION id, and a submission
-- row is created lazily by the first thing a student does on an assignment --
-- so the id has to exist before an upload can be named, which it did not have
-- to when the app carried the bytes and made the row in one call.
--
-- `classroom_open_submission` is that step and nothing more: it resolves the
-- caller through `_classroom_engine_student` (published assignment, actively
-- enrolled, own identity -- no email parameter exists, so acting as somebody
-- else is not expressible), refuses a LOCKED submission before anything is
-- written, and returns the id. It grants no read of anything.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_open_submission(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_submission_id uuid;
	v_state text;
begin
	select s.id, s.state into v_submission_id, v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;

	if v_submission_id is null then
		insert into public.classroom_submissions (item_id, student_email)
		values (p_item_id, v_email)
		returning id into v_submission_id;
	end if;

	return jsonb_build_object('ok', true, 'submission_id', v_submission_id);
end;
$$;

revoke all on function public.classroom_open_submission(uuid) from public;
grant execute on function public.classroom_open_submission(uuid) to authenticated;

drop function if exists public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text);

create or replace function public.classroom_add_submission_file(
	p_item_id uuid,
	p_drive_file_id text default null,
	p_filename text default null,
	p_mime_type text default null,
	p_size_bytes bigint default null,
	p_block_id text default null,
	p_caption text default null,
	p_storage_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_spec jsonb;
	v_block jsonb;
	v_module_id text;
	v_submission_id uuid;
	v_state text;
	v_next integer;
	v_id uuid;
	v_file text := nullif(btrim(coalesce(p_drive_file_id, '')), '');
	v_key text := nullif(btrim(coalesce(p_storage_key, '')), '');
begin
	if (v_file is null) = (v_key is null) then
		raise exception 'Attach exactly one of a Drive file id or a storage key.';
	end if;

	if p_block_id is not null then
		select a.spec into v_spec
		from public.classroom_assignment_specs a where a.item_id = p_item_id;
		if v_spec is null then
			raise exception 'This assignment has no interactive spec.';
		end if;
		select b.blk, m.mod->>'id' into v_block, v_module_id
		from jsonb_array_elements(v_spec->'modules') as m(mod),
			jsonb_array_elements(m.mod->'blocks') as b(blk)
		where b.blk->>'id' = p_block_id
		limit 1;
		if v_block is null or v_block->>'type' <> 'imageZone' then
			raise exception 'Block "%" is not an image zone.', coalesce(p_block_id, '(none)');
		end if;
		if v_module_id = any (public._classroom_gated_modules(v_spec)) and not exists (
			select 1 from public.classroom_module_approvals a
			where a.item_id = p_item_id and a.student_email = v_email
				and a.module_id = v_spec->'approvalGate'->>'afterModule'
		) then
			return jsonb_build_object('ok', false, 'reason', 'approval_pending', 'module_id', v_module_id);
		end if;
	end if;

	select s.id, s.state into v_submission_id, v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;
	if v_submission_id is null then
		insert into public.classroom_submissions (item_id, student_email)
		values (p_item_id, v_email)
		returning id into v_submission_id;
	end if;

	-- THE KEY MUST NAME THIS SUBMISSION, for the same reason the attachment key
	-- must name its item: the storage policy answered a question about the
	-- OBJECT, and this is the ROW. A student holding a key minted against their
	-- own earlier submission must not be able to hang it off a different one.
	if v_key is not null and public._classroom_storage_prefix_uuid(v_key) is distinct from v_submission_id then
		raise exception 'That storage key does not belong to this submission.';
	end if;

	select coalesce(max(sort_order), 0) + 1 into v_next
	from public.classroom_submission_files where submission_id = v_submission_id;

	insert into public.classroom_submission_files
		(submission_id, block_id, caption, drive_file_id, storage_key, filename, mime_type, size_bytes, sort_order)
	values (v_submission_id, p_block_id, nullif(left(btrim(coalesce(p_caption, '')), 500), ''),
		v_file, v_key, left(btrim(coalesce(p_filename, 'file')), 300),
		left(btrim(coalesce(p_mime_type, 'application/octet-stream')), 200),
		p_size_bytes, v_next)
	returning id into v_id;

	return jsonb_build_object(
		'ok', true,
		'file_id', v_id,
		'submission_id', v_submission_id,
		'storage_key', v_key
	);
end;
$$;

revoke all on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text) from public;
grant execute on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text) to authenticated;

create or replace function public.classroom_delete_submission_file(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_row public.classroom_submission_files%rowtype;
	v_state text;
	v_remaining integer;
begin
	if (select auth.uid()) is null or coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select f.* into v_row
	from public.classroom_submission_files f
	join public.classroom_submissions s on s.id = f.submission_id
	where f.id = p_id and s.student_email = v_email
	for update of f;
	if not found then
		raise exception 'That file does not exist.';
	end if;
	select s.state into v_state from public.classroom_submissions s where s.id = v_row.submission_id;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;

	delete from public.classroom_submission_files where id = p_id;

	if v_row.storage_key is not null then
		select count(*) into v_remaining
		from public.classroom_submission_files where storage_key = v_row.storage_key;
	else
		select count(*) into v_remaining
		from public.classroom_submission_files where drive_file_id = v_row.drive_file_id;
	end if;

	return jsonb_build_object(
		'ok', true,
		'drive_file_id', v_row.drive_file_id,
		'storage_key', v_row.storage_key,
		'orphaned', v_remaining = 0
	);
end;
$$;

revoke all on function public.classroom_delete_submission_file(uuid) from public;
grant execute on function public.classroom_delete_submission_file(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Report what this file found, against the real table, at apply time.
-- ---------------------------------------------------------------------------

do $$
declare
	v_att integer;
	v_sub integer;
	v_overloads integer;
begin
	select count(*) into v_att from public.classroom_attachments;
	select count(*) into v_sub from public.classroom_submission_files;
	raise notice '0133: % existing attachment row(s) and % submission file row(s) keep their Drive id; none moved.', v_att, v_sub;

	select count(*) into v_overloads from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_add_attachment';
	if v_overloads <> 1 then
		raise exception '0133: classroom_add_attachment has % overloads, expected 1. PostgREST cannot resolve a defaulted-trailing-parameter pair.', v_overloads;
	end if;

	select count(*) into v_overloads from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_add_submission_file';
	if v_overloads <> 1 then
		raise exception '0133: classroom_add_submission_file has % overloads, expected 1.', v_overloads;
	end if;

	raise notice '0133: buckets classroom-attachments and submission-files are private, 200 MiB, no mime list.';
end;
$$;

-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS MIGRATION
--
--   drop policy "classroom attachments insert by item manager" on storage.objects;
--   drop policy "classroom attachments readable by item readers" on storage.objects;
--   drop policy "classroom attachments delete by item manager" on storage.objects;
--   drop policy "submission files insert own submission" on storage.objects;
--   drop policy "submission files readable by owner or reviewer" on storage.objects;
--   drop policy "submission files delete own submission" on storage.objects;
--   delete from storage.objects where bucket_id in ('classroom-attachments', 'submission-files');
--   delete from storage.buckets where id in ('classroom-attachments', 'submission-files');
--   drop function public.classroom_open_submission(uuid);
--   drop function public.classroom_can_read_submission_object(text);
--   drop function public.classroom_owns_submission_object(text);
--   drop function public.classroom_can_read_attachment_object(text);
--   drop function public.classroom_can_write_attachment_object(text);
--   drop function public._classroom_storage_prefix_uuid(text);
--   -- then restore 0085's and 0086's arities of classroom_add_attachment,
--   -- classroom_delete_attachment, classroom_add_submission_file and
--   -- classroom_delete_submission_file verbatim, dropping the 6/8-arg forms
--   -- first, and only AFTER redeploying a client that does not name
--   -- p_storage_key.
--   alter table public.classroom_attachments drop constraint classroom_attachments_one_handle;
--   alter table public.classroom_attachments drop constraint classroom_attachments_storage_key_shape;
--   alter table public.classroom_attachments drop column storage_key;
--   alter table public.classroom_attachments alter column drive_file_id set not null;
--   alter table public.classroom_submission_files drop constraint classroom_submission_files_one_handle;
--   alter table public.classroom_submission_files drop constraint classroom_submission_files_storage_key_shape;
--   alter table public.classroom_submission_files drop column storage_key;
--   alter table public.classroom_submission_files alter column drive_file_id set not null;
--
-- The two `set not null` steps REFUSE if any storage-backed row exists. That
-- is correct: those rows have no Drive id and never will, so the reversal is
-- only clean while nothing has been uploaded through the new path.
-- ---------------------------------------------------------------------------
