# 0431 HTML assignments: duplicate, export, live lock, expand, answers left

- Issued: 2026-10-23
- By: Mr. Pina, through the IDEA & FRC chat (docs/feedback/2026-10-23/QUEUE.md)
- Owns: `src/lib/classroom/HtmlAssignmentFrame.svelte` and any HTML-assignment frame, bridge or answers module it uses under `src/lib/classroom/` and `src/lib/server/` (including `answers.ts`, `html-assignment-document.ts`, `classroom-export.ts`), the item page components that show "answers left" and host the frame (`src/routes/classroom/**/item/**` and the item detail components), the duplicate path for classroom items (the `classroom_duplicate_item` function, by a new migration), `materials/**` only for the backfill export, `src/routes/dev/html-assignment*/**`, `tests/*html-assignment*`, `tests/db/*html-assignment*`, `tests/*classroom-duplicate*`, `tests/db/*classroom-duplicate*`, `tools/browser-verify/routes/html-assignment*.mjs`, the generated regions of `tools/browser-verify/README.md`, the connector schema regeneration if your migration requires it, one appended entry in `classroom-updates.json`, `docs/subsystems/html-assignments.md`, `docs/prompt-ledger/entries/0431-*`, `docs/feedback/2026-10-23/RESULTS-0431.md`, and your own `docs/history/` entry.
- Migration permitted: at most one, the next free number at landing. Claims: 0298
- Status: issued
- Mode: solo
- Branch: main (solo)
- Notes: in progress.
