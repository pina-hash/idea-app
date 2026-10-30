---
title: "Home-screen cards are film stills lit by each app's light: the cinematic light sample, ported (ledger 0475, decision 73 amended a second time)"
date: 2026-10-30
branches: ["main"]
migrations: []
subsystems: ["Themes", "Portal shell", "Design system", "Testing"]
---

Ledger 0475, decision 73 as amended the second time on 2026-10-30. Mr. Pina rejected ledger 0474's icon-and-motif cards from their screenshots ("looks like Play-Doh", "kiddie"), was shown four researched samples (A cinematic light, B dark glass, C machined, D deep field) and chose A: "Gotta go with a cinematic light. But now green line and foundry look weird because they weren't adjusted in the same way. So adjust green line and foundry in the same way and go for that. Live on the website as soon as it's ready." Ledger 0474 was never pushed; its commit folded into this one and its entry reads "superseded by 0475, never pushed".

What changed:
- **The sample first.** In the sample's generator (a scratch folder outside the repo: `build.js`, `lib.js`, `dirA.js`), GREENLINE and the Foundry were the 0472 cards copied unchanged: a centred chrome wordmark, outline icons and a tile mosaic. Both were redrawn in A's grammar and the phone render checked before any port: GREENLINE is the night track, one floodlight on its mast with its cold cone falling on the asphalt, and the green streak burning across the track with a spark where the light lands; the Foundry is iron black, a crucible tipped high on the right pouring a molten stream into an ingot mould, the floor seam glowing near it. Each gained a filled icon (a racer from behind; a crucible over its mould). One star in VANGUARD's sample sat behind its title and was moved (see the measurements).
- `src/lib/launcher/art.ts` (new): the sample ported. `sceneSvg(id)` and `iconSvg(id)` return the sample's SVG for each app; `cardInks(room)` derives the words' inks (edge, title ink and halo, accent, icon lift, description, key, hover) exactly as the sample does. Ids derive from the app id, so the server's markup and the browser's agree and no two cards share one.
- `src/lib/launcher/rooms.ts`: rewritten. Each app's `hue`, `core`, `ground` (and `light` or `glow` where a scene has a second light), its title face and size, `titleAccent`, `scene` in words, and `source` ("chosen sample A, 2026-10-30"; GREENLINE and the Foundry say they were redrawn at his request). The 0472 inventory fields (`sources`, `followsTheme`, `neon`, `dominant`, `motif` and the rest) are gone with the rule they served.
- `src/lib/launcher/cards.css`: one block per app, every value `cardInks()` of its room, no theme blocks.
- `src/lib/launcher/CardArt.svelte`: the scene under a grain layer (the sample's fractal-noise SVG at 16%, overlay blend).
- `src/lib/AppLauncher.svelte`: the icon snippet draws `iconSvg(app.id)`, FRC keeps FIRST's image unaltered; no `$lib/marks` import remains. The card is the sample's: 16px padding, 30px icon, 12px gap, 4px corners, the sample's shadow, 88px of scene inside a 1px edge; the comfortable card is that over a 56px foot (description and key) with a hairline between. Titles are one line in their room's face at the sample's size. The GREENLINE centring, the chrome-title, LED and screw-dot key properties are removed.
- `src/lib/portal-apps.ts`: the `icon` field is removed. Nothing read it once the launcher drew icons by app id, so it would have been a second key that could disagree with the first.
- Tests: `tests/home-order-and-accent.test.ts` now holds every card's block to `cardInks()` of its room, value for value (with planted controls for a wrong colour, a stray property, a missing ink and another app's block), every hue's recorded source, a scene and an icon per app, no words and no `<text>` in any scene, every scene lit by its own light and carrying its ground's scrim, unique ids, no two cards alike and no two lights shared, identical paint on all three themes with a dark ground on Space White, 4.5:1 for every word and 3:1 for the icon, and no neon. The `$lib/marks` tests keep the marks' own contract (they serve the Foundry house card, the Armory and the IdeaCAD launch page) and now assert the launcher mounts none of them. `tests/identity-colors.test.ts` drops `cards.css` from the neon allowance (it carries none now; the list only shrinks) and adds `art.ts` and `cards.css` to the owned surfaces. `tests/space-white-inks.test.ts` holds that no card has a theme block and that every icon is lit only by its own app's core and hue.
- `CLAUDE.md` launcher bullet and `docs/subsystems/themes.md` launcher rule edited in place; one `classroom-updates.json` entry (replacing 0474's, which never shipped).

Load-bearing decisions:
- **Ported, not reinterpreted.** The scene and icon functions are the sample's code transcribed into TypeScript. Checked by bundling `art.ts` and comparing each output with the SVG inside the sample's own `A.html`, ids normalised: 14 of 14 scenes and 13 of 13 icons identical (2026-10-30). The only deliberate departures: the FRC icon has no glow (the sample put a drop shadow on FIRST's mark; the mark is never altered), and the description in the comfortable foot is clamped to two lines rather than cut to one with an ellipsis, because the registry's descriptions are longer than the sample's placeholders.
- **A card is a film, not plate.** Every card keeps its dark scene on Space White and Matrix, as the sample does, which replaces 0472's "a card follows its room". The tests that held the old rule were changed to the new one.
- **The inks are derived, not quoted.** A colour on a card is no longer traced to a room's stylesheet; it is computed from the app's light recorded in `rooms.ts`, and the test recomputes it.

Measured (2026-10-30, the real `/dev/home-order` harness, Chromium at 2x, harness strip, saving note and feedback button hidden):
- 375 compact (student): 12 cards, each 343 by 90 (88 of scene inside the edge), icon 30 by 30 at 17px from the card's edge, title starting at 59px and ending by 220px; no horizontal scroll (375/375). Space White: the same 12 cards, the page light, the cards dark.
- 1440 compact (admin): 14 cards, 337 by 90, three columns; comfortable: 337 by 146 (90 plus the 56px foot).
- Sample against site, card by card at 375 (the sample's `A.html#phone` beside the harness): no drift in layout; the per-card pixel difference is a half-pixel vertical offset (the harness card sits at y 523.6) and the FRC glow, nothing else.
- Each title against the BRIGHTEST pixel of its scene inside the title's box, title hidden: the lowest is FRC at 11.63:1 and the highest GAUNTLET at 17.33 (375 compact, 1440 compact and 1440 comfortable). Before the star was moved VANGUARD read 3.78:1, the one card under 4.5; after, 17.16.
- `svelte-check` (after `svelte-kit sync`): 0 errors, 33 warnings in 18 files, the baseline.
- Browser specs (`npm run verify:browser -- --route home-order --route /dev/themes --width 375 --width 1440`): 78 runs, 2836 measurements, 33 outside threshold, none of them a launcher row: the changelog panel's paging, the admin harness's Coin Desk card the launcher no longer shows, the `/dev/themes-shape` proposal harness and the theme board's Space White wall inks, the same 33 ledger 0474 recorded. Every card title on its own card, every glyph, the type floor (0 under 11px) and the control floor pass.
- Full suite: 17516 passed and 1 failed, `tests/boundary-token.test.ts`'s "hairline outnumbers half the boundary uses", which this change tipped from 341 against 681 to 341 against 682 by giving the key's edge a `var(--boundary)` fallback. The fallback went back to `transparent` (every card declares its key's edge), and that file and the launcher file were re-run green.

Not verified:
- A real phone and a signed-in session on ideabosco.com; the harness stands in for both.
- Safari's rendering of the SVG blur filters and the grain's overlay blend; only Chromium was used.
- Screen-reader output beyond the markup: the scene and icon are `aria-hidden`, the title is the link's text.

Deferred:
- The animated marks in `$lib/marks` no longer serve the launcher; whether their other homes should take the filled icons too is a separate decision.
