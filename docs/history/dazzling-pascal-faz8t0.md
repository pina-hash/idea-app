---
title: "The material densities could not be verified, and that is the finding"
date: 2026-09-12
branches: ["claude/dazzling-pascal-faz8t0"]
migrations: []
subsystems: ["ideacad", "materials", "tooling"]
---

Ledger 0191. **The densities are not verified and not one flag was flipped.** The
container has no route to any published source, so the bundle stopped exactly
where the prompt said to stop and shipped the things that do not depend on a
source: the egress finding stated precisely enough to be actionable, a guard on
the hand-edit that is coming, the correction form itself, and two judgments.

## The egress test, which was the first job and decided everything after it

Ledger 0186 recorded "no network route" for `0208`. This container is the same,
and the shape is now measured rather than described.

**Two independent paths, both refused.** `curl` through the container's own
proxy answered `CONNECT tunnel failed, response 403` for every one of
`fpl.fs.usda.gov`, `research.fs.usda.gov`, `astm.org`, `aluminum.org`,
`matweb.com`, `en.wikipedia.org`, `mcmaster.com`, `azom.com`, `iso.org`,
`sabic.com`, `outokumpu.com`, `onlinemetals.com`, `kaiseraluminum.com`,
`aisi.org`, `nist.gov` and `doi.org`. The proxy's own status endpoint records
each as `connect_rejected -- gateway answered 403 to CONNECT (policy denial)`,
and `/root/.ccr/README.md` is explicit that a 403 is an organization egress
policy denial to be reported rather than retried. The `WebFetch` tool, which
takes a different path entirely, answered `EGRESS_BLOCKED` for every domain
tried including the FPL chapter PDF and the Covestro and Rolled Alloys
datasheets.

**WHAT IS ALLOWED IS THE BUILD ALLOWLIST AND NOTHING ELSE**, measured rather
than assumed: `api.github.com`, `raw.githubusercontent.com` and
`registry.npmjs.org` all answer 200. That is the interesting half. The container
can fetch the repository and its dependencies; it cannot open a document.

**AND THE ONE THING THAT DOES REACH OUT IS THE THING THAT MUST NOT BE MISTAKEN
FOR A SOURCE.** `WebSearch` works -- it returned titles, URLs and a prose
summary for 304 stainless and for Makrolon. **It was not used to set a single
number, and this is the load-bearing paragraph of the entry.** What comes back
is a model's summary of snippets, not the document: `IDEA_MATERIALS_PROCESS.md`
refuses "a file that was searched but not read" by name, on the ground that a
hit proves the string is in the document rather than that the passage was
consulted. The search summary for 304 asserted **7.93 g/cm3** against `0208`'s
seeded **8.00** -- a real discrepancy, in the one direction that matters, and
exactly the case where a plausible number is worse than none. Adjudicating it
needs the datasheet open, which is the thing that could not be done.

So: **zero densities verified, zero `source_verified` flags cleared, zero
numbers written.** The UNVERIFIED chip is still correct on all eight rows.

## What was checked, because some of it needs no source at all

Unit arithmetic is not a published fact and was done rather than deferred.

| check | result |
|---|---|
| wood 3 / 6 / 12 mm to inches | 0.118110 / 0.236220 / 0.472441 against seeded 0.118 / 0.236 / 0.472 -- agrees to 3 dp |
| 1/16, 1/8, 3/16, 1/4 in the seed | exact: 0.0625, 0.125, 0.1875, 0.25 |
| polycarbonate 0.093 | **not a 32nd.** 3/32 is 0.09375, so the seeded value is 0.00075 in light |
| `thicknessKey` over all 27 seeded thicknesses | no collision; every (material, thickness) pair mints a distinct id |
| the three deployed stock ids | `steel-0125`, `steel-01875`, `aluminum-0125` all resolve against the seed |

The gauge figures -- stainless 0.024/0.030/0.048/0.090 and galvanized
0.0276/0.0336/0.0396/0.0516/0.0635/0.0785 -- are claims about a published gauge
table and are **not** checked here, for the same reason the densities are not.
`0208`'s note says the galvanized six are 24 through 14 gauge coating-included;
that sentence is unverified too.

## The guard on the edit that is coming, which is the one code change

`tests/db/ideacad-materials-seed-resolves.test.ts` is new. The gap it closes was
found by reading the existing coverage rather than by a failure:
`tests/ideacad-materials.test.ts` asks "does every deployed stock id still
resolve" of a `SEED` fixture whose own header says it is *"Copied as DATA, not
imported from SQL"*. It is a hand-typed transcript of the migration, so the test
proves the resolver agrees with the transcript and stays green if the transcript
and the migration ever disagree. The expected value and the thing under test are
the same typing.

The new file asks the same question of the **database the migration built**:
real chain, real Postgres, rows read back through a real client session, ids
read off `DEFAULT_BLADE_CONFIG` rather than retyped. Four tests -- the stock ids
resolve and the resolver is not answering yes to everything (`steel-9999` and
`unobtanium-0125` must come back null); the material ids are present; every row
is seeded unverified and every row names a source; and **the guard bites**,
proven by dropping 0.1875 from the steel row on the database exactly as a
hand-edit would and confirming `steel-01875` stops resolving while
`steel-0125` and `aluminum-0125` do not.

That last one is the reason the file exists at all. Materials are admin-managed
now and the thickness lists are about to be corrected by hand. Removing a
thickness orphans every concept saved against it: the lookup returns nothing,
`evaluate()` non-null-asserts it, the mass comes back NaN, and nothing on screen
names the id that went missing. **Adding a thickness is always safe; removing
one is not**, and that asymmetry is written into the correction file's own
comments where whoever pastes it will read it.

**The instrument was not trusted on its own timing.** Four tests passing in
2.9 s on a 208-file chain reads like a vacuous pass, so the assertion was
deliberately broken (`expect(seed.length).toBe(99999)`) and the failure printed
the eight real rows with their real densities and thickness arrays. The file was
then restored from a copy taken beforehand -- `cp`, never `git checkout --`,
per the rule about mutation scripts discarding uncommitted work -- and md5
checked identical at `675572627dab7d3934e342c68c9e0554` before and after.

## The correction form: `supabase/data/`, and a blind paste writes nothing

`0208` built this table to be edited, so a density fix must not be a migration
-- an immutable applied record is the wrong shape for a row somebody corrects
from a console. `supabase/data/0191-material-density-verification.sql` is the
first file in a new directory and CLAUDE.md now carries the convention.

**Every density in it is NULL and that is the design, not an omission.** The
`update` carries `where v.density_g_cm3 is not null`, so pasting the file
unedited updates **zero rows** and says so. There is no path by which this file
sets a density to a value nobody checked, which is the only honest way to ship a
correction form from a container that could not check one. The thickness
correction is a second statement with the same property, kept separate because a
density is a published fact and a stock list is a fact about the shop.

It notes that the admin console is the better route when signed in, since
`ideacad_material_save_global` reads `auth.uid()` and `is_admin()` and the SQL
editor carries neither.

**Paste trap: zero, two ways, against four planted controls.** A `$tag$` inside
a `--` comment balances in Postgres and breaks the Supabase editor's splitter.
Way 1 counts `$` of any kind in the comment portion of every line; way 2 counts
dollar-quote tokens by position and checks the code-line tokens pair up. The
real file reads 0 / 0 / 0 and exits CLEAN. The controls: a `$report$` in a
comment, a bare `$$` in a comment, an unbalanced `$$` on a code line, and a lone
`$5` in a comment all read PASTE TRAP PRESENT and exit 1. The fourth is there to
show the two ways are genuinely different instruments -- way 1 fires on it and
way 2 does not -- and to record that **way 1 is deliberately stricter than the
defect**: a lone `$` does not break the splitter, and the stricter rule is the
conservative direction.

## The two judgments, flagged rather than taken

**Carbon or unknown steel: A36 is the right assumption and the estimate language
should stay, but the confirmation is Mr. Pina's.** The reasoning is about the
CATEGORY, which is checkable without a datasheet: the row exists for stock whose
provenance is unknown, so no density can be correct for the piece in hand and
the only question is whether the stated figure is the best available guess.
`0208` already says ESTIMATE in the note and already says the spread across
carbon and low-alloy steels is small. Nothing here argues for changing it.
**What is NOT established is the 7.85 itself**, which is an A36 value this
session could not open a document for, and the ~2 % spread claim in the note is
likewise unverified.

**Wood is not one material and 0.68 is a fiction. This is a proposal.**
FPL-GTR-282 gives specific gravity per species across a wide range, so a single
number for "wood" is wrong for almost every piece anybody picks up -- `0208`'s
own note says so and names balsa near 0.16 against oak near 0.75, a factor of
nearly five. A part whose mass rule is 680 g is genuinely decided by which board
was used.

**Proposed: keep one row, name the species in the row's NAME rather than only in
the note, and let the shop's other stock arrive as its own rows.** `0208` half
did this already -- the row is named "Wood (Baltic birch plywood)" and its
thicknesses are the 3, 6 and 12 mm metric sheet sizes, which is a plywood list
and not a lumber list. So the row is already a Baltic birch row wearing a
generic slug. The proposal is to finish that: leave `slug` as `wood` untouched,
because it is the join key and a saved concept names it, and treat the generic
title as the defect.

**The rejected alternative is splitting it now**, into birch ply and whatever
solid stock the shop holds. It is probably right eventually and is wrong today
for a reason that has nothing to do with wood: nobody here knows what is in the
shop, so a split invents rows for material that may not exist while leaving out
material that does, and every invented row arrives UNVERIFIED anyway. Adding a
row is cheap from the console and costs no deploy -- that is the whole point of
`0208` -- so the split is better made by somebody standing in front of the rack.

**And the density is the half a proposal cannot fix.** Whichever shape wins, the
number still needs the document, and Baltic birch plywood is a manufactured
panel rather than a species, so FPL-GTR-282 does not answer it directly at all.
It wants a panel manufacturer's datasheet, which is a different source from the
one `0208` names.

## The thicknesses, and who is the authority

Reported per the prompt, with the one line it asked for kept literal:
**`0208`'s thickness lists were its own proposal, and the shop is the authority
because Mr. Pina has the material and this session does not.** Nothing found
here agrees or disagrees with them, because nothing could be opened -- the only
substantive finding is the polycarbonate 0.093 above, which is arithmetic rather
than a source, and the standing warning that removing an entry orphans saved
work while adding one is free.

## One file outside the Owns list

`CLAUDE.md`, named here because the prompt's surface did not include it.
`supabase/data/` is a new convention, and CLAUDE.md's own standing rule is that
a new convention updates it in the same change that introduces it. The insertion
is a single block in the Migrations subsection of Database conventions and
touches nothing ledgers 0189 and 0190 are working in; `history.ts` and the
sharing surfaces were not opened at all.

## Numbers

- **Full suite, baseline on `origin/integration` `7f5ca8f0`: 433 files, 8318
  tests, 0 failed, 377.43 s.** After: 434 files, 8322 tests, 0 failed. Delta
  +1 file and +4 tests, which is exactly the new file.
- **`svelte-check`: 0 errors, 37 warnings in 20 files**, breaking down 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, before and after. **This matches the figure in
  CLAUDE.md exactly and that line needed no correction** -- worth recording,
  since the five preceding corrections make a match the notable outcome. The two
  placeholder `$env/static/public` values were exported before `svelte-kit
  sync`, per the phantom-error rule.
- `node tools/claude-md-check.mjs`: agrees with the tree.

## Not verified, and stated as a result

- **Every density in `ideacad_materials`.** No published source was reached. No
  flag was cleared and no number was written.
- **The gauge thickness tables**, stainless and galvanized both.
- **Production.** `ideabosco.com` and the vercel.app host are both refused by
  the same egress proxy, so the deployed build was not read and no claim is made
  about what is live. `DEPLOY_PROBE_URL` is unset and `tools/deploy-probe.mjs`
  exits 1 with `CANNOT SAY`, reported verbatim and not treated as a pass.
- **The browser pass.** `npm run verify:browser` was not run: this bundle adds
  no component, no route and no stylesheet, and the one code file it adds is a
  database test.
- **The correction file against a real Supabase editor.** Its statement splitter
  was not exercised; the paste trap was checked statically, two ways, against
  four controls, which is what this container can do.
