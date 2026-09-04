---
title: "Four defects in the measuring instrument, and the freeze exception the repo never wrote down (`claude/instrument-defects-repo-record-b0lkg9`, no migration)"
date: 2026-09-04
branches: [claude/instrument-defects-repo-record-b0lkg9]
migrations: []
subsystems: ["Browser harness", "Testing", "Repo tooling", "Documentation"]
---

Prompt 0029. No `src/` change, no migration, no database. Every defect here was found by an
earlier bundle that reported it correctly and could not fix it, because the file was outside
its scope.

## The base

Started from `origin/integration` at `0368dfc`. `origin/main` was `c5eb148`, exactly 54
commits behind, and the container's checkout began there -- so the first act was
`git checkout -B <branch> origin/integration`. Git already carried a committer identity
(`Claude <noreply@anthropic.com>`); none was set. Working directory `/home/user/idea-app`.
The duplicate check found no ledger entry numbered 0029 on any ref (the only `0029` in any
tree is the unrelated migration `0029_gauntlet_drop_tiers.sql`) and no commit touching the
fixed-position skip beyond the two that wrote it.

## The baseline, and one figure in the prompt that was stale

Measured on the unmodified tree before anything was edited:

- **188 route/width runs, 2622 measurements, 0 outside threshold**, 425.7s wall clock.
- **64 `--selftest` controls (32 negative, 32 positive), 0 instrument failures.**

The prompt's claim was "ZERO outside threshold across 174 runs, and 64 selftest controls
with 0 instrument failures". The zero and the control figures hold; **174 is stale** and the
README's own generated block already said 188 (regenerated 2026-09-04 on `152b84d`). The
route list has grown since 174 was written. Nothing turns on it, but a figure quoted from
memory rather than from the block is exactly what the block exists to prevent.

## Defect one: the offender list named six innocent nodes for weeks

`checks.mjs` read `if (cs.position === 'fixed') continue`, which tests the ELEMENT'S OWN
position and never walks up. A fixed overlay was skipped and its static and absolute
children were not -- and those children carry the overlay's viewport coordinates, so on
`/dev/coins` the Ledger's `#student-drawer` put six descendants at `right` = 727-750 at the
top of every list sorted by overhang while contributing nothing at all.

### A1's question, answered by measurement rather than from the spec

**Can a fixed element's static descendant extend the document?** No -- and getting this
wrong in the other direction hides real overflow, so it was measured in this container's
Chromium 141.0.7390.37 at 375px rather than reasoned:

| fixture | `scrollWidth` | grew? |
| --- | --- | --- |
| a 1200px static box (control) | 1200 | **yes** |
| a fixed box 1200px wide | 375 | no |
| a 300px fixed box with a 1200px STATIC child | 375 | no |
| a fixed drawer at `left: 100%` with a static child | 375 | no |
| a 300px fixed box with a 1200px ABSOLUTE child | 375 | no |

The reason is the containing block chain rather than the `position` value: a fixed box's
containing block is the viewport, every descendant's chain runs up through it, and the
viewport's scrollable overflow region takes no contribution from a subtree it is not the
scroll container for. So the whole subtree is invisible to `scrollWidth`, and skipping only
its root reports its children as causes of an overflow they cannot cause.

### The exception is real, and it is why this is not a one-line `closest()`

A `position: fixed` box whose ancestor establishes a containing block for fixed descendants
is NOT viewport-fixed: it scrolls with the document and it DOES extend it. Measured on the
same fixture, a 1200px fixed child of a 10px ancestor:

- **CAPTURES:** `transform`, `translate`, `rotate`, `scale`, `perspective`, `filter`,
  `backdrop-filter`, and `will-change` naming transform / filter / perspective /
  backdrop-filter / translate / rotate / scale / **contain**.
- **does not:** `contain: paint | layout | strict | content`, `container-type`, `opacity`,
  `overflow`, `content-visibility`, `will-change: opacity`, and every `: none` form.

`will-change: contain` capturing while `contain` itself does not is the tell that a
value-by-value allowlist goes stale. So the predicate **FAILS OPEN**: it names every
property measured to capture plus the few measured not to (`contain`, `container-type`) and
treats ANY non-`auto` `will-change` as suspect. A false offender gets investigated; a hidden
overflow does not.

### What changed, and what it costs

The ancestor walk is paid only for a node ALREADY past the edge -- the overhang test moved
above it -- so it costs nothing on the overwhelming majority of a page. Skips are counted
(`fixedSkipped`, `capturedFixed`) and the count rides in the measured string when non-zero,
per `IDEA_VERIFICATION_ADDENDA` 13: an empty offender list beside a real overflow is
otherwise indistinguishable from a sweep that skipped the cause.

### The required positive control, both directions

Against the REAL `horizontalScroll`, on a page carrying a fixed drawer with three children
past the edge AND a genuine 900px static overflow:

- **after:** `525px overflow`, `9`... no: **offenders 1** -- `div#real right=900 ctx=null`
  -- `fixedSkipped 4`, `capturedFixed 0`. The real one reported, no drawer node reported.
- **before (the same fixture against the pre-fix module):** **offenders 4** --
  `div#real | button#drawer-close | div#drawer-head | div#drawer-body`.

And the direction that matters more, because it is the one a fix like this can get wrong:

- a 1200px fixed box under `transform: translateZ(0)`, **after:** `825px overflow`, offender
  `div#captured-fixed right=1200 ctx=captured-fixed`.
- **before:** `825px overflow` and **offenders 0** -- an empty list beside real overflow. The
  old skip had a false NEGATIVE as well as a false positive, which nothing had recorded.

## Defect two: `--tap-reach-w: 0` was read as 44, and it was NOT harmless

`parseFloat(cs.getPropertyValue('--tap-reach-w')) || 44` swallows a deliberate zero.

**The prompt said "harmless for every current caller and wrong the first time somebody means
it". That is not what the tree says, and this is the one claim in 0029 that was materially
wrong.** `--tap-reach-w: 0px` is the documented width knob and CLAUDE.md requires it wherever
two controls sit closer than 44px on one line. **Ten components in `src/` declare it** --
`ProfileMenu` (`.pm-trigger`), `AttachmentList` (`.attach-name`), `SongQueue`, `InfoTip`,
`ClassroomShell`, `MapsViewer`, `MapsBreadcrumb`, `NotebookView`, `FolderManager`, and the
rule's own comment in `src/app.css` -- and **three live `tapReach` rows point at two of
them**: `.pm-trigger` on `routes/pathways.mjs` and `routes/profile-menu.mjs`, and
`.attach-list a.attach-name` on `routes/classroom-images.mjs`.

So it was a live over-report rather than a latent bug. `.attach-name` measures 22.5px wide;
the check modelled a 44px reach, which also moved its two horizontal sample points to +-22px
from centre instead of +-11.25px, where they can pick up a neighbour that never steals a
real tap. The UNSET case still defaults to 44, because that is what
`var(--tap-reach-w, 44px)` in `src/app.css` does -- the distinction `||` cannot make is
between absent and zero. The declared string is now reported verbatim as `reachWDeclared`,
so a non-px value cannot be silently truncated to its number by `parseFloat`.

## Defect three: a row that could not pass, printing two identical values

`orderResult` requires `Array.isArray` on both sides, so a joined string can never come out
within threshold -- and both report columns are `JSON.stringify`, so
`expected: 'a,b,c'` against a probe returning `'a,b,c'` printed `"a,b,c"` twice over a red
verdict with nothing saying why. Prompt 0027 wrote four such rows and had to read the source
to find out.

**A3's decision was to REFUSE LOUDLY rather than to accept strings**, and the argument is
that the array contract is right: an element-for-element comparison cannot be confused by an
id holding the separator, and `docs/history/classes-block-course-identity-twrmsn.md` records
the repo choosing it deliberately. Accepting strings would make the check pass on a shape the
directory has agreed not to write. So the contract is unchanged and the REPORT is: `measured`
reads `CANNOT COMPARE: ...` and names the type it got, which makes it impossible for the two
columns to read the same. A probe that THREW is reported the same way, instead of printing a
bare `{"__evalError":"..."}` object against an array.

### The B3 sweep: how many callers pass non-arrays today

**Zero, of 109 `orderResult` rows across 51 specs.** Swept by importing every module under
`routes/` and reading `spec.orderResult[].expected` rather than by regex, so a row spread
over several lines cannot hide. The runtime half is answered by the baseline: a non-array
`actual` is necessarily outside threshold, and the baseline is 0 outside threshold over 2622
measurements. **0027's four rows are the ones the ledger describes, and 0027 converted them
to arrays in the same bundle that found the defect** -- so the sweep finds nothing because
the one instance was already closed, not because the defect was hypothetical.

## The controls, and the mutation that proves they bite

`--selftest` gains three groups: **70 controls (36 negative, 34 positive), 0 instrument
failures**, up from 64.

It also gains a per-slot **`assert`**, and it needed one. `horizontal-scroll`'s
`withinThreshold` is `scrollWidth - clientWidth` and nothing else, so **no pairing of
fixtures can say anything about which elements its offender list names** -- and the offender
list is the whole diagnostic value of that check, and is the half that was wrong. `assert` is
`(result) => string | null`; a slot is PROVED only when the verdict AND its assert both hold,
an assert failure is counted as an instrument failure, and the controls total stays one per
slot so the summary sentence `readme-counts.mjs` parses is unchanged.

**Proved by mutation, not argued.** All three defects were restored in `checks.mjs` (from a
`cp` copy, never `git checkout --`) and the run reported **4 instrument failures and exit
1**, naming each one:

- `measured and threshold still print identically ("a,b,c") -- the refusal is silent again`
- `a node under the fixed drawer is still reported: div#real | button#drawer-close | ...`
- `a captured fixed box was skipped and the overflow has no named cause:` (empty)
- `reach width read as 44, not the 20px the CSS computes from max(100%, 0px)`

Restored from the copy and md5-verified (`ecf992dc683a8b3a24cb6c4a6f549e8a`), re-run green.

## Defect four: the freeze exception nobody wrote down

CLAUDE.md says a legacy file "is unfrozen only by an explicit rule added here first". Prompt
0025 edited `src/lib/legacy/coins/index.html` under an explicit scoped authorisation
(`the tab bar rules ONLY`) and could not write the rule, because CLAUDE.md was outside its
files; its own history entry asked a later bundle to do it. Read from the commit rather than
from the request: `cac6ac7` added `flex-wrap: wrap` to `.tab-bar` and
`min-height: 44px` plus the flex centring that floor needs to `.tab-btn`, inside the
document's own `<style>`, and **touched no markup and no script**. That is now recorded in
the freeze section with the date, the authorisation, the two rules, and the sentence that it
is a record of one exception rather than a standing licence.

**The heading "The freeze, and its one exception" is deliberately unchanged.** VANGUARD is
still the only STANDING exception; this is one recorded grant, and the paragraph says so.

## Defect five: the workflow that skips and does not delete

`integrate.yml` skipped a branch whose tip `$TARGET` already contains, and skipping does not
delete. The old comment argued against deleting on the grounds that containment by this
system and containment by a hand-merge are indistinguishable from inside the job. Both halves
are true and the conclusion did not follow: the question a delete has to answer is not who
merged it, it is whether anything would be lost.

**`contained_delete_gate`, between markers, so the proof cannot drift into a private copy of
the rule** -- the arrangement `tools/integrate-gate-proof.sh` already uses for `ledger_gate`.

Three things it does that were required:

- **Containment is tested against a ref ALREADY ON THE REMOTE** (`origin/$TARGET` or
  `origin/main`), never against the local `HEAD`. By the time the loop runs, `HEAD` is
  `$TARGET` plus `origin/main` plus whatever this run has merged, and none of that is pushed
  -- so a branch contained only in `HEAD` could have its only copy on the runner's disk.
- **Three refs are refused under any containment answer**: `main`, `integration` and
  `$TARGET` by name, plus anything that is not a `claude/` branch, checked before containment
  is looked at.
- **The delete is reported** in the job summary under `### Already contained, deleted`, with
  its reason, in the shape the existing sections use.

### The reorder, which the first draft got wrong

Containment used to be asked FIRST in the loop, which was free while its only outcome was a
skip. It is not free once the outcome can be a delete: asked first, **a branch whose CI is
red and whose tip happens to be contained would have been deleted with its CI conclusion
never read.** The proof caught this, not review. The CI check and `ledger_gate` moved above
the containment question, so the order is now: is anything holding this branch, and only
then, what should be done with it. The cost is one Actions API call per contained branch per
run.

### One delete loop, and the out-of-scope test that forced the better shape

The first version added a second `git push --delete` loop. **`tests/workflows.test.ts`
reddened**: it pins the per-file push shape (`integrate.yml`: 3) precisely so a second push
cannot arrive unnoticed. That file is outside this bundle's scope, so it could not be
generalised -- and the fix turned out to be the better design anyway. Both reasons now feed
the ONE lease-pinned delete loop the file already had; what differs is when a branch joins
the list. The merged half waits on `pushed=yes` because until `$TARGET` is pushed the merge
exists only on the runner; the contained half does not, because containment was established
against a remote ref before the job started -- and gating it on `pushed` would mean a sweep
that merged nothing (the ordinary re-run, and exactly the run on which a stale ref is
noticed) deleted nothing either.

**Worth naming for the next session:** had the two-loop shape been kept, that pin would have
needed generalising by whoever owns `tests/workflows.test.ts`. It is a good assertion and it
did its job.

### Which of B5's four cases were executed

All four, plus more, against throwaway `mktemp -d` repositories, by cutting the marked text
out of the workflow and sourcing it. **14 assertions, 14 passed:**

1. **contained tip deleted** -- `claude/contained`, whose tip `integration` holds. Also
   `claude/in-main`, contained only by `origin/main`.
2. **non-contained tip left** -- `claude/outstanding`.
3. **failed-CI branch left** -- proved by ORDERING rather than by the gate, and the run says
   so out loud: the gate alone answers `delete` for a contained tip, and the CI `continue`
   sits above it by line number (553 < 579), so control never reaches the gate for a red
   branch. A red branch with an outstanding tip is `keep` at the gate as well.
4. **protected ref never deleted under any containment answer** -- `main`, `integration`,
   the target passed by name, and a non-`claude/` branch with a contained tip.

Plus the call site (grep): the gate is called, `ledger_gate` and the CI skip both precede it,
there is exactly ONE lease delete in the file, the merged half still sits inside the `pushed`
guard and the contained half outside it. And a **negative control on the harness itself**:
renaming the markers makes the cut refuse to run, loudly, rather than fall back to a private
copy.

**The proof script is NOT in the repo, and that is a gap this bundle could not close.**
`tools/` is outside its owned files, so the harness ran from the scratchpad. `integrate.yml`
names what was executed in its own comment and says the harness belongs beside
`tools/integrate-gate-proof.sh`.

## What was NOT verified

- **B5 takes effect only when `integration` reaches `main`.** GitHub runs the copy of a
  `workflow_run` workflow that is on the DEFAULT branch, which the file's own header says.
  So the next branch this system lands will still stand, and that is not the change being
  broken.
- **No workflow was triggered.** The gate's verdicts are proved against fixture
  repositories; the merge, the push, the Actions API call and the delete itself are not
  exercised, exactly as `tools/integrate-gate-proof.sh` states about its own scope.
- **No Vercel preview applies.** This bundle changes the instrument and the repo's record and
  ships no surface a person can open.
- **No signed-in surface, no live Supabase, no real Drive round trip.** None was needed.
- **`prefers-reduced-motion` is `no-preference` in the harness and web fonts are blocked**
  (`fonts.googleapis.com` is reset by the proxy), so text is measured in the fallback stack.
  Both are the harness's standing limits and neither is qualified by anything here.

## Out of scope, reported and not changed

- **`.github/workflows/README.md` lines 73-74** describe the job summary as "merged,
  conflicted, or left alone with the reason (`CI on abc1234 is failure`,
  `already in integration`)". After this change `already in integration` is usually a DELETE
  reason and there is a fourth section. That file is not this bundle's.
- **`tests/workflows.test.ts`'s push-shape pin**, above. It is currently green and correct.
- **`checks.mjs`'s `MOTION_PROBE.paintedOf` omits `content-visibility`**, which `isVisible`
  checks. An ancestor at `content-visibility: hidden` leaves a descendant's rect at 0x0, so
  `isVisible` catches it through the zero-box reason and `paintedOf` -- which deliberately
  drops the geometry half, for SVG stroke geometry -- would not. No surface in the harness
  uses it today. Reported, not changed: it is a second decision about what "painted" means
  and belongs with whoever is measuring motion.
- **The `/dev/notebook` flake**, excluded by the prompt.

## Counts

- **Static region:** unchanged (94 specs, 47 routes, 78 `/dev` pages, 188 runs).
  `npm run verify:counts` reported it already current and wrote nothing, which is what a
  bundle that adds no route spec should produce.
- **Measured region:** regenerated on a clean tree; see the block in
  `tools/browser-verify/README.md` for the figures and the sha they were taken on.
- **Full suite:** 253 files, 5309 tests, green.
- **`svelte-check`:** 0 errors, 37 warnings, breakdown 31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- the baseline, re-derived after
  `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported.
