# 0150 IDEA100 blade image order, caption identity, and the template route

- Issued: 2026-09-11
- By: router chat
- Owns: `src/lib/legacy/assignments/idea100-blade-01.html`, `src/lib/legacy/index.ts`,
  `tests/legacy-assignments*`, `docs/prompt-ledger/entries/0150-*`, and its own
  `docs/history/` entry
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0198
- Status: pushed
- Branch: claude/quirky-euler-w4qqzt
- Notes: THIS FILE IS LIVE -- IDEA100 students are working in it and their answers are in
  `localStorage` keyed to it, so `STORAGE_KEY` does not move, nothing is restructured and
  nothing is reformatted. Two surgical fixes in the assignment (image order after decode,
  and a caption or delete landing on the wrong row when two copies of one picture share a
  `dataUrl`), both already written and proved in `_TEMPLATE.html` by ledger 0137 and
  transcribed here rather than re-derived. One line in `src/lib/legacy/index.ts` narrows
  the assignment glob to `./assignments/[!_]*.html` so `/assignments/_TEMPLATE` stops
  being a public page. Ledgers 0147, 0148 and 0149 run in parallel; none of their files
  are touched. `verify:readme` is deliberately not run: no route spec is added.
