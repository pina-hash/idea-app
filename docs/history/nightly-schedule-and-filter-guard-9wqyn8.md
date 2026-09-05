---
title: "The nightly moves into the two hours a day-boundary defect is visible in, and the CI query is guarded where it lives rather than where the string appears (`claude/land-item-images-ci-filter-9wqyn8`, second bundle, no migration)"
date: 2026-09-05
branches: [claude/land-item-images-ci-filter-9wqyn8]
migrations: []
subsystems: ["CI and integration", "Testing"]
---

Prompt 0040. Two things. The first is a schedule; the second is a hole that the
guard written one bundle earlier left open, and which was driven rather than
imagined.

**On the filename.** The convention is the branch slug, and it is collision-free
because a branch name cannot be taken twice. The harness reused this one: the
0037 bundle already wrote `docs/history/land-item-images-ci-filter-9wqyn8.md`,
which is on `integration` and is not this bundle's to edit. So this entry keeps
the branch's unique token and names its own subject. The convention held; the
assumption underneath it did not.

## The hour

`ci.yml`'s nightly on `integration` was `30 4 * * *`. GitHub cron is UTC and
does not shift with daylight saving, so **one entry lands on two local hours
across the year** and any hour has that property. `30 4` is **21:30 Pacific in
summer and 20:30 in winter** -- computed, not assumed; the file's own comment
named only the summer one, which is how a reader could think it had been checked
against both.

Prompt 0036 measured a window: six of the 24 tests in
`tests/db/classroom-hall-pass-limits.test.ts` fail **only between 00:00 and
02:00 America/Los_Angeles**, because the fixtures backdate up to 120 minutes and
land on the previous LA calendar day. That file had been in the tree since
prompt 0016 and passed every CI run for weeks. It surfaced because a person
happened to re-run a branch at 00:58. The old nightly has never once run inside
that window.

It is now **`0 8 * * *`: 01:00 PDT and 00:00 PST**. One entry, both halves of the
year, and the arithmetic says one is enough:

- **UTC [08:00, 09:00) is the entire intersection** of "inside the window in
  daylight time" and "inside the window in standard time". Enumerated over every
  quarter-hour of the day. Anything outside it covers at most half the year, so
  two cron entries are not needed and would not be better.
- **The MINUTE comes from 0036's own table, not from taste.** Detection degrades
  across the window: 6 failures at 00:05, 00:30 and 01:00; **2** at 01:30 (only
  the tests backdating 90 minutes or more); **0** at 02:05. `0 8` is the latest
  minute at which BOTH local hours sit at or before the last full-strength
  reading. `30 8` is inside the window and catches two of the six -- worse than
  it looks, because the other four report as passes.
- **The top of the hour is GitHub's worst slot for scheduler delay, and that is
  accepted deliberately.** A delay moves the run later, which in winter goes
  deeper into the window and in summer degrades toward the still-detecting 01:30
  reading. Moving the cron later to dodge the queue would cost summer detection
  immediately and unconditionally. The wrong direction to optimise.

## The trade, where the prompt's premise turned out to be wrong

The prompt framed it as: catching this defect class costs a red `integration` at
an hour nobody is watching, which blocks the automatic deploy, and asked whether
that is worth it. **The premise does not hold, and the tree is what says so.**

`deploy.yml` does not read the nightly's conclusion. It carries
`uses: ./.github/workflows/ci.yml` on `integration`'s exact resolved sha, in its
own run, and its own comment says why: "A prior conclusion is a claim about a sha
that may no longer be the tip." A scheduled CI run also does not start an
Integrate sweep (`integrate.yml`'s job-level `if` requires
`workflow_run.event == 'push'`) and cannot enter the sweep's per-branch query,
which asks about `claude/**` branches by name while a scheduled run's head branch
is `integration`. So **a red nightly blocks nothing automatic. It is a pure
signal.**

Which makes the answer yes, and for a stronger reason than the one offered:
**the deploy was already the more dangerous detector of this exact defect
class.** Its own CI call runs at 03:00 PDT and **02:00 PST** -- in winter, exactly
the window's upper edge. A defect of this shape would have failed the *deploy*,
intermittently, in winter only, at an hour nobody is watching, with nothing
saying why. Moving the CI nightly to 08:00 UTC puts it **two hours ahead of the
deploy in both halves of the year**, so the signal arrives first, separately, and
labelled.

**And the nightly will be green, which was measured rather than hoped.** The risk
of pointing a nightly into a window where a defect class lives is that something
else in the suite has the same defect and `integration` goes red every night from
the moment this reaches `main`. The system clock was moved (the container permits
`date -s`; `libfaketime` is not installed) and the **whole suite** was run at
**00:30 Pacific: 261 files, 5457 tests, all passing**, in 212.9s. The hall-pass
file alone was also run at 01:00 and 00:15 Pacific -- the new cron's own two
hours -- 24/24 both times, confirming 0036's fix holds exactly where this points.
Real time was restored from `/proc/uptime` (`CLOCK_BOOTTIME`, which `date -s`
does not touch) to **0.0s drift**.

## The guard, and the hole it closes was driven first

Prompt 0037 removed `-f event=push` from the sweep's CI query and left four
assertions behind. They are **asymmetric**, and nobody noticed:

- the NEGATIVE assertion (no `-f event=` on the query) excludes comment lines,
  deliberately, because the prose above `ci_conclusion` legitimately spells
  `event=push` while explaining why it is gone;
- the three POSITIVE assertions were plain `toContain` **over the whole file**.

So the security property could be deleted from the function outright and the
suite stayed green. Driven before a line was written: remove
`| select(.head_sha == $sha)` from the jq program, add
`# historical note: this used to say select(.head_sha == $sha)` in its place, run
`npm test` -- **37 passed**. A guard a tidy-up can satisfy by writing prose is not
a guard.

Five properties are now asserted against the **cut region with comments
stripped** -- the same characters `tools/integrate-gate-proof.sh` sources and
runs, cut at the marker name read from `CUTTABLE_GATES` rather than retyped:

| property | what it is for |
| --- | --- |
| `select(.head_sha == $sha)` | a green run against a different commit authorises nothing |
| `select(.head_repository.full_name == $repo)` | the fork guard `event=push` was providing by accident |
| `sort_by(.run_number) \| last` | one sha carries a red run and the green re-run that fixed it, in both orders |
| `.workflow_runs // []` | fails closed on a 404 or rate-limit body instead of aborting under `pipefail` |
| `\|\| printf 'unknown\n'` | fails closed when jq refuses the input at all |

A second test pins that the proof harness still carries the **12 `check_ci`
cases** proving those verdicts -- because that harness is invoked by **no
workflow, no npm script and not by `tools/run-tests.mjs`**, swept here rather
than asserted from memory, so it runs only when a person types it and a deleted
case is otherwise invisible. It asserts the cases EXIST, never their verdicts;
restating a verdict would be a second copy of the rule.

A third pins the cron, **deriving both local hours from it** through
`Intl.DateTimeFormat` rather than restating them, with the retired `30 4` as the
negative control. Before this, **nothing in the suite pinned any cron, trigger or
schedule in any workflow** -- the hour was a bare string one tidy-up away from
being rounded to something neat, with the cost invisible from the file.

## Controls

Nine, each reddening **only** its own assertion, every file restored
md5-identically from a `cp` copy (never `git checkout --`):

| mutation | reddens |
| --- | --- |
| `-f event=push` back on the query line | the trigger-filter test (+ the force-push fixture, correctly: it asserts the fixture is a real line of the file) |
| sha match smuggled into a comment | the guarded-where-it-lives test alone |
| fork guard smuggled into a comment | same, alone |
| `sort_by(.run_number)` dropped | same, alone |
| `.workflow_runs // []` reverted | same, alone |
| the jq fallback removed | same, alone |
| cron back to `30 4` | the nightly-window test alone |
| cron to `30 8` (in the window, past 01:00) | the nightly-window test alone |
| a `check_ci` case deleted | the harness-cases test alone |

**Two controls caught their own fixtures**, which is worth recording because a
control that only ever fails on its own scaffolding proves nothing about the
guard. The smuggle loop first built its mutation from the RAW region, which for
two of the five needles deletes the copy sitting in the region's prose and leaves
the code untouched; it is built from the code side now. And the comment-strip
proof first named `event=push` as a phrase that should vanish -- **wrong**: that
phrase lives in the long comment ABOVE the marker, not inside the cut. It is
synthetic now, so rewording the prose cannot break it.

## Verified

- Suite **261 files / 5457 tests, all passing**, twice: at **18:31 PDT** and
  again at **00:30 PDT** with the clock moved.
- `svelte-check` **0 errors, 37 warnings**, breakdown **31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`**, re-derived rather than trusted, with the two
  placeholder `PUBLIC_SUPABASE_*` values exported before the sync.
- `tests/derived-numbers.test.ts` **10/10** and `verify:counts --check` agrees
  with the tree, so no counts regeneration was needed -- run rather than assumed,
  as the prompt asked.
- `.github/workflows/integrate.yml` and `deploy.yml` are **byte-identical to
  HEAD**, confirmed by `git diff --quiet`. Prompts 0035 and 0037 have work on
  `integration` in the first of those and a third edit racing them is how it gets
  lost.

## Not verified

- **No CI run under the new cron has happened**, and none can until this reaches
  `main`: GitHub reads `schedule` from the DEFAULT branch only. `main` is at
  `332ba73` and `integration` is ahead of it, so today's nightly is still `30 4`
  from `main`'s copy. The first run at the new hour is the first 08:00 UTC after
  a deploy lands this on `main`.
- **The `gh api` call itself** is still unproved end to end, unchanged from 0037:
  the harness proves the decision against fixture payloads and this file asserts
  the parameters off the source, but nothing here makes the call.
- No browser, no Supabase stack, no migration. What this bundle needed was
  `npm ci`, node/vitest, and `date -s`.

## Deferred

- **`tools/integrate-gate-proof.sh` is owned by this bundle and was not
  changed.** Its cases already existed; what was missing was anything in CI
  noticing if they went, which is now a test. Editing a file because it is owned
  is scope creep.
- **The harness still is not run by CI**, and that is now asserted rather than
  merely true. Wiring it in is a real option and a real cost -- it builds
  throwaway git repositories and copies ~13MB of the tree per fixture -- so it
  belongs in a bundle that can measure the added CI minutes, not in this one.
  The day somebody does it, the sweep in `tests/workflows.test.ts` reddens and
  says which paragraph to rewrite.
- **The defect class is wider than the one file.** 0036 named it: a fixture
  positioned relative to `now()` feeding an assertion scoped to a calendar day.
  The whole suite passing at 00:30 says none of the others has it *today*; the
  nightly is what says so tomorrow.
