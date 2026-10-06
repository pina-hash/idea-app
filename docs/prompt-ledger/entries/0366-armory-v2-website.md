# IDEA Armory v2: the ideabosco.com side (lane W)

- Issued: 2026-10-06
- By: IDEA & FRC chat, run as a Claude Code session, pushed straight to `main` (Mode: solo). Approved by Mr. Pina 2026-10-06.
- Owns: `supabase/migrations/0232_armory_v2.sql`, `tests/db/armory-v2.test.ts`, `tests/db/armory-proposed.ts` (the chain short of 0231), `src/lib/armory/**`, `src/lib/server/armory/**`, `src/routes/armory/**`, `src/routes/dev/armory/**`, `tools/browser-verify/routes/armory.mjs`, the Armory card in `src/lib/portal-apps.ts`, `src/lib/AppLauncher.svelte` and `src/lib/site-manifest.ts`, `src/lib/marks/ArmoryMark.svelte`, the Armory entries in `src/lib/classroom/plate.css`, `docs/armory/screens/v2/`, the Armory sentences of `CLAUDE.md`, this entry, `docs/history/confident-einstein-axy6dy.md`.
- Does not touch: `pina-hash/idea-armory` (read only), `materials/**`, `.github/**`, any other migration.
- Migration permitted: yes, exactly one. Claims: 0232.
- Status: pushed
- Notes: Lane A rebuilds the Windows agent against the same contract (C1 to C8), so 0232 builds to it exactly. migrate.yml applies 0232 on the push.
