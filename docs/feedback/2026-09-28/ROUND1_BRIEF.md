# Round 1 (2026-09-28), ledger 0347: the grading console redesign and every no-migration fix

- Issued: 2026-09-28 by the router chat, for ONE Claude Code session (Opus 5.5, ultracode),
  Mode: solo.
- Evidence: `docs/feedback/2026-09-28/TRIAGE.md`. Decisions: 42 (feedback console address), 43 (the
  grading redesign, no approval step), plus 44 and 45 for context only (they are later sessions).
- Every file:line below is a CLAIM an investigator made against `1183d8f5`. Verify it before
  relying on it; the tree may have moved.

## 1. Rules that outrank everything below

1. **No migration.** Nothing goes under `supabase/**`, and no shipped code calls an RPC, column or
   table production does not already have. Decisions 44 and 45 need migrations and are sessions 3
   and 4 of `QUEUE.md`, not this one.
2. **Solo mode, straight to `main`, tier by tier** (`CLAUDE.md` "SOLO MODE"; decision 43 says
   "straight to main"). For each tier: `git fetch origin main` and rebase onto it; run
   `npm run check`, the touched test files (the full `npm test` once, at the final tier), and
   `verify:browser` for the touched routes; if the summary lines are clean against Phase 0's
   baseline, `git push origin HEAD:main`. A rejected push is rebased and retried. A red tier stays
   local and never blocks the next tier's work.
3. **If something you shipped breaks what a class uses, revert it on `main` first** (`git revert`,
   never a force-push), then investigate.
4. **Decide, record, move on.** Where this brief leaves a choice open, take the default written
   here, record it in your history entry, and keep going. Do not stop to ask.
5. **The verification standard is not waived by "no approval step".** Decision 43 removes the
   mockup approval, not the measuring: 375 and 1440 measured, before and after screenshots, a
   fresh-eyes subagent review of the redesigned console, and every rule named in section 4.

## 2. Phase 0

Write `docs/feedback/2026-09-28/round1/BASELINE.md` before touching code: the `svelte-check`
summary and warning breakdown, the `npm test` summary, and a `verify:browser` pass over the
grading routes (`--route grading`), with the numbers. Take the before screenshots of every surface
this round changes into `docs/feedback/2026-09-28/round1/` as `<surface>-<theme>-<width>-before.png`.

## 3. Tiers

### Tier A: small, class-visible, ships first

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

### Tier B: the grading console redesign (decision 43)

Section 4 is the specification. It ships as its own tier because it is the largest change and the
surface a teacher uses most.

### Tier C: the rest

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

## 4. The grading console redesign (Tier B)

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

## 5. Done means

- Every tier pushed or, if red, left local with the reason in the report.
- `classroom-updates.json` has a student-readable entry for what a class will notice (the archived
  classes, the brighter toggles, the new Settings tab is teacher-only and needs none).
- CLAUDE.md edited in place wherever a rule's truth changed (the console address, the grading panels
  and dock, the MyClasses per-card colour comment is NOT reversed here, that is session 4).
- `docs/history/<branch slug>.md` written: what shipped per tier with its sha, the defaults taken,
  measurements, before and after screenshots, what was NOT verified (phones for R08 and R09).
- The ledger entry's Status set to `pushed` with the shas.
- A six-line final report: shas per tier; the deployed sha or "unconfirmed"; grading before/after in
  one line; worst contrast figure and where; what waits on Mr. Pina (his phone check for R08 and R09);
  one-line reverts.
