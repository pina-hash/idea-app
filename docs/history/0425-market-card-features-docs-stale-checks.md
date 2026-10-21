---
title: "Every IDEA Market card can be featured, the docs 0422 did not own, and two stale checks made honest (ledger 0425, migration 0294)"
date: 2026-10-21
branches: [main]
migrations: ["0294"]
subsystems: ["IDEA Coin economy", "The IDEA Website connector", "Foundry", "Origin split", "Environment", "Notebook", "Browser harness", "Testing"]
---

Ledger 0425, a solo session. Three tasks, each built, checked and pushed to
`main` on its own.

## 1. Every market card has a featured switch (connector gap 8020d662)

**What the gap was.** Mr. Pina asked the connector to "feature the tissue box
stuff and unfeature everything else" on the market. 0422 built the staff list
of market LISTINGS with feature and unfeature, but the tissue box cards are
want-ads (`coin_donation_items`, 0245), not listings, and the market page
(`src/lib/coin-market/official.ts`) hard-coded every non-listing card's
featured state: contracts always featured, shop tiles, want-ads and the
background card never. Production also holds no listings, so 0422's list came
back empty. Nothing in the database could switch those cards.

**What 0294 adds.**

- `coin_market_card_features`, one row per card staff have switched, keyed by
  the page's own tile key (`shop:eating_pass`, `shop:extra_credit`,
  `shop:pay_raise`, `shop:print`, `background`, `donation:<id>`,
  `contract:<id>`). No row keeps the page's old default, so the live market
  did not move on deploy. The fixed keys are one list in the file's check
  constraint and `FIXED_CARD_KEYS` in `official.ts`; the 0294 test reads the
  file and holds them equal.
- `coin_market_card_features()`, the switched states for any signed-in reader.
  It names cards, never a person.
- `coin_market_cards_admin()`, coin staff: every card on the market with its
  card id, kind, title and featured state. Official cards and student
  listings follow 0290's scope rule; the shared cards carry `can_set`, true
  only for a full coin admin.
- `coin_market_card_set_featured(card, featured)`, coin staff. A listing or
  official card goes through `coin_market_listing_staff` (0290), so its scope
  rule is the one already there, not a second copy. Every other card shows in
  every class, so it is a full coin admin's (`full_admin_only` otherwise). It
  answers what the card `was`.
- `coin_market_cards_feature_only(cards)`, a full coin admin: feature exactly
  these and unfeature every other card, in one call. Every card named is
  checked first; one unknown card refuses the whole call with nothing written.
  This is the one-step answer to the request that opened the gap.

**The page.** `/market` reads the switches best effort and passes them to
`officialTiles`, which now puts featured cards first and keeps the old order
otherwise (a stable sort). An official staff card keeps its own featured state
and is never read from the switches. The Coin Desk's market page gained
"Every market card", each card with a Feature or Unfeature key (or "A full coin
admin features this one" for section staff).

**The connector.** Hand entries in `registry/market.yaml`:
`coin_market_cards_admin` (read), `coin_market_card_set_featured` and
`coin_market_cards_feature_only` (both confirm, `proof: generic`, the shape
`coin_market_listing_staff` already uses). `coin_market_admin_listings` now
says it lists listings and points at the full list. `coin_market_card_features`
is a generated exclusion (no staff gate). `npm run connector:build` was run.

**Measured (2026-10-21).**

- `tests/db/coin-market-cards-0294.test.ts`, 13 tests, chain booted short of
  0294 with an official card and two contracts made through the real RPCs and
  0245's own tissue box seed, then 0294 applied over the top and re-applied.
- Mutation proof, that file only: the staff gate in
  `coin_market_card_set_featured` and its full-admin gate made permissive
  (`if false`), 2 tests failed (the student and section-teacher refusals, and
  the admin's switch reading the wrong `was`). Restored from a copy, md5
  `168446c6f88324ab8369a729c2bd15b4` before and after, green again.
- `tests/coin-market-client.test.ts`: defaults unchanged with no switches
  (only the contract featured), switches applied and featured cards first,
  an official card untouched by a switch, malformed payloads dropped.
- Browser harness, `/dev/coin-market?view=desk` at 375 and 1440: 0 outside
  threshold over 36 measurements, 5 cards each with its switch, the two
  tissue box want-ads featured, every desk key at least 44px.
- `svelte-check`: 0 errors, 33 warnings in 18 files, with a placeholder `.env`
  (a fresh clone reports 20 phantom `PUBLIC_SUPABASE_URL` errors without one).

**Not verified.** The live Coin Desk page signed in, and a switch on the live
market; both wait for the deploy.

## 2. The docs 0422 did not own

0422's "Not done" list named five files its ledger did not own. Four are
written here; the fifth (`vercel.json`, the replay riding the autopay route)
was not in this ledger's tasks and is still as 0422 left it.

- **The student changelog.** The prompt named `static/classroom-updates.json`;
  the file is `classroom-updates.json` at the repo root (`src/lib/classroom/updates.ts`
  imports it from there), so the entries went there, in its existing shape.
  Four entries dated 2026-10-21: the coin bar and coin home, what a student
  sees when Mr. Pina views or acts on their account (and that test accounts
  never show in their lists), Foundry covers, and this ledger's featured
  market cards.
- **`CLAUDE.md`.** The public tier names `/coin`; the `/foundry` line names
  `/c/<app id>` as an apps-origin route.
- **`docs/subsystems/coins.md`**: the coin bar (`COIN_PAGES`, `coinBarDesk`,
  `injectCoinBar` and the re-declared tokens), `/coin`, and the market's one
  featured state per card from task 1.
- **`docs/subsystems/foundry.md`**: covers as an override layer, the editor's
  place, the frame, and the click-through limit 0422 recorded.
- **`docs/subsystems/origin-split.md`**: `/c/<app id>` as the third
  apps-origin route and its stricter policy.
- **`docs/subsystems/environment.md`**: the service-role census is EIGHT, the
  eighth `src/lib/server/view-as/service.ts`, with what it does and the test
  that holds it.

`node tools/claude-md-check.mjs` agrees with the tree after the edits
(2026-10-21).

## 3. Two stale checks

- **`tests/notebook-text-only-entry.test.ts` was a calendar dependence, not a
  time-of-day one.** Its check-in is dated 2026-10-20 and the database stamps
  an entry with the real `now()`, and `notebook_get_section_grid` reads
  `on_time` as "filed on or before the check-in's day" in school time. So it
  passed while the suite ran on or before 2026-10-20 and failed on every run
  from 2026-10-21 on (confirmed: the old file, run alone today, fails exactly
  that assertion, 1 of 11). Postgres cannot be handed a fake `now()`, so the
  entries are moved onto a fixed clock: `fileEntriesAt` shifts every upload
  time of the check-in by one offset so the newest lands at a fixed instant,
  keeping the order and the gaps (the entry that wins the cell is the same).
  The assertion is not loosened; it now runs both ways on the same clock:
  filed the next morning reads late (`on_time` false), filed in class on the
  day reads on time. 11 of 11 pass.
- **The coin-stocks browser specs counted from the fixture now.** 0421 added
  three area stocks to `/dev/coin-stocks` and left `coin-stocks.mjs` at "four
  stocks" and "a chart each, the index too" (5), so 7 cards and 8 charts read
  as 6 failures on every tree. The harness's stocks moved into
  `src/routes/dev/coin-stocks/stock-roster.js` (`STOCK_ROSTER`,
  `ROSTER_COUNTS`), the page builds its board from it, and `coin-stocks.mjs`
  and `coin-stocks-theme-space-white.mjs` import the counts, the shape
  `src/routes/dev/marks/mark-roster.js` set. The index is still the mean of
  the same four stocks, in the same order, so every price is unchanged.
  Measured 2026-10-21: the four `/dev/coin-stocks` specs, 375 and 1440, 98
  measurements, 0 outside threshold; their measurement files were rewritten.

## The full suite, and what landed

| Task | Commit on `main` | Migration |
| --- | --- | --- |
| 1. Every market card has a featured switch | `7fe15485`, then `29afe410` (log table, a say phrase) | 0294, applied by Migrate (`cbf2ba57` records it) |
| 2. The docs 0422 did not own | `48761c81` | none |
| 3. Two stale checks | `7da408ac` | none |

Gap 8020d662 was marked built with ledger 0425 through the connector after
the deploy, once `coin_market_cards_admin` answered live with the two tissue
box want-ads, eight contracts, four shop tiles and the background card, and a
dry-run of `coin_market_cards_feature_only` on the two tissue boxes previewed
2 featured and 8 unfeatured with nothing written. The switch itself was not
made: that is Mr. Pina's call.

**The one full `npm test`**, run on the task 3 tree before it was pushed
(2026-10-21): `Test Files 4 failed | 879 passed (883)`, `Tests 13 failed |
16563 passed (16576)`. None of the 13 is this work's, and none is a defect:
the four files (`tests/classroom-panel-layout-render.test.ts`,
`tests/db/cert-0262-exam.test.ts`, `tests/db/feedback-round-0380-foundry.test.ts`,
`tests/db/ideacad-feature-graph-storage.test.ts`) fail the same 13 on the tree
before this ledger (`ebfb31ee`), and pass, 88 of 88 with the notebook file,
under `TZ=UTC`. This container's clock is `America/Los_Angeles`; CI runs in
UTC, and CI on `29afe410` failed only the notebook test this ledger fixes.
Those four files read the machine's own time zone somewhere; that is worth a
session of its own, and was not in this one's tasks.
