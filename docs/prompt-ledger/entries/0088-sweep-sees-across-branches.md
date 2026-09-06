# 0088 The sweep can see what a branch cannot, and it looks at neither
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `.github/workflows/integrate.yml`, `.github/workflows/README.md`, `tools/integrate-gate-proof.sh`, the duplicate permitted-line parser in `tools/apply-migration.mjs`, `tools/migration-claims.mjs`, `tests/workflows.test.ts`, `tests/migration-claims*`, `tests/apply-migration*`, `docs/prompt-ledger/entries/0088-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: pushed
- Branch: `claude/sweep-cross-branch-visibility-xo9yz1`
- Notes: Three findings from 2026-09-06 are one defect: a `claude/**` branch
  cannot see another `claude/**` branch, its CI cannot either, and the sweep
  that CAN see all of them checks nothing across them.
  
  ONE. Prompt 0084 wrote a sweep-time gate for `integrate.yml` that skips a
  branch holding a migration number another unmerged branch also holds, and
  could not build it because that file belonged to prompt 0075. The pasteable
  YAML is carried forward verbatim in
  `docs/history/number-allocation-standards-oe4utb.md`. 0084 noted it must
  fail toward MERGING, the opposite of `ledger_gate`, so a broken read cannot
  stall the queue, and that it cannot be a test because no branch's CI can
  see another branch.
  
  TWO, and nobody was looking for it. Prompt 0087 found that both lanes
  editing `IDEA_instructions.md` bumped the header to the IDENTICAL string
  `**Version 4.21 - 2026-09-06**`, so git took it silently and merged two
  different 4.21s without a conflict. A version collision is invisible to a
  merge precisely because both sides write the same text. The standards
  version test cannot catch it either: it compares a file's header to its own
  changelog, and both sides were internally consistent.
  
  THREE. `tools/apply-migration.mjs` landed on `main` after 0084's branch was
  cut, and now carries a SECOND parser of the `Migration permitted:` line
  beside `parsePermitted` in `migration-claims.mjs`. Two parsers of one
  format written by two lanes that could not see each other, which is the
  same blindness one file over. Prompt 0087 reported it and correctly did not
  touch it.
  
  Prompt 0075 established the general shape: 47 tests in this repository
  relate two or more files, and any of them can be defeated by two branches
  each touching one. Its answer was to run the suite on the merged tree. This
  is the other half: check what only the sweep can see, BEFORE the merge.
  
  Deliberately excluded: `src/**`; `docs/standards/**`, settled by 0087; and
  the merged-tree suite, which 0075 built and which is on `main`.
