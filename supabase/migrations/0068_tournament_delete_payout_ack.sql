-- 0068_tournament_delete_payout_ack.sql
-- IDEA Tournaments: a second, distinct confirmation for deleting a
-- tournament that has already paid out IDEA Coin rewards.
--
-- 0066's tournament_delete already takes the whole reward ledger with it as
-- part of a hard delete (see that file's header on why a hard delete is the
-- right call). That is still correct here -- this migration does not change
-- WHAT gets deleted or WHO may delete it. It adds one more piece of friction
-- specifically for the case that actually matters: real coins were already
-- credited to real students for this tournament, and deleting it erases that
-- record permanently with no way back.
--
-- TRIGGER: the tournament has any rows in tournament_reward_ledger at all
-- (v_rewards > 0, the same count 0066 already computed for its own message).
-- A tournament with no payouts is completely unaffected by this migration --
-- p_acknowledge_payout_loss is never consulted for it, so today's single-step
-- flow (or the no-entries no-step flow) is untouched.
--
-- NEW PARAMETER: p_acknowledge_payout_loss boolean default false, checked
-- BEFORE the existing name-match check so a caller who has not acknowledged
-- the payout loss never even reaches "type the name" -- the refusal names the
-- real numbers (total coins paid, distinct entries paid) so the caller has
-- what it needs to build the warning without a second round trip.
--
-- Requires dropping the old two-argument overload first: `create or replace`
-- keys on the exact parameter list, so simply adding a parameter would leave
-- the 0066 (uuid, text) signature in place as a second, unguarded overload
-- callable with the old two-argument shape.
--
-- Apply manually in the Supabase SQL editor, after 0067.

drop function if exists public.tournament_delete(uuid, text);

create or replace function public.tournament_delete(
	p_tournament_id uuid,
	p_confirm_name text default null,
	p_acknowledge_payout_loss boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_is_host boolean;
	v_entries integer;
	v_matches integer;
	v_rewards integer;
	v_reward_coins integer;
	v_reward_entries integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	-- Lock the row so a concurrent host mutation cannot interleave with the
	-- teardown below (the _tournament_require_host serialization rule).
	select * into v_t from public.tournaments where id = p_tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;

	select exists (
		select 1 from public.tournament_hosts
		where tournament_id = p_tournament_id and user_id = v_uid
	) into v_is_host;

	if not v_is_host and not public.is_teacher() then
		raise exception 'Only a host of this tournament, or a teacher, can delete it.';
	end if;

	select count(*) into v_entries
	from public.tournament_entries where tournament_id = p_tournament_id;
	select count(*) into v_matches
	from public.tournament_bracket_matches where tournament_id = p_tournament_id;
	select count(*), coalesce(sum(amount), 0), count(distinct entry_id)
	into v_rewards, v_reward_coins, v_reward_entries
	from public.tournament_reward_ledger where tournament_id = p_tournament_id;

	-- Payout acknowledgment, required as soon as there is a real reward
	-- record to lose. Checked before the name match so the caller learns the
	-- real numbers even if they have not yet gotten as far as typing a name.
	if v_rewards > 0 and not coalesce(p_acknowledge_payout_loss, false) then
		raise exception
			'This tournament has paid out % IDEA Coins to % % as reward payouts. Deleting it permanently erases that record. Acknowledge the payout loss to continue.',
			v_reward_coins,
			v_reward_entries,
			(case when v_reward_entries = 1 then 'entry' else 'entries' end);
	end if;

	-- Name confirmation, required as soon as there is anything to lose.
	if v_entries > 0
		and lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_t.name)) then
		raise exception
			'Type the tournament name exactly to confirm deletion: "%". This permanently removes % entries, % bracket matches and % reward payouts.',
			v_t.name, v_entries, v_matches, v_rewards;
	end if;

	-- Teardown, deepest dependency first. See 0066's header for why this is
	-- not left to ON DELETE CASCADE.
	delete from public.tournament_match_events where tournament_id = p_tournament_id;
	delete from public.tournament_reward_ledger where tournament_id = p_tournament_id;
	delete from public.tournament_reward_rules where tournament_id = p_tournament_id;
	delete from public.tournament_match_games where tournament_id = p_tournament_id;
	delete from public.tournament_bracket_matches where tournament_id = p_tournament_id;
	delete from public.tournament_qual_matches where tournament_id = p_tournament_id;
	delete from public.tournament_qual_pools where tournament_id = p_tournament_id;
	delete from public.tournament_entry_styles where tournament_id = p_tournament_id;
	delete from public.tournament_invites where tournament_id = p_tournament_id;
	delete from public.tournament_hosts where tournament_id = p_tournament_id;
	-- Drop the champion pointer before the entries it references.
	update public.tournaments set champion_entry_id = null where id = p_tournament_id;
	delete from public.tournament_entries where tournament_id = p_tournament_id;
	delete from public.tournaments where id = p_tournament_id;

	return jsonb_build_object(
		'deleted', true,
		'name', v_t.name,
		'entries', v_entries,
		'matches', v_matches,
		'reward_rows', v_rewards,
		'reward_coins', v_reward_coins,
		'reward_entries', v_reward_entries
	);
end;
$$;

revoke all on function public.tournament_delete(uuid, text, boolean) from public;
grant execute on function public.tournament_delete(uuid, text, boolean) to authenticated;
