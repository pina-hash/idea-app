# Ledger 0347: every fix from the 2026-09-28 feedback export, in one session, one push to main

- Issued: 2026-09-28 by the router chat, for ONE Claude Code session (Opus 5.5, ultracode),
  Mode: solo.
- Evidence: `docs/feedback/2026-09-28/TRIAGE.md`. Decisions: 42 (feedback console address), 43 (the
  grading redesign, no approval step), 44 (team edits marked edited), 45 (class themes by class vote).
- **Mr. Pina asked on 2026-09-28 for all eighteen reports to ship in one go, directly to `main`.**
  This brief used to split them into four sessions; it is now one.
- Every file:line below is a CLAIM an investigator made against `1183d8f5`. Verify it before
  relying on it; the tree may have moved.

## 1. Rules that outrank everything below

1. **ONE migration, `supabase/migrations/0230_classroom_team_edits_and_class_themes.sql`, and only
   one.** `migrate.yml` applies the LOWEST unapplied migration and one file per push, so two new
   files in a single push would leave the second unapplied while the deployed client calls it. Both
   database halves (section 5, teams; section 6, class themes) go in this one file. It is ADDITIVE in
   CLAUDE.md's sense (new tables, new columns with defaults, new functions; no drop the running client
   calls), because the apply and the deploy race on the same push. It follows `0166`'s grant shape
   for every function AND table, carries apply-time self-checks, is tested over seeded pre-migration
   data per the verification standard, and states what undoes it. The shipped client degrades on
   `PGRST202` for the new RPCs, so a push that deploys before the apply finishes does not break a page.
   0228 and 0229 (the 2026-09-25 proposals) are NOT this session's.
2. **One push to `main`, at the end** (Mode: solo; Mr. Pina, 2026-09-28: "all of these fixes pushed
   in one go, directly to main"). Work locally in slices, commit as you go, and push once:
   `git fetch origin main`, rebase, `npm run check`, the full `npm test` once, `verify:browser` for
   every touched route, and `npm run build`, reading summary lines and stderr, never exit codes alone.
   Push with `git push origin HEAD:main` only when all of it is clean against Phase 0's baseline. A
   rejected push is rebased and retried. If one item cannot be made green, take it out of the push
   and say so in the report rather than holding the rest.
3. **If the push breaks something a class uses, revert it on `main`** (`git revert`, never a
   force-push), then investigate. A migration is not reverted by a code revert; its header's undo
   is pasted by hand, which the report says.
4. **Decide, record, move on.** Where this brief leaves a choice open, take the default written
   here or in the decision entries, record it in your history entry, and keep going. Do not stop
   to ask.
5. **The verification standard is not waived by "no approval step".** Decisions 43 and 45 remove
   mockup approval, not the measuring: 375 and 1440 measured, before and after screenshots, a
   fresh-eyes subagent review of the grading console and the theme vote, and every rule named below.

## 2. Phase 0

Write `docs/feedback/2026-09-28/round1/BASELINE.md` before touching code: the `svelte-check`
summary and warning breakdown, the `npm test` summary, and a `verify:browser` pass over the
grading routes (`--route grading`), with the numbers. Take the before screenshots of every surface
this round changes into `docs/feedback/2026-09-28/round1/` as `<surface>-<theme>-<width>-before.png`.

## 3. The work, grouped (one push; the grouping is only an order to build in)

### Group A: small, class-visible

- **R14. No brown ink on My classes under Space White.** `MyClasses.svelte` sets `--acc: var(--gold)`
  on `.class-card` (claimed :259) and reads `--gold` in `.updates-all` and `.note a` (:197, :240).
  Point them at `--hover-ink` (decision 40 item 1's role: green ink on Space White, brass on the dark
  themes). Sweep `src/lib/classroom/` for any other `--gold` WORD painted under Space White while you
  are there, and measure each change against its real ground.
- **R15. An open-state toggle looks pressed.** Add `class:on` beside `aria-expanded` (keep the
  `aria-expanded`) on: Units (`ClassView.svelte` ~1900), New post / Close (~1894), Edit post / Close
  editor (`ItemDetail.svelte` ~1476), UnitManager's Edit units and Rename (~191, ~287), People's
  email, picker and saved-teams tools (`PeoplePanel.svelte` ~1060-1081) and People's Edit details
  (~1599). `plate.css` does not change; `.on` is one of its seven spellings. Then sweep for any other
  open/close toggle with no lit state and fix it the same way.
- **R12. Archived classes stop crowding the class list and the header strip.** The `/classroom`
  page load does not select the section's `active` (claimed `+page.server.ts:43`); add it. My classes
  renders active classes first and an **Archived** `Disclosure` (closed by default) below them. The
  header strip keeps active classes only and gains one **Archived** key, a real button with
  `aria-expanded` over a short list of archived classes (a manager's archived classes and a student's
  alike). The current class stays reachable from the strip even when archived, so nobody is stranded
  on a page whose key vanished.
- **R02. Undo on the feedback console.** Keep `{id, prev}` for the last single or bulk status move and
  show Undo for 10 seconds beside the bulk note, calling the same `app_feedback_set_status`. Say in the
  history entry that an undo stamps `reviewed_at`/`reviewed_by` afresh (0188 writes them on every call).
- **R03, the dictation half. Sentences get periods.** In `appendDictation`
  (`src/lib/feedback/dictation.ts`), at each FINAL result boundary: append a period when the chunk
  ends without terminal punctuation, and capitalise the first letter of the next chunk. Append-only,
  as that module's own rule requires; the grading dictation shares it, so check both callers and
  `tests/feedback-dictation.test.ts`.
- **R05. Clicking the building on the map plan opens it.** When `mapsDrawing` draws a lone root
  building's interior, the building is the frame, a bare `<rect class="mv-frame">` (claimed
  `MapsPlan.svelte:438-444`). Make the frame a link to the building (a `frameHref` from
  `MapsViewer`) when the frame is not the level already open, keeping rooms clickable on top.

### Group B: the grading console redesign (decision 43)

Section 4 is the specification.

### Group D: teams after posting (decision 44, R18) and class themes by class vote (decision 45, R07)

Sections 5 and 6 are the specification; their SQL is the one migration.

### Group C: the rest

- **R03, the address. The feedback console moves to `/admin/feedback`** (decision 42). The old
  `/classroom/feedback` answers 307 to it after the SAME admin gate, so a non-admin still gets 404
  at both. It leaves the classroom shell and takes the portal chrome, the root layout's report control
  and the site plate (it joins `SITE_PLATE_PREFIXES` through `/admin`, which is already in). Update
  every link (AdminConsole, the dashboard), `tests/classroom-measure.test.ts`,
  `tests/feedback-untrusted-render.test.ts`, the CLAUDE.md line naming the console's address, and the
  `/dev` harness if one mounts it.
- **R06. Class settings get their own tab.** A manager-only **Settings** tab after Grades, holding
  Edit details, Archive class and Delete class, moved out of the bottom of People
  (`PeoplePanel.svelte` ~1596-1680); `nav.ts` lists the six edits a new tab takes. People keeps the
  roster and teams. The header's Settings button stays the per-person display settings; give it the
  words "Display settings" so the two are not confused. A student sees no new tab.
- **R01, R11. Drops land in the right box.** (a) On the item EDIT form, a dropped `.json` goes to
  the item's spec importer and a dropped `.html` to the ported-document replace box, never silently
  to the student-visible Files list; where the item cannot take one, say so where the drop landed.
  (b) The composer's drop zone stops being disabled by `!attachmentsEnabled` (claimed
  `ContentComposer.svelte:2572`) for the spec and HTML routes. (c) For a manager, a file dropped on
  the class page opens New post with the files handed in, routed by the same `composerDropRoute`.
  `FileUploadPanel` stays unfiltered.
- **R04. Help where the controls are.** Give every classroom setting a `help` sentence and render it
  as an `InfoTip` beside the setting's title (not inside its radio label). Then the classroom header,
  the class toolbar, the grading console and the composer: every `title=` tooltip there becomes an
  `InfoTip` with a practical sentence (what it does, and when you would use it). Nothing outside the
  classroom this round. Keep them short; a tip that restates the button's label is noise.
- **R08. Dictation on a phone.** De-duplicate final results in the `onresult` loop (Android Chrome in
  continuous mode resends growing finals), and do not refocus the textarea on a coarse pointer
  (FeedbackBox claimed :240, :389), which raises the keyboard over the box. This cannot be verified in
  this container; say so, and name the one check Mr. Pina should make on his phone.
- **R09. The Matrix rain on a phone.** Read the canvas's `data-motion` in a mobile-emulated
  harness run first. Then: the slow-frame degrade must not trip on a 30 fps display (the threshold
  sits at 34 ms against a 33.3 ms frame), and at phone width the rain must be visibly moving while
  every contrast floor in the band still holds (re-measure; `tests/theme-rain.test.ts` pins the band).
- **R10. The lines-of-code chip.** (a) The figure counts up once on load, behind
  `prefers-reduced-motion`, on rAF-or-timeout (lift GAUNTLET's `countUp` into a shared module rather
  than copying it). (b) Each update row in the pop-up shows the lines it added and removed, from
  `git log --numstat` filtered through `languageFor`, full clone only like the version numbers, and
  absent rather than wrong on a shallow clone. (c) The pop-up joins the plate's panel list and its
  `--gold` figures take `--hover-ink`.
- **R13. A better light-theme logo.** Decision 40 item 2's light lockup is what he now dislikes. Draw
  at least three alternatives in `tools/idea_logo_vector.py` (the only place logo geometry is edited),
  for example the original dark emblem on its own dark plate chip, a single-ink lockup, and a deeper
  brand-green plate with ivory lettering as on the dark theme. Pick the one that reads best at the
  header size and the home size on Space White, rasterise it with `tools/idea_emblem_raster.mjs`, and
  ship it. Put all candidates in the history entry with screenshots, and add a line to decision 40
  saying item 2 was amended and why.

## 4. The grading console redesign (Group B)

**What is wrong today, from the reports and the tree.** Every export sits in a region capped at 45%
of the roster card and scrolls in a sliver (R16). The tick boxes have no visible effect: the only
controls that act on them are the batch bar below the whole rubric in the scrolling work column, which
renders only with a student open and a rubric present (R17). A paragraph about typing-time figures
sits above the list with no obvious subject. `docs/classroom/overhaul-0297/FRICTION.md` lines 101-117
log fifteen more grading items; read them all and address each or say why not.

**The direction, which is yours to refine** (decision 43: best judgment, no approval step):

- **The page header carries the page's tools.** Title and item, the class picker where there is one,
  previous and next student, **Close assignment** and one **Export** control (a `Disclosure`-backed
  menu or popover, never a hand-rolled one) holding every export: CSV, the JSON pair, the spreadsheet,
  the identity toggle with its note, and Download all files. Nothing scrolls inside a sliver.
- **The roster is a list of people.** Name, status chip, the presence line. The presence coverage
  sentence stays (CLAUDE.md requires it) but moves behind an `InfoTip` beside the presence figures,
  where its subject is.
- **Selection is a mode you enter.** A **Select** key in the roster header shows the checkboxes and the
  presets; off by default, so the list is not cluttered. While anything is ticked, a sticky selection
  bar at the top of the roster reads "N selected" with the batch actions (Save drafts, Return, Clear),
  the plan table and confirm opening from there. With no rubric, Select is absent and a sentence says
  why.
- **The work column keeps the work and the grade.** Student work, then the rubric and comment, with
  the Return dock as it is. If the batch controls leave `.work-col`, edit CLAUDE.md's dock rule in
  place: its reason ("the batch panel is further down the same card") no longer holds.

**Rules that bind the redesign whatever it moves** (all in CLAUDE.md): the "WHO IS WORKING" section
(`presenceLineKind`, `workArrived` from `statusChip`, `presenceStatus`, the stale note), the list's
floor written as a ceiling on panels with no absolute floor, no hidden scrollbars, Next/Previous as
buttons and keys, 44px targets, the read-only worksheet sweeps
(`tests/html-assignment-instructor-readonly.test.ts`), `readWorkPages` paging, the one save state, and
geometry proven only by `verify:browser`. Update the browser-verify routes that name
`work-export-disclosure` and `roster-tools`, and `tests/dom/presence-console-mount.test.ts`.
Both grading routes mount this console (the per-section `grade` route and the cross-class
`grading/[itemId]` route); verify both.

## 5. Teams after posting (decision 44, R18)

- **SQL (in 0230):** `classroom_move_team_member(p_team_set_id, p_student_email, p_to_team_id)`,
  gated on `classroom_manages_section` for the set's section, moving the member within the SAME set
  (the composite keys in `0223` already make a cross-set move unrepresentable), and stamping the set
  `edited_at` / `edited_by`. A nullable `edited_at` column on the set is the "edited by hand" mark; the
  seed stays. `classroom_team_board` projects `edited_at` (widen it additively, per the SIGNATURE TRAP
  rules if its return shape changes: a new function name or an additive column, never breaking the
  deployed caller).
- **Client:** on People, drag a member between team cards with `sort-drag.ts`, and a **Move to**
  control on every member as the non-drag path (keyboard and phone). Wire the team rename the manager
  branch of `classroom_set_team_style` already allows. The class page's `ClassTeams` and the CSV say
  "Edited by hand" when `edited_at` is set. A student cannot move anyone.
- **CLAUDE.md:** the CLASSROOM TEAMS seed rule gains one clause saying a hand edit is marked, not hidden.

## 6. Class themes by class vote (decision 45, R07)

Read decision 45 in full; its defaults are the spec. In short:

- **Features and options are a fixed catalogue in one client-safe module** (for example
  `$lib/classroom/class-theme.ts`): a handful of features (base palette, accent, banner pattern,
  badge), each with a short list of options, one of them seeded from FRC team 5669's branding page he
  linked (fetch it if the network allows; otherwise take FIRST's published navy and red and say so).
  Every option is measured on IDEA, Matrix and Space White and under `PROJECTOR_MODEL`, carries a
  Space White twin where it paints a word, and is never colour alone. A banner pattern is decoration
  on a banner, never a grid behind content (the no-grid rule). Option ids are append-only, like avatar
  presets.
- **SQL (in 0230):** a vote table keyed `(course_id, feature, student_email)` with RLS on, no policy
  and no client grant; `classroom_theme_vote(p_course_id, p_feature, p_option)` (caller is the voter,
  must be actively enrolled in a live section of the course, managers refused, option id
  length-bounded and validated by the client against the catalogue, since no preset list lives in SQL);
  `classroom_theme_tally(p_course_id)` returning per-feature option COUNTS and the caller's own votes,
  never another voter; voting open or closed and a reset, manager-gated; a nullable section accent the
  teacher sets. The winner per feature is the most votes, ties to the option that reached the tie
  first (keep the time each count last changed, or equivalent).
- **Client:** a class banner at the top of the class page, the My classes card and the header strip
  key all paint from the winning options (reversing MyClasses.svelte's "never by a per-card color"
  comment, which you edit in place). A **Theme** panel lets a student vote and see the live tally;
  it re-reads on a short poll and on focus, the way `ClassTeams` does. A course with no votes renders
  exactly as today.
- **Space White scope:** Space White still applies only where `THEME_SCOPE_PREFIXES` says, so a
  class theme on the classroom renders in all three themes; measure all three.

## 7. Done means

- One push to `main` with every item in it, or the item that could not go green named and left out.
- `classroom-updates.json` has a student-readable entry for what a class will notice (the archived
  classes, the brighter toggles, team changes after posting, voting on the class theme; the Settings
  tab is teacher-only and needs none).
- CLAUDE.md edited in place wherever a rule's truth changed (the console address, the grading panels
  and dock, the teams seed rule, the classroom files that name the class theme).
- `docs/history/<branch slug>.md` written: what shipped with its sha, the defaults taken,
  measurements, before and after screenshots, what was NOT verified (phones for R08 and R09).
- The ledger entry's Status set to `pushed` with the sha.
- The migration's full repo path at the end of the response, per CLAUDE.md.
- A six-line final report: the pushed sha; the deployed sha or "unconfirmed"; grading before/after in
  one line; worst contrast figure and where; what waits on Mr. Pina (his phone check for R08 and R09);
  one-line reverts.
