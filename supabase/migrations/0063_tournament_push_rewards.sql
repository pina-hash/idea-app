-- 0063_tournament_push_rewards.sql
-- IDEA Tournaments, Phase 2a: web-push subscriptions + the match-pairing
-- notification claim column, and the reward engine + permanent reward ledger.
--
-- Builds on 0062 exactly as shipped. Two Phase 1 facts this migration's shape
-- follows from (do not "fix" them back toward any plan document):
--
--   * A tournament NEVER reaches status 'complete' through
--     tournament_set_status (that RPC only walks draft -> registration_open
--     <-> seeding). Completion happens inside _tournament_complete_match when
--     the grand final (or the reset) is decided. The placement-award hook
--     therefore lives THERE, on both completing branches.
--   * Every bracket win routes through _tournament_complete_match from THREE
--     paths: an entered result (tournament_submit_match_result), a bye
--     auto-completion (_tournament_resolve_byes), and a correction
--     (tournament_correct_match_result). Only the FIRST is a played, earned
--     win, so the win/round-bonus hook lives in tournament_submit_match_result
--     -- byes pay nothing (nothing was played) and corrections pay nothing
--     (the ledger is a permanent record; an erroneous earlier payout stays
--     visible rather than being silently rewritten, and no new row is minted
--     for the corrected winner).
--
-- Reward semantics (the judgment calls, so they are greppable later):
--   * 'win' rules pay the winner of any ENTERED bracket-match result, every
--     bracket including the grand final and reset. Qual matches never pay
--     (seeding only).
--   * 'round_reached' rules match the won match's own round number, WINNERS
--     BRACKET ONLY. The grand final is round 1 of its own bracket and the
--     losers bracket runs 2(R-1) differently-numbered rounds, so matching the
--     raw round across brackets would pay a "round 1" bonus to the grand-final
--     winner and double-pay round numbers that exist on both sides. Reason
--     label: 'reached round N'.
--   * 'placement' rules (trigger_value 1/2/3) settle ONCE, when the deciding
--     grand final (or reset) completes: champion = its winner, runner-up = its
--     loser, third = the entry eliminated in the losers final (the losers
--     match feeding the grand final's B side). N = 2 has no losers bracket and
--     therefore no third place. Settlement is guarded by the existence of any
--     ledger row with a null match_id (placement rows are the only such rows),
--     so a grand-final correction that un-completes and re-completes the
--     tournament cannot double-pay -- and deliberately does NOT claw back or
--     re-issue placements either.
--
-- Push model: the ledger of WHO to notify lives here (push_subscriptions +
-- the pair_notified_at claim column); the actual Web Push send happens in the
-- SvelteKit server (src/lib/server/push.ts), because VAPID signing + payload
-- encryption cannot run inside Postgres. tournament_ping_entry is therefore
-- the authorization + target-resolution half of ping: it re-checks the host
-- and returns the linked account to notify; the endpoint does the send.
--
-- Naming keeps the 0062 convention: tournament-scoped objects are prefixed
-- tournament_*; push_subscriptions / push_subscribe are PORTAL-WIDE (any
-- future feature may notify) and stay unprefixed like profiles.
--
-- Apply manually in the Supabase SQL editor, after 0062. Idempotent where
-- practical.

-- ---------------------------------------------------------------------------
-- 1. Push subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
	-- The push service URL IS the subscription's identity: one row per browser
	-- subscription. A device that signs into a different account re-upserts the
	-- same endpoint and the row follows the new account.
	endpoint text primary key check (char_length(endpoint) between 1 and 1000),
	user_id uuid not null references auth.users (id) on delete cascade,
	p256dh text not null check (char_length(p256dh) between 1 and 300),
	auth text not null check (char_length(auth) between 1 and 100),
	device_label text not null default '' check (char_length(device_label) <= 80),
	created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
alter table public.push_subscriptions enable row level security;

-- Own rows only ("alerts are on for N devices"); never public: endpoints are
-- capability URLs. Writes go through push_subscribe; sends read with the
-- service role, which bypasses RLS.
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions"
	on public.push_subscriptions
	for select
	to authenticated
	using (user_id = (select auth.uid()));

create or replace function public.push_subscribe(
	p_endpoint text,
	p_p256dh text,
	p_auth text,
	p_device_label text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		raise exception 'You must be signed in to enable notifications.';
	end if;
	if p_endpoint is null or btrim(p_endpoint) = '' or char_length(p_endpoint) > 1000
		or p_endpoint !~ '^https://' then
		raise exception 'Invalid push endpoint.';
	end if;
	if p_p256dh is null or btrim(p_p256dh) = '' or char_length(p_p256dh) > 300
		or p_auth is null or btrim(p_auth) = '' or char_length(p_auth) > 100 then
		raise exception 'Invalid push keys.';
	end if;
	-- Row-count ceiling per account (a real user has a handful of devices; a
	-- misbehaving client cannot grow the table unboundedly). Re-upserting an
	-- endpoint the account already holds always works.
	if not exists (
		select 1 from public.push_subscriptions
		where endpoint = btrim(p_endpoint) and user_id = v_uid
	) and (
		select count(*) from public.push_subscriptions where user_id = v_uid
	) >= 20 then
		raise exception 'Too many subscribed devices on this account.';
	end if;
	insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, device_label)
	values (btrim(p_endpoint), v_uid, btrim(p_p256dh), btrim(p_auth),
		left(coalesce(btrim(p_device_label), ''), 80))
	on conflict (endpoint) do update
	set user_id = excluded.user_id,
		p256dh = excluded.p256dh,
		auth = excluded.auth,
		device_label = excluded.device_label,
		created_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Match-pairing notification claim column
-- ---------------------------------------------------------------------------

-- Set by the SvelteKit push sweep (service role) the moment it CLAIMS a
-- fully-paired match for a "your next match is set" send: the claim is one
-- atomic UPDATE ... WHERE pair_notified_at IS NULL, so concurrent sweeps can
-- never double-send. Cleared by _tournament_set_slot whenever a correction's
-- unwind empties a slot, so a re-derived pairing notifies again.
alter table public.tournament_bracket_matches
	add column if not exists pair_notified_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Ping: host-authorized target resolution (the send happens server-side)
-- ---------------------------------------------------------------------------

create or replace function public.tournament_ping_entry(p_match_id uuid, p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_m public.tournament_bracket_matches;
	v_t public.tournaments;
	v_e public.tournament_entries;
	v_opp_name text;
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id;
	if not found then
		raise exception 'Match not found.';
	end if;
	v_t := public._tournament_require_host(v_m.tournament_id);
	-- Deliberately NO match-state check: a host may ping regardless of state.
	if p_entry_id is null
		or (p_entry_id is distinct from v_m.entry_a_id
			and p_entry_id is distinct from v_m.entry_b_id) then
		raise exception 'That entry is not in this match.';
	end if;
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if v_e.user_id is null then
		raise exception 'That entry has no linked account to notify.';
	end if;
	select display_name into v_opp_name from public.tournament_entries
	where id = case when v_m.entry_a_id = p_entry_id then v_m.entry_b_id else v_m.entry_a_id end;
	return jsonb_build_object(
		'tournament_id', v_m.tournament_id,
		'tournament_name', v_t.name,
		'user_id', v_e.user_id,
		'entry_name', v_e.display_name,
		'opponent_name', v_opp_name,
		'bracket', v_m.bracket,
		'round', v_m.round,
		'slot', v_m.slot
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reward rules + ledger
-- ---------------------------------------------------------------------------

create table if not exists public.tournament_reward_rules (
	id uuid primary key default gen_random_uuid(),
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	trigger_type text not null check (trigger_type in ('win', 'round_reached', 'placement')),
	-- Null for 'win'; the round number for 'round_reached'; 1/2/3 for 'placement'.
	trigger_value integer,
	amount integer not null check (amount >= 1),
	created_at timestamptz not null default now(),
	check (
		(trigger_type = 'win' and trigger_value is null)
		or (trigger_type = 'round_reached' and trigger_value between 1 and 20)
		or (trigger_type = 'placement' and trigger_value between 1 and 3)
	)
);

-- One rule per (type, value); coalesce folds 'win''s null into a single key.
create unique index if not exists tournament_reward_rules_one_per_trigger
	on public.tournament_reward_rules (tournament_id, trigger_type, coalesce(trigger_value, 0));

create table if not exists public.tournament_reward_ledger (
	id bigint generated always as identity primary key,
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	-- restrict: this is a permanent record; an entry with payouts cannot vanish
	-- from under it (entry removal is pre-bracket only, before any payout).
	entry_id uuid not null references public.tournament_entries (id) on delete restrict,
	-- Copied from the entry at award time; null for unlinked walk-ups.
	user_id uuid references auth.users (id) on delete set null,
	amount integer not null check (amount >= 1),
	-- Short label: 'match win', 'reached round N', '1st place', ...
	reason text not null check (char_length(reason) between 1 and 60),
	-- The won match; NULL exactly for placement awards (the once-per-tournament
	-- settlement guard keys on this).
	match_id uuid references public.tournament_bracket_matches (id) on delete set null,
	awarded_at timestamptz not null default now()
);

create index if not exists tournament_reward_ledger_tournament_idx
	on public.tournament_reward_ledger (tournament_id, awarded_at);
create index if not exists tournament_reward_ledger_entry_idx
	on public.tournament_reward_ledger (entry_id);

-- Public read, zero client writes: the 0062 doctrine. Insert-only by the
-- definer helpers below; there is no update or delete path at all.
do $$
declare
	v_table text;
begin
	foreach v_table in array array['tournament_reward_rules', 'tournament_reward_ledger'] loop
		execute format('revoke all on public.%I from anon, authenticated', v_table);
		execute format('grant select on public.%I to anon, authenticated', v_table);
		execute format('alter table public.%I enable row level security', v_table);
		execute format('drop policy if exists "public read" on public.%I', v_table);
		execute format(
			'create policy "public read" on public.%I for select to anon, authenticated using (true)',
			v_table
		);
	end loop;
end
$$;

-- Host-only full replacement of a tournament's rule set, one call.
create or replace function public.tournament_set_reward_rules(
	p_tournament_id uuid,
	p_rules jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_t public.tournaments;
	v_rule jsonb;
	v_type text;
	v_value integer;
	v_amount integer;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_t.status = 'complete' then
		raise exception 'Rewards are settled; rules cannot change after completion.';
	end if;
	if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
		raise exception 'Rules must be an array of { trigger_type, trigger_value, amount }.';
	end if;
	if jsonb_array_length(p_rules) > 40 then
		raise exception 'Too many rules (max 40).';
	end if;

	delete from public.tournament_reward_rules where tournament_id = p_tournament_id;

	for v_rule in select * from jsonb_array_elements(p_rules) loop
		v_type := v_rule ->> 'trigger_type';
		if v_type is null or v_type not in ('win', 'round_reached', 'placement') then
			raise exception 'Unknown trigger_type "%": use win, round_reached or placement.', v_type;
		end if;
		begin
			v_value := (v_rule ->> 'trigger_value')::integer;
		exception when others then
			raise exception 'trigger_value must be a whole number.';
		end;
		begin
			v_amount := (v_rule ->> 'amount')::integer;
		exception when others then
			raise exception 'amount must be a whole number.';
		end;
		if v_amount is null or v_amount < 1 then
			raise exception 'Every rule needs a positive whole amount.';
		end if;
		if v_type = 'win' then
			if v_value is not null then
				raise exception 'A win rule takes no trigger_value.';
			end if;
		elsif v_type = 'round_reached' then
			if v_value is null or v_value < 1 or v_value > 20 then
				raise exception 'A round_reached rule needs a round number from 1 to 20.';
			end if;
		else
			if v_value is null or v_value < 1 or v_value > 3 then
				raise exception 'A placement rule needs a trigger_value of 1, 2 or 3.';
			end if;
		end if;
		begin
			insert into public.tournament_reward_rules (tournament_id, trigger_type, trigger_value, amount)
			values (p_tournament_id, v_type, v_value, v_amount);
		exception when unique_violation then
			raise exception 'Duplicate rule: % % appears more than once.', v_type, coalesce(v_value::text, '');
		end;
	end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Award helpers (internal: no grants, definer-only callers)
-- ---------------------------------------------------------------------------

create or replace function public._tournament_award(
	p_tournament_id uuid,
	p_entry_id uuid,
	p_amount integer,
	p_reason text,
	p_match_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
	insert into public.tournament_reward_ledger
		(tournament_id, entry_id, user_id, amount, reason, match_id)
	select p_tournament_id, e.id, e.user_id, p_amount, p_reason, p_match_id
	from public.tournament_entries e
	where e.id = p_entry_id;
$$;

revoke all on function public._tournament_award(uuid, uuid, integer, text, uuid) from public;

-- Settles 1st/2nd/3rd exactly once (see the header for the guard + the
-- correction stance). Champion/runner-up come from the deciding match the
-- caller just completed; third is derived here.
create or replace function public._tournament_award_placements(
	p_tournament_id uuid,
	p_champion_id uuid,
	p_runner_up_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_third uuid;
	v_amt integer;
begin
	-- Placement rows are the only null-match rows: their existence means this
	-- tournament already settled (a corrected re-completion changes nothing).
	if exists (
		select 1 from public.tournament_reward_ledger
		where tournament_id = p_tournament_id and match_id is null
	) then
		return;
	end if;

	-- Third place: eliminated in the losers final -- the losers match whose
	-- winner advances to the grand final's B side. No such match (N = 2), a
	-- bye there, or a dead match all yield null -> no third-place award.
	select case when m.winner_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end
	into v_third
	from public.tournament_bracket_matches m
	join public.tournament_bracket_matches gf on gf.id = m.winner_to_match_id
	where m.tournament_id = p_tournament_id
		and m.bracket = 'losers'
		and gf.bracket = 'grand_final'
		and m.winner_to_pos = 'b'
		and m.winner_id is not null;

	select amount into v_amt from public.tournament_reward_rules
	where tournament_id = p_tournament_id and trigger_type = 'placement' and trigger_value = 1;
	if v_amt is not null and p_champion_id is not null then
		perform public._tournament_award(p_tournament_id, p_champion_id, v_amt, '1st place', null);
	end if;

	select amount into v_amt from public.tournament_reward_rules
	where tournament_id = p_tournament_id and trigger_type = 'placement' and trigger_value = 2;
	if v_amt is not null and p_runner_up_id is not null then
		perform public._tournament_award(p_tournament_id, p_runner_up_id, v_amt, '2nd place', null);
	end if;

	select amount into v_amt from public.tournament_reward_rules
	where tournament_id = p_tournament_id and trigger_type = 'placement' and trigger_value = 3;
	if v_amt is not null and v_third is not null then
		perform public._tournament_award(p_tournament_id, v_third, v_amt, '3rd place', null);
	end if;
end;
$$;

revoke all on function public._tournament_award_placements(uuid, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- 6. Hook points: three 0062 functions recreated verbatim + the hook lines.
-- ---------------------------------------------------------------------------

-- (a) _tournament_set_slot: emptying a slot (a correction's unwind is the only
-- caller that passes null) also clears the pairing-notification claim, so a
-- re-derived pairing notifies again.
create or replace function public._tournament_set_slot(p_match_id uuid, p_pos text, p_entry_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
	update public.tournament_bracket_matches
	set entry_a_id = case when p_pos = 'a' then p_entry_id else entry_a_id end,
		entry_b_id = case when p_pos = 'b' then p_entry_id else entry_b_id end,
		pair_notified_at = case when p_entry_id is null then null else pair_notified_at end
	where id = p_match_id;
$$;

-- (b) _tournament_complete_match: identical to 0062 plus the placement
-- settlement on BOTH tournament-completing branches (the only places status
-- ever becomes 'complete').
create or replace function public._tournament_complete_match(
	p_match_id uuid,
	p_winner_id uuid,
	p_event_type text,
	p_actor_id uuid,
	p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_m public.tournament_bracket_matches;
	v_loser uuid;
	v_reset_id uuid;
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id for update;
	if not found then
		raise exception 'Match not found.';
	end if;

	v_loser := case
		when p_winner_id is null then null
		when p_winner_id = v_m.entry_a_id then v_m.entry_b_id
		else v_m.entry_a_id
	end;

	update public.tournament_bracket_matches
	set status = 'complete', winner_id = p_winner_id, completed_at = now()
	where id = p_match_id;

	if p_winner_id is not null and v_m.winner_to_match_id is not null then
		perform public._tournament_set_slot(v_m.winner_to_match_id, v_m.winner_to_pos, p_winner_id);
	end if;
	if v_loser is not null and v_m.loser_to_match_id is not null then
		perform public._tournament_set_slot(v_m.loser_to_match_id, v_m.loser_to_pos, v_loser);
	end if;

	if v_m.bracket = 'grand_final' and p_winner_id is not null then
		if p_winner_id = v_m.entry_b_id then
			-- The losers-bracket finalist took game one of the final: bracket reset.
			if not exists (
				select 1 from public.tournament_bracket_matches
				where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset'
			) then
				insert into public.tournament_bracket_matches
					(tournament_id, bracket, round, slot, entry_a_id, entry_b_id, best_of)
				values
					(v_m.tournament_id, 'grand_final_reset', 1, 1,
						v_m.entry_a_id, v_m.entry_b_id, v_m.best_of)
				returning id into v_reset_id;
				perform public._tournament_log(v_m.tournament_id, 'bracket', v_reset_id, 'created',
					p_actor_id, jsonb_build_object('bracket', 'grand_final_reset', 'round', 1, 'slot', 1));
			end if;
		else
			update public.tournaments
			set status = 'complete', champion_entry_id = p_winner_id
			where id = v_m.tournament_id;
			perform public._tournament_award_placements(v_m.tournament_id, p_winner_id, v_loser);
		end if;
	elsif v_m.bracket = 'grand_final_reset' and p_winner_id is not null then
		update public.tournaments
		set status = 'complete', champion_entry_id = p_winner_id
		where id = v_m.tournament_id;
		perform public._tournament_award_placements(v_m.tournament_id, p_winner_id, v_loser);
	end if;

	perform public._tournament_log(v_m.tournament_id, 'bracket', p_match_id, p_event_type,
		p_actor_id,
		coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('winner_id', p_winner_id));
end;
$$;

-- (c) tournament_submit_match_result: identical to 0062 plus the win + round
-- bonus awards for this ENTERED result (byes and corrections never reach this
-- function, which is exactly the exclusion the header documents).
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
	v_amt integer;
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id for update;
	if not found then
		raise exception 'Match not found.';
	end if;
	v_t := public._tournament_require_host(v_m.tournament_id);
	if v_t.status <> 'live' then
		raise exception 'The tournament is not live.';
	end if;
	if v_m.status <> 'in_progress' then
		raise exception 'Start the match before submitting its result (status: %).', v_m.status;
	end if;

	v_winner := public._tournament_write_games(v_m, p_result,
		coalesce((v_t.config ->> 'score_entry')::boolean, false));

	perform public._tournament_complete_match(p_match_id, v_winner, 'completed', v_uid,
		jsonb_build_object('games', p_result -> 'games'));

	-- Reward engine: the flat win amount, plus a round bonus when a rule names
	-- this match's round (winners bracket only; two rows when both apply, so
	-- the ledger shows exactly why each payout happened).
	select amount into v_amt from public.tournament_reward_rules
	where tournament_id = v_m.tournament_id and trigger_type = 'win';
	if v_amt is not null then
		perform public._tournament_award(v_m.tournament_id, v_winner, v_amt, 'match win', p_match_id);
	end if;
	if v_m.bracket = 'winners' then
		select amount into v_amt from public.tournament_reward_rules
		where tournament_id = v_m.tournament_id
			and trigger_type = 'round_reached' and trigger_value = v_m.round;
		if v_amt is not null then
			perform public._tournament_award(v_m.tournament_id, v_winner, v_amt,
				'reached round ' || v_m.round, p_match_id);
		end if;
	end if;

	perform public._tournament_resolve_byes(v_m.tournament_id, v_uid);

	select * into v_m from public.tournament_bracket_matches where id = p_match_id;
	select * into v_t from public.tournaments where id = v_m.tournament_id;
	return jsonb_build_object(
		'winner_id', v_winner,
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
-- 7. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.push_subscribe(text, text, text, text) from public;
revoke all on function public.tournament_ping_entry(uuid, uuid) from public;
revoke all on function public.tournament_set_reward_rules(uuid, jsonb) from public;

grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.tournament_ping_entry(uuid, uuid) to authenticated;
grant execute on function public.tournament_set_reward_rules(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Realtime: the public tournament page shows the ledger (and the rules
-- summary) live; both are public-select so signed-out spectators get the
-- stream too. push_subscriptions is deliberately NOT published.
-- ---------------------------------------------------------------------------
do $$
declare
	v_table text;
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		foreach v_table in array array['tournament_reward_rules', 'tournament_reward_ledger'] loop
			if not exists (
				select 1 from pg_publication_tables
				where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
			) then
				execute format('alter publication supabase_realtime add table public.%I', v_table);
			end if;
		end loop;
	end if;
end
$$;
