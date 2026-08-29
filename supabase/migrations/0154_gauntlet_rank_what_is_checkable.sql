-- 0154_gauntlet_rank_what_is_checkable.sql
-- IDEA // GAUNTLET: a knowledge row ranks only if it is CORRECT, and a modeling
-- run ranks only if its server-stamped clock is long enough to have been real.
--
-- Two changes to ONE object, `gauntlet_leaderboard`. Both are narrowings of the
-- same inner WHERE clause `0146` last wrote, and both follow `0146`'s shape
-- exactly: the row is REMOVED from the view rather than kept with a nulled
-- rank. Nothing in `submissions` is touched, no RPC changes, no grant moves.
--
-- ===========================================================================
-- THIS CHANGES THE BOARD. IT DOES NOT ONLY PREVENT FUTURE ROWS.
-- ===========================================================================
-- Every wrong knowledge answer currently holding a seat disappears from that
-- seat the moment this applies, and so does every modeling run under the floor.
-- A student who has been sitting at rank one on a question they got WRONG will
-- notice, that same period, and will be right to ask. Section 3 counts all of
-- it at apply time, against the real table, and prints the numbers without
-- writing anything -- read them BEFORE you decide to run this, because the
-- decision this file asks for is not "is the predicate correct" (it is) but
-- "am I ready for these specific students to lose these specific seats".
--
-- No row is deleted, so nothing here is irreversible: reverting is section 5.
--
-- ===========================================================================
-- 1. A KNOWLEDGE ROW RANKS ONLY IF IT IS CORRECT.
-- ===========================================================================
-- The predicate `0146` left standing, verbatim:
--
--     where s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
--         or (s.is_correct = true and s.source = 'macro' and s.mode in ('speedrun'))
--
-- The knowledge branch admits on MODE ALONE. The modeling branch one line below
-- it requires `is_correct = true`. Nothing has ever justified the asymmetry;
-- `0148` NAMED it in its own header ("admits knowledge rows on ... ALONE,
-- unlike the modeling branch beside it") while fixing the clock rather than the
-- correctness, and it has been true since `0007` and re-asserted unchanged by
-- `0060` and `0146`.
--
-- `gauntlet_room_board` (`0010`) has required `is_correct = true` since the day
-- it was written. So the room board has always been right about this and the
-- global board never has, which is the clearest statement of the defect there
-- is: two boards over one table disagreeing about whether a wrong answer is a
-- result.
--
-- MEASURED, against this chain on a real Postgres, before the fix:
--   * `gauntlet_submit(<drawing_reading>, {"answer":"a"}, 4000)` -- a wrong
--     answer -- produced exactly one board row: `is_correct false`,
--     `score_metric 4.00`, `rank 1`.
--   * A correct answer at 20.00s was then added. The board came back
--     `[rank 1 correct 20.00, rank 2 incorrect 4.00]`.
--
-- SO ONE HALF OF THE ORIGINAL AUDIT CLAIM IS WRONG AND IS CORRECTED HERE
-- RATHER THAN REPEATED. The claim was that a wrong four-second answer
-- OUTRANKS a right twenty-second one. It does not: the rank window opens with
-- `best.is_correct desc nulls last`, so within a challenge every correct row
-- sorts above every incorrect one, and the `distinct on` beneath it opens with
-- the same term, so a player who has answered both ways is represented by
-- their correct row. What is true, and is the defect, is that a wrong answer
-- OCCUPIES A SEAT AT ALL -- it is ranked, projected, and read by the surfaces
-- below -- and that it holds RANK ONE on every board where nobody has yet
-- answered correctly, which on a freshly published question is every board.
-- The fix is the same either way; the reason it matters is smaller than the
-- audit said and is stated at its real size.
--
-- WHY NOT ALSO REQUIRE `source` ON THE KNOWLEDGE BRANCH. Because it would not
-- narrow anything. `gauntlet_room_manual_submit` (`0010`) takes the mode from
-- the CHALLENGE and gates on nothing, so a knowledge challenge hosted in a room
-- writes a knowledge-mode row with `source = 'manual'` -- the same source
-- `gauntlet_submit` writes -- and its `is_correct` is always false there
-- (it grades typed mass against `answer.target_mass`, which a knowledge level
-- does not carry). `source` cannot tell those apart. `is_correct` closes both.
--
-- ===========================================================================
-- 2. A MODELING RUN RANKS ONLY IF ITS CLOCK IS AT LEAST 30 SECONDS.
-- ===========================================================================
-- The elapsed a Speedrun ranks on is server-stamped: `gauntlet_macro_submit`
-- computes it as `now() - gauntlet_run_tokens.started_at`, and `started_at` is
-- written by `gauntlet_macro_start`. It is the one number in the ranked path a
-- client cannot choose. Nothing has ever checked it against anything.
--
-- MEASURED, against this chain on a real Postgres, before the fix: reveal,
-- then `gauntlet_macro_start`, then `gauntlet_macro_submit` with the target
-- volume, back to back with no modeling in between --
--
--     FORGED RUN elapsed_ms = 6 ... score_metric 0.01 ... rank 1
--
-- Six milliseconds, and rank one on a published board. That is the floor of
-- what the shape allows over a local socket; a real client adds one network
-- round trip for the start and one for the submit, so on school wifi the same
-- forgery lands somewhere in the low hundreds of milliseconds. Either way it is
-- under a second.
--
-- ---------------------------------------------------------------------------
-- WHERE THE NUMBER COMES FROM, AND WHY IT IS 0152'S NUMBER AND NOT A NEW ONE.
-- ---------------------------------------------------------------------------
-- `0152` already drew this line and argued it: `gauntlet_run_review`'s
-- `p_fast_finish_seconds` defaults to 30, and its header says "An honest run
-- would have to read the revealed drawing, model the part and submit inside
-- half a minute ... Expected honest rate at 30s: essentially zero."
--
-- Reusing it buys a property that a second, independently chosen number would
-- destroy: THE SET OF RUNS THIS FILE UNRANKS IS EXACTLY THE SET `0152` ALREADY
-- PUTS IN FRONT OF A TEACHER. No run loses a board seat without also appearing,
-- by name and with its whole telemetry census beside it, on the review console.
-- A floor above 30 would unrank runs nobody is told about; a floor below 30
-- would leave reported runs ranked. Section 3 asserts the relationship against
-- the catalog rather than trusting this paragraph.
--
-- WHAT AN HONEST RUN ON THE SIMPLEST PUBLISHED CHALLENGE ACTUALLY COSTS, since
-- the number has to answer to something. The three seeded Speedrun levels
-- (`0005`) are `Demo Speedrun: ABS Spacer` (difficulty 1, 30 cm3, 2 features),
-- `Aluminum Block` (difficulty 2, 100 cm3, 3 features) and `Steel Bracket`
-- (difficulty 3, 50 cm3, 6 features). The simplest is the ABS Spacer, and a
-- person doing it honestly must read the reveal, switch to SolidWorks, run the
-- Start macro on a blank part, sketch, dimension, extrude twice and run the
-- submit macro. There is no world in which that is 6ms, and no plausible
-- reading of it that is under 30 seconds either.
--
-- AND THE SEEDS SAY SOMETHING STRONGER, WHICH IS WORTH WRITING DOWN BECAUSE IT
-- SOUNDS LIKE AN EXAGGERATION AND IS NOT: all three ship a drawing that reads
-- "DEMO PLACEHOLDER / No dimensioned part yet / Real drawings arrive with the
-- capture macro". There are no dimensions on them. Nobody can honestly derive
-- 30 cm3 from a dashed rectangle, so on the levels published TODAY an honest
-- passing run is not merely slow, it is impossible -- every passing run on a
-- demo level got its volume from somewhere other than the drawing. That does
-- not make the floor unnecessary; it makes the counts in section 3 the thing to
-- read, because on these levels they are counting demos and forgeries and
-- nothing else.
--
-- IS THE FLOOR THEATRE? No, and the gap is the reason. A forged round trip is
-- 6ms measured, and under a second with real network in it. The floor is 30
-- seconds. That is between thirty and five thousand times the thing it refuses,
-- which is not a margin anybody has to argue about. Had the two been within an
-- order of magnitude the honest answer would have been to say so and ship no
-- floor; they are not.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT CATCH. TWO CASES, BOTH REAL, NEITHER FIXABLE HERE.
-- ---------------------------------------------------------------------------
--   (a) A forger MODELS NOTHING AND WAITS. Call start, go and have lunch,
--       submit the known target at minute four. The clock reads four minutes
--       and the floor has no opinion about it.
--   (b) A forger MODELS THE PART FULLY AND ONLY THEN CALLS START. The whole
--       run happens before the clock exists; start and submit are then two
--       calls a second apart, and the recorded elapsed is honest about the
--       interval it measures and says nothing about the work.
--
-- (b) is already named, in those terms, by the 2026-07 security audit at
-- `docs/audits/2026-07-security-audit.md:606-609`: "model the part completely
-- first, then call start (the clock begins) and submit immediately, for a
-- ranked time of a few seconds. That is not fixable in SQL." It is right, this
-- file does not dispute it, and this file does not fix it.
--
-- So the honest statement of what a floor buys is narrow: IT COSTS AN INSTANT
-- FORGERY THE ONE THING IT CANNOT FAKE -- wall-clock patience -- AND COSTS A
-- PATIENT ONE NOTHING. A forger who is willing to wait thirty seconds is not
-- inconvenienced by this file at all. What is removed is the zero-effort case:
-- the script that starts and submits in the same breath, which is the shape
-- `0153`'s header points at when it says the target is recoverable by search
-- (12 probes against a nearly-modelled part, 163 from a standing start, per
-- `docs/history/speedrun-deviation-band-measure-hoqxzz.md`) and the shape a
-- recovered target makes free. The detector for (a) and (b) is and remains the
-- `0152` review console and the `0035` telemetry behind it, which is why this
-- floor is pinned to that console's own threshold.
--
-- ---------------------------------------------------------------------------
-- THE EXPRESSION, AND WHY IT IS THE ONE ALREADY IN THE VIEW.
-- ---------------------------------------------------------------------------
-- `(s.value ->> 'elapsed_ms')::numeric` is character-for-character the view's
-- existing TIEBREAK expression. A second spelling of "this run's clock" -- via
-- `score_metric`, say -- would be a second definition that could stop agreeing,
-- and `score_metric` is only the clock for `speedrun`: a macro mode admitted to
-- the allowlist later scores on something else entirely, and a floor written
-- against it would be flooring a feature count.
--
-- EVERY MACRO ROW CARRIES THE KEY. `elapsed_ms` has been in the stored `value`
-- of every macro submit since `0006` created the path, through every
-- redefinition (`0007`, `0010`, `0016`, `0026`, `0027`, `0030`, `0034`, `0036`,
-- `0061`, `0147`). A row without it is therefore not a legacy shape but a row
-- nothing in this codebase wrote; `NULL >= 30000` is NULL, so such a row is
-- excluded. That is fail-closed, deliberately, and section 3 counts any that
-- exist so the choice is visible rather than silent.
--
-- ---------------------------------------------------------------------------
-- IT REMOVES THE RUN, NOT THE PLAYER.
-- ---------------------------------------------------------------------------
-- The `distinct on (s.user_id, s.challenge_id)` picks one row per player per
-- challenge from the rows that PASS this WHERE. So a student holding both a
-- sub-floor run and an honest one is not removed from the board: the sub-floor
-- row stops being eligible and their honest run is picked instead. A player
-- disappears only when every run they have on that challenge is refused.
--
-- ===========================================================================
-- WHAT ELSE MOVES ON SCREEN, INCLUDING THE PART THAT IS A REGRESSION.
-- ===========================================================================
-- `gauntlet_leaderboard` is read by more than the boards, and two of those
-- readers use it for something it will now answer differently. Neither is
-- fixed here -- this file owns one migration and touches no application code --
-- and both are stated so nobody has to discover them.
--
--   * NOT AFFECTED: every "cleared" count. `/gauntlet/+page.server.ts`,
--     `nextUncleared` (`$lib/gauntlet/next-challenge.ts`) and the knowledge
--     list pages all filter `is_correct` themselves before counting, so they
--     were already ignoring exactly the rows section 1 removes.
--
--   * REGRESSION, KNOWLEDGE LISTS: the per-mode list pages derive
--     `attempted: best !== undefined` from the presence of a board row. A
--     student whose only answers to a question were wrong currently reads
--     "attempted", with their wrong answer's time and rank beside it; after
--     this they read as never having tried it. The time and rank were
--     meaningless for a wrong answer and are better gone, but "attempted" was
--     true and is not. The fix is a client-side read of `submissions` for
--     attempted-ness rather than of the board, which is a change under `src/`
--     and is NOT made here.
--
--   * REGRESSION, SPEEDRUN LIST: `/gauntlet/speedrun/+page.server.ts` derives
--     `cleared: best !== undefined` the same way (correctly, since that branch
--     already required `is_correct`). A student whose only pass on a level was
--     under the floor loses the cleared tick on that level. That is the cost of
--     `0146`'s remove-the-row shape, which this file follows deliberately
--     rather than inventing a nulled-rank shape beside it; the alternative was
--     considered and rejected because two shapes for "does not rank" is the
--     duplication this codebase keeps paying for.
--
--   * THE PUBLISHED SPEEDRUN RECORD: `gauntlet_leaderboards()` (`0024`, last
--     written by `0038`) reads this view at `rank = 1` for the per-drawing
--     record on `/gauntlet/leaderboard`. A record currently held by a sub-floor
--     run is replaced by the fastest run above the floor, or becomes null
--     ("no record yet") if there is none. Section 3 counts these separately
--     because they are the most visible seats on the site.
--
--   * THE REVIEW CONSOLE STILL SHOWS THE RUN. `gauntlet_run_review` (`0152`)
--     selects from `submissions`, not from this view; only its `board_rank`
--     scalar reads the board, and it goes NULL for a run this file unranks.
--     The run, its telemetry, its observations and its `fast_finish` flag are
--     all unchanged. Nothing becomes invisible to a teacher.
--
--   * NOTHING ABOUT PASSING, RECORDING OR THE BAND MOVES. `gauntlet_macro_submit`
--     is not touched: a sub-floor run still returns `is_correct`, still returns
--     its `deviation_band`, still writes its `submissions` row, still consumes
--     or banks its token. Only the board declines it.
--
--   * NOT IN SCOPE, AND STILL OPEN: `gauntlet_room_board` (`0010`) has no floor.
--     It already requires `is_correct = true`, so section 1 has no counterpart
--     there, but an instant forgery still ranks on a live room board, clocked
--     from the shared `reveal_at`. Fixing it is a different decision -- a room
--     round is minutes long and a floor interacts with a host's own timing --
--     and it is not made here.
--
--   * NOT CLOSED, AND NAMED SO IT IS NOT MISTAKEN FOR CLOSED: a student whose
--     run is refused by the floor is told nothing. The unranked-mode messaging
--     (`gauntlet-leaderboard-unranked-messaging-4cup6n`) is per MODE, and
--     `speedrun` is still a ranked mode, so no existing sentence covers a
--     per-RUN refusal. Saying "this run does not rank because it was too fast"
--     also hands a forger the threshold, which is why it is a decision rather
--     than an oversight. Left for a bundle that owns the surface.
--
-- Apply manually in the Supabase SQL editor. Idempotent: re-pasting is a no-op.

-- ---------------------------------------------------------------------------
-- SECTION A. The view.
--
-- `0146`'s definition with one term added to each branch of the inner WHERE and
-- `is_correct` factored to the front, because it is now the rule BOTH families
-- obey and the structure should say so. Column list, `distinct on`, the rank
-- window, the tiebreak, the `where c.published` row predicate and the
-- owner-privileged (NOT `security_invoker`) posture are all unchanged -- see
-- `0060` section 3 for why that posture is load-bearing and why the explicit
-- `where c.published` is the control that compensates for it.
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
	rank() over (
		partition by best.challenge_id
		order by best.is_correct desc nulls last, best.score_metric asc nulls last, best.tiebreak asc nulls last, best.created_at asc
	) as rank
from (
	select distinct on (s.user_id, s.challenge_id)
		s.user_id,
		s.challenge_id,
		s.mode,
		s.is_correct,
		s.score_metric,
		s.created_at,
		(s.value ->> 'elapsed_ms')::numeric as tiebreak
	from public.submissions s
	-- 0154: A RESULT IS A CORRECT RESULT. Was the knowledge branch's only
	-- condition being `mode in (...)`, against a modeling branch one line down
	-- that had required this since 0146. `is_correct = true` (not `is_correct`)
	-- so a NULL is refused rather than being asked to be truthy.
	where s.is_correct = true
		and (
			s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
			-- 0146: macro-scored modes whose ranked metric the server can
			-- actually check. Speedrun ranks on a SERVER-STAMPED clock
			-- (gauntlet_run_tokens.started_at) and its client-sent volume only
			-- has to hit a hidden target, so neither half is authorable.
			-- feature_golf ranks on a raw client integer, and
			-- reverse_engineer's returned score_metric is an exact-deviation
			-- oracle on its own target; see 0146's header. Still an ALLOWLIST:
			-- a macro mode added later must be admitted by somebody who has
			-- decided its metric is checkable. Fail closed.
			or (
				s.source = 'macro'
				and s.mode in ('speedrun')
				-- 0154: THE PLAUSIBILITY FLOOR. 30_000 ms is 0152's
				-- `gauntlet_run_review.p_fast_finish_seconds` default of 30
				-- seconds, in milliseconds, and is that number ON PURPOSE: it
				-- makes every run this refuses a run that console already
				-- reports. Section B asserts the two have not drifted. The
				-- expression is the tiebreak's, character for character. NULL
				-- (no `elapsed_ms` key at all) fails closed.
				and (s.value ->> 'elapsed_ms')::numeric >= 30000
			)
		)
	order by s.user_id, s.challenge_id, s.is_correct desc nulls last, s.score_metric asc nulls last, (s.value ->> 'elapsed_ms')::numeric asc nulls last, s.created_at asc
) best
join public.profiles p on p.id = best.user_id
join public.challenges c on c.id = best.challenge_id
where c.published;

-- `create or replace view` preserves existing grants, so these re-assert the
-- end state (0149's, which named the roles rather than relying on `from public`
-- -- see CLAUDE.md on why `revoke ... from public` closes nothing on a hosted
-- Supabase project) rather than establish it.
revoke all on public.gauntlet_leaderboard from public, anon, authenticated;
grant select on public.gauntlet_leaderboard to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION B. What this cost, counted at apply time, and the structural checks.
--
-- THE COUNTS ARE PRINTED AND NOTHING IS WRITTEN. They describe live rows and
-- live students, and what to do about a student who has just lost a seat is a
-- decision for the person reading the number (0146's posture, kept). They are
-- taken AFTER section A, so the "before" figures are reconstructed by putting
-- the OLD predicate back to `submissions` directly rather than by having
-- snapshotted the view -- which is also what makes the file re-appliable: a
-- second paste prints the same numbers and changes nothing.
--
-- The structural halves are BEHAVIOURAL where they can be: they ask the view
-- what it now returns over whatever is really in `submissions`, not what its
-- text says. Each zero-count is paired with the positive control that tells a
-- narrowing apart from a view that matches nothing at all.
-- ---------------------------------------------------------------------------
do $chk$
declare
	-- THE ONE SPELLING OF THE FLOOR IN THIS BLOCK. The view carries the same
	-- number as a literal (a view cannot read a variable), and B1 asserts the
	-- two agree by reading the view's own definition back out of the catalog.
	c_floor_s constant integer := 30;
	-- Knowledge.
	v_k_wrong_seats    bigint;
	v_k_wrong_rank1    bigint;
	v_k_boards_emptied bigint;
	v_k_right_seats    bigint;
	v_k_still_wrong    bigint;
	-- Modeling.
	v_m_under          bigint;
	v_m_under_rank1    bigint;
	v_m_players_lost   bigint;
	v_m_still_under    bigint;
	v_m_remaining      bigint;
	v_m_fastest_s      numeric;
	v_m_near_floor     bigint;
	v_m_no_key         bigint;
	-- The two ties.
	v_viewdef          text;
	v_args             text;
	v_ff               integer;
begin
	-- -----------------------------------------------------------------------
	-- B1. THE TWO TIES. The floor's justification rests on two equalities that
	-- nothing else in the schema enforces, so both are read back rather than
	-- trusted: the view really carries this number, and this number really is
	-- 0152's own reporting threshold.
	-- -----------------------------------------------------------------------
	select pg_get_viewdef('public.gauntlet_leaderboard'::regclass, true) into v_viewdef;
	if v_viewdef is null or v_viewdef not like '%elapsed_ms%' then
		raise exception '0154: gauntlet_leaderboard does not mention elapsed_ms; section A did not apply.';
	end if;
	if position((c_floor_s * 1000)::text in v_viewdef) = 0 then
		raise exception '0154: the view does not carry the % ms floor this block is checking. Section A and section B disagree about the number; reconcile before trusting either.',
			c_floor_s * 1000;
	end if;

	select pg_get_function_arguments(p.oid) into v_args
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'gauntlet_run_review';
	if v_args is null then
		raise exception '0154: gauntlet_run_review is missing, so 0152 has not been applied. Apply it first -- this floor is pinned to its threshold and is not meant to stand alone.';
	end if;
	v_ff := substring(v_args from 'p_fast_finish_seconds integer DEFAULT ([0-9]+)')::integer;
	if v_ff is null then
		raise exception '0154: could not read p_fast_finish_seconds'' default out of gauntlet_run_review''s signature. Reconcile the two thresholds by hand before relying on this floor.';
	elsif v_ff < c_floor_s then
		-- THE PROPERTY IS BROKEN. Runs would lose a board seat that the review
		-- console never reports, which is the single outcome the choice of 30
		-- exists to prevent. Refuse rather than apply half an argument.
		raise exception '0154: 0152 reports a fast finish under % s, but this floor refuses under % s. Runs between % s and % s would be unranked and never reported. Move both numbers or neither.',
			v_ff, c_floor_s, v_ff, c_floor_s;
	elsif v_ff > c_floor_s then
		-- The property still holds -- everything unranked is still reported --
		-- so this is drift, not breakage. Loud but not fatal, so a deliberate
		-- later change to 0152 cannot wedge a re-paste of this file.
		raise notice '0154: DRIFT. 0152 reports a fast finish under % s; this floor refuses under % s. Still safe (every unranked run is still reported) but the two were meant to be one number. Reconcile.',
			v_ff, c_floor_s;
	else
		raise notice '0154: floor % s == 0152 fast_finish % s. Every run this file unranks is a run the review console already reports.',
			c_floor_s, v_ff;
	end if;

	-- -----------------------------------------------------------------------
	-- B2. KNOWLEDGE: the seats section 1 just took off the board.
	--
	-- `k_old` is the OLD predicate exactly -- mode alone -- put back to
	-- `submissions` with the same `distinct on`, the same joins and the same
	-- rank window, so these are seats as the board really allocated them and
	-- not a proxy for them.
	-- -----------------------------------------------------------------------
	with k_best as (
		select distinct on (s.user_id, s.challenge_id)
			s.user_id, s.challenge_id, s.is_correct, s.score_metric,
			(s.value ->> 'elapsed_ms')::numeric as tiebreak, s.created_at
		from public.submissions s
		where s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
		order by s.user_id, s.challenge_id, s.is_correct desc nulls last,
			s.score_metric asc nulls last, (s.value ->> 'elapsed_ms')::numeric asc nulls last, s.created_at asc
	), k_old as (
		select b.*, rank() over (
			partition by b.challenge_id
			order by b.is_correct desc nulls last, b.score_metric asc nulls last,
				b.tiebreak asc nulls last, b.created_at asc
		) as rank
		from k_best b
		join public.challenges c on c.id = b.challenge_id and c.published
		join public.profiles p on p.id = b.user_id
	)
	select
		count(*) filter (where o.is_correct is distinct from true),
		count(*) filter (where o.is_correct is distinct from true and o.rank = 1),
		count(*) filter (where o.is_correct = true),
		count(distinct o.challenge_id) filter (
			where not exists (
				select 1 from public.gauntlet_leaderboard gl where gl.challenge_id = o.challenge_id
			)
		)
	into v_k_wrong_seats, v_k_wrong_rank1, v_k_right_seats, v_k_boards_emptied
	from k_old o;

	raise notice '0154 KNOWLEDGE: % board seat(s) held by a WRONG answer are gone, % of them holding RANK ONE. % published knowledge board(s) had no correct answer on them at all and are now EMPTY. % correct seat(s) remain and were never at risk.',
		v_k_wrong_seats, v_k_wrong_rank1, v_k_boards_emptied, v_k_right_seats;
	if v_k_wrong_rank1 > 0 then
		raise notice '0154 KNOWLEDGE: % student(s) were sitting at RANK ONE on a question they answered WRONG. They will notice, and they are right to ask. This is the number to have in hand before the next class.',
			v_k_wrong_rank1;
	end if;

	-- -----------------------------------------------------------------------
	-- B3. MODELING: the seats the floor just took off the board.
	-- -----------------------------------------------------------------------
	with m_best as (
		select distinct on (s.user_id, s.challenge_id)
			s.user_id, s.challenge_id, s.is_correct, s.score_metric,
			(s.value ->> 'elapsed_ms')::numeric as tiebreak, s.created_at
		from public.submissions s
		where s.is_correct = true and s.source = 'macro' and s.mode in ('speedrun')
		order by s.user_id, s.challenge_id, s.is_correct desc nulls last,
			s.score_metric asc nulls last, (s.value ->> 'elapsed_ms')::numeric asc nulls last, s.created_at asc
	), m_old as (
		select b.*, rank() over (
			partition by b.challenge_id
			order by b.is_correct desc nulls last, b.score_metric asc nulls last,
				b.tiebreak asc nulls last, b.created_at asc
		) as rank
		from m_best b
		join public.challenges c on c.id = b.challenge_id and c.published
		join public.profiles p on p.id = b.user_id
	)
	select
		count(*) filter (where o.tiebreak is null or o.tiebreak < c_floor_s * 1000),
		count(*) filter (where (o.tiebreak is null or o.tiebreak < c_floor_s * 1000) and o.rank = 1)
	into v_m_under, v_m_under_rank1
	from m_old o;

	-- A player leaves a challenge only when NO run of theirs clears the floor.
	-- The `distinct on` picks a different row wherever one does, so this -- and
	-- not `v_m_under` -- is the count of who actually disappears.
	select count(*) into v_m_players_lost
	from (
		select s.user_id, s.challenge_id
		from public.submissions s
		join public.challenges c on c.id = s.challenge_id and c.published
		join public.profiles p on p.id = s.user_id
		where s.is_correct = true and s.source = 'macro' and s.mode in ('speedrun')
		group by s.user_id, s.challenge_id
		having count(*) filter (where (s.value ->> 'elapsed_ms')::numeric >= c_floor_s * 1000) = 0
	) x;

	select count(*) into v_m_no_key
	from public.submissions s
	where s.source = 'macro' and not jsonb_exists(s.value, 'elapsed_ms');

	raise notice '0154 MODELING: % ranked Speedrun seat(s) were under the % s floor, % of them holding RANK ONE. % (player, challenge) pair(s) leave the board entirely because no run of theirs clears it; anybody not counted there keeps a seat with a slower, honest run of their own.',
		v_m_under, c_floor_s, v_m_under_rank1, v_m_players_lost;
	if v_m_no_key > 0 then
		raise notice '0154 MODELING: WARNING -- % macro submission(s) carry no elapsed_ms key at all. Nothing in this codebase has written such a row since 0006 created the path. They fail the floor CLOSED and are unranked. Look at them.',
			v_m_no_key;
	end if;

	-- -----------------------------------------------------------------------
	-- B4. Behavioural checks on the view as it now stands, each with the
	-- positive control that says a zero is a narrowing and not an empty view.
	-- -----------------------------------------------------------------------
	select count(*) filter (where gl.is_correct is distinct from true) into v_k_still_wrong
		from public.gauntlet_leaderboard gl;
	if v_k_still_wrong > 0 then
		raise exception '0154: % row(s) on gauntlet_leaderboard are not correct; section A''s correctness term did not apply.', v_k_still_wrong;
	end if;

	-- Stated as "no ranked Speedrun seat exists whose player has no clearing
	-- run on that challenge". That is exact and independent of `score_metric`'s
	-- 2-decimal rounding, which a naive `score_metric * 1000 < floor` check
	-- would be at the mercy of in the last millisecond before the floor.
	select count(*) into v_m_still_under
	from public.gauntlet_leaderboard gl
	where gl.mode = 'speedrun'
		and not exists (
			select 1 from public.submissions s
			where s.user_id = gl.user_id and s.challenge_id = gl.challenge_id
				and s.mode = 'speedrun' and s.source = 'macro' and s.is_correct = true
				and (s.value ->> 'elapsed_ms')::numeric >= c_floor_s * 1000
		);
	if v_m_still_under > 0 then
		raise exception '0154: % ranked Speedrun seat(s) belong to a player with no run over the floor; section A''s floor did not apply.', v_m_still_under;
	end if;

	-- `score_metric` IS the clock in seconds for a Speedrun row, so the board's
	-- own column answers both of these with no join back to `submissions`.
	select count(*), min(gl.score_metric),
		count(*) filter (where gl.score_metric >= c_floor_s and gl.score_metric < c_floor_s * 2)
	into v_m_remaining, v_m_fastest_s, v_m_near_floor
	from public.gauntlet_leaderboard gl
	where gl.mode = 'speedrun';

	raise notice '0154 BOARD NOW: % ranked Speedrun seat(s) remain and the fastest run left on the board is % s. Positive control for the two zero-counts above: a view matching nothing at all would report 0 here and 0 correct knowledge seats, against the % correct knowledge seats B2 counted.',
		v_m_remaining, coalesce(v_m_fastest_s::text, 'none'), v_k_right_seats;
	if v_m_near_floor > 0 then
		raise notice '0154 READ THIS: % surviving run(s) sit between % s and % s -- close enough to the floor that the next honest fast student could fall under it. If that count is not tiny, the floor and 0152''s threshold are both too high and must be lowered TOGETHER, never one of them.',
			v_m_near_floor, c_floor_s, c_floor_s * 2;
	end if;
end;
$chk$;

-- ---------------------------------------------------------------------------
-- SECTION C. WHAT UNDOES THIS.
--
-- No row is deleted and no row is modified, so the whole file is undone by
-- restoring the previous view definition: paste `0146` section 2 -- the
-- `create or replace view public.gauntlet_leaderboard ...` statement and the
-- two grant lines beneath it -- and every seat comes straight back, because
-- the rows were never gone, only unselected. There is no data migration to
-- reverse and no backfill to unwind.
--
-- The two narrowings are independent conjuncts, so either can be reverted on
-- its own by pasting the view with that one term removed. Neither depends on
-- the other.
-- ---------------------------------------------------------------------------
