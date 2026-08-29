---
title: "Both sides of a scheduled check-in now read off one idea (`claude/classroom-checkin-scheduled-xwhxj2`)"
date: 2026-08-28
branches: [claude/classroom-checkin-scheduled-xwhxj2]
migrations: []
subsystems: ["Digital notebook", "IDEA Classroom"]
record_order: 166
---

No migration. `0140` had already given the TEACHER's grid a word for a check-in
dated ahead of today; this gives the STUDENT's class page the same word, and
deletes the date bound that had been standing in for it.

**The asymmetry, exactly.** A check-in a teacher scheduled for next month read
`scheduled` on the compliance grid and was ABSENT from the class page, for the
student and for the teacher alike, because the class load bounded its read with
`.lte('notebook_sessions.session_date', <LA today>)`. That bound was a real fix
for a real failure -- a student told in August that he owed work due in October,
in the attention tone, in the first row of his page -- and it was the best answer
available while there was no vocabulary for "not asked for yet". Once `0140`
minted one, the bound was doing to a student's page exactly what `0140`'s own
header refuses to do to the grid ("a grid that hid what they had just scheduled
would be hiding their own work from them"), and it was hiding a MANAGER's
scheduled check-in from the manager's own class page on the way past.

### The two decisions the previous session declined to make alone

**1. The clock lives in the loader.** `checkInStatus`'s comment said it takes no
clock ON PURPOSE and that is still right, so it gains a BOOLEAN rather than a
date: `+layout.server.ts` reads `new Date()` once, converts it through
`laCalendarDay` (moved out of the loader into `class-check-ins.ts`, where it is
importable and assertable), and asks `checkInIsScheduled(session_date, today)`
per row. Neither pure function reaches for a clock, so both are assertable at a
pinned instant; there is exactly one `new Date()` on the surface. The third
parameter is REQUIRED and not defaulted -- a default of `false` is the
pre-`0140` answer, so a caller that forgot would reproduce the defect with
nothing in the types to say so.

**2. A scheduled check-in renders BELOW everything actionable.** The stream is
newest-first and a future date is the newest thing on the page, so the existing
insertion walk would have put it in the FIRST row -- which is where the original
defect put it, and worse than hiding. `mergeCheckIns` therefore PARTITIONS: the
actionable check-ins go through the walk unchanged, and the scheduled ones are
appended. **The existing comparator did not need a second sort key**, because the
scheduled rows never enter the walk at all; what the block does need is a
direction of its own, and it runs SOONEST-FIRST. That is one rule rather than
two -- the page reads nearest-to-now first, and time runs both ways from today --
and the alternative puts the check-in furthest away directly under today's work
and the next one due at the very bottom, inverting the only thing an upcoming
list is read for.

### The precedence, which is `0140`'s precedence

`checkInStatus` was restructured (behaviour-identical when `scheduled` is false,
diffed case by case against the original) so its arms are the grid's arms in the
grid's order: **turned-in entry > excusal > scheduled > draft > missing.** An
entry wins because a student who filed EARLY has filed it. An excusal wins
because it is a decision an instructor made about that student on that day.
`scheduled` beats a DRAFT for the reason a draft already loses to an excusal --
nothing to count yet -- and for one that is decisive on its own: `isOutstanding`
counts a draft, so ranking the draft first would tell a student they owe a
check-in nobody has asked for, which is the whole defect in a narrower case.

`isOutstanding` needed no change, and that is the argument for its shape: it is a
WHITELIST, so a seventh state stays out of the total by not being named. The
student's badge is therefore the SAME NUMBER the date bound produced -- measured
at 2 with the scheduled row on the page -- which is the point of the bundle: the
fix moved from the read to the arithmetic and the count did not move with it.

### The word on the chip is not "Scheduled", deliberately

The class stream already renders an amber `.sched-chip` reading "Scheduled" on a
classroom ITEM, manager-only, meaning "students cannot see this yet". A check-in
dated ahead is the opposite claim: everybody can see it, and what has not
happened is the DUE DAY. So `STATUS_LABELS.scheduled` is **"Not due yet"**, the
way `draft` is "Draft, not turned in" rather than "Draft" -- the KEY is what the
two surfaces share, never the wording, and `STATUS_LABELS` and the grid's
`CELL_STATES` labels already differ for `missing` and everything else.

The tone is `muted` (the `excused` precedent: a state that stops something
counting must not wear the tone of one that asks for something), and
`ClassView`'s row takes `.upcoming`, which drops the cyan off the notebook glyph
so the whole row reads at the weight of the chip. Tone, label and position are
three signals of one thing and the row carries all three; the LINK stays, because
`0140` explicitly credits filing early and a door that is shut is not neutral.

### A manager carries exactly one status, and it is the one that is not about them

`status: null` for a manager is untouched as an argument -- a teacher files no
check-ins, so `filed`, `draft`, `flagged`, `awaiting_review` and `missing` are
questions they cannot have an answer to, and a card must not claim a state
assembled from somebody else's rows. `scheduled` is not one of those: it is a
comparison between a column and today, identical for everybody who loads the
page. So it is the one status a manager gets, and withholding it would be the
bound this bundle removed wearing a different hat.

### What was measured

- **The stream, in a real browser, at both widths and in both roles.**
  `/dev/classroom` (`?view=class` and `?view=class-teacher`) driven through
  playwright-core against the preinstalled Chromium at 375px and 1440px, with
  transitions frozen (never `animation`, per the standing note) and a 400ms
  settle. In all four runs the scheduled check-in "Final assembly photos" is the
  LAST row in the list -- student index 9 of 9, manager index 14 of 14 -- and
  an ITEM ("Shop tool reference", older than both actionable check-ins) sits
  BETWEEN the actionable check-ins and it, which is the positive control: only
  the scheduled row is swept down, the merge is otherwise untouched.
- **No horizontal overflow at either width**, in either role:
  `documentElement.scrollWidth` 375 vs `clientWidth` 375, and 1440 vs 1440.
- **Contrast, composited and read back rather than regexed.** The upcoming row's
  chip ink, glyph and meta line all resolve to `--text-2` `rgb(154,164,157)` on
  the row's real ground `rgb(16,19,18)`: **7.27:1**, against the 4.5:1 text
  carries. The chip's own edge keeps `--hairline` and is deliberately not
  measured -- `CLAUDE.md` names a static chip as decoration, and nothing about
  that changed here.
- **Tap targets.** The upcoming row's link measures 274x46px at 375 and 667x46px
  at 1440, above the 44px floor, and HIT-TESTS 15/15 at both widths across its
  full span (scrolled into view first -- an off-screen `elementFromPoint`
  returns null and reads exactly like a dead control).
- **The badge, which is the assertion the whole bundle turns on.** "2" at both
  widths with the scheduled row rendered: 1 missing + 1 flagged, and the
  scheduled one uncounted.
- **The only failed request in the run** is the redundant
  `fonts.googleapis.com` stylesheet, which this environment's proxy resets;
  `@fontsource` serves the real faces over loopback, as it did for `0140`.

### Mutation proof, in both directions, each restored md5-identically

Against `tests/classroom-feed-false-counts.test.ts` (14 tests), permissive
direction, `src/lib/classroom/class-check-ins.ts` restored from a pristine copy
and md5-checked after every one:

- `isOutstanding` gains `|| status === 'scheduled'` -> **1 reddens**. This is
  the "a scheduled check-in does not count" direction.
- `>` becomes `>=` in `checkInIsScheduled`, so `scheduled` swallows the day a
  check-in is FOR -> **5 redden**. This is the "a check-in dated today still
  counts" direction, and it is the one that matters most: a class genuinely
  behind reading as caught up is as silent as the defect being fixed.
- the `scheduled` arm dropped from `checkInStatus` -> **2 redden** (the future
  row falls through to `missing` and is counted again).
- the partition removed from `mergeCheckIns`, so a scheduled check-in is
  inserted by date -> **1 reddens** (it lands first, not last).
- `America/Los_Angeles` -> `UTC` in `laCalendarDay` -> **2 redden**.
- and in the loader, the manager's `scheduled` blanked back to `null` -> **1
  reddens**.

**The UTC mutation reddens here where `0140`'s did not**, and that is the point
of the new `describe` block: `0140`'s behavioural probe ran at 08:09 Pacific,
where the two calendars agree, so it could not bite. The assertions are pinned
at `2026-08-28T03:00:00Z` -- 8pm Pacific, LA day `2026-08-27`, UTC day
`2026-08-28` -- and spell out both the shipped answer (`scheduled`) and the
rejected one (`due`), with an 08:09 Pacific case beside them recording why the
wall clock is not the instrument.

- **Full suite: 134 files / 3101 tests**, against a 134 / 3096 baseline: +5
  tests and no new file. All five are in
  `tests/classroom-feed-false-counts.test.ts` -- its check-in `describe` goes
  from 3 tests to 5 (the future row is now asserted as read, named, uncounted
  and correctly placed, and the manager's copy of it is asserted separately) and
  a 3-test `describe` for the calendar is added beside it. No existing test in
  any file needed changing: `tests/classroom-notebook-checkins.test.ts` (40) and
  `tests/notebook-scheduled-check-ins.test.ts` (14) were both green untouched,
  which is the control saying `checkInStatus`'s restructure is
  behaviour-identical on everything that is not scheduled.
- **`svelte-check`: 0 errors, 37 warnings**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` -- the documented baseline, unmoved. Re-derived with
  the two placeholder `PUBLIC_SUPABASE_*` values exported before
  `svelte-kit sync`, per the standing note about a checkout with no `.env`. The
  new `.check-in-row.upcoming .kind-checkin` rule adds no unused selector.

### The dev harness, which my change made stale

`src/routes/dev/classroom/+page.svelte` is OUTSIDE the file list this bundle was
scoped to, and it was edited anyway, minimally and deliberately: its `asManager`
helper mirrors the class load's manager branch and would have blanked
`scheduled` back to null, so leaving it alone would have left the harness showing
a manager view the real loader no longer produces -- a harness that does not
mirror its mechanism proves nothing. The same edit adds one future-dated
check-in to `CHECK_INS['s-1']`, without which the state is unreachable in the
one place the repo's own standard says to verify it. **Its date is RELATIVE**
(`laCalendarDay(now + 30 days)`) where every other date in that fixture is
hardcoded, because a hardcoded future date lapses into the past and the harness
then silently stops showing the state it exists to show.

### Reported, not changed

`outstandingSessions` in `src/lib/notebook.ts` is the NOTEBOOK's own version of
this question ("a session with no turned-in entry against it") and it reads no
clock either. Whether the notebook's own surfaces show or hide a future check-in
was not examined and is not touched here; it is a different payload on a
different page, and the file is outside this bundle's scope.

### What was NOT verified

- No live Supabase project, no signed-in surface, no production or preview
  deployment. The placeholder `.env` convention was used and `.env` is not
  committed.
- No migration was written, applied or needed.
- `prefers-reduced-motion` is `no-preference` in the harness run, so that path
  was not exercised. Nothing in this bundle animates.
- Web fonts: the harness blocks non-loopback requests, so the redundant Google
  Fonts link never resolved and text was measured in the `@fontsource` faces
  served over loopback.
- `npm run build` was not run.
- This branch was not merged to `main` and nothing was force-pushed.

---

