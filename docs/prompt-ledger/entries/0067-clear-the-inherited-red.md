# 0067 Four tests have been red on integration for a day and five sessions have each paid to prove it
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `tools/browser-verify/README.md`, `docs/GAUNTLET.md`, `tools/gauntlet-doc-check.mjs`, `tests/gauntlet-doc*`, `docs/prompt-ledger/entries/0067-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0184
- Status: pushed
- Branch: `claude/four-red-integration-tests-62a7ba`
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
- Outcome: All four cleared; `npm test` is 290 files / 5,927 tests / 0 failures
  and `svelte-check` is 0 errors / 37 warnings (31/5/1). No migration, no
  database connection, nothing under `src/` touched.

  **THE ACCOUNT OF THE COUNTS HALF ABOVE IS WRONG AND THE TREE WAS BELIEVED
  INSTEAD.** It is not three `themes*` specs: all three of those were already
  in the committed `covered` array. It is NINE specs from three branches --
  `composer-draft.mjs` (`16f9b89`), seven `greenline-portal*` (`f43e589`) and
  `upload-limits.mjs` (`ca18cd7`) -- covered 107 against a tree of 116. One
  full `npm run verify:readme` took it to 116 with the unmeasured set empty,
  and the nine measured for the first time produced NO new outside-threshold
  row: 2 before and 2 after, the same two `/dev/notebook` `tap-reach` rows.

  The `gauntlet-doc` half was a STALE DOCUMENT, not a check that started
  lying. `7d848d7` added `0184` with no row in the post-`0027` table; the row
  is now there and removing it again reddens the same two assertions with the
  same claim.

  **BUT NO COMMIT CAUSED IT.** The check (`74be202`) and `0184` (`7d848d7`)
  were written 42 minutes apart on sibling branches off one merge base,
  neither containing the other, each honestly green on its own tree. The
  failure exists only on the merge `5877f19` and on neither parent, so no
  branch-scoped gate could have seen it. `integrate.yml` regenerates the
  static counts region on the merged tree and runs no suite there; the daily
  `0 8 * * *` CI run against `integration` is the control that caught it,
  about ten and a half hours later, which is the window the five sessions
  paid in. Moving that gate to the merge is a real follow-up and is
  deliberately not done here: `.github/workflows/integrate.yml` is outside
  this bundle's ownership.
