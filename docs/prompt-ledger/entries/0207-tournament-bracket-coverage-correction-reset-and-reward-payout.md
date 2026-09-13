# 0207 Tournament bracket coverage, the correction reset, and the reward payout

- Issued: 2026-09-13T04:35Z
- By: router chat
- Owns: `supabase/migrations/0212_*.sql`, the tournament bracket and correction RPCs it touches, `src/lib/tournaments/RewardsPanel.svelte`, `src/lib/tournaments/RewardRulesEditor.svelte`, `tests/db/tournament-bracket*`, `tests/db/tournament-correction*`, `tests/dom/tournament-rewards*`, `docs/prompt-ledger/entries/0207-*`, `docs/history/busy-feynman-aupq55.md`
- Migration permitted: yes. Claims: 0212. Highest on origin/main at issue: 0211 (per `tools/migration-claims.mjs`; next free 0212)
- Status: pushed
- Branch: claude/busy-feynman-aupq55
- Notes: Fixes ledger 0202's findings; 0202 measured them and this bundle does
  not rediscover them. Three parts. ONE, real-SQL bracket coverage at 4, 5, 6, 8
  and 16 entries walked generation to grand final through the real RPCs,
  asserting match rows rather than a status string, with the odd field's bye
  proven present and visible. TWO, finding 3a: a correction is impossible once a
  downstream match starts and the refusal names a reset that does not exist;
  either the reset is built or the refusal is changed, and the decision is
  argued in the history entry. THREE, finding 6a, on Mr. Pina's answer of
  2026-09-13: MAKE IT PAY. `tournament_reward_ledger` reaches
  `coin_transactions`. Four standing rules hold: the debt lockout is
  `kind = 'purchase'` only so a winner in debt is still paid; entry never costs
  coins and the three refusing layers are not weakened; validate before charge,
  never after; `RewardsPanel.svelte` joins `COIN_SOURCES`. Grant shape is
  `0166`'s -- revoke from `public, anon, authenticated` BY NAME. Ledgers 0204,
  0205, 0206 and 0208 run alongside and none of their files are touched.
  BECAUSE IT CARRIES A MIGRATION IT STOPS AT ITS BRANCH AND DOES NOT MERGE TO
  `main`.
- Outcome: All three parts landed. 0212 is WRITTEN AND UNAPPLIED -- a session
  cannot reach the production database (`DEPLOY_PROBE_URL` and
  `IDEA_MIGRATION_URL` both unset, `.env` absent), so it is Mr. Pina's to paste.
  The suite is 1 failed / 8803 passed, and the one failure is
  `tests/db/migrations-applied-record.test.ts` reporting that 0212 has no record
  under `docs/migrations-applied/` -- which is TRUE and must stay true until the
  migration is applied. No record was fabricated. This is the first
  migration-carrying lane to meet ledger 0209's mechanism, which landed after
  this branch was cut; the collision is structural and is written up in the
  history entry. Does not merge to `main`.
