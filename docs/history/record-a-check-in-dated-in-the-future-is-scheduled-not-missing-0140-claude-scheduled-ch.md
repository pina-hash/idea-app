---
title: "A check-in dated in the future is scheduled, not missing (`0140`, `claude/scheduled-checkin-future-status-vqlnpu`)"
date: 2026-08-27
branches: [claude/scheduled-checkin-future-status-vqlnpu]
migrations: ["0140"]
subsystems: ["Digital notebook"]
record_order: 162
---

Mr. Cosso lays out a unit's notebook check-ins on the first day of the unit. From
that moment his compliance grid reported every one of them, for every student, as
`missing` -- because `notebook_get_section_grid` decided a cell in three arms
(an entry, then an excusal, then `missing`) and a day nobody could have filed
against yet has none of the first two. Five scheduled days x thirty students is
150 cells of dash glyphs, a class-page badge reading 150 outstanding, every
student on the "needs a look" list, and a Documentation Check pre-filling a
presence score out of a denominator that counted days that had not happened.

**The student's half of the same defect was already fixed, and differently.** The
classroom section load bounds its check-in read with
`.lte('notebook_sessions.session_date', <today in America/Los_Angeles>)`, so a
student is never shown a future check-in and can never be told they owe it. That
asymmetry is deliberate and is now written into `CLAUDE.md`: **bounding the
teacher's read the same way would be wrong**, because a teacher SCHEDULES ahead
and a grid that hid what they had just scheduled would be hiding their own work
from them. The teacher's side gets a STATUS instead of a filter.

### The status, and the order of the arms

`0140` replaces `notebook_get_section_grid` with a version that declares
`v_today date := (pg_catalog.now() at time zone 'America/Los_Angeles')::date`
and inserts ONE arm into the cell `case`:

```
when l.id is not null           then l.status     -- an entry
when x.session_id is not null   then 'excused'    -- an excusal
when se.session_date > v_today  then 'scheduled'  -- 0140
else 'missing'
```

Each arm above `scheduled` outranks it for a stated reason. An ENTRY wins because
a student who filed early has filed it, and reporting "not due yet" over their own
work would be telling them the page did not count -- the same argument that
already put an entry above an excusal on this cell. An EXCUSAL wins because it is
a decision an instructor made about that student on that day (a field trip excused
three weeks ahead is a record worth keeping on screen), and neither state counts
against anybody, so nothing is lost by showing the one somebody chose.

**The calendar is America/Los_Angeles, which is the one `session_date` is already
adjudicated in** (`on_time` is
`(l.upload_timestamp at time zone 'America/Los_Angeles')::date <= se.session_date`,
0094/0098, and the student-side bound reads the same calendar in the loader). UTC
runs seven or eight hours ahead, so a UTC comparison would call tomorrow's
check-in due from 5pm Pacific onwards -- every evening, which is exactly when a
teacher sets up the next day. That is a smaller copy of the bug this file removes.
Asserted arithmetically at a pinned instant rather than left to the clock: at
8pm Pacific on 2026-08-27, the LA day is `2026-08-27` and the UTC day is
`2026-08-28`, so a check-in dated `2026-08-28` is `scheduled` under the shipped
rule and DUE under the rejected one.

**The migration is additive in the sense that matters for a hand-applied chain.**
The payload gains no key and loses none; one existing key gains one more possible
value, and `cellDisplay`'s `switch` already had a default arm. So there is no
deploy ordering between the SQL and the client, in either direction. The self-check
reports the LA day and how many check-ins and postings are dated ahead of it, which
is the count of cells that stopped reading `missing` the moment it ran.

### The seventh cell state, and the locked contract it had to join

`CheckInStatus` in `class-check-ins.ts` is the STUDENT's vocabulary and did not
change: the student read is date-bounded, so nothing on that side can produce a
future check-in, and a value with no producer is the dormant fallback this repo's
rules refuse. The grid's own vocabulary is `CellDisplay` in
`src/lib/notebook-review.ts`, and that is where the seventh value went:

- `GridCellStatus` and `CellDisplay` gain `'scheduled'`; `cellDisplay` maps it.
- `CELL_STATES` gains `{ key: 'scheduled', glyph: '»', label: 'Scheduled', hint: … }`,
  APPENDED after `missing` -- the far end of the same axis the row already walks.
- `SectionGrid.svelte` gains `.chip.scheduled, .cell.scheduled` with a DOTTED
  edge, the third fill style in the set (solid-with-a-pinned-fill, dashed,
  dotted), so the state does not lean on a new hue alone.
- `--nb-cell-scheduled` is declared on all three plates: `#7e60b3` on paper
  (`--violet` at hue 261.8 / saturation 35.5% held to the degree, lightness
  48.6% -> 54%) and `var(--violet-ink)` on both dark plates -- the token that
  exists precisely because the raw accent cannot carry text.

**Violet rather than a seventh shade of the existing six**, and the reason is
measured rather than aesthetic: the two states `scheduled` has to be tellable from
are `excused` and `missing`, which are already the two near-neutral sages, and
colors.css records that darkening BOTH of those onto white collapses them into
each other at CIEDE2000 1.19. A third neutral would have joined that collapse.

### The denominator, which is the half that was easy to miss

`summarize()` computed `total = grid.sessions.length`, so a scheduled day was in
every student's denominator: `covered < total` put a student who owes nothing on
the `attention` list, and `presenceScore` -- the pre-fill the Documentation Check
writes into a real rubric criterion -- was computed out of days that had not
happened. `total` is now derived FROM THE CELLS (`status === 'scheduled'` is
skipped and counted on its own `scheduled` line), which has two consequences worth
stating:

- **It reads no clock.** The RPC already decided which cells are scheduled, in the
  calendar it owns; a date comparison in this module would have been a second
  answer to the same question.
- **It is per student, not per section.** A student who filed EARLY against a
  future check-in has a cell carrying their entry rather than `scheduled`, so that
  day counts for them and not for the classmate who has not been asked yet. Their
  work is credited on the day they did it, which is the only reading that does not
  punish filing ahead.

`gridSummary.outstanding` needed no change at all, and that is the argument for its
shape: it is a WHITELIST sum (`late + pending_review + flagged + missing`), so a
seventh state joins `counts` and stays out of the total by not being named. A
denominator that shrank is explained rather than silent -- `presenceEvidence` and
the Documentation Check's own counts line both say "N not due yet".

### What was measured

- **The defect itself, against the deployed function.** `tests/notebook-scheduled-check-ins.test.ts`
  boots the chain SHORT of 0140, seeds a class through the real RPCs, and captures
  the pre-migration grid: 12 cells, 8 `missing`, `outstanding` 9, all three
  students on the attention list -- Ada included, who has filed every day that has
  arrived plus one that has not, with a presence pre-fill of 5 of 7. After the
  migration over the same data: `scheduled` 4, `missing` 4, `outstanding` 5, Ada
  off the list at 7 of 7. Exactly four cells changed, all `missing` -> `scheduled`,
  and the key set of the envelope, a cell, a student row and a session row is
  compared pre- to post- and is identical.
- **Contrast, in a real browser, on all three plates.** `/dev/notebook-review`
  driven through playwright-core (Chromium 141.0.7390.37) at 1440px, each ink
  painted over the ground its cell actually composites on and the pixel read back.
  `scheduled`: **4.99** light / **6.19** default (console register) / **5.80**
  IDEA, against the 4.5:1 a glyph has to make as text; the dotted edge reads the
  same figure in each case, well clear of the 3:1 a boundary carries. The six
  existing states came back at the figures colors.css already records (light 4.79 /
  4.80 / 4.87 / 4.75 / 4.82 / 8.64; dark 4.90 / 5.07 / 5.30 / 5.11 / 9.31 / 5.59),
  which is the control that says the instrument is reading what it thinks it is.
  Those figures are now written into all three plate blocks.
- **The glyph is really in the face.** `»` measures 8.64px in Share Tech Mono --
  the same monospace advance as `–`, `!` and `E` -- against 12.45px for a
  guaranteed-absent codepoint, so it is not tofu. `document.fonts.check` reports
  the face loaded (it is served from `@fontsource` over loopback; the harness's
  one blocked external request is a redundant Google Fonts link). The cell box
  measures 30.39px = 1.9rem at both 375 and 1440, and the locked density is
  untouched.
- **Mutation proof, in both directions**, each restored md5-identically:
  - `outstanding` += `counts.scheduled` -> 1 assertion reddens.
  - the `continue` removed from `summarize`'s scheduled arm (so it re-enters the
    denominator) -> 3 redden.
  - `>` -> `>=` in the migration, so `scheduled` swallows the day a check-in is
    FOR -> 8 redden. This is the direction that matters most: a class that is
    genuinely behind reading as caught up is as silent as the original defect.
  - `America/Los_Angeles` -> `UTC` in the migration -> 1 reddens (the source
    assertion). The behavioural discriminator did NOT bite, and could not: the
    run was at 08:09 Pacific / 15:09 UTC, where the two calendars agree. That is
    why the pinned-instant arithmetic assertion above exists.
  - The generalized locked-contract test re-mutated: reordering the original six
    reddens it, and dropping one plate's `--nb-cell-scheduled` declaration reddens
    the per-plate token sweep.
- **Full suite: 132 files / 3059 tests** (baseline 131 / 3030; +1 file and +26
  tests for the new file, +3 from generalizing one locked-contract assertion into
  four).
- **`svelte-check`: 0 errors / 37 warnings**, 31/5/1 -- unchanged.
- **`npm run verify:browser`: 18 route/width runs, 120 measurements, 2 outside
  threshold** -- both the pre-existing, unowned `/dev/pathways` harness-control
  tap target (194.7x26.2 at both widths). The harness does not cover
  `/dev/notebook-review`, which is why the grid was measured directly.

### An assertion that was generalized rather than deleted

`tests/notebook-review-console.test.ts` held
`expect(CELL_STATES.map(s => s.glyph)).toEqual([…six…]); expect(CELL_STATES).toHaveLength(6)`
under the title "keeps the six glyphs, in order, and adds no seventh". That is the
shape of test a legitimate change necessarily breaks, and the only choices it
offers are "delete me" or "don't ship it". It is now three assertions of the RULE:
the original six are pinned as the HEAD of the array (glyphs and keys, in order),
the seventh is named explicitly so an eighth is still a deliberate edit, and every
state must have a unique glyph, a unique key, a label, a hint, a `.cell.<key>` rule
and a `--nb-cell-*` token declared on all three plates. Both halves were re-mutated
to confirm they still bite.

### Reported, not changed: the student side could read off the same idea

The student-side bound HIDES a future check-in from the class stream entirely --
for a manager as well as a student, since the bound is on the shared load. Showing
it as upcoming is probably better than hiding it, and now that a scheduled state
exists both sides could read off one idea. What that would take, in order:

1. **`CheckInStatus` gains `'scheduled'`**, with a label ("Scheduled"), a tone
   (`muted`, the `excused` precedent -- a state that stops something counting), and
   an entry in `STATUS_LABELS` / `STATUS_TONES`. `isOutstanding` needs no change:
   it is a whitelist (`missing || draft || flagged`), the same shape that made
   `gridSummary.outstanding` free here.
2. **`checkInStatus()` gains a date input, or the loader decides.** This is the
   real design question and it is the one this bundle deliberately did not answer.
   The current comment on that function says it takes no clock ON PURPOSE, because
   a second idea of "is this due yet" -- one in the loader and one in the status
   function -- is the pair that stops agreeing. Two ways out: pass `through` (the
   loader's already-computed LA day) in as a parameter, so there is still ONE
   clock read and it is the loader's; or have the loader map the rows it already
   knows are future-dated to `status: 'scheduled'` before `checkInStatus` is
   consulted at all. The second keeps the pure function pure.
3. **`sectionCheckIns` drops the `.lte`** and gains nothing else -- the read is
   already ladder-shaped and the bound is one line. The long comment justifying
   the bound would have to be rewritten rather than deleted: it records a real
   failure (a student told in August that he owed work due in October) and the
   replacement has to explain why a rendered-but-not-counted row is safe where an
   unmarked one was not.
4. **`ClassView` and the check-in card need a visibly different treatment**, or
   this is worse than hiding: a scheduled check-in sorts to the TOP of the stream
   (the stream is newest-first by date and a future date is the newest thing
   there), which is where the original defect put it. Either it is toned and
   labelled so it cannot read as an obligation, or the merge has to stop putting
   a future row above today's work.
5. **`outstandingCheckIns` and the manager's `sectionOutstanding` need re-checking
   together.** The manager's badge already comes from `gridSummary`, which this
   bundle fixed; the student's comes from the array. Both would then be counting
   the same rows for the first time, which is a good thing and is also exactly
   where a discrepancy would show up.

Points 1, 3 and 5 are mechanical. Point 2 is a decision about where the clock
lives, and point 4 is a design question about a surface this bundle did not touch.

### What was NOT verified

- **The migration has NOT been applied.** No live Supabase project was touched,
  no `supabase db push` was run, and `SUPABASE_ACCESS_TOKEN` was never set. The
  file is applied by hand from the SQL editor after this merges.
- No production or preview deployment; nothing here was opened on `ideabosco.com`.
- No signed-in surface. The grid was driven through `/dev/notebook-review`, which
  is the dev harness mounting the real `ReviewConsole`; the real `/notebook/review`
  page needs a Bosco Tech Google session no automated run holds.
- `prefers-reduced-motion` is `no-preference` in the harness, so that path was not
  exercised. Nothing in this bundle animates.
- Web fonts: the browser harness blocks non-loopback requests, so the redundant
  Google Fonts link never resolved. Share Tech Mono itself DID load, from
  `@fontsource` over loopback, and was confirmed by advance-width measurement.
- `npm run build` was not run.
- **`src/lib/classroom/PeoplePanel.svelte` was deliberately left alone**, and its
  seventh tally glyph therefore inherits `--text-2` rather than naming a hue like
  the other six. It is readable (`--text-2` measures 6.91 / 5.88 / 5.51 on the
  three portal grounds, per `CLAUDE.md`) and carries its word and its glyph, so
  it meets the standard; it is one line of cosmetic inconsistency, left because
  two other sessions were live in the classroom tree.

---

