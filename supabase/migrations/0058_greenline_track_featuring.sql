-- 0058_greenline_track_featuring.sql
-- GREENLINE community tracks, Bundle 4b: teacher featuring + the server-side
-- ranked-eligibility gate.
--
-- Two pieces:
--
--   1. greenline_track_set_featured : the teacher-only promote/demote RPC.
--      Featuring makes a community track RANKED — eligible for real
--      greenline_race_results rows and the IC payout on the same terms as the
--      official tracks. Un-featuring demotes it back to unranked WITHOUT
--      touching the track, its ratings, its attempts, or its existing
--      leaderboard rows (those stay: history is never deleted). Enforced by
--      is_teacher() INSIDE the function (the frc_mark_complete doctrine);
--      UI gating is convenience, never the boundary.
--
--   2. greenline_submit_race_result is recreated (same 0054 signature, award
--      math byte-identical) with a COMMUNITY GATE: a non-creative submission
--      whose track_id is a community id ('community:<uuid>') ranks and pays
--      ONLY if that greenline_tracks row is currently featured and not
--      removed. Anything else — unfeatured, removed, unknown uuid, malformed
--      id — is DEMOTED to the existing creative branch (stored mode
--      'creative', zero award) rather than rejected, so a run that was in
--      progress when a teacher un-featured the track still logs cleanly and
--      simply does not rank. Without this gate any client could submit ranked
--      rows for an arbitrary community id; with it, un-featuring removes
--      ranked eligibility server-side the moment it lands.
--
-- Investigation note (why no schema extension is needed): 0049 deliberately
-- left greenline_race_results.track_id as FREE-FORM TEXT — no enum, CHECK, or
-- FK ("the track catalog stays a code concern... the board never assumes one
-- track"), and greenline_leaderboard(p_track_id) already aggregates any id it
-- is asked about. So a featured track's stable identity is its existing
-- catalog id 'community:<uuid>' (the row PK — survives data re-reads and
-- renames), and the ranked board + IC payout come from the EXISTING pipeline
-- with zero changes to the results table or the leaderboard RPC. The only
-- thing that had to be built is the eligibility gate above.
--
-- Apply manually in the Supabase SQL editor, after 0057.

-- ---------------------------------------------------------------------------
-- 1. Teacher featuring
-- ---------------------------------------------------------------------------
create or replace function public.greenline_track_set_featured(
	p_track_id uuid,
	p_featured boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		raise exception 'Not authenticated';
	end if;
	if not public.is_teacher() then
		raise exception 'Teachers only';
	end if;
	-- Featuring requires a live (non-removed) track; un-featuring is always
	-- allowed, including on a removed one (demote and remove are independent).
	update public.greenline_tracks t
		set featured = coalesce(p_featured, false)
		where t.id = p_track_id
			and (not coalesce(p_featured, false) or not t.removed);
	return found;
end;
$$;

revoke all on function public.greenline_track_set_featured(uuid, boolean) from public;
grant execute on function public.greenline_track_set_featured(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The submit RPC, with the community ranked-eligibility gate
-- ---------------------------------------------------------------------------
-- Identical to 0054 except the marked COMMUNITY GATE block; the award
-- constants and every other branch are unchanged, so a featured community
-- track pays exactly what an official track pays.
create or replace function public.greenline_submit_race_result(
	p_track_id text,
	p_mode text default 'race',
	p_finish_position integer default null,
	p_total_time_ms integer default null,
	p_best_lap_ms integer default null,
	p_laps integer default null,
	p_archetype text default null,
	p_creative boolean default false,
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

	-- COMMUNITY GATE (0058): a non-creative run on a community track ranks
	-- only while that track is featured (and not removed). Everything else
	-- demotes to the creative branch below — logged, never ranked, never paid.
	-- The exception handler covers a malformed uuid segment: demote, not error.
	if not v_creative and v_track like 'community:%' then
		begin
			if not exists (
				select 1 from public.greenline_tracks t
				where t.id = substring(v_track from 11)::uuid
					and t.featured
					and not t.removed
			) then
				v_creative := true;
			end if;
		exception when others then
			v_creative := true;
		end;
	end if;

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
