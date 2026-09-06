-- 0185_bucket_limits_under_the_global.sql
--
-- EVERY BUCKET STATES A NUMBER THAT IS TRUE.
--
-- WHY THIS EXISTS. This project is on the Supabase FREE plan, whose global
-- upload file size limit is 50 MB and is FIXED -- it is not a project setting
-- that can be raised, and nothing in this repository can read it. Fifteen
-- buckets sit under that ceiling and, before this file, TWELVE of them said
-- something else:
--
--   * `classroom-attachments`, `submission-files` and `instructor-attachments`
--     each carry `file_size_limit = 209715200` (200 MiB). That is FICTION: a
--     150 MB hand-in is refused by the global long before the bucket's own
--     number is consulted. The row promises four times what the platform will
--     accept.
--   * Nine buckets carry NO `file_size_limit` at all -- `avatars`, `gauntlet`,
--     `gauntlet-drawings`, `gauntlet-models`, `gauntlet-tools`,
--     `tournament-thumbs`, `foundry-uploads`, `foundry-bundles` and
--     `foundry-covers`. A bucket with no limit does not thereby have no limit:
--     the global applies, and the row simply declines to say so.
--
--   Only `maps-media` (20 MiB), `feedback-media` (8 MiB) and
--   `greenline-decals` (1 MiB) were already telling the truth.
--
-- THE LIVE DEFECT THIS CLOSES IS THE FOUNDRY. `FOUNDRY_LIMITS.maxZipBytes`
-- permitted a 75 MiB zip and `foundry-uploads` carried no ceiling of its own,
-- so a student's 60 MB app passed the browser preflight, transferred whole over
-- school wifi, and was refused at the far end by a limit no sentence in this
-- application could name. The same commit that applies this file drops that
-- browser ceiling to 45 MiB, so the refusal now happens before a byte moves and
-- names the real number.
--
-- ---------------------------------------------------------------------------
-- THE NUMBER, AND ITS ARITHMETIC.
--
-- 47185920 bytes = 45 MiB, which `formatCap` renders as "45 MB", the same
-- MiB convention every other limit in this chain uses (200 / 20 / 8 / 1 MB).
--
--   1. THE GLOBAL IS "50 MB" AND THAT PHRASE IS AMBIGUOUS. The dashboard says
--      50 MB. Read as MiB that is 52428800; read as decimal MB it is 50000000.
--      Nothing in this repository, and nothing this session could run, settles
--      which -- so the SMALLER reading is the binding one. A ceiling chosen
--      against the larger reading is a ceiling that fails at the far end if the
--      smaller is true, which is precisely the defect this file exists to end.
--
--   2. THE MARGIN ABSORBS THE REQUEST ENVELOPE. supabase-js wraps a Blob in a
--      `FormData` in the browser, so the body that crosses the wire is the file
--      plus a multipart boundary, two part headers and a `cacheControl` field
--      -- under a kilobyte. 50000000 - 47185920 = 2814080 bytes of margin, some
--      three orders of magnitude more than that envelope needs. (The tree
--      already leaves headroom for exactly this reason: the notebook photo path
--      refuses at 3.6 MiB in the browser against a 4 MiB route cap, "because a
--      multipart body is the file plus its part headers".)
--
--   3. IT IS 94.4% OF THE PESSIMISTIC GLOBAL AND 90.0% OF THE OPTIMISTIC ONE.
--      Raising it further buys a student a couple of megabytes and spends the
--      whole of the margin that makes the number safe under both readings.
--
-- RAISING THE CEILING IS NOT THIS FILE'S DECISION. The 50 MB global is a
-- consequence of the Free plan; moving it is a Pro plan decision and Mr Pina's.
-- When it moves, the constants to change are named in one place --
-- `SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES` and `PORTAL_UPLOAD_MAX_BYTES` in
-- `src/lib/upload-limits.ts` -- and `tests/upload-limits.test.ts` pins every
-- other statement of them to those two.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES AND DOES NOT DO.
--
-- It writes `storage.buckets` rows. It creates no table, no function, no
-- policy, no view and no index, and it grants nothing. Nothing about who may
-- read or write any bucket changes.
--
-- AND IT CHANGES NO UPLOAD OUTCOME, which is the property that makes it safe to
-- apply to a live database during a school term. Every ceiling it writes is at
-- or below one the platform was already enforcing, so no upload that succeeds
-- today is refused tomorrow -- except on the one path where that is the point:
-- a Foundry zip between 45 MiB and the global, which today transfers in full
-- and is refused at the far end, and which after this file is refused in the
-- browser instead. What moves is which layer says no, and whether the sentence
-- names a number.
--
-- THE UPDATE IS UNQUALIFIED, DELIBERATELY. `least(coalesce(...), ...)` over
-- every row is strictly more complete than a list of fifteen bucket ids, which
-- could only ever be the set one session happened to enumerate; a bucket added
-- by a later migration, or by hand in the dashboard, is swept by the same
-- statement. It cannot RAISE anything -- `least` keeps a lower limit exactly
-- where it is, which is what leaves 1 MiB, 8 MiB and 20 MiB alone.
--
-- RE-APPLIABLE. The statement is idempotent by construction: running it a
-- second time computes the same `least` over rows that already satisfy it.
-- Measured: applied twice over the same fifteen rows, the second run's end
-- state is byte-identical to the first's.
--
-- "NOTHING HAS BEEN COMMITTED" IN THE REFUSALS BELOW IS TRUE OF THE TWO WAYS
-- THIS FILE IS MEANT TO BE APPLIED AND NOT OF A THIRD. `tools/apply-migration.mjs`
-- wraps the whole file in one transaction and rolls back on a raise, and the
-- Supabase SQL editor does the same. A bare `psql -f` does NOT (each statement
-- autocommits), so the update would stand and only the self-check would fail --
-- which is harmless here, since the update is idempotent and a raise means a
-- row appeared that the sweep could not reach, but the sentence would be wrong.
-- Apply it with the tool or paste it into the editor.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK. There is no generic undo, because the update is lossy: the nine
-- unset buckets had NULL and NULL is not recoverable from 47185920. These are
-- the exact prior values, from the migration chain, as of this file:
--
--   update storage.buckets set file_size_limit = 209715200
--     where id in ('classroom-attachments', 'submission-files',
--                  'instructor-attachments');
--   update storage.buckets set file_size_limit = null
--     where id in ('avatars', 'gauntlet', 'gauntlet-drawings',
--                  'gauntlet-models', 'gauntlet-tools', 'tournament-thumbs',
--                  'foundry-uploads', 'foundry-bundles', 'foundry-covers');
--   -- maps-media (20971520), feedback-media (8388608) and greenline-decals
--   -- (1048576) are not touched by this file and need no rollback.
--
-- Rolling back restores the fiction. The app-side half (the Foundry browser
-- ceiling) is a deploy, not a migration, and reverts independently.
-- ---------------------------------------------------------------------------

-- 1. Report what is there now, per bucket, before anything moves. The operator
--    reads this against the dashboard.
do $$
declare
	r record;
begin
	raise notice '0185: bucket limits BEFORE';
	for r in
		select id, file_size_limit from storage.buckets order by id
	loop
		raise notice '0185:   % = %', r.id,
			coalesce(r.file_size_limit::text, 'UNSET (the global applies)');
	end loop;
end $$;

-- 2. The whole of the change.
update storage.buckets
set file_size_limit = least(coalesce(file_size_limit, 47185920), 47185920);

-- 3. Report what is there now, and REFUSE rather than commit if any row is
--    still wrong. Check A is against 50000000, the pessimistic reading of
--    "50 MB" (see the header); check C is against this project's own ceiling,
--    which is the number the client preflights are pinned to, so a row at
--    49000000 would pass A and still be a row the browser disagrees with.
--
--    0185-SELFCHECK-BEGIN
do $$
declare
	v_global constant bigint := 50000000;
	v_portal constant bigint := 47185920;
	r record;
	v_bad text;
	v_n int;
	v_rows int;
begin
	raise notice '0185: bucket limits AFTER';
	for r in
		select id, file_size_limit from storage.buckets order by id
	loop
		raise notice '0185:   % = %', r.id,
			coalesce(r.file_size_limit::text, 'UNSET');
	end loop;

	select count(*) into v_rows from storage.buckets;

	-- A. Nothing may be above the global. This is the claim the file makes.
	select count(*), string_agg(id || ' = ' || file_size_limit, ', ' order by id)
	into v_n, v_bad
	from storage.buckets
	where file_size_limit > v_global;
	if v_n > 0 then
		raise exception '0185 REFUSES: % bucket(s) still state a limit above the % byte global: %. Nothing has been committed.',
			v_n, v_global, v_bad;
	end if;

	-- B. Nothing may be UNSET either. An unset row is the other half of the
	--    fiction: it states nothing and inherits a ceiling nobody can read.
	select count(*), string_agg(id, ', ' order by id)
	into v_n, v_bad
	from storage.buckets
	where file_size_limit is null;
	if v_n > 0 then
		raise exception '0185 REFUSES: % bucket(s) still carry no file_size_limit at all: %. Nothing has been committed.',
			v_n, v_bad;
	end if;

	-- C. And nothing may be above this project's own portal ceiling.
	select count(*), string_agg(id || ' = ' || file_size_limit, ', ' order by id)
	into v_n, v_bad
	from storage.buckets
	where file_size_limit > v_portal;
	if v_n > 0 then
		raise exception '0185 REFUSES: % bucket(s) exceed the portal ceiling of % bytes: %. Nothing has been committed.',
			v_n, v_portal, v_bad;
	end if;

	raise notice '0185: % bucket(s), every one stating a limit, none above % bytes (45 MiB) and none above the % byte global.',
		v_rows, v_portal, v_global;
end $$;
--    0185-SELFCHECK-END

-- 4. REPORT ONLY -- no writes, no DDL, nothing this file depends on.
--
--    A3 of the prompt that produced this file asks what a real student app
--    bundle actually weighs, because if 45 MiB has never been approached then
--    the Foundry ceiling drop costs nobody anything, and if it has, Mr Pina
--    should be told the number. Nothing in this repository can query
--    production, and this file is the only thing that ever runs there, so the
--    census happens here or nowhere. It reads `student_app_versions.byte_size`,
--    which is the UNPACKED total the ingest function recorded -- the zip's own
--    size is not a column anywhere, so the unpacked figure is the closest
--    answer the database holds, and it is an OVER-estimate of the zip.
--
--    Guarded on the table existing so this file is appliable to a database
--    that has not seen 0130.
do $$
declare
	v_n int;
	v_max bigint;
	v_p50 bigint;
	v_p90 bigint;
	v_over int;
begin
	if to_regclass('public.student_app_versions') is null then
		raise notice '0185: no student_app_versions table here; no Foundry bundle census.';
		return;
	end if;
	select count(*),
	       coalesce(max(byte_size), 0),
	       coalesce(percentile_disc(0.5) within group (order by byte_size), 0),
	       coalesce(percentile_disc(0.9) within group (order by byte_size), 0),
	       count(*) filter (where byte_size > 47185920)
	into v_n, v_max, v_p50, v_p90, v_over
	from public.student_app_versions;
	raise notice '0185: Foundry bundle census. % version(s); unpacked bytes: median %, p90 %, max %; % over the new 45 MiB ceiling.',
		v_n, v_p50, v_p90, v_max, v_over;
end $$;
