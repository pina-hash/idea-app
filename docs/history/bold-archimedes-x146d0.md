---
title: "IDEA Classroom overhaul, ledger 0297: Space White, the notebook inside the classroom, the live class, the to-do, and a deploy that waits for a navigation"
date: 2026-09-23
branches: [claude/bold-archimedes-x146d0]
migrations: []
subsystems: [IDEA Classroom, Digital notebook, theme, Browser harness, Testing, Documentation]
---

Ledger 0297, one Claude Code session run as an orchestrator over nine packages, each built
by a subagent in its own git worktree and merged by content into
`claude/bold-archimedes-x146d0`. The brief is `docs/classroom/OVERHAUL_0297.md`, the
governing intent is `docs/classroom/VISION.md`, and the audit, the claims, the scores and the
friction log are in `docs/classroom/overhaul-0297/` (`AUDIT.md`, `CLAIMS.md`, `MATURITY.md`,
`FRICTION.md`). This entry follows the order section 9 of the brief asks for.

## 1. What Mr. Pina should look at first, and where

1. **A class page with the Light button on** (`/classroom/<class>`, the sun button at the top
   right, or Space White in the profile menu). The header is one row, each of your classes is
   an icon across the top, and Report a problem and Voice sit in that header instead of
   floating over rows. Try it on the projector: every text color on it was measured under a
   washed-out projector model and clears.
2. **The Live tab** on one of your classes (`/classroom/<class>/live`, teachers only). Who is
   working on today's assignment, a timer, the hall pass, today's agenda and a random pick;
   **Show on wall** opens the projector window, which carries nothing that names a student
   except a pick you choose to show.
3. **The Notebook tab** on the same class. As a teacher it is the class's review, with a new
   **Approve** view that approves a class day's entries in one pass with a next step. As a
   student (View as, or a student account) it is that student's notebook for the class, and
   an assignment page now has **Take a photo / Add photos / note** in its check-in card.
4. **Ctrl K** (Cmd K) on any class page: the palette, with `#` for items, `@` for people and
   `>` for actions, and `?` for every shortcut.
5. **The To-do page** as a student (`/classroom/todo`): Assigned, Missing, Done across every
   class, on the school's own day.

## 2. What `main` carries and what production serves

- The merge commit pushed to `main`: **`601f9797`** (a `--no-ff` merge of this branch, so it
  reverts as one commit with `git revert -m 1 601f9797`).
- **The version production serves could not be read from this container.** `curl` to
  `https://ideabosco.com/` is refused by the container's egress proxy (403 on CONNECT, measured
  again at the ship, and the fetch tool is refused by the same proxy), and no tool here reaches a Vercel deployment. So this session does
  **not** claim the build is live: a push is not a deploy until the served `v1.N · <sha>`
  matches, and that comparison is Mr. Pina's to make on the home page's version stamp. The
  smoke checks the brief lists (`/` 200 on the merged sha, the `/_app/immutable/` entry
  scripts 200, `/classroom` and `/notebook` answering 303 to `/` signed out) were not run for
  the same reason. If the served page is broken: `git revert -m 1 601f9797`, push to `main`
  the same way, and confirm the revert is served.
- CI on the pushed sha: CI succeeded on `f7712432`, the branch tip that was verified and merged (run 1614, the same tree as the merge). On the merge commit `601f9797` the Migrate workflow succeeded with nothing to apply, and CI (run 1615) was still running when this entry was written; its result is on the commit in GitHub. `main` moved `33849402..601f9797`, and `integration` took `main` as `cb50509b` (`de52de44..cb50509b`), its tree identical to `main`'s.

## 3. `0227_PROPOSED.sql`

**It does not exist, and 0227 is released unused.** Nothing that shipped needed a schema
change: every package was built on columns already present, and the ones that came close
were answered without a migration (the notebook capture's retry key rides in the filename;
straightened-photo pairing stays adjacency; the reviewer's defaults and the class view
default live in the preferences blob). Three candidates were named and each waits on a
decision rather than on SQL: a per-class, per-day agenda table so the Live agenda follows a
teacher across devices; an explicit photo pairing key and an upload idempotency column,
which would retire the filename token; and a per-assignment "collects a submission" flag so
an undated assignment could count as owed. None is written.

## 4. What shipped, by area

Each line is a package's own measured result; the full reports are summarized in
`MATURITY.md`, which carries the before and after score per area.

- **Themes (F1a, F1b).** Space White, a white console scoped to the classroom, the notebook,
  the reference viewer and the home page (`SCOPED_SITE_THEMES`, `THEME_SCOPE_PREFIXES`,
  `THEME_SCOPE_EXACT`). Applied before first paint from a lookup table the server builds
  (`themeBoot` in `hooks.server.ts`): 5 of 5 loads themed at 31 to 40ms against first paint
  at 144 to 232ms, where Phase 0 measured 34 unthemed frames. Role tokens; dark islands for
  IdeaCAD, the photo overlays and projected slides; light-ground twins for every identity
  ink (pathways, avatars, launcher cards), lightness only. 0 of 130 role cells below WCAG
  and 0 below the washed-out projector floors. The home banner and launcher follow the
  theme; the emblem is 19 KB instead of 2.6 MB; a signed-in hero is 104px at 1366x768, so
  Your Classes is above the fold. New Classroom and My Notebook marks.
- **Deploy safety (F6).** `kit.version.pollInterval` 120s and one verdict,
  `deployReloadVerdict`, asked on every `onNavigate` by `DeployWatch`: a new version reaches
  an open page only at a link or back navigation, never on a projected surface, a
  fullscreen element, an upload in flight or an open composer with work in it. A failed
  chunk shows Try again; a failed editor chunk degrades to a plain box that still saves; the
  save guard's flush has a 12s deadline. 32 runs, 0 outside; four production-build proofs.
- **Preferences, registry, palette and class search (F3 with F5).** One read-then-merge
  write path into `profiles.preferences` (the fold-lost-to-a-pin defect is fixed), a
  `classroom` namespace whose groups say whether they follow the device or the account, a
  Settings panel, one command registry, Ctrl K, a `?` legend built from the consoles' own
  key tables, and a find bar with To do / Missing / Done inside each class.
- **The to-do (TODO).** `/classroom/todo`, one Missing predicate (`assignmentStanding`,
  `checkInStanding`), one owed-work read (`loadClassroomWork`), due dates on the school's
  day with no weekday, counts on My Classes, and a one-line door above the home apps.
- **The notebook inside the classroom (F4a).** A Notebook tab in every class, the whole
  notebook and review inside the classroom shell, no masthead and no plates, the site theme
  including Space White, photo overlays dark in the top layer, every old address redirected
  (the review addresses gate first).
- **Notebook capture and review (F4b).** Capture from the assignment page, filed to the
  item's check-in or to the class under the item's title; each page on the device in about
  150ms and uploaded as a draft at once; a retry never doubles a page; straightening after
  the fact; one-pass Approve with next steps; a class timeline and a never-ranked streak.
- **The live class (LIVE).** The Live tab and its projector window (`+page@.svelte`, reset
  to the root layout), same-browser channel only, and posted teams visible on the class
  page, names only.
- **Layout, density and the named defects (F2).** One-row header (60 to 69px), class icons
  (report 26), the trail from the content's left edge, the split starting at y=127 at 1440
  (was 201), an item using its whole pane with prose capped per paragraph, Report and Voice
  docked (64 of 64 class-page controls hit-test to themselves), long units continuing into
  the next column so the 426x702px hole is gone, the deck's controls a strip above the
  stage with Back at the top left (report 34), People's tools beside the roster, the Draw
  result under Draw, the grading dead-keys state fixed, and a new `controlFit` browser check
  for text touching its border and controls overlapping. The home page's controls are 44px.

## 5. Tried and abandoned

- **A cookie mirror of the theme for pre-paint.** Rejected for a server-built answer table
  over the existing `localStorage` key: one stored value, and no scope logic in the browser.
- **Dark plates behind the launcher cards on Space White.** A 12.68:1 dark slab on white read
  as a sticker; light cards with lightness-only inks were kept (worst hover 4.52, FRC).
- **A grid, or any order-preserving arrangement of unbreakable units, for the class stream.**
  All of them leave the hole under a short unit; only letting a long unit break between rows
  removes it.
- **The composer's two-column form (F2 item 1).** Not built: it needs a restructure of a
  3,800-line component, and a grid over its current children brings back the row gaps. It
  stays one 64rem column.
- **Two copies of each header tool for narrow widths.** Rejected for one copy folded by CSS
  into a Menu, because two copies double every test id and handler.
- **`beforeNavigate` for the deploy reload.** Its callback order flips within a session and
  assigning `location.href` there fires `beforeunload` inside the save guard's flush;
  `onNavigate` was used instead. Reloading from `vite:preloadError` was also rejected.
- **A server channel for the projector** (so a phone could drive it) and **a synced agenda**:
  both need a disclosure decision or a table, and neither was taken.
- **An explicit photo pairing key and an upload idempotency column**: a migration each; the
  filename token and adjacency pairing, proven by enumeration to depth 8, were used instead.
- **Letting a teacher's six tabs wrap on a phone, and shrinking them.** Merging the Live tab
  made six, and at 375 the sixth wrapped (chrome 142px, and "Live" measured 39.3px wide,
  under the floor). Shrinking the tabs under 44px and hiding one behind a scroll were both
  refused; every tab took a 44px minimum width with `flex-shrink: 0`, and the gap between
  the boxes went from 0.3rem to 0.1rem (the labels stay about 14px apart on the tabs' own
  padding), so all six hold one line at 375 (341.5px of 343).
- **The ITEM and GRADE+LEARN packages** (the ported assignment's rubric and returned score
  outside the document, the image lightbox, the comment bank, a classroom walkthrough) were
  planned and not started before this ship. The API usage limit stopped three running
  agents mid-work once during the run; they were resumed and finished, and the run shipped
  what was verified rather than starting more.

## 6. Claims in the brief that were wrong

142 statements were checked against the tree at `33849402`; 7 were false, 30 partly true
and 2 unverifiable, and `CLAIMS.md` carries all 39 with evidence. The ones that changed what
was built:

- "Panes are bounded by `100vh - --cr-chrome-h`": false; `split.css` no longer resolves it.
- "At least five taps per photographed page": false; the measured minimum was 3 on the
  Android in-app camera and 4 on the native camera.
- "Desktop requires New entry first": false; the composer is open on load at 1366 and 1440.
- "A failed lazy chunk gives a white screen": false; a failed route chunk rendered the root
  error page in the app's chrome, and a failed editor chunk left an uneditable box, which is
  what F6 fixed.
- "Dev mode polls `/_app/version.json`": false; 0 requests in 20s idle, and the dev server
  answers it 404.
- "0226 is held by ledger 0296": false; 0296 released it unused.
- "`IdeaCadMark` and `docs/ideacad/VISION.md` live on another branch until 0296 lands":
  false; both were already on this tree.
- "About 122 color literals in `.legacy-index`": 122 is the count for all of `src/app.css`;
  the block holds 59.
- "`IDEA_INTERFACE_STANDARDS.md` 2.12 requires a named class for the 24px floor": 2.12 is a
  changelog version; the rule is section 10.
- "`tests/identity-style-shared.test.ts` fails on `main`": it passed on this tree at the ship
  (53 of 53 alongside `tests/claude-md.test.ts`), so step 4 of section 9 needed no change.

## 7. For Mr. Pina to decide

Each is also a line under "Open questions" in `docs/classroom/VISION.md`, with the default
that shipped: the names Space White and Light; whether a picked name may show on the wall
and whether a phone may drive the projector; whether the agenda should follow a teacher
across devices; whether a student's notebook card should say "Late" when the grid does;
whether a next step written while approving should also mark the entry compliant; the
streak's definition; the class icon format and the 1180px fold; a long unit continuing
without its heading; the to-do's Sunday week and undated work last; the Live grid's
5-minute idle and staff in the door count; and whether capture belongs on the class page.
Rebuild-plan decisions 19 to 28 (`IDEA_CLASSROOM_REBUILD_PLAN.md` 1.22) record what was
decided, including 19 superseding decisions 14 and 15 on the notebook's appearance and 20
lifting decision 3's exclusions for the home banner and the deck's back control.

## 8. For Mr. Cosso, who has not seen any of this

- **The top of every class page changed.** Your classes are small icons in a row across the
  top; tap one to switch. On a narrow window the other buttons (To-do, Search, Settings,
  Light, Voice, Report a problem) are inside a **Menu** button. Report a problem is no longer
  a floating button at the bottom of the screen.
- **Light** (a sun, top right) turns the class pages white, which reads better on the
  projector. Press it again to go back. It only changes the device you press it on.
- **Live** is a new tab on each of your classes. It shows which students are working on
  today's assignment, a timer, the hall pass and a random picker. **Show on wall** opens a
  second window for the projector; drag it to the projector screen and make it full screen.
  It shows the agenda, the timer and whether the pass is out, never a student's name unless
  you pick one and press Show.
- **Notebook** is now a tab on each class. For you it is that class's notebook review: the
  check-in grid, flags and accepts as before, plus **Approve**, which approves a whole class
  day's entries at once and can attach a next step the student will see.
- **Students can add to their notebook from the assignment page** now, with photos or a
  note; it files itself under the day's check-in.
- **Ctrl K** (Cmd K on a Mac) opens a search box that jumps to any assignment, class,
  student or action. Press **?** in it to see every keyboard shortcut.
- **Presentations** have Back at the top left and their buttons in a strip above the slides.
- **Students have a To-do page** listing what is assigned, missing and done in every class.
  "Missing" means past its due time with nothing turned in.

## Verification

- `svelte-check` 0 errors, 37 warnings in 20 files (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), the Phase 0 baseline, before and after
  every package and on the merged tree.
- The full suite on the merged, committed tree: 593 test files and 11,249 tests passed, 0 failed, on `f7712432` (the summary line read and the output searched for failures, never the exit code).
- CI-equivalent steps run under Node 22 (CI pins 24, which this container does not
  have): `npm run check` 0 errors and 37 warnings in 20 files; `node tools/check-vanguard-changelog.mjs` found the entry for VERSION 214; `npm run history:verify` lossless; `npm run build` exit 0; `node tools/claude-md-check.mjs` agrees with the tree; `npm run verify:counts -- --check` both regions agree.
- Browser: every package measured its own surfaces at 375, 960, 1366 and 1440 in this
  container's Chromium with fallback fonts (web fonts are blocked here) and
  `prefers-reduced-motion: no-preference`; the merged tree was re-measured on the class
  page, the Live tab, the projector, the theme switch and every notebook harness: 56 runs,
  784 measurements, 2 outside, both a stale expectation (the teacher class page correctly
  has two `.cr-select` since the find bar), fixed in the spec and re-measured at 0.
  `npm run verify:readme` measured every spec the packages added: one pass over the 214 specs on this run's surfaces (428 runs, 7,274 measurements, 19 outside), then the 98 the tab fix could reach again (196 runs, 2,874 measurements, 0 outside). Across this run's specs the store holds 13 findings and every one predates the run: `grading-incomplete` (11) and `spec-table?empty=1` (2), with the same rows in their measurements from `4cd231ed`. The `/dev/tour` fragment also matched the tournament harnesses; their measurement files were restored rather than committed, since that room is not this run's. The whole store: 353 specs, 12,214 measurements, 211 outside.
- Mutation proofs, each from a byte copy and md5-restored, summary lines read from stdout
  and stderr: F2 5 of 5, F4b 10 of 10, LIVE 10 of 10, F6 4 of 4, TODO 7 of 7 (one only by its
  unit test, because RLS never hands the database test a classmate's row), F3F5 7 of 7, F1b 8 of 8.
- **Not verified**: any signed-in route on production or a real Supabase project; a real
  Drive round trip for notebook photos; iOS and Safari; two monitors and a real projector;
  real hall-pass RPCs; web fonts; the reduced-motion path in the browser; Vercel skew
  protection; tabs opened before this deploy.

## Merge record (decision 16's six items, a record here and not a gate)

This run merged its own branch straight to `main`, the route Mr. Pina approved on
2026-09-23, so the checklist is recorded rather than used as a gate.

1. `origin/main` an ancestor of `origin/integration`: not applicable, direct merge approved
   2026-09-23. (`git merge-base --is-ancestor origin/main origin/integration` exited 0 at the merge.)
2. Branch contained in `origin/integration` with CI green on its tip: not applicable, direct
   merge approved 2026-09-23.
3. The merge into `main` is clean: clean. `git merge --no-ff` of the branch into `origin/main` exited 0 with no conflict, the merged tree was identical to the verified branch tip, `git diff origin/main HEAD --stat -- supabase/migrations/ materials/` was empty, and no path the ledger reserves for 0296 (`src/lib/ideacad/**`, `src/routes/ideacad/**`, `docs/ideacad/**`, `IdeaCadMark.svelte`, the `ideacad-*` harnesses and specs) or `supabase/**`, `.github/workflows/**` or `vercel.json` was in the diff.
4. Deploy probe, or its record-backed substitute: **vacuous under decision 34**, not passed.
   The migration delta is empty: `git diff --name-only origin/main...HEAD --
   supabase/migrations/` names nothing, so there is no migration whose applied record could
   be missing, and `DEPLOY_PROBE_URL` is unset in this container.
5. Every migration this bundle added reported applied: none added.
6. Ledger entries newly on `integration` read `Status: pushed`: 0297 is flipped to `pushed`
   in this branch's final commit.
