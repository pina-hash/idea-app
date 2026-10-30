---
title: "Home-screen cards are an app icon and a title on the app's own banner (ledger 0474, decision 73 amended)"
date: 2026-10-30
branches: ["main"]
migrations: []
subsystems: ["Themes", "Portal shell", "Design system", "Testing"]
---

**Never pushed.** Mr. Pina rejected this version from its screenshots ("looks like Play-Doh") before it landed, and ledger 0475 replaced its art completely; this commit folded into 0475's. It is kept as the record of what was tried (docs/history/launcher-cinematic-light-0475.md).

Ledger 0474, decision 73 as amended 2026-10-30. Ledger 0472 (the day before) rebuilt every launcher card as a miniature of its app's screen: tiny tiles, tabs, lists, chips and placeholder words at 9px to 12px. Mr. Pina opened it on his phone the next morning: "extremely confusing ... way too busy ... There's like all these little words. It's ridiculous. I said to do it like it would be on a computer, like you have like an icon for the app and a title." He named IDEA · GREENLINE and IDEA · FOUNDRY as right. So every other card was brought to their density: the app's icon and its title on a banner in the room's own colours, with ONE motif from the app's page.

What changed:
- `src/lib/launcher/CardArt.svelte`: every miniature screen is gone. Each card draws one motif, either at the banner's right end fading in from its own left edge (`.motif`) or as a texture across the card that fades in past the title (`.art-texture`). The only character drawn is the Coin Ledger's i¢. GREENLINE's title screen and the Foundry's seam and mosaic are the same markup ledger 0472 shipped. The `data-miniature` marker is gone from the card, because nothing on it is a picture of text any more; `checks-floor.mjs` keeps the mechanism for the notebook thumbnail that still uses it (`EntryThumb.svelte`).
- The motifs, one per card (also `motif` in `LAUNCHER_ROOMS`):
  - Classroom: the brass mortarboard, large, on the plate.
  - My Notebook: one photographed page on the dark camera island, squared up by its four corner handles.
  - IdeaCAD: the graphite viewport (`--ic-ground`, now the card's ground) with its floor grid running to the horizon in `--ic-text-3`, one axis in the accent green.
  - IDEA Armory: the green check ring a file wears when it is in, inside a dial of ticks.
  - IDEA Maps: one room outlined in the plan jade and washed inside, on the plan canvas.
  - IDEA Coin Ledger: the chartreuse and green particle field and a big glowing i¢ (no particles on Space White, where the Ledger hides its canvas).
  - IDEA Market: the gold star of a Featured tile.
  - GAUNTLET: the void with its steel fog high on the banner, the lime glow of a first clear rising from its foot, and drifting particulate.
  - FRC Training: FIRST paper under the blue rule, with the blue triangle, the red circle and the dark square. The FIRST mark is untouched.
  - GREENLINE: unchanged (night, floodlight cones, the green streak and its spark burst).
  - VANGUARD: the playfield column between its two green rules, the five pathway squares falling down it.
  - IDEA Foundry: unchanged (the molten seam and a quiet cover mosaic).
  - Tournaments: jade bracket lines, four meeting in two and two in the final.
  - Admin: the identity strip's three readouts as three stepped lights, cyan, brass and green, each with its own glow.
- `src/lib/launcher/cards.css`: the twelve blocks keep their ground, edge, title face and ink, mark ink, description and key, and lose every drawing colour the miniature used and every layout property (`--rm-align`, `--rm-head-drop`, the centred columns) except GREENLINE's. The GREENLINE and Foundry blocks are byte-identical to 0472's (checked by extracting both blocks from `HEAD` and the new file and diffing them). GAUNTLET's `--rm-art-bg` moved its two lights apart (the fog high, the lime glow at the foot), because laid over each other they read as an olive smear on the first capture. FRC's blue rule is now a layer of `--rm-art-bg` across the top.
- `src/lib/AppLauncher.svelte`: the icon and title sit at the left, centred down the card, on every card (the `--rm-align` and `--rm-head-drop` reads and the comfortable view's `--rm-scene-top` are removed; GREENLINE still centres through `--rm-justify`). Comments describe the banner and the motif.
- CardArt's ground layer is now the `background` shorthand rather than `background-image`, so a layer can carry its own position and size. Under `background-image`, FRC's `linear-gradient(...) 0 0 / 100% 3px no-repeat` was an invalid value and painted nothing, so 0472's white header strip and blue rule were never on the card; the rule shows now.
- `src/lib/launcher/rooms.ts`: each room gains `motif`, the one thing its banner draws.
- Tests: `tests/home-order-and-accent.test.ts` renders every card's drawing and holds it to no text but the Ledger's i¢ (with that glyph as the positive control), checks that every card draws something, that `CardArt` carries no `data-miniature` and no scene, and that every room names its motif. The colour tracer, the uniqueness rule, the follows-its-room rule and the 4.5:1 and 3:1 contrast rule are unchanged and pass. Comments in `tests/identity-colors.test.ts` and `tests/space-white-inks.test.ts` no longer call a card a miniature.
- `docs/subsystems/themes.md` (the launcher section) and the CLAUDE.md launcher bullet are edited in place; one `classroom-updates.json` entry.

Load-bearing decisions:
- **One motif, and it is the app's, not a picture of the app.** The test that a card is told apart with every word hidden (0472's bar) still holds: the twelve motifs are twelve different shapes and textures on twelve room grounds, and GREENLINE and the Foundry are the two Mr. Pina already accepted.
- **Every card sets its icon and title at the left except GREENLINE.** A phone shows the launcher as one column, and a list of banners reads cleanly only when every name starts in the same place; GREENLINE's centred chrome wordmark is one of the two cards he named as right, so it keeps it.
- **A drawing's class names are scoped, and a global rule still reaches them.** The texture layer was first called `.field`; `app.css` styles every `.field` with a 1px rule along its foot, so a faint line ran across the Ledger's comfortable banner. Found on a probe that hid the glyph, then the mask, then the particles, and read the layer's computed border (`1px solid rgba(145, 165, 130, 0.27)`). It is `.art-texture` now.
- **The i¢ is the one character, and it is set on the type scale** (`--fs-h1`, 38.4px), not a literal, under the 0469 type rule.
- **No colour was invented.** Every value the new motifs use was already traced for 0472 or is a token the room reads (`--surface-2` was dropped with the Classroom's tile; `--ic-text-3` is `ideacad.css`'s own decorative ink); the tracer read the new file and passed.

What was measured (2026-10-30, the `/dev/home-order` harness in this container, headless Chromium, captures under the session's scratchpad `0474/`):
- `svelte-check` after `svelte-kit sync`, with placeholder public Supabase values: 0 errors, 33 warnings in 18 files, the baseline.
- Size: every card 88px tall in the compact view and 144px in the comfortable one, 343px wide in one column at 375 and 339px in three columns at 1440; no horizontal scroll (scroll width minus client width 0) in any of the nine captures.
- Words in the drawing layer, read from the DOM in every capture (student 375 compact and comfortable, admin 1440 compact and comfortable, IDEA, Space White and Matrix): the Ledger's i¢ on its one card and nothing on the other 11 (student) or 13 (admin).
- Titles end by 102 to 199px from the card's left edge (GREENLINE's centred one at 289px of 339), so no title reaches the motif's opaque part.
- Browser specs (`npm run verify:browser -- --route home-order --route /dev/themes --width 375 --width 1440`): 78 runs, 2836 measurements, 33 outside threshold, none of them a launcher row. Every card's title on its own card, every card glyph (3:1) and every CARD_LOOKS row pass. The 33 are the changelog panel's paging (8, `state=changelog-more`), the admin harness's Coin Desk card that the launcher no longer shows (12), the `/dev/themes-shape` proposal harness (11) and the theme board's Space White status inks on the wall (2). The first two sets were re-run with this change stashed, on `48d6cf84`, and fail there identically; the last two are the ones ledger 0472 recorded.
- The full suite, once, at the end, on `48d6cf84` with this change: 973 files, 17516 tests passed, 0 failed.
- Targeted tests (`home-order-and-accent`, `identity-colors`, `space-white-inks`, `theme-tokens`, `portal-admin-console`, `coin-symbol`, `boundary-token`, `claude-md`, `home-hidden-apps`, `home-tour`, `coin-card-pair`, `foundry-major`, `type-scale`): 425 passed.

What is NOT verified:
- A real phone, production `ideabosco.com` and a signed-in session: the captures are the harness in this container.
- Real Chakra Petch: Google Fonts are blocked by the harness, so IdeaCAD's and VANGUARD's titles render in their fallback; the `@fontsource` faces are real.
- Signed-out cards (a requires-sign-in app's description gains "Sign in to enter.").

Deferred:
- Nothing pushed: Mr. Pina looks at the screenshots first.
