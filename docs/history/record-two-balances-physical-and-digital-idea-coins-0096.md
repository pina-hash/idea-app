---
title: "Two balances: physical and digital IDEA Coins (`0096`)"
date: 2026-08-13
branches: []
migrations: ["0079", "0096"]
subsystems: ["IDEA Coin economy"]
record_order: 11
---

## Two balances: physical and digital IDEA Coins (`0096`)

Migration `0096_coin_medium.sql` (apply manually after `0095`). The economy
tracks TWO balances per student instead of one, with exactly one path between
them.

### The model, and why the single balance was always the digital one

**Physical coins are the PRIMARY system.** Thousands exist and are handed to
students in class. The digital balance was added LATER so an absent student
could still be awarded, and could then either withdraw physical coins or spend
the digital balance directly. So the one balance `0070` shipped is really the
DIGITAL one, and physical coins stopped being tracked the moment they left the
tin -- which is the gap this closes.

**CONVERSION IS ONE WAY: DIGITAL -> PHYSICAL.** A payout is the only path, and
there is deliberately NO deposit path from physical back into digital.

### Medium is per TRANSACTION, never per category

The load-bearing modelling decision, and the REAL legacy data settles it -- the
same category appears under both media, repeatedly: **Weekly Wage 34 physical /
9 digital, Contract Completion 8 / 5, Above and Beyond 15 / 1.** A student who
was in class got handed coins; a student who was absent got a digital credit
for the same reason on the same day. So `medium` cannot live on
`coin_categories`, and every logging RPC takes `p_medium`.

**It defaults to `'physical'`**, because physical is the primary system and
digital is the exception. The COLUMN default is `'digital'` instead, and that
is not a contradiction: the column default only ever applies to a RAW insert
naming its own column list, which in this schema is exactly one path --
`0084`'s `coin_admin_import_legacy`, whose rows are legacy history from the era
when the single balance meant digital. Live logging never reaches it
(`_coin_insert` always passes a medium explicitly).

- **Backfill:** every pre-0096 row is set to `'digital'`, a restatement of what
  those rows already meant. The migration `raise notice`s the count of
  backfilled rows that are NEITHER `legacy_*` NOR one of the three legacy
  eating-pass refunds -- real post-import `/coin-desk` activity, some of which
  was very likely a physical hand-over the schema had no way to say. Nothing in
  the data distinguishes them, so it reports rather than guesses: **review
  those by hand after applying.**
- `transfer_id` (nullable uuid) links the two halves of a payout.

### ONE balance derivation, called by everything

There were **seventeen inline `sum(amount)` copies** of the old balance
scattered through function bodies, plus the `coin_balances` view, a second
TypeScript implementation in `coin-balance.ts`, a direct view read in
`PayoutManager`, and a stored scalar in the dev fake ledger. Every one is now a
call to `_coin_balance(email, medium)` (`p_medium` null = the total), so a
future change to how a balance derives has exactly one place to happen. No
grant -- the `_coin_` internal-helper convention.

`coin_balances` gains `physical_balance` / `digital_balance`; **`balance`
keeps its name and becomes the TOTAL**, which is the honest reading and what
every existing reader should now see. `sumBalance` in `coin-balance.ts` is a
thin wrapper over the new `sumBalances`, so the two cannot disagree; a row with
no `medium` counts as digital, matching the backfill.

### THE SIGNATURE TRAP: every RPC gaining `p_medium` is DROPPED first

Adding a parameter changes a function's REAL signature even with a default, so
`create or replace` would CREATE A SECOND OVERLOAD and leave the old arity
callable beside it. That is not merely stale: **two overloads differing only by
a defaulted trailing parameter make PostgREST unable to resolve the call AT
ALL**, so a surviving old arity BREAKS THE CLIENT rather than quietly serving
it. Eleven functions are `drop function`ed against their exact current argument
types first (the `0076` precedent, which learned it from `0058`). Demonstrated
live: removing one drop in a mutation check reddened both the signature
assertion AND a real logging call.

**DEPLOY ORDERING, stated in the migration header too: apply `0096` by hand in
the Supabase SQL editor BEFORE deploying any client that names `p_medium`.**
The drops mean the old arities stop existing the moment it runs and the new
ones do not exist until it does, so a client shipped ahead of the migration
fails every coin write.

### Per-medium debt lockout

A DIGITAL purchase is blocked while the digital balance is already negative; a
PHYSICAL purchase while the physical one is. Same already-negative semantics as
before, applied to the balance the purchase actually spends -- so **a student in
digital debt can still spend physical coins they are holding**, which is the
whole reason these are two balances. Fines and adjustments still apply past zero
with no cap. The refusal carries `medium`, and the UI says which balance is
locked and that the other is unaffected. `DebtPaymentPanel` offers whichever
media are actually in debt (preselecting the deeper one) and credits only that
one -- paying the healthy balance would leave the lockout in place.

### Payout is the ONE transfer

`coin_payout_student` debits digital and credits physical by the same amount,
atomically, as **TWO LINKED ROWS sharing one `transfer_id`** -- deliberately not
one special-cased row, which is what keeps balance derivation a plain per-medium
sum with no exceptions. The TOTAL is unchanged by a payout: the coins did not go
anywhere, they changed form.

- The physical half is a new `payout_physical_credit` category: kind
  `adjustment` (no new money enters the economy), `loggable = false` so it is
  SYSTEM-ONLY -- hand-logging one would mint physical coins from nothing, which
  is exactly the deposit path this model does not have.
- **Both rows go through `_coin_insert` directly, not `coin_log_transaction`** --
  the second deliberate exception to "every write funnels through the logging
  RPCs" (`0084`'s historical import being the first). A transfer is not a PRICED
  EVENT: no category price to look up, no cap, no Eating Pass logic, and the debt
  lockout is moot (digital is positive by the guard and must not be blocked by a
  negative physical balance). The row shape still lives in one place.
- `p_amount` is optional; null pays the FULL digital balance (the pre-0096
  behaviour). A partial payout takes any amount up to it; over it is a structured
  `amount_exceeds_digital` refusal.
- Roster and refusal logic are `0079`'s, **retargeted from the total balance to
  the digital one**: a student holding only physical coins has nothing to pay out
  and must not appear (filtering on the total would offer to "pay" coins already
  in their hand). `PayoutManager` filters and orders on `digital_balance`.

### `physical_coin_submission` is re-scoped, NOT retired

It reads like the missing physical -> digital path and must not become one. Its
real meaning is an admin CORRECTION OF THE PHYSICAL RECORD -- "credit physical
coins this student demonstrably holds that the ledger is missing" -- so
`coin_log_transaction` FORCES it to `'physical'` regardless of what a caller
passes, and the entry form offers no choice, stating the rule instead of
presenting one that would be ignored.

### Bulk logging: a run-level medium plus per-student overrides

`coin_bulk_log_section` and `coin_bulk_log_role_stipend` take `p_medium` plus a
`p_medium_overrides` jsonb map keyed by lowercased email. The workflow this
exists for: a section's Weekly Wage is ONE physical pass with the two absent
students flipped to digital before submitting -- one round trip, not a physical
run followed by two single-student digital entries. `_coin_normalize_media` is
the one resolver both share. An override email NOT on the roster comes back as
`unmatched_overrides` rather than being silently dropped (a typo there would
otherwise pay the right student the wrong way with nothing to notice); a bad
override VALUE fails the whole run rather than guessing.

### The Ledger keeps working, unedited -- SUPERSEDED BY THE DISPLAY PASS (`0103`)

**Everything in this sub-section describes the INTERIM state `0096` left the
page in, and the "known consequence" flagged below is the bug the display pass
then fixed.** `Bank Balance` no longer carries the digital figure (the page
reads explicit `Physical Balance` / `Digital Balance` columns), a payout is one
collapsed row rather than two, and transfers are out of `awarded` and `spent`.
See "The coin display layer" below for what actually runs.

`0096` deliberately does not touch `static/coins/index.html`. It recomputes its
own figures client-side from CSV columns, and renders `Bank Balance` only when
the value parses as a POSITIVE number -- a slot `0089` served EMPTY because the
economy had one balance and nothing to put there. It has one now:

- **`Coin Balance` <- the TOTAL**, **`Bank Balance` <- the DIGITAL balance**,
  which lights up that already-wired slot with no page edit.
- The identity the page's own arithmetic relies on still holds: `awarded` is
  every positive row and `fines + spent` every negative one, so
  `awarded - fines - spent` is still exactly the total, payout transfer rows
  included. **Known consequence, for the display pass:** a payout's debit counts
  into `spent` and its credit into `awarded`, so a student who has withdrawn
  coins has both totals inflated by the amount that merely changed form.
- `coin_public_transactions` and `coin_public_student` gained `medium` so the
  display pass needs no migration of its own; the CSV shape in
  `src/lib/server/coin-public.ts` is unchanged. **The `0089` ABSOLUTE RULE is
  untouched:** no email, in any form, through any parameter or field -- a medium
  is `'physical'` or `'digital'`.

### Deliberately left at the default

`coin_admin_complete_contract` (`0077`) calls `coin_log_transaction`
positionally with five arguments, so a contract payout lands `'physical'` by
default. Giving it its own `p_medium` would mean another signature change and a
`ContractsManager` update -- real scope this pass did not take on. Worth doing
when contract payouts for absent students become a real complaint.

### Verified

- **`tests/coin-medium.test.ts` (39 assertions)**, on real embedded Postgres.
  **The chain is applied in TWO HALVES on purpose** (the `0085`/`0095`
  migration-over-real-data shape): everything up to `0089` first, real pre-0096
  activity logged through the REAL five-argument `0087` RPC, and only then
  `0096` over the top -- the only way to assert what the backfill did to rows
  that already existed. Covers per-medium derivation agreeing between the lookup
  RPC and the view; medium defaulting and explicit selection through the generic
  logger AND each of the five formula RPCs (ten rows, five per medium); the
  payout transfer moving both balances by the same amount with the total
  unchanged, as two rows sharing a transfer id, plus partial, full, over-balance
  and physical-only cases; the bulk roster being positive DIGITAL rather than
  positive totals; the per-medium lockout blocking only the matching medium
  (including a NEGATIVE TOTAL not blocking a healthy medium); forced
  `physical_coin_submission`; `payout_physical_credit` refusing to be
  hand-logged; bulk overrides incl. unmatched reporting and a bad value; and
  **that exactly one signature survives for each of the eleven re-signed
  functions**.
- **MUTATION-CHECKED FOUR WAYS, all in the permissive direction:** the debt
  lockout reading the total reddens 2; dropping the payout's physical credit
  reddens 4; not forcing `physical_coin_submission` reddens 1; and leaving the
  old `coin_log_transaction` arity callable reddens 2 -- including a real
  five-argument call, which is the trap demonstrated rather than argued.
  Migration restored byte-identical (md5-checked) and re-verified green each
  time.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **566/566 across 25 files** (was 527/24). One run of three flaked on the
  documented embedded-Postgres startup contention; two consecutive clean runs
  followed.
- **Browser-verified** in `/dev/coin-desk` (the fake ledger reworked to DERIVE
  both balances from its transaction list rather than keep a stored scalar --
  the same hazard the real schema avoids): the summary rendering total 12i&cent;
  = physical 20 + digital -8; the debt panel scoping to the digital debt alone
  with no medium toggle and a prefilled 8; **the decisive pair -- the same Song
  Request purchase REFUSED on digital with the per-medium message and nothing
  written, then SUCCEEDING on physical (20 -> 17) with digital untouched**;
  Physical Coin Submission offering zero toggle buttons, stating the rule, and
  landing physical; a section Weekly Wage run logged as physical with one
  student flipped to digital in ONE pass (`debt.student digital +1`,
  `healthy.student physical +1`); a per-medium adjustment moving digital
  145 -> 120 with physical untouched; and, on the payout list, **`debt.student`
  correctly ABSENT despite a positive TOTAL of 20i&cent;** -- the discriminator
  between filtering on total and on digital.
- **The payout transfer, measured in the browser:** a partial payout of 10
  moved physical 16 -> 26 and digital 26 -> 16 with the **total held at 42**,
  labelled "(partial)"; a following full payout drained the rest, and the
  student's history shows both payouts as PAIRS (`Coin Payout` -16 digital
  beside `Coin Payout (physical credit)` +16 physical).
- **The Ledger page, unedited, in `/dev/coins`:** the summary CSV keeps its
  exact 12 headers with `Bank Balance` now carrying the digital figure; Ada's
  drawer reads **`Coin Balance 155 i¢` and `Bank Bal 35 i¢`** where that stat
  was previously absent; Grace (digital -80) correctly shows NO Bank Bal row and
  her Debt instead, the positive-value guard behaving as documented; zero
  console errors across all three drawers. `/dev/coin-balance` renders the split
  through the REAL `sumBalances`, and `/dev/coin-preview` shows it with **0
  buttons on the entire page**, the read-only guarantee intact.
- **A REAL BUG the browser found and `svelte-check` could not:** the payout
  row's partial-amount box is `<input type="number">`, and `bind:value` COERCES
  to a number -- so `.trim()` threw an unhandled rejection and left the Pay
  button stuck on "Paying…" with nothing on screen. **This is the third time
  this codebase has hit that trap** (ReviewConsole's unit field, Classroom's
  points field); the state is typed `string | number` now and the call is
  wrapped so a throw can never strand the row.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0096` has never been applied anywhere. Apply it by
  hand after `0095`, **read the backfill's `REVIEW BY HAND` notice and check
  those rows**, and spot-check with two real accounts that a digital debt does
  not block a physical purchase and that a payout leaves the total unchanged.

