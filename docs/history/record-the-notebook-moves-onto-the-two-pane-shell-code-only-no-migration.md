---
title: "The notebook moves onto the two-pane shell (code-only; NO migration)"
date: 2026-08-16
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 53
---

## The notebook moves onto the two-pane shell (code-only; NO migration)

Both notebook screens sit on the SAME split the class page does. No schema
change, no new RPC, no write path touched, and every `readOnly` guarantee,
omitted transport and `canReview` gate is exactly what it was.

### ONE SPLIT, ONE BREAKPOINT, THREE SURFACES

`ClassSplit` moved to `$lib/shell/` and its geometry -- plus the `--cr-gutter`
and scrollbar properties it reads -- moved out of `classroom.css` into
`$lib/shell/split.css`, which both room stylesheets `@import`. So the classroom,
the notebook feed and the review console mount one component keyed on one
1024px media query, and a surface that needs a different arrangement gets a
PROP rather than a second split. **`--cr-*` is the shell's property namespace,
named for where it was first written**; each room supplies `--cr-thumb` and
`--cr-pane-line`, since a scrollbar tuned for the classroom's plate is
invisible on the notebook's paper.

Two props were added, both opt-in, so the classroom's computed geometry is
unchanged (measured: nav 32..448, detail 472..1393, gap 24, crumbs and tabs
spanning both, thumb still `--text-3`).

- **`narrow="stack"`** -- what happens below the breakpoint. `swap` (the
  default, the classroom's) shows one pane. `stack` shows BOTH in one column,
  detail first, via `order`. The notebook needs it because its detail pane
  holds the compose form and a phone's notebook has always been the form and
  then the feed; swapping would hide the feed behind it. Ordering rather than
  re-rendering is what keeps the one instance of that form -- staged File
  handles and all -- alive across the breakpoint.
- **`navWidth="wide"`** -- the mirror proportion, for a navigation surface
  that is a TABLE you scan rather than a column of rows. The review console's
  grid takes it; because a table brings its own card, that variant also drops
  the pane frame, and with nothing open it collapses to a single column so the
  grid is not permanently narrowed beside an empty panel.

### THE ONE THING JS IS ALLOWED TO KNOW

`$lib/shell/split.svelte.ts` watches the breakpoint, for exactly one decision:
which VARIANT the entry cards render. That is a prop, not a display rule --
rendering both and hiding one would double the feed's DOM, mount a text editor
per entry twice over and duplicate every landmark in it. `SPLIT_MIN_PX` is the
same 1024 the stylesheet keys on and a test holds the two together.

**The initial value is a constant, on purpose.** Reading matchMedia at module
load would make the first CLIENT render differ from the server's HTML, so the
watcher starts at the value the server rendered and corrects itself in an
effect. A desktop therefore never changes; a phone re-renders its cards once,
which costs a chevron appearing, because the LAYOUT at both widths is the
stylesheet's answer rather than this one's.

### NotebookEntryCard has two variants

`full` is everything it rendered before -- the collapsed tab, the
expand-in-place body, photos, the note thread, the add panels, the folder /
pin / copy tools. It is what a phone shows, entry for entry, and what the
detail pane shows for the entry you picked. It is the DEFAULT, so every
existing call site is unchanged.

`row` is the compact list item the navigation pane shows above the breakpoint:
two lines, never more (the classroom's row contract -- `nowrap` with the title
as the only shrinkable child), state chips inline, counts as small inline
indicators with screen-reader text beside them, and the open row marked with a
lifted surface plus a leading rule and `aria-current`, in gold where the
classroom spends green. It renders **no disclosure, no body, no note thread
and no editor of any kind**; clicking it selects into the detail pane.

- **The bulk-select checkbox stays; the folder / pin / copy tools do not.**
  Selecting a run of entries to re-file is done from the list, so that control
  belongs there; the other three would not fit two lines at 26rem and are one
  click away on the open entry, which carries all of them. A deliberate
  trade: at desktop you now open an entry to pin it. The pinned STATE still
  shows in the row.
- Measured with a fixture built to break it -- a 100-character title, a
  PINNED chip and a status chip over a meta line already carrying a date, a
  photo count, a note count and a folder name -- every row is **54.7px, one
  title line and one meta line**, identical to the plainest row beside it.

### The panes, and what survives a selection

Navigation pane: the folder rail, the filters and the list, framed by the pane
itself (the card chrome it wears at phone width is dropped -- a card inside a
frame is two boxes saying the same thing). Detail pane: the selected entry,
else the compose form, else a line saying to pick one.

- **THE COMPOSER IS NEVER UNMOUNTED BY A SELECTION.** Opening an entry hides
  it with a class and shows the entry; `{#if}` would throw away staged File
  handles that exist nowhere but in that browser's memory. Measured: a staged
  photo and a typed title survive a selection change, and the compose element
  is the SAME DOM node throughout.
- **The open entry is `{#key}`ed on its id**, so moving from one to the next is
  a fresh card rather than the previous one's card handed a new row. Measured:
  a note panel opened on one entry does not follow the selection to the next.
- **Selection is an ID resolved against the current list on every read**, never
  the row captured at click time -- the trap ReferenceDoc shipped. The feed
  reloads after every save, so a snapshot would leave the pane describing the
  state the entry had BEFORE the thing just saved to it. A selection whose
  entry stops existing is cleared rather than left pointing at nothing.
- **One notice above both panes.** The success and error lines are set from
  four places -- the form, photos or a note added to an open entry, a bulk move
  -- which now happen in different panes, so a message rendered inside any one
  of them would be invisible from the others.
- **The guard.** `notebookComposerHasWork` counts a staged photo, a typed title
  and a note with real text; a picked check-in is a default, not work. Closing
  the composer asks, and then genuinely DISCARDS (the staged photos live on the
  view, not in the form's markup, so closing without clearing them would hand
  them back on the next open -- a second answer to a question already
  answered). `beforeNavigate` covers leaving. **Unlike the classroom's, this
  composer is owned by a PAGE**, so every navigation to a different route
  destroys it and there is nothing to stay silent about -- except a move within
  the same route, which SvelteKit serves against the same component instance,
  and which is therefore skipped.
- **`readOnly` is unchanged, both mechanisms.** The explicit prop and the
  omitted transports are still independent and neither replaced the other; a
  read-only surface simply gets no composer and opens on the empty state.

### Below the breakpoint: exactly what shipped before

One column, compose card above the feed, `full` cards expanding in place, the
same 16px gutter. Measured at 375px on both screens: `scrollWidth` 375 with no
overflowing element, one `<main>`, expand-in-place working, and the compose
card above the list.

### The review console

Its bespoke 992px split, and the bottom-docked sheet that went with it, are
gone -- it is `navWidth="wide"` on the shared shell now, with the entry panel
taking the page below the breakpoint (the shell's swap) rather than docking. Its
on-demand entry fetch and its derived-from-the-grid open cell are untouched.

### Verified

- **`tests/notebook-shell.test.ts` (22)**, pure. Server-renders the real card
  in both variants (the `full` control is what stops the `row` absences being
  vacuous), walks the `row` branch of the source to prove it names no
  `NoteEditor` / `EntryNotes` / `PhotoStager` at all -- **the editors are behind
  click-opened doors, so an at-rest render alone would have proved nothing** --
  and pins the re-derivation, the clamp, the work rule and the one breakpoint.
- **MUTATION-CHECKED ELEVEN WAYS**, every one caught: the row falling through
  to the full card (5 red), a third line, the counts losing their
  screen-reader text, the open row unmarked, a captured selection, a stale
  selection kept, whitespace counting as work, the JS breakpoint drifting, the
  notebook swapping instead of stacking, the console keeping its own split,
  and a room dropping the shared import. **One of them was caught being
  vacuous first**: the stack assertion passed against the phrase in a comment,
  and is anchored to the tag now.
- **`tests/classroom-measure.test.ts`: 8 assertions UPDATED, none deleted.**
  They asserted the gutter, the scrollbars, the pane frame and the pane gap
  against `classroom.css`; those rules moved, so the assertions read
  `split.css` and were widened to check both rooms declare them once between
  them. **No test asserted the notebook's single-column structure** -- checked
  before starting.
- `npx svelte-check`: **0 errors, 36 warnings** (the same 36 as HEAD).
  `npx vitest run --no-file-parallelism`: **1136/1136 across 47 files** (was
  1114/46 -- the new suite is the difference exactly).
- **Browser-measured at 1440 and 375**, plus a read-only scan **with positive
  controls**: the writable render carries 1 form, 2 file inputs, a note editor,
  the compose form and trigger, and (with an entry open) add-photos, add-note,
  pin, move, select, manage-folders and 2 note-edit controls; the read-only
  render carries **zero of every one of them** while still showing the folder
  chips and the Pinned chip. Zero trapped `window.onerror` across a sweep of
  filters, sorts, five selection changes and the folder manager.
- **NOT verified: the live Supabase project, the three signed-in routes' own
  chrome, and no screenshots.** The local `.env` is the placeholder project, so
  `/notebook`, `/notebook/review/student/<email>` and
  `/classroom/view-as/<email>/notebook` could only be probed signed out (all
  303) -- the components they mount were measured through the harnesses, which
  mount the identical ones. The Browser pane does not composite, so every
  visual claim above is a measured DOM or computed-style read.
- **SUPERSEDED IN ONE PLACE: the pane geometry.** Both notebook surfaces run
  the shell's `scroll="page"` now -- the panes do not bound themselves and the
  document owns the scroll. See "Two notebook fixes from the first day of
  classes" below for why the viewport-locked panes this pass shipped could not
  work here.

