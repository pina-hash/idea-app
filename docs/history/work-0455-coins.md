---
title: "Ledger 0455, part 2: a coin record's note is the reason and never the request, a Custom record says what it was for, Deposit is a real type with an editable minimum, Weekly Pay and desk donations are real categories, and past records can be corrected in one step (0322)"
date: 2026-10-28
branches: [work-0455]
migrations: ["0322"]
subsystems: [Coins, Connector]
---

Solo session, the fold-ins of `docs/feedback/2026-10-28/QUEUE-0455.md` after part 1 landed
(`9b816a6c`): 3bcf3c90, 65c46fcf, 218b6169, 636eac71, 649759fe.

### What was wrong, measured

- **The note was the request (3bcf3c90).** `coinTransact` joined `said` and `what` into one
  string and `decideCoin` cut its note out of that (`reasonIn`, filler and verbs stripped,
  falling back to the whole of `said`). Read from the connector's own audit on 2026-10-28:
  17 Custom Awards from one request carried the note "also go ahead all", and a deposit logged
  the same day carried a misheard student name as its note. The same text was saved as a
  coin phrase with an amount, so it would have matched again.
- **"Custom" alone (65c46fcf).** Every list rendered `category_name`, so a Custom record read
  "Custom Award" with its reason, when shown at all, as a second line; the two public reads
  returned the category name only.
- **No deposit (218b6169, 649759fe).** Physical-to-digital deposits were logged as Balance
  Corrections, a Custom Award and Debt Payments; weekly pay and a donation as the retired
  Contract Completion. 636eac71 asked for a minimum of 5.

### What landed

- **0322** `supabase/migrations/0322_coin_deposits_and_record_labels.sql`: `coin_deposit`
  (kind award, priced `formula` so only `coin_log_deposit` writes it), `weekly_pay` (flat 4,
  editable), Donation made loggable, four seed phrases, the `deposit_minimum` setting (5) with
  its rule in `_coin_setting_ok_0455` behind 0276's `_coin_setting_ok_0402` restated word for
  word; `coin_log_deposit` (section staff for their own students, the minimum refused in words,
  "Physical to digital" on the record); `coin_transactions_relabel` (full coin admin, all or
  nothing, note and category only, a credit stays a credit, every change in
  `coin_relabel_log`); the two public reads with Deposit as a type and a Custom record's note
  as its reason.
  - **The relabel edits a row in place**, which 0277's comment calls append-only. That is
    deliberate and narrow: the amount column is never touched, so no balance, stock signal or
    digest moves, and the old values are kept in `coin_relabel_log`. A reversal and a new row
    would have moved the date and, for a deposit under 5, been refused by the minimum.
  - **The public reads widened**: a Custom record's note is now public. Mr. Pina asked for it
    on the public board (his report was filed from `/coins`). Only the three Custom categories,
    whose note is by construction the reason he gave; every other row's note stays off.
- Connector: `decideCoin` takes `reason` and makes a note of nothing else; with no reason a
  listed category writes no note and a Custom or hand-priced category asks "What was it for?"
  and writes nothing. `coin_transact` takes `reason` (and `what`, its older name) and routes
  "deposit 5 coins for Dominic" to `coin_log_deposit`. Registry entries for `coin_log_deposit`
  and `coin_transactions_relabel` (asks first), with samples.
- Site: `coinRowLabel` in `$lib/coin-format.ts` names a row in `CoinTransactionRows`,
  `DeskHistory` and the student's coin page; the sixth type `deposit` (its own glyph, the
  payout's cyan); the desk Log form's Deposit field; the Deposits group on the settings page.
  No coin page layout moved.

### Measured

- `tests/db/coin-deposits-0322.test.ts` 15/15, over the chain short of 0322 seeded through the
  deployed RPCs and applied twice with admin edits between: the stored settings and five
  planted refusals put to the deployed gate first and compared case for case; the scanner over
  the real file finds nothing, a planted top-level insert is found; the minimum both ways and
  moved by the setting; scope both ways; public rows other than Deposit and Custom identical to
  before; the private transfer present in the table and absent from both reads; relabel all or
  nothing, balances unchanged.
- **Mutation proof**, on that one file, restored from a copy (md5 `2f217d89` before and after, measured under its first number, 0319, before 0319 to 0321 landed from other lanes and this file became 0322):
  the private-transfer condition removed from `coin_public_transactions` reddened 2 of 14; the
  Custom-only condition widened to every row reddened 1 of 14.
- `tests/connector-coin-voice.test.ts` 18/18 and `tests/db/connector-coin-voice.test.ts` 11/11,
  including the 2026-10-28 request word for word: the note is the reason and no record or phrase
  contains "go ahead"; no reason asks and writes nothing, the same call with one writes one.
- `tests/dom/coin-custom-labels-mount.test.ts`: on the real components, a Custom row named by its
  note with 0 note lines, a listed row with its name and 1, against 4 rows; chips Award, Deposit,
  Fine, Fine.
- Every coin and connector suite (60 files, 2265 tests) green. `svelte-check` 0 errors, 33
  warnings in 18 files. Browser: `/dev/coin-desk` and `/dev/coin-balance` routes, 42 runs at 375
  and 1440, 750 measurements, 0 outside threshold, 0px overflow.

- Full `npm test` once, rebased on `133ba447`: 947 files, 17271 tests, 16 failed in 7 files. One
  was this bundle's and is fixed in the same commit: `tests/db/grant-sequence-sweep-control.test.ts`
  counts revoked sequences, and `coin_relabel_log`'s is the eighteenth (rerun 7/7; without the edit
  it fails, measured). The other 6 are the baseline set (`classroom-panel-layout-render`,
  `cert-0262-exam`, `cert-flow`, `feedback-round-0380-foundry`, `ideacad-feature-graph-storage`)
  and `standards-version-header` (IDEA_MORNING_ANNOUNCEMENTS.md, from `481afb99`); none touches coins.

### Not verified

- Production: 0322 applies through migrate.yml on push; this container cannot reach it.
- The corrections themselves (17 award notes, 4 to 6 past deposits) are prepared, with record
  ids, outside this public repository, and are not written: they run after Mr. Pina's yes.
- The Ledger at `/coins` is frozen and maps an unknown type to its plain badge, so a Deposit
  there reads "Deposit" in the neutral style; not looked at in a browser.
