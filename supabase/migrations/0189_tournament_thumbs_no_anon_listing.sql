-- 0189_tournament_thumbs_no_anon_listing.sql
--
-- STOP AN ANONYMOUS CALLER ENUMERATING `tournament-thumbs`. The bucket stays
-- PUBLIC and every thumbnail and banner the spectator bracket shows keeps
-- rendering; what stops is the LISTING -- a stranger asking the bucket for all
-- of its keys, including the ones no row names.
--
-- This is the FOURTH file in the line 0181 (`avatars`), 0183 (`foundry-covers`)
-- and 0186 (`maps-media`) started, and it is the LAST bucket in the project a
-- stranger can enumerate. 0183's own header named this bucket as the one it
-- deliberately left open and said why; 0186 built the shape that closes a
-- bucket whose front door must stay open. This file is 0186 applied here.
--
-- ---------------------------------------------------------------------------
-- WHAT 0062 BUILT, AND WHAT WAS MEASURED
-- ---------------------------------------------------------------------------
-- `0062_tournaments.sql` section 3 created `tournament-thumbs` with
-- `public = true` and one select policy:
--
--     create policy "tournament thumbs public read" on storage.objects
--       for select to public
--       using (bucket_id = 'tournament-thumbs');
--
-- `to public`, which is WIDER than the `to anon, authenticated` 0163 gave
-- `maps-media`: in Postgres `public` is every role there is. And a predicate
-- that names only the bucket places no restriction on WHICH rows the role may
-- select, so it is not a read rule, it is a listing rule.
--
-- MEASURED RATHER THAN READ OFF THE POLICY, against a real Postgres with 0001,
-- 0003, 0004, 0020, 0062 and 0064 applied, as a genuinely anonymous caller
-- (`set role anon`, no claims), over FOUR objects written through the real
-- upload key shapes -- an entry thumbnail on a LIVE tournament, an entry
-- thumbnail on a DRAFT tournament, a banner background named by a
-- `tournament_entry_styles` row, and an ORPHAN no row names at all:
--
--   * `select count(*) ... where name = <known key>`        ->  1
--   * `select name from storage.objects` (the listing)      ->  4 of 4
--   * `select thumbnail_url from public.tournament_entries` ->  2 of 4
--   * `... plus tournament_entry_styles.background_value`   ->  3 of 4
--
-- and on THE SAME CONNECTION `select count(*) from public.profiles` answered
-- `permission denied for table profiles`. That control is what says the listing
-- was this policy and not RLS being off, and it is prompt 0052's control
-- re-run here rather than its result borrowed.
--
-- THE THIRD AND FOURTH READINGS ARE THE WHOLE ARGUMENT FOR THIS FILE, AND THEY
-- CORRECT A CLAIM TWO EARLIER FILES MADE. 0183's header and
-- `tests/db/tournament-thumb-stays-public.test.ts` both say the residue -- what
-- the listing adds over the public tables -- is "0064's banner art, and
-- replaced or orphaned uploads". THE BANNER ART IS NOT RESIDUE. That test
-- deliberately leaves 0064 out of its chain (it declares a Realtime publication
-- the stub does not create), so `tournament_entry_styles` does not exist while
-- it measures, and the banner it seeds is named by nothing. In production 0064
-- IS applied, and it grants `select` on `tournament_entry_styles` to `anon`
-- under `using (true)` exactly as 0062 does for entries -- so an anonymous
-- caller reads `background_value`, the whole public URL is in it, and the
-- banner comes through the FRONT door like every thumbnail.
--
-- WHAT IS ACTUALLY LEFT IS THE ORPHANS, AND THEY ARE NOT HYPOTHETICAL. Both
-- upload paths in `src/routes/tournaments/[id]/+page.svelte` PUT the bytes
-- before the row exists: `uploadThumb()` runs, and only then does
-- `tournament_register_entry` / `tournament_respond_invite` get called, so
-- every refused or abandoned registration leaves an object behind. The banner
-- path is worse: `uploadBackground()` uploads on file pick and the student can
-- pick again, or close the editor, and the earlier key is never referenced by
-- anything. Nothing sweeps either. So the residue is a pile of images STUDENTS
-- MADE -- a robot photo they replaced, a banner they thought better of -- keyed
-- under their own user uuid, enumerable by anyone on the internet with no
-- session and no guessing.
--
-- The two doors are therefore NOT the same width, and this file is what makes
-- them the same width.
--
-- ---------------------------------------------------------------------------
-- WHY THE BUCKET STAYS PUBLIC
-- ---------------------------------------------------------------------------
-- 0181 and 0183 flipped `public = false` and put a proxy in front, on the
-- strength of every surface that renders one of their objects being behind a
-- session. THAT IS NOT TRUE HERE, and 0183 said so rather than discovering it:
-- `/tournaments` is not in `authedPrefixes`, none of its seven page loads asks
-- who is calling before rendering a bracket, `tv/+page.server.ts` says "FULLY
-- PUBLIC" in its own header, and `EntryChip.svelte` / `EntryBanner.svelte`
-- render each thumbnail as a plain `<img src={entry.thumbnail_url}>` whose
-- value IS the `/object/public/` URL. A spectator standing at a projector with
-- no account is the person this bracket is FOR. Flipping the bucket private
-- would take every thumbnail off a public page.
--
-- So the two halves are used SEPARATELY, which is the split 0186 spent first:
--
--   * THE BUCKET FLAG governs `/object/public/<bucket>/<key>` -- reading ONE
--     object whose key you already have. It stays `true`, and this file writes
--     NOTHING to `storage.buckets`, so 0185's restatement of the size limit and
--     the (absent) mime list are left exactly where they are.
--   * THE SELECT POLICY governs the API read and list paths on
--     `storage.objects`. That is the half that hands out keys, and that is the
--     half this file narrows.
--
-- ---------------------------------------------------------------------------
-- THE TWO POLICIES THAT REPLACE THE ONE
-- ---------------------------------------------------------------------------
--   `tournament_thumbs_authenticated_read`  to authenticated, bucket only.
--       EXACTLY the reach a signed-in caller has today, kept deliberately. It
--       is 0181's, 0183's and 0186's landing tier, and it keeps the upload path
--       clear of a question this repo cannot answer without a running
--       storage-api: whether storage-api reads `storage.objects` before it
--       writes one. Narrowing the writer's own role to find out is not a thing
--       to discover in front of a student registering for a tournament that
--       starts in four minutes.
--
--   `tournament_thumbs_named_read`          to anon, scoped.
--       An anonymous caller reads an object only where a row a stranger can
--       ALREADY read names it -- an entry's `thumbnail_url`, or an image
--       banner's `background_value`.
--
--       THE VISIBILITY TEST IS NOT WRITTEN HERE, AND THAT IS THE DESIGN RATHER
--       THAN AN OMISSION. This is 0186's argument, transferred: a policy
--       expression is evaluated as the QUERYING role, so both subqueries are
--       themselves filtered by those tables' own RLS. For `anon` that is
--       0062's and 0064's `"public read" ... using (true)`, which is this
--       schema's one statement of "which entries may a stranger see" -- and it
--       is `true` on purpose, because the bracket is a spectator surface. The
--       storage read now FOLLOWS the row read instead of restating it, so if a
--       later migration ever narrows those tables (a draft tournament stops
--       being public, say) THIS POLICY NARROWS WITH THEM, with nothing to
--       remember and nothing to keep in sync.
--
--       WHERE THE ARGUMENT LANDS DIFFERENTLY FROM 0186, STATED SO IT IS NOT
--       READ AS THE SAME RESULT: `maps_photos`'s own anon policy is a
--       published-owner test, so delegating there dropped draft photos too.
--       Here both tables are `using (true)`, so delegation drops the ORPHANS
--       AND NOTHING ELSE. That is the honest size of this file. It is still
--       worth writing: the orphans are student work, and "a stranger can list
--       every image ever uploaded to this bucket" is the sentence that stops
--       being true.
--
-- ---------------------------------------------------------------------------
-- WHY THE KEY MATCH IS `right()` AND NOT `like '%' || name`
-- ---------------------------------------------------------------------------
-- `thumbnail_url` stores the WHOLE absolute public URL, not a key --
-- `getPublicUrl()`'s output, `<project>/storage/v1/object/public/
-- tournament-thumbs/<uid>/<uuid>.<ext>` -- so the key has to be recovered from
-- the far end of a string. A KEY IS RECOVERABLE and this file proves it by
-- doing it, but the obvious spelling is wrong: the object name is
-- ATTACKER-INFLUENCED, because the extension comes from
-- `file.name.split('.').pop()` with no allowlist, so a filename ending `._`
-- puts a LIKE wildcard inside the pattern and the predicate starts matching
-- objects it was never meant to. `right(url, length(name) + 1) = '/' || name`
-- is plain string equality with no metacharacters in it at all. The constant
-- `like '%/tournament-thumbs/%'` beside it is a fixed pattern with nothing
-- interpolated, and is what stops a row pointing at some other host from
-- unlocking a key it happens to end with.
--
-- A ROW WHOSE URL PREDATES ANY CONVENTION simply fails to match and its object
-- leaves the anonymous listing. That is the right failure direction: the column
-- has always accepted an arbitrary external URL (0062's own comment says
-- "Public URL or a path in the public 'tournament-thumbs' bucket"), such a row
-- names no object in this bucket, and an unmatched row costs a stranger a
-- listing entry rather than costing a spectator a picture -- the `<img>` reads
-- `thumbnail_url` and goes to `/object/public/`, which this file does not touch.
--
-- ---------------------------------------------------------------------------
-- THE ONE RISK THIS SESSION COULD NOT MEASURE, AND ITS SYMPTOM
-- ---------------------------------------------------------------------------
-- Whether `/object/public/<bucket>/<key>` consults RLS at all. 0183's header
-- states it does not ("the storage renderer serves that endpoint only for a
-- bucket flagged public, and no policy governs it"); this session had no
-- Docker daemon and could not reach the live project, so it is cited rather
-- than re-measured.
--
-- THE FILE IS WRITTEN TO BE SAFE UNDER BOTH ANSWERS, which is why the anon
-- policy is SCOPED rather than dropped. If the public endpoint ignores RLS,
-- nothing rendered anywhere changes. If it honours RLS as `anon`, every image
-- the bracket shows is still admitted, because the bracket renders exactly the
-- URLs these two columns hold -- the two sets are the same set by construction.
--
-- THE SYMPTOM IF SOMETHING WAS MISSED, named here so it is diagnosed in seconds
-- rather than hunted: an entry thumbnail or banner renders as the app's own
-- "image could not be loaded" tile on `/tournaments/<id>` while the same image
-- is still fetchable by pasting its URL into a tab. If that is ever seen, this
-- file is what did it and the undo below is total.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
-- IT WRITES NOTHING TO `storage.buckets`. Not the public flag, not
-- `file_size_limit`, not `allowed_mime_types`. 0185 owns the limit; a
-- restatement here is a chance to disagree with it.
--
-- IT DOES NOT TOUCH A WRITE POLICY. 0062's three own-folder policies
-- ("tournament thumbs insert own folder", "... update own folder",
-- "... delete own folder") are untouched, and section 3 counts them so a later
-- reader can tell "left alone" from "lost".
--
-- IT DOES NOT TOUCH ANY `tournament_*` TABLE. Not its policies, not its grants.
-- The whole point of the shape above is that this bucket now ASKS those tables
-- rather than restating them, and 0149 established that twelve of them carry a
-- deliberate `anon` SELECT.
--
-- IT DOES NOT SWEEP THE ORPHANS. Delisting them is not deleting them, and a
-- migration that deleted student-uploaded bytes on the strength of a string
-- match is the one thing worse than the exposure. Deleting them needs a sweep
-- that can tell an orphan from a row it failed to parse, and that is its own
-- bundle with its own owner.
--
-- IT DOES NOT CLOSE THE SIGNED-IN LISTING. Any account that can sign in --
-- which at Bosco Tech is every student -- can still list this bucket in full.
-- That is the tier all four of these files land on and it is a different
-- question from this one's.
--
-- IT MOVES NO BYTES AND CANNOT. Every object keeps its key, so every stored URL
-- keeps naming the object it always named. Nothing is backfilled.
--
-- ---------------------------------------------------------------------------
-- ORDERING: EITHER ORDER IS SAFE, AND THE APP HALF IS STILL FIRST
-- ---------------------------------------------------------------------------
-- 0183's order was forced: the app had to stop asking a public URL before the
-- bucket stopped answering one. THAT DOES NOT APPLY HERE AND DID NOT APPLY TO
-- 0186 EITHER. The read path does not move -- `getPublicUrl` builds the same
-- URL before and after and `/object/public/` is governed by the bucket flag,
-- which this file leaves alone -- so applying this file against the currently
-- deployed app breaks nothing at all, and deploying the app half against an
-- un-applied database breaks nothing either.
--
-- App first is still the order to take, for the smaller reason: the app half of
-- this bundle is the `onerror` fallback that renders a stated tile instead of a
-- broken image, and it is what makes the unmeasured risk above legible if it
-- fires. Deploying it first costs nothing and buys the diagnosis.
--
-- WHAT UNDOES IT -- one statement, re-asserting 0062 exactly:
--   drop policy if exists tournament_thumbs_named_read on storage.objects;
--   drop policy if exists tournament_thumbs_authenticated_read on storage.objects;
--   create policy "tournament thumbs public read" on storage.objects
--     for select to public using (bucket_id = 'tournament-thumbs');
-- and the bucket is open again exactly as it was. Nothing is destroyed by this
-- file, so the undo is total and safe to run at 8am without reading anything
-- else.
--
-- Idempotent: every statement is a drop-then-create. Re-pasting it re-asserts
-- the end state rather than half of it.
--
-- Apply manually in the Supabase SQL editor.

-- ===========================================================================
-- 1. Preconditions and the census, FIRST, so the counts describe the world
--    this file arrived in and the operator can see exactly how many objects
--    leave the anonymous set. Read directly rather than through a role: the
--    question is which rows the new predicate admits, and that is a property
--    of the data.
-- ===========================================================================

do $$
declare
	v_total integer;
	v_named integer;
	v_leaving integer;
begin
	if not exists (select 1 from storage.buckets where id = 'tournament-thumbs') then
		raise exception '0189: the tournament-thumbs bucket does not exist -- apply 0062 first.';
	end if;

	-- 0064 is a hard dependency rather than a nice-to-have: the anon policy
	-- below names tournament_entry_styles, and CREATE POLICY resolves that name
	-- at creation time. Refusing here with a sentence beats failing thirty
	-- lines down with `relation does not exist`.
	if to_regclass('public.tournament_entry_styles') is null then
		raise exception '0189: public.tournament_entry_styles does not exist -- apply 0064 first. Without it an image banner would be delisted along with the orphans.';
	end if;

	select count(*) into v_total
	from storage.objects where bucket_id = 'tournament-thumbs';

	select count(*) into v_named
	from storage.objects o
	where o.bucket_id = 'tournament-thumbs'
		and (
			exists (
				select 1 from public.tournament_entries e
				where e.thumbnail_url like '%/tournament-thumbs/%'
					and right(e.thumbnail_url, length(o.name) + 1) = '/' || o.name
			)
			or exists (
				select 1 from public.tournament_entry_styles s
				where s.background_type = 'image'
					and (s.background_value #>> '{}') like '%/tournament-thumbs/%'
					and right(s.background_value #>> '{}', length(o.name) + 1) = '/' || o.name
			)
		);

	v_leaving := v_total - v_named;

	raise notice '0189: tournament-thumbs holds % object(s); % of them are named by a row an anonymous caller can already read (tournament_entries.thumbnail_url or an image tournament_entry_styles.background_value).',
		v_total, v_named;
	raise notice '0189: an anonymous caller could list % object(s) before this file and can list % after -- % object(s) leave the anonymous set. Those are ORPHANS: uploads no row names, left behind by an abandoned registration or a replaced banner. They are NOT deleted, and each remains readable by its EXACT KEY through /object/public/, which is 0062''s accepted trade and not what this file is about.',
		v_total, v_named, v_leaving;
end $$;

-- ===========================================================================
-- 2. The policy swap. 0062's one unscoped `to public` policy out; a signed-in
--    read and a scoped anonymous read in.
--
--    NAMED DIFFERENTLY ON PURPOSE. Keeping the name "tournament thumbs public
--    read" on a policy that is no longer a public read would leave the catalog
--    lying to the next person who greps it, and the drop is what makes the
--    rename safe.
-- ===========================================================================

drop policy if exists "tournament thumbs public read" on storage.objects;
drop policy if exists tournament_thumbs_authenticated_read on storage.objects;
drop policy if exists tournament_thumbs_named_read on storage.objects;

create policy tournament_thumbs_authenticated_read on storage.objects
	for select to authenticated
	using (bucket_id = 'tournament-thumbs');

create policy tournament_thumbs_named_read on storage.objects
	for select to anon
	using (
		bucket_id = 'tournament-thumbs'
		and (
			exists (
				select 1 from public.tournament_entries e
				where e.thumbnail_url like '%/tournament-thumbs/%'
					and right(e.thumbnail_url, length(storage.objects.name) + 1)
						= '/' || storage.objects.name
			)
			or exists (
				select 1 from public.tournament_entry_styles s
				where s.background_type = 'image'
					and (s.background_value #>> '{}') like '%/tournament-thumbs/%'
					and right(s.background_value #>> '{}', length(storage.objects.name) + 1)
						= '/' || storage.objects.name
			)
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
	v_limit bigint;
	v_grants integer;
begin
	-- (a) No SELECT policy on this bucket may still admit `public` or `anon`
	--     without asking a tournament table. Asked of pg_policies by ROLE and
	--     by PREDICATE rather than by name, so a policy somebody re-added under
	--     a different name is caught too.
	select count(*) into v_unscoped
	from pg_policies
	where schemaname = 'storage'
		and tablename = 'objects'
		and cmd = 'SELECT'
		and qual like '%tournament-thumbs%'
		and (roles::text[] && array['public', 'anon'])
		and qual not like '%tournament_entries%';
	if v_unscoped <> 0 then
		raise exception '0189: % select policy/policies still admit public or anon to tournament-thumbs without asking a tournament table.', v_unscoped;
	end if;

	select count(*) into v_anon
	from pg_policies
	where schemaname = 'storage' and tablename = 'objects'
		and policyname = 'tournament_thumbs_named_read'
		and cmd = 'SELECT'
		and roles::text[] = array['anon']
		and qual like '%tournament_entries%'
		and qual like '%tournament_entry_styles%';
	if v_anon <> 1 then
		raise exception '0189: expected exactly one scoped anon read policy naming both tournament tables, found %.', v_anon;
	end if;

	select count(*) into v_authed
	from pg_policies
	where schemaname = 'storage' and tablename = 'objects'
		and policyname = 'tournament_thumbs_authenticated_read'
		and cmd = 'SELECT'
		and roles::text[] = array['authenticated'];
	if v_authed <> 1 then
		raise exception '0189: expected exactly one authenticated read policy on tournament-thumbs, found %.', v_authed;
	end if;

	-- (b) 0062's three own-folder write policies are untouched.
	select count(*) into v_writes
	from pg_policies
	where schemaname = 'storage' and tablename = 'objects'
		and policyname in (
			'tournament thumbs insert own folder',
			'tournament thumbs update own folder',
			'tournament thumbs delete own folder'
		);
	if v_writes <> 3 then
		raise exception '0189: expected 0062''s three tournament-thumbs write policies, found %.', v_writes;
	end if;

	-- (c) The delegation only works if `anon` may actually SELECT the tables the
	--     policy asks about -- a policy expression is evaluated as the QUERYING
	--     role, so a revoked grant here does not narrow the read, it BLANKS it.
	--     This is 0109's lesson (the 0070 one) asserted rather than assumed.
	select count(*) into v_grants
	from (
		select 1 where has_table_privilege('anon', 'public.tournament_entries', 'SELECT')
		union all
		select 1 where has_table_privilege('anon', 'public.tournament_entry_styles', 'SELECT')
	) t;
	if v_grants <> 2 then
		raise exception '0189: anon holds SELECT on % of the 2 tournament tables this policy delegates to. Without both grants the scoped policy admits nothing and every spectator thumbnail disappears from the listing path.', v_grants;
	end if;

	-- (d) The bucket row is exactly as this file found it. Asserted rather than
	--     restated: this file writes nothing to storage.buckets, so if this has
	--     moved it was somebody else and the operator should know.
	select public, file_size_limit into v_public, v_limit
	from storage.buckets where id = 'tournament-thumbs';
	if v_public is distinct from true then
		raise exception '0189: tournament-thumbs is not public (public = %). This file does not flip that flag; something else did, and the anonymous read path is now the scoped policy alone.', v_public;
	end if;

	raise notice '0189: tournament-thumbs -- 0 unscoped public/anon select policies, 1 scoped anon read (via tournament_entries + tournament_entry_styles), 1 authenticated read, 3 own-folder write policies intact, anon SELECT held on both delegated tables.';
	raise notice '0189: bucket row untouched by this file -- public = %, file_size_limit = %.', v_public, v_limit;
	raise notice '0189: this was the LAST bucket in the project an anonymous caller could enumerate. avatars (0181) and foundry-covers (0183) are private; maps-media (0186) and this one are public with a scoped anon read.';
	raise notice '0189: OPEN, with an owner (Mr. Pina): any signed-in account can still list this bucket in full; every orphan is still readable by its exact key through /object/public/ and is still stored; and nothing sweeps an abandoned upload. Deleting orphaned bytes is its own bundle.';
end $$;
