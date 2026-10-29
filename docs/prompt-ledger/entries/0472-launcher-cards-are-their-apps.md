# 0472 Every launcher card is a miniature of its own app

- Issued: 2026-10-29
- By: Mr. Pina, in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" (decision 73). Queue: `docs/feedback/2026-10-28/QUEUE-0472.md`
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: `src/lib/AppLauncher.svelte`, `src/lib/portal-apps.ts` (dropping `family` from the launcher), `src/lib/marks/**`, any new per-app card art under `src/lib/launcher/`, the launcher parts of `tools/identity-colors.mjs`, `src/lib/design-system/identity.css`, `identity.ts` and `tests/identity-colors.test.ts`, `tests/home-order-and-accent.test.ts`, the launcher browser specs under `tools/browser-verify/routes/` (`_home-theme.mjs`, `_theme-shared.mjs` and the home specs), `docs/subsystems/themes.md` launcher section, the CLAUDE.md "Identity colours" bullet, one `classroom-updates.json` entry, its `docs/history/` entry, this entry.
- Does not touch: any app's own room or page (read them, never edit them), the frozen Coin Ledger page, `tools/hx-kit/`, the calendar, unit tints and class colours from 0467, files lane 0469 is editing other than the launcher specs named above.
- Migration permitted: no. Claims: none
- Status: pushed
- Mode: solo (lane 0469 runs beside it and owns no launcher file)
- Branch: main (solo)
