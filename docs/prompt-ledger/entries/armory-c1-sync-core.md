# Armory C1: the sync core library and its simulation, in a new repository

- Issued: 2026-09-27
- By: IDEA & FRC chat, for one local Codex session (GPT-6 Astra, high)
- Owns: the new repository `pina-hash/idea-armory` (private), all of it. In `pina-hash/idea-app` this entry and the "Where the code lives" section of `docs/ARMORY.md`, written by the chat, not the session.
- Does not touch: anything in `pina-hash/idea-app`.
- Migration permitted: no. Claims: none.
- Status: verified by the chat 2026-09-28 00:58 UTC at `c7364c1`: built with -warnaserror and ran on .NET SDK 10.0.112 (Linux, global.json band relaxed in a scratch copy only), 164/164 passed. Re-ran two of the four recorded breaks (open file, lock before upload), both caught (seeds 0 and 1), and one break of the chat's own (dropping the held-by-another-person side-version rule), caught by 3 tests including the simulation. Sources restored byte-identical. Noted for a later lane: `Reconciler` falls back to a pinned release of 2025 when none is supplied, rather than requiring it.
- Notes: Mode solo, in its own repository, so it cannot collide with ledger 0344 (Classroom shape language round 3, running on `idea-app` `main` at issue). Pure .NET library: content addressing, vault path rules, the vault-wide unique-name rule, the reconciliation engine, the lock state machine, the crash-safe offline journal, the SolidWorks release gate, part numbers, and a seeded multi-client simulation asserting that no saved work is ever lost. No network, UI, SolidWorks or installer. Runs on the defaults of decision 41 (armory-file-vault-scope), each of which is configurable in the library.
