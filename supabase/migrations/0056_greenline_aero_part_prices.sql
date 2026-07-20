-- 0056_greenline_aero_part_prices.sql
--
-- Phase 9-fix-a adds a fifth bodywork slot, AERO (the downforce slot), with
-- three purchasable trade parts alongside the free stock underbody:
--   aero-splitter  -> 250
--   aero-wing      -> 250
--   aero-lowdrag   -> 250
-- Bodywork parts are a flat 250 (all sidegrades, the 0052 rule); aero-stock is
-- the free starter and is absent, like every other slot's stock part.
--
-- greenline_item_price is the SERVER authority (the economy.ts copy is the
-- display mirror; see 0052). economy.ts auto-prices the new parts through its
-- PART_PRICE rule with no code change, so this migration only teaches the
-- server the same three prices. Without it, a purchase of one (only reachable
-- when creative mode is OFF) would return 'unknown_item'. Idempotent:
-- create-or-replace of the pure pricing function, the full CASE re-stated with
-- the three aero arms added (carrying forward every 0055 arm).
--
-- Apply manually in the Supabase SQL editor, after 0055.

create or replace function public.greenline_item_price(p_item_id text)
returns integer
language sql
immutable
as $$
select case p_item_id
	-- Bodywork parts (flat 250; stock parts are free and absent)
	when 'plating-composite' then 250
	when 'plating-reactive' then 250
	when 'plating-stripped' then 250
	when 'drive-overbored' then 250
	when 'drive-slipstream' then 250
	when 'drive-hotintake' then 250
	when 'tires-slick' then 250
	when 'tires-terrain' then 250
	when 'tires-hardwall' then 250
	when 'sys-capacitor' then 250
	when 'sys-faraday' then 250
	when 'sys-targeting' then 250
	when 'aero-splitter' then 250    -- Phase 9-fix-a (AERO slot)
	when 'aero-wing' then 250        -- Phase 9-fix-a
	when 'aero-lowdrag' then 250     -- Phase 9-fix-a
	-- Weapons by mountCost (autocannon is the free starter and absent)
	when 'shotgun-burst' then 300
	when 'caltrops' then 300
	when 'radar-jammer' then 300
	when 'oil-slick' then 300      -- Phase 8g, mountCost 1
	when 'homing-rocket' then 600
	when 'auto-turret' then 600
	when 'deployable-blades' then 600
	when 'emp-burst' then 600      -- Phase 8g, mountCost 2
	when 'grappling-hook' then 600 -- Phase 8g, mountCost 2
	when 'railgun' then 1000
	when 'cluster-missile' then 1000
	when 'energy-shield' then 1000
	-- Abilities by slotCost (nitro-boost is the free starter and absent)
	when 'jump-hop' then 300
	when 'emergency-flip' then 300
	when 'grip-surge' then 300
	when 'overcharge-repair' then 600
	-- Livery colors (the archetype-default "color" is free by absence)
	when 'color:steel' then 100
	when 'color:gunmetal' then 100
	when 'color:crimson' then 100
	when 'color:ember' then 100
	when 'color:sulfur' then 100
	when 'color:viper' then 100
	when 'color:azure' then 100
	when 'color:violet' then 100
	when 'color:bone' then 100
	when 'color:copper' then 100
	-- Livery patterns ('none' is free by absence)
	when 'pattern:stripe' then 150
	when 'pattern:twin' then 150
	when 'pattern:wedge' then 150
	when 'pattern:checker' then 150
	else null
end;
$$;

revoke all on function public.greenline_item_price(text) from public, anon, authenticated;
