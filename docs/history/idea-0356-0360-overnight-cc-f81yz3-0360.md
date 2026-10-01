---
title: "0360: the 2026-10-01 feedback round -- all 27 reports, presentation-link hand-ins, long-term ideas, and Space White on the rest of the site"
date: 2026-10-01
branches: ["claude/idea-0356-0360-overnight-cc-f81yz3"]
migrations: ["0230"]
subsystems: ["IDEA Classroom", "IDEA Foundry", "Feedback", "Theme", "Profile", "Live class", "Grading", "Browser harness", "Standards"]
---

PART 2 of the 0356+0360 overnight prompt (PART 1 landed as ledger 0357, its
own entry). One unattended session took the admin feedback export of
2026-10-01 (27 reports), Mr. Pina's two extras (presentation-link hand-ins and
long-term ideas in the feedback box) and Space White on the rest of the Plate
pages, and shipped them as one squashed commit straight to `main` with one
additive migration, 0230. The export is NOT committed (it names students and
this repository is public); `docs/feedback/2026-10-01/TRIAGE.md` is the
identity-checked render and the outcome table is at its end.

### For Mr. Pina, first

- **0230 applies itself on the push, or it is yours to paste.** `migrate.yml`
  applies the lowest unapplied migration on a push to `main`, and 0230 is the
  only new file, so the run after this push should apply it and commit
  `docs/migrations-applied/0230-*`. **Either way, paste
  `docs/feedback/2026-10-01/VERIFY_0230.sql` into the SQL editor**: it is one
  read-only select, it writes nothing and never errors, and every row should
  read `ok = true`. The last row (the history row) reads false only when the
  file was pasted by hand. If the workflow did not apply it, paste
  `supabase/migrations/0230_quick_posts_foundry_and_feedback_horizon.sql`
  once, then the check. Until it is applied, every control that needs it is
  absent and says why (quick posts, the Foundry switch, publisher
  applications, the request board, the long-term horizon); nothing breaks.
  **Undo** is written in the file's own header, section "WHAT UNDOES THIS
  FILE", and has to be pasted by hand.
- **Edit the six drafted trusted-publisher questions** on
  `/foundry/review/publishers` (Questions). Two of them are trick questions;
  a student never sees which. They were written by this session as a first
  draft and are yours to rewrite or retire.
- **Mark this round's reports seen**: paste
  `docs/feedback/2026-10-01/MARK_SEEN.sql` (27 ids, moves only rows still
  `new`, undo in its header).
- **File the presentation engine as the first long-term idea** from the report
  box once 0230 is in (the box now offers Long-term idea), so it lands in the
  new list rather than in this session's notes.
- **The worksheet that read Missing (R07, R09, R14).** Nothing was stored
  wrongly; saves were not retried during the 2026-09-29 stall and the progress
  bar counted typing the server never got. Two read-only questions only you
  can ask, because they read production manifests and answers:
  `supabase/data/0360-hx-optional-blocks.sql` section 1 (which blocks are
  empty for how many students, per item), and
  `docs/feedback/2026-10-01/Q2_WORKSHEET_STUDENTS.sql` (which students, with
  their submission state; addresses on your screen only). Section 2 of the
  data file marks blocks optional and writes nothing when pasted unedited.
  **Answers typed during the stall that never saved are gone**; nothing in
  this bundle can bring them back.
- **The `classroom_items` payload question (R08).** The home and to-do loads now
  ship slim items, but the item rows themselves are still read whole; a
  `select pg_column_size(...)` on that table would say whether a narrower
  select is worth a bundle. Not run: no session reaches production.
- **Two things to decide, neither urgent.** Asymmetric JWT signing keys would let
  the server verify a session without a round trip to Auth (a dashboard
  setting, then a code change); and whether the projector should ever show
  minutes left in the period, which needs bell data the repo does not have
  (the quick-post "end of school day" preset is 3:00 PM for the same reason).
- **One edge to know about the long-term mark.** If PostgREST's schema cache is
  stale for a minute after 0230 applies, a signed-in report marked long-term can
  land with the column at its default and the mark only in `meta`; it then
  reads as Fix soon. Moving it once from the feedback console fixes it.

### How it was built

Eleven file-disjoint lanes in git worktrees: ten in a first wave (migration,
performance, site, profile, live and projector, students customize, completion,
grading, Foundry, class page), then two integrators for the two pages several
lanes needed a mount on (the class page and the item page). Each lane owned a
disjoint set of files and handed every edit outside them to an integrator as an
exact diff, so the merge was a sequence of cherry-picks with no conflict. The
lanes shared a four-CPU container, so `svelte-check` and the browser harness
ran under shared locks; every browser finding taken under contention was re-run
alone before it was believed.

### What changed, by area

**Migration 0230** (`0230_quick_posts_foundry_and_feedback_horizon.sql`). Three
features in one file because `migrate.yml` applies one file per push: class
quick posts (PART A), the Foundry switch, trusted-publisher applications and the
game request board (PART B), and the feedback horizon (PART C), with a
self-check over its own names (PART D). Additive only; four existing functions
re-created at their existing signatures and diffed against their current
definitions (`foundry_section_access`, `foundry_play_start`,
`app_feedback_submit`, and `app_feedback_admin_list`, which became a thin
wrapper over a new wide form under the two-overload rule). Every object closed
with the 0166 grant shape; seeds and the backfill run inside `do` blocks,
because `tools/apply-migration.mjs` refuses top-level DML and `migrate.yml`
never allows it. Tested on the whole pre-0230 chain read off disk
(`tests/db/chain-0230.ts`) with seeds through the real RPCs, applied twice:
quick-posts 25, foundry-site-switch 26, publisher-applications 19,
game-requests 15, feedback-horizon 33, migration-0230-apply 12 (the real
`scanFile` over the real file, with a planted top-level insert as the
control). Corpus parity: every call to the four deployed functions answers the
same after the apply, plus only the named new keys. Mutants killed:
Q1-Q7, F1-F3, P1-P2, R1-R4, H1-H4; Q8 is refused at apply time by the file's
own self-check; P3 and P3b are defence in depth (each survives alone, both
together killed). The ledger claims 0228 and 0229 as well, only so the
tombstone test reads them as accounted for; they stay reserved for decisions
37 and 38.

**Performance (R08, R24).** `src/app.html` preloads data on tap and code on
hover, so a resting pointer no longer runs a route's server load (6 loads at
1440 to 0, tap still preloads). The home and to-do loads ship slim items
(`slimOwedWorkItem`: a 5-item fixture went 13,231 to 3,596 bytes), the home
load asks for the section roster only when the caller manages a listed class,
the browser layout uses the server's verified claims on the server render (one
fewer Auth call per page), and `/classroom` reuses the layout's class list.
Requests per load (`tests/home-classroom-load-budget.test.ts`): home as a
student 8 to 7, `/classroom` as a student 13 to 12 and as a teacher 6 to 5.
The site changelog renders 150 rows at a time with a worded Show more and
"Showing N of M" (2508 rows to 150, 16,178 nodes to 1,007, longest task
959-2224ms to 103-224ms). The home particles stay on Space White in the brand
green with no blur.

**Site (R15, the long-term extra, Space White).** For an admin the report box
links to the feedback console. A report can be marked long-term
(`FEEDBACK_HORIZONS`, `rowHorizon`); the console opens on Fix soon, reads
long-term ideas in their own wide read, and moves one either way; the archive
lists them in their own section. Space White now applies on every page the
site plate covers: `themeInScope` reads the plate's own prefix lists, and the
rooms that redeclare the portal tier carry their own light twins
(Tournaments, the IDEA Maps viewer, the dashboard roster at 1.09:1 to 5.03:1,
Foundry), lightness only, with the tournament TV stage a dark island.

**Profile (R16, R18).** The eight class badges are redrawn in place (ids and
order unchanged; the gear has eight flat-topped teeth), and `BadgeIcon` beats
once on hover, focus or press, behind reduced motion. "No pathway yet" is an
answer stored in `preferences.pathway` and holding until the next 1 August in
Los Angeles; nobody is inferred a freshman from an email.

**Live class and projector (R11, R12, R13).** An idle student whose last
keystroke was on an earlier school day reads "No typing today", not "No typing
for 1463 min". The projector was a shrink-to-fit grid item that was its own
size container, so its timer collapsed to 48px digits; it is rewritten on the
plate with the Plate ring as the timer (729px ring and 91px digits at
1440x982), the clock, the hall pass, the shown pick with its seed, Today and
Coming up, all fitted to the window by `wallFit` and cut in a stated order
with "+N more", never clipped. Student activity reaches the wall only as five
counts after a press, and names are a second press that a reload never
restores, shortened to "First L.", never for whoever is out on the hall pass.

**Worksheet completion (R07, R09, R14).** Nothing was stored wrongly. Four
stacked defects: saves were never retried (the SQLSTATE was dropped), the rail
counted typing the server never acknowledged, a failed save said nothing in
parent chrome, and the class list beside an open worksheet was read once per
visit. Now `hxSaveResponse` and `hxRpcFailure` retry a transient failure four
times and never retry a refusal or a lost session, the rail's 100 means stored
(a filled worksheet still owed reads 99 with the real `SaveIndicator` and its
Retry), a backup copy is kept through the shared draft mirror, and the class
list overlays what the rail acknowledged with no network call. A manifest
block may be `optional` (judged, never counted), and a stored boolean or a
non-empty string on a checkbox counts. 11 of 11 mutants killed.

**Grading (R25, R26, R27, the presentation-links extra).** The roster's head
was squeezed to a sliver by flex-shrink weighted by basis; both regions above
the names are now `flex: 0 0 auto` under their ceilings, a row is one line
(25 of 30 rows were two lines at 375; 0 now), and one `RosterCard` shows the
hovered or focused name's detail. One student's files download from the work
head. A ported worksheet's answers read without the document (Answers view,
Answers by question, and an Answers CSV built from the export payload, never
from `classroom_html_assignments.document`). A text block may declare
`link: "presentation"`; `openableUrl` gates an Open key, and a Present links
dialog walks a class's links by name, never by address. The HTML assignment
spec is 1.5 and the authoring guide 1.12 (another session took 1.10 and 1.11 on `main` the same day).

**Foundry (R01, R02, R03, R04, R05, R10).** The gallery shrink-wrapped to its
42rem lead paragraph (about 608px) at every desktop width because the page was
a flex item with `margin: 0 auto` and no width; `FoundryPage` is the one page
and takes the window, and the mosaic tops out at eight columns. An app's idle
stage is its cover with Launch app and Launch full screen (two presses to a
full-screen game). The trust roster moved to `/foundry/review/publishers`,
giving the queue the window. The whole Foundry has one off switch that also
reaches the apps origin; trusted-publisher applications are answers to stored
questions decided with one press, approval being the existing grant; and the
request board moves no coins and renders text only.

**Students customize (R17, R23).** A team member styles their own team from
the class page (`TeamStyleEditor` over the membership-gated write 0223
already had), and the split pane's height cap no longer lets the editor's
Save sit under the class title. Each person can hide, show and reorder the
panels of the class page and the item page, saved to their account, with
Reset; the work never moves, so a reorder never reloads an open worksheet.

**The class page (R19, R21, R22, and the R23 and R17 wiring).** The banner,
the theme row, the New post row and the tools row are one `ClassHeader`: a
title line with the class badge beside it, then one wrapping key row (the
identity chip, the hall pass, the music, the live door, the class theme
trigger, Next due, a teacher's teams key, Quick post, New post, Units). On a
phone the keys become tiles two to a line. Where the class content starts,
in px below the class pane, before and after (measured through the real
ClassView and section layout):

| Width | Teacher | Student |
|---|---|---|
| 375 | 521.8 to 425.0 | 469.9 to 437.6 |
| 1278 | 394.2 to 242.6 | 425.3 to 395.7 |
| 1440 | 395.4 to 243.8 | 426.4 to 344.8 |

The first version put one key on each line at 375 and cost a student 52px; the
tiles are what fixed it. Next due is `nextDueFor`, asking `assignmentStanding`.
The class pattern drifts once on arrival (4.2s, transform only) and loops only
on hover, never under reduced motion, on its own `aria-hidden` layer with an
overscan its motion never uncovers. Quick posts go to this class, all my
classes (by `teacher_email`) or a chosen set, end at a preset (the end of the
school day at 3:00 PM, an hour, the next school day, the end of this or next
week), at a picked Los Angeles time or when taken down, and vanish at their end
with no network call. The page's panels go through `PanelStack`: the header is
one panel holding three hideable pieces (tools, theme, posting keys) that never
move on their own, teams, search and videos move, and the posts are the
anchor. A null layout renders as the page did before the refactor, held by a
golden. A team member's "Customize team" is wired, and the class list overlays
what a worksheet's rail acknowledged. Hiding pieces removes their polls: the
hall pass 0.5 a minute, the music 0.2, the teams 0.2, the theme tally while its
panel is open. The badge on the banner arrives once.

**The item page (R06, R20, and the R23, completion and link-check wiring).** The
rubric is the last default panel and closed for every role; a returned card
keeps its score and comment above the work and folds its breakdown. On a new
assignment the work starts 927px higher (1352 to 425 at 1440, 1394 to 467 at
375) and the rubric card is 94px closed, against 907 open. R06 was the page's
`main` being a stacking context at z-index 1, so the edit layer (z-index 60)
painted at 1: at 1440 the list's resize bar was drawn over the form and the
masthead covered Close. `ItemDetail` and `ClassView` now drop the context
while an editor is open, and the plate's selected row drops its own while it
holds an editor; hit tests at the centre of Close, the title, the form and the
separator answer the editor after, and the masthead or the separator before.
The panels follow the person's arrangement around the work, which never moves.
The rail mounts the real save status and the student's link check.

### Polls and reads

Quick posts are the only new poll: `startPoller` at `QUICK_POSTS_POLL_MS`
(600s), 0.1 calls a minute per open class or item page, plus one re-read after
a jittered wait on a live `quick-posts` notice and none at expiry. The
steady-state budget test holds the class page at 1.0 calls a minute (0.9 after
0357) and the item page at 2.5 (2.4), both within half of the 2026-09-30
figure. A saved team style asks the existing poller for one read and changes
no interval; hiding a panel stops whatever it polls. Nothing reads
`classroom_html_assignments.document` that did not before.

### What was measured

- **`svelte-check`**: 0 errors and 37 warnings in 20 files (31
  `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class`), the baseline, on the merged tree and again after
  the review fixes.
- **The browser harness, every spec, on the merged tree**: 618 specs, 1,236
  runs at 375 and 1440, 20,932 measurements, written to `measured/` and the
  README counts by `npm run verify:readme`. **No finding is new.** Compared row
  by row with the files committed before this round, every spec's set of
  findings is the same or smaller (two got smaller: the home emblem probe and
  `grading-incomplete`). The 182 that remain are the IdeaCAD harness (178) and
  `portal-admin-used-roster-admins` (4), both outside this round and unchanged.
  Three specs this round's own changes broke were fixed and re-measured to 0:
  the request console's status tabs (the new horizon tabs were a second
  tablist the selector caught), its spam press (12 attempts at 250ms on a cold
  server; now 40 at 500ms, landing at 11), and the settings help count (seven
  to nine, the two Page layout groups).
- **Contrast**: the worst text reading anywhere in the run is 4.52:1 against a
  4.5 floor (pre-existing rows: the coin desk's FINE chip, a home changelog
  line, a bracket head); the worst boundary is 3.18:1 against 3.0 (Matrix); no
  contrast reading in the run is under its floor. Under the projector model
  every gated row clears 4.5, 3.0 and 2.0. Two readings this round produced
  and fixed: the Q&A answered count and the class theme trigger's voted words
  on the IDEA key face, both 4.21:1, now 8.93:1.
- **The full suite**, once, on the finished tree: 689 files, 12,761 of 12,762
  tests passed (1714s). The one failure is
  `tests/db/migrations-applied-record.test.ts`'s "a record for every migration
  from 0193 onward", which reads red by design from the moment 0230's file
  lands until its applied record does (see Not verified).
- **Calls a minute** (`tests/classroom-poll.test.ts`): the class page 0.9 to
  1.0 and the item page 2.4 to 2.5 per student, the 0.1 being quick posts.
- **Mutation proof** where a wrong answer is invisible: 0230 (Q1-Q7, F1-F3,
  P1-P2, R1-R4, H1-H4 killed; Q8 refused at apply), completion 11 of 11,
  class page wiring 12 of 12 plus 3 of 3 for the R06 rules, item page 6 of 12
  reddened by three mutants, profile, live, Foundry, grading and site as their
  lanes report above. Every file restored from an in-memory copy and
  md5-checked.

### The fresh-eyes review, and what came of it

A reviewer that built none of this read every after picture against the
2026-09-28 rollout pictures. Fixed from it, and re-measured:

- **Foundry My apps' blocks had no side padding, and an empty bar.** Under the
  plate `.fdy-block` is a panel, but it was written as a top-ruled divider; the
  share card's words and field touched its edges. It is padded now, and the
  play-stats wrapper renders only when it has a transport (the site plate's
  `:not(:has(*))` rule meant to hide an empty block loses on specificity to the
  panel recipe, so it never fired).
- **The class header spent its spare room on empty key face.** The three tools
  grew to fill their line while the class theme and Next due beside them were
  cut. The tools now take their own width and the two title keys grow into
  what a line has spare, with `min-width: 0` so the basis, not the nowrap
  words, decides where lines break. Measured before and after at 375, 1278 and
  1440 for a teacher and a student: the same key-row height and the same
  search-row position everywhere, and Next due's title is now whole for a
  teacher at 1440 and 1278. The theme's words still trim where a line has no
  room left.
- **The live door was drawn as a panel in the key row** (flat, and in Space
  White its face read as a lit key). It is a key inside the class header now,
  and a panel everywhere else.
- **Team cards were flat boxes with browser bullets.** They are plate panels
  that keep their team's accent as the left edge, with one name a line.
- **The request board stacked under its form**, half the window empty and the
  board under the fold. Above 1024px the form keeps its measure on the left
  and the board takes the rest.
- **"Turn the Foundry off" was the green primary key.** Arm and Keep it on are
  secondary keys, the confirm is a danger key, and On stays primary.
- **Several dark pictures were taken before their data arrived** (the live
  view read "Not known 12", the HTML grading console "Loading the roster"). Re-
  taken with a wait for the data: they render their groups and rosters. That
  was a capture race, not a defect.

Left as they are, each for the reason given: the teacher's bulk-bar Select all
on a row of its own above the posts (pre-existing, part of the posts anchor);
the `/dev/classroom-teams` harness still mounting the pre-header arrangement (a
harness, not the page); the live timer's "7:30" placeholder at about 2.9:1 (a
hint on a teacher-only field, pre-existing); the smallest badges losing detail
at 1rem; the returned card's corner screws; the phone class strip's third key
under the Menu key; item meta wrapping with a separator at a line's start; the
publisher question legend wrapping over its box edge; and the report pill
floating over the gallery's last cover. All but the badges predate this round.

### Not verified

Nothing here ran against production or in a signed-in session; no container
here can reach the database or hold a Bosco Tech session. 0230 was tested on a
real embedded Postgres with the whole chain applied off disk, not on the live
project. Not measured: a real phone, Safari, a 2560 monitor, the tournament TV
stage under Space White, the maps editor's canvas under Space White, and the
Vercel preview. The 3:00 PM end of a school day is a constant because the repo
has no bell schedule. `tests/db/migrations-applied-record.test.ts` reads red
from the push until 0230's applied record is committed, which `migrate.yml`
does when it applies the file (0225 sat the same way for five hours).

### Deferred

Phase 2 of the page layout (adding buttons); quick posts on the projector; a
live timer in the class header (it needs a server channel, which is a
disclosure decision); minutes left in the period; the Foundry theater mode and
a draft mirror for the publisher application; the IdeaCAD harness findings;
LiveControl's pre-0357 polls (teacher-only); a bulk horizon move in the
feedback console; and the Answers by question view's reading of a 30-student
roster on the real route.

