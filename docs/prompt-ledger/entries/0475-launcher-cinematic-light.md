# 0475 Home screen cards: cinematic light, chosen from four samples

- Issued: 2026-10-30
- By: Mr. Pina, in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("Gotta go with a cinematic light ... adjust green line and foundry in the same way ... Live on the website as soon as it's ready"). Decision 73, second amendment.
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: the launcher files ledger 0472 owned (`src/lib/AppLauncher.svelte`, `src/lib/portal-apps.ts`, `src/lib/launcher/**`, `src/lib/marks/**`, launcher parts of `tools/identity-colors.mjs`, `identity.css`, `identity.ts`, `tests/identity-colors.test.ts`, `tests/home-order-and-accent.test.ts`, the launcher browser specs), `docs/subsystems/themes.md` launcher section, the CLAUDE.md launcher bullet, one `classroom-updates.json` entry, its `docs/history/` entry, this entry.
- Does not touch: any app's own room or page, the frozen Coin Ledger page, `tools/hx-kit/`.
- Migration permitted: no. Claims: none
- Status: pushed
- Mode: solo
- Branch: main (solo)
- Notes: every card, GREENLINE and the Foundry included, is the chosen sample A ported (`src/lib/launcher/art.ts`, scenes and icons matched to the sample's own SVG); hues recorded with their source in `src/lib/launcher/rooms.ts`; every ink in `cards.css` derived from them and held by the test; cards keep their dark look on every theme; the unused `PortalApp.icon` field removed. Ledger 0474's unpushed commit folds into this one. Record: `docs/history/launcher-cinematic-light-0475.md`.
