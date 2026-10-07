-- ===== PART quick-posts BEGIN =====
-- ===========================================================================
-- 0233 PART quick-posts (ledger 0368, report R04, Mr. Pina: "quick post should
-- support images and files and longer text limits ... embedded images and
-- files so that students can pull them up in window and navigate them ... if
-- its a longer one it should be collapsible").
--
-- WHAT THIS PART DOES, all of it additive:
--   1. classroom_quick_post_files: one row per file on a notice. RLS on, no
--      policy, no client grant; written only by classroom_quick_post_add_file
--      and read only through classroom_quick_posts and classroom_quick_post_file.
--   2. The body ceiling goes from 1000 characters to 4000, in the CHECK and in
--      classroom_quick_post_create, whose signature does not change. Every row
--      already stored passes the wider check.
--   3. The files live in a NEW PRIVATE BUCKET, quick-post-files, 45 MiB a file
--      (the project's real ceiling on the Free plan, 0185), with no mime list:
--      the CLASSROOM FILES shape (0133). Objects are uploaded as
--      application/octet-stream and read back only through a signed URL that
--      carries download=, so nothing anybody uploads is ever navigated to as a
--      document on a host of ours.
--   4. THE KEY LAYOUT IS THE AUTHORIZATION: <post id>/<uuid>.<ext>. The two
--      storage policies read the FIRST PATH SEGMENT through
--      _classroom_storage_prefix_uuid (0133) and ask a quick-post predicate
--      about it. The write predicate is the post's AUTHOR, while the post is
--      still up; the read predicate is the notice's own audience (a manager of
--      a class it went to, an active enrollee while it is live, its author).
--   5. classroom_quick_posts (the read) gains per-post files and a top-level
--      files_ready and limits, so a client deployed before this applies never
--      offers what the database would refuse: it falls back to 1000 characters
--      and no files when the keys are absent.
--
-- WHO MAY ATTACH: only the teacher who posted the notice, while it is up
-- (decision taken for this round). Archive, never delete: there is no delete
-- function, no delete grant and no delete policy; a file row goes only with
-- its post's cascade, and a post is never deleted (0230 stamps a take down).
--
-- THE STORAGE HALF IS GUARDED. This is the first migration applied by
-- migrate.yml that writes a storage.buckets row and storage.objects policies,
-- and whether the applying role (idea_migrator) may do that has never been
-- measured (supabase/roles/idea_migrator.sql says so). So the bucket and the
-- two policies sit in ONE sub-block that catches insufficient_privilege, says
-- so in a NOTICE and lets the rest of the round apply. files_ready in the read
-- is computed from pg_policies, so the file picker stays off until a person
-- re-pastes 0233 in the SQL editor, which is idempotent and finishes the
-- storage half. Nothing is half-applied either way: the sub-block is a
-- savepoint, all or nothing.
--
-- DEPLOY ORDERING: none. Every signature is unchanged or new.
-- ===========================================================================

-- 1. THE FILE ROWS. No uploader column: only the post's author may attach,
--    and the RPC refuses anyone else, so it would always equal the post's own
--    author_email (one fewer address-bearing column).
create table if not exists public.classroom_quick_post_files (
	id uuid primary key default gen_random_uuid(),
	post_id uuid not null references public.classroom_quick_posts (id) on delete cascade,
	-- The object key, <post id>/<uuid>.<ext>. Nothing a person typed is in it.
	storage_key text not null,
	-- What people see, verbatim (trimmed). Never part of the key.
	filename text not null,
	size_bytes bigint,
	sort_order integer not null,
	created_at timestamptz not null default now(),
	constraint classroom_quick_post_files_key_unique unique (storage_key),
	constraint classroom_quick_post_files_key_shape check (
		storage_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(\.[a-z0-9]{1,12})?$'
		and public._classroom_storage_prefix_uuid(storage_key) is not distinct from post_id
	),
	constraint classroom_quick_post_files_name_shape check (char_length(filename) between 1 and 255),
	constraint classroom_quick_post_files_size check (size_bytes is null or size_bytes >= 0)
);

create index if not exists classroom_quick_post_files_post_idx
	on public.classroom_quick_post_files (post_id, sort_order);

alter table public.classroom_quick_post_files enable row level security;
revoke all on table public.classroom_quick_post_files from public, anon, authenticated;

-- 2. THE BODY CEILING, 1000 -> 4000. A widening: every stored row passes.
alter table public.classroom_quick_posts drop constraint if exists classroom_quick_posts_body_shape;
alter table public.classroom_quick_posts add constraint classroom_quick_posts_body_shape
	check (char_length(body) between 1 and 4000 and body ~ '[^[:space:]]');

-- CREATE, the same signature and the 0230 body with the two 1000s at 4000.
create or replace function public.classroom_quick_post_create(
	p_section_ids uuid[],
	p_body text,
	p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
	v_now timestamptz := now();
	v_ids uuid[];
	v_id uuid;
	v_body text;
	v_post uuid;
begin
	if v_email = '' then
		raise exception 'You must be signed in to post a class notice.';
	end if;

	select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
	into v_ids
	from unnest(coalesce(p_section_ids, '{}'::uuid[])) as x
	where x is not null;

	if cardinality(v_ids) = 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_classes');
	end if;
	if cardinality(v_ids) > 50 then
		raise exception 'Post to at most 50 classes at a time.';
	end if;

	foreach v_id in array v_ids loop
		-- The existence check is not a second authorization rule: an admin
		-- manages every id, real or not, and the foreign key would otherwise
		-- answer an invented id with a constraint error naming the table.
		if not exists (select 1 from public.classroom_sections s where s.id = v_id)
			or public.classroom_manages_section(v_id) is not true then
			raise exception 'Only a teacher of every chosen class can post to it.';
		end if;
	end loop;

	v_body := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
	if v_body = '' then
		return jsonb_build_object('ok', false, 'reason', 'empty');
	end if;
	if char_length(v_body) > 4000 then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'limit', 4000);
	end if;
	if p_expires_at is not null and p_expires_at <= v_now then
		return jsonb_build_object('ok', false, 'reason', 'expiry_passed');
	end if;
	if p_expires_at is not null and p_expires_at > v_now + interval '366 days' then
		return jsonb_build_object('ok', false, 'reason', 'expiry_too_far');
	end if;

	insert into public.classroom_quick_posts (author_email, body, created_at, expires_at)
	values (v_email, v_body, v_now, p_expires_at)
	returning id into v_post;

	insert into public.classroom_quick_post_sections (post_id, section_id)
	select v_post, x from unnest(v_ids) as x;

	return jsonb_build_object(
		'ok', true,
		'id', v_post,
		'section_ids', to_jsonb(v_ids),
		'created_at', v_now,
		'expires_at', p_expires_at
	);
end;
$qp$;

revoke all on function public.classroom_quick_post_create(uuid[], text, timestamptz)
	from public, anon, authenticated;
grant execute on function public.classroom_quick_post_create(uuid[], text, timestamptz) to authenticated;

-- 3. WHO MAY READ A NOTICE'S FILES: its own audience. A manager of any class
--    it went to (an admin manages every section, through the manage rule); an
--    ACTIVE enrollee of one of its classes while it is live; and its author.
--    The empty address is refused, and a null post id answers false, so a key
--    with no uuid prefix fails closed. Private: called from definers only.
create or replace function public._classroom_quick_post_readable(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $qp$
	select coalesce(
		p_post_id is not null
		and public.current_user_email() <> ''
		and exists (
			select 1
			from public.classroom_quick_posts p
			where p.id = p_post_id
				and (
					p.author_email = public.current_user_email()
					or exists (
						select 1 from public.classroom_quick_post_sections t
						where t.post_id = p.id
							and (
								public.classroom_manages_section(t.section_id) is true
								or (
									public.classroom_is_enrolled(t.section_id) is true
									and p.taken_down_at is null
									and (p.expires_at is null or p.expires_at > now())
								)
							)
					)
				)
		),
		false
	);
$qp$;

revoke all on function public._classroom_quick_post_readable(uuid) from public, anon, authenticated;

-- WHO MAY WRITE ONE: the post's author, while it is still up. Private.
create or replace function public._classroom_quick_post_writable(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $qp$
	select coalesce(
		p_post_id is not null
		and public.current_user_email() <> ''
		and exists (
			select 1
			from public.classroom_quick_posts p
			where p.id = p_post_id
				and p.author_email = public.current_user_email()
				and p.taken_down_at is null
				and (p.expires_at is null or p.expires_at > now())
		),
		false
	);
$qp$;

revoke all on function public._classroom_quick_post_writable(uuid) from public, anon, authenticated;

-- The two object predicates the storage policies name. A function named
-- directly in an RLS clause is evaluated as the QUERYING role, so these two
-- hold an authenticated EXECUTE grant and nothing else.
create or replace function public.classroom_can_read_quick_post_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $qp$
	select public._classroom_quick_post_readable(public._classroom_storage_prefix_uuid(p_name));
$qp$;

revoke all on function public.classroom_can_read_quick_post_object(text) from public, anon, authenticated;
grant execute on function public.classroom_can_read_quick_post_object(text) to authenticated;

create or replace function public.classroom_can_write_quick_post_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $qp$
	select public._classroom_quick_post_writable(public._classroom_storage_prefix_uuid(p_name));
$qp$;

revoke all on function public.classroom_can_write_quick_post_object(text) from public, anon, authenticated;
grant execute on function public.classroom_can_write_quick_post_object(text) to authenticated;

-- 4. RECORD A FILE that has already landed in the bucket. No identity
--    parameter, no defaults. In order: not signed in raises; the post is
--    locked FOR UPDATE (the ten-file cap needs the parent row lock); a post
--    that does not exist and one that is not the caller's answer the same
--    'Not found.'; a key that is not this post's raises; the SAME key again
--    answers the row it already made (a retry after a dropped connection);
--    an ended or taken-down notice and an eleventh file are refusals a
--    teacher can meet by ordinary use, so they return {ok:false, reason}.
--    The name is trimmed the way a person means it (the regular expression,
--    never btrim) and an empty one becomes 'file'.
create or replace function public.classroom_quick_post_add_file(
	p_post_id uuid,
	p_storage_key text,
	p_filename text,
	p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
	v_post public.classroom_quick_posts%rowtype;
	v_existing public.classroom_quick_post_files%rowtype;
	v_count integer;
	v_name text;
	v_id uuid;
begin
	if v_email = '' then
		raise exception 'You must be signed in to attach a file to a class notice.';
	end if;

	select * into v_post from public.classroom_quick_posts p where p.id = p_post_id for update;
	if not found or v_post.author_email <> v_email then
		raise exception 'Not found.';
	end if;

	if p_storage_key is null
		or p_storage_key !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(\.[a-z0-9]{1,12})?$'
		or public._classroom_storage_prefix_uuid(p_storage_key) is distinct from p_post_id then
		raise exception 'That storage key does not belong to this notice.';
	end if;

	select * into v_existing from public.classroom_quick_post_files f
	where f.storage_key = p_storage_key and f.post_id = p_post_id;
	if found then
		return jsonb_build_object(
			'ok', true,
			'already', true,
			'file', jsonb_build_object('id', v_existing.id, 'filename', v_existing.filename, 'size_bytes', v_existing.size_bytes)
		);
	end if;

	if v_post.taken_down_at is not null or (v_post.expires_at is not null and v_post.expires_at <= now()) then
		return jsonb_build_object('ok', false, 'reason', 'ended');
	end if;

	select count(*)::integer into v_count from public.classroom_quick_post_files f where f.post_id = p_post_id;
	if v_count >= 10 then
		return jsonb_build_object('ok', false, 'reason', 'too_many_files', 'limit', 10);
	end if;

	if p_size_bytes is not null and p_size_bytes < 0 then
		raise exception 'A file size cannot be negative.';
	end if;

	v_name := left(regexp_replace(coalesce(p_filename, ''), '^\s+|\s+$', '', 'g'), 255);
	if v_name = '' then
		v_name := 'file';
	end if;

	insert into public.classroom_quick_post_files (post_id, storage_key, filename, size_bytes, sort_order)
	values (p_post_id, p_storage_key, v_name, p_size_bytes, v_count + 1)
	on conflict (storage_key) do nothing
	returning id into v_id;

	if v_id is null then
		-- The key is taken by a row this post does not own. The shape check
		-- above already ties a key to its post, so this is a race nobody
		-- should be able to produce; it still refuses rather than writes.
		raise exception 'That storage key does not belong to this notice.';
	end if;

	return jsonb_build_object(
		'ok', true,
		'already', false,
		'file', jsonb_build_object('id', v_id, 'filename', v_name, 'size_bytes', p_size_bytes)
	);
end;
$qp$;

revoke all on function public.classroom_quick_post_add_file(uuid, text, text, bigint)
	from public, anon, authenticated;
grant execute on function public.classroom_quick_post_add_file(uuid, text, text, bigint) to authenticated;

-- 5. ONE FILE, for the route that mints its signed URL. The notice's own
--    audience, else 'Not found.', identical for a file that does not exist
--    and one the caller may not read. The route then signs on the CALLER's
--    session, so the storage select policy asks again: two refusals.
create or replace function public.classroom_quick_post_file(p_file_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $qp$
declare
	v_file public.classroom_quick_post_files%rowtype;
begin
	if public.current_user_email() = '' then
		raise exception 'You must be signed in to open a class notice file.';
	end if;

	select * into v_file from public.classroom_quick_post_files f where f.id = p_file_id;
	if not found or not public._classroom_quick_post_readable(v_file.post_id) then
		raise exception 'Not found.';
	end if;

	return jsonb_build_object('ok', true, 'storage_key', v_file.storage_key, 'filename', v_file.filename);
end;
$qp$;

revoke all on function public.classroom_quick_post_file(uuid) from public, anon, authenticated;
grant execute on function public.classroom_quick_post_file(uuid) to authenticated;

-- 6. THE STORAGE HALF, GUARDED (see the header). The bucket's size literal is
--    written out (47185920, which is portal_upload_max_bytes()) because
--    tests/upload-limits.test.ts reads every storage.buckets literal and
--    checks it against the registry. No update, delete or anon policy: keys
--    are fresh uuids, nothing legitimately overwrites one, and this bucket is
--    never public.
do $qp$
begin
	begin
		insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
		values ('quick-post-files', 'quick-post-files', false, 47185920, null)
		on conflict (id) do update
			set public = false, file_size_limit = 47185920, allowed_mime_types = null;

		drop policy if exists "quick post files insert by author" on storage.objects;
		create policy "quick post files insert by author"
			on storage.objects
			for insert
			to authenticated
			with check (
				bucket_id = 'quick-post-files'
				and public.classroom_can_write_quick_post_object(name)
			);

		drop policy if exists "quick post files readable by the class" on storage.objects;
		create policy "quick post files readable by the class"
			on storage.objects
			for select
			to authenticated
			using (
				bucket_id = 'quick-post-files'
				and public.classroom_can_read_quick_post_object(name)
			);
	exception when insufficient_privilege then
		raise notice '0233 quick-posts: the storage half was NOT applied (this role cannot write storage.buckets or storage.objects policies). Re-paste 0233 in the SQL editor to finish it; quick posts stay text-only until then.';
	end;
end;
$qp$;

-- 7. THE READ, the 0230 body with files on each post and two top-level keys.
--    files never carries a storage key or an address. files_ready is the
--    insert policy's presence, so the picker is offered exactly when the
--    storage half landed; limits is what the composer counts against.
create or replace function public.classroom_quick_posts(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_posts jsonb;
	v_ready boolean;
begin
	if v_email = '' then
		raise exception 'You must be signed in to read class notices.';
	end if;

	v_manages := public.classroom_manages_section(p_section_id) is true;
	if not v_manages and not public.classroom_is_enrolled(p_section_id) then
		raise exception 'Not found.';
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', x.id,
			'body', x.body,
			'created_at', x.created_at,
			'expires_at', x.expires_at,
			'section_ids', case when v_manages then (
				select coalesce(jsonb_agg(t2.section_id order by t2.section_id), '[]'::jsonb)
				from public.classroom_quick_post_sections t2
				where t2.post_id = x.id
					and public.classroom_manages_section(t2.section_id)
			) end,
			'can_take_down', case
				when v_manages then public._classroom_quick_post_can_take_down(x.id, v_email)
				else false
			end,
			'files', (
				select coalesce(jsonb_agg(jsonb_build_object(
						'id', f.id,
						'filename', f.filename,
						'size_bytes', f.size_bytes
					) order by f.sort_order, f.created_at, f.id), '[]'::jsonb)
				from public.classroom_quick_post_files f
				where f.post_id = x.id
			)
		) order by x.created_at desc, x.id), '[]'::jsonb)
	into v_posts
	from (
		select p.id, p.body, p.created_at, p.expires_at
		from public.classroom_quick_posts p
		join public.classroom_quick_post_sections t on t.post_id = p.id
		where t.section_id = p_section_id
			and p.taken_down_at is null
			and (p.expires_at is null or p.expires_at > now())
		order by p.created_at desc, p.id
		limit 20
	) x;

	v_ready := exists (
		select 1 from pg_catalog.pg_policies pol
		where pol.schemaname = 'storage'
			and pol.tablename = 'objects'
			and pol.policyname = 'quick post files insert by author'
	);

	return jsonb_build_object(
		'ok', true,
		'manages', v_manages,
		'now', now(),
		'posts', v_posts,
		'files_ready', v_ready,
		'limits', jsonb_build_object(
			'max_chars', 4000,
			'max_files', 10,
			'max_bytes', public.portal_upload_max_bytes()
		)
	);
end;
$qp$;

revoke all on function public.classroom_quick_posts(uuid) from public, anon, authenticated;
grant execute on function public.classroom_quick_posts(uuid) to authenticated;

-- 8. SELF-CHECK over this part's own objects, by name. A raise is a refusal:
--    the whole file rolls back.
do $qp$
declare
	v_fn text;
	v_bad text[] := '{}';
	v_live integer;
	v_long integer;
	v_files integer;
	v_storage boolean;
begin
	foreach v_fn in array array[
		'public.classroom_quick_post_create(uuid[], text, timestamptz)',
		'public.classroom_quick_posts(uuid)',
		'public.classroom_quick_post_add_file(uuid, text, text, bigint)',
		'public.classroom_quick_post_file(uuid)',
		'public.classroom_can_read_quick_post_object(text)',
		'public.classroom_can_write_quick_post_object(text)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			v_bad := v_bad || ('anon executes ' || v_fn);
		end if;
		if not has_function_privilege('authenticated', v_fn, 'execute') then
			v_bad := v_bad || ('authenticated cannot execute ' || v_fn);
		end if;
	end loop;
	foreach v_fn in array array[
		'public._classroom_quick_post_readable(uuid)',
		'public._classroom_quick_post_writable(uuid)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute') then
			v_bad := v_bad || ('a client role executes the private ' || v_fn);
		end if;
	end loop;
	foreach v_fn in array array['classroom_quick_posts', 'classroom_quick_post_create', 'classroom_quick_post_add_file', 'classroom_quick_post_file'] loop
		if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = v_fn) <> 1 then
			v_bad := v_bad || ('not exactly one overload of ' || v_fn);
		end if;
	end loop;
	if has_table_privilege('anon', 'public.classroom_quick_post_files', 'select')
		or has_table_privilege('anon', 'public.classroom_quick_post_files', 'insert')
		or has_table_privilege('authenticated', 'public.classroom_quick_post_files', 'select')
		or has_table_privilege('authenticated', 'public.classroom_quick_post_files', 'insert')
		or has_table_privilege('authenticated', 'public.classroom_quick_post_files', 'update')
		or has_table_privilege('authenticated', 'public.classroom_quick_post_files', 'delete') then
		v_bad := v_bad || 'a client role holds a privilege on classroom_quick_post_files'::text;
	end if;
	if not exists (
		select 1 from pg_catalog.pg_constraint c
		where c.conrelid = 'public.classroom_quick_posts'::regclass
			and c.conname = 'classroom_quick_posts_body_shape'
			and pg_catalog.pg_get_constraintdef(c.oid) like '%4000%'
	) then
		v_bad := v_bad || 'the body ceiling is not 4000'::text;
	end if;

	v_storage := exists (
		select 1 from pg_catalog.pg_policies pol
		where pol.schemaname = 'storage' and pol.tablename = 'objects'
			and pol.policyname = 'quick post files insert by author'
	);
	if v_storage then
		if not exists (
			select 1 from storage.buckets b
			where b.id = 'quick-post-files' and b.public = false and b.allowed_mime_types is null
				and b.file_size_limit = public.portal_upload_max_bytes()
		) then
			v_bad := v_bad || 'the quick-post-files bucket is not private, unlisted and at the portal ceiling'::text;
		end if;
		if exists (
			select 1 from pg_catalog.pg_policies pol
			where pol.schemaname = 'storage' and pol.tablename = 'objects'
				and (coalesce(pol.qual, '') || coalesce(pol.with_check, '')) like '%quick-post-files%'
				and (pol.roles && array['anon', 'public']::name[])
		) then
			v_bad := v_bad || 'a policy on the quick-post-files bucket names anon or public'::text;
		end if;
		if not exists (
			select 1 from pg_catalog.pg_policies pol
			where pol.schemaname = 'storage' and pol.tablename = 'objects'
				and pol.policyname = 'quick post files readable by the class'
		) then
			v_bad := v_bad || 'the read policy is missing beside the insert policy'::text;
		end if;
	end if;

	if cardinality(v_bad) > 0 then
		raise exception '0233 quick-posts self-check refused (% problem(s)): %', cardinality(v_bad), array_to_string(v_bad, '; ');
	end if;

	select count(*)::integer into v_live from public.classroom_quick_posts p
	where p.taken_down_at is null and (p.expires_at is null or p.expires_at > now());
	select count(*)::integer into v_long from public.classroom_quick_posts p where char_length(p.body) > 1000;
	select count(*)::integer into v_files from public.classroom_quick_post_files;
	raise notice '0233 quick-posts: % live notice(s), % over 1000 characters, % file row(s); storage half %.',
		v_live, v_long, v_files, case when v_storage then 'applied' else 'NOT applied (re-paste 0233 in the SQL editor)' end;
end;
$qp$;

-- UNDO (refuses rather than destroys). In the SQL editor, in this order:
--   1. drop policy if exists "quick post files insert by author" on storage.objects;
--      drop policy if exists "quick post files readable by the class" on storage.objects;
--   2. drop function if exists public.classroom_quick_post_file(uuid);
--      drop function if exists public.classroom_quick_post_add_file(uuid, text, text, bigint);
--      drop function if exists public.classroom_can_read_quick_post_object(text);
--      drop function if exists public.classroom_can_write_quick_post_object(text);
--      drop function if exists public._classroom_quick_post_readable(uuid);
--      drop function if exists public._classroom_quick_post_writable(uuid);
--   3. Re-run the read and the create sections of 0230 verbatim (it restores
--      the 1000 literal in the create and drops files_ready and limits, which
--      the client reads as no files and 1000 characters).
--   4. Restore the 1000-character CHECK ONLY if no stored body exceeds 1000:
--      count them first and stop if the count is not zero, because putting the
--      old check back over a longer notice refuses the whole statement.
--   5. The file table and the bucket's objects are left for a person to remove
--      by hand, after reading what is in them. Nothing here deletes them.
-- ===== PART quick-posts END =====
