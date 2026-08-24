-- ---------------------------------------------------------------------------
-- 0135 -- INSTRUCTOR-ONLY ATTACHMENTS GET A BUCKET, PUBLIC MATERIALS GET THEIR
-- FILES BACK, AND DUPLICATING AN ITEM STOPS RAISING.
--
-- THREE THINGS 0133 LEFT, and they are one file because they are one mechanism:
-- the storage handle on an attachment row.
--
-- 1. INSTRUCTOR-ONLY MATERIAL KEEPS THE 4 MiB DRIVE CEILING. 0133 said so in
--    its own header and called it a stated gap. It is the wrong gap to leave:
--    an answer key and a sample solution are exactly where a SolidWorks part
--    belongs, and 4 MiB does not hold one. The reason 0133 gave for skipping
--    it was real -- `classroom_instructor_attachments` reads through
--    `classroom_can_read_instructor_material`, which is MANAGER-ONLY, so its
--    objects cannot share the `classroom-attachments` prefix without becoming
--    readable by every enrolled student. The answer is the third bucket that
--    reason implies, not a widened policy on the second.
--
-- 2. A PUBLIC REFERENCE DOCUMENT 404s ON A STORAGE-BACKED ATTACHMENT. This is
--    live, not a deferral: reference documents are published public on
--    purpose, `classroom_public_attachment` projects `drive_file_id` and
--    nothing else, and every storage policy 0133 wrote is `to authenticated`.
--    So the moment a teacher attaches a file to a public material through the
--    new path, a signed-out visitor gets nothing. Both halves are fixed here.
--
-- 3. DUPLICATING AN ITEM THAT HOLDS A STORAGE-BACKED ATTACHMENT RAISES.
--    MEASURED, not reasoned about: `classroom_duplicate_item` copies
--    attachment rows BY NAME and its column list predates `storage_key`, so
--    the copy carries a null Drive id and no key and dies on 0133's own
--    one-handle CHECK:
--
--      new row for relation "classroom_attachments"
--      violates check constraint "classroom_attachments_one_handle"
--
--    Adding the same CHECK to the instructor table (item 1) would have added a
--    second copy of that break, so it is fixed here rather than inherited.
--
-- EVERY RPC WIDENED HERE IS WIDENED ADDITIVELY, under the rule 0133 now
-- follows: the deployed arity survives as a thin wrapper, the wide form takes
-- no defaults so no payload can bind to both, and the only drop names the wide
-- form so the file re-pastes. There is no deploy ordering against this file.
--
-- WHAT UNDOES THIS MIGRATION is at the bottom, in a comment.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The third bucket.
--
-- The same three properties as 0133's two, for the same three reasons: PRIVATE
-- (no public URL exists for any object), no mime list (nothing is refused for
-- what it is, because nothing is ever served inline), and a 200 MiB cap that
-- STORAGE enforces so the signed upload URL is bounded too.
--
-- `on conflict do update` rather than `do nothing`: re-pasting must reassert
-- the three properties, not accept whatever is there.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('instructor-attachments', 'instructor-attachments', false, 209715200, null)
on conflict (id) do update
	set public = false,
		file_size_limit = 209715200,
		allowed_mime_types = null;

-- ---------------------------------------------------------------------------
-- 2. The handle on the instructor row.
--
-- 0133's shape applied to the third table, including the CHECK that exactly
-- one handle is present. A row with both is a row two sweepers would each
-- think they own; a row with neither is an attachment with no bytes that still
-- renders in a list.
-- ---------------------------------------------------------------------------

alter table public.classroom_instructor_attachments
	add column if not exists storage_key text;

alter table public.classroom_instructor_attachments
	alter column drive_file_id drop not null;

do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_instructor_attachments_one_handle'
			and conrelid = 'public.classroom_instructor_attachments'::regclass
	) then
		alter table public.classroom_instructor_attachments
			add constraint classroom_instructor_attachments_one_handle check (
				(drive_file_id is not null and storage_key is null)
				or (drive_file_id is null and storage_key is not null)
			);
	end if;

	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_instructor_attachments_storage_key_shape'
			and conrelid = 'public.classroom_instructor_attachments'::regclass
	) then
		alter table public.classroom_instructor_attachments
			add constraint classroom_instructor_attachments_storage_key_shape check (
				storage_key is null
				or char_length(btrim(storage_key)) between 1 and 400
			);
	end if;
end;
$$;

create index if not exists classroom_instructor_attachments_storage_key_idx
	on public.classroom_instructor_attachments (storage_key);

-- ---------------------------------------------------------------------------
-- 3. The path predicates for the third bucket.
--
-- THE WRITE PREDICATE IS 0133'S, REUSED RATHER THAN COPIED.
-- `classroom_can_write_attachment_object` is `_classroom_manages_item` applied
-- to the key's first segment -- a question about an ITEM and a KEY, with
-- nothing bucket-specific in it -- and "who may attach an instructor-only file"
-- is the same question with the same answer. A second copy under an
-- instructor-flavoured name is the thing that stops matching the day one of
-- them moves, so there is one.
--
-- THE READ PREDICATE CANNOT BE REUSED, and that asymmetry is the entire reason
-- this bucket exists. `classroom_can_read_attachment_object` says "whoever may
-- read the item", which includes an actively enrolled student. Instructor-only
-- material asks `classroom_can_read_instructor_material`, which is the
-- manager-only half of that with the student branch removed on purpose. A
-- student must have NO read path here at all, published or not.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_can_read_instructor_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public.classroom_can_read_instructor_material(
		public._classroom_storage_prefix_uuid(p_name)
	);
$$;

revoke all on function public.classroom_can_read_instructor_object(text) from public;
grant execute on function public.classroom_can_read_instructor_object(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage RLS for the third bucket.
--
-- A bucket no policy names is denied to `authenticated` and `anon` by default,
-- so these three policies are the WHOLE of what this bucket permits. There is
-- no UPDATE policy, for 0133's reason: a key is a fresh uuid every time, so
-- nothing legitimately overwrites an object, and an upsert that could would
-- let a re-upload silently replace bytes a teacher has already worked from.
--
-- THERE IS NO `anon` POLICY ON THIS BUCKET AND THERE MUST NEVER BE ONE. The
-- public read added in section 6 names `classroom-attachments` and only that.
-- ---------------------------------------------------------------------------

drop policy if exists "instructor attachments insert by item manager" on storage.objects;
create policy "instructor attachments insert by item manager"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'instructor-attachments'
		and public.classroom_can_write_attachment_object(name)
	);

drop policy if exists "instructor attachments readable by item managers" on storage.objects;
create policy "instructor attachments readable by item managers"
	on storage.objects
	for select
	to authenticated
	using (
		bucket_id = 'instructor-attachments'
		and public.classroom_can_read_instructor_object(name)
	);

drop policy if exists "instructor attachments delete by item manager" on storage.objects;
create policy "instructor attachments delete by item manager"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'instructor-attachments'
		and public.classroom_can_write_attachment_object(name)
	);

-- ---------------------------------------------------------------------------
-- 5. The instructor write RPCs, widened ADDITIVELY.
--
-- 0090's arity is what the deployed client calls, so it stays, exactly as
-- 0133's two do. See 0133 section 5 for why the wide form declares no
-- defaults; the short version is that a defaulted trailing parameter would
-- make the pair unresolvable rather than merely redundant.
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_add_instructor_attachment(uuid, text, text, text, bigint, text);

create or replace function public.classroom_add_instructor_attachment(
	p_item_id uuid,
	p_drive_file_id text,
	p_filename text,
	p_mime_type text,
	p_size_bytes bigint,
	p_storage_key text
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
	if (v_file is null) = (v_key is null) then
		raise exception 'Attach exactly one of a Drive file id or a storage key.';
	end if;
	-- THE KEY MUST NAME THIS ITEM, re-checked here rather than trusted from
	-- the storage policy: that policy answered a question about the OBJECT,
	-- and this is the ROW. A row pointing at another item's object would be a
	-- file listed under an item whose managers are a different set of people.
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
		raise exception 'Only the teacher of record for every class this is posted to can attach instructor-only files here.';
	end if;

	select coalesce(max(sort_order), 0) + 1 into v_next
	from public.classroom_instructor_attachments where item_id = p_item_id;

	insert into public.classroom_instructor_attachments
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

revoke all on function public.classroom_add_instructor_attachment(uuid, text, text, text, bigint, text) from public;
grant execute on function public.classroom_add_instructor_attachment(uuid, text, text, text, bigint, text) to authenticated;

-- 0090's arity, kept alive as a thin wrapper, re-raising 0090's own refusal
-- text for a blank Drive id ahead of delegating.
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
begin
	if btrim(coalesce(p_drive_file_id, '')) = '' then
		raise exception 'A Drive file id is required.';
	end if;
	return public.classroom_add_instructor_attachment(
		p_item_id, p_drive_file_id, p_filename, p_mime_type, p_size_bytes, null::text
	);
end;
$$;

revoke all on function public.classroom_add_instructor_attachment(uuid, text, text, text, bigint) from public;
grant execute on function public.classroom_add_instructor_attachment(uuid, text, text, text, bigint) to authenticated;

-- The delete counterpart reports BOTH handles and which one is orphaned, the
-- way 0133's does, because the route has two sweepers and each must be told
-- only about its own. The orphan count is taken against the handle the row
-- actually carried.
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

	if v_row.storage_key is not null then
		select count(*) into v_remaining
		from public.classroom_instructor_attachments
		where storage_key = v_row.storage_key;
	else
		select count(*) into v_remaining
		from public.classroom_instructor_attachments
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

revoke all on function public.classroom_delete_instructor_attachment(uuid) from public;
grant execute on function public.classroom_delete_instructor_attachment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. A PUBLIC MATERIAL SERVES ITS ATTACHMENTS.
--
-- TWO HALVES, AND BOTH ARE REQUIRED. The payload has to carry the storage key
-- so the serve route knows there is one, and the object has to be readable by
-- a caller with no session so the route can mint a signed URL for it.
--
-- THE DISCLOSURE DECISION, stated rather than assumed. `storage_key` joins a
-- payload that is granted to `anon`, so it is a widening of a public surface.
-- What it adds is `<item_id>/<uuid>.<ext>`: the item id, which the caller is
-- holding already because it is the document they are reading; a random uuid,
-- which names nothing; and the file extension, which the filename beside it
-- already carried. It reveals no person, no email and no other item. The key
-- is not itself a capability -- possessing it grants nothing without a policy
-- that admits the caller, which is the next half.
--
-- WHAT THE POLICY ADMITS, EXACTLY. `anon` and `authenticated` may SELECT an
-- object in `classroom-attachments` whose key names an item that is a
-- MATERIAL, is flagged PUBLIC, and is LIVE by `_classroom_item_live` -- the
-- same three conditions `classroom_public_attachment` and
-- `classroom_public_reference` already apply, asked of the same columns, so
-- there is one definition of "public" and this does not restate it.
--
-- AND WHAT IT DOES NOT. It names one bucket. `submission-files` and
-- `instructor-attachments` have no `anon` policy of any kind, so a student's
-- hand-in and an answer key remain unreachable without a session -- and an
-- attachment on a non-public item, an unpublished one, or one scheduled for
-- later is refused by the predicate rather than by the route.
--
-- The signed-in branch is included because being signed in is not the same as
-- being enrolled: a visitor with a Google account reading a public reference
-- document is `authenticated` and would fail `classroom_can_read_item`, so
-- without this they would be the only people who could not read it.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_attachment_object_is_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.classroom_items i
		where i.id = public._classroom_storage_prefix_uuid(p_name)
			and i.kind = 'material'
			and i.is_public
			and public._classroom_item_live(i.published, i.publish_at)
	);
$$;

revoke all on function public.classroom_attachment_object_is_public(text) from public;
grant execute on function public.classroom_attachment_object_is_public(text) to anon, authenticated;

-- A SECOND PERMISSIVE POLICY, not an edit of 0133's. Postgres ORs permissive
-- policies, so the enrolled-reader rule and the public rule each stand alone
-- and either can be read, reasoned about or dropped without touching the
-- other.
drop policy if exists "classroom attachments readable when the item is public" on storage.objects;
create policy "classroom attachments readable when the item is public"
	on storage.objects
	for select
	to anon, authenticated
	using (
		bucket_id = 'classroom-attachments'
		and public.classroom_attachment_object_is_public(name)
	);

-- The public payload gains the key. Same signature, so this is a body change
-- and carries none of the signature trap.
create or replace function public.classroom_public_attachment(p_attachment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'drive_file_id', a.drive_file_id,
		'storage_key', a.storage_key,
		'filename', a.filename,
		'mime_type', a.mime_type
	)
	from public.classroom_attachments a
	join public.classroom_items i on i.id = a.item_id
	where a.id = p_attachment_id
		and i.kind = 'material'
		and i.is_public
		and public._classroom_item_live(i.published, i.publish_at);
$$;

revoke all on function public.classroom_public_attachment(uuid) from public;
grant execute on function public.classroom_public_attachment(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. DUPLICATING AN ITEM CARRIES THE STORAGE HANDLE.
--
-- 0108'S BODY VERBATIM, DIFFED AGAINST THAT FILE RATHER THAN RECONSTRUCTED,
-- with `storage_key` added to two INSERT column lists and their SELECTs and
-- nothing else touched. The signature is unchanged, so `create or replace` is
-- all it needs.
--
-- BY REFERENCE, WHICH IS WHAT THE DRIVE COPY ALREADY DID. One upload can back
-- several rows; the blob goes only with the last row that names it, which is
-- what the delete RPCs' orphan counts are for. Copying the KEY rather than the
-- bytes means the copy's key still names the ORIGINAL item in its first
-- segment -- so section 8 widens the read predicate to ask about the ROWS that
-- point at an object as well as the prefix, or a duplicate posted to another
-- section would list a file that section could not open.
-- ---------------------------------------------------------------------------

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
		(kind, title, body, body_doc, points, due_at, category, author_email, author_name,
			published, pinned, sort_order)
	values (v_old.kind,
		case when v_old.kind = 'post' then v_old.title
			else left(coalesce(v_old.title, '') || ' (copy)', 300) end,
		v_old.body,
		coalesce(v_old.body_doc, public._classroom_doc_from_text(v_old.body)),
		v_old.points, v_old.due_at, v_old.category,
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
		(item_id, drive_file_id, storage_key, filename, mime_type, size_bytes, uploaded_by, sort_order)
	select v_id, t.drive_file_id, t.storage_key, t.filename, t.mime_type, t.size_bytes,
		public.current_user_email(), t.sort_order
	from public.classroom_attachments t where t.item_id = p_item_id;

	insert into public.classroom_instructor_resources (item_id, label, url, sort_order)
	select v_id, r.label, r.url, r.sort_order
	from public.classroom_instructor_resources r where r.item_id = p_item_id;

	insert into public.classroom_instructor_attachments
		(item_id, drive_file_id, storage_key, filename, mime_type, size_bytes, uploaded_by, sort_order)
	select v_id, t.drive_file_id, t.storage_key, t.filename, t.mime_type, t.size_bytes,
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

revoke all on function public.classroom_duplicate_item(uuid, uuid[]) from public;
grant execute on function public.classroom_duplicate_item(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. A DUPLICATE'S FILES ARE READABLE WHERE THE DUPLICATE IS.
--
-- 0133's read predicate asks only about the key's FIRST SEGMENT, which names
-- the item the object was uploaded against. That is the right question at
-- INSERT time -- there is no row yet to ask about -- and the wrong one at read
-- time the moment a second row points at the same object, which is exactly
-- what section 7 makes happen. A handout duplicated into next year's section
-- would list a file only last year's readers could open.
--
-- So the predicate ORs in the rows: may the caller read the item of ANY
-- attachment row that names this object. `classroom_can_read_item` is still
-- the only definition of who may read anything, asked once per candidate row
-- instead of once per key.
--
-- INSERT AND DELETE ARE DELIBERATELY LEFT ON THE PREFIX. Writing is a claim
-- about a key that has no row yet, and the blob belongs to the item it was
-- uploaded against; a manager of a COPY should not be able to delete bytes the
-- original still serves. Only READ widens.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_can_read_attachment_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public.classroom_can_read_item(public._classroom_storage_prefix_uuid(p_name))
		or exists (
			select 1
			from public.classroom_attachments a
			where a.storage_key = p_name
				and public.classroom_can_read_item(a.item_id)
		);
$$;

revoke all on function public.classroom_can_read_attachment_object(text) from public;
grant execute on function public.classroom_can_read_attachment_object(text) to authenticated;

create or replace function public.classroom_can_read_instructor_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public.classroom_can_read_instructor_material(
		public._classroom_storage_prefix_uuid(p_name)
	)
		or exists (
			select 1
			from public.classroom_instructor_attachments a
			where a.storage_key = p_name
				and public.classroom_can_read_instructor_material(a.item_id)
		);
$$;

revoke all on function public.classroom_can_read_instructor_object(text) from public;
grant execute on function public.classroom_can_read_instructor_object(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Report what this file found, against the real tables, at apply time.
-- ---------------------------------------------------------------------------

do $$
declare
	v_rows integer;
	v_overloads integer;
	v_defaulted integer;
	v_bucket record;
begin
	select count(*) into v_rows from public.classroom_instructor_attachments;
	raise notice '0135: % existing instructor attachment row(s) keep their Drive id; none moved.', v_rows;

	select id, public, file_size_limit, allowed_mime_types into v_bucket
	from storage.buckets where id = 'instructor-attachments';
	if v_bucket.public or v_bucket.file_size_limit <> 209715200 or v_bucket.allowed_mime_types is not null then
		raise exception '0135: instructor-attachments is not private/200MiB/no-mime-list (public=%, limit=%, mimes=%).',
			v_bucket.public, v_bucket.file_size_limit, v_bucket.allowed_mime_types;
	end if;
	raise notice '0135: bucket instructor-attachments is private, 200 MiB, no mime list.';

	-- Additive, and unambiguous, on the same terms as 0133.
	select count(*) into v_overloads from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_add_instructor_attachment';
	if v_overloads <> 2 then
		raise exception '0135: classroom_add_instructor_attachment has % overload(s), expected 2.', v_overloads;
	end if;

	select count(*) into v_defaulted from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_add_instructor_attachment'
		and p.pronargs = 6 and p.pronargdefaults > 0;
	if v_defaulted <> 0 then
		raise exception '0135: the widened classroom_add_instructor_attachment declares defaults; PostgREST cannot resolve that pair.';
	end if;
	raise notice '0135: classroom_add_instructor_attachment has 2 arities; the widened one declares no defaults.';

	-- NOTHING ELSE MAY HAVE BECOME ANON-READABLE. Exactly one anon-facing
	-- select policy on storage.objects may mention a classroom bucket, and it
	-- must be the public-material one.
	select count(*) into v_rows from pg_policies
	where schemaname = 'storage' and tablename = 'objects'
		and 'anon' = any (roles)
		and (qual like '%submission-files%' or qual like '%instructor-attachments%');
	if v_rows <> 0 then
		raise exception '0135: % anon policy/policies reach submission-files or instructor-attachments; expected 0.', v_rows;
	end if;
	raise notice '0135: no anon policy reaches submission-files or instructor-attachments.';
end;
$$;

-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS MIGRATION
--
--   drop policy "classroom attachments readable when the item is public" on storage.objects;
--   drop policy "instructor attachments insert by item manager" on storage.objects;
--   drop policy "instructor attachments readable by item managers" on storage.objects;
--   drop policy "instructor attachments delete by item manager" on storage.objects;
--   delete from storage.objects where bucket_id = 'instructor-attachments';
--   delete from storage.buckets where id = 'instructor-attachments';
--   drop function public.classroom_attachment_object_is_public(text);
--   drop function public.classroom_can_read_instructor_object(text);
--   -- The 5-argument classroom_add_instructor_attachment was never dropped
--   -- and never stopped working, so this needs no client redeploy:
--   drop function public.classroom_add_instructor_attachment(uuid, text, text, text, bigint, text);
--   -- then restore 0090's BODY for classroom_add_instructor_attachment (it is
--   -- a wrapper now and its target has just gone) and 0090's
--   -- classroom_delete_instructor_attachment verbatim;
--   -- restore 0133's classroom_can_read_attachment_object and 0108's
--   -- classroom_duplicate_item verbatim -- but note that reverting the
--   -- duplicate function re-breaks duplicating an item that holds a
--   -- storage-backed attachment, and reverting the read predicate makes an
--   -- already-duplicated item's files unreadable in the copy's sections;
--   -- restore 0109's classroom_public_attachment verbatim, which takes public
--   -- reference documents back to serving Drive attachments only.
--   alter table public.classroom_instructor_attachments drop constraint classroom_instructor_attachments_one_handle;
--   alter table public.classroom_instructor_attachments drop constraint classroom_instructor_attachments_storage_key_shape;
--   alter table public.classroom_instructor_attachments drop column storage_key;
--   alter table public.classroom_instructor_attachments alter column drive_file_id set not null;
--
-- The last line REFUSES if any instructor attachment row is storage-backed,
-- which is correct: those rows have no Drive id to restore and dropping the
-- column would strand their bytes.
-- ---------------------------------------------------------------------------
