# IDEA Classroom overhaul, ledger 0297

- Issued: 2026-09-23, by the router chat, for one Claude Code session (Opus 5.5) running
  as an `ultracode` workflow with nobody watching.
- Precedence: `docs/classroom/VISION.md` governs. This brief is a plan for serving it. The
  research report (`docs/classroom/research/2026-09-23-classroom-research.md`) is evidence.
  Where this brief disagrees with the vision, the vision wins and the session says so in its
  history entry. Where the research and a seed disagree, prefer the seed and write down why
  the research disagreed. Research anything else you need from primary sources with web
  search.
- **Every statement in this brief about the repo is a claim**, made from a clone of `main`
  at `bf04a223` on 2026-09-23 (production served `v1.1789 · bf04a22` at 05:20 PDT). Verify
  each against the tree before relying on it, and record in the history entry every claim
  that was wrong. Four of every eight items phrased as missing turn out to be already built
  somewhere; find them before building them twice.

## 1. The job

Make IDEA Classroom match its vision as far as one run allows, across the whole program,
keep it well-rounded while doing it, and ship it live. Four things are equally part of the
job:

1. **Build the foundation** that most of the requested work depends on (section 4): theme
   roles and the Space White theme, layout and density, one command registry, the notebook
   inside the classroom, per-user preferences, and deploy safety.
2. **Catch up the weakest areas** under the catch-up rule (section 3), using the seeds in
   section 5 as a starting point.
3. **Seek out improvements nobody listed** (section 6). In his words: "seeking out
   improvements, especially in lower areas, and fleshing them out autonomously." The seed
   list is not the boundary of the work.
4. **Never break what his classes are using today** (section 7). He is teaching from this
   program every period. A regression in a live class costs more than any feature earns.

Run until the work is done or the usage budget is nearly spent, then ship (section 9).
Commit and push your branch in coherent slices as you go, so an interrupted run still leaves
landed work behind.

## 2. Phase 0: audit, gating everything after it

No build agent starts until this phase is written down in
`docs/classroom/overhaul-0297/AUDIT.md`.

1. Read `docs/classroom/VISION.md`, this brief, the research report's summary and ranked
   moves, `CLAUDE.md` (it is long; read at least "What this is" for the classroom
   subsystems, "Components and UI", "Known traps", "Testing", "Visual theme" and "Working
   conventions"), and in full:
   `docs/standards/IDEA_CLASSROOM_REBUILD_PLAN.md`, `docs/standards/IDEA_INTERFACE_STANDARDS.md`,
   `docs/standards/IDEA_CLAUDE_DESIGN_STANDARDS.md`, `docs/standards/IDEA_VERIFICATION_ADDENDA.md`,
   and the "Notebook Work Attaches To An Assignment" section of
   `docs/standards/IDEA_MATERIALS_PROCESS.md`.
2. Measure the baselines on the untouched tree and write them down: `npx svelte-check`
   (errors, warnings, files, and the warning breakdown), `npm test` (files, tests, passed,
   failed, skipped, read from the summary line and stderr), `npm run build`, and the
   browser harness counts. **`tests/identity-style-shared.test.ts` is claimed to fail on
   `main` permanently**: its case asserting that exactly two colors moved reads
   `git show origin/main:src/lib/profile.ts`, and its premise expired when `bf04a223` merged,
   so before now equals after (recorded in `docs/history/new-session-avpli9.md`). Confirm it.
   It is a baseline failure, not yours, until section 9 makes it yours. **Do not trust any
   test command's exit code alone**: `tools/run-tests.mjs` now sets it from vitest's JSON
   result, but this repository's standing rule is to read the summary line and stderr every
   time.
3. Start the dev server and drive the classroom and notebook in real Chromium through the
   `/dev` harness routes, which mount the real components against in-memory stores with no
   sign-in (`/dev/classroom` with its `?view=` states, `/dev/classroom-*`, `/dev/notebook*`,
   `/dev/themes`, `/dev/presence`, `/dev/grading*`, `/dev/html-assignment*`, `/dev/home-*`,
   and whatever else `src/routes/dev/` holds that touches these surfaces). Drive them at
   **1440x900, 1366x768** (budget school laptops), **960x900** (half of a 1920 screen),
   **375x812**, and, once Space White exists, a **1280x800 projector profile**. Screenshot
   every state you judge, rasterize, and look.
4. Run these tasks from nothing, as the person named, counting actions and noting every
   stall. They are the Phase 3 loop's starting set.
   - Student: find what is due today across all of your classes and what is missing.
   - Student: open today's assignment, photograph two notebook pages for it, write two
     sentences about a design decision, and turn it in.
   - Student: find the rubric for an assignment before starting it.
   - Student, on a phone: see that the teacher returned a grade, read the feedback.
   - Teacher at the front: put today's agenda on the projector with a 10-minute timer, see
     who has not opened the current assignment and who has gone idle, and send one student
     on a hall pass, without the class seeing anything private.
   - Teacher: post the same material to all three IDEA209H sections, scheduled for
     tomorrow, with a notebook check-in attached.
   - Teacher: grade twenty submissions of one HTML assignment, then the notebook entries for
     the same day, without returning to a menu between students.
   - Teacher: find every piece of ungraded or resubmitted work across every class.
   - Mr. Cosso, who has no Claude access and was never shown the new surfaces: do the last
     three tasks on his own.
5. Score every area in section 3 from 0 to 4 against the rubric there, with one line of
   evidence per score (a file, a measured behavior, or a screenshot). The scores in section
   3 are the router's claims; replace them with yours.
6. Start `docs/classroom/overhaul-0297/FRICTION.md`: every place the program was slow,
   confusing, ugly, dead, cramped, overlapping, wasted space, or missing something, one line
   each, tagged with its area. This log is the main source of the unlisted work in section 6.
7. Write the plan: which areas go first under the catch-up rule, which agents own which
   files, which shared files have a single writer, and the order the foundation lands in.

## 3. The maturity ledger and the catch-up rule

His rule, stated for IdeaCAD on 2026-09-22 and applied here by him on 2026-09-23: "If one
part of the program is built out really in depth right now, I want the other parts to catch
up before further progress is made on the more developed parts."

**Rubric.** 0 absent. 1 exists but a student or teacher cannot use it without help, or it
lives somewhere nobody goes. 2 usable for the basic case, with visible gaps. 3 covers what a
student in IDEA100, IDEA209H or FRC, or Mr. Pina or Mr. Cosso at the front of the room, needs,
discoverable without instruction. 4 matches the vision, including space efficiency and speed,
and holds up under real class use.

**Router's claimed starting scores** (replace in Phase 0):

| Area | Claim | Basis |
|---|---|---|
| Shell, navigation and layout | 2 | Two-pane `ClassSplit` above 1024px. At 1440 with an item open, the detail pane is about 936px but its content is capped at `--measure-reading` 46rem (about 200px unused); People, Grades, Duplicates and the class list cap at 60rem (about 240px of margin each side). Panes are bounded by `100vh - --cr-chrome-h` (10.5rem, `split.css`). The class switcher is a dropdown pill. |
| Visual design and themes | 2 | Two site themes, IDEA and Matrix (`src/lib/theme.ts`), per browser, written to `<html data-theme>` by `ThemeRoot` in an `$effect` after hydration, so a non-default theme flashes on every full load. No light theme. `tests/theme-tokens.test.ts` forbids a theme from repainting the semantic and identity tokens and holds `--white`, `--dim`, `--ice`, `--gear` within 2% of base luminance, so a light theme cannot pass it as written. |
| Banners, mastheads and home entry | 1 | The home hero (`src/routes/+page.svelte`, styles in `src/app.css` `.legacy-index`, about 122 color literals) is hardcoded dark. `AnimatedLogo` is two raster PNGs and the text plate carries its own dark metal fill. `NotebookMasthead` is a separate dark band with its own theme toggle. `src/app.html` hardcodes `theme-color` `#0A0C0D`. The launcher's `ClassroomMark.svelte` and `NotebookMark.svelte` exist in `src/lib/marks/`. |
| Class stream and organization | 2 | Units in teacher order, pinned first, per-student fold state in `profiles.preferences.classroomUnits`. No search, filter, sort, or due-date axis in a class (report 19). |
| Student to-do, due dates and missing work | 1 | Only the site home's `ClassroomFeed` (`feed.ts`, due soon 7 days). Nothing inside `/classroom`; no Missing list; no notifications of any kind. |
| Item page (student) | 3 | Engines by `assignment_schema_version` (v1 interactive spec, v2 reference, v3 ported HTML, v4 IdeaCAD link), autosave on an 800ms debounce mirrored to localStorage. Inline body links render bare (report 20); no image gallery (23) or lightbox (35). |
| Creation and composer (teacher) | 3 | Full-viewport `ContentComposer` (3,793 lines): rich text, staging, multi-section, scheduling, spec import, rubric, check-in. Of nine drop targets on the shared `src/lib/file-drop.ts` primitive, three carry an `accept` (the composer's deck box, `PeoplePanel`, `SpecImporter`); the composer's root zone files a wrong drop as a general attachment (report 21). |
| Grading and feedback | 3 | `GradingConsole` (4,544 lines): leveled rubric on keys 1-4, N/P students, S save, R R return, bulk plans, dictation, export. No comment bank, no carousel across assignments, no needs-attention queue across classes, no AI grade import or instructor-only grading standards (all left by ledger 0288). |
| Live class and the teacher at the front | 1 | Presence (`src/lib/classroom/presence/`) shows only in the grading roster. Hall pass and song queue are live. No class-wide live view, no projector or present view, no timer or agenda board. The only fullscreen is `DeckViewer`. |
| People, teams and class tools | 3 | Roster, CSV import, random picker, teams that persist, export and post (0293, migration 0223). |
| Notebook capture | 1 | A separate app at `/notebook` (`NotebookView.svelte`, 4,407 lines). At least five taps per photographed page, each photo forced through `PhotoCorrector`, desktop requires "New entry" first, and **staged photos exist only in browser memory until Save draft or Turn in**. Nothing in an item page captures into the notebook. |
| Notebook review and grading | 2 | `ReviewConsole` at `/notebook/review`: compliance grid, A accept, F flag, realtime, excusal, Documentation Check grading into the classroom gradebook. A separate app from grading. Flags are reason codes; feedback is a verdict, not a next step. |
| Notebook integration with the classroom | 1 | Check-ins merge into the stream and link out. Separate masthead, separate plate picker, separate theme registry (`notebook-theme.ts`: default, light, idea, matrix). `IDEA_MATERIALS_PROCESS.md` routes paper notebook work into assignment `imageZone`s, so assignment work bypasses the notebook entirely. No commit to the notebook since `526e248c` on 2026-09-13. |
| Search, command palette and shortcuts | 1 | Shortcuts only in the grading console and the notebook review console. No palette. No search inside a class. |
| Decks, media and embeds | 2 | Deck viewer with fullscreen; back control bottom-left in the scrimmed bar (report 34); one deck per item, enforced by a `unique` on `classroom_decks.item_id`. |
| Speed, reliability and deploy safety | 2 | Autosave and local mirrors for assignments and notebook text. `svelte.config.js` sets no `version.pollInterval` and nothing handles a deploy landing under an open page. No offline photo queue. |
| Accessibility and legibility | 3 | 44px student floor, contrast boards for themes. Projector legibility never measured. |
| Customization and preferences | 1 | Theme per browser, nav collapse, unit folds. No density, layout or default-view preferences. |
| Learnability without instruction | 2 | `InfoTip`s, and a spotlight tour (`src/lib/tour/SpotlightTour.svelte`, harness `/dev/tour`). |

**The rule, operationally.**

- Work proceeds in rounds. Each round starts by re-reading the ledger.
- An area scoring two or more above the current lowest gets **no new depth work** until the
  areas below it catch up. It still gets defect fixes, and whatever the foundation requires.
- Defects Mr. Pina named (dead space, text touching borders, overlap at half width, anything
  wasting space) are fixed wherever they are, regardless of score.
- Re-score only from evidence, and log every re-score with its evidence in
  `docs/classroom/overhaul-0297/MATURITY.md`.
- The end state is judged by the lowest score, not the highest.

## 4. Phase 1: the foundation, one writer per shared file

Build the foundation before the areas that depend on it. Assign one agent as the single
writer for each shared file named here and for any new registry, preferences or theme
module; other agents send it requests and never edit those files directly.

### F1. Theme roles and the Space White theme

His words: "a really clean, like futuristic space console, white theme option... shows
better on the projector and looks clean." The research (Part C) is the evidence.

1. **Role tokens.** Introduce or complete a role layer every classroom, notebook, shell and
   home-page component reads: grounds (page, panel, raised, inset), three text inks, a
   decorative hairline and a load-bearing boundary, accent ink, accent fill and accent field,
   status inks (success, warning, danger or live, info) with their fills, a single hot
   signal, focus ring, and elevation. Map every existing theme onto it so IDEA and Matrix
   render exactly as they do today (prove it with before and after screenshots and pixel
   diffs on the existing theme specs). Follow the design standard's alias rule: a surface
   scope redeclares its alias set, because a `var()` alias silently falls back to the dark
   value.
2. **Space White.** A third site theme beside IDEA and Matrix. Its character: cool, clean,
   off-white grounds with a faint green cast (not warm paper, not the notebook's old "light"
   plate), near-black ink, the IDEA green darkened into ink for text, icons and selection
   and kept at full brightness only as a large field, structure carried by load-bearing
   lines rather than fill steps, mono uppercase micro-labels above values, registration or
   corner marks used sparingly, no glow and no blur anywhere (glow has no light equivalent;
   replace it with a 2px ink border, a tinted container, or an inset bar). Start from the
   research's palette (Part C5) and measure it; do not copy it. Choose its name and its
   picker note; "Space White" is the working name.
3. **Legibility is measured, not assumed.** Extend the `/dev/themes` contrast board and its
   specs to cover Space White: every text role on every ground at 4.5:1 or better, every
   load-bearing boundary and focus ring at 3:1 or better, and **add a projector-washout
   check**: recompute every pair under a model of a 300:1 projector with ambient light at 10%
   of white added to every pixel (research Part C2), and require body text and status inks to
   stay readable and panels to stay separable under it. State the model in the spec.
4. **The theme test rules change, deliberately.** A light theme must repaint the semantic
   inks and the luminance of `--white`, `--dim`, `--ice` and `--gear`, which
   `tests/theme-tokens.test.ts` forbids today. Amend those rules for Space White with the
   reason written in the test (the rules exist to keep FRC paper and the FSP rooms legible,
   so measure those rooms under Space White or scope Space White away from them), and keep
   every protection for IDEA and Matrix exactly as strict as it is.
5. **No flash.** The theme is applied before first paint on every full load (a cookie read in
   `hooks.server.ts` with `transformPageChunk`, or an inline script in `src/app.html`; choose
   and justify). A choice already stored in the browser today (`idea_site_theme`, including
   every Matrix user's) carries over unchanged. `theme-color` follows the theme. The settled argument in
   `src/lib/theme.svelte.ts` stands: the theme is per device, not per account, because the
   projector laptop and a phone at night want different answers. The signed-out rule stands
   too: a visitor with no session sees the default.
6. **One tap while projecting.** The theme is switchable from the classroom's own chrome,
   not only from the profile menu, without a reload. Consider a "projector" pairing (Space
   White plus heavier boundaries and a larger type step for surfaces meant for the wall) and
   ship it if the evidence holds on the harness.
7. **Scope.** Space White covers the site chrome, the home page, the classroom, the notebook,
   and the shared components they mount (profile menu, feedback box, tour, identity banner,
   avatars, version badge). Rooms with their own identity (GAUNTLET, VANGUARD, GREENLINE,
   FRC, Foundry, Maps, tournaments, and IdeaCAD, which ledger 0296 owns) keep their own look:
   measure each under Space White and either leave it legible or scope the theme away from
   it the way `matrix.css` already scopes itself. Never edit IdeaCAD files.
8. **The logo.** `AnimatedLogo` must not read as a dark sticker on a light ground. Solve it
   without inventing a new mark (a vector rendition measured against the raster, a deliberate
   badge plate that belongs to the console look, or another approach); the design standard
   says the logo stays green under any accent.

### F2. Layout, density and space efficiency

His words: "Space efficiency. General efficiency. All very important."

1. Measure the dead space claimed in section 3 at every Phase 0 width, then remove it at the
   token and container level, not page by page: content widths that follow the pane they sit
   in, a detail pane whose content uses its width (HTML assignments are fluid by his rule),
   management pages that use the screen, chrome that takes less height, and no content column
   capped narrow inside a wide pane.
2. **Instructor density.** A compact density on instructor-only surfaces, declared by a
   named class on the surface root as `IDEA_INTERFACE_STANDARDS.md` 2.12 requires (24px
   floor), chosen by the teacher as a preference. Student surfaces stay at 44px at every
   width. Space efficiency is achieved by removing waste, never by shrinking a student target.
3. Sweep every classroom and notebook surface at every width for text touching its border,
   overlap at 960, clipped or truncated labels, and horizontal scroll at 375, and fix each at
   the component level.

### F3. One command registry

Every classroom and notebook action is registered once: name, icon, one-line description,
the role that may use it, the context it applies to (a class, an item, a student, a
selection), and an optional shortcut. The command palette (Cmd or Ctrl plus K, scoped to the
current class, with prefixes for students, items and actions), right-click and row menus,
the shortcut legend, the tooltips, and any tour read the registry. Nothing hard-codes a tool
list twice. Adopt the grading console's and notebook review console's existing keys into it
without changing what they do. Shortcuts stay optional; nothing requires memorizing one.

### F4. The notebook inside the classroom

His words: "Integrate the notebook into IDEA Classroom with IDEA Classroom being the driving
force. So visually and functionally the IDEA notebook should follow IDEA Classroom, not the
other way around."

1. **Where it lives.** A student's notebook for a class is a surface of that class, inside
   the classroom shell and its two-pane split, reached from the class's own navigation, and
   the teacher's review of a class's notebook is a surface of that class beside People and
   Grades. The all-classes notebook opens inside the classroom shell too. Every existing
   notebook URL keeps working (`/notebook`, `/notebook?checkin=<session>&section=<class>`,
   `/notebook/review?section=`, `/notebook/review/student/<email>`,
   `/classroom/view-as/<email>/notebook`), by redirect or by rendering the new surface.
2. **How it looks.** It is the classroom: the same masthead, the same tokens, the same site
   theme including Space White. The separate `NotebookMasthead` band and the plate picker
   leave. His 2026-09-23 words supersede rebuild-plan decisions 14 and 15 on this point;
   record the change as a new decision in `IDEA_CLASSROOM_REBUILD_PLAN.md` and leave the rest
   of 14 and 15 standing. His same words supersede decision 3's exclusions where this run
   needs them: the home screen's banner and launcher now follow the active theme, and the deck
   stage takes report 34's back control, placed so nothing floats over a projected image. If a reading plate for photographs of paper is still worth having,
   it lives in the photo viewer, not on the page. A stored plate id must never error or
   strand a student on a plate they cannot change back.
3. **Capture where the work is.** From any item page, and from the class, a student adds to
   their notebook in one step: a photo (camera first on a phone, file picker or drop or paste
   on a laptop) or a note, filed automatically against that item's check-in when it has one,
   and otherwise to the class and today's date with the item's title. The data model allows
   this without a migration as far as the router can see (`notebook_entries.section_id`,
   `session_id`, `custom_label`; `notebook_session_postings.item_id`;
   `notebook_create_item_check_in` from `0120`); confirm it.
4. **Nothing captured is ever held only in memory.** Staged photos today live only in the
   browser until Save draft or Turn in. A photo is uploaded as a draft the moment it is
   taken, with a visible stored, uploading and uploaded state, and survives a reload, a dead
   battery and a deploy. Perspective correction becomes a choice after the fact rather than a
   screen every photo must pass through.
5. **One entry frame.** `NotebookEntryCard` and `EntryReview` implement the entry frame twice
   (rebuild plan phase 4c-2, owed); consolidate it as part of this work.
6. **Rules that stand** (rebuild plan decisions 12 and 13): a check-in attaches to an item
   through the posting and never becomes a `classroom_items` kind; the notebook is
   soft-delete throughout and every deletion is reversible; the Documentation Check stays the
   one scoring path, through `classroom_grade_submission`.

### F5. Per-user preferences

One store for everything a user customizes: density, layout (pane widths, collapsed panes),
default class view, grading defaults, hint and tour state, and the comment bank if the audit
finds it can live there. Decide per setting whether it follows the device or the account and
say why (theme stays per device, above). `profiles.preferences` already carries per-student
unit folds; audit whether it can hold the rest without a migration, and through what write
path. `CLAUDE.md` records that `profiles.preferences` is written by a client-side merge of
the whole object, so two devices can race; keep to that write path and do not widen the
race. Build behind a storage interface a server store can take over later without changing
any caller.

### F6. Deploy safety, before anything ships

This run ends by pushing to `main`, which deploys `ideabosco.com` while students may be in
class. **Nothing is pushed to `main` until this is in and proven.**

1. **New versions arrive many times a day.** `vercel.json` has no `ignoreCommand` (commit
   `30c0f403` removed it on 2026-09-13), so every classroom export commit under `materials/`
   is a full production deploy, and one lands each time a teacher saves an item. A deploy
   landing under an open page must never lose typed or captured work and must never disturb
   a class: detect a new version (`version.pollInterval` or equivalent) and take it **only
   when the user navigates**. Never reload an idle page, a fullscreen page, or anything on a
   projector (a deck, the hall pass, a timer, a tournament TV stage, `/fsp/live`, IdeaCAD's
   in-memory model).
2. A lazy-loaded chunk that fails after a deploy recovers without a white screen and without
   losing the page's unsaved state.
3. Prove both on the harness by simulating a version change under an open assignment with
   unsaved text and an in-flight photo upload, and under a fullscreen deck.
4. Whether Vercel's skew protection is enabled is a dashboard setting a container cannot
   read; build so the app is safe either way and note it in the history entry.
5. Tabs already open when this run deploys are running the old build without any of this.
   That is the same exposure every export deploy has today; say so in the history entry rather
   than delaying the push.

## 5. Seeds by area

Each area lists what Mr. Pina asked for, then open reports and the research's highest-value
moves, then what done means. Seeds are starting points.

### Visual design, themes, banners and home entry
- Asked: the Space White theme (F1). "Don't forget to update the banner to the active theme."
  Every banner and masthead a classroom user sees follows the active theme: the home hero,
  the launcher cards and the Classroom card on the home page, the classroom masthead, and the
  notebook's (which becomes the classroom's).
- The Classroom card deserves the care ledger 0296 gave IdeaCAD's card (on
  `claude/gracious-ride-cdf7jw`, commit `648e3152`: `src/lib/marks/IdeaCadMark.svelte`, a
  tokenized mark with `--*` color hooks, no literal colors, motion only under
  `prefers-reduced-motion: no-preference`, and a still frame that is the rest state). The
  Classroom card already has `src/lib/marks/ClassroomMark.svelte` (an animated mortarboard)
  and the Notebook card `NotebookMark.svelte`; redesign them in place to that standard, and
  decide what the Notebook card becomes once the notebook lives inside the classroom. Leave
  the IdeaCAD card and mark to 0296.
- Done: switching theme changes every banner, masthead and card in one frame with no flash,
  at every width, and each is legible under the projector model.

### Shell, navigation and layout
- Report 26, verbatim: "Instead of having to click on this dropdown button on the top to see
  my classes, my classes should just be listed on the top page banner itself in the form of
  icons." Constraint claimed by the triage chat: `navSections` has no limit and RLS makes it
  every section in the school for an admin, so the row must survive an arbitrary count;
  `ClassroomShell.svelte` says `.sw-menu` is trapped in the header's stacking context and
  that pin is load-bearing; there is no per-section glyph, so derive one (the course code).
- Report 34, verbatim: "the back button on this page should be in the top left of the
  screen, all back buttons should be somewhere on the top left of the screen." Tension
  claimed: the deck stage is projected and "nothing may float over it". Resolve it and say
  how.
- Research: list plus detail with a persistent selection; the class index as a collapsible
  drawer showing completion and where you are.
- Done: no dead space at any width, and a student reaches any class, item or notebook entry
  in two actions.

### Class stream and organization
- Report 19, verbatim, from a student: "It would be nice to have more organization on the
  website with assignments." Claimed: units already exist; what is missing is a second axis
  (search, filter, sort, a due-date view). `classroom.ts` records that grouping replaced the
  Stream and Classwork pair and that due-date bucketing of the whole stream was dropped on
  purpose; a filter is a different thing from that decision.
- Research: numbered items and topics over a pushing stream (Keeler); unit progress with
  item checkmarks and a sentence explaining any lock (Canvas, Moodle 5.2).

### Student to-do, due dates and missing work
- Research: Assigned, Missing and Done, grouped by This week, Next week, Later and No due date
  (Google Classroom), inside the classroom and across classes; the rubric visible before
  starting; visible progress.
- Done: a student sees everything owed across every class in one place, from any classroom
  page, on a phone.

### Item page and rendering
- Report 20, verbatim: "embed YouTube thumbnails in YouTube links on materials on the IDEA
  classroom." Claimed: `link-preview.ts` and `LinkPreviewCard.svelte` already render
  thumbnails for the structured Links list; an inline link in the body renders bare because
  `ItemBody.svelte` walks the document with no `{@html}`. Decision 23 (an accepted SSRF gap in
  the preview fetcher, left as is) stands: do not reopen it and do not add an outbound fetch
  path that changes it.
- Report 23, verbatim: "uploading a zip for related images makes a nice gallery... that same
  upload button should support galleries... maybe when I upload something I should specify if
  it's a presentation or an image gallery... and I should be able to upload multiple of those
  zip files." Claimed: `planDeck` requires one root-level entry page and refuses otherwise;
  more than one deck per item is refused by a `unique` on `classroom_decks.item_id`, which
  only a migration can drop. Find the version that needs no migration (for example, an image
  zip expanded into the item's ordinary attachments and rendered as a gallery), build that,
  and write the rest as proposed SQL (section 7).
- Report 35, verbatim: "when uploading a zip file for an image gallery each of these images
  should be clickable and expandable on screen with zoom functions, download functions and
  all that kind of stuff." Claimed: `src/lib/panzoom/` is feature-agnostic and
  `src/lib/notebook/PhotoViewer.svelte` is a ready lightbox with zoom and fit but no download.
- Done: every kind of item reads well at every width, and every image in the classroom opens
  large with zoom and download.

### Creation and composer
- Report 21, verbatim: "I want to be able to drag and drop HTML specs, currently drag and drop
  only works for general file upload, I want different drag and drops for different uploads
  on the page." Claimed: nine drop targets already exist on one primitive in
  `src/lib/file-drop.ts`; three carry an `accept`; the composer's root zone silently files a
  wrong drop as a general attachment, and a screenshot once staged twice, the second time onto
  the class-readable list. `file-drop.ts`'s header documents a deliberate rule (no `accept` on
  a plain picker, on either side); read it before changing anything. Fix refusal wherever a
  target has a type rule: the drop and the picker refuse the same types with the same
  sentence, and the root zone never claims a file a nested target should have taken.
- Research: reuse a post into other sections with scheduled publish; a due-date clash view
  when scheduling.

### Grading and feedback
- Left by ledger 0288: a comment bank, and AI grade import with grading standards invisible
  to students (his words: "I want a way to import grades from an AI system. From ChatGPT or
  Claude. As well as AI grading standards invisible to students."). The outbound half exists
  (`grading-export.ts`); inbound does not. The comment bank was blocked on a migration; check
  whether the preferences store (F5) can hold it without one. The hidden standards: an
  instructor-only document on the item (`0090` instructor materials) needs no model change;
  a hidden field on the rubric does, and every rubric renderer would have to be proven never
  to leak it. Choose and justify.
- Research: a carousel (save moves to the next ungraded work, then the next assignment); one
  needs-attention queue across sections and classes, including resubmissions and new notebook
  entries; comments attached to rubric levels; release feedback before the grade where the
  teacher chooses.
- Done: grading a class set never returns to a menu, and every ungraded thing in every class
  is one click away.

### Live class and the teacher at the front
- Research: a projector view separate from the teacher's control view, showing today's
  agenda, a large clock and timers, hall pass status, and starred anonymized student work; a
  live students-by-work grid for the current item (not started, working, idle after a fixed
  threshold, needs grading); a phone as a remote; a warm random picker and presence-driven
  groups. `live.ts` already carries a broadcast channel per section with presence, hall pass,
  song queue and responses topics.
- Done: he runs a class period from the front with the projector showing only what the class
  should see, and knows at a glance who is stuck.

### People, teams and class tools
- Teams shipped in 0293 (migration 0223): rosters that persist, export and post. Build on
  them rather than beside them.

### Notebook capture, review and integration
- Asked: F4, and "genuine integration and usefulness and practicality."
- Research, ranked for this program: the notebook inside the class and inside each assignment;
  today's entry created per class day and carrying the day's prompts, written by the teacher
  once for all sections; one-step capture with edge detection as the default and an offline
  queue; an approve-all review queue per class day filtered to new since the last look, with
  one specific next-step comment from editable chips instead of a bare verdict; review and the
  Documentation Check reachable from the grading console; a project timeline stitching entries,
  hand-ins and images in date order; two iterations side by side with a "why this changed"
  field; starring entries into a portfolio PDF (the FTC 15-page shape, and FRC interview
  preparation); projecting a student's page with the name hidden; individual streaks with no
  leaderboard; voice notes if the browser path is honest.
- The standard in `IDEA_MATERIALS_PROCESS.md` sends photographs of paper notebook pages into
  assignment `imageZone`s. Make that work count toward the notebook too, so a student never
  photographs the same page twice (for example, the student's own hand-ins and zone images
  appear in their notebook timeline for that class, read-only). Do not change how graded
  assignments store answers.
- Done: a student captures a page in fewer actions than today, from where the work already
  is; the teacher reviews a class's day of entries in one pass; and the notebook shows a
  student something useful they would otherwise have to assemble themselves.

### Search, command palette and shortcuts
- F3. Search inside a class over items, units and notebook entries; search across classes
  for the teacher.

### Decks, media and embeds
- Reports 23, 34 and 35 above. The deck stage stays clean when projected.

### Speed, reliability and deploy safety
- F6. Optimistic saves that feel instant, prefetch of the next item and the next submission,
  and no action that waits on the network without saying so.

### Accessibility and legibility
- Every surface passes the contrast board under every theme, including the projector model.
  WCAG 2.2 AA additions that bite here: focus never hidden under a sticky header, and every
  drag has a single-pointer alternative.

### Customization and preferences
- F5. A reset to defaults for each group.

### Learnability without instruction
- No prose instructions in the interface. Rich tooltips from the registry; an optional,
  never-blocking walkthrough for teachers (Mr. Cosso first) that points at real controls,
  built on the existing spotlight tour and its `/dev/tour` harness.

### Lane E is folded in
Ledger 0285 ("lane E", written by the feedback-triage router chat on 2026-09-22 and never
run, so no file for it exists on any ref) bundled an `integrate.yml` fix with the classroom
reports above and was allocated migration number 0225. Its classroom half is this brief's
seeds. Do not touch `.github/workflows/**`, and do not use ledger number 0285 or migration
number 0225.

## 6. Phase 3: seek out what nobody listed

Once the foundation is in and the lowest scores have moved, run this loop until the budget
is spent, keeping enough to ship:

1. Pick a task from `FRICTION.md`, or invent one a fourteen-year-old in IDEA100, a sophomore
   in IDEA209H, an FRC student, Mr. Pina at the front of the room, or Mr. Cosso on his own
   would plausibly attempt on a normal class day.
2. Do it in Chromium at the width that person would use. Count the actions. Where you know
   the same task's count in Google Classroom or Canvas from its documentation, write both
   down.
3. Every step that was slower, more confusing, more cramped or uglier than it should be
   becomes a line in `FRICTION.md`, tagged with its area.
4. Fix the line if it serves the vision and the catch-up rule allows it. Re-run the task and
   record the new count.

Write a short rationale for any change not traceable to a seed, a research finding, or a
friction line. A change that cannot be justified against `VISION.md` does not ship.

## 7. Rules for the run

**The classes using it today.**
- **Nothing published changes meaning.** Before touching anything that renders a published
  item, read its export under `materials/<course>/<slug>/` (the only readable evidence of
  what students are looking at). Block ids and module ids are the join key for student
  answers and are never renamed; checklist answers are positional; the graded rubric is a
  separate stored copy in `classroom_rubrics`.
- **Every existing URL keeps working**, including links pasted into posts, short links, and
  QR codes on printed materials.
- **No work is lost**: autosave, local mirrors, drafts, uploads in flight, and across a
  deploy (F6).
- **Existing documents, entries and preferences load unchanged.** A stored theme, plate or
  preference value from before this run never errors, and resolves to something the user can
  change.
- **Role parity** (rebuild plan decision 10): the instructor sees what the student sees plus
  a visibly distinct inspector.

**The database.**
- **No migration. Write nothing under `supabase/migrations/`.** This run merges to `main`
  and a deploy carrying a migration comes back to Mr. Pina, who applies SQL by hand first.
  Every row-level-security boundary stays exactly as it is.
- Where a seed genuinely needs schema, build the part that needs none, and write the rest to
  `docs/classroom/overhaul-0297/0227_PROPOSED.sql` with its explanation in the history entry.
  Number 0227 is reserved for it (0225 is held by the unrun ledger 0285 and 0226 by ledger
  0296). The proposed SQL follows every rule a real migration would: owner row-level
  security; revoke from `anon` by name following `0166`'s shape (revoking from `public` does
  not remove Supabase's direct `anon` grants); a
  verification query that RETURNS ROWS naming what it examined and says so when it examined
  nothing, because the SQL editor shows no notices; a planted negative control; no
  dollar-quote token inside a `--` comment.
- A cloud container cannot reach the production database. That is permanent, not a defect.
  Never print a secret or write a command that would print one; never set or read
  `SUPABASE_ACCESS_TOKEN`; never run `supabase db push`.

**What this run owns, and what it does not.**
- Owns: `src/lib/classroom/**`, `src/routes/classroom/**`, `src/lib/notebook/**`,
  `src/lib/notebook*.ts`, `src/routes/notebook/**`, `src/routes/api/notebook/**` and
  `src/routes/api/classroom/**` where a seed needs them, `src/lib/shell/**`,
  `src/lib/design-system/**`, `src/lib/theme.ts`, `src/lib/theme.svelte.ts`, `src/app.html`,
  theme handling in `src/hooks.server.ts`, the theme and banner rules in `src/app.css`,
  `src/routes/+page.svelte` and `src/routes/+layout.svelte` where a banner, theme or deploy
  safety needs them, `src/lib/AppLauncher.svelte` and `src/lib/portal-apps.ts` for the
  Classroom and Notebook entries and theme treatment, `src/lib/ProfileMenu.svelte`,
  `src/lib/brand/**`, `src/lib/marks/ClassroomMark.svelte` and `NotebookMark.svelte`,
  `src/lib/file-drop.ts`, `src/lib/tour/**`, shared components where a theme, border, overlap
  or space defect lives, `svelte.config.js` for deploy safety, tests for these surfaces
  (never `tests/**/ideacad*`), `tools/browser-verify/**` specs and `measured/*.json` for these
  surfaces plus the generated counts in its `README.md`, `src/routes/dev/**` harnesses for
  these surfaces, `docs/classroom/**`,
  `docs/standards/IDEA_CLASSROOM_REBUILD_PLAN.md`, `IDEA_CLAUDE_DESIGN_STANDARDS.md`,
  `IDEA_INTERFACE_STANDARDS.md` and their `REGISTER.md` rows, the sections of `CLAUDE.md`
  whose truth changes, `classroom-updates.json`, `docs/prompt-ledger/entries/0297-*`, and its
  own `docs/history/` entry.
- Does not touch: `src/lib/ideacad/**`, `src/routes/ideacad/**`, `docs/ideacad/**`,
  `src/lib/marks/IdeaCadMark.svelte`, the IdeaCAD launcher entry, `src/routes/dev/ideacad-*`,
  `tools/browser-verify/routes/ideacad-*` (ledger 0296 owns them and is running now on
  `claude/gracious-ride-cdf7jw`; that branch may be swept into `integration` and deleted
  mid-run, so look for its work on `main` and `integration` rather than by branch name), `supabase/**`, `materials/**` (never
  written from a branch), `.github/workflows/**`, `vercel.json`, and the other apps' own
  surfaces beyond measuring them under Space White and scoping the theme.
- If the work needs a file outside this list, prefer the smallest change that keeps the other
  owner's behavior identical, and name it in the history entry.

**Standards files.** Version each one you change (header and newest changelog entry agree,
`tests/standards-version-header.test.ts` refuses otherwise), update its `REGISTER.md` row,
and immediately before pushing to `main` check that `origin/main`'s copy has not moved since
you branched. If it moved, merge by content section by section and never overwrite; a clean
supersede can look like a fork, so read the diff.

**Craft.**
- Student surfaces keep 44px targets (`IDEA_INTERFACE_STANDARDS.md` 2.12, decision 09).
- Reduced motion is honored by every animation, including the banner mark; the reduced frame
  is the rest state, never a frozen mid-motion frame.
- Color is never the only signal.
- Never pure white `#FFFFFF` unless you amend `CLAUDE.md`'s rule with a reason.
- American spelling, and no em dashes, in code comments, UI copy and docs. Student-facing
  copy names no weekday.
- Every classroom-facing change appends a student-readable entry to `classroom-updates.json`
  (no table or function names). One agent owns that file and appends last.
- Never run prettier. Match each file's existing style.
- `npm ci`, never `npm install`. Write `.env` with placeholders before `svelte-kit sync`.
- Do not open or refill any other lane.

## 8. Verification, which is part of the work and not after it

- **Every new or changed surface has a `/dev` harness route that mounts the real component**
  with no sign-in, and a `tools/browser-verify/` spec at 375 and 1440 at least, plus 1366 and
  960 where layout is the point and the projector profile where the wall is the point. A
  harness mirrors the whole mechanism it stands in for, including the route's
  `--cr-measure-route` (ledger 0288 found a layout decision taken against a width the real
  route never has, because the harness did not set it).
- **Rasterize and look.** This Chromium paints no scrollbar into screenshots, `readPixels`
  reads zero when the drawing buffer is not preserved, and a content check passes over a
  broken layout. Playwright evaluates a string as an expression, so pass functions.
- `npx svelte-check`: zero new errors against the Phase 0 baseline; state warnings before and
  after.
- `npm test`: read the summary line and stderr, never the exit code alone. Report files,
  tests, passed, failed and skipped with the command.
- **Mutation proofs** for the load-bearing new behavior (theme application before paint,
  capture never held in memory, the deploy-safety reload point, drop refusal, the carousel's
  next-item order, URL redirects): break it, show which test reddens, restore from a byte
  copy verified by hash. Mutation runs go through `npm test` (it passes
  `--no-file-parallelism`), or `tools/mutate-check.mjs`; never a bare `npx vitest run`. Never
  commit while a mutation run is in progress.
- Screenshots of every seed's final state, at the widths that matter, in
  `docs/classroom/verification/0297/`, each theme where theme is the point.
- Measure and report: page weight and time to interactive for the class page and an item
  page before and after, and the time from tapping capture to a stored draft.
- `verify:readme` runs once, at the end, in the order section 9 gives (regenerate, then
  commit), with the port guarded.

## 9. Ending: ship it live

1. Update `docs/classroom/VISION.md` only to add a line under "Open questions" for anything
   only Mr. Pina can answer. Update `IDEA_CLASSROOM_REBUILD_PLAN.md` with every decision this
   run made that a future session must not relitigate, including the superseding of
   decisions 14 and 15 on the notebook's appearance.
2. Final `MATURITY.md` with before and after scores and evidence, the lowest score first.
3. The history entry `docs/history/<this branch>.md` states, in this order: what Mr. Pina
   should look at first and where; the sha pushed to `main` and the version production
   serves; whether `0227_PROPOSED.sql` exists and what it would do; what shipped by area;
   what was tried and abandoned and why; every claim in this brief that was wrong; anything
   he must decide; and anything Mr. Cosso needs to know, written for someone who was never
   shown the new surfaces.
4. **Merge to `main` yourself.** Mr. Pina approved this and wants it live as soon as it is
   done. That supersedes the "no merge during school hours" line some earlier lane prompts
   carried: export commits already deploy mid-class many times a day, and F6 is what makes
   a deploy safe for an open page, so **F6 must be in before this step.** Budget for it: when
   the work is finished or the budget is nearly spent, stop building and keep enough to do
   all of the following.
   1. **Bring `main` into your branch.** `git fetch origin main integration`, then merge
      `origin/main` into your branch. Ledger 0296 is running now and will likely have pushed
      a large IdeaCAD change to `main` by then; its expected overlap with this run is
      `src/lib/AppLauncher.svelte`, `tests/home-order-and-accent.test.ts`,
      `tools/browser-verify/README.md`'s generated counts, `tools/browser-verify/measured/*.json`
      (`marks.json` above all) and `classroom-updates.json`. Resolve by content, keeping both
      sides' intent: `classroom-updates.json` keeps both sides' entries; generated counts and
      measurements are regenerated, never hand-merged. Any conflict you cannot resolve by
      content is a stop: push your branch, record it in the history entry, and do not touch
      `main`.
   2. **Regenerate, then commit.** `npm ci`, `npx svelte-kit sync`, then
      `npm run verify:counts` (the static half, which `npm test` checks), then
      `npm run verify:readme` once with the port guarded, then commit so the tree is clean.
   3. **Verify the committed tree exactly as CI would.** Read `.github/workflows/ci.yml` and
      run each of its steps locally on the Node major it pins where the container has it:
      `npm run check` (zero new errors against the Phase 0 baseline), `npm test` (read the
      summary line and stderr; **zero failures**), the VANGUARD changelog check, and
      `npm run history:verify`. Also `npm run build`, `node tools/claude-md-check.mjs`, and
      `npm run verify:counts -- --check`. Record the Node major you ran under (CI pins 24).
      Then push this merged, committed tree to your branch; CI runs on every push, so where
      its status on that exact sha is readable from the container, wait for it to go green
      before step 5, and where it is not, say so in the history entry.
   4. **If `tests/identity-style-shared.test.ts` still fails** because its premise expired on
      `main`, and `main` has not fixed it by then, fix it by content so it tests what it was
      written to test, say exactly what you changed in the history entry, and continue. If
      `main` already fixed it, take `main`'s fix. Any other failure you cannot fix is a stop:
      push your branch only and record exactly what failed.
   5. **Merge into `main` as one revertible commit.** Check out `origin/main` and
      `git merge --no-ff <your branch>` (`CLAUDE.md`: merge with `--no-ff` so the feature
      reverts as one commit). Immediately before pushing, confirm
      `git diff origin/main HEAD --stat` shows nothing under `supabase/migrations/` or
      `materials/`, then `git push origin HEAD:main`. Never force. If the push is
      refused because `main` moved: when every new commit on `origin/main` touches only
      `materials/**`, merge it and push again without re-running the suite; otherwise repeat
      from step 1.
   6. After `main` is pushed, merge `main` into `integration` and push `integration`, so the
      two do not diverge. `integration` may hold swept work that is not on `main` (0296's
      branch among it). On any conflict there, stop that step and record it; never resolve
      it on `main`.
   7. Record in the history entry the six-item merge checklist `IDEA_instructions.md` gives
      for a lane that merges `integration` into `main` (decision 16), item by item. **This run
      takes a different route that Mr. Pina approved on 2026-09-23 (branch straight to
      `main`), so that checklist is a record here, not a gate, and nothing in it is a stop.**
      Gates 1 and 2 (`main` an ancestor of `integration`; the branch contained in
      `integration` with CI green on its tip) are "not applicable: direct merge approved
      2026-09-23". Gate 4 is met by an empty migration delta under decision 34; say it was
      vacuous rather than passed.
5. **Confirm the deploy, and be ready to undo it.** Wait for production to update, then read
   `https://ideabosco.com/` and compare the version string it serves (`v1.N · <sha>`) against
   the merge commit you pushed. A push is not a deploy until the served sha matches.
   Production reachability differs per container; measure it, and if this container cannot
   reach production, say so and do not claim it deployed. Once it matches, smoke-check over HTTP:
   `/` returns 200 and serves the merged sha; the `/_app/immutable/` entry scripts that HTML
   links return 200; and `/classroom` and `/notebook`, requested signed out, answer with the
   auth guard's 303 to `/` (from `authedPrefixes` in `src/hooks.server.ts`), which is correct
   and proves only that the guard runs. **If production is broken,
   `git revert -m 1 <merge commit>`, push that to `main` the same way, confirm the revert is
   served, and record everything.**
6. **Finish the record.** Write the served sha and version into the history entry and flip
   ledger 0297's Status from `issued` to `pushed` as your final commit. Push it to `main` the
   same way (fetch, merge, `--no-ff`, the diff check, push). If only files under `docs/`
   changed since the last full verification, run `npm run history:verify` and the ledger and
   history tests rather than the whole sequence; if anything else changed, run all of it.
   That push is one more production deploy; that is expected, and F6 makes it harmless to
   open pages.
