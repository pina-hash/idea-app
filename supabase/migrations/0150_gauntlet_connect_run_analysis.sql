-- 0150_gauntlet_connect_run_analysis.sql
-- IDEA // GAUNTLET: give the post-run analysis a class comparison the database
-- can disclose, and retire the speedrun logger nothing ever called.
--
-- ---------------------------------------------------------------------------
-- PART 1. WHY A CLASS MEDIAN CANNOT BE COMPUTED IN THE BROWSER.
--
-- `PostRunAnalysis.svelte` has rendered a "Vs class median" column since 0035
-- and has never been given anything to put in it: the real mount passes only
-- `events` and `targets`, and the only caller that fills `classStats` is a dev
-- harness. The reason the feature stalled there is not plumbing. A class median
-- is OTHER STUDENTS' runs, and every table it would be taken over is scoped by
-- RLS to `user_id = auth.uid() or public.is_teacher()` -- so a student's own
-- client can see exactly one student's rows and cannot aggregate over a class
-- at all. Widening that RLS to make a browser-side median possible would hand
-- every student every other student's individual runs in order to show them one
-- number. This function is the alternative: the aggregate is taken inside a
-- SECURITY DEFINER body and only the aggregate comes out.
--
-- ---------------------------------------------------------------------------
-- PART 2. THE DISCLOSURE RULE, WHICH IS THE WHOLE OF THIS FUNCTION.
--
-- AN AGGREGATE OVER THREE PEOPLE IS A NAMED PERSON. The floor is FIVE DISTINCT
-- PEER STUDENTS (`_gauntlet_class_stat_floor()`), and four properties make it
-- mean what it says:
--
--   * DISTINCT STUDENTS, NEVER RUNS. One student with five attempts is one
--     person, and counting attempts is how a "class median" becomes one
--     classmate's five tries wearing a plural label. Every population below is
--     collapsed to ONE VALUE PER STUDENT before it is counted or measured.
--   * PEERS, NEVER THE POPULATION. The caller is excluded from the count AND
--     from the median. Including yourself would let a floor of five be met by
--     four classmates plus you, and "vs class median" against a set containing
--     your own run is not the comparison the label claims.
--   * PER STATISTIC, NEVER ONCE. The three medians are taken over three
--     different populations (attempts, analysis rows, event streams), so each
--     one carries its OWN peer count and is nulled on its OWN. A single global
--     count is how a median over two people rides out on a count established by
--     a different median over thirty.
--   * BELOW THE FLOOR IS NULL, NOT AN ERROR. The client renders "No class data
--     yet", which is also what an unknown challenge id returns -- so a caller
--     cannot probe for a challenge's existence, or for how many classmates are
--     one short of the floor, by reading a refusal.
--
-- Each student contributes their BEST run on the axis being measured (the
-- lowest elapsed time, the fewest features, the shortest worst-dwell). One rule
-- for all three: the comparison is against what the class can do, and it is the
-- same statistic the leaderboard already shows for time.
--
-- WHAT IS DELIBERATELY NOT RETURNED: any user id, name, email, run id, rank, or
-- per-run row. The peer COUNTS are returned because a median with no n is a
-- number a student cannot weigh, and a count that is by construction >= 5 names
-- nobody.
--
-- ---------------------------------------------------------------------------
-- PART 3. THE DWELL MEDIAN MIRRORS THE COMPONENT, AND SAYS SO.
--
-- `medianStuckMs` compares against the component's own "longest dwell", which
-- `PostRunAnalysis` derives as: the gap from each `feature_add` to the next, the
-- last one running to the final event of the run, and the largest of those. The
-- CTEs below are that computation, per run, in SQL. It is a second statement of
-- one rule, which this repo normally refuses -- it is here because the
-- per-student half genuinely cannot run anywhere else (see PART 1), and it is
-- pinned by a test that puts the same fixture through both.
--
-- ---------------------------------------------------------------------------
-- PART 4. `gauntlet_log_speedrun_attempt` IS DROPPED.
--
-- 0033 added it as an "optional explicit logger ... for a client to record an
-- outcome the triggers cannot see (e.g. marking a run abandoned from the UI)".
-- No client ever called it. Swept across `src/`, `tests/`, `static/`, `tools/`
-- and every migration: the only occurrences are its own definition in 0033 and
-- a line in the history record describing it. Both outcomes it existed to write
-- now arrive without it -- `gauntlet_attempt_from_token` logs the START and
-- `gauntlet_attempt_from_submission` reconciles the FINISH -- and the third,
-- `abandoned`, is DERIVED at read time by `gauntlet_speedrun_attempt_history`
-- from an expired token, which is why no client needed to post it. What is left
-- is a definer function granted to `authenticated` that lets any signed-in
-- caller write an arbitrary result and elapsed_ms into their own attempt
-- history: a write path with no reader, no caller and no rule behind it.
--
-- Idempotent (create or replace / drop ... if exists / create index if not
-- exists). Re-pasting this file is safe.

-- ---------------------------------------------------------------------------
-- 1. Drop the uncalled logger.
-- ---------------------------------------------------------------------------
drop function if exists public.gauntlet_log_speedrun_attempt(uuid, uuid, text, bigint, uuid);

-- ---------------------------------------------------------------------------
-- 2. The floor, written down ONCE. Two literals in two branches is how a
--    disclosure floor and the count that is checked against it stop being the
--    same number.
-- ---------------------------------------------------------------------------
create or replace function public._gauntlet_class_stat_floor()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

revoke all on function public._gauntlet_class_stat_floor()
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The class aggregate. Reads three populations, collapses each to one value
--    per student, and returns a median only where at least the floor of DISTINCT
--    PEERS contributed to that particular median.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_class_run_stats(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
	v_me uuid := (select auth.uid());
	v_floor integer := public._gauntlet_class_stat_floor();
	v_elapsed_n integer := 0;
	v_elapsed numeric;
	v_features_n integer := 0;
	v_features numeric;
	v_stuck_n integer := 0;
	v_stuck numeric;
begin
	-- No session, or nothing to ask about: the same empty answer a challenge
	-- below the floor gives, so neither can be told from the other.
	if v_me is null or p_challenge_id is null then
		return jsonb_build_object(
			'median_elapsed_ms', null, 'median_features', null, 'median_stuck_ms', null,
			'peers_elapsed', 0, 'peers_features', 0, 'peers_stuck', 0, 'floor', v_floor
		);
	end if;

	-- (a) Time: each peer's FASTEST passing attempt.
	select count(*), percentile_cont(0.5) within group (order by v)
		into v_elapsed_n, v_elapsed
	from (
		select a.user_id, min(a.elapsed_ms)::numeric as v
		from public.gauntlet_speedrun_attempts a
		where a.challenge_id = p_challenge_id
			and a.result = 'passed'
			and a.elapsed_ms is not null
			and a.elapsed_ms > 0
			and a.user_id <> v_me
		group by a.user_id
	) q;

	-- (b) Features: each peer's LEANEST recorded tree, off the per-run summary
	--     the add-in upserts (indexed on challenge_id since 0035).
	select count(*), percentile_cont(0.5) within group (order by v)
		into v_features_n, v_features
	from (
		select r.user_id, min(r.feature_count)::numeric as v
		from public.gauntlet_run_analysis r
		where r.challenge_id = p_challenge_id
			and r.feature_count is not null
			and r.feature_count > 0
			and r.user_id <> v_me
		group by r.user_id
	) q;

	-- (c) Longest dwell: per run, the largest gap between consecutive
	--     `feature_add` events (the last running to the run's final event);
	--     per peer, their shortest such worst-dwell. Mirrors the component.
	select count(*), percentile_cont(0.5) within group (order by v)
		into v_stuck_n, v_stuck
	from (
		select p.user_id, min(p.stuck_ms)::numeric as v
		from (
			select g.run_id, g.user_id, max(g.gap) as stuck_ms
			from (
				select
					a.run_id,
					a.user_id,
					coalesce(
						lead(a.t_ms) over (partition by a.run_id order by a.seq),
						e.end_ms
					) - a.t_ms as gap
				from public.gauntlet_run_events a
				join (
					select run_id, max(t_ms) as end_ms
					from public.gauntlet_run_events
					where challenge_id = p_challenge_id
					group by run_id
				) e on e.run_id = a.run_id
				where a.challenge_id = p_challenge_id
					and a.event_type = 'feature_add'
					and a.user_id <> v_me
			) g
			where g.gap > 0
			group by g.run_id, g.user_id
		) p
		group by p.user_id
	) q;

	return jsonb_build_object(
		'median_elapsed_ms', case when v_elapsed_n >= v_floor then round(v_elapsed) end,
		'median_features',   case when v_features_n >= v_floor then round(v_features) end,
		'median_stuck_ms',   case when v_stuck_n >= v_floor then round(v_stuck) end,
		'peers_elapsed',  case when v_elapsed_n  >= v_floor then v_elapsed_n  else 0 end,
		'peers_features', case when v_features_n >= v_floor then v_features_n else 0 end,
		'peers_stuck',    case when v_stuck_n    >= v_floor then v_stuck_n    else 0 end,
		'floor', v_floor
	);
end;
$$;

-- A NEW function is not covered by 0137's sweep and must narrow for itself; on
-- a hosted Supabase project `from public` alone leaves the `anon` grant the
-- project's default privileges wrote in at creation time.
revoke all on function public.gauntlet_class_run_stats(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_class_run_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The dwell median scans events by challenge, which had no index for it
--    (0035 indexed (run_id, seq) and (user_id, created_at)).
-- ---------------------------------------------------------------------------
create index if not exists gauntlet_run_events_challenge_type_idx
	on public.gauntlet_run_events (challenge_id, event_type);

-- ---------------------------------------------------------------------------
-- 5. Self-check. Reports what the file did against the real catalog, rather
--    than trusting that the statements above ran.
-- ---------------------------------------------------------------------------
do $$
declare
	v_logger integer;
	v_stats integer;
	v_anon boolean;
	v_authed boolean;
begin
	select count(*) into v_logger
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'gauntlet_log_speedrun_attempt';

	select count(*) into v_stats
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'gauntlet_class_run_stats';

	if v_logger <> 0 then
		raise exception 'gauntlet_log_speedrun_attempt still present (% overloads)', v_logger;
	end if;
	if v_stats <> 1 then
		raise exception 'expected exactly 1 gauntlet_class_run_stats, found %', v_stats;
	end if;

	-- Assert the ACL, not the revoke statement's verdict.
	v_anon := has_function_privilege('anon', 'public.gauntlet_class_run_stats(uuid)', 'execute');
	v_authed := has_function_privilege('authenticated', 'public.gauntlet_class_run_stats(uuid)', 'execute');
	if v_anon then
		raise exception 'gauntlet_class_run_stats is executable by anon';
	end if;
	if not v_authed then
		raise exception 'gauntlet_class_run_stats is NOT executable by authenticated';
	end if;
	if has_function_privilege('anon', 'public._gauntlet_class_stat_floor()', 'execute')
		or has_function_privilege('authenticated', 'public._gauntlet_class_stat_floor()', 'execute') then
		raise exception '_gauntlet_class_stat_floor is reachable by a client role';
	end if;

	raise notice '0150: logger dropped; gauntlet_class_run_stats granted to authenticated only; peer floor = %',
		public._gauntlet_class_stat_floor();
end $$;
