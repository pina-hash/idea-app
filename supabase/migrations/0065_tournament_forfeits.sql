-- 0065_tournament_forfeits.sql
-- IDEA Tournaments, Phase 3a: forfeit / no-show handling.
--
-- The detail pages and the tournament-level stats added in this phase are
-- pure READS over data 0062 already captures (tournament_match_events,
-- started_at / completed_at, tournament_match_games, the 0063 ledger), so
-- they need no schema at all. This migration exists only for the forfeit
-- path.
--
-- What a forfeit is, and the four rules it follows (each one mirrors how a
-- BYE already behaves, deliberately, because neither is a contested win):
--
--   1. It ADVANCES exactly like a normal result. The forfeit path calls the
--      same _tournament_complete_match every other outcome does, so winner /
--      loser pointers, elimination, the grand-final reset, champion
--      settlement and the bye resolver all behave identically. There is no
--      parallel advancement code.
--   2. It PAYS NOTHING. The mechanism that already skips byes is structural:
--      byes complete through _tournament_resolve_byes, which never calls the
--      reward code, so only an ENTERED CONTESTED result ever pays. This
--      migration names that mechanism -- _tournament_award_match_win, lifted
--      verbatim out of the 0063 hook -- and calls it from the one contested
--      branch. A forfeit takes the other branch and therefore pays nothing
--      by the same rule as a bye, not by a second skip bolted on beside it.
--   3. It writes NO tournament_match_games rows (nothing was played). Any
--      that somehow exist for the match are cleared, so "no games" is an
--      invariant of the row, not an assumption about how it got here.
--   4. It logs as a 'completed' event with metadata { forfeit, reason,
--      forfeited_by }, exactly the way a bye logs as 'completed' with
--      { bye: true }. NO new event_type value.
--
-- The tournament_bracket_matches.forfeit column is not redundant with that
-- event: a bye is visually distinguishable from the ROW alone (an empty
-- slot), and every surface that lists match results -- the bracket, the host
-- console, the TV stage -- reads rows, never the event stream. The flag is
-- what lets those surfaces mark a forfeit without loading the audit log.
--
-- Entry point: tournament_submit_match_result, extended rather than
-- duplicated (same name, same signature, same grant), because a forfeit IS a
-- match result -- it just carries a winner and a reason instead of games:
--
--     { "forfeit": true, "winner_id": "<entry uuid>", "reason": "no-show" }
--
-- Unlike a normal result it is also accepted on a PENDING match: a no-show
-- is usually discovered before anyone starts the clock, and requiring the
-- host to start a match nobody turned up for would fabricate a started_at.
-- A forfeit therefore leaves started_at exactly as it found it (null when
-- the match never began), which keeps the timing data honest and keeps
-- forfeits out of the duration statistics.
--
-- DOUBLE NO-SHOW is deliberately NOT handled here. Both sides absent is a
-- judgement call about who (if anyone) advances, and a host can already
-- reach any outcome through tournament_correct_match_result. Automating it
-- would mean inventing a policy the spec does not have.
--
-- Apply manually in the Supabase SQL editor, after 0064. Idempotent where
-- practical.

-- ---------------------------------------------------------------------------
-- 1. Forfeit columns on the bracket match row
-- ---------------------------------------------------------------------------

alter table public.tournament_bracket_matches
	add column if not exists forfeit boolean not null default false;

alter table public.tournament_bracket_matches
	add column if not exists forfeit_reason text;

do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'tournament_bracket_matches_forfeit_reason_len'
	) then
		alter table public.tournament_bracket_matches
			add constraint tournament_bracket_matches_forfeit_reason_len
			check (forfeit_reason is null or char_length(btrim(forfeit_reason)) between 1 and 200);
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The reward mechanism, named
--
-- Lifted VERBATIM out of tournament_submit_match_result (0063 section 6c);
-- the amounts, the reasons, the winners-bracket-only round rule and the
-- two-rows-when-both-apply behaviour are unchanged. Giving it a name is what
-- makes "only a contested win pays" a single call site instead of an inline
-- block that a second outcome path would have to remember to skip.
-- ---------------------------------------------------------------------------

create or replace function public._tournament_award_match_win(
	p_match public.tournament_bracket_matches,
	p_winner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_amt integer;
begin
	select amount into v_amt from public.tournament_reward_rules
	where tournament_id = p_match.tournament_id and trigger_type = 'win';
	if v_amt is not null then
		perform public._tournament_award(p_match.tournament_id, p_winner_id, v_amt,
			'match win', p_match.id);
	end if;
	-- Winners bracket only: the grand final is round 1 of its own bracket and
	-- the losers bracket numbers rounds differently, so a raw cross-bracket
	-- match would misfire (0063's header documents this).
	if p_match.bracket = 'winners' then
		select amount into v_amt from public.tournament_reward_rules
		where tournament_id = p_match.tournament_id
			and trigger_type = 'round_reached' and trigger_value = p_match.round;
		if v_amt is not null then
			perform public._tournament_award(p_match.tournament_id, p_winner_id, v_amt,
				'reached round ' || p_match.round, p_match.id);
		end if;
	end if;
end;
$$;

revoke all on function public._tournament_award_match_win(
	public.tournament_bracket_matches, uuid
) from public;

-- ---------------------------------------------------------------------------
-- 3. tournament_submit_match_result: the 0063 body plus the forfeit branch
-- ---------------------------------------------------------------------------

create or replace function public.tournament_submit_match_result(p_match_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_m public.tournament_bracket_matches;
	v_t public.tournaments;
	v_winner uuid;
	v_forfeit boolean;
	v_reason text;
	v_loser uuid;
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id for update;
	if not found then
		raise exception 'Match not found.';
	end if;
	v_t := public._tournament_require_host(v_m.tournament_id);
	if v_t.status <> 'live' then
		raise exception 'The tournament is not live.';
	end if;

	v_forfeit := coalesce((p_result ->> 'forfeit')::boolean, false);

	if v_forfeit then
		-- A no-show is usually spotted before the clock starts, so pending is
		-- allowed here where an entered result requires in_progress.
		if v_m.status = 'complete' then
			raise exception 'This match is already complete; use a correction instead.';
		end if;
		if v_m.entry_a_id is null or v_m.entry_b_id is null then
			raise exception 'This match is still waiting on participants from earlier matches.';
		end if;
		begin
			v_winner := (p_result ->> 'winner_id')::uuid;
		exception when others then
			v_winner := null;
		end;
		if v_winner is null or v_winner not in (v_m.entry_a_id, v_m.entry_b_id) then
			raise exception 'Pick which side advances (one of the two participants).';
		end if;
		v_reason := btrim(coalesce(p_result ->> 'reason', ''));
		if v_reason = '' then
			raise exception 'Give a short reason for the forfeit (it is logged).';
		end if;
		if char_length(v_reason) > 200 then
			raise exception 'Keep the forfeit reason under 200 characters.';
		end if;
		v_loser := case when v_winner = v_m.entry_a_id then v_m.entry_b_id else v_m.entry_a_id end;

		-- Nothing was played: no games, ever. (Defensive -- a pending or
		-- in_progress match has none -- so "no games" is a row invariant.)
		delete from public.tournament_match_games where bracket_match_id = p_match_id;

		-- started_at is deliberately left as-is: null when the match never
		-- began, so the timeline reads honestly and the duration statistics
		-- skip it.
		update public.tournament_bracket_matches
		set forfeit = true, forfeit_reason = v_reason
		where id = p_match_id;

		-- Same completion path as every other outcome: advancement,
		-- elimination, the grand-final rules and champion settlement are
		-- shared code, not re-implemented here. The event is a 'completed'
		-- one carrying forfeit metadata, mirroring the bye's { bye: true }.
		perform public._tournament_complete_match(p_match_id, v_winner, 'completed', v_uid,
			jsonb_build_object('forfeit', true, 'reason', v_reason, 'forfeited_by', v_loser));

		-- No reward call at all: this is not a contested win. See the header.
	else
		if v_m.status <> 'in_progress' then
			raise exception 'Start the match before submitting its result (status: %).', v_m.status;
		end if;

		v_winner := public._tournament_write_games(v_m, p_result,
			coalesce((v_t.config ->> 'score_entry')::boolean, false));

		perform public._tournament_complete_match(p_match_id, v_winner, 'completed', v_uid,
			jsonb_build_object('games', p_result -> 'games'));

		-- The ONE contested-win branch, and therefore the one place rewards
		-- are paid. Byes never reach this function; forfeits take the branch
		-- above.
		perform public._tournament_award_match_win(v_m, v_winner);
	end if;

	perform public._tournament_resolve_byes(v_m.tournament_id, v_uid);

	select * into v_m from public.tournament_bracket_matches where id = p_match_id;
	select * into v_t from public.tournaments where id = v_m.tournament_id;
	return jsonb_build_object(
		'winner_id', v_winner,
		'forfeit', v_forfeit,
		'reset_created', v_m.bracket = 'grand_final' and exists (
			select 1 from public.tournament_bracket_matches
			where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset'
		),
		'champion_entry_id', v_t.champion_entry_id,
		'tournament_status', v_t.status
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. tournament_correct_match_result: the 0062 body plus clearing the flag
--
-- A correction replaces the outcome with an ENTERED, played result (it runs
-- _tournament_write_games), so a match corrected away from a forfeit is no
-- longer a forfeit and must stop reading as one everywhere. The correction
-- still mints no reward row -- unchanged from 0063, whose header explains
-- why the permanent ledger is never rewritten.
-- ---------------------------------------------------------------------------

create or replace function public.tournament_correct_match_result(
	p_match_id uuid,
	p_new_result jsonb,
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
	v_reset public.tournament_bracket_matches;
	v_old_winner uuid;
	v_new_winner uuid;
	v_was_forfeit boolean;
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id for update;
	if not found then
		raise exception 'Match not found.';
	end if;
	v_t := public._tournament_require_host(v_m.tournament_id);
	if p_reason is null or btrim(p_reason) = '' then
		raise exception 'Give a reason for the correction (it is logged).';
	end if;
	if v_m.status <> 'complete' then
		raise exception 'Only a completed match can be corrected (status: %).', v_m.status;
	end if;
	if v_m.entry_a_id is null or v_m.entry_b_id is null then
		raise exception 'A bye cannot be corrected; it has no entered result.';
	end if;

	-- Downstream safety: block on anything independently recorded.
	perform public._tournament_check_unwindable(v_m);
	if v_m.bracket = 'grand_final' then
		select * into v_reset from public.tournament_bracket_matches
		where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset' for update;
		if found and v_reset.status <> 'pending' then
			raise exception
				'Cannot correct the grand final: the reset match is already % and its outcome may depend on the wrong winner.',
				replace(v_reset.status, '_', ' ');
		end if;
	end if;

	v_old_winner := v_m.winner_id;
	v_was_forfeit := v_m.forfeit;
	perform public._tournament_unwind_downstream(v_m);

	-- Undo grand-final consequences before re-deriving them.
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

	-- The corrected outcome is a played result, so the forfeit flag is
	-- cleared before the games are written.
	if v_was_forfeit then
		update public.tournament_bracket_matches
		set forfeit = false, forfeit_reason = null
		where id = p_match_id;
		select * into v_m from public.tournament_bracket_matches where id = p_match_id;
	end if;

	v_new_winner := public._tournament_write_games(v_m, p_new_result,
		coalesce((v_t.config ->> 'score_entry')::boolean, false));

	perform public._tournament_complete_match(p_match_id, v_new_winner, 'corrected', v_uid,
		jsonb_build_object('reason', btrim(p_reason), 'previous_winner_id', v_old_winner,
			'previous_forfeit', v_was_forfeit, 'games', p_new_result -> 'games'));
	perform public._tournament_resolve_byes(v_m.tournament_id, v_uid);

	select * into v_t from public.tournaments where id = v_m.tournament_id;
	return jsonb_build_object(
		'previous_winner_id', v_old_winner,
		'winner_id', v_new_winner,
		'champion_entry_id', v_t.champion_entry_id,
		'tournament_status', v_t.status
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants: unchanged signatures, so create-or-replace kept the existing
-- ones. Re-issued for a clean apply.
-- ---------------------------------------------------------------------------

grant execute on function public.tournament_submit_match_result(uuid, jsonb) to authenticated;
grant execute on function public.tournament_correct_match_result(uuid, jsonb, text) to authenticated;
