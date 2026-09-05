-- 0183_foundry_covers_private.sql
--
-- CLOSE THE `foundry-covers` BUCKET. Cover art a student drew for a game they
-- published stops being world readable and becomes readable by a signed-in
-- caller only.
--
-- This is 0181 (`avatars`) applied to the second of the three buckets prompt
-- 0052's sweep named. The third, `tournament-thumbs`, is deliberately NOT in
-- this file; the last section says why.
--
-- ---------------------------------------------------------------------------
-- WHAT 0130 ACTUALLY BUILT, AND WHAT WAS MEASURED
--
-- `0130_foundry.sql` created `foundry-covers` with `public = true` and a
-- select policy `to public using (bucket_id = 'foundry-covers')`, described in
-- its own comment as "public read (inherent to a public bucket, plus the
-- explicit select policy the 0020 avatars bucket also carries so a signed
-- request resolves the same way)". Writes were own-folder only then and are
-- own-folder only now; this file does not touch them.
--
-- MEASURED RATHER THAN READ OFF THE POLICY. A genuinely anonymous caller
-- (`SET ROLE anon`, no claims) was put to a real Postgres with 0001, 0003,
-- 0004, 0020, 0062, 0067, 0053, 0082, 0083, 0085, 0090, 0101, 0130 and 0131
-- applied, over an object written through the bucket's own write policy:
--
--   * `select count(*) from storage.objects where bucket_id = 'foundry-covers'
--      and name = <key>`  ->  1
--   * `select name from storage.objects where bucket_id = 'foundry-covers'`
--      ->  every key in the bucket
--
-- and on THE SAME CONNECTION `select count(*) from public.profiles` answered
-- `permission denied for table profiles`. That control is what says the
-- listing was this policy rather than RLS being off, and it is 0052's control
-- re-run here rather than its result borrowed.
--
-- That is the whole argument for this file. A random key is a defence against
-- guessing and no defence at all against a listing, so the fix has to be the
-- boundary and not the key -- and the keys ARE random: all three upload sites
-- build `<uid>/<uuid>.<ext>`.
--
-- ---------------------------------------------------------------------------
-- THE TWO HALVES, AND BOTH ARE NEEDED
--
--   1. `public = false` on the bucket row. This is what stops
--      `/storage/v1/object/public/foundry-covers/<key>` answering at all --
--      the storage renderer serves that endpoint only for a bucket flagged
--      public, and no policy governs it.
--   2. The `foundry covers public read` policy is DROPPED and replaced by
--      `foundry covers authenticated read`, `to authenticated`. This is what
--      stops `anon` reading -- and LISTING -- through the authenticated and
--      signed-URL paths, which the bucket flag does not govern.
--
-- Dropping one without the other leaves the store open by the other route, so
-- the file does both and section 3 asserts both. 0181 records the same finding
-- for `avatars`; this file re-asserts it for its own bucket rather than citing
-- it, because a self-check that trusts another migration's measurement is not
-- a self-check.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--
-- IT DOES NOT DECIDE WHO MAY SEE WHOSE COVER. `to authenticated` is exactly
-- the tier every surface that renders one already sits in: `/foundry` is in
-- `authedPrefixes`, and the gallery deliberately shows every signed-in student
-- every published app. Narrowing THAT is a separate decision with an owner,
-- and a migration that narrowed it here would break the gallery while claiming
-- to fix a bucket.
--
-- IT DOES NOT CLOSE A HIDDEN APP'S COVER. `foundry_set_app_hidden` shelves an
-- app off the gallery, the serving route and its owner's list; the cover
-- OBJECT is untouched by that call, so a signed-in caller holding the key
-- still reads it. That is unchanged here -- it was world readable before -- and
-- closing it means keying the read on `_foundry_app_in_population`, which a
-- storage policy cannot do without a per-object join and which is a separate
-- decision. Stated rather than left to be discovered.
--
-- IT DOES NOT MOVE ANY BYTES AND CANNOT. Every object keeps its key, so every
-- `student_apps.cover_path` value keeps naming the object it always named.
-- Nothing is backfilled and nothing needs to be.
--
-- IT DOES NOT TOUCH THE WRITE POLICIES. `foundry covers insert own folder`,
-- `foundry covers update own folder` and `foundry covers delete own folder`
-- are 0130's, are `to authenticated`, key on the first path segment, and are
-- unaffected by the bucket's public flag. A student still uploads their own
-- cover exactly as before, and `POST /api/foundry/delete` still sweeps it.
--
-- IT DOES NOT TOUCH `tournament-thumbs`, WHICH IS THE THIRD BUCKET 0052's
-- SWEEP NAMED, AND THAT IS A DECISION RATHER THAN AN OMISSION.
-- `0062_tournaments.sql` makes the live bracket a SPECTATOR surface reached
-- with no session at all: `/tournaments` is not in `authedPrefixes`, the
-- `[id]` page load says "fully PUBLIC (no session, no cookie needed)" in its
-- own header, and every tournament table carries
-- `for select to anon, authenticated using (true)`. So the same treatment
-- there is not a fix, it is a public page that stops showing thumbnails.
--
-- And the exposure is differently shaped: `tournament_entries.thumbnail_url`
-- stores the WHOLE PUBLIC URL, in a table any anonymous caller may select, so
-- for an entry thumbnail the storage listing is a second door to a room whose
-- front door is deliberately open. What the listing adds beyond that is the
-- objects no public row names -- banner art from 0064, and replaced or
-- orphaned uploads. Narrowing the policy while leaving `public = true` would
-- close exactly that residue, and it rests on the half of section 2 above that
-- this repo cannot measure without a running storage-api. It is written up as
-- an open item with an owner rather than shipped on a reasoned guess.
--
-- ---------------------------------------------------------------------------
-- THE CLIENT HALF, WHICH SHIPS WITH THE APP AND NOT WITH THIS FILE
--
-- Three route files each built `getPublicUrl(cover_path)` and handed the
-- result down as the `coverUrl` prop. They now call `foundryCoverUrl` in
-- `$lib/foundry/covers.ts`, which returns `/api/foundry-cover/<key>` on our
-- own origin, and `src/routes/api/foundry-cover/[...path]/+server.ts` mints a
-- short-lived signed URL on THE CALLER'S OWN client and 302s to it -- so the
-- policy below is the authorization boundary and the route is not. There is no
-- service-role client on that path and there must not be one.
--
-- ORDERING. APP FIRST, THEN THIS FILE, and the asymmetry is the whole reason
-- to say so:
--   * app deployed, file not applied -> every cover renders. A signed URL is
--     mintable against a public bucket too, so the proxy works before the
--     bucket closes. The bucket stays open until this file lands, which is the
--     state of the world today.
--   * file applied, app not deployed -> every cover on every Foundry surface
--     is a broken image, because the pages are still asking
--     `/storage/v1/object/public/foundry-covers/<key>` of a bucket that has
--     stopped answering. On 2026-09-05 that exact reversal broke every avatar
--     on the site until the app half merged.
-- There is no window in the correct order, so take it.
--
-- WHAT UNDOES IT -- one statement plus the policy swap, re-asserting 0130:
--   update storage.buckets set public = true where id = 'foundry-covers';
--   drop policy if exists "foundry covers authenticated read" on storage.objects;
--   create policy "foundry covers public read" on storage.objects for select
--     to public using (bucket_id = 'foundry-covers');
-- and the store is open again exactly as it was. Nothing is destroyed by this
-- file, so the undo is total and safe to run at 8am without reading anything
-- else. The app half keeps working across the undo: a signed URL is mintable
-- against a public bucket, so the proxy route does not have to be reverted
-- with it.
--
-- Idempotent: every statement is a drop-then-create or an unconditional
-- update. Re-pasting it re-asserts the end state rather than half of it.
--
-- Apply manually in the Supabase SQL editor.

-- ===========================================================================
-- 1. The bucket flag.
-- ===========================================================================

update storage.buckets set public = false where id = 'foundry-covers';

-- ===========================================================================
-- 2. The read policy. `to authenticated`, replacing 0130's `to public`.
--
--    NAMED DIFFERENTLY ON PURPOSE. Reusing "foundry covers public read" for a
--    policy that is not a public read would leave the catalog lying to the
--    next person who greps it, and the drop below is what makes the rename
--    safe.
-- ===========================================================================

drop policy if exists "foundry covers public read" on storage.objects;
drop policy if exists "foundry covers authenticated read" on storage.objects;
create policy "foundry covers authenticated read"
	on storage.objects
	for select
	to authenticated
	using (bucket_id = 'foundry-covers');

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
	v_thumbs boolean;
begin
	select public into v_public from storage.buckets where id = 'foundry-covers';
	if v_public is distinct from false then
		raise exception 'foundry-covers bucket is still public (public = %)', v_public;
	end if;

	-- No policy on storage.objects may still admit `public` or `anon` to this
	-- bucket. Asked of pg_policies by ROLE rather than by name, so a policy
	-- somebody added under a different name is caught too.
	select count(*) into v_open
	from pg_policies
	where schemaname = 'storage'
		and tablename = 'objects'
		and cmd = 'SELECT'
		and qual like '%foundry-covers%'
		and (roles::text[] && array['public', 'anon']);
	if v_open <> 0 then
		raise exception 'foundry-covers still has % select policy/policies open to public or anon', v_open;
	end if;

	select count(*) into v_authed
	from pg_policies
	where schemaname = 'storage'
		and tablename = 'objects'
		and policyname = 'foundry covers authenticated read'
		and cmd = 'SELECT'
		and roles::text[] = array['authenticated'];
	if v_authed <> 1 then
		raise exception 'expected exactly one authenticated read policy on foundry-covers, found %', v_authed;
	end if;

	-- 0130's three write policies are untouched. If this file ever starts
	-- costing one of them, that is a regression rather than a tidy-up: the
	-- upload path and the delete sweep both depend on them.
	select count(*) into v_writes
	from pg_policies
	where schemaname = 'storage'
		and tablename = 'objects'
		and policyname in (
			'foundry covers insert own folder',
			'foundry covers update own folder',
			'foundry covers delete own folder'
		);
	if v_writes <> 3 then
		raise exception 'expected 0130''s three foundry-covers write policies, found %', v_writes;
	end if;

	-- The one bucket this file deliberately leaves open, asserted so that a
	-- later reader can tell "left alone on purpose" from "forgotten". If it is
	-- ever closed, it is closed by its own migration and this notice moves.
	select public into v_thumbs from storage.buckets where id = 'tournament-thumbs';
	raise notice 'foundry-covers: public = false, 1 authenticated read policy, 0 public/anon read policies, 3 write policies intact';
	raise notice 'tournament-thumbs: public = % -- untouched by this file, deliberately (see header)', v_thumbs;
end $$;
