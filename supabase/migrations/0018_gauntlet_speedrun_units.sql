-- 0018_gauntlet_speedrun_units.sql
-- IDEA // GAUNTLET: require a Speedrun unit system (IPS or MMGS) before publish.
--
-- `unit_system` itself is pure site data and lives in the existing `prompt`
-- JSONB like slug/tier/par_time (see 0015), so no column/table change is
-- needed for storage. This migration only tightens `gauntlet_publish_blocker`
-- so a Speedrun challenge cannot publish without a system selected, which is
-- how every other required Speedrun field (material, density, ...) is already
-- enforced. Reverse Engineer and Feature Golf are unaffected.
--
-- Apply manually in the Supabase SQL editor. Idempotent (create or replace).

create or replace function public.gauntlet_publish_blocker(
	p_mode public.gauntlet_mode,
	p_prompt jsonb,
	p_answer jsonb
)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
	if p_mode in ('speedrun', 'reverse_engineer', 'feature_golf') then
		if coalesce(public.gauntlet_jnum(p_answer, 'target_volume_mm3'), 0) <= 0 then
			return 'Canonical volume (mm3) is required to publish.';
		end if;
		if public.gauntlet_jnum(p_answer, 'tolerance_pct') is null then
			return 'A tolerance band is required to publish.';
		end if;
		if coalesce(public.gauntlet_jnum(p_answer, 'target_mass'), 0) <= 0 then
			return 'Target mass is required to publish.';
		end if;
		if coalesce(public.gauntlet_jnum(p_answer, 'density'), 0) <= 0 then
			return 'Density is required to publish.';
		end if;
		if coalesce(btrim(p_prompt ->> 'material'), '') = '' then
			return 'Material is required to publish.';
		end if;
		if p_mode in ('speedrun', 'feature_golf')
			and coalesce(btrim(p_answer ->> 'drawing'), '') = '' then
			return 'A drawing is required; it is hidden and revealed on Start.';
		end if;
		if p_mode = 'speedrun'
			and coalesce(p_prompt ->> 'unit_system', '') not in ('IPS', 'MMGS') then
			return 'A unit system (IPS or MMGS) is required to publish.';
		end if;
		if p_mode = 'reverse_engineer' then
			if coalesce(public.gauntlet_jnum(p_answer, 'target_surface_area_mm2'), 0) <= 0 then
				return 'Surface area (mm2) is required for Reverse Engineer.';
			end if;
			if coalesce(btrim(p_prompt ->> 'reference'), '') = '' then
				return 'A reference (drawing or image) is required for Reverse Engineer.';
			end if;
		end if;
	else
		-- knowledge modes
		if coalesce(btrim(p_prompt ->> 'question'), '') = '' then
			return 'A question is required to publish.';
		end if;
		if coalesce(btrim(p_answer ->> 'correct'), '') = '' then
			return 'A correct answer is required to publish.';
		end if;
		if p_prompt ? 'options' then
			if coalesce(jsonb_array_length(p_prompt -> 'options'), 0) < 2 then
				return 'Provide at least two answer options.';
			end if;
			if not exists (
				select 1 from jsonb_array_elements(p_prompt -> 'options') o
				where o ->> 'id' = p_answer ->> 'correct'
			) then
				return 'The correct answer must match one of the option ids.';
			end if;
		end if;
		if (p_answer ->> 'type') = 'numeric'
			and public.gauntlet_jnum(p_answer, 'correct') is null then
			return 'The correct numeric answer must be a number.';
		end if;
	end if;
	return null;
end;
$$;
