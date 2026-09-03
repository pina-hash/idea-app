# 0024 The launcher and portal surfaces: ordering, the course tile, the two admin cards, and the marks spec gap
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/portal-apps.ts`, `src/lib/AppLauncher.svelte`, the launcher region of `src/routes/+page.svelte`, `src/routes/dev/marks/**`, `tools/browser-verify/routes/marks.mjs` and `home-order*.mjs`, `tests/home-order-and-accent.test.ts`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0024-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0174
- Status: pushed
- Branch: `claude/launcher-portal-surfaces-prgx6d`, from `origin/integration` at `8dcef06`
- Notes: Four items on one surface, plus a verification gap prompt 0021
  found while landing the maps card.

  The gap first, because it is the kind this repository cares about most:
  `/dev/marks` lists eleven marks and there are now twelve, and `marks.mjs`
  pins the old count. THE SPEC STAYS GREEN WHILE COVERING LESS THAN IT
  CLAIMS. A count pinned to a literal cannot notice a thirteenth mark either,
  so the fix is to derive the roster rather than to bump the number.

  Reports: students want apps above classes on the home screen; the course
  tile should count what is in it rather than being told; and the Admin
  Dashboard and Site Admins cards read as two doors to one room.

  0021 also left one paragraph in `AppLauncher.svelte` stating that the maps
  accent rule "PAINTS NOTHING", which its own bundle made false. It was
  0020's content and 0021 was right not to revise another bundle's text; this
  bundle owns the file and corrects it.

  Deliberately excluded: profile pictures wherever a name appears, which is
  cross-cutting and its own bundle; the Matrix theme; and any change to what
  an admin can DO, as opposed to how many cards it takes to get there.
