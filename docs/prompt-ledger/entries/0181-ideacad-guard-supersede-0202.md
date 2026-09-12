# 0181 IdeaCAD grant guard: 0206 supersedes 0202's apply-time check

- Issued: 2026-09-12T18:45:00Z
- By: router chat
- Owns: `supabase/migrations/0206_*.sql`,
  `tests/db/ideacad-grants-anon-execute-surface.test.ts`,
  `docs/prompt-ledger/entries/0181-*`, and its own `docs/history/` entry.
- Migration permitted: exactly one. Claims: 0206. Highest on origin/main at issue: 0203
- Status: pushed
- Branch: claude/confident-babbage-wr1umb (cut from origin/integration b0a8101d)
- Notes: UNBLOCKS LEDGER 0179. `0202`'s self-check pins the ideacad function count
  at exactly ten and requires every ideacad function to be executable by
  `authenticated`. Both were true of `0201`'s world and neither survives `0205`,
  which adds nine functions, two of them definer-only helpers that withhold the
  client grant on purpose. ANY future ideacad migration hits this. `0206` replaces
  the check rather than loosening it: the property worth keeping -- no ideacad
  function is executable by `anon` -- is swept BY PREFIX with no count ceiling,
  and the client-callable half is separated from the definer-only half by an
  EXPLICIT NAMED LIST. `0202`'s file is an applied record and is NOT edited. No
  file under `src/`. `0179`'s branch is read and merged into a scratch worktree to
  prove the fix; none of its files is touched.
