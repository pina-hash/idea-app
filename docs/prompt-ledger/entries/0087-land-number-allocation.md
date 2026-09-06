# 0087 The number-allocation bundle, blocked on a standards conflict
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `docs/standards/IDEA_instructions.md` and its `REGISTER.md` row, `docs/prompt-ledger/README.md`, the claim-line format across ledger entries, `tools/migration-claims.mjs`, `tests/migration-claims*`, the contiguity assertion in `tests/db/migration-0177-tombstone.test.ts`, `docs/prompt-ledger/entries/0087-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0189
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0084 built the migration-claim tool and the contiguity fix
  that tells a number a branch is holding from a number nothing accounts
  for. Prompt 0085 could not land it: it conflicts on
  `docs/standards/IDEA_instructions.md`, outside the permitted resolution
  set, so it correctly aborted and left the branch standing.
  
  0084's own accounting is worth keeping and this bundle must not inflate
  it. It prevents TWO of the six collisions, not all of them: `0187`
  outright, because that claim sat in git for 29 minutes and the tool answers
  in 0.27 seconds; and `0186` only because the number came from the prompt,
  since all three of those first commits landed sixteen seconds apart and no
  claim mechanism separates those. Two of the six were prompt numbers rather
  than migration numbers and this touches neither.
  
  It also corrected three things: the ten-second interval belongs to `0075`
  rather than `0074`, which was three seconds; `0186` was a three-way, not a
  pair; and `0076` shows no rival anywhere in git, which is itself the shape
  of the problem.
  
  0084 left a sweep-time change for `integrate.yml`, written out as pasteable
  YAML in its history entry, which prompt 0075's file owns. That stays
  unbuilt here.
  
  Deliberately excluded: `.github/workflows/**`; and any claim on a migration
  number, which this bundle must not make.
