---
title: The measured counts region was a shared write point; the measurement is a directory now
date: 2026-09-12
branches: [claude/sharp-gauss-kp749m]
migrations: []
subsystems: [browser-verify, tooling]
---

`tools/browser-verify/README.md` carries two generated regions. The STATIC one
was split out on 2026-09-03 (prompt 0019) because a directory listing should
not cost a browser pass, and it has behaved since. The MEASURED one was left as
a single JSON blob on a single line, written only by a report covering every
route spec in the tree, and it went on losing races: at least four staleness
events on 2026-09-11, and two sessions each spending a ~17-minute browser pass
on the same staleness, one of which was discarded as redundant when another
lane landed an equivalent pass mid-run.

This bundle makes the measurement **one committed file per route spec** under
`tools/browser-verify/measured/`, and makes the rendered region a pure
function of that directory. No migration, no file under `src/`.

## What was actually wrong, reproduced before anything was changed

Two lanes each add a route spec. Both shapes were built as real git
repositories cloned from this one at `origin/integration` (`ebf23dc`) and
merged, before a line of the fix existed.

**Neither lane re-measures.** Each runs `npm run verify:counts`, correctly, for
its own tree. Each writes `{"specs":195,...,"runs":390}`. The two edits are
byte-identical, so git takes them with **no conflict at all**, and the merged
tree has 196 spec files under a region claiming 195. Green parents, red merge,
and `integration` takes no push-triggered CI run, so nothing says so until a
landing bundle dispatches one by hand. `tests/derived-numbers.test.ts` reddens
on the merged tree with two findings: the static region out of date, and 2
specs never measured beside a block claiming `outside: 0`.

**Both lanes re-measure.** The date, the sha and the covered list differ, so
the one line conflicts. `integrate.yml`'s resolver takes the TARGET's side
inside the markers and regenerates the static half -- which is correct for the
static half and **throws one lane's measurement away**, because that
measurement existed nowhere but in the line that was discarded. Simulated with
the resolver's own documented behaviour (`git checkout --ours` on the README,
then `readme-counts.mjs --static`), the merged tree reported:

    the block now covers      : 195 specs, 390 measurements, outside 0
    marks-repro-x.mjs         : MEASURED, in the block
    marks-repro-y.mjs         : LOST -- not in the block

That is ledger 0147's finding, reproduced: `integration` sitting at a
measurement claiming zero outside threshold over a set missing a spec.

## The fix, and what was rejected

**One file per route spec**, named exactly as the spec file under `routes/` is.
Two lanes measuring two different specs write two different files and share no
line, so the merge is additive and the merged store describes the merged tree
by construction. `docs/history/` reached this shape for one 35,000-line record
that blocked four consecutive batches; `routes/` reached it for one array's
closing bracket that forced three hand resolutions in a day. This is the third
shared write point in the same directory getting the same treatment.

Three properties carry it, and each is a decision rather than a detail:

* **The filename is the identity, and it is not a second rule.** `routes.mjs`
  derives a spec's filename from its own `path` with `slugify` and refuses a
  file whose name does not match, so the map from spec to measurement file is
  injective and collision-free by construction. `slugify` is now exported and
  imported rather than copied; a private copy in the store is exactly the pair
  that stops matching. `readStore` refuses a file whose `spec` field and
  filename disagree, because a rename is how one spec's numbers would quietly
  start standing for another's.
* **Nothing in the store moves when nothing moved.** `_selftest.json` carries
  no clock and no sha -- the static region's rule, one directory down and for
  the same reason -- so two lanes that both ran `--selftest` over an unchanged
  instrument write byte-identical files and cannot conflict.
* **The rendered block is a tree read.** `deriveMeasured` sums the directory,
  so `npm run verify:counts` writes BOTH regions in under a second with no
  browser, and `tests/derived-numbers.test.ts` compares the block against the
  directory on every `npm test`.

**What was rejected.** Making the aggregate correct-by-construction after a
merge is not achievable: an aggregate over a set two branches each extended
cannot be merged correctly by a line-based merge, whatever the file layout, so
some cheap regeneration step always remains. The two ways out were to stop
committing the aggregate at all -- the `docs/history/` answer, where the three
indexes are generated and gitignored -- or to make regenerating it free. The
first was rejected because `tools/idea-status.py` reads this block out of
`origin/main` with no access to the repository's files, and a reader opening
the README on GitHub wants the numbers; the second is what shipped. For the
same reason the `covered` list stays in the data line even though it is now a
second copy of a directory listing: `idea-status.py` has no other way to know
which routes the numbers are about.

**What it costs.** 194 new files, 50,874 bytes, against the 6,509-byte line
they replace. A full pass now rewrites 194 files instead of one line -- but an
unchanged measurement rewrites the same bytes apart from its instant, so the
diff is proportional to what actually moved. And `_selftest.json` is a
run-level fact in a store keyed on routes, which is the one place the
one-file-per-spec rule does not reach; it is a function of the instrument
rather than of a pass, so it does not race.

## What the shape buys, measured

**A partial re-measure became possible at all.** The old writer threw on any
report that was not a full pass of the tree, so recording a number about one
new route cost a pass over 194. `npm run verify:readme -- --route marks` in
this container: **19 seconds**, two files written, every other file untouched,
against **1032.6s** for the full pass.

**And a partial pass gives the same answer as a full one**, which is the
assumption a composable store rests on and so was measured rather than
assumed. Measuring `marks` alone recorded 2 runs / 44 measurements / 0 outside,
and `html-rubric-state-graded` (which the same filter matches) 2 / 34 / 0 --
identical, value for value, to what the full pass wrote for both. The store
was then restored byte-identically and md5-checked.

**A measurement is no longer discarded by a merge.** The same two lanes on the
fixed tree, the same conflict, the same resolution -- take the target's side,
then the tree read, which took **171ms**:

    the block now covers      : 196 specs, 6794 measurements, outside 0
    marks-repro-x.mjs         : MEASURED, in the block
    marks-repro-y.mjs         : MEASURED, in the block

The README still conflicts when both lanes regenerate it, and that is not
removed and cannot be: two lanes render two different blocks. What changed is
that resolving it costs 171ms instead of seventeen minutes and loses nothing,
because the data is in the files and the block is only a rendering of them.

## The guard was strengthened, and it was checked that it was not quietened

`tests/derived-numbers.test.ts` keeps every assertion and every control it had.
Both of its documented mutations were re-run against `origin/integration` at
`ebf23dc` -- the tree those figures describe -- and against this tree:

| mutation | on `ebf23dc` (18 tests) | here (25 tests) |
| --- | --- | --- |
| one static digit edited by hand in the rendered table | 3 red | 3 red |
| the table and the data line edited together into a self-consistent lie | 4 red | 4 red |

**The file's own header said 7 and 8**, measured 2026-09-05, and was wrong
about the tree it was written against -- the file had moved under the numbers.
It is corrected with the pair both trees measure.

Seven controls were added, each driven over the real predicate and each proved
to bite by mutating the real tree and restoring from a copy, md5-checked:

* one digit edited inside `measured/marks.json` -- **3 red**, including the
  merged-store control;
* one measurement file deleted -- **5 red**;
* a measurement file for a spec the tree no longer has -- **green**, and named
  by `verify:counts` as an orphan. That let-through is the old `removed` rule:
  a store covering a superset of this tree still has a valid zero, and
  refusing would block a bundle that only deleted a spec.

The narrow conjunction the covered-set rule rests on (unmeasured specs AND a
block claiming zero findings) is unchanged, to the word. The store check is a
second check beside it, not a replacement: one is about the block against its
own store, the other about the store against the tree.

## Verification

* **Full suite: 392 files, 7639 tests, 0 failures**, `npm test` on the clean
  committed tree.
* **`svelte-check`: 0 errors, 38 warnings, 21 files** (32 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`), identical to the
  branch-point measurement on `origin/integration`. **`CLAUDE.md` says 37**;
  it was 38 at the branch point and is 38 here, so the figure there is stale by
  one. `CLAUDE.md` is not this bundle's surface and was not edited.
* **One full `verify:readme`** on the clean committed tree at `949480c`, Vite
  started by hand on 5199, nothing else running: **388 route/width runs, 6790
  measurements, 0 outside threshold, 1032.6s**, selftest **70 controls (36
  negative, 34 positive), 0 instrument failures**. The region it replaces
  carried 194 / 388 / 6790 / 0 and the same 70 controls: **the new shape
  produces the same numbers.**
* **The writer's refusals**, each shown to refuse and to write nothing:
  `--static --route`, `--check --route`, a report with no runs, and a report
  that ran a spec at one width only -- the guard that replaced "this report is
  not a full pass of this tree".

**Not verified.** Nothing signed in; no production database (`DEPLOY_PROBE_URL`
and `IDEA_MIGRATION_URL` are both unset here, so the applied set is "cannot
confirm" and never "applied"). Web fonts are blocked by the harness, so every
ratio in the pass is the fallback stack, and `prefers-reduced-motion` is
`no-preference` throughout. No Vercel preview was opened. One measurement in a
throwaway clone reported 4 console errors that are an artefact of that clone's
symlinked `node_modules` falling outside Vite's `fs.allow` root (the 403 URLs
name `/home/user/idea-app/node_modules/...` from a server rooted elsewhere);
the same measurement in the real tree reports 0, which is what the committed
store carries.

## Left undone, deliberately

`integrate.yml`'s `counts_refresh` now repairs both halves on a merged tree,
because it runs `readme-counts.mjs --static` and that command writes both --
but it commits only when the STATIC data line also moved, so a merge that
moved only the measurement leaves the rendered block behind until the next
branch's CI says so. Closing that is one condition in that workflow, which
ledger 0163 owns and this bundle did not touch.
