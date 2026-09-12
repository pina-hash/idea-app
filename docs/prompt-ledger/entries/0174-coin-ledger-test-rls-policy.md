# 0174 Coin ledger: remove the test RLS policy (decision 02)

- Issued: 2026-09-12T14:30Z
- By: router chat, on Mr. Pina's answer to decision 02 (coin-ledger-test-rls-policy) of 2026-09-12
- Owns: `supabase/migrations/0204_*.sql`, `tests/db/coin-ledger-policy*`,
  `docs/decisions/entries/02-*`, `docs/prompt-ledger/entries/0174-*`, and its own
  `docs/history/` entry. NO FILE UNDER `src/`.
- Migration permitted: exactly one, 0204. Highest on origin/main at issue: 0203.
  NONE WRITTEN: the audit the prompt required BEFORE the migration found the decision's
  premise names nothing that exists, so `0204` is RELEASED UNUSED and free for the next
  lane.
- Status: pushed
- Branch: `claude/wonderful-goldberg-wwotxa`
- Notes: The prompt's own grant was written in the form this ledger's README reads as a
  live claim, and that form is quoted in the body below rather than on the line above,
  because `tools/migration-claims.mjs` checks the explicit spelling FIRST and a quotation
  of it inside the permitted line holds the number regardless of what the rest of the
  sentence says. Measured: with the quotation on that line the tool reported `next free
  0205` and listed `0204` under CLAIMED, NOT LANDED; with it moved down here it reports
  `0204` free. A branch that lands no migration must not hold one.

  Deliberately excluded -- everything under `src/`, and every other file under
  `docs/decisions/entries/` (ledger 0173 owns those). Ledgers 0171, 0172 and 0173 ran in
  parallel; 0172 was already contained in `origin/integration` at branch time and 0173
  carried no entry on any ref, neither of which this lane acted on.

  The prompt's grant, verbatim: `Migration permitted: exactly one. Claims: 0204.`

  **The finding, since it is the whole of the bundle.** `coin_transactions` -- the
  coin ledger -- carries exactly ONE policy after the whole 201-file chain, and it is
  `read own or admin coin transactions` from `0070`: `for select to authenticated using
  ((student_email = current_user_email()) or is_admin())`, no `with check`, and no
  non-SELECT policy of any kind. There is no test, debug or temporary policy on that
  table or on any other coin table, and none admits `anon`. The entry's own
  `Tree check` line said as much by grep on 2026-09-02 and named the two outcomes left:
  the policy is named, or the premise is withdrawn. It is withdrawn.

  **What was shipped instead of `0204`.** `tests/db/coin-ledger-policy.test.ts`, which
  asks the CATALOG after the whole chain rather than grepping migration text, pins the
  ledger's policy field by field and the whole coin policy surface as a name-to-table
  map, and plants a permissive policy against each of its three absence sweeps. The
  audit was done by hand twice -- 2026-09-02 and 2026-09-12 -- and doing it a third time
  is the failure mode rather than the work.
