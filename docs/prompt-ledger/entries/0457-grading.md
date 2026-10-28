# 0457 Grading: one queue, protected classes, extensions, late credit, team grading, syllabus targets

- Issued: 2026-10-28
- By: Mr. Pina, from the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("also do 11, 12, 13, 14, 15, 16, 17, 18, 19, and 20"). Queue: `docs/feedback/2026-10-28/QUEUE-0457.md`
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: `src/lib/classroom/GradingConsole.svelte`, `GradesPanel.svelte`, `grading-*.ts`, the grading reads and writes in `src/lib/classroom/transports.ts`, `src/routes/classroom/grading/**`, the class and item grade pages, the grading, class-matching and post-matching code in `src/lib/server/connector/` and its registry entries, answer version history for late credit, per-student due dates and the absent status, syllabus point targets; new migration files for these; `tests/*grading*`, `tests/*grade*`, `tests/*late*`, `tests/*connector-match*`, `tests/db/*grading*`, `tests/db/*grade*`, `tests/db/*late*`, `tests/db/*extension*`; `docs/subsystems/classroom-work.md` grading lines; one `classroom-updates.json` entry; `docs/history/` entry for this lane; this entry.
- Does not touch: tournaments and copy (0455), the teams grading page and team documents (0456), the importer and replace screen (0458).
- Migration permitted: yes, as many as needed, each under the next free migration number at landing. Claims: none yet
- Status: issued
- Mode: solo (beside 0455 and 0456, which own none of these files)
- Branch: main (solo)
