---
title: "Four inherited red assertions cleared: docs/GAUNTLET.md gains the 0184 row, and the measured counts region is regenerated against a tree it had covered 107 of 116 specs of (`claude/four-red-integration-tests-62a7ba`, no migration)"
date: 2026-09-06
branches: [claude/four-red-integration-tests-62a7ba]
migrations: []
subsystems: ["GAUNTLET", "docs", "tests", "browser-verify"]
---

Four assertions across two files had been failing since 2026-09-05, and five
prompts had each opened on the red suite, established the failures were
inherited, and correctly declined to fix them because the files were outside
their ownership. This bundle pays that cost once. No source file under `src/`
was touched and no migration was written.

### Where this started

`origin/integration` is `13d1747`. It is a strict ancestor of `origin/main`,
which was `eec8151` at the time this branch was cut, so the branch is
`origin/main` plus this bundle's commits and contains every commit
`integration` holds. Working directory `/home/user/idea-app`. The container's
git identity was already set (`Claude <noreply@anthropic.com>`), so the
"Please tell me who you are" failure the prompt warns about did not arise.

A stale remote-tracking ref made `origin/main` look two merges behind for the
first few commands of the session, which made `eec8151` (migration `0185`,
another session's bundle) read as a stray commit sitting on this branch. It is
not: a `git fetch` showed `refs/heads/main` on origin already at `eec8151`.
Recorded because the misreading is cheap to make and the wrong response to it
-- reverting or force-pushing somebody else's work -- is expensive.

### A1. What was failing

Exactly four assertions, in the two files the prompt named, with 5,923 tests
passing beside them:

* `tests/derived-numbers.test.ts` -- `verifyMeasured reddens an unmeasured spec
  when the block claims nothing was outside threshold`, and `WHAT IT LETS
  THROUGH: a spec deleted since the measurement, which is reported and never
  failed on`.
* `tests/gauntlet-doc.test.ts` -- `agrees with docs/GAUNTLET.md and
  docs/GAUNTLET-DESIGN.md`, and `covers every GAUNTLET migration in the tree,
  in one of the two halves`.

### A2. The counts half, and the prompt's account of it was wrong

The prompt said three `themes*` route specs had landed after the last
measurement. The tree says otherwise, and the tree wins: `themes.mjs`,
`themes-signedout-1.mjs` and `themes-state-matrix.mjs` are all three IN the
committed `covered` array. The static region reported 116 route specs (correct
for the tree); the measured region covered 107; the difference is NINE specs
and none of them is a `themes*` one:

| Spec | Added by |
| --- | --- |
| `composer-draft.mjs` | `16f9b89` |
| `greenline-portal.mjs` | `f43e589` |
| `greenline-portal-view-garage-seed-approved.mjs` | `f43e589` |
| `greenline-portal-view-garage-seed-pending.mjs` | `f43e589` |
| `greenline-portal-view-garage-seed-pending-panel-livery.mjs` | `f43e589` |
| `greenline-portal-view-garage-seed-rejected.mjs` | `f43e589` |
| `greenline-portal-view-moderation.mjs` | `f43e589` |
| `greenline-portal-view-moderation-seed-pending.mjs` | `f43e589` |
| `upload-limits.mjs` | `ca18cd7` |

**WHICH ASSERTION FAILED IS NOT THE ONE A READER EXPECTS, AND THE DISTINCTION IS
THE DESIGN RATHER THAN AN ACCIDENT.** `verifyMeasured`'s shipped rule is a
CONJUNCTION -- unmeasured specs AND the block claiming `outside: 0` -- and the
committed block honestly said `outside: 2`. So the live rule LET THE STALENESS
THROUGH, exactly as its own `WHAT IT LETS THROUGH: an unmeasured spec beside a
non-empty findings list` case says it must: a block already naming findings is
not telling anyone there is nothing to see, and failing there would put a
six-minute browser run in front of every bundle that adds a spec.

What reddened were the two NEGATIVE-HALF controls, which drive the same
predicate over the committed block with `outside` patched to zero and over the
tree's own spec list. On a block claiming a clean bill of health those nine
specs would be a false all-clear, so the controls are what made a stale region
visible while the rule it controls was correctly passing it. A session reading
only the assertion names would conclude the covered-set rule fired; it did not.

### A3. The GAUNTLET half: a stale document, and the check is right

One finding, and the check named the claim without sending anyone to read 800
lines:

```
[migration-table-missing-row] docs/GAUNTLET.md's migration table has no row for `0184`
    tree: supabase/migrations/0184_gauntlet_run_event_bounds.sql exists and the
          table covers every GAUNTLET migration after 0027
```

The document is stale; the check has not started lying. `7d848d7` added
`supabase/migrations/0184_gauntlet_run_event_bounds.sql` on 2026-09-05 at 20:30
UTC and touched no file under `docs/`. The document's post-`0027` table claims,
in its own heading, to cover every GAUNTLET migration after that floor, and
`0184` is one by filename. So the fix is a row, not a relaxed assertion.

**BUT NO SINGLE COMMIT MADE IT FAIL, AND THAT IS THE FINDING.** The check was
created by `74be202` at 19:48 UTC on branch `claude/gauntlet-doc-audit-4o4r7n`,
against a tree with no `0184` in it. `0184` arrived by `7d848d7` at 20:30 UTC on
`claude/gauntlet-run-events-zspf1y`, against a tree with no check in it. The two
are siblings off merge base `fdf8c68` (19:04 UTC) and neither contains the
other. Each branch was GREEN ON ITS OWN TREE and each was right to be. The
defect exists only on the merged tree: `5877f19` (2026-09-05 14:28 PDT), whose
parents are `60f71c5` (already carrying `0184`) and `74be202` (carrying the
check, with no `0184` row). Git took both sides with no conflict, because they
touch disjoint files.

### A4. Not time-, machine- or order-dependent

Prompt 0036 found six tests that failed only between midnight and 2am Pacific,
so this was ruled out rather than assumed -- and it mattered, because this
session began at 00:17 PDT, inside that window.

* **Order.** The same four fail with the files in either order, and the same two
  fail in each file run alone (2 + 2 = 4, no interaction).
* **Time.** Identical four failures re-run under `TZ=Pacific/Kiritimati`, where
  the wall clock reads 2026-09-06 21:23 -- 21 hours away and outside any
  midnight window. The code agrees: the only `Date` on either failing path is
  `Date.parse(data.date)` validating that a stored ISO string parses. Both
  predicates are a `readdirSync` and a set difference.
* **Machine.** Both paths read the repository and nothing else -- no network, no
  browser, no database, no environment variable. One machine cannot prove
  machine-independence, so what is claimed here is that there is no input for a
  machine to vary.

### B1. Clearing the counts half

One full `npm run verify:readme` on a clean tree at `5d7cf5c`, port 5199 free,
`--selftest` included, no digit typed by hand. The browser probe first, because
this file's own rules say a session either runs the pass or names what stopped
it: Chromium 141.0.7390.37 at `/opt/pw-browsers`, screenshots working, rAF,
`IntersectionObserver` and `ResizeObserver` all live.

| | Before | After |
| --- | --- | --- |
| Route specs the run covered | 107 | **116** |
| Route/width runs | 214 | 232 |
| Measurements | 3142 | 3410 |
| Measurements outside threshold | 2 | 2 |
| Wall clock | 493.3s | 564.7s |
| `--selftest` controls | 70 (36 neg, 34 pos), 0 failures | 70 (36 neg, 34 pos), 0 failures |
| Measured on | `4ecf48f` | `5d7cf5c` |

`covered` now equals the static region's 116 and the unmeasured set is empty.

**EVERY DIFFERENCE IS ACCOUNTED FOR AND THE ONE THAT MATTERS IS THE ABSENCE OF A
DIFFERENCE.** The outside-threshold rows are IDENTICAL by identity before and
after -- `/dev/notebook` @375 `tap-reach` and `/dev/notebook` @1440 `tap-reach`,
both the toolbar text controls held under the floor by decision 12 with the
owner against it. Nothing was gone and, more to the point, **nothing was new**:
the nine specs measured for the very first time produced no finding at all. That
was the open question worth reporting either way, since a first measurement of a
route nobody has looked at is a real finding rather than noise. Here there was
none. The static region was not touched; the diff is six lines, all inside the
measured region.

### B2. Clearing the GAUNTLET half

One row added to the post-`0027` table, after `0158`, stating what `0184` bounds
and what it deliberately leaves open: the `anon` grant stays and why, the three
bounds inside the existing function with the signature unchanged (so no deploy
ordering), that it still never raises, that the window keys on `expires_at`
ALONE and never on `locked_at` because a correct solo submit sets `locked_at`
and the add-in's final `run_end` flush posts after it, and that `0152`'s
self-forgery decision is not reopened. Nothing under `supabase/migrations/` or
`src/` was touched and no assertion was relaxed.

**CONTROL, since a check that has never failed has not been tested.** With the
row removed again, `tools/gauntlet-doc-check.mjs` reports the same one finding
naming the same claim, and the same two assertions in
`tests/gauntlet-doc.test.ts` redden. The file was then restored from a `cp`
copy, not from git, and is md5-identical (`15502a62a664328a2ab232f262c0a55e`).

`0185`, which landed on `main` while this bundle ran, was checked against the
same rule and is correctly NOT a GAUNTLET migration: its four mentions of
`gauntlet*` buckets are all inside `--` comments, and its write is a blanket
`update storage.buckets` that names no GAUNTLET object. It also makes no claim
`docs/GAUNTLET.md` contradicts, which carries no bucket size limit anywhere.
`FOREIGN_GAUNTLET_MIGRATIONS` stays at four.

### B3. Verification

* **`npm test`: 290 files, 5,927 tests, 0 failures.** Run 2026-09-06 00:38 to
  00:42 America/Los_Angeles, 239.5s. The baseline before this bundle was 4
  failures out of the same 5,927.
* **`npx svelte-check`: 0 errors, 37 warnings**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` over 20 files. Exactly the documented baseline; no
  number moved. Run 00:42 to 00:44 America/Los_Angeles, with
  `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported as placeholders
  before `svelte-kit sync`, per the missing-`.env` phantom-error rule.
* Nothing was left red. Nothing outside this bundle's ownership was edited.

### B4. What would have caught the gauntlet-doc failure on the commit that caused it

**Nothing on either branch could have, and that is the answer rather than an
evasion.** The failure is merge-introduced: it exists on `5877f19` and on
neither of its parents. `7d848d7` ran a suite with no such check in it;
`74be202` ran the check against a tree with no `0184` in it. Both were honestly
green. There is no commit at which a branch-scoped gate could have seen the
pair, so a stricter rule about remembering to update the document would not
have helped -- the session that should have remembered was working on a tree
where the requirement did not yet exist.

What would have caught it is a gate on the MERGED tree, and the repository
already reasons about exactly this class of defect one file over.
`tests/derived-numbers.test.ts`'s own header describes the identical shape for
the static counts region -- two branches each adding one spec, each writing the
same number for their own tree, git merging both with no conflict, and the
pushed tree holding one more spec than the region claims -- and prompt 0050's
answer was to make `integrate.yml` regenerate the static region ONCE on the
merged tree before pushing. That step is in the workflow today. It is the only
post-merge correctness step there: `integrate.yml` never runs `npm test` on the
tree it is about to push.

The compensating control that did exist WORKED, and its resolution is the whole
cost. `ci.yml`'s own comment records that `integration` gets no push-triggered
CI ever, because GitHub does not run a workflow for a push made with
`GITHUB_TOKEN`, and that a daily `cron: '0 8 * * *'` run against `integration`
is the answer. `5877f19` landed at 21:28 UTC; the next scheduled run was 08:00
UTC, about ten and a half hours later. Every branch cut from `integration` in
that window inherited four red assertions and had to spend part of an audit
proving they were not its own. Five did.

So the durable fix is to move the gate from a daily schedule to the merge
itself: run the suite on the merged tree inside `integrate.yml`, in the same
place the static counts region is already regenerated, and report a merged tree
that reddens rather than pushing it silently. **That is deliberately NOT done
here** -- `.github/workflows/integrate.yml` is outside this bundle's ownership,
the change has real consequences for a workflow that deletes branches, and
choosing between "refuse the push" and "push and report" is a decision about
whether a merge-introduced failure should block eight branches or be announced
to them. It belongs in its own bundle with that argument made properly.

### Not verified

* **Nothing was applied to any database.** `IDEA_MIGRATION_URL` was never
  opened, no migration was written, and no claim here is about live Supabase
  state. `0184`'s applied status is a property of production that no file in
  this repository records, and the new table row does not claim one.
* **`npm run build`** was not run.
* **No signed-in surface was driven.** `npm run verify:readme` covers `/dev`
  routes only, and its two standing limits apply to every number above: the
  harness blocks every non-loopback request (so `fonts.googleapis.com` is reset
  and all text is measured in the FALLBACK stack), and `prefers-reduced-motion`
  is `no-preference`, so that path is not exercised.
* **Machine-independence is argued, not measured** -- see A4.
* The four `docs/GAUNTLET.md` claims the checker cannot hold an opinion about
  (prose, design arguments) were not audited. This bundle cleared a check; it
  did not repeat prompt 0060's audit.
