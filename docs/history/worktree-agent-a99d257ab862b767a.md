---
title: "IDEA Stocks relaunch: today's price becomes each stock's launch price, every fabricated close is deleted, prices tick from live site data about once a minute, a four-week launch ramp (5, 10, 15, 25 percent a day) and then only circuit breakers (feedback 79e16faa and fbe274c3, migration 0283)"
date: 2026-10-21
branches: [worktree-agent-a99d257ab862b767a]
migrations: ["0283"]
subsystems: ["IDEA Coin", "Coin Ledger", "Database", "Connector"]
---

Mr. Pina's two feedback reports (79e16faa, fbe274c3) asked for the stock market
to start over: today's price becomes the launch price, students keep their
shares at their current value with no refunds, every fabricated, backfilled or
predicted price is deleted so each chart starts at the launch, prices come only
from real site data and update about every minute, a launch ramp caps the daily
move at 5% in week 1 widening to 25% by week 4, and after that only
exchange-style circuit breakers, with no smoothing. The session was a
subagent in a worktree with no push and no database apply; the branch name is
the worktree's, which is why this file is named for it.

## What changed

- **0283_coin_stocks_relaunch.sql.** New columns on `coin_stocks`
  (`launched_at`, `launch_price`, `anchor_price`, `anchor_signal`) and on
  `coin_stock_closes` (`open`, `high`, `low`, `ticks`: a day's row is live until
  the day ends). New tables `coin_stock_ticks` (one row per price CHANGE, with
  its inputs, so the table grows with the data and not with the clock),
  `coin_stock_halts`, `coin_stock_state` (the throttle's one row) and
  `coin_stock_relaunch` (each holding before and after, so "value unchanged"
  is checkable afterwards). The v1 pricing functions (`_coin_stock_close`,
  `_coin_stock_num`, the two date-keyed signal functions) are dropped;
  `_coin_stock_signal` measures the same 0279 signals over a window ending at
  the tick; `_coin_stock_price` is the one writer; `_coin_stocks_tick_at`
  prices every active stock at a moment; `_coin_stocks_tick` throttles (class
  days only, one at a time, at most one each 30 seconds); `coin_stocks_tick`
  is the page's call; `_coin_stocks_nightly` now delegates to the tick, so
  `coin_autopay_run` (0281) needed no change. Buy and sell tick first, refuse
  `halted` during a halt, and trade at the current price.
- **The launch block runs once** (guarded on a fixed stock already having a
  launch), and refuses with the two totals if holdings would change value.
- **pg_cron.** The last block schedules `coin-stocks-tick` every minute when the
  `cron` schema exists and says what to do when it does not. The file never
  creates the extension (extension DDL is the dashboard's, and the migrator's
  guard refuses it).
- **The page.** `$lib/coin-stocks/stocks.ts` parses the new board (rules with
  `ramp` and `halts`, each stock's `phase`, `halt`, `launch`, a series of price
  changes) and words it; the stocks page shows each stock's launch week or
  pause, disables trading during a pause, says when prices were last checked,
  and refreshes each minute while in view; the detail page shows the launch and
  its anchor, the latest price changes with their inputs, each day's open, high,
  low and close, and the pauses. Settings drop the clamp and the median window
  and call `stock_base` the starting price of a new stock.
- Docs: `docs/subsystems/coins.md`'s stock rule and
  `docs/coin-economy/IDEA_COIN_V2.md` 12.1 and 12.7 edited in place; a
  student-readable entry in `classroom-updates.json`; the connector registry
  excludes `coin_stocks_tick` (no staff gate, counts only) and
  `npm run connector:build` regenerated its files.

## Calls I made

1. **The launch price is the stock's latest close**, which is the price every
   trade was using, so translating shares by old price over launch price is
   exactly one: no share count moves and no value moves. The translation is
   written generally anyway, and recorded per holding.
2. **Cost basis is untouched.** It is what each student paid; rewriting it to
   the current value would be an unlogged house gain or loss and would break
   `tests/db/coin-market-conservation.test.ts`'s identity. No refund, no
   write-down.
3. **Trades are kept.** They are records of coins that moved, not price
   history.
4. **The anchor.** v1 divided by an eight-week median, which only existed
   because of the backfill. v2 prices a stock against its signal at the launch:
   a signal 10% higher is a price 10% higher. A stock with no reading at the
   launch (a zero GAUNTLET week, a class with fewer than three graded students)
   anchors at its first real reading, at the price it then holds, so it never
   jumps on the first data. The index is its launch price times the mean of its
   members' moves, which is the old equal-weighted mean at the launch and stays
   continuous when a stock is switched on or off.
5. **Ticks only on class days.** The market is closed on other days, and a
   seven-day window ticking through a weekend would drift every price down and
   back up each week for no reason anyone traded on. Monday opens on the data.
6. **The ramp is measured from each stock's own `launched_at`**, in 7-day
   weeks, against the day's reference (the previous class day's last price, or
   the launch price). A class stock made later has its own ramp.
7. **Breakers after the ramp only, both directions**, 10% for 15 minutes, 20%
   for another 15, 30% for the rest of the day, each level once a stock a day,
   measured from the day's reference. Wider than the market-wide 7/13/20
   because one person more or less in a seven-day average of five is already a
   3% step. Both buys and sales are refused; the price keeps following the
   data during a halt (it is not made by trades, so freezing it would invent a
   price).
8. **Floor and ceiling stay** (1 and 100, settings). A price must be above zero
   and a tiny anchor signal must not produce an absurd number; they are bounds,
   not smoothing.
9. **One statement of the rule**: `_coin_stock_rules` holds the ramp and the
   breakers; the board hands it to the page and each stock arrives with its
   `phase` and `halt` worked out. `tests/coin-stocks-client.test.ts` feeds the
   words a schedule different from the shipped one, so a sentence that read a
   TypeScript constant would show the wrong number.
10. `stock_clamp_percent` and `stock_median_weeks` stay in `coin_settings`
    (rows are admin data; deleting them buys nothing) but nothing reads them and
    the settings page no longer shows them. `coin_stock_admin_set` now refuses
    any non-empty `params`.

## Measured

- `npx svelte-kit sync && npx svelte-check` with the two public variables
  exported: 0 errors, 33 warnings in 18 files, the baseline, before and after.
- `tests/db/coin-stocks-pricing.test.ts` 16 (rewritten for v2: anchoring, the
  four ramp caps, week five uncapped, all three breaker levels and their
  lengths, a 5% move tripping nothing beside a 12% move tripping level 1, buy
  and sell refused during the halt and allowed after it, no tick row when
  nothing changed, the index, the throttle and the closed day, the trading
  rules, the board and the detail read).
- `tests/db/coin-stocks-relaunch.test.ts` 5, **over pre-migration data**: the
  chain booted short of 0283, the market seeded through the real 0279
  functions (v1 nightly backfill, v1 buys and a sale), then 0283 applied over
  it: launch prices equal the old latest closes, one close and one tick per
  stock and nothing older, positions, cost basis and every portfolio value
  byte-identical, trades kept, the first tick after the launch does not move
  any price, and a second paste deletes nothing and launches nothing.
- `tests/db/coin-stocks-backtest.test.ts` (rewritten): eight seeded weeks, 40
  class days, launched at 10 and ticked hourly. Every ramp tick within its
  week's cap (with a positive control that some tick pressed the cap), every
  open-phase move of 10% or more has its halt, every halt was earned.
  `node tools/coin-stock-backtest.mjs` wrote
  `docs/coin-economy/backtests/2026-10-20-stocks-v2.csv` and `.svg`:

| Stock | First | Last | Low | High | Halt levels after the ramp |
|---|---|---|---|---|---|
| IDEA (index) | 9.75 | 9.28 | 7.45 | 12.85 | 2 |
| FNDRY | 9.50 | 6.67 | 6.67 | 25.00 | 17 |
| GNTLT | 9.50 | 11.58 | 1.32 | 12.11 | 21 |
| IDEA100 Block 1 | 10.00 | 9.18 | 8.71 | 10.00 | 0 |
| IDEA209H Block 4 | 10.00 | 9.70 | 9.70 | 10.10 | 0 |

  **The finding worth a decision**: with no cap after week four, the two
  people-count stocks trip breakers often on this seeded data (a Foundry week
  at 18 people against 4 to 10, a GAUNTLET week at zero), and GAUNTLET's dry
  week drove it to 1.32 inside the ramp. That is the data, not a defect; the
  thresholds are one function (`_coin_stock_rules`) if they need tuning.
- `tests/db/coin-market-conservation.test.ts` green after pointing its price
  moves at the latest row (0283 trades there).
- `tests/coin-stocks-client.test.ts` 8.
- Mutation: the halt refusal in `coin_stock_buy` made permissive
  (`if false and ...`) reddened the breaker test (1 of 16); the file was
  restored from a copy, md5 `30faa958` before and after.
- `npm run verify:browser -- --route /dev/coin-stocks`, four specs (one new,
  `coin-stocks-halt-1.mjs`) at 375 and 1440: 8 runs, 98 measurements. The
  first pass found the pause notice in amber at 4.11:1 on the stock tile; it is
  now text ink with an amber marker, as the move already was, and the second
  pass was 0 outside threshold. The 375 halt view and the 1440 detail view
  were rasterized and looked at.

## Not verified

- **The apply against production** and the pg_cron job: this container cannot
  reach the database. Whether `cron` exists there is a property of production.
- **pg_cron itself**: the embedded test Postgres has no pg_cron, so the
  scheduling block was exercised only on its "not installed" branch.
- Any signed-in page against real data (the browser pass runs the real
  components over the `/dev/coin-stocks` fixture, not the database).
- The full `npm test` result is in the session report, not here.

## For Mr. Pina

After pasting 0283: enable pg_cron (Supabase dashboard, Database, Extensions,
`pg_cron`) and paste 0283 again; the second paste only schedules the minute job
(the launch is guarded). Without it prices still update, on each page load and
each trade.
