# 0084 Five number collisions in one day, and the claim arrives after the work
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `docs/prompt-ledger/README.md`, the `Migration permitted` line format across ledger entries, `tools/migration-claims.mjs` (new), `tests/migration-claims*` (new), the contiguity assertion in `tests/db/migration-0177-tombstone.test.ts`, the migration-number clause of `IDEA_instructions.md` with its REGISTER row, `docs/prompt-ledger/entries/0084-*`, and its own `docs/history/` entry.
- Migration permitted: no, deliberately. Claims: none. Highest on origin/main at issue: 0185
- Status: pushed
- Branch: `claude/number-allocation-ledger-c30ms5`
- Notes: On 2026-09-05 and 2026-09-06 the same defect fired five times.
  
    two decision entries numbered 15
    two migrations claiming 0146
    prompt 0074 pasted to two sessions ten seconds apart
    prompt 0075, 0076 and 0077 each taken by a session while the router
      chat held them unpushed
    two migrations numbered 0186, on `maps-media-bucket-he0wnn` and
      `instructor-requests-surfaces-j2dfjc`
  
  Every session verified correctly. `ls`, `git ls-tree` over every ref and
  `git log --all --diff-filter=A` all answer truthfully about the past and
  say nothing about what is in flight. Prompt 0069 stated the rule after its
  renumber: **a number for a new migration is not a fact this repository can
  answer; it is allocation, and allocation needs an allocator.**
  
  For prompt numbers the allocator is the router chat and that is now how it
  works: numbers are stated in the prompt, never derived.
  
  Migrations are different, because the number is chosen by the SESSION at
  commit time, after the work is written, which is the worst possible moment.
  The repository already has the mechanism to shrink that window and does not
  use it: a bundle's FIRST commit is its ledger entry, pushed alone, before
  anything else. That commit could carry the claim.
  
  It would not close the window -- the 0074 race was ten seconds -- but four
  of the five collisions were minutes or hours apart, and a claim pushed
  before the work is a claim the next session can see.
  
  Prompt 0069's renumber also left the right shape behind: the contiguity
  test now reports holes at 186 and 187, both belonging to lanes in flight,
  and it declined both to merge them in and to loosen the assertion. A test
  that distinguishes "a number a landed migration skipped" from "a number a
  branch is holding" would have told it so rather than leaving it to argue.
  
  Deliberately excluded: `.github/workflows/**`, which prompt 0075 holds; and
  claiming any migration number, which this bundle must not do.
