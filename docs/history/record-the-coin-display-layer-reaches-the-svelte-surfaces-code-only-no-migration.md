---
title: "The coin display layer reaches the Svelte surfaces (code-only; NO migration)"
date: 2026-08-15
branches: []
migrations: []
subsystems: ["IDEA Coin economy"]
record_order: 15
---

## The coin display layer reaches the Svelte surfaces (code-only; NO migration)

`0103` and `0107` taught the LEDGER (`static/coins/index.html`) how to render a
correction, a withdrawal and a split balance. The three Svelte surfaces that
show the same rows -- the student's own balance page, the Coin Desk log, and
the admin balance panel -- never got any of it, and had drifted into three
near-identical copies of one transaction row. This closes that gap. **No
migration, no RPC change, no write path touched, and no balance arithmetic
moved**: `sumBalances` and `_coin_balance` remain the only places that sum.

### What was actually wrong, and what was not

Measured in the harness before anything was changed, because three of the four
reported defects turned out to be **already fixed in the Ledger** and the
reports were about the surfaces beside it:

| | Ledger | The three Svelte surfaces |
|---|---|---|
| Correction rendering | correct (`0103`) | **broken** -- styled as an ordinary award / fine |
| Payout pair | correct, one Withdrawal row | **broken** -- two unrelated rows, opposite signs |
| Adjustment in the breakdown | correct (`0107`), all five types | n/a |
| Split balances | correct | already correct |

**Distinct payouts were never merging.** Three withdrawals -- two sharing a
timestamp -- were driven through the Ledger and came out as three rows. The
pair-collapse `0103` performs is deliberate and stays; what was missing is that
the Svelte surfaces did not perform it at all.

### One row renderer, and one place the rules live

`src/lib/coin-format.ts` is the shared layer (pure, client-safe) and
`CoinTransactionRows.svelte` is the one component the three surfaces now mount.

- **A CORRECTION IS NOT AN AWARD OR A FINE.** `coinAmountDisplay` gives an
  `adjustment` its own tone at BOTH signs -- the same violet the Ledger uses --
  and the row carries a named type chip beside it, because a figure that reads
  only as a colour depends on someone knowing what that colour means. The sign
  is still the STORED one; nothing reconstructs it from a type string.
- **`coinTxnType` mirrors `coin_public_transactions`' own CASE (`0103`)** so the
  Ledger and these surfaces cannot disagree about what a row IS. It needs the
  row's `coin_categories.kind`, which each surface now passes from the category
  list it already loads; **without it every non-payout row reads as an
  adjustment**, which is the same fallback the SQL has and the safe direction --
  an award mislabelled a correction is confusing, a correction mislabelled an
  award is the defect being fixed.
- **`collapseCoinTransfers` pairs on the STORED `transfer_id` and nothing else.**
  `coin_admin_lookup` has returned that column since `0096`; the Svelte row type
  simply did not declare it, so a withdrawal rendered as a digital debit and a
  physical credit sitting next to each other. Pairing by name, amount and
  timestamp would be guesswork over a key that already exists -- and would merge
  two withdrawals made in the same minute, which is a real thing that happens.
- **THE TWO MEDIUMS ARE NEVER CONFLATED.** Every ordinary row carries the medium
  it moved; a collapsed withdrawal carries the ARROW between them
  (`Digital → Physical`), never one medium and never a medium-less figure. A
  row with an unknown medium is labelled with neither rather than guessed at.
- A transfer is the one figure with **no sign at all**: nothing was earned and
  nothing was spent, so a + or a - would be a lie in either direction.

### The type the analytics panel really was missing

Adjustment was already in the Ledger's Transaction Breakdown (measured: all
five types render). The enumeration that was short is the **Weekly Summary**,
which listed Awarded / Fines / Adjustments and silently omitted **Purchases** --
so a reader comparing the two halves of the same tab found a week's spending in
one and not the other. `Coins Spent` is there now. **Payout stays out on
purpose**: a transfer moved coins the student already held, so it belongs in
none of those totals, which is why it is the one type with no row.

### The symbol, and why a constant alone would not have held

`COIN_SYMBOL` in `coin-format.ts` is the one spelling. It had been written
three ways across **22 files** -- the raw character, the numeric entity
`i&#162;` inside SVG `<text>`, and static markup -- and the entity spellings
were invisible to a grep for the character, which is how two RENDERED figures
in the Ledger (a contract payout and a standings value) were still building
their symbol out of an entity long after the "sweep" that supposedly ended it.
**The test found those, not a person.**

- `coins(n)` / `signedCoins(n)` are the formatters; the symbol trails the
  number like a dollar sign leads one, and the word "coins" never appears where
  a value is rendered.
- The SVG glyphs in `AppLauncher` and `CoinMark` render `{COIN_SYMBOL}` as a
  text expression now instead of a numeric entity.
- **The Ledger keeps its OWN single copy**, because a standalone HTML file
  cannot import `$lib` -- one `const COIN_SYMBOL` at the top of its script,
  which `tests/coin-symbol.test.ts` asserts matches the module's.
- **THE ENFORCEMENT IS THE TEST, NOT THE CONSTANT.** A constant only makes the
  right thing available; it does nothing about the next literal typed straight
  into a template. The test walks 25 named coin sources (listed explicitly --
  a glob would quietly stop covering a file that moved) and rejects both the
  alternative spellings and any loose literal outside a comment.
- **Deliberately out of scope, each for its own reason:** GREENLINE's `IC`
  (Ignition Credits, a separate currency), VANGUARD's own currency string, and
  the archived Sheets-era code under `docs/`. A blanket replace would corrupt
  all three, and the test asserts none of them is in its list.

### Verified

- **`tests/coin-display.test.ts` (18)** and **`tests/coin-symbol.test.ts`
  (59)**, both pure. The display suite pins the split (including a NEGATIVE
  physical balance and the no-medium-means-digital backfill rule), the
  correction's own tone at both signs against award/fine controls, and the
  payout collapse -- **including two withdrawals at the SAME timestamp**, which
  is the only case that tells "collapse the pair" from "collapse everything".
- **MUTATION-CHECKED FOUR WAYS.** Removing the adjustment tone reddens the
  correction test; pairing payouts by timestamp instead of the stored key
  reddens the same-instant test; summing both mediums into one figure reddens 2;
  and reverting a single site to either the entity OR a raw literal reddens the
  symbol guard in both directions. Modules restored byte-identical (md5).
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **1033/1033 across 42 files** (was 956/40 -- the two new suites are the
  difference exactly).
- **Browser-verified over CDP** (the Chrome extension was unavailable) through
  `/dev/coin-preview`, `/dev/coin-desk` and `/dev/coins`, each extended with a
  correction, MULTIPLE payouts and an account holding both balances. Measured:
  the student view rendering **6 rows from 8 stored** with `+40i¢` in violet
  `rgb(112,80,168)` against award green `rgb(120,184,112)` and purchase amber
  `rgb(208,128,48)`, and two separate unsigned withdrawals reading
  `DIGITAL → PHYSICAL`; the Coin Desk log and the admin panel doing the same
  (5 rows from 7, split `PHYSICAL 26i¢ / DIGITAL 16i¢`); the Ledger's weekly
  summary now reading Awarded / Fines / **Spent** / Adjustments / Transactions
  with the breakdown's five types and the drawer's three withdrawals unchanged;
  and **zero `i&#162;` in any rendered output**. 375px with no overflow on every
  surface, and zero console errors throughout.
- **The classroom rider:** Restore measures **69x44px** while `.btn.tiny`
  elsewhere in the manage console (Edit, Unpublish, Pin, Copy) still measures
  **23px** -- the exception is scoped to that button inside `.tool-actions`, not
  to the shared class, which is what stops every tiny control in the classroom
  inflating with it.
- **NOT verified: the live Supabase project, and no screenshots.** The local
  `.env` is the placeholder project, so none of this ran against real coin data;
  `0103` and `0107` are still unapplied there, which is worth knowing because on
  a pre-`0103` backend no `transfer_id` reaches the page and a withdrawal
  correctly renders as its two halves -- degraded, not broken. The Browser pane
  does not composite, so every visual claim above is a measured computed-style
  or DOM read.

