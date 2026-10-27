---
title: "hx-kit: named content colors, solved separately for each theme"
date: 2026-10-26
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

Mr. Pina found a light-theme assignment color that "looks like poop brown". The cause was the kit itself: `kit.css` drew every phase hue at one fixed OKLCH lightness per theme (0.43 on white), and Launcher: Design's hues 52 to 100 (yellow to amber) at that lightness can only come out olive and brown.

What changed:
- `tools/hx-kit/kit/colors.json` is a named library: shop safety (ANSI Z535, hue-matched), materials, CAD and FEA, wiring (WPILib), FIRST (its 2020 brand guide), tools and brands, and a six-color linking set checked pairwise under simulated deuteranopia and protanopia. Each entry has an anchor, a meaning, a source and a verified or approx status.
- `color.mjs` `solve(anchor, theme)` gives five roles per theme: ink (4.8:1 on every light ground, 6:1 on dark, warm hues shifted toward orange and held at chroma 0.15 on white so text is a burnt orange, never brown), fill (never inside the `isMuddy` box; yellows at L 0.82 or more and oranges at 0.70 or more on white), on (4.5:1 on the fill), line (the fill when it reaches 3:1 on every ground, else the ink) and wash.
- `build.mjs` reads `data-color` and each phase's `"color"`, adds the source's `hx-colors`, refuses unknown names, anchorless colors and green or identity-only phases, and writes per-theme `[data-color]` rules plus `hx-palette-data`. data-hue still builds as eleven solved stops.
- `test.mjs` judges every role in both themes, mud, meaning, drawn-but-unbuilt names, green phases and pairwise CIEDE2000 (12 normal, 8 simulated) on the fills.

Measured 2026-10-26: the old light values for hues 52 to 100 were all OKLCH L 0.43, which reads brown to olive; the solved marigold on white is fill #fbb54f with text #a34200. The research (report "Theme aware assignment color system") also found that on white every warm text shade converges, so the standard now says colored text carries one warm meaning at most there.

Not verified: the live classroom with a re-uploaded document (Launcher: Design's rebuild waits on Mr. Pina's yes); the `isMuddy` bounds and the ΔE00 floors are this kit's own heuristics, not published standards. Deferred: the geometry rework of `kit.css` to the live classroom's parts, and the site-wide findings (Space White gold and amber are themselves in the muddy box).
