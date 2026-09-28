# Armory C1: the sync core library and its simulation, in a new repository

- Issued: 2026-09-27
- By: IDEA & FRC chat, for one local Codex session (GPT-6 Astra, high)
- Owns: the new repository `pina-hash/idea-armory` (private), all of it. In `pina-hash/idea-app` this entry and the "Where the code lives" section of `docs/ARMORY.md`, written by the chat, not the session.
- Does not touch: anything in `pina-hash/idea-app`.
- Migration permitted: no. Claims: none.
- Status: pushed (reported at `c7364c1` in `pina-hash/idea-armory`: 164 tests, 10,000 simulation scenarios, four deliberate breaks caught, Stryker not run. Not yet read by the chat: the private repo is not visible to its GitHub access.)
- Notes: Mode solo, in its own repository, so it cannot collide with ledger 0344 (Classroom shape language round 3, running on `idea-app` `main` at issue). Pure .NET library: content addressing, vault path rules, the vault-wide unique-name rule, the reconciliation engine, the lock state machine, the crash-safe offline journal, the SolidWorks release gate, part numbers, and a seeded multi-client simulation asserting that no saved work is ever lost. No network, UI, SolidWorks or installer. Runs on the defaults of decision 41 (armory-file-vault-scope), each of which is configurable in the library.
