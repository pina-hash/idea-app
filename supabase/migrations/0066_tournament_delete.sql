-- 0066_tournament_delete.sql
-- IDEA Tournaments: deleting a tournament outright.
--
-- Phase 1 shipped no delete path at all -- entries can be removed pre-bracket,
-- qual pools can be regenerated, and a grand-final reset can be discarded, but
-- a tournament itself was permanent once created. This adds the one missing
-- lifecycle action, following the gauntlet_room_delete (0025) doctrine.
--
-- WHO: the tournament's own hosts (any tournament_hosts row -- 0062 documents
-- every host row as granting full control, and deletion is not carved out of
-- that), OR any teacher. The teacher clause is what makes this usable: a
-- teacher cleaning up somebody's abandoned test tournament is by definition
-- NOT one of its hosts, so a host-only rule would leave that case with no
-- route in at all. is_teacher() reads profiles.role, which 0001 derives from
-- the @boscotech.edu sign-in domain, so "teacher" and "@boscotech.edu account"
-- are the same set. Enforced INSIDE the function (the cross-user staff-write
-- convention); the UI gating is convenience.
--
-- THIS IS A HARD DELETE, and it is the one place the "permanent record"
-- stance on tournament_reward_ledger (0063) gives way. That stance is about
-- never rewriting history WITHIN a live tournament: you cannot un-pay a
-- competitor, and a correction mints nothing. Removing the entire tournament
-- is a different act -- it retracts the whole record rather than editing it --
-- and the alternative, a soft-deleted row that lingers forever, is worse in a
-- school tool where the common case is a teacher clearing out test events.
-- So the ledger goes with its tournament, and the friction lives in the
-- confirmation below rather than in a tombstone nobody can clear.
--
-- CONFIRMATION IS SERVER-SIDE, not merely a UI step: once a tournament has any
-- entries, the caller must pass its exact name back (case-insensitive,
-- trimmed). A tournament with no entries yet has nothing to lose, so it
-- deletes without one. Putting the check in the RPC means no client bug, stray
-- retry, or hand-rolled PostgREST call can destroy a real event by id alone.
--
-- THE TEARDOWN IS SPELLED OUT rather than left to ON DELETE CASCADE, the
-- gauntlet_room_delete rule: do it explicitly so it never depends on FK
-- on-delete configuration. Worth being precise about what that does and does
-- not buy, since the FK graph here looks more dangerous than it is:
-- tournament_entries is referenced ON DELETE RESTRICT from
-- tournament_qual_matches, tournament_bracket_matches,
-- tournament_match_games.winner_id and tournament_reward_ledger.entry_id, so a
-- bare `delete from tournaments` LOOKS like it should trip a RESTRICT. Tested
-- against a real Postgres, it does not -- the cascade reaches those
-- referencing tables and removes their rows before the RESTRICT checks on
-- tournament_entries are evaluated, so the bare delete succeeds today. The
-- explicit order below is therefore insurance, not a workaround: it keeps this
-- function correct if any of those FKs is ever re-declared, and it makes the
-- full blast radius of a deletion readable in one place instead of inferable
-- from twelve table definitions.
--
-- There is deliberately no audit row: tournament_match_events is scoped to the
-- tournament and goes with it, and inventing a separate global deletion log is
-- a bigger change than this one action warrants.
--
-- Apply manually in the Supabase SQL editor, after 0065.

create or replace function public.tournament_delete(
	p_tournament_id uuid,
	p_confirm_name text default null
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
	select count(*) into v_rewards
	from public.tournament_reward_ledger where tournament_id = p_tournament_id;

	-- Name confirmation, required as soon as there is anything to lose.
	if v_entries > 0
		and lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_t.name)) then
		raise exception
			'Type the tournament name exactly to confirm deletion: "%". This permanently removes % entries, % bracket matches and % reward payouts.',
			v_t.name, v_entries, v_matches, v_rewards;
	end if;

	-- Teardown, deepest dependency first. See the header for why this is not
	-- left to ON DELETE CASCADE.
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
		'reward_rows', v_rewards
	);
end;
$$;

revoke all on function public.tournament_delete(uuid, text) from public;
grant execute on function public.tournament_delete(uuid, text) to authenticated;
