---
title: "The citation was the defect, not the missing number"
date: 2026-09-13
branches: ["claude/vigilant-hopper-vt669h"]
migrations: []
subsystems: ["ideacad", "materials", "tooling"]
---

Ledger 0194. **No density was written, for the second bundle running, and that is
still the right answer -- but this time it is not the finding.** Ledger 0191
stopped at the egress wall and stopped correctly. What it could not see from
there is that `0208`'s citations would have been wrong even with the documents
open: `ASTM A240/A240M` is a procurement specification and does not state a
density at all, so the stainless row attributes a number to a document that does
not contain it. Opening A240 and clearing the flag would have produced a row that
was verified and still wrong about where the figure came from.

## The defect, and why it is upstream of the network

A procurement specification says what may be SOLD under a name: chemistry limits
and mechanical minimums. It does not say what the material weighs, because
weight is not a thing you specify, it is a thing that falls out of the
composition you permitted. A240 permits nickel anywhere from 8.0 to 11.0 %, and
the published spread for 304 -- **7.90, 7.91, 7.93, 8.00** -- is that band
expressed as a density. Every one of those figures is compliant 304. There is no
number in the document to go and read.

So `source_verified` was never the blocking column. A flag cleared against A240
records that somebody opened a document which cannot answer the question.

**The other three have the same shape, and one of them is visible from the seed
alone.** `ASTM B209` covers aluminium sheet and plate across the alloy range
1100 through 7075 -- alloys that do not share a density -- so it cannot be the
source of 2.70 for 6061, and `0208`'s own note already says 5052 and 7075 differ
by about 4 %. The migration contradicts itself in two adjacent fields. `A653`
governs the zinc coating and the base-metal grade, and `0208`'s note already
says the cited figure is for the BASE steel, which is the half A653 does not
fix. `A36` is a procurement spec like the others, and the row it sits on is
explicitly for stock of unknown provenance, so the citation is doubly beside the
point.

**Which of those claims is which, because it matters here more than usual.** The
A240 finding was GIVEN to this session as a measurement of 2026-09-13 and is not
established by it. The A653, A36 and B209 readings are REASONED -- from each
document's own title, which is what `0208` cites, and from `0208`'s own notes --
with no document opened. The FPL-GTR-282 finding is ledger 0191's. All four are
labelled that way in the correction file itself, so the reasoned ones can be
checked by whoever has the documents.

## The egress test, run first because everything downstream is conditional on it

Negative again, on two independent paths, and this time including the hosts the
corrected citation model newly points at.

`curl` through the container proxy: **24 hosts, every one `CONNECT tunnel
failed, response 403`** -- `asminternational.org`, `matweb.com`, `astm.org`,
`iso.org`, `aluminum.org`, `aisi.org`, `nist.gov`, `doi.org`, both USDA FPL
hosts, `en.wikipedia.org`, `azom.com`, `mcmaster.com`, `onlinemetals.com`,
`outokumpu.com`, `kaiseraluminum.com`, `covestro.com`, `solutions.covestro.com`,
`sabic.com`, and the three Baltic birch panel makers `koskisen.com`, `upm.com`
and `metsagroup.com`. The proxy's own status endpoint records each as
`connect_rejected -- gateway answered 403 to CONNECT (policy denial)`, which
`/root/.ccr/README.md` says to report rather than retry. `WebFetch`, a different
path entirely, answered `EGRESS_BLOCKED` for `asminternational.org`,
`en.wikipedia.org` and the A240 product page.

The build allowlist is reachable and only it, measured rather than assumed:
`api.github.com` 200, `raw.githubusercontent.com` 301, `registry.npmjs.org` 200.

**`WebSearch` was not used to set a number.** `IDEA_MATERIALS_PROCESS.md` refuses
"a file that was searched but not read", 0191 held that line, and the reasoning
is stronger now rather than weaker: a search summary for 304 returns a figure
from the middle of a compliant range and presents it as *the* density, which is
precisely the error the range exists to prevent.

**Zero densities written. Zero `source_verified` flags cleared.** The UNVERIFIED
chip is still correct on all eight rows.

## The corrected citation model, which is the deliverable

Per row: what is cited now, why it cannot carry a density, and what document
can.

| row | `0208` cited | why it cannot answer | what to open |
|---|---|---|---|
| stainless steel (304) | ASTM A240/A240M | procurement spec; the 8.0-11.0 % nickel band IS the 7.90-8.00 spread | a physical-properties reference for UNS S30400, or the mill certificate for the sheet |
| galvanized steel | ASTM A653/A653M | governs the coating and the base-metal grade; the cited figure is the base steel's, which A653 does not fix to one steel | a physical-properties reference for low-carbon sheet steel |
| carbon or unknown steel | ASTM A36/A36M | procurement spec, and the row is for stock whose alloy nobody knows | nothing can answer for the piece; weigh it |
| 6061 aluminium | ASTM B209 **and** Aluminum Standards and Data | B209 covers 1100 through 7075 at once | **the second citation is right.** The Aluminum Association's *Aluminum Standards and Data* carries a per-alloy table |
| polycarbonate | ISO 1183 / ASTM D792 | test METHODS, not values -- `0208` already said so | the datasheet for the sheet grade the shop buys |
| Baltic birch plywood | FPL-GTR-282 | species data; a manufactured panel is not a species (0191) | the panel maker's datasheet |
| PLA, PETG (retired) | ISO 1183 | test method, and a printed part is not solid | the spool's datasheet |

**The aluminium row is the interesting one and is why this is a model rather
than a sweep.** Its citation is HALF right already: `0208` named two documents
and the second is the correct kind. So the correction drops half a citation
instead of replacing it, and a blanket "these citations are all wrong" would have
thrown away the one thing in the seed that was right.

## The property that lets a correction ship from a container with no egress

**A CITATION CORRECTION AND A DENSITY CORRECTION HAVE OPPOSITE FAILURE
DIRECTIONS.** Asserting a number ADDS a claim and needs a document. Removing an
attribution a document cannot support TAKES a claim away and needs none. Every
way the citation half can be wrong is in the direction of saying less than is
known.

So `supabase/data/0194-material-citation-model.sql` has two halves with
deliberately different blind-paste behaviour, and says which and why in its own
header: **sections 2 and 3 write on a blind paste; sections 4 and 5 write
nothing.** The density form is 0191's, carried forward unchanged -- every value
NULL, `where v.density_g_cm3 is not null` -- so there is ONE file to paste rather
than two that can drift. 0191's file gains a SUPERSEDED pointer at its head; it
was left otherwise untouched and is still harmless to paste, because unedited it
writes nothing.

Two gates keep it from destroying work rather than adding to it. Section 2 is
`and m.source_verified = false`, so **a citation somebody has checked and signed
off is theirs** and a re-paste cannot overwrite it with "NOT SOURCED". Section 3
is gated on the wood row still carrying its seeded name, so a re-paste cannot
rename something Mr. Pina has renamed himself. Both are asserted.

## Where no single density is true, the data says so

There is no column for this and adding one would be a migration, so it is said in
`note`, in `0208`'s own vocabulary rather than a new one -- it already used
`ESTIMATE` for two rows.

- **304 is `RANGE`.** Not an estimate: every figure in the spread is a correct
  density for a compliant material. Different word, different claim.
- **Carbon or unknown steel keeps `ESTIMATE`** and gains the sentence that it
  cannot become anything else. The row exists for stock of unknown provenance,
  so this is not a gap waiting on a document. *That much is `0208`'s own
  position and is not reopened.*
- **Galvanized steel becomes `ESTIMATE`. My proposal.** A653 does not fix one
  steel and the coating is excluded by `0208`'s own note, so the figure is a
  low-carbon stand-in rather than a value for the coil.
- **Baltic birch plywood keeps `ESTIMATE`** and gains the reason: a panel's
  density follows the veneer mix, the glue and the moisture, so even the panel
  maker's figure is grade-specific.
- **Polycarbonate stays a typical-grade figure** pending the sheet's datasheet,
  which is what `0208` already said well.
- **6061 is the exception and saying so is the point.** An alloy is a fixed
  composition, so this is the one row here where a single number is the right
  SHAPE. Flagged explicitly, because a sweep that made everything a range would
  have taken a correct value and made it vaguer.

## The wood row, finishing 0191's recommendation

`0208` half did it: the row was named `Wood (Baltic birch plywood)` and its
thicknesses are 3, 6 and 12 mm, which is a plywood list and not a lumber list. It
was a Baltic birch row wearing a generic title. The name is now **`Baltic birch
plywood`**.

**The slug stays `wood`, and that is not a detail.** A stock id is the slug plus
the thickness with its decimal point removed, so a slug rename orphans every
concept saved against it. The name is display text and nothing joins on it. The
test asserts the slug SET is unchanged across the paste rather than asserting the
wood row's slug alone, so a rename that moved any slug reddens.

Other stock arrives as its own row from the console, with no deploy. The split
into birch ply plus whatever solid stock exists is still 0191's rejected
alternative for 0191's reason: nobody in a container can see the rack.

## The polycarbonate 0.093: NOT A TYPO, and the decision is recorded rather than taken silently

0191 found by arithmetic that 0.093 is not a 32nd -- 3/32 is exactly 0.09375, so
the seeded value is 0.00075 in light. **It stays**, for two measured reasons and
one that cannot be measured here.

1. **The id would move.** 0.093 mints `polycarbonate-0093`; 0.09375 mints
   `polycarbonate-009375`. The "correction" is a REMOVAL wearing a different
   hat, and removal is the one edit to this table that silently destroys saved
   work.
2. **The row would then display a number that is not its own value.** Measured in
   node against the shipping helper: `formatThicknessIn` rounds to four places,
   so a stored `0.09375` renders as **`0.0938`**, while `0.093` renders as
   `0.093`. Storing the exact fraction needs that helper widened, which is a code
   change in `src/lib/ideacad/blade/materials.ts` -- a file this bundle does not
   own.
3. Whether the shop's sheet measures 0.093 or 0.09375 is a question about the
   sheet, and 0.00075 in is inside ordinary extruded-sheet thickness tolerance
   anyway. **This session cannot open a supplier catalogue to settle whether
   0.093 is a listed size**, and did not guess: the decision rests entirely on
   the asymmetry in (1), which is checkable here.

The note now says the entry is the 3/32 nominal and gives the exact fraction, so
a student reading it knows what is in their hand. If Mr. Pina measures the stock
and wants the exact value, it is one edit here plus a widening of
`formatThicknessIn`, in that order.

## The test, and the failure it actually caught

`tests/db/ideacad-materials-citations.test.ts` runs the REAL file, read off disk,
against the real chain on real Postgres. Eight tests.

The bar for a test here is silent failure, and there are three.

**A string too long for its column.** `source` caps at 300 characters, `note` at
400, `name` at 60. Nothing in this repo executes a `supabase/data/` file -- it is
pasted by hand into the SQL editor against production -- so an over-long sentence
is found by Mr. Pina, mid-paste, with earlier statements already committed. This
is not hypothetical: **mutating one source string to 301 characters fails the
suite with `violates check constraint "ideacad_materials_source_length"`**, which
is exactly the message that would otherwise have arrived in front of production.

**A density shipping in the committed file**, which is the whole property this
lane rests on. **The slug moving with the name.**

**The instrument was not trusted on its own timing.** Eight tests passing in 6.1 s
on a 208-file chain reads like a vacuous pass -- 0191 recorded the same smell --
so three mutants were planted in the REAL file:

| mutant | result |
|---|---|
| a density filled in (`7.93`, `'from a search result'`) | **4 of 8 red** |
| the rename also moves the slug to `baltic-birch` | **4 of 8 red**, including the stock-id resolution test |
| one source string at 301 characters | **suite fails at `beforeAll`**, 8 skipped, constraint named |

After each, the file was restored **from a `cp` copy taken beforehand, never
`git checkout --`** (the rule about mutation scripts discarding uncommitted
work), and md5-checked identical at `de870b06e7f0a1199fcbe3dcb5406842` each time.
The suite is green on the restored file.

**And the positive control is a second database.** "A blind paste writes no
density" is an ABSENCE, and an absence passes when the statement is broken, when
the slugs do not match, or when the file never ran. So the same file with ONE
density substituted in is run against a second `startTestDb`, and must write
exactly that row and leave the other seven unverified. The substitution is
asserted to have changed the string, so a `replace` that silently matched nothing
cannot pass either.

## Paste trap: zero, two ways, against four planted controls

A `$tag$` inside a `--` comment balances in Postgres and breaks the Supabase
editor's client-side splitter, which cost `0194`'s namesake migration a full
apply cycle. Way 1 counts any `$` in the comment portion of a line; way 2 counts
dollar-quote tokens by position and checks the code-line tokens pair up. **Both
correction files read 0 / 0 and exit CLEAN**, and the new file contains no
dollar-quoting of any kind -- no `do` block, plain statements only.

The controls, appended to a copy of the real file: a `$report$` in a comment, a
bare `$$` in a comment, an unbalanced `$$` on a code line, and a lone `$5` in a
comment. **All four read PASTE TRAP PRESENT and exit 1.** Controls C and D each
fire on exactly ONE of the two ways, which is the evidence that they are
genuinely different instruments rather than one rule written twice -- and it
records that way 1 is deliberately stricter than the defect, since a lone `$`
does not break the splitter.

## Numbers

- **Full suite, baseline on `origin/integration` `62ef6bc7` before any edit: 443
  files, 8469 tests, 0 failed, 452.36 s.** After: see the ledger entry's closing
  figures; the delta is exactly the one new file.
- **`svelte-check`: 0 errors, 37 warnings in 20 files**, breaking down 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. **Measured at the branch point with the new test
  file held aside, then again with it**, because `tests/**/*.ts` is inside
  svelte-check's include list and a baseline measured on the tree under test is
  not a baseline. Identical both times, and identical to CLAUDE.md's stated
  figure, so **that line needed no correction** -- the second bundle running for
  which that is true, after five corrections in three weeks.
- `node tools/claude-md-check.mjs`: agrees with the tree.

## Not verified, and stated as a result

- **Every density in `ideacad_materials`.** No published source was reached, on
  either path. No flag cleared, no number written.
- **That A653, A36 and B209 state no density.** REASONED from their titles and
  from `0208`'s own notes; no document was opened. The A240 finding is the
  prompt's, not this session's.
- **The gauge thickness tables**, stainless and galvanized both, exactly as 0191
  left them.
- **Whether 0.093 in is a size a supplier actually lists.** No catalogue was
  reachable. The decision to keep it rests on the id-orphaning asymmetry and the
  `formatThicknessIn` measurement, both of which were checkable here.
- **Production.** `ideabosco.com`, `www.ideabosco.com`, `apps.ideabosco.com` and
  the vercel.app host are all refused by the same egress proxy (000, CONNECT
  403), so the deployed build was not read and no claim is made about what is
  live. `DEPLOY_PROBE_URL` is unset and `tools/deploy-probe.mjs` exits 1 with
  "cannot confirm", reported verbatim and never treated as a pass.
- **The correction file against a real Supabase editor.** Its statement splitter
  was not exercised. What WAS exercised is the file against a real Postgres, which
  is the half that catches a constraint violation.
- **The browser pass.** `npm run verify:browser` was not run: this bundle adds no
  component, no route and no stylesheet. `verify:readme` was not run, per the
  prompt.
