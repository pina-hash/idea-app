-- 0055_greenline_phase8g_weapon_prices.sql
--
-- Phase 8g folded the three formerly always-on tools (EMP Burst, Oil Slick,
-- Grappling Hook) into the equippable weapon roster. They are ordinary catalog
-- weapons now, priced off mountCost exactly like every other weapon:
--   emp-burst      mountCost 2 -> 600
--   oil-slick      mountCost 1 -> 300
--   grappling-hook mountCost 2 -> 600
--
-- greenline_item_price is the SERVER authority (the economy.ts copy is the
-- display mirror; see 0052). The client mirror auto-prices these three through
-- weaponById + WEAPON_PRICE_BY_MOUNT_COST with no code change, so this migration
-- only has to teach the server the same three prices. Without it, a purchase of
-- one of these (only reachable when creative mode is OFF) would return
-- 'unknown_item'. Idempotent: create-or-replace of the pure pricing function,
-- the full CASE re-stated with the three new arms added.
--
-- Apply manually in the Supabase SQL editor, after 0054.

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
