# 0055 Full auto: a session applies its own migration and deploys its own work
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `tools/apply-migration.mjs` (new), `tools/deploy-probe.mjs`, the canned lane ending in `IDEA_instructions.md` with its REGISTER row, new decision entries, `supabase/roles/` (new), the migration paragraph in `CLAUDE.md`, `tests/apply-migration*`, `tests/workflows.test.ts`, `docs/prompt-ledger/entries/0055-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0180
- Status: pushed
- Branch: assigned by the harness
- Notes: Mr. Pina asked on 2026-09-05 for every remaining manual step to be
  automated. Two are left that a session could take: applying a migration,
  and merging `integration` into `main`.

  THE STANDING RULE IS NARROWER THAN IT LOOKS. What has always been forbidden
  is `SUPABASE_ACCESS_TOKEN` in a cloud environment, because
  `supabase db push` on this project replays EVERY migration from 0001
  including two one-time coin imports that would run again over live student
  balances. That rule is about one command and it stays. Applying a single
  named file with `psql` is a different act and is what this bundle enables.

  WHY A SCOPED ROLE IS THE WHOLE DESIGN. A role that can `alter table` on an
  existing table needs OWNERSHIP of it, and ownership carries `drop`. Grants
  cannot take that back. The guard has to be an event trigger that refuses
  destructive DDL from this role by name, so the worst case is a migration to
  reverse rather than student work to restore.

  IT COSTS NOTHING REAL. Across the last twenty migrations, top-level
  statements are: 90 revoke, 79 grant, 78 create-or-replace-function, 69
  drop-policy, 69 create-policy, 19 alter-table, 13 create-index, 11
  create-table, 2 insert-into-storage-buckets, 1 update. ZERO `drop table`,
  ZERO `truncate`. Every `delete` and almost every `update` is indented inside
  a function body and runs as the definer, not as the applier.

  WHAT STAYS MANUAL, DELIBERATELY: the decisions. Thirteen entries exist in
  `docs/decisions/`; Mr. Pina answered 12 and 13 on 2026-09-05 and refused the
  session's recommendation on 13. That is the part where a person is needed,
  not overhead to remove.

  Deliberately excluded: `.github/workflows/**`, ruled out as a path;
  `supabase db push`, forbidden and staying forbidden; and any credential
  this bundle could write down, since it holds none and must ask for none.
