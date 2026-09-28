# Armory S1 and R1: overnight cloud runs (server contract and storage, then an independent review)

- Issued: 2026-09-28 03:10 UTC
- By: IDEA & FRC chat, as two one-shot scheduled cloud tasks (Claude Code, Opus 5.5, automatic approval)
- Owns: in `pina-hash/idea-armory`, S1: `server/**`, `src/Armory.Storage/**`, `tests/Armory.Server.Tests/**`, `tests/Armory.Storage.Tests/**`, `docs/server/**`, `docs/storage/**`, `docs/overnight/2026-09-28-S1.md`, `global.json`, the CI workflow, and one carried fix in `Armory.Core` (pinned release required). R1: `docs/overnight/2026-09-28-REVIEW.md` and fixes only for plain data-loss or security defects, each with a test.
- Does not touch: anything in `pina-hash/idea-app` (read-only for conventions); `src/Armory.Platform.Windows`, `spike/`, or the C3 safe-replace work, which needs Mr. Pina's Windows PC and is still issued, not run.
- Migration permitted: no. The SQL is a draft in idea-armory; it reaches idea-app only as a numbered migration Mr. Pina approves.
- Status: scheduled. S1 at 2026-09-28 03:12 UTC (task `trig_01QcXmxMnTGomu4aH4PWYmkJ`); R1 at 11:00 UTC (task `trig_011afpdFKFjLrgKSnAipJBVM`, with push and email notification). R1 stops and says so if S1 has not finished.
- Notes: Morning read is `docs/overnight/2026-09-28-REVIEW.md` in idea-armory. Next chat: read it, verify from a clone, then decide the idea-app migration and the Cloudflare R2 setup, both Mr. Pina's.
