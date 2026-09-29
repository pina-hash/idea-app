# Armory S4: device-scoped locks and idempotent replay

- Issued: 2026-09-28
- By: IDEA & FRC chat, for one Codex cloud task (GPT-6 Astra) delivering a PR on idea-armory
- Owns: `server/sql/**`, `tests/Armory.Server.Tests/**`, `docs/server/**`, `server/PROOF.md`.
- Does not touch: anything in `pina-hash/idea-app`; `src/Armory.Platform.Windows`, `spike/`; the fake-server simulation's behavior (seed hashes must still match).
- Migration permitted: no. Claims: none.
- Status: merged as `1c1d9c6` (PR #4). Chat verified 2026-09-28: Core 165, Server 9, Storage 7 pass; fake-simulation seed hashes unchanged; device-scoped locks and operation receipts present. Defect: S4 deleted all eight prior server contract tests (including S2's two security guards) without replacement. Protections probed and still present; tests restored in S5.
