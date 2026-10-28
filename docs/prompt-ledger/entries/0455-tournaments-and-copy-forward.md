# 0455 Tournaments fixed and a rotation copies forward in one step

- Issued: 2026-10-28
- By: Mr. Pina, from the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("go ahead and run breaks classes week items"). Queue: `docs/feedback/2026-10-28/QUEUE-0455.md`
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: everything under `src/lib/tournaments/` and `src/routes/tournaments/`; the tournament and duplicate/copy entries in `src/lib/server/connector/registry/`; the connector's coin-award note path (the note comes from the reason, never from said) and its test; the label a custom coin transaction renders with (65c46fcf); a Deposit coin transaction type, its minimum setting and categories (218b6169, 636eac71, 649759fe) in the coin write path, coin staff tools and connector; the class duplicate and rotation copy code and UI in `src/lib/classroom/` (a new copy module and the duplicate call sites only); new migration files for tournaments and the copy; `tests/*tournament*`, `tests/db/*tournament*`, `tests/*duplicate*`, `tests/*rotation-copy*`, `tests/db/*duplicate*`, `tests/db/*rotation-copy*`; one `classroom-updates.json` entry; `docs/history/` entry for this lane; this entry.
- Does not touch: team documents, sign-offs, draws (0456), the grading console (0457), the importer, item page header or kit (0458).
- Migration permitted: yes, as many as needed, each under the next free migration number at landing. Claims: 0317, 0318
- Status: pushed (part 1: tournaments and copy forward, 0317 and 0318; part 2, the coin note, label and deposits, follows)
- Mode: solo (beside 0456 and 0457, which own none of these files)
- Branch: main (solo)
