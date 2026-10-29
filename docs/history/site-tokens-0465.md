---
title: "Color tokens re-derived per theme through solve() and held by a contrast test (ledger 0465)"
date: 2026-10-28
branches: ["main"]
migrations: []
subsystems: ["Themes", "Design system", "Testing"]
---

The first lane of the site-wide visual pass (feedback abb2c080, queue `docs/feedback/2026-10-28/QUEUE-site-ui-pass.md`, section "Lane 0465"). Token files and tests only; no component was edited.

What changed:
- Every semantic hue is now `solve()`'s answer (tools/hx-kit/color.mjs, imported, never copied) for its brand anchor over the theme's own grounds. Dark values are solved over the IDEA and Matrix grounds together, because Matrix may not repaint a semantic hue and reads the same :root value. Green, brass and patina already cleared solve()'s 6:1 and come back as their anchors.
- IDEA and Matrix (`colors.css` :root): `--amber` #d08030 to #ea984b, `--crimson` #d95f5f to #ff8683 (was 4.14 on --bg1), `--violet` #7050a8 to #8d6dc8 (was 2.45 on --bg1 as a mark), `--violet-ink` #a08ac7 to #b899f8, `--boundary` #6f7b73 to #78847c (was 2.86 on the selected-row tint; lightness only, it is solve()'s `line` for that anchor).
- `--teal` is retired as a meaning: `var(--cyan)` in every theme, declared by no theme, so its 75 readers keep painting. It sat 9.4 CIEDE2000 from green (7.5 on Space White).
- The status role layer has four tokens per tone, all pinned hexes: `--status-<tone>` (ink), `-fill` (the band that carries `--text-1`), `-solid` (a chip fill) and `-on` (the word on the solid), for ok, warn, danger, info and a new `special` (brass). The dark `-fill` values are solve()'s wash pinned over the neutral `--surface-1`; the 12% mixes they replace read the danger tint as olive (#313022) over the green `--bg1` and put the warning tint inside the muddy box over `--bg2`.
- Space White: every ink re-solved over its grounds AND the Plate's word grounds (plate, panel, inset, chip and list faces from `src/lib/classroom/plate.css`, #dadee6 the darkest): green #2d6b26, gold #8b4f00, cyan #006a5a, amber #8c3700 (also solved over the Plate's 14% wash of itself, the fixed point), crimson #a93338, violet-ink #6d4ca4, violet (the mark) #7050a8. The warm two lean toward orange and keep chroma (OKLCH C 0.11 and 0.13), so they are an ochre and a burnt orange, not the muted #715d22 and #77491b. The status fills are bright fills with dark text, spread from OKLCH L 0.58 to 0.86 (#4d8c46, #e79548, #e16665, #41a692, #efce6f); band and chip are one value. Its `--signal-hot` override is gone (it follows the copper word, as on the dark themes).
- Notebook: `--nb-ok` mixes green instead of teal in both blocks; the IDEA `--nb-cell-late-fill` #42361d (inside the muddy box) is the warning band #2f2417, the late glyph 6.50 on it.
- New `tests/color-tokens.test.ts`: derivation to within 0.5 CIEDE2000 of solve(); words 4.5:1 and marks 3:1 on every theme and Plate ground plus the tint, in all three themes; the pairs the app draws (labels on status fills, the primary key, the brass plate); the notebook room's inks and pinned fills; no muddy fill over any ground; status chip fills 12 apart normal and 8 under simulated deuteranopia and protanopia; no warm word on Space White under C 0.10; no pure red, white or yellow. Three named exceptions (`--dim`, luminance-held for FRC paper, on IDEA `--bg2` and the tint, and Matrix's tint) are asserted to still fail. Positive controls: the old crimson and violet, the old pale fills, the old brown inks.
- Tests updated because they pinned a value this lane moved: `theme-tokens` (Space White green), `space-white-inks` (the brown is held as the literal #715d22 decision 40 retired, since --gold is no longer it), `classroom-class-theme` (the class palette's edge was seeded from teal's #3ea368, held as that value), `theme-rain` (the hero eyebrow is the cyan alias now, measured under the rain at its real value and at the old one).

Decisions and why:
- The inks are not held to the colorblind floor; the chip fills are. At 4.5:1 on a near-white panel every ink sits near OKLCH L 0.5, so two inks can only differ in hue, which the simulations remove (the research report: 0.6 between the best warm inks). The fill is free in lightness, so the tone lightness is the one free choice (TONES in the test) and everything else is solve()'s. This mirrors `tools/hx-kit/test.mjs`, which applies the same floors to fills.
- A dark band (`-fill`) stays a dark tint because three components paint `--text-1` on it (the classroom's notebook count, the coin fine banner, the inbox acknowledgement); on Space White the same three now sit on a bright fill with dark text, which is the spec's "bright fills with dark text".
- `--plate` is not a ground anywhere: nothing in `src/` paints it. Plate KEY faces and wells (#b8bdc5 to #c8ccd5) are not word grounds for a semantic ink; a word there reads about 3.45 with the new inks and read 3.07 to 3.38 with the old.

Measured (contrast probe over 12 dev routes, every visible text element against its composited ground, 4.5:1 or 3:1 at 24px and bold 18.66px; IDEA, Space White and Matrix at 375, 1152 and 1440; 4,493 text elements per theme). See the final report for the per-route table.

Not verified: signed-in production pages; `npm run verify:browser` over the full route list (lane 0469 owns its specs, several of which pin the previous Space White hexes or the "ink on its own fill" row of /dev/themes); a projector.

Left for lanes 0466 to 0469: the 75 `var(--teal)` reads; the Space White ink-on-own-fill row of /dev/themes and its browser spec; semantic words drawn on Plate key faces (coin market ratings, 3.07 before and after); `--dim` on `--bg2`; `CLAUDE.md`'s Visual theme line still lists teal as "in progress".
