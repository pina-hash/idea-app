-- 0146_gauntlet_reveal_all_modeling_modes.sql
-- IDEA // GAUNTLET: make Reverse Engineer and Feature Golf playable again, and
-- keep them off the global board because neither ranks on anything the server
-- can check.
--
-- ---------------------------------------------------------------------------
-- PART 1. WHAT IS BROKEN.
--
-- `gauntlet_speedrun_reveal` is the ONLY function that mints a solo run token
-- (0010 and 0028 mint room tokens; nothing else inserts into
-- gauntlet_run_tokens). `ModelingRun.svelte` is the shared play component for
-- Reverse Engineer and Feature Golf and calls exactly that RPC on Start. Its
-- mode gate has read
--
--     if v_mode <> 'speedrun' then raise exception 'Not a Speedrun challenge.';
--
-- since 0015, so pressing Start on either mode raises, no token is minted, and
-- the run cannot begin. Both modes have routes, list pages, detail pages, demo
-- seeds, publish-blocker rules and a score branch in `gauntlet_macro_submit`;
-- what they do not have is a way to start.
--
-- HOW IT HAPPENED, because the shape matters more than the line. 0007 widened
-- the gate deliberately:
--
--     if v_mode not in ('speedrun', 'reverse_engineer', 'feature_golf') then
--         raise exception 'Not a modeling challenge.';
--
-- 0015 ("formalize the Speedrun challenge data structure") re-signed the whole
-- function to add `drawing_image_path` to the returned JSON and, in doing so,
-- wrote the gate back to its pre-0007 single-mode form. Its header says the
-- migration adds storage fields and a ruleset singleton; it does not mention
-- the gate, because whoever wrote it did not know they had moved it. 0023 then
-- copied 0015's body forward to add `focus_regions`, carrying the narrowing
-- with it. That is the general failure this file is a case of: a function
-- re-signed from a NEIGHBOURING version rather than diffed against the one it
-- replaces (CLAUDE.md, "When re-signing a function to change one term, DIFF IT
-- AGAINST THE SOURCE").
--
-- Section 1 restores 0007's gate on top of 0023's body. Nothing else about the
-- reveal moves: the single-live-token retirement, the server-stamped reveal_at,
-- the ~30-minute expiry, the published/teacher gate and the returned shape are
-- 0023 verbatim.
--
-- ---------------------------------------------------------------------------
-- PART 2. WHY THAT ALONE WOULD BE WRONG, AND WHAT SECTION 2 DOES ABOUT IT.
--
-- Widening the gate re-opens two ranking holes that are moot today only because
-- neither mode can start. Both are in `gauntlet_macro_submit`, which this file
-- deliberately does NOT touch: the containment is at the BOARD, not at the
-- submit, because the submit cannot be fixed (see "WHAT WOULD HAVE TO EXIST"
-- below) and a mode that runs, records and does not rank beats a mode that
-- neither runs nor ranks.
--
-- FEATURE GOLF ranks on `p_feature_count` -- a bare integer the caller sends:
--
--     elsif v_challenge.mode = 'feature_golf' then
--         v_score := p_feature_count;
--
-- Lower wins, nothing constrains it, and the value is never compared against
-- anything. `p_feature_count => 1` takes the board outright; 0 or a negative
-- integer takes it further. The volume gate still has to be passed, so the
-- exploit costs a correctly modelled part -- and then hands the top of the
-- board to whoever types the smallest number, which is not a CAD skill.
--
-- REVERSE ENGINEER is worse, and this file's author checked it rather than
-- assuming the audit was right about it. Its metric IS computed server side --
-- the mean of the volume and surface-area deviations from the stored targets --
-- so it is not a bare client claim the way Feature Golf's is. But
-- `gauntlet_macro_submit` RETURNS `score_metric` to the caller on a FAILING
-- submit as well as a passing one, and for this mode the returned number is the
-- exact deviation. That makes it an oracle on the answer key:
--
--     score(V) = |V - Vt| / Vt * 100          (with area absent or held fixed)
--     two probes V1 > V2 > Vt, both failing:
--     Vt = 100 * (V1 - V2) / (score(V1) - score(V2))
--
-- Two failing submits solve for the target exactly; a third submits it and
-- scores a perfect 0 with no part modelled at all. The per-reveal budget of 3
-- failed attempts (0061) does not contain it, because re-revealing is free and
-- unlimited, and 2 probes fit inside one budget anyway. This is precisely the
-- disclosure 0061 was written to close -- it replaced the exact deviation with
-- a coarse unsigned band and removed the target from `gauntlet_run_targets` --
-- and `score_metric` is the one door it left open, harmlessly, because the only
-- mode whose score_metric IS a deviation could not be started.
--
-- So Section 2 removes BOTH modes from `gauntlet_leaderboard`.
--
-- WHAT SURVIVES, which is what "playable and locally scored" means here:
--   * the run still runs, and the submission row is still INSERTED with its
--     score_metric, is_correct and full `value` audit trail. Nothing about
--     recording changes.
--   * `gauntlet_room_board` is a SEPARATE view over `submissions` (0010, row
--     scoped in 0060) and is untouched, so a Feature Golf challenge raced in a
--     supervised room still ranks inside that room, where a host is watching.
--   * `gauntlet_leaderboards()` (the /gauntlet/leaderboard page) reads
--     `gauntlet_leaderboard` only for its per-drawing Speedrun records, which
--     are already filtered to mode='speedrun'. Its overall XP board counts
--     attempts and clears from `submissions` directly and is unaffected: a
--     forged feature count buys no XP, because XP counts CLEARS and clearing
--     still means passing the hidden volume gate.
--
-- WHAT IS LOST, stated plainly because it lands on surfaces this file does not
-- own: the per-challenge board on /gauntlet/feature-golf/<id> and
-- /gauntlet/reverse-engineer/<id> goes empty, `myBest` comes back null, and the
-- list pages stop marking those challenges cleared -- all four of those read
-- `gauntlet_leaderboard`. `gauntlet_macro_submit` will also return `rank` null
-- for these modes, which is already its normal answer for a failing run.
-- ModelingRun.svelte keys its post-run sentence on `result.is_correct && myBest`
-- and falls through to "A miss is recorded but does not rank." when myBest is
-- null, so a PASSING Feature Golf run will currently read as a miss. That is a
-- one-conditional copy fix in a component this bundle does not own; it is
-- reported rather than made here.
--
-- WHAT WOULD HAVE TO EXIST FOR FEATURE GOLF TO RANK. The server never sees a
-- feature tree; it sees a volume, a surface area and an integer. Ranking on
-- feature count honestly needs a feature count the STUDENT cannot author, which
-- means one of:
--   (a) the capture macro / C# add-in signing its measurements with a secret the
--       student's machine does not hold -- which it cannot, because the macro
--       ships to the student as readable source and the add-in runs on their
--       machine, so any key in it is theirs;
--   (b) the part FILE being uploaded and the tree counted server side by
--       something that can read SLDPRT -- a real parser or a headless
--       SolidWorks, neither of which exists here; or
--   (c) the count being witnessed by a person -- which is what a supervised room
--       already is, and is why the room board is deliberately left alone.
-- Until one of those exists, the honest position is that Feature Golf is a
-- practice and classroom-race mode, not a ranked one.
--
-- WHAT WOULD HAVE TO CHANGE FOR REVERSE ENGINEER TO RANK. Strictly less: stop
-- returning `score_metric` from `gauntlet_macro_submit` for this mode (or return
-- it only once the run has passed, when the target is no longer worth solving
-- for), which closes the oracle and leaves the metric exactly as honest as
-- Speedrun's volume gate. That is a change to `gauntlet_macro_submit`, which
-- this bundle does not own and which needs its own answer for every deployed
-- caller of the returned shape, so it is named here and not attempted.
--
-- ---------------------------------------------------------------------------
-- REVERSIBILITY. Section 1 is undone by re-applying 0023 verbatim. Section 2 is
-- undone by re-applying 0007's section 3 (the view) verbatim. Neither section
-- writes, deletes or migrates a single row: the submissions this file removes
-- from the board are still in `submissions`, unchanged, and reappear the moment
-- the view is put back.
--
-- Apply manually in the Supabase SQL editor, after 0145. Idempotent
-- (create or replace throughout); re-applying is a no-op.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. gauntlet_speedrun_reveal: admit the three MODELING modes.
--
-- Body is 0023's, verbatim, with one term changed: the mode gate. The message
-- returns to 0007's wording ('Not a modeling challenge.'), which is what a
-- caller landing here with a knowledge mode should be told -- the gate is about
-- the FAMILY, not about Speedrun.
--
-- The knowledge modes stay refused, and that is load-bearing rather than
-- tidiness: they are scored by `gauntlet_submit` (a direct answer check with no
-- token in it), so a run token minted for one would be a credential for a
-- macro submit path that has no score branch for that mode -- and
-- gauntlet_macro_submit would raise 'This mode is not macro-scored.' after the
-- token had already been spent.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_speedrun_reveal(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_mode public.gauntlet_mode;
	v_published boolean;
	v_drawing text;
	v_drawing_path text;
	v_focus jsonb;
	v_asset text;
	v_code text;
	v_reveal_at timestamptz := now();
	v_expires timestamptz := now() + interval '30 minutes';
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select c.mode, c.published, c.answer ->> 'drawing', c.answer ->> 'drawing_image_path',
			c.answer -> 'focus_regions', c.asset_ref
		into v_mode, v_published, v_drawing, v_drawing_path, v_focus, v_asset
		from public.challenges c
		where c.id = p_challenge_id;

	if not found then
		raise exception 'Challenge not found.';
	end if;
	-- 0146: restored from 0007. 0015 narrowed this to 'speedrun' as collateral
	-- while adding drawing_image_path, which left Reverse Engineer and Feature
	-- Golf unable to start at all.
	if v_mode not in ('speedrun', 'reverse_engineer', 'feature_golf') then
		raise exception 'Not a modeling challenge.';
	end if;
	if not v_published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	-- Only the latest reveal for this user+challenge stays live: retire any prior
	-- unused codes so a stale code cannot be held in reserve.
	update public.gauntlet_run_tokens
		set used_at = v_reveal_at
		where user_id = v_uid and challenge_id = p_challenge_id and used_at is null;

	-- Mint a unique code; retry on the rare PK collision.
	loop
		v_code := public.gauntlet_gen_code();
		begin
			insert into public.gauntlet_run_tokens (code, user_id, challenge_id, reveal_at, expires_at)
			values (v_code, v_uid, p_challenge_id, v_reveal_at, v_expires);
			exit;
		exception when unique_violation then
			-- collision, regenerate
		end;
	end loop;

	return jsonb_build_object(
		'drawing', v_drawing,
		'drawing_image_path', v_drawing_path,
		'focus_regions', v_focus,
		'asset_ref', v_asset,
		'code', v_code,
		'reveal_at', v_reveal_at,
		'expires_at', v_expires
	);
end;
$$;

-- The roles are NAMED rather than revoked "from public", because a hosted
-- Supabase project's default privileges write a DIRECT anon grant into every
-- function's proacl and `revoke ... from public` removes only the PUBLIC entry
-- (CLAUDE.md, "revoke ... FROM public DOES NOT CLOSE A FUNCTION ON THIS
-- PROJECT"). `service_role` is deliberately not named: 0137 preserves it
-- wherever it was already held, and nothing here changes who may write.
revoke all on function public.gauntlet_speedrun_reveal(uuid) from public, anon;
grant execute on function public.gauntlet_speedrun_reveal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. gauntlet_leaderboard: rank only what the server can check.
--
-- Definition is 0007's (the last one, re-asserted unchanged by 0060), with one
-- term changed: the macro branch of the inner WHERE now names the macro modes
-- that may rank instead of admitting every macro submission.
--
-- It is an ALLOWLIST, not `mode not in (...)`, and that is deliberate: a macro
-- mode added later must be admitted by somebody who has decided its metric is
-- checkable, rather than inheriting a board seat by default. Fail closed.
--
-- Column list, ordering, rank window, `where c.published` row predicate and the
-- owner-privileged (NOT security_invoker) posture are all unchanged -- see
-- 0060 section 3 for why that posture is load-bearing and why the explicit
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
	where s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
		-- 0146: macro-scored modes whose ranked metric the server can actually
		-- check. Speedrun ranks on a SERVER-STAMPED clock (gauntlet_run_tokens
		-- .started_at) and its client-sent volume only has to hit a hidden
		-- target, so neither half is authorable. feature_golf ranks on a raw
		-- client integer, and reverse_engineer's returned score_metric is an
		-- exact-deviation oracle on its own target; see this file's header.
		or (s.is_correct = true and s.source = 'macro' and s.mode in ('speedrun'))
	order by s.user_id, s.challenge_id, s.is_correct desc nulls last, s.score_metric asc nulls last, (s.value ->> 'elapsed_ms')::numeric asc nulls last, s.created_at asc
) best
join public.profiles p on p.id = best.user_id
join public.challenges c on c.id = best.challenge_id
where c.published;

-- `create or replace view` preserves existing grants, so these re-assert the
-- end state rather than establish it (0060's argument, kept).
revoke all on public.gauntlet_leaderboard from anon;
grant select on public.gauntlet_leaderboard to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Self-checks, and the read-only reports this file owes its operator.
--
-- The structural halves assert the two definitions actually landed. The
-- COUNTS are printed and nothing is written: they describe live rows, and what
-- to do about live rows is a decision for a person reading the number, not for
-- a migration.
-- ---------------------------------------------------------------------------
do $chk$
declare
	v_src text;
	v_dropped_rows bigint;
	v_still_boarded bigint;
	v_tol_05_published bigint;
	v_tol_05_total bigint;
	v_tol_other bigint;
	v_tol_absent bigint;
begin
	-- 3a. The reveal gate admits the three modeling modes and still refuses the
	-- knowledge ones. Asserted on the function's own body rather than on this
	-- file having been pasted: a half-applied paste is the case worth catching.
	select p.prosrc into v_src
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'gauntlet_speedrun_reveal';
	if v_src is null then
		raise exception '0146: gauntlet_speedrun_reveal is missing after apply.';
	end if;
	if v_src not like '%reverse_engineer%' or v_src not like '%feature_golf%' then
		raise exception '0146: the reveal gate did not widen (section 1 did not apply).';
	end if;
	if v_src like '%Not a Speedrun challenge.%' then
		raise exception '0146: the reveal still carries the 0015 single-mode refusal.';
	end if;
	-- The gate is an allowlist of three MODELING modes, so no knowledge mode is
	-- named anywhere in the body. A knowledge mode appearing here means somebody
	-- widened it into a family it has no score branch for.
	if v_src like '%drawing_reading%' or v_src like '%gdt_tolerance%' or v_src like '%spot_the_error%' then
		raise exception '0146: the reveal gate names a knowledge mode; it must admit modeling modes only.';
	end if;

	-- 3b. The board no longer carries a row for either unrankable mode. This is
	-- BEHAVIOURAL, against whatever is really in `submissions`, not a read of
	-- the view's text.
	select count(*) into v_still_boarded
		from public.gauntlet_leaderboard
		where mode in ('feature_golf', 'reverse_engineer');
	if v_still_boarded > 0 then
		raise exception '0146: % feature_golf/reverse_engineer rows are still on gauntlet_leaderboard; section 2 did not apply.', v_still_boarded;
	end if;

	-- The positive control for 3b: how many rows the old view WOULD have shown,
	-- so a count of zero above can be told apart from a view that matches
	-- nothing at all. These rows are still in `submissions` and are not touched.
	select count(*) into v_dropped_rows
		from public.submissions s
		join public.challenges c on c.id = s.challenge_id
		where s.mode in ('feature_golf', 'reverse_engineer')
			and s.is_correct = true
			and s.source = 'macro'
			and c.published;
	raise notice '0146: % passing feature_golf/reverse_engineer macro submissions left the global board (0 on it now). The rows are untouched in public.submissions and reappear if 0007''s view is restored.', v_dropped_rows;

	-- 3c. REPORT ONLY (no write). The authoring form seeded tolerance_pct 0.5
	-- into every modeling payload from 0009 onward, and 0036 tightened the
	-- SERVER default to 0.1 without touching that seed -- so a challenge
	-- authored through the form since 0036 grades five times wider than the
	-- capture macro and the C# add-in tell the student it will. The form seed is
	-- fixed in this bundle (src/lib/gauntlet/authoring.ts); ALREADY STORED rows
	-- are data, and correcting them is a decision to be made with these numbers
	-- in front of you, not a side effect of a migration.
	--
	-- To correct them, once decided, the whole change is a per-row jsonb write:
	--     update public.challenges
	--        set answer = jsonb_set(answer, '{tolerance_pct}', '0.1'::jsonb),
	--            prompt = case when prompt ? 'tolerance_pct'
	--                          then jsonb_set(prompt, '{tolerance_pct}', '0.1'::jsonb)
	--                          else prompt end
	--      where mode in ('speedrun','reverse_engineer','feature_golf')
	--        and (answer ->> 'tolerance_pct')::numeric = 0.5;
	-- NOTE what that does to history: it does NOT re-grade anything (submissions
	-- keep their stored is_correct), so a run already ranked as a pass under the
	-- 0.5 band stays ranked while new runs are held to 0.1. Deciding whether the
	-- existing board rows stay is the second half of the decision, and there is
	-- no way to make both halves true at once.
	select
		count(*) filter (where (answer ->> 'tolerance_pct')::numeric = 0.5 and published),
		count(*) filter (where (answer ->> 'tolerance_pct')::numeric = 0.5),
		count(*) filter (where answer ? 'tolerance_pct' and (answer ->> 'tolerance_pct')::numeric <> 0.5),
		count(*) filter (where not (answer ? 'tolerance_pct'))
		into v_tol_05_published, v_tol_05_total, v_tol_other, v_tol_absent
		from public.challenges
		where mode in ('speedrun', 'reverse_engineer', 'feature_golf');
	raise notice '0146 REPORT (nothing written): modeling challenges carrying an explicit answer.tolerance_pct of 0.5 -- % published, % including drafts/archived. Carrying some other explicit band: %. Carrying none (server default governs): %.',
		v_tol_05_published, v_tol_05_total, v_tol_other, v_tol_absent;
end;
$chk$;
