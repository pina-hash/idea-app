---
title: "IdeaCAD materials are data: a shared library an admin edits, custom materials a student enters, and thicknesses you can actually buy"
date: 2026-09-12
branches: [claude/vibrant-brown-mgym02]
migrations: ["0208"]
subsystems: ["IDEACAD", "Classroom", "Admin"]
---

An earlier version of this prompt hardcoded six materials into
`src/lib/ideacad/blade/materials.ts`. Mr. Pina rejected it on 2026-09-12, and his reasoning
governs everything here: a material is four numbers in a form, the engine already does the
calculation from input values, and shipping a code change to add one is overkill. **Materials
are data.**

## The audit first: what was already there

`materials.ts` was 14 lines. `Material` is `{ id, name, densityGcm3 }`; `Stock extends
Material` with a `thicknessIn`, which makes a stock entry a MATERIAL AND A THICKNESS FUSED
INTO ONE ROW -- `steel-0125` is one object carrying 7.85 g/cm³ and 0.125 in together.
`DEFAULT_BLADE_CONFIG` held two body plastics (PLA, PETG) and three stocks (steel 0.125,
steel 0.1875, aluminium 0.125). `evaluate()` already consumed all of it and already did the
physics from input values, exactly as Mr. Pina said: `config.materials.find(...)!` for the
body, `config.stock.find(...)!` for the blade, then frustum, hex and polygon integrals.

Two things the audit turned up that shaped the whole design:

- **There WERE already material and thickness controls**, and not in `BladeEditor.svelte`
  where the prompt expected them. `panelFor('materials')` in
  `src/lib/ideacad/ui/feature-model.ts` built a Body material select, a Body fill slider and
  a **Blade stock** select, rendered by the generic `PropertyManager`. So this bundle changes
  a control's SOURCE and splits one select into two; it does not add a surface.
- **Both `evaluate()` lookups are non-null-asserted.** An id that resolves to nothing is not
  an error, it is `NaN` mass, `NaN` inertia and a rail of `NaN` readouts. That single fact is
  why the retirement design below looks the way it does.

Nothing in `evaluate.ts` was rewritten. The physics is untouched.

## One table, two layers

`ideacad_materials` (0208). `owner` NULL is a GLOBAL material only an admin writes, from
`/admin/ideacad-materials`, with no deploy. `owner` set is a student's own CUSTOM material,
visible to nobody else.

One table rather than two because a material is the same four numbers in both layers and
`evaluate()` resolves an id without caring which layer produced it. Two tables would have
meant two shapes, two reads, two write paths and a UNION in every consumer.

**A custom slug is minted by the database and never chosen.** `custom-<12 hex>`, with a CHECK
that a global slug may not start with `custom-` and an owned one must. That is what makes a
stored id unambiguous across the two layers: a student cannot shadow `steel` with a row of
their own and quietly change the physics of a part somebody is grading.

**`owner` carries no foreign key to `auth.users`, deliberately.** A cascade would delete a
student's custom materials when their account goes, while `ideacad_documents` is EMAIL-keyed
and its concepts survive -- so the trees would outlive the row they name, which is the one
thing the retirement rule exists to prevent. There is nothing to typo either: `owner` is only
ever written as `auth.uid()` inside a definer function and never from a parameter.

## The stored tree did not change, and that was the constraint everything bent around

A schema-1 blade tree still carries `materials.body` and `materials.bladeStock` as two
strings. Material and thickness are two CONTROLS over ONE stored stock id, not two stored
fields. Two fields would have made every row already in `ideacad_concepts` a legacy shape
`validateBladeTree` answers for forever, in a jsonb column of student work with no way to
rewrite it.

The stock id is derived: `<slug>-<thickness with the decimal point removed>`. **That spelling
is forced, not chosen.** The deployed ids are `steel-0125`, `steel-01875` and
`aluminum-0125`; `String(0.125).replace('.','')` is `0125` and `String(0.1875).replace('.','')`
is `01875`, and a fixed-decimal form would give `01250` and `01875` -- one of them different,
silently, on every concept already saved. So the seed gives the carbon-steel row the slug
`steel` and the 6061 row the slug `aluminum`, with 0.125 and 0.1875 among their thicknesses,
and all three deployed ids reproduce exactly with no special case anywhere.
`tests/ideacad-materials.test.ts` reads the deployed ids off `DEFAULT_BLADE_CONFIG` rather
than retyping them, and asserts the seed produces every one.

`splitStockId` matches against the SLUGS rather than splitting at the last hyphen, because a
slug may contain hyphens: split at the separator, `stainless-steel-0125` becomes the material
`stainless` and the row is lost.

## Retiring, and why there is no delete anywhere

Retiring must not break a part already using that material. The answer is a split:

- **RESOLUTION** (`bladeConfigWithMaterials`) is TOTAL. It includes retired rows, includes
  `DEFAULT_BLADE_CONFIG`'s own entries (so a pre-0208 id still resolves on a deployment with
  no library), and places a zero-density placeholder named `Material not available` for
  anything left over. `evaluate()` therefore always finds an entry and never returns NaN. It
  resolves the ids of EVERY concept on screen, not just the draft's, because the compare
  sheet evaluates them all against one config.
- **SELECTION** (`materialChoices`, `bladeStockChoices`) is live rows only, PLUS whatever the
  part is already on, labelled `(retired)`.

So a retired material keeps its mass, its inertia and its rule verdicts on every part already
using it, is offered to nobody else, and is offered -- marked -- to the person who has to move
off it. Retiring is reversible by the same call.

**Nothing is ever deleted, by anybody, on either layer.** There is no delete RPC and no delete
grant. A material is named by id inside a jsonb blob of student work and nothing can find every
tree that names one; the rejected alternative, a delete that refuses when any tree names the
row, would have to walk every `features` blob on every call and would still be wrong for a
document nobody has opened since.

## The densities are cited and UNVERIFIED, and that is a column rather than a paragraph

`IDEA_MATERIALS_PROCESS.md` is explicit: an AI's recollection of a datasheet is not a
datasheet, and a source that was not opened is not a source. **This container has no egress to
any of them.** `matweb.com`, `azom.com`, `en.wikipedia.org`, `mcmaster.com`,
`onlinemetals.com` and `research.fs.usda.gov` were each tried and each refused by the network
proxy, measured 2026-09-12.

So every seeded row NAMES the published standard or document that owns its density -- ASTM
A240 Type 304, ASTM A653, ASTM A36, ASTM B209 and the Aluminum Association, a SABIC LEXAN
sheet datasheet, the USDA FPL Wood Handbook FPL-GTR-282 -- and lands `source_verified` FALSE.
Every surface renders an UNVERIFIED chip while that flag is false, which is the same
vocabulary this editor already uses for `standardParts`. An admin clears the flag from the
console after checking the value against the named source.

Two rows carry an explicit ESTIMATE sentence in the UI, which is 0186's own instruction: the
carbon-or-unknown steel row says it assumes ASTM A36 mild steel and that a different carbon or
alloy steel is within about 2%; the wood row says it assumes Baltic birch plywood and that
balsa is near 0.16 and oak near 0.75.

**The stock thicknesses are a PROPOSAL and Mr. Pina should correct them.** They are ordinary
published sheet and plate sizes, not an inventory of the Bosco Tech shop, which this session
cannot see. 0208 prints every seeded thickness at apply time for exactly that reason.

## No 3D-printed material is a live global, and the custom layer is why that works

Mr. Pina's reason: a printed part's density depends on slicer settings, so a stated mass would
be a lie. `pla` and `petg` are seeded RETIRED -- not live -- and only because documents already
saved against the pre-0208 hardcoded list name them. That is the retirement mechanism doing its
job on day one rather than an exception to his decision: they resolve, they appear in no
picker, and a student who has weighed their own prints enters their effective density as a
custom material. The custom form says so in those words.

## The panel moved, and the fold decided its order

`panelFor('materials')` now returns NULL and `BladeEditor` branches on
`panelId === 'materials'` before it reads the panel, so there is exactly ONE materials panel.
The generic `PmField` union of number/choice/fact cannot express a thickness list whose options
depend on the material above it, nor a form with a write behind it; a second, generic panel
beside the real one is the copy that stops agreeing.

It is in the TREE pane and not the Rules rail, and that is measured. Ledger 0178 put the rail's
content 40px over its 515px box by adding two rows; it sits at **462px with 53px spare** today.
Four controls, a slider and a form would put it 300px over again.

**The panel is taller than its pane in any arrangement, so what was decided is which half is
above the fold.** Measured at 1440: **961px of content in a 515px box, 446px over.**
Interleaving each picker with its own density line and note put Blade material and Blade
thickness -- the two controls this whole bundle exists for -- BELOW the fold. Controls first,
prose after, puts all five above it; only Spin direction and the reading block are below.

Two more things the raster settled:

- **A side-by-side label and a 9rem control clipped the option text.** At 1440 the panel is
  257px wide and the select measured 144px, rendering `PLA (3D printed` -- cutting off exactly
  the `(retired)` marker a student needs. The fields stack now: about 25px a field, against a
  material name a student cannot read.
- **This container's headless Chromium paints NO scrollbar into a screenshot, at any colour.**
  `scrollbar-width: thin` with a colour does force a classic scrollbar -- the pane's
  `offsetWidth - clientWidth` goes from 1px (its own border) to 11px, measured -- but a 24px
  clip of the gutter came back a uniform dark column, and set to `#ff00ff` on `#00ff00` as a
  positive control it came back IDENTICAL. So the reserved width is real and the painted cue is
  not something this container can be asked about. Ledger 0178 recorded "a fold this
  container's Chromium draws no scrollbar for" as an observation; this is that observation with
  a positive control under it.

## Grants: 0166's shape, and the paste trap asked two ways

0201 invented its own grant shape and all ten of its functions plus all four of its tables came
out open to `anon` on production. 0208 revokes from `public, anon, authenticated` BY NAME for
its table and all four of its functions, grants back deliberately, and reads the catalog back in
its own self-check.

**0208's self-check counts nothing.** 0202's asserts `exactly ten ideacad functions`, which is
the assertion every lane adding one breaks; this one asserts the PROPERTY -- no function it
created is anon-executable, every one it meant to grant is authenticated-executable -- so it
stays true however many ideacad functions exist when it runs.

`tests/db/ideacad-materials-grants.test.ts` asks the trap TWO WAYS, because one instrument can
be wrong in a way that reads clean: the resolved `has_function_privilege` answer, and the raw
`proacl` text read for an `anon=` entry, which is the DEFECT rather than the symptom. Three
controls make a clean sweep mean something: `app_short_link_target`, anon-executable on purpose
since 0137, must read true under both; a throwaway function created with no narrowing must come
out anon-executable, proving the fixture carries the hosted default privileges; and a planted
`grant execute ... to anon` on one of 0208's own functions must be named by both instruments and
then stop being named once revoked. The mutation is a catalog grant and the restore is the
matching revoke -- nothing under `supabase/migrations/` is read, written or re-applied, and no
`git` command is run.

## The physics moves, which is the proof the library is wired rather than decorative

One geometry -- `DEFAULT_BLADE_TREE`, unchanged -- with only the two material ids moving:

| body + blade | mass | rotational inertia | mass rule (≤ 680 g) |
|---|---|---|---|
| 6061 aluminum, 0.125 in | **372.0 g** | **2960.6 g·cm²** | PASS |
| stainless steel 304, 0.125 in | **1102.3 g** | **8772.0 g·cm²** | FAIL |
| polycarbonate, 0.125 in | **165.3 g** | **1315.8 g·cm²** | PASS |
| carbon steel, 0.125 in | **1081.6 g** | **8607.6 g·cm²** | FAIL |

A rule check that PASSES in polycarbonate FAILS in steel at the same geometry, which is the
statement the prompt asked for. And the THICKNESS control moves it on its own, with the body
held at polycarbonate, one carbon-steel sheet at a time: **170.8 g / 1425.9 g·cm²** at
0.0625 in, **178.6 / 1584.4** at 0.125, **186.5 / 1742.9** at 0.1875 and **194.3 / 1901.4** at
0.25. A check that only ever varied the MATERIAL would pass on a build where the thickness
select wrote an id nothing read.

`tests/ideacad-materials-physics.test.ts` asserts those as DIFFERENCES and RATIOS, never as
pinned figures: a pinned number would be a value derived from the code under test, while a rule
that flips between two materials at one geometry is a statement about the engine. The browser
route drives the real `<select>` elements and reads the Rules rail back, which is the half a
unit test cannot reach -- a select wired to a config nobody evaluates looks identical on screen.

## What was NOT verified

- **Nothing was applied to production.** This container cannot reach it. 0208 is written to be
  pasted by hand and has never run against the live database.
- **No density was checked against its source.** See above; the `source_verified` column
  carries that, on every seeded row.
- **The stock thicknesses are not the shop's inventory.** They are published sheet and plate
  sizes.
- **0205, 0206 and 0207 do not exist in any pushed ref.** They are claimed by ledgers 0179,
  0181 and 0183. 0208 was written to depend on none of them -- it creates one table and four
  functions and `create or replace`s nothing that exists -- but "applies cleanly after all
  three" could only be reasoned about, not run. In particular the prompt says 0206 replaces
  0202's ideacad function guard; that file could not be read, so 0208 carries a guard of its
  own that is count-independent and would satisfy either shape.
- **The suite is red on one pre-existing file, on `integration` and on this branch alike.**
  `tests/db/migration-0177-tombstone.test.ts` fails because 0206 is a hole no pushed ref
  accounts for. Measured on `origin/integration` at `b0a8101d` BEFORE any change here: 1 failed
  file of 410, 7934 of 7935 tests passing, with the same assertion and the same number.
- **A teacher cannot see a student's custom material.** The select policy is
  `owner is null or owner = auth.uid()`, so a roster or grading surface rendering a concept that
  uses one gets the zero-density placeholder and the `Material not available` label rather than
  a wrong number. Widening the policy would mean putting `_notebook_email_for_user` inside an
  RLS `using` clause, which needs an `authenticated` EXECUTE grant on the uuid/email bridge
  0137 deliberately closed. The fix, when it is wanted, is `ideacad_roster` projecting the four
  numbers -- not a policy. Left undone deliberately; `ideacad_roster` belongs to another lane.
- **The real classroom item page is not wired to the library.** `BladeEditor` takes `materials`
  and `saveCustomMaterial` as OPTIONAL props and their absence leaves exactly the pre-0208
  behaviour, which is the console's own rule everywhere. Wiring them means touching
  `mount.ts`, `transports.ts` and the item route, all of which ledger 0179's document-sharing
  lane is in the middle of. The dev harness supplies both and the admin console is live.

## Corrections made to CLAUDE.md in the same change

The `svelte-check` baseline said **38 warnings in 21 files** against a tree measuring **37 in
20**, on `origin/integration` at `b0a8101d`. That is the FIFTH correction to that line, the
drift a fifth time entirely `state_referenced_locally` (32 down to 31), and downwards for the
second time running. The breakdown line was corrected with it.
