---
title: "Identity and calendar colours from one library, solved per theme, with no neon (ledger 0467)"
date: 2026-10-29
branches: ["main"]
migrations: []
subsystems: ["Themes", "Calendar", "Classroom", "Design system", "Testing"]
---

The third lane of the site-wide visual pass (feedback ac7d7b60, queue `docs/feedback/2026-10-28/QUEUE-site-ui-pass.md`, section "Lane 0467"). Launcher apps, calendar layers, unit tints, class palettes and section colours now come from the HTML kit's colour library through `solve()`, per theme.

What changed:
- `tools/identity-colors.mjs` (new) imports `solve()` from `tools/hx-kit/color.mjs` and reads `tools/hx-kit/kit/colors.json` (neither edited, nor copied), reads every theme's grounds off the token files and the Plate (the same ground set `tests/color-tokens.test.ts` uses, plus the Plate's key faces), and writes `src/lib/design-system/identity.css` (`--id-<entry>-ink|fill|on|line|wash` on `:root` for IDEA and Matrix, solved over both themes' grounds at once; again for Space White; the dark values restored on Space White's dark islands) and `src/lib/design-system/identity.ts` (`IDENTITY`). Twelve entries: sky, indigo, violet, magenta, marigold, coral, filament-orange, FIRST red, FIRST blue, steel, titanium, aluminum, plus `idea-green`, the brand, whose anchor is read off `--green`.
- Launcher: `PortalApp.family` (class, make, coins, play, frc, tools), stamped as `data-family`; one stylesheet rule per family reads the `--id-*` tokens. Class = sky (Classroom, My Notebook), Make = indigo (IdeaCAD, Armory, Foundry), Coins = marigold (Ledger, Market), Play = magenta (GAUNTLET, GREENLINE, VANGUARD, Tournaments), FRC = FIRST red with FIRST blue as the strip's far stop, Tools = titanium (Maps, Admin; the `.app-card` default, so a new app arrives neutral). The fifteen curated Space White inks, the FRC hand-made ink and the GAUNTLET/VANGUARD `--gold` re-point are gone; per-app rules keep textures only, re-tinted from the family fill. The two game marks' accent strokes take `currentColor` instead of `var(--gold, #c8ff00)`.
- Calendar: each layer's `color` is a library `line` and its new `fill` the same entry's fill: classes sky, pacing indigo, team magenta, Bosco Tech titanium, no school aluminum, IDEA marigold, robotics FIRST red. Each layer has a glyph (`mark`, `LAYER_MARK_SHAPES`), drawn by the new `LayerMark.svelte` on filter keys, month chips, phone dots, list rows and week strip rows. A lit filter key is lit in its own layer's colour by re-pointing `--plate-accent` on the key (plate.css untouched); an off key has a hollow glyph. Under 720px the layer keys and the class list sit behind one "Layers: N of 7 on" key. `PacingStrip` reads the pacing layer's colour; its state word moved from the retired `--teal` to `--cyan`.
- Unit tints: four (sky, marigold, magenta, indigo), `THUMB_TINT_COUNT` 8 to 4; the glyph takes the entry's ink and the wash and banner its fill.
- Class themes: `ThemeColour` is now `{ lib, dark, light }` read from `IDENTITY` (was a hand-picked HSL lightness pair). Washes take the fill, edges and accents the ink. Palettes: IDEA brand green, FRC FIRST blue and red, Ocean sky, Ember marigold wash and coral edge, Violet violet and magenta, Steel steel. Accents: Gold marigold, Tangerine filament-orange, Rose magenta, Violet violet, Sky sky, and the stored id `mint` is now labelled Indigo and drawn indigo (green means act and done). The old edge seeded from teal's #3ea368 is gone.
- New `tests/identity-colors.test.ts`; generalised `home-order-and-accent`, `space-white-inks`, `theme-tokens`, `portal-admin-console`, `classroom-class-theme` and `classroom-thumbnail` where they pinned the values this lane moved.

Decisions and why:
- Families, not one colour per app: fourteen hues on Space White (decision 62) is what the 2026-10-28 rule of at most five to seven retires. Each card keeps its own name and mark, which is the word and glyph beside the hue.
- Fills are held to the colour-blind floor and inks are not, the call 0465 made for status inks: at 4.8:1 on a near-white panel every ink sits near one lightness, so the simulation removes the only thing that differs. The calendar's glyph is filled with the fill for exactly that reason.
- Linking set over anchors: the kit's linking colours have no real-world meaning, which is what an app family or a layer is; FIRST red is the one anchor, for things that are FIRST. Violet and indigo cannot share a screen (protanopia 3.2), and coral cannot share one with FIRST red (deuteranopia 5.9), so Foundry joined Make rather than keeping a warm hue, and the fifth unit tint (coral, 6.8 from marigold as a Space White word) was dropped.
- Class edges and accents take the ink, not the line: on a palette's wash under a pattern stroke, FIRST red's line read 2.91 and magenta's 2.49.

Measured (probe over /dev routes at 375, 1152 and 1440, IDEA, Space White and Matrix; theme forced through the stored theme key; numbers identical at 1152 and 1440, and Matrix equal to IDEA because both read the dark answers):
- Launcher, student view: hues on screen 7 to 5 (admin 9 to 6); strip fills min CIEDE2000 plain / deuteranopia / protanopia 9.8 / 4.1 / 2.3 to 19.2 / 10.0 / 11.6 (IDEA), 9.8 / 6.3 / 2.3 to 23.3 / 11.7 / 9.6 (Space White). Title inks on Space White 12 hues 12.0 / 1.7 / 3.2 to 5 hues 14.1 / 7.1 / 6.9. Neon in computed colours on the home harness 136 to 18 (IDEA, Matrix); all 18 are the IDEA pathway chip.
- Calendar: filters at 375, 205px to 44px; at 1152 and 1440, 102px to 95px. Lit filter ring green (#78b870, #2d6b26) to the layer's own colour. Layer marks: IDEA 13.1 / 1.0 / 1.7 to 19.2 / 10.0 / 11.6; Space White 4.4 / 1.2 / 3.9 to 11.2 / 9.6 / 9.6.
- Unit tiles (three tints on the harness): 30.8 / 6.3 / 7.0 to 49.7 / 11.7 / 16.2 in every theme.
- Class banner (the test's sweep): edge 3.83 / 3.85 / 3.91 and accent 3.84 / 3.86 / 3.93 WCAG (IDEA / Matrix / Space White), projected at least 2.99; text on the wash at least 6.41 WCAG and 4.60 projected.
- svelte-check 0 errors, 33 warnings in 18 files (unchanged).

Not verified: signed-in production pages; a projector; `npm run verify:browser` (its home and theme specs pin the old per-app inks and are lane 0469's); the Armory and Foundry room pages themselves (their marks take the card's colour only on the launcher).

Left: neon remains in files this lane does not own, listed with reasons in `NEON_ALLOWED` in the test (pathway IDEA colour, avatar presets, the tab icon, GAUNTLET, FSP, FRC, tournaments and other `var(--green, ...)` fallbacks, the frozen legacy pages). The IDEA pathway colour (#00FF41 in `src/lib/pathways.ts`) is the largest remaining one on IDEA pages and is Mr. Pina's call.
