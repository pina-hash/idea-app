-- 0163_maps_media.sql
--
-- IDEA MAPS, FILE 3 OF 3: PHOTOS AND STORAGE. The `maps-media` bucket and the
-- maps_photos attachment table, per docs/standards/IDEA_MAPS_SPEC.md v1.1
-- section 4.4: photos attach to nodes, item types and items; the bucket is
-- PUBLIC READ; images only. Requires 0161 (the owner tables and _maps_touch)
-- and 0067 (public.is_admin).
--
-- ---------------------------------------------------------------------------
-- THE BUCKET, AND THE TWO NUMBERS CHOSEN AT BUILD TIME
-- ---------------------------------------------------------------------------
-- Created exactly the way this repo's other buckets are (0133/0135: insert
-- into storage.buckets, on conflict do update pinning the settings), but
-- public=true -- the spec's own call, stated with its cost: "a draft photo is
-- fetchable by URL before publish; accepted, because everything in this
-- system is destined to be public and nothing sensitive is ever photographed
-- into it" (4.4).
--
--   * SIZE CEILING: 20 MiB (20971520 bytes) per object. A phone camera photo
--     is 3-12 MB even on recent hardware; 20 MiB clears every real capture
--     with headroom while refusing the accidental video or raw export. The
--     spec says only "ceiling set at build time" -- this is that decision.
--   * IMAGES ONLY: allowed_mime_types = {image/*} (Storage matches wildcard
--     types). Enforcement is at upload time against the request's declared
--     content type, so the P1 editor's upload path must set a concrete
--     image/* type from the file's extension -- File.type is legitimately
--     EMPTY for HEIC off an iPhone (CLAUDE.md, DOM traps), and an empty type
--     defaults to application/octet-stream, which this bucket refuses.
--     That obligation is the editor bundle's and is stated here so it is not
--     discovered as a field bug.
--
-- maps-media differs from the classroom buckets ON PURPOSE: those are private
-- with attachment-disposition signed URLs because they hold people's
-- arbitrary files; this one is public because it holds photographs of rooms
-- and toolboxes that the spec declares public. The images-only mime list is
-- what keeps "public read" from ever meaning "someone's uploaded document
-- served from our storage": Storage refuses non-image declared types at
-- upload, and its renderer additionally rewrites text/html to text/plain
-- unconditionally (the measured storage-api behaviour in CLAUDE.md), so even
-- a mislabelled upload cannot serve as a document.
--
-- ---------------------------------------------------------------------------
-- THE ATTACHMENT ROW
-- ---------------------------------------------------------------------------
-- maps_photos: exactly one owner among (node, item type, item) -- the 0126
-- XOR shape, with real FKs and on delete cascade so photo rows follow their
-- owner. storage_key names the object in maps-media; nothing a person typed
-- appears in a key (the editor mints uuid-based keys; the shape CHECK here
-- refuses traversal-looking and absolute keys outright). A photo row has no
-- draft/publish state of its own: 4.3 names nodes, item types, items and
-- stock, and a photo is CONTENT OF its owner -- anonymous readers see a
-- photo row only while its owner is published (RLS below), which is the
-- same moment the owner itself appears. The bytes behind a draft owner's
-- photo are URL-fetchable regardless, which is the 4.4 trade quoted above.
--
-- WRITES ARE ADMIN (public.is_admin(), the repo's admin predicate), on the
-- table and on the bucket's objects alike, matching 0161's editor-role
-- policies. Anonymous callers read and nothing else -- no insert, update or
-- delete anywhere in this file.
--
-- DECIDED HERE BECAUSE THE SPEC IS SILENT: storage_key is globally unique
-- (one photo row per stored object -- two rows sharing bytes would leave one
-- row pointing at nothing the day the other's object is removed); caption
-- <= 500 chars; sort_order integer for gallery ordering, ties on created_at;
-- deleting a photo ROW does not delete the OBJECT (there is no
-- storage-side sweep in this bundle -- rows-first, and orphaned public
-- image bytes are the acceptable failure exactly as the Foundry delete
-- argues; a sweep belongs to the editor bundle if it proves worth having).
--
-- DELIBERATELY LEFT ALONE: no photo ordering RPC, no upload signing route
-- (admin browser uploads go straight to Storage under the policies below),
-- no stock photos (4.4 names nodes, item types and items only -- a stocked
-- placement shows its TYPE's photos), no revision machinery for photo rows
-- (see above), no search over captions (0162 owns search and 5.1 does not
-- index captions).
--
-- UNDO:
--   drop table public.maps_photos;
--   drop policy maps_media_public_read on storage.objects;
--   drop policy maps_media_admin_insert on storage.objects;
--   drop policy maps_media_admin_update on storage.objects;
--   drop policy maps_media_admin_delete on storage.objects;
--   delete from storage.buckets where id = 'maps-media';  -- refuses while objects remain
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The bucket. Public read, 20 MiB, images only.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maps-media', 'maps-media', true, 20971520, array['image/*'])
on conflict (id) do update
	set public = true,
		file_size_limit = 20971520,
		allowed_mime_types = array['image/*'];

-- ---------------------------------------------------------------------------
-- 2. The attachment rows.
-- ---------------------------------------------------------------------------

create table if not exists public.maps_photos (
	id uuid primary key default gen_random_uuid(),
	node_id uuid references public.maps_nodes (id) on delete cascade,
	item_type_id uuid references public.maps_item_types (id) on delete cascade,
	item_id uuid references public.maps_items (id) on delete cascade,
	constraint maps_photos_exactly_one_owner
		check (num_nonnulls(node_id, item_type_id, item_id) = 1),
	storage_key text not null unique
		constraint maps_photos_key_shape check (
			storage_key ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
			and position('..' in storage_key) = 0
			and char_length(storage_key) <= 1024
		),
	caption text
		constraint maps_photos_caption_len check (caption is null or char_length(caption) <= 500),
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists maps_photos_node on public.maps_photos (node_id)
	where node_id is not null;
create index if not exists maps_photos_item_type on public.maps_photos (item_type_id)
	where item_type_id is not null;
create index if not exists maps_photos_item on public.maps_photos (item_id)
	where item_id is not null;

drop trigger if exists maps_photos_touch on public.maps_photos;
create trigger maps_photos_touch
	before update on public.maps_photos
	for each row execute function public._maps_touch();

-- ---------------------------------------------------------------------------
-- 3. RLS on the rows: public read follows the OWNER's published state; every
--    write is admin. The owner-status subqueries name status='published'
--    directly, so the policy holds even where the querying role's own read
--    of the owner table is wider (an admin still reads every photo through
--    the admin policy beside it).
-- ---------------------------------------------------------------------------

alter table public.maps_photos enable row level security;

drop policy if exists maps_photos_public_read on public.maps_photos;
create policy maps_photos_public_read on public.maps_photos
	for select to anon, authenticated
	using (
		(node_id is not null and exists (
			select 1 from public.maps_nodes n where n.id = node_id and n.status = 'published'))
		or (item_type_id is not null and exists (
			select 1 from public.maps_item_types t where t.id = item_type_id and t.status = 'published'))
		or (item_id is not null and exists (
			select 1 from public.maps_items i where i.id = item_id and i.status = 'published'))
	);

drop policy if exists maps_photos_admin_read on public.maps_photos;
create policy maps_photos_admin_read on public.maps_photos
	for select to authenticated
	using (public.is_admin());
drop policy if exists maps_photos_admin_insert on public.maps_photos;
create policy maps_photos_admin_insert on public.maps_photos
	for insert to authenticated
	with check (public.is_admin());
drop policy if exists maps_photos_admin_update on public.maps_photos;
create policy maps_photos_admin_update on public.maps_photos
	for update to authenticated
	using (public.is_admin())
	with check (public.is_admin());
drop policy if exists maps_photos_admin_delete on public.maps_photos;
create policy maps_photos_admin_delete on public.maps_photos
	for delete to authenticated
	using (public.is_admin());

revoke all on table public.maps_photos from public, anon, authenticated;
grant select on table public.maps_photos to anon, authenticated;
grant insert, update, delete on table public.maps_photos to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage policies on the bucket's objects: public read (matching the
--    bucket's own public flag, so the API list/read path and the public URL
--    path answer alike), admin writes.
-- ---------------------------------------------------------------------------

drop policy if exists maps_media_public_read on storage.objects;
create policy maps_media_public_read on storage.objects
	for select to anon, authenticated
	using (bucket_id = 'maps-media');

drop policy if exists maps_media_admin_insert on storage.objects;
create policy maps_media_admin_insert on storage.objects
	for insert to authenticated
	with check (bucket_id = 'maps-media' and public.is_admin());

drop policy if exists maps_media_admin_update on storage.objects;
create policy maps_media_admin_update on storage.objects
	for update to authenticated
	using (bucket_id = 'maps-media' and public.is_admin())
	with check (bucket_id = 'maps-media' and public.is_admin());

drop policy if exists maps_media_admin_delete on storage.objects;
create policy maps_media_admin_delete on storage.objects
	for delete to authenticated
	using (bucket_id = 'maps-media' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Self-check: the bucket's settings and the ACLs, read back.
-- ---------------------------------------------------------------------------

do $$
declare
	v_bucket record;
	v_count integer;
begin
	select public, file_size_limit, allowed_mime_types into v_bucket
	from storage.buckets where id = 'maps-media';
	if v_bucket is null then
		raise exception '0163: the maps-media bucket does not exist.';
	end if;
	if not v_bucket.public
		or v_bucket.file_size_limit is distinct from 20971520
		or v_bucket.allowed_mime_types is distinct from array['image/*'] then
		raise exception '0163: maps-media is not public/20MiB/images-only (public=%, limit=%, mimes=%).',
			v_bucket.public, v_bucket.file_size_limit, v_bucket.allowed_mime_types;
	end if;
	raise notice '0163: bucket maps-media -- public read, 20 MiB ceiling, images only.';

	select count(*) into v_count from pg_policies
	where schemaname = 'storage' and tablename = 'objects' and policyname like 'maps\_media\_%';
	if v_count <> 4 then
		raise exception '0163: storage.objects carries % maps_media policies, expected 4.', v_count;
	end if;
	raise notice '0163: 4 maps_media policies on storage.objects (public read, admin insert/update/delete).';

	if not (select relrowsecurity from pg_class where oid = 'public.maps_photos'::regclass) then
		raise exception '0163: RLS is OFF on maps_photos.';
	end if;
	select count(*) into v_count from pg_policies
	where schemaname = 'public' and tablename = 'maps_photos';
	if v_count <> 5 then
		raise exception '0163: maps_photos has % policies, expected 5.', v_count;
	end if;
	if not has_table_privilege('anon', 'public.maps_photos', 'select') then
		raise exception '0163: anon cannot SELECT maps_photos -- the public gallery read is broken.';
	end if;
	if has_table_privilege('anon', 'public.maps_photos', 'insert')
		or has_table_privilege('anon', 'public.maps_photos', 'update')
		or has_table_privilege('anon', 'public.maps_photos', 'delete') then
		raise exception '0163: anon holds a WRITE grant on maps_photos.';
	end if;
	select count(*) into v_count from public.maps_photos;
	raise notice '0163: maps_photos -- RLS on, 5 policies, anon read-only; % row(s) (0 expected on a first apply, nothing backfilled).', v_count;
end $$;
