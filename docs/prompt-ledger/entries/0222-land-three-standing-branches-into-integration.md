# 0222 Land three standing branches into integration and regenerate the counts block

- Issued: 2026-09-13
- By: router chat
- Owns: the merge of three named branches into `origin/integration`, the conflict
  resolutions those merges require, one regeneration of the generated counts block in
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0222-*`, and its own
  `docs/history/` entry. NO OTHER FILE. No source, test or migration is edited to make
  a merge work.
- Migration permitted: no. **Claims: none.** Highest on origin/main at issue: 0211
- Status: issued
- Branch: `claude/blissful-bohr-79y23g`, branched from `origin/integration` at `709827d7`
- Notes: lands `claude/sharp-einstein-cqrnx6` (ledger 0212, migration file 0213),
  `claude/busy-feynman-aupq55` (ledger 0207, file 0212) and
  `claude/youthful-lovelace-kg9482` (ledger 0218, file 0214), in that order. It carries
  the three migration FILES only; all three are reported APPLIED to production by
  Mr. Pina, and no database connection was attempted from this container.
  `claude/keen-davinci-xvhwdw` was deliberately untouched.

  **Two claims in the prompt were wrong and the tree won.** It said none of the three
  branches had ANY CI run on its tip; all three do, and all three concluded FAILURE --
  the reason `integrate.yml` never merged them is a RED run, not an absent one. It also
  said the bundle changes no route spec; `youthful-lovelace` adds two, which is why the
  static half of the counts block conflicted as well as the measured half.

  **`docs/migrations-applied/` still stops at 0211.** No record was written for 0212,
  0213 or 0214, deliberately: `tools/record-applied.mjs` writes from Mr. Pina's own
  verification output and never from a session's belief. That gap is a finding, and
  whether it may pass gate 4 is his decision, not this session's.
