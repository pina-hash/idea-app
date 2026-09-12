-- ---------------------------------------------------------------------------
-- 0194  THE CITATION MODEL -- WHICH DOCUMENT ACTUALLY CARRIES A DENSITY.
--
-- SUPERSEDES supabase/data/0191-material-density-verification.sql. Paste THIS
-- one. It carries 0191's density form forward unchanged, so there is one file
-- rather than two that can drift.
--
-- THIS FILE STILL SUPPLIES NO DENSITY. Ledger 0194's container was refused by
-- the egress proxy on all 24 published sources tried, on two independent paths,
-- exactly as 0191's was. Section 4 is therefore still all NULL.
--
-- WHAT IS NEW IS THAT THE DEFECT IS NOT A MISSING NUMBER, IT IS A WRONG
-- CITATION, AND A WRONG CITATION CAN BE FIXED WITH NO DOCUMENT AT ALL.
--
--   ASTM A240/A240M IS A PROCUREMENT SPECIFICATION AND STATES NO DENSITY. It
--   sets chemistry limits and mechanical minimums. The spread across published
--   sources -- 7.90, 7.91, 7.93, 8.00 -- is nickel content varying inside
--   A240's own permitted 8.0 to 11.0 % band, and every one of those figures is
--   compliant 304. So 0208 attributes a number to a document that does not
--   contain it, and would go on doing so even if somebody opened A240 and
--   cleared the flag.
--
--   A653, A36 AND B209 HAVE THE SAME SHAPE. They are product specifications:
--   they say what may be sold under a name, not what the material weighs. B209
--   is the plainest case and needs no document to see -- it covers 1100
--   through 7075 in one document, alloys that do not share a density, so it
--   cannot be the source of 2.70 for 6061.
--
-- WHY SECTIONS 2 AND 3 WRITE ON A BLIND PASTE AND SECTION 4 DOES NOT. Asserting
-- a density needs a document. REMOVING an attribution a document cannot support
-- does not: it takes a claim away. Every way section 2 can be wrong is in the
-- direction of claiming LESS than is known, which is the conservative
-- direction and the same direction as the rest of this work. Section 4 can
-- only be wrong by claiming MORE, so it stays NULL and writes nothing.
--
-- WHICH CLAIMS ARE WHICH, so the reasoned ones can be checked:
--   * A240 carries no density -- GIVEN to this session as a finding of
--     2026-09-13. Not established here.
--   * A653, A36 and B209 carry none either -- REASONED, from each document's
--     own title (which is what 0208 cites) and from 0208's own notes, which
--     already say the galvanized figure is for the BASE steel and that the
--     other aluminium alloys differ by about 4 %. No document was opened.
--   * FPL-GTR-282 cannot answer Baltic birch plywood -- established by ledger
--     0191: it gives specific gravity by SPECIES and a manufactured panel is
--     not a species.
--
-- IT IS NOT A MIGRATION AND MUST NOT BECOME ONE. `ideacad_materials` was built
-- by 0208 to be edited. This is a data correction, pasted once, superseded by
-- the next one.
--
-- RE-APPLIABLE, AND IT NEVER CLOBBERS A HUMAN EDIT. Section 2 touches only rows
-- still `source_verified = false`, so a row somebody has since checked and
-- signed off keeps THEIR citation. Section 3 touches the wood row only while
-- its name is still the seeded one.
--
-- THE TABLE'S OWN CHECKS APPLY: name 1 to 60 characters, source 1 to 300, note
-- at most 400, density above 0 and at most 25. Every string below was measured
-- against those limits before it was written, and
-- tests/db/ideacad-materials-citations.test.ts runs this whole file against the
-- real chain so a limit cannot be discovered at the moment of pasting.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. THE AUDIT. Read-only. Run it first and again at the end; the difference
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
-- 2. THE CITATION CORRECTION. This WRITES on a blind paste, deliberately: see
--    the header. No density is touched and `source_verified` is not set true
--    anywhere in this file.
--
--    The `source` column now says where to look. The `note` column says whether
--    a single number is even the right SHAPE for that material, in 0208's own
--    vocabulary: ESTIMATE where it already used it, RANGE where a compliant
--    material genuinely spans values.
--
--    ALUMINIUM IS THE ONE ROW WHOSE CITATION SURVIVES IN PART, and that is
--    worth reading rather than skimming: 0208 named two documents for it and
--    the SECOND one is right. The Aluminum Association's Aluminum Standards and
--    Data carries a per-alloy physical-properties table; B209 does not. So the
--    correction drops half a citation instead of replacing it.
--
--    It is also the one row where a single density is the right shape at all.
--    An alloy is a fixed composition. Everything else here is a range, an
--    estimate, or a question about which sheet the shop bought.
-- ---------------------------------------------------------------------------

with cited (slug, source, note) as (
	values
		('stainless-steel',
		 'NOT SOURCED. ASTM A240/A240M is a procurement spec -- chemistry limits and mechanical minimums -- and states no density. Open a physical-properties reference for UNS S30400, or the mill certificate for this sheet.',
		 'RANGE, NOT A VALUE. 304 has no single density: nickel varies inside the 8.0 to 11.0 % band A240 permits, and published figures from about 7.90 to 8.00 are all compliant. 8.00 sits at the top of that spread. Type 316 and the 400 series differ; if the sheet is marked, pick the marked alloy instead.'),

		('galvanized-steel',
		 'NOT SOURCED. ASTM A653/A653M governs the zinc coating and the base-metal grade, not density, and the grade it permits is not one single steel. Open a physical-properties reference for low-carbon sheet steel.',
		 'ESTIMATE. This is the density of the BASE STEEL; the zinc coating is well under 1% of the mass and is not counted. A653 does not fix one steel, so this is a low-carbon figure rather than a value for this coil. The thicknesses are the usual 24, 22, 20, 18, 16 and 14 gauge sizes, coating included.'),

		('steel',
		 'NOT SOURCED, AND UNSOURCEABLE. ASTM A36/A36M is a procurement spec and states no density; and this row is for stock whose alloy nobody knows, so no document can answer for the piece in hand. Weigh it if the mass matters.',
		 'ESTIMATE, AND IT CANNOT BECOME ANYTHING ELSE. This row is for stock of unknown provenance, so no density is right for the piece in your hand. 7.85 is a mild-steel figure and carbon and low-alloy steels sit within a few percent of it, so the mass is close. It is not a measured figure and no document can make it one.'),

		('aluminum',
		 'The Aluminum Association, Aluminum Standards and Data, typical physical properties, alloy 6061. ASTM B209 is REMOVED from this citation: it covers many alloys at once, 1100 through 7075, and states a density for none of them.',
		 '6061 in any temper, and the ONE row here with a genuinely single published density: an alloy is a fixed composition, so this is a value and not a range. 5052 and 7075 are within about 4% and are different materials, not tolerance.'),

		('polycarbonate',
		 'NOT SOURCED. ISO 1183 and ASTM D792 are test METHODS, not a value. Open the datasheet for the sheet grade this shop actually buys; polycarbonate sheet is sold by brand and grade and they do not all match.',
		 'Unfilled polycarbonate sheet, a typical-grade figure pending the datasheet for the sheet the shop stocks. Acrylic is lighter, about 1.18, and is not the same material. The 0.093 in entry is the 3/32 nominal as suppliers spell it; 3/32 is exactly 0.09375, so the sheet may measure 0.0008 in over.'),

		('wood',
		 'NOT SOURCED. FPL-GTR-282 gives specific gravity by SPECIES and cannot answer a manufactured panel. Open the panel maker''s datasheet for the Baltic birch plywood this shop buys.',
		 'ESTIMATE, AND THE WIDEST ONE HERE. Baltic birch plywood is a manufactured panel, not a species: its density follows the veneer mix, the glue and the moisture, so a panel maker''s figure is grade-specific. Thicknesses are the metric sheet sizes it is sold in (3, 6 and 12 mm). Other stock gets its own row.'),

		('pla',
		 'NOT SOURCED. ISO 1183 is a test METHOD, not a value, and a printed part is not solid anyway. Retired, so nothing is graded against it; use your own spool''s datasheet if you need a number.',
		 null),

		('petg',
		 'NOT SOURCED. ISO 1183 is a test METHOD, not a value, and a printed part is not solid anyway. Retired, so nothing is graded against it.',
		 null)
)
update public.ideacad_materials m
   set source     = c.source,
       note       = coalesce(c.note, m.note),
       updated_at = now()
  from cited c
 where m.owner is null
   and m.slug = c.slug
   and m.source_verified = false
returning m.slug, m.source_verified, m.source;


-- ---------------------------------------------------------------------------
-- 3. THE WOOD ROW IS NAMED FOR WHAT IT IS.
--
--    0208 half did this already: the row is called "Wood (Baltic birch
--    plywood)" and its thicknesses are 3, 6 and 12 mm, which is a plywood list
--    and not a lumber list. It is a Baltic birch row wearing a generic title.
--    Ledger 0191 recommended finishing it and this is that.
--
--    THE SLUG DOES NOT MOVE AND MUST NOT. `wood` is the join key: a stock id is
--    slug plus thickness, so renaming the slug orphans every saved concept that
--    names one. The NAME is display text and nothing joins on it.
--
--    OTHER STOCK ARRIVES AS ITS OWN ROW, from the admin console, with no
--    deploy. That is the whole point of 0208 and it is why this is a rename
--    rather than a split: nobody in this session can see the rack.
-- ---------------------------------------------------------------------------

update public.ideacad_materials
   set name       = 'Baltic birch plywood',
       updated_at = now()
 where owner is null
   and slug = 'wood'
   and name = 'Wood (Baltic birch plywood)'
returning slug, name;


-- ---------------------------------------------------------------------------
-- 4. THE DENSITY FORM. Carried forward from 0191 unchanged.
--
--    A BLIND PASTE WRITES NOTHING HERE, and that is structural rather than a
--    warning: `where v.density_g_cm3 is not null` excludes every unedited row,
--    so this statement updates ZERO rows as it stands and says so. Replace a
--    NULL with the figure you read off a document you OPENED, and replace that
--    row's source with the exact document -- the standard with its revision, or
--    the datasheet with its part number. `source_verified` goes true only for a
--    row whose density you supplied; that flag means somebody had the document
--    in front of them, which is why no session can set it.
--
--    WHERE THE NOTE ABOVE SAYS RANGE, A SINGLE NUMBER IS STILL WHAT THE COLUMN
--    HOLDS. Pick the figure for the alloy or grade the shop actually buys and
--    say which in the source; do not average the spread.
--
--    If you would rather do this signed in, /admin/ideacad-materials does the
--    same thing through `ideacad_material_save_global`, which reads
--    `auth.uid()` and `is_admin()` -- neither of which the SQL editor carries.
--    That is the better route and this is the one that works without a session.
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
-- 5. THE THICKNESSES ARE A SEPARATE DECISION AND A SEPARATE STATEMENT.
--
--    A density is a published fact; a stock list is a fact about YOUR SHOP, and
--    no document anywhere can answer it. 0208's lists were its own proposal.
--
--    REMOVING A THICKNESS ORPHANS SAVED WORK. A stock id is the slug plus the
--    thickness with its decimal point removed, so dropping one makes the lookup
--    return nothing, `evaluate()` non-null-asserts it, and the part's mass comes
--    back NaN with nothing on screen naming the id that went missing. ADDING
--    one is always safe. The three ids the app wrote before 0208 are
--    `steel-0125`, `steel-01875` and `aluminum-0125`, so 0.125 and 0.1875 must
--    stay on `steel` and 0.125 must stay on `aluminum`.
--
--    THE POLYCARBONATE 0.093 STAYS, AND HERE IS THE DECISION RATHER THAN A
--    SILENT CHOICE. Ledger 0191 found by arithmetic that 0.093 is not a 32nd:
--    3/32 is exactly 0.09375, so the seeded value is 0.00075 in light. It is
--    kept, for two measured reasons and one that is not measurable here.
--      * The id would move. 0.093 mints `polycarbonate-0093` and 0.09375 mints
--        `polycarbonate-009375`, so the correction is a REMOVAL in disguise and
--        carries the orphaning risk above.
--      * The row would then display a number that is not its own value.
--        `formatThicknessIn` rounds to four places, so a stored 0.09375 renders
--        as 0.0938 -- measured, in node, against the shipping helper. 0.093
--        renders as 0.093. Storing 3/32 properly would need that helper widened,
--        which is a code change in a file this bundle does not own.
--      * Whether the shop's sheet measures 0.093 or 0.09375 is a question about
--        the sheet, and 0.00075 in is inside the thickness tolerance of ordinary
--        extruded sheet anyway. Section 2's note now says the entry is the 3/32
--        nominal, so a student reading it knows what is in their hand.
--    So: NOT A TYPO, a nominal spelled as suppliers spell it. If Mr. Pina
--    measures the stock and wants the exact fraction, that is one edit here plus
--    a widening of `formatThicknessIn`, in that order.
--
--    Unedited, this writes nothing, for the same reason section 4 does.
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


-- ---------------------------------------------------------------------------
-- 6. THE SECOND READING. Compare it against section 1.
-- ---------------------------------------------------------------------------

select
	slug,
	name,
	density_g_cm3,
	source_verified,
	case when retired_at is null then 'live' else 'retired' end as state,
	source
from public.ideacad_materials
where owner is null
order by retired_at nulls first, name;
