# Armory S1 and R1: overnight cloud runs (server contract and storage, then an independent review)

- Issued: 2026-09-28 03:10 UTC
- By: IDEA & FRC chat; first scheduled as two Claude cloud tasks, then re-routed to one Codex cloud task
- Owns: in `pina-hash/idea-armory`, S1: `server/**`, `src/Armory.Storage/**`, `tests/Armory.Server.Tests/**`, `tests/Armory.Storage.Tests/**`, `docs/server/**`, `docs/storage/**`, `docs/overnight/2026-09-28-S1.md`, `global.json`, the CI workflow, and one carried fix in `Armory.Core` (pinned release required). R1: `docs/overnight/2026-09-28-REVIEW.md` and fixes only for plain data-loss or security defects, each with a test.
- Does not touch: anything in `pina-hash/idea-app` (read-only for conventions); `src/Armory.Platform.Windows`, `spike/`, or the C3 safe-replace work, which needs Mr. Pina's Windows PC and is still issued, not run.
- Migration permitted: no. The SQL is a draft in idea-armory; it reaches idea-app only as a numbered migration Mr. Pina approves.
- Status: re-routed 2026-09-28 03:15 UTC. Both Claude scheduled tasks were deleted before running (Mr. Pina is low on Claude usage). S1 is issued instead as a Codex cloud task (GPT-6 Astra) delivering a pull request against idea-armory `main`; R1 is dropped, and the next chat reviews S1 from a clone before merge.
- Notes: Morning read is `docs/overnight/2026-09-28-REVIEW.md` in idea-armory. Next chat: read it, verify from a clone, then decide the idea-app migration and the Cloudflare R2 setup, both Mr. Pina's.
