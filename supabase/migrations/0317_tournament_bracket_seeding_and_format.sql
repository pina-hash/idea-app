-- 0317_tournament_bracket_seeding_and_format.sql
--
-- TOURNAMENTS: GENERATE BRACKET WORKS AGAIN, THE FORMAT STAYS EDITABLE UNTIL
-- THE FIRST RESULT, AND EVERY SETUP READ AN ADMIN NEEDS IS ONE CALL (ledger
-- 0455, docs/feedback/2026-10-28/QUEUE-0455.md item 1; reports c940fc00,
-- 6aa5ba19, 544604c9, c6830880, d4c2b43e).
--
-- 1. "UPDATE REQUIRES A WHERE CLAUSE" (c940fc00, and the seeding report
--    6aa5ba19, which is the same failure seen from the seeding step). The
--    message is pg-safeupdate's, which the hosted project loads for API
--    requests: it refuses an UPDATE or DELETE whose top level has no WHERE.
--    `_tournament_qual_seed_order` (0062) fills its temporary standings table
--    with two updates that have none:
--        update pg_temp._t_standings s set wins = (...), ..., pa = (...);
--        update pg_temp._t_standings set win_pct = ..., rand_key = random();
--    Only a tournament with qualifying pools reaches it, from
--    `tournament_generate_bracket`, so a seeded tournament could never draw its
--    bracket through the site or the connector, and an unseeded one always
--    could. IDEA-Blade Rotation 2 (tournament 2b5723ca, Oct 27) is that case.
--    A scan of every migration for an UPDATE or DELETE with no top-level WHERE
--    found these two and six others; the six are one-time migration bodies or
--    coin and Foundry functions outside this lane, listed in the history entry.
--    The fix is the WHERE each one always meant (`entry_id is not null`, true
--    of every row: it is the primary key). Nothing else in the body moves.
--
-- 2. THE FORMAT IS EDITABLE UNTIL THE FIRST RESULT (544604c9). `tournament_update`
--    refused any format once the bracket existed, so changing best of 1 to best
--    of 3, then wanting a longer final, meant rebuilding the tournament twice on
--    Oct 27. Now a host may change the match length (`best_of_default`) and the
--    final's (`best_of.grand_final`, and any per-round override) while the
--    bracket is live AND no match has a result: no match complete other than a
--    bye, none in progress, no game recorded. Every unplayed match is re-stamped
--    to the new length in the same statement. Qualifying, scoring and team size
--    stay locked once live (the bracket was drawn from them). After the first
--    result the old lock answers, in its old words; an admin still has 0266's
--    previewed live change for that.
--
-- 3. ONE READ FOR SETUP (d4c2b43e). The connector's tournament reads were
--    `tournament_reward_settlement` (a public read of whether coins were paid),
--    so a setup conversation had nothing to read the format, entries, seeds,
--    pools or rules with and fell back to Chrome. `tournament_setup_state`
--    answers all of it for a host or an admin, and `tournament_list_admin`
--    lists every tournament with its status. Both are reads (no writes), so the
--    connector runs them at once.
--
-- 4. PICK A PERSON FROM A LIST (c6830880). `tournament_people_search` is the
--    host console's directory: a host or an admin types two letters of a name
--    or a school address and picks; the invite, co-host and teammate rows take
--    the picked address. School accounts only, at most 12, and a chosen display
--    name replaces the account name (the identity rule), as 0237's
--    `foundry_people_search` does.
--
-- ADDITIVE AND IDEMPOTENT. Every signature is unchanged (`create or replace`)
-- or new, so the deploy and this file land in either order: a deployed client
-- calls only what already exists, and a new client degrades on PGRST202 alone.
--
-- WHAT UNDOES IT, a person's paste:
--   re-run 0062's `_tournament_qual_seed_order` and `tournament_generate_bracket`
--   (sections 4 and 9) and 0192's `tournament_update` (section 5);
--   drop function if exists public._tournament_has_result(uuid),
--     public.tournament_setup_state(uuid), public.tournament_list_admin(),
--     public.tournament_people_search(uuid, text, integer);

do $pre$
begin
	if to_regclass('public.tournament_entry_members') is null then
		raise exception '0317 cannot apply: tournament_entry_members does not exist. Apply 0192 first.';
	end if;
	if to_regprocedure('public.tournament_live_config_apply(uuid, jsonb, jsonb)') is null then
		raise exception '0317 cannot apply: tournament_live_config_apply does not exist. Apply 0266 first.';
	end if;
	if to_regclass('public.coin_tournament_settlements') is null then
		raise exception '0317 cannot apply: coin_tournament_settlements does not exist. Apply 0248 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. A RESULT EXISTS. The first object is new, so the apply probe can see this
--    file landed. A bye or a dead match completes itself at generation and is
--    not a result; a forfeit, a started match or a recorded game is.
-- ---------------------------------------------------------------------------

create or replace function public._tournament_has_result(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.tournament_bracket_matches m
		where m.tournament_id = p_tournament_id
			and (m.status = 'in_progress'
				or (m.status = 'complete' and m.entry_a_id is not null and m.entry_b_id is not null))
	) or exists (
		select 1 from public.tournament_match_games g where g.tournament_id = p_tournament_id
	);
$$;
revoke all on function public._tournament_has_result(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The seeding standings, 0062 section 4's body with the two WHEREs marked
--    0317. Same signature; its grant line is 0062's, restated with the roles.
-- ---------------------------------------------------------------------------

create or replace function public._tournament_qual_seed_order(p_tournament_id uuid, p_actor_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_pool record;
	v_remaining uuid[];
	v_cands uuid[];
	v_narrowed uuid[];
	v_pick uuid;
	v_pos integer;
	v_group record;
begin
	drop table if exists _t_standings;
	create temp table _t_standings (
		entry_id uuid primary key,
		pool_id uuid,
		pool_number integer,
		wins integer default 0,
		games integer default 0,
		pf integer default 0,
		pa integer default 0,
		win_pct numeric default 0,
		diff integer default 0,
		pool_position integer,
		rand_key double precision
	) on commit drop;

	insert into pg_temp._t_standings (entry_id, pool_id, pool_number)
	select distinct v.e, m.pool_id, p.pool_number
	from public.tournament_qual_matches m
	join public.tournament_qual_pools p on p.id = m.pool_id
	cross join lateral (values (m.entry_a_id), (m.entry_b_id)) v(e)
	where m.tournament_id = p_tournament_id;

	update pg_temp._t_standings s set
		wins = (
			select count(*) from public.tournament_qual_matches m
			where m.tournament_id = p_tournament_id and m.winner_id = s.entry_id
		),
		games = (
			select count(*) from public.tournament_qual_matches m
			where m.tournament_id = p_tournament_id
				and (m.entry_a_id = s.entry_id or m.entry_b_id = s.entry_id)
		),
		pf = coalesce((
			select sum(case when m.entry_a_id = s.entry_id then m.score_a else m.score_b end)
			from public.tournament_qual_matches m
			where m.tournament_id = p_tournament_id
				and (m.entry_a_id = s.entry_id or m.entry_b_id = s.entry_id)
				and m.score_a is not null and m.score_b is not null
		), 0),
		pa = coalesce((
			select sum(case when m.entry_a_id = s.entry_id then m.score_b else m.score_a end)
			from public.tournament_qual_matches m
			where m.tournament_id = p_tournament_id
				and (m.entry_a_id = s.entry_id or m.entry_b_id = s.entry_id)
				and m.score_a is not null and m.score_b is not null
		), 0)
	-- 0317: the WHERE clause pg-safeupdate demands of an API request.
	where s.entry_id is not null;

	update pg_temp._t_standings set
		win_pct = case when games > 0 then wins::numeric / games else 0 end,
		diff = pf - pa,
		rand_key = random()
	-- 0317: the same.
	where entry_id is not null;

	-- Rank within each pool.
	for v_pool in select distinct pool_id, pool_number from pg_temp._t_standings loop
		v_remaining := array(
			select entry_id from pg_temp._t_standings where pool_id = v_pool.pool_id
		);
		v_pos := 1;
		while coalesce(array_length(v_remaining, 1), 0) > 0 loop
			v_cands := array(
				select entry_id from pg_temp._t_standings
				where entry_id = any (v_remaining)
					and wins = (
						select max(wins) from pg_temp._t_standings where entry_id = any (v_remaining)
					)
			);
			if array_length(v_cands, 1) = 2 then
				-- Two-way tie: head-to-head (round robin means they played once).
				select m.winner_id into v_pick
				from public.tournament_qual_matches m
				where m.pool_id = v_pool.pool_id and m.winner_id is not null
					and ((m.entry_a_id = v_cands[1] and m.entry_b_id = v_cands[2])
						or (m.entry_a_id = v_cands[2] and m.entry_b_id = v_cands[1]))
				limit 1;
				if v_pick is not null then
					v_cands := array[v_pick];
				end if;
			end if;
			if array_length(v_cands, 1) > 1 then
				v_narrowed := array(
					select entry_id from pg_temp._t_standings
					where entry_id = any (v_cands)
						and diff = (
							select max(diff) from pg_temp._t_standings where entry_id = any (v_cands)
						)
				);
				v_cands := v_narrowed;
			end if;
			if array_length(v_cands, 1) > 1 then
				select entry_id into v_pick from pg_temp._t_standings
				where entry_id = any (v_cands)
				order by rand_key limit 1;
				perform public._tournament_log(p_tournament_id, null, null, 'seeded', p_actor_id,
					jsonb_build_object(
						'action', 'random_draw',
						'scope', 'pool_position',
						'pool_number', v_pool.pool_number,
						'position', v_pos,
						'candidates', to_jsonb(v_cands),
						'picked', v_pick
					));
			else
				v_pick := v_cands[1];
			end if;
			update pg_temp._t_standings set pool_position = v_pos where entry_id = v_pick;
			v_remaining := array_remove(v_remaining, v_pick);
			v_pos := v_pos + 1;
		end loop;
	end loop;

	-- Log any global-order group the random key had to break.
	for v_group in
		select pool_position, win_pct, diff, array_agg(entry_id order by rand_key) as ids
		from pg_temp._t_standings
		group by pool_position, win_pct, diff
		having count(*) > 1
	loop
		perform public._tournament_log(p_tournament_id, null, null, 'seeded', p_actor_id,
			jsonb_build_object(
				'action', 'random_draw',
				'scope', 'global_seed',
				'pool_position', v_group.pool_position,
				'drawn_order', to_jsonb(v_group.ids)
			));
	end loop;

	return array(
		select entry_id from pg_temp._t_standings
		order by pool_position asc, win_pct desc, diff desc, rand_key asc
	);
end;
$$;


revoke all on function public._tournament_qual_seed_order(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The bracket, 0062 section 9's body with the seed write made one
--    statement (marked 0317). Same signature.
-- ---------------------------------------------------------------------------

create or replace function public.tournament_generate_bracket(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_n integer;
	v_p integer := 1;
	v_r integer := 0;
	v_tmp integer;
	v_order integer[];
	v_new_order integer[];
	v_size integer;
	v_x integer;
	v_entry_by_seed uuid[];
	v_seed_order uuid[];
	v_i integer;
	v_round integer;
	v_slot integer;
	v_cnt integer;
	v_k integer;
	v_id uuid;
	v_m record;
	v_wt uuid;
	v_wp text;
	v_lt uuid;
	v_lp text;
	v_s2 integer;
	v_missing integer;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_t.status <> 'seeding' then
		raise exception
			'The bracket is generated from seeding (current status: %). Close registration first.',
			v_t.status;
	end if;
	if exists (
		select 1 from public.tournament_bracket_matches where tournament_id = p_tournament_id
	) then
		raise exception 'A bracket already exists for this tournament.';
	end if;

	select count(*) into v_n from public.tournament_entries
	where tournament_id = p_tournament_id;
	if v_n < 2 then
		raise exception 'At least 2 entries are needed to generate a bracket (have %).', v_n;
	end if;
	if v_n > 128 then
		raise exception 'At most 128 entries are supported (have %).', v_n;
	end if;

	if coalesce((v_t.config ->> 'quals_enabled')::boolean, false) then
		if not exists (
			select 1 from public.tournament_qual_pools where tournament_id = p_tournament_id
		) then
			raise exception 'Qualifying is enabled but pools have not been generated.';
		end if;
		select count(*) into v_missing
		from public.tournament_entries e
		where e.tournament_id = p_tournament_id
			and not exists (
				select 1 from public.tournament_qual_matches m
				where m.tournament_id = p_tournament_id
					and (m.entry_a_id = e.id or m.entry_b_id = e.id)
			);
		if v_missing > 0 then
			raise exception
				'% entr% not in any qualifying pool (added after pools were generated?). Regenerate pools or remove them.',
				v_missing, case when v_missing = 1 then 'y is' else 'ies are' end;
		end if;
		if exists (
			select 1 from public.tournament_qual_matches
			where tournament_id = p_tournament_id and winner_id is null
		) then
			raise exception 'Every qualifying match needs a result before the bracket is generated.';
		end if;
		-- Standings decide the seeds.
		v_seed_order := public._tournament_qual_seed_order(p_tournament_id, v_uid);
		-- 0317: one statement with its own WHERE (the loop's per-row update
		-- already had one; this is for reading, not for safeupdate).
		update public.tournament_entries e
		set seed = o.ord
		from unnest(v_seed_order) with ordinality as o(id, ord)
		where e.id = o.id and e.tournament_id = p_tournament_id;
	else
		perform public._tournament_compact_seeds(p_tournament_id);
	end if;

	perform public._tournament_log(p_tournament_id, null, null, 'seeded', v_uid,
		jsonb_build_object('action', 'bracket_seeds_locked', 'order', (
			select to_jsonb(array_agg(id order by seed))
			from public.tournament_entries where tournament_id = p_tournament_id
		)));

	-- Bracket size and round count.
	while v_p < v_n loop
		v_p := v_p * 2;
	end loop;
	v_tmp := v_p;
	while v_tmp > 1 loop
		v_tmp := v_tmp / 2;
		v_r := v_r + 1;
	end loop;

	-- Standard seed placement order (1 vs P, within recursive halves):
	-- [1], [1,2], [1,4,2,3], [1,8,4,5,2,7,3,6], ...
	v_order := array[1];
	v_size := 1;
	while v_size < v_p loop
		v_new_order := '{}';
		foreach v_x in array v_order loop
			v_new_order := v_new_order || v_x || (2 * v_size + 1 - v_x);
		end loop;
		v_order := v_new_order;
		v_size := v_size * 2;
	end loop;

	v_entry_by_seed := array(
		select id from public.tournament_entries
		where tournament_id = p_tournament_id order by seed
	);

	-- Winners bracket. Round 1 places the seeds; an out-of-range seed (> N)
	-- is a bye slot (left null, no feeder -> dead -> resolved below).
	for v_round in 1 .. v_r loop
		v_cnt := v_p >> v_round;
		for v_slot in 1 .. v_cnt loop
			insert into public.tournament_bracket_matches
				(tournament_id, bracket, round, slot, entry_a_id, entry_b_id, best_of)
			values (
				p_tournament_id, 'winners', v_round, v_slot,
				case when v_round = 1 then v_entry_by_seed[v_order[2 * v_slot - 1]] else null end,
				case when v_round = 1 then v_entry_by_seed[v_order[2 * v_slot]] else null end,
				public._tournament_best_of(v_t.config, 'winners', v_round)
			);
		end loop;
	end loop;

	-- Losers bracket (only when R >= 2; a 2-entry bracket has none).
	if v_r >= 2 then
		for v_k in 1 .. v_r - 1 loop
			v_cnt := v_p >> (v_k + 1);
			for v_round in (2 * v_k - 1) .. (2 * v_k) loop
				for v_slot in 1 .. v_cnt loop
					insert into public.tournament_bracket_matches
						(tournament_id, bracket, round, slot, best_of)
					values (p_tournament_id, 'losers', v_round, v_slot,
						public._tournament_best_of(v_t.config, 'losers', v_round));
				end loop;
			end loop;
		end loop;
	end if;

	insert into public.tournament_bracket_matches
		(tournament_id, bracket, round, slot, best_of)
	values (p_tournament_id, 'grand_final', 1, 1,
		public._tournament_best_of(v_t.config, 'grand_final', 1));

	-- Wire the advancement pointers.
	for v_m in
		select * from public.tournament_bracket_matches
		where tournament_id = p_tournament_id
	loop
		v_wt := null; v_wp := null; v_lt := null; v_lp := null;

		if v_m.bracket = 'winners' then
			if v_m.round < v_r then
				select id into v_wt from public.tournament_bracket_matches
				where tournament_id = p_tournament_id and bracket = 'winners'
					and round = v_m.round + 1 and slot = (v_m.slot + 1) / 2;
				v_wp := case when v_m.slot % 2 = 1 then 'a' else 'b' end;
			else
				select id into v_wt from public.tournament_bracket_matches
				where tournament_id = p_tournament_id and bracket = 'grand_final'
					and round = 1 and slot = 1;
				v_wp := 'a';
			end if;

			if v_m.round = 1 then
				if v_r = 1 then
					-- Two entries: the final's loser goes straight to the grand final.
					select id into v_lt from public.tournament_bracket_matches
					where tournament_id = p_tournament_id and bracket = 'grand_final'
						and round = 1 and slot = 1;
					v_lp := 'b';
				else
					select id into v_lt from public.tournament_bracket_matches
					where tournament_id = p_tournament_id and bracket = 'losers'
						and round = 1 and slot = (v_m.slot + 1) / 2;
					v_lp := case when v_m.slot % 2 = 1 then 'a' else 'b' end;
				end if;
			else
				-- Winners round r losers drop into losers round 2(r-1). Slot order
				-- reverses on even winners rounds to delay rematches.
				v_cnt := v_p >> v_m.round;
				v_s2 := case when v_m.round % 2 = 0 then v_cnt + 1 - v_m.slot else v_m.slot end;
				select id into v_lt from public.tournament_bracket_matches
				where tournament_id = p_tournament_id and bracket = 'losers'
					and round = 2 * (v_m.round - 1) and slot = v_s2;
				v_lp := 'b';
			end if;

		elsif v_m.bracket = 'losers' then
			if v_m.round % 2 = 1 then
				-- Minor round: winner meets the next winners-bracket drop, same slot.
				select id into v_wt from public.tournament_bracket_matches
				where tournament_id = p_tournament_id and bracket = 'losers'
					and round = v_m.round + 1 and slot = v_m.slot;
				v_wp := 'a';
			else
				v_k := v_m.round / 2;
				if v_k < v_r - 1 then
					select id into v_wt from public.tournament_bracket_matches
					where tournament_id = p_tournament_id and bracket = 'losers'
						and round = v_m.round + 1 and slot = (v_m.slot + 1) / 2;
					v_wp := case when v_m.slot % 2 = 1 then 'a' else 'b' end;
				else
					-- Losers final: winner is the grand final's B side.
					select id into v_wt from public.tournament_bracket_matches
					where tournament_id = p_tournament_id and bracket = 'grand_final'
						and round = 1 and slot = 1;
					v_wp := 'b';
				end if;
			end if;
			-- Losers-bracket losers are eliminated: no loser pointer.
		end if;

		update public.tournament_bracket_matches
		set winner_to_match_id = v_wt, winner_to_pos = v_wp,
			loser_to_match_id = v_lt, loser_to_pos = v_lp
		where id = v_m.id;
	end loop;

	-- Audit: one created event per match.
	for v_m in
		select id, bracket, round, slot from public.tournament_bracket_matches
		where tournament_id = p_tournament_id
	loop
		perform public._tournament_log(p_tournament_id, 'bracket', v_m.id, 'created', v_uid,
			jsonb_build_object('bracket', v_m.bracket, 'round', v_m.round, 'slot', v_m.slot));
	end loop;

	update public.tournaments set status = 'live' where id = p_tournament_id;

	-- Settle round-1 byes (and their cascades) immediately.
	perform public._tournament_resolve_byes(p_tournament_id, v_uid);
end;
$$;


revoke all on function public.tournament_generate_bracket(uuid) from public, anon, authenticated, service_role;
grant execute on function public.tournament_generate_bracket(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. tournament_update, 0192 section 5's body with the live branch (marked
--    0317): a live tournament with no result takes a new match length and a
--    new final length, and every unplayed match is re-stamped to them.
-- ---------------------------------------------------------------------------

create or replace function public.tournament_update(
	p_tournament_id uuid,
	p_name text default null,
	p_description text default null,
	p_config jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_config jsonb := p_config;
	v_largest integer;
	v_team integer;
	v_new jsonb;
	v_old jsonb;
	v_restamped integer := 0;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if p_name is not null then
		if btrim(p_name) = '' or char_length(btrim(p_name)) > 80 then
			raise exception 'Tournament name must be 1 to 80 characters.';
		end if;
	end if;
	-- 0317: format rules lock at the FIRST RESULT, not at generation. Before
	-- it, only the match lengths may move (the bracket was drawn from
	-- qualifying and team size, and scoring decides how a result is entered).
	if p_config is not null and (v_t.status = 'complete'
		or (v_t.status = 'live' and public._tournament_has_result(p_tournament_id))) then
		raise exception 'Format settings are locked once the bracket is generated.';
	end if;
	if p_config is not null then
		-- THE ONE SOFTENING OF WHOLE-OBJECT REPLACEMENT (0192): a config with NO
		-- team_size key keeps the stored value.
		if jsonb_typeof(v_config) = 'object' and not (v_config ? 'team_size') then
			v_config := v_config || jsonb_build_object(
				'team_size', coalesce((v_t.config ->> 'team_size')::integer, 1)
			);
		end if;
		v_team := public._tournament_team_size(public._tournament_normalize_config(v_config));
		select coalesce(max(c.n), 0) into v_largest
		from (
			select count(*) as n from public.tournament_entry_members
			where tournament_id = p_tournament_id
			group by entry_id
		) c;
		if v_largest > v_team then
			raise exception 'team_size cannot be lower than the largest entry (% registrants).', v_largest;
		end if;
		-- 0317: a live tournament with no result. Only the lengths may change.
		if v_t.status = 'live' then
			v_new := public._tournament_normalize_config(v_config);
			v_old := public._tournament_normalize_config(v_t.config);
			if (v_new -> 'quals_enabled') is distinct from (v_old -> 'quals_enabled')
				or (v_new -> 'score_entry') is distinct from (v_old -> 'score_entry')
				or public._tournament_team_size(v_new) <> public._tournament_team_size(v_old) then
				raise exception 'Once the bracket is drawn only the match lengths can change: qualifying, scoring and team size stay as they are.';
			end if;
		end if;
	end if;
	update public.tournaments
	set name = coalesce(btrim(p_name), name),
		description = coalesce(p_description, description),
		config = case when p_config is null then config
			else public._tournament_normalize_config(v_config) end
	where id = p_tournament_id;
	-- 0317: re-stamp every unplayed match to the new lengths, and say so.
	if p_config is not null and v_t.status = 'live' then
		select t.config into v_new from public.tournaments t where t.id = p_tournament_id;
		with upd as (
			update public.tournament_bracket_matches m
			set best_of = public._tournament_best_of(v_new, m.bracket, m.round)
			where m.tournament_id = p_tournament_id
				and m.status = 'pending'
				and m.best_of <> public._tournament_best_of(v_new, m.bracket, m.round)
			returning 1
		)
		select count(*) into v_restamped from upd;
		if v_new is distinct from v_t.config then
			perform public._tournament_log(p_tournament_id, null, null, 'corrected', v_uid,
				jsonb_build_object('change', 'format_before_first_result', 'before', v_t.config,
					'after', v_new, 'matches_restamped', v_restamped));
		end if;
	end if;
end;
$$;

revoke all on function public.tournament_update(uuid, text, text, jsonb)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_update(uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. ONE READ OF A TOURNAMENT'S SETUP, for a host or an admin (d4c2b43e).
--    Everything the host console shows before the first match, in one answer.
--    A player is named by the CHOSEN name on the roster, never a profile name;
--    an address appears only for the host's own linking, as the console's
--    member rows already carry it to a host.
-- ---------------------------------------------------------------------------

create or replace function public.tournament_setup_state(p_tournament_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_t public.tournaments;
begin
	if not public._tournament_can_manage(p_tournament_id) then
		raise exception 'Only a tournament host or a site admin can read its setup.';
	end if;
	select * into v_t from public.tournaments where id = p_tournament_id;
	if v_t.id is null then
		raise exception 'Tournament not found.';
	end if;
	return jsonb_build_object(
		'id', v_t.id,
		'name', v_t.name,
		'description', v_t.description,
		'status', v_t.status,
		'format', public._tournament_normalize_config(v_t.config) || jsonb_build_object(
			'team_size', public._tournament_team_size(v_t.config)),
		'format_editable', v_t.status in ('draft', 'registration_open', 'seeding')
			or (v_t.status = 'live' and not public._tournament_has_result(p_tournament_id)),
		'has_result', public._tournament_has_result(p_tournament_id),
		'entries', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', e.id, 'seed', e.seed, 'name', e.display_name, 'description', e.description,
				'players', coalesce((
					select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name,
						'email', (select lower(p.email) from public.profiles p where p.id = m.user_id),
						'has_account', m.user_id is not null) order by m.created_at, m.id)
					from public.tournament_entry_members m where m.entry_id = e.id), '[]'::jsonb))
				order by e.seed nulls last, e.created_at)
			from public.tournament_entries e where e.tournament_id = p_tournament_id), '[]'::jsonb),
		'pools', coalesce((
			select jsonb_agg(jsonb_build_object(
				'pool', qp.pool_number,
				'matches', coalesce((
					select jsonb_agg(jsonb_build_object(
						'id', qm.id, 'sequence', qm.sequence,
						'a', (select e.display_name from public.tournament_entries e where e.id = qm.entry_a_id),
						'b', (select e.display_name from public.tournament_entries e where e.id = qm.entry_b_id),
						'winner', (select e.display_name from public.tournament_entries e where e.id = qm.winner_id),
						'score_a', qm.score_a, 'score_b', qm.score_b) order by qm.sequence)
					from public.tournament_qual_matches qm where qm.pool_id = qp.id), '[]'::jsonb))
				order by qp.pool_number)
			from public.tournament_qual_pools qp where qp.tournament_id = p_tournament_id), '[]'::jsonb),
		'bracket', jsonb_build_object(
			'matches', (select count(*) from public.tournament_bracket_matches m where m.tournament_id = p_tournament_id),
			'played', (select count(*) from public.tournament_bracket_matches m
				where m.tournament_id = p_tournament_id and m.status = 'complete'
					and m.entry_a_id is not null and m.entry_b_id is not null),
			'in_progress', (select count(*) from public.tournament_bracket_matches m
				where m.tournament_id = p_tournament_id and m.status = 'in_progress'),
			'champion', (select e.display_name from public.tournament_entries e where e.id = v_t.champion_entry_id)),
		'reward_rules', coalesce((
			select jsonb_agg(jsonb_build_object('trigger_type', r.trigger_type, 'trigger_value', r.trigger_value,
				'amount', r.amount) order by r.trigger_type, r.trigger_value nulls first)
			from public.tournament_reward_rules r where r.tournament_id = p_tournament_id), '[]'::jsonb),
		'settlement', (select jsonb_build_object('outcome', s.outcome, 'settled_at', s.settled_at)
			from public.coin_tournament_settlements s where s.tournament_id = p_tournament_id),
		'hosts', (select count(*) from public.tournament_hosts h where h.tournament_id = p_tournament_id),
		'invites', jsonb_build_object(
			'pending', (select count(*) from public.tournament_invites i where i.tournament_id = p_tournament_id and i.status = 'pending'),
			'accepted', (select count(*) from public.tournament_invites i where i.tournament_id = p_tournament_id and i.status = 'accepted'))
	);
end;
$$;
revoke all on function public.tournament_setup_state(uuid) from public, anon, authenticated, service_role;
grant execute on function public.tournament_setup_state(uuid) to authenticated;

-- Every tournament, newest first, for an admin (or the ones a host hosts).
create or replace function public.tournament_list_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_admin boolean := coalesce(public.is_admin(), false);
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', t.id, 'name', t.name, 'status', t.status, 'created_at', t.created_at,
			'entries', (select count(*) from public.tournament_entries e where e.tournament_id = t.id),
			'champion', (select e.display_name from public.tournament_entries e where e.id = t.champion_entry_id))
			order by t.created_at desc)
		from public.tournaments t
		where v_admin or exists (select 1 from public.tournament_hosts h where h.tournament_id = t.id and h.user_id = v_uid)
	), '[]'::jsonb);
end;
$$;
revoke all on function public.tournament_list_admin() from public, anon, authenticated, service_role;
grant execute on function public.tournament_list_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. A HOST'S DIRECTORY (c6830880). Two letters of a shown name or a school
--    address; school accounts only; at most 12; the chosen display name when
--    there is one (never the account name it replaced); `in_tournament` says
--    who is already on an entry, so the picker can say so.
-- ---------------------------------------------------------------------------

create or replace function public.tournament_people_search(
	p_tournament_id uuid,
	p_query text,
	p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_q text := lower(btrim(coalesce(p_query, '')));
	v_like text;
	v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 12);
begin
	if not public._tournament_can_manage(p_tournament_id) then
		raise exception 'Only a tournament host or a site admin can search people.';
	end if;
	if char_length(regexp_replace(v_q, '\s', '', 'g')) < 2 then
		return '[]'::jsonb;
	end if;
	v_like := '%' || replace(replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
	return coalesce((
		select jsonb_agg(jsonb_build_object('email', r.email, 'name', r.name, 'role', r.role,
			'in_tournament', r.in_tournament) order by r.rank, r.name, r.email)
		from (
			select lower(p.email) as email,
				coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), split_part(lower(p.email), '@', 1)) as name,
				public.role_for_email(p.email) as role,
				exists (select 1 from public.tournament_entry_members m where m.tournament_id = p_tournament_id and m.user_id = p.id)
					or exists (select 1 from public.tournament_entries e where e.tournament_id = p_tournament_id and e.user_id = p.id) as in_tournament,
				case when lower(coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), '')) like v_q || '%'
					or lower(p.email) like v_q || '%' then 0 else 1 end as rank
			from public.profiles p
			where p.email is not null
				and (lower(p.email) like '%@boscotech.net' or lower(p.email) like '%@boscotech.edu')
				and (lower(coalesce(nullif(btrim(p.display_name), ''), p.full_name, '')) like v_like
					or lower(p.email) like v_like)
			order by 5, 2, 1
			limit v_limit
		) r), '[]'::jsonb);
end;
$$;
revoke all on function public.tournament_people_search(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.tournament_people_search(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. SELF-CHECK: the two seeding updates carry their WHERE, and nothing new
--    is open to anon.
-- ---------------------------------------------------------------------------

do $chk$
declare
	v_body text := pg_get_functiondef('public._tournament_qual_seed_order(uuid, uuid)'::regprocedure);
	v_fn text;
begin
	if v_body !~ 'where s\.entry_id is not null' or v_body !~ 'where entry_id is not null' then
		raise exception '0317: _tournament_qual_seed_order is missing a WHERE clause.';
	end if;
	foreach v_fn in array array[
		'public._tournament_has_result(uuid)', 'public.tournament_setup_state(uuid)',
		'public.tournament_list_admin()', 'public.tournament_people_search(uuid, text, integer)',
		'public.tournament_update(uuid, text, text, jsonb)', 'public.tournament_generate_bracket(uuid)'] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0317: % is executable by anon.', v_fn;
		end if;
	end loop;
	raise notice '0317: seeding standings carry their WHERE; tournament reads and the directory are host or admin only.';
end
$chk$;
