---
title: "The hall pass tests that failed at midnight: a day-scoped fixture cannot be anchored to an age (`claude/hall-pass-wall-clock-test-xmetyb`)"
date: 2026-09-04
branches: [claude/hall-pass-wall-clock-test-xmetyb]
migrations: []
subsystems: ["Testing", "Classroom", "CI and workflows"]
---

Prompt 0036. One test file changed and nothing else. No migration, no `src/`, no surface a
person can open, so there is no Vercel preview to name.

## The base

Started from `origin/integration` at `332ba73`, which on 2026-09-04 was byte-identical to
`origin/main` at the same sha -- prompt 0034's integrate push had been discarded, so the two
refs had converged. Git already carried a committer identity in this container
(`Claude <noreply@anthropic.com>`), so nothing had to be set.

## What was broken, and it was the test

Six of the 24 tests in `tests/db/classroom-hall-pass-limits.test.ts` failed inside a window
around midnight Pacific and passed the rest of the day. The audit confirmed the product is
not at fault: `0174` and its RPCs were read and left untouched, and the file's own header
rule -- "THE CLOCK IS FAKED BY MOVING THE ROWS, NEVER BY MOVING `now()`" -- is right and is
still in force.

`0174` enforces three limits, read off the RPC rather than off the test:

| Limit | Computation | Scope |
| --- | --- | --- |
| `already_out` | `exists (... where student_email = caller and closed_at is null)`, any section | neither day nor age |
| `limit_reached` | `count(*) where (opened_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date`, per student per section, cap 3 | **day-scoped** |
| `cooldown` | `now() < max(closed_at) + 10 minutes`, per student per section | **age-scoped** |

The cap is asked **before** the cooldown, which the RPC's own comment explains ("at the cap
the cooldown is irrelevant and naming it would offer a time that will not help"). That order
turns out to be load-bearing for the fix and is written down in the test file now.

The fixture helper `tripAgo(user, section, minutesAgo)` backdated a completed trip by
60 to 120 minutes. For an age-scoped assertion that is exactly right: an interval is the
same interval on every calendar. For a day-scoped assertion it is not a statement about a
day at all, and in the first two hours of every Los Angeles day it lands on **yesterday**, so
`used_today` read 0, the cap was never reached, and every assertion resting on it failed.

## Moving the clock, which was the hard half

The container permits `date -s` (it holds `CAP_SYS_TIME`, or is a microVM), so the whole
run's clock was moved and the embedded Postgres picked it up: `now()` is the system clock and
nothing had to be stubbed. `libfaketime` is not installed and was not needed.

The restore is exact rather than approximate: real time is recovered from `/proc/uptime`,
which is `CLOCK_BOOTTIME` and which `date -s` does not touch, so the true instant is
`anchor_epoch + (uptime_now - uptime_at_anchor)`. The helper lives in the session scratchpad
and is deliberately **not** committed -- it manipulates the machine, not the repository, and
a script in `tests/` that sets the system clock is a footgun for anyone who runs the suite.

One trap worth recording: `TZ=America/Los_Angeles date -d "<t>" -u` does **not** parse in
`TZ`. `-u` forces UTC for parsing as well as for output, so the first version of the helper
silently did not move the clock at all and the first "reproduction" run came back green.
Parse to an epoch with `TZ=... date -d "<t>" +%s` and set that.

### The measured window

Runs of the file at fixed Pacific instants, before the fix:

| LA local time | Result |
| --- | --- |
| 00:05 | 6 failed / 18 passed |
| 00:30 | 6 failed / 18 passed |
| 01:00 | 6 failed / 18 passed |
| 01:30 | 2 failed / 22 passed |
| 02:05 | 24 passed |
| 12:00 | 24 passed |
| 23:00 | 24 passed |
| 23:30 | 24 passed |

**The ledger's "roughly 23:00 to 01:00" is wrong and the tree wins: the window is 00:00 to
02:00 Pacific, entirely after midnight.** It is exactly the deepest backdate in the file --
`tripAgo(..., 120)` -- so the last failure clears at 02:00. The 01:30 reading is the proof of
the mechanism rather than a curiosity: only the two tests backdating 90 minutes or more were
still failing there.

## The fix

The classification is the fix, and it is now visible in the file rather than implied.
`tripAgo` keeps its name, its behaviour and its callers among the **age-scoped** tests, and
its docstring now says it is not the helper for the cap. A second helper, `tripsToday(user,
section, count)`, serves the **day-scoped** tests: it leaves `count` complete trips on
today's Los Angeles calendar day at every hour.

Three things about it are decisions rather than details:

- **The trips are built first and placed afterwards, in one statement, and that order is
  forced.** Each `open` has to clear the cooldown the previous `close` left, so the build
  reuses `tripAgo`'s wide backdate to get the rows made at all; only then does a single
  `update` re-anchor every row into today. Placing them one at a time would leave the last
  close a minute old and the next `open` would be refused with `cooldown` -- in exactly the
  hours the helper exists for.
- **The slots are fractions of the day that has already happened**, `k / (count + 1)` of
  `now() - LA midnight`, so they are strictly after midnight, strictly before now, distinct
  and ordered oldest-first at 00:00:03 as much as at noon. Verified there.
- **The fixture checks itself.** After placing, it reads back the row count, how many are on
  today's LA day at both ends, how many are distinct, and how many are in the past, and
  asserts all four equal `count`. A fixture that quietly misses the day it was aiming for is
  the whole defect being replaced, and it previously surfaced as an assertion about the
  *product* failing. Now the fixture says so first, and says it at whatever hour it is.

Within the first minutes of the LA day a trip cannot also be older than the cooldown --
there is not that much day yet -- so a caller that then opens reads `limit_reached` on the
strength of the cap being asked before the cooldown. That was already true of `0174` and is
now stated beside the helper instead of being relied on silently.

None of the four wrong answers was taken: nothing is skipped near midnight, no window was
widened, no timezone was pinned, and `now()` is not stubbed.

## The test at the day boundary, which failed at the day boundary

`the window is the America/Los_Angeles day, at an instant where UTC disagrees` was the most
pointed failure, and the mechanism is not the irony. **Its instrument was never broken.** The
instrument moves every row to yesterday 20:00 Pacific, which is today 03:00 UTC, so the two
calendars disagree about the row; that construction is anchored to the LA day itself and is
unambiguously yesterday, in the past, at every hour and on both DST transition days. Its
three instrument assertions hold at every hour by construction.

What failed was the **precondition**, four lines above it: the test has to reach the cap
before it can prove that moving the rows to yesterday releases it, and that setup was
`tripAgo(..., 60 + i * 10)`. In the first eighty minutes of the LA day those rows were
already yesterday, so the cap was never reached, and the test died on
`expect(...).toMatchObject({ reason: 'limit_reached' })` before its own instrument ever ran.
A test about the day boundary was defeated by a fixture that could not say which day it was
on -- which is the same sentence as the rest of this entry, one level in.

The comment now says so at the call site, so the next reader of a failure there knows which
half to look at.

## Verification

All times America/Los_Angeles.

- **Every hour of the day, on the hour:17, after the fix: 24 passed / 24, all 24 hours.**
- Extra positions, all 24/24: 00:00:03, 00:00:20, 00:01, 00:30, 01:30, 23:30, 12:00.
- Both DST transition days, all 24/24: 2026-11-01 01:30 PDT and 02:30 PST (the repeated
  hour), 2027-03-14 00:40 PST and 03:05 PDT.
- **Full suite at three clock positions, 260 files / 5419 tests passed each time**: 17:51
  (the real time), 23:50, and 00:20. The midnight run is also the evidence for the sweep
  below -- no other file in the suite is hour-dependent.
- `npm run check`: **0 errors, 37 warnings**, breakdown 31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class`, re-derived after
  `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported. Run at 17:55.
- `tests/derived-numbers.test.ts` run on its own: 10 passed. No route spec and no
  `src/routes/dev/` directory was added, and this confirms it rather than assuming it.

### Control 1: the defect returns

The pre-fix file was restored from a `cp` copy (md5 `65270f61...`, matching HEAD) and run at
the midnight position: **the same six failures came back, by name**, at 00:30, and the same
file passed 24/24 at 12:00. The reproduction reproduces the real defect. The fixed file was
then restored from its own `cp` copy and md5-checked identical.

### Control 2: the tests still bite when the product is wrong

`0174` is read-only to this bundle, so it was mutated in the working tree from a `cp`
pristine copy (md5 `f75ca8f2...`) and restored to that md5, with `git status supabase/` clean
afterwards. Both mutations are in the permissive direction.

- **`v_used >= v_cap` to `v_used > v_cap`** (the cap becomes 4): **5 failed / 19 passed at
  00:30, at 23:30 and at 12:00** -- the identical result at all three, which is the point. A
  fixture that always lands on today is still able to fail.
- **the cap counts the UTC day instead of the LA day**: caught at all three positions. At
  00:30 and 12:00 it is the one named instrument test that reddens, which is exactly the test
  written for it; at 23:30 five reddened, because UTC is already tomorrow there. Before this
  bundle that instrument was failing at midnight for its own broken reason and could not have
  reported this.

### Not verified

No browser pass and none applicable: this bundle ships no surface. Nothing was run against
the live Supabase project, no migration was applied anywhere, and no signed-in session was
exercised. The `0174` mutations were run against the embedded-Postgres harness only.

## Other fixtures positioned relative to `now()` with a day-scoped assertion

This is the A5 sweep, and it is a report: this bundle owns only the hall pass file. Nothing
else in the suite needs a change today, and the full-suite run at 00:20 Pacific above is the
behavioural check on that conclusion.

- `tests/classroom-feed-false-counts.test.ts` -- **the right shape, and worth copying.** Its
  `laDay(offsetDays)` takes `Date.now() + offsetDays * 86_400_000` and then formats it
  through `toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })`, so the value it
  produces *is* an LA calendar day rather than an interval that has to land on one. The only
  residual is a DST day, where 86,400,000 ms is not one LA calendar day; on a 23-hour day a
  `laDay(-1)` computed in the small hours can name the same day twice. Narrow, and untested
  either way.
- `tests/notebook-scheduled-check-ins.test.ts` -- safe, and safe for the reason this bundle
  is about: it computes its dates from the **database's own** LA day,
  `(now() at time zone 'America/Los_Angeles')::date ± n`, so the fixture and the function
  under test read one clock.
- `tests/notebook-section-reviewer-tier.test.ts` -- safe, same construction
  (`(now() at time zone 'America/Los_Angeles')::date - 1`).
- `tests/classroom-notebook-checkins.test.ts` -- safe, and it had already learned this lesson
  one unit up: its header requires every fixture date to be a **fixed past date**, on the
  stated grounds that dates only recede. It points at `classroom-feed-false-counts` for the
  cases that must be relative.
- `tests/coin-legacy-import.test.ts` -- safe. Absolute dates, LA-converted.
- `tests/gauntlet-target-disclosure.test.ts`, `tests/notebook-note-delete.test.ts`,
  `tests/classroom-decks.test.ts`, `tests/coin-public-surface-hardening.test.ts`,
  `tests/feedback-anonymous.test.ts`, `tests/foundry-telemetry.test.ts`,
  `tests/gauntlet-admin-set-returning-projection.test.ts`,
  `tests/gauntlet-practice-meter.test.ts`, `tests/notebook-note-coalesce.test.ts` -- all
  position fixtures relative to `now()`, and every assertion they feed is age-scoped (an
  expiry, a retention window, a 30-day cutoff, a coalescing interval). An age may sit
  anywhere on a calendar, which is the whole distinction this bundle draws.

## Could this have been caught earlier

Yes, and cheaply. The file has been in the tree since prompt 0016 and passed every CI run
until one happened to fall after 23:00 Pacific -- which is not luck about the code, it is a
sampling schedule. A run pinned to a fixed hour inside 00:00-02:00 Pacific would have found
it on its first execution, and the repository **already has a nightly run on `integration`**,
so the instrument exists and only its schedule is a choice. Pointing that nightly at, say,
01:00 Pacific would have caught this the night 0174 landed. That is a change to
`.github/workflows/`, which this bundle does not own; it is raised, not made.

The more general version, and the cheaper one: the defect class is **a fixture positioned
relative to `now()` feeding an assertion scoped to a calendar day**, and the whole suite can
be put to a midnight clock in about three and a half minutes, as it was here.
