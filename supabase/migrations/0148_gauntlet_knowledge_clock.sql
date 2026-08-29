-- 0148_gauntlet_knowledge_clock.sql
-- IDEA // GAUNTLET: give the knowledge modes a server-side clock, so their
-- boards stop ranking a number the browser sends.
--
-- This is 0147 section 6 built. Read that section first; it names the defect,
-- proposes the shape below, and says why it was not folded into a disclosure
-- fix that was otherwise order-free. Everything here is that proposal plus ONE
-- decision 0147 explicitly left open: what a SECOND start does.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT, re-verified against the live definitions before this file was
-- written rather than taken from 0147's account of them.
--
--   * `gauntlet_submit(p_challenge_id, p_value, p_elapsed_ms)` takes the
--     elapsed time as a PARAMETER, and its knowledge branch turns it into
--     `score_metric` unchanged (`round(p_elapsed_ms / 1000, 2)`). There is no
--     source check and no timing check anywhere on that path.
--   * `gauntlet_leaderboard` (0007, re-asserted by 0146) admits knowledge rows
--     on `s.mode in ('drawing_reading','gdt_tolerance','spot_the_error')`
--     ALONE, unlike the modeling branch beside it which requires
--     `source = 'macro'`. Its `distinct on (user_id, challenge_id)` keeps the
--     best row, ordered `is_correct desc, score_metric asc`.
--   * The SAME call returns `correct` and `explanation` on a WRONG answer.
--
--   So: submit anything, read the key off the refusal, resubmit correct with
--   `p_elapsed_ms: 0`. Zero is rank one on every knowledge board, and the
--   second row supersedes the first.
--
--   THE VIEW HAS A SECOND CLIENT-SUPPLIED RANKING INPUT, which 0147 did not
--   name and which a fix that only moved `score_metric` would have left wide
--   open: its tiebreak is `(s.value ->> 'elapsed_ms')::numeric`, and
--   `gauntlet_submit` writes `p_elapsed_ms` into `value` as well. Both are
--   server-stamped below. Verified by reading 0146's view definition, which is
--   the last one applied.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE ADDS: one table, one RPC, and one arithmetic change, which is
-- exactly 0147's proposal and mirrors `gauntlet_macro_start` (0016) rather than
-- inventing a scheme. The clock is stamped server side at start and read server
-- side at submit; the client never supplies elapsed time and cannot.
--
-- `p_elapsed_ms` KEEPS ITS PLACE IN THE SIGNATURE AND IS SIMPLY IGNORED FOR
-- SCORING. Removing it would be a signature change on a function a deployed
-- client already calls, which is the deploy-ordering problem CLAUDE.md's
-- signature trap exists to avoid; keeping it makes this migration and the
-- client deploy independent events in the additive sense. What the caller sent
-- is recorded in the submission's `value` under `client_elapsed_ms`, so a
-- forged number is preserved as evidence rather than merely discarded.
--
-- ---------------------------------------------------------------------------
-- THE DECISION 0147 LEFT OPEN: WHAT A SECOND START DOES.
--
-- 0147 proposed `on conflict do nothing`, which is right about the exploit and
-- wrong about the student. Both halves matter, so both are stated:
--
--   PLAIN `do nothing` defeats the resubmit loop and makes ONE abandoned
--   attempt permanent. A student who opens a question, closes the tab and comes
--   back an hour later can never post an honest time for it again: their clock
--   has been running the whole time and nothing can restart it. That is not a
--   lock on CLEARING the challenge, but it is a lock on ever ranking on it, and
--   it lands on the most ordinary thing a student does.
--
--   PLAIN `do update set started_at = now()` restores the exploit in one
--   keystroke: read the question, work the answer out, RELOAD, answer in three
--   seconds. This is the trap in the obvious repair. "Restarting because I
--   abandoned it" and "restarting because I have finished thinking" are THE
--   SAME ACTION, so no rule keyed on the answer alone can separate them.
--
-- SO THE SEPARATOR IS TIME PLUS ANSWEREDNESS, and the three cases are:
--
--   1. The attempt is UNANSWERED and STALE (older than the window in section 1).
--      Restart it. The reload exploit survives here and is priced rather than
--      closed: it now costs thirty minutes of real waiting per reset, per
--      question, and leaves every step of the detour in `submissions`. Turning
--      a free instant win into a tedious, visible, half-hour one is the whole of
--      what a clock can buy against a student who is willing to wait.
--   2. The attempt is UNANSWERED and FRESH. The first start stands. This is the
--      case that stops reload-before-answering, and it is why the window cannot
--      be short.
--   3. The attempt has been ANSWERED, at ANY age. The clock is closed forever.
--      This is the half that kills the read-the-key loop: after any submit, the
--      elapsed time is still measured from the ORIGINAL start, so a "correct"
--      resubmit costs the entire detour through the answer key and can never
--      beat the student's own first attempt.
--
-- THE COST, STATED PLAINLY RATHER THAN DISCOVERED LATER: once a student has
-- submitted an answer to a question, they cannot post a better time for it,
-- ever. They can still CLEAR it -- a later correct submit supersedes an earlier
-- miss on the board, because the view orders `is_correct desc` before
-- `score_metric asc` -- but with the wall-clock time since their first start.
-- One timed attempt per question; practice afterwards is free, honest, and does
-- not rank. `timed_attempt` in the result says which kind of submit this was,
-- so the play surface can tell a student that rather than showing them a
-- four-figure time with no explanation.
--
-- WHY NOT ACCRUAL, which is the fair-looking third option and is worse than
-- either: let the student restart after answering, and charge them the time
-- they already spent plus the new attempt. It bounds their score by their FIRST
-- attempt's length -- which they choose. Submit garbage two seconds in, read
-- the key off the refusal, restart, answer instantly, and the board reads two
-- seconds. Freezing bounds the score by wall-clock time, which they do not
-- choose. Accrual was drafted and rejected on that measurement; it is recorded
-- here so it is not re-proposed as an improvement.
--
-- ---------------------------------------------------------------------------
-- DEPLOY ORDERING, which this file HAS and 0147 did not.
--
-- After this migration a knowledge submit REQUIRES a start row, so the client
-- must be able to create one before the migration lands, not after.
--
--   DEPLOY THE CLIENT FIRST, THEN APPLY THIS FILE.
--
-- The client calls `gauntlet_knowledge_start` on mount and degrades past a
-- missing function on `PGRST202` ALONE (CLAUDE.md's RPC degradation rule), so
-- in the window between the deploy and the apply the call is a no-op and
-- submits grade exactly as they do today. After the apply, a page that was
-- LOADED before it has no start row, and its submit is refused with a sentence
-- telling the student to reload -- which is the same refusal a genuinely stale
-- tab gets, and it is self-healing.
--
-- The reverse order is what must not happen: applying first refuses every
-- in-flight knowledge submit on the site with no client anywhere able to create
-- the row that would fix it.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--
--   * It does not touch `gauntlet_leaderboard`. 0147 declined to add a `source`
--     predicate there because the view is adjacent to 0060, which is being
--     applied by hand separately, and that reasoning has not changed. It does
--     not need to: both of the view's ranking inputs are now server-stamped, so
--     the view ranks honestly without being redefined.
--   * It does not withhold `correct` / `explanation` on a wrong answer. That is
--     the teaching, it is what makes a review attempt worth allowing at all,
--     and with a working clock reading the key no longer buys a time.
--   * It does not touch the Speedrun practice branch, `gauntlet_macro_submit`,
--     or any modeling path. The modeling modes already time from
--     `gauntlet_run_tokens.started_at`.
--   * It does not clamp or floor a client-sent number, which 0147 correctly
--     called a guess dressed as a check.
--
-- Apply manually in the Supabase SQL editor, AFTER 0147 and after the client
-- carrying the start call is deployed. Idempotent: re-applying is a no-op.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The attempt window, written down ONCE.
--
-- Thirty minutes, which is `gauntlet_run_tokens`' existing expiry (0023) and so
-- is already what this subsystem means by "one sitting". It is a function and
-- not two literals because the restart rule in section 3 and anything that
-- later wants to read staleness are the SAME question about what one attempt
-- is; two literals thirty lines apart is how a restart window and a staleness
-- window stop being the same number (the `_foundry_play_window()` argument).
--
-- Private: revoked from every role BY NAME. A bare `revoke ... from public`
-- does not close a function on a hosted Supabase project, whose default
-- privileges write direct grants to anon/authenticated/service_role at creation
-- time. Nothing grants it back; it is only ever called from inside the SECURITY
-- DEFINER functions below, which run as the owner and reach it regardless.
-- ---------------------------------------------------------------------------
create or replace function public._gauntlet_knowledge_window()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '30 minutes' $$;

revoke all on function public._gauntlet_knowledge_window()
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. gauntlet_knowledge_starts: one row per (student, question).
--
-- `answered_at` is what makes the freeze in case 3 above possible, and it lives
-- HERE rather than being derived from `submissions` on the fly for two reasons.
-- A `select 1 from submissions where user_id = ... and challenge_id = ...` would
-- also see rows written BEFORE this migration, so every student who has ever
-- played a question would arrive already frozen on their first post-0148 start,
-- which is the plain-`do nothing` failure applied retroactively to everyone. And
-- it would ask a growing table a question the attempt row can answer in its own
-- primary key.
--
-- RLS ON WITH NO POLICY, AND NO GRANT TO ANY CLIENT ROLE. Either alone denies
-- every select; both is deliberate, the way `student_app_plays` (0139) is
-- closed. Nothing in the app reads this table from a browser: the student's own
-- clock reaches them through the two SECURITY DEFINER functions below and
-- nowhere else. There is no view, policy, grant or function that returns a row
-- of it to any client, admin included.
--
-- `on delete cascade` on both keys: an attempt row is meaningless without the
-- student and the question it names, and it holds no record worth keeping (the
-- submissions it timed are the record, and they are untouched).
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_knowledge_starts (
	user_id uuid not null references auth.users(id) on delete cascade,
	challenge_id uuid not null references public.challenges(id) on delete cascade,
	started_at timestamptz not null default now(),
	answered_at timestamptz,
	primary key (user_id, challenge_id)
);

alter table public.gauntlet_knowledge_starts enable row level security;
revoke all on public.gauntlet_knowledge_starts from anon, authenticated;

comment on table public.gauntlet_knowledge_starts is
	'0148: server-stamped clock for the knowledge modes. One row per (student, question). '
	'started_at is the ranked clock; answered_at closes it permanently on the first submit. '
	'RLS on with no policy and no client grant: read only from the definer functions.';

-- ---------------------------------------------------------------------------
-- 3. gauntlet_knowledge_start: stamp the clock when the question renders.
--
-- Mirrors `gauntlet_macro_start` (0016): it takes no identity parameter, so
-- "can only start their own attempt" is a property of the SIGNATURE rather than
-- a check that could be got wrong, and it re-checks the caller inside its own
-- body. The published/teacher gate is the SAME gate `gauntlet_submit` applies,
-- deliberately, so a challenge that can be started can be submitted and a
-- teacher previewing an unpublished question is timed like anybody else.
--
-- THE UPSERT IS `do update ... where`, NOT `do nothing`, and the `where` IS the
-- decision in this file's header. It reads the EXISTING row (the
-- `gauntlet_knowledge_starts.` qualification is what distinguishes it from the
-- proposed row in `excluded`) and restarts only an attempt that is both
-- unanswered and stale.
--
-- THEN IT RE-READS. A `do update ... where` whose predicate is false updates NO
-- row, so `returning` yields nothing -- exactly the shape CLAUDE.md's lazy-
-- create rule warns about, where `insert ... returning ... into` leaves the
-- target NULL and the re-read is the branch that actually finds the winner's
-- row. It is also what makes two tabs pressing start at once correct: they
-- serialize on the primary key and both then read the row that won.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_knowledge_start(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_mode public.gauntlet_mode;
	v_published boolean;
	v_before timestamptz;
	v_started_at timestamptz;
	v_answered_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in to start a challenge.';
	end if;

	select mode, published into v_mode, v_published
	from public.challenges where id = p_challenge_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;
	if v_mode not in ('drawing_reading', 'gdt_tolerance', 'spot_the_error') then
		raise exception 'Not a knowledge challenge.';
	end if;
	if not v_published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	select started_at into v_before
	from public.gauntlet_knowledge_starts
	where user_id = v_uid and challenge_id = p_challenge_id;

	insert into public.gauntlet_knowledge_starts (user_id, challenge_id, started_at)
	values (v_uid, p_challenge_id, now())
	on conflict (user_id, challenge_id) do update
		set started_at = now()
		where public.gauntlet_knowledge_starts.answered_at is null
			and public.gauntlet_knowledge_starts.started_at
				< now() - public._gauntlet_knowledge_window();

	select started_at, answered_at into v_started_at, v_answered_at
	from public.gauntlet_knowledge_starts
	where user_id = v_uid and challenge_id = p_challenge_id;

	return jsonb_build_object(
		'ok', true,
		-- The caller's OWN clock. It discloses nothing about the question: it is
		-- a timestamp this call may just have written, and the student can read
		-- the same number off their own wall clock.
		'started_at', v_started_at,
		-- true only when this call MOVED the clock, which is a fresh attempt.
		'restarted', v_before is not null and v_started_at is distinct from v_before,
		-- false once the question has been answered once: the clock is closed and
		-- no further submit can rank. The surface says so rather than showing a
		-- four-figure time with no explanation.
		'timed', v_answered_at is null
	);
end;
$$;

revoke all on function public.gauntlet_knowledge_start(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_knowledge_start(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. gauntlet_submit: the knowledge branch reads the clock instead of the form.
--
-- BODY IS 0147's, DIFFED AGAINST IT RATHER THAN RECONSTRUCTED (CLAUDE.md: "When
-- re-signing a function to change one term, DIFF IT AGAINST THE SOURCE"). The
-- Speedrun practice branch, the guards above it, the insert below it and the
-- signature are 0147's verbatim. What moves is inside the knowledge branch:
--
--   * it looks up the attempt row FOR UPDATE, and refuses if there is none;
--   * `v_elapsed_ms` becomes `now() - started_at` and `v_score` follows it;
--   * `v_value` is rebuilt so the view's `elapsed_ms` TIEBREAK is the server's
--     number too, with the caller's claim kept beside it as `client_elapsed_ms`;
--   * `answered_at` is stamped on the first submit and never moved again.
--
-- `for update` is not decoration: it serializes two tabs submitting at once on
-- the attempt row, so exactly one of them is the timed attempt and the other
-- reads a stamped `answered_at`.
--
-- THE REFUSAL IS A `raise`, NOT A STRUCTURED `{ok:false}`. Every other refusal
-- in this function raises, the play routes already render the message verbatim
-- where the student is working, and a second refusal shape on one function is a
-- second thing every caller has to branch on. The sentence names the action
-- ("Reload the page") because the honest way to reach it is a stale tab, and a
-- student who is told only that something is wrong will try the same button
-- again.
--
-- INTEGER OVERFLOW IS REAL HERE AND IS CLAMPED. `v_elapsed_ms` is an `integer`
-- and an attempt frozen by case 3 is measured from its ORIGINAL start, which
-- may be weeks old: 25 days is already past int4's 2147483647 ms, and the
-- unclamped expression would raise `numeric field overflow` on a submit that
-- should simply score badly. The clamp is at the int4 ceiling rather than at
-- some tidier number so it can only ever fire where the alternative is an error.
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
	v_start public.gauntlet_knowledge_starts%rowtype;
	c_lb_to_g constant numeric := 453.59237;
	-- int4's ceiling, in ms. See the overflow note above section 4.
	c_ms_max constant numeric := 2147483647;
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
		-- 0148: THE CLOCK IS THE SERVER'S. `p_elapsed_ms` is not read on this
		-- path at all; what the caller sent is recorded in `value` as evidence.
		select * into v_start
		from public.gauntlet_knowledge_starts
		where user_id = v_uid and challenge_id = p_challenge_id
		for update;
		if not found then
			raise exception 'This question was not started on this device, so there is no timer to score it against. Reload the page and answer it again.';
		end if;

		v_elapsed_ms := least(
			greatest(floor(extract(epoch from (now() - v_start.started_at)) * 1000), 0),
			c_ms_max
		)::integer;
		v_score := round(v_elapsed_ms::numeric / 1000.0, 2);
		-- REBUILT, because `gauntlet_leaderboard`'s TIEBREAK is
		-- `(value ->> 'elapsed_ms')::numeric` and would otherwise still be ranking
		-- on a number the browser chose.
		v_value := coalesce(p_value, '{}'::jsonb) || jsonb_build_object(
			'elapsed_ms', v_elapsed_ms,
			'clock', 'server',
			'started_at', v_start.started_at,
			'client_elapsed_ms', p_elapsed_ms
		);

		-- The grading below is 0008's, unchanged: this file moves the clock, not
		-- the answer check.
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
			'score_metric', v_score,
			-- Was THIS submit the one the clock was running for. False on every
			-- later review attempt, so the surface can say the ranked time was set
			-- on the first answer instead of showing a four-figure number.
			'timed_attempt', v_start.answered_at is null
		);

		-- CLOSE THE CLOCK. `coalesce` rather than a plain assignment: the stamp is
		-- set once and never moved, which is what makes a later correct resubmit
		-- cost the whole detour through the answer key.
		update public.gauntlet_knowledge_starts
		set answered_at = coalesce(answered_at, now())
		where user_id = v_uid and challenge_id = p_challenge_id;
	elsif v_challenge.mode = 'speedrun' then
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

revoke all on function public.gauntlet_submit(uuid, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_submit(uuid, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Self-checks, and the read-only reports this file owes its operator.
--
-- These ASSERT THE CATALOG, not the guard's own verdict: a migration's own
-- check passing tells you the check ran, while reading `proacl` and
-- `has_function_privilege` back tells you what is actually granted.
--
-- The file raises rather than leaving a half-applied schema. Everything above
-- is `create table if not exists` / `create or replace`, so a raise here rolls
-- the whole transaction back and the file can simply be re-pasted.
-- ---------------------------------------------------------------------------
do $$
declare
	v_missing text[] := '{}';
	v_open text[] := '{}';
	v_n integer;
	v_frozen integer;
begin
	-- Structure landed.
	if to_regclass('public.gauntlet_knowledge_starts') is null then
		v_missing := v_missing || 'table gauntlet_knowledge_starts';
	end if;
	if not exists (
		select 1 from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = 'gauntlet_knowledge_starts' and c.relrowsecurity
	) then
		v_missing := v_missing || 'RLS on gauntlet_knowledge_starts';
	end if;
	if exists (
		select 1 from pg_policies
		where schemaname = 'public' and tablename = 'gauntlet_knowledge_starts'
	) then
		v_open := v_open || 'gauntlet_knowledge_starts has a policy (it must have none)';
	end if;

	-- The table is closed to both client roles, by grant as well as by RLS.
	if has_table_privilege('anon', 'public.gauntlet_knowledge_starts', 'select')
		or has_table_privilege('authenticated', 'public.gauntlet_knowledge_starts', 'select') then
		v_open := v_open || 'gauntlet_knowledge_starts is selectable by a client role';
	end if;

	-- EXACTLY ONE ARITY of each function: the signature trap says a function
	-- that gained a parameter leaves the old arity callable as a second
	-- overload. Neither gained one here, and this is what proves it.
	select count(*) into v_n from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'gauntlet_submit';
	if v_n <> 1 then
		v_open := v_open || format('gauntlet_submit has %s overloads, expected 1', v_n);
	end if;
	select count(*) into v_n from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'gauntlet_knowledge_start';
	if v_n <> 1 then
		v_open := v_open || format('gauntlet_knowledge_start has %s overloads, expected 1', v_n);
	end if;

	-- Grants. A function created after 0137 arrives granted to anon under the
	-- project's default privileges unless its own migration names the roles, so
	-- this is the assertion that the revoke above actually bit.
	if has_function_privilege('anon', 'public.gauntlet_knowledge_start(uuid)', 'execute') then
		v_open := v_open || 'gauntlet_knowledge_start is executable by anon';
	end if;
	if not has_function_privilege('authenticated', 'public.gauntlet_knowledge_start(uuid)', 'execute') then
		v_missing := v_missing || 'gauntlet_knowledge_start execute to authenticated';
	end if;
	if has_function_privilege('anon', 'public._gauntlet_knowledge_window()', 'execute')
		or has_function_privilege('authenticated', 'public._gauntlet_knowledge_window()', 'execute')
		or has_function_privilege('service_role', 'public._gauntlet_knowledge_window()', 'execute') then
		v_open := v_open || '_gauntlet_knowledge_window is executable by a client role';
	end if;
	if has_function_privilege('anon', 'public.gauntlet_submit(uuid, jsonb, integer)', 'execute') then
		v_open := v_open || 'gauntlet_submit is executable by anon';
	end if;

	-- The clock is actually read on the knowledge path. A body that still
	-- scored `p_elapsed_ms` there would pass every check above.
	if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'gauntlet_submit')
		not like '%gauntlet_knowledge_starts%' then
		v_missing := v_missing || 'gauntlet_submit does not read gauntlet_knowledge_starts';
	end if;

	if array_length(v_missing, 1) is not null or array_length(v_open, 1) is not null then
		raise exception E'0148 did not apply cleanly.\nMISSING: %\nOPEN: %',
			coalesce(array_to_string(v_missing, '; '), 'none'),
			coalesce(array_to_string(v_open, '; '), 'none');
	end if;

	-- Reports the operator should read against what the deployed app holds.
	select count(*) into v_n from public.gauntlet_knowledge_starts;
	select count(*) into v_frozen from public.gauntlet_knowledge_starts where answered_at is not null;
	raise notice '0148: attempt rows %, of which closed %.', v_n, v_frozen;

	select count(*) into v_n from public.submissions
	where mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error');
	raise notice '0148: % knowledge submissions already recorded. Their score_metric was client-supplied and is NOT rewritten by this file: it cannot be, because nothing anywhere recorded when those students were shown the question. Existing knowledge boards therefore keep whatever they hold until a student posts a server-timed row that beats it.', v_n;

	select count(*) into v_n from public.submissions
	where mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
		and coalesce((value ->> 'elapsed_ms')::numeric, -1) = 0;
	raise notice '0148: % of those claim an elapsed time of exactly 0 ms. That is the signature of the resubmit loop this file closes; it is reported rather than deleted, because a real 0 is also what a fast client rounds to and deciding what to do about a student row is not a migration''s call.', v_n;

	select count(*) into v_n from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname like 'gauntlet%';
	raise notice '0148: % gauntlet functions present.', v_n;
end;
$$;
