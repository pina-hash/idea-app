-- 0151_gauntlet_meter_practice.sql
-- IDEA // GAUNTLET: put a minimum interval on the Speedrun PRACTICE check, and
-- give an admin a way to see who has been hammering it.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS, IN PLAIN TERMS, BECAUSE THE NEXT READER WILL OTHERWISE TAKE IT
-- FOR A FIX.
--
--   THIS DOES NOT PREVENT FORGERY. IT MAKES IT SLOW AND VISIBLE.
--
-- A student can still recover a Speedrun target by probing this path and still
-- submit a forged ranked run off the back of it. What changes is that the
-- probing now takes minutes of unbroken, evenly spaced calls instead of a
-- fraction of a second, and that the shape of those calls is readable
-- afterwards by an admin who asks one question. That is deterrence plus
-- detection. It is not closure.
--
-- THE CLOSURE DECISION IS NOT MADE HERE. `claude/speedrun-deviation-band-measure-hoqxzz`
-- measured that the only containment that actually works is dropping `speedrun`
-- from `gauntlet_leaderboard`'s allowlist -- removing the VALUE of the forgery
-- rather than bounding a search that cannot be bounded -- and `0146` wrote that
-- allowlist specifically so a person decides which modes rank. This file does
-- not touch the view, the allowlist, or the mode's ranking. Anyone reading this
-- as "the Speedrun hole is closed" has misread it.
--
-- ---------------------------------------------------------------------------
-- WHY A RATE AND NOT A COUNT. This is the measured part, and it is why 0151 is
-- not the reveal budget the previous bundle reserved this number for. The three
-- figures in this section are that bundle's
-- (`docs/history/speedrun-deviation-band-measure-hoqxzz.md`), not this one's;
-- the ones further down under WHAT IT BUYS were measured here.
--
--   * A REVEAL BUDGET DOES NOT BIND THIS PATH AT ALL. The search runs through
--     `gauntlet_submit`'s Speedrun branch, which needs no reveal: 298 probes,
--     ZERO reveals, measured. Do not rebuild one.
--   * REMOVING `deviation_band` DOES NOT STOP THE SEARCH. With the band assumed
--     deleted and only `is_correct` read, a geometric scan finds the target in
--     163 probes / 243 ms. Do not rebuild that either. Any free, unlimited
--     pass/fail test is a search over a continuum whatever coaching sits beside
--     it.
--   * A COUNT CANNOT SEPARATE THE TWO POPULATIONS. An honest student is already
--     granted 3 failed attempts PER RUN TOKEN (`0061`, `c_max_failed_attempts`)
--     with reveals free and unlimited, so an honest second run is already worth
--     six attempts -- which exceeds the attack's twelve-probe floor against a
--     strong prior. Any budget low enough to bite the attack sits below what a
--     student on their fourth try at a hard part legitimately spends.
--
-- SPEED IS WHAT SEPARATES THEM. 300 probes in 243 ms, against a person who
-- takes minutes between attempts because they were modelling something. The two
-- distributions do not overlap anywhere near the floor below.
--
-- ---------------------------------------------------------------------------
-- THE INTERVAL, AND THE HONEST LOOP IT WAS PICKED FROM.
--
-- `_gauntlet_practice_min_interval()` is TWO SECONDS, per student per
-- challenge, on the practice branch only.
--
-- WHAT WAS ASSUMED ABOUT THE HONEST LOOP, stated so it can be argued with
-- rather than inferred from the number. The Speedrun practice check is: read
-- the drawing, model the part, open Mass Properties, read the mass, type it,
-- submit. That whole loop is MINUTES, and nothing about it comes near two
-- seconds. The only sub-minute events in an honest session are corrections of
-- the typed NUMBER, with no return to CAD:
--
--   1. A double submit -- a double click, Enter twice, a retried post. Under a
--      second. This is the overwhelming majority of what will hit the floor.
--   2. A transcription fix -- the student reads `your_mass` back in the banner,
--      sees a dropped decimal, and retypes. Reading the banner and deciding is
--      itself a second or more before any typing starts, so this lands at three
--      to five seconds even for a fast typist.
--   3. A unit or feature retry -- the same number as g then as lb, or with and
--      without a fillet. Same order as (2).
--
-- So the fastest honest repeat requires READING A RESULT FIRST, which puts it
-- above two seconds; the double click does not, which puts it below. The floor
-- is placed in that gap deliberately, and it is placed at the BOTTOM of it: the
-- cost of setting it too high is an honest student meeting a refusal in the
-- middle of the free practice loop, and that is the one outcome this file must
-- not produce (see the next section).
--
-- WHAT IT BUYS, MEASURED rather than reasoned about, driving the real RPC on
-- the real chain with and without this file:
--
--   * UNMETERED (the world as deployed today): a pass-only geometric scan from
--     a 20% prior, reading ONLY `is_correct`, recovered the target in 224
--     probes and 358 ms -- 1.6 ms per probe, relative error 2.5e-4, comfortably
--     inside the 0.1% pass band.
--   * METERED: a caller going as fast as it is allowed to, retrying on every
--     refusal, landed 15 checks in 28.2 s. Median gap 2016 ms; 1042 calls were
--     refused in between. That is 1880 ms per accepted probe, a slowdown of
--     ~1180x, and it projects the same 224-probe search to about SEVEN MINUTES
--     of unbroken metronome traffic.
--   * A 12-PROBE SEARCH AGAINST A STRONG PRIOR IS STILL ONLY ~24 SECONDS, and
--     is NOT meaningfully bounded by this. Said plainly rather than glossed.
--     What that case IS, is loud: see the detector below, which reported that
--     exact run as `longest_burst 15, at_floor_gaps 14, median_gap_ms 2014`
--     with nobody writing a query.
--
-- AND WHAT IT DOES NOT BUY, since the same measurement shows it: the floor
-- bounds the ROWS, not the REQUESTS. Those 1042 refusals are 1042 real calls,
-- each one a lock acquire, one indexed lookup and a raise -- cheap, but not
-- nothing, and this file is not a defence against request volume. If that ever
-- matters it is an edge concern and not a database one.
--
-- ---------------------------------------------------------------------------
-- WHAT MUST NOT BREAK, AND IS THE REASON FOR EVERY NARROWING BELOW.
--
-- The practice check is the FREE, UNLIMITED FEEDBACK LOOP that makes the
-- attempt budget on the ranked path acceptable. `0061`'s header says so in
-- those words and leans on it. A student iterating on a part must not notice
-- this exists. So:
--
--   * IT IS AN INTERVAL, NEVER A BUDGET. Nothing is consumed, nothing is spent,
--     and a student may check a part ten thousand times. There is no counter to
--     run out of and no state to reset.
--   * IT IS SCOPED TO THE PRACTICE BRANCH ONLY. The knowledge modes
--     (`drawing_reading`, `gdt_tolerance`, `spot_the_error`) share this function
--     and are untouched: they answer from a fixed key rather than a continuum,
--     so they are not a bisection oracle, and `0148` gave them a clock.
--   * IT IS PER CHALLENGE. A student comparing two parts side by side never
--     meets it.
--   * IT IS NOT ON THE RANKED PATH. `gauntlet_macro_submit` and
--     `gauntlet_room_manual_submit` are not touched; they already hold a run token and
--     already carry `0061`'s attempt budget.
--
-- ---------------------------------------------------------------------------
-- THE REFUSAL IS WRITTEN FOR A DOUBLE CLICK, BECAUSE THAT IS WHO WILL READ IT.
--
--     'You just checked this part a moment ago. Give it a couple of seconds and
--      check it again.'
--
-- It names no table, no column, no function, no limit and no policy; it does
-- not say "rate limit", "too many", "blocked" or "attempt"; and it tells the
-- student the thing to do next rather than characterising what they did. An
-- honest student who meets this has done nothing wrong and the sentence must
-- not suggest otherwise. It RAISES rather than returning a structured refusal,
-- and that is forced by the deployed client: `/gauntlet/speedrun/[id]` renders
-- `rpcError.message` verbatim into its own warning line, whereas a
-- `{ok:false}` object would be handed to the result banner, where a missing
-- `is_correct` reads as FALSE and a double-clicking student would be told their
-- part is wrong. A wrong answer is a worse lie than an error.
--
-- ---------------------------------------------------------------------------
-- THE VISIBLE HALF, WHICH IS WORTH MORE THAN THE INTERVAL.
--
-- The path already inserts a `submissions` row per call, so the evidence has
-- always been there and nobody could ask about it without writing a query from
-- scratch. `gauntlet_practice_pressure()` is that question, asked once:
-- per (student, challenge), how many practice checks, how fast the fastest gap
-- was, what the MEDIAN gap was, and -- the column that matters -- the LONGEST
-- RUN OF CONSECUTIVE CHECKS SITTING AT THE FLOOR.
--
--   A HUMAN CANNOT PRODUCE A LONG BURST. Every gap in a burst is within half a
--   second of the enforced minimum, which is the signature of a caller that is
--   waiting on the floor and submitting the instant it lifts. An honest
--   student's gaps are minutes and irregular. So `longest_burst` is the
--   discriminator that `checks` is not: a student legitimately checking a hard
--   part forty times over a week has forty checks and a longest burst of one.
--
--   THE INTERVAL IS WHAT MAKES THE DETECTOR LEGIBLE, which is the argument for
--   shipping both together. Before it, a search was 250 rows inside one second
--   and its gaps were noise; after it, the same search is 250 rows at a metronome
--   cadence. Metering did not just slow the attack down, it gave it a shape.
--
--   A REFUSED CALL LEAVES NO ROW, deliberately: the guard raises before the
--   insert, so the whole call rolls back. That is not a gap in the record. A
--   caller being refused is a caller pinned AT the floor, and the accepted calls
--   either side of the refusal are exactly what `longest_burst` counts. Adding a
--   second table to record refusals would buy a duplicate of a signal that is
--   already in the rows, at the price of a write path a refused caller controls
--   the rate of.
--
--   IT DISCLOSES NO EMAIL. It projects `user_id` and the student's chosen name
--   (`display_name`, else `full_name`), never the address, because a column that
--   reaches a console reaches an export, a paste and a screenshot. An admin
--   holding a `user_id` can read `profiles` already.
--
--   NON-ADMINS GET NO ROWS, not an error: an empty set is the same answer as
--   "nothing has been hammered", so the function's existence discloses nothing
--   about whether there is a detection lane.
--
-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS FILE:
--   1. Re-apply `0147`'s `gauntlet_submit` definition verbatim (it is the only
--      thing this file replaces, and only to add the guard).
--   2. `drop function public.gauntlet_practice_pressure(integer, integer, integer),
--       public._gauntlet_practice_min_interval();`
--   3. `drop index if exists public.submissions_practice_recent_idx;`
-- Nothing else refers to any of them, and no data is written that a rollback
-- would strand: this file adds no table and no column.
--
-- IDEMPOTENT: every object is `create or replace` or `if not exists`, so a
-- re-paste is free and changes nothing.
--
-- SIGNATURE TRAP: `gauntlet_submit` keeps its exact `(uuid, jsonb, integer)`
-- signature, so no `drop function` is needed and no overload can survive. The
-- deployed client sends the same three arguments and reads no new field, so
-- THERE IS NO DEPLOY ORDERING: this file and the app are independent events and
-- either may go first.
--
-- GRANTS: `create or replace` under this project's default privileges hands a
-- function a fresh `anon` grant (the `0137` rule), so `gauntlet_submit`'s
-- narrowing is RESTATED below rather than assumed to survive, and the two new
-- functions revoke for themselves.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The interval, written down ONCE.
--
--    The guard refuses inside it and the detector measures against it, because
--    they are the same rule about what one check is. Two literals in two places
--    is how an enforced floor and the floor a burst is counted against stop
--    being the same number -- which would leave a detector reporting nothing
--    while the guard held callers at a cadence it no longer recognised.
--
--    No grant: it is called only from the two SECURITY DEFINER bodies below,
--    which run as this file's owner.
-- ---------------------------------------------------------------------------

create or replace function public._gauntlet_practice_min_interval()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '2 seconds' $$;

revoke all on function public._gauntlet_practice_min_interval()
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The index the guard reads through.
--
--    ITS PREDICATE IS THE DEFINITION OF "THE PRACTICE PATH", and that
--    definition is structural rather than a flag anybody has to remember to
--    set. Every ranked modeling submit writes `source = 'macro'` (0016, 0061,
--    0147) and `gauntlet_room_manual_submit` writes `source = 'manual'` but refuses a
--    token whose `room_id` is null ("This code is not a room run."), so
--
--        mode = 'speedrun' AND source = 'manual' AND room_id IS NULL
--
--    is reached by exactly one writer in the whole schema: the branch guarded
--    below. Nothing was added to mark these rows, because a mark is a second
--    statement of the same fact and the fact is already load-bearing.
-- ---------------------------------------------------------------------------

create index if not exists submissions_practice_recent_idx
	on public.submissions (user_id, challenge_id, created_at desc)
	where mode = 'speedrun' and source = 'manual' and room_id is null;

-- ---------------------------------------------------------------------------
-- 3. gauntlet_submit, byte-identical to 0147 apart from ONE inserted block.
--
--    The guard sits at the top of the Speedrun branch, before the mass is even
--    parsed, so a refused call costs nothing and reads nothing about the level.
--    Everything above it (the sign-in check, the challenge lookup, the
--    publication gate) and everything in the knowledge branch is 0147's text
--    unchanged, diffed against the source rather than reconstructed.
--
--    CONCURRENT CALLS ARE SERIALIZED ON THE (STUDENT, CHALLENGE) PAIR. This is
--    not defensive: the double click is the LOUDEST case here, and two form
--    posts milliseconds apart would otherwise both look, both find nothing
--    recent, and both insert -- so the guard would miss precisely the caller its
--    sentence is written for. There is no unique index to collide on instead,
--    because the window is a volatile expression (`now()`) and an index
--    predicate may not contain one. Transaction-scoped, so it is released with
--    the statement.
-- ---------------------------------------------------------------------------

create or replace function public.gauntlet_submit(
	p_challenge_id uuid,
	p_value jsonb,
	p_elapsed_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_challenge public.challenges%rowtype;
	v_elapsed_ms integer;
	v_score numeric;
	v_value jsonb;
	v_correct boolean;
	v_result jsonb;
	v_submitted text;
	v_answer_key text;
	v_answer_type text;
	v_mass numeric;
	v_target_g numeric;
	v_target_level numeric;
	v_tol_pct numeric;
	v_unit_system text;
	v_band text;
	v_last_check timestamptz;
	c_lb_to_g constant numeric := 453.59237;
begin
	if v_uid is null then
		raise exception 'You must be signed in to submit.';
	end if;

	select * into v_challenge from public.challenges where id = p_challenge_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;
	if not v_challenge.published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	v_elapsed_ms := greatest(coalesce(p_elapsed_ms, 0), 0);
	v_score := round(v_elapsed_ms::numeric / 1000.0, 2);
	v_value := coalesce(p_value, '{}'::jsonb) || jsonb_build_object('elapsed_ms', v_elapsed_ms);

	if v_challenge.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error') then
		-- UNCHANGED from 0008 and from 0147. The knowledge modes are not metered:
		-- they grade against a fixed key rather than a continuum, so repeating one
		-- is not a search, and 0148 already gave them a clock.
		v_submitted := nullif(btrim(p_value ->> 'answer'), '');
		v_answer_key := v_challenge.answer ->> 'correct';
		v_answer_type := coalesce(v_challenge.answer ->> 'type', 'choice');
		if v_submitted is null or v_answer_key is null then
			v_correct := false;
		elsif v_answer_type = 'numeric' then
			begin
				v_correct := abs(v_submitted::numeric - v_answer_key::numeric)
					<= coalesce((v_challenge.answer ->> 'tolerance')::numeric, 0);
			exception when others then
				v_correct := false;
			end;
		elsif v_answer_type = 'text' then
			v_correct := lower(btrim(v_submitted)) = lower(btrim(v_answer_key));
		else
			v_correct := v_submitted = v_answer_key;
		end if;
		v_result := jsonb_build_object(
			'mode', v_challenge.mode,
			'is_correct', v_correct,
			'correct', v_answer_key,
			'explanation', v_challenge.answer ->> 'explanation',
			'score_metric', v_score
		);
	elsif v_challenge.mode = 'speedrun' then
		-- ### 0151: the minimum interval. Everything else in this branch is
		-- ### 0147's text unchanged.
		--
		-- Serialize this caller on this challenge first, so a double post cannot
		-- have both halves read an empty window.
		perform pg_advisory_xact_lock(
			hashtextextended(v_uid::text || ':' || p_challenge_id::text, 0)
		);

		select s.created_at into v_last_check
		from public.submissions s
		where s.user_id = v_uid
			and s.challenge_id = p_challenge_id
			and s.mode = 'speedrun'
			and s.source = 'manual'
			and s.room_id is null
		order by s.created_at desc
		limit 1;

		if v_last_check is not null
			and now() - v_last_check < public._gauntlet_practice_min_interval()
		then
			-- Names nothing in the database, characterises nobody, and says what
			-- to do next. See this file's header for why it raises rather than
			-- returning a refusal object.
			raise exception 'You just checked this part a moment ago. Give it a couple of seconds and check it again.';
		end if;
		-- ### end 0151.

		-- Manual mass entry (unranked supervised practice; the leaderboard ranks
		-- modeling rows only when source = 'macro', so this never ranks).
		begin
			v_mass := nullif(p_value ->> 'mass', '')::numeric;
		exception when others then
			v_mass := null;
		end;
		v_unit_system := public._gauntlet_unit_system(v_challenge.prompt);
		v_target_g := public._gauntlet_target_mass_g(v_challenge.prompt, v_challenge.answer);
		v_tol_pct := public._gauntlet_tol_pct(v_challenge.answer);
		-- The student types in the LEVEL's unit, so compare there.
		v_target_level := case
			when v_target_g is null then null
			when v_unit_system = 'IPS' then v_target_g / c_lb_to_g
			else v_target_g
		end;
		v_correct := v_mass is not null
			and v_target_level is not null
			and abs(v_mass - v_target_level) <= v_target_level * v_tol_pct / 100.0;
		v_band := public._gauntlet_deviation_band(v_mass, v_target_level, v_correct);
		v_value := v_value || jsonb_build_object('deviation_band', v_band);
		-- NOTE: `target_mass` and `tolerance_pct` are deliberately ABSENT (0147),
		-- and so is anything they can be rebuilt from. `your_mass` is the caller's
		-- OWN typed number, so it discloses nothing; `deviation_band` is coarse and
		-- unsigned. Do not add a percentage, a delta, a target in any unit, or a
		-- band edge here: any second number beside `your_mass` whose ratio or
		-- difference with it yields the target puts this straight back.
		v_result := jsonb_build_object(
			'mode', 'speedrun',
			'is_correct', v_correct,
			'your_mass', v_mass,
			'mass_unit', case when v_unit_system = 'IPS' then 'lb' else 'g' end,
			'unit_system', v_unit_system,
			'deviation_band', v_band,
			'score_metric', v_score
		);
	else
		raise exception 'This mode cannot be scored yet.';
	end if;

	insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric)
	values (v_uid, p_challenge_id, v_challenge.mode, v_value, v_correct, v_score);

	return v_result;
end;
$$;

-- 0147's narrowing, restated: `create or replace` under this project's default
-- privileges re-grants `anon`.
revoke all on function public.gauntlet_submit(uuid, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_submit(uuid, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The detector. "Did anyone hammer this", asked once.
--
--    ADMIN ONLY, AND A NON-ADMIN GETS NO ROWS RATHER THAN AN ERROR -- the same
--    answer as "nobody hammered anything", so the function's existence does not
--    disclose that there is a detection lane to route around.
--
--    THE HEADLINE COLUMN IS `longest_burst`, NOT `checks`. A student
--    legitimately grinding a hard part has a high `checks` and a `longest_burst`
--    of 0, because their gaps are minutes and irregular. A caller waiting on the
--    floor and firing the instant it lifts has a `longest_burst` in the dozens
--    or hundreds, which no person produces. `checks` alone would put the
--    hardest-working student in the class at the top of this list, which is how
--    a detector teaches an admin to ignore it.
--
--    WHY THE VOLUME FILTER HAS AN `or` IN IT. `p_min_checks` hides ordinary
--    students; on its own it would also hide the SHORT search, which is the
--    realistic one. A twelve-probe search against a student who has already
--    nearly modelled the part is twelve checks -- under any sensible volume
--    floor -- and a burst of twelve. So anything with a burst of three or more
--    is listed whatever its count. Three is the floor because TWO consecutive
--    checks at the floor is a double click, and this file's whole premise is
--    that double clicks are the common case.
--
--    IT PROJECTS NO EMAIL. `user_id` plus the student's chosen name; an admin
--    who needs the address can already read `profiles`.
-- ---------------------------------------------------------------------------

create or replace function public.gauntlet_practice_pressure(
	p_since_hours integer default 168,
	p_min_checks integer default 20,
	p_limit integer default 100
)
returns table (
	user_id uuid,
	player text,
	challenge_id uuid,
	challenge_title text,
	checks bigint,
	first_check timestamptz,
	last_check timestamptz,
	fastest_gap_ms bigint,
	median_gap_ms bigint,
	at_floor_gaps bigint,
	longest_burst bigint,
	passes bigint
)
language sql
security definer
stable
set search_path = ''
as $$
	with bounds as (
		select
			public.is_admin() as ok,
			now() - make_interval(hours => greatest(coalesce(p_since_hours, 168), 1)) as since,
			-- A caller pinned at the floor lands a little above it, never below:
			-- the refusal is what holds them there and the network adds the rest.
			-- Half a second of slack is what separates "waiting on the floor"
			-- from an honest repeat, which cannot happen without reading a result
			-- first (see this file's header).
			public._gauntlet_practice_min_interval() + interval '500 milliseconds' as floor_gap,
			-- Two consecutive checks at the floor is a double click. Three is not.
			3::bigint as burst_floor
	),
	practice as (
		-- The practice branch's own rows and nothing else: see section 2 for why
		-- this triple identifies exactly one writer.
		select s.user_id, s.challenge_id, s.created_at, s.is_correct
		from public.submissions s, bounds b
		where b.ok
			and s.mode = 'speedrun'
			and s.source = 'manual'
			and s.room_id is null
			and s.created_at >= b.since
	),
	gapped as (
		select p.user_id, p.challenge_id, p.created_at, p.is_correct,
			p.created_at - lag(p.created_at)
				over (partition by p.user_id, p.challenge_id order by p.created_at) as gap
		from practice p
	),
	flagged as (
		select g.*, (g.gap is not null and g.gap <= b.floor_gap) as at_floor
		from gapped g, bounds b
	),
	islanded as (
		-- A running count of the gaps that were NOT at the floor is a group id:
		-- consecutive at-floor gaps share one, and anything slower starts a new
		-- one. Standard island detection, so a burst is counted rather than
		-- estimated from a ratio.
		select f.*,
			sum(case when f.at_floor then 0 else 1 end) over (
				partition by f.user_id, f.challenge_id
				order by f.created_at
				rows between unbounded preceding and current row
			) as island
		from flagged f
	),
	runs as (
		select i.user_id, i.challenge_id, i.island, count(*) as run_gaps
		from islanded i
		where i.at_floor
		group by i.user_id, i.challenge_id, i.island
	),
	agg as (
		select f.user_id, f.challenge_id,
			count(*) as checks,
			min(f.created_at) as first_check,
			max(f.created_at) as last_check,
			(extract(epoch from min(f.gap)) * 1000)::bigint as fastest_gap_ms,
			(extract(epoch from percentile_cont(0.5) within group (order by f.gap)) * 1000)::bigint
				as median_gap_ms,
			count(*) filter (where f.at_floor) as at_floor_gaps,
			count(*) filter (where f.is_correct) as passes
		from flagged f
		group by f.user_id, f.challenge_id
	),
	scored as (
		select a.*,
			-- n consecutive at-floor GAPS is n+1 checks. No burst at all is 0,
			-- not 1: a lone check is not a run of anything.
			coalesce(
				(select max(r.run_gaps) + 1 from runs r
					where r.user_id = a.user_id and r.challenge_id = a.challenge_id),
				0
			)::bigint as longest_burst
		from agg a
	)
	select s.user_id,
		coalesce(
			nullif(btrim(pr.display_name), ''),
			nullif(btrim(pr.full_name), '')
		) as player,
		s.challenge_id,
		ch.title as challenge_title,
		s.checks,
		s.first_check,
		s.last_check,
		s.fastest_gap_ms,
		s.median_gap_ms,
		s.at_floor_gaps,
		s.longest_burst,
		s.passes
	from scored s
	cross join bounds b
	left join public.profiles pr on pr.id = s.user_id
	left join public.challenges ch on ch.id = s.challenge_id
	where s.checks >= greatest(coalesce(p_min_checks, 20), 1)
		or s.longest_burst >= b.burst_floor
	order by s.longest_burst desc, s.checks desc, s.last_check desc
	limit greatest(coalesce(p_limit, 100), 1);
$$;

revoke all on function public.gauntlet_practice_pressure(integer, integer, integer)
	from public, anon, authenticated, service_role;
-- An admin is `authenticated` like everybody else; the gate is `is_admin()`
-- inside the body, and a non-admin's answer is an empty set.
grant execute on function public.gauntlet_practice_pressure(integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Self-checks. These assert the CATALOG, not this file's own verdict:
--    a guard that passes tells you the guard ran, `proacl` tells you what is
--    actually granted (the 0137 lesson).
-- ---------------------------------------------------------------------------

do $$
declare
	v_arities integer;
	v_interval interval;
	v_practice_rows bigint;
begin
	-- The signature trap: exactly one gauntlet_submit, still three arguments.
	select count(*) into v_arities
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'gauntlet_submit';
	if v_arities <> 1 then
		raise exception '0151: expected exactly 1 gauntlet_submit overload, found %.', v_arities;
	end if;

	-- The grants, read back rather than assumed to have survived create-or-replace.
	if pg_catalog.has_function_privilege('anon', 'public.gauntlet_submit(uuid, jsonb, integer)', 'execute') then
		raise exception '0151: anon still holds execute on gauntlet_submit.';
	end if;
	if not pg_catalog.has_function_privilege('authenticated', 'public.gauntlet_submit(uuid, jsonb, integer)', 'execute') then
		raise exception '0151: authenticated lost execute on gauntlet_submit.';
	end if;
	if pg_catalog.has_function_privilege('anon', 'public.gauntlet_practice_pressure(integer, integer, integer)', 'execute') then
		raise exception '0151: anon holds execute on gauntlet_practice_pressure.';
	end if;
	if pg_catalog.has_function_privilege('anon', 'public._gauntlet_practice_min_interval()', 'execute')
		or pg_catalog.has_function_privilege('authenticated', 'public._gauntlet_practice_min_interval()', 'execute')
	then
		raise exception '0151: the private interval helper is reachable by a client role.';
	end if;

	-- The index the guard reads through.
	if not exists (
		select 1 from pg_catalog.pg_indexes
		where schemaname = 'public' and indexname = 'submissions_practice_recent_idx'
	) then
		raise exception '0151: submissions_practice_recent_idx is missing.';
	end if;

	select public._gauntlet_practice_min_interval() into v_interval;

	-- What is already on this database, so the operator can see what the floor
	-- is about to apply to rather than taking it on faith.
	select count(*) into v_practice_rows
	from public.submissions s
	where s.mode = 'speedrun' and s.source = 'manual' and s.room_id is null;

	raise notice '0151: practice floor is %, per student per challenge, on the Speedrun practice branch only.', v_interval;
	raise notice '0151: % existing practice rows are already recorded; gauntlet_practice_pressure() reads them with no backfill.', v_practice_rows;
	raise notice '0151: this meters and records the search. It does NOT prevent forgery -- see this file''s header.';
end $$;
