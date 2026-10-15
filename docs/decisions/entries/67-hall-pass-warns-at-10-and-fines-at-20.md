# 67 A hall pass warns at 10 minutes and fines at 20

- Raised: 2026-10-14  By: Mr. Pina, in the IDEA Coin V2 specification (ledger 0384).
- Status: DECIDED 2026-10-14 by Mr. Pina: "a logged warning if it goes over 10" and an automatic fine at "at least 20 minutes".
- Decision: A hall pass that lasts 10 minutes or more is marked with one logged warning, which costs nothing. A pass that lasts 20 minutes or more posts one automatic `long_bathroom_break` fine at that category's current amount. Both happen at most once per pass. Duration is `least(closed - opened, the section's auto check-in cap)`, so a class whose auto check-in is below the fine threshold can never fine (the Coin Desk settings page says so). A pass an instructor opened or closed is never warned or fined. A pass that began before the change shipped is never judged. Both thresholds are settings on `/coin-desk/settings`.
- Supersedes: 0143's header and `src/lib/classroom/hall-pass.ts`, which said a pass has no coin link and shows no warning at any duration.
- Built as: `supabase/migrations/0243_coin_v2_hall_pass_fine.sql` (`_classroom_hall_pass_check`, checked on the sweep, both close paths and the state read; idempotent by the `(pass_id, kind)` key of `classroom_hall_pass_events`). The automatic fine's actor is `system`, never the classmate whose page load ran the check.
- Context: `docs/coin-economy/IDEA_COIN_V2.md`; CLAUDE.md "THE HALL PASS IS A TIME BUDGET".
