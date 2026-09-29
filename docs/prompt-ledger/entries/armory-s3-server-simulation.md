# Armory S3: the Core safety simulation run against the real server SQL

- Issued: 2026-09-28
- By: IDEA & FRC chat, for one Codex cloud task (GPT-6 Astra) delivering a PR on idea-armory
- Owns: a server interface extracted from `tests/Armory.Core.Tests/SimulationTests.cs` (pure refactor, seed-hash proven), `tests/Armory.Server.Tests/**`, `server/sql/**` only for proven findings, `docs/server/simulation-parity.md`, `server/PROOF.md`.
- Does not touch: anything in `pina-hash/idea-app`; `src/Armory.Platform.Windows`, `spike/`.
- Migration permitted: no. Claims: none.
- Status: merged as `ef61930` (PR #3). Verified by the chat 2026-09-28: Core 165, Server 9, Storage 7 passed against PostgreSQL 16. Found and fixed a real SQL bug (a broken lock could never be re-acquired). Left two gaps, issued as S4: locks keyed on email only (no device), and no replay idempotency.
- Notes: Closes the gap S1 left open. No invariant, scenario mix or crash point may change.
