---
title: "The class pane's nine: the two tools open on demand and update live, the organizer drags with the pointer and files by drop, the editor fills the screen, and files and links take an order and a place (`claude/classroom-class-surfaces-5wk29o`, 0193)"
date: 2026-09-10
branches: [claude/classroom-class-surfaces-5wk29o]
migrations: ["0193"]
subsystems: ["Classroom", "Components and UI", "Database conventions", "Dev harnesses", "Testing"]
---

Prompt 0118, nine class-surface items in Mr. Pina's words, grouped by him into
the two tools (SIX, TEN), the organizer (SEVEN, ELEVEN, TWELVE) and the editor
and its files (FOUR, FIVE, EIGHT, NINE). Six earlier prompts had landed work
on these files; the prompt's own warning was that roughly half of any open
list here turns out already built. Here the count was lower, and worth
stating first.

Started from `origin/main` at `b03a9410`; `origin/main` moved to `131aeec2`
(prompts 0119 and 0121) while this ran and was merged in without conflict.
The work was split by FILE SURFACE across five agents in one working tree --
the two tools, the organizer, the editor and its mounts, the file panels, the
database -- each followed by an adversarial reviewer and a fixer; the fixers
for the editor, the file panels and the database died on a session limit
after applying most of their findings, and the orchestrator applied the rest
by hand (named below).

## What was already built, and what was not

Already there: the poll half of SIX (both tools re-ask the server on an
interval, 45s for the pass and 90s for the queue, and again the moment the tab
is visible); the paste and drop primitives behind NINE (`dropTarget` on the
upload panel, the "Drag files here, or paste an image" sentence, the
drag-over overlay, `claimPaste` so a screenshot lands once); and, for FOUR,
the ORDER of links, which `classroom_item_resources` has stored as the array
order of every save since 0082 with no control anywhere to change it.

Not built, all seven of the rest: no realtime of any kind under
`src/lib/classroom/` (the prompt's measurement holds: zero `.channel(`, zero
`postgres_changes`); both tools always-on cards; a native OS `<select>` on the
hall pass override; the organizer's native HTML5 drag; native checkboxes; the
composer in the detail pane; no attachment reorder, no placement, no rename.

Two claims in the prompt the tree contradicted: `static/classroom-updates.json`
is at the repo root (`classroom-updates.json`); and `song-queue.ts` is not in
this bundle's ownership, so `SongQueueTransports` could not gain a method,
which is why the live bus is its own prop on both tools.

## The decisions

**SIX is a broadcast, not `postgres_changes`, and it could not be otherwise.**
`classroom_hall_passes` (0143) and `classroom_song_requests` (0145) have RLS on
with NO policy and no client grant, on purpose: a student's payload has never
carried a peer's name, and the two state RPCs project by role inside the
database. Supabase Realtime delivers a `postgres_changes` event only for rows
the subscriber could SELECT, so on a table nobody can select it delivers
nothing, to anybody; neither table is in the `supabase_realtime` publication
either. Opening a policy to make events flow would open the table the feature
exists to keep shut. So `$lib/classroom/live.ts` is a broadcast channel per
section that carries NO payload: a notice means "re-ask the server", never
"apply this row", and every client re-reads through the same role-scoped RPC it
loaded from. That is the ReviewConsole rule (a change means re-read the grid)
applied where the event cannot even carry a row. What it costs is stated in the
module: a public channel is joinable by any client holding the anon key, so a
student could make every open page in a section re-ask the server (one cheap
gated RPC each, nothing disclosed, nothing written); and a write made outside
the app announces nothing, which is why both tools keep their poll as the
floor. `createMemoryClassroomLive` is the in-memory twin the harness and the
DOM tests drive; the real channel was NOT exercised (no live project reaches
this container).

**The tools are two props, both off by default.** `tool` renders a 44px
trigger carrying the word and a live chip (Free / Taken / "Yours · 6 min";
"1 out · Ana Reyes" / "Nobody out"; "2 waiting" / "Queue empty" / "Approved")
and a native `<dialog>` holding the SAME card markup with the same testids;
`live` subscribes, debounces 250ms and calls the existing `refresh()`, and
every successful write announces. Off, `/dev/hall-pass`, `/dev/song-queue` and
their specs measure the card byte for byte as before. The trigger/dialog
stylesheet is duplicated in the two components and pinned byte-identical by a
test, because no shared home for it was in this bundle's ownership; the
extraction is a one-file move for whoever owns one. A `stalled` channel shows
one sentence under the trigger ("Live updates paused, still checking every 45
seconds") -- the poll is the floor, so the sentence is about speed, not truth.

**The placement columns ride BESIDE the item, not on it.** `normalizeItemRow`
in `classroom.ts` builds its object field by field and is not this bundle's to
widen, so `files_placement` and `links_placement` would be dropped on the way
through. `withItemLayout` attaches `item.layout` after normalization, and only
when the read's widest rung (`ITEM_SELECT_LAYOUT`) answered -- absent means
"this read could not tell", exactly as an absent `body_doc` does, and every
surface renders absent as the default. The controls are removed by the
transports' absence: a surface handed `layoutTransports = null` has no
placement, file-order or rename control at all, which is both the read-only
case and the honest state of a deployment before 0193 is applied by hand. The
section layout probes the column with the narrowest select
(`files_placement`, `limit 1`) to decide, and the item page keys on
`itemLayoutKnown(item)`.

**Link order is NOT gated on 0193, and this reverses the first draft.** The
contract handed to the agents gated every reorder control on the transports so
"reorder" would be one vocabulary; the editor agent flagged that a link's
position has been stored by the existing save since 0082, and the orchestrator
ungated it: the link grips and Move up / Move down are offered wherever there
is a second link, on any deployment, and the two absence specs now use them as
the positive control beside the file grips that do go with the transport.

**EIGHT's merge question, answered no, with the reason.** "Instructor tools"
and "Edit post" open two different regions: the inspector (deck, check-in,
spec, rubric, revision history, pin/copy/delete) and the document editor. Two
tests outside this bundle's ownership --
`tests/dom/item-detail-delete-acknowledgement-mount.test.ts` and
`tests/dom/item-detail-ondeleted-mount.test.ts` -- pin the strip, its label text
and the Delete control living inside it. So the two controls stay, with the
reason in a comment beside them; what changed is that the editor they open now
fills the screen in front of everything, from all three of its mounts (the
section layout's New post, the item page's Edit post, the class list's row
menu). The composer's `screen` prop renders the SAME `.composer` snippet inside
a fixed `role="dialog"` layer at z-index 60 with a header, a 44px Close, body
scroll locked and restored, Escape to `oncancel`, a Tab wrap, focus into the
title and back to the opener. The create composer moved OUT of `ClassSplit`'s
overlay slot to a sibling of it -- still in the layout, so the staged `File`
handles survive navigation, which is the only reason it lives there.

**The full-screen Escape found two discard paths with no guard.** Before this
bundle the inline edit form had no Escape at all; the layer answers Escape with
`oncancel`, and the reviewer measured one keypress discarding a typed title
with no question on the item page, and the same on the class list's row
editor. Both mounts now take `ondirtychange` and ask `COMPOSER_DISCARD_WARNING`
before a close that would lose work, the guard the section layout's create
composer has always had; an untouched editor still closes silently, both
directions pinned. And a document-level Escape that a NESTED control had
already handled (the rename box, the editor's popover) stands down on
`defaultPrevented`, measured before the fix as "rename cancelled 1, editor
closed 1".

**TWELVE is a mechanism change.** Native `draggable` paints a translucent
snapshot while the real row stays put, `dragover` jumps row to row, and touch
does not drag at all. `$lib/classroom/sort-drag.ts` is the other mechanism:
pointer capture on a handle, the dragged row follows the pointer, the rows it
passes shift out of its way, the drop index is the count of other rows whose
centre sits above the dragged centre, and ArrowUp/ArrowDown on a focused handle
commit the same one-step move through the same `ondrop`. It never reorders the
DOM; the consumer's keyed list does. Filing into another unit is a drop ZONE on
the same drag (`zones` + `ondropzone`, a pure `foreignZone` decision): the
dragged row takes `pointer-events: none` for the duration so `elementFromPoint`
can see the card under it. The same action drives the unit list, the link
rows, the staged files and the existing files.

**The grip is a 44px button and the phone hiding is gone.** The old grip was
`display: none` below 1024px because native DnD could not drag on a phone; the
pointer mechanism can, so the grip renders at every width. Measured cost on the
crowded fixture: the row name went from 169px to 120.25px at 375, still two
clamped lines and contained. The grip is glyph-only by necessity (30px of row);
the visible-word rule is met by the menu's Move up / Move down, which stay and
commit the same write.

**A unit grip gated on `disabled` loses keyboard focus on the first commit.**
`reorder()` sets `busy` synchronously inside the action's `ondrop`, Svelte
flushes `disabled` before the action's microtask refocus, and the next arrow
press goes to `<body>`. Both grips carry `aria-disabled` instead, the action's
own `disabled` option is what refuses a press mid-write, and a DOM test that
reddened on the unfixed code pins it; measured in Chromium at 375 and 1440, a
second ArrowDown from `document.activeElement` writes a second order.

**The upload batch is a snapshot; the list is not.** The panel uploads
SEQUENTIALLY in list order now (the record RPC stores `sort_order = max + 1`,
so arrival order is stored order and concurrent uploads scrambled what a person
had just arranged). The first sequential draft rebuilt `entries` from the
batch's results at the end, so a file `add()`ed mid-batch -- a screenshot
pasted into the composer during a save -- was silently discarded: never
uploaded, not staged, count 0 (reproduced by the reviewer, pinned by a test).
Every change to the list is made on the CURRENT list by key: a landed row
leaves as it lands, a queued row stays `staged` until its turn, a row removed
mid-batch is skipped, and a row that arrived mid-batch stays for the next save.
A rename left open when the batch starts is committed rather than dropped, and
the one refusal (a collision with a sibling) is named in the batch's own
report.

**0193, at most one, and it is one.** Two placement columns, one layout write,
two order writes, two rename writes, and `classroom_duplicate_item` re-created
with 0159's body verbatim plus the two columns (same signature, no drop, and a
guard that refuses to apply over any body that is not 0159's). The rename
stores the SAME sanitization the record route applies in TypeScript, built from
`chr()` members so Unicode whitespace (the U+202F macOS puts in every
screenshot name) reads the same on both sides; ten odd names agree with
`recordedAttachmentFilename` in a UTF8 probe database, five through the real
RPC on the SQL_ASCII fixture cluster. `referenced` refuses a rename while the
item's body carries an `img` whose `src` is the alias or a spec mentions it;
`taken` refuses a sibling collision; both are structured, never raised, and the
composer's own pre-check speaks the identical sentences. The existence check
precedes the manage check, which is the precedent every classroom RPC in this
family sets; noted in the file rather than changed.

## What was measured

- `svelte-check`: **0 errors / 37 warnings** (31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`) on the merged tree,
  re-derived after `svelte-kit sync` with the two `PUBLIC_SUPABASE_*`
  placeholders exported -- the baseline the prompt states, unmoved.
- Full suite, `npm test` on the merged tree: **354 files / 6983 tests**,
  369.9s, with 6 failures in 2 files at that run and both accounted for: five
  in `tests/derived-numbers.test.ts`, the measured README region being stale
  against the 11 specs this bundle added (cleared by the browser pass below;
  18 of 18 green afterwards), and one in `tests/classroom-item-page-load.test.ts`,
  which pinned the item page's reads of `classroom_items` at two and measured
  three -- the new widest rung refused on a world without 0193, then the units
  rung answering. That is the ladder's documented cost and not a defect; the
  test now states it, and a new world carrying 0135, 0159 and 0193 asserts the
  other direction: the rung answers first time, two reads, `item.layout`
  attached, against `undefined` one migration back (27 of 27 green).
- Browser, `npm run verify:readme` on the committed merged tree at `8cf256a`
  (`dirty: false`), Vite pre-started on 5199 and reused: **169 of 169 specs
  covered, 338 route/width runs, 5834 measurements, 0 outside threshold,
  865.0s**, `--selftest` 70 controls (36 negative, 34 positive), 0 instrument
  failures. The previous measured region (main, `18b1d33`) carried two
  outside-threshold rows on `/dev/notebook`; prompt 0119 closed those on
  `main` and this run confirms the list is empty over the whole tree, the 11
  new specs included. Static region: 169 specs over 69 routes, 96 `/dev`
  pages, 338 runs.
- The tools harness `/dev/classroom-tools` at 375 and 1440: 0px horizontal
  overflow, four triggers smallest 343x44 at 375 and 330x44 at 1440, chip
  contrast 5.91:1 (teal on the plate) to 7.91:1, an announce on the page bus
  changed the student chip to "Taken" and the music chip to "Approved" with
  exactly one extra load each and no refresh; the open dialogs measured Close
  86.9x44, Sign out 112.8x44, focus inside, Escape back to the trigger with
  `aria-expanded` false.
- The organizer on `/dev/classroom-split/s-1?manage=1`: 20 grips at 44x44,
  20 `cr-check` boxes and 1 `cr-select` at computed `appearance: none`, a
  synthetic pointer drag of i-2b to i-1's slot recorded `setOrder`
  `[i-crowded, i-2b, i-1, ...]`, a drag of i-7 onto Unit 2's card recorded
  `setItemUnit [i-7, u-2]` and exactly one order write naming the destination,
  and "File here" measured 82.9x44 at 14.96:1 on all three units; the unit
  list's grips 60.1x44 with the word "Move", Rename and Remove 62.3x44, an
  ArrowDown storing `[u-2, u-1, u-3]`.
- The editor on `/dev/classroom-inspector?case=assignment`: the layer covers
  the viewport at both widths with 0px overflow, Close 86.9x44, placement
  options 126.8x44 with the checked one carrying a glyph and a heavier weight
  as well as the green, link grips 44x44 and Move up / down 44x44 (first
  measured 26.9 and 24px: `.cr-root .btn.secondary.tiny`'s 24px floor wins on
  order at equal specificity, which is why those controls dropped `tiny`),
  contrast 6.06:1 checked and 14.5:1 unchecked; placed ABOVE, document order
  reads check-ins, Links, Files, body.
- The file panels on `/dev/classroom-upload`: the zone present 3 of 3 at rest
  with its sentence at 15.2:1, staged grip 44x44, Move/Rename/Remove smallest
  66.6x44, the staged order at Save `['renamed-beta.png', 'alpha.txt',
  'gamma.pdf']` and the transport called in exactly that order, existing rows
  reordered by ArrowDown to `['a-2', 'a-1', 'a-3']`, a rename stored as
  `Lab-notes-final-.pdf`.
- The database: 19 assertions on the real chain, 10 refusals (a student and a
  non-managing teacher on all five RPCs) against 5 successes for the managing
  teacher; the ACL read from `pg_proc` (anon false, authenticated true,
  service_role false on the five; the two private helpers granted to nobody);
  a mutation pass (manage check removed, anon granted, the referenced
  predicate forced false, the sanitizer's dash collapse removed) reddened the
  assertions written for each and nothing else, restored from a copy and
  md5-verified.

## Not verified

- The real classroom, signed in, on production or a preview: no Bosco Tech
  session exists here, so the layout's `.class-tools` row, the full-screen
  editor over a real item, the live channel over a real Supabase socket and
  every 0193 RPC against production are unexercised. The harness copies of
  the `.class-tools` rules are pinned byte-equal to the layout's by a test.
- 0193 against the live project: NOT APPLIED. Its own header carries the
  verification query and the expected answers for the SQL editor.
- A real OS clipboard paste, a real OS file drag and a real finger on a phone:
  every event the specs and tests dispatch is synthetic (`isTrusted: false`).
- `prefers-reduced-motion` (the harness runs at `no-preference`) and web fonts
  (the harness blocks `fonts.googleapis.com`, so text is measured in the
  fallback stack).
- The tools' native Escape and `cancel` paths on a real keyboard, and the
  modal's focus trap under real assistive technology.

## Reported, outside this bundle's files

- `src/lib/classroom/classroom.ts`, `normalizeItemRow`: names its columns one
  by one, so any later column has to be attached beside the item as 0193's
  are, or the normalizer widened by whoever owns it.
- `src/lib/file-drop.ts`, `createDropController`: a DROP is never claimed the
  way a paste is (`claimPaste`), so a `dropTarget` around another `dropTarget`
  stages a file twice; the composer's whole-form zone checks
  `defaultPrevented` on the bubbled drop instead. A drop claim in the
  controller would make that check redundant.
- `tests/db/cluster.ts`: the embedded cluster is SQL_ASCII (no `--encoding`
  and no LANG), where production is UTF8; a db test handing non-ASCII to a
  regex, `length()` or `lower()` measures byte semantics production does not
  have. 0193's test opens its own UTF8 database on the cluster for the
  Unicode cases.
- `src/lib/classroom/classroom.css`, `.cr-root .btn.secondary.tiny { min-height:
  24px }` at four-class specificity ties any scoped `.a > .b` rule and wins on
  order, so a component cannot raise a `tiny` control to 44px with a scoped
  rule; the editor's order controls dropped `tiny` for that reason.
- `.cr-select` reads `--font-display` at 0.95rem where the row menu's items are
  `--font-mono` 0.72rem; input values are Rajdhani by the theme's own rule, so
  it was left, and the menu's picker now reads in a different face from the
  items around it.
- `src/lib/classroom/song-queue.ts` (read-only here): the music chip's words
  are inline in `SongQueue.svelte` and the shared debounce and paused sentence
  sit in `hall-pass.ts`; both belong beside the bus in `live.ts`.
- `recordedAttachmentFilename`'s `.slice(0, 300)` counts UTF-16 units and can
  end on a lone surrogate; pre-existing, and 0193's SQL drops the straddling
  character whole instead.

## Deferred

- One shared home for the tools' trigger/dialog stylesheet and the chip
  helpers (a `class-tools.css` or a `ClassTool.svelte` shell).
- A drop claim in `createDropController` mirroring `claimPaste`.
- The instructor file list's order in the composer's dirty signature (it is
  written on save, not watched by the guard).
