-- 0221_foundry_boards_and_author_profile.sql
-- IDEA FOUNDRY: hours played per app, a trend window, and the author card.
--
-- Apply manually in the Supabase SQL editor. This file records nothing about
-- its own application.
--
-- ===========================================================================
-- WHAT THIS IS FOR. Two student reports, one migration, because they land on
-- the same two functions and share one population predicate.
--
--   REPORT 30 (Azad Arteaga): "more leaderboards for foundry. Ex: Most hours
--   played, most versions/updates, etc."  Decision 35, answered by Mr. Pina on
--   2026-09-21: "ranked by app is fine. no need for student ranking."
--
--   REPORT 31: "Publishers should have profiles that you can visit and see all
--   their published games and their profile should be comprehensive with their
--   IDEA profile, their profile picture and everything."
--
-- MOST VERSIONS NEEDS NOTHING HERE AND GETS NOTHING HERE. `foundry_list_apps`
-- has projected `version_count` since 0130 and it has reached the client as
-- `FoundryAppSummary.version_count` the whole time. That board is a sort over a
-- field already in every payload the gallery already fetches, so writing a
-- second source for it would be the duplication this repository refuses.
--
-- ===========================================================================
-- SECTION 1 WIDENS A FUNCTION RATHER THAN ADDING A SIBLING, AND THAT IS THE
-- BUILD DECISION DECISION 35 LEFT OPEN.
--
-- `foundry_play_counts` is the ONE cross-app play read. A sibling function
-- would be a second statement of the same population, the same left join and
-- the same seven-day window, and the second statement is the one that stops
-- matching -- which is the failure this file's own subject matter is full of.
-- So the columns join the function that already answers the question.
--
-- THE DROP IS FORCED, NOT STYLISTIC. This changes the RETURNS TABLE, and
-- `create or replace` refuses that outright ("cannot change return type of
-- existing function"). The parameter list does NOT move, so this is not the
-- signature trap and there is no second overload to leave callable: the drop
-- and the create name the identical `(boolean, boolean)` and one function
-- exists before and after.
--
-- AND THERE IS NO DEPLOY ORDERING, WHICH IS WHY THE DROP IS SAFE. A client
-- deployed before this file calls `foundry_play_counts()` with no arguments and
-- reads `app_id`, `plays` and `plays_7d` off the rows PostgREST returns; two
-- extra keys in those rows are ignored by a reader that does not name them. So
-- the old client works against the new function and the new client works
-- against neither-yet-applied only in the sense that its two new boards read
-- undefined and fall back to zero. Either order is fine, which is the shape
-- `CLAUDE.md` says to prefer for an RPC a deployed client already calls.
--
-- ===========================================================================
-- WHAT SECTION 1 DISCLOSES, STATED AS A DISCLOSURE AND NOT AS A FIELD
-- ADDITION, AND THE ONE COLUMN IT DELIBERATELY DOES NOT ADD.
--
--   * TO WHOM: exactly the callers who already read this function, through the
--     UNCHANGED predicate -- `_foundry_app_in_population`, with both widening
--     flags still gated on `is_admin()` inside itself. No new gate, no widened
--     gate, no second authorization model.
--
--   * WHAT: `seconds_played`, which `foundry_app_play_stats(p_app_id)` has
--     answered for the SAME population since 0204 (decision 07, answered
--     PUBLIC), one app at a time; and `plays_prev_7d`, which is the same
--     `count(*)` over `started_at` that `plays_7d` already is, shifted one
--     week back. Neither is a fact this caller could not already obtain by
--     opening each app in turn. What changes is the number of round trips, not
--     the reach -- which is what a board IS.
--
--   * WHAT IS REFUSED, AND IT IS THE ONE THAT MATTERS: there is NO `players`
--     COLUMN HERE. `foundry_app_play_stats` answers a distinct player count
--     for ONE app the caller asked about by name; a cross-app `players` column
--     would let a reader SCAN a whole gallery for the apps with exactly one
--     player, and on those apps `seconds_played` is one named student's
--     playtime. Decision 07 accepted the n=1 case explicitly and there is no
--     threshold anywhere in this feature -- that acceptance was about somebody
--     opening one app, not about handing out the list of every app where n is
--     1. The per-app door stays the per-app door. Do not add this column.
--
--   * AGAINST WHAT IT IS MEASURED: the same audience already reads `plays` and
--     `plays_7d` per app from this very function. Hours played is no wider than
--     the play count it sits beside, which is the only test this widening is
--     meant to pass.
--
-- THE TWO ACCURACY FACTS ANY HOURS FIGURE INHERITS, restated here because a
-- board is where they stop being obvious. Duration is `last_seen_at` minus
-- `started_at` and `last_seen_at` moves on a sixty-second heartbeat, so the
-- worst-case error is about a minute per session; and a play started from an
-- app's own direct address, `/a/<appId>/`, is not counted at all, because
-- there is nothing of ours on that page to see it. Every surface that renders
-- one of these numbers renders `FOUNDRY_PLAY_COVERAGE_NOTE` beside it.
--
-- ===========================================================================
-- SECTION 2: THE AUTHOR CARD, AND WHY THE DOOR IS AN APP RATHER THAN A PERSON.
--
-- `foundry_author_profile(p_owner uuid)` answers NULL unless the caller can
-- already see at least one of that author's apps through the same population
-- predicate every other Foundry read uses. So this is not a lookup from a uuid
-- to a student: it is the card belonging to work the caller is already looking
-- at. A uuid with no visible app answers identically to a uuid that names
-- nobody, so an id cannot be probed -- the same rule `foundry_app_play_stats`
-- and `foundry_get_app` already follow.
--
-- WHAT IT PROJECTS, AND WHY EACH FIELD IS NOT A NEW DISCLOSURE:
--
--   display_name, full_name   `foundry_list_apps` already projects both to
--                             every signed-in caller, and `foundryAuthorName`
--                             renders them with a two-rung ladder that never
--                             reaches an address.
--   owner_class               `_foundry_author_class(owner)`, already
--                             projected by `foundry_list_apps` since 0132.
--   avatar, avatar_url        `gauntlet_leaderboards()` has projected both to
--                             every signed-in student since 0024, and decision
--                             14 (2026-09-12, Mr. Pina, KEEP) settled the
--                             question those two columns raise: anyone signed
--                             in sees anyone's photo. The bucket stays private
--                             and the bytes still come through
--                             `/api/avatar/<key>`; this hands over the PATH,
--                             which is what 0179 and 0180 already hand to a
--                             narrower audience.
--   pathway                   Same sentence, same function: `gauntlet_leaderboards`
--                             has projected `pathway` to every signed-in
--                             student since 0038. It is identity and never an
--                             access gate, and no route may branch on it.
--   app_count,
--   first_published_at        Derived from the apps this caller can ALREADY
--                             list, through the identical predicate, so they
--                             restate a payload rather than widening one.
--
-- WHAT IT REFUSES, BY NAME, AND WHY EACH REFUSAL IS ITS OWN:
--
--   email                     `CLAUDE.md`: a granted email-to-uuid path is a
--                             school directory. `FoundryAuthor` says "There is
--                             no owner EMAIL here and there must never be one."
--                             This function has no column for one and no
--                             parameter that could ask for one.
--   section_id                0003 added it as a value the student
--                             SELF-SELECTS, free-form, validated by nothing.
--                             Rendering it under a published app presents a
--                             student's own claim as a roster fact, and
--                             `CLAUDE.md` forbids it on any Foundry surface
--                             outright. `owner_class` above is the roster
--                             answer and is the only one.
--   role                      An admin flag is not part of "who made this".
--   preferences               Free-form per-user settings. Nothing a reader of
--                             a gallery has any business with.
--
-- 0179 and 0180 both refused `pathway` in their own headers. That refusal was
-- correct FOR THEM and does not transfer: both are staff-facing roster reads
-- where the ask was a face beside a name, so pathway was a field nobody had
-- asked for. Here the report asks for the author's IDEA profile in as many
-- words, and the field is already published to the identical audience by a
-- surface that has shipped for a year. Stating that rather than inheriting
-- their sentence is the whole of the difference.
--
-- ===========================================================================
-- GRANTS. `revoke ... from public` does NOT close a function on this project:
-- the hosted default privileges write a DIRECT `anon` grant into every new
-- function's `proacl` at creation time, which the removal of the `public`
-- entry never touches. So every revoke below NAMES THE ROLES, in `0166`'s
-- shape, and grants back only `authenticated`. 0201 departed from that shape
-- and shipped ten anon-executable functions; this file does not.
--
-- IDEMPOTENT. Every statement is a guarded drop, a `create or replace`, a
-- revoke, a grant or a catalog read, so re-pasting this file is ordinary. A
-- re-paste does NOT clear recorded plays.
--
-- WHAT UNDOES IT: re-apply `0139`'s `foundry_play_counts` body verbatim (the
-- three-column form), then
-- `drop function if exists public.foundry_author_profile(uuid);`. Nothing else
-- in the schema refers to either, and no table, column, policy or index is
-- created, altered or dropped by this file at all.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE CROSS-APP PLAY READ, WIDENED.
--
-- SEVEN DAYS STAYS WRITTEN INTO THE FUNCTION rather than becoming a parameter,
-- for 0139's own reason: the columns are called `plays_7d` and `plays_prev_7d`
-- and the surfaces say "this week", and a parameter is how a label and a
-- number come to disagree. The PREVIOUS window is the seven days before that
-- one -- `[now-14d, now-7d)` -- half-open at the young end so no play can be
-- counted in both windows and none between them can fall through the gap.
--
-- `seconds_played` IS THE SAME EXPRESSION `foundry_app_play_stats` SUMS, to
-- the character, so an hours board and an app's own detail pane cannot
-- disagree about one app. That is a duplication this file accepts knowingly:
-- the alternative is a shared helper over a table whose every reader is a
-- definer in a different file, and a scalar helper would be a third object to
-- keep granted. `tests/db/foundry-play-boards.test.ts` computes both readings
-- and asserts they agree, which is the durable half of the pin.
--
-- A LEFT JOIN, so an app nobody has played is a row of zeroes rather than a
-- missing key. `coalesce` on the sum, because `sum()` over no rows is NULL and
-- a null hour count would sort as undefined in a client that subtracts.
-- ---------------------------------------------------------------------------

drop function if exists public.foundry_play_counts(boolean, boolean);

create or replace function public.foundry_play_counts(
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns table (
	app_id uuid,
	plays bigint,
	plays_7d bigint,
	plays_prev_7d bigint,
	seconds_played bigint
)
language sql
stable
security definer
set search_path = ''
as $fpc$
	select
		a.id,
		count(pl.id),
		count(pl.id) filter (where pl.started_at >= now() - interval '7 days'),
		count(pl.id) filter (
			where pl.started_at >= now() - interval '14 days'
				and pl.started_at < now() - interval '7 days'
		),
		coalesce(
			sum(extract(epoch from (pl.last_seen_at - pl.started_at)))::bigint,
			0
		)
	from public.student_apps a
	left join public.student_app_plays pl on pl.app_id = a.id
	where (select auth.uid()) is not null
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		)
	group by a.id;
$fpc$;

revoke all on function public.foundry_play_counts(boolean, boolean)
	from public, anon, authenticated, service_role;
grant execute on function public.foundry_play_counts(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE AUTHOR CARD.
--
-- IT PROJECTS THE PERSON AND NEVER THE APPS. The app list for an author page
-- is `foundry_list_apps(p_owner := <id>)`, which has taken that filter since
-- 0130 and already carries the identical population rule -- so the page is one
-- existing call plus this one, and there is no second listing to keep in step
-- with the gallery's.
--
-- THE COUNTS ARE THE CALLER'S OWN VIEW. `app_count` and `first_published_at`
-- run through the same predicate as everything else, so an author reading
-- their own page counts their unpublished drafts, an admin counts hidden apps,
-- and a classmate counts what a classmate can see. A figure computed against a
-- wider population than the list beneath it is a page whose header contradicts
-- its own body.
--
-- `jsonb` AND NOT A `returns table`, deliberately: this is one row or nothing,
-- and NULL is the whole of the refusal. A table-returning function answers an
-- empty set for both "no such person" and "not for you", which is the same
-- indistinguishability -- but a caller then has to remember that zero rows is
-- the refusal, and a `maybeSingle()` on the client would turn it into an
-- error. One nullable value says it once.
-- ---------------------------------------------------------------------------

create or replace function public.foundry_author_profile(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fap$
declare
	v_uid uuid := (select auth.uid());
	v_visible integer;
	v_first timestamptz;
	v_p record;
begin
	if v_uid is null or p_owner is null then
		return null;
	end if;

	-- THE DOOR IS AN APP. Everything below this point is about somebody whose
	-- work this caller can already open; a uuid with nothing visible behind it
	-- answers exactly as a uuid naming nobody does.
	select count(*)::integer, min(a.created_at)
	into v_visible, v_first
	from public.student_apps a
	where a.owner = p_owner
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id, true, true
		);

	if coalesce(v_visible, 0) = 0 then
		return null;
	end if;

	-- A MISSING PROFILE ROW IS AN ORDINARY ANSWER, not a reason to refuse. An
	-- app outlives its author's account deletion only in the sense that the
	-- owner column goes null, which the query above already excludes -- but a
	-- row can legitimately carry no name, no picture and no pathway, and every
	-- one of those renders as nothing rather than as an error.
	select p.display_name, p.full_name, p.avatar, p.avatar_url, p.pathway
	into v_p
	from public.profiles p
	where p.id = p_owner;

	return jsonb_build_object(
		'ok', true,
		'owner', p_owner,
		'owner_display_name', v_p.display_name,
		'owner_full_name', v_p.full_name,
		'owner_class', public._foundry_author_class(p_owner),
		'avatar', v_p.avatar,
		'avatar_url', v_p.avatar_url,
		'pathway', v_p.pathway,
		'app_count', v_visible,
		'first_published_at', v_first
	);
end;
$fap$;

revoke all on function public.foundry_author_profile(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.foundry_author_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. SELF-CHECK.
--
-- ASSERT THE ACL AND THE SHAPE, NOT THIS FILE'S OWN VERDICT. A guard passing
-- says the guard ran; reading `proacl` back through `has_function_privilege`
-- says what is actually granted, which on a hosted Supabase project is the
-- surprising part.
--
-- IT NAMES ONLY THE TWO FUNCTIONS THIS FILE WRITES. `0206`'s header states the
-- general form and `0214` broke it anyway: an apply-time guard that sweeps a
-- whole subsystem by name prefix is asserting something about migrations that
-- are not this file's, and it REFUSES TO APPLY on the deliberately incomplete
-- chains `tests/db/` builds as negative controls. A new migration checks its
-- own names and leaves the rest alone.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_n integer;
	v_name text;
	v_sig text;
begin
	foreach v_sig in array array[
		'public.foundry_play_counts(boolean, boolean)',
		'public.foundry_author_profile(uuid)'
	] loop
		v_name := split_part(split_part(v_sig, '.', 2), '(', 1);

		select count(*)::integer into v_n
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = v_name;
		if v_n <> 1 then
			raise exception '0221: public.% has % overloads, expected exactly 1. The drop in section 1 is what keeps this at one.', v_name, v_n;
		end if;

		if to_regprocedure(v_sig) is null then
			raise exception '0221: % did not get created.', v_sig;
		end if;
		if not has_function_privilege('authenticated', v_sig, 'execute') then
			raise exception '0221: authenticated cannot execute %.', v_sig;
		end if;
		if has_function_privilege('anon', v_sig, 'execute') then
			raise exception '0221: anon CAN execute %. The revoke has to name anon by role; "from public" does not remove the direct grant a hosted project writes at creation.', v_sig;
		end if;
	end loop;

	-- The two new columns are on the function, in the order the client reads
	-- them by NAME rather than by position -- but a missing one would leave a
	-- board reading undefined and rendering zero, silently, which is exactly
	-- the class of failure an apply-time check is worth having for.
	foreach v_name in array array['plays_prev_7d', 'seconds_played'] loop
		if not exists (
			select 1
			from pg_proc p
			join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = 'foundry_play_counts'
				and v_name = any (p.proargnames)
		) then
			raise exception '0221: foundry_play_counts does not project %.', v_name;
		end if;
	end loop;

	-- The three columns 0139 shipped are still there. A widening that quietly
	-- dropped one would break every play chip in the gallery.
	foreach v_name in array array['app_id', 'plays', 'plays_7d'] loop
		if not exists (
			select 1
			from pg_proc p
			join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = 'foundry_play_counts'
				and v_name = any (p.proargnames)
		) then
			raise exception '0221: foundry_play_counts lost 0139''s % column.', v_name;
		end if;
	end loop;

	-- THE REFUSED COLUMN, ASSERTED AS AN ABSENCE. See the header: a cross-app
	-- `players` count is what would turn a browse into a scan for the apps
	-- with exactly one player.
	if exists (
		select 1
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'foundry_play_counts'
			and 'players' = any (p.proargnames)
	) then
		raise exception '0221: foundry_play_counts projects a cross-app players count. Read this file''s header before adding one.';
	end if;

	raise notice '0221: foundry_play_counts widened to 5 columns (plays_prev_7d, seconds_played added; no players column), foundry_author_profile added, both authenticated-only.';
end;
$check$;

-- ---------------------------------------------------------------------------
-- 4. THE VERIFICATION QUERY, READ-ONLY, TO BE RUN AS ITS OWN PASTE.
--
-- The Supabase SQL editor shows no `raise notice` and renders only the last
-- statement's result set, so section 3's notices are invisible there and this
-- is how the apply is confirmed. UNCOMMENT THE WHOLE BLOCK AND PASTE IT ON ITS
-- OWN. It reads `pg_catalog` and `pg_proc` and writes nothing.
--
-- It names what it examined on every row and never answers a bare count, and
-- the LAST ROW IS A POSITIVE CONTROL -- `app_short_link_target` is deliberately
-- anon-executable (it serves signed-out visitors), so a `true` there proves the
-- query can see a grant at all and that every `false` above it is a real
-- finding rather than an instrument reading nothing.
--
-- select 'function exists: foundry_play_counts(boolean,boolean)' as examined,
--        to_regprocedure('public.foundry_play_counts(boolean, boolean)') is not null as ready
-- union all select 'function exists: foundry_author_profile(uuid)',
--        to_regprocedure('public.foundry_author_profile(uuid)') is not null
-- union all select 'exactly one foundry_play_counts overload (the drop held)',
--        (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'foundry_play_counts')
-- union all select 'exactly one foundry_author_profile overload',
--        (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'foundry_author_profile')
-- union all select 'column added: foundry_play_counts projects seconds_played',
--        (select 'seconds_played' = any (p.proargnames) from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'foundry_play_counts')
-- union all select 'column added: foundry_play_counts projects plays_prev_7d',
--        (select 'plays_prev_7d' = any (p.proargnames) from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'foundry_play_counts')
-- union all select 'column KEPT: foundry_play_counts still projects plays_7d',
--        (select 'plays_7d' = any (p.proargnames) from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'foundry_play_counts')
-- union all select 'column REFUSED: foundry_play_counts has no cross-app players count',
--        (select not ('players' = any (p.proargnames)) from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'foundry_play_counts')
-- union all select 'author card reads no address: foundry_author_profile never names an email column',
--        (select position('email' in p.prosrc) = 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'foundry_author_profile')
-- union all select 'author card reads no section_id',
--        (select position('section_id' in p.prosrc) = 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'foundry_author_profile')
-- union all select 'author card is gated on the population predicate',
--        (select position('_foundry_app_in_population' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'foundry_author_profile')
-- union all select 'grant: authenticated CAN execute both new functions',
--        (select bool_and(has_function_privilege('authenticated', sig, 'execute')) from unnest(array[
--           'public.foundry_play_counts(boolean, boolean)',
--           'public.foundry_author_profile(uuid)']) as sig)
-- union all select 'grant: anon can execute NEITHER of them',
--        (select bool_and(not has_function_privilege('anon', sig, 'execute')) from unnest(array[
--           'public.foundry_play_counts(boolean, boolean)',
--           'public.foundry_author_profile(uuid)']) as sig)
-- union all select 'grant: service_role holds neither (nothing server-side reads plays)',
--        (select bool_and(not has_function_privilege('service_role', sig, 'execute')) from unnest(array[
--           'public.foundry_play_counts(boolean, boolean)',
--           'public.foundry_author_profile(uuid)']) as sig)
-- union all select 'UNTOUCHED: student_app_plays still answers no client role directly',
--        (not has_table_privilege('authenticated', 'public.student_app_plays', 'SELECT')
--         and not has_table_privilege('anon', 'public.student_app_plays', 'SELECT'))
-- union all select 'POSITIVE CONTROL -- app_short_link_target IS anon-executable, so this query can see a grant at all',
--        has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute');
-- ---------------------------------------------------------------------------
