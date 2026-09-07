---
title: "Close the list, and stop the maps editor duplicating rooms (`claude/close-list-maps-duplication-nz2an9`)"
date: 2026-09-07
branches: [claude/close-list-maps-duplication-nz2an9]
migrations: []
subsystems: ["IDEA Maps", "IDEA Classroom", "IDEA Foundry", "Operations", "Verification harness"]
---

Prompt 0098. No migration written and none applied: 0190 and 0191 were
claimed and neither was needed, so the highest migration on `main` stays
0189. No connection was opened to production. The bundle started from
`origin/main` at `19680f84` in `/home/user/idea-app`, merged `integration`
(prompt 0094's four commits and one merge commit, eight files, nothing else)
so CI's shallow-checkout fix rides along, and closed every item still open on
the feedback list: one built at the root cause, four built small, four found
already shipped, one declined as deliberate. The item that was live is first.

## ZERO: one press of "Create draft" wrote about thirty rooms

**What he hit was a single press, not a stampede, and not the durability net.**
The mechanism is a loop between two correct pieces of machinery. `NodeDetail`'s
save callback, on a CREATE, calls `onselectnode(newId)` while its own
`SaveState` run is still in flight. The shell's `attemptSelect` asks every
registered form whether it is dirty before switching, and `writing` counts as
dirty (rightly, for a navigation guard), so it calls the form's `flush()`, which
called `doSave()`, which called `markDirty()`. The machine reads a `markDirty()`
during a write as "an edit landed mid-write, send the newest value once this
settles", which is exactly right for typing, and re-runs `save()`, and `node`
is still null because the selection never moved: `attemptSelect` is parked on
the flush, which is parked on the run, which is now the next run. Every cycle
inserted an identical row and re-entered the same path. The indicator flipped
`saved` to `writing` inside one microtask, so it read "Saving..." the whole
time, which is why a person presses again.

**Measured on the tree before the fix** (`tests/dom/maps-node-create-once.test.ts`,
the real `MapsEditor` over the harness fixture with a transport that holds each
insert open for a macrotask and refuses a thirteenth):

| drive | presses | rows written |
| --- | --- | --- |
| 2. one press, through the real editor | 1 | 12, and a 13th asked for before the cap refused it |
| 1. five presses in one tick, inspector alone | 5 | 2 |
| 4. four presses spaced past each settle, on a form the shell did not remount | 4 | 4 |
| 3. one press, then `visibilitychange` and `pagehide` while the request was open | 1 | 1 |

Drive 2 is his. Drive 3 shows the durability net is not a mechanism here:
`SaveState.#flush` calls `saveNow()`, which joins an in-flight run and returns
because nothing is pending. Drive 1 is the busy-state half the ledger guessed
at; drive 4 is the half nobody had named.

**The fix is two halves in `doSave`, in all four maps forms and the elevation
editor.** A press while a save is in flight JOINS that save and starts nothing
(`if (save.phase === 'writing') { await save.saveNow(); return; }`), which
closes drive 1 and breaks the loop in drive 2, because the shell's flush
reaches the same function. And a press after a create UPDATES the id that
create returned: each form remembers `createdRow` from a new `onLanded`
callback on `mapsSaveObject`, called the moment the row exists and before any
publish step, so a create-and-publish whose publish half fails still leaves
the id behind. That closes drive 4. The two controls carry a real `disabled`
while writing (there is nothing to explain then that the indicator is not
already saying) and keep `aria-disabled` for the problems list. **Both halves
have a control that bites**: removing the guard alone leaves the insert count
at 1 but lands an identical row a second time as an UPDATE, so the test counts
updates too and reddened on exactly that (drives 1 and 2, `expected 1 to be
0`); removing the remembered id alone reddened drive 4 with four rows.
`NodeDetail.svelte` was restored from a copy and md5-checked after each.

**The indicator, honest, at each state.** Pressed: "Saving...", both create
controls `disabled`. Acknowledged: the pane switches to the created node's own
editor ("Save draft", the tree row selected) and reads "Saved 12:59 AM". That
acknowledgement used to die with the remount, because the form is keyed on
the selection; the shell now carries the clock time across (`selectNode(id,
savedAt)` sets an `acknowledged` key the next mount seeds with
`save.markSaved(at)`, cleared the moment the selection moves on). Refused:
"Not saved. <the transport's sentence>" with Retry. In a real Chromium, five
rapid presses at 375, 1440 and 1920 each produced one row, the selection moved,
and the indicator read "Saved".

**The surplus panel** (`MapsDuplicates.svelte`, Places tab, "N surplus copies
of M containers", only while there is something to clean up). Prompt 0074's
shape: groups by what makes two containers copies (same parent, kind, name
case-folded, and outline, or slot and subtype for a compartment), keeps the
oldest (the published copy when exactly one is published), lists every other
copy oldest first with its own two-step Remove naming the copy and its date,
and lists a copy that holds containers, items or stock, or is already on the
public map, or is outside a granted editor's scope, SEPARATELY with the reason
and no control. Removal is `transports.deleteRow` on one id, then a reload;
the database refuses independently. Nothing bulk-deletes: no checkbox, no
control whose label says "all". Pinned in `tests/maps-duplicates.test.ts`
(the pure layer: identity, kept copy, blocked reasons, thirty rooms give one
kept and twenty-nine removable) and `tests/dom/maps-duplicates-mount.test.ts`
(the panel in the real editor: one press arms, one confirms, exactly one
delete of the oldest empty copy, the group shrinks, the note names what went
and what stayed; a refusal reports and removes nothing; no transport means no
Remove at all). The harness fixture gained `?state=duplicates` with four
copies of the room he made, one holding a unit.

**Measured** (`npm run verify:browser -- --route "maps-edit?state=duplicates"`
and a scripted 1920 pass through the harness's own server and browser): 36
measurements, 0 outside threshold; no horizontal overflow at 375, 1440 or
1920; contrast 14.66:1 (summary, note) and 15.42:1 (reason, kept sentence);
every control 44px tall, the arm 104x44, the inline "Open it" 54x44 after a
first reading of 41x44 was widened; the panel at its 736px reading measure
inside a 1920 window; one copy removed by two presses with the blocked copy
surviving, marked and never offered a control.

## A. The merge

`integration` was NOT "`main` plus four commits": it forked from `main` at
`e06ed581`, and `main` had moved twenty commits past the fork (the Tuesday
landing). Its diff against the fork was exactly prompt 0094's eight files,
so merging it into this branch brought only those. Merge commit `fcebb084`.

## B through J, per item

- **B, sub-30-second GAUNTLET runs: declined, deliberate.** The one refusal is
  `and (s.value ->> 'elapsed_ms')::numeric >= 30000` in the
  `gauntlet_leaderboard` view (0154:320), argued at length in that
  migration's header: a start-then-submit forgery measured at 6 ms held rank
  1, and the number is 0152's review-console threshold so every run the board
  refuses is one the review console already lists. The run still passes,
  still writes its row and still counts as cleared on the speedrun list; only
  the ranking declines it, and it says nothing on purpose, because naming the
  threshold hands a forger the number. Nothing built. **The skeptic found a
  neighbouring defect this bundle did not fix:** two loaders still derive
  Speedrun cleared-ness from board presence (`src/routes/gauntlet/+page.server.ts:28`
  feeding the home page's per-mode cleared count, and
  `src/lib/gauntlet/next-challenge.ts:31-38` behind `nextUncleared`), so a
  student whose only pass on a level is sub-floor is counted as not having
  cleared it there and keeps being offered that level. 0154's header calls
  those "NOT AFFECTED", which is true of a wrong knowledge answer and wrong
  of a fast correct one. Left open, named in the ledger.
- **C, trusted publishers: partly shipped, the rest declined, one sentence
  built.** The tier is 0173 (not 0155, which is the GAUNTLET author roster):
  `foundry_trusted_publishers`, `foundry_is_trusted()`, admin-granted, and a
  trusted student's `foundry_submit_version` already publishes in the same
  transaction and answers `auto_published: true`. Retroactive publishing of a
  queue and a "publish all" are both bulk writes of student work to a public
  gallery with nobody reading them, which is the supervision act decision 06
  was blocked on, and both would be write RPCs where this bundle may write
  only read-only migrations: declined. A per-trusted-student count of queued
  builds on the roster panel cannot be built client-side either, because the
  queue carries owner uuids and the roster is email-keyed and the bridge
  between them is deliberately not granted to any client. What WAS wrong and
  is fixed: neither student surface rendered the answer, and `/foundry/submit`
  said "Waiting for review" to a trusted author about a build already on the
  gallery. `foundrySubmitAcknowledgement` in `surface.ts` carries the two
  sentences; both routes read `auto_published` off the RPC (the mine route
  cannot use `callRpc`, which discards the row); `/foundry/mine` adds the
  sentence beside "Saved at". Pinned by `tests/foundry-submit-acknowledgement.test.ts`;
  the control (the mine route back on `callRpc`) reddened.
  Decision 06's file still reads "Status: open" with an empty Decision line
  although 0015 recorded the answer and 0173 shipped it; a tree-check line
  says so now, and the status is his to flip.
- **D and E, email the class and roster export: already shipped** by prompt
  0016 (`1b8c14b9`): the People tab's Class tools carry "Export roster (CSV)"
  (six columns, formula-injection escaped, section id withheld) and "Email the
  class", a `mailto:` with `bcc=` only, split into several drafts past an
  1800-character ceiling with the split stated on screen, and a sentence that
  nothing is sent from the app and nobody sees anybody else's address. The
  roster read is `classroom_section_roster`, gated per row on
  `classroom_manages_section` inside the definer and granted to
  `authenticated` only; the route 404s a non-manager. The portal has no mail
  sender of any kind and none was built. The prompt's premise that prompt
  0006 recorded a Gmail connector finding is not borne out: entry 0006 is the
  feedback-form screenshot bundle and mentions neither.
- **F, a second save and publish at the top of a long post: already shipped**
  (`1c9fa2c7`, 2026-09-02): `ContentComposer` renders one `actions` snippet
  twice, a sticky top row with the save indicator riding it and the bottom
  row. The composer between the two rows carries thirteen labelled regions;
  its pixel height for a long post was not measured here.
- **G, class randomiser: already shipped** by prompt 0016: the People tab's
  Random picker (`picker.ts`, a seeded mulberry32 shuffle, round-robin teams
  so nobody is alone, an absence layer, the seed printed in the draw note so a
  student can check it), drawing from the roster with managers and inactive
  enrollments dropped, behind the People route's 404. One gap, not built: the
  seed is shown but cannot be typed back in, so "the same seed on any device"
  is true of the module and unreachable from the screen.
- **H, "Hide other items does not do anything useful": a real defect, fixed.**
  It hid the item. With the list pane at `display: none` it left the grid
  flow, so the detail pane became the first grid item and auto-placed into the
  emptied 0px track: measured on the classroom-split harness at 1024, 1440 and
  1920, `grid-template-columns` read `0px 1376px` and the item pane painted
  0px wide, with and without the transition freeze. `classroom.css` now pins
  `.cr-detail` to the second track under the collapsed rule; after the press
  the pane spans the split (960, 1376 and 1408px) with the heading at its
  736px reading measure. The audit had read the CSS and predicted margin
  around the same column; the measurement said otherwise, which is the whole
  argument for measuring. The harness could not show the control at all until
  now: `ClassroomShell` derived its location from the raw pathname, which
  under `/dev/classroom-split` is `other` for every page. It reads through a
  new `classroomPathname(pathname, basePath)` that `navKeepsComposer` also
  uses, and the dev layout passes its base. A collapsed-state spec presses
  the control where it is visible and reads facts that hold at both widths.
- **I, a highlighted animation for assignments due today: partly shipped,
  the motion built.** Prompt 0027 (not 0069, which owned the 11:59 pm due-time
  default) gave the home feed's due-today row a bold flag, a heavier title, a
  3px cyan inset rule and the words "Due today". Nothing animated. The rule
  now breathes: the marker widens from 3px to 7px and eases back on a 2.8 s
  cycle, only for `today`, only inside `@media (prefers-reduced-motion:
  no-preference)`, with the keyframe resting AT the static value so a
  reduced-motion reader sees the whole marker. The class page rows carry no
  urgency step at all (`ClassView` has no clock); giving them one is a
  separate change and was not made. Pinned at the source in
  `tests/classroom-feed-due-today-motion.test.ts` (the control, lifting the
  animation out of the gate, reddened) and on the home-order harness route:
  the computed animation name is the keyframe on exactly the today row.
- **J, the duplicate check-in refusal that did not say where: built.**
  `checkInDuplicateRefusal(sectionId, basePath)` in `nav.ts` reads the address
  off `sectionTabs` (one spelling of `/notebook/review?section=`) and returns
  the sentence and a link label; `ItemDetail` renders the link beside the
  sentence with a 44px reach. Prompt 0081's wording ("the Check-ins tab
  above") would have named chrome that is not on screen, because the section
  tab bar does not render on the item page; the sentence says "the check-in
  manager, which is this class's Check-ins tab". Not the Duplicates tab, per
  prompt 0086. Pinned by `tests/classroom-check-in-refusal.test.ts` (the
  control, the sentence without its destination, reddened).

## A0c: `aria-disabled` on a control carrying a handler, repo-wide

Twenty elements outside the maps surface carry `aria-disabled` with a
handler. Every handler that writes re-checks the in-flight half of its
predicate before acting. Twelve fold an in-flight predicate into
`aria-disabled` where a real `disabled` belongs (HallPass x3, SongQueue x4,
FoundryInspector, FoundryTrustRoster, EntryMove, SpecImporter, SessionManager),
three of them pure in-flight predicates with nothing to explain (HallPass:328,
SongQueue:420 and :429). `ReviewConsole.svelte:1156-1157` carries both
`disabled` and `aria-disabled` on one button, so the explanation its own
comment promises can never fire. `SessionManager.svelte:744` does not re-check
`linkChoice === current?.id`, so a press re-sends the link RPC for an
already-attached item. The exemplar shape is `FoundryMine:590-593`. None of
these is a fix in this bundle. **One genuine exposure outside maps:**
`FeedbackBox`'s textarea calls `markDirty` with no phase gate, and the machine's
success-settle path re-runs the save, so typing during "SENDING" inserts a
SECOND `app_feedback` row with the newer text. Two rows, not thirty: nothing
outside maps has a flush-on-switch to turn it into a loop. Reported, not fixed.

## The counts block and the measured region

The committed measured region matched prompt 0095's claim digit for digit
(140 covered, 280 runs, 4296 measurements, 2 outside, both `/dev/notebook`
tap-reach). Warm versus cold is recorded nowhere in that region and in no
report shape; the only evidence a run was warm is the two rows it carries.
This tree has 142 specs (two new), 66 routes, 94 dev pages, 284 runs. The
static region was regenerated; the measured region was regenerated warm: a
persistent dev server, one full pass to heat it, then `npm run verify:readme`
against the same server. Result: 284 route/width runs, 4340 measurements, 2 outside threshold, the same two `/dev/notebook` tap-reach rows (decision 12, with the owner), server boot 98 ms against the warm server, 692.1 s wall clock, covered 142 of 142, measured on `9c21c28`. The warm-up pass before it read the same 284/4340/2. The measured region's sha sits a few commits behind the branch tip only by the documents written after it.

## Suite and check

`npm test`, run alone on this tree from 18:49 to 18:55 PDT on 2026-09-06 (America/Los_Angeles): 324 files, 6,444 tests, 0 failures, 368.4 s. Prompt 0095 left `main` at 318 files and 6,404 tests; the six files and forty tests above that are the six this bundle added (`maps-duplicates`, `dom/maps-duplicates-mount`, `dom/maps-node-create-once`, `classroom-check-in-refusal`, `classroom-feed-due-today-motion`, `foundry-submit-acknowledgement`). `svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`, re-derived after a sync with the two public variables exported. One error appeared on the way (a union not narrowed before reading `autoPublished` in `FoundryMine`) and was fixed before the measured region was written.

## Not verified

- The live map. No cloud container can reach production, so the thirty rows
  are known only from his report; the panel is measured on a fixture with
  four. Whether the loop was still writing rows when he closed the tab is not
  known: it stops when the tab does.
- A signed-in session on any changed surface. Every browser figure is from
  the `/dev` harnesses on a placeholder `.env`, in the fallback font stack,
  with `prefers-reduced-motion: no-preference`.
- The composer's pixel height for a long post (F), and the collapse control
  on the shipping route rather than the harness (H): same CSS, same shell,
  measured on the harness only.
- The feedback box's second row (A0c): read off the source, not reproduced.

## Left open, named for the ledger

- The GAUNTLET cleared-count defect the skeptic found (B above).
- The feedback box's duplicate row on typing mid-send (A0c).
- The twelve `aria-disabled` sites where `disabled` belongs, and
  `ReviewConsole`'s double attribute.
- A seed a person can type into the class picker (G).
- Decision 06's status line.
