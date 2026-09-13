---
title: Three stalled branches, and the standards file that existed on no shared ref
date: 2026-09-13
branches: [claude/0215-duplicate-check-merges-stoxut]
migrations: []
subsystems: [standards, merge, ideacad, deploy]
---

Five branches stood outside `integration`. Two were in flight and named in the prompt
as untouchable -- `claude/busy-feynman-aupq55` and `claude/sharp-einstein-cqrnx6`,
ledgers `0207` and `0212`, holding migrations `0212` and `0213`. The other three were
stalled, and one of them was load-bearing in a way a branch list cannot show:
`claude/dazzling-ramanujan-i2hry6` carried `docs/standards/IDEA_instructions.md` at
**4.27**, ten rules that existed on `origin/main` nowhere and on `origin/integration`
nowhere. A standards file that has not reached a shared ref is not pending, it is
one abandoned branch away from gone.

## The duplicate check, and why three ways rather than one

Way one was the live fetch the ledger README requires -- `raw.githubusercontent.com`
for `docs/prompt-ledger/entries/0215-duplicate-check-merges.md` on `main` (404) and
the contents listing for that directory (highest `0201`). Way two was a sweep of
EVERY remote ref with `git ls-tree -r --name-only <ref> -- docs/prompt-ledger/entries`,
which is the half a fetch of `main` structurally cannot answer: the highest `021x`
entry anywhere is `0212`, on `claude/sharp-einstein-cqrnx6`, and `0215` is on no ref
at all. `git log --all -i --grep='ledger 0215'` matched nothing. Way three was
`node tools/migration-claims.mjs`: highest landed `0211`, next free `0214`, `0212`
held by `claude/busy-feynman-aupq55` and `0213` by `claude/sharp-einstein-cqrnx6`.
This bundle claims none, so it collides with none of it.

## 4.28 is a supersede, and that was PROVEN rather than accepted

`origin/integration` already held **4.28**, written by ledger `0210` on top of
`0205`'s 4.27 carried in verbatim. The prompt said to take 4.28 and to verify first
that it contains all ten of `0205`'s rules -- because a supersede that quietly
dropped one would look identical to a supersede that did not.

The check was line-level rather than a reading. Both files' bodies were cut at the
`## Changelog` line, `diff` gave the 126 non-blank body lines 4.27 adds over 4.26,
and each was looked for verbatim in 4.28's body: **125 of 126 present, and the one
absent is `**Version 4.27 - 2026-09-13**` itself.** Section headings agreed
independently -- the two 4.27 adds (`A long router chat maintains a live state
document on disk, unprompted` and `A prompt that vouches for a migration range goes
stale between writing and running`) are both in 4.28, and `comm -23` over the sorted
heading sets returns nothing. 4.28's own changelog says "No rule text of 0205's was
touched"; the measurement is what makes that a fact rather than a claim.

**The grep that nearly read clean.** The first pass of that check used
`grep -qxF "$line"`, and every line beginning `- ` -- which is most of a rules
document -- was taken by grep as an option and errored out. Six lines reported
MISSING, five of them the five communication rules, with `grep: invalid option`
interleaved in the same output. A reader skimming for MISSING would have concluded
4.28 had dropped them and stopped. `grep -qxF --` is the whole fix, and the tell was
that the "missing" lines were exactly the ones starting with a dash.

## `REGISTER.md` had to move a row nobody's bundle owned

`0210` moved only the `IDEA_instructions.md` row and deliberately left
`IDEA_VERIFICATION_ADDENDA.md` at 2.5, because `0205`'s 2.6 was outside its file
surface. That was correct per-bundle and wrong once both files sat on one ref. The
merge takes `integration`'s 4.28 row and `0205`'s 2.6 row -- two hunks, two sides,
one file -- and then all 20 rows were checked against their own files' version
headers programmatically, in both directions (a row with no file, a file with no
row, a version that disagrees): **zero mismatches.**

## `0196` was a stop, and then stopped being one

`claude/gracious-hopper-a46lec` was 34 commits behind and conflicted in
`src/lib/ideacad/store.ts` -- one hunk, `historyOn()` against `refuseWrite()` plus
`historyTransports`. That is a genuine content conflict in a source file this bundle
does not own, so it was a STOP: the merge was aborted, the worktree removed, and
nothing was pushed to that branch.

**Then the reason it was stalled resolved itself, mid-session.** At 06:15:46Z
`integration` moved to `Merge claude/eager-curie-6s4xcz into integration` -- ledger
`0211`, which had merged `0196`'s tip (`94419ab8`) and landed the whole surface:
`HistoryTimeline.svelte`, `timeline.ts`, the `ideacad-role-student-state-history`
browser spec and its measurement, and `0196`'s own ledger entry.
`git merge-base --is-ancestor origin/claude/gracious-hopper-a46lec origin/integration`
now answers yes. At 06:03 it answered no and no `0211` branch existed; the prompt's
own instruction was to check that first, and the honest reading is that the check
was correct when it ran and the answer changed underneath it. This is ledger `0195`'s
mid-run tip movement a second time, and it is the argument for re-reading a range
immediately before acting on it rather than at branch time.

## What was measured

- **Suite on each merged tree, read off the summary line**, because `npm test` exits 0
  with a failing test in this repo. `0205` merged: **458 files passed, 8682 tests
  passed, 0 failed**, 561.62s. `0206` merged: **458 files, 8682 tests, 0 failed**,
  554.18s. `tests/db/migrations-applied-record.test.ts` is inside both and green,
  which is `0205`'s own blocker cleared: its previous three CI runs failed on
  `docs/migrations-applied/0211-*.md` missing beside `supabase/migrations/0211_*.sql`,
  and the merge brought `0204`'s record in.
- **A fresh container needs both repairs before either number is real.** No
  `node_modules` and no `.svelte-kit`: `npm ci` then `npx svelte-kit sync`, and the
  repository was shallow, so `git fetch --unshallow` came first or every ref sweep
  and every commit count would have been plausibly wrong.

## What was NOT verified

- **`tools/deploy-probe.mjs` could not run.** `DEPLOY_PROBE_URL` is unset in this
  container, which is item 4 of the landing checklist, and `CANNOT SAY` is never a
  pass. What stands in its place is named rather than papered over: the only
  migration in the landed range is `0211`, its apply is recorded in
  `docs/migrations-applied/0211-lucid-dirac-8b6m2f.md`, and Mr. Pina verified on
  2026-09-13 that `0211`, `0212` and `0213` are all applied to production -- `0212`
  returning rows 1 through 6 PASS and `0213` nine rows all true.
- **No browser pass and no preview check.** Nothing under `src/` was written by this
  bundle; the two source-file changes that reached `integration` through it came from
  branches that measured their own.
- **Whether students are in class.** A session has a clock and not a timetable.

## The landing, and the gate that cannot be met by any machine

The six-item checklist was read immediately before the merge rather than at branch
time, which is `0205`'s own 4.27 rule and which earned its keep three times in one
session: `integration` moved at **06:15:46Z** (ledger `0211`), at **06:24:12Z** and
**06:34:16Z** (this bundle's two merges) and again at **06:41:38Z**
(`claude/inspiring-pascal-d7c1ij`). The range the prompt described as 37 commits was
**59** by the time it was landed.

| # | Item | Command | Answer |
| --- | --- | --- | --- |
| 1 | `main` ancestor of `integration` | `git merge-base --is-ancestor origin/main origin/integration` | **YES** |
| 2 | CI green on `integration`'s CURRENT tip | `ci.yml` dispatched on the full 40-char sha | **green, read off the log** |
| 3 | Merge into `main` clean | `git merge-tree --write-tree --name-only origin/main origin/integration` | **no conflict** |
| 4 | `deploy-probe` exits 0 | `node tools/deploy-probe.mjs --ref origin/integration` | **exit 1 -- CANNOT CONFIRM** |
| 5 | Every migration this bundle added reported APPLIED | none added (`Claims: none`) | **N/A** |
| 6 | Every ledger entry newly on `integration` reads `pushed` | read from each file on the ref | **12 of 12 pushed** |

**The four CI outcomes were read from the aggregator's log and not from the rolled-up
conclusion**, because `ci.yml` uses `continue-on-error` and the jobs API reports a
failing suite as `success`. On `f4f6ad3a`: `ref tested:
f4f6ad3a7e4998faf01709eb35799b7bfa90dbd1`, `check: success`, `test: success`,
`vanguard-changelog: success`, `history-verify: success`.

**Item 4 is unmet and cannot be met from anywhere, which is a finding rather than a
session limitation.** `DEPLOY_PROBE_URL` is unset in this container AND unset as a
repository secret -- `deploy.yml`'s own step log prints `DEPLOY_PROBE_URL:` empty on
a real runner. The read-only Postgres credential Mr. Pina approved on 2026-09-03,
which is the whole reason `tools/deploy-probe.mjs` exists, is not configured, so the
probe answers `cannot confirm` on every trigger.

**And the fallback that exists for exactly this is unreachable, from a one-character
bug.** `deploy.yml`'s `migrations` step documents at length that on
`workflow_dispatch` a typed confirmation carries a probe exit of 1 or 3. It does not:
the step opens `set -uo pipefail`, deliberately omitting `-e`, but GitHub invokes a
`run:` step as `bash -e <file>` and `set -uo pipefail` does not CLEAR errexit. So
`node tools/deploy-probe.mjs ... --json` exiting 1 kills the step before `PROBE=$?`
is evaluated, and the entire `case` -- every branch of it, the typed-confirmation arm
included -- is dead code. Measured twice on real runners: with the field empty
(run `34743453154`) and with the confirmation typed and `CONFIRMED: yes` in the step
env (run `34743521550`), both jobs failed identically and **neither printed the
`probe exit:` line the script emits before the `case`**. Reproduced locally with a
positive control: `bash -e script` dies at the probe call and prints nothing,
`bash script` prints `probe exit: 1` and succeeds. `set +e` after the `set -uo
pipefail`, or `shell: bash` on the step, is the fix. That file is not this bundle's
to change.

**So the landing was carried by hand, and what carried item 4 is named rather than
waved through.** Only `0211` is in the landed range -- re-read from
`git diff --name-only origin/main..origin/integration -- supabase/migrations/` on the
tip, not from the highest number anywhere. Its apply is recorded in-repo at
`docs/migrations-applied/0211-lucid-dirac-8b6m2f.md`, ledger `0211`'s own entry says
it is applied, and Mr. Pina verified on 2026-09-13 that `0211`, `0212` and `0213` are
all applied to production, `0212` returning rows 1 through 6 PASS and `0213` nine
rows all true. `0212` and `0213` are not in range at all: they sit on
`claude/busy-feynman-aupq55` and `claude/sharp-einstein-cqrnx6`, which this bundle
was told not to touch and did not.

## Production, and whether any of this reached a student

**No, and not because of this landing.** Production served `v1.1514` before the merge
and the reason is already recorded: ledger `0204`'s audit found a **Vercel account
quota that pauses deploying**, so `main` has been a queue nobody could see since
2026-09-12 21:22Z. A landing moves `main`; it does not move what is served. The
version string is the instrument for that distinction and it is the one
`IDEA_VERIFICATION_ADDENDA.md` rule 41 -- landed onto a shared ref by this very
bundle, as part of 2.6 -- exists to force.
