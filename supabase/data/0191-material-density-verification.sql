-- ---------------------------------------------------------------------------
-- 0191  MATERIAL DENSITY VERIFICATION -- THE FORM, NOT THE ANSWERS.
--
-- THIS FILE SUPPLIES NO DENSITY. Ledger 0191 could not reach a published source
-- from its container: every host was refused by the egress proxy, the standards
-- bodies and the USDA FPL among them. IDEA_MATERIALS_PROCESS.md is explicit that
-- an AI's recollection of a datasheet is not a datasheet, and that a file which
-- was searched but not read is not a source either. So every density below is
-- left NULL, deliberately, for somebody with the document in front of them.
--
-- IT IS NOT A MIGRATION AND MUST NOT BECOME ONE. `ideacad_materials` was built
-- by 0208 to be edited: a material is four numbers in a form, and shipping a
-- code change to correct one is the shape 0208 exists to end. This is a data
-- correction, pasted once, superseded by the next one.
--
-- A BLIND PASTE WRITES NOTHING, and that is structural rather than a warning.
-- Section 2's `where v.density_g_cm3 is not null` excludes every unedited row,
-- so pasting this file as it stands updates ZERO rows and reports so. Only a
-- row whose NULL has been replaced with a real number is written. Nothing here
-- can set a density to a value nobody checked.
--
-- WHY A DIRECT UPDATE RATHER THAN `ideacad_material_save_global`. That RPC is
-- the right path from the admin console and the wrong one here: it reads
-- `auth.uid()` and `is_admin()`, and the Supabase SQL editor carries no session
-- for either. If you would rather do this signed in, the console at
-- /admin/ideacad-materials does exactly this through the RPC and is preferable.
--
-- THE TABLE'S OWN CHECKS STILL APPLY to every statement below: a density must be
-- greater than 0 and no more than 25, and `source` must be 1 to 300 characters.
-- A typo is refused by the database rather than stored.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. THE AUDIT. Read-only. Run this first and again afterwards; the difference
--    between the two readings is what this file actually did.
-- ---------------------------------------------------------------------------

select
	slug,
	name,
	density_g_cm3,
	thicknesses_in,
	source_verified,
	case when retired_at is null then 'live' else 'retired' end as state,
	source
from public.ideacad_materials
where owner is null
order by retired_at nulls first, name;


-- ---------------------------------------------------------------------------
-- 2. THE CORRECTION. Replace a NULL with the density you read off the source,
--    and replace that row's source text with the exact document you opened --
--    the standard with its revision, or the manufacturer datasheet with its
--    part number. Leave a row NULL and it is not touched.
--
--    `source_verified` is set true ONLY for a row whose density you supplied.
--    That flag means "somebody had the document in front of them", which is why
--    no session can set it and why it is not defaulted true here.
-- ---------------------------------------------------------------------------

with verified (slug, density_g_cm3, source) as (
	values
		-- slug                density g/cm3    the document you actually opened
		('stainless-steel',    null::numeric,   null::text),
		('galvanized-steel',   null::numeric,   null::text),
		('steel',              null::numeric,   null::text),
		('aluminum',           null::numeric,   null::text),
		('polycarbonate',      null::numeric,   null::text),
		('wood',               null::numeric,   null::text),
		('pla',                null::numeric,   null::text),
		('petg',               null::numeric,   null::text)
)
update public.ideacad_materials m
   set density_g_cm3 = v.density_g_cm3,
       source          = coalesce(nullif(btrim(v.source), ''), m.source),
       source_verified = true,
       updated_at      = now()
  from verified v
 where m.owner is null
   and m.slug = v.slug
   and v.density_g_cm3 is not null
returning m.slug, m.density_g_cm3, m.source_verified, m.source;


-- ---------------------------------------------------------------------------
-- 3. THE THICKNESSES ARE A SEPARATE DECISION AND A SEPARATE STATEMENT.
--
--    A density is a published fact; a stock list is a fact about YOUR SHOP, and
--    no document anywhere can answer it. 0208's lists were its own proposal and
--    said so.
--
--    ONE THING HERE IS NOT COSMETIC. A stock id is `<slug>-<thickness with the
--    decimal point removed>`, so REMOVING a thickness orphans every saved
--    concept that names it: the lookup returns nothing, `evaluate()` non-null-
--    asserts it, and the part's mass comes back NaN with nothing on screen
--    saying which id went missing. ADDING one is always safe. The three ids the
--    app already wrote before 0208 are `steel-0125`, `steel-01875` and
--    `aluminum-0125`, so 0.125 and 0.1875 must stay on `steel` and 0.125 must
--    stay on `aluminum`. `tests/db/ideacad-materials-seed-resolves.test.ts`
--    holds that against the seed; it cannot see an edit made here.
--
--    Unedited, this writes nothing, for the same reason section 2 does.
-- ---------------------------------------------------------------------------

with stocked (slug, thicknesses_in) as (
	values
		('stainless-steel',    null::numeric[]),
		('galvanized-steel',   null::numeric[]),
		('steel',              null::numeric[]),
		('aluminum',           null::numeric[]),
		('polycarbonate',      null::numeric[]),
		('wood',               null::numeric[])
)
update public.ideacad_materials m
   set thicknesses_in = s.thicknesses_in,
       updated_at     = now()
  from stocked s
 where m.owner is null
   and m.slug = s.slug
   and s.thicknesses_in is not null
returning m.slug, m.thicknesses_in;
