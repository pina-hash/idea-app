# 0455 Tournaments fixed and a rotation copies forward in one step

- Issued: 2026-10-28
- By: Mr. Pina, from the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("go ahead and run breaks classes week items"). Queue: `docs/feedback/2026-10-28/QUEUE-0455.md`
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: everything under `src/lib/tournaments/` and `src/routes/tournaments/`; the tournament and duplicate/copy entries in `src/lib/server/connector/registry/`; the connector's coin-award note path (the note comes from the reason, never from said) and its test; the class duplicate and rotation copy code and UI in `src/lib/classroom/` (a new copy module and the duplicate call sites only); new migration files for tournaments and the copy; `tests/*tournament*`, `tests/db/*tournament*`, `tests/*duplicate*`, `tests/*rotation-copy*`, `tests/db/*duplicate*`, `tests/db/*rotation-copy*`; one `classroom-updates.json` entry; `docs/history/` entry for this lane; this entry.
- Does not touch: team documents, sign-offs, draws (0456), the grading console (0457), the importer, item page header or kit (0458).
- Migration permitted: yes, as many as needed, each under the next free migration number at landing. Claims: none yet
- Status: issued
- Mode: solo (beside 0456 and 0457, which own none of these files)
- Branch: main (solo)
