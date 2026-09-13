# 0221 Remove the vercel.json ignoreCommand and land integration into main

- Issued: 2026-09-13
- By: router chat
- Owns: `vercel.json`, `docs/prompt-ledger/entries/0221-*`, its own `docs/history/`
  entry, and the merge commit of `origin/integration` into `main`. NO OTHER FILE.
- Migration permitted: no. **Claims: none.**
- Status: issued
- Branch: none. This bundle commits to `main` directly; it is the deploy.
- Notes: production has served `247dfc4` since 2026-09-12 while `main` moved twice
  past it. Vercel canceled both `9738f998` (empty) and `9b010f53` (a real merge
  with changes outside `materials/`) by Ignored Build Step. The `ignoreCommand`
  is removed rather than repaired; it is not re-added until the site is current
  and Mr. Pina asks for it.
