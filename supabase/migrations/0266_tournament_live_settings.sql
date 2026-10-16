-- 0266_tournament_live_settings.sql
--
-- AN ADMIN CHANGES A LIVE TOURNAMENT'S SETTINGS (ledger 0392, report d1d40a60,
-- Mr. Pina 2026-10-14: "In the case that I accidentally start a tournament
-- without scoring enabled ... Any tournament settings should be able to be
-- changed by an administrator when the tournament is live already ... mistakes
-- happen and there needs to be a way to deal with that").
--
-- WHAT WAS MEASURED FIRST. `tournament_update` (0062, last redefined in 0192)
-- refuses ANY config once the status is 'live' or 'complete' ('Format settings
-- are locked once the bracket is generated.'), and the refusal runs after the
-- host check, so an admin is refused too. Reward rules were already editable
-- while live (`tournament_set_reward_rules`, 0063) and are untouched here.
--
-- `tournament_update` IS NOT REDEFINED. A host's ordinary edit keeps exactly
-- the lock it has; this file adds a separate, admin-only door with a preview,
-- so the one person allowed to change a running event sees what will happen
-- before it happens, and a co-host cannot reach it.
--
-- WHAT A CHANGE DOES TO WHAT IS ALREADY PLAYED (the rule, stated once, in
-- `_tournament_live_config_plan`, which both the preview and the apply call):
--   * score_entry (scoring on or off): every recorded result STAYS as it was
--     recorded. Only results entered after the change follow the new rule.
--     A match already won stays won; nothing is re-decided.
--   * best_of_default and best_of overrides: a bracket match that has not
--     started (status 'pending' and no game recorded) is re-stamped to the
--     new length. A match in progress or decided KEEPS its length, because
--     its games were played to it.
--   * team_size: may go up, or down to the largest roster already registered,
--     the same floor `tournament_update` holds; never below it.
--   * quals_enabled: REFUSED while live. The bracket was drawn from the
--     qualifying result, so turning qualifying on or off now could not change
--     the bracket and would only make the setting say something untrue.
--
-- COINS. No config key moves a coin: payouts come from the reward rules (and
-- are settled by an admin at completion, 0248). Every check below runs before
-- any write, so a refused change writes nothing at all, and an accepted one
-- writes the config, the re-stamped lengths and one log row in one
-- transaction. Nothing is charged or paid by this file.
--
-- A STALE PREVIEW IS REFUSED. The apply takes the config the preview was made
-- against and refuses with 'stale' if a host changed anything in between, so
-- the confirm a person read is the change that lands.
--
-- WHAT IT CREATES, all new: `_tournament_live_config_plan(uuid, jsonb)`
-- (private), `tournament_live_config_preview(uuid, jsonb)` and
-- `tournament_live_config_apply(uuid, jsonb, jsonb)` (admin only, granted to
-- authenticated, refused inside to anyone else). ADDITIVE AND IDEMPOTENT.
-- DEPLOY ORDER: none; the client asks for these only when an admin opens a
-- live tournament, and degrades on PGRST202 alone.
--
-- UNDO, for a person's paste:
--   drop function if exists public.tournament_live_config_apply(uuid, jsonb, jsonb);
--   drop function if exists public.tournament_live_config_preview(uuid, jsonb);
--   drop function if exists public._tournament_live_config_plan(uuid, jsonb);

-- ===== PART A BEGIN =====
create or replace function public._tournament_live_config_plan(p_tournament_id uuid, p_config jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_t public.tournaments;
	v_in jsonb := p_config;
	v_new jsonb;
	v_old jsonb;
	v_changes jsonb := '[]'::jsonb;
	v_largest integer;
	v_restamp integer := 0;
	v_keep integer := 0;
	v_played integer := 0;
	v_key text;
begin
	select * into v_t from public.tournaments where id = p_tournament_id;
	if v_t.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_t.status <> 'live' then
		return jsonb_build_object('ok', false, 'reason', 'not_live', 'status', v_t.status);
	end if;
	if v_in is null or jsonb_typeof(v_in) <> 'object' then
		return jsonb_build_object('ok', false, 'reason', 'invalid', 'message', 'Config must be a JSON object.');
	end if;
	-- The same team_size softening tournament_update has: no key keeps the stored value.
	if not (v_in ? 'team_size') then
		v_in := v_in || jsonb_build_object('team_size', coalesce((v_t.config ->> 'team_size')::integer, 1));
	end if;
	begin
		v_new := public._tournament_normalize_config(v_in);
	exception when others then
		return jsonb_build_object('ok', false, 'reason', 'invalid', 'message', sqlerrm);
	end;
	v_old := public._tournament_normalize_config(v_t.config);

	if (v_new ->> 'quals_enabled')::boolean is distinct from (v_old ->> 'quals_enabled')::boolean then
		return jsonb_build_object('ok', false, 'reason', 'quals_locked');
	end if;
	select coalesce(max(c.n), 0) into v_largest
	from (
		select count(*) as n from public.tournament_entry_members
		where tournament_id = p_tournament_id
		group by entry_id
	) c;
	if (v_new ->> 'team_size')::integer < v_largest then
		return jsonb_build_object('ok', false, 'reason', 'team_size_below_largest', 'largest', v_largest);
	end if;

	foreach v_key in array array['score_entry', 'best_of_default', 'best_of', 'team_size'] loop
		if v_new -> v_key is distinct from v_old -> v_key then
			v_changes := v_changes || jsonb_build_array(jsonb_build_object('key', v_key, 'from', v_old -> v_key, 'to', v_new -> v_key));
		end if;
	end loop;

	select
		count(*) filter (where m.status = 'pending'
			and not exists (select 1 from public.tournament_match_games g where g.bracket_match_id = m.id)
			and m.best_of <> public._tournament_best_of(v_new, m.bracket, m.round)),
		count(*) filter (where (m.status <> 'pending'
			or exists (select 1 from public.tournament_match_games g where g.bracket_match_id = m.id))
			and m.best_of <> public._tournament_best_of(v_new, m.bracket, m.round)),
		count(*) filter (where m.status = 'complete')
	into v_restamp, v_keep, v_played
	from public.tournament_bracket_matches m
	where m.tournament_id = p_tournament_id;

	return jsonb_build_object(
		'ok', true,
		'tournament_id', v_t.id,
		'name', v_t.name,
		'before', v_old,
		'after', v_new,
		'stored', v_t.config,
		'changes', v_changes,
		'matches_restamped', v_restamp,
		'matches_kept_length', v_keep,
		'matches_played', v_played
	);
end;
$$;
revoke all on function public._tournament_live_config_plan(uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function public.tournament_live_config_preview(p_tournament_id uuid, p_config jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null or not public.is_admin() then
		return jsonb_build_object('ok', false, 'reason', 'not_admin');
	end if;
	return public._tournament_live_config_plan(p_tournament_id, p_config);
end;
$$;
revoke all on function public.tournament_live_config_preview(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.tournament_live_config_preview(uuid, jsonb) to authenticated;

create or replace function public.tournament_live_config_apply(
	p_tournament_id uuid,
	p_config jsonb,
	p_expected_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_t public.tournaments;
	v_plan jsonb;
	v_new jsonb;
	v_restamped integer := 0;
begin
	if (select auth.uid()) is null or not public.is_admin() then
		return jsonb_build_object('ok', false, 'reason', 'not_admin');
	end if;
	-- The same row lock every host mutation takes, so the plan below is read
	-- under it and cannot change before the writes.
	select * into v_t from public.tournaments where id = p_tournament_id for update;
	if v_t.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_expected_config is distinct from v_t.config then
		return jsonb_build_object('ok', false, 'reason', 'stale');
	end if;
	v_plan := public._tournament_live_config_plan(p_tournament_id, p_config);
	if not (v_plan ->> 'ok')::boolean then
		return v_plan;
	end if;
	if jsonb_array_length(v_plan -> 'changes') = 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_change');
	end if;
	v_new := v_plan -> 'after';

	-- EVERY CHECK IS ABOVE THIS LINE.
	update public.tournaments set config = v_new where id = p_tournament_id;

	with upd as (
		update public.tournament_bracket_matches m
		set best_of = public._tournament_best_of(v_new, m.bracket, m.round)
		where m.tournament_id = p_tournament_id
			and m.status = 'pending'
			and not exists (select 1 from public.tournament_match_games g where g.bracket_match_id = m.id)
			and m.best_of <> public._tournament_best_of(v_new, m.bracket, m.round)
		returning 1
	)
	select count(*) into v_restamped from upd;

	perform public._tournament_log(p_tournament_id, null, null, 'corrected', (select auth.uid()),
		jsonb_build_object('change', 'live_settings', 'before', v_plan -> 'before', 'after', v_new,
			'matches_restamped', v_restamped));

	return jsonb_build_object('ok', true, 'changes', v_plan -> 'changes', 'matches_restamped', v_restamped,
		'matches_kept_length', v_plan -> 'matches_kept_length', 'config', v_new);
end;
$$;
revoke all on function public.tournament_live_config_apply(uuid, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.tournament_live_config_apply(uuid, jsonb, jsonb) to authenticated;
-- ===== PART A END =====

-- ===== PART Z BEGIN =====
do $z$
declare
	v_bad text[] := '{}';
	v_fn text;
	v_oid oid;
begin
	foreach v_fn in array array['tournament_live_config_preview(uuid,jsonb)', 'tournament_live_config_apply(uuid,jsonb,jsonb)'] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by anon');
		elsif not has_function_privilege('authenticated', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is not executable by authenticated');
		end if;
	end loop;
	v_oid := to_regprocedure('public._tournament_live_config_plan(uuid,jsonb)');
	if v_oid is null then
		v_bad := array_append(v_bad, '_tournament_live_config_plan is missing');
	elsif has_function_privilege('anon', v_oid, 'execute') or has_function_privilege('authenticated', v_oid, 'execute') then
		v_bad := array_append(v_bad, '_tournament_live_config_plan is executable by a client');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0266 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0266 tournament live settings: 2 admin functions closed to anon, 1 private plan closed to every client; tournament_update unchanged.';
end $z$;
-- ===== PART Z END =====
