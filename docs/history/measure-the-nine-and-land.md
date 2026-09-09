---
title: "Prompt 0116: the nine tournament routes a pass had never visited, measured for the first time, and the landing that unblocked (`claude/migration-0192-verification-0dqhto`, second use of that branch name, no migration)"
date: 2026-09-10
branches: [claude/migration-0192-verification-0dqhto]
migrations: []
subsystems: ["Browser harness", "Operations", "Deploy", "Tournaments"]
---

Prompt 0115 stopped rather than merging, because `integration` was red. This
bundle removed the reason it was red by MEASURING what had never been measured,
and then landed.

**THE FILENAME DEPARTS FROM THE BRANCH-SLUG RULE, DELIBERATELY.** `CLAUDE.md`
names a history entry after its branch, and justifies it by saying a branch name
cannot be taken twice, which makes the slug collision-free BY CONSTRUCTION. The
harness issued prompt 0115's branch name a second time, so the construction does
not hold: `docs/history/migration-0192-verification-0dqhto.md` already exists and
is 0115's. Two bundles cannot share one file -- that is the exact write-point
collision the split of `docs/HISTORY.md` was done to remove -- so this entry
takes a descriptive name. **If the harness reissues a branch name again, do this
rather than appending to somebody else's entry.**

## What was wrong

`tests/derived-numbers.test.ts` was red on `integration`, and had been since the
tournaments branch was swept in. The measured region of
`tools/browser-verify/README.md` was captured at
`277e76a02262ec54bd78d8f9bb82d7279d74b225` on 2026-09-09T12:47:32.035Z and its
`covered` array named 8 of the 17 `tournaments-view-*.mjs` specs on the branch.

Verified independently before any work, from the committed tree rather than from
the failing test's message: 156 real specs on disk (158 files less `_shared.mjs`
and `_theme-shared.mjs`, which are shared modules and not specs), 147 covered,
nine absent. The arithmetic closes exactly -- `runsMeasured` 294 + 9 x 2 widths =
312, which is the static region's own `runs`, so the gap is nine specs and
nothing else.

The nine: the list page (`tournaments-view-list`, `-signedin-1`,
`-signedin-1-admin-1`), the team states (`-team-state-open`,
`-team-state-open-team-3`, `-team-state-open-viewer-host`, `-team-state-live`),
the team registration (`-register-team-2`), and the registration-open TV state
(`-tv-status-registration-open-field-22`).

**Prompt 0110 regenerated this region twice** (`e030fc74`, `6f9b2394`) and it
stayed nine short both times, so no pass had ever visited these routes at either
width. That is what made the block dishonest rather than merely stale: it printed
`Measurements outside threshold: 0` over a route set this tree does not have,
which is the one failure mode the region's own documentation says it must never
have.

## The run

**A measurement, not a formatting fix.** Nothing was widened, no spec deleted, no
digit hand-edited. The nine were measured for the first time and **came back
clean**.

The boot problem was avoided rather than survived. Prompts 0110 and 0111 each
lost hours to it: the harness's own Vite boot takes 180 to 187 seconds cold on
these containers against `startDevServer`'s 180 000 ms window, so it fails about
half the time and the failure reads as a hang. `startDevServer` probes the origin
first and returns `alreadyRunning: true` if something answers, so Vite was started
separately on port 5199 with its **pid recorded to a file**, `/dev/pathways`
warmed with a long timeout, and the nine tournament routes plus `/dev/notebook`
warmed before the timed run. The harness then reported `server boot 834ms`
against the previous region's boot -- it reused the running server, as intended.
Teardown was `kill -TERM` on the recorded pid followed by a port check.
**`pkill -f` was not used anywhere**: it matches the shell running it and kills
the command it is meant to protect, which cost prompt 0111 two builds.

The tree was clean and committed before the run and stayed untouched during it,
so the region records `dirty: false` and `sha 18b1d33` -- the commit it was
actually measured on. A dirty run is not evidence.

| | previous region | this run |
| --- | --- | --- |
| route/width runs | 294 | **312** |
| measurements | 4560 | **5238** |
| specs covered | 147 of 156 | **156 of 156** |
| outside threshold | 2 | **2** |
| wall clock | 766.6s | **796.0s** |
| measured on | `277e76a` | `18b1d33` |
| dirty | false | false |

Selftest alongside it: 70 controls, 36 negative, 34 positive, **0 failures** --
which is what says the instrument itself was working, and the reason a clean
result on nine new routes is worth anything.

### Every row outside threshold, by name

Two, and they are the two that were already standing:

- `/dev/notebook` @375, `tap-reach`, toolbar text controls
- `/dev/notebook` @1440, `tap-reach`, toolbar text controls

Both are "under the floor on width -- decision 12, with the owner". Measured
reach 32.5x45 against a 44px floor, own box 31.1x20. **Nothing new appeared**,
on the nine or anywhere else.

### The nine, individually, because a clean result on a route nobody has measured is the claim worth checking

All eighteen runs answered HTTP 200 with 0 rows outside threshold and 0 console
errors:

| route | 375 | 1440 |
| --- | --- | --- |
| `?view=list` | 53 ok | 53 ok |
| `?view=list&signedin=1` | 63 ok | 63 ok |
| `?view=list&signedin=1&admin=1` | 60 ok | 60 ok |
| `?view=team&state=open` | 32 ok | 32 ok |
| `?view=team&state=open&team=3` | 23 ok | 23 ok |
| `?view=team&state=open&viewer=host` | 26 ok | 26 ok |
| `?view=team&state=live` | 22 ok | 22 ok |
| `?view=register&team=2` | 26 ok | 26 ok |
| `?view=tv&status=registration_open&field=22` | 24 ok | 24 ok |

**The ninth nearly went unaccounted for and that is worth writing down.** The
harness logs `?view=team&state=open&viewer=host` WITHOUT the `&team=3` the route
table carries, so an exact-string reconciliation against the route list finds
eight of nine and silently drops one. The check that caught it was arithmetic
rather than string matching: 5238 - 4560 = 678 new measurements over 18 new runs.
**Reconcile a spec list by count first, then by name.**

`console-errors` was 0 on all 312 blocks. 33 blocks report a "failed request",
almost all of them `net::ERR_ABORTED` on a SvelteKit `__data.json` prefetch, and
they are spread across long-standing routes (`/dev/pathways`, `/dev/marks`,
`/dev/themes`, `/dev/coin-desk`, `/dev/navigation`) as well as the tournament
ones. Pre-existing and not a threshold violation; recorded so the next reader
does not mistake it for something this bundle introduced.

**Only the measured region moved.** The static region already agreed with the
tree (156 specs, 67 routes, 95 `/dev` pages, 312 runs) and was not touched, which
is what it should do -- a branch that only adds a spec moves the static half, and
this bundle added none.

## Measured afterwards

- **`tests/derived-numbers.test.ts`: 18 passed.** Green.
- **Full suite: 344 files, 6760 tests, 0 failures, 341.66s.** The brief's stated
  baseline was 343 files with `derived-numbers` failing 2 tests; the extra file
  and its 9 tests are `tests/tournament-pair-recipients.test.ts`, which prompt
  0115 landed and `integrate.yml` swept in. 343 + 1 and 6751 + 9 reconcile
  exactly, so the suite grew for a known reason and not an unexplained one.
- **`svelte-check`: 0 errors / 37 warnings**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, in 20 files. The documented baseline, re-derived
  rather than read, with the two `PUBLIC_SUPABASE_*` placeholders exported before
  the sync -- without them a checkout with no `.env`, which is every cloud
  session, reports the documented 13 phantom errors.
- **`npm ci` did not rewrite `package-lock.json`** (`git diff --stat` empty).

## GATE 4, AND THERE ARE TWO SUBSTITUTIONS ON RECORD WHICH DO NOT GENERALISE

`node tools/deploy-probe.mjs`, run with and without `--ref origin/integration`,
both exit 1, verbatim:

    deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
    cannot be read. This is "cannot confirm", never "applied".

- **Ledger 0114's substitution** rests on its range holding NO migration, so
  there was nothing for gate 4 to prove. Available only while the range is empty.
- **Ledger 0115's, which this bundle inherits**, rests on Mr. Pina having applied
  `0192` BY HAND in the Supabase SQL editor on 2026-09-10 and reporting the
  migration's own verification query returning `members 10`,
  `entries_without_members 0`, `register_overloads 2`,
  `wide_form_has_no_defaults true`, `host_guard_admin_aware true`,
  `ledger_member_column true`, `anon_cannot_join true` -- every value matching
  that file's own expected set.

**This container cannot reach the production database and verified none of those
seven values.** They are a person's transcription, and the substitution is only
as good as that. A future bundle with a non-empty migration range and no such
report in its prompt has NEITHER substitution available, and the answer there is
to stop, as 0115 did.

## `integrate.yml` MERGES, PUSHES AND DELETES BEFORE IT RUNS THE SUITE

Recorded here, not fixed, because the next operations bundle will otherwise
rediscover it the slow way. Prompt 0115 established it against the workflow's own
comment, and this bundle is the consequence of it.

The sweep merges a green `claude/**` branch into `integration`, pushes
`integration`, deletes the branch, and only THEN runs the repository's suite on
the merged tree. The order is deliberate and the workflow says why: `npm ci` and
the suite are the two things most able to be killed from outside (an OOM kill, a
runner eviction, the six-hour cap), and running them first would discard a whole
sweep of individually fine merges.

**The consequence is that a red merged tree cannot stop a merge or a delete.**
`integration` keeps accepting work while red; the only signal is that the
Integrate RUN goes red, and a session looking for a standing branch as the signal
will not find one, because the branch is already deleted. That is exactly what
happened on 2026-09-09: run 34363724495 took prompt 0115's branch in, deleted it,
and then failed on the `derived-numbers` red this bundle has now cleared. It also
means a branch's own green CI says nothing about whether `integration` is green
after it lands.

## Not verified

- **The seven `0192` verification values.** Not reachable from here.
- **`prefers-reduced-motion`.** The harness runs with `no-preference`, so that
  path is not exercised on the nine or anywhere else.
- **Web-font metrics.** The harness blocks every non-loopback request, so
  `fonts.googleapis.com` never answers and every pixel figure above is in the
  FALLBACK stack, not the shipped faces.
- **Anything about the tournaments feature's behaviour.** This bundle measured
  those routes; it did not read or judge the code behind them, and owns none of
  it.
- **Signed-in production surfaces.** The harness covers `/dev` routes only.
