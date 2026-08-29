---
title: "The legacy import, redone with media (`0100`)"
date: 2026-08-13
branches: []
migrations: ["0100"]
subsystems: ["IDEA Coin economy"]
record_order: 12
---

Migration `0100_coin_legacy_reimport.sql` (apply manually after `0099`). `0084`
imported the old Sheets ledger when the economy had ONE balance; `0096` made it
two. This is the same history re-imported with the medium dimension resolved.
**Applying the file changes no data**: it defines one RPC and corrects one read.
The fix lands only when the remediation runbook in its header is run by hand.

### What was wrong, and why the old check passed anyway

- **It digitized ~474i&cent; of physical coins.** The sheet always tracked two
  balances -- `Coin Balance` (everything the student has) and `Bank Balance`
  (the part held digitally, for a student who was not present to be handed
  coins). The single balance `0084` wrote is, in `0096`'s terms, the DIGITAL one
  (which is exactly what `0096`'s own backfill assumed when it set every
  pre-0096 row to `'digital'`), so every coin in a student's pocket became bank
  credit.
- **It destroyed 19i&cent; that had only changed form.** A `Payout` is a
  WITHDRAWAL -- all four in the real snapshot say so in their own Reason field
  ("Bank Balance Applied to Purchase") -- and `0084` signed it as a plain debit.
  The sheet's own arithmetic disagrees: **`Coin Balance = Awarded - Fines -
  Spent`, with Paid Out NOT subtracted** (verified across all 71 archived rows).
  Chavarria 12, Delgadillo 4, Veneziano 2, Cini 1.
- **THE VERIFICATION COULD NOT HAVE CAUGHT EITHER, and that is the lesson
  worth keeping.** `coin_admin_import_reconcile` expected `Awarded - Fines -
  Spent - Paid Out`, which is a restatement of the import's own sign rule, and
  the archived wizard's PREVIEW step used the same formula. Both sides of the
  check came from one assumption, so it reported a universal 0 diff while the
  assumption was wrong. **A check derived from the thing it checks cannot
  fail.**

### The corrected mapping

`digital` = the sheet's Bank Balance; `physical` = Coin Balance minus Bank
Balance. MEASURED against the committed archive: 66 of 71 students match on both
media with no overrides at all, all 71 with the External override.

```
Award         -> physical  +amount
Award - Held  -> digital   +amount      (what "held" meant: held in bank)
Fine          -> physical  -amount
Fine - Owed   -> physical  -amount
Purchase      -> physical  -amount
Payout        -> TRANSFER:  digital -amount, physical +amount
```

- **The payout transfer is what makes a bank-funded purchase come out right.**
  The sheet recorded one as two rows -- the Purchase and a Payout covering it --
  so physical is debited by the Purchase and credited straight back by the
  transfer, leaving digital down by the amount and physical unchanged. Netting
  the pair by hand would give the same two balances but would lose the fact that
  a withdrawal happened.
- **Written with `0096`'s transfer mechanism**: two linked rows sharing one
  `transfer_id`, carrying the same `transfer_id` / `transfer_amount` /
  `transfer_side` meta keys `coin_payout_student` writes, so a legacy withdrawal
  is indistinguishable IN SHAPE from a live payout and balance derivation stays
  a plain per-medium sum. The one deliberate difference is the CATEGORY: both
  halves land under `legacy_payout`, not the live `coin_payout` /
  `payout_physical_credit` pair, because the legacy category is the marker that
  keeps live rules out of legacy history.
- **Everything still imports under the four retired `legacy_*` categories**, so
  `0084`'s central guarantee is untouched: an old eating-pass purchase is a
  `legacy_purchase` row that `coin_eating_pass_active()` never sees, no cap
  counts a legacy row, and the per-medium debt lockout reads a BALANCE (which
  legacy rows legitimately build) rather than a category.
- **Naming `medium` explicitly is the point.** `0084`'s raw insert names its own
  column list and OMITS `medium`, so `0096`'s column default (`'digital'`)
  applies -- correct for those rows by construction, and the trap for these.
  Every insert in `0100` names it, for every row.

### The External override -- a human decision, taken as a parameter

Seven students sit in the sheet's `External` section; they were never in the
room to be handed coins, so their plain `Award` rows are DIGITAL. Nothing in the
data says that, which is exactly why it is `p_overrides`, a per-student
**per-type** map, rather than a branch in the function body. The migration's
header seeds the literal call. Two entries are inert and listed anyway:

- **Grant Becker is the edge case the map's SHAPE exists for.** Also External,
  but his one row is a 5i&cent; `Fine - Owed` that the sheet reads as PHYSICAL
  (Coin -5, Bank 0). A blanket per-student "External is digital" rule would have
  flipped it; because the map is keyed per student AND per type, his `Award`
  override matches no row and his fine stays physical.
- Araiza Basica has no transactions at all.

The response reports how many rows each override actually moved (7 in total, all
Awards), so an inert or mistyped entry is visible without failing the import. An
override naming a student the snapshot does not contain IS refused -- a typo
there would silently do nothing, which is the failure mode this whole migration
exists to correct.

### The RPC, and what it reuses

`coin_admin_reimport_legacy(p_batch_id, p_overrides)` follows `0084`'s
conventions exactly: `is_admin()`-gated, the SAME advisory lock key, one
transaction, historical `created_at`, `semester_key` from each row's own date,
original reason and type preserved in `note` and `meta`, batch-tagged.

- **It takes no mapping.** Nothing needs re-pulling or re-mapping: the verbatim
  snapshot is in `coin_import_batches.raw` and the 71 name-to-email mappings are
  in `coin_import_mappings`, which rollback deliberately never touches. So the
  mapping is READ from that table. (The batch's own `report.mappings` cannot be
  used -- rollback clears the report, and this RPC only ever runs on a
  rolled-back batch.)
- **It refuses unless the prior batch is already rolled back**
  (`batch_already_committed`, with the rollback call in the hint), and refuses
  while any other batch is committed.
- **`0084`'s rollback is reused, unchanged**, because the new rows carry the
  same three tags it keys on (`meta.import_batch`, `coin_contracts.import_batch`,
  `coin_students.source`). No second rollback exists.
- **`coin_admin_import_reconcile` is REDEFINED rather than joined by a sibling**
  -- one reconciliation, corrected, beats two where the wrong one is reachable.
  Same name and `(uuid)` signature, existing keys keep their meaning, per-medium
  columns added beside them. **Its expectation now comes from the sheet's own
  two balance columns**, which the import does not produce; the new
  `summary_column_mismatches` total keeps those columns honest by counting rows
  where `Coin Balance <> Awarded - Fines - Spent` (0 across the real archive).
  Run against a batch still committed by `0084`, it now correctly reports a
  mismatch for every student who ever held bank credit -- that is the signal to
  run the remediation, not a bug.

### REMEDIATION -- run by hand in the SQL editor, in this order

The exact statements are in the migration header. The wizard is retired and
archived and is NOT coming back (its PULL step read the deactivated Sheets
deployment), so these are SQL-editor operations.

1. **Remove the three legacy eating-pass refunds.** They were logged after the
   import through `coin_admin_adjust_balance`, so they carry no batch tag and
   rollback will not touch them; left in place they would survive and double.
   `select` them first (`category_id = 'balance_correction'` and a note starting
   `Legacy eating pass refund`), confirm exactly three, then **delete BY ID**.
   Matched on id, never note text, so the delete cannot widen. **No
   general-purpose delete RPC was added and none should be** -- the ledger is
   append-only apart from a batch-scoped rollback.
2. `coin_admin_rollback_import` on the committed batch.
3. `coin_admin_reimport_legacy` with the seven External overrides.
4. **Re-log the three refunds as DIGITAL** balance corrections (+40 Delgadillo,
   +50 Jette-Kouri, +50 Veneziano). All three passes were bought with physical
   coins; the refund lands digitally by decision -- a refund-only transition
   settles a balance rather than handing coins back across a desk.
5. `coin_admin_import_reconcile` -- requires `all_zero`, with
   `expected_physical_sum` 474 and `expected_digital_sum` 172.

### Verified

- **`tests/coin-legacy-reimport.test.ts` (25 tests), and the fixture IS THE REAL
  ARCHIVED DATA.** `docs/coin-economy/archive/2026-08-11-summary.csv` and
  `-transactions.csv` are parsed into exactly the snapshot shape
  `coin_import_batches.raw` holds, imported through the REAL RPC on real
  embedded Postgres, and **every student's resulting physical and digital
  balance is asserted against the sheet's own two balance columns** -- numbers
  nothing in this repo produces. All 71 match, totalling exactly 474 physical /
  172 digital. Kept honest by pinning what was compared (60 of the 71 carry real
  history; 11 genuinely have no transactions).
- Also covered: the four payout transfers landing as linked pairs that net to
  zero with the physical credit equal to the digital debit; legacy history
  never satisfying a live rule (an imported eating pass leaves
  `coin_eating_pass_active` false and a real one can still be bought, a calendar
  cap counts live rows only, the legacy categories still refuse
  `coin_log_transaction`); **the per-medium debt lockout reading the balance
  legacy rows built** -- Kooyenga imports to physical -13 / digital +1, and a
  physical purchase is refused `debt` while a digital one succeeds; the override
  map moving any student's medium with no code change, and its four refusal
  paths; idempotency, rollback of the new batch, and the anon/student boundary.
- **MUTATION-CHECKED FIVE WAYS, all in the permissive direction.** Reproducing
  `0084`'s exact original behaviour (everything digital, payout a plain debit)
  reddens 10; payout as a plain debit alone reddens 9; ignoring the override map
  reddens 9; treating `Award - Held` as physical reddens 11; and reverting the
  reconcile to the old `A - F - S - P` formula reddens **exactly the one**
  reconcile test. Migration restored byte-identical (md5-checked) and re-verified
  green each time.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD).
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0100` has never been applied anywhere and the
  remediation has not been run. Apply it by hand after `0099`, then follow the
  runbook, checking each step's reported counts before moving to the next.

