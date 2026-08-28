---
title: "The coin display layer: two balances, honest signs, one withdrawal (`0103`)"
date: 2026-08-14
branches: []
migrations: ["0103"]
subsystems: ["IDEA Coin economy"]
record_order: 13
---

## The coin display layer: two balances, honest signs, one withdrawal (`0103`)

Migration `0103_coin_public_medium_display.sql` (apply manually after `0102`)
plus a scoped edit to `static/coins/index.html`. `0096` split the economy into
two balances and made a payout a transfer, and said in its own header that a
separate pass would own how the public Ledger renders them. This is that pass.
It changes NO stored data and NO write path -- three read functions, the CSV
layer above them, and the page's rendering and aggregation.

**FREEZE NOTE: a fourth deliberate, scoped lift of the legacy-HTML freeze on
`static/coins/index.html`,** covering exactly the rendering and aggregation
below. Its visual design is correct and unchanged; everything here works within
that file's own tokens and layout language.

### THE SIGN COMES FROM THE STORED AMOUNT, ALWAYS

Both the transactions table and the drawer history used to reconstruct each
amount's sign from a whitelist of type strings (`['award', 'award - held',
'payout']` meant plus, everything else minus) and then discard the ledger's own
sign with `Math.abs`. So a `balance_correction` stored as **+40 rendered as a
red -40**; negative corrections only looked right by coincidence.

`amountDisplay(amount, type, isTransfer)` is the ONE renderer for every surface
(table, drawer, breakdown totals). **The type string chooses the badge and
nothing else** -- never the sign, never the colour of the number. When adding a
type, do not add it to a sign list; there is none.

### Adjustment has its own identity

It used to fall through to the grey `type-other` catch-all, which reads as an
error state on what is usually a correction in the student's favour. It is
**violet** (`--violet: #B47CFF`, added to that file's `:root`) on both the badge
and the amount -- the one palette colour carrying no other meaning here (green
award, red fine, amber purchase, blue payout). A positive adjustment reads as
the credit it is.

### A PAYOUT IS A TRANSFER, AND IT COLLAPSES

Since `0096` a payout is two stored rows sharing one `transfer_id`: a digital
debit and an equal physical credit. That is the ledger's truth and stays; to a
reader it is ONE withdrawal.

- **`normalizeTxnRows` collapses the pair once, at the top**, into the row every
  surface below then renders, filters, sorts and counts (`txnRows` replaces
  `txnData` at all nine consumer sites; `txnData` is now only the raw parse).
  `collapseHistory` is the same rule over the drawer's JSON history.
- The collapsed row is labelled **Withdrawal**, carries the payout badge, shows
  the amount with **NO sign at all** (a + or a - would be a lie in either
  direction), and reads `Digital → Physical` under the number.
- **The pairing key is the stored `transfer_id`, never a heuristic** over
  matching names, timestamps and amounts. That is why `0103` exposes it.
- Only one half reaching the feed (a row limit can cut between them) still
  renders correctly, with one end of the arrow unknown rather than a wrong sign.

### A TRANSFER IS NEITHER EARNED NOR SPENT

**The load-bearing fix, and it is a wrong number rather than an error.** `0089`
defined `awarded` as every positive row and `spent` as every negative non-fine
row, which was right when every row was a real event. Since `0096` a payout
writes one of each, so a student who withdrew 40i¢ read as having earned 40 more
and spent 40 more than they did -- and the Ledger's "Lifetime Earned" headline
is computed from those very columns. `coin_public_leaderboard` now skips
`transfer_id is not null` in both.

- **`paid_out` deliberately still counts the digital debit.** "How much has left
  the digital balance as coins in hand" is a real question and that is its
  answer; excluding a transfer from awarded and spent must not erase the
  withdrawal itself.
- **THE PAGE'S OWN ARITHMETIC HELD THE WHOLE TIME, WHICH IS WHY THIS WAS
  INVISIBLE.** It computes `awarded - fines - spent` client-side, and a transfer
  removed exactly +N from one and N from the other, so the identity landed on
  the right total with both components 40 too big. The reconciliation a reader
  would reach for agreed with the wrong numbers -- the `0084` lesson again, in a
  different place.
- The client-side aggregates (the weekly analytics buckets) skip a transfer row
  explicitly too, which also covers a client running against a pre-`0103`
  backend.

### Two balances everywhere

- **`Bank Balance` is GONE.** It was an empty legacy slot `0089` served and
  `0096` temporarily borrowed for the digital figure -- a stand-in that only
  rendered when POSITIVE. The summary CSV carries explicit `Physical Balance`
  and `Digital Balance` columns instead, both signed and both always sent.
- The drawer headlines **Total Balance** with `Physical (in hand)` and
  `Digital (in system)` beside it; the leaderboard card's meta row shows
  Balance / Physical / Digital, always, replacing the spent-gated single figure.
  A negative physical balance (fined past what the student was holding) is a
  real state and is shown in the negative colour, not hidden.
- **The card's hero stays "Lifetime Earned"** on purpose: it is the metric the
  board's default sort ranks by, and swapping it for the total would make a
  correctly-sorted board look mis-sorted. Sorting is untouched -- no per-medium
  sort option was added.
- **The server's total is preferred where one is sent** (`Coin Balance`), with
  the client identity as the fallback for a feed that predates `0103`.
- Every transaction row shows its **medium** in a quiet line under the amount.

### Analytics agrees with the rows above it

Adjustment is in the weekly summary (as a NET figure -- adjustments run both
ways, and an absolute one would report a correction and its reversal as
activity) and in the Transaction Breakdown, which previously listed four types
while the log showed five. The dead `'Award - Held'` / `'Fine - Owed'` handling
is gone from the badge map, the type filter, the weekly buckets and the
top-reason lists: they are Sheets-era strings the Supabase feed never emits.

### `i¢` is the currency symbol, like `$`

**Write the raw character `i¢`, not the `i&cent;` entity** (31 occurrences
across 9 files normalized, `LogView.svelte` having mixed both spellings within
one file), and never the word "coins" where a value is being rendered.

**TWO EXCLUSIONS, both of which a blanket replace would corrupt.** (1) The
~97 `IC` occurrences under `src/lib/greenline` are GREENLINE **Ignition
Credits**, a deliberately separate currency. (2) VANGUARD's own currency string
in `src/lib/legacy/vanguard/index.html` stays exactly as it is. And the three
SVG `<text>` glyphs (`AppLauncher.svelte` x2, `marks/CoinMark.svelte`) keep the
numeric-entity form `i&#162;`, since a raw character inside that markup is the
riskier spelling.

### Verified

- **`tests/coin-public-medium.test.ts` (11 tests**, the coin chain plus `0096`
  and `0103` on real embedded Postgres). Deliberately narrow: it covers the
  aggregate exclusion (against a control student who never withdrew, so the
  assertion is not indistinguishable from "these columns are always zero"), the
  page's own identity still landing on the total, `paid_out` still counting the
  withdrawal, both halves typed `Payout` and sharing one id, medium and
  transfer id reaching the drawer, no email in any of the three widened reads,
  and exactly one surviving `coin_public_transactions` signature. **A guard
  assertion first pins that the withdrawal really wrote two linked rows** -- the
  exclusion tests would otherwise be asserting the absence of something that was
  never there.
- **MUTATION-CHECKED BOTH WAYS, in the permissive direction.** Putting
  transfers back into `awarded`/`spent` reddens exactly the aggregate test;
  dropping the `transfer_id is not null` branch from the type case (so the
  physical credit reverts to reading as an `Adjustment`, indistinguishable from
  a real balance correction) reddens 2. Migration restored byte-identical
  (md5-checked) and re-verified green each time.
- **Browser-verified** against the dev server through `/dev/coins` -- which
  serves the REAL page byte-for-byte with only its endpoints repointed, so
  every claim below is the shipping markup and script against the shipping
  response shapes. **53 checks, all passing**, driven in a real headless Chrome
  over CDP: a positive balance correction rendering **`+40` in violet** (the
  exact row the old code showed as a red -40) and a negative one `-15`; the
  five amount colours all distinct with badge and amount matching; the payout
  pair collapsing to **ONE unsigned blue `40` row labelled Withdrawal reading
  `Digital → Physical`**, with the normalized feed exactly one row shorter than
  the raw one; the drawer showing 155 / 120 / 35 for a student with both media,
  **-74 / -14 / -60 with the negative physical shown in red** for one in debt,
  and 40 / 40 / 0 for a physical-only student, with `Bank Bal` absent and
  Awarded reading 214 (not 254) and Spent 40 (not 80); the leaderboard card
  carrying Balance / Physical / Digital; Adjustment appearing in the weekly
  summary at `+25` and in the breakdown at count 2 / `+25`, **agreeing with the
  two rows above it**, while the breakdown's Payout row reads an unsigned blue
  40; the type filter offering Adjustment and no longer offering the Sheets-era
  strings; `collapseHistory` driven directly over the REAL per-student endpoint
  JSON; and all four tabs plus the reasons guide rendering with **zero console
  errors and zero trapped window errors**.
- **The nine components the `i¢` sweep touched were re-driven too**, in the
  same browser: every Coin Desk area, a real student lookup (39 symbols
  rendering, including the debt panel's per-medium lines), Coin Balance,
  Contracts and the student preview -- **zero literal `&cent;` text anywhere**.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **764/764 across 33 files** (was 753/32).
- **NOT verified: the live Supabase project, and no screenshots.** The local
  `.env` is the placeholder project, so `0103` has never been applied anywhere.
  Apply it by hand after `0102` **before deploying** (the page reads
  `Physical Balance` / `Digital Balance` / `Transfer Id`; without the migration
  the CSV still carries physical and digital, but a transfer renders as its two
  halves -- degraded, not broken), then check a real student who has withdrawn
  coins: their Lifetime Earned should DROP by the amount withdrawn. The Chrome
  extension was unavailable this session, so the visual claims above are
  measured computed-style and DOM reads driven through CDP, not an eyeball.
- **AMENDED BY `0107`:** the `/dev/coins` fixture figures quoted above moved
  when adjustments left `awarded` and `spent` -- Ada now reads Awarded 174 (not
  214) with Adjustments +40, and Grace reads Spent 135 (not 150) with
  Adjustments -15. Every TOTAL is unchanged, and so is everything this section
  claims about transfers.

