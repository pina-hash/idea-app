# 02 Coin ledger: remove the test RLS policy
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: closed 2026-09-12 (prompt 0174, `claude/wonderful-goldberg-wwotxa`).
  ANSWERED yes, and then WITHDRAWN on the audit that answer required: there is
  nothing to remove. No migration was written and `0204` was released unused.
- Decision: Mr. Pina approved removing the policy on 2026-09-12. The prompt that
  carried the approval required the policy to be FOUND and named before the
  migration was written, and it is not there. Audited against a real Postgres
  carrying the whole chain -- 201 migration files, `pg_policies` read after the
  last of them, not a grep over migration text:

  * `coin_transactions`, the ledger, has RLS enabled and **exactly one policy**:
    `read own or admin coin transactions`, created by `0070` at line 343, `for
    select to authenticated using ((student_email = current_user_email()) or
    is_admin())`, with no `with check` and no non-SELECT policy of any kind. That
    is the own-row-or-admin read this schema is built on, not a test policy.
  * **Sixteen coin tables, fifteen policies, one per table**, every one SELECT and
    every one to `authenticated` alone. `coin_public_id_secret` is the sixteenth
    and deliberately carries none, which is how a table with RLS on denies every
    client.
  * **No coin policy is test-shaped.** Word-bounded search for
    test/debug/temp/tmp/todo/scratch over every policy name on a coin table: zero.
    The unanchored spelling reports two hits, `gauntlet_speedrun_attempts` and
    `greenline_track_attempts`, both because `temp` matches `attempts` -- neither
    is a coin table and neither is a finding.
  * **No coin policy admits `anon` or `public`.** The public ledger at `/coins` is
    served by anon-granted RPCs that project the address away inside the database
    (`0089` through `0157`), never by a policy.
  * The only two `using (true)` coin reads are `read coin categories` (`0070`, the
    price list) and `read coin contracts` (`0077`), both to `authenticated`, both
    commented as deliberate in the same breath as "no insert/update/delete
    policies", and neither is the ledger. That is exactly what the 2026-09-02 tree
    check found by grep, now confirmed against the catalog.

  So the premise is withdrawn rather than the work deferred. What the bundle shipped
  instead is `tests/db/coin-ledger-policy.test.ts`, which re-derives all of the above
  from `pg_policies` on every suite run and plants a permissive policy against each of
  its absence sweeps -- because this audit had already been done by hand twice, on
  2026-09-02 and again on 2026-09-12, and a third hand audit is the failure mode.
  `docs/history/wonderful-goldberg-wwotxa.md` carries the measurements.

  **Nothing below this line is rewritten.** It is the reasoning as it stood while the
  entry was open, including the tree check that already doubted the premise.
- Default this assistant would pick: Remove it, in its own migration, with a `tests/db/` test that proves the policy is gone and nothing else changed; apply by hand with the notice pane read before the next statement.
- Why it is blocked on him: It is a migration against live coin data, and every migration here is applied by hand in the SQL editor.
- What it unblocks: A one-migration coin lane, and the confidence that every coin read is a policy somebody meant.
- Context: `supabase/migrations/0070_coin_economy.sql` onward; the coin policies are listed by `grep -n "create policy" supabase/migrations/*.sql | grep -i coin`.
- Tree check (2026-09-02): the tree does not identify which policy is meant. No policy on a coin table carries "test", "debug" or "temp" in its name across `supabase/migrations/`. The two permissive reads found are `read coin categories` (0070, `using (true)`, the price list) and `read coin contracts` (0077, `using (true)`), both commented as deliberate. The decision needs the policy named before the migration is written, or the premise withdrawn.
