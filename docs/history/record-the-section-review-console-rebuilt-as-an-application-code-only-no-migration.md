---
title: "The section review console, rebuilt as an application (code-only; NO migration)"
date: 2026-08-20
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 89
---

No SQL. It is the client half of `0121`: the acknowledgement that migration
added is now something an instructor can actually record, and the console it is
recorded from is a screen you can review a whole class on without scrolling.

### The measured problem

Reviewing one student was: click the cell, read a photograph rendered at full
column width in a pane the shell caps at 21-27rem, click a verdict, click the
next cell. Measured on the dev harness at 1440x900 with one entry open, the
console was **2082px tall against a 900px viewport -- 1182px of page scroll**,
the compliance grid started at y=1050 (150px below the fold, so the grid was not
even on the first screen), and the Documentation Check panel began at y=1935.
Grading a unit therefore meant scrolling past the entire roster, and the grid was
completely off screen by the time the panel you were grading from was in view.

And the middle click could not record approval at all: `EntryReview` rendered
"Accept it" only when `entry.status !== 'compliant'`, so the only action offered
on a compliant entry was Flag.

### What shipped

- **One bar, three modes.** Everything that used to stack above the grid -- the
  hero, the two pickers, the whole check-in manager -- is either in a single bar
  or is a mode: **Review**, **Check-ins**, **Grade unit**. Every row above the
  grid was a row of the grid that was not on screen.
- **A cursor you walk with the keyboard.** Arrows move between students and
  check-ins, the entry beside the grid follows, `A` acknowledges and advances to
  the next student down the same column who needs it, `F` opens the flag control
  and focuses the reason, `Enter` opens the page full screen, `Esc` closes. The
  keys are printed in the bar from the SAME array the handler dispatches from.
- **A panel that decides rather than reads.** Page thumbnails in a strip that
  open the existing full-screen viewer; the notes behind a disclosure; the flag
  form behind a disclosure; the danger zone behind a third.
- **Live updates**, per section, through an injected `subscribe` transport.
- **`ClassSplit` gained three knobs** rather than growing a second split:
  `scroll="fill"`, `detailWidth="roomy"`, `narrow="stack-nav-first"`, plus the
  `.cr-app` / `.cr-app-body` application frame in `split.css`.

### The load-bearing decisions

- **THE DOCUMENTATION CHECK IS A MODE, not a tab in the detail pane and not a
  third column.** It is a per-student table of four rubric criteria; in a 34rem
  detail pane it would be exactly the cramped surface this rebuild exists to
  remove, and a third column would take the width the grid needs to show eight
  check-ins without a horizontal bar. The brief's actual requirement is that it
  is reachable WITHOUT SCROLLING PAST THE GRID, and a mode button in the bar is
  one click from any scroll position at any width. It also fixed the same
  complaint one layer up: the check-in manager used to sit above the grid and
  pushed it off the first screen on every single load.

- **`scroll="fill"` NAMES NO VIEWPORT HEIGHT, and that is the whole point.** The
  shell's default pane geometry is `100vh - --cr-chrome-h`, and `page-flow`
  exists because that constant cannot be kept true -- it is wrong by a DIFFERENT
  amount per surface and per state. `fill` bounds the panes at 100% of whatever
  box the caller put the split in; the caller's half of the contract is
  `.cr-app`, a flex column whose bar measures itself and whose body takes the
  rest. A hero that wraps or a notice that appears costs the body a row instead
  of putting the page into a second scrollbar. NotebookView keeps `page`: it is
  mounted inside the classroom's own shell on view-as and genuinely cannot bound
  itself.

- **`hasDetail` IS ALWAYS TRUE, which forced a new narrow variant.** The detail
  pane always holds something -- an entry, or a line naming the empty cell the
  cursor is on -- because a pane that appears and disappears as the cursor
  crosses empty cells would re-lay the grid out on every arrow press, and early
  in a term most cells are empty. Under `narrow="swap"` that always-true flag
  hid the grid behind a placeholder at 375px the moment the page loaded, so
  `stack-nav-first` ships: both panes, navigation first. Caught by measuring at
  375, not by reasoning.

- **EVERY CELL IS A CURSOR STOP, including the empty ones.** They used to render
  as inert text, which is right for a mouse and wrong for a cursor: a student who
  has filed nothing is exactly who an instructor is looking for. Opening one
  shows what the console knows rather than leaving the previous student's entry
  beside the wrong name.

- **THE KEYS LISTEN ON THE WINDOW**, with three guards: not while somebody is
  typing (`isTypingTarget`), not while a modal `<dialog>` is open (the photo
  viewer has its own keys), and only in review mode. On the grid alone the loop
  would stop at the pane boundary -- an instructor who has just clicked Accept
  has focus in the panel, and the next arrow has to work from there.

- **FOCUS FOLLOWS THE CURSOR ONLY WHEN THE GRID ALREADY HAS IT** (or when
  nothing has focus at all, so a cold arrow press still lands). That condition is
  what makes a live update harmless: a refetch re-runs the same effect, and if
  the instructor is typing a comment or reading a photograph full screen, nothing
  may move.

- **THE ROW THE INSTRUCTOR IS ON DOES NOT MOVE.** A live insert above the cursor
  pushes everything below it down a row. The cursor cell's viewport position is
  measured in `$effect.pre` (the only moment the old position still exists) and
  the scroller is nudged by the difference afterwards. Measured: with a
  scrollable grid the cursor moved **0px** across an insert above it. Where the
  grid is too short to scroll there is no offset to give back and the row moves
  by one row height (measured: 18px of a 42px row, which was all the scroll that
  existed); nothing but a scroll can absorb that.

- **REALTIME CARRIES NO PAYLOAD.** The transport's handler takes no arguments, so
  "apply this row" is unrepresentable rather than discouraged: a change means
  re-read the grid through the same RPC the page loaded with. Two instructors
  working the same section converge on what the database says instead of each
  patching a local copy from events that can arrive out of order. Debounced at
  250ms, because one student filing an entry with four photos is five row events
  inside a second.

- **ONLY ONE OF THE THREE TABLES CAN CARRY A FILTER**, and that is the schema
  rather than an omission. `notebook_entries` has `section_id`. Photos and notes
  hang off the ENTRY and have no section column, and a Realtime filter is a
  comparison on the row itself. So those two arrive for every row the caller may
  READ, which RLS has already narrowed to the students of the sections they
  teach: at worst a photo filed in their period 4 costs their period 2 grid one
  debounced re-read.

- **THE PANEL IS `{#key}`ed ON THE ENTRY ID**, and the id-watching `$effect` that
  used to reset it is gone. Two guarantees in one mechanism: moving to another
  student destroys the half-typed comment with the panel, and a live reload of
  the SAME entry keeps the key, so an update arriving mid-sentence does not throw
  the sentence away. An effect could not tell those two apart.

- **`gridReviewReady` reads the CAPABILITY OFF THE PAYLOAD.** 0121 is applied by
  hand, so a deploy between 0120 and 0121 is a real state. `cellReviewed` is the
  ONE reader of the raw field and collapses both "no entry" and "no such column"
  to null, so a missing key can never render as a to-do mark on every cell in the
  class.

- **ACKNOWLEDGEMENT IS A DOT, NOT A SEVENTH GLYPH.** The six glyphs, the 1.9rem
  cell, the 0.35/0.4rem density and Share Tech Mono are a locked contract and are
  byte-identical. What a cell says about the WORK and whether anybody has SEEN it
  are different questions, so the mark sits in its own corner the way the
  multi-entry count already did, and carries its word in the title, the
  screen-reader line and the legend.

- **`NotebookPhotos` gained `layout="strip"`, which is not a second renderer.**
  Same `photoPages` grouping, same viewer, same proxy -- it asks the THUMBNAIL
  route rather than the full-size one, because a panel that repaints on every
  arrow press should cost kilobytes. `viewerIndex` became a bindable prop so the
  `Enter` key can reach the viewer through a typed contract rather than a DOM
  query across a component boundary.

### What was measured

Driven through `/dev/notebook-review`, which gained `?bare=1` (the console with
none of the harness's own chrome, so a scroll measurement is not measuring the
harness), a three-state realtime switch (`on` / `silent` / `off`), a 0121
toggle, and second-client buttons that write real rows into the same store and
fire the channel.

**Interactions to review one student and advance:**

| | before | after |
| --- | --- | --- |
| a compliant entry | click cell, click Flag (**no accept existed**), click next cell = 3, and none of them recorded approval | **1** -- `A`, or one click on Accept: it stamps and moves to the next student down the column who needs it |
| a flagged entry | 3 | 2 (`F`, then Flag this entry) |

**Scroll distance, the console's own height less the viewport** (before figures
exclude the harness's bar and log; after figures are `?bare=1`):

| | before | after |
| --- | --- | --- |
| 1440x900, nothing open | 765px | **0px** |
| 1440x900, entry open | 1182px | **0px** |
| 1920x1080, entry open | 1002px | **0px** |
| 375x812, nothing open | -- | 204px |
| 375x812, entry open | 1863px | 505px |

No horizontal overflow at any of the three widths. The Documentation Check went
from y=1935 at 1440 (and y=2572 at 375) to one click with **0px** of scroll in
every mode. The detail pane went from 432px (27rem, the cap) to 544px (34rem),
and the grid pane holds 808px at 1440 with no horizontal bar.

**The keyboard, driven with dispatched key events:**

- Arrows stop at all four edges rather than wrapping (up at the first student,
  left at the first check-in, right at the last, down at the last).
- `A` on Patel/Bearing teardown stamped that entry AND moved the cursor to
  Ruiz/Bearing teardown (the next unreviewed down the column), opened her entry,
  and moved DOM focus to the new cell -- one press.
- `A` at the bottom of a column says "Nothing further down this check-in needs
  reviewing" rather than wrapping.
- `F` opens the flag disclosure (`aria-expanded` true) and focuses the reason
  select. Pressing `a` with that select focused does NOT accept.
- `Enter` opens the full-screen viewer; `a` while it is open does NOT accept.
- `Esc` closes the panel.

**Realtime, driven for real** (a second client writing a row and firing the
channel):

- A student from another section filing here added a row ABOVE the cursor: the
  grid updated with no reload, the cursor stayed on the same cell, the
  half-typed comment survived, focus was unchanged (`entry-flag-toggle` before
  and after), and the cursor cell moved **0px** with a scrollable grid.
- `off` (no `subscribe` transport): no live indicator, 0 listeners, the grid
  still loaded with 24 cells, a second client's write did NOT appear -- and the
  console's OWN accept still refetched and repainted the cell.
- `silent` (registered, never delivers): the indicator shows, 1 listener,
  nothing arrives, own writes still refetch.
- Section changes tear the channel down and re-subscribe: listener count stayed
  at 1 across a mode and realtime switch.

**Contrast, composited over the real ground, both plates** (the pane's
non-compositing screenshots make every visual claim a computed-style read):

| | light | dark |
| --- | --- | --- |
| key legend | 7.41 | 9.63 |
| `kbd` chip | 6.84 | 10.16 |
| active mode button | 13.79 | 11.22 |
| "Not reviewed" chip | 7.75 | 8.80 |
| unreviewed dot vs card | 4.89 | 7.33 |
| "press Enter" hint | 7.75 | -- |

Three of those were BELOW the bar on the light plate on first measurement and
were fixed rather than reported: the key legend at 3.50 and the "Not reviewed"
chip at 3.66 both took `--text-3`, which is the room's known 3.66:1 tertiary
ink, and the active mode button was gold-on-gold-wash at 4.26. The legend and
the chip moved to `--text-2`; the active mode label moved to `--text-1`, which
costs nothing because the wash, the weight and `aria-pressed` already say which
mode is on.

`svelte-check` 0 errors / 36 warnings (the baseline, unmoved). Full suite 66
files / 1587 tests green.

`tests/notebook-review-console.test.ts` (27 assertions) covers the parts that
fail silently: the cursor arithmetic and all four edges, the key map and its
modifier and typing gates, the legend-and-handler-are-one-list guarantee, the
three-state read of a payload without 0121, the locked contract, and the shape
of the live path. Three mutations, restored md5-identical
(`53d4a6d78b96772fc9df465b97e70ca1`) and re-verified green:

| Mutation | Reddens |
| --- | --- |
| `cellReviewed` reads a missing key as `false` | 2 |
| `moveCursor` wraps instead of stopping at the edges | 1 |
| `nextUnreviewed` stops on already-reviewed cells | 2 |

`tests/notebook-shell.test.ts`'s "the notebook owns ONE scroll region" was
GENERALIZED rather than deleted: it pinned `scroll="page"` on both notebook
surfaces, which naming a third correct answer necessarily broke. It now states
the rule -- no notebook surface may take the default `100vh - <constant>`
geometry, and neither may write that arithmetic itself -- and a new assertion
pins that the `fill-height` block names no viewport height at all.

### NOT verified

- **Nothing was run against the live Supabase project or a real Supabase
  Realtime server.** The local `.env` is the placeholder, so the channel was
  driven through the harness's own listener list. What is proven is the shape
  the console asks for and what it does with a change; what is not is that
  Supabase delivers one. The publication itself was applied by hand from 0121.
- **No signed-in session and no screenshots.** `/notebook/review` is gated, the
  harness mounts the real component, and the Browser pane does not composite --
  every visual figure above is a measured geometry or computed-style read.
- **No Drive round trip.** The harness's photo ids are not real files, so the
  strip's thumbnails 404 and render their fallback mark; what was verified there
  is the layout, the click target and that it opens the viewer.
- **A real class-sized roster was not driven.** The fixture is five students by
  four check-ins; the scrolling and anchoring behaviour was reached by shortening
  the viewport rather than by lengthening the roster.

### Left undone, deliberately

- **Bulk accept.** Acknowledging a whole column is the obvious next step and
  wants the `{total, succeeded, refused, results:[...]}` RPC shape, not a
  client-side loop.
- **The cursor is not remembered across a reload.** It would be a `preferences`
  namespace, and a preference stores a DEFAULT rather than the entry itself.
- **`SessionManager` and `DocumentationCheck` were moved, not rebuilt.** Both are
  now full-width modes; neither's internals were touched.
- **The unreviewed count is not summarized anywhere.** `unreviewed_count` and
  `free_entries_unreviewed` are rendered per cell and per student, but there is
  no "14 outstanding in this class" figure in the bar yet.

