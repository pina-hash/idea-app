---
title: "Classroom Phase 1: scheduling, the calm surfaces, and the composer (`0109`)"
date: 2026-08-15
branches: []
migrations: ["0109"]
subsystems: ["IDEA Classroom"]
record_order: 44
---

Migration `0109_classroom_scheduled_posting.sql` (apply manually after `0108`)
plus a visual pass over every classroom and reference surface. `0108`'s rich
bodies were already shipped and wired; this is the layer on top.

### Scheduled posting: three states, two columns, no job

`published = false` is a DRAFT; `published = true` with a FUTURE `publish_at` is
SCHEDULED and invisible to students; `published = true` with a null or past one
is LIVE. `publish_at` is deliberately not a third state column or a status enum:
what separates scheduled from live is the CLOCK, which no column can hold.

**Liveness is COMPUTED at every read** -- `_classroom_item_live(published,
publish_at)`, the notebook role-expiry doctrine -- so there is no cron, no job,
and no row anything has to flip at a particular minute. An item goes live
because the condition starts being true. Null `publish_at` is live-when-
published, which is what every pre-0109 item is, so **the backfill is that there
is no backfill**.

**Applied at the eight places `published` was already the student gate**, found
by reading rather than assumed: `classroom_can_read_item` (the central one --
the items policy plus resources, attachments, decks, reference specs and rubrics
all delegate to it), the postings policy, the three `classroom_view_as_*` reads,
`_classroom_engine_student` (the student WRITE gate: nobody submits to an
assignment they cannot see), and both public reference functions. Each is
recreated with the same body and one term changed; nothing in app code repeats
the rule.

**A CORRECTION WORTH KEEPING:** `_classroom_engine_student` was first recreated
from memory as ONE combined check, and the real `0086` body has TWO with
different messages. Caught by reading the original before committing. When
re-signing a function to change one term, diff it against the source -- a
plausible reconstruction is how error semantics quietly change.

### The edit-tracking constraint, and the one added term

An edit to a scheduled item before it goes live must never raise the student
Updated badge, and an immediately-posted item's behaviour must not change at
all. The badge is `edited_at > viewed_at`, and `edited_at` is stamped only on a
real content change to an item with a non-null `first_published_at`. The change
is ONE added term: the item must ALSO have been LIVE when the edit arrived.

  * posted immediately -- `publish_at` is null, so "was live" IS `published`,
    which `first_published_at is not null` already implied. Byte-identical.
  * scheduled, edited before go-live -- not live, so nothing is stamped however
    many times it is revised.
  * scheduled, edited after go-live -- past stamp, so it stamps as normal.

**`first_published_at` is deliberately left alone.** Making it mean "first
became visible" would need something to stamp it at go-live -- the scheduled job
this design does not have -- and would leave a scheduled item's later edits
permanently unbadged. Nothing student-facing reads it (checked: only the edit
rule and the item payload).

**Rescheduling is not a content edit** and is excluded from `v_changed`: for a
not-yet-live item there is nothing a student could have missed, and for a live
one the schedule is already spent.

### `classroom_set_published`: a narrow write

`togglePublished` called `classroom_update_item` with the item's WHOLE content
re-sent -- title, body, document, points, due date, category and every link --
to flip one boolean, which made a publish only as safe as the console's copy of
the row. The new RPC touches `published` and its first-publish stamp, nothing
else. It cannot change content, so it cannot stamp `edited_at`: 0104's
"publishing is not an edit" made structural rather than remembered.

### Deploy ordering, and the client's degrade

Both write RPCs gain a parameter, so their old arities are DROPPED first (the
0058/0068/0096/0108 trap). **Apply 0109 before deploying a client that names
`p_publish_at`.**

The read chain is THREE rungs now (`ITEM_SELECT_SCHEDULED` -> `_RICH` -> base)
and the route drops parameters ONE AT A TIME, newest first. Both are for the
same reason: 0108 and 0109 are applied by hand and separately, so a project
carrying one and not the other is real, and dropping both at once would cost
such a project its RICH BODY to work around a column it does not have.
`classroom_duplicate_item` needed no change -- it names its insert columns and
does not include `publish_at`, so a copy carries no inherited go-live time.

### The calm surfaces

Eight ADDITIVE tokens in `colors.css` (`--surface-0/1/2`, `--hairline`,
`--text-1/2/3`, `--green-tint`), near-neutral with only a trace of green: the
classroom is where a student reads for minutes at a time, and the portal's
green-metal plate is tuned for short high-contrast chrome. Every other surface
keeps the plate exactly as it is.

**THE GREEN RULE.** `--green` is for primary actions, active navigation, focus,
success and completion -- not static labels, quiet borders or decoration. It was
stripped from fourteen places doing none of those: both Updated chips and the
feedback "new" chip (informational -> cyan), four data values (a score, a grade
total, a rubric points figure, an input's own text -> `--text-1`), body and
markdown headings, and three icon-button hovers. Gold keeps instructor-only
marking and the required callout including its glow. **The notebook review
grid's six status glyphs are a LOCKED CONTRACT and are untouched** -- they are
platform tokens, so no `--*` palette can reach them.

`src/lib/classroom/classroom.css` is the shared layer, loaded once by
`src/routes/classroom/+layout.svelte` and `src/routes/reference/+layout.svelte`
and scoped under the `.cr-root` wrapper those provide. It holds what was written
out per component -- `.feedback` and its variants in eleven files, `.btn.tiny`
sizing in ten, `.btn.danger` in six, the mono micro-label in three, the chips --
several of which had already drifted (a `.feedback` with `margin: 0` beside one
with `margin: 0 0 0.8rem`, a `.draft-chip` at 0.6rem beside one at 0.62rem).
**Margin is deliberately NOT in the shared rule**: the copies disagreed about it
precisely because it belongs to the layout around the message, and each
component keeps its own. Consolidating also retired the `:global()` escapes
those rules forced.

**`.bg-fx` is suppressed via `body:has(.cr-root) .bg-fx`** -- the TvStage
precedent, since the overlay is a sibling of the wrapper's ancestor and no
scoped rule can reach it. Radii and exact-match rem spacing are on the
`effects.css` tokens; **print blocks and `DeckViewer` are untouched** (the bulk
pass caught DeckViewer and it was reverted).

### The composer and console fixes

The composer opens on the CLASS PAGE with that class pre-checked
(`initialTargets`), collapsed behind a "New post" control a student never sees.
Editing from the manage console opens ON the row (`.row-editor`, a full-width
child of the row's flex line) instead of scrolling to a card two screens up, so
the top card is unambiguously the Compose card.

Uploads run CONCURRENTLY, both lists at once, each individually caught so one
that throws cannot reject the batch and discard the others' per-file reporting.
Instructor links are written only when they CHANGED, compared against what the
ITEM carried -- including changed-to-empty, the case a naive "only when
non-empty" check drops.

The rich-text link flow is an inline popover, not `window.prompt`. With an empty
selection the address becomes its own link text; a bare domain gets `https://`.

Two dead ends: an item body attached to a reference document was swallowed by it
(they answer different questions, so the body reads above), and the engine slot
said hand-in was "not available right now", which reads as an outage rather than
as an assignment that has none.

### Verified

- **`/dev/classroom-phase1`** (404 in production, no auth/Supabase/Drive) mounts
  the real components with bodies going through the REAL sanitizer over the wire.
  The three existing classroom harnesses now wrap in `.cr-root` too: they mount
  the same components the real routes do but live under `/dev`, so they had been
  rendering on the plate with scanlines behind them.
- **Measured in the browser:** `publishAt` reaching the transport as an ISO
  stamp with the button flipping Post now -> Schedule; `setInstructorResources`
  ABSENT from a save that did not touch the links and PRESENT the moment one is
  added; four staged files starting within **0ms** of each other where
  sequentially they would stagger ~1800ms, and two failures named individually
  with both kept staged; a hostile paste yielding **0 script / 0 img / 0 table**
  elements with the `javascript:` href stripped, its text kept and a table's
  words kept; a **PAST** `publish_at` reading Live rather than Scheduled; the
  body above the reference document; the hand-in copy; and Edit on the last
  console row leaving it at **exactly** the pixel it was on with the editor
  opening below it on screen. Home screen and GAUNTLET confirmed untouched
  (scanlines running, original tokens, no wrapper).
- **TWO REAL BUGS the browser found, neither visible to `svelte-check`:** the
  link popover hung **82px off the left edge** at 375px -- anchored to its own
  button, and the toolbar WRAPS, so the button can sit anywhere along it (the
  notebook theme-picker trap and the same fix: drop the wrapper out of the
  positioning chain and measure insets from something that spans the width); and
  the popover's own buttons were 35px against the 44px beside them.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **899/899 across 38 files**.
- **NOT verified: the live Supabase project, and no screenshots.** The local
  `.env` is the placeholder project, so `0109` has never been applied anywhere.
  Apply it by hand after `0108` **BEFORE deploying**, then check with two real
  accounts that a scheduled item is invisible to a student until its time and
  that editing it before then raises no Updated badge. The Browser pane does not
  composite, so every visual claim above is a measured DOM or computed-style
  read.

