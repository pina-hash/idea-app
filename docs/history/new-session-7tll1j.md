---
title: "Ledger 0345: classroom shape language rollout, Plate v3 polished and live on every IDEA Classroom page in IDEA, Matrix and Space White (`claude/new-session-7tll1j`, no migration)"
date: 2026-09-28
branches: [claude/new-session-7tll1j]
migrations: []
subsystems: ["IDEA Classroom", "Notebook", "Browser harness", "Documentation", "Standards"]
---

The morning report for ledger 0345. Round 3 of the classroom shape language (ledger 0344, `/dev/themes-shape`, approved on 2026-09-27) was polished and is now the live look of every page inside the classroom shell, in all three site themes. No other app on the site changed; that is measured below, not argued.

**THE ONE-LINE REVERT:** in `src/lib/classroom/plate.ts`, `export const CLASSROOM_PLATE = 'cr-plate';` becomes `export const CLASSROOM_PLATE = '';`. Nothing in `plate.css` matches without the class, so that restores today's look everywhere. Measured: with the constant set to `''` the drag spec and the grading spec read exactly as they did before the rollout.

## What changed

- **`src/lib/classroom/plate.css`** (new) is the production stylesheet. It is loaded by `classroom.css` (one `@import`), so every page that loads the classroom's room loads it. Every rule is keyed on `.cr-plate`. It has four parts:
  - one SHAPE block of lengths, declared once;
  - one COLOUR block per theme, holding no length;
  - the page ground;
  - the RULES, inside `@scope (.cr-plate) to (<content islands>)`, each opening with `:root :scope.cr-plate` so its specificity is stated rather than hoped for.
- **`src/lib/classroom/plate.ts`** (new) holds the one constant, `CLASSROOM_PLATE`. `src/routes/classroom/+layout.svelte` puts it on the classroom's `.cr-root`, and that is the only production place it is set.
- **`src/lib/classroom/PlateRing.svelte`** (new) is round 3's progress ring, ported. It renders only under a plate.
- **`Progress.svelte`** mounts the ring on the one real percentage in the classroom: the ported HTML worksheet's progress rail.
- **`/dev/themes-shape`:**
  - the after column now wears the same constant and the same stylesheet;
  - `plate-v3.css` keeps only the mockup's own furniture (the columns, the specimen frames, the brackets);
  - the duplicate rules and `P3Ring.svelte` are deleted;
  - rounds 1 and 2 are untouched and reachable (`?view=plate`, `?view=two`, `?view=four`).
- **62 classroom `/dev` harnesses** put `{CLASSROOM_PLATE}` on their `.cr-root`, so every harness measures the look the site has.
  - 14 of them also gained `import '$lib/classroom/classroom.css'`, because they rendered classroom surfaces without the classroom's own room and would have measured a page that exists nowhere.
  - The themes-shape root, the theme gallery, foundry-run, coin-preview and short-links were deliberately left alone: they are not classroom surfaces.
- **Polish (the four asks):**
  1. **Chips are recessed tags.** A chip is set into the surface: an inner top shade, a light lip at the foot, a quieter lighter edge, and no drop shadow. It is 22px tall, the label is 11px, and a status lamp gets 4px of clear space on each side. Measured on the 2x sheet (`chips-space-white-*.png`), today's chips against the plate's:

     | Chip | Today | Plate |
     |---|---|---|
     | Status | 45.11 x 18.50 | 44.70 x 22.00 |
     | Kind | 73.84 x 18.50 | 71.61 x 22.00 |
     | Pinned | 50.86 x 18.50 | 50.64 x 22.00 |

     Every one is no wider than today's.
  2. **The Space White hairline is `#757c86`** (round 3: `#6e757e`). Its worst case is 3.12:1 on the recessed column's foot and 3.27:1 on the plate. The column was lifted (`#dee2e9`/`#dadee6`) so that it is no longer the one ground pinning the line dark. On the dark themes the hairline sits at the 3:1 floor at its foot, with a lighter top side.
  3. **Section labels sit on top** of what they name: the mockup's THIS WEEK, RETURNED, GRADE and CHIPS groups. The centred label below a group is kept only for the small control groups: the button row and the switch pair.
  4. **Face B (VT323) is gone:** its toggle, its state and `@fontsource/vt323`. `package.json` and `package-lock.json` are byte-identical to the tree before 0344 (`a4d3df8e`), and `npm ci --dry-run` is clean.
- **Cleanup:**
  - Every image in `docs/reference/space-white/` (ten files) is deleted. None of them was ours.
  - `shapes-v2.md` and `shapes-v3.md` mark the references removed.
  - md5 over the tree found no copy anywhere else, and 0344 committed only its own screenshots. Git history still holds the deleted files; history was not rewritten.
- **Decision 40:**
  - The Build line reads "item 4 BUILT by ledgers 0341, 0344 and 0345".
  - An "Amended 2026-09-27" bullet records Mr. Pina's extension to all themes ("They should share the same sci-fi geometry with different color schemes"), which supersedes "the dark themes are unaffected".
- **Standards:**
  - `IDEA_INTERFACE_STANDARDS.md` 2.13 adds section 14, "Classroom Shape Language", with rules (a) to (d) as the prompt worded them, plus a changelog entry and the `REGISTER.md` row.
  - It was fetched from `origin/main` before editing, and the rebase did not conflict.
- **CLAUDE.md:** a sub-block under `.cr-root` states the plate's rules for the next session: the constant is the revert; one geometry with three colour blocks; content below the scope; the seven state spellings; raised versus inset; dark faces only as light as the inks allow.
- **`classroom-updates.json`:** a student-readable entry, "A new look for IDEA Classroom".

## Coverage map

{{COVERAGE}}

## What each surface got

- **The page:** the plate's ground (a graded charcoal in IDEA and Matrix, a pale steel in Space White).
  - Round 3 had one theme-and-page bug: the canvas behind a short page was transparent, because the ground token was declared only on `.cr-plate` and the body could not read it. Fixed; the colour blocks are now declared on `body:has(.cr-plate)` too.
  - In Matrix the page gradient is NOT painted, so the rain still falls behind the classroom exactly as `matrix.css` intends.
  - The shell's scan-line layer (`.bg-fx::after`) is hidden behind a plate. It is a full-window ruled fill, which the no-grid rule counts as a grid. The rain is untouched.
- **The header:**
  - It is a lighter plate strip with a groove under it.
  - The class icons and the section tabs are pads: a thick composite bezel with a recessed LED in a lane of its own. The current class and the current tab are the lit pad (a near-white face, or a faint green one in the dark themes), with an accent LED, `aria-current`, and the heavier word.
  - The header tools are keys.
  - The logo link now clears 44px at every width. It was 26.3px tall at 375, a student-facing control under the floor.
- **Keys:** every pressable box the classroom draws.
  - The key list in `plate.css` names each surface's own buttons and toggles, built from the components' selectors. Each is a raised pillow with a real hairline border (lighter along the top on a dark theme).
  - Primary is the flat accent face; danger keeps its ink on a grey key; pressed sinks; disabled is an unlit flat key.
  - Lit (ON) is one of seven state spellings. The shared buttons and wide toggles get round 3's broken ring; smaller keys get a solid accent ring.
- **Chips:** recessed tags (above).
  - Every surface's own status tag (state, roster, queue, points, override and the rest) gets the material only, and keeps its size, case and tone ink.
  - A chip that is a link or a button is a small raised key.
  - My Classes' owed counts became tags too, and the missing count keeps its warning wash over the tag's own ground (below).
- **Panels:**
  - `.card` and every surface's own box that plays the same part gets a raised panel face, a lit top line, and a long soft shadow.
  - A panel keeps its own border width. Only its colour moves, because adding a border where a component had none moved a sticky head by 1px.
  - A link panel keeps its hover edge.
- **Wells:**
  - Fields and dropdowns are recessed troughs. Every text input and select is a well.
  - A textarea is a lighter writing well: a paragraph in a dark trough is a paragraph nobody wants to write.
  - An empty checkbox is a small well.
- **Lists:**
  - The class list's unit group and the to-do's groups are the list well, with etched dividers.
  - The selected row is the solid accent row with a lit plate behind it.
  - The class list's column above 1024px is the recessed column with a tab at its head.
  - The rubric under a returned grade is the list well too.
- **The display:** the returned grade's card is the housing (screws, perforation, moulded rim) and its heading is the dark screen with the glowing readout. In Space White it is the one dark island on the page, as in the reference.
- **The title bar:** every page title is the title bar between two hazard blocks, running the width of the region it names.
- **Menus, dialogs and popovers:** the class switcher, the profile panel, the command palette, the settings and class-tool dialogs, the tour callout, the report box, the quick note, and the info tips all sit on the raised panel face.
- **Left alone, deliberately (below the scope):**
  - an item's rich-text body and rendered markdown;
  - the rich-text editor's document;
  - a deck's stage;
  - an IdeaCAD embed;
  - the photo corrector and camera;
  - a ported worksheet's frame;
  - the lightbox stage;
  - a note's content;
  - the notebook review grid's whole card. Its cells, glyphs, legend and density are a locked contract, and its cell inks were measured on that card's own ground.

## Calls made, and why

1. **The progress ring appears once.**
   - The only real percentage in the classroom is the HTML worksheet's progress rail (`progress.percent`), so that is where the ring is.
   - Every other place round 3 drew one (a grade) already has its number; a ring there would be a second rendering of a fraction, not a progress figure.
   - The prompt's mention of the lightbox as a ring surface was checked and is not true of the tree.
2. **"Feed" is My Classes.**
   - The classroom's feed-shaped page inside the shell is `/classroom` (MyClasses: the to-do door and the class cards).
   - The home page's `ClassroomFeed` is on `/`, outside the classroom shell, and is unchanged.
3. **Out of scope:**
   - The live projector (`/classroom/<id>/live/projector`) is a reset to the root layout for a wall, not a classroom page.
   - `/reference` loads `classroom.css`, but it is public and never sets the class.
4. **The dark faces are darker than round 3's, the one measured departure from the approved mockup.**
   - On real pages, round 3's charcoal card (`#383e3a`) dropped three inks under 4.5:1: `--text-2` to 4.26:1, the warning ink to 3.55:1, and the error red under 4.
   - The IDEA scale was stepped down until the tightest ink, the error red, cleared 4.5:1 on a card: card `#1c1f1d`, 4.55:1. Matrix follows the same steps in its green.
   - The notebook's faint ink is re-pointed on a plate, lightness only: `#959f98` in IDEA, `#84a288` in Matrix. Its old value was tuned for the retired near-black notebook plates.
5. **Space White's display ink is a literal (`#78b870`), not `var(--accent-field)`.** On a `.cr-plate` that variable resolved to the page's dark text, which put the readout at 1.7:1 on its own screen.
6. **The notebook paints the plate's ground; it is never transparent.**
   - Round 3's harness made it transparent; on a real page in Matrix that let the rain run under the notebook.
   - `matrix.css` records that the rain does not reach the notebook ("THE NOTEBOOK IS NOT REACHED"), and that decision is Mr. Pina's to change.
7. **The account control (the avatar button) is not framed.**
   - Its box is the avatar plus 2px, so a key's edge sat 2px from the picture. The control-fit sweep on `/dev/theme-switch` counts that as a cramped label.
   - The box may not grow, so it stays the round avatar it is everywhere else.
8. **The list well carries no `position: relative`.**
   - With it, starting a drag at 375 jumped the page 355px and the release landed in the wrong unit.
   - This was bisected rule by rule in the live page: removing that one declaration was the fix.
9. **Every key's hairline is a real border colour.** In round 3 it was a gradient under a transparent border. Anything that reads an edge (the hover probe, the report-slot probe, a forced colour mode) now reads the load-bearing line. Measured: the Report key's edge went from 1.00:1 to clearing 3:1 on the Space White header.
10. **Hover:** the pads and the link panels turn their edge to `--hover-ink`, which is brass in the dark themes and green in Space White (decision 40 item 1). In round 3 the pad's hover was a box-shadow ring the probe could not see.
11. **A chip holding a sentence wraps.** The IdeaCAD "shared with you" summary is a chip with a sentence in it, and a fixed 22px nowrap chip pushed the page 37px sideways at 375. The chip is at least 22px and wraps.
12. **The phone class strip is unchanged in behaviour.**
    - Pads are wider than today's tiles (the LED lane), so at 375 fewer tiles show before the strip scrolls, and the last one peeks at the edge, as a scrolling strip does.
    - The fresh reviewer read that peek as clipped. It is the strip's existing overflow, not an overlap.
13. **A title and the display run the full width of their region** (`max-width: none`). The words stay centred and balanced, so the reading measure is kept by the wrap rather than by the box, and the rails line up with the panels under them.
14. **Status tags keep their own case.** The reviewer noted mixed case among tags. Uppercasing a component's own tag widens it, and the polish rule was "no wider than today's", so only the shared chips are uppercase.
15. **Harness spec edits, each re-baselined with its reason:**
    - `routes/avatars.mjs`: the washed-banner worst case now reads 8.56:1, because the banner sits on the plate's ground.
    - `_themes-shape-plate.mjs`:
      - face B is asserted absent;
      - the after column is asserted to wear `.cr-plate` (8 visible of 9) and the before column not to;
      - the tokens read are the production `--plate-*` names;
      - the mono face is Share Tech Mono only.
    - `_themes-shape-plate-pixels.mjs`: face B is removed.
    - `_hover-ink.mjs`: the stylesheet walk now descends into a `CSSScopeRule` and tests a rule's reach with the scope's start in place of `:scope`. Without that, the probe could not see any plate hover at all.
    - `/dev/themes-shape`: only round 1's two cut styles carry `data-cut-set`. Round 3's view had made it three, which the round-1 spec counts.

## The fresh reviewer's list, and what was done with each

One subagent was given only `docs/feedback/2026-09-25/overnight/shapes-v3-*.png` and the new screenshots. It saw no code. Its ranked list, with the outcome of each item:

1. **Grading roster: each student's checkbox sits in its own box above the row.** Measured with the plate switched off: the same layout, `LABEL.roster-pick` over `BUTTON.roster-row` in a 363px roster. This is not the plate's doing. Left, and recorded for Mr. Pina.
2. **375 header: the fourth class pad is cut at the MENU key.** This is the scrolling strip's existing overflow (call 12). Left.
3. **375 roster: "Alice Alvare z" breaks inside the word.** Measured identical with the plate off (the name 38x54 in both). Pre-existing. Left.
4. **Notebook: Turn in and Save draft look flat.** They are disabled in that state and render as the unlit key, which is the design. No change.
5. **Notebook: the next check-in and drafts capsules, and the dashed template pills.** FIXED: a chip-shaped button and the composer's template buttons are now small raised keys.
6. **Item detail: the display screen stopped short of its housing.** FIXED: `max-width: none`. The screws were below the fold in that shot.
7. **Item detail: the collapsed Instructions panel is tall, and SHOW floats short of the edge.** Present in the before shot too; it is the disclosure's own layout. Left.
8. **Item detail: the rubric is the old flat table.** FIXED: the rubric is now the list well.
9. **Status tags use mixed case.** Kept deliberately (call 14).
10. **Native selects keep the browser chevron.** They are wells. An accent caret needs `appearance: none`, which changes a native control's padding and arrow. Left.
11. **The grades sort key has a solid ring where the to-do's view key has a broken one.** This is round 3's own distinction: the broken ring is for shared buttons and wide toggles. Kept.
12. **Key labels mix typefaces and case.** Items 12 to 18 were SUBTLE. Kept for the same reason as call 14.
13. **The grades level keys have small labels.** SUBTLE. Measured contrast clears.
14. **The title bar on the item page is shorter than its column.** FIXED (call 13).
15. **"Open" on a class card is plain text.** The card is itself the link. Left.
16. **The unit panels read raised; there is no position bar.** SUBTLE. The well's thumb track shows only when the list scrolls. Left.
17. **Two Space White keys look low contrast.** Measured at 6.85:1. Left.
18. **The camera link is dim.** SUBTLE. It is the notebook's own link ink. Left.

No grid or scan-line pattern was found on any screenshot, at 1440 or 375.

## Measurements

{{MEASUREMENTS}}

## Scope proof

`tools/browser-verify/_classroom-plate-boxes.mjs fingerprint` records every element's box and computed paint on seven non-classroom routes, in IDEA and Matrix, at 1440 and 375: `/dev/gauntlet-shell`, `/dev/ideacad-tree`, `/dev/foundry-gallery`, `/dev/coins`, `/dev/maps-viewer`, `/dev/coin-desk` and `/dev/home-order`. Elements under a running animation are left out.

Before the rollout against after it: 8,476 elements compared, 9 differing. All 9 are animation noise:
- 2 cells of the Coin Ledger in Matrix;
- 7 boxes of one launcher card on the home page at 375, mid-entrance.

The same noise appears between two captures of the unchanged tree.

The bounding-box diff (`boxes`) covers 17 classroom routes at 1440 and 375, reading every element under `.cr-root` in IDEA, Matrix and Space White: **12,086 elements per theme, 0 differing boxes.** The planted control, a length planted into Matrix's colour block, reads 721 differing on its route. So the instrument sees a difference when there is one.

## Not verified

- **A signed-in production page.** Every measurement is on the `/dev` harnesses, which mount the real components.
- **The live site after the deploy** is reported in the ledger notes.
- **Safari/WebKit.** No container here has it. In a browser without `@scope`, the whole rules block drops and the classroom renders as it was, which is the intended failure.
- **`prefers-reduced-motion: reduce`.** The harness runs with `no-preference`.

## Left for Mr. Pina

- The grading roster's stacked checkbox (item 1) and the name break at 375 (item 3). Both are pre-existing layout, not the look.
- Whether the notebook should carry the Matrix rain. It stays opaque, as `matrix.css` records.
- Pre-existing harness failures, unchanged by this bundle and measured identically with the plate switched off:
  - `grading-incomplete`: its export disclosure click matches nothing, at both widths;
  - `ideacad-item`: its `layout-sanity` and `distinguishable` rows are in the committed measured files from before this bundle.
