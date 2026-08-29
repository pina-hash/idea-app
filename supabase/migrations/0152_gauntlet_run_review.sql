-- 0152_gauntlet_run_review.sql
-- IDEA // GAUNTLET: put a ranked Speedrun run in front of a person, with the
-- facts beside it. This file RANKS NOBODY, UNRANKS NOBODY AND REFUSES NOTHING.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A REPORT AND NOT A GATE, WHICH IS THE DECISION THIS FILE ENCODES
-- ---------------------------------------------------------------------------
-- Four measured facts rule out every gate shaped like "a run may pass without
-- evidence of modelling and may not RANK without it". They are not re-derived
-- here; each is recorded and each was checked against the code before this file
-- was written:
--
--   1. THE TARGET IS PUBLISHED. `buildPayload` writes `target_mass`, `density`
--      and `tolerance_pct` into `challenges.prompt`; `prompt` is in the column
--      SELECT grant to `authenticated` (0004) and both Speedrun routes ship it
--      whole. `targetVolumeFromMass` in `src/lib/gauntlet.ts` reconstructs the
--      ranked comparison value from it, in the browser, today. A forgery needs
--      no search at all, so nothing that bounds a search contains it.
--   2. THE VBA MACROS RANK AND EMIT NOTHING. `idea-gauntlet-submit.bas` posts to
--      `gauntlet_macro_submit`, which writes `source = 'macro'` -- the exact
--      predicate `gauntlet_leaderboard` ranks on (0146) -- and no `.bas` file
--      names `gauntlet_run_events_insert` anywhere. `/gauntlet/tools` still
--      offers them as a first-class choice ("Good if you cannot register a COM
--      add-in"). A trail requirement would unrank that entire documented path.
--   3. ROOM RUNS CANNOT EMIT TELEMETRY, BY CONSTRUCTION. Room racers never run
--      the Start macro, so their token holds no `run_id` (0016), and
--      `gauntlet_run_events_insert` drops any batch whose token `run_id` is
--      null. Room submits still carry `source = 'macro'` and still rank.
--   4. A TRAIL IS EXACTLY AS FORGEABLE AS THE SUBMIT IT WOULD CORROBORATE.
--      `gauntlet_run_events_insert` is granted to `anon`, takes the code the
--      forger already holds, and validates NOTHING else: no event-type
--      whitelist, no count cap, no monotonic `seq` or `t_ms`, no relation to the
--      token's `started_at`. One extra POST buys any trail you like.
--
-- So a gate would refuse honest students on two documented paths in order to
-- impose one additional HTTP request on a forger. What is left that is worth
-- building is the thing a person reads.
--
-- ---------------------------------------------------------------------------
-- CRYING WOLF IS THE FAILURE MODE, NOT MISSING A FORGERY
-- ---------------------------------------------------------------------------
-- A report that lists a fast honest student teaches its reader to skim past it,
-- and then it catches nothing. Three structural choices follow from that, and
-- they are the ones to preserve if this file is ever edited:
--
--   * THERE IS NO SCORE. No column ranks runs by suspicion, no column counts
--     observations, and the ordering is `challenge, newest first` -- not
--     `most anomalous first`. A teacher deciding what a fast run means is the
--     point of the surface; sorting by a number the database invented would
--     make that decision for them and hide the evidence behind it.
--   * OBSERVATIONS NAME WHAT WAS SEEN, NEVER WHAT IT MEANS. `fast_finish` says
--     the elapsed time is under a floor a caller chose. It does not say the run
--     is fake, and there is no vocabulary in this file that does.
--   * FACTS ARE COLUMNS; ONLY FOUR THINGS LIST A RUN. Everything a reader needs
--     for context -- `failed_attempts`, `feature_add_count`, `par_time_s`,
--     `board_rank`, the whole telemetry census -- is returned on every row and
--     lists nothing. A candidate that fires on the ordinary case is a column
--     here, not an observation. See "WHAT IS DELIBERATELY NOT AN OBSERVATION".
--
-- ---------------------------------------------------------------------------
-- THE FOUR OBSERVATIONS, AND WHAT AN HONEST RUN WOULD HAVE TO DO TO TRIP EACH
-- ---------------------------------------------------------------------------
-- `fast_finish`
--     Elapsed is under `p_fast_finish_seconds` (default 30). An honest run
--     would have to read the revealed drawing, model the part and submit inside
--     half a minute. It also fires on the one cheat 0061 records as unfixable
--     in SQL -- model the part first, THEN press Start and submit -- which is a
--     thing a teacher should see, and which no elapsed floor can distinguish
--     from a very fast honest run. That is the whole reason this is a report.
--     Expected honest rate at 30s: essentially zero.
--
-- `submit_volume_unseen`
--     Telemetry is present, at least one snapshot was recorded, THIS WAS THE
--     FIRST SUBMIT ON THE RUN (`failed_attempts` = 0), and no snapshot's volume
--     is within `c_volume_tol_pct` of the volume that was submitted. The trail
--     does not contain the part that was handed in.
--     THE `failed_attempts = 0` GATE IS LOAD-BEARING AND IS NOT TIDINESS. The
--     add-in's `TelemetryRecorder.Stop()` runs on EVERY submit, passing or not,
--     and sets `active = false`; only pressing Start Run again revives it, with
--     a fresh `run_id`. So on the ordinary, 0061-sanctioned workflow -- submit,
--     fail, fix the geometry, submit again -- the passing volume is modelled
--     AFTER telemetry went quiet and legitimately appears in no snapshot. An
--     ungated version of this observation would fire on that honest loop every
--     time. Gated, an honest run trips it only by finishing its last
--     volume-changing edit inside the pane's 2s refresh and submitting before
--     the next tick.
--
-- `clock_exceeds_run`
--     The add-in's own `Stopwatch` (`t_ms`, which starts AFTER
--     `gauntlet_macro_start` returns) claims more elapsed time than the
--     server-stamped clock allowed, by more than `c_clock_grace_ms`. The two
--     measure the same interval and the client's can only be the shorter one,
--     so an honest run cannot trip this at all; it takes a fabricated `t_ms`.
--
-- `events_before_start` / `events_after_submit`
--     `gauntlet_run_events.created_at` is `default now()` -- server-stamped, not
--     client-supplied -- so it is the one part of a trail a caller cannot
--     choose. Events that arrived before the run's own start, or more than
--     `c_arrival_grace` after the submit that ranked, describe a trail written
--     outside the window it claims to cover. The add-in buffers and flushes,
--     with a final flush issued at submit, so a generous grace covers a slow
--     network; honest rate is zero either side.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT AN OBSERVATION
-- ---------------------------------------------------------------------------
-- `failed_attempts = 0` ON ITS OWN. "A first submit that passes exactly" is
--     what a prepared student does. It is returned as a column on every row and
--     lists nothing by itself; its only role is gating `submit_volume_unseen`
--     above, where it means "telemetry was live for the whole of this run".
--
-- A FEATURE COUNT THAT NEVER MOVES. Returned as `feature_add_count` and
--     `distinct_feature_counts`, never as an observation, for two independent
--     reasons that each make it noise. Native SOLIDWORKS event binding is
--     best-effort -- `TelemetryRecorder.WireEvents` swallows its own failure
--     with the comment "native events unavailable: snapshots still cover it" --
--     so zero `feature_add` is also what a normal run on an unlucky install
--     looks like. And editing the dimensions of existing features changes
--     volume repeatedly without adding any, which is most of what modelling to
--     a target actually is. A reader can see both numbers and weigh them; the
--     database should not pretend to.
--
-- TELEMETRY BEING ABSENT, unless `p_include_absent` is passed. This is the
--     signal the prompt for this work called the whole difficulty, and it is
--     off by default because facts 2 and 3 above make it unusable as a default:
--     a room run has no telemetry by construction, a VBA macro run has none by
--     design, and NOTHING IN THE SUBMITTED ROW DISTINGUISHES A VBA SUBMIT FROM
--     AN ADD-IN SUBMIT. Both post the same argument set -- checked, not assumed:
--     `idea-gauntlet-submit.bas` sends code / run_id / volume / area /
--     feature_count / unit_system, and `GauntletClient.SubmitAsync` sends the
--     same plus `p_material`, which is null unless the off-by-default advisory
--     is on. So `telemetry = 'absent'` means "the VBA path, or an add-in run
--     whose best-effort flush did not land", and on a board whose rows predate
--     the add-in it means it about nearly every row. It is available to an admin
--     who already knows their class is on the add-in, as a deliberate
--     parameter, and it is never on by accident.
--
-- ---------------------------------------------------------------------------
-- WHAT `telemetry` MEANS, WHICH IS FOUR ANSWERS AND NOT TWO
-- ---------------------------------------------------------------------------
--   'room'     - the run carries a room_id. Telemetry is impossible (fact 3).
--   'unlinked' - solo, but the row carries no `run_id`, so no trail can be
--                joined to it. This is every ranked row written before 0016
--                added `run_id`, and it is a property of the RECORD rather than
--                of the run.
--   'absent'   - a `run_id` is present and no events exist under it. Expected on
--                the VBA path; see above.
--   'present'  - events exist, and the four observations become computable.
-- Only 'present' can produce a disagreement, so three quarters of this
-- vocabulary exists to say "there was nothing here to check", which is the
-- sentence a reader most needs and the one a boolean cannot give them.
--
-- ---------------------------------------------------------------------------
-- ADMIN ONLY, IN SQL
-- ---------------------------------------------------------------------------
-- This function reads OTHER STUDENTS' runs and joins their names, which is
-- exactly the shape 0060 found leaking a room roster for two months. The gate
-- is `public.is_admin()` evaluated inside the body, in the `bounds` CTE that
-- every population below reads, so a non-admin's answer is an EMPTY SET rather
-- than an error -- an empty set is also what "nothing to review" looks like, so
-- the function's existence discloses nothing about whether there is a review
-- lane. The `authenticated` grant is what lets an admin call it at all; the
-- admin check is not the grant, exactly as in `gauntlet_practice_pressure`
-- (0151).
--
-- IT PROJECTS NO EMAIL. `user_id` plus the student's chosen name
-- (`display_name`, else `full_name`), because a column that reaches a console
-- reaches an export, a paste and a screenshot. An admin holding a `user_id` can
-- read `profiles` already.
--
-- IT IS A `security definer` FUNCTION AND NOT A VIEW, on purpose. A view cannot
-- carry RLS, would have to be owner-privileged to join `profiles` and
-- `submissions` past their own policies, and would then need 0060's explicit
-- row predicate written into it -- and the predicate here is `is_admin()`, which
-- is a whole-relation gate rather than a row one. A function makes the gate a
-- statement rather than a predicate somebody has to keep re-deriving, and it
-- takes the caller's parameters without a `where` clause the caller writes.
--
-- ---------------------------------------------------------------------------
-- GRANTS, IDEMPOTENCE, ORDERING
-- ---------------------------------------------------------------------------
-- `create or replace` under this project's default privileges hands a new
-- function a fresh `anon` grant (the 0137 rule), so both functions below revoke
-- from every role BY NAME and grant back only what should hold them. Section 4
-- reads the result out of the catalog rather than trusting its own guard.
--
-- NO DEPLOY ORDERING. Nothing existing is redefined: this file adds two new
-- functions and one index and touches no RPC, no view, no policy and no column.
-- The migration and the app are independent events and either may go first --
-- the new admin surface degrades to an empty list on a `PGRST202` if it ships
-- first, and the function simply has no caller if it is applied first.
--
-- WHAT UNDOES THIS FILE:
--   drop function public.gauntlet_run_review(uuid, integer, integer, boolean, boolean, integer);
--   drop function public._gauntlet_juuid(jsonb, text);
--   drop index if exists public.submissions_ranked_speedrun_idx;
-- Nothing else refers to any of them and no data is written, so a rollback
-- strands nothing.
--
-- Apply manually in the Supabase SQL editor, after 0151. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Reading a uuid out of jsonb without being able to raise.
--
--    The deliberate mirror of `gauntlet_jnum` (0009), which this file reuses for
--    every NUMERIC read rather than writing a second one. `value ->> 'run_id'`
--    is written by `gauntlet_macro_submit` from a uuid variable and so is always
--    a uuid or null -- but this function reads a table of historical rows nobody
--    can inspect from here, and a single malformed value would take the whole
--    report down rather than one row. Failing to null is the honest answer: a
--    row whose run_id cannot be read is reported as 'unlinked', which is what it
--    is.
--
--    No grant: called only from the definer body below, which runs as owner.
-- ---------------------------------------------------------------------------

create or replace function public._gauntlet_juuid(p jsonb, k text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
	return nullif(p ->> k, '')::uuid;
exception when others then
	return null;
end;
$$;

comment on function public._gauntlet_juuid(jsonb, text) is
	'jsonb -> uuid, null on anything unparseable. The uuid twin of gauntlet_jnum (0152).';

revoke all on function public._gauntlet_juuid(jsonb, text)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The index the report reads through.
--
--    Its predicate IS the ranked Speedrun population, and it is the same triple
--    `gauntlet_leaderboard` ranks on (0146): every ranked modeling submit writes
--    `source = 'macro'` (0016, 0061, 0147), and the board admits
--    `is_correct = true and source = 'macro' and mode = 'speedrun'`. Written
--    this way so the report cannot drift into reviewing a population the board
--    does not rank.
-- ---------------------------------------------------------------------------

create index if not exists submissions_ranked_speedrun_idx
	on public.submissions (challenge_id, created_at desc)
	where mode = 'speedrun' and source = 'macro' and is_correct = true;

-- ---------------------------------------------------------------------------
-- 3. The report.
-- ---------------------------------------------------------------------------

create or replace function public.gauntlet_run_review(
	p_challenge_id uuid default null,
	p_since_hours integer default 720,
	p_fast_finish_seconds integer default 30,
	p_include_absent boolean default false,
	p_observed_only boolean default true,
	p_limit integer default 200
)
returns table (
	submission_id uuid,
	challenge_id uuid,
	challenge_title text,
	user_id uuid,
	player text,
	started_at timestamptz,
	submitted_at timestamptz,
	elapsed_ms bigint,
	par_time_s integer,
	board_rank integer,
	failed_attempts integer,
	submitted_volume_mm3 numeric,
	telemetry text,
	event_count bigint,
	snapshot_count bigint,
	feature_add_count bigint,
	distinct_feature_counts bigint,
	last_snapshot_volume_mm3 numeric,
	telemetry_span_ms bigint,
	first_event_at timestamptz,
	last_event_at timestamptz,
	observations text[]
)
language sql
security definer
stable
set search_path = ''
as $$
	with bounds as (
		select
			-- THE GATE. Every population below reads this, so a non-admin's
			-- answer is an empty set rather than an error.
			public.is_admin() as ok,
			now() - make_interval(hours => greatest(coalesce(p_since_hours, 720), 1)) as since,
			greatest(coalesce(p_fast_finish_seconds, 30), 0)::bigint * 1000 as fast_ms,
			-- A trail is buffered in the add-in and flushed periodically, with a
			-- final flush issued at submit over a network nobody controls. Two
			-- minutes either side of the server-stamped run window is slack for
			-- that, and is still four orders of magnitude short of "posted
			-- later".
			interval '2 minutes' as arrival_grace,
			-- t_ms starts AFTER gauntlet_macro_start returns, so it is
			-- structurally the shorter of the two clocks. The grace covers the
			-- flush ordering at submit and nothing else.
			2000::bigint as clock_grace_ms,
			-- The pane snapshots on a volume change of more than 0.001 mm3 at a
			-- 2s cadence and the submit reads the same PartReader value, so a
			-- matching snapshot is normally exact. One percent is slack for the
			-- student who submits within a tick of their last edit.
			1.0::numeric as volume_tol_pct
	),
	ranked as (
		select
			s.id as submission_id,
			s.challenge_id,
			s.user_id,
			s.room_id,
			s.created_at as submitted_at,
			public.gauntlet_jnum(s.value, 'elapsed_ms')::bigint as elapsed_ms,
			public.gauntlet_jnum(s.value, 'volume_mm3') as submitted_volume_mm3,
			public.gauntlet_jnum(s.value, 'failed_attempts')::integer as failed_attempts,
			public._gauntlet_juuid(s.value, 'run_id') as run_id
		from public.submissions s, bounds b
		where b.ok
			and s.mode = 'speedrun'
			and s.source = 'macro'
			and s.is_correct = true
			and s.created_at >= b.since
			and (p_challenge_id is null or s.challenge_id = p_challenge_id)
	),
	ev as (
		-- One aggregate per REVIEWED SUBMISSION, not per run: a solo run may be
		-- submitted more than once against one run_id (0016), and each passing
		-- submit is a row somebody may want to read.
		select
			r.submission_id,
			count(*) as event_count,
			count(*) filter (where e.event_type = 'snapshot') as snapshot_count,
			count(*) filter (where e.event_type = 'feature_add') as feature_add_count,
			count(distinct public.gauntlet_jnum(e.payload, 'feature_count'))
				filter (where e.event_type = 'snapshot') as distinct_feature_counts,
			max(e.t_ms) as telemetry_span_ms,
			min(e.created_at) as first_event_at,
			max(e.created_at) as last_event_at,
			(array_agg(public.gauntlet_jnum(e.payload, 'volume_mm3') order by e.seq desc)
				filter (where e.event_type = 'snapshot'))[1] as last_snapshot_volume_mm3,
			-- ANY snapshot, not merely the last one. Keyed on the last, a student
			-- whose final edit landed inside one refresh tick would read as a
			-- disagreement; keyed on any, the trail either contains the part that
			-- was handed in or it does not.
			bool_or(
				e.event_type = 'snapshot'
				and r.submitted_volume_mm3 is not null
				and r.submitted_volume_mm3 <> 0
				and public.gauntlet_jnum(e.payload, 'volume_mm3') is not null
				and abs(public.gauntlet_jnum(e.payload, 'volume_mm3') - r.submitted_volume_mm3)
					<= abs(r.submitted_volume_mm3) * b.volume_tol_pct / 100.0
			) as submit_volume_seen
		from ranked r
		join public.gauntlet_run_events e on e.run_id = r.run_id
		cross join bounds b
		group by r.submission_id
	),
	shaped as (
		select
			r.*,
			-- started_at is DERIVED rather than joined from gauntlet_run_tokens,
			-- and that is the more accurate of the two. Both values are stamped
			-- inside one transaction of gauntlet_macro_submit, where now() is
			-- constant: elapsed_ms IS created_at - started_at, exactly. The token
			-- would give the wrong answer for any run whose code was re-Started
			-- afterwards, because a restart overwrites run_id and started_at in
			-- place, and no answer at all once the token has expired away.
			r.submitted_at - make_interval(secs => coalesce(r.elapsed_ms, 0) / 1000.0) as started_at,
			case
				when r.room_id is not null then 'room'
				when r.run_id is null then 'unlinked'
				when coalesce(e.event_count, 0) = 0 then 'absent'
				else 'present'
			end as telemetry,
			coalesce(e.event_count, 0) as event_count,
			coalesce(e.snapshot_count, 0) as snapshot_count,
			coalesce(e.feature_add_count, 0) as feature_add_count,
			coalesce(e.distinct_feature_counts, 0) as distinct_feature_counts,
			e.last_snapshot_volume_mm3,
			e.telemetry_span_ms,
			e.first_event_at,
			e.last_event_at,
			e.submit_volume_seen
		from ranked r
		left join ev e on e.submission_id = r.submission_id
	),
	observed as (
		select
			s.*,
			array_remove(array[
				case when s.elapsed_ms is not null and s.elapsed_ms < b.fast_ms
					then 'fast_finish' end,
				case when s.telemetry = 'present'
					and coalesce(s.failed_attempts, 0) = 0
					and s.snapshot_count > 0
					and s.submit_volume_seen is not true
					then 'submit_volume_unseen' end,
				case when s.telemetry = 'present'
					and s.telemetry_span_ms is not null
					and s.elapsed_ms is not null
					and s.telemetry_span_ms > s.elapsed_ms + b.clock_grace_ms
					then 'clock_exceeds_run' end,
				case when s.telemetry = 'present'
					and s.first_event_at is not null
					and s.first_event_at < s.started_at - b.arrival_grace
					then 'events_before_start' end,
				case when s.telemetry = 'present'
					and s.last_event_at is not null
					and s.last_event_at > s.submitted_at + b.arrival_grace
					then 'events_after_submit' end,
				case when coalesce(p_include_absent, false) and s.telemetry = 'absent'
					then 'telemetry_absent' end
			], null) as observations
		from shaped s
		cross join bounds b
	)
	select
		o.submission_id,
		o.challenge_id,
		ch.title as challenge_title,
		o.user_id,
		-- The chosen name, never the address (0151's rule, and 0004's).
		coalesce(
			nullif(btrim(pr.display_name), ''),
			nullif(btrim(pr.full_name), '')
		) as player,
		o.started_at,
		o.submitted_at,
		o.elapsed_ms,
		public.gauntlet_jnum(ch.prompt, 'par_time')::integer as par_time_s,
		-- Context, not a judgement: what this student currently holds on this
		-- challenge's board. A 0.4 second run at rank 1 and the same run at rank
		-- 30 are different things to a reader.
		(
			select gl.rank
			from public.gauntlet_leaderboard gl
			where gl.challenge_id = o.challenge_id and gl.user_id = o.user_id
		)::integer as board_rank,
		o.failed_attempts,
		o.submitted_volume_mm3,
		o.telemetry,
		o.event_count,
		o.snapshot_count,
		o.feature_add_count,
		o.distinct_feature_counts,
		o.last_snapshot_volume_mm3,
		o.telemetry_span_ms,
		o.first_event_at,
		o.last_event_at,
		o.observations
	from observed o
	left join public.profiles pr on pr.id = o.user_id
	left join public.challenges ch on ch.id = o.challenge_id
	-- NEWEST FIRST, WITHIN A CHALLENGE. Deliberately not "most observations
	-- first": an ordering by anomaly count is a suspicion score wearing a sort,
	-- and it would separate a flagged run from the ordinary runs beside it,
	-- which are the context that says whether it is unusual at all.
	where coalesce(p_observed_only, true) is not true
		or cardinality(o.observations) > 0
	order by ch.title asc nulls last, o.submitted_at desc, o.submission_id
	limit greatest(coalesce(p_limit, 200), 1);
$$;

comment on function public.gauntlet_run_review(uuid, integer, integer, boolean, boolean, integer) is
	'Admin-only review of ranked Speedrun runs: facts and named observations, newest first per challenge. Ranks nobody and refuses nothing (0152).';

revoke all on function public.gauntlet_run_review(uuid, integer, integer, boolean, boolean, integer)
	from public, anon, authenticated, service_role;
-- An admin is `authenticated` like everybody else; the gate is `is_admin()`
-- inside the body, and a non-admin's answer is an empty set.
grant execute on function public.gauntlet_run_review(uuid, integer, integer, boolean, boolean, integer)
	to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Self-check: read the end state out of the catalog rather than trusting the
--    statements above. A migration's own guard passing tells you the guard ran;
--    has_function_privilege tells you what is actually granted.
-- ---------------------------------------------------------------------------

do $$
declare
	c_review constant text :=
		'public.gauntlet_run_review(uuid, integer, integer, boolean, boolean, integer)';
	c_juuid constant text := 'public._gauntlet_juuid(jsonb, text)';
	v_problems text[] := '{}';
begin
	if not has_function_privilege('authenticated', c_review, 'execute') then
		v_problems := v_problems || 'authenticated cannot execute gauntlet_run_review';
	end if;
	if has_function_privilege('anon', c_review, 'execute') then
		v_problems := v_problems || 'anon CAN execute gauntlet_run_review';
	end if;
	if has_function_privilege('anon', c_juuid, 'execute')
		or has_function_privilege('authenticated', c_juuid, 'execute') then
		v_problems := v_problems || '_gauntlet_juuid is reachable by a client role';
	end if;
	-- The population must be the one the board ranks. A report over a wider set
	-- would put unranked runs in front of a reader as if they counted.
	if not exists (
		select 1 from pg_indexes
		where schemaname = 'public' and indexname = 'submissions_ranked_speedrun_idx'
	) then
		v_problems := v_problems || 'submissions_ranked_speedrun_idx is missing';
	end if;
	if array_length(v_problems, 1) is not null then
		raise exception E'0152 did not reach its intended end state:\n  %',
			array_to_string(v_problems, E'\n  ');
	end if;
	raise notice '0152: gauntlet_run_review granted to authenticated only; admin gate is is_admin() inside the body.';
end;
$$;
