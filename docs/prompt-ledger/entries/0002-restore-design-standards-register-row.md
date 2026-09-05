# 0002 Restore the IDEA_CLAUDE_DESIGN_STANDARDS.md row in docs/standards/REGISTER.md
- Issued: 2026-09-01 01:45 UTC
- By: Cowork session "Claude computer use demo", lane 1
- Owns: `docs/standards/REGISTER.md`
- Migration permitted: no. Highest on origin/main at issue: 0169
- Status: deployed
- Branch: `claude/register-design-standards-update-k9xjw1` at `3c24243`, merged into integration as `930cee4`, deployed to main via PR #69
- Notes: One row. The register says 2.0 / 2026-08-25 while the file it names reads
  2.1 / 2026-08-27.

  **This is a repair of a silent revert, and the revert is the reason this ledger exists.**
  The row was corrected to 2.1 at `cda159f` on 2026-08-31 22:36 UTC by the design-standards
  mirror lane. At 2026-08-31 18:20 PDT a parallel claude.ai chat, "Centralized artifact
  storage with Google Drive", uploaded a whole `REGISTER.md` through the GitHub UI as
  `2cf9b94`, built from a base predating that correction, and the row went back to 2.0.
  Neither side could see the other. Twenty minutes later that same chat swept the standards
  set, found the row wrong, and delivered Mr. Pina a file to fix damage it had caused
  itself. Nothing detected it but a diff of the commit.

  So this prompt does NOT upload a prepared file. It fetches the row at HEAD and edits it in
  place, and halts if the row already reads 2.1. A whole-file upload is what caused the
  problem and would cause it again if that chat has pushed since.

  `2cf9b94` also carried real work that must survive: `IDEA_instructions.md` 4.15 and
  `IDEA_REFERENCE_LIBRARY.md` 4.3, which add Library C. Those rows are correct and are not
  to be touched.

  Deployed 2026-09-01 02:20 UTC. Confirmed by reconciling ALL SEVENTEEN register rows
  against the file each one names, fetched live from raw.githubusercontent.com at main:
  17 checked, 0 mismatched. The register and the directory now agree completely, which is
  the first time that has been measured in one pass rather than assumed.

  The session did the thing that mattered: it edited the row in place. The diff is one line
  in one file, and the IDEA_instructions.md 4.15 and IDEA_REFERENCE_LIBRARY.md 4.3 rows
  carrying the Library C work survived untouched, which is what would have been destroyed
  had it uploaded a prepared copy instead.
