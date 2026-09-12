# 02 Coin ledger: remove the test RLS policy
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: decided 2026-09-12. The DECISION is closed; the BUILD is open, see the Build line.
- Decision: 2026-09-12, Mr. Pina: remove it. Approved.
- Build: OPEN. Ledger 0174 does the work. The decision is no longer owed to him;
  the migration is owed to the feature.
- What the build settles first: the approval does NOT resolve the 2026-09-02 tree
  check below, and that check still stands. The tree does not identify which policy
  is meant: no policy on a coin table carries "test", "debug" or "temp" in its
  name, and the two permissive reads found are `read coin categories` (0070,
  `using (true)`, the price list) and `read coin contracts` (0077, `using (true)`),
  both commented as deliberate. So 0174 names the policy before it writes the
  migration, or reports that the premise has nothing behind it. An approval to
  remove a policy is not an instruction to guess which one.
- Default this assistant would pick: Remove it, in its own migration, with a `tests/db/` test that proves the policy is gone and nothing else changed; apply by hand with the notice pane read before the next statement.
- Why it is blocked on him: It is a migration against live coin data, and every migration here is applied by hand in the SQL editor.
- What it unblocks: A one-migration coin lane, and the confidence that every coin read is a policy somebody meant.
- Context: `supabase/migrations/0070_coin_economy.sql` onward; the coin policies are listed by `grep -n "create policy" supabase/migrations/*.sql | grep -i coin`.
- Tree check (2026-09-02): the tree does not identify which policy is meant. No policy on a coin table carries "test", "debug" or "temp" in its name across `supabase/migrations/`. The two permissive reads found are `read coin categories` (0070, `using (true)`, the price list) and `read coin contracts` (0077, `using (true)`), both commented as deliberate. The decision needs the policy named before the migration is written, or the premise withdrawn.
