# 0463 Armory projects linked to a class: roster members, personal folders, team folders

- Issued: 2026-10-28
- By: Mr. Pina, relayed from the IDEA100-3 chat to the IDEA & FRC chat ("Needed by 8:00 a.m. 2026-10-29 if possible"). Queue: `docs/feedback/2026-10-28/QUEUE-0463.md`
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app` and `pina-hash/idea-armory`
- Owns (idea-app): everything under `src/lib/armory/` and `src/routes/armory/`, the armory entries in `src/lib/server/connector/registry/` (additive), the `classroom_import_roster` class lookup and its test, new `armory_*` migration files, `tests/*armory*`, `tests/db/*armory*`, `docs/subsystems/armory.md`, `docs/ARMORY.md`, one `classroom-updates.json` entry, its `docs/history/` entry, this entry.
- Owns (idea-armory): the folder sync, empty-folder and folder-permission code under `src/` and `tests/`, the version bump and `docs/agent/release-notes/`; creating the GitHub release only after Mr. Pina's yes.
- Does not touch: tournaments and copy (0455), team documents and sign-offs (0456), grading (0457), the HTML program (0458).
- Migration permitted: yes, as many as needed, each under the next free migration number at landing. Claims: 0314
- Status: pushed (the roster import fix, 0314); the Armory class projects in progress
- Mode: solo (beside 0455, 0456 and 0457, which own no Armory files)
- Branch: main (solo)
