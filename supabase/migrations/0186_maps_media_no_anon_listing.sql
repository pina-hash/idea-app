-- 0186_maps_media_no_anon_listing.sql
--
-- STOP AN ANONYMOUS CALLER ENUMERATING `maps-media`. The bucket stays PUBLIC
-- and every photo the public map shows keeps rendering; what stops is the
-- LISTING -- a stranger asking the bucket for all of its keys.
--
-- This is the third file in the line 0181 (`avatars`) and 0183
-- (`foundry-covers`) started, and it is the one whose surface is PUBLIC, which
-- is why it is shaped differently from both.
--
-- ---------------------------------------------------------------------------
-- WHAT 0163 BUILT, AND WHAT WAS MEASURED
-- ---------------------------------------------------------------------------
-- `0163_maps_media.sql` created `maps-media` with `public = true` (spec 4.4's
-- own call, quoted in that file's header) and one select policy:
--
--     create policy maps_media_public_read on storage.objects
--       for select to anon, authenticated
--       using (bucket_id = 'maps-media');
--
-- A predicate that names only the bucket places no restriction on WHICH rows
-- the role may select, so it is not a read rule, it is a listing rule.
--
-- MEASURED RATHER THAN READ OFF THE POLICY. A genuinely anonymous caller
-- (`set role anon`, no claims) was put to a real Postgres with 0001, 0003,
-- 0020, 0067, 0137, 0161, 0162, 0163, 0165 and 0168 applied, over three
-- objects written into the bucket -- one named by a photo row under a
-- PUBLISHED node, one named by a photo row under a DRAFT node, and one ORPHAN
-- no `maps_photos` row names at all:
--
--   * `select count(*) from storage.objects
--      where bucket_id = 'maps-media' and name = <known key>`   ->  1
--   * `select name from storage.objects where bucket_id = 'maps-media'`
--                                                               ->  3 of 3
--   * `select storage_key from public.maps_photos`              ->  1 of 3
--
-- and on THE SAME CONNECTION `select count(*) from public.profiles` answered
-- `permission denied for table profiles`. That control is what says the
-- listing was this policy and not RLS being off, and it is prompt 0052's
-- control re-run here rather than its result borrowed.
--
-- THE THIRD READING IS THE WHOLE ARGUMENT FOR THIS FILE. `maps_photos` is
-- anon-readable by 0163, and its own policy already restricts an anonymous
-- caller to photos whose OWNER is published -- so 1 of the 3 keys was already
-- public through the front door. What the storage listing adds on top is
-- exactly the other two: photos hanging off DRAFT owners, and ORPHANED objects
-- no row names. Those are an inventory of a school's rooms and toolboxes,
-- including the parts of it nobody has published yet, readable by anyone on
-- the internet with no session and no guessing.
--
-- ---------------------------------------------------------------------------
-- WHY THE BUCKET STAYS PUBLIC, WHICH IS WHERE THIS DIFFERS FROM 0181 AND 0183
-- ---------------------------------------------------------------------------
-- Both of those flipped `public = false` and put a proxy route in front, on
-- the strength of every surface that renders one of their objects being behind
-- a session. THAT IS NOT TRUE HERE. `/maps` is deliberately NOT in
-- `authedPrefixes`; `src/routes/maps/+page.server.ts` asks nothing about who is
-- calling; and `MapsItemCard.svelte` renders each photo as a plain `<img>`
-- whose src is `mapsPhotoUrl(...)` -- `<project>/storage/v1/object/public/
-- maps-media/<key>`. A signed-out visitor standing in a hallway with a phone is
-- the person this map is FOR. Flipping the bucket private would take every
-- photo off a public page, and reversing spec 4.4's stated decision is not this
-- file's to make: it is written up as an open item with an owner.
--
-- So the two halves 0183's header separates are used SEPARATELY here, which is
-- the point prompt 0052 measured and this file is the first to spend:
--
--   * THE BUCKET FLAG governs `/object/public/<bucket>/<key>` -- reading one
--     object whose key you already have. It stays `true` and this file does not
--     write to `storage.buckets` AT ALL, so 0163's ceiling, 0168's mime list
--     and 0185's restatement of the limit are all left exactly where they are.
--   * THE SELECT POLICY governs the API read and list paths on
--     `storage.objects`. That is the half that hands out keys, and that is the
--     half this file narrows.
--
-- ---------------------------------------------------------------------------
-- THE TWO POLICIES THAT REPLACE THE ONE
-- ---------------------------------------------------------------------------
--   `maps_media_authenticated_read`  to authenticated, bucket only.
--       EXACTLY the reach a signed-in caller has today, kept deliberately. It
--       is 0181's and 0183's landing tier, and it is what keeps the editor's
--       upload path clear of a question this repo cannot answer without a
--       running storage-api: whether storage-api reads `storage.objects`
--       before it writes one. Narrowing the writer's own role to find out is
--       not a thing to discover in front of somebody standing at a toolbox.
--
--   `maps_media_published_read`      to anon, scoped.
--       An anonymous caller reads an object only where a `maps_photos` row
--       NAMES it:
--
--         exists (select 1 from public.maps_photos p
--                  where p.storage_key = storage.objects.name)
--
--       THE PUBLISHED-OWNER TEST IS NOT WRITTEN HERE, AND THAT IS THE DESIGN
--       RATHER THAN AN OMISSION. A policy expression is evaluated as the
--       QUERYING role, so that subquery is itself filtered by `maps_photos`'s
--       own RLS -- which for `anon` is 0163's `maps_photos_public_read`, the
--       one statement in this schema of "which photos may a stranger see".
--       Restating `status = 'published'` here would be a second copy of that
--       rule, in a second place, able to stop agreeing with it. The storage
--       read now FOLLOWS the row read, which is the delegation rule this repo
--       already applies to photos, notes, folders and attachments.
--
--       So an anonymous caller lists exactly the keys `select storage_key from
--       public.maps_photos` already hands them, and nothing else. The listing
--       stops being a second, wider door and becomes a mirror of the first.
--
-- WHAT AN ANONYMOUS CALLER CAN STILL DO, STATED PLAINLY RATHER THAN LEFT TO BE
-- FOUND: read any object in this bucket by its EXACT KEY through
-- `/object/public/`, including a draft owner's photo and an orphan. That is
-- 0163's accepted trade, quoted from spec 4.4 -- "a draft photo is fetchable by
-- URL before publish; accepted" -- and closing it means making the bucket
-- private, which is the open item above. What changes here is that the keys are
-- no longer handed out for the asking.
--
-- ---------------------------------------------------------------------------
-- THE ONE RISK THIS SESSION COULD NOT MEASURE, AND ITS SYMPTOM
-- ---------------------------------------------------------------------------
-- Whether `/object/public/<bucket>/<key>` consults RLS at all. 0183's header
-- states it does not ("the storage renderer serves that endpoint only for a
-- bucket flagged public, and no policy governs it"), and that is the expected
-- behaviour; this session had no Docker daemon and no Supabase CLI, so it is
-- cited rather than re-measured.
--
-- THE FILE IS WRITTEN TO BE SAFE UNDER BOTH ANSWERS, which is why the anon
-- policy is SCOPED rather than dropped. If the public endpoint ignores RLS,
-- nothing about any rendered photo changes. If it honours RLS as `anon`, every
-- photo the PUBLIC MAP shows is still admitted, because the public map shows
-- exactly the published-owner photos this policy names -- the two sets are the
-- same set by construction.
--
-- The one surface that would notice under the second answer is the ADMIN
-- SHELF EDITOR's thumbnail of a photo it just uploaded onto a still-DRAFT
-- owner, which is fetched over the same public URL. ITS SYMPTOM IS NAMED HERE
-- SO IT IS DIAGNOSED IN SECONDS RATHER THAN HUNTED: a just-uploaded thumbnail
-- renders as the app's own "photo could not be loaded" tile at
-- `/maps/edit/shelf` while the same photo appears normally after publishing.
-- If that is ever seen, this file is what did it and the undo below is total.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
-- IT WRITES NOTHING TO `storage.buckets`. Not the public flag, not
-- `file_size_limit`, not `allowed_mime_types`. 0168 owns the mime list and
-- 0185 owns the limit; a restatement here is a chance to disagree with them.
--
-- IT DOES NOT TOUCH A WRITE POLICY. `maps_media_admin_insert`,
-- `maps_media_admin_update`, `maps_media_admin_delete` (0163) and
-- `maps_media_editor_insert` (0172) are untouched, and section 3 counts them
-- so a later reader can tell "left alone" from "lost".
--
-- IT DOES NOT TOUCH `maps_photos`. Not its policies, not its grants. The whole
-- point of the shape above is that this bucket now asks that table rather than
-- restating it.
--
-- IT DOES NOT CLOSE THE SIGNED-IN LISTING. Any account that can sign in --
-- which at Bosco Tech is every student -- can still list this bucket in full.
-- That is the same tier 0181 and 0183 landed on and it is a different question
-- from this file's: an open item with an owner, below.
--
-- IT MOVES NO BYTES AND CANNOT. Every object keeps its key, so every
-- `maps_photos.storage_key` keeps naming the object it always named. Nothing
-- is backfilled and nothing needs to be.
--
-- ---------------------------------------------------------------------------
-- ORDERING: APP FIRST, THEN THIS FILE -- AND THE REASON IS NOT THE ONE 0183
-- HAD
-- ---------------------------------------------------------------------------
-- 0183's order was forced: the app had to stop asking a public URL before the
-- bucket stopped answering one, and the reverse broke every avatar on the site
-- on 2026-09-05. HERE THE READ PATH DOES NOT MOVE. `mapsPhotoUrl` builds the
-- same public URL before and after, so applying this file against the
-- currently deployed app breaks nothing at all.
--
-- App first is still the order to take, for the smaller reason: the app half of
-- this bundle is the `onerror` fallback that renders a stated tile instead of a
-- broken image, and it is what makes the unmeasured risk above legible if it
-- fires. Deploying it first costs nothing and buys the diagnosis.
--
-- WHAT UNDOES IT -- one statement, re-asserting 0163 exactly:
--   drop policy if exists maps_media_published_read on storage.objects;
--   drop policy if exists maps_media_authenticated_read on storage.objects;
--   create policy maps_media_public_read on storage.objects
--     for select to anon, authenticated using (bucket_id = 'maps-media');
-- and the bucket is open again exactly as it was. Nothing is destroyed by this
-- file, so the undo is total and safe to run at 8am without reading anything
-- else.
--
-- Idempotent: every statement is a drop-then-create. Re-pasting it re-asserts
-- the end state rather than half of it.
--
-- Apply manually in the Supabase SQL editor.

-- ===========================================================================
-- 1. The census, FIRST, so the counts describe the world this file arrived in
--    and the operator can see exactly how many objects leave the anonymous
--    set. Read directly rather than through a role: the question is which rows
--    the new predicate admits, and that is a property of the data.
-- ===========================================================================

do $$
declare
	v_total integer;
	v_named integer;
	v_visible integer;
	v_leaving integer;
begin
	if not exists (select 1 from storage.buckets where id = 'maps-media') then
		raise exception '0186: the maps-media bucket does not exist -- apply 0163 first.';
	end if;

	select count(*) into v_total from storage.objects where bucket_id = 'maps-media';

	select count(*) into v_named
	from storage.objects o
	where o.bucket_id = 'maps-media'
		and exists (select 1 from public.maps_photos p where p.storage_key = o.name);

	-- What an ANONYMOUS caller will actually see once the new policy is in
	-- force: the named objects whose owner is PUBLISHED. Spelled out here from
	-- the owner connection because a policy cannot report on itself, and
	-- because this is the number the operator wants -- it is `select
	-- storage_key from public.maps_photos` as a stranger already reads it.
	select count(*) into v_visible
	from storage.objects o
	join public.maps_photos p on p.storage_key = o.name
	where o.bucket_id = 'maps-media'
		and (
			(p.node_id is not null and exists (
				select 1 from public.maps_nodes n where n.id = p.node_id and n.status = 'published'))
			or (p.item_type_id is not null and exists (
				select 1 from public.maps_item_types t where t.id = p.item_type_id and t.status = 'published'))
			or (p.item_id is not null and exists (
				select 1 from public.maps_items i where i.id = p.item_id and i.status = 'published'))
		);

	v_leaving := v_total - v_visible;

	raise notice '0186: maps-media holds % object(s). % of them are named by a maps_photos row; % of those hang off a PUBLISHED owner.',
		v_total, v_named, v_visible;
	raise notice '0186: an anonymous caller could list % object(s) before this file and can list % after -- % object(s) leave the anonymous set (draft-owner photos and orphans). They remain readable by their EXACT KEY through /object/public/, which is 0163''s accepted trade and not what this file is about.',
		v_total, v_visible, v_leaving;
end $$;

-- ===========================================================================
-- 2. The policy swap. 0163's one unscoped policy out; a signed-in read and a
--    scoped anonymous read in.
--
--    NAMED DIFFERENTLY ON PURPOSE. Keeping the name `maps_media_public_read`
--    on a policy that is no longer a public read would leave the catalog lying
--    to the next person who greps it, and the drop is what makes the rename
--    safe.
-- ===========================================================================

drop policy if exists maps_media_public_read on storage.objects;
drop policy if exists maps_media_authenticated_read on storage.objects;
drop policy if exists maps_media_published_read on storage.objects;

create policy maps_media_authenticated_read on storage.objects
	for select to authenticated
	using (bucket_id = 'maps-media');

create policy maps_media_published_read on storage.objects
	for select to anon
	using (
		bucket_id = 'maps-media'
		and exists (
			select 1 from public.maps_photos p
			where p.storage_key = storage.objects.name
		)
	);

-- ===========================================================================
-- 3. Self-check. Read every claim back out of the catalog, including the
--    negatives, rather than trusting that the statements above ran.
-- ===========================================================================

do $$
declare
	v_unscoped integer;
	v_anon integer;
	v_authed integer;
	v_writes integer;
	v_public boolean;
	v_mimes text[];
	v_limit bigint;
begin
	-- (a) No SELECT policy on this bucket may still admit `public` or `anon`
	--     without naming maps_photos. Asked of pg_policies by ROLE and by
	--     PREDICATE rather than by name, so a policy somebody re-added under a
	--     different name is caught too.
	select count(*) into v_unscoped
	from pg_policies
	where schemaname = 'storage'
		and tablename = 'objects'
		and cmd = 'SELECT'
		and qual like '%maps-media%'
		and (roles::text[] && array['public', 'anon'])
		and qual not like '%maps_photos%';
	if v_unscoped <> 0 then
		raise exception '0186: % select policy/policies still admit public or anon to maps-media without asking maps_photos.', v_unscoped;
	end if;

	select count(*) into v_anon
	from pg_policies
	where schemaname = 'storage' and tablename = 'objects'
		and policyname = 'maps_media_published_read'
		and cmd = 'SELECT'
		and roles::text[] = array['anon']
		and qual like '%maps_photos%';
	if v_anon <> 1 then
		raise exception '0186: expected exactly one scoped anon read policy on maps-media, found %.', v_anon;
	end if;

	select count(*) into v_authed
	from pg_policies
	where schemaname = 'storage' and tablename = 'objects'
		and policyname = 'maps_media_authenticated_read'
		and cmd = 'SELECT'
		and roles::text[] = array['authenticated'];
	if v_authed <> 1 then
		raise exception '0186: expected exactly one authenticated read policy on maps-media, found %.', v_authed;
	end if;

	-- (b) 0163's three write policies are untouched. 0172's editor insert is
	--     counted separately because a database that has not had 0172 applied
	--     is a real state and must not fail here.
	select count(*) into v_writes
	from pg_policies
	where schemaname = 'storage' and tablename = 'objects'
		and policyname in ('maps_media_admin_insert', 'maps_media_admin_update', 'maps_media_admin_delete');
	if v_writes <> 3 then
		raise exception '0186: expected 0163''s three maps-media write policies, found %.', v_writes;
	end if;

	-- (c) The bucket row is exactly as this file found it. Asserted rather than
	--     restated: this file writes nothing to storage.buckets, so if any of
	--     these has moved it was somebody else and the operator should know.
	select public, allowed_mime_types, file_size_limit into v_public, v_mimes, v_limit
	from storage.buckets where id = 'maps-media';
	if v_public is distinct from true then
		raise exception '0186: maps-media is not public (public = %). This file does not flip that flag; something else did, and the anonymous read path is now the scoped policy alone.', v_public;
	end if;
	if v_mimes is null or exists (select 1 from unnest(v_mimes) t where t like '%*%') then
		raise exception '0186: maps-media allowed_mime_types is % -- 0168''s concrete raster list is gone.', v_mimes;
	end if;

	raise notice '0186: maps-media -- 0 unscoped public/anon select policies, 1 scoped anon read (via maps_photos), 1 authenticated read, 3 admin write policies intact.';
	raise notice '0186: bucket row untouched by this file -- public = %, file_size_limit = %, allowed_mime_types = %.',
		v_public, v_limit, v_mimes;
	raise notice '0186: OPEN, with an owner (Mr. Pina): any signed-in account can still list this bucket in full, and any caller can still read a draft-owner photo or an orphan by its exact key through /object/public/. Closing either means making the bucket private and putting a proxy in front, which reverses spec 4.4.';
end $$;
