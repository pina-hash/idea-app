---
title: "manifestToRubric: an HTML assignment's manifest becomes the rubric the classroom already grades (`claude/html-assignment-manifest-contract-r8gphu`, no migration)"
date: 2026-09-10
branches: [claude/html-assignment-manifest-contract-r8gphu]
migrations: []
subsystems: ["Classroom", "HTML assignments", "Browser harness", "Testing"]
---

Prompt 0129, one of four lanes building simultaneously against the HTML assignment
contract (0126 the bridge and the serving route, 0127 the manifest and the store, 0128
the fixtures, 0129 this one). One job: `manifestToRubric(manifest)` producing exactly what
`classroom_set_rubric` already accepts, so the grading console, extra credit, bulk grading
and the FACTS export need no change at all. No migration, no SQL, no write.

## The base and the duplicate check

Branched from `origin/integration` at `fd8e136e`; `origin/main` was `02ede0f3`. The three
opening commands were run before anything else: `git fetch --unshallow origin` (the clone
was shallow and `origin/main` was force-updated by it, 20 commits behind), `git fetch
origin integration`, and the identity check, which found `Claude
<noreply@anthropic.com>` already set.

All three duplicate checks came back clean. `git log --oneline
origin/main..origin/integration` was nineteen commits, none of them this work; no ledger
entry numbered 0126 through 0129 existed on any ref; and no file matching
`html-assignment` or `html-rubric` existed on any ref.

## The load-bearing decision: delegate to `rubricFromSpec`, do not mirror it

The output has to match a spec-derived rubric byte for byte -- the id namespacing, the
`<module title>: <criterion>` join, `criterionMax`, and the level map that keeps `short`
and drops it when blank. Writing those four again in `rubric.ts` is exactly the shape this
codebase keeps finding has quietly stopped matching, and it would stop matching SILENTLY:
a rubric that stores fine and displays wrong is the defect class the manifest's `short`
field exists to end, so reproducing it in the translator would be the same bug one level
up.

So the manifest is projected onto the rubric-shaped slice of an `AssignmentSpec` and handed
to the ONE translator `stagedRubricAfterSpec` and the builder's "Generate from spec"
already call. Byte-for-byte is then a property of CONSTRUCTION rather than a claim a test
has to keep re-proving. `rubricFromSpec` reads exactly five things -- `spec.modules`, and
per module `id`, `title` and `rubric`, and per row `id`, `criterion`, `points` and
`levels` -- and `specForRubric` supplies those and nothing meaningful else. It is not
exported: an HTML assignment has no spec, that is the point of it, and a half-real spec
escaping the module is something a later reader would reasonably pass to `validateSpec`.

**There is no `previous` argument, and that is a decision rather than an omission.**
`rubricFromSpec` takes one so a spec which GAINS authored criterion ids does not orphan
scores keyed under the positional `<module>-r<n>` it used to generate. A manifest has no
such state: `HtmlCriterion.id` is required and, by the contract, permanent -- the same rule
and the same reason as `HtmlBlock.id`, which becomes `block_id`. The positional form is
never generated here, so `previous` could only ever match itself and would be a no-op on
every manifest input while advertising a stability mechanism that is really the contract's.
What DOES orphan scores is an author renaming a criterion id between revisions, and nothing
in this module can detect that: the rubric simply arrives with a criterion nobody has
scored beside one nobody can reach.

## The four facts the prompt named, all confirmed

**`levelShort` resolves `short` first, then the spec's `short` matched on the DESCRIPTOR
within the criterion, then `descriptor`.** Read in `assignment-spec.ts` and confirmed in
both directions. A manifest-derived rubric never needs rung two: with `spec = null` all
thirteen levels in the fixture resolve to their own `short`, and `levelShort(l, id, SPEC)`
equals `levelShort(l, id, null)` for every one of them. The negative control is in the same
test file -- strip `short` from one level and it falls to the full descriptor -- so "rung
one answered" is distinguishable from "the resolver returned something plausible". **This
licenses passing `spec = null` to the grading console for an HTML assignment**, which the
harness's default state does.

**The graded rubric is a SEPARATE stored copy in `classroom_rubrics`, and importing a spec
does not update it. WHO REGENERATES IT FOR AN HTML ASSIGNMENT, AND WHEN, IS 0127'S IMPORT
PATH AND IS REPORTED RATHER THAN WIRED HERE**, because that call site is not this lane's
file. The shape it should take is already in the tree twice and neither is available to an
HTML assignment as things stand: `stagedRubricAfterSpec` carries a spec's rubric across at
item CREATION, and `RubricBuilder`'s "Generate from spec" is the one control on the EDIT
path. An HTML assignment has no spec, so neither fires, and without a call to
`manifestToRubric` + `classroom_set_rubric` an imported HTML assignment arrives with a
manifest that says how the work will be scored and a grading console with nothing to score
with. The re-upload path is the only way its rubric ever changes -- the contract's first
fixed decision is that an instructor edit is a re-upload producing a new revision -- so the
regeneration belongs at import and at every revision. `stagedRubricAfterSpec`'s `derived`
flag is the precedent worth copying: a rubric that went through the builder must never be
re-derived out from under whoever typed it.

**`classroom_set_rubric` touches no scores.** Read at its CURRENT definition (0110, which
adds the content-revision snapshot -- 0086 and 0095 are the earlier ones and testing
against those would be testing a function production no longer has). It reads
`classroom_items`, writes `classroom_rubrics` and calls `_classroom_snapshot_content`, and
names `classroom_submissions`, `rubric_scores` and `score` nowhere. Confirmed
BEHAVIOURALLY as well: a grade taken against the stored rubric, then a re-derived rubric
written over it from a revised manifest, and the submission row equal field for field
afterwards -- with a positive control asserting the rubric really did change, so the
equality is not the equality of two writes that never happened.

**A criterion id repeated across two modules is harmless; repeated inside one collides.**
The fixture puts `quality` and `notes` in both of its modules deliberately, and four
distinct rows come out. Both directions are asserted against the real
`_classroom_normalize_rubric` -- the collision raises `Duplicate rubric criterion id
"setup-quality"` -- and `manifestRubricIssues` says the same thing first, in the manifest's
own vocabulary.

## What `manifestRubricIssues` is, and what it deliberately is not

A refusal that reaches an admin as "Rubric row 7 needs an id" names a row in a payload they
never wrote. `manifestRubricIssues` names the module and the criterion they did. It calls
`criterionIssues` for the LEVELS -- that function is already the mirror of
`_classroom_check_levels` and a second copy of those five rules is what would stop agreeing
with the column -- and adds only the normalizer's own half, which operates on the criterion
rather than on its levels: the id's character set, the 64-character cap once namespaced, id
uniqueness, the 300-character criterion text, the 50-criteria cap and the 0-to-1000
maximum.

One item in it is not a refusal: a module whose criteria do not sum to its stated points
stores perfectly happily and then renders a denominator on the grading console that
disagrees with the points on the assignment. That is a display defect with no error behind
it, which is the kind this whole lane exists to stop shipping.

## Measured

- **`svelte-check`: 0 errors, 37 warnings at 31/5/1**, re-derived rather than read, before
  and after. The two `$env/static/public` values were exported into `.env` before
  `svelte-kit sync`, per the rule; without them a fresh checkout reports 13 phantom errors.
  `.env` is gitignored and is not part of the change.
- **`tests/html-assignment-rubric.test.ts`: 25 tests.** Pure, `node` project.
- **`tests/html-assignment-rubric-db.test.ts`: 9 tests** against a real embedded Postgres
  with the real migration chain through 0110 plus the 0137 sweep.
- **The browser pass: 6 route/width runs, 116 measurements, 0 outside threshold under
  `--strict`**, at 375px and 1440px. Level buttons measured 49.7px high at both widths and
  roster rows 44px, so the 44px floor is asserted rather than the 24px one -- the console
  carries no named instructor-density class on its own root
  (`main.grading-page.cr-console.cr-app-body`), and CLAUDE.md's rule is that a surface
  without one is student-facing for the purpose of the floor. Contrast: the level button's
  one-line form 6.84:1, the criterion name on the console 14.96:1, the level descriptor a
  student reads 7.63:1, the criterion name a student reads 15.7:1.

**The instrument was put to a broken tree before it was trusted.** Dropping `short` from
the projection -- the exact 2026-09-08 defect -- reddened ten measurements on the default
route (both `textContains` rows, the oracle summary and both `orderResult` scrapes, at both
widths) and put the full descriptors on the level buttons, and reddened 5 of the unit
and database tests. The module was restored from an in-memory copy and md5-checked, never
with `git checkout --`.

**And the mutation found a check that CANNOT bite, which is written into the spec beside
it.** The `.level-short` presence row stayed green through the whole mutation: `levelShort`
falls to rung three, so the element still renders with the descriptor in it and the count is
still 13. Only the TEXT can see this defect. A presence row that cannot catch the defect it
sits beside is exactly the false comfort a green tick buys, so the row's label now says it
is a count and not the guard.

## Contract amendment 1 arrived mid-bundle, and nothing had to be unwound

Ledger 0128 ported a real 933-line document and proved three parts of the original contract
wrong. **None of the seven corrections contradicted anything already built here**, which is
worth stating plainly rather than implying: the CSP `font-src` addition, the image
round-trip, the one-block table, `schemaVersion` on `idea:state`/`idea:saved`, `reason` on a
failed save, printing and external links staying the parent's, and the completeness check
being the parent's are all bridge, frame and serving-route concerns and this module reads
none of them. `rubric.ts` reads `modules[].criteria` and nothing else. Two corrections were
additive and were applied.

**HEADER BLOCKS.** The manifest gains a top-level `header: HtmlBlock[]` for identity fields
that carry no points. For this module their never reaching the rubric is a property of WHERE
THEY LIVE rather than a rule it applies -- they are not modules, so no path exists -- and it
is asserted anyway, with emptying the header as the positive control, because "it cannot
happen" and "nothing checks" is the pair that lets a later refactor make it happen. What the
amendment rejects is what 0128 had to do against the original contract: a 0-point module to
hold them, which would have rendered in the grading console as a criterion worth nothing.

**NO HALF POINTS, AND THIS IS THE ONLY RULE IN `manifestRubricIssues` WITH NO COUNTERPART IN
SQL.** Measured against the real database rather than assumed: a level worth 0.5 descends
strictly, still equals the maximum at the top and still reaches 0 at the bottom, so
`_classroom_check_levels` accepts it and `classroom_rubrics` stores it -- confirmed by
writing one through the real `classroom_set_rubric` and reading `0.5` back out. The grading
console's between-levels input is `step="0.5"` on purpose, but an OVERRIDE is a grader's
considered judgement with a required comment beside it, where a LEVEL's points are what
every student landing there receives. So the client is the only place the rule can live, and
the database test exists precisely to stop someone deleting it on the belief that the column
would have refused it anyway.

The arithmetic the rule implies is the useful half and is checked as its own message: points
descend strictly to zero, so N levels need N-1 distinct positive whole values, and the top
level must therefore be at least N-1. A criterion worth 1 cannot carry three levels at all.
The message says to repoint or merge, and repointing to 2 is put to the checker in the test
beside it, so the advice is not advice that does not work.

**The 19-criterion shape is exercised.** A real ported rubric is flat with many criteria,
not the handful this bundle's own fixture uses, so a case builds 19 across two modules --
with the criterion ids deliberately repeating between them -- and asserts 19 distinct
namespaced ids, no issues, and a total of 57. The normalizer's cap is 50; "well inside it"
is the kind of claim that is wrong once, so it is measured.

Nothing in the amendment required a change to the translator itself, the harness's
rendering, or any route spec's expectations.

## Two findings, both reported rather than fixed

**`jsonb` DOES NOT KEEP OBJECT KEY ORDER, so "byte for byte" is a claim about the client
side only.** Measured: a level went in as `points,label,descriptor,short` and came back as
`label,short,points,descriptor`. `jsonb` stores an object as a sorted key set (by key
length, then bytewise) where `json` would keep insertion order. The string comparison
against `rubricFromSpec` therefore lives in the pure test, and the database test compares
values. Nothing downstream reads a key order; this is recorded because a stringified
round-trip assertion looks correct and would be permanently red.

**ELEVEN ROUTE SPECS WERE ALREADY UNMEASURED AT `fd8e136e`**, before this branch existed:
the three `classroom-inspector-case-assignment-*`, two `classroom-split-s-1-manage-1-state-*`,
five `classroom-tools*` and `classroom-upload`. The measured region of
`tools/browser-verify/README.md` claims zero measurements outside threshold, which is a
claim about a set that is missing them, and that pair is exactly what
`tests/derived-numbers.test.ts` reddens on. So `npm test` was already red on
`origin/integration` for that reason and not for anything in this bundle. Regenerating the
measured region here covers those eleven as well as the three added by this lane; the
figures in that region are consequently not this bundle's alone.

## Not verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project and cannot apply a migration, call an RPC or sign in. Every database
  claim here is against the embedded Postgres with the real migration files.
- **No signed-in surface was driven.** The browser harness covers `/dev` routes only and
  holds no Bosco Tech Google session.
- **`prefers-reduced-motion` is `no-preference` in the harness**, so that path is not
  exercised, and the harness blocks every non-loopback request, so all text was measured in
  the fallback font stack rather than in Rajdhani.
- **No import path calls `manifestToRubric` yet.** The module, its tests and its harness are
  complete; the wiring is 0127's and is described above rather than built.

## Owned, and what was left alone

Created: `src/lib/classroom/html-assignment/rubric.ts`,
`tests/html-assignment-rubric.test.ts`, `tests/html-assignment-rubric-db.test.ts`,
`src/routes/dev/html-rubric/{+page.ts,+page.svelte,fixture.ts}`, three route specs under
`tools/browser-verify/routes/` (one file per route, collision-free by construction, so no
line is shared with another lane), the ledger entry and this file. The generated regions of
`tools/browser-verify/README.md` were regenerated, never hand-edited.

`GradingConsole.svelte`, `RubricBuilder.svelte`, `RubricView.svelte`, `assignment-spec.ts`
and `transports.ts` were read and not touched. The manifest interfaces in `rubric.ts` carry
`// CONTRACT COPY, ledger 0127 owns the canonical file` on every one, so the integration
bundle can delete them.
