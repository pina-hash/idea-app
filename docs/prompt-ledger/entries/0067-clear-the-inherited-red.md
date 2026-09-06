# 0067 Four tests have been red on integration for a day and five sessions have each paid to prove it
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `tools/browser-verify/README.md`, `docs/GAUNTLET.md`, `tools/gauntlet-doc-check.mjs`, `tests/gauntlet-doc*`, `docs/prompt-ledger/entries/0067-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0184
- Status: issued
- Branch: assigned by the harness
- Notes: `tests/derived-numbers.test.ts` fails two assertions and
  `tests/gauntlet-doc*` fails two more, on `origin/integration`, and both have
  been failing since 2026-09-05.

  Prompts 0061, 0062, 0063, 0065 and 0066 have each opened on this red suite,
  each spent part of an audit establishing the failures were inherited, and
  each correctly declined to fix them because the files were outside their
  ownership. Five diagnoses of the same two facts.

  The `derived-numbers` half is understood: three `themes*` route specs
  landed with the Matrix theme after the last browser-verify measurement, so
  the measured region covers fewer specs than the tree holds. Prompt 0046
  built that check deliberately and it is doing its job; clearing it needs a
  full `npm run verify:readme`, about six minutes and a browser, in a file no
  feature bundle owns.

  The `gauntlet-doc` half is NOT understood. Prompt 0060 built that check and
  left `docs/GAUNTLET.md` clean against the tree; something has moved since.
  Establish what before changing anything, because a document check that
  reddens is either a stale document or a check that has started lying, and
  those need opposite fixes.

  This bundle exists because a recurring cost paid by whoever comes next is
  invisible, and five payments is enough evidence.

  Deliberately excluded: the counts-block architecture, which prompt 0046
  settled; and every file either check reads but does not own.
