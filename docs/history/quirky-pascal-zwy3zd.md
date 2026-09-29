---
title: "Ledger 0347, the 2026-09-28 feedback round in one push: the grading console's tools move into its header and selecting becomes a mode, teams can be changed by hand after a draw, classes vote on their own look, a Settings tab per class, archived classes tucked away, lit toggles, file drops that land in the right box, tips on every setting, the feedback console at /admin/feedback with undo and better dictation, the Matrix rain on phones, the lines-of-code chip, the maps building and a new light-theme logo (`claude/quirky-pascal-zwy3zd`)"
date: 2026-09-28
branches: [claude/quirky-pascal-zwy3zd]
migrations: ["0225"]
subsystems: [Classroom, Grading, Teams, Theme, Feedback, Maps, Portal, browser-verify, process]
---

Ledger 0347 took all eighteen reports in the 2026-09-28 feedback export (R01 to R18) in one session,
under decisions 42 to 45, with one migration and one push to `main`. The pushed commit is
`@@PUSHED_SHA@@`. The work was split across a workflow of worktree-isolated implementers, the
migration first, and every branch was cherry-picked onto this one, re-tested on the merged tree, and
then read by a fresh-eyes reviewer whose findings are fixed below.

## What each report got

**R16, R17 (decision 43): the grading console.** Every export (the FACTS CSV, the graded-work JSON
pair and spreadsheet with the identity toggle, Download all files) is one `Export` panel, and closing
the assignment is one `Close assignment` panel. Both are `Disclosure` callers in the page header,
closed by default, with the pager beside them, so the roster card holds names and nothing above them
but the filter and the Presence label. Next and Previous student are header buttons as well as `n`
and `p`. Ticking is a mode: the tick boxes, the presets and the selection bar exist only while
`Select` is lit, and `To grade` is a view, not a second list. `Disclosure` gained `class:on` on its
trigger and an `onopenchange` callback. The CLAUDE.md paragraphs under "WHO IS WORKING" carry the
rule.

**R18 (decision 44): teams after posting.** A teacher drags a student onto another team card, or
presses Move to beside the name and picks a team; students on the roster and on no team of the draw
are listed under "Not on a team yet" and join the same way; Rename writes a team's name and carries
the other five style fields. `classroom_move_team_member` writes in place, keeps the seed, and stamps
`edited_at`/`edited_by`, which reads "Edited by hand" on People, on the class page and in the CSV's
new Edited column. A deployment without 0225 gets no grip and no Move to, and one sentence saying
why.

**R07 (decision 45): class themes by class vote.** A course's students vote on a palette (six), a
banner pattern (four plus plain) and a badge (six plus none); the most-voted option of each wins for
every block, ties going to the option whose latest vote is earliest. A teacher sees the counts (never
who voted), and on the class's Settings tab sets the block's own accent, opens or closes voting, and
resets it (nothing is deleted: votes before the reset stop counting). The class page's header is the
banner, and My Classes' cards and the header strip's class keys carry the edge colour and badge. A
class nobody has voted on draws exactly as before, and every surface says the theme in words.

**R06: a Settings tab per class.** A class's details, Archive class and Delete class moved from the
bottom of People to a manager-only Settings tab after Grades, which 404s to anyone else. The header's
own button now reads "Display settings" so the two are not confused.

**R12: archived classes.** My Classes lists active classes first and archived ones under a closed
Archived section with its count. The header strip shows active classes plus one Archived key; the
class you are standing on keeps its key even when archived.

**R14: no brown on the light theme.** Small classroom words and glyphs that painted `--gold` read the
`--hover-ink` role: brass on the dark themes as before, the green ink under Space White, where a
lightness-only gold measures as brown. Pins and instructor-only labels keep gold.

**R15: an open panel's toggle is lit.** Units, New post, Edit, Rename, a row's actions menu, a
course's Edit, Reject on a song request, the deck's slide index, People's class tools and the header
Menu carry `.on` while open, which the plate's key list lights.

**R01, R11: drops land in the right box.** On the edit form a spec JSON goes to the assignment's spec
importer and a web page to the ported-document box when the item has one; neither lands on the Files
list the class can see, and where the item cannot take one the form says so in words. A teacher who
drops files on the class page gets New post with them in place. `composerDropRoute` stays the one
decision.

**R04: help where the controls are.** Every classroom setting has an `i` tip beside its name with a
practical sentence, and the composer's type choice has a "Which type?" tip. `InfoTip` gained a
`tap` mode that stays open until a tap elsewhere.

**R02, R03, R08 (decision 42): the feedback console and dictation.** The console lives at
`/admin/feedback`, a site page with the portal's header; `/classroom/feedback` answers 307 there only
after the same gate (`requireFeedbackConsole`), so a non-admin gets 404 at both. The last status move
can be undone for ten seconds. Dictation closes each final result as a sentence, drops Android's
provisional and repeated finals (`FinalResults`), and never focuses the field on a coarse pointer.

**R09: the Matrix rain on a phone.** A phone in battery saver paints at 30 Hz, and the rain's judge
called a 33.3ms frame slow (the line was 34ms, one jittered frame away) and parked the rain. It now
degrades only when the MEDIAN of a 90-frame window is 45ms or longer (`judgeFrame`), after a 3s
start-up grace, and paints are paced by time (`paintDue`, about 30 a second on any panel) instead of
every other frame, which painted a 30 Hz phone at 15 a second and a 120 Hz one at 60. At phone width
the rain cannot get brighter (`--dim` has 0.09 of headroom over the trail), so `rainForWidth` halves
the fade and the streak runs about 1.9 times longer instead. The canvas carries `data-frame-ms` beside
`data-motion`, and `tools/browser-verify/_rain-mobile.mjs` reads both in an emulated phone.

**R10: the lines-of-code chip.** The figure counts up once on load through `countUp`, lifted out of
GAUNTLET into `$lib/count-up` (a frame or a 50ms timeout, so it finishes in a background tab; the
final figure at once under reduced motion; `data-counting` while it runs; the spoken name always the
final number). The pop-up gained a Recent updates list, each update's lines added and removed, from a
separate `--numstat` walk that runs only for the lazy changelog module and only over a complete
history (absent, never zero, on a shallow clone), filtered by `countsAsCode`, the census's own rule,
so a row counts the lines the headline counts. Removed lines are amber, never crimson.

**R05: clicking the building on the map plan opens it.** `mapsFrameTarget` decides when the plan's
outer frame is a link (a plan whose frame is a container other than the open level), the frame's href
is built by the same `nodeHref` the list row uses, and the frame is painted before the rooms with
`pointer-events: visible`, so a click on the building opens it and every room still opens its room.

**R13: the light-theme logo.** Six candidate palettes were drawn and rasterised side by side on the
real Space White grounds and under the projector wash
(`docs/feedback/2026-09-28/round1/logo-candidates-1x.png` and `-2x.png`), and SLATE shipped: the
emblem drawn flat, a slate gear with a lit green rim behind a deep green plate, white lettering at
7.59:1 on the plate, the plate 6.23:1 against the header strip. The retired lockup inked the letters
dark, and IDEA's letters are broad strokes with narrow gaps, so the gaps read as the word; the new
one keeps the lettering light. File names are unchanged, so `AnimatedLogo` needed no path change, and
the light pair is now 7.1 KB at 1x where it was 10.1 KB. Decision 40 carries a one-line amendment.
Switching palettes is one line in `tools/idea_logo_vector.py` plus two commands.

## The migration: 0225

`supabase/migrations/0225_classroom_team_edits_and_class_themes.sql`, numbered 0225 because that was
the next free number on `origin/main`, not the brief's 0230. Additive only: two nullable columns and a
paired constraint on `classroom_team_sets`, a nullable `theme_accent` on `classroom_sections`, two new
tables (`classroom_theme_votes`, `classroom_theme_settings`) with RLS on and no policy and no client
grant, and definer functions that revoke from `public, anon, authenticated, service_role` by name and
grant back to `authenticated` alone, which is 0166's shape. `classroom_team_board` is re-signed only to
project the two new columns. Its apply-time self-checks raise if a new table lacks row level security or carries a
policy or a client grant, if a column or constraint is missing, if any function has more than one
overload, is anon-executable or is not executable by `authenticated`, if a private helper is
executable by any client role, or if the team board does not project the edited mark.

Tested over seeded PRE-migration data: a draw was saved, posted and styled through 0223's real RPCs
before the apply, and after it the teacher's and the student's boards read back deep-equal to the
pre-apply boards once the two new (null) fields are set aside. The file re-applies cleanly over edited
draws and live votes, with one overload per function. `tests/db/classroom-team-edits.test.ts` and
`tests/db/classroom-class-theme.test.ts` drive the functions as the caller, including a student
refused a manager's move, a teacher refused a vote, a closed vote refused, the tie rule, a reset, and
the anon surface. The client degrades on `PGRST202`: the board's `editsReady`, the move's and every
theme transport's `unavailable`.

**What undoes it** is the drop list in the file's own header, section "WHAT UNDOES THIS MIGRATION":
drop the ten functions and two tables, drop `theme_accent` and its constraint, drop
`classroom_move_team_member`, re-paste 0223's `classroom_team_board`, then drop the two team-set
columns and their constraint. Those are destructive and a person's to run.

## Defaults taken, and why

- **0225, not 0230**: the brief's number was a placeholder; the next free one was taken.
- **Team moves need no confirm.** A move is one click, reversible by the same control, and is stamped
  "Edited by hand" where the class can see it.
- **Move to is a button that opens a row of team buttons, never a `<select>`** (fresh-eyes review):
  Chrome fires `change` on every arrow press in a select, so the first arrow moved the student.
- **A student is refused a vote only by the database.** The panel offers a teacher counts and no
  keys, because a control whose only answer is a refusal is not offered.
- **A reset stamps a time and deletes nothing**, and its confirm says whose votes stop counting and
  that each block's own colour stays.
- **Class-theme colours are fixed data, not a table**: six palettes, four patterns, six badges and
  six accents in `$lib/classroom/class-theme.ts`, each with a dark and a Space White twin moved in
  lightness only. The database stores ids and validates their shape, never the list.
- **The poll is 15 seconds while voting is open and 60 while closed**, and only while the panel is
  open and the tab visible; opening reads at once.
- **The feedback undo stamps `reviewed_at` afresh**, because it goes back through the same
  `app_feedback_set_status` call. No migration.

## Measurements

All at 375 and 1440 unless said otherwise, read off `node tools/browser-verify/run.mjs`'s own
summary lines.

- **The whole harness, on the rebased tree.** `Disclosure` gained a class and a callback and
  `plate.css` gained two lists, and `ProfileMenu` mounts a `Disclosure` on every page, so the gate
  was the full set rather than a selection. It was stopped at 963 of 1052 route/width runs, to save
  the last stretch of time: 16,319 measurements, 184 outside threshold, and **every one of the 184
  reproduces the committed store's pre-round reading count for count, spec by spec** (the IdeaCAD
  harness specs, 178 of them; the admin roster, 4; and the Space White home's emblem timing row,
  2). None is new. The 44 specs the stopped pass did not reach are the site tour,
  the tournament pages, the IdeaCAD preview chooser and the upload limits page, none of which this
  diff changed; they share `Disclosure` only through the profile menu, which every covered page
  also mounts.

- **svelte-check**: 0 errors and 37 warnings in 20 files (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), identical to the baseline.
- **Grading, the whole `grading` selection.** Before, on a pristine worktree of `6d59341d`: 72 runs,
  1024 measurements, 27 outside. After: 74 runs, 1088 measurements, 5 outside. The 22 that went were
  `/dev/grading-incomplete`'s export panel, which its spec could not open; the 5 that stayed are
  `/dev/classroom?view=class-teacher`'s `new-post` click, whose predicate never holds, **identical on
  the baseline worktree run alone**, and only in this selection because its label names a
  grading-category datalist. It passed in the full pass below, so the predicate is timing-bound
  rather than broken.
- **Grading, names on screen** (full rows visible in the first viewport; the first name's y):
  section console at 1440x900, 3 of 5 names at y=547 before, 5 of 5 at y=447 after; at 1366x768, 0 of
  5 before, 3 of 5 after. Ported console at 1366x768, 0 of 2 before, 2 of 2 after. At 375 the first
  name moved from y=811 to y=840 on the ported console, because the header grew by the pager and the
  two disclosures; that is the one width where the header costs the list, and the pager is what a
  phone grader uses.
- **Class themes**: 16 runs, 322 measurements, 0 outside, across the student, teacher, closed,
  no-votes, old-database, Matrix and Space White specs, plus the team edits spec. The worst
  graphical edge: Space White 4.30:1, IDEA 5.52:1, Matrix 5.68:1 (floor 3:1). The class name on the
  washed banner: Space White 6.04:1, Matrix 6.51:1, IDEA 7.01:1. "Your vote" on a lit key: 8.93:1.
  The module's own arithmetic, over every palette and accent on every ground: worst projected text
  4.70:1 (Space White), worst graphical 3.29:1 (the violet accent on the IDEA wash).
- **Teams**: Move to's team buttons 59.9x44 at the smallest, 8.01:1; a keyboard move puts the focus
  back on the moved student's own Move to (asserted in the spec and in
  `tests/dom/people-team-edits-mount.test.ts`, with arrow keys in the open row moving nobody).
- **Settings tips and drops**: 30 runs, 318 measurements, 1 outside, an "Enlarge" label 0px from its
  edge in `i-crowded?manage=1&sweep=fit` at 1440, **identical on the baseline**.
- **Mutation proofs**, each restored from a saved copy and md5-checked: the vote panel's poll guard
  (removing the "panel is shown" term reddens the new test); the migration's read boundaries, each in
  the permissive direction (a tally listing voter addresses, `classroom_class_themes` answering every
  section, the board handing `edited_by` to everyone, which the file's own self-check refused to
  apply, a departed or archived student's vote counting, `mine` carrying every voter's choice), 9 of
  9 killed; the feedback console's gate, undo bookkeeping and dictation dedupe, 10 of 10 killed; the
  count-up's timeout, the site-versions completeness guard and `countsAsCode`'s exclusions, 3 of 3
  killed; and the maps frame target, killed.

- **R09, the rain on an emulated phone** (390x844, DPR 3, the Matrix theme stored before paint):
  at full frame rate and under 4x and 6x CPU throttling it reads `running` at 3, 6, 10 and 15s on
  BOTH trees, so emulation does not reproduce the freeze. With `requestAnimationFrame` held to 30 Hz
  (`_rain-mobile.mjs --fps 30`) neither tree degrades in 12s at a steady 33.3ms either; the report's
  freeze needs a real phone's jitter over 34ms, which the unit tests model (a jittered 30fps with one
  dropped frame in seven never degrades now, and does under the old line). What the 30 Hz run does
  show is the paint rate: the baseline painted 120 times in its first 9s of rain (about 13 a
  second), this tree 270 (30 a second).
- **R10, the pop-up**: no sideways scroll at 375 or 1440, the added and removed columns right-aligned
  within 0.5px with every figure signed, the lowest ink the removed-lines amber at 5.39:1.
- **R05, the plan**: a point on the building and on no room opens the building by the same address
  as its row, every room centre still opens its room, the frame link is named, and focus draws the
  heavier stroke.
- **R13**: on the Space White home the light pair is fetched, decoded and displayed at both widths
  (a 59x59 gear and 104x49 lettering at 1440). The home spec's "light emblem fetched" row reads no,
  because it reads the resource timeline right after switching theme through the profile menu,
  before the lazy pair is requested; it reads the same on the baseline and is recorded, not fixed.

## Pictures

`docs/feedback/2026-09-28/round1/`: `<surface>-<theme>-<width>-before.png` from a pristine worktree of
`6d59341d` and `-after.png` from the merged tree, 13 surfaces in IDEA, Matrix and Space White at 1440
and 375, taken with `tools/browser-verify/_plate-shots.mjs`. `BASELINE.md` beside them says how.
Four surfaces are new in the after set and have no before: `class-theme` and
`class-theme-teacher` (`/dev/classroom-theme`), `teams-edit` (`/dev/instructor-tools?tool=teams&edits=1`)
and `class-settings` (`/dev/classroom?view=settings`). The feedback console's after pictures are
taken at its new representative harness, `/dev/feedback?view=console`, because the console no longer
renders inside the classroom shell. Space White is pinned on every surface, including the maps viewer
and the code counter, whose production routes are outside its scope.

## The fresh-eyes review

A reviewer who had not written the code read the grading console and the class theme vote. No
blockers; these were fixed before the push:

1. The vote panel's winners were filed under whatever course the page showed when the answer
   arrived. The panel now hands `onwinners` its own course id, and an unmounted panel tells nobody.
2. A voted option said so only by lighting; it now also reads "Your vote".
3. The cross-class pager walked the payload's order, not the grouped order on screen, so Next from
   the last name in one period jumped into the middle of another. `visibleStudents` is now the drawn
   order.
4. The selection bar counted every ticked name, including ones "To grade" had hidden. It counts the
   visible selection, which is what a batch writes.
5. Move to/Add to was a `<select>` acting on `change` (see Defaults).
6. The vote poll outlived a panel the database took away, and opening the panel waited up to a poll
   for fresh counts. Both fixed and tested.
7. After a vote, the header strip's key and My Classes' card kept the old look until a reload. A
   changed winner now re-runs the classroom layout's read through `depends('classroom:themes')`.
8. The Settings card drew defaults ("No color", "Voting is open") over a failed read. It now says the
   read failed and offers no control; the reset confirm names the voter count and says each block's
   colour stays.

Left as recorded: Previous with the open student hidden by "To grade" now says so rather than "Open a
student first" (a wording fix, not a new behaviour); the Tab order through the header's disclosure
bodies follows the DOM, which puts an open panel's contents before the pager; and `toGrade` counts an
in-progress draft as waiting, which is a design question for Mr. Pina rather than a defect.

## What was NOT verified

- **R08 and R09 on a real phone.** No container here has one. Dictation's Android handling is modelled
  on react-speech-recognition's own fixture, not measured. The rain's 30 Hz freeze does not reproduce in any emulation here (see
  Measurements); the fix is proven on synthetic frame intervals, not on a phone.
  **Mr. Pina's check:** on his Android phone in Chrome, press Report a problem, press DICTATE, say two
  short sentences with a pause, press STOP, and confirm they read once each with periods and the
  keyboard did not pop up; then switch the site to Matrix and confirm the rain runs.
- **Production.** No session here reaches the database, so 0225 is tested on the embedded Postgres
  with the real migration files, not applied. It must be applied BEFORE the move and vote controls
  can do anything; until then every one of them is absent and says why, which is the designed state.
- **Web fonts**: the harness blocks `fonts.googleapis.com`, so text was measured in the fallback
  stack. `prefers-reduced-motion` was `no-preference` in every run.
- **The deployed sha**: @@DEPLOYED@@

## Deferred

- `nav.ts`'s `feedback` place and its measure and breadcrumb arms are unreachable now that the console
  moved; left for the next change to that file.
- `/dev/classroom?view=feedback` still mounts the console inside the classroom shell;
  `/dev/feedback?view=console` is the representative harness.
- A student styling their team's banner still has the membership-gated write and no control.
- The class-teacher composer spec's `new-post` predicate and the "Enlarge" label, both pre-existing.
- **A Gold or Tangerine block colour reads bronze on Space White, and that is recorded rather than
  fixed.** Nothing gold clears 3:1 as a graphic on the washed light banner: the lightest gold that
  keeps its hue measures 2.55:1 at 30% lightness, against the 3:1 floor, so its Space White twin
  sits at 21%. A teacher who dislikes it on the light theme picks another block colour.
- Per-update line counts show only in the lines-of-code pop-up, not yet in the changelog panel.
- A student who leaves a course keeps their theme vote until a reset.

## Reverts

Each is one `git revert` of a commit in this push. The push itself is one fast-forward of `main`, so
`git revert <first>^..<last>` undoes it all; 0225 then stays applied and harmless, because nothing
else reads its objects.
