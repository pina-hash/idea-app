---
title: "One StatusChip and one tone map across the site (ledger 0466)"
date: 2026-10-29
branches: ["main"]
migrations: []
subsystems: ["Interface standards", "Themes", "Classroom", "Coins", "Testing"]
---

The second lane of the site-wide visual pass (feedback de294f40 and 2c3cacb2, queue `docs/feedback/2026-10-28/QUEUE-site-ui-pass.md`, section "Lane 0466"), built on lane 0465's status tokens.

What changed:
- New `src/lib/ui/status-tone.ts`, the one tone map: seven tones (`ok`, `warn`, `danger`, `info`, `special`, `draft`, `neutral`), each with its ink, fill, solid, on, edge and glyph, plus the glyph set (`STATUS_GLYPHS`), `toneStyle()` for things that say a status without being a chip, and `toneFrom()`, the one place the old words ('good', 'attention', 'muted', 'missing', 'note', 'changed', the coin pages' 'bad', 'wait', 'gold', 'plain') map onto it.
- New `src/lib/ui/StatusChip.svelte`, the one chip: the tone's `-solid` face with its `-on` word and glyph, an edge in the tone's ink (solve()'s `line` rule for a solid under 3:1 on its ground), 22px, 11px mono caps, an inner shade and no drop shadow (a tag, not a key). The word is always shown; there is no glyph-only form. It renders as a link or a button only when it is pressable. `paths` lets a subsystem that owns a glyph per kind (the coin transaction types) draw its own mark.
- 157 StatusChip uses in 62 files replace 41 retired status chip classes (314 class uses in 61 files at `8b840d9a`) and every bare `.tone-*` copy (78 selectors and markup uses in 14 files): ClassView, StudentOverview, TodoPage, GradesPanel, GradingQueue, GradingConsole and RosterCard, ClassroomFeed and the home feed's flags (`src/app.css`), ItemDetail, AssignmentEngine, the live class (LiveGrid, LiveControl), presence, hall pass and song queue, team plan and sign-offs, the notebook (entry cards, inbox, the check-in state, the drafts key), feedback console, panel editor, MyClasses and the to-do door, answer links, every coin desk, coin page and market chip, the fine screen, the maps status chip, the tournament bracket, the error page, the HTML assignment health list and two dev harnesses. `CoinTypeGlyph.svelte` is gone; the type glyphs draw through the chip.
- The producers speak the map: `workStateTone`, `studentWorkChip` (now with a `glyph`), `checkInTone` and new `checkInGlyph`, `reasonTone` and new `reasonGlyph`, `PRESENCE_DISPLAY`, `LIVE_CELL_DISPLAY`, `GRADE_BANDS` and new `gradeBandTone`, `TEAM_STATUS_TONES`, `teamCheckpointTone`, `CLASS_TOOL_TONES`, the notebook's `statusTone`, and `COIN_TYPE_TONES` (now tone names).
- The retired `--teal` reads outside the calendar (lane 0467's) and the frozen legacy pages moved onto a status tone or, for the home hero eyebrow, metadata `--cyan`: the grading console, hall pass, song queue, presence, team plan and sign-offs, GAUNTLET's band meters and community board, the Foundry's busy line, two dev harnesses.
- `plate.css` no longer lists the retired classes; the LED lamp on draft and scheduled chips and the warm washes on the feed flag and the missing count are gone (the chip draws its own face). `.lg-chip` keys are `.lg-key`.
- `tests/status-tone.test.ts` (new) and updated tests: classroom todo, worksheet complete, feed counts, module collapse, standing, presence console, coin labels, coin types, coin symbol list. The class page golden (`tests/fixtures/class-view-null-layout-golden.json`) had its five old chip spans spliced for the new markup, nothing else.
- `tools/browser-verify/routes/*.mjs`: 26 specs whose selectors named a retired class now name the chip (`[data-roster-state]`, `.status-chip`, `.status-chip-word`, `.bracket-live`, `.lg-key`, `.err-status`, `.override-mark`, `.ctool-status`), by selector only; no threshold moved. `.ts-chip`, `.ci-state`, `.feed-flag`, `.owed` and `.td-owed` stay on the chip as hooks those specs read, with no style behind them.
- `docs/subsystems/ui-standards.md` carries the rule.

Decisions and why:
- Seven tones, five hues. The five coloured tones are 0465's solids, the only set held 12 CIEDE2000 apart and 8 under simulated deuteranopia and protanopia. A sixth hue would break that floor, so `draft` and `neutral` carry none: the surface's recessed tag face, a body-ink word, and a dashed edge with a pencil for a draft, a hairline and a dash for neutral.
- No grade in crimson: the lowest grade band is `warn` with the alert mark, the hue Fair already wore. Measured on `/dev/classroom-student` at 1440: the 67.5% grade's rule is `--status-warn` (234,152,75 IDEA and Matrix; 140,55,0 Space White), not `--crimson` (#ff8683; #a93338).
- In progress is `info` with a half-filled ring everywhere: the work chip, the grades panel's started count, team tasks, presence's Viewing, the hall pass and song queue, a draft still open in Quick note.
- Drafts: `draft` tone and pencil on the class list, item page, grades panel, notebook entry and the notebook's drafts key (which wore the warning edge), the HTML assignment list and the maps editor. A draft check-in is the draft tone too; it still counts as owed, which `isOutstanding` says, not the tone. Archived and Inactive, which reused the amber draft chip, are neutral.
- A pencil is the draft's alone, so the grading roster's "changed after grading" mark is a turn-back arrow now.
- One map for words in several rooms: Updated is info everywhere (the home feed's flag was gold); Pinned is special everywhere (the home feed's was muted); a fine and a refusal are warn, never danger (the hall pass fine read danger); a coin adjustment is special (it was violet) and a purchase neutral (it was gold).
- Kept out, by their own documented vocabularies: the Foundry's ForgeStatus heat language (amber means in progress there), GAUNTLET's own chips, GREENLINE, IdeaCAD, FRC, FSP, Armory, the certifications' `cert-tone-*`, the frozen legacy pages, and the `/dev/themes-shape` design board. Labels that are not statuses keep their own tags (filter keys, kind tags, points, class and pathway chips, the market's Offer and Request tag).
- `toneStyle()` writes inline custom properties. The AppLauncher lesson (an inline property beats every class rule) is about identity colours a stylesheet must be able to override per card; here every value is a `var()` of a status token, so a theme still repaints it, and the alternative was a second copy of the map in CSS.

Measured (a scratch probe, lane 0465's extended with chips: 21 dev routes, 375, 1152 and 1440, IDEA, Space White and Matrix, every visible text and every chip against its composited ground):
- Status chips: before 431 / 426 / 426 per theme (IDEA / Space White / Matrix) in 15 heights from 13 to 44px, minimum word contrast 4.52 / 1.59 / 5.25, six under 4.5 on Space White (the theme switch harness's chips at 1.59 and 3.30, the grades panel's at 1.13 on 375). After: 462 per theme, all 22px, minimum 6.02 / 4.61 / 6.02, none under 4.5.
- No chip face or word in the danger tone after. The before detector's 30 hits were warning bands: the dark `--status-warn-fill` (#2f2417) sits within 24 RGB of `--status-danger-fill` (#301f1e), which is why the chip draws the spread solids and never a band.
- Every text: IDEA 264 under its floor before and after; Matrix 183 and 183; Space White 365 and 389. The Space White difference is the probe's theme switch landing mid-transition: the same strings (harness links, labels on the grading queue and maps editor) flip in both directions between widths and between runs, and none of them is a chip.
- `svelte-check` 0 errors, 33 warnings in 18 files, before and after. One warning appeared midway, an unused `.hint` in LogView that the old dynamic `tone-{...}` class had hidden from the compiler; the dead selector is removed.
- `tests/status-tone.test.ts`: 0 retired classes and 0 `.tone-*` copies in `src/` against 157 StatusChip uses, with positive controls for both patterns.

Not verified: signed-in production pages; `npm run verify:browser` (the specs were edited by selector and not run; lane 0469 owns that pass); a projector; screen readers beyond the glyph being `aria-hidden` beside its word.

For lanes 0468 and 0469:
- The chip's geometry is in `StatusChip.svelte` alone: 22px min height, 11px (`0.6875rem`) mono caps, `--plate-r-small`. 0469's 11px floor and 0468's plate recipes should move it there, not wrap it.
- `plate.css`'s recessed-tag list still holds the labels that are not statuses (`.points-chip`, `.pill`, `.cl-tag`, `.course-badge`, `.fg-chip`, `.ar-tag`, `.chip-count`, the Armory, certification and tournament tags).
- Several statuses are still words, not chips, by design: the notebook review console's Live and Stalled lines, the to-do's Feedback to read, the coin amounts.
