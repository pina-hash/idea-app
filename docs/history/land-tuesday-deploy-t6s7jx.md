---
title: "Five finished branches landed in one deploy, and the CI fix was not among them because its branch no longer exists (`claude/land-tuesday-deploy-t6s7jx`)"
date: 2026-09-06
branches: [claude/land-tuesday-deploy-t6s7jx]
migrations: []
subsystems: ["Operations", "Browser harness", "Tournaments"]
---

Prompt 0095. No migration written, none applied, production not reached. An
operations bundle: it authors no source code, and the only two files it changed
outside a merge commit were written by generators it was told to run.

Started from `origin/main` at `e06ed58`, working directory `/home/user/idea-app`.
The container's git already carried a committer identity
(`Claude <noreply@anthropic.com>`), so the "Please tell me who you are" failure
the prompt warns about never arose and nothing was set.

## The container did arrive shallow, and the fetches are why A3 was clean

`git rev-parse --is-shallow-repository` was **true** on arrival, and
`origin/main` was pinned at a stale `336e82f` while the real tip was `e06ed58`.
`git fetch --unshallow origin` brought the history to **1702 commits** and
created **19 branch refs that did not exist locally**, including every branch
this bundle was sent to merge; `git fetch origin integration` added that ref.

This is the third session to be told about it and the first to record what it
buys concretely: **A3 came back with ZERO apply-migration failures.**
`tests/apply-migration-guard.test.ts` and `tests/apply-migration-trace.test.ts`
name `origin/integration` literally, six times between them, so on a clone that
never fetched the ref they fail with *"could not list supabase/migrations on
origin/integration"* and read exactly like a broken migration gate. The prompt
asked which of the two outcomes happened and why; it was the clean one, because
the fetches ran first.

## A1: the eligibility table

| branch | tip | committed (UTC) | in `main` | newest ledger `Status:` |
| --- | --- | --- | --- | --- |
| `tournament-fullscreen-nav-jnzb4d` | `f763465` | 2026-09-06 22:43:29 | no | 0091 **pushed** |
| `matrix-theme-rain-598tt0` | `8f0465a` | 2026-09-06 22:43:55 | no | 0090 **pushed** |
| `grading-surface-gaps-5r4w0j` | `de7cb02` | 2026-09-06 22:31:51 | no | 0092 **pushed** |
| `maps-editor-workspace-c4q5vb` | `25efaaa` | 2026-09-06 22:55:13 | no | 0093 **pushed** |
| `land-three-branches-deploy-go0ji5` | `5c9fc92` | 2026-09-06 21:18:24 | no | 0089 **pushed** |

All five eligible, none skipped for being unfinished. Containment was read with
`git merge-base --is-ancestor` throughout and never with
`git branch -r --contains | grep`, which 0085 recorded matches a branch on its
own name.

## `ci-shallow-clone-red-38zmu5` was DELETED, and its fix is still not on `main`

The prompt allowed for two answers -- already contained, or deleted -- and the
answer is **deleted**. `git ls-remote origin 'refs/heads/claude/ci-shallow-clone-red-38zmu5'`
returns nothing. What deleted it is `.github/workflows/integrate.yml`, which
merges a green `claude/**` branch into `integration` and reaps the branch:
`origin/integration`'s tip is literally *"Merge claude/ci-shallow-clone-red-38zmu5
into integration"*.

**Deleted is NOT the same as contained, and the difference is the whole
finding.** `git log origin/main..origin/integration` is exactly four commits and
all four are that branch's: the CI `fetch-depth: 0` fix, its runner measurement,
its ledger entry and its history entry, touching `ci.yml`, the workflows README,
`tools/apply-migration.mjs`, the two apply-migration tests and a new
`tests/git-refs-precondition.ts`. **So `main` is red in CI for 0094's cause
before this bundle and remains red after it.**

It was skipped rather than merged, and the reason is ownership rather than
risk. The prompt's conditional reads "if A1 found it unmerged; else say so and
skip", and the ledger this bundle was given to write names `integration` under
*"Deliberately excluded"*. `CLAUDE.md` is explicit that whether a lane may merge
`integration` into `main` "is not this file's to say" and belongs to the
prompt's own ending, which is silent here. Merging it would have been a scope
decision this bundle was not granted, on the one push that deploys
`ideabosco.com`.

**It is one clean merge whenever somebody wants it**, and it carries nothing
else: `origin/main..origin/integration` was those four commits and no others.

## A2 and A4

A2 test-merged each branch into `main` in isolation with `--no-commit --no-ff`,
aborting between each: **all five clean**, at 8, 15, 10, 26 and 2 files.

A4: `git diff --name-only origin/main...<branch> -- supabase/migrations/` is
**empty for all five**. `main`'s highest is `0189`, unchanged. Two of the
ledgers carried a CONDITIONAL claim -- 0092 on `0190` and 0093 on `0191` -- and
**neither was used**, which is the point of a conditional claim: the number is
still free. Whether `0186` through `0189` are APPLIED is a property of
production and no file here records it; nothing in this bundle reached the
database, and it was not permitted to.

## The merges, and the one conflict shape

Merged `--no-ff`, one commit each, in the prompt's order. Because the CI branch
does not exist, the Tuesday fix took the first slot:
`98896895`, `3edad97d`, `98ac08a5`, `716bd70b`, `f3805e55`.

**Every conflict in the sweep was `tools/browser-verify/README.md`, three times,
always inside the `counts:` markers** -- 3, 4 and 4 hunks. `classroom-updates.json`
never conflicted, and the reason is structural: exactly one of the five branches
(`matrix-theme-rain`) touches it, so no second writer existed. It is the only
file any two of these branches share; every other path in the sweep has a single
writer.

Resolved hunk-by-hunk, taking the merged branch's side per hunk, with a small
script that walks the conflict blocks and never a whole-file take. **The rule
paid for itself visibly at the very first conflict**, which is worth recording
because 0085 stated it as a caution and here it is as a measurement: at merge 2
the static region was NOT in conflict and read `specs:134, runs:268` -- merge
1's own addition, carried in by the tournament branch's new route spec. A
whole-file take of either side would have silently discarded it. By merge 4 the
same region read `specs:138, runs:276`.

**And the intermediate winner decides nothing, which the regeneration then
proved:** `npm run verify:counts` on the merged tree rewrote the region to
**140 specs over 66 routes, 94 `/dev` pages, 280 runs** -- a value no single
branch carried, because it is the union.

`classroom-updates.json` was checked anyway rather than assumed: it parses, it
is an object with a `_readme` and an `entries` array, `main` had **140** entries
and the merged tree has **141** (140 + the 1 the Matrix branch adds), all 141
unique on date+title, and `JSON.stringify(x, null, '\t') + '\n'` round-trips
**byte-identical**, so nothing renormalised anybody's line.

## Measured

Every figure below was re-derived from the run's own summary line, with
`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported to placeholders
before `svelte-kit sync` so the 13 phantom errors a `.env`-less checkout reports
never appeared.

**A3 baseline, `origin/main` at `e06ed58`, on a DETACHED checkout of that commit
so this bundle's own ledger commit could not influence it: 311 files, 6301
tests, 0 failures, 285.28s.** That is 0089's merged-tree figure exactly, which
is the honest reading of "`main` is green": nothing has moved it since.

**B4 merged tree, 16:41:56 to 16:46:47 America/Los_Angeles: 318 files, 6404
tests, 0 failures, 289.35s.** Green on the first run: +7 files and +103 tests
over the baseline, all passing. Prompt 0075's two-or-more-file relation is the
failure mode B4 exists to catch and 0085 hit one; this bundle hit none, and the
single-writer fact above is why -- the only file more than one branch touches is
a generated README region that no test reads for content.

`npm run check`, 16:47 PDT: **0 errors, 37 warnings over 3078 files**, breakdown
**31** `state_referenced_locally` / **5** `css_unused_selector` / **1**
`perf_avoid_nested_class`, counted off `svelte-check`'s own output rather than
read from `CLAUDE.md`. The documented baseline exactly.

`npm run verify:readme`, once, on a clean committed tree with port 5199
confirmed free first: **280 route/width runs, 4296 measurements, 2 outside
threshold, 674.1s, measured on `287f079`**, `dirty: false`, self-test 70
controls / 36 negative / 34 positive / **0 instrument failures**. **`covered` is
140 of the 140 route specs in the tree**, so the measured region and the static
region agree. The two outside threshold are the two known ones, unchanged since
0085: `/dev/notebook` `tap-reach` "toolbar text controls" at **375** and at
**1440**, decision 12, with the owner.

The tree was committed before that run and left alone throughout, which is the
condition 0086 had to repeat an eleven-minute pass to satisfy. The 0092 trap --
a block of spurious findings on one route caused by that page navigating away
mid-measurement -- did not appear; the only two rows outside threshold are the
two standing ones, so no route needed re-running alone.

## Pushed

`e06ed58..19680f8` on `main`, **31 commits**, fast-forward, no force. `main` was
re-fetched immediately before the push and had not moved, and
`git merge-base --is-ancestor origin/main HEAD` was asserted rather than
assumed. One push, one deploy.

The tournament fix was then verified as landed by reading the bytes back off the
remote ref rather than off the local tree: `origin/main:src/lib/tournaments/TvStage.svelte`
carries `max-width: none; margin: 0` at line 539, and
`origin/main:src/lib/tournaments/fullscreen.ts` exists.

## Left undone: the branch deletions, a third time

`git push origin --delete` is refused by this container's agent proxy. The exact
signature, unchanged from 0085 and 0089: *"send-pack: unexpected disconnect
while reading sideband packet"*, *"fatal: the remote end hung up unexpectedly"*,
and then **"Everything up-to-date"** printed over the failure, which reads as
success. Verified against `origin` rather than against git's own report:
`git ls-remote` shows all five **STILL PRESENT** afterwards, and **34**
`claude/*` branches on origin in total. Attempted one branch at a time.
`integrate.yml` reaps a green branch whose commits `origin/main` already
contains, reporting it under "Already contained, deleted", so all five go on its
next run without anyone doing anything.

## A documentation defect this bundle could not fix in place

The prompt asked for "prompt 0091's five-step projector checklist from
`docs/history/tournament-fullscreen-nav-jnzb4d.md`, verbatim". **No such
checklist exists.** The file was read end to end (306 lines); its only numbered
list is a three-item table of mutation controls, and the single occurrence of
the word "checklist" is a reference to prompt **0077** having said it could not
look at a projector. `0091`'s ledger entry, `docs/history/tournament-bracket-surface-jf28qc.md`
(0077's own record) and a grep for "projector" across all of `docs/history/`
turn up nothing of the shape either.

This is 0088's and 0089's finding arriving a third time: **a prompt written from
a tree that cannot see the branch it is describing.** The session report says so
and assembles the Tuesday-morning facts from what 0091 actually measured,
labelled as an assembly and not as a quotation -- most importantly 0091's own
statement that **"Escape exits" is NOT VERIFIED** and is the first thing to
check on the real machine.

## Not verified

No migration was applied and nothing reached the live Supabase project or
production; the applied state of `0186` through `0189` is unknown to this
bundle. Nothing was checked in a signed-in browser or on a Vercel preview. **The
real `/tournaments/[id]/tv` route was not driven by anything here** -- 0091
measured the identical `TvStage` component through `/dev/tournaments?view=tv`,
and this bundle only merged and re-measured the harness. The browser harness
covers `/dev` routes only, blocks every non-loopback request (so text is
measured in the fallback stack and not the web fonts) and runs with
`prefers-reduced-motion: no-preference`, so that path is unexercised.
`origin/integration` was not touched and is now four commits of CI fix ahead of
`main` in one direction and 31 behind in the other.
