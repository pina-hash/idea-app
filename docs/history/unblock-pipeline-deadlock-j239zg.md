---
title: "The Integrate/Deploy deadlock, a tombstone for a burned migration number, and two of three branches landed (`claude/unblock-pipeline-deadlock-j239zg`, migration 0177)"
date: 2026-09-04
branches: [claude/unblock-pipeline-deadlock-j239zg]
migrations: ["0177"]
subsystems: ["Repo tooling", "CI and workflows", "Migrations", "Testing"]
---

Prompt 0034. No `src/` change of this bundle's own: the workflow, its README, its test, one
schema-free migration, and the merge of two branches.

## The base

Started from `origin/integration` at `d03dfd5`, which is where the container's checkout was
NOT -- it began on `origin/main` at `dabfc17`, so the first act was
`git checkout -B <branch> origin/integration`. Git already carried a committer identity
(`Claude <noreply@anthropic.com>`), so the "Please tell me who you are" failure the prompt
warns about did not arise. Working directory `/home/user/idea-app`.

The duplicate check swept every local and remote ref: no ledger entry numbered 0034 anywhere,
and no `supabase/migrations/0177*` on any ref.

`d03dfd5` is itself the manual escape from the deadlock this bundle fixes -- "Merge pull
request #72 from pina-hash/main", a person merging `main` into `integration` by hand because
the machinery could not.

## The deadlock

`integrate.yml` merges `origin/main` into the target FIRST, every time, and then pushed only
`if [ ${#merged[@]} -gt 0 ]`. So on a run where every outstanding branch conflicted, the
main-merge was computed on the runner's disk and thrown away. `deploy.yml` refuses while
`main` is not an ancestor of `integration` and its own error tells the operator to "Run the
Integrate workflow first, then press Deploy again" -- which is exactly the run that discards
its answer. Migrations commit straight to `main` by design and the classroom export commits
there unattended, so the gap re-opens constantly, and branches conflict routinely while
several lanes run.

**The prompt's line numbers were stale and the claim was structurally right.** The main-merge
is at line 501, not 416; the push condition at 607 and the push itself at 612, not 494. The
file has grown since the prompt was written. The code was as described.

### Is there a state in which the main-merge should NOT be pushed?

Yes, exactly one, and it is already handled upstream of the push rather than by the push
condition: **the main-merge itself conflicting.** That branch aborts the merge -- which
restores HEAD to where it started -- and `exit 1`s before the push is reached at all. So a
half-resolved tree cannot become `integration` on the remote, and the "push whenever the
target moved" rule never sees that case. A conflicted BRANCH is the same shape one level
down: `git merge --abort` leaves HEAD untouched, so a conflicted branch contributes nothing
to the comparison. Every sha the gate can be handed is a tree git itself resolved.

### The exit code, and what depends on it

Nothing depends on it. The only `workflow_run` trigger in the repo watches `CI`; `deploy.yml`
is `workflow_dispatch` and decides from git state (is `main` an ancestor of `integration`),
never from whether Integrate passed. So the exit code is purely a signal to a person.

A conflicted branch IS a normal steady state when several lanes run at once -- it is two
bundles genuinely touching one file, which no machine may resolve. But it is also the one
outcome here that needs a person, and a green run is a run nobody opens. **So the exit code
does not move.** What changes is that the summary now says, in words, that the red X is for
the conflict and that the target itself was caught up and pushed. The two obligations were
never in tension; the old code only made them look that way.

## The fix

The push condition is now "did the target move at all", decided by `target_push_gate`, a
function between `# target_push_marker:begin` / `:end` so it can be cut out of the shipping
file and driven directly -- the shape `ledger_gate` and `contained_delete_gate` already use.
It compares the tip the REMOTE already had against HEAD as it stands after the sweep.

Two details that are load-bearing rather than tidy:

- **`remote_tip` is read once, at checkout, from the remote-tracking ref.** Recomputing it
  later from a HEAD that has absorbed the whole sweep would compare a value with itself.
- **It is EMPTY, not `origin/main`'s sha, when the target does not exist on the remote.** A
  first run must create the branch even having merged nothing into it, and an empty string
  cannot compare equal to a sha, so the comparison reaches the push on its own.

It SUBSUMES the old condition rather than widening past it: a non-empty `merged` means at
least one `--no-ff` merge commit, so HEAD necessarily differs and every run that used to push
still pushes.

The summary gains a first section headed with the target branch's own name, before any
branch section --
whether the target was caught up (and by how many commits), whether it was pushed, and, when
something conflicted, which of those two things the red X is about.

## What was executed, and what was reasoned

**All four cases were EXECUTED**, not reasoned, against throwaway `mktemp -d` repositories
with real `git merge` producing real conflicts, driven by the text CUT from
`.github/workflows/integrate.yml` between its own markers. 23 assertions, 0 failures:

| Case | Result |
| --- | --- |
| 1. target behind main, every branch conflicts | pushed, exit 1, target advanced, `main` now an ancestor |
| 2. target behind main, one branch merges | pushed, exit 0, both landed |
| 3. target current, every branch conflicts | nothing pushed, exit 1, target unmoved |
| 4. the main-merge itself conflicts | nothing pushed, exit 1, target unmoved |

**The negative control on the cut**, both directions: renaming either marker refuses with
`CUT REFUSED: begin marker x0, end marker x0`; markers present but the body renamed refuses
with `does not define target_push_gate()`; the real file cuts 10 lines and exits 0.

**And the deadlock was reproduced.** The same case-1 fixture, with only the push condition
swapped back to `[ ${#merged[@]} -gt 0 ]`, ends `caught_up=yes`, nothing pushed, and `main`
still not an ancestor of `integration` -- which is the state `deploy.yml` refuses. Three
assertions that pass on the fixed condition fail on the old one.

**The proof script is NOT in the repo.** It lives in this session's scratchpad. `tools/` was
not this bundle's to write, and `integrate.yml` already records the same gap in its own words
for `contained_delete_gate`. `tests/workflows.test.ts` now pins that absence explicitly:
`CUTTABLE_GATES` carries `harness: null` for the two gates with no in-repo harness, and
asserts exactly which two those are, so a harness ARRIVING is visible rather than silent.

## `tests/workflows.test.ts`

The marker pin was spelled for `ledger_gate` alone, so `contained_delete_gate`'s and the new
gate's markers could have been renamed with the whole suite green. Generalised over a table
rather than duplicated: one predicate, three rows, the row count pinned so a gate that LOSES
its markers cannot shrink the table instead of failing. Every mutation in the positive control
is now applied to each gate's own markers in turn.

`pushConditionFindings` is new and is the assertion that matters: the push must be decided by
the cuttable gate, asked about `remote_tip` against HEAD, with the push inside that branch.
Its three positive controls are each a plausible edit -- the pre-fix condition put back, the
gate asked about the wrong base, the push moved out of the branch -- and each reddens on its
own.

**The push-shape pin did not need changing**: the file still carries exactly 3 `git push`
lines, so `{'ci.yml': 0, 'deploy.yml': 1, 'integrate.yml': 3}` held unedited. 27 tests passed
before and after.

## `.github/workflows/README.md` lines 73-74

Prompt 0029 reported these and could not fix them. They said the summary "names every branch
and what happened to it: merged, conflicted, or left alone with the reason
(`CI on abc1234 is failure`, `already in integration`)". Three things were false: there are
up to FIVE sections and the first is not about a branch at all; `already in integration` is
normally a DELETE reason under "Already contained, deleted" and reaches "Left alone" only when
the delete was declined or refused; and the ledger gate's `Status: issued` skip reason was
never mentioned. Rewritten against the six `echo "### ` lines the workflow actually emits, and
with the "a red run does not mean nothing landed" paragraph the fix makes necessary.

## 0177, the tombstone

0177 was reserved for the notebook check-in bundle (prompt 0031). That audit found
`notebook_admin_upsert_session` and `notebook_admin_delete_session` already in place with
their guards, correctly wrote no migration, and 0032 took 0178.

**The measured series, and the prompt's claim was one behind.** The prompt said "1 to 178, 177
files, one gap at 0177", which was true of `origin/main`. On `origin/integration` it measured
**1 to 179, 178 files, one gap at 0177** -- `0179_classroom_roster_avatar.sql` landed with the
0033 avatars bundle after the prompt was written. The gap claim was right on both.

**How `tests/db/` orders migrations, checked rather than assumed.** It does NOT glob the
directory: `startTestDb(migrationFiles)` takes an EXPLICIT ordered array and each test names
its own chain. `tools/idea-status.py` sorts filenames from `git ls-tree`. So a future 0177
sorts BETWEEN 0176 and 0178 in both -- inserted mid-chain, never appended -- and would be
pasted by a person following numeric order into a database that has already run its
successors. That ordering has never been tested. Occupying the number closes it.

It holds no DDL, no DML, no grant and no catalog guard, so it is idempotent by construction
rather than by a guard, and there is nothing to undo.

### Applying it cold

It goes to production like every other migration: paste the file into the Supabase SQL editor.

```
supabase/migrations/0177_reserved_number_tombstone.sql
```

Expected output is exactly one notice and no rows:

```
NOTICE:  0177: TOMBSTONE. This number was reserved for the notebook check-in bundle
(prompt 0031), which audited and correctly wrote no migration --
notebook_admin_upsert_session and notebook_admin_delete_session already existed, with
their guards. The number is BURNED, not free. It changes no schema; nothing is expected
to have happened.
```

Re-pasting it is safe and produces the same notice again. **What undoes it: nothing, because
nothing was done.** Deleting the file would restore the hole, which is the state it exists to
end.

### Its test

`tests/db/migration-0177-tombstone.test.ts` snapshots the catalog -- relations, columns,
functions with their ACLs, policies with their expressions, table grants, constraints --
BEFORE the file and after each of THREE applications, and compares the readings as whole
sorted strings rather than as counts, because a count passes a file that drops one function
and adds another.

**Non-vacuity is per union arm, not a row floor.** The first attempt asserted "more than 200
lines" and read 130, which is exactly the kind of number somebody lowers until it passes. What
"the snapshot measured something" actually means is that every arm produced rows, so each of
the six prefixes is asserted on its own and three known objects (`public.profiles`,
`public.app_admins`, `public.is_admin()`) are asserted by name.

**Mutation-proved, both directions.** A `create function` appended to the tombstone reddens
three of the four tests including the catalog comparison; emptying the file reddens the text
sweep. The file was restored from a `cp` copy (never `git checkout --`, per CLAUDE.md) and
md5-checked byte-identical at `a0c1caaf46781703b7b4802e979421ef`, then re-run green.

Committed straight to `main` with its test in the same commit: `dabfc17..4a5dcc6`.

## The three branches

**A3 hit its own tripwire.** Test-merged into `origin/integration` separately with
`--no-commit --no-ff`, aborting between each:

| Branch | Conflicting paths |
| --- | --- |
| `attachment-picker-paste-image-gptgo3` | `tools/browser-verify/README.md` |
| `item-images-thumbnails-l3bhxp` | `classroom-updates.json`, **`tests/db/classroom-item-image-gate.test.ts`**, `tools/browser-verify/README.md` |
| `notebook-check-in-management-y5z4b4` | `tools/browser-verify/README.md` |

The third path is outside the permitted set, so per the prompt the tree moved and
`item-images-thumbnails-l3bhxp` **was not merged**. What moved, characterised before stopping:

- It is an **add/add** conflict. The file exists at neither side's merge base (`0368dfc`).
- **`supabase/migrations/0176_classroom_item_images.sql` is byte-identical on both sides** and
  did not conflict, so the migration half of that bundle has already landed on `main` -- which
  is the repo's own rule ("Never put a migration on a branch. Migration work happens on
  `main`") working exactly as written.
- What landed with it was integration's copy of the db test, and **integration's copy is
  strictly newer**: its header describes 0178's widening of `_classroom_doc_text` and defers
  the parity claim to `tests/db/classroom-doc-text-images.test.ts`, where the branch's copy
  still says the projection "is not widened here". Taking the branch's side would REGRESS the
  test to describe behaviour 0178 changed.

The resolution is almost certainly to take integration's side of that one file and keep both
sides of `classroom-updates.json`. **That is not this bundle's to make** -- the prompt forbids
a change of its own to a merged branch's content, and this is a judgement about which of two
descriptions of a migration is correct. Reported, not resolved. Re-tested after merge 1 and
the conflict set was unchanged.

**The two that were merged**, in the prompt's order, committed separately:

- `ce13718` `attachment-picker-paste-image-gptgo3` -- 3 conflict hunks, all strictly inside
  `counts:measured:begin`/`:end`.
- `a20d6dc` `notebook-check-in-management-y5z4b4` -- 2 hunks, same region.

Every hunk was resolved to integration's side **without reading the numbers**, by a script
that reports which marked region each hunk fell in and refuses to call any of them resolved if
one lands outside. B5 overwrites those bytes anyway. The resulting file was verified identical
to `origin/integration`'s, so neither branch contributed prose outside the markers.

**`classroom-updates.json` never conflicted on either merged branch.** 120 entries before, 120
after, and the file byte-identical to integration's -- because `attachment-picker` carries 119
entries all of which integration already had, and `notebook-check-in-management` does not touch
the file at all. Every one of the branch's 119 titles was checked present in the merged file;
none missing. The keep-both-appends instruction applies only to `item-images-thumbnails`, the
branch that was not merged.

`origin/main` was then merged in so the branch carries 0177: the series on this tree is **179
files, 1 to 179, no gaps**.

## The measured numbers

`npm run verify:counts` on the clean merged tree moved the static region:

| | Before | After |
| --- | --- | --- |
| Route specs | 95 | 97 |
| Distinct routes | 48 | 50 |
| `/dev` pages | 79 | 81 |
| Route/width runs | 190 | 194 |

The two new specs are `attach-reach.mjs` (attachment picker) and `check-in-manage.mjs`
(notebook check-in management), one from each merged branch.

`npm run verify:readme` on `dea1c3e`: **194 runs, 2718 measurements, 0 outside threshold**,
456.3s, selftest 70 controls (36 negative, 34 positive), 0 instrument failures.

**Rows compared by identity, not by count.** `origin/integration` `outsideRows: []`;
`attachment-picker` `[]`; `notebook-check-in-management` `[]`; `item-images-thumbnails` `[]`;
merged tree `[]`. The zero baseline holds and no branch introduced a row.

The data line records `dirty: false` while the README was modified at measurement time. That is
deliberate, not a defect: `gitHead` in `readme-counts.mjs` filters `tools/browser-verify/README.md`
out of its own dirty check, because it is the file it is writing.

`--probe` reported Chromium 141.0.7390.37 at `/opt/pw-browsers/chromium-1194`, with
screenshots, rAF, `IntersectionObserver`, `ResizeObserver`, canvas readback and `color-mix()`
all working -- the opposite of the `mcp__Claude_Browser__*` pane's limits, as CLAUDE.md says to
expect. The run blocks `fonts.googleapis.com`, so text was measured in the fallback stack, and
`prefers-reduced-motion` was `no-preference`.

## `npm run check` and the suite

**0 errors, 37 warnings**, breakdown **31 `state_referenced_locally` / 5 `css_unused_selector`
/ 1 `perf_avoid_nested_class`** -- the baseline exactly, mix included. `PUBLIC_SUPABASE_URL`
and `PUBLIC_SUPABASE_ANON_KEY` were exported as placeholders before `svelte-kit sync`, per
CLAUDE.md's phantom-error note; without that the count is 11 phantom errors.

`npm test`: **260 files, 5410 tests, 6 failed, all six in one file.**

## Not an integration defect, and proved rather than assumed

The six failures are all in `tests/db/classroom-hall-pass-limits.test.ts` and they are
**pre-existing and time-of-day dependent**, not caused by any merge.

Three measurements say so:

1. **Neither merged branch touches the file, its migration, or anything hall-pass.** The test
   and `0174_classroom_hall_pass_limits.sql` are byte-identical between `origin/integration`
   and the merged tree.
2. **The same six tests fail identically on `origin/integration` itself**, run in a detached
   worktree at that exact commit -- same six names, same order.
3. **The mechanism.** The run was at 07:11 UTC, which is **00:11 America/Los_Angeles**. Every
   failing case backdates a trip with `tripAgo(..., 60)` to `tripAgo(..., 90)`, and at that
   hour 60, 90 and 120 minutes ago all land on the PREVIOUS LA calendar day. So `used_today`
   projects 0, no cap is reached, and each assertion fails on a number that is correct for the
   calendar the migration adjudicates in.

The test that fails most pointedly is the one named "the window is the
America/Los_Angeles day, at an instant where UTC disagrees" -- written to check exactly this
behaviour, and itself reading the wall clock, so it fails during the roughly 90-minute window
after LA midnight when the disagreement it is about is real.

CLAUDE.md already carries the rule this needs: "A TEST OF THAT CALENDAR NEEDS A PINNED INSTANT
WHERE THE TWO DISAGREE." The fix is to pin the instant rather than backdate against `now()`.
**Reported and not changed**: the file is outside this bundle's scope, and the prompt is
explicit that a defect a merge reveals is reported and left. It will pass again on its own
after about 01:30 LA, which is what makes it easy to dismiss and worth writing down.

## Not verified

- **The live Supabase project.** 0177 has NOT been applied to production. Nothing in this repo
  can apply a migration; the local `.env` points at a placeholder project.
- **The workflow running on GitHub.** The four cases were executed against local repositories
  driving the cut text, which is a real proof of the decision and not of the Actions runtime.
  And **the fix does not take effect until `integration` reaches `main`**: GitHub runs the
  DEFAULT-BRANCH copy of a `workflow_run` workflow, which `integrate.yml`'s own header says at
  length. The next sweep after this branch merges to `integration` will still behave the old
  way. That is expected and is not the fix failing.
- **Any signed-in surface.** The browser harness covers `/dev` routes only.
- **`item-images-thumbnails-l3bhxp` merged.** Its conflict was characterised, not resolved.

## Deferred

- Resolving `item-images-thumbnails-l3bhxp`, above. It needs somebody who may decide between
  two descriptions of 0176/0178 and keep both `classroom-updates.json` appends.
- Pinning the hall-pass test's instant, above.
- A committed harness for `contained_delete_gate` and `target_push_gate`, beside
  `tools/integrate-gate-proof.sh`. `tests/workflows.test.ts` now asserts exactly which two
  gates lack one, so the gap is measured rather than remembered.
