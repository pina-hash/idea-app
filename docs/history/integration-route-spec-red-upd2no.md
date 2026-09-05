---
title: "The sweep regenerates the static counts after a merge that did not conflict, and the redness three bundles hit was the other half (`claude/integration-route-spec-red-upd2no`)"
date: 2026-09-05
branches: [claude/integration-route-spec-red-upd2no]
migrations: []
subsystems: ["CI and automation", "Browser harness", "Testing", "Documentation"]
---

Prompt 0050. No migration, no database, no app code. About twenty lines of shell
inside `integrate.yml`, twelve proof cases, two workflow tests, and three
corrected sentences.

Started from `origin/integration` at `17be15b`, not `main`. Git identity was
already configured in the container (`Claude <noreply@anthropic.com>`, global,
not local), so the merge failure the prompt warns about never arose.

## What the prompt said, and what the tree said

The prompt's diagnosis was that three bundles in three days opened on a red
suite because a branch had added a route spec, merged cleanly, and left the
static counts region describing a tree that no longer existed. **Two halves of
that are right and one is not, and the difference decides what this bundle is
worth.**

The reconstruction is the whole of the answer, so it is written out rather than
summarised. For every merge into `integration` in the era where a static region
exists at all -- `f5028e6` split the block on 2026-09-03, so `--static --check`
answers nothing before it -- the tree was materialised in a detached worktree at
that exact commit and that commit's OWN generator was asked whether the region
agreed with it:

| | merges | added a spec | of those, merged CLEAN | conflicted | region stale after |
| --- | --- | --- | --- | --- | --- |
| by the sweep | 22 | 9 | 7 | 5 | **0** |
| by hand | 4 | 3 | 0 | 3 | **3** |

**Not one sweep merge has ever left the static region stale** -- including the
seven that added a route spec and merged with no conflict at all, which is the
population the ledger says is the problem. The three that did go stale were hand
merges on 2026-09-04 (`ce13718a`, `a20d6dc5`, `dea1c3eb`), and `0416ee73`
repaired them the same day.

Then the second question: how many bundles opened on a red `derived-numbers`?
For each of the 19 branch merges in that era, the branch's merge-base with
`integration` -- which is the commit the bundle actually opened on -- was
checked with that commit's own `verifyStatic` and `verifyMeasured`:

- **static: green at 19 of 19 bases.** Zero.
- **measured: red at 3 of 19**, and the reason at all three was a measured value
  edited by hand, which is prompt 0046's rule.

And on `origin/integration` at `17be15b` right now, `npx vitest run
tests/derived-numbers.test.ts` reports **5 failed of 18** -- the same "five of
eighteen" prompt 0047 reported -- and every one of the five is the MEASURED
half's covered-set rule naming `foundry-admin-refusal.mjs`. The static half is
green and was green.

So **the recurring tax three bundles have been paying is prompt 0046's
measured-coverage rule, not the static region**, and the ledger entry's account
of the mechanism is wrong on that point. The static region is not the thing that
has been going stale; it is the thing that has been quietly holding.

### Why it has held, which is the part worth keeping

`tests/derived-numbers.test.ts` checks the static region against the tree on
every `npm test`, with no browser in the path. The sweep merges only branches
whose CI is green. So the branch the ledger describes -- "adds a file, touches
nothing else, merges clean" -- **cannot exist with green CI**: it is red on its
own branch before the sweep ever sees it. That is not luck, it is the existing
gate working, and it is the reason this bundle shrank.

## The hole that is real, and it is a different one

The clean merge that CAN leave the region behind is the one where both sides
regenerated and wrote the **same** number. Branch A and branch B each add one
route spec off the same base. Each is green, because each regenerated for its
own tree, and each therefore wrote base + 1. Git sees an IDENTICAL edit on both
sides of the second merge, takes it with no conflict at all, and the pushed tree
holds one more spec than the region claims.

Measured in a throwaway repository before a line was written: base 102 region /
102 tree, after the first merge 103/103, after the second **103/104**, and
`--static --check` stale. `auto_resolve` never runs, because there is nothing to
resolve.

**Prompt 0035 knew about this shape and its own fixture says so**, in a comment
next to the branches it built: "TWO pages against ONE, deliberately: two
branches that each add exactly one page regenerate to the SAME number, git
merges the identical text cleanly, and the case proves nothing." It steered
around it because it was proving the resolver, and the case it steered around
was the one nothing else covers.

## What was built

`counts_refresh` in `integrate.yml`, between `# counts_refresh_marker:begin/end`
so the proof cuts it out of the workflow the way the three existing gates are
cut. Called once, after the whole branch loop, before the push.

- **Gated on the tree having moved** -- a branch merge or the `main` catch-up,
  which are the two ways a spec file can arrive. A run that merged nothing
  regenerates nothing; repairing staleness the run did not cause is a different
  job, and the nightly CI against `integration` is what reports that one.
- **Once, on the final tree.** Per merge would be several commits saying the
  same thing and would still have to be redone at the end: the only tree whose
  counts are right is the one that gets pushed.
- **Only the static half, asserted rather than intended.** It refuses to commit
  unless the one file it expects is the only thing that moved, and the commit
  names that path explicitly, so even a staged something-else could not ride
  along. The measured half needs a browser and about six minutes; a sweep that
  wrote it would be publishing a measurement it never took.
- **It never loses a merge.** Every failure returns non-zero having committed
  nothing; the caller warns and pushes what merged. A generated table is worth
  less than somebody's work.
- **It reports in numbers.** The summary line carries the region's data line
  before and after, not the word "regenerated".

`--static` needs node and the tree and nothing else: no browser, no dev server,
no network, and no `node_modules`. Re-measured on a checkout with none of them,
2026-09-05: **313ms cold, 96ms and 101ms warm.** (The first reading is discarded
per the prompt's own rule about cold measurements; the figure that goes in the
README is the range.)

The extra commit starts nothing. `ci.yml`'s own header records the rule: GitHub
begins no workflow run from a push made with `GITHUB_TOKEN`. It rides the same
single push as the merges, so there is no second push and no new trigger.

## Proof

`tools/integrate-gate-proof.sh` grew from 51 cases to 64, all executed:

| case | what it drives | observed |
| --- | --- | --- |
| 0d | the workflow calls it, and on what condition (grep) | both needles found |
| 48/49 | one branch adds a spec, merges clean | `refresh:none`, region matches tree |
| 50 | two branches, one spec each | `CLEAN CLEAN`, **1** regeneration |
| 51 | ...the region after them | matches the merged tree |
| 52 | ...what the regeneration commit touched | `tools/browser-verify/README.md`, one path |
| 53 | a branch that adds no spec | `refresh:none`, 0 commits |
| 54/55 | 0035's conflict path, unchanged | `RESOLVED`, then `refresh:none`, region matches |
| 56/57 | the regeneration itself fails | `refresh:FAILED`, the merge still reachable, 0 commits |
| 58 | **the same two merges with the refresh withheld** | **STALE** |
| 59 | negative control: markers renamed | cut is empty |

Case 58 is the point. Case 51 on its own would read identically if the merges
had happened to be right and the refresh had done nothing, so the defect is
reproduced inside the harness as the positive control for it.

And the harness was mutation-proved rather than trusted: replacing the generator
call in `counts_refresh` with `true` (a refresh that succeeds and regenerates
nothing) turns cases 50, 51, 52 and 56 red and the script exits 1. The workflow
was restored from a `cp` copy and md5-verified identical (`68ff00bb...`); no
`git checkout --` was run on any file at any point.

`tests/workflows.test.ts` carries what the harness structurally cannot see,
because it drives the function directly: where the call sits relative to the
loop's `done` and the push gate, that there is exactly one call, that the cut
region names `--static` and never `verify:readme`/`--from`/`--selftest`/
`run.mjs`, that the commit names one path, and that neither the function nor its
call site can `exit`. Every one of those rules is put to a MUTATED copy of the
real file in a positive control -- a findings list only ever computed on a
passing file is a list nobody has tested. `counts_refresh` joins `CUTTABLE_GATES`
(now six, pinned).

## `derived-numbers` can still fail, and here is what it now catches alone

Asked directly, in a scratch copy of the counts README, restored from a `cp`
copy and md5-verified afterwards (`1c506aa5...`):

- one static digit edited by hand in the rendered table: **7 of 18 red**
- the data line and the table both edited to agree with each other, a
  self-consistent lie about the tree: **8 of 18 red**

It has not become unfalsifiable, and the reason is that it and the sweep act at
different times on different refs:

- **A branch.** The sweep never touches a `claude/*` branch. `derived-numbers`
  on that branch's own CI is what keeps its region honest for its own tree --
  and, as the reconstruction above shows, that is the gate that has been doing
  the actual work all along.
- **A hand edit.** Caught on the branch, before the sweep exists.
- **`main`.** The sweep pushes only `integration`. `main` moves on its own via
  the classroom export.
- **The measured half.** The sweep never writes it and must not. The whole
  covered-set rule is `derived-numbers`'s alone, and it is what is red on
  `integration` today.
- **A sweep run whose refresh failed.** It warns and pushes anyway; the next
  branch's CI is what says the region is behind.

## Corrections to `.github/workflows/README.md`

Three bundles had already found that file describing behaviour that had changed,
so it was audited rather than only appended to. Three sentences were wrong:

1. The short version listed **three** causes for a `claude/**` branch still
   standing and omitted the ledger gate, which the same file documents twelve
   paragraphs later under "Left alone".
2. "`integration` itself is not independently checked" stopped being true when
   `ci.yml` gained its nightly schedule against `integration`, which the same
   file also describes at length.
3. The `verify:counts` timing was "about 0.4 seconds"; re-measured it is
   313ms cold and 96-101ms warm, and the sentence now says on what.

The counts-resolution section gains the clean-merge half beside the conflict
half, with the two kept visibly distinct: one is a resolution, the other is a
regeneration, and confusing them is how somebody deletes the wrong one.

## Not verified

- **Nothing was run on GitHub Actions.** Every case is a local reproduction
  against throwaway repositories; the sweep itself has not executed with this
  change in it.
- **This does not take effect until `integration` reaches `main`.** GitHub runs
  the DEFAULT-BRANCH copy of a `workflow_run` workflow, so `integrate.yml` as it
  stands on `main` is the one that will sweep until a person merges.
- No Supabase, no migration, no signed-in surface, no live data.
- The `/dev` browser pass covers `/dev` routes only, in the fallback font stack
  with every non-loopback request blocked, and with `prefers-reduced-motion` at
  `no-preference`, so that path is not exercised.
