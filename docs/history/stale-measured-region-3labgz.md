---
title: "The counts block said zero for a finding it had never measured, and now it records which routes it saw (`claude/stale-measured-region-3labgz`)"
date: 2026-09-05
branches: [claude/stale-measured-region-3labgz]
migrations: []
subsystems: ["Browser harness", "Testing", "Documentation"]
---

Prompt 0046. No migration, no database, no app code. One field added to a generated
region, one narrow rule in the test that already reads it, and the prose that had
stopped describing the file it sits in.

## The base

Started from `origin/integration` at `fc46b6a`, not `main`. `git` in the container
already carried a committer identity (`Claude <noreply@anthropic.com>`), so the
"Please tell me who you are" hazard the prompt warns about did not arise and nothing
was set.

## What was actually wrong, reconstructed from git

Prompt 0043 reported that the counts block said `Measurements outside threshold: 0`
for the whole life of a finding it had recorded itself. The reconstruction says that
is nearly right, and the two places it is wrong both make the case worse rather than
better.

The spec that measures the classroom spec table's four row-action glyphs,
`tools/browser-verify/routes/spec-table-empty-1.mjs`, was added by `700a56d`
(2026-09-05 01:39:50). The regeneration history of the measured region, taken by
walking every commit that touched `tools/browser-verify/README.md` and reading the
data line out of each:

| wrote the region | at | measured on | runs | specs measured | specs in that tree | outside |
| --- | --- | --- | --- | --- | --- | --- |
| `80dfe19` | 09-05 01:02 | `4dc9df8` | 196 | 98 | 98 | 0 |
| `700a56d` | 09-05 01:39 | `dea1c3e` | 194 | 97 | 98 | 0 |
| `56b26c7` | 09-05 01:54 | `700a56d` | 196 | 98 | 98 | **2** |
| `28ceeb0` | 09-05 01:58 | `4dc9df8` | 196 | 98 | 99 | 0 |
| `5aa1e22` | 09-05 14:51 | `9e09d36` | 198 | 99 | 99 | 0 |
| `20eb2c9` | 09-05 15:00 | `5aa1e22` | 198 | 99 | 99 | 0 |
| `3f611c6` | 09-05 15:05 | `ada9041` | 202 | 101 | 101 | **2** |
| `fc46b6a` | 09-05 15:09 | `5aa1e22` | 198 | 99 | **101** | 0 |

So the finding WAS recorded, once, by `56b26c7`, and it survived four minutes and
nineteen seconds. `28ceeb0` -- a different branch regenerating against its own tree,
measured on `4dc9df8`, which predates `spec-table-empty-1.mjs` entirely -- wrote
`outside: 0` over it, and it stayed 0 for the next thirteen hours. Then `3f611c6`
re-measured and found the two rows again, and the merge `fc46b6a` put the
zero back.

**The two corrections to 0043's account.** First, the mechanism at the moment the
finding vanished was not only "the route was added after the last run" -- it was a
sibling branch's older measurement landing on top of a newer one, and then a merge
doing the same thing again. Second, and this is the part worth having: the defect was
not historical when this bundle started. It was live on both branches a reader
consults.

```
origin/main         block: measured on 4dc9df8, 196 runs (98 specs), outside 0
                    tree:  99 route specs
                    never measured: spec-table-empty-1.mjs        <- 0043's finding, by name

origin/integration  block: measured on 5aa1e22, 198 runs (99 specs), outside 0
                    tree:  101 route specs
                    never measured: item-images-empty.mjs, item-images-text.mjs
```

That is the whole design argument in one reading. The signal names the route, and on
`origin/main` the route it names is the one 0043 found by accident.

**The gap was not routine, which is what makes a cheap check affordable.** Across the
thirty regenerations since 2026-09-02, `specs at measurement` equals `specs in the
writing tree` in twenty-two of them. Sessions were running the six minutes. Every
non-zero gap came from a merge or from a branch regenerating against a sibling's
tree -- never from anyone declining to measure. So a rule that fires on the gap does
not fall on the population that was already paying; it falls on merges.

## Why the recorded sha could not have caught this, and must not be read as if it could

The measured region already recorded the commit and the instant. It was not enough
and it is not a matter of nobody looking: `4dc9df8`, `5aa1e22`, `9e09d36` and
`ada9041` are all ancestors of `fc46b6a`. On a history this merge-heavy a stale
measurement's commit is still an ancestor of HEAD and reads as entirely plausible,
and there is no ordering between two ancestors on parallel branches that a reader
could apply by eye. `ada9041` carried 101 specs and `5aa1e22` carried 99, and
`5aa1e22` is the LATER commit by clock.

`ada9041` also illustrates why an ancestry check would have been the wrong fix.
`3f611c6`'s 202-run measurement covered every spec this tree has -- and was taken on
a tree without `5aa1e22`'s `SpecRenderer` fix, so its two findings were real about
`ada9041` and stale about `fc46b6a`. Recency and coverage are different questions.
Only coverage is cheap.

## What was built

`readme-counts.mjs` records `covered` in the measured region: the sorted basenames of
the route specs the run visited. `MEASURED_SCHEMA` goes 1 to 2.

* **A `readdirSync`, not an import of the route table.** It has to cost milliseconds,
  it must not need a browser, and it must still answer on a tree where some spec file
  throws on import -- a broken spec is exactly when you want to know which routes went
  unmeasured. A filename is a spec's identity here: `routes.mjs` derives it from the
  spec's own `path` and refuses a file whose name does not match, so two specs cannot
  share one.
* **The block shows the reader two adjacent rows.** `Route specs the run covered`, in
  the measured table, sits directly under `Route specs`, in the static table. The
  static region is checked against the tree on every `npm test`, so it is the fresh
  number, and a reader comparing 99 to 101 needs no tooling at all. The rendered prose
  says to make that comparison and says the commit is the weaker signal.
* **The render stays a pure function of the data line.** It was tempting to render
  "99 of 101 in this tree" -- and that 101 is a TREE fact, so it would go stale inside
  a generated block and break the render check the moment a spec landed. The measured
  region prints only what the measurement knows; the TEST is what compares.
* **A filtered report can no longer write the region.** `run.mjs` pushes one run per
  spec per width with no branch, so `covered.length * widths` is structural.
  `main()` refuses to write when the report's run count is not that product, which
  catches a `--only` pass and a `--from` file recorded against a different tree.
  The width count is the caller's own derivation, never a literal in the verifier --
  a second spelling of how many widths a pass runs is the pair that stops matching.

### The rule, and what it lets through

`verifyMeasured` reddens on a conjunction: **unmeasured specs AND the block claims
zero findings.** That pair is exactly the shape that tells a reader consulting the one
generated place that there is nothing to see.

The two alternatives were both worse. A hard failure on any coverage gap puts a
six-minute browser run in front of every route-adding bundle and every merge, which
is the coupling the two-region split (prompt 0019) exists to remove -- and it would
have fired on all eight of the merges above. A warning nobody must act on is how this
became invisible in the first place.

What the conjunction lets through, each with a control in the test:

1. **Unmeasured specs beside a non-empty findings list.** The list may be incomplete.
   The block is no longer claiming nothing is there, which is the acute harm.
2. **A spec file EDITED without being renamed** -- a new check added to an existing
   spec moves no filename and this signal is blind to it. Hashing the spec files would
   catch it and would also redden on a whitespace change, which is the
   hard-fail-on-everything rule wearing a different hat.
3. **A spec DELETED since the measurement.** A measurement over a superset of this
   tree still has a valid zero here, so refusing it would block a bundle that only
   deleted a spec. `unmeasuredSpecs` reports it and nothing fails on it.
4. **The app changing under an unchanged spec set.** Nothing cheap sees this. It is
   what the recorded commit is for, weakly, and the README now says so in those words.

### A verifier that threw instead of reporting

Found while bumping the schema, and fixed: `verifyMeasured` pushed a schema-mismatch
problem and then carried on into `renderMeasured(data)`, putting an older region
through this version's renderer. On the 1-to-2 bump that died with `Cannot read
properties of undefined` out of a function whose entire job is to report problems
rather than raise them -- three assertions failed with a stack trace instead of one
failing with "rerun the script". Both verifiers now return immediately on a schema
mismatch, and a control pins that a foreign-schema region is reported and never
rendered.

## What was measured

STATED PLAINLY: the numbers below are from this container, and every claim about the
history above is from `git`, not from memory.

* **The positive control the prompt required.** A throwaway spec was added to
  `tools/browser-verify/routes/` and the cheap test run with no browser in the path.
  Result and restoration are in the session report; the file was removed and both
  `readme-counts.mjs` and the README were confirmed md5-identical afterwards.
* **Permanent controls in `tests/derived-numbers.test.ts`**, each driving the real
  predicate over a region regenerated from patched data so that the coverage rule is
  what is under test and not the hand-edit rule firing first: the missing-spec
  failure NAMES the spec and not the innocent ones; its negative half (the real spec
  list) is clean on the same block; the let-through case passes and its own
  conjunction control reddens when the findings are taken back out; the deleted-spec
  case passes and reports `removed`; a filtered run reddens; a foreign schema is
  reported without throwing.
* **`npm run verify:counts` and `npm run verify:readme`** were both run, the latter on
  a clean tree. Figures are in the session report and in the regenerated block.

## One slip, recorded because the rule already existed

While removing the throwaway control spec this session ran `git checkout --
tools/browser-verify/README.md` to undo what `verify:counts` had just written to
it. That restores from HEAD, not from the working state, and it silently discarded
the README's prose edits and the freshly regenerated measured region along with the
unwanted static rewrite -- which is verbatim the trap `CLAUDE.md` describes under
the verification standard. Nothing was lost permanently (the prose was rewritten and
the harness re-run on a clean tree, which B5 wanted anyway), and the code and test
changes were in other files and untouched. It is written down because the tell was
subtle: the command exited 0 and said nothing, and the file it left behind looked
plausible.

## Not verified

* **Nothing about production, the live Supabase project, or any signed-in surface.**
  This bundle touched no app code and no migration.
* **The two workflows that consume this file** (`integrate.yml`, `deploy.yml`) were
  read-only to this bundle and were not run. `ci.yml` was not modified: it already
  runs `npm test`, which runs this test, so no workflow change was needed.
* **`tools/idea-status.py`** was not run. Its `counts:begin`/`counts:end` envelope is
  untouched and neither new marker contains it as a substring, but the tool itself
  was outside this bundle's ownership.
* **Whether any OTHER finding was hidden by the same mechanism during the window** is
  answered in the session report from the recorded `outsideRows`, not from a re-run of
  the harness on each historical tree. Re-measuring eight old commits was not done.

## What is left

The 0043 finding is currently visible again on this branch and the two `item-images-*`
specs are measured. But `origin/main` still carries the block measured at `4dc9df8`,
and merging this branch does not by itself regenerate it -- whoever lands
`integration` on `main` gets the honest block along with everything else, and until
then `main`'s own copy is the stale one this bundle describes.
