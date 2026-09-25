# Feedback round 1, ledger 0298: what is broken in class, and every fix that needs no migration

- Issued: 2026-09-25, by the router chat, for one Claude Code session (Opus 5.5) running as an
  `ultracode` workflow with nobody watching.
- Evidence: `docs/feedback/2026-09-25/TRIAGE.md`. Nine read-only investigators grounded all 35
  reports of the 2026-09-25 feedback export against `abf070c`. **Every file:line in it and every
  statement here about the tree is a CLAIM.** Verify each one before relying on it, and record
  in your history entry every claim that turned out wrong. Roughly half of feedback items phrased
  as missing turn out already built; look before building twice.
- Decisions: 37, 38, 39 and 40 in `docs/decisions/entries/` were answered today. This round
  builds only the parts of them that need no migration. Where a default in this brief disagrees
  with a decision entry, the entry wins.
- Precedence: `CLAUDE.md` wins on how work in this repo is done. This brief says what to do.

## 1. The job

Fix what is broken in class today, then land as many of the listed fixes as the run allows,
in the priority order below, and ship. **No migration in this round** (section 6). Commit and
push in coherent slices as you go, so an interrupted run still leaves landed work behind.

**Never break what his classes use today.** He is teaching from this site every period. A
regression in a live class costs more than any item here earns.

## 2. Phase 0: baseline, then gate

Before any build agent starts, write `docs/feedback/2026-09-25/round1/BASELINE.md` with:
`npx svelte-kit sync && npx svelte-check` (export placeholder `PUBLIC_SUPABASE_URL` /
`PUBLIC_SUPABASE_ANON_KEY` first, per CLAUDE.md), with errors, warnings, files and the warning
breakdown; `npm test`, with the summary line AND stderr read (never the exit code alone); and
`npm run verify:browser -- --probe`. Every later number is compared against this file.

## 3. The work, in priority order

Each item names the reports it answers. The TRIAGE entry for those reports carries the
evidence, the suspect lines and a reproduction.

### P0: broken in class (all of these land, or the report says precisely why not)

1. **The scroll lock that outlives IdeaCAD (R29, R07).** `IdeaCadApp.svelte` and
   `src/routes/ideacad/preview/+page.svelte` carry an unscoped
   `:global(html), :global(body) { overflow: hidden; height: 100% }`. After a client-side visit
   to `/ideacad`, every later page in the tab cannot scroll until a reload. Scope it to the
   room with the repo's `body:has(.<room>)` convention, using a unique root class (not the
   generic `.app-shell`), or make the shell `position: fixed; inset: 0` and drop the document
   rules. **Prove it first**: a browser-verify spec that opens `/dev/ideacad-app`, navigates
   CLIENT-SIDE to a long page, and reads that `scrollY` stays 0 before the fix and moves after
   it. Include 5120x2626 on `/dev/tournaments` so R07 is settled independently. Add a node
   sweep test that fails on any unscoped `:global(html|body|:root)` rule in non-dev `.svelte`,
   with a positive-control fixture (a silent regression, so a test is allowed). Optional, only
   if `ContentComposer.svelte` is not being edited by another item: replace the two ad-hoc
   `document.body.style.overflow` locks (ContentComposer, PathwayPicker) with one ref-counted
   `$lib/shell/scroll-lock.ts`.
2. **"1 missing" on the home page and to-do, nothing missing on the class page (R14).**
   `ClassView` counts only `streamCheckIns`, which drops every check-in attached to an item
   (0120's `item_id`), while the to-do counts them all. Feed ALL of the student's check-ins into
   the class page's standing counts, put a check-in chip (word plus tone) on the item row it
   hangs off, and make the Missing/To do/Done filter keep an item whose attached check-in
   matches. Do NOT drop attached check-ins from the to-do; that hides owed work.
3. **Completed HTML worksheets read as Missing (R13, R27; decision 37, its no-migration
   half).** A ported HTML (schema-3) assignment has no turn-in, and `assignmentStanding` counts
   only `submitted`/`returned` as done. Add a derived "complete" input: the caller's own
   responses and submission files plus the manifest, through `hxProgress` reaching 100% (NOT
   `hxIncompleteBlocks`, which passes an empty worksheet whose manifest sets no minimum). ONE
   predicate drives the chip, the filters, the to-do, the home feed, the class page AND the
   teacher's to-grade tally and roster. Work completed after the due instant reads "Complete,
   late". **Do not flip `state` to `submitted`**, because that locks saves (0197). Also mark,
   per block in the grading console, "changed after grading at <time>" from each response
   row's `updated_at`, beside the existing `postGradeChange` chip. Spec assignments keep their
   Submit button this round; removing it needs session 2's migration.
4. **Posted teams students never saw (R23).** CLAUDE.md claims `ClassTeams.svelte` renders
   posted sets on the class page since ledger 0297. Verify it end to end in a harness as a
   STUDENT with a set posted now, and with the window already closed. If it works, the likely
   cause is that he posted before that deploy, or the window had closed. Then make it
   unmissable anyway: the student's own-team card always shows at the top when a set is
   visible, the full board stays collapsed below it, and a manager sees a one-line "Teams
   posted until <date>" strip linking to People. The team style editor stays unbuilt (CLAUDE.md
   says no update entry may claim students can style a team). Say in the report whether the
   code was at fault, and give him the one SQL line from TRIAGE to confirm what happened to
   his set.

### P1

5. **Report a problem, visible on every page and in the page's own colors (R30, R20, R35
   second half).** On the classroom header the Report control folds into Menu below ~1180px.
   Give it its own always-visible slot in `.header-right` (glyph plus `REPORT_LABEL_SHORT`,
   44px floor), and update the tour sentence and tests that describe the fold. Every page
   the site renders gets a report control, except `/a/`, `/b/` and `/hx/`, whose bytes are
   not ours to inject into (origin split); list any other page that lacks one and why. The
   report box matches the ROOM it opens in: room hooks read with the site token as fallback
   (`var(--fb-room-bg, var(--bg1))` and similar), declared per out-of-scope room with
   `body:has(.frc-root)`-style selectors. On Space White routes it is Space White; on FRC it is
   FRC's palette. **Do not widen Space White's scope to `/frc`**; `tests/theme-tokens.test.ts`
   keeps it out.
6. **HTML assignment grading export (R24).** Export ported worksheets with student answers,
   the same shape the spec export has: a `manifest` beside `spec` on `GradingExportInput`,
   blocks walked over the header and modules through the existing hx helpers, completeness
   from the item 3 predicate. Column header `<module title>: <field>` (the block carries no
   prompt text, and parsing the stored HTML would be a second parser).
7. **Space White color (R17, R26 colors, R19; decision 40 items 1 and 3).** Add a hover role
   token (gold on the dark themes, green on Space White) and add it to the dark-island closure
   block the theme test derives. Sweep the `:hover` rules that paint `--gold` onto it. Take
   gold off the default launcher ink and home-page brass/year ink on Space White. The profile
   name takes `--text-1`. Redraw the IdeaCAD, GREENLINE and Admin launcher marks, measured at
   34px on both themes and following the `IdeaCadMark` once-only animation standard. Measure
   every changed pair with `verify:browser` at 375 and 1440 and under `PROJECTOR_MODEL`, and
   report the numbers.
8. **A light-theme IDEA emblem (R16; decision 40 item 2).** Generate a light variant from
   `tools/idea_logo_vector.py` (green identity kept, lettering re-inked dark), right-sized
   copies at the existing `srcset` widths under `static/IDEA/`, and a variant chosen by theme
   without a flash (the pre-paint theme attribute exists). Measure it in both themes.
9. **The profile pop-up (R18).** It has no max-height and cannot scroll. Clamp it to the
   viewport with `$lib/shell/anchored` or a `max-height` plus `overflow-y: auto`, keeping the
   scrollbar visible. Slim it: pathway as a select, and the avatar as the current picture with
   a Change control. **A full `/profile` page needs a short-link slug reservation, which is a
   migration**, so this round does not add a top-level route. If a non-slug-shaped home for the
   full editor already exists (look under the settings surfaces), use it; otherwise record the
   page as session 2+ work.
10. **Foundry gallery: one sort control (R11; decision 39).** Remove the ranked board region.
    Add one labelled native `<select>` over one list, defaulting to Most played. `sortGallery`
    stays the one comparator, and `trending` and `new` join `FOUNDRY_GALLERY_SORTS`. Edit the
    CLAUDE.md Foundry boards rule block IN PLACE, naming decision 39. Decision 35 (apps, never
    students) is untouched, and no cross-app `players` column is added.
11. **Tournament settings editable until it starts (R02).** Add a Settings section to the
    host console for name, description and format, and extract the format fields from
    `tournaments/new` into one shared form. Send the whole config object, because
    `tournament_update` replaces it wholesale. Format is read-only once live, with the reason
    in words.

### P2

12. **The class list makes room for work (R25).** On a ported HTML document or a spec
    assignment, the class list defaults to collapsed unless the viewer has made an explicit
    choice. Store the explicit choice separately from the current state (the `Disclosure`
    pattern). Make the toggle a labelled button beside the item title, and add a classroom
    tour step for it (keep its `data-testid`).
13. **The live-class timer (R27 tail).** Show hundredths on the control view, and on the wall
    during the last 10 s of a countdown, and tenths otherwise. Schedule the tick on
    rAF-or-timeout, never rAF alone. Add animation behind `prefers-reduced-motion:
    no-preference`, within the old-desktop performance budget.
14. **The "Live class" door wraps badly on the home page (R21).** Keep the count and "on"
    together (`white-space: nowrap`), and let only the title ellipsize. Verify at 375, 871
    and 1440.
15. **The Duplicates tab moves out of the tab bar (R28).** The route, its 404 gate and the
    palette command stay. Add a door beside the class page's Drafts filter that shows only
    when duplicates exist. Generalize the nav-doors assertion rather than deleting it.
16. **Voice navigation folds into the command palette (R31).** A microphone input on the
    palette with one matcher and the palette's full vocabulary (`commandsFor(env)`). Keep exact
    matching, and act on an interim result only once it is stable (about 300 ms). Remove the
    standalone Voice pill, which also frees header room for item 5.
17. **The home tour is out of date (R22).** Rewrite `ORIENTATION_STEPS` with student and staff
    variants, the same way `classroomTourFor` splits them. Cover the profile menu, the theme
    switch, search/commands, the to-do, Report (read `REPORT_LABEL`), and one step per app
    card. Add a hook sweep like `tests/classroom-tour.test.ts`. Everyone who finished the old
    tour is offered the new one once, through the non-blocking offer row.

### P3 (only with budget left)

18. **A Videos view per class (R08).** Derive every YouTube link from the items the class page
    already loads (`youtubeVideoId`, on YouTube's own hosts only), shown as thumbnail cards
    linking back to their item. No new read, no table.
19. **IdeaCAD right-click submenus open to the side on hover (R04).** On a fine pointer with
    room, open after about 150 ms, placed with `anchorPosition` so it flips at the edge, with a
    grace delay for a diagonal move. Keep the tap behaviour on coarse pointers. Touch only the
    menu component.
20. **Coin: fill a coin section from a class roster (R12).** The literal ask already ships (a
    teacher logs a section in one press). Optionally add "Import from class roster" in
    `SectionManager` through `loadSectionRoster`/`splitRoster` and the existing assign RPC.
    Weekly pay stays a deliberate press; there is no cron.

## 4. Not in this round (do not start these)

The spec-assignment turn-in change and the edit-history table (decision 37, session 2); the
IdeaCAD class edit grant, live sync, sketch relations and snapping, fillet gaps and linkages
(decision 38, R05, R06, R15, session 3); the notebook redesign (R32, R33, session 4); the FRC
redesign (R35, session 5); the Space White shape language (decision 40 item 4, session 6);
a tournament banner (R01, which needs a migration); theme wallpapers (R09, R10); the
Hex_Spacer tolerance (R03, which waits on two SQL reads from Mr. Pina). The queue is
`docs/feedback/2026-09-25/QUEUE.md`. If you find one of these already fixed, say so; do not
build it.

## 5. How the agents split

Split by FILE SURFACE, never by topic. Two agents in one file costs a lost hour. Items 2, 3
and 6 share `classroom.ts`, `student-work.ts`, `todo.ts`, `feed.ts`, `ClassView.svelte`
and `GradingConsole.svelte`, so give them to ONE agent. Items 5, 16 and 17 share the
classroom shell header and tour, so give them to one agent. Item 7 and item 8 share the
theme files and the home page, so give them to one agent. One agent owns
`classroom-updates.json` and appends last. Run the full suite serially, once, at the end.
Nothing runs `verify:readme` until every agent is done and the tree is committed. Run one
`verify:browser` pass at a time.

## 6. Constraints this round

- **No migration.** Nothing under `supabase/`. An item that turns out to need SQL stops at the
  proposal, recorded in the history entry.
- `materials/**` is never written. `.github/workflows/**` and `vercel.json` are not touched.
- Every student-visible change gets a dated, student-readable entry in
  `classroom-updates.json`, with no jargon.
- The Verification standard in CLAUDE.md applies in full: both directions on every gating
  claim, mutation proof on the exclusion sweep (item 1's test) and on anything that decides
  what a student sees (items 2 and 3), and layout numbers measured at 375 and at least 1440.
- `svelte-check` must end where Phase 0 measured it, or the report names every warning that
  moved.

## 7. Shipping

Write your history entry at `docs/history/<branch slug>.md`, with what was measured, what was
NOT verified, and every claim in this brief or TRIAGE that was wrong. Correct CLAUDE.md in
place wherever its truth changed (the Foundry boards block, the report-control fold, the voice
pill, the home tour, the teams paragraph if it was wrong). Then follow the prompt's ending for
the merge.
