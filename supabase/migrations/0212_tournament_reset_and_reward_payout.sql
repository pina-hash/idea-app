-- ---------------------------------------------------------------------------
-- 0212  TOURNAMENT: THE RESET THE REFUSAL ALREADY PROMISED, AND REWARDS THAT
--       ACTUALLY REACH A STUDENT'S COIN BALANCE.
--
-- Ledger 0207. Fixes findings 3a and 6a of the 2026-09-13 dry-run audit
-- (docs/audits/2026-09-13-tournament-dry-run.md), nine days before IDEA-Blade
-- runs on 2026-09-22 with real students in a room.
--
-- ===========================================================================
-- SECTION 1: tournament_reset_match  -- FINDING 3a
-- ===========================================================================
--
-- WHAT WAS WRONG. `_tournament_check_unwindable` (0062) admits only a downstream
-- match that is `pending` or an auto-completed bye. A downstream match that is
-- `in_progress` therefore BLOCKS a correction, and it does so with this text:
--
--     'Cannot correct this result: the downstream % match (round %, slot %) is
--      already % and its outcome may depend on the wrong winner. Correct or
--      reset that match first.'
--
-- There was no reset. The audit enumerated every `tournament_*` function across
-- 0062, 0063, 0065, 0066, 0068 and 0192 -- twenty-six of them -- and the only
-- writers of `status = 'pending'` on a bracket match were
-- `_tournament_unwind_downstream`, which sits BEHIND the check that just
-- refused. Correcting the downstream match instead is refused too, because
-- `tournament_correct_match_result` takes only a `complete` match. So once the
-- next match was started, the previous round's result was permanent, and the
-- only undo in the schema was deleting the entire tournament.
--
-- WHY BUILD IT RATHER THAN REWORD THE REFUSAL. Those were the two options and
-- this file takes the first, deliberately.
--
--   * A wrong score entered during a live bracket is the ORDINARY human error,
--     not an exotic one. In a room where the host starts matches promptly the
--     unrecoverable window is minutes wide.
--   * Rewording buys a host nothing. "Confirm a score before starting the next
--     match" is an operational rule, not a remedy: it tells somebody who has
--     ALREADY made the mistake that they should not have made it. The audit's
--     own item 5 could only offer that, and called it a thing Mr. Pina must
--     know rather than a thing the software does.
--   * The remedy the message names is the CORRECT one. Reset the downstream
--     match, then correct the upstream result. Building it makes a sentence
--     that is currently false into a sentence that is true, which is strictly
--     better than making it into a different sentence.
--
-- WHAT A RESET IS, AND WHAT IT IS NOT. It WITHDRAWS a match's outcome and puts
-- the match back to `pending` with its participants intact. It is not a
-- correction (it enters no new result), it is not a delete (the match, its
-- pointers and its audit trail all survive), and it settles nothing.
--
-- THE SAFETY RULE IS THE ONE THAT ALREADY EXISTS, CALLED AND NOT REIMPLEMENTED.
-- A reset runs `_tournament_check_unwindable` exactly as a correction does, so
-- it cannot orphan a result recorded independently further down; where it
-- refuses, the answer is to reset THAT match first, which terminates because
-- each step moves strictly closer to the leaves. Two spellings of "may this
-- ripple" is the pair that stops agreeing.
--
-- WHAT IT CLEARS, and why each one:
--   * the games rows      -- the result is withdrawn, so the scores go with it
--   * winner_id           -- there is no winner
--   * completed_at        -- it is not complete
--   * started_at          -- `pending` must mean pending; a pending match
--                            carrying a start time is a state no other path in
--                            this schema can produce, and `tournament_start_match`
--                            stamps a fresh one on the retry anyway
--   * forfeit + reason    -- a withdrawn forfeit is not a forfeit
-- It does NOT clear the match's own entry slots: those are the legitimate
-- output of the matches ABOVE it, which this call is not touching.
--
-- THE GRAND FINAL IS UNDONE THE SAME WAY THE CORRECTION UNDOES IT: the
-- `grand_final_reset` row is deleted, the tournament returns to `live` and
-- `champion_entry_id` goes back to null. That branch is copied from
-- `tournament_correct_match_result` (0065) rather than invented, because a
-- second idea of "what settling a champion consisted of" is how the two come
-- apart.
--
-- IT LOGS AS A 'corrected' EVENT CARRYING `{"reset": true}`, NOT AS A NEW EVENT
-- TYPE. `tournament_match_events.event_type` is a CHECK-constrained list and
-- every renderer switches on it; `MatchTimeline.svelte` falls through to the
-- raw string for anything unknown, so a new type would put the word "reset" on
-- a student's timeline with no label. The flavour-in-metadata shape is this
-- codebase's own convention for exactly this -- `eventIsBye` reads
-- 'completed' plus `{"bye": true}` the same way. A dedicated
-- "Result withdrawn" label in `MatchTimeline.svelte` is a one-line follow-up
-- and belongs to whoever owns that file; ledger 0207 did not.
--
-- ===========================================================================
-- SECTION 2: REWARDS REACH THE COIN LEDGER  -- FINDING 6a
-- ===========================================================================
--
-- WHAT WAS WRONG. `tournament_reward_ledger` was written by `_tournament_award`
-- and read by five tournament surfaces, and reached `coin_transactions`
-- NOWHERE. The panel said "Payout history" and rendered a bare gold `+60`
-- while the student's IDEA Coin balance had not moved and would not until an
-- admin logged `competition_winnings` by hand. MR. PINA'S ANSWER, 2026-09-13:
-- MAKE IT PAY.
--
-- THE HOOK IS `_tournament_award` AND NOTHING ELSE, because it is already the
-- single write point: `_tournament_award_match_win` and
-- `_tournament_award_placements` both call it, so wiring it here covers a match
-- win, a round bonus and every placement with one change that cannot drift.
--
-- IT MINTS THROUGH `_coin_insert`, NOT `coin_log_transaction`, AND 0145 IS THE
-- PRECEDENT. Every public coin write function opens with
-- 'Only site admins can log IDEA Coin transactions.', and a tournament host is
-- routinely a teacher who is not an admin -- so calling the public path would
-- raise at exactly the person the feature is for. 0145 (the classroom song
-- queue) is the first deliberate exception of this shape and this is the
-- second; `_coin_insert` is THE row shape and is called rather than
-- re-implemented, and it stamps `actor_email` from `current_user_email()`,
-- which is the host who completed the match. That is right: they are who
-- awarded it.
--
-- THE MEDIUM IS 'digital', for 0145's reason: nobody hands over a physical coin
-- when a bracket advances.
--
-- FOUR STANDING RULES, EACH HELD AND EACH PROVEN IN THE TESTS:
--
--   1. A NEGATIVE BALANCE NEVER WITHHOLDS WINNINGS. The debt lockout is
--      `kind = 'purchase' and balance < 0` (0070), and `competition_winnings`
--      is `kind = 'award'`, so the rule does not reach it -- and this path does
--      not consult a balance at all. A winner in debt is paid in full.
--   2. ENTERING STILL CANNOT COST COINS. The three refusing layers are
--      untouched: `trigger_type in ('win','round_reached','placement')` with no
--      entry trigger, `check (amount >= 1)` on both reward tables, and the
--      RPC's own 'Every rule needs a positive whole amount.' Nothing below
--      weakens any of them, and because `amount >= 1` the signed value handed
--      to `_coin_insert` is positive by construction: a tournament reward can
--      only ever be a CREDIT.
--   3. VALIDATE BEFORE YOU WRITE, NEVER AFTER. The category is resolved ONCE,
--      before the loop, and a coin row is minted only for a reward row whose
--      recipient resolves to an email. Nothing is written on a path that then
--      refuses.
--   4. NOTHING IS PAID TWICE. `coin_transaction_id` is UNIQUE and a row is
--      linked in the same statement that mints it.
--
-- AND THE ONE THAT DECIDES THE SHAPE: A COIN PROBLEM MUST NEVER BLOCK A MATCH.
-- If `competition_winnings` is missing, retired or reshaped, this does NOT
-- raise -- it writes the reward row and leaves `coin_transaction_id` null. The
-- alternative is a host unable to record a result because a price-list row was
-- retired, which gates a COMPETITION OUTCOME on the coin system and is the
-- larger of the two failures by a wide margin. 0145 refuses in the same
-- situation and is right to: there, refusing leaves a song request pending and
-- recoverable, so nothing is lost. Here, refusing would strand the bracket.
-- An unpaid row is visible as unpaid on the panel and can be settled by hand.
--
-- A REGISTRANT WITH NO ACCOUNT IS UNPAID FOR THE SAME REASON AND SAYS SO.
-- `coin_transactions` is EMAIL-keyed and a `tournament_entry_members` row may
-- be an unlinked walk-up with `user_id` null (0192). There is no address to pay
-- and inventing one is not available, so the reward row stands unpaid rather
-- than being silently skipped. The uuid-to-email bridge is
-- `_notebook_email_for_user` -- the 0094 one, called and not copied under a
-- `_tournament_` name, per CLAUDE.md's rule about the one mapping this codebase
-- is most careful about.
--
-- ===========================================================================
-- GRANTS: 0166's SHAPE, AND 0201 IS WHY THAT IS A RULE.
-- ===========================================================================
-- A hosted Supabase project bootstraps
-- `alter default privileges ... grant execute on functions to anon,
-- authenticated, service_role`, which writes a DIRECT `anon` grant into every
-- new function at creation time. `revoke ... from public` removes one entry and
-- leaves that one standing. 0201 invented its own shape and left ten functions,
-- four tables and three sequences anon-reachable on production. So every
-- function below revokes from `public, anon, authenticated` BY NAME and then
-- grants back exactly who should hold it.
--
-- TO UNDO: drop function public.tournament_reset_match(uuid, text); restore
-- public._tournament_award(uuid, uuid, integer, text, uuid) from
-- 0192 section 5 (its `language sql` per-member insert); alter table
-- public.tournament_reward_ledger drop column coin_transaction_id. Dropping the
-- column DISCARDS THE LINK between a reward row and the coin row it minted;
-- the coin rows themselves are untouched and keep their `meta` back-reference.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. PRECONDITIONS. A migration refuses rather than half-applying.
-- ---------------------------------------------------------------------------
do $precheck$
declare
	v_missing text[] := '{}';
begin
	if to_regclass('public.tournament_bracket_matches') is null then
		v_missing := v_missing || 'tournament_bracket_matches (0062)';
	end if;
	if to_regclass('public.tournament_reward_ledger') is null then
		v_missing := v_missing || 'tournament_reward_ledger (0063)';
	end if;
	if to_regclass('public.coin_transactions') is null then
		v_missing := v_missing || 'coin_transactions (0070)';
	end if;
	if to_regclass('public.tournament_entry_members') is null then
		v_missing := v_missing || 'tournament_entry_members (0192)';
	end if;
	if array_length(v_missing, 1) is not null then
		raise exception
			'0212 needs these to exist first and they do not: %. Apply the chain in order.',
			array_to_string(v_missing, ', ');
	end if;

	-- Section 2 pays through this category. Its ABSENCE is a chain problem and
	-- refuses here; its being RETIRED later is a runtime state the award path
	-- handles by leaving a row unpaid (see the header).
	if not exists (select 1 from public.coin_categories where id = 'competition_winnings') then
		raise exception
			'0212: coin_categories has no competition_winnings row. 0070 is the file that creates it -- this database has not had it applied, and 0212 will not invent a price-list entry.';
	end if;

	-- The 8-argument `_coin_insert` (0096, the medium parameter) is the one
	-- section 2 calls. The 6-argument 0070 form would silently land these rows
	-- on the PHYSICAL balance.
	if not exists (
		select 1 from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = '_coin_insert' and p.pronargs = 8
	) then
		raise exception
			'0212: public._coin_insert/8 (the 0096 medium form) is not present. Apply 0096 first.';
	end if;
end;
$precheck$;

-- ---------------------------------------------------------------------------
-- 1. tournament_reset_match: withdraw a match's outcome, back to pending.
-- ---------------------------------------------------------------------------
create or replace function public.tournament_reset_match(
	p_match_id uuid,
	p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_m public.tournament_bracket_matches;
	v_t public.tournaments;
	v_gfr public.tournament_bracket_matches;
	v_old_winner uuid;
	v_old_status text;
	v_was_forfeit boolean;
begin
	select * into v_m from public.tournament_bracket_matches
	where id = p_match_id for update;
	if not found then
		raise exception 'Match not found.';
	end if;

	v_t := public._tournament_require_host(v_m.tournament_id);

	if p_reason is null or btrim(p_reason) = '' then
		raise exception 'Give a reason for the reset (it is logged).';
	end if;
	if char_length(btrim(p_reason)) > 200 then
		raise exception 'Keep the reset reason to 200 characters or fewer.';
	end if;

	if v_m.status = 'pending' then
		raise exception
			'This match has not been started, so there is no result to withdraw.';
	end if;

	-- A bye is DERIVED, never entered. `_tournament_resolve_byes` re-decides it
	-- from the bracket on every pass, so a reset would either be undone
	-- immediately or strand a slot nothing can fill.
	if v_m.status = 'complete' and (v_m.entry_a_id is null or v_m.entry_b_id is null) then
		raise exception
			'A bye cannot be reset; it is derived from the bracket and re-resolves itself. Reset or correct the match that fed it.';
	end if;

	-- Same downstream rule as a correction, CALLED and not restated.
	perform public._tournament_check_unwindable(v_m);

	if v_m.bracket = 'grand_final' then
		select * into v_gfr from public.tournament_bracket_matches
		where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset'
		for update;
		if found and v_gfr.status <> 'pending' then
			raise exception
				'Cannot reset the grand final: the bracket reset match is already % and its outcome depends on this result.',
				replace(v_gfr.status, '_', ' ');
		end if;
	end if;

	v_old_winner := v_m.winner_id;
	v_old_status := v_m.status;
	v_was_forfeit := v_m.forfeit;

	perform public._tournament_unwind_downstream(v_m);

	-- Undo the grand-final consequences, exactly as the correction does.
	if v_m.bracket = 'grand_final' then
		delete from public.tournament_bracket_matches
		where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset';
		update public.tournaments
		set status = 'live', champion_entry_id = null
		where id = v_m.tournament_id and status = 'complete';
	elsif v_m.bracket = 'grand_final_reset' then
		update public.tournaments
		set status = 'live', champion_entry_id = null
		where id = v_m.tournament_id and status = 'complete';
	end if;

	delete from public.tournament_match_games where bracket_match_id = p_match_id;

	update public.tournament_bracket_matches
	set status = 'pending',
		winner_id = null,
		completed_at = null,
		started_at = null,
		forfeit = false,
		forfeit_reason = null
	where id = p_match_id;

	perform public._tournament_log(
		v_m.tournament_id, 'bracket', p_match_id, 'corrected', v_uid,
		jsonb_build_object(
			'reset', true,
			'reason', btrim(p_reason),
			'previous_winner_id', v_old_winner,
			'previous_status', v_old_status,
			'previous_forfeit', v_was_forfeit
		)
	);

	-- Symmetry with the correction path: re-derive whatever the unwind exposed.
	-- Nothing new can become resolvable here (a reset only ever makes the
	-- bracket less complete), so this is a no-op in every measured case.
	perform public._tournament_resolve_byes(v_m.tournament_id, v_uid);

	select * into v_t from public.tournaments where id = v_m.tournament_id;
	return jsonb_build_object(
		'ok', true,
		'match_id', p_match_id,
		'status', 'pending',
		'previous_status', v_old_status,
		'previous_winner_id', v_old_winner,
		'previous_forfeit', v_was_forfeit,
		'tournament_status', v_t.status,
		'champion_entry_id', v_t.champion_entry_id
	);
end;
$$;

revoke all on function public.tournament_reset_match(uuid, text)
	from public, anon, authenticated;
grant execute on function public.tournament_reset_match(uuid, text) to authenticated;

comment on function public.tournament_reset_match(uuid, text) is
'Withdraws a bracket match''s outcome and returns it to pending with its participants intact, so an upstream result can then be corrected. Host only, reason required and logged as a ''corrected'' event carrying {"reset": true}. Refuses a pending match (nothing to withdraw) and a bye (derived, re-resolves itself), and runs the same _tournament_check_unwindable a correction runs, so it cannot orphan a result recorded independently downstream. This is the remedy 0062''s own refusal text has always named.';

-- ---------------------------------------------------------------------------
-- 2. The link column. Null means "this reward has not reached a coin balance".
-- ---------------------------------------------------------------------------
alter table public.tournament_reward_ledger
	add column if not exists coin_transaction_id uuid
		references public.coin_transactions (id) on delete set null;

do $link$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'tournament_reward_ledger_coin_txn_unique'
	) then
		alter table public.tournament_reward_ledger
			add constraint tournament_reward_ledger_coin_txn_unique
			unique (coin_transaction_id);
	end if;
end;
$link$;

comment on column public.tournament_reward_ledger.coin_transaction_id is
'The coin_transactions row this reward minted, or NULL when it reached no balance: an unlinked walk-up registrant with no account, or a competition_winnings category that was missing or retired at award time. Never blocks a match. UNIQUE, so a reward cannot pay twice. Rows written before 0212 are all null and were genuinely never paid.';

-- ---------------------------------------------------------------------------
-- 3. _tournament_award: the reward rows, then the coin rows.
--
-- Section 1 of the body is 0192's per-member select VERBATIM, including its
-- ordering (captain first, then roster order), so ledger row ids are assigned
-- exactly as before and every existing assertion about their order holds. The
-- language moves from `sql` to `plpgsql`; the signature does not, so no caller
-- and no grant changes and there is no deploy ordering.
-- ---------------------------------------------------------------------------
create or replace function public._tournament_award(
	p_tournament_id uuid,
	p_entry_id uuid,
	p_amount integer,
	p_reason text,
	p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row record;
	v_email text;
	v_txn public.coin_transactions;
	v_payable boolean;
	v_tname text;
begin
	-- VALIDATE BEFORE WRITING ANYTHING TO A BALANCE. Resolved once, ahead of
	-- the loop. A retired or reshaped category makes this false and every row
	-- below is written unpaid rather than raising -- see the header for why a
	-- coin problem may not strand a bracket.
	select exists (
		select 1 from public.coin_categories c
		where c.id = 'competition_winnings' and c.active and c.kind = 'award'
	) into v_payable;

	select t.name into v_tname from public.tournaments t where t.id = p_tournament_id;

	for v_row in
		with ins as (
			-- 0192 award: one row per member (begin)
			insert into public.tournament_reward_ledger
				(tournament_id, entry_id, user_id, amount, reason, match_id, member_id)
			select x.tournament_id, x.entry_id, x.user_id, x.amount, x.reason, x.match_id, x.member_id
			from (
				select p_tournament_id as tournament_id, e.id as entry_id, m.user_id, p_amount as amount,
					p_reason as reason, p_match_id as match_id, m.id as member_id,
					(m.user_id is not null and m.user_id = e.user_id) as is_captain,
					m.created_at as member_created
				from public.tournament_entries e
				join public.tournament_entry_members m on m.entry_id = e.id
				where e.id = p_entry_id
				union all
				-- The legacy row, ONLY for an entry with no member rows at all, so a
				-- payout is never silently skipped.
				select p_tournament_id, e.id, e.user_id, p_amount, p_reason, p_match_id, null::uuid,
					true, e.created_at
				from public.tournament_entries e
				where e.id = p_entry_id
					and not exists (select 1 from public.tournament_entry_members m where m.entry_id = e.id)
			) x
			order by x.is_captain desc, x.member_created asc, x.member_id asc
			-- 0192 award: one row per member (end)
			returning id, user_id, amount, member_id
		)
		select id, user_id, amount, member_id from ins order by id
	loop
		if not v_payable then
			continue;
		end if;

		-- The 0094 bridge, called and not copied. Null for an unlinked walk-up
		-- with no account: there is no address to pay, so the reward row stands
		-- and stands UNPAID.
		v_email := public._notebook_email_for_user(v_row.user_id);
		if v_email is null then
			continue;
		end if;

		-- A reward is an AWARD and `tournament_reward_rules.amount >= 1`, so the
		-- signed value is positive by construction: this can only ever credit.
		-- No balance is read and no debt gate applies -- the lockout is
		-- purchases-only, and a winner in debt is still paid.
		v_txn := public._coin_insert(
			v_email,
			'competition_winnings',
			v_row.amount,
			null,
			left(coalesce(v_tname, 'Tournament') || ': ' || p_reason, 500),
			jsonb_build_object(
				'tournament_id', p_tournament_id,
				'entry_id', p_entry_id,
				'match_id', p_match_id,
				'reward_id', v_row.id,
				'member_id', v_row.member_id
			),
			'digital'
		);

		update public.tournament_reward_ledger
		set coin_transaction_id = v_txn.id
		where id = v_row.id;
	end loop;
end;
$$;

revoke all on function public._tournament_award(uuid, uuid, integer, text, uuid)
	from public, anon, authenticated;

comment on function public._tournament_award(uuid, uuid, integer, text, uuid) is
'Writes one tournament_reward_ledger row per registrant of the entry (0192) and mints the matching coin_transactions row for each registrant who has an account (0212). Internal: definer-only callers, no grants. Credits only. A missing or retired competition_winnings category, or a registrant with no account, leaves the reward row written and coin_transaction_id null -- a coin problem never blocks a match.';

-- ---------------------------------------------------------------------------
-- 4. Self-check. Everything below reads the catalog back; a passing guard tells
--    you the guard ran, so these read what is actually there.
-- ---------------------------------------------------------------------------
do $verify$
declare
	v_n integer;
	v_anon boolean;
begin
	select count(*) into v_n from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'tournament_reset_match';
	if v_n <> 1 then
		raise exception '0212: expected exactly one tournament_reset_match, found %.', v_n;
	end if;

	select count(*) into v_n from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_tournament_award';
	if v_n <> 1 then
		raise exception '0212: expected exactly one _tournament_award, found %.', v_n;
	end if;

	-- The grant that matters, read back rather than assumed. 0201's ten
	-- anon-reachable functions are why this is asserted and not trusted.
	select has_function_privilege('anon', 'public.tournament_reset_match(uuid, text)', 'execute')
	into v_anon;
	if v_anon then
		raise exception
			'0212: tournament_reset_match is EXECUTABLE BY anon. The revoke did not name the role.';
	end if;
	select has_function_privilege('anon', 'public._tournament_award(uuid, uuid, integer, text, uuid)', 'execute')
	into v_anon;
	if v_anon then
		raise exception '0212: _tournament_award is EXECUTABLE BY anon.';
	end if;
	if not has_function_privilege(
		'authenticated', 'public.tournament_reset_match(uuid, text)', 'execute'
	) then
		raise exception
			'0212: tournament_reset_match is not executable by authenticated; a host cannot call it.';
	end if;
	if has_function_privilege(
		'authenticated', 'public._tournament_award(uuid, uuid, integer, text, uuid)', 'execute'
	) then
		raise exception
			'0212: _tournament_award is executable by authenticated; it is a definer-only internal.';
	end if;

	if not exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'tournament_reward_ledger'
			and column_name = 'coin_transaction_id'
	) then
		raise exception '0212: tournament_reward_ledger.coin_transaction_id was not added.';
	end if;

	select count(*) into v_n from public.tournament_reward_ledger;
	raise notice '0212: applied. % existing reward row(s), all of them unpaid by definition (they predate the coin link).', v_n;
end;
$verify$;
