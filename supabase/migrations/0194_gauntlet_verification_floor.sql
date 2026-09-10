-- 0194_gauntlet_verification_floor.sql
-- IDEA // GAUNTLET: the plausibility floor becomes a number Mr. Pina owns, and
-- a run under it is HELD IN VIEW rather than dropped out of it.
--
-- This modifies `0154`'s argument. It does not remove it. Read `0154`'s header
-- before this one -- everything it says about what a floor buys and what it
-- cannot buy is still true, and none of it is reopened here.
--
-- ===========================================================================
-- WHAT MR. PINA DECIDED, AND WHY THIS FILE HAS THREE PARTS RATHER THAN ONE.
-- ===========================================================================
-- `docs/decisions/entries/19-gauntlet-sub-floor-run-disposition.md` was raised
-- with the second half open. He answered it on 2026-09-09:
--
--   "Runners must be able to submit legitimate times under 30 seconds. That
--    artificial cap is nonsense or at the very least I should have control over
--    that cutoff time and the run submitter should have a status for a low time
--    submitted run for verification."
--
-- Three things, and each is a section below:
--
--   1. KEEP the floor. It is not removed, weakened or made advisory.
--   2. The cutoff is HIS, changeable without a migration. Section 1.
--   3. A sub-floor run carries a STATUS rather than being silently unranked.
--      Sections 2 and 3.
--
-- ===========================================================================
-- THE PROPERTY THIS FILE MUST NOT BREAK, AND HOW IT IS NOW KEPT.
-- ===========================================================================
-- `0154` chose 30 seconds because that is `0152`'s own
-- `gauntlet_run_review.p_fast_finish_seconds` default, so that EVERY RUN THE
-- BOARD REFUSES IS A RUN THE REVIEW CONSOLE ALREADY REPORTS. It enforced that
-- with a `do $chk$` block reading the console's signature out of `pg_proc` and
-- RAISING when the console's threshold was the lower of the two, because a gap
-- between them is exactly a band of runs that lose a seat and are never
-- reported by anyone.
--
-- A NUMBER IN A FORM CANNOT BE CHECKED AT APPLY TIME. Decision 19 names this
-- precisely: "If the floor moves into a settings row, that assertion has to
-- move with it and become a runtime check rather than an apply-time one --
-- otherwise a number he lowers in a form silently reopens the hole the
-- assertion was written to close." So the pin moves, and it moves to something
-- stronger than an equality between two numbers that could drift:
--
--   * THE BOARD no longer drops the run at all. A held run is ON the board,
--     carrying `rank_state = 'pending_verification'` and a NULL `rank`. There
--     is no longer a state in which a run is absent from the board, so the
--     first half of the failure mode is closed STRUCTURALLY rather than by an
--     assertion. Nothing has to stay equal to anything for it to hold.
--
--   * THE CONSOLE emits a new observation, `pending_verification`, computed
--     from THE SAME SETTINGS ROW THE BOARD READS, and NOT from
--     `p_fast_finish_seconds`. It is therefore unconditional: a teacher who
--     narrows the "Quick finish under (seconds)" box to 5 narrows
--     `fast_finish` for their own purposes and cannot narrow this, so
--     `p_observed_only` can never filter a held run off the console.
--
-- Those two together are the whole of `0154`'s promise, kept at runtime by
-- construction rather than by two literals agreeing. **If a run could vanish
-- from both the board and the review console, this change would be wrong.**
-- After this file there is no floor value, including zero and including a
-- value changed while a run is in flight, at which a run is on neither.
--
-- `p_fast_finish_seconds` KEEPS ITS MEANING AND ITS DEFAULT. `0152`'s form
-- labels it "Your floor, not a rule about the part", and decision 19 notes it
-- is a per-REQUEST parameter rather than a stored setting. That stays true --
-- it is a teacher's own lens over the report and it is not the board's floor.
-- The two questions are now answered by two different observations instead of
-- by one number doing both jobs badly. The SIGNATURE IS UNCHANGED (same six
-- parameters, same types, same defaults), so this is a `create or replace`
-- with no signature trap, no drop, and no deploy ordering: the running client
-- calls it exactly as it does today.
--
-- ===========================================================================
-- WHY A STATUS RATHER THAN THE TWO ALTERNATIVES.
-- ===========================================================================
-- Recorded in full in decision 19; the short form, because this is the file
-- somebody will read in a year:
--
--   * Against SILENT UNRANKING (the status quo, `0154`'s shape): it is
--     indistinguishable from a bug, and the student it is most unfair to is
--     the honest fast one. Measured today, the student is told NOTHING: the
--     Speedrun result card renders its rank sentence only when the run both
--     passed AND has a board row, and a sub-floor run passes with no board
--     row, so neither branch renders and the card reads "Pass, verified" over
--     a table the student is missing from.
--   * Against REFUSING THE SUBMIT: it hands the forger the threshold loudly,
--     and throws away the `submissions` row that is the evidence a teacher
--     wants.
--   * FOR A HELD STATE: it says something true without saying the number.
--     "Held for a teacher to check" names no threshold; a forger learns a
--     limit exists, which they learn from an empty board anyway. And it gives
--     the review console something to be a QUEUE OF, which is what gets that
--     page linked at all -- nothing in `src/` links to `/gauntlet/run-review`
--     today.
--
-- THE HONEST COUNTER, kept because decision 19 calls it the strongest one: a
-- held state is a public mark on a public board, and most runs it catches will
-- be the case `0152` says no elapsed floor can tell from a very fast honest
-- run. That is the trade he made, with that sentence in front of him.
--
-- ===========================================================================
-- THE NUMBER IS NOT PUBLISHED, AND THAT IS WHAT THE GRANTS ARE FOR.
-- ===========================================================================
-- `gauntlet_rank_settings` has NO grant to `anon` or `authenticated` and no
-- select policy for them. A student cannot read the floor through PostgREST,
-- through an RPC, or off any payload: the board projects a STATE, never a
-- threshold, and the sentence the student reads names no seconds. The view
-- reaches the row because it is owner-privileged (NOT `security_invoker`,
-- `0060` section 3's posture, unchanged here), so the read happens as the view
-- owner and needs no grant at all. The console reaches it the same way, from
-- inside a SECURITY DEFINER function already gated on `is_admin()`.
--
-- A function returning the number IS provided -- `gauntlet_rank_settings_get`
-- -- and it is admin-only, because the review console has to show him the
-- number he is editing.
--
-- ===========================================================================
-- WHAT MOVES ON SCREEN.
-- ===========================================================================
--   * ROWS COME BACK. Every run `0154` removed for being under the floor
--     returns to the board as a held row. Section 4 counts them at apply time,
--     per challenge, so the size of that is visible before it happens.
--   * A HELD ROW HOLDS NO SEAT. Its `rank` is NULL, so it is not ranked, does
--     not displace anybody, and does not renumber the board.
--   * THE PUBLISHED RECORD IS UNAFFECTED, and this is worth stating because it
--     is the most visible seat on the site. `gauntlet_leaderboards()` (`0024`,
--     last written by `0038`) joins this view `on ... and rec.rank = 1`. NULL
--     `= 1` is NULL, not true, so a held row can never become a per-drawing
--     record. No change to that function, and none needed.
--   * "REMOVES THE RUN, NOT THE PLAYER" IS PRESERVED, and is now stronger than
--     it was. `0154` relied on the `distinct on` picking from rows that passed
--     the WHERE. The WHERE no longer excludes a sub-floor row, so the
--     preference is stated in the `distinct on`'s own ORDER BY instead: a
--     `ranked` row sorts ahead of a held one for the same (player, challenge).
--     A student holding both a sub-floor run and an honest one is represented
--     by the honest one and is ranked normally -- exactly as before.
--   * A ROW WITH NO `elapsed_ms` AT ALL IS HELD, NOT DROPPED. `0154` excluded
--     it (`NULL >= 30000` is NULL) and called that fail-closed, which it was.
--     Held is the same refusal to rank plus a teacher seeing it, which is
--     strictly better and is the one shape this file exists to produce. This
--     holds AT EVERY FLOOR VALUE INCLUDING ZERO: a floor of 0 holds nothing on
--     the clock and still holds a row whose clock is missing.
--   * NOTHING ABOUT PASSING, RECORDING OR THE BAND MOVES. `gauntlet_macro_submit`
--     is untouched, exactly as in `0154`.
--   * `gauntlet_room_board` (`0010`) still has no floor and is still out of
--     scope. `0154` named that as open; it stays open and is a third question.
--
-- Apply manually in the Supabase SQL editor. Idempotent: re-pasting is a no-op
-- and re-prints the same counts. Reverting is section 6.

-- ---------------------------------------------------------------------------
-- SECTION 1. The setting.
--
-- A singleton, shaped exactly like `gauntlet_speedrun_ruleset` (`0015`): a
-- boolean primary key pinned to true, a seeded default that a re-apply never
-- overwrites, and the `0004` touch trigger. Decision 19 names that table as the
-- precedent, and `0155` declined to widen it to the author tier on the grounds
-- that "editing it is a site-wide settings change, not authoring a challenge".
-- That argument is the same one here, so this is ADMIN, not the author tier.
--
-- WHAT IT DOES NOT COPY FROM `0015` IS THE GRANTS. The ruleset is read by every
-- student because it is printed beside every drawing. This number is a forgery
-- control and is read by nobody but the two definer paths below.
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_rank_settings (
	id boolean primary key default true check (id),
	-- Milliseconds. A Speedrun run whose server-stamped clock is under this is
	-- held for verification rather than ranked. The column is the ONE place the
	-- number lives: the view reads it, the console reads it, and there is no
	-- second literal anywhere for the two to drift apart from.
	speedrun_floor_ms integer not null default 30000
		check (speedrun_floor_ms >= 0 and speedrun_floor_ms <= 600000),
	updated_at timestamptz not null default now()
);

comment on table public.gauntlet_rank_settings is
	'Singleton. The GAUNTLET board settings an admin owns; today, the Speedrun plausibility floor (0194). Not readable by students: the board shows a state, never a threshold.';
comment on column public.gauntlet_rank_settings.speedrun_floor_ms is
	'Milliseconds. A macro Speedrun run under this clock is held (rank_state = pending_verification, rank NULL) rather than ranked. 0 holds nothing on the clock; a run with no elapsed_ms is held at every value.';

-- Seeded with 0154's own number, so applying this file alone changes no
-- outcome for any run: it changes only where the number lives and what happens
-- to the runs under it. Never overwrites an edit.
insert into public.gauntlet_rank_settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists gauntlet_rank_settings_touch_updated_at on public.gauntlet_rank_settings;
create trigger gauntlet_rank_settings_touch_updated_at
	before update on public.gauntlet_rank_settings
	for each row execute function public.touch_updated_at();

alter table public.gauntlet_rank_settings enable row level security;

-- ZERO client grants, per CLAUDE.md's write-path rule and the disclosure
-- argument in this file's header. No select, no update, no policy for anon or
-- authenticated. `service_role` is not granted either: nothing server-side
-- reads this outside the database. The roles are NAMED rather than revoked
-- `from public`, because on a hosted Supabase project the default privileges
-- write a DIRECT grant to each of these roles at creation time and a
-- `from public` revoke removes only the one PUBLIC entry.
revoke all on public.gauntlet_rank_settings from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- SECTION 2. Reading and writing the setting, admin only.
--
-- A definer pair rather than `0015`'s plain RLS update policy, for two reasons
-- that table does not have: the row must not be READABLE by a student (an RLS
-- select policy plus a select grant is exactly what would publish the
-- threshold), and the write has a bound worth stating in words rather than
-- clamping silently.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_rank_settings_get()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
	select case when public.is_admin() then
		coalesce(
			(select jsonb_build_object(
				'speedrun_floor_ms', s.speedrun_floor_ms,
				'updated_at', s.updated_at
			) from public.gauntlet_rank_settings s where s.id),
			jsonb_build_object('speedrun_floor_ms', 30000, 'updated_at', null)
		)
	end;
$$;

comment on function public.gauntlet_rank_settings_get() is
	'Admin-only read of the GAUNTLET board settings (0194). NULL for everybody else -- the floor is not published to students.';

revoke all on function public.gauntlet_rank_settings_get() from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_rank_settings_get() to authenticated;

create or replace function public.gauntlet_rank_settings_set(p_speedrun_floor_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.gauntlet_rank_settings%rowtype;
begin
	-- Genuine misuse raises; a caller who may not be here is not shown a form.
	if not public.is_admin() then
		raise exception 'Only site admins can change the GAUNTLET board settings.';
	end if;

	-- A number a person typed is REFUSED with its bounds rather than clamped.
	-- Clamping means the form accepts 9999999 and the board quietly runs on
	-- something else, which is how somebody comes to believe a floor is set
	-- that is not.
	if p_speedrun_floor_ms is null then
		return jsonb_build_object('ok', false, 'reason', 'missing',
			'message', 'Enter a floor in milliseconds.');
	end if;
	if p_speedrun_floor_ms < 0 or p_speedrun_floor_ms > 600000 then
		return jsonb_build_object('ok', false, 'reason', 'out_of_range',
			'min_ms', 0, 'max_ms', 600000,
			'message', format('The floor must be between 0 and 600000 ms (0 to 600 seconds). You entered %s.', p_speedrun_floor_ms));
	end if;

	-- The row is seeded by section 1, but a lazy create is written the safe way
	-- regardless: `on conflict do nothing` then RE-READ, never
	-- `insert ... returning ... into`, whose target is NULL when the conflict
	-- fires. Two admins saving at once is the case.
	insert into public.gauntlet_rank_settings (id, speedrun_floor_ms)
	values (true, p_speedrun_floor_ms)
	on conflict (id) do update set speedrun_floor_ms = excluded.speedrun_floor_ms;

	select * into v_row from public.gauntlet_rank_settings where id;

	return jsonb_build_object(
		'ok', true,
		'speedrun_floor_ms', v_row.speedrun_floor_ms,
		'updated_at', v_row.updated_at
	);
end;
$$;

comment on function public.gauntlet_rank_settings_set(integer) is
	'Admin-only write of the Speedrun plausibility floor, in milliseconds (0194). Refuses out of range with the bounds rather than clamping.';

revoke all on function public.gauntlet_rank_settings_set(integer) from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_rank_settings_set(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 3. The board.
--
-- `0154`'s definition with ONE change to what rows enter and ONE column added.
-- The column list order, the joins, the tiebreak, the `where c.published` row
-- predicate and the owner-privileged posture are all unchanged.
--
-- `rank_state` IS APPENDED AFTER `rank`, WHICH IS NOT A STYLE CHOICE.
-- `create or replace view` may add columns only at the END; putting the new
-- one anywhere else fails with "cannot change name of view column". Appending
-- is also what keeps the existing grants, so nothing below has to re-establish
-- them -- the `revoke`/`grant` pair after the view re-asserts `0149`'s end
-- state exactly as `0154` did, for the same reason.
--
-- THE `case` IS WRITTEN ONCE. It is computed in an inner select so the
-- `distinct on`'s ORDER BY can sort on the column rather than on a second copy
-- of the expression -- two spellings of "is this run held" is the duplication
-- that stops matching, and it would stop matching in the direction that quietly
-- ranks a held run.
-- ---------------------------------------------------------------------------
create or replace view public.gauntlet_leaderboard as
select
	best.challenge_id,
	best.mode,
	best.user_id,
	coalesce(p.full_name, 'Player') as player,
	best.is_correct,
	best.score_metric,
	best.created_at,
	-- 0194: a HELD run holds no seat. Partitioning by `rank_state` keeps the
	-- ranked rows' numbering dense and unchanged -- 1..n over the ranked rows
	-- of the challenge, exactly what it was before this file -- and the `case`
	-- nulls the held partition's own numbering rather than publishing it.
	case when best.rank_state = 'ranked' then
		rank() over (
			partition by best.challenge_id, best.rank_state
			order by best.is_correct desc nulls last, best.score_metric asc nulls last, best.tiebreak asc nulls last, best.created_at asc
		)
	end as rank,
	best.rank_state
from (
	select distinct on (cand.user_id, cand.challenge_id)
		cand.user_id,
		cand.challenge_id,
		cand.mode,
		cand.is_correct,
		cand.score_metric,
		cand.created_at,
		cand.tiebreak,
		cand.rank_state
	from (
		select
			s.user_id,
			s.challenge_id,
			s.mode,
			s.is_correct,
			s.score_metric,
			s.created_at,
			(s.value ->> 'elapsed_ms')::numeric as tiebreak,
			-- 0194: THE PLAUSIBILITY FLOOR, WHICH NOW HOLDS RATHER THAN DROPS.
			-- The threshold is read from the settings row, not written here as
			-- a literal; `coalesce` covers the case where section 1's seed was
			-- removed by hand, and covers it with 0154's own number.
			--
			-- A MISSING `elapsed_ms` IS HELD. `0154` refused it (NULL >= 30000
			-- is NULL) and said so; `is null or < floor` is that same refusal
			-- with a teacher able to see the row. Every macro submit since
			-- `0006` writes the key, so such a row is not a legacy shape but a
			-- row nothing in this codebase wrote.
			--
			-- The expression is the tiebreak's, character for character, for
			-- `0154`'s reason: `score_metric` is only the clock for `speedrun`,
			-- so a macro mode admitted later would be floored on a feature
			-- count.
			case
				when s.source = 'macro'
					and s.mode in ('speedrun')
					and (
						(s.value ->> 'elapsed_ms')::numeric is null
						or (s.value ->> 'elapsed_ms')::numeric < f.floor_ms
					)
				then 'pending_verification'
				else 'ranked'
			end as rank_state
		from public.submissions s
		cross join lateral (
			select coalesce(
				(select g.speedrun_floor_ms from public.gauntlet_rank_settings g where g.id),
				30000
			)::numeric as floor_ms
		) f
		-- 0154: A RESULT IS A CORRECT RESULT. `is_correct = true` (not
		-- `is_correct`) so a NULL is refused rather than being asked to be
		-- truthy. Unchanged.
		where s.is_correct = true
			and (
				s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
				-- 0146's allowlist, unchanged and still an allowlist: a macro
				-- mode added later must be admitted by somebody who has decided
				-- its metric is checkable. What 0194 removes from this branch is
				-- ONLY the floor term -- the row now enters and is labelled,
				-- rather than being excluded.
				or (
					s.source = 'macro'
					and s.mode in ('speedrun')
				)
			)
	) cand
	order by cand.user_id, cand.challenge_id,
		-- 0194: A RANKED ROW OUTRANKS A HELD ONE FOR THE SAME PLAYER. This is
		-- where `0154`'s "it removes the run, not the player" now lives: it was
		-- a consequence of the WHERE excluding held rows, and the WHERE no
		-- longer does, so it is stated. Without this term a student's held
		-- 4-second run would represent them on a challenge they also cleared
		-- honestly, and their honest seat would disappear.
		(cand.rank_state = 'ranked') desc,
		cand.is_correct desc nulls last,
		cand.score_metric asc nulls last,
		cand.tiebreak asc nulls last,
		cand.created_at asc
) best
join public.profiles p on p.id = best.user_id
join public.challenges c on c.id = best.challenge_id
where c.published;

comment on view public.gauntlet_leaderboard is
	'The ranked board. Since 0194 a macro Speedrun run under the settings floor is HELD -- rank_state = pending_verification, rank NULL -- rather than dropped, so no run is ever absent from both this view and gauntlet_run_review.';

-- `create or replace view` preserves grants, so this re-asserts `0149`'s end
-- state (roles named, never `from public`) rather than establishing it.
revoke all on public.gauntlet_leaderboard from public, anon, authenticated;
grant select on public.gauntlet_leaderboard to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 4. The console, and the pin.
--
-- `0152`'s function, VERBATIM except for two additions:
--
--   * `bounds` gains `board_floor_ms`, read from the same settings row the view
--     reads.
--   * `observed` gains a `pending_verification` case, computed from
--     `board_floor_ms` and NOT from `p_fast_finish_seconds`.
--
-- THE SIGNATURE IS UNCHANGED -- six parameters, same names, same types, same
-- defaults -- so this is a plain `create or replace` with no drop, no second
-- overload and no deploy ordering. The running client's call is unaffected and
-- the new observation arrives in `observations` whether or not anything has
-- been redeployed.
--
-- WHY THE NEW OBSERVATION IS NOT JUST `fast_finish` WITH A BETTER NUMBER. They
-- answer different questions and `0152`'s own form says so: the box is "your
-- floor, not a rule about the part", a lens a teacher sets for themselves,
-- while this is the board's own decision about a specific run. Folding them
-- together would mean either taking the teacher's lens away or letting the
-- lens hide a held run -- and the second is precisely the hole `0154`'s
-- assertion existed to close, arriving through the query string instead of
-- through a drifted literal.
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
			-- 0194: THE BOARD'S OWN FLOOR, read from the settings row the VIEW
			-- reads. Deliberately NOT `fast_ms` and never to be folded into it:
			-- `fast_ms` is the teacher's own lens over this report and this is the
			-- board's decision about a specific run. Keeping them apart is what
			-- makes a held run reportable no matter what the caller asked for.
			coalesce(
				(select g.speedrun_floor_ms from public.gauntlet_rank_settings g where g.id),
				30000
			)::bigint as board_floor_ms,
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
				-- 0194: THE BOARD HELD THIS RUN. Unconditional on the caller's own
				-- parameters -- it reads `board_floor_ms`, never `fast_ms` -- so
				-- `p_observed_only` cannot filter a held run out of this report and
				-- a narrowed `p_fast_finish_seconds` cannot hide one. This is the
				-- runtime half of the pin `0154` enforced at apply time.
				--
				-- A NULL clock is held, matching the view's own `is null or <` for
				-- the same reason: `0154` refused such a row and this reports it.
				case when s.elapsed_ms is null or s.elapsed_ms < b.board_floor_ms
					then 'pending_verification' end,
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
	'Admin-only review of ranked Speedrun runs: facts and named observations, newest first per challenge. Ranks nobody and refuses nothing (0152). Since 0194 it always emits pending_verification for a run the board held, independent of p_fast_finish_seconds.';

-- The signature did not move, so `create or replace` kept `0152`'s grants.
-- Re-asserted here rather than assumed, for the same reason `0152` asserted
-- them: what a migration's statements say and what `proacl` holds are two
-- different facts.
revoke all on function public.gauntlet_run_review(uuid, integer, integer, boolean, boolean, integer)
	from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_run_review(uuid, integer, integer, boolean, boolean, integer)
	to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 5. The self-check, and what this cost, counted at apply time.
--
-- The structural halves are BEHAVIOURAL where they can be: they ask the view
-- and the function what they now do over whatever is really in `submissions`,
-- not what their text says. Each zero-count is paired with the positive control
-- that tells a real narrowing apart from a query matching nothing at all.
--
-- THE COUNTS ARE PRINTED AND NOTHING IS WRITTEN, keeping `0146`'s and `0154`'s
-- posture: they describe live rows and live students, and what to say to a
-- student whose run has just acquired a visible held state is a decision for
-- the person reading the number.
-- ---------------------------------------------------------------------------
do $chk$
declare
	v_floor_ms      integer;
	v_viewdef       text;
	v_src           text;
	v_bare          text;
	v_arm           text;
	v_returned      integer;
	v_held_rows     bigint;
	v_held_players  bigint;
	v_held_boards   bigint;
	v_ranked_rows   bigint;
	v_held_ranked   bigint;
	v_no_key        bigint;
	v_both          bigint;
	v_fastest_s     numeric;
begin
	-- -----------------------------------------------------------------------
	-- C1. THE SETTING EXISTS AND THE BOARD READS IT, not a literal.
	-- -----------------------------------------------------------------------
	select s.speedrun_floor_ms into v_floor_ms from public.gauntlet_rank_settings s where s.id;
	if v_floor_ms is null then
		raise exception '0194: the gauntlet_rank_settings singleton is missing after section 1 seeded it. Nothing below can be trusted; investigate before re-running.';
	end if;

	select pg_get_viewdef('public.gauntlet_leaderboard'::regclass, true) into v_viewdef;
	if v_viewdef is null or v_viewdef not like '%rank_state%' then
		raise exception '0194: gauntlet_leaderboard has no rank_state column; section 3 did not apply.';
	end if;
	if v_viewdef not like '%gauntlet_rank_settings%' then
		raise exception '0194: gauntlet_leaderboard does not read gauntlet_rank_settings. The floor is still a literal somewhere and the setting is decorative; reconcile before relying on either.';
	end if;

	-- -----------------------------------------------------------------------
	-- C2. THE PIN, AS A RUNTIME PROPERTY.
	--
	-- `0154` asserted an equality between two literals. That assertion is
	-- REPLACED here, not dropped, and by something that cannot drift: the
	-- console's held-run observation must read the SAME settings table the view
	-- reads, and must not be computed from the caller's own parameter.
	--
	-- Read off `prosrc` rather than trusted, and asserted in BOTH directions --
	-- the code is emitted, and it is not emitted from `fast_ms`.
	-- -----------------------------------------------------------------------
	select p.prosrc into v_src
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'gauntlet_run_review';
	if v_src is null then
		raise exception '0194: gauntlet_run_review is missing, so 0152 has not been applied. Apply it first -- this file rewrites its body and is not meant to create it.';
	end if;

	-- THE COMMENTS ARE STRIPPED BEFORE ANY OF THIS IS READ, and that is the
	-- point rather than tidiness -- `tools/gauntlet-doc-check.mjs` carries the
	-- same rule for the same reason. Section 4's own comments NAME `fast_ms`
	-- and `pending_verification` in the course of explaining why they must not
	-- be the same thing, so a check reading the raw source would both certify a
	-- comment-only mention and refuse the correct code for talking about it.
	-- The first draft of this block did exactly the second.
	v_bare := regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g');

	if v_bare not like '%pending_verification%' then
		raise exception '0194: gauntlet_run_review does not emit pending_verification. Section 4 did not apply, and a run the board holds would be reported by nobody -- which is the one outcome this file exists to prevent.';
	end if;
	if v_bare not like '%gauntlet_rank_settings%' then
		raise exception '0194: gauntlet_run_review does not read gauntlet_rank_settings. The console and the board would be deciding "held" from two different numbers.';
	end if;

	-- The observation's OWN predicate, bounded by the array-element separator
	-- it sits between, so this reads that one arm and not the block around it.
	v_arm := substring(v_bare from '([^,\[]*)then ''pending_verification''');
	if v_arm is null then
		raise exception '0194: could not read the pending_verification arm out of gauntlet_run_review. Reconcile by hand -- an unreadable check is not a passing one.';
	end if;
	if v_arm not like '%board_floor_ms%' then
		raise exception '0194: the pending_verification arm does not read board_floor_ms. It is computing "held" from something other than the board''s own floor.';
	end if;
	if v_arm like '%fast_ms%' then
		raise exception '0194: the pending_verification arm reads fast_ms, which is the CALLER''S own lens. p_observed_only plus a narrowed p_fast_finish_seconds would then hide a held run, which is the hole 0154''s assertion existed to close. Use board_floor_ms.';
	end if;

	-- Behavioural: the report really answers for a run under the floor. Count
	-- the runs the board is holding, then count how many of them the console
	-- reports at its NARROWEST setting -- a zero-second lens, which switches
	-- `fast_finish` off entirely and is the exact configuration that would have
	-- hidden them before this file.
	select count(*) into v_held_rows
		from public.gauntlet_leaderboard gl
		where gl.rank_state = 'pending_verification';

	if public.is_admin() then
		select count(*) into v_returned
			from public.gauntlet_run_review(null, 8760, 0, false, true, 1000) rr
			where 'pending_verification' = any(rr.observations);
		raise notice '0194 PIN (behavioural): the console reports % held run(s) at a zero-second lens over the last year. The board is holding % row(s) in total (a board row is one per player per challenge; a report row is one per submission, and the look-back is bounded, so these need not be equal).',
			v_returned, v_held_rows;
		if v_held_rows > 0 and v_returned = 0 then
			raise exception '0194: the board is holding % row(s) and the console reports none of them. The pin is broken -- do not rely on this apply.', v_held_rows;
		end if;
	else
		-- The check block does not run as an admin in every environment, and
		-- `gauntlet_run_review` answers an empty set rather than an error to
		-- anyone else -- so a zero here would be the gate, not the pin, and
		-- must not be read as a pass. Say so rather than printing a number
		-- that means nothing.
		raise notice '0194 PIN (behavioural): SKIPPED. This session is not an admin, and gauntlet_run_review answers an empty set to a non-admin, so a count here could not tell a working pin from a closed gate. The structural halves above ran. Re-run the query in section 7 as an admin.';
	end if;

	-- -----------------------------------------------------------------------
	-- C3. WHAT COMES BACK, counted against the real table.
	--
	-- These are the rows `0154` removed and this file returns to the board in a
	-- held state. They are the students who will see something new.
	-- -----------------------------------------------------------------------
	select
		count(*) filter (where gl.rank_state = 'pending_verification'),
		count(distinct gl.user_id) filter (where gl.rank_state = 'pending_verification'),
		count(distinct gl.challenge_id) filter (where gl.rank_state = 'pending_verification'),
		count(*) filter (where gl.rank_state = 'ranked')
	into v_held_rows, v_held_players, v_held_boards, v_ranked_rows
	from public.gauntlet_leaderboard gl;

	raise notice '0194 BOARD: % held row(s) across % student(s) and % challenge(s) are now VISIBLE on the board as pending verification, where 0154 had them absent. % ranked seat(s) are unchanged.',
		v_held_rows, v_held_players, v_held_boards, v_ranked_rows;

	-- POSITIVE CONTROL for the two counts above. A board with no ranked rows at
	-- all would make "0 held" read as a clean result when it is an empty view.
	if v_ranked_rows = 0 then
		raise notice '0194 BOARD: the board has NO ranked rows at all, so the held count above says nothing about the floor. This is an empty or freshly reset database, not a result.';
	end if;

	-- The property that says nobody lost a seat to this file.
	select count(*) into v_held_ranked
		from public.gauntlet_leaderboard gl
		where gl.rank_state = 'pending_verification' and gl.rank is not null;
	if v_held_ranked > 0 then
		raise exception '0194: % held row(s) carry a non-null rank. A held run is holding a seat, which is exactly what this file must not do.', v_held_ranked;
	end if;
	raise notice '0194 BOARD: 0 held row(s) carry a rank, against % ranked row(s) that do. A held run is visible and seats nobody.',
		v_ranked_rows;

	-- The `distinct on` preference, measured rather than argued: a student who
	-- has BOTH a held run and an honest one on the same challenge must be
	-- represented by the honest one.
	select count(*) into v_both
	from (
		select s.user_id, s.challenge_id
		from public.submissions s
		cross join lateral (
			select coalesce((select g.speedrun_floor_ms from public.gauntlet_rank_settings g where g.id), 30000)::numeric as floor_ms
		) f
		where s.is_correct = true and s.source = 'macro' and s.mode = 'speedrun'
		group by s.user_id, s.challenge_id
		having bool_or((s.value ->> 'elapsed_ms')::numeric is null or (s.value ->> 'elapsed_ms')::numeric < f.floor_ms)
			and bool_or((s.value ->> 'elapsed_ms')::numeric >= f.floor_ms)
	) q
	join public.gauntlet_leaderboard gl
		on gl.user_id = q.user_id and gl.challenge_id = q.challenge_id
	where gl.rank_state <> 'ranked';
	if v_both > 0 then
		raise exception '0194: % (player, challenge) pair(s) hold BOTH a held run and an honest one, and the board is showing the held one. 0154''s "removes the run, not the player" is broken.', v_both;
	end if;

	-- Rows with no clock at all. `0154` dropped these; they are now held, which
	-- is the visible version of the same refusal.
	select count(*) into v_no_key
		from public.submissions s
		where s.is_correct = true and s.source = 'macro' and s.mode = 'speedrun'
			and (s.value ->> 'elapsed_ms') is null;
	if v_no_key > 0 then
		raise notice '0194 BOARD: % passing Speedrun submission(s) carry NO elapsed_ms key at all. Every macro submit since 0006 writes it, so these are rows nothing in this codebase wrote. They are HELD (0154 dropped them), which is the same refusal to rank with somebody able to see it.',
			v_no_key;
	end if;

	select min((s.value ->> 'elapsed_ms')::numeric) / 1000.0 into v_fastest_s
		from public.submissions s
		where s.is_correct = true and s.source = 'macro' and s.mode = 'speedrun'
			and (s.value ->> 'elapsed_ms') is not null;
	raise notice '0194 SETTING: the floor is % ms (% s). The fastest passing Speedrun run in the table is % s. Change it with: select public.gauntlet_rank_settings_set(<milliseconds>);',
		v_floor_ms, round(v_floor_ms / 1000.0, 1), coalesce(round(v_fastest_s, 2)::text, 'n/a');
end;
$chk$;

-- ---------------------------------------------------------------------------
-- SECTION 6. Reverting.
--
-- Nothing here deletes a row, so this file is fully reversible.
--
--   * TO PUT `0154`'s BEHAVIOUR BACK exactly: re-paste
--     `0154_gauntlet_rank_what_is_checkable.sql`. Its section A restores the
--     view with the hard `>= 30000` and without `rank_state`, and its own
--     `do $chk$` re-runs. `create or replace view` cannot DROP a column,
--     though, so `0154`'s section A will fail with "cannot drop columns from
--     view" -- run `drop view public.gauntlet_leaderboard;` first, then paste
--     `0154`, then re-grant (`0154`'s own grant lines do this).
--   * TO KEEP THE STATUS AND TURN THE HOLDING OFF: `select
--     public.gauntlet_rank_settings_set(0);`. Nothing is held on the clock any
--     more; a run with no `elapsed_ms` is still held, deliberately.
--   * TO REMOVE THE CONSOLE'S NEW OBSERVATION: re-paste `0152`. Do NOT do this
--     while section 3's view is in place -- it is the half that reports a held
--     run, and without it a held row is on the board with no queue behind it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- SECTION 7. The verification query, for the SQL editor, AS AN ADMIN.
--
-- Section 5's behavioural pin check SKIPS unless the applying session is an
-- admin. Paste this after applying, signed in as one:
--
--   select
--       (select speedrun_floor_ms from public.gauntlet_rank_settings where id) as floor_ms,
--       (select count(*) from public.gauntlet_leaderboard
--          where rank_state = 'pending_verification') as held_rows,
--       (select count(*) from public.gauntlet_leaderboard
--          where rank_state = 'pending_verification' and rank is not null) as held_with_a_seat,
--       (select count(*) from public.gauntlet_run_review(null, 8760, 0, false, true, 1000)
--          where 'pending_verification' = any(observations)) as reported_by_console;
--
-- `held_with_a_seat` must be 0. If `held_rows` is above 0 then
-- `reported_by_console` must be above 0 -- that pair is the pin, and a held
-- board row with nothing reporting it is the failure this file exists to make
-- impossible.
-- ---------------------------------------------------------------------------
