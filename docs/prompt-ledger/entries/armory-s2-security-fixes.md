# Armory S2: scope grants to armory tables; remove the identity test seam from production SQL

- Issued: 2026-09-28
- By: IDEA & FRC chat, for one Codex cloud task (GPT-6 Astra) delivering a PR on idea-armory
- Owns: `server/sql/**`, `tests/Armory.Server.Tests/**`, `server/PROOF.md`, `docs/server/contract.md`, one appended line in `docs/overnight/2026-09-28-S1.md`.
- Does not touch: anything in `pina-hash/idea-app`; `src/Armory.Platform.Windows`, `spike/`.
- Migration permitted: no. Claims: none.
- Status: merged as `08677b6` (PR #2). Verified by the chat 2026-09-28: Core 165, Server 7, Storage 7 passed against PostgreSQL 16; independent probe on the merged SQL shows an unrelated revoked table stays unreadable and a caller-set `armory.test_email` no longer yields an identity.
- Notes: Both defects reproduced by the chat on `aedba68`. Nothing from `server/sql/` may become an idea-app migration until S2 is merged and re-verified.
