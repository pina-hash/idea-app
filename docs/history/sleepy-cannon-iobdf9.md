---
title: "Ledger 0346: the Plate on every page built from the site's shared shell, and the classroom's four remaining visible defects fixed (`claude/sleepy-cannon-iobdf9`, no migration)"
date: 2026-09-28
branches: [claude/sleepy-cannon-iobdf9]
migrations: []
subsystems: ["IDEA Classroom", "Portal", "Foundry", "Tournaments", "IDEA Maps", "Coin Desk", "Browser harness", "Standards", "Documentation"]
---

The report for ledger 0346. Ledger 0345 put the Plate, the classroom's machined shape language, on every IDEA Classroom page. Mr. Pina asked on 2026-09-28 for the same look on the rest of the site and for what was still visibly wrong on the live classroom to be fixed. Both are done. He was teaching and nobody was asked anything; every call below was made by this session and is written down so it can be reversed.

**THE TWO ONE-LINE REVERTS.**

- **The site:** in `src/lib/shell/site-plate.ts`, `export const SITE_PLATE = 'site-plate';` becomes `export const SITE_PLATE = '';`. The root layout then renders no wrapper on any route and nothing in `plate.css` or `site-plate.css` can match, so every page outside the classroom renders as it did before this bundle.
- **The classroom:** unchanged from 0345, `export const CLASSROOM_PLATE = 'cr-plate';` becomes `''` in `src/lib/classroom/plate.ts`.

## How the Plate reaches the site

- **One stylesheet, two switches.** `src/lib/classroom/plate.css` keys every rule on `:is(.cr-plate, .site-plate)` (109 `:root :scope.cr-plate` openings, the token blocks, the `@scope` roots). `:is()` of two single classes has the specificity of `.cr-plate` alone, so the classroom's cascade is exactly what it was. **Measured:** with only that substitution made, three classroom routes re-captured against the original file read 0 differing of 5,728 elements (the other seven routes read 0 in the first comparison).
- **The switch.** `SITE_PLATE`, `sitePlateInScope` and `sitePlateClass` in `src/lib/shell/site-plate.ts`. `src/routes/+layout.svelte` renders the page and its root-mounted siblings (the pathway picker, the install prompt, the report box) inside `<div class={plate} style="display: contents">` on an in-scope route, and renders them with no wrapper otherwise. It is decided from the path alone, so the server and the client agree and nothing flashes. A left-out product's DOM is therefore byte-identical, which is what makes the scope proof below possible at all.
- **Scope is a list of what is in, and fails closed.** `SITE_PLATE_EXACT` (`/`), `SITE_PLATE_PREFIXES` (`/dashboard`, `/admin`, `/archive`, `/auth`, `/coin-desk`, `/foundry`, `/maps`, `/tournaments`), `SITE_PLATE_EXCLUDE` (the tournament TV stage) and `SITE_PLATE_DEV_PREFIXES` for the harnesses. `/dev/themes-shape` is refused explicitly, because it wears the classroom switch and a page must not carry both roots.
- **`src/lib/shell/site-plate.css`** holds only what is the site's: each room's ground, the home hero's row, the coin desk's title row, the launcher cards, the maps blueprint grid removed, a checkbox accent, an empty Foundry block, and three `--dim` call sites. Every shared material (keys, tags, panels, wells, pads, headers) is the SAME rule in `plate.css`, with the site's own classes added to its list, room-qualified inside `:where()`.
- **The site's content islands** joined the `@scope` lower bound: the tournament TV stage (`.tnm-root.tv`), the maps viewer's plan and elevation drawings, and the frame a student's Foundry app runs in.

## Scope table

Every route under `src/routes/` that is not under `/classroom` or `/dev`.

**IN SCOPE (29 pages):**

| Route | What it is |
|---|---|
| `/` | home: hero, launcher, class feed, signed-out landing |
| `/dashboard` | admin console |
| `/admin/ideacad-materials`, `/admin/links`, `/admin/notebook-drive-test` | admin pages; `/admin/links` is the short-link manager |
| `/archive` | course archive |
| `/auth/error` | sign-in error page |
| `/coin-desk`, `/coin-desk/contracts`, `/coin-desk/economy`, `/coin-desk/preview`, `/coin-desk/roles`, `/coin-desk/students` | the coin desk; `/coin-desk/preview` mounts the student coin balance and contracts views |
| `/foundry`, `/foundry/author/[ownerId]`, `/foundry/classes`, `/foundry/contract`, `/foundry/mine`, `/foundry/review`, `/foundry/submit` | Foundry's own pages (the gallery, author page, submission, review) |
| `/maps`, `/maps/edit`, `/maps/edit/shelf` | IDEA Maps viewer and editor chrome |
| `/tournaments`, `/tournaments/new`, `/tournaments/[id]`, `/tournaments/[id]/entry/[entryId]`, `/tournaments/[id]/host`, `/tournaments/[id]/match/[matchId]` | tournaments, less the TV stage |

**LEFT OUT:**

| Route | Why |
|---|---|
| `/gauntlet/**` | GAUNTLET's own design system (`.gt-root`) |
| `/vanguard` | VANGUARD, the editable legacy game |
| `/greenline/**` | GREENLINE's own brand (`.glb`) |
| `/ideacad/**` | IdeaCAD's modeling workspace (`.ic-root`) |
| `/frc/**` | FRC Team 5669's own identity (`.frc-root`, FIRST marks) |
| `/fsp/**`, `/fsp-pulse/**`, `/fsp-tech-selection/**` | FSP's own navy and gold (`.fsp-root`), decks and live slides |
| `/tournaments/[id]/tv` | a projected full-screen stage; also a `@scope` island |
| `/classroom/**` | wears the classroom's own switch; the projector is left out by 0345 |
| `/notebook`, `/notebook/review/**` | redirects to the classroom's notebook, which wears the classroom switch (the "standalone notebook" of the prompt is that page now) |
| `/reference/[itemId]` | the public reference viewer: 0345 left it out as a public content page, and this bundle keeps that call |
| `/coins/**` | the frozen legacy IDEA Coin Ledger (`src/lib/legacy/coins/index.html`), which no stylesheet of ours reaches and which the freeze forbids editing |
| `/coin-balance`, `/contracts` | redirects; their views are in scope through `/coin-desk/preview` |
| `/assignments/[slug]` | legacy HTML assignments (content) |
| `/a/**`, `/b/**`, `/foundry/preview/**`, `/foundry/download/**`, `/foundry/starter` | a student's published Foundry app and its bytes (content, and a second origin) |
| `/hx/[docId]` | a ported HTML worksheet (content) |
| `/[shortlink]` | never renders: it redirects or 404s |
| `/api/**`, `/auth/callback`, `/admin/drive-connect/**`, `/_platform/**`, `/sitemap.xml`, `/vanguard` server | server routes, no page |

## Part 1: the classroom's four visible defects

1. **Grading roster checkbox beside the row, not above it.** `.roster-item.pickable` is a wrapping flex item; `.roster-row` had `flex: 1 1 auto`, whose basis is its own max-content width (a name and up to three chips), so any row wider than the space beside the 44px checkbox dropped to its own line. It is `flex: 1 1 0` now. Same element, same click, same selection. **Measured:** 7 of 7 checkbox/row pairs share a line on `/dev/grading-bulk` and `/dev/grading-files` at both 1440 and 375 (the checkbox box's right edge at or left of the row's left edge, overlapping vertically), e.g. pick `353,918,44,61`, row `401,918,315,61` at 1440.
   - Sharing the line then squeezed the NAME to 0px wide at 375, because the chips never shrink below their widest chip. So `.roster-row` wraps: the name takes a 7rem basis and the chips drop to their own line, hard right, only when both do not fit. **Measured:** every roster name one line, 160px at 375, 262 to 325px at 1440.
2. **Names wrap between words, never inside one.** One utility, `.person-name` in `src/app.css`: `overflow: hidden; text-overflow: ellipsis; overflow-wrap: normal`, and the element carries the full name in `title`. **Measured in Chromium first:** the ellipsis applies per line, so "Bartholomewson Smith" in 70px reads "Barthol..." over "Smith". Applied to every list that renders a student name: the grading roster, People's roster and notebook rows and random-picker checklist, the live grid, the live control's drawn name, the notebook review grid's name (span and link), and the hall pass list. Each dropped its `overflow-wrap: anywhere`. Every one was checked to sit in a flex parent (text-overflow needs a block box). The notebook review grid is a locked contract: only a name longer than its box can look different, and the cells are untouched (its fingerprint is 0 differing).
3. **The chip lamp's clear space is 5px on both sides** (`--plate-led-gap`, was 4). The two pixels come back from the word: its tracking is -0.02em (was 0) and the padding after it 2px (was 3). The label stays 11px. **Measured** on `/dev/themes-shape`: Draft 44.61px wide (today's chip 45.11, 0345's 44.70), Pinned 50.33px (today's 50.86, 0345's 50.64), both 22px tall.
4. **The Returned tag and the rubric breakdown.**
   - The status tag under "Your work" is now a whole chip: 22px, 11px label, caps, recessed. The shared rule gives every other status tag the material only, because those sit in width-budgeted rows; this one sits alone.
   - The breakdown takes the field well's full recipe (a crisp shade line under the lip, a deeper shade band, the lit lip at the foot). Its face is the LIST well's, not the field's: the field face is a mid grey in Space White and put the breakdown's muted level text at 3.61:1. With the list face every text element on `/dev/item-returned` clears its floor in all three themes (sweep below).

## Part 2: what each page got

- **Everywhere in scope:** the plate ground behind the page (each room's own wrapper repainted at the classroom's specificity, so Matrix still makes the Foundry and the landing page transparent for its rain); the shared `.btn` keys, `.card` panels, field and select wells, labels and title bars from the existing rules; the floating Report pill as a key; checkboxes and radios in the plate accent instead of browser blue.
- **Home and launcher:** the header is the plate strip with its groove; the hero title is the title bar, sharing its row with the stats plate (a 22rem basis) so 0297's compact hero keeps "Your classes" above the fold; the stats plate is a plate panel (its chamfer clip is dropped, which cut its frame into broken corners on Space White); the to-do door and class feed cards are panels; the launcher's tools are keys; the feed's tags are recessed. Each launcher card is a raised link panel with a key's depth, all of it shadow: its face stays its own `--bg1`, because every card ink and its Space White twin was measured on that ground (on the plate's panel face four Space White titles fell to 4.14 to 4.49:1). Its brand edge, ink, strip and mark are untouched. The particle field behind the page stays: it is not a grid.
- **Dashboard:** its section panels are plate panels (they were the old bevel), the review items and admin rows are nested panels, the section keys are keys.
- **Coin desk:** the sub-nav became pads (the classroom's section-tab treatment), with the current area lit; the mode toggle and the preview banner's Exit are keys; the preview banner and the balance summary are panels; the transaction type, medium and strike tags are recessed; the title bar is on a row of its own below the widest widths.
- **Foundry:** the shell's tabs are pads (lit on `aria-current="page"`, which is Foundry's only spelling of its current tab); its detail blocks, the review flag and shelf, the before-you-upload list and the upload mode are panels; the drop zone, the idle launch stage, the play-figures grid and the share URL are wells; the heat-language status chips keep their tones and gain the recessed material. The gallery cards are students' covers and are left as they are.
- **Tournaments:** the match console's controls, pick, save and forfeit keys, and the delete trigger are keys; the room boxes, pools, bracket matches and panels are panels; tags are recessed. The TV stage is an island and is not touched. Each entry's banner is the student's own palette and is not touched.
- **IDEA Maps:** the editor's section tabs are pads, its header is the plate strip, its chips are recessed; the viewer's search button is a key and its rows are link panels; the shelf's tag box is ONE well with its input inside it (it was a field drawn inside a field).
- **Short links:** keys, and the Delete key's red is the plate's danger ink.

## Calls made, and why

1. **`--plate-danger-ink` was failing everywhere, the classroom included.** It was `var(--crimson)`, #d95f5f, measured 3.47:1 on the IDEA key face (found on the short-link manager's Delete). Lightness only, hue and saturation held: #e28383 (4.71:1 on IDEA's face, 4.85 on Matrix's), and Space White gets its own #882020 (its crimson #b42b2b measured 3.35:1 on the grey key; #882020 is 4.89).
2. **Space White is still scoped** to the classroom, the notebook, the reference viewer and `/` (`THEME_SCOPE_PREFIXES`, pinned in both directions by `tests/theme-tokens.test.ts`, which names the Foundry, Maps, Tournaments and coin rooms as out). Widening it would mean light-ground twins for every ink in those rooms, which is a bundle of its own. So the site plate renders in IDEA and Matrix on those rooms and in all three on `/`. A harness that pins Space White on an out-of-scope room measures a state production never has; the committed screenshots of those four surfaces are IDEA and Matrix only for that reason.
3. **The maps viewer's blueprint grid is removed, the maps editor's grid stays.** The viewer's was `--blueprint-grid-size`, a fixed 24px in CSS pixels behind the plan and the map pane, which does not scale when the plan zooms and names no length in the building: decoration. The editor's plan grid is labelled "grid 4″" and is drawn in the building's own units: real scale. The plan drawings themselves are islands and untouched.
4. **The launcher cards' textures are not drawn under the plate.** Six are ruled fills or grids (GREENLINE's is a literal 24px grid, the default a 1px line every 3px) and one is a dot field; the no-grid rule removes the set rather than sorting it, so a texture added later cannot bring a grid back.
5. **The home's `surface-machined` texture goes too** (a 1px line every 3px is a ruled fill). The shell's scan-line layer is hidden by 0345's `body:has(...) .bg-fx::after` rule, which now covers the site root too.
6. **A qualifier added to a Plate list goes inside `:where()`.** `:is()` takes its most specific argument, so adding `.chips-field .chips-box` to the wells list raised the whole rule and it began beating `.cr-select`'s own caret, which vanished on `/dev/themes-shape`. The fresh reviewer caught it from a screenshot. Every qualifier this bundle added is `:where(...)`-wrapped, which keeps each list at the weight it had, and the rule is written into `plate.css`'s header and CLAUDE.md.
7. **The shared `.chip` padding rule no longer reaches a chip that is a button or a link.** It gave the dashboard's section keys 4px sides with their words against their edges. A `button.chip` in the classroom (the notebook head's next check-in) now keeps its own padding too; that is the same defect there.
8. **Three `--dim`-on-`--bg2` call sites take `--text-2`** (the home stats separator, a home class card's section line, the dashboard's FRC unit titles, all 4.24:1). This is the fix CLAUDE.md prescribes for exactly that pair.
9. **The Foundry author page has nothing of its own to plate.** Its header has no padding and no box, and its cards are students' covers. It gets the ground, the tabs and the keys.
10. **Left alone, deliberately:** native selects keep the browser's arrow (0345's call); pathway chips keep their pathway colours (identity); student banners keep their own palette; the dashboard's 60-cell FRC unit table and every dense table stay undecorated.

## The fresh reviewer's list, and what was done with each

One subagent that had seen no code was given only `docs/feedback/2026-09-25/overnight/shapes-v3-*.png`, `docs/feedback/2026-09-28/rollout/*-after.png`, the review screenshots (every in-scope harness in IDEA and Matrix at 1440, IDEA at 375, and the home page in Space White) and the committed before/after pairs. Its ranked list:

1. **VISIBLE: near-invisible headings on the Foundry gallery in Space White.** Space White is out of scope on the Foundry in production (call 2); the harness pinned it. Not a production state; those screenshots were dropped from the committed set.
2. **VISIBLE: maps labels and zoom keys low contrast in Space White.** Same as 1.
3. **VISIBLE: tournament settings checkbox labels invisible in Space White.** Same as 1.
4. **VISIBLE: the `/dev/themes-shape` Unit dropdown lost its caret.** REAL, and this bundle's doing: a compound selector added inside the wells rule's `:is()` raised the rule's specificity over `.cr-select`'s caret. FIXED (call 6); measured, the second select's `background-image` is the caret's gradient again, as on `origin/main`. Its captions below the small control groups are 0345's call 3, kept.
5. **VISIBLE: browser-default form controls.** Blue checkboxes and radios on site pages: FIXED (plate accent). The roster's unchecked white boxes are the classroom's own unchecked state; the native select keeps the browser's arrow and face (0345's call, kept).
6. **VISIBLE: main actions still flat.** The notebook's Turn in and Save draft are disabled in that state and render as the unlit key (0345's design). SAVE SETTINGS, the maps zoom keys and the launch stage measure as Plate (the census finds the inset band on each); a secondary key on a dark panel reads quietly by design. The zoom keys sitting over the building outline is the viewer's existing layout, left.
7. **VISIBLE: home launcher cards flat.** FIXED: each card now has a key's depth (a lit top line, a soft foot, a dark rim outside its brand edge and a drop shadow), all of it shadow so its measured face is untouched.
8. **VISIBLE: Foundry author page unplated.** Its own surfaces are a padless header and students' covers (call 9); the "flat brownish panels" are the harness's case frames. Left.
9. **VISIBLE: Foundry forge.** The stray empty bar: FIXED (an empty block draws nothing). The system sans in the list rows and the empty cover squares are the component's own font and the students' missing covers, left.
10. **VISIBLE: short links at 375 overflow.** Pre-existing: the table is 480px wide at 375 on `origin/main` and on this tree alike (measured). Left. DELETE wrapping at 1440 under the other two keys is the ops cell's width, left.
11. **VISIBLE: dashboard section keys with no side padding, and flat panels.** FIXED: the shared `.chip` padding rule no longer reaches a chip that is a button (call 7), and the dashboard's panels joined the panel list.
12. **VISIBLE: coin desk title squeezed, and wrapped at 375.** FIXED (a 24rem basis). The bare search results are a list of names, left.
13. **SUBTLE: maps editor.** ITEM TYPES wraps in its pad (the pads' LED lane narrows three tabs in a 240px column), the plan's label ghosting is the drawing (an island), and the missing DASHBOARD key at 375 is the header's own wrap. Left.
14. **SUBTLE: maps shelf field shapes differ.** The tag box is now ONE well (it drew a field inside a field); the fields keep their own heights. Partly FIXED.
15. **SUBTLE: tournament settings.** The rule under the title bar, the corner radius at 375 and the form's width are the settings form's own layout. Left.
16. **SUBTLE: tournament RENAME alignment.** The members grid's own layout. Left.
17. **SUBTLE: grading checkbox in its own tile; the class heading's orphaned "2" at 375.** The tile is the 44px target's box, beside the row now as the prompt asked; the heading is a class label, not a name. Left.
18. **SUBTLE: pill-shaped notebook chips; home DUE TODAY outline.** The notebook's are classroom territory under 0345; the home feed tag is recessed with its tone edge. Left.
19. **SUBTLE: home dead space, the particle field, the Space White stats frame.** The frame: FIXED (the stats plate is a plate panel, with no chamfer clip). The space above the class card and the particles are the page's own and left (the particles are recorded for Mr. Pina).
20. **SUBTLE: the rubric's chosen-level highlight stops short; the breakdown reads outlined.** The highlight width is the rubric's own; the breakdown is recessed (measured, the field well's shade line and band). Left.
21. **SUBTLE: the coin summary's crammed labels.** The summary's own layout. Left.
22. **SUBTLE: the notebook's SHOW touching its well's edge.** Classroom territory under 0345. Left.

Of the four Part 1 fixes, the reviewer confirmed fix1 and fix2 in all three themes, called fix3 "barely shown" (the lamp gained a pixel each side, which is what was asked for at no extra width), and could not compare fix4 because the first set of before pictures was blank. That blank was the second dev server's: its symlinked `node_modules` sat outside Vite's allow list, so it served no fonts and one route not at all. The before pictures were retaken from a worktree with a real `node_modules` and are the committed ones.

## Measurements

- **`verify:browser`, the whole tree, both widths, projector model recorded beside every contrast reading**, through the harness's own writer (`npm run verify:readme`): 507 specs, 1,014 route/width runs, 17,374 measurements, **206 outside threshold, against 209 in the files committed on `main`.**
  - 189 of the 206 are rows `main`'s files already hold.
  - The other 17 are rows `main`'s files did not hold, and **every one fails identically on `origin/main` itself**, measured by running those specs in a worktree of `a4f769c1`: `grading-incomplete` at 375 (11 rows; 0345 committed only its 1440 rows, and recorded the 375 ones as pre-existing), the home page's Space White light-emblem fetch probe (2) and the dashboard's most-used click probe (4). **This bundle adds no finding.**
  - The first full pass reported 43 rows new against `main`. Each was run down: the hover probes were the INSTRUMENT (below); the home feed's "Open class" link had become a key and lost decision 40's gold-to-green link inks (reverted, it is a link); the maps viewer's marked row had lost its gold mark to the panel edge (the row is out of the panel list); the tour's primary key failed a pre-Plate "edge against its own fill" rule (re-baselined, below); Matrix lost its rain behind the Foundry (a specificity fault in the room grounds, fixed, below); and the ported worksheet missed a 15s wait once in a 57-minute run (it passes twice on this tree, 28 measurements and 0 outside, and carries no Plate class).
  - The first full pass had to be thrown away and run again: my long-lived dev server re-optimised three.js mid-run and served "504 Outdated Optimize Dep" to every IdeaCAD spec. The second pass booted its own server and read 0 of those.
- **Two harness specs re-baselined, each for a stated reason:**
  - `routes/_hover-ink.mjs`: the reach test substituted the `@scope` start for `:scope` as bare text, and the start is now a LIST (`.cr-plate, .site-plate`), which split every forced selector in two with the first half matching the room root, so every plate hover read as unreached. It substitutes `:is(<start>)` now. With that, every hover-ink spec reads as it did on `main`.
  - `routes/tour-mode-student.mjs`: its gate required a tour button's edge to clear 3:1 against its OWN FILL as well as the callout. Under a plate the contract is standard 14c's (the outer hairline against the ground it sits on): the lit primary's grey bezel over its accent face measures 2.53:1 by design and 4.34:1 against the callout. A plated button is gated on the callout; an unplated one keeps both.
  - `_classroom-plate-boxes.mjs` gained `--list`, `--themes` and `--root`, and its planted control now also plants a label size (a chip height alone touches nothing on most site pages).
- **Worst contrast on a passing check:** text **4.52:1**, the coin desk's FINE chip (`--amber`) at both widths; boundary **3.18:1**, the Matrix boundary row on `/dev/themes`. Both are pre-existing values this bundle did not move.
- **Whole-page text sweeps** (`tools/browser-verify/_plate-text-sweep.mjs`, every visible element that holds text, against the ground the harness's own walk finds) over every in-scope harness in IDEA and Matrix at 1440 and 375, and the home page in Space White: **0 elements under their floor**, apart from the dev-only harness strip at the top of two harnesses, and a tournament banner fixture whose student-chosen ground is not applied in the harness (its computed background is the room's own dark `--bg1`; nothing of the Plate paints `.entry-banner`, and its `.md` size class even makes it a Plate island).
- **Box diff (one geometry, every theme):**
  - Classroom, 0345's 17 routes at 1440 and 375: **12,086 elements per theme, 0 differing.**
  - Site, 18 in-scope harnesses at 1440 and 375, read from `body`: **8,930 elements per theme, 0 matched boxes differing (max 0.00px).** The tool lists 42 elements as differing, all in Space White and all of the form "absent in IDEA, present in Space White": the home stats values and the dashboard's equivalents breathe (a glow animation) in the dark themes, and the tool leaves an animated element out of a capture. None is a box that moved.
  - Planted control (`--planted`, a radius, a chip height and a label size planted in Matrix's block) on `/dev/portal-admin`: **78 differing**, so the instrument sees a difference when there is one.
- **The classroom before and after**, every element's box and computed paint on ten classroom routes in all three themes at both widths (22,233 elements): the differences are Part 1's and nothing else. The lamp chips narrowed (Pinned 56.81 to 54.05px in the class list, Draft 44.70 to 44.61px), live grid names no longer break inside a word, and the Returned tag and the rubric changed. Two captures, the notebook and People at IDEA 1440, differed on the first baseline run only; re-captured against the original stylesheet they read 0 of 5,728, so they were that run's cold compile.
- **svelte-check:** 0 errors, 37 warnings in 20 files, 31 `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`: the baseline exactly (placeholder env exported before the sync).
- **npm test:** 626 test files, 11,799 tests passed, read off the summary line (`run-tests.mjs` status 0), run once at the end.

## Scope proof

`tools/browser-verify/_classroom-plate-boxes.mjs fingerprint --list` recorded every element's box and computed paint on fourteen LEFT-OUT harnesses, in IDEA and Matrix at 1440 and 375, before any change and again after all of them: `/dev/gauntlet-shell`, `/dev/gauntlet-rank-state`, `/dev/room-clocks`, `/dev/tools-preview`, `/dev/greenline-portal`, `/dev/ideacad-tree`, `/dev/ideacad-app`, `/dev/frc`, `/dev/fsp-day1`, `/dev/fsp-pulse`, `/dev/fsp-tech-selection`, `/dev/classroom-projector`, `/dev/classroom-deck` and `/dev/html-assignment`, plus `/dev/coins` (the frozen Coin Ledger). Elements under a running animation are left out.

- **Before against after: 10,431 elements compared, 12 differing.**
- **Two captures of the UNCHANGED tree, as the noise control: 10 differing**, of the same three kinds: a GREENLINE script tag, the ported worksheet's lazily growing section at 375, and two animated Coin Ledger cells. The 12 are those same elements.

Because the root layout renders no wrapper on a left-out route, the DOM of every left-out product is byte-identical by construction; the fingerprint is what checks that no global rule leaked.

## Not verified

- **A signed-in production page.** Every measurement is on the `/dev` harnesses, which mount the real components.
- **The tournaments harness is not a faithful mount of every tournament surface:** several components are mounted outside a `.tnm-root`, which production never does (the tournaments layout wraps every page in one), so those controls read flat in the harness and plated in production. Production's wrapper was read from the layout, not measured in a signed-in session.
- **Safari/WebKit.** No container here has it. Without `@scope` the rules block drops and a page renders as it did.
- **`prefers-reduced-motion: reduce`.** The harness runs with `no-preference`.

## Left for Mr. Pina

- **Whether Space White should reach the rest of the site.** Today it is scoped, so the Foundry, maps, tournaments, coin desk and dashboard show the plate in IDEA or Matrix only.
- **The home page's particle field.** It is not a grid, so it stays; the fresh reviewer read it as decoration behind the plate.
- **The public reference viewer (`/reference/<id>`)** stays out, as 0345 decided.
