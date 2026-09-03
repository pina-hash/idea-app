---
title: "The harness counts block splits into a static half and a measured half, so adding a route spec stops costing a browser run and stops making a branch unmergeable (`claude/counts-block-serialization-dys0yu`, no migration)"
date: 2026-09-03
branches: [claude/counts-block-serialization-dys0yu]
migrations: []
subsystems: ["Browser harness", "Testing"]
---

Prompt 0019, decision 12. No feature in it and no migration. `tools/browser-verify/README.md`
carried ONE generated counts block written by ONE all-or-nothing run, and that
shape had just cost a whole bundle: on 2026-09-03 five finished, CI-green
branches all failed to merge, every one of them on that file, and 0017's
resolution was to discard four of the six blocks unread and regenerate once at
the end -- with a browser, because there was no other way to write the file at
all.

## What was measured before touching anything

**The generator's own coupling, read off `main()`.** `deriveStatic()` is a
directory walk plus an import of `routes.mjs` and needs nothing else.
`summarizeReport()` needs a `run.mjs --json` report and `runSelftest()` spawns
a second harness run. `assembleCounts()` took `{ stat, measured, selftest,
head, date }` and every caller was `main()`, which called `runHarnessJson()`
before it built anything. So there was no path through the script that wrote
the file without a measured report: moving a count that is an array length
cost a full visual pass.

**The incident, from git rather than from the ledger's account of it.** The six
blocks that existed that day, by their own `counts:data` lines:

| tree | specs | routes | devPages | runs | measurements | outside |
| --- | --- | --- | --- | --- | --- | --- |
| `integration` 22084e4 | 67 | 38 | 70 | 134 | 1788 | 6 |
| maps-editor-grants 80d31b2 | 69 | 38 | 70 | 138 | 1832 | 4 |
| foundry-decisions dcd7d33 | 67 | 38 | 70 | 134 | 1796 | 4 |
| instructor-tools 8981002 | 70 | 38 | 70 | 140 | 1878 | 4 |
| classroom-interaction 5d68073 | 68 | 38 | 70 | 136 | 1772 | 8 |
| grading-extra-credit 41c587c | 69 | 38 | 70 | 138 | 1820 | 6 |

Replaying each branch against the integration base with `git merge-tree
--write-tree`: all five conflict on `tools/browser-verify/README.md`, four of
them on NOTHING ELSE, and the maps branch additionally on the two code files
0017's ledger names. Reading the conflict markers out of each merged blob
against the `counts:begin` / `counts:end` line numbers, **every marker on every
one of the five falls strictly inside the block** -- the claim checks out.

The foundry branch is the interesting row: 67 specs, the same as the base. It
had added no route spec at all. Its block conflicted purely on measured numbers
and on the date and sha the generator stamps into the block's first prose line.

**What CI can and cannot do here.** The `test` job takes about three and a half
minutes wall clock (runs 544, 545 and 546 on 2026-09-03: 3m26s, 3m55s, 3m35s).
The harness could in principle launch there -- `browser.mjs`'s candidate list
ends at `/usr/bin/google-chrome`, which the `ubuntu-latest` image carries --
but the run this bundle measured took 387s on top of a dev-server boot, which
roughly triples the job, and README.md's own argument stands: a browser-shaped
flake must not be able to block a deploy to a classroom, and two specs on that
list are documented flakes. So CI regenerating the WHOLE block was never the
answer; the only question was whether it should regenerate the cheap half.

## The shape taken, and why not the other one

Two regions, nested inside the existing `counts:begin` / `counts:end`
envelope, with two generators and two freshness rules:

* **static** -- specs, distinct routes, `/dev` pages, widths, runs. Written by
  `npm run verify:counts` (`readme-counts.mjs --static`). Measured at **0.23s**,
  no browser, no dev server, no report.
* **measured** -- runs the report carried, measurements, outside-threshold
  rows, wall clock, `--selftest` controls. Written by `npm run verify:readme`,
  unchanged in cost and provenance.

The envelope is kept because `tools/idea-status.py` (outside this bundle's
scope) finds `<!-- counts:begin -->` and `<!-- counts:end -->` by exact string
and prints everything between them. Neither new marker contains either as a
substring, so that tool still lands on the envelope and now prints both halves.

**Shape (b) -- committed and regenerated per branch -- rather than shape (a),
CI writing it on `integration`.** Shape (a) removes the file from branch diffs
only if branches do NOT regenerate it, and the moment that is true the test
asserting the static counts against the tree has to be dropped or made
conditional. That assertion is the one worth keeping: it is what reddens when a
spec lands without a regeneration, and the prompt's own B3 requires it "against
the tree every time". A branch that added a spec would then be red in CI and
unmergeable for a reason no script on the branch could fix -- the same
serialisation with the browser removed. Shape (a) also buys a workflow that can
fail to push silently, and, since GitHub runs the default branch's copy, one
that would not take effect until `integration` reached `main`. Neither workflow
file was touched.

**THE STATIC REGION CARRIES NO DATE AND NO SHA, AND THAT IS THE HALF THAT
ACTUALLY FIXES THE MERGE.** A tree read has no measurement instant. With a
timestamp in it, two branches regenerating an UNCHANGED count still write two
different blocks and still conflict -- which is exactly what the foundry branch
did. Without one, the static region is a pure function of the tree: an
unchanged tree regenerates to the same bytes and produces no diff, and a merged
tree regenerates to the merged tree's own answer whatever either side had
written. That is what makes "run the script" a complete merge resolution rather
than a way of picking a side.

`spliceRegion` replaces everything between the markers whatever it is, conflict
markers included, so a region full of `<<<<<<<` regenerates clean. Verified:
with a hand-planted conflict in the static table, `--check` refused it and one
regeneration produced a file byte-identical to the pre-conflict one, 0 markers
left.

Every failure message now **names the script and not the right number**. The
old one printed `specs: the tree derives 81, the block says 80`, which is an
invitation to type 81 into the table -- the one edit the render check then
refuses. The new one says which counts moved and what to run.

Two smaller things fixed on the way past, both latent in the old file:
`spliceRegion` replaces with a FUNCTION rather than a string, because
`String.prototype.replace` interprets `$&` and `$'` in a replacement and the
data line is JSON carrying arbitrary check labels; and `--static` refuses
`--from` and `--no-selftest`, which are measured-half options and would
silently have done nothing.

## Proving it on the incident (B4, executed, not reasoned about)

Two throwaway branches off this bundle's own commit, each adding a real route
spec and regenerating with the new script, then merged. Both branches and the
merge were run; nothing here is an argument about what git would do.

**Case 1, both branches add ONE spec.** Both write `specs: 81, runs: 162`,
byte-identical. `git merge` reports **no conflict at all** -- the file is not
in the merge's file list. The merged tree then has 82 specs, so the block is
stale: `npm test` reddens on the static assertion, `verify:counts --check`
exits 1 naming the script, and one **0.237s** run makes it right.

**Case 2, one branch adds one spec and the other adds two** -- the incident's
real shape, where the two sides disagree on the number. `git merge` conflicts
on `tools/browser-verify/README.md`, and the conflict markers land at lines
78/86/94 inside a static region running 73 to 95. The **measured region (99 to
122) is untouched and entirely outside the conflict**, which is the coupling
gone. Resolution: `npm run verify:counts`, **0.249s**, 0 conflict markers left,
83 specs / 166 runs written, 10 of 10 tests green.

**The old generator on the same two trees, for contrast, measured rather than
asserted.** Replaying `origin/main`'s `readme-counts.mjs` on both branches with
an IDENTICAL canned report (`--from` plus `--no-selftest`, so no browser is
involved and the measured half cannot differ), the two blocks still came out
different -- different date, 146ms apart, and different sha -- on top of the
counts. So under the old design even case 1, where both branches agree on every
number, would have conflicted, and the file could not have been rewritten at
all without finding a browser.

## The test

`tests/derived-numbers.test.ts` grew from 7 assertions to 10, and each half is
now checked against the right thing: static against a live `deriveStatic()`
every run, measured against its own data line only. Both original positive
controls are kept, and the third one the prompt asked for is added: a static
digit changed by hand in the rendered table reddens `verifyStatic` **with no
`live` argument at all**, so no browser and no report is anywhere in that path
-- this project is vitest's `node` project, which has neither. It carries its
own negative half in the same test (the untampered file passes the identical
predicate), so the redness is the edit and not a predicate that refuses
everything. A fourth control covers a merge that removed a region marker.

There is also an assertion that the static data line's key set is exactly
`{schema, specs, routes, devPages, widths, runs}` -- that is the no-clock rule
written down where adding a `date` field would redden.

## Verified

* `npm test`: **242 files, 5120 tests, all passing** (233.18s). `main` measured
  242 / 5117 at the last integration; the three new tests are this bundle's
  test file going from 7 to 10.
* `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, broken
  down 31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, over 20 files. The two placeholder
  `PUBLIC_SUPABASE_*` values were exported before the sync, per the standing
  note about a checkout with no `.env`. One error was introduced and fixed on
  the way: `keyof StaticCounts` indexing a label map that has no `widths` key.
* `npm run verify:counts`: **0.229s** on a current tree (writes nothing and
  says so), **0.249s** to rewrite one. `--check` exits 0 on this tree.
* `npm run verify:browser -- --probe`: Chromium 141.0.7390.37 at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, screenshots, rAF, both
  observers and `color-mix` all working.
* **The measured run (B6).** Port 5199 confirmed free and no stray vite or
  chrome process before starting; tree clean. 160 route/width runs, 2196
  measurements, 8 outside threshold, 387.1s, 64 selftest controls (32 negative,
  32 positive), 0 instrument failures, on `f5028e6`. Compared against the
  committed block by identity: **all eight outside-threshold rows identical, by
  path, width, check and label, in the same order**; `runsMeasured`,
  `measurements`, `outside` and the whole selftest quadruple unchanged. The only
  differences are the date, the commit (`f60c70c` to `f5028e6`, a different
  tree) and the wall clock (371.0s to 387.1s), which `comparableMeasured` does
  not include precisely because it moves on every run.
* The four `/dev/classroom-interaction?case=typing` rows are **still present**.
  Prompt 0018 is on `claude/typing-collapse-fix-4iq5qg` and is not in this
  tree, so this is that bundle not having landed, not this one absorbing it.

## Not verified

* Nothing was run against the live Supabase project, and nothing here touches
  it: this bundle is a documentation generator, its test and one npm script.
* `npm run verify:readme -- --check` was not run as a separate pass. It is a
  second full harness run, and the region it would compare was written by the
  run above from the same report.
* `npm run build` was not run; the toolchain note about it is unaffected by
  anything here.
* The behaviour of the two documented flaky specs was not investigated, and the
  four standing outside-threshold findings were not touched. Both are
  explicitly outside this bundle.

## Left undone, deliberately

**A merge-time auto-resolution in `integrate.yml`.** The sweep already commits
merges to `integration`, so teaching it "if the only conflict is the static
counts region, regenerate and continue" needs no new write capability and would
turn case 2 above into no human step at all. It was not taken: it is a change to
the one piece of automation that moves branches, its effect would be invisible
until `integration` reaches `main` (GitHub runs the default branch's copy), and
a workflow that silently fails to regenerate is worse than a conflict that
stops. The cost of not taking it is one sub-second command on a merge that only
happens when two branches disagree about how many specs they added.
