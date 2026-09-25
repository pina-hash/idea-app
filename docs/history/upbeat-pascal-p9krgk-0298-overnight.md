---
title: "Ledger 0298, the overnight run of 2026-09-25: every no-migration fix from the feedback export, built as implement-then-review agent pairs in six tiers; Tiers A and B live on main, Tiers C, D and E staged and held for after 15:30 Pacific, Tier F documents and two unapplied SQL proposals, and a pre-existing FRC completion hole found (`claude/upbeat-pascal-p9krgk`)"
date: 2026-09-25
branches: [claude/upbeat-pascal-p9krgk]
migrations: []
subsystems: [Classroom, Grading, Feedback, Theme, Foundry, Tournaments, IdeaCAD, Notebook, FRC, Coin, Tour, browser-verify, process]
---

This is the dated record of ledger 0298
(`docs/prompt-ledger/entries/0298-overnight-feedback-round.md`), the unattended overnight run
that built every fix from the 2026-09-25 feedback export that needs no migration. It ran under
`docs/feedback/2026-09-25/OVERNIGHT_BRIEF.md`, which superseded `ROUND1_PROMPT.md`;
`ROUND1_BRIEF.md` stayed the item specification and `TRIAGE.md` the evidence. The file name
carries a suffix because `docs/history/upbeat-pascal-p9krgk.md` already exists on this branch,
written earlier by the router session that wrote the round's brief, and the round's prompt says a
slug that already has an entry takes a suffix and says why.

No migration was written or applied. The two SQL files 0228 and 0229 are PROPOSALS under
`docs/feedback/2026-09-25/overnight/proposed/`, never under `supabase/`, and nothing applies them.

**Where everything is.**

- **Tier A (class-critical) is live on `main` at `d0fb9841`**, merged at 02:43 Pacific on Friday
  2026-09-25 and live at 02:43:27, from tested commit `3567c3d1`: the scroll lock after IdeaCAD
  (item 1), the missing-count mismatch (2), finished HTML worksheets reading Missing (3), posted
  teams (4), the Report control (5), and A6, every student file from an assignment as one zip.
- **Tier B plus the Tier F documents are live on `main` at `ab70d8c1`**, merged at 03:28 and live
  at 03:29:41, from tested commit `dbf231c6`: the HTML grading export (6), Space White colour, the
  light emblem and redrawn marks (7, 8), the profile pop-up (9), the Foundry sort control (10),
  tournament settings (11). Tier F rode along because it ships no product code: the FRC brief,
  the two SQL proposals with their `tests/db` files, and a `/dev`-only shape mockup.
- **Tiers C and E are staged on the local branch `wt/cde`** (worktree `/home/user/wt-cde`, head
  `7fadc2aa`) and **HELD until after 15:30 Pacific**: IdeaCAD live sync, snapping, the fillet
  corner warning and side submenus (C); items 12 to 18 and 20 (E).
- **Tier D (the notebook) is on the local branch `wt/notebook`** and held the same way. See the
  Tier D section for what is built and what is still running.
- **A Tier A follow-up is on this branch and not yet shipped**: `3d58c0fa` (a wording fix) and
  `db7a2a0f` (the live class grid reads a finished worksheet as Complete), with the Grades tab and
  the cross-class grading console still in progress. See TODO-A2 below.

## How it ran

**Phase 0.** `docs/feedback/2026-09-25/overnight/BASELINE.md` was written before any build agent
started, on `6064a101` (`origin/main` `abf070c7` plus the round's documents only), measured 21:50
to 22:30 Pacific on Thursday night. It lives under `overnight/` and not the `round1/` path
`ROUND1_BRIEF.md` section 2 names, because the ledger entry owns
`docs/feedback/2026-09-25/overnight/**` and not `round1/`.

- svelte-check: 0 errors, 37 warnings in 20 files (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), matching CLAUDE.md.
- Full suite: 598 of 599 files and 11319 tests passed, with 1 failed file and 1 error. Both were
  artifacts of a SHALLOW clone (311 commits): `tests/identity-style-shared.test.ts` runs
  `git show f9d43b49^:...` and failed at collection, and a teardown `57P01` was attributed to
  `tests/view-as-orphans-dropped.test.ts`. After `git fetch --unshallow` both re-ran green (2
  files, 36 tests), so the baseline is 599 of 599 on a complete history. Every later run used the
  unshallowed clone.
- `verify:browser --probe`: Chromium 141.0.7390.37, and rAF, IntersectionObserver,
  ResizeObserver, screenshots and canvas readback all work.

**Execution shape.** The container had 4 CPUs and 15 GB, so each workflow ran at most 2 agents
at once and up to six workflows ran together. Heavy commands were serialized machine-wide with
`flock` locks under `/tmp/claude-0/locks/`: `check.lock` (svelte-kit sync and svelte-check),
`test.lock` (vitest, only the touched files; never the full suite from an agent), `browser.lock`
(one `verify:browser` or `verify:readme` pass at a time, which CLAUDE.md already requires because
two passes manufacture findings) and `git.lock` (every commit). Agents never committed
`tools/browser-verify/README.md`; the orchestrator regenerated its counts block at each gate.

- **Worktrees on local branches kept later tiers off a Tier A merge.** Tier A ran in the main
  tree. Tier B's first four items ran in `wt/tierb` and were merged into the branch (`b1db851f`);
  item 6 and the classroom hover sweep ran in the main tree after Tier A shipped. Tier C ran in
  `wt/ideacad`, Tier D in `wt/notebook`, Tier E in `wt/tiere`, `wt/tiere2` and `wt/tiere3`, Tier F
  in `wt/docs` (merged as `960b1b1f`). The staged `wt/cde` merges `wt/tiere` (`4349e61c`),
  `wt/tiere2` (`4e3e009a`), `wt/ideacad` (`f858d42d`) and `wt/tiere3` (`e6128606`). Shipping went
  through a separate `ship-main` worktree (`/home/user/wt-gate`). An unfinished later tier could
  therefore never ride a Tier A merge.
- **Every item had an implementer and then an adversarial reviewer**, a second agent that re-ran
  svelte-check, the tests, the browser specs and the mutation proofs itself, and fixed what it
  found. Every review returned `ship`, and every one of them found something. The most important
  catch per item:
  - item 1 scroll: the new sweep test accepted any `:has(` as a room condition, so
    `body:has(main)` would have passed while matching every page;
  - items 2 and 3: the owed-work read was unpinned against a per-row RLS policy; a student's home
    load took 8,743 ms and an admin's 30,606 ms on the test cluster, 184 ms and 32 ms once the
    answers read was pinned to the caller;
  - item 4 teams: the code WAS partly at fault. The class layout load reads only
    `params.sectionId`, so SvelteKit never re-ran it inside a class, and People's post, take-down
    and retire refreshed People only. Fixed with a 60 s refresh and `invalidateAll`;
  - item 5 report: the Blade Rulebook's `* { cursor: none }` hid the pointer inside the injected
    report box;
  - A6: a numeric module title (legal under 0195's `btrim(->>)` check) threw inside a `$derived`
    and took down the whole grading console;
  - item 6 export: with names left out, a photo on the worksheet header was still listed by
    filename and caption;
  - items 7 and 8: commit `caf672a7`'s changelog line claimed green hovers before any visible hover
    had changed; fixed by shipping the classroom hover sweep in the same tier. The hover reviewer
    then found one more gold hover, through an alias;
  - item 9 profile: on the real home page with the 0220 identity columns, the Space White theme
    option sat 22.6px under the sticky Sign out footer;
  - item 10 Foundry: a failed play-count read rendered as "Nothing has been played here yet";
  - item 11 tournaments: a co-host's rename was silently undone by another host's save;
  - live sync: the harness had measured every "1440" reading in a 712px window, and the Live word
    overlapped the document name by 142px in 702 to 800px windows;
  - snapping: a line snapped edge to edge could not be made into a junction at all (Trim had no
    stub and Extend refused);
  - fillet: the new warning's advice was also given where following it is refused;
  - submenus: a finger tap on a touch-screen laptop closed the list it had just opened;
  - timer: the implementer's mutation proof ran on an earlier draft of `timer.ts`;
  - live door: the comments said the default class list gives the door about 200px; it is 366px;
  - voice: a pause mid-name opened the shorter name ("Lab 3" before "report"), and the privacy
    sentence said nothing was sent when Chrome and Edge send the audio to Google;
  - home tour: the cut-off date would never have offered the new tour to anyone who took the old
    one during class on 2026-09-25;
  - videos: the pane-mode gate had never been measured in a browser;
  - coin: an empty roster produced "every active student is already in a coin section";
  - quick note: moving between two headers mid-note lost the last typed word, and the quick note
    kept autosaving into a draft after it was turned in;
  - FRC brief: `frc_quiz_start` trusts a caller-supplied answer key (below);
  - 0228: the follow-on lock plan named two lock sites where the chain has seven checks in five
    functions;
  - 0229: the grant and the list reported different student counts, and the documented undo would
    have reverted 0216;
  - shapes: the mockup page failed `tests/classroom-shell-chrome.test.ts`, which would have turned
    CI red.
- **A6 got its own agent** rather than the items 2, 3 and 6 agent. The brief called giving it to
  that agent "the simplest way", not a requirement. Both edited `GradingConsole.svelte` with the
  Edit tool only, and no edit was lost (the status agent's commit `6cf971c9` staged only its own
  hunks and left A6's unstaged).
- **`classroom-updates.json` was appended by the orchestrator AT EACH SHIP**, not once at the end,
  so no change is ever live without its entry, and the orchestrator was its single writer. Agents
  proposed entries in their reports; reviewers corrected several before they were used (the teams
  "end of the school day" claim, the timer's "your device", the voice privacy sentence, the
  premature hover line). Thirteen 2026-09-25 entries shipped with Tiers A and B.

**Two decisions taken without Mr. Pina, recorded here per the brief's rule 5.**

- **"Complete, late" is judged from the LAST edit time.** `classroom_responses` has no
  `created_at` (0086: `updated_at` only), so a worksheet finished on time and edited after the due
  time reads late. Kept, because decision 37's wording is about when the work was finished and
  the only stored instant is the last write. Proposal 0228's revision history would make it exact.
- **The teacher's home to-grade tally does not count finished worksheets.** The status reviewer
  removed that read for its cost (the 30 s admin load above). The grading console roster does say
  Complete. A definer-function proposal (`classroom_worksheet_answers(p_item_ids uuid[])`,
  checking `_classroom_manages_item` once per item, 0166 grant shape) is recorded under Deferred.

**Shipping gates.** Each tier merged `origin/main` in, then ran svelte-check, `npm run build` and
the full suite, reading summary lines and stderr.

- Tier A: svelte-check 0 / 37 / 20, build OK, full suite 605 of 605 files and 11441 tests. Merged
  `--no-ff` as `d0fb9841`; live confirmed by the commit sha on `/` and by the injected Report
  control on `/assignments/MSET-Mold-01`.
- Tier B: svelte-check 0 / 37 / 20, build OK, full suite 610 of 610 files and 11567 tests.
  Merged as `ab70d8c1`; live confirmed including the light emblem assets.
- Browser-verify totals stayed at **211 measurements outside threshold, identical to the
  baseline's 211**, across 370 to 477 specs as the tiers added them: every measurement added
  tonight is inside threshold.
- **Tiers C, D and E are held until after 15:30 Pacific.** Rule 3 of the brief ends "Tiers C, D
  and E finish on the branch and merge after 15:30". Landing unannounced interface changes minutes
  before first period with nobody watching (a class list hidden by default on worksheets, voice
  moving into Search, a Note button in every header, IdeaCAD warnings appearing on old parts) was
  judged worse than a few hours' delay. The staged `wt/cde` passed svelte-check 0 / 37 / 20 and the
  full suite 620 of 620 files, 11680 tests. Tier D's gate: see TODO-D.

## Tier A: needed in class on Friday (live at `d0fb9841`)

### Item 1: the scroll lock that outlived IdeaCAD (R29, R07)

- **What changed.** `IdeaCadApp.svelte` carried an unscoped
  `:global(html), :global(body) { overflow: hidden; height: 100% }`. The shell is now
  `position: fixed; inset: 0` and the document rules are deleted; the same in
  `src/routes/ideacad/preview/+page.svelte`. A second leak of the same class was removed:
  `src/routes/ideacad/+layout.svelte`'s `:global(main)` reset, moved onto the launch page's own
  scoped `.launch-main`. The two hand-written body locks (ContentComposer, PathwayPicker) now share
  one counted lock, `$lib/shell/scroll-lock` (`lockDocumentScroll`). Commits `7cb8f67b`,
  `db542c77`; review `bcf435f9`.
- **Proved first.** A new spec, `ideacad-leaves-no-scroll-lock`, opens the real IdeaCadApp on
  `/ideacad/preview/chooser` (not `/dev/ideacad-app`, which mounts the app only against a loopback
  test database), follows a client-side link (proven by a window marker a full load destroys) to
  `/dev/tournaments`, and reads html and body overflow-y. Before: html and body `overflow-y:
  hidden`, scrollY 0 on a page 9177px tall in a 900px window, at 375 and 1440. After: 12
  measurements, 0 outside; scrollY 11786 of 12686 at 375 and 8304 of 9204 at 1440. A new
  `--break document-lock` preset is its negative control.
- **The launch page itself was locked in production.** `/ideacad` opens LaunchPage by default but
  imports IdeaCadApp statically, and importing a component is enough to load its stylesheet, so
  the IdeaCAD front door had the lock too, not only the pages after it.
- **Sweep test.** `tests/no-global-document-lock.test.ts` compiles every non-dev component with
  the real Svelte compiler and reads the CSS Svelte outputs: 444 non-dev `.svelte` files and 12
  route stylesheets. It fails on an html, body or `:root` rule with no room condition, and on a
  global rule naming no class, id or attribute. A bare `:root` in a component is output unscoped
  even without `:global` (measured). Four mutation proofs killed.
- **Review.** Any `:has(` counted as a room condition, so `body:has(main)`, `body:has(*)` and
  `body:has(:not(.x))` would have passed while matching every page. `bcf435f9` counts a `:has()`
  only when a class, id or attribute sits inside it and not under a `:not()`, with three planted
  positive controls; the old check fails 2 tests. The negative control is reliable only at a width
  whose prepare line shows one attempt: at 375 the Vite dependency reload discards the injected
  style.
- **R07 (5120x2626) is settled independently:** on fresh loads every `/dev/tournaments` view fits
  the window or scrolls to its end, and `?view=tv`'s body lock is TvStage's own `:has`-scoped rule.
  The report alone cannot tie R07 to the IdeaCAD leak.
- **Revert path if IdeaCAD looks wrong in class:** `git revert db542c77` (and `7cb8f67b` for the
  counted lock).

### Items 2 and 3: missing counts that disagreed, and finished worksheets read as Missing (R14, R13, R27)

- **R14.** `ClassView` counted only stream check-ins, which drops every check-in attached to an
  item (0120's `item_id`). The class page now counts every check-in, draws an attached one as a
  "Check-in: <status>" chip on its item's row (`checkInsByItem`, `attachedCheckInChip`, reusing
  `checkInStatusLabel`, `checkInTone` and `checkInStanding`), and the Missing, To do, Done and
  Check-ins filters keep an item whose attached check-in matches. The to-do still lists attached
  check-ins.
- **R13 and R27, decision 37's no-migration half.** `hxCompletion(manifest, responses, files)` in
  `html-assignment/progress.ts` is the progress rail reaching 100% (`hxProgress(...).complete`,
  not the sentence gate) and carries `at`, the latest `updated_at` or file `created_at` among the
  counted blocks. It reaches every surface as a derived `completed_at` / `completedAt`:
  `assignmentStanding` treats it as done, `studentWorkChip` says Complete, or "Complete, late" in
  the attention tone (`completionIsLate`). The state is never moved to `submitted`, because that
  locks saves (0197). The grading console gained a `manifest` prop, a Complete chip, and a
  per-block "changed after grading at <time>" list (`postGradeBlockChanges`).
- **The design turned on one finding:** saving an answer never creates a submission row (0086,
  0197); only a file, a grade, a submit or a close does. So a worksheet with typed answers and no
  photo had no row at all, and `withWorksheetCompletions` adds a derived draft row that carries the
  completion. `readAllPages` pages past PostgREST's 1,000-row cap and gives up at 10,000; any failed
  or throwing read answers "cannot tell" and the page behaves as before, never as "complete".
- **Commits:** `6782861e`, `99d0b0a7`, `6cf971c9`, `fe8c491b` (CLAUDE.md "WHAT A STUDENT OWES"
  corrected in place), `2070af0a` (harnesses); review `8186a3b6`, `431e6d21`; a later follow-up
  `3d58c0fa` fixes the reviewer's cosmetic "Work: photo photo added after grading" wording (on
  this branch, not yet shipped).
- **Measured by the implementer.** `/dev/classroom-standing` mounts the real ClassView, MyClasses
  and ClassroomFeed over one fixture: class page Missing 3 beside My Classes "3 missing", rows
  Complete, late / Check-in: Not filed yet / Complete / Missing / Missing, chips at least 98x44,
  chip contrast 5.06:1, 50 measurements, 0 outside. Grading console: Complete 8.67:1, Complete,
  late 6.36:1. Real Postgres (0195/0197 chain, real RPCs): 0 submission rows after saving answers.
  Five mutants killed.
- **What the review caught, and it is the one that would have hurt a class.**
  `loadClassroomWork` (home, My Classes, to-do) called `readWorksheetCompletions` without
  `onlyEmail`. `classroom_responses` RLS is checked per row, so every student's load visited every
  classmate's answer to refuse it, and the teacher side read every student's answers with
  `count=exact` and OFFSET paging. Scale probe on the real schema (7,200 answers: one 60-block
  worksheet, 4 sections of 30): the count as a student took 8,133 to 8,833 ms unpinned and 2 to 3
  ms pinned; `loadClassroomWork` took 8,309 to 8,743 ms per student and 30,606 to 32,274 ms as an
  admin, and after `8186a3b6` 184 ms (the student's own completion still derived) and 32 ms (0
  answers read). That fix pins every answers read to the caller, reads only classes the caller
  TAKES, and removed `WORKSHEET_TALLY_WINDOW_DAYS`. It also fixed a latent drop of EVERY
  submission row when the session had no email claim, and `431e6d21` fixed
  `tests/db/postgrest-shim.ts`, which kept only the last `.order()` (44 shim-using files, 782
  tests pass). A new test records every `.from()` and `.eq()` through the real loaders and is
  proven by three killed mutants; the implementer's suite had passed the unpinned mutant 7 of 7.
- **Semantics to know.** A checkbox a student never touched has no stored answer, so a worksheet
  with "check if applicable" boxes reads Complete only once every box is touched; the progress rail
  shows the same number.

### Item 4: posted teams students never saw (R23)

- **What changed.** Every one of a student's own teams shows first and open across every posted
  draw (`ownTeams`); the whole draw stays closed below it, labelled "All teams · <label>"; a
  teacher gets one line, "Teams posted until <date>", linking to People (`postedTeamsNotice`,
  `teamsManageLink` from `sectionTabs`), names only. "Today" on the post control now ends
  23:59:59.999 America/Los_Angeles through `schoolDayEnd` in `school-calendar.ts` (it used to end at
  the end of tomorrow on the browser's clock), and "5 days" and "2 weeks" now count today, so each
  ends one day earlier than before. Commits `b46f59f1`, `29ea2000`; review `21fdeb96`, `7a4c6fb6`.
- **Was the code at fault? Partly, and the implementer said no.** On real Postgres with 0223 the
  data path is right: a posted draw reaches a student, a closed window hides it from student and
  teacher alike, and re-posting restores it. But the review read SvelteKit's `has_changed` and
  found the class layout load reads only `params.sectionId`, so it never re-runs on a navigation
  inside the class, and `PeoplePanel`'s `runTeamAction` refreshed People only. A teacher who posted
  from People and then pressed Class saw the page as it was before the post, which is Mr. Pina's
  exact report ("I didn't see myself either unless it was in the People page"), and a student
  whose class page was already open never got the post. Fixed: `ClassTeams` takes an injected
  `refresh` transport (`refreshPostedTeams`, which answers null on failure and never the empty
  list), re-asks every `CLASS_TEAMS_POLL_MS` (60 s) while visible and on focus, keeps what is on
  screen on a failed read, and People's post, take down and retire now await `onchanged`
  (`invalidateAll`).
- **Measured.** 10 teams specs plus 3 live-door specs: 26 runs, 264 measurements, 0 outside. The
  new `later=posted` spec: the page loaded with no teams region, and after the harness posted and
  the window got focus the own card arrived without a reload (7 attempts and 2001 ms at 375, where
  the first presses land before hydration; 2 attempts and 384 ms at 1440). Contrast: strip 15.42:1
  default and 17.77:1 Space White; the own-team ink on its gradient stops 11.35:1 and 6.80:1
  (computed by hand, because the checker reads the page ground). `schoolDayEnd` spot checks across
  both 2026 clock changes are correct. Five reviewer mutants killed.
- **Added load:** every open class page calls `classroom_team_board` once a minute while visible,
  about 2.5 requests per second for 150 open pages, the same order as the hall pass's 45 s poll.
- **For Mr. Pina, to confirm what happened to his set:**
  `select id, label, posted_at, visible_until, archived_at from classroom_team_sets order by created_at desc limit 5;`
  (times UTC). `posted_at` empty means saved but never posted; `archived_at` set means retired;
  `visible_until` in the past means the window ended; `posted_at` before 2026-09-23 23:40 UTC means
  it was posted before the class page could show it. The team style editor stays unbuilt.

### Item 5: Report on every page, in the page's own colours (R30, R20, R35 second half)

- **Classroom header.** SiteFeedback moved out of the folded `.shell-tools` into its own
  `.shell-report` slot in `.header-right`, before ProfileMenu, at every width. Below 480px Menu and
  Report stack glyph over word. Measured with the real 100.6px ProfileMenu: Report was 0x0 at 375
  and 871 (inside Menu) and 94.8x44 at 1440; now 45x44 at 375 and 94.8x44 at 871 and 1440, hit-tests
  at its centre, one whole class icon still visible, 0px horizontal overflow, Menu 44x44 at 375
  (was 75.8). Word contrast 6.84:1 on IDEA and 9.02:1 on Space White (6.26:1 under
  `PROJECTOR_MODEL`). The reviewer re-measured at 360, 480 and 600 with the same result.
- **Every HTML page has a control or a tested reason.** `tests/feedback-coverage.test.ts` now
  sweeps every non-dev `+server.ts` that can answer HTML. Exempt, each with its reason in the test:
  `/a/`, `/b/`, `/hx/`, `/foundry/preview`, `/foundry/download`, `/foundry/starter`, the deck file
  routes, and `/admin/drive-connect/callback` (it shows a refresh token once). The carried-over
  `/assignments/<slug>` pages get an injected floating Report button (100x44, bottom-left): the
  shared `legacy-report-panel.ts` gained a `sessionProbe` mode, because those bytes are the same for
  every reader under `public, max-age=0, s-maxage=60, must-revalidate` with no `Vary`. The box asks
  `GET /api/assignment-feedback` (one boolean, `private, no-store`, `Vary: Cookie`) only when it
  opens, and the POST goes through `legacy-feedback-post.ts` with app `assignments`. Three
  mutations of the coverage test killed.
- **Room colours.** SiteFeedback and FeedbackBox read `--fb-room-*` hooks with the site token as
  fallback, declared as literals on `body:has(.frc-root)`, `.fsp-root`, `.tnm-root` and `.fg-root`;
  Space White is not widened to `/frc`. Worst ratios by canvas readback, identical at 375 and 1440,
  include FRC ink 14.39, muted 5.10, danger 4.73, edge 3.31; FSP saved 4.59, edge 3.25; the IDEA
  default's "Not saved" 4.14 to 4.90 (from `--crimson` to `--amber`) and the floating pill's edge
  from 1.18:1 (the decorative `--hairline`) to 4.44 and 4.02 (`--boundary`). Six room specs: 228
  measurements, 0 outside.
- **R20 to R29 recording `path=/` is not a stale-route bug:** they were filed from the home page's
  floating control, and the classroom-docked reports R30 to R33 carry correct routes.
- **Review.** The Blade Rulebook sets `*, *::before, *::after { cursor: none }` and draws its own
  dot at z-index 99999, below the box at 2147483600, so the backdrop, card, text box and button
  word all computed `cursor: none`. `02b99f22` injects `#<panel>, #<panel> * { cursor: auto }`
  (an id outranks the universal rule without `!important`, so crosshair pages keep theirs), closes
  the box on Escape and returns focus to the trigger with `preventScroll`. Negative control: 16 of
  23 elements hid the pointer and Escape left the box open; after, Escape closed it on 24 of 24
  loads. The reviewer also checked that the button covers no clickable element on any of the 12
  slugs scrolled to the bottom.
- Commits `bb9b28a4`, `c413c4de`, `cd6a267c`, `f92661bc`, `6169b939`; review `02b99f22`.

### A6: every student file from an assignment, as one zip, named by student

- **What it is.** A "Download all files" group in the grading console's Export panel, manager only
  (the routes' existing gates), with the count before the press ("10 files from 4 students in
  IDEA100 · Period 1 · Block 1") and one sentence per group filed separately or left out.
  `src/lib/classroom/bulk-download.ts` is the pure plan: it walks
  `classroom_submission_files` ROWS and never parses a document; names come from the roster
  (`splitLastFirst` over `display_name`), never an address; a row with no name is "Unnamed student
  N". One folder per student ("Reyes, Eva/"), files named
  `Reyes_Eva - <title> - <field, module or block id, or hand-in> - <n>.<ext>` with parts capped at
  40/40/32 characters and folders at 60, unique ignoring case. `index.csv` (existing `csvCell`,
  CRLF, a runtime BOM, times in America/Los_Angeles, late against `due_at`, the standing from
  `statusChip`) lists every file, fetched or not. `buildZip` from `$lib/foundry/zip-write.ts` is the
  writer; a 500 MiB `BULK_ZIP_BYTE_BUDGET` splits greedily by student; progress reads "Downloading
  file 12 of 42"; `holdDeployReload` is held for the whole build. Commit `997c3754`; review
  `40a55dda`.
- **"Drop, but say how many", adapted for a teacher's own download:** a student not on the roster
  is never invented as a roster row, and their files go under `_not-on-roster/student-N`,
  numbered and never named, because dropping a student's work from the teacher's own download is
  worse than filing it. No address reaches the zip, the CSV or the screen.
- **No new route was needed.** Storage rows download through the teacher's own browser client
  (0133's reviewer select policy, the pattern the feedback archive already uses in production), so
  the CORS question about the proxy's redirect never arises; Drive rows use the thumbnail's
  same-origin proxy URL. `downloadFilename` moved byte for byte to `$lib/download-name.ts` so the
  browser can import it; the server module re-exports the same function object.
- **A per-class payload is not per-class:** an item posted to several classes carries the other
  classes' students, so the control asks `classroom_section_roster(null)` once and says "N files
  from N students in your other classes are not in this download".
- **Found on the way:** on the all-classes console above 1024px `.roster-group` had no
  `min-height: 0`, so a long roster squeezed `.roster-tools` to 0px (199px of content) and the
  Export button's centre hit a group heading. After: 109px, and the grading-bulk regression pass
  (7 specs) measured 236, 0 outside.
- **Measured.** 13 tests (15 after review), 6 mutants killed; 3 specs, 76 measurements, 0 outside;
  the button 144.7x44; the zip read back in the browser: 10 entries, `index.csv` 11 lines, "Downloaded
  9 of 10 files. 1 file could not be fetched; index.csv lists it with the reason."
- **Review.** The plan runs in a `$derived` while the console renders. 0195's check
  `coalesce(btrim(v_mod->>'title'), '') = ''` accepts a module titled with a JSON number, and
  `asciiSafeName(5)` throws, so one stored worksheet could have taken the whole console down.
  Measured with the guard removed: pageerror, 0 roster rows, 8 of 11 outside. `40a55dda` reads block
  names as text only and wraps the plan so a throw costs only the control, which then says it is
  unavailable. It also used the row's own `created_at` (selected since `6782861e`) and corrected the
  console's off-roster sentence. A scale probe: 4000 files, 200 students, 6 sections planned in 38
  to 49 ms. At the 500 MiB budget, peak memory is about 1 to 1.5 GB in the teacher's tab.

### TODO-A2: the Tier A consistency follow-up (in progress on this branch, not shipped)

Three surfaces still read a finished worksheet the old way and can disagree with the class page:
the live class grid, the Grades tab (`assignmentStandings` counts only `state=submitted` as
awaiting) and the cross-class console `/classroom/grading/[itemId]` (no `htmlWork` snippet, so a
student with answers and no files reads "Nothing handed in yet"). A follow-up agent owns them.

- **Done so far, `db7a2a0f`:** the Live tab reads a finished worksheet as Needs grading, Complete
  or Complete, late, and never Missing. `readWorksheetManifests` and `worksheetCompletedAt` were
  split out of `readWorksheetCompletions` and exported, so there is one completeness rule, and the
  manifest arrives through `withWorksheetManifest` (two reads pinned to the item, no answers read).
  Its commit message reports the grading read at 272 to 291 ms before and 234 to 313 ms after on
  the test cluster (30 students, a 60-block worksheet), the manifest read 2 to 4 ms, and 6 mutants
  killed with a no-op control surviving.
- TODO-A2: the orchestrator fills in the Grades tab, the cross-class console (uncommitted
  `HtmlGradingWork.svelte` in the tree at the time of writing), the review verdict, and whether
  and when it shipped.

## Tier B: the rest of round 1's P1 (live at `ab70d8c1`)

### Item 6: the HTML worksheet grading export (R24)

- **What changed.** `GradingExportInput` gained `manifest`, read only when `spec` is null. Every
  header and module block exports, labelled `<module title>: <field>` (the header group is
  "Identity", A6's word); text as typed, radio as the choice, a checkbox Yes/No or blank if never
  touched, an image block as its file names, a table on its own sheet with columns the union of
  every student's keys. Completeness uses Tier A's `hxCompletion` and `completionIsLate`, the
  unmet list comes from `hxProgress`, each answer carries `postGradeBlockChanges`, and the JSON
  carries the manifest verbatim after `"spec": null`. The workbook gains an Answers sheet. The
  cross-class console now makes the same `htmlAssignmentMount` decision the per-class route makes;
  it used to pass a possibly leftover spec and no manifest. Commits `df005bc4`, `d1f5127b`,
  `e6bada3b`; review `cf862cb7`.
- **Characterized before the change.** `tests/grading-export-golden.test.ts` replays 9 cases
  generated from the export module as it stood at `83be5b9e` (161066 bytes: JSON bytes, every
  sheet cell, the workbook SHA-256, both filenames). The spec path is byte-identical after the
  change. The reviewer ran the golden against the pre-change module in a scratch tree (11 of 11)
  and a planted mutation there turned 2 red, so the fixture really predates the change.
- **`GRADING_EXPORT_SCHEMA` stays 1**, because it is in every file and bumping it would break the
  spec path's byte identity. The worksheet additions are extra keys only.
- **With names left out, the worksheet's header answers are withheld too:** a worksheet header is
  the student's own name field, and neither the brief nor TRIAGE noticed.
- **Review.** A photo stored on a header image block was still listed by filename and caption
  (JSON `files` and the Files sheet), and a withheld header image printed a blank that reads as "no
  photo". Answers stored under a block the manifest no longer declares (what a worksheet imported
  over an old spec assignment leaves) came out lossy: a spec table as an empty text, a multi-item
  checklist as one tick. `cf862cb7` withholds header files, checks "withheld" before the image
  branch, and exports such rows as `{ stored: <row> }`. Four reviewer mutants killed.
- **Measured.** 63 tests before review, 66 after; `/dev/html-assignment-grading?state=export`
  presses the real controls and reads the JSON, workbook and CSV back: 52 measurements, 0 outside,
  every cell matching the fixture, and the anonymous workbook containing no "Alvarez" and no
  "Team Meridian" against the named one's positive control.

### Items 7 and 8: Space White colour, the light emblem, the redrawn marks (R17, R26 colour, R16; decision 40 items 1 to 3)

- **Hover is a role.** `--hover-ink` is gold on the dark themes, green on Space White, and restored
  to gold in the dark-island block (the theme test derives the closure). The four accent-less
  launcher cards (classroom, notebook, ideacad, coin-desk) take green ink on Space White; the home
  page's brass hook, class chip and school year move off the brown `#715d22` (the year to
  `--cyan`). Measured: default card titles 5.87:1 (washed 4.70), where the old gold was 6.04:1, so
  contrast was never the problem, the hue was. Commits `caf672a7`, `663697c0`, `b6f31503`; review
  `fccb8f48`.
- **The classroom hover sweep.** A postcss walk of 631 style sources (11737 rules, 413 hover rules)
  found 37 hover declarations painting `var(--gold)` site-wide; the 33 in the classroom, shell,
  tour and one route file now read `--hover-ink`. The home page's "See all in To-do" and "Open
  class" (in `ClassroomFeed.svelte` and `app.css`, not `+page.svelte`) are cyan `#2b6a5d` at rest
  and green on hover on Space White. The instrument is new: `_hover-ink.mjs` copies the exact
  declaration block of every `:hover` rule reaching one marked node and reads the colour back from a
  canvas. IDEA reads `#c8a848` at 8.14 to 8.55:1 exactly as before; Space White green `#3b6c36` at
  5.21 to 5.87:1. The hover reviewer found a 34th, through a same-file alias (MyClasses
  `.class-card:hover { border-color: var(--acc) }` with `--acc: var(--gold)`), which the literal
  sweep could not see; fixed in `2b729c4c`. Commits `bf9d6534`, `1089b2bb`, `2b729c4c`.
- **Why the sweep shipped in Tier B.** `caf672a7`'s first line, "Space White hovers turn green
  instead of brown", became site changelog copy, but that commit only added the token: every hover
  it re-pointed already painted green. Shipping the classroom sweep in the same tier is what made
  the line true before it went live.
- **The light emblem.** `tools/idea_logo_vector.py` gained a palette parameter (the dark output is
  byte-identical) and an `--emblem` flag; `tools/idea_emblem_raster.mjs` rasterizes through the
  preinstalled Chromium because the container has no cairosvg or Pillow, into
  `static/IDEA/*-light*` at the existing srcset widths. AnimatedLogo picks the pair from the
  pre-paint theme attribute; the light pair is lazy and never fetched on dark themes (Chromium
  only). Pixel-sampled on the shipped 512px copy: letters 6.72:1 against the median plate, 8.20:1
  against the upper quartile. Space White pays about 10.1 KB more at 1x (not the report's 19 KB).
  The review fixed a latent defect: a caller passing its own images would have got a blank logo on
  Space White (`hasLight`, `class:has-light`).
- **Marks.** IdeaCadMark (a through hole cut into the top face through a per-instance mask),
  GreenlineMark (a chase-camera racer) and DashboardMark (the Admin card's mark; `AdminMark.svelte`
  is mounted only by `/dev/marks`) are redrawn, and every launcher mark now plays once (a `once`
  prop on seven marks). At 34px on Space White: 5.87, 5.26, 5.40:1. A probe finds 12 launcher marks
  and 0 animations running after 7.5 s; the implementer's first `.once *` rule lost to compound
  selectors in GAUNTLET and Tournaments and the probe caught it.
- **The dark IDEA theme paints identically:** a computed-style digest of every element on
  `/dev/home-order` and `/dev/themes` differed only by the intended mark redraws and `once`.

### Item 9: the profile pop-up (R18, R19)

- **What changed.** The panel measures its max height from its own top to the window's bottom on
  open and on resize, scrolls inside itself with a visible scrollbar, and stops above any fixed
  element under it (the floating Report and Voice pills, the install prompt), found by position
  with `elementFromPoint`, not by class. Sign out is a sticky footer. The pathway is one labelled
  native select that goes back to the saved value on a refused write; the 17 presets open from a
  "Change picture" row naming the current picture; Identity opens closed every time. The name uses
  `--text-1` (R19: it measured 1.29:1 on Space White, not TRIAGE's 1.4). No `/profile` page: a
  top-level route needs a short-link slug reservation, which is a migration. Commits `09ba975f`,
  `416ad04b`; review `20aa8ed1`.
- **Before**, in the classroom's full-height frame at 1440x900: the panel was 1305px tall with its
  bottom at 1367, 0 of 3 theme options hittable, 28 of 72 measurements outside. The frame that
  clips is not only `.cr-app`: `split.css` gives `.cr-root:has(> .cr-split:not(.page-flow))` the
  same `100dvh` and `overflow: hidden`. Clamped to the bare window, Sign out landed under the
  floating Report button on the home page at 375x667.
- **Review.** On the real home page with the six 0220 identity columns (production's state), the
  Report pill cut the max height to 549px, the panel needed 31px of scroll, and the Space White
  theme option sat 22.6px under the footer (the report had estimated 8). `20aa8ed1` moves Theme
  above Identity (a byte-for-byte block move), scrolls only the panel when Identity opens, and sets
  the select to 16px so iOS Safari does not zoom on focus (reasoned; no WebKit here). After: every
  theme option and Sign out take a press without scrolling at 375x667, 1366x650 and 1440x900, on
  the home page and in the classroom, in both themes; 384 measurements, 0 outside.

### Item 10: the Foundry gallery, one sort control (R11, decision 39)

- **What changed.** The ranked board region and the five sort buttons are gone; one labelled
  native select, default Most played, offers Most played, Trending, Played this week, Most hours,
  Most updated, Newest and Recently updated. `sortGallery` is still the only comparator, and
  `trending` and `new` joined `FOUNDRY_GALLERY_SORTS`. Each card's figure is the metric being
  sorted by (`foundrySortFigure`), which also fixed an older defect: under Most hours and Most
  updated the list printed play counts. A flat order says so in words (`foundrySortNote`,
  `foundrySortHasSignal`), and `FOUNDRY_PLAY_COVERAGE_NOTE` sits beside the control whenever the
  order ranks plays. CLAUDE.md's Foundry boards block was rewritten in place naming decision 39.
  Commits `20426fe5`, `d72ec183`, `a29b4ebd`, `223543fc`; review `f1349783`.
- **A second dead-space cause:** the multicol mosaic left a whole empty column, a 254.5px strip at
  1152 beside a 9-app list. `foundryMosaicFill` hands the real column count to CSS through a named
  container query; the strip is 0.0px after. The trade-off: on odd mixed cover shapes it can use one
  column fewer (4 instead of 5 at 1440 on the mosaic fixture, a 644px column-height spread against
  178px). Reverting `a29b4ebd` alone restores the old columns and keeps the sort.
- **Review.** A failed `foundry_play_counts` read reached the gallery as `{}`, the same input as an
  unplayed gallery, so every student would have been told "Nothing has been played here yet".
  `f1349783` returns `playCountsKnown` from the load and says the counts could not be loaded.
- **Measured.** Select 224x44 at 375, 1152 and 1440; 0 sideways scrollers; worst intra-column gap
  12.0px; 8 unit mutants and a browser mutant killed. The only rows outside threshold are the 19
  pre-existing `/dev/foundry-gallery?state=full-screen` rows at 375, identical to the committed
  2026-09-23 file.

### Item 11: tournament settings editable until it starts (R02)

- **What changed.** The host console has a Settings card for name, description and format,
  through `tournament_update` (0062, redefined in 0192), which had no caller. The format fields
  moved into one shared form, `TournamentSettingsForm.svelte`, over the pure
  `src/lib/tournaments/settings.ts`. Because the RPC replaces the config wholesale, the form
  rebuilds it from the stored config with the edited fields laid over it, keeping per-round
  overrides and unknown keys; only changed fields are sent (null for the rest) and the config only
  when the format changed. Once live or complete the format is a read-only summary with the reason.
  Qualifying on/off locks once pools exist, and score entry once a qualifying result is recorded
  (it feeds `_tournament_qual_seed_order`'s points-difference tie-break). The card sits above the
  Danger zone because it is 726px tall at 375. The create page's payload is byte-identical,
  key order included. Commits `1ac08733`, `a8960df6`; review `b852b5a9`, `0868d51b`, `0625d3ea`.
- **Review.** The form kept a host's whole draft after any edit, so it still held the OLD value of
  every field the host had not touched: host A editing the description, co-host B renaming, A
  saving put the old name back with nothing on screen (measured). `rebaseDraft` now takes the new
  stored value for every untouched field. A lock arriving mid-edit left a disabled unticked box
  over a stored "on" that the save would send; the refusal survived Discard; and the create page's
  lead overclaimed that every setting stays editable until the bracket. After: 16 of 16 tests, 18
  runs and 306 measurements at 375 and 1440 with 0 outside, and each fix has a browser negative
  control that fails under the old code.
- **The locks are UI-only.** A direct `tournament_update` call can still turn qualifying off in
  seeding while pools exist and orphan them. The SQL fix is under Deferred.

## Tier C: IdeaCAD, the no-migration half (staged on `wt/cde`, held)

### Live sync without a refresh (R34, decision 38's no-migration part)

- **What it does.** After each accepted save the direct modeler sends a ping of exactly
  `{documentId, conceptId, revision}` on the document's private channel; a ping is only a reason to
  read the database and can never write state. Every copy also reads `ideacad_concepts.revision`
  every 12 s and on focus (a direct select under the 0202 grant and 0205 policy; no RPC exists for
  it). `liveDecide` in `src/lib/ideacad/solid/live-sync.ts` is the one decision, weighed writing,
  then pending, then idle: a clean copy replays the new history rows in place and says who changed
  it; a copy with unsaved work keeps it and offers Save backup and a two-press Load newer version;
  a copy whose own save is in flight waits. The header reads Live or Live unavailable. Without the
  transport the whole layer is absent. `docs/ideacad/LIVE_SYNC.md` records the design. Commits
  `c86408a9`, `f079dd84`; review `1b1229e4`, `9b9f8655`.
- **An existing bug found on the way:** the Changes not saved recovery panel rendered below the
  visible model area in an `overflow: hidden` work area, so nobody could see or press it. It and the
  new update note are now in flow in the history row, covering 0 controls.
- **Measured.** Save in window A to change on screen in window B: 287 ms at 375 and 279 ms at 1440
  with the channel live (reviewer, stacked full-width windows); with B's channel refused, the poll
  alone 11.0 to 11.1 s. 26 unit tests, a real-migrations DB test for owner, editor, viewer and
  stranger, 7 plus 6 mutants killed; 128 measurements, 0 outside.
- **Review.** The harness put the two windows side by side at 1024px and up, so every "1440"
  reading had been of a 712px window. Stacked, the Live word overflowed onto the Document name by
  142px at 702 and 800 and by 25px at 1024, and overlapped the footer counts by 3px at 375. Fixed
  (it ellipsizes, then is removed below 100px of save line), and an unmount guard stops a read in
  flight from driving a terminated worker.
- **Residual:** realtime-js reports a socket error as `CHANNEL_ERROR`, which `live.ts` maps to the
  terminal refused state, so a wifi blip leaves that open workspace on the 12 s poll until reopened.
  Changing it is a shared-status decision for the blade path too.

### R05: sketch relations and snapping

- **What changed.** Snapping order is point, origin, midpoint, crossing, on a curve, aligned with a
  passed-over point (a dashed guide), level or plumb with the last point. A snap adds its relation in
  the same draft as the new geometry (Midpoint, a zero `pointLineDistance` shown as Point on line,
  Point on circle or arc, H/V on a line step), so one Undo removes both, proven on the engine and on
  the workspace Undo button. Ctrl or Cmd suppresses snaps and relations. Selections offer
  Coincident (the existing join), H/V for two points (on a visible construction line when no line
  joins them), Symmetric, Point on line, Collinear and Tangent at a shared end. No constraint kind
  and no stored shape changed; every sketch round-trips through `validateFeature`. Commit
  `b6d39f3e`; review `001391f0`.
- **Review.** A line snapped onto both edges ends exactly on them, and nothing could make it a
  junction: Trim had no stub to cut and Extend refused with "Nothing lies ahead of this line to
  extend to". `001391f0` makes Extend split the edge an end already lies on; the snapped divider
  now gives 2 regions (3.3 and 8.7) with a clean kernel solve.
- **Measured.** 27 tests; 44 browser measurements, 0 outside; the cue 22.7px from the pointer;
  `snapPoint` 3.46 ms per call on a 900-entity sketch.
- **A pre-existing defect, live today and not fixed:** the existing Distance to line offer stores
  `Math.abs(gap)` while the kernel's `pointLineDistance` is SIGNED, so a point on the right of the
  line's a to b direction jumps across it: (2,-3) at value 1 solved to (2,1). A fix changes how
  saved documents re-render, so it is Mr. Pina's call.

### R06: the open fillet corners

- **The cause is the kernel's corner blend, not the display mesh.** Where a round ends at a convex
  corner whose third edge is left sharp, the vendored kernel (remus `9307e73`) builds the ball
  corner that is correct only when all three edges are rounded, then closes the gap with a FLAT
  face: a step r^2(1 - pi/4) in area, r^3(2/3 - pi/6) short of a true round per corner. Volumes at
  r 0.25: kernel 11.945609, ball-plus-step model 11.945612, correct round 11.947848; four top edges
  at r 0.2: 11.878311, 11.878313, 11.882891. `fillet`, `filletJournaled` and `filletWithEvolution`
  all do it. Intersecting one-edge rounds gives the correct corner to 1e-5.
- **The display mesh loses nothing that shows:** per-face area agrees with the watertight mesh to
  1.4e-5 in^2, and the cracks at ball corners are at most 4.2e-4 of the radius (sub-pixel). The
  watertight whole-body mesh is 1.2 to 3.5 times slower to build and shares vertices across faces,
  so the display path and `EXPORT_TESSELLATION` are unchanged.
- **What changed.** `flatSteps` in `features/blends.ts` puts a warning on the round's row saying
  what happened and how to get a smooth corner (add the sharp edge to the same round, which the
  kernel then blends as a true ball). The geometry is NOT repaired: that changes stored face names
  and costs about 100 times a normal fillet. A second artifact matching TRIAGE's "thin dark wedge"
  was real and is fixed: a face lying exactly in a reference plane z-fought the plane's fill (2
  tones to 1 tone after `polygonOffset` 2/2 in `reference-layer.ts`). Commits `33338d6d`,
  `748a867b`, `18832c89`, `4b0e11aa`; review `f92b0b71`, `87303b07`.
- **Review.** Under a chamfered corner the round stops at a downward flat cap with no ball, and
  adding the "sharp edges" there is refused at every size tried (0.05 to 0.2). `flatSteps` now
  counts `{steps, balls}` and gives the advice only where the step sits beside a ball.
- **Class risk on merge:** every existing round whose corner has a sharp third edge (rounding the
  four top edges of a block, a very common move) will show a new amber Warning row.

### Item 19: right-click submenus open to the side (R04)

- **What changed.** In `ContextMenu.svelte`, on a fine pointer with room (`submenuLayout`, decided
  once per menu), a list row opens its list in a second panel after `SUBMENU_OPEN_MS` (150 ms),
  flipping at the edge; `SUBMENU_GRACE_MS` (300 ms) covers a diagonal move. `submenuPlacement` is
  `anchorPosition` with its axes transposed, because `anchorPosition` has no `'right'`. One
  setTimeout per panel, no rAF. Arrow keys and Escape work per the WAI-ARIA menu pattern (Escape in a
  side list closes only that list). Coarse pointers keep the in-place list with its Back row.
  Commit `b7309897`; review `66e6de1c`.
- **Review.** A touch-screen laptop reports a fine pointer, so lists open beside the menu, and the
  leave that follows a lifting finger closed the list 300 ms later (3 of 3 attempts at 1440). Hover
  timers now run only for `pointerType === 'mouse'`.
- **Measured.** 82 measurements, 0 outside, before review; 68 in the harness and 66 on the real
  modeler after, 0 outside; a broken build put 16 of 66 outside.

## Tier D: the notebook, first bundle (on `wt/notebook`, held)

### Quick note and the Inbox (R33)

- **What changed.** A Note button in the page header for every signed-in person, on every classroom
  and notebook page and the portal home; absent on the deck, projector, game, CAD and `/a/`, `/b/`,
  `/hx/` routes and when signed out. It autosaves a PRIVATE draft through the existing
  `createNote` / `editNote` transports (`submitted: false`, `autosave: true`), filed by route and
  never guessed: the class on a class route, the assignment title as `custom_label` on an
  assignment page, no class elsewhere. The notebook gains an Inbox of drafts that answer no
  check-in, newest first, each with a one-press "File to <check-in / class>". No student RPC can
  move an entry, so filing writes the note where it belongs and then deletes the old draft, in that
  order, limited to one-note, no-photo drafts. "Hide this button" is stored in
  `profiles.preferences.quickNote` through profile-io. The mirror is the notebook's own
  `draft-mirror.ts` under a reserved `quick` record that `latestMirror` skips. Commits `a561b59e`,
  `198417a0`, `232c0ba6`; review `129b5f90`, `f7171d53`, `9f3e49df`, `17355abd`, `46e8dbce`,
  `b8da2e5a`.
- **It does not fit beside Report at 375.** In the row it cut the class row from 65.4px to 11.6px,
  under one 46.7px class icon, which would break Tier A's report-slot guarantee, so below 560px it
  is the Menu's first entry. On the home page it is hidden from 521 to 899px, where it grew the
  banner (for example 64 to 105px at 871).
- **Review: seven defects, three of which could lose or leak a student's words.** Moving between the
  home header and a classroom header mid-note restored a mirror up to 400 ms old and autosaved it
  over newer words (the stored draft ended "Alpha Bravo" with "Charlie" lost). The quick note kept
  autosaving into its draft after that draft was turned in from the notebook, appending revisions
  staff can read (measured: "Before After"), which CLAUDE.md forbids. An editor removed while
  focused threw `state_unsafe_mutation` from `NoteEditor.syncActive`. Also fixed: a restore race, a
  stale mirror at pagehide, the capture card adopting the quick note's draft, a teacher's note on
  the grading page titled "Grading", a Save on an emptied box claiming success, an unclamped Inbox
  picker, and a 4 s cap on the restore wait. After: 20 tests, 26 runs and 298 measurements with 0
  outside.
- **Not built:** an atomic filing RPC. The proposal (`notebook_file_draft`) is under Deferred.

### The student log and the three templates (R32)

TODO-D: the second-half agent (`implement:studentlog` in `wf_14029fae-c91`) was still running when
this entry was written; its uncommitted files on `wt/notebook` included `log.ts`,
`note-templates.ts`, `NoteTemplates.svelte`, `NotebookHead.svelte`, `CheckInState.svelte` and
`ComposerFiling.svelte`. The orchestrator fills in what it built, its review, the Tier D gate
numbers, and the merge (the home-tour reviewer's dry run found `wt/tiere3` and `wt/notebook` merge
cleanly on `src/routes/+page.svelte` and conflict only on `src/lib/feedback/context.ts`, from other
Tier E work). Once Tier D lands, remove `qn-trigger` from `ARRIVING` in `tests/home-tour.test.ts`
and walk the student home tour once to confirm the Note step.

## Tier E: round 1's P2 and P3 (staged on `wt/cde`, held)

### Item 12: the class list makes room for work (R25)

On a ported HTML worksheet or a spec assignment, the class list opens hidden unless the viewer has
chosen (`navCollapseWorkSurface`, `navCollapsedFor`); only the explicit choice is stored (`'1'`
hidden, `'0'` shown, none never chose; an old `'1'` still reads as a choice). The toggle says "Hide
class list" or "Show class list" beside the item title and has a tour step in both classroom tours.
At 1440 a student on a spec assignment gets the item pane 1376 of 1440px and a 152.5x44 button.
Commit `62423785`; review `324e38ff` (the tour step said all assignments open hidden; only the ones
filled in on the page do). Not fixed: on SSR the default is computed without localStorage, so a
viewer who chose "shown" gets a server paint hidden, then a client flip.

### Item 13: the live class timer

`formatReadout` rounds once; the control view reads hundredths always, the wall tenths and
hundredths once a countdown's face crosses 10.00. `tickEachFrame` schedules each tick as an
animation frame AND a 50 ms timeout, whichever fires first, and the wall sleeps until its digits
change (`timerHoldMs`). In the last 10 s the wall pulses one ring per second and the control view's
digits beat, behind `prefers-reduced-motion: no-preference`; `PROJECTOR_FRAME_KEYS` is untouched.
The wall is sized once per timer, which also fixed a size jump at 9:59, but whole-second digits are
6 to 16% smaller (160 to 135.1px at 1280x800 with an agenda); `FRACTION_SCALE` (0.6) is the one
number to change. Measured: 60 distinct readings in 60 frames on the control view, 10 to 11 on the
wall; at 4x CPU the control view is 6.9 ms of each 16.7 ms frame with no dropped frames; 394
measurements, 0 outside. The fixture's "Quiz 2" at now plus 90 min failed the agenda spec every
night after 22:30 Pacific and is clamped. Commits `65bf8a6d`, `7ab0adb0`; review `9838734f`. Review:
the mutation proof had run on an earlier draft (redone on the committed file: rAF alone fails 4
tests); the comment above the 250 ms clock still described a plain interval as rAF-or-timeout; and
a projector opened with `window.open` shares the control view's renderer main thread, 741 ms/s busy
at 4x in the last 10 s (about 12.4 of 16.7 ms), within budget but tight.

### Item 14: the Live class door (R21)

The door is on the class page, not the home page (`[sectionId]/+layout.svelte` only). The count is
a no-wrap span ("27 on"), the title alone ellipsizes, and the door takes the hall pass and music
tools' type. Before, at 871 in a three-tool row, the count wrapped onto 2 lines and the title showed
135 of 670px; after, the count is one line and the title shows 82 to 89px because the uppercase
word is wider. The reviewer measured 24 runs and 315 measurements, 0 outside, and corrected the
comments: the default 26rem pane leaves the tools row about 23rem (366px), not about 200px. Commit
`16a57bcf`; review `13beab75`. The tool type is now copied in three files (LiveDoor, HallPass,
SongQueue); a shared class-tools shell should replace all three.

### Item 15: Duplicates leaves the tab bar (R28)

Duplicates is out of `sectionTabs` (five tabs now); the route, its 404 gate and the
`class.duplicates` command stay, and both ways in build the address with `classDuplicatesHref`. A
"N duplicate drafts" link beside the Drafts filter shows only for a teacher with at least two drafts
and only when `loadDuplicateCount` (the same `classroom_duplicate_drafts`, 0187) answers above zero;
any failure shows nothing. The nav-doors assertion was generalized, not deleted. Link 149.4x44 at
7.63:1; 33 runs, 465 measurements, 0 outside. Commit `bfd6c321`.

### Item 16: voice folds into Search (R31)

VoiceNav and its two mounts are gone; Search has a Speak control. `matchSpoken` in
`$lib/voice/commands.ts` is exact, over the palette's own rows (`runnableCommands` over
`commandsFor(env)`); a tie opens nothing; nothing is built until Speak is pressed; a partial result
acts only after `VOICE_INTERIM_STABLE_MS` (300 ms) unchanged. Commit `a8eb5689`; review `475592d5`,
`af005317`. Review: with "Lab 3" and "Lab 3 report" both listed, a normal breath held the partial
"lab 3" still past the window and opened the wrong item; a partial now waits while any longer name
begins with it. The listening note said "nothing is recorded or sent" while Chrome and Edge send
the audio to Google and Safari to Apple; it now names the browser's speech service and keeps every
"never" on the portal. The palette maps its own no-speech sentence (`VOICE_NO_SPEECH_NOTE`) instead
of dictation's "Press DICTATE", but `dictation.ts` itself still says "Press DICTATE" where the button
now says Speak. Measured only against a stub recogniser: exact partials acted after 334 to 389 ms;
190 measurements, 0 outside. Voice no longer exists outside classroom Search, which is the brief's
default and Mr. Pina's to confirm.

### Item 17: the home tour (R22)

`orientation.ts` holds a student tour and a staff tour chosen through `classroomTourFor`, in page
order: welcome, the profile menu (picture, pathway, Identity, Theme including Space White), the
Note button when present, the to-do, the classes, the Apps strip, one stop per card from
`visibleApps(isAdmin)`, Report (read from `REPORT_LABEL`) and Take the tour. Search and the Light
switch are named in words because the home page has neither control. A student walk is 18 steps
(was 8), an admin 19, a non-admin teacher 17. Anyone whose `tour_completed_at` predates
`HOME_TOUR_VERSION` gets a one-row offer (`HomeTourOffer.svelte`, 62px at 1440, 115px at 375),
recorded the moment it shows, with the written stamp never earlier than the version. Commits
`a553cb95`, `cededf23`, `ee9d4d14`, `fdd29460`, `8c881a6b`, `56e79036`; review `7c8057b1`,
`8f46a78a`, `0be3fbe4`. Review: the version was the start of 2026-09-25 while Tier E cannot ship
before 15:30 that day, so anyone who took the OLD tour during class would never be offered the new
one; it is `'2026-09-26'` now, safe because the stamp is clamped. The non-admin teacher walk was
added, and the student spec now expects a Note step exactly when `qn-trigger` is shown. 342
measurements, 0 outside. Until 2026-09-26 00:00 PDT the written stamp is a future timestamp; nothing
else reads that column.

### Item 18: a Videos view per class (R08)

A closed `Disclosure` under the class search row lists every YouTube video linked in the posts the
page already loads (body documents and student-facing links, never `instructorLinks`), through
`safeHref` then `youtubeVideoId`, one card per video with `referrerpolicy="no-referrer"`, "Posted in"
and "Also in". Drafts and scheduled posts are never listed; a teacher gets a held-back count. No new
read, table or fetch. Commits `5af17331`, `c8d99581`; review `a824cee4`, `b8eecd0c`. Review: the
CLAUDE.md edit said the section "never reads" drafts, but it reads them to count them; and the
pane-mode gate had never been measured, so a `?state=pane` harness state and spec were added (0
cards beside an open post, 5 rows present). 180 measurements, 0 outside; 6 mutants killed.

### Item 20: fill a coin section from a class roster (R12)

`SectionManager` gained "Import from class roster" through an injected transport over
`loadSectionRoster` and `splitRoster`. `coin_section_students` is keyed on the email ALONE (0073),
and `coin_admin_assign_section_students` upserts on it, so sending a roster would silently MOVE every
student already in another coin section; the import sends only active, non-teaching students with
no coin placement, refuses when the roster cannot say who teaches or the placement read fails, and
re-plans at the press. Commit `1fe0c91d`; review `405c3b82` (an empty roster claimed everyone was
already placed; archived coin sections are now marked; font literals moved to tokens). After the
press in the harness the roster went from 2 rows to 29 and nobody was moved; 206 measurements, 0
outside; 11 distinct mutants killed (the implementer's 8, four of them re-run by the reviewer, plus
the reviewer's own 3). A one-round-trip race with another admin remains; closing it needs
an insert-only RPC.

## Tier F: documents and mockups (shipped with Tier B; no product code)

### The FRC redesign brief (R35 first half)

`docs/frc/REDESIGN_BRIEF.md` (commit `0574c94a`; review `9072e8aa`) inventories `/frc` against the
tree and proposes a skills map where each skill ends in one proof: a GAUNTLET Speedrun clear (only
Speedrun is a live mode), a graded classroom hand-in, a notebook build log, or a bench sign-off.
It answers the four QUEUE session 5 questions with recommendations and lists what must stay
resolvable. It grew from 325 to 387 lines in review.

**A security finding outside tonight's scope, measured by the reviewer.** `frc_quiz_start` (0040)
is granted to `authenticated` and stores the answer key and pass mark its CALLER sends;
`frc_quiz_grade` then writes `frc_user_progress`. On a test database built from the real chain
(0001, 0003, 0020, 0067, 0039 to 0042, 0046, 0137, 0167), a plain `@boscotech.net` student sent a
one-question key with pass mark 0 and got a completion row for MDM-4 and for an invented id
`BENCH-DRILL-PRESS`: 0 rows before, 1 after, no reviewer involved (the inverted expectation fails,
as a control). Cooldowns live only in `quiz-service.ts`, so a direct call skips them. It is
pre-existing since 0040, not a regression, and closing it needs a migration. The brief now reads a
bench sign-off from an APPROVED `frc_gate_submissions` row (a student can only set `submitted`
under 0042's policies), lists closing the quiz as the first later migration, and gives two
single-statement SQL boxes, one of which separates an honest-shaped row (MDM-2:90:6) from a
self-sealed one (MDM-4:0:1). Nothing is graded on these rows today, so no class is affected; whether
anyone has used the hole in production is unknown. The brief describes the mechanism in words only;
the function source has been public in 0040 all along.

### Proposed 0228: a teacher-only edit history for answers (decision 37)

`proposed/0228_classroom_response_revisions.sql` (commit `8b444d8f`; review `3e13777e`, `1d6c8635`)
adds `classroom_response_revisions`, written inside `classroom_save_response` for both engines: one
revision per 10-minute burst per block, closed by a grade so the graded value is kept, a baseline
for an answer saved before the table existed, nothing for a same-value save. Reads go through
`classroom_can_review_submission` only; a student sees none of their own. A diff guard refuses
unless the deployed save body has 0197's md5 `b717bc0d86be3a3a66d194d62964bd2a`. Its test,
`tests/db/proposed-0228-response-history.test.ts`, runs the chain through 0224 plus the file from
its proposed path: 19 tests, a 39-case corpus with 0 differences refusal text included, 6 plus 3
mutants killed. **Decision 37 item 2 (a student's own turn-in stops locking saves) was split out**,
because 0198's close leaves a student's turned-in row byte-identical, so keying on `submitted_at`
would let a student keep writing after the teacher closes. The follow-on is specified as items a
to h in the header; the review found the lock lives in SEVEN checks across five functions
(including `classroom_open_submission`, the sign step of every photo upload), added item h (a
backfill for returned-then-closed rows), and corrected the known-limit prose on the grade race.
Concurrency was reasoned, not measured. When promoted, CLAUDE.md's 0129 append-only paragraph must
name 0228 as the second narrowing, licensed by decision 37.

### Proposed 0229: a live class EDIT grant on an IdeaCAD document (decision 38)

`proposed/0229_ideacad_class_edit_grant.sql` (commit `f51b6edc`; review `8cd42c89`) adds
`ideacad_section_edit_grants` (no role column; every row is an editor) and one arm in
`_ideacad_document_role`, evaluated live against the active roster, so every write gate that asks
the role reaches a class editor with no gate rewritten. `_ideacad_part_owner` is deliberately NOT
widened, so a class editor gets exactly what a personal editor gets and the four owner-only assembly
writes stay the owner's (decision 30). Its test: 37 tests after review, a 96-entry before/after
corpus, 9 plus 8 mutants killed. Review: the grant reported 5 active students and the list 6 for the
same class (now one private helper, `_ideacad_class_edit_reach`); a self-check searched the whole
function body and passed even with the new arm's roster terms removed; and the documented undo
("re-paste 0214 sections 4 and 7") would have reverted 0216's solid-v1 refusals, so a tested
`undo-0229_ideacad_class_edit_grant.sql` now exists. Two questions for Mr. Pina before promotion:
may a teacher give a class edit access to a STUDENT-owned document, and may that student then revoke
it (the proposal says yes to both).

### The Space White shape language mockup (decision 40 item 4)

`/dev/themes-shape` (404 in production) and `docs/feedback/2026-09-25/overnight/shapes.md` with five
screenshots (commit `601d73a6`; review `56e04f9b`, `50c7fc6c`) show today's Space White beside cut
corners, hexagonal chips and a frosted class menu, all gated to Space White and
`@supports (corner-shape: bevel)`. It uses `corner-shape: bevel`, not the brief's clip-path idiom:
a clip-path chamfer draws 0 of about 729 focus-ring pixels and no border along the cut (1.00:1),
where corner-shape keeps the full ring (102%) and the diagonal border at 5.59:1. 160 measurements, 0
outside. Review: the page mounted ClassroomShell without joining `CLASSROOM_SHELL_HARNESSES`, which
failed `tests/classroom-shell-chrome.test.ts` (it would have turned CI red); the quoted glass floor
was for `--text-1` when the menu's class codes are `--text-2` at 4.52:1 under the projector model (a
0.02 margin over 4.5); the phone figure was on a solid fill (0 of 5 labels on glass at 375); and the
blur cost for the proposal alone is about 2x (3.7 against 2.0 ms per frame, software compositing),
not 3 to 4x. Nothing is applied to a real surface; he approves first.

## What was NOT verified

- **Anything against production.** No session here can sign in or reach the database, so no RLS
  read, RPC or write was exercised against real Supabase or PostgREST: the worksheet completion
  reads (`count=exact` with `.range()` and an embedded `!inner` filter), `classroom_section_roster`,
  `classroom_duplicate_drafts`, `tournament_update` from the new form, the notebook note RPCs and
  `notebook_seal_notes`, the profile-io writes (`quickNote`, `tour_completed_at`),
  `ideacad_concepts.revision` through PostgREST, the coin placement read. Load cost of the
  worksheet reads was measured on the embedded cluster only; the ratio, not the absolute, is the
  finding. Whether 0223 is applied and the state of Mr. Pina's team set are unknown (the SQL line is
  above).
- **No signed-in real route.** `verify:browser` covers `/dev` harnesses only; every harness mounts
  the real component, and several route wirings (the class layout's teams refresh, the grading
  routes' server loads, the host console's realtime refetch, the offer's SSR on `/`) are covered by
  svelte-check, source tests and harnesses only. `/dev/classroom-live-door` does not set
  `--cr-measure-route`, so its 1440 row may be wider than the real page's.
- **Supabase Realtime.** A private `ideacad-doc` channel join for a solid-v1 writer, a delivered
  broadcast ping, and `channel.send` before SUBSCRIBED falling back to REST.
- **A6's bytes.** Real Storage and Drive downloads under a teacher's session, the degraded rung's
  cross-origin fetch after a 302, a split past 500 MiB, and memory on a school desktop.
- **No WebKit, Safari, iOS or Firefox** in the container: `position: fixed; inset: 0` and
  rubber-banding behind the IdeaCAD frame, the iOS select zoom fix, `corner-shape` and glass
  fallbacks, the lazy emblem's no-fetch claim, the report box's print rule.
- **Real speech recognition** (only a stub recogniser), the microphone prompt, and whether 300 ms
  feels right; **real touch hardware** and a real moving mouse across the submenu panels; real
  Ctrl and Cmd keys on macOS.
- **A physical projector and an old school desktop.** Wall figures are `PROJECTOR_MODEL`'s; frame
  cost used CDP 4x CPU throttling in the dev build; no GPU for the blur cost or the IdeaCAD
  polygon offset, and hidden-lines mode was not rendered.
- **Fonts and motion.** The harness blocks Google Fonts, so all text was measured in the fallback
  stack; `prefers-reduced-motion: reduce` was exercised only where a spec emulated it (the timer,
  the glass gate).
- **Documents in their consumers:** the exports opened in Excel or Google Sheets, real production
  worksheet table shapes (only the two in the fixtures), real i.ytimg.com thumbnails and the
  missing Referer, native select popup colours, scrollbar paint (headless reports width 0), Vercel's
  shared cache actually serving one copy of an assignment page.
- **The proposals.** Neither 0228 nor 0229 was applied to a hosted project or pasted into the SQL
  editor (only the repo's two-rule paste-trap check, with planted controls); 0228's concurrency (the
  advisory lock, the grade race) is reasoned.
- **Which R06 defect Mr. Pina saw.** The screenshot is not in the tree; the flat step and the plane
  wedges are both real and both handled.
- **The `:global(main)` leak** did not reproduce in dev and is fixed on reasoning about production
  CSS order; the fix is safe either way.
- **R07 on a real tournament page** at 5120x2626 with real data.

## Claims in the brief or TRIAGE that were wrong

- Scroll: the IdeaCAD rule was not the only `:global(html|body)` outside `/dev`
  (`BladeEditor.svelte` `:global(body){margin:0}`, the reference page's print rule, and the same-class
  `:global(main)` leak in `src/routes/ideacad/+layout.svelte`).
- Scroll: `/dev/ideacad-app` mounts IdeaCadApp only against a loopback test database; `/ideacad`
  opens LaunchPage by default but imports IdeaCadApp statically, so the launch page was locked too.
- Scroll: TRIAGE's `scrollTo` repro works only because the rule pinned the height; a body-only
  overflow lock stops a wheel but not a scripted scroll, so computed overflow is the signal.
- R13/R27: a past-due worksheet with typed answers reads plain "Missing", not "Missing, draft
  saved"; saving an answer creates no submission row (0086, 0197). Source comments claiming 0086
  creates the row on first save were false and are corrected.
- CLAUDE.md "WHAT A STUDENT OWES" implied the surfaces could not disagree because the predicate is
  one function; the inputs differed. Corrected in place.
- R23: `loadPostedTeams` is defined in `class-teams.ts`, not the layout server; the "today" bug made
  windows LONGER, so it cannot explain a closed window; and the load that never re-ran inside a
  class was a real cause TRIAGE did not name.
- R30: no browser-verify spec opened Menu to reach Report (only a helper comment named it); the
  "Menu on a narrow window" phrase was in `context.ts`, not CLAUDE.md.
- R20: the list of pages without a report control missed `/foundry/preview`, `/foundry/download`,
  `/foundry/starter` (including the Foundry-closed refusal page), the deck file route, and IdeaCAD's
  glyph-only Report below 700px; the `path=/` reports are not a stale-route capture.
- R35: the floating pill's only edge was the decorative `--hairline` at 1.18:1 on the IDEA default,
  not only under Space White.
- A6: `downloadFilename` was server-only; the console has no roster section filter (the Export
  panel's class picker is what the download follows); a per-class payload includes other classes'
  students on a multi-posted item; `uploaded at` needs no widened shared select.
- R24: the manifest WAS passed to the console on this branch after Tier A; the cross-class console
  was missed; `tableBlocksOf` took columns from the first student only and a colon cannot be in a
  sheet name; a worksheet header holds the student's own name; table values come as lists of objects
  and lists of lists; bumping `GRADING_EXPORT_SCHEMA` conflicts with the spec path's byte identity.
- R26: 33 classroom hover declarations in scope, not "about 29" (37 site-wide, plus one alias); the
  two brown home links are in `ClassroomFeed.svelte` and `app.css`, not `+page.svelte`; the gold
  cards measured 6.04:1, so the defect was hue, not contrast; the Admin card renders DashboardMark,
  not AdminMark; LiveDoor does not belong in the colour cluster (its hover is `--accent-ink`).
- R19: the pathway-tinted name measured 1.29:1 on Space White, not about 1.4. R18: the clipping frame
  includes `split.css`'s `.cr-root:has(> .cr-split:not(.page-flow))`, and a clamp to the bare window
  alone put Sign out under the Report pill; ClassroomSettings is not a home for the full editor.
- R11: five browser specs needed rewriting, not four; the mosaic printed play counts under Most hours
  and Most updated; a second dead-space cause (an empty multicol column) survives the board removal;
  `/dev/foundry-boards` had no production 404 guard (nor do `coop-netcheck`, `deploy-safety`,
  `foundry-author` and `profile-menu`).
- R02: `tournament_update` had no caller (a literal grep matches `tournament_update_entry`); its gate
  admits a host OR a site admin since 0192; orphaned pools stay visible in EntryDetail and come back
  when qualifying is turned on; changing score entry after a result mixes the tie-break.
- R05: on-curve cannot rank above intersection (every intersection is on two curves); Tangent works
  only at a shared end; point-to-point H/V needs a construction line; Coincident is the join, not the
  `coincident` kind; alignment is a guide with no stored kind.
- R34: the history actor is an email, so "Updated by" is derived through `timelineActors`; pings fire
  only on saves and cannot give presence; no RPC reads the revision; the recovery panel shown on a
  collision was invisible, which TRIAGE did not find.
- R06: the display mesh is not the wedge (no lost area, sub-pixel cracks); the valid B-rep is the
  wrong shape; the proposed `tessellateSolidGroupedBinary` path would smooth every sharp edge and is
  1.2 to 3.5 times slower.
- R04: `anchorPosition` has no `prefer: 'right'`; `anchored.ts` needed no change.
- Item 14's heading: the door is on the class page, not the home page. Timer: the LiveControl comment
  claimed rAF-or-timeout over a plain `setInterval(250)`; the tenths default is TRIAGE R27's owed
  decision 6, not decision 37.
- R12: routing an import through `coin_admin_assign_section_students` MOVES students, because a coin
  section is one per student.
- R31: CLAUDE.md's "the palette, the legend and voice read it" was false (voice read `PORTAL_APPS`);
  `nav-collapse.ts` said "per person, not per browser" over localStorage; the deleted voice harness
  claimed the harness Chromium has no SpeechRecognition (it has both constructors).
- R22: the theme switch and Search are not home-page controls; `orientation.ts` was last changed in
  `77778647` (2026-08-15), not `3a392b0`; the notebook tagline problem is also the launcher card's
  own tagline in `portal-apps.ts`.
- R08: decision 23 is about the link-preview fetcher's DNS pinning, not YouTube cards.
- R33: only the two PHOTO posts use `trackInFlight`, not `createNote` or `editNote`; no student RPC
  moves an entry (`notebook_admin_override_entry` is admin-only); CLAUDE.md's "a third mirror is a
  third module" is about a new payload, and the quick note is the same payload.
- R35 and QUEUE: the quiz is not practically passable by picking the longest option (0.0 to 0.9% per
  attempt, 98 to 141 hours of expected cooldown, F1 and F3 never), but it can be bypassed entirely
  (above); only Speedrun is a live GAUNTLET mode; MDM-8 has 6 drill answers and Foundation's written
  drills are one placeholder line; there are five stale "F1 is the only bank" statements, not three;
  the FRC add-on's torque check stores nothing; a reviewer can approve their own request and no
  signer is recorded; `docs/history/record-frc-training-track.md` says sixteen CAD units where ten
  are authored.
- Decision 37 item 2 and R27 understate the lock change (0198's close leaves a turned-in row
  byte-identical; seven checks in five functions); `postGradeChange` can report "Edited after
  grading" for a same-value re-save (code reading).
- Decision 38: widening the role admits `_ideacad_part_writer`'s writes automatically; four writes
  gate on `_ideacad_part_owner` directly. CLAUDE.md's "TWO PREDICATES" omits
  `_ideacad_direct_can_write` (0216). Decision 29's Build line still says 0214 is not applied.
- R26 shapes: `--radius-chip` is a third shape token and the header's controls read
  `--radius-card`; a clip-path chamfer fails focus and border; glass on the non-sticky header is
  invisible; Space White's tokens need the attribute on `<html>`; "823 border-radius literals" is
  approximate (866 by the reviewer's count).
- Line numbers drifted throughout TRIAGE by up to about 50 lines (ClassroomShell, ClassView,
  AttachmentList, GradingConsole, grading-export, AppLauncher, LiveDoor, NotebookView,
  `STREAM_KIND_FILTERS`, the host page's RewardRulesEditor at 795 not 802); the substance was right
  in each case checked.
- Implementers' own claims that reviewers corrected: `onlyEmail` pinned only the class layout's read;
  "the teams code was not at fault"; "a rename does not overwrite a co-host's description" (true of
  the payload builder only); "Trim makes the junction"; "on a touch screen a tap opens in place";
  "nothing is recorded or sent"; the home tour's "never later than the deploy" cut-off reasoning;
  the live-sync "1440" readings (a 712px window); the live door's "about 200px"; the timer's
  mutation md5 (an earlier draft); the Space White extra download (10.1 KB, not 19 KB); the
  profile's "about 8px" covered option (22.6px).

## Deferred and open

**Needs Mr. Pina.**

- The FRC brief's four questions, and the quiz hole: its own migration after his answers.
- The shape mockup (`shapes.md`, the screenshots; `/dev` pages 404 on previews), including the
  0.02 glass margin for `--text-2` codes and the phone caveat.
- Promoting 0228 and 0229 once `IDEA_MIGRATION_URL` authenticates, and 0229's decisions 4 and 5.
  Each needs its own ledger entry; the `tests/db` path constants move with a `git mv`, and 0229 needs
  its four functions classified in `tests/db/ideacad-grants-anon-execute-surface.test.ts`.
- IdeaCAD: repairing the fillet geometry (the one correct construction measured changes stored face
  names) or reporting it upstream to Remus; the signed Distance to line offer; whether a snap onto an
  edge should cut the edge automatically.
- The wall timer's `FRACTION_SCALE`; voice existing only in classroom Search; whether filenames and
  captions stay in "names left out" exports (both paths; a disclosure decision); "Complete, late" by
  last edit and untouched checkboxes; the full `/profile` page (a slug reservation migration).

**SQL described in prose, not written:** a server guard in `tournament_update` for the qualifying and
score-entry edges, and `tournament_clear_qual_pools`; `notebook_file_draft(p_entry_id, p_section_id,
p_session_id)` for atomic filing (it would let photo drafts be filed and leave no copy in Recently
deleted); `classroom_worksheet_answers(p_item_ids uuid[])` so the teacher tally can count finished
worksheets; an insert-only-if-unplaced coin RPC and a weekly cap on Weekly Wage; the 0228 follow-on
lock file (items a to h); an `ideacad_beat_part` narrowing for a deactivated class editor.

**Open in shipped or staged work.**

- TODO-A2 above (the Grades tab and cross-class console), and the cross-class console's missing
  `htmlWork` snippet; "Header:" in the console against "Identity:" in the export; `uniqueSheetName`
  deduplicates case-sensitively where Excel does not.
- Space White rest-state brass left for its own ink decision: ClassView `.detail-open a`, ItemDetail
  `.ci-link`, LinkPreviewCard `.lp-fallback`, MyClasses `.note a` and the class card's icon, code and
  CTA, SpecImporter `.state-tag.on`, SpotlightTour's primary Next button (both tours); the notebook's
  `--nb-accent` hovers; out-of-scope gold hovers in GAUNTLET (correct, it redeclares `--gold`), the
  coin desk, tournaments and maps. The comments in `colors.css` and `tests/theme-tokens.test.ts:563`
  overstate the sweep as site-wide.
- The Foundry-closed refusal page has no report control (CSP `default-src 'none'`); IdeaCAD hides the
  Report word below 700px; an unknown `/assignments/<slug>` returns SvelteKit's static error page;
  the injected box has no focus trap; VANGUARD's older panel is still separate.
- `dictation.ts` still says "Press DICTATE"; stale Voice-pill references remain in `SolidWorkspace.svelte`
  (a dead `.vnav-shell` lookup), `LaunchPage.svelte`, `deploy-safety.ts`, `LiveControl.svelte` and one
  spec comment.
- IdeaCAD: the terminal "refused" after a socket blip; at about 718px the empty-model cue covers two
  tools and the save indicator is 0px wide at 702 and 800; the legacy chooser path passes no live
  transport; `/dev/ideacad-*` harness copies of the unscoped lock remain (the sweep excludes `/dev`);
  class-only global rules are not swept.
- Tier D: two tabs restoring one quick-note mirror can make a duplicate draft; the Inbox's filing
  leaves the old copy in Recently deleted; no Note control on the home page from 521 to 899px.
- Tiers C, D and E merge after 15:30 Pacific or are left for Mr. Pina (see TODO-D for Tier D's gate).
- Smaller: a shared class-tools shell for the three copies of the tool type; a `TourOffer.svelte`
  shared by the two tour offers; posted teams on the home page and My Classes; a sentence for a
  student on no team; `saveProfile` clears `busy` without `finally`; decision 39's Build line should
  read CLOSED by `20426fe5` and `a29b4ebd` with `f1349783`; the stale notebook tagline in
  `portal-apps.ts`; the pre-existing `/dev/foundry-gallery?state=full-screen` rows at 375.
- Candidate CLAUDE.md rules the agents proposed and did not write, for a later session to weigh: a
  component's stylesheet stays in the page after a client-side navigation (and arrives on import);
  `lockDocumentScroll` is the one body scroll lock; an export mounted in a class-critical surface
  computes under a try/catch; the spec export's golden is regenerated only deliberately; a popover in
  a masthead clamps to the viewport and stays above fixed floating controls; the kernel's
  ball-and-step corner and the signed `pointLineDistance`; a translucent reference fill coplanar with
  a face z-fights; the direct modeler's live layer rules; a coin bulk path is a move; a mirror writes
  synchronously at teardown and pagehide; a ProseMirror editor removed while focused dispatches a
  blur inside Svelte's block update.
