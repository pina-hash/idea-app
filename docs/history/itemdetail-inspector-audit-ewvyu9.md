---
title: "The instructor inspector gets three groups, one header row and a grading shortcut, and its first dev harness (`claude/itemdetail-inspector-audit-ewvyu9`, no migration)"
date: 2026-08-30
branches: [claude/itemdetail-inspector-audit-ewvyu9]
migrations: []
subsystems: ["Classroom", "browser-verify harness", "dev routes"]
---

The instructor region on the classroom item page was a flat list of up to eight
`.insp-block` siblings separated by nothing but a hairline, several of them with
no label at all, above a header that spent two rows and a rule on one chip-sized
Edit button. The instructor who teaches a section of this course has said the
menu confuses him, and he was not part of designing it. That is the standard the
work was measured against: anything requiring an undocumented judgment call from
him is a defect.

**One component's markup and CSS were touched** --
`src/lib/classroom/ItemDetail.svelte` -- plus a new dev route and three new
browser-verify route specs. No migration, no change to any gate, no change to
what any control does.

### The audit's premises, re-derived rather than trusted

Every claim in the prompt was checked against the file first. Eight blocks under
eight `{#if}`s, confirmed; the header two rows separated by a `border-bottom`,
confirmed; the open flag module-level and deliberately unpersisted
(`inspector.svelte.ts`), confirmed. **One premise was wrong in a way that
changed the work**: the prompt says every block that currently has no heading
gets one, and named the Pin/Copy/Delete row. Reading the file, only TWO blocks
were genuinely unlabelled -- that row, and the notebook check-in block when the
item carries no check-in yet, because its `<h2>` sat inside `{#if
checkIns.length}` and the empty case is exactly the state a teacher is in when
they arrive to attach the first one. Three others carry a label rendered by a
CHILD component (`DeckPanel`'s "Presentation deck", `Disclosure`'s "Edit the
wording", `RevisionHistory`'s "History"), and adding an `<h3>` over any of them
would have printed the same word twice. Those three were left alone and the
reason is in the report; the two real gaps were closed.

### 1. Three groups, chosen by what a block does

The blocks are sorted into `groupContent` / `groupPrivate` / `groupPost`, each
gated on the OR of exactly the gates of the blocks inside it:

- **Content and work** -- the presentation deck, the reference document, the
  assignment engine, the wording editor, the notebook check-in. Everything that
  changes what a student opens, reads or hands in. First, because it is what a
  teacher opens the tools to change.
- **Instructor only** -- the private files and links. Its own group because "who
  may read this" is a different question from the one every other block answers,
  and it is the only group whose membership is about audience rather than about
  subject. Its existing `<h2>` was HOISTED to be the group's heading rather than
  restated a level down.
- **This post** -- Pin/Copy/Delete and History. The post as an object rather
  than as content: where it sits, copies of it, whether it exists, and the
  record of what has changed. Last, because the destructive control is in it and
  none of it is what anybody came here for.

The rejected alternative was splitting "what students read" from "what students
hand in", which is a cleaner-sounding pair and produces one incoherent case: the
wording editor edits the ASSIGNMENT spec on an assignment and the REFERENCE
document on a material, so it would have had to change groups by item kind. A
block whose group membership is conditional is exactly the kind of undocumented
judgment call this bundle exists to remove.

**The group gates are not a boundary and must never become one.** Every block
still carries the exact condition it carried before, unchanged, inside its
group. The derivation exists for one reason: a group with nothing in it for this
item must render nothing rather than a heading over empty space.

Heading levels went to two: `h2.insp-group-label` in gold (matching the region's
own dashed-gold marking and the strip's label) for a group, `h3.section-label`
in cyan for a block. Two levels told apart by hue AND size, so scanning the body
is reading three words rather than eight blocks.

### 2. One header row

The Edit button moved out of `.insp-edit` and into a new `.insp-head` beside the
disclosure toggle; the `border-bottom` between them went with the stacking. What
did NOT move is the composer Edit expands into, or the "also posted to" sentence
that qualifies it -- a full editing surface is not a header control, so
`.insp-edit` survives below the header at full width and now renders only when
it has something in it.

**The cost of merging the rows is paid by the state chips, and it was measured
rather than reasoned.** `.insp-state` is `flex: 1 1 auto` with `overflow:
hidden`, so it is the element that gives up width first. Two findings came out
of measuring instead of assuming:

- **The strip's flex-basis is 22rem, and it is a measurement.** The strip's
  fixed content is ~197px and the widest chip this surface can produce
  ("Scheduled &middot; Fri, Sep 5, 3:30 PM") is 153px. A basis under their sum
  lets the quick controls share the line at a width where the chips then have
  nowhere to go. At 22rem the header is ONE row in the 736px detail pane at
  1440px and WRAPS to two at the 341px pane a 375px viewport gives it -- where
  the strip takes the full measure it had before it had neighbours. A header
  that becomes two rows on a phone is a smaller loss than the one element on
  this surface that says whether a class can see the item being clipped away.
- **`padding-right` belongs on `.insp-quick`, not on `.insp-head`, and the
  difference is 9.6px of chip.** Written on the row it insets the strip too,
  which already carries its own. Measured at 375px against the same fixture:
  `.insp-state` clipping went 16px -> 25px with the padding on the row, and back
  to 16px -- byte-identical to the pre-change baseline, measured by restoring
  `HEAD`'s ItemDetail under the same harness -- with it on the controls.

**The two header controls are 44px and the body's chips are not, deliberately.**
`.cr-root .btn.tiny` (classroom.css:195) pins a 24px floor for
`IDEA_INTERFACE_STANDARDS` 10's "chip beside a heading on a page somebody is
reading". The header controls are not that: they sit in the page's own header
row and one of them is the door to the grading console. The selector needed a
marker class to win -- `.insp-quick .btn.tiny` is four classes and ties
`.cr-root .btn.secondary.tiny` on specificity, so source order decided and the
button computed `min-height: 24px` with the rule sitting in the sheet. Measured,
not guessed; `.insp-quick :global(.btn.insp-quick-btn.tiny)` is five and wins.

### 3. The grading console, reachable with no expansion and no scroll

`quickGradeHref` is `canEditAssignment && gradeHref` -- the same condition and
the same href as the in-body link, so it signposts a destination that was
already there rather than widening who reaches it. It renders in the header row,
which is on screen whether the tools are open or shut. **The in-body link stays
where it is**, beside the rubric it grades against; two paths to one destination
is the point, since the complaint was that neither cheap path was signposted.

### The harness, and what it caught

`src/routes/dev/classroom-inspector` mounts the REAL `ItemDetail` -- never a
copy of its markup -- inside `.cr-root` and inside a real `ClassSplit`, because
the item page is the DETAIL pane in production and a harness measuring this
component across a full 1440px page would be measuring a width it never has. Four
cases: a manager on an assignment with a spec, a rubric, a grading href, a
check-in and instructor-only material; a manager on a material with a reference
document and a deck; every optional transport null; and a student, as the
positive control for every instructor-only claim.

`?open=1` is read from the URL and written to the module flag. The flag
deliberately starts collapsed, which is right for the product and useless for a
run that must measure the body -- so the page sets it rather than a spec
clicking and hoping.

**The fixture's `publish_at` is a fixed 2031 instant and not an offset from the
pinned 2026 epoch the other classroom fixtures use.** `isScheduled` compares
against the real clock, so an epoch-relative date stops being scheduled the
moment the epoch passes and the Scheduled chip -- the widest thing the header row
can hold, and the whole reason for measuring the row -- would silently vanish
from the measurement rather than failing it. The material fixture carries
Scheduled AND Public link together, which is the widest chip set one item can
legally hold: `is_public` is CHECK-constrained to a material.

**A mutation proof found a vacuous assertion in the harness's own vocabulary.**
With `{#if groupContent}` mutated to `{#if true}` -- the permissive direction --
the sparse fixture rendered an EMPTY content group, and the
`presence: { expectPresent: 0 }` row came back "ok present 1": `expectPresent`
is a FLOOR, so `>= 0` holds for any number of nodes. Only the `orderResult`
count reddened ([2,1] against [1,1]). Every absence row in these specs now
carries `maxVisible: 0` as well, and the counts remain the real proof. The file
was restored from an in-memory copy and md5-checked, never with `git checkout
--`.

### What was measured

`npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, breakdown
31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class` -- the baseline exactly. (The two public Supabase
values were exported before the sync, per `CLAUDE.md`'s note on the 11 phantom
errors a checkout with no `.env` reports.)

`npm run verify:browser`, Chromium 141.0.7390.37, at 375px and 1440px:

| | 375px | 1440px |
| --- | --- | --- |
| Document horizontal overflow, all four cases | 0px | 0px |
| `.insp-head` overflow (`scrollWidth - clientWidth`) | 0px | 0px |
| Header height, assignment | 100.7px (wrapped, 2 rows) | 52px (1 row) |
| Strip width, assignment | 341px (full measure) | 608.3px |
| State chips, assignment ("Scheduled &middot; ...") | 137.5px box, 0px clipped | 404.8px box, 0px clipped |
| State chips, material (Scheduled + Public link) | 137.5px box, 16px clipped -- identical to the pre-change baseline | 465.9px box, 0px clipped |
| Edit (header) | 48.6x44 | 48.6x44 |
| Grade (header) | 55.5x44 | 55.5x44 |
| Instructor tools toggle | 341x45.6 | 608.3x44 |
| Group heading contrast, gold on `--surface-2` | 7.66:1 | 7.66:1 |
| Grade shortcut label contrast | 14.07:1 | 14.07:1 |
| Empty groups / total groups (assignment) | 0 / 3 | 0 / 3 |
| Unlabelled blocks / total blocks (assignment) | 0 / 6 | 0 / 6 |
| Groups / blocks, sparse (every transport null) | 1 / 1 | 1 / 1 |
| Inspector present, student | absent | absent |
| Console errors | 0 (1 ignored: the harness's own blocked `fonts.googleapis.com`) | same |

Interaction, driven with a retry-against-its-own-effect loop rather than a timer:

- Inspector opens in **1 click** and closes in **1 click** at both widths;
  `aria-expanded` reads `false` -> `true` -> `false`.
- With the inspector **collapsed** (`#item-inspector-body` absent, `scrollY` 0),
  the Grade shortcut is in the viewport, hit-tests to itself, measures 55.5x44,
  and carries the same href the in-body link does.
- The composer opens **below the header** (`top >= headerBottom`) at
  **341/343 = 99.4%** of the inspector's width at 375px and **734/736 = 99.7%**
  at 1440px -- the 2px is the region's own 1px dashed border on each side. No
  overflow either time.

Instrument controls, so none of the above is a green tick over nothing:
`--selftest` ran **54 controls (27 negative, 27 positive), 0 instrument
failures**; `--break tiny-taps` on the new collapsed-inspector route made the
Grade tap-target check report **36.3x18, 1/1 under 44px** and flagged it. The
pre-existing `/dev/classroom-split/s-1/item/i-crowded?manage=1` spec, which
drives the same component's inspector, still runs **16 measurements, 0 outside
threshold**.

### Not verified

- **No signed-in surface was driven.** `/classroom/<section>/item/<id>` needs a
  Bosco Tech Google session no automated run can hold; everything above is the
  real component under fixture data on a `/dev` route.
- **Web fonts do not load** in this harness (the proxy resets
  `fonts.googleapis.com`), so every pixel figure above is measured in the
  FALLBACK stack and is approximate. Contrast is unaffected -- it is read by
  painting the computed colour to a canvas.
- **`prefers-reduced-motion` is `no-preference` throughout.** Nothing in this
  bundle animates, so there is no reduced path to exercise, but the numbers
  describe that state.
- **No Vercel preview.** The project is deployment rate-limited for roughly 24
  hours; the in-container browser pass above is this bundle's verification.

### The 24px controls left alone, and why

The measured `under 44px` list inside the inspector body -- Pin (41.8x24), Copy
(48.6x24), Delete (62.3x24), Replace spec (103.5x24), Edit rubric (96.6x24),
Detach check-in (124.1x24), Open grading console (158.4x27.6), and the rest --
is unchanged from before this bundle and is `classroom.css`'s documented density
contract for a chip on a manage-only surface, not a regression introduced here.
Raising them means editing `classroom.css`, which another lane owns this cycle.
The two controls this bundle ADDED are both 44px.

### Deferred

- **The 24px chip floor inside the inspector body** is worth revisiting now that
  the region has a header carrying 44px controls: the two floors sit four pixels
  of vertical rhythm apart and read as an inconsistency rather than as a rule.
  That is a `classroom.css` change with a blast radius across ten other call
  sites and belongs in its own bundle.
- **`RevisionHistory` and `DeckPanel` label their own blocks**, which is why
  neither gained an `<h3>` here. If the two-level heading hierarchy is ever made
  uniform, it is those two components that have to be changed, not this one.
