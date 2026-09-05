# retro-01 Mirror IDEA_CLAUDE_DESIGN_STANDARDS.md 2.1 into docs/standards/
- Issued: 2026-08-31 ~21:05 UTC
- By: Cowork session "Claude computer use demo"
- Owns: `docs/standards/IDEA_CLAUDE_DESIGN_STANDARDS.md` and `docs/standards/REGISTER.md`
- Migration permitted: no. Highest on origin/main at issue: 0169
- Status: deployed
- Branch: `claude/design-standards-2-1-45w3r5` at `45bf4b0`
- Notes: Recorded retroactively, after the ledger existed, so its Issued time is
  approximate. Kept as the first entry because a format proven on one real case beats a
  format proven on none.

  The work: `IDEA_CLAUDE_DESIGN_STANDARDS.md` had sat in project knowledge at 2.1 since
  2026-08-27 and had never been mirrored, so the freshness authority served 2.0 for four
  days while every chat read 2.1. The 2.1 copy also carried no 2.1 changelog entry, which
  is the exact condition `tests/standards-version-header.test.ts` refuses, so it could not
  have been mirrored as it stood even if somebody had remembered to. The entry was
  reconstructed from the diff between the two copies and the file rebuilt from the
  byte-exact mirror base rather than from the project-knowledge transcription.

  Confirmed deployed by fetching
  `https://raw.githubusercontent.com/pina-hash/idea-app/main/docs/standards/IDEA_CLAUDE_DESIGN_STANDARDS.md`
  and matching sha256 `6ff6ec36...b09d51b` against the delivered file, not by the merge.
