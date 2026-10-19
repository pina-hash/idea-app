# 0414 The IDEA Market gets a front door

- Issued: 2026-10-19
- By: Mr. Pina, in the session that built ledger 0402: "Why isn't there an obvious way to get to the marketplace? Is the only way to get there to type the link in manually? That sucks." Mode: solo.
- Repo: `pina-hash/idea-app`
- Branch: none; pushed straight to `main`.
- Owns: `src/lib/portal-apps.ts` (the `market` entry), `src/lib/marks/MarketMark.svelte`, `src/lib/AppLauncher.svelte` (the mount and the Space White ink), `src/lib/ProfileMenu.svelte` (one link), `src/lib/tour/orientation.ts` (one tour line), `src/lib/feedback/context.ts` (`/market` reports file under coins), `classroom-updates.json`, `docs/history/market-front-door-0414.md`, this entry.
- Does not touch: migrations, `materials/**`, the frozen Ledger file.
- Migration permitted: no.
- Status: pushed
- Notes: until this, `/market` was reachable only from a button on My coins, a sentence in the Ledger's Transfers tab, and staff banner pins.
