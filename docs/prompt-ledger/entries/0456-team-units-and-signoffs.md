# 0456 Team units: sign-offs you can reach and approve, photos teammates see, teams that stay put

- Issued: 2026-10-28
- By: Mr. Pina, from the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("go ahead and run breaks classes week items"). Queue: `docs/feedback/2026-10-28/QUEUE-0456.md`
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: team documents, team draws, team plans, sign-offs, the board and machine booking: `src/lib/classroom/` team, sign-off, board and PeoplePanel draw code, `src/routes/classroom/signoffs/**`, `src/routes/classroom/board/**`, `src/routes/classroom/[sectionId]/item/[itemId]/teams/**`, the classroom nav entry for Sign-offs, the class-home team card, `tools/hx-kit/kit/team.js`, the team, sign-off and draw entries in `src/lib/server/connector/registry/`, the tour banner's staff rule, the assignment frame's camera permission in `src/lib/hx/` and the item page (ed0b584e only), a shared roster-name check module; new migration files for these; `tests/*team*`, `tests/*signoff*`, `tests/*board*`, `tests/db/*team*`, `tests/db/*signoff*`; `docs/subsystems/html-assignments.md` team sections; one `classroom-updates.json` entry; `docs/history/` entry for this lane; this entry.
- Does not touch: tournaments and copy (0455), the main grading console and grades panel (0457), the importer and item page header and rail (0458).
- Migration permitted: yes, as many as needed, each under the next free migration number at landing. Claims: none yet
- Status: issued
- Mode: solo (beside 0455 and 0457, which own none of these files)
- Branch: main (solo)
