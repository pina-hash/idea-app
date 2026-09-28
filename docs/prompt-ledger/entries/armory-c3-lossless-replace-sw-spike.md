# Armory C3: a replace that cannot lose bytes, and the SolidWorks add-in spike

- Issued: 2026-09-27
- By: IDEA & FRC chat, for one local Codex session (GPT-6 Astra, high)
- Owns: in `pina-hash/idea-armory`, the safe-replace adapter and its tests and doc, `spike/Armory.SwSpike/**`, `docs/spike/**`, and the CI job filter for the spike.
- Does not touch: anything in `pina-hash/idea-app`; any existing user or team CAD file; the SolidWorks license.
- Migration permitted: no. Claims: none.
- Status: issued
- Notes: Mode solo, after C2. Part 1 replaces MoveFileEx-over-destination with a set-aside protocol (rename aside, verify, move in without replace-existing, journaled, kill-injected at every step). Part 2 measures SolidWorks 2026 add-in events, reading the saved release through the API, Save as Previous Version to 2025 under the Student Sponsorship license (the open question in decision 41 choice 7), read-only behavior, and whether `~$` survives a crash.
