-- 0054_greenline_race_telemetry.sql
-- GREENLINE Phase 8f: race telemetry MVP.
--
-- Extends the EXISTING result path rather than building a parallel system:
-- greenline_submit_race_result already owns the trusted write (server-stamped
-- attribution, the award math, the creative-run branch), so the new fields ride
-- it as additional columns and additional defaulted parameters. There is no
-- second "log telemetry" RPC to keep in sync, and no way to log a run that did
-- not also go through the award/ranking rules.
--
-- What this adds, and why each field is worth having NOW:
--   - weapon_primary / weapon_secondary, ability_primary / ability_secondary:
--     what players actually equip. The catalogs are large (10 weapons, 6
--     abilities) and entirely un-instrumented today, so balance discussion is
--     currently guesswork.
--   - creative: an EXPLICIT flag. It was previously only inferable from
--     mode = 'creative'; a real column means "how much play is happening in
--     creative mode" is a direct question, and it stays answerable if the mode
--     encoding ever changes.
--   - route: which way round a branched track the player went ('main', or a
--     branch id). Terminal Nine's shortcut (8b) is the first real design
--     decision the player makes with their line, and nothing measures it.
--
-- MVP scope on purpose. This is not the polished telemetry system a later
-- phase may want (no per-lap series, no event stream — GAUNTLET's
-- gauntlet_run_events is the model if that day comes); it is the smallest set
-- of durable, high-value fields, captured starting now.
--
-- All fields are NULLABLE / defaulted and all new parameters have defaults, so
-- every existing row stays valid. The old 8-argument signature is DROPPED
-- rather than left in place: with defaulted parameters an 8-argument call would
-- otherwise be ambiguous between the two overloads and PostgREST would refuse
-- it. The client (persistence.ts) falls back through the older shapes if this
-- migration is unapplied.
--
-- Apply manually in the Supabase SQL editor, after 0053.

alter table public.greenline_race_results
	add column if not exists weapon_primary text,
	add column if not exists weapon_secondary text,
	add column if not exists ability_primary text,
	add column if not exists ability_secondary text,
	add column if not exists creative boolean not null default false,
	-- 'main', or a RibbonBranch id from the track file. Free-form text, the
	-- track_id doctrine: routes live in the track data, not in the schema.
	add column if not exists route text;

-- Ambiguity guard (see header): remove the 0052 signature before creating the
-- widened one.
drop function if exists public.greenline_submit_race_result(
	text, text, integer, integer, integer, integer, text, boolean
);

create or replace function public.greenline_submit_race_result(
	p_track_id text,
	p_mode text default 'race',
	p_finish_position integer default null,
	p_total_time_ms integer default null,
	p_best_lap_ms integer default null,
	p_laps integer default null,
	p_archetype text default null,
	p_creative boolean default false,
	-- Telemetry (0054). All optional: an older client simply logs nulls.
	p_weapon_primary text default null,
	p_weapon_secondary text default null,
	p_ability_primary text default null,
	p_ability_secondary text default null,
	p_route text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_track text;
	v_mode text := coalesce(nullif(trim(p_mode), ''), 'race');
	v_creative boolean := coalesce(p_creative, false);
	v_id uuid;
	v_prior_best integer;
	v_recent boolean := false;
	-- Award constants (SERVER copy governs; mirrored in economy.ts for the
	-- results-screen display). Unchanged from 0052.
	c_award_p1 constant integer := 120;
	c_award_p2 constant integer := 90;
	c_award_p3 constant integer := 70;
	c_award_finish constant integer := 50;
	c_award_pb constant integer := 40;
	c_award_min_gap constant interval := interval '30 seconds';
	v_placement integer := 0;
	v_pb integer := 0;
	v_award integer := 0;
	v_balance integer := null;
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if p_track_id is null or length(trim(p_track_id)) = 0 then
		raise exception 'A track id is required';
	end if;
	v_track := trim(p_track_id);

	-- Creative runs are stored under mode 'creative': the append-only log keeps
	-- them, the leaderboard RPC (mode = 'race') never ranks them, and the
	-- prior-best baseline below never reads them.
	if v_creative then
		v_mode := 'creative';
	end if;

	if not v_creative then
		select min(r.best_lap_ms) into v_prior_best
		from public.greenline_race_results r
		where r.user_id = v_uid
			and r.track_id = v_track
			and r.mode = v_mode
			and r.best_lap_ms is not null;

		select exists (
			select 1 from public.greenline_race_results r
			where r.user_id = v_uid
				and r.created_at > now() - c_award_min_gap
		) into v_recent;
	end if;

	insert into public.greenline_race_results (
		user_id, track_id, mode, finish_position,
		total_time_ms, best_lap_ms, laps, archetype,
		weapon_primary, weapon_secondary,
		ability_primary, ability_secondary,
		creative, route
	)
	values (
		v_uid, v_track, v_mode, p_finish_position,
		p_total_time_ms, p_best_lap_ms, p_laps, p_archetype,
		nullif(trim(coalesce(p_weapon_primary, '')), ''),
		nullif(trim(coalesce(p_weapon_secondary, '')), ''),
		nullif(trim(coalesce(p_ability_primary, '')), ''),
		nullif(trim(coalesce(p_ability_secondary, '')), ''),
		v_creative,
		nullif(trim(coalesce(p_route, '')), '')
	)
	returning id into v_id;

	if not v_creative and not v_recent then
		if p_finish_position is not null and p_finish_position >= 1 then
			v_placement := case p_finish_position
				when 1 then c_award_p1
				when 2 then c_award_p2
				when 3 then c_award_p3
				else c_award_finish
			end;
		end if;
		if p_best_lap_ms is not null and p_best_lap_ms > 0
			and (v_prior_best is null or p_best_lap_ms < v_prior_best) then
			v_pb := c_award_pb;
		end if;
		v_award := v_placement + v_pb;

		if v_award > 0 then
			insert into public.greenline_wallets (user_id, balance, lifetime_earned, updated_at)
			values (v_uid, v_award, v_award, now())
			on conflict (user_id) do update
				set balance = public.greenline_wallets.balance + excluded.balance,
					lifetime_earned = public.greenline_wallets.lifetime_earned + excluded.lifetime_earned,
					updated_at = now();
		end if;
	end if;

	select w.balance into v_balance
	from public.greenline_wallets w
	where w.user_id = v_uid;

	return jsonb_build_object(
		'id', v_id,
		'awarded', v_award,
		'placement', v_placement,
		'pb_bonus', v_pb,
		'balance', v_balance,
		'creative', v_creative
	);
end;
$$;

revoke all on function public.greenline_submit_race_result(
	text, text, integer, integer, integer, integer, text, boolean,
	text, text, text, text, text
) from public;
grant execute on function public.greenline_submit_race_result(
	text, text, integer, integer, integer, integer, text, boolean,
	text, text, text, text, text
) to authenticated;
