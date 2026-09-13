# 0204 The production deploy is throttled, and nothing in the repo knows it

- Issued: 2026-09-13T04:10Z
- By: router chat
- Owns: `docs/audits/2026-09-13-vercel-deploy-throttle.md`, `docs/migrations-applied/0211-*`, `supabase/data/0203-ideacad-realtime-verification.sql`, `vercel.json`, `docs/prompt-ledger/entries/0204-*`, and its own `docs/history/` entry. NO FILE UNDER `src/`.
- Migration permitted: no. Claims: none. Highest landed at issue: 0211 (per `tools/migration-claims.mjs`; next free 0212)
- Status: pushed
- Branch: claude/beautiful-archimedes-a3lqme
- Notes: FOUR THINGS, one cause. (1) Production serves `247dfc4` = ledger 0188's
  merge of 2026-09-12 21:22Z while `main` has gone on to `85543209` and
  `ee4a1c42`; the Vercel check reads `Deployment rate limited` beside a green
  `CI / test`, and Deployment Storage is at 262.5 GB of 10 GB on a Hobby account
  that pauses rather than bills. Write the audit: what is throttled (deploying),
  what is not (serving), and the three independent causes. (2) `0211` is applied
  and has no record; write it with `tools/record-applied.mjs`, saying on its face
  that part B proved existence and ACL and that part C never ran a comparison.
  (3) Part C of the verification file reported through `raise notice`, which the
  Supabase SQL editor does not display, so a correct run and a skipped one looked
  identical; rewrite it to RETURN ROWS. (4) Part C has never tested anything
  because `ideacad_documents` holds zero rows in production, which it does
  because the surfaces that create one are in `ee4a1c42` and production serves
  `247dfc4` -- the clearest evidence of what the throttle costs.
  MEASUREMENT CORRECTED THE PROMPT: the seven-commits-in-one-day case is
  `Shop Trophy: Presentation and Defense` (r1/r1/r1/r2/r3/r4/r5 on 2026-09-09),
  not `IDEA-BLADE` r3-r9, and the real shape is worse -- three of the seven are
  the same revision pushed seconds apart. `vercel.json` DOES support the fix:
  `ignoreCommand`, confirmed against the published schema the file already
  declares. `0211` is applied, so the six-item checklist applies and this may
  merge to `main` -- which only queues behind the throttle and reaches no
  student.
