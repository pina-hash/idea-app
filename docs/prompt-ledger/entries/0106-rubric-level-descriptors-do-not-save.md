# 0106 An instructor edited a rubric twice and the level descriptions did not save

- Issued: 2026-09-09
- By: Mr. Pina, from a 2026-09-08 feedback report filed by William Cosso.
- Owns: `RubricBuilder.svelte`, `RubricView.svelte`, the `setRubric` export and the
  rubric read paths in `src/lib/classroom/transports.ts`, the rubric-reading region
  of `GradingConsole.svelte`, `src/routes/dev/grading-rubric/**`,
  `tests/classroom-rubric*`, `tests/dom/rubric*`, `tests/db/classroom-rubric*`,
  `tools/browser-verify/routes/grading-rubric*.mjs`, the generated regions in
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0106-*`, and its own
  `docs/history/` entry.
- Migration permitted: no. Claims: none.
- Lands on: `integration`, then `main` against the six-item checklist.
- Status: pushed
- Branch: `claude/rubric-descriptors-save-bug-4zg5hv`.
- Notes: reported on the IDEA209H Unit 1 final report and presentation. Mr. Cosso
  teaches Block 4 independently with no Claude access, so a fix requiring an
  undocumented judgment call from him is a defect rather than a workaround.
