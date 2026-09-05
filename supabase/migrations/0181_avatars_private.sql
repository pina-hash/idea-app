-- 0181_avatars_private.sql
--
-- CLOSE THE `avatars` BUCKET. A photograph of a minor stops being world
-- readable and becomes readable by a signed-in caller only.
--
-- ---------------------------------------------------------------------------
-- WHAT 0020 ACTUALLY BUILT, AND WHAT WAS MEASURED
--
-- `0020_profiles_identity.sql` created `avatars` with `public = true` and a
-- select policy `to public using (bucket_id = 'avatars')`, and said in prose
-- that "avatars are non-sensitive by design (they render on public
-- leaderboards)". Writes were own-folder only then and are own-folder only
-- now; this file does not touch them.
--
-- The reads were measured rather than read off the policy, three times.
-- Prompt 0033 put a genuinely anonymous caller to a real Postgres with 0020
-- applied and read another person's avatar object. Prompt 0038 confirmed it.
-- This bundle measured the half neither of them had: with that policy in
-- force an anonymous caller does not have to GUESS a key, it can LIST them --
-- `select name from storage.objects where bucket_id = 'avatars'` returns every
-- object in the bucket, because the policy places no restriction on WHICH rows
-- `public` may select and `anon` holds the table grant on a hosted project.
--
-- That is the whole argument for this file. A random key would have been a
-- defence against guessing and is no defence at all against a listing, so the
-- fix has to be the boundary and not the key.
--
-- ---------------------------------------------------------------------------
-- THE TWO HALVES, AND BOTH ARE NEEDED
--
--   1. `public = false` on the bucket row. This is what stops
--      `/storage/v1/object/public/avatars/<key>` answering at all -- the
--      storage renderer serves that endpoint only for a bucket flagged public,
--      and no policy governs it.
--   2. The `avatars public read` policy is DROPPED and replaced by
--      `avatars authenticated read`, `to authenticated`. This is what stops
--      `anon` reading -- and listing -- through the authenticated and
--      signed-URL paths, which the bucket flag does not govern.
--
-- Dropping one without the other leaves the store open by the other route, so
-- the file does both and section 3 asserts both.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--
-- IT DOES NOT DECIDE WHO MAY SEE WHOSE FACE. `to authenticated` is exactly the
-- tier every surface that renders an avatar already sits in: `/gauntlet`,
-- `/classroom`, `/notebook` and `/dashboard` are all behind
-- `authedPrefixes` or an admin gate, and the GAUNTLET leaderboard has shown
-- every signed-in student every other student's face since 0024. Narrowing
-- THAT is a separate decision with an owner, and a migration that narrowed it
-- here would break the leaderboard while claiming to fix a bucket.
--
-- What changes is the STRANGER. Before this file, anybody at all -- signed
-- out, unenrolled, a person who left the school, anybody handed a URL out of a
-- page's HTML -- read any object in the bucket, permanently. After it, a
-- caller with no session reads nothing.
--
-- IT DOES NOT MOVE ANY BYTES AND CANNOT. Every object keeps its key, so
-- every `profiles.avatar` value of the form `upload:<uid>/<file>` keeps
-- naming the object it always named. Nothing is backfilled and nothing needs
-- to be.
--
-- IT DOES NOT TOUCH THE WRITE POLICIES. `avatars insert own folder`,
-- `avatars update own folder` and `avatars delete own folder` are 0020's,
-- are `to authenticated`, key on the first path segment, and are unaffected
-- by the bucket's public flag. A person still uploads their own picture
-- exactly as before.
--
-- ---------------------------------------------------------------------------
-- THE CLIENT HALF, WHICH SHIPS WITH THE APP AND NOT WITH THIS FILE
--
-- `avatarUploadUrl` built `/storage/v1/object/public/avatars/<key>`, which
-- this file makes answer nothing. `Avatar.svelte` no longer renders that URL:
-- it renders `/avatar/<key>` on our own origin, and
-- `src/routes/avatar/[...path]/+server.ts` mints a short-lived signed URL on
-- THE CALLER'S OWN client and 302s to it -- so the policy below is the
-- authorization boundary and the route is not. There is no service-role
-- client on that path and there must not be.
--
-- ORDERING. Apply this file and deploy the app together; neither half is
-- correct alone, and the failure of each is visible and harmless:
--   * file applied, app not deployed -> every uploaded avatar renders as its
--     initials tile (the `onerror` fallback `Avatar.svelte` has carried since
--     0033). No hole, no broken glyph, no row movement.
--   * app deployed, file not applied -> the proxy route works, because a
--     signed URL is mintable against a public bucket too. The bucket stays
--     open until the file lands, which is the state of the world today.
-- Neither order breaks a page, so there is no drop-and-deploy window here.
--
-- WHAT UNDOES IT: re-apply 0020's two statements --
--   update storage.buckets set public = true where id = 'avatars';
--   drop policy if exists "avatars authenticated read" on storage.objects;
--   create policy "avatars public read" on storage.objects for select
--     to public using (bucket_id = 'avatars');
-- and the store is open again exactly as it was. Nothing is destroyed by this
-- file, so the undo is total.
--
-- Idempotent: every statement is a drop-then-create or an unconditional
-- update. Re-pasting it re-asserts the end state rather than half of it.
--
-- Apply manually in the Supabase SQL editor.

-- ===========================================================================
-- 1. The bucket flag.
-- ===========================================================================

update storage.buckets set public = false where id = 'avatars';

-- ===========================================================================
-- 2. The read policy. `to authenticated`, replacing 0020's `to public`.
--
--    NAMED DIFFERENTLY ON PURPOSE. Reusing "avatars public read" for a policy
--    that is not a public read would leave the catalog lying to the next
--    person who greps it, and the drop below is what makes the rename safe.
-- ===========================================================================

drop policy if exists "avatars public read" on storage.objects;
drop policy if exists "avatars authenticated read" on storage.objects;
create policy "avatars authenticated read"
	on storage.objects
	for select
	to authenticated
	using (bucket_id = 'avatars');

-- ===========================================================================
-- 3. Self-check. Both halves, and the negatives, asserted from the catalog
--    rather than from this file having run.
-- ===========================================================================

do $$
declare
	v_public boolean;
	v_open int;
	v_authed int;
	v_writes int;
begin
	select public into v_public from storage.buckets where id = 'avatars';
	if v_public is distinct from false then
		raise exception 'avatars bucket is still public (public = %)', v_public;
	end if;

	-- No policy on storage.objects may still admit `public` or `anon` to this
	-- bucket. Asked of pg_policies by ROLE rather than by name, so a policy
	-- somebody added under a different name is caught too.
	select count(*) into v_open
	from pg_policies
	where schemaname = 'storage'
		and tablename = 'objects'
		and cmd = 'SELECT'
		and qual like '%avatars%'
		and (roles::text[] && array['public', 'anon']);
	if v_open <> 0 then
		raise exception 'avatars still has % select policy/policies open to public or anon', v_open;
	end if;

	select count(*) into v_authed
	from pg_policies
	where schemaname = 'storage'
		and tablename = 'objects'
		and policyname = 'avatars authenticated read'
		and cmd = 'SELECT'
		and roles::text[] = array['authenticated'];
	if v_authed <> 1 then
		raise exception 'expected exactly one authenticated read policy on avatars, found %', v_authed;
	end if;

	-- 0020's three write policies are untouched. If this file ever starts
	-- costing one of them, that is a regression rather than a tidy-up.
	select count(*) into v_writes
	from pg_policies
	where schemaname = 'storage'
		and tablename = 'objects'
		and policyname in (
			'avatars insert own folder',
			'avatars update own folder',
			'avatars delete own folder'
		);
	if v_writes <> 3 then
		raise exception 'expected 0020''s three avatars write policies, found %', v_writes;
	end if;

	raise notice 'avatars: public = false, 1 authenticated read policy, 0 public/anon read policies, 3 write policies intact';
end $$;

