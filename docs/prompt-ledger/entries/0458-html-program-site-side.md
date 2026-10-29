# 0458 HTML assignments at full potential, site side: sources, rebuild, health list, one rail

- Issued: 2026-10-28
- By: Mr. Pina, from the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("go ahead and run ... HTML program items"). Queue: `docs/feedback/2026-10-28/QUEUE-0458.md`
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: the HTML assignment importer, replace screen and source storage in `src/lib/classroom/` and `src/lib/hx/`, the item page header and `Progress.svelte`, the bridge messages, the export of sources, the staff HTML assignments health page under `src/routes/admin/`, the class Videos list, `create_post` points rules, `.github/workflows/` one new kit-retest job and one commit-message check, `src/lib/site-versions.ts` (subject split), a ledger-number uniqueness test, the connector's report_gap, upload staging, document read-back, post files and units reads, `src/lib/classroom/html-assignment/thumbnail.ts`, and in `tools/hx-kit/` only `kit/bridge.js` and `kit/kit.js` for the bridge halves of item 25 and f8c1b1d8 (rebase first, `node tools/hx-kit/test.mjs tools/hx-kit/starter.html` at 0 FAIL, changes named here); new migration files for these; `tests/*hx*`, `tests/*html-assignment*`, `tests/*importer*`, `tests/db/*hx*`, `tests/db/*html-assignment*`; `docs/subsystems/html-assignments.md` non-team sections; one `classroom-updates.json` entry; `docs/history/` entry for this lane; this entry.
- Does not touch: tournaments and copy (0455), team documents and sign-offs (0456), grading console scaling (0457).
- Migration permitted: yes, as many as needed, each under the next free migration number at landing. Claims: 0326, 0327, 0328
- Status: pushed (parts 1 to 6; what is not done is listed in the record)
- Mode: solo (starts after 0455 and 0456 land)
- Branch: main (solo)
- Kit files changed (announced to the HTML standards chat): `tools/hx-kit/kit/kit.js` only. It hears `idea:host { steps, title }` and then hides its own step track, "You are here" line and (with title) its title, and reports `idea:steps` after every refresh; it shows a step on `idea:go-step { index }`; a plan day with `"pace": "<pacing step id>"` takes its date from the portal's `schedule.pacing`, and `schedule.today` is its today. `bridge.js` unchanged. `tools/hx-kit/starter.html` not rebuilt. Record: `docs/history/html-program-site-side-0458.md`.
