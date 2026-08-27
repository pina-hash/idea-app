-- 0139_foundry_telemetry.sql
-- IDEA FOUNDRY: how much an app is played, and nothing about who played it.
--
-- ---------------------------------------------------------------------------
-- THE CONSTRAINT THAT SHAPES THE WHOLE DESIGN: THE APP CANNOT REPORT.
--
-- A published bundle runs in a sandboxed cross-origin frame served from the
-- apps origin, which holds no session, no cookie and no credential of ours.
-- There is no postMessage contract, and there must not be one: asking a
-- student's own code to report its own usage would make every number here a
-- number the measured party writes. So the app is never asked.
--
-- THE PORTAL IS WHAT KNOWS. `AppStage` owns the whole lifecycle -- Launch sets
-- `running = true` and mounts the frame, Stop sets it false and unmounts it,
-- and a change of subject or a teardown does the same -- so the portal knows
-- when a run began and, within one heartbeat, when it stopped. That is the
-- entire signal available, and these three functions are written to it.
--
-- ---------------------------------------------------------------------------
-- THE HOLE THIS FEATURE HAS, STATED HERE SO NOBODY DISCOVERS IT BY COMPARING
-- TWO FIGURES.
--
-- A play started from the DIRECT PAGE, `/a/<appId>/`, IS NOT COUNTED. That
-- route is the app's own public address: the whole document, no iframe, no
-- portal chrome, no session, and nothing of ours running on the page. There is
-- no observer there and there cannot be one without either putting a script
-- into a student's own document (which the byte rule forbids -- a stored byte
-- is served back unchanged, so a reviewer reads what executes) or scoping the
-- portal's cookies onto the apps host (which is the one thing the origin split
-- exists to prevent).
--
-- So every number this migration produces is PLAYS THROUGH THE PORTAL, and a
-- shared link opened by fifty people adds nothing to any of them. That is a
-- real undercount of unknown size, not a rounding error. The surfaces say so
-- in words beside the figures; do not remove that sentence, and do not present
-- these counts anywhere as "how many people used this app".
--
-- The review queue is a deliberate SECOND exclusion, for the opposite reason:
-- a reviewer running a submitted build to decide about it is not a play. It is
-- excluded twice over -- the review route hands down no recording transport at
-- all, and `foundry_play_start` refuses any version that is not the app's
-- PUBLISHED one -- so opening one layer leaves the other closed.
--
-- ---------------------------------------------------------------------------
-- A SESSION, NOT A PAGE VIEW, AND WHAT MAKES AN ABANDONED ONE USABLE.
--
-- One row per play session. It carries `started_at` and `last_seen_at`, and
-- the portal moves the second one with a heartbeat while the app is on screen.
-- Duration is `last_seen_at - started_at` and nothing else -- there is no
-- separate "ended" column, because a clean Stop is simply the last heartbeat
-- and a column that only a clean end writes would be null in the normal case.
--
-- THE NORMAL CASE IS THE TAB CLOSING. Nothing fires reliably then, so an
-- abandoned session is not a missing measurement: it is a measurement accurate
-- to within one heartbeat interval, which is what pinning duration to
-- `last_seen_at` buys. A design keyed on a clean end would have recorded a
-- duration of zero for most of the plays that ever happen.
--
-- THE RATE LIMIT IS THE RESUME WINDOW, and it is a rule about sessions rather
-- than a counter. A start for an app this caller was last seen in less than
-- `_foundry_play_window()` ago EXTENDS that row instead of writing a new one,
-- so Launch, Stop, Launch, Stop is one play and not four, and a script mashing
-- Launch writes one row and then only updates it. The same window makes a
-- PING refuse a row it has fallen out of, which is what stops a tab left
-- hidden for an hour and then revisited from booking that hour as play time:
-- the stale ping is refused, the portal starts a fresh session, and the old
-- row's duration ends where its last heartbeat did.
--
-- CONCURRENT STARTS ARE SERIALIZED ON THE (PLAYER, APP) PAIR with a
-- transaction-scoped advisory lock. The window cannot be a unique index -- an
-- index predicate may not contain a volatile expression like `now()` -- so
-- there is no constraint for two simultaneous starts to collide on, and two
-- tabs opened together would otherwise each insert. The lock is keyed on the
-- pair rather than on the app, so it serializes exactly the mashing case and
-- never two different people playing the same app.
--
-- ---------------------------------------------------------------------------
-- WHAT IS VISIBLE, AND TO WHOM. THIS IS THE FEATURE.
--
-- This is student data in a school. There are exactly three read paths and
-- none of them can answer "who played this":
--
--   foundry_play_counts       EVERYONE, over apps only: total plays and plays
--                             in the last seven days, per app, for the apps
--                             the caller could already see. This is what the
--                             gallery's popularity sort orders on. It is a
--                             count attached to an app and there is no column
--                             in it through which a person could be named.
--
--   foundry_app_play_stats    THE AUTHOR of the app, and an admin. Four
--                             scalars: plays, unique players, seconds played,
--                             last played. Anyone else gets NULL, which is the
--                             same answer a nonexistent app gets, so an id
--                             cannot be probed.
--
--   (nothing else)            There is no function, view, policy or grant that
--                             returns a play ROW to any client, for any
--                             caller, admin included. `student_app_plays` has
--                             RLS enabled and NO POLICY, and no grant to `anon`
--                             or `authenticated` -- two independent refusals,
--                             either of which alone denies every select. A
--                             browser cannot read this table.
--
-- `players` IS A DISTINCT COUNT AND STILL NOT A LIST. On an app with one
-- player it is 1, and `last_played_at` is then when that one person played --
-- which is inherent in any aggregate over a small n, is what the feature was
-- asked for, and is bounded to the author of the work and to staff. It is
-- written down rather than papered over with a threshold nobody asked for.
--
-- NO RATINGS AND NO WRITTEN REVIEWS. There is no column for one, no function
-- that would accept one, and no shape here that anticipates one. A student
-- rating another student's schoolwork in public is a different feature with a
-- different set of questions to answer, and leaving a nullable `rating`
-- column behind would be the thing that got filled in later without any of
-- them being asked.
--
-- ---------------------------------------------------------------------------
-- ADDITIVE ONLY. A new table, one private helper and three new functions.
-- Nothing is dropped, no existing signature moves, and no existing function is
-- rewritten. `foundry_list_apps` in particular is UNTOUCHED: the popularity
-- ordering is a second read joined on the app id in the client, precisely so
-- that the list function's shape, order and population stay exactly what every
-- surface already reads.
--
-- WHAT UNDOES IT: `drop table public.student_app_plays cascade;` then
-- `drop function public.foundry_play_start(uuid, uuid), public.foundry_play_ping(uuid),
-- public.foundry_play_counts(boolean, boolean), public.foundry_app_play_stats(uuid),
-- public._foundry_play_window();`. Nothing else in the schema refers to any of
-- them, so the drop is total and leaves 0138's world behind.
--
-- IDEMPOTENT: every object is `if not exists` or `create or replace`, so a
-- re-paste is free. A re-paste does NOT clear recorded plays.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The window, written down once.
--
-- Both the start (which resumes inside it) and the ping (which refuses outside
-- it) are the SAME rule about what one session is, so there is one statement
-- of it. Two literals thirty lines apart is how a resume window and a staleness
-- window quietly stop being the same number, which would leave a row that a
-- start will not resume and a ping will still extend.
--
-- Granted to nobody: it is called only from inside the definer functions
-- below, which run as this file's owner.
-- ---------------------------------------------------------------------------

create or replace function public._foundry_play_window()
returns interval
language sql
immutable
as $$
	select interval '30 minutes';
$$;

revoke all on function public._foundry_play_window() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The table.
--
-- THE THREE FOREIGN KEYS DISAGREE ON PURPOSE, and each disagreement is a
-- decision about what a play IS:
--
--   app_id      on delete CASCADE. A play is a fact about an app. When the app
--               is deleted (0136) the thing the record was about no longer
--               exists, and keeping the rows would leave counts nothing can be
--               attributed to.
--
--   version_id  on delete SET NULL. A play is a fact about the APP, not about
--               the build. 0136 lets a student delete an old version; that
--               must not silently reduce their app's play count, so the play
--               outlives the build it happened on and simply stops naming it.
--
--   player      on delete SET NULL. When an account goes, the identity goes
--               with it -- which is the privacy-maximal answer -- but the play
--               itself stays counted, because it happened. THE COST IS STATED:
--               `count(distinct player)` ignores nulls, so a departed account's
--               plays keep counting toward `plays` and stop counting toward
--               `players`. Cascading instead would have deleted an author's
--               numbers out from under them for something they did not do.
-- ---------------------------------------------------------------------------

create table if not exists public.student_app_plays (
	id uuid primary key default gen_random_uuid(),
	app_id uuid not null references public.student_apps (id) on delete cascade,
	version_id uuid references public.student_app_versions (id) on delete set null,
	player uuid references auth.users (id) on delete set null,
	started_at timestamptz not null default now(),
	-- Moved forward by every heartbeat. THE DURATION IS THIS MINUS started_at,
	-- for a clean stop and an abandoned tab alike.
	last_seen_at timestamptz not null default now(),
	-- A session cannot end before it began. Only ever written with now(), so
	-- this is a backstop against a future writer rather than a live risk.
	constraint student_app_plays_span check (last_seen_at >= started_at)
);

-- The aggregate read for one app, and `last_played_at` off the same index.
create index if not exists student_app_plays_app_idx
	on public.student_app_plays (app_id, started_at desc);

-- The seven-day window across every app, which is the gallery's sort. A
-- PARTIAL index on `started_at >= now() - interval '7 days'` is not available:
-- an index predicate may not contain a volatile expression.
create index if not exists student_app_plays_window_idx
	on public.student_app_plays (started_at desc, app_id);

-- The resume lookup: this caller, this app, most recently seen.
create index if not exists student_app_plays_resume_idx
	on public.student_app_plays (player, app_id, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- NO GRANT AND NO POLICY, WHICH IS TWO REFUSALS RATHER THAN ONE.
--
-- `storage.objects` proved the shape and `foundry-bundles` relies on it: RLS
-- enabled with no policy denies every `anon` and `authenticated` request by
-- default, and no table grant means the select is refused before RLS is even
-- consulted. Either alone is sufficient; both are here because this is the
-- table that would answer "which student played what" if it ever answered
-- anybody. The definer functions below run as this file's owner and therefore
-- reach it; nothing else does.
--
-- `service_role` gets nothing either, and that is deliberate and different
-- from `student_app_files`. Nothing writes plays from a server: the two write
-- functions are ordinary SECURITY DEFINER RPCs called by the browser, so there
-- is no ingest-shaped direct writer to grant for.
-- ---------------------------------------------------------------------------

revoke all on public.student_app_plays from anon, authenticated;
alter table public.student_app_plays enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Recording. Two functions, and neither takes an identity parameter.
--
-- The caller is `auth.uid()`, so "can only record as themselves" is a property
-- of the SIGNATURE rather than a check that could be got wrong.
--
-- THEY RETURN STRUCTURED REFUSALS AND DO NOT RAISE for anything a client can
-- legitimately hit. Telemetry must never be able to affect the thing it
-- measures: an exception here would surface as a rejected promise on the path
-- that starts a student's app, and the correct behaviour for every refusal on
-- this path is for the portal to shrug and carry on running the app. Only a
-- missing session raises, which is the one case that is a programming error.
-- ---------------------------------------------------------------------------

-- START, or RESUME the session already in progress.
create or replace function public.foundry_play_start(
	p_app_id uuid,
	p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_app public.student_apps%rowtype;
	v_play uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select a.* into v_app from public.student_apps a where a.id = p_app_id;
	-- EVERY REFUSAL BELOW IS THE SAME SHAPE, so a caller cannot tell a missing
	-- app from a hidden one from a version that is not the live build.
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_playable');
	end if;
	if v_app.hidden_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'not_playable');
	end if;
	-- THE PUBLISHED BUILD AND NOTHING ELSE. A draft the owner is testing and a
	-- submitted build a reviewer is running are both real things that happen in
	-- a frame, and neither is a play of a published app. This is the second of
	-- the two layers that keep review runs out of the numbers; the first is the
	-- review route handing down no recording transport at all.
	if v_app.published_version_id is null or v_app.published_version_id <> p_version_id then
		return jsonb_build_object('ok', false, 'reason', 'not_playable');
	end if;

	-- SERIALIZE THIS CALLER ON THIS APP. Two tabs opened together would
	-- otherwise both look, both find nothing, and both insert -- and there is
	-- no unique index for them to collide on, because the window is a volatile
	-- expression. Transaction-scoped, so it is released with the statement.
	perform pg_advisory_xact_lock(
		hashtextextended(v_uid::text || ':' || p_app_id::text, 0)
	);

	select pl.id into v_play
	from public.student_app_plays pl
	where pl.player = v_uid
		and pl.app_id = p_app_id
		and pl.last_seen_at > now() - public._foundry_play_window()
	order by pl.last_seen_at desc
	limit 1;

	if found then
		update public.student_app_plays pl
			set last_seen_at = now()
			where pl.id = v_play;
		return jsonb_build_object('ok', true, 'play_id', v_play, 'resumed', true);
	end if;

	insert into public.student_app_plays (app_id, version_id, player)
	values (p_app_id, p_version_id, v_uid)
	returning id into v_play;

	return jsonb_build_object('ok', true, 'play_id', v_play, 'resumed', false);
end;
$$;

revoke all on function public.foundry_play_start(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_play_start(uuid, uuid) to authenticated;

-- THE HEARTBEAT. It is also the clean end: the last ping before teardown is
-- what makes a stopped session's duration exact, and its absence is what makes
-- an abandoned one accurate to within one interval instead of wrong.
create or replace function public.foundry_play_ping(p_play_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_seen timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	-- `player = v_uid` IS THE GATE, not a filter for tidiness: without it a
	-- caller holding somebody else's play id could extend that person's
	-- session, which is a write into another student's record.
	select pl.last_seen_at into v_seen
	from public.student_app_plays pl
	where pl.id = p_play_id and pl.player = v_uid;

	if not found then
		return jsonb_build_object('ok', false, 'reason', 'unknown');
	end if;

	-- STALE MEANS START AGAIN, and the rule is the resume window read from the
	-- same place the start reads it. A tab hidden for an hour and then brought
	-- back must not book that hour: the ping is refused, the portal opens a
	-- fresh session, and this row's duration ends at its own last heartbeat.
	if v_seen <= now() - public._foundry_play_window() then
		return jsonb_build_object('ok', false, 'reason', 'stale');
	end if;

	update public.student_app_plays pl
		set last_seen_at = now()
		where pl.id = p_play_id;

	return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.foundry_play_ping(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_play_ping(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reading. Popularity for everyone, aggregates for the author and staff.
-- ---------------------------------------------------------------------------

-- COUNTS OVER APPS. Two numbers per app and no third column, because there is
-- nothing else that can be said here without saying something about a person.
--
-- THE POPULATION IS `foundry_list_apps`'s, THROUGH THE SAME PREDICATE. This is
-- a definer and therefore evaluates no policy, so `_foundry_app_in_population`
-- is restated exactly as the list function restates it -- and the two widening
-- flags are passed through for the same reason they are parameters there: the
-- predicate gates both on `is_admin()` INSIDE itself, so a student passing them
-- widens nothing.
--
-- A LEFT JOIN, so an app nobody has played is a row with 0 rather than a
-- missing key. The gallery sorts over the list it was given; an app silently
-- absent from the counts would sort as undefined.
--
-- SEVEN DAYS IS WRITTEN INTO THE FUNCTION rather than taken as a parameter.
-- The column is called `plays_7d` and the surface says "this week"; a
-- parameter is how the label and the number come to disagree.
create or replace function public.foundry_play_counts(
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns table (
	app_id uuid,
	plays bigint,
	plays_7d bigint
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		a.id,
		count(pl.id),
		count(pl.id) filter (where pl.started_at >= now() - interval '7 days')
	from public.student_apps a
	left join public.student_app_plays pl on pl.app_id = a.id
	where (select auth.uid()) is not null
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		)
	group by a.id;
$$;

revoke all on function public.foundry_play_counts(boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_play_counts(boolean, boolean) to authenticated;

-- THE AUTHOR'S OWN NUMBERS, AND AN ADMIN'S VIEW OF ANYBODY'S.
--
-- FOUR SCALARS AND NO ROWS. There is no per-play detail in this answer, no
-- player id, no list, and no parameter through which one could be requested --
-- for the author, for an admin, or for anyone else. "Nobody sees another
-- student's play history" is enforced by there being no shape in which this
-- function could return one.
--
-- NULL FOR A NON-OWNER, WHICH IS ALSO NULL FOR A NONEXISTENT APP. Not a raise
-- and not a refusal object: "not found" and "not yours" answer identically, so
-- an app id cannot be probed for existence by whoever holds it.
create or replace function public.foundry_app_play_stats(p_app_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_owner uuid;
	v_row record;
begin
	if v_uid is null then
		return null;
	end if;

	select a.owner into v_owner from public.student_apps a where a.id = p_app_id;
	if not found then
		return null;
	end if;

	-- THE GATE. The author of the work, or staff. Everybody else gets the same
	-- answer they would get for an app that does not exist.
	if v_owner <> v_uid and not public.is_admin() then
		return null;
	end if;

	select
		count(*)::bigint as plays,
		-- Nulls are ignored by `count(distinct)`, so a play whose account has
		-- been deleted counts as a play and not as a player. See the table's
		-- own note on why `player` is `set null` rather than cascading.
		count(distinct pl.player)::bigint as players,
		coalesce(
			sum(extract(epoch from (pl.last_seen_at - pl.started_at)))::bigint,
			0
		) as seconds_played,
		max(pl.started_at) as last_played_at
	into v_row
	from public.student_app_plays pl
	where pl.app_id = p_app_id;

	return jsonb_build_object(
		'ok', true,
		'app_id', p_app_id,
		'plays', coalesce(v_row.plays, 0),
		'players', coalesce(v_row.players, 0),
		'seconds_played', coalesce(v_row.seconds_played, 0),
		'last_played_at', v_row.last_played_at
	);
end;
$$;

revoke all on function public.foundry_app_play_stats(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_app_play_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Self-check.
--
-- ASSERT THE ACL, NOT THE VERDICT. A guard passing tells you the guard ran;
-- reading `proacl` back through `has_function_privilege` tells you what is
-- actually granted -- which on a hosted Supabase project is the thing that is
-- surprising, because the project's default privileges hand every new function
-- a direct `anon` grant at creation time and `revoke ... from public` does not
-- remove it.
--
-- The overload count is here for the signature trap: `create or replace` keys
-- on the parameter list, so a later parameter added without a drop leaves the
-- old arity callable as a second overload -- and two overloads differing only
-- by a defaulted trailing parameter make PostgREST unable to resolve the call
-- at all.
-- ---------------------------------------------------------------------------

do $$
declare
	v_n integer;
	v_name text;
	v_plays integer;
	v_apps integer;
begin
	foreach v_name in array array[
		'foundry_play_start', 'foundry_play_ping',
		'foundry_play_counts', 'foundry_app_play_stats'
	] loop
		select count(*)::integer into v_n
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = v_name;
		if v_n <> 1 then
			raise exception '0139: public.% has % overloads, expected exactly 1.', v_name, v_n;
		end if;

		select count(*)::integer into v_n
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = v_name
			and p.prosecdef
			and has_function_privilege('authenticated', p.oid, 'EXECUTE')
			and not has_function_privilege('anon', p.oid, 'EXECUTE');
		if v_n <> 1 then
			raise exception '0139: public.% is not a definer granted to authenticated and withheld from anon.', v_name;
		end if;
	end loop;

	-- The private helper is granted to NOBODY. It is only ever called from
	-- inside the definers above, which run as this file's owner.
	select count(*)::integer into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_foundry_play_window'
		and (has_function_privilege('anon', p.oid, 'EXECUTE')
			or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
	if v_n <> 0 then
		raise exception '0139: _foundry_play_window is reachable by a client role.';
	end if;

	-- THE TABLE ANSWERS NOBODY. Both refusals, asserted separately, because
	-- either one alone is what the other is defence in depth for.
	if exists (
		select 1 from pg_policies
		where schemaname = 'public' and tablename = 'student_app_plays'
	) then
		raise exception '0139: student_app_plays has a policy. It is meant to have none.';
	end if;
	if not exists (
		select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = 'student_app_plays' and c.relrowsecurity
	) then
		raise exception '0139: row level security is not enabled on student_app_plays.';
	end if;
	if has_table_privilege('anon', 'public.student_app_plays', 'SELECT')
		or has_table_privilege('authenticated', 'public.student_app_plays', 'SELECT')
	then
		raise exception '0139: a client role holds SELECT on student_app_plays.';
	end if;

	-- NO RATING AND NO REVIEW COLUMN, asserted rather than merely intended.
	-- If somebody adds one later this file is where they will find out that it
	-- was a decision.
	select count(*)::integer into v_n
	from information_schema.columns
	where table_schema = 'public' and table_name = 'student_app_plays'
		and column_name in ('rating', 'stars', 'score', 'review', 'comment', 'body');
	if v_n <> 0 then
		raise exception '0139: student_app_plays has a rating or review column. It must not.';
	end if;

	select count(*)::integer into v_apps from public.student_apps;
	select count(*)::integer into v_plays from public.student_app_plays;
	raise notice '0139: three read/write RPCs in place, definer, authenticated only, anon withheld.';
	raise notice '0139: student_app_plays holds % rows across % apps. Plays through /a/<appId>/ are NOT counted.',
		v_plays, v_apps;
end
$$;
