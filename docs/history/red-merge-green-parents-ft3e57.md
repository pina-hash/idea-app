---
title: A merge can be red when neither parent was, and the sweep now looks
date: 2026-09-06
branches: ["claude/red-merge-green-parents-ft3e57"]
migrations: []
subsystems: ["ci", "workflows", "testing"]
---

`integrate.yml` merged branches into `integration` and pushed without ever
running a suite on what it built. Prompt 0050 had already closed one instance of
the resulting gap -- the static counts region, regenerated on the merged tree --
and the shape it closed is general. This bundle runs the repository's own suite
on the merged tree, pushes the merges either way, fails the run loudly when the
tree is red, and NAMES the failing assertions in the job summary.

The census under "Every check that relates two files" below is the finding, and
it is worth more than the fix.

## Where this started, verified rather than inherited

The prompt's account of the 2026-09-05 incident was re-measured in a cloud
container on 2026-09-06 rather than taken on trust. Every claim held:

| claim | how it was checked | result |
| --- | --- | --- |
| `74be202` added `tools/gauntlet-doc-check.mjs` at 19:48 UTC | `git log -1` | 19:48 UTC, subject matches |
| `7d848d7` added `0184_gauntlet_run_event_bounds.sql` at 20:30 UTC | `git log -1` | 20:30 UTC, subject matches |
| they are siblings off `fdf8c68` | `git merge-base 74be202 7d848d7` | `fdf8c68`, and neither contains the other |
| each was green on its own tree | worktree per sha, ran the checker | `74be202` exit 0, "agree with the tree"; on `7d848d7` the checker **does not exist** |
| the merge `5877f19` is red | same checker, same command | exit 1, `[migration-table-missing-row] docs/GAUNTLET.md's migration table has no row for 0184` |
| `5877f19` is where they first met | `git rev-list --ancestry-path` | yes; its parents are `60f71c5` (which contains `7d848d7`) and `74be202` |

One correction to the prompt's framing. `5877f19` is **not** a sweep merge: it
is `Merge pull request #82`, made by a person merging the branch's PR into
`integration`. The sweep is still the right place for the fix -- it is the path
most branches take -- but a PR-merge into `integration` is a second door onto the
same tree, and this bundle does not cover it. A PR merge does get a CI run of its
own (`integration` has an open PR to `main`, so pushes to it trigger
`pull_request` runs), and run 33993143611 on `5877f19` did go red at 21:32 UTC,
four minutes after the merge. So on that particular evening the failure was
visible immediately and nobody was watching, rather than invisible for ten and a
half hours. The window this bundle closes is the SWEEP's, which is genuinely
unwatched.

## The two-week reconstruction

The prompt suggested using the next scheduled CI run as a proxy. That proxy is
weak here: `ci.yml`'s schedule was only added recently and has fired **three**
times ever (2026-09-03 09:02 UTC success, 09-04 08:55 failure, 09-05 11:33
failure -- note the 3h33m scheduler delay on the last). A scheduled run also
records `head_branch: main` even though it checks out `integration`, so it does
not appear in a branch-filtered listing at all.

Two better instruments were used instead.

**A: the 48 CI runs whose `head_sha` is an actual tip of `integration`**
(`push` and `pull_request` events, 2026-08-28 to 2026-09-06). Every one of the
nine tips from `9d476d1` onward is a failure; so is `fdf8c68`, `b000e2f` and
`e97b18d` before them. The last green tip of `integration` recorded anywhere is
`b937be4` on 2026-09-04 21:29 UTC.

**B: the two cross-file checks, replayed locally against every merge tip of
`integration` in the window.** 29 merge commits on the first-parent chain, each
checked out into a worktree and put to `tests/gauntlet-doc.test.ts` and
`tests/derived-numbers.test.ts`. This is the stronger instrument because it
answers per commit rather than per CI run. (Eleven of the 29 predate both test
files. A worktree needs `npx svelte-kit sync` once or vitest fails on startup
with a misleading rolldown/Tsconfig error -- the trap CLAUDE.md records for a
fresh `npm ci` checkout, which cost the first run of this reconstruction.)

| tip (UTC) | verdict |
| --- | --- |
| `0d30b92` 09-02 10:35 | green |
| `5d79b6f` 09-03 16:50 | green |
| `9a40ec5` 09-04 21:47 | green |
| `1895925` 09-05 03:13 | **red** (2) -- `each region renders byte-identically from its own data line`, `passes verifyBlock` |
| `f61ffd7` 09-05 18:36 | **red** (2) -- the `verifyMeasured` pair |
| `ad5adbe` 09-05 19:08 | **red** (2) |
| `4a1ead2` 09-05 20:21 | green |
| `ce9d8e5` 09-05 20:28 | **red** (2) -- greenline moderation added route specs |
| `d8fea28` .. `60f71c5` (6 tips, 20:33-21:27) | **red** (2) |
| `5877f19` 09-05 21:28 | **red** (4) -- the gauntlet-doc pair joins |
| `7ddeb67`, `17bee5f`, `54af392` 09-05 21:29-21:30 | **red** (4) |
| `13d1747` 09-06 04:35 | **red** (4) -- still the tip |

**Two red-on-merge windows.**

- **Window 1** opened at `1895925` (09-05 03:13 UTC) and closed at `4a1ead2`
  (09-05 20:21). **17 hours 8 minutes**, three merge tips inside it.
- **Window 2** opened at `ce9d8e5` (09-05 20:28 UTC) and **was still open when
  this bundle was written**, 2026-09-06 08:12 UTC: **11 hours 44 minutes and
  counting**, eleven merge tips inside it.

**Bundles that opened inside a window.** Counting `claude/**` branches whose
first commit falls after `5877f19` (09-05 21:28 UTC), when the four-assertion
version of the redness began: `apply-trace-r4kd2p`, `upload-limit-fiction-jv9w43`,
`database-migration-probe-dnxvth`, `maps-media-bucket-he0wnn`,
`duplicate-drafts-count-wzworl`, `duplicate-drafts-production-ru7pag`,
`assignment-draft-mirror-zpzkzd`, `instructor-requests-surfaces-j2dfjc`,
`four-red-integration-tests-62a7ba` (the session sent to fix it), and
`red-merge-green-parents-ft3e57` (this one). **Ten**, of which nine were not
about the failure. Prompt 0067 counted five at the time it was written; the count
had doubled by the next morning.

**Is that unusual or ordinary? Ordinary.** 16 of the 18 measurable tips since
09-05 03:13 are red on a cross-file check, and window 1 is a separate defect from
window 2. Red-on-merge is the steady state of this pipeline, not an incident.

**The four assertions are still red on `origin/main` right now.** Measured on
`eec8151`: the same four, same messages. Prompt 0067's fix is on
`claude/four-red-integration-tests-62a7ba`, which is still standing and merged
into neither `integration` nor `main`. That branch is the one to land.

## What the sweep does between the last merge and the push, before this bundle

Read end to end and confirmed by grep. The job is `actions/checkout`, a git
identity step, and one 1,380-line shell step. Between the last merge and the
push there is exactly one thing: `counts_refresh`, which runs
`node tools/browser-verify/readme-counts.mjs --static`. There are **two** `node`
invocations in the whole file (that one, and the identical line inside
`auto_resolve`) and **zero** occurrences of `npm`, `npx`, `vitest` or
`actions/setup-node`. The prompt's claim is exact: the counts regeneration runs
there and no suite does.

## Every check that relates two files

This is the census the bundle is for. 290 test files under `tests/` were
screened; 135 touch the filesystem or import a `tools/*` checker; 38 were read
closely. **47 relate two or more repository-tree files**, and for every one of
them two branches can each be green while the merge is red.

Grep for this heading when a merge goes red on a test that neither branch
touched.

**Directory sweep on one side, a document or pinned list on the other:**

| test file | the two sides |
| --- | --- |
| `tests/gauntlet-doc.test.ts` | `supabase/migrations/*gauntlet*.sql` + `src/routes/gauntlet/**` vs `docs/GAUNTLET.md`, `docs/GAUNTLET-DESIGN.md` |
| `tests/derived-numbers.test.ts` | `tools/browser-verify/routes/*.mjs` + `src/routes/**` vs the counts regions in `tools/browser-verify/README.md` |
| `tests/db/migration-0177-tombstone.test.ts` | the migration directory's numbering vs contiguity and uniqueness |
| `tests/standards-version-header.test.ts` | `docs/standards/*.md` vs `docs/standards/REGISTER.md` |
| `tests/short-link-reserved-names.test.ts` | `src/routes/` + `static/` top level vs `RESERVED_SLUGS` vs the SQL function body in `0156`/`0166` |
| `tests/dev-routes-excluded.test.ts` | `src/routes/dev/**` and `src/routes/**` vs `src/lib/dev-routes.ts` |
| `tests/theme-tokens.test.ts` | `src/lib/design-system/themes/*.css` vs `themes/index.css` and `colors.css` |
| `tests/upload-limits.test.ts` | `UPLOAD_CEILING_LIST` vs every migration's bucket limits; and a `src/**` sweep vs a pinned six-file list **with a pinned line number** |
| `tests/grant-surface.test.ts` | the whole applied chain's `pg_catalog` vs `ANON_SURFACE`/`AUTHENTICATED_WRITE_SURFACE` and their pinned sizes, plus `tests/db/supabase-stub.sql` |
| `tests/notebook-shell.test.ts` | every `<ClassSplit scroll="page">` in `src/**` vs a pinned four-entry list; and `SPLIT_MIN_PX` vs `split.css`'s media query |
| `tests/classroom-composer-effect-reactivity.test.ts` | every `src/**/*.svelte` effect vs the 9-entry `ALLOWED_PURE` allowlist keyed on file path + callee + count |
| `tests/avatar-proxy.test.ts` | a `src/**` sweep vs a pinned two-file `ALLOWED` and an exact count |
| `tests/avatar-initials.test.ts` | a `src/**` sweep vs two **verbatim source lines** from other files |
| `tests/theme-preference.test.ts` | every `<ThemeRoot/>` mount in `src/**` vs "exactly one, in the root layout" |
| `tests/feedback-coverage.test.ts` | every `+page.svelte` vs `FEEDBACK_EXCLUSIONS` and a hard-coded four-route relocation map |
| `tests/foundry-bundle-url.test.ts` | the ingest function vs the serving read vs the URL builder; `supabase/config.toml` vs the functions directory; a retired-identifier sweep over `src/` **and `tests/`** |
| `tests/foundry-cover-url.test.ts` | a `src/**` sweep vs `src/lib/foundry/covers.ts` |
| `tests/classroom-hall-pass-limits.test.ts` | `0174`'s literals vs a classroom-source sweep for the same numbers |
| `tests/classroom-hall-pass.test.ts` | a `src/**` sweep vs the retired and surviving RPC names |
| `tests/classroom-grading-post-grade-change.test.ts` | a `src/**` sweep vs a pinned instructor-surface file set |
| `tests/notebook-tolerance-privacy.test.ts` | a `src/**` sweep vs pinned importer and non-importer lists |
| `tests/view-as-orphans-dropped.test.ts` | a `src/**` sweep vs the five names dropped by `0124` |
| `tests/gauntlet-framing-projection.test.ts` | two speedrun loaders' selects vs a pinned key/reason table |
| `tests/foundry-telemetry-surfaces.test.ts` | `src/lib/foundry/` listing vs `AppStage.svelte` and `0139`'s window |
| `tests/classroom-attachment-mime.test.ts` | a copy count of the image-extension regex vs an expected count; client cap vs server cap vs `0133`'s bucket |

**Two or more named files that must agree, no sweep:**

| test file | the sides |
| --- | --- |
| `tests/gauntlet-volume-tolerance.test.ts` | ONE tolerance band in FOUR languages: `0147`, `src/lib/gauntlet/authoring.ts`, `static/tools/idea-gauntlet-submit.bas`, `tools/solidworks-addin/.../GauntletMath.cs` |
| `tests/workflows.test.ts` | the densest in the repo -- `integrate.yml` vs `ci.yml` vs `tools/integrate-gate-proof.sh` (a pinned case count) vs `deploy-probe.mjs` vs `idea-status.py` vs `apply-migration.mjs` vs `supabase/roles/` vs `docs/standards/IDEA_instructions.md` |
| `tests/gauntlet-payload-sql-contract.test.ts` | every jsonb key the grading SQL reads vs what `buildPayload` can emit |
| `tests/foundry-preflight-parity.test.ts` | `src/lib/foundry/preflight*.ts` vs `supabase/functions/foundry-ingest/*` -- two deploy targets one branch rarely touches together |
| `tests/gauntlet-authoring-tolerance.test.ts` | the form's seed constant vs the server default in the applied chain |
| `tests/coin-symbol.test.ts` | a hand-maintained 26-path `COIN_SOURCES` list vs the files at those paths |
| `tests/boundary-token.test.ts` | `colors.css` vs `notebook-theme.css` vs ~10 named components |
| `tests/home-order-and-accent.test.ts` | `AppLauncher.svelte` vs `colors.css` vs `forge.css` vs two mark components |
| `tests/classroom-measure.test.ts` | `nav.ts` vs `classroom.css`, `effects.css`, `split.css` and ~12 surfaces |
| `tests/classroom-nav-collapse.test.ts` | `ClassroomShell.svelte`'s marker class vs `classroom.css`'s selector |
| `tests/classroom-tab-strip.test.ts` | `ReferenceDoc.svelte` vs `split.css` vs `tab-strip.ts` |
| `tests/save-state.test.ts` | a pinned consumer list vs `save-state.svelte.ts`, `save-guard.svelte.ts`, `+layout.svelte` |
| `tests/notebook-review-console.test.ts` | `notebook-review.ts`'s state array vs four surfaces vs the `--nb-cell-*` tokens in `colors.css` |
| `tests/profile-menu-tap-reach.test.ts` | `ProfileMenu.svelte` vs `src/app.css` |
| `tests/maps-photo-prepare.test.ts` | `photo-prepare.ts` vs `media.ts` vs `0168`'s `allowed_mime_types` |
| `tests/gauntlet-knowledge-clock-client.test.ts` | four pinned route files vs the shared clock module |
| `tests/gauntlet-leaderboard-history.test.ts` | one reference loader vs three followers |
| `tests/foundry-gallery.test.ts` | `bundle-headers.ts` vs `AppFrame.svelte` vs `AppStage.svelte` |
| `tests/classroom-song-queue-surface.test.ts` | `0145`'s refusal reasons vs the sentence map vs the transport |
| `tests/avatar-surfaces.test.ts` | four named surfaces vs `avatars.ts`'s adapters |
| `tests/apply-migration.test.ts` | the migration corpus vs the scanner, through **ratio bounds** and three pinned filenames |
| `tests/classroom-item-images.test.ts` | `package.json`'s dependency set vs the modules importing them (structural read only) |

Nine files were flagged ambiguous and not resolved: `foundry-author-name`,
`feedback-untrusted-render`, `feedback-tried-and-screenshot`,
`notebook-writing-aid`, `classroom-item-doc`, `notebook-guidance-surfaces`,
`classroom-grading-console`, `classroom-storage-objects`, `classroom-item-images`.
Structure was read, assertion bodies were not. Treat the count of 47 as a floor.

One near-miss worth naming: `tests/dom/app-navigation-stub-mount.test.ts`
relates `node_modules/@sveltejs/kit/.../navigation.js` to
`tests/stubs/app-navigation.ts`. A genuine two-side check, but one side is a
dependency no branch edits directly -- only a lockfile bump reaches it.

## What was built

**`merged_suite` and `run_is_red` in `integrate.yml`,** between
`# merged_suite_marker:begin/end`, the fifth cuttable region in that file.
`merged_suite` runs `npm ci` then `npm test`, prints a verdict on its first line
and one failing assertion per line after it, and returns 0/1/2 for
green/red/unrun. `run_is_red` is the whole exit decision.

**It runs after the push and after the deletes.** This is the load-bearing
placement decision and it goes the opposite way from `counts_refresh`'s. `npm ci`
plus a three-minute suite are the two longest things in the job and the two most
able to end it from outside -- OOM, eviction, the job cap. Before the push, any
of those discards every merge in the sweep. After it, the merges are on the
remote before the function is entered.

**A red tree is pushed and the run goes red with the assertions named.** The
summary grows a section, `The merged tree's failing assertions`, printing each
`FAIL` line as `<file> > <suite> > <test>`, under a sentence saying that neither
parent need have been red.

**`unrun` is a third verdict.** A failed install, or a runner that exits non-zero
without naming a test, is not a test failure. Folding it into `red` would send
somebody to read a diff that is fine.

**The whole suite, not a subset.** A subset would have to be a list; the list
would be the same kind of two-file agreement it polices; and it lets through
every merge-only failure that is not a listed check. The measured cost is 174.50s
of suite (287 files, 5,821 tests, on the runner that found `5877f19`) plus 15s of
`npm ci` (measured in this container) -- roughly four minutes on a job that is
already serialized behind `concurrency: integrate`. The window it closes was
measured in hours.

**Once, on the final tree**, for `counts_refresh`'s own stated reason.

**`actions/setup-node@v4` at node 24**, matching `ci.yml`, plus the same two
`PUBLIC_SUPABASE_*` placeholders. `ci.yml` is read-only to this bundle, so the
version could not be extracted; `tests/workflows.test.ts` asserts the two agree
instead, which is the cheap half of extracting it.

**The nightly CI hour does not move, and that was a decision.** The sweep samples
whatever hour a session finishes at -- the working day, which is exactly the part
of the clock `0 8 * * *` was chosen NOT to sample. `0 8` is the only cron inside
00:00-02:00 Pacific in both halves of the year, and detection degrades across
that window (6 failures at 00:05, 2 at 01:30, 0 at 02:05). The nightly is also
the only thing that catches a run whose own suite step could not execute. The two
are complementary; making them "consistent" would delete the one that samples the
clock.

## What was proved, and what the proof caught

`tools/integrate-gate-proof.sh` grew cases 61-75 plus case 0e, cutting
`merged_suite` and `run_is_red` out of the workflow the way the four existing
regions are cut. 81 of 81 cases pass.

The fixture is the incident in miniature and it is MEASURED rather than
stipulated: a stub `npm` sits earlier on PATH, and its `test` runs the fixture
tree's own `fixture-suite.mjs` when one is present -- a real checker relating
`migrations/*.sql` to `docs/DOC.md`. One branch adds the CHECKER, another adds a
MIGRATION, and cases 66 and 67 OBSERVE that each parent is green before case 63
claims the merge is red. It prints ANSI deliberately, because vitest colours its
output on a runner and not in a pipe.

| case | what it establishes |
| --- | --- |
| 0e | the workflow calls it, reads its verdict, prints its findings, and the call sits AFTER the push (by line number) |
| 61, 62 | one branch, green tree: pushed, run green |
| 63 | two branches, red tree: both merges pushed, run red |
| 64 | the finding names file, suite and test |
| 65 | both branches' work is on the remote, red tree or not |
| 66, 67 | each PARENT alone is green |
| 68, 69 | red tree AND a conflict: both causes, merges pushed, conflicted branch untouched |
| 70, 71, 72 | a failed install and a crashed runner are both `unrun`, both push, neither is silently green |
| 73, 74 | `run_is_red` at its corners; a skipped suite is not red |
| 75 | renamed markers cut nothing (negative control) |

**The harness caught a real bug in the workflow on its first run.** `merged_suite`
originally did `npm test 2>&1 | tee "$log"`. The function's stdout IS its verdict
-- the caller reads it through `$(merged_suite)` -- so `tee` put several hundred
reporter lines ahead of the verdict, the caller read an empty verdict, and a red
tree was reported as skipped. Case 61 observed `suite:` empty and `findings:2`.
It now writes to the log and cats it to stderr. `tests/workflows.test.ts` has a
mutation that puts the tee back.

`tests/workflows.test.ts` gained `mergedSuiteFindings` plus three tests (57 pass
in that file). The regression guard is that the step cannot be deleted silently:
nothing else in the repo would notice, because the proof harness drives the cut
function directly and a function nobody calls cuts and sources perfectly happily.
Its positive control mutates the real file one edit at a time -- the step
deleted, the verdict ignored, the assertions dropped from the summary, the call
moved ahead of the push, `vitest` reached for directly, `unrun` folded into `red`
(at BOTH sites, since collapsing one leaves the verdict reachable), the install
dropped, the tee restored, an `exit` inside the region, and the markers renamed.

Two rules are asserted over COMMENT-STRIPPED source, and both had to be: the
region quotes `process.exit(0)` while explaining why it runs `npm test` rather
than vitest, and the workflow explains the stdout contract in prose beside the
call.

## Verified

- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, broken
  down 31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. Baseline exactly.
- `bash tools/integrate-gate-proof.sh`: **passed 81, failed 0, ran 81 of 81**.
- `npx vitest run tests/workflows.test.ts`: **57 passed**.
- `npm test`, the full suite, run at **01:28-01:32 PDT on 2026-09-06**
  (255.69s): **290 files, 5,930 tests, 4 failed, 288 files passed**. The four
  are the inherited ones named below and none of them reads a file this bundle
  touches. The arithmetic is worth recording: prompt 0067 reported 290 files
  and **5,927** tests on its own branch, this bundle adds exactly **3** tests to
  `tests/workflows.test.ts`, and 5,927 + 3 = 5,930. The file count is unchanged
  because no test file was added.
- **Negative controls, both run and both restored byte-identically** (copied
  with `cp` first and md5-compared after, never `git checkout --`):
  renaming `merged_suite_marker` throughout the workflow makes the harness print
  `FATAL: cut nothing between merged_suite_marker:begin/end` and **exit 1**
  rather than passing a file it could not read; deleting the one call site
  reddens `tests/workflows.test.ts` at exactly the two new assertions (2 failed,
  55 passed) and nothing else.
- `node tools/browser-verify/readme-counts.mjs --static --check`: the static
  region agrees with the tree. No route spec is added by this bundle, so no
  counts regeneration was needed.
- Both edited shell bodies parse: the workflow's `run:` block is extracted from
  the parsed YAML and put to `bash -n`, and so is the harness.

## NOT verified

- **The workflow has not run.** It cannot: GitHub runs the `workflow_run` copy
  of a workflow that is on the DEFAULT branch, so nothing in this bundle takes
  effect until `integration` reaches `main`. Everything above is the cut
  functions driven against throwaway repositories plus structural assertions
  over the file.
- **The four-minute cost is a projection**, not a measurement of this step on a
  runner. Its two components were measured separately (174.50s of suite on the
  GitHub runner that produced run 33993143611; 15s of `npm ci` in this
  container), and a hosted runner's `npm ci` is normally slower than a warm
  cloud container's.
- **`npm ci` on the merged tree** has never been exercised against a lockfile
  two branches both touched. That case is expected to answer `unrun`, which is
  the designed behaviour, but it has not been observed.
- **Nothing production-side.** No Supabase, no Vercel, no live database. Prompt
  0073 established a cloud container cannot reach production and no attempt was
  made.
- **`tests/derived-numbers.test.ts` and `tests/gauntlet-doc.test.ts` are red on
  this branch and were red before it.** Four assertions, inherited from
  `origin/main`, fixed on `claude/four-red-integration-tests-62a7ba` which has
  not landed. This bundle changes no file either test reads, and the four were
  measured red on the pristine tree before the first edit.
- **CLAUDE.md is not updated**, and it should be: the section on `claude/**`
  branches vanishing describes what the sweep does, and "a red Integrate run may
  now mean the merged tree failed the suite, with the assertions in its summary"
  is a rule a future unrelated session needs. `CLAUDE.md` is outside this
  bundle's owned file surface, so it was left alone rather than edited across a
  boundary. It is one paragraph and wants its own small bundle.

## Deferred, and named

- **The PR-merge door.** `5877f19` was a person merging a PR into `integration`,
  not a sweep. That path is not covered by this step. It does get a
  `pull_request` CI run today, which is why it was caught in four minutes rather
  than ten hours, but that is a side effect of an open `integration -> main` PR
  and not a guarantee.
- **The nine ambiguous test files** in the census, read structurally only.
- **The pinned line number in `tests/upload-limits.test.ts`**
  (`routes/tournaments/[id]/+page.svelte:182`) is merge-fragile on its own terms:
  two branches inserting lines in one file at different offsets move the hit
  without either being wrong. Reported, not fixed -- it is not this bundle's file.
- **`ci.yml` and `integrate.yml` name the Node version twice.** Asserted equal
  rather than extracted, because `ci.yml` was read-only here.
