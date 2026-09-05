# 0039 Two classroom defects an instructor reported and nobody has touched
- Issued: 2026-09-04
- By: router chat for IDEA portal work
- Owns: the table block in `SpecRenderer.svelte`, `src/routes/classroom/[sectionId]/+layout.svelte`, the placement of `HallPass.svelte` and `SongQueue.svelte`, `src/routes/dev/spec-table/**`, `tests/classroom-spec-table*`, `tests/dom/spec-table*`, `tools/browser-verify/routes/spec-table*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0039-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0179
- Status: issued
- Branch: assigned by the harness
- Notes: Two reports left over from the September feedback sweep.

  ONE, and it is located. "When there are no rows, pressing add a row adds
  another beyond the minimum." In `SpecRenderer.svelte`, `ensureRows` creates
  `Math.max(block.minRows ?? 0, 1)` rows on first touch, and `addRow` calls
  `ensureRows` and THEN appends. So the first press on an untouched table
  materialises the minimum AND adds one, and a student who wanted one row
  gets two. Reported as a nuisance; it is really a student filling in a blank
  row that should not exist and then wondering whether it counts.

  TWO. The hall pass and the music queue live in the section layout rather
  than under the class's items, so an instructor looking at a class sees them
  detached from everything else about that class. This is a placement
  question, not a behaviour one.

  Deliberately excluded: the hall pass LIMITS, which prompt 0016 built and
  prompt 0036 has just proved correct against a moved clock; anything in
  `0174`; and the Matrix theme, which is its own conversation.
