---
title: "The IDEA Market gets a home launcher card and a profile menu link"
date: 2026-10-19
branches: ["main"]
migrations: []
subsystems: ["coins", "portal"]
---

Mr. Pina found the IDEA Market (ledger 0402) had no obvious way in: a reader had to type `/market` or find the button on My coins. Two doors were added.

- **A launcher card**, `market` in `PORTAL_APPS`, placed right after the IDEA Coin Ledger so the coin cards read together. `requiresAuth: true`, because buying, posting and sending all need a session (the page itself still answers its signed-out state). Mark: `MarketMark.svelte`, a striped market stall with a hanging price tag, in the IdeaCAD construction (three face tiers mixed from currentColor, a `--mkm-*` hook family, `once` plays half a cycle and rests on the open stall).
- **Dark themes declare nothing** for the card (the shared brass), because the market has no room palette of its own to quote.
- **Space White ink `#c20a9d`** (fuchsia), chosen by a search over hue, saturation and lightness for the ink farthest from every other card and from `--gold` that still clears as words. Measured: 5.20:1 on the card, 4.82:1 on the CTA hover fill; nearest neighbours CIEDE2000 13.5 (VANGUARD), 13.6 (Coin Desk), 14.2 (Admin).
- **Profile menu**: "IDEA Market" under "My coins".
- `appForRouteId` now files a report from `/market` under `coins`, not `portal`.

Measured: `npm run verify:browser -- --route marks`, 8 route/width runs, 166 measurements, 0 outside threshold, the market mark 4 animated elements and 0 unsettled under reduce. Screenshots of `/dev/home-order` at 1440 on IDEA and Space White show the card in the grid.

Not verified: the signed-in production home page (no session here); the profile menu link in a browser.
