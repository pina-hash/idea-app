---
title: "A course code stops carrying a rotation number, so the Active Courses tile counts 2 instead of 4; the home feed's class card loses a third of its height and its assignment rows say how close a deadline is (`claude/classes-block-course-identity-twrmsn`, no migration)"
date: 2026-09-04
branches: [claude/classes-block-course-identity-twrmsn]
migrations: []
subsystems: ["Curriculum", "Classroom", "Home", "Coin Desk"]
---

Prompt 0027, from `origin/integration` at `98f00a8`. Three things, and the first
two were handed forward by prompt 0024 with measurements attached.

Files owned: `src/lib/curriculum.ts`, the hero course tile in
`src/routes/+page.svelte`, `src/lib/classroom/ClassroomFeed.svelte`,
`src/lib/classroom/feed.ts`, `src/routes/dev/home-order/**`,
`tests/curriculum*`, `tests/classroom-feed*`, the course-count rows in
`tests/home-order-and-accent.test.ts`,
`tools/browser-verify/routes/home-order*.mjs`, the generated regions in
`tools/browser-verify/README.md`, the ledger entry and this file. One edit
landed outside that list, deliberately, and is argued for below.

## The identifier was doing two jobs

`Section.course` held `IDEA 100-1`, `IDEA 100-2` and `IDEA 100-3` for the three
freshman sections. Those are three ROTATIONS of one course with the rotation
number written into the code, so `activeCourseCount()` -- a `Set` over that
field -- saw three courses where the pathway runs one, and the home page's
Active Courses tile read **4**. The three `IDEA 209H` sections all carried
`IDEA 209H` and always collapsed correctly, which is why the defect looked like
a counting bug and was not one: correct arithmetic over incorrect data.

The tree agreed with the prompt's claim about what distinguishes the three. All
three are `year: 1`, `yearLabel: 'Freshman'`, `title: 'Intro to IDEA'`,
`instructor: 'Pina'`, and differ only in `term` (T1, T2, T3). So the `-N` is a
rotation number, exactly as claimed.

What landed: `course` is now the course alone (`IDEA 100`), a new optional
`rotation?: number` records which pass through it a section is, and
`sectionCode(section)` is the ONE place the two are joined back into the printed
string. `activeCourseCount()`'s body is byte-identical and now answers 2.

**`rotation` is deliberately not derived from `term`,** even though they agree
1:1 today. A term says WHEN a section meets and a rotation says WHICH pass it
is; deriving one from the other would make a second rotation inside one
trimester unrepresentable for no reason anybody has stated. The two facts are
recorded separately and no test forces them to agree.

**`IDEA 209H` keeps one code across three sections, and that is correct.** The
first uniqueness assertion written here said every printed code must be unique
and FAILED on exactly that -- those three are three year bands of one offering,
distinguished by `year`. The assertion was rewritten to the real rule: no two
sections are indistinguishable on `(printed code, year, term)`. The failure was
the test being wrong, not the catalog.

### Every consumer of `course`, by name

`.course` appears about forty times under `src/`, and nearly all of them are a
DIFFERENT `course`: the `classroom_courses` embed on a live classroom section
row, which carries `.code`/`.title` and has nothing to do with `curriculum.ts`.
The real consumers of the curriculum field are four.

- **`activeCourseCount()`** (`curriculum.ts`). Unchanged, on purpose. The prompt
  said that if the arithmetic had to move, the data fix had not worked; it did
  not move. Its header now says so, so the next miscount is read as a data
  problem rather than a counting one.
- **`resolveSectionId()`** (`src/lib/feedback/console.ts`). Projects
  `course: section.course` and builds `` `${section.course}, period ${section.term}` ``.
  **Not edited.** The label already names the term, so `IDEA 100, period T1` is
  unambiguous -- arguably more correct than `IDEA 100-1, period T1`, which said
  the rotation twice. `tests/feedback-coverage.test.ts` compares against
  `REAL_SECTION?.course`, so both sides moved together and it stayed green.
- **`SectionManager.svelte`'s curriculum picker.** Renders
  `{c.course} — {c.title} ({c.yearLabel}, {termLabel(c)})`. **Not edited**, same
  reason: the term is already in the option text.
- **`sectionDisplayName()`** (`src/lib/coin-desk/sections.ts`). **Edited, and it
  is the one file outside the owned list.** It composes
  `` `${course} — ${title} (${yearLabel})` `` with no term and no rotation in it,
  so a bare `course` would render the three IDEA 100 rotations as three
  IDENTICAL rows. It feeds the coin desk's bulk-log and payout target pickers
  (`LogView`, `RolesManager`, `ContractsManager`, `SectionManager`), where an
  ambiguous label in front of an operator about to charge a class is how the
  wrong class gets charged. It calls `sectionCode()` now. The alternative was
  shipping the ambiguity and reporting it; that was judged worse than a one-line
  edit no in-flight branch touches. Reported rather than smuggled.

### Positive control

Reverting the data change alone (course values back to `IDEA 100-1/-2/-3`, in a
scratch copy) took the count back to **4**; restoring from a `cp` copy --
never `git checkout --`, per the standing rule -- returned it to **2**, md5
identical. Two further mutants against the tile: `courseCount = 4` and
`courseCount = 7` each reddened exactly one of the new rows in
`tests/home-order-and-accent.test.ts`, restored md5 identical.

`src/routes/+page.svelte` needed **no edit at all**. The tile already read
`activeCourseCount()`; the whole fix is in the data.

## The class card was the real scroll

Measured on `/dev/home-order` at 375px, before anything changed: a class card is
**595.6px**, and the first app card sits at **583px / 1365px / 1980px / 3212px**
(0.72 / 1.68 / 2.44 / 3.96 screens) for zero, one, two and four classes. The
per-class delta is **616px**, which reproduces 0024's figure exactly. My screen
figures run about 0.09 lower than 0024's because this measurement subtracts the
fixed harness strip; the deltas agree.

The inventory said almost all of it was one flex rule. `.assignment-left` was
`flex-wrap: wrap` and `.assignment-name` took the full 309px measure, so the
34px kind icon was pushed onto a line of its OWN above a two-line title:
`.assignment-left` alone was 85.6px of a 141.8px row. A row cost 142px at 375px
to carry a title and a date, against 60.6px at 1440px where nothing wrapped.

What changed, all of it inside `ClassroomFeed.svelte` (the shared
`.legacy-index` chrome in `src/app.css` is read by the archive page and every
other `.course-card` surface, so the geometry is now owned by this component in
its own scoped block and the shared rules keep the plate, the hover, the flag
tones and the badge):

- **The row is a grid.** `icon | name` over `icon | flag` at phone width, one
  line above 700px. The icon is still there and the title still gets two lines;
  it simply stops forcing a wrap. **142px -> 91px.**
- **The per-row `Open` chip is gone.** Every row in the ranked list is open by
  construction, so it was 12 identical words on a four-class student's page and
  none of them was actionable. Nothing was lost.
- **The header lost a line at phone width.** `.course-meta` was a third flex
  child that dropped below the code and title at 375px; the period badge and the
  count chip sit on the code's line now and the block/teacher line joins the
  title. **111.3px -> 79.4px.** Every field the header carried, it still
  carries: code, period, "N to do", title, block, teacher.

**Nothing was collapsed by default.** A student with one class would then have
to open it every single time, trading a scroll for a tap on the most common
case. The section order is untouched -- classes stay first for a student with a
class, which is 0024's decision and its reasoning still holds.

### After, same instrument

| classes | 375 before | 375 after | 1440 before | 1440 after |
| --- | --- | --- | --- | --- |
| 0 | 583px (0.72) | 583px (0.72) | 590px (0.73) | 590px (0.73) |
| 1 | 1365px (1.68) | **1181px (1.45)** | 1082px (1.33) | 1068px (1.31) |
| 2 | 1980px (2.44) | **1612px (1.98)** | 1429px (1.76) | 1400px (1.72) |
| 4 | 3212px (3.96) | **2474px (3.05)** | 2121px (2.61) | 2064px (2.54) |

Card 595.6 -> 411.3 at 375px, a 31% cut. The two-class target the prompt named
(under about two screens, against 0024's 2.53) is met at **1.98**. The empty
state is untouched at both widths, which is the control: the numbers that did
not move are the ones with no class card in them.

## Due-date urgency

`dueUrgency(entry, now)` in `feed.ts` returns `overdue | today | imminent |
soon`, or null. It reads the reason `buildFeed` already assigned and the SAME
`now` the component was handed -- honouring the constraint already written down
beside the `now` prop, that a component reading its own clock would silently
disagree with the feed it is rendering. `relativeDays` and `dueUrgency` now
share one `calendarDaysUntil`, so the emphasis on a row and the words on it
cannot name different days.

**The treatment is not colour, and could not be.** The flag's hue is already
spoken for by `reasonTone` (what the row IS, not how near it is); a reader who
cannot separate two hues gains nothing from a fifth; and `--crimson`, the one
token in this palette that reads as alarm, is reserved for LIVE/REC/error. So
three non-colour signals carry it:

- **Position** -- `compare()` already puts the soonest deadline first inside a
  rank and overdue above due-soon. Nothing had to be added.
- **Words** -- `feedIndicator` already writes the date out: "Overdue yesterday",
  "Due today", "Due tomorrow", "Due in 5 days". Nobody has to decode a mark.
- **Weight and a leading-edge marker** -- type steps up and the row takes an
  inset rule as the date closes. Inset `box-shadow` rather than `border-left`,
  so a row does not shift 3px sideways as a deadline crosses midnight, and a
  plain class rather than a `::before`, because Svelte prunes a scoped
  pseudo-element.

**`soon` is deliberately untreated.** It is the ordinary state of the whole
seven-day window, and a scale whose bottom step is already emphasised has no
room left to say "now". **Nothing implies a deadline is soft**: the steps change
only how loudly the same date is stated, and no wording, fading or
de-emphasis was added anywhere, `soon` included.

`DUE_IMMINENT_DAYS` is 2. It is a second number, not a second definition:
`DUE_SOON_DAYS` still decides whether a row appears at all.

## Tests

`tests/curriculum-course-identity.test.ts` (11) pins the RULE, never today's
catalog: no rotation suffix in a course value, a rotation recorded separately as
a positive integer, all-or-none plus distinct rotations within a course, no two
indistinguishable sections, the composition round-trip, and the count collapsing
rotations. One deliberate exception names the catalog -- the five strings that
used to be stored in `course` must still compose, because they are on handouts.
A retired section drops out of that check rather than reddening it.

`tests/classroom-feed-due-urgency.test.ts` (10) asserts every boundary from BOTH
sides: across the cut, then one minute back, with the answer required to change
and then not to. Four mutants against `feed.ts` proved the file bites -- the
imminent cut off by one (2 failed), the today cut removed (4), the reason gate
opened (1), and the clock read locally instead of from the caller (6). Restored
md5 identical, green.

Five course-count rows added to `tests/home-order-and-accent.test.ts`, read off
the RENDERED hero rather than by calling the function twice, with a positive
control that the catalog actually holds a multi-section course -- otherwise
"fewer courses than sections" could pass for an unrelated reason.

## Harness

`/dev/home-order` gains `?due=`, a comma-separated list of day offsets, one per
row. Without it the fixture dates row n at n days out, which reaches only
`imminent` and `soon` -- so a browser pass would have reported the treatment
working while the two steps that matter most had never rendered. Offsets land at
END of their calendar day, which is what makes offset 0 reachable at all
(`Date.now() + 0` is already past by the time the page paints, and ranks
overdue). The default path is byte-identical, because that is what the section
offsets above were measured against.

`tools/browser-verify/routes/home-order-role-student-classes-1-rows-4-due-1-0-1-5.mjs`
drives `?due=-1,0,1,5`. All 8 home-order route/width runs: **80 measurements, 0
outside threshold.**

**`orderResult` compares ARRAYS and only arrays.** Written first with joined
strings, all four rows printed values IDENTICAL to their expectations and were
still counted outside threshold -- a line that looks green in the report and can
never pass. They return arrays now. Worth knowing before writing the next one.

## Counts

Static region regenerated: **87 -> 88 specs, 174 -> 176 runs**. `routes` stays
44 because the new spec drives `/dev/home-order`, which the alias-resolved,
query-stripped count already held.

Measured region regenerated on a clean tree. Its four outside-threshold rows are
IDENTICAL BY IDENTITY to the pre-bundle block: `/dev/pathways` tap-target at
both widths, and horizontal-scroll on `/dev/coins-signedin-1` and `/dev/coins`
at 375. None of them is this bundle's, and none legitimately closed here --
prompts 0023 and 0025 are in flight on exactly those rows, and
`origin/claude/browser-harness-truthfulness-l4zk0b` and
`origin/claude/two-live-reachability-defects-2tajpx` both carry edits to
`pathways.mjs`, `coins.mjs` and `coins-signedin-1.mjs`.

## Verification

- `svelte-check`: **0 errors, 37 warnings**, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- the baseline
  exactly, re-derived after `svelte-kit sync` with the two public Supabase
  variables exported (a checkout with no `.env` otherwise reports 11 phantom
  errors).
- Full suite green. See the ledger and the session report for the file and test
  totals.
- Browser: 375 and 1440 through `tools/browser-verify` and through a scripted
  playwright pass over the same dev server, every figure above measured rather
  than described.

## Not verified

- **Nothing was checked against the live Supabase project.** `curriculum.ts` is
  hand-maintained metadata, no migration was written or permitted, and the local
  `.env` points at a placeholder project.
- **No signed-in surface was driven.** The coin desk pickers that
  `sectionDisplayName` feeds were read as source and reasoned about; they were
  not opened in a browser, because that needs a Bosco Tech Google session. The
  claim that they would have shown three identical rows is a reading of the
  format string, not a screenshot.
- **`prefers-reduced-motion: reduce` was not exercised.** The harness runs at
  `no-preference`. Nothing added here animates -- the urgency treatment is
  weight and a static inset rule -- so there is no motion path to gate, but the
  reduced-motion rendering was not measured.
- **Web fonts do not load in the harness** (non-loopback requests are blocked),
  so every text measurement above is in the fallback stack.
- **The two judgement calls are Mr. Pina's**, not settled by any number here:
  whether the shorter card still shows a student what they need, and whether the
  urgency treatment reads as urgent without reading as panic.

## Deferred

- **`URGENT_LIMIT` is still 6.** A card can therefore still carry six rows and
  about 590px at 375px. Lowering it would cut the worst case further and the
  `N more in this class` link is already there to absorb it, but it HIDES WORK,
  and the measured target was met without it. If it is ever lowered, it should
  be for a stated reason about how much a summary should hold, not as a height
  fix.
- **`sectionDisplayName`'s siblings were left alone.** The feedback console and
  the SectionManager option both stay on the bare `course` because they already
  print the term. If either ever drops its term, it needs `sectionCode()`.
- **No `rotation` value exists in the database.** The field is catalog metadata
  only; nothing stores or reads it server side, and `profiles.section_id` is
  still the id, untouched.
