---
id: 2026-10-18-coin-later-features
repo: pina-hash/idea-app
chat: Idea coin system reform
ledger: 0402
migration: 0275
model: opus-5.5
effort: high
size: L
owns: supabase/migrations/0275_*.sql, supabase/migrations/0276_*.sql, supabase/migrations/0277_*.sql, supabase/migrations/0278_*.sql, supabase/migrations/0279_*.sql, supabase/migrations/0280_*.sql, supabase/migrations/0281_*.sql, supabase/migrations/0282_*.sql, supabase/migrations/0283_*.sql, supabase/migrations/0284_*.sql, src/routes/market/**, src/routes/coin-balance/**, src/routes/coin-desk/**, src/lib/coin-market/**, src/lib/coin-stocks/**, the IDEA Classroom header banner component and its mount in the classroom layout, src/lib/classroom/HallPass.svelte, src/lib/classroom/hall-pass.ts, src/lib/legacy/coins/index.html, src/lib/server/coin-public.ts, tests/coin-market-*, tests/coin-stocks-*, tests/db/coin-market-*, tests/db/coin-stocks-*, tests/db/coin-transfer-*, tests/db/coin-hallpass-minutes-*, tools/browser-verify/routes/coin-market-*.mjs, tools/browser-verify/routes/coin-stocks-*.mjs, the generated counts block in tools/browser-verify/README.md, tools/coin-stock-backtest.mjs, docs/coin-economy/**, docs/decisions/entries/70-*, classroom-updates.json, the CLAUDE.md coin rules, docs/prompt-ledger/entries/0402-*, its own docs/history/ entry, db:idea-supabase
after: 2026-10-18-migration-chain-repair
needs_go: no
go: no
status: done
started_at: 2026-10-19T07:40:46Z
finished_at: 2026-10-19T09:57:11Z
queued_at: 2026-10-17T23:59:00-07:00
started_at: 2026-10-19T03:10:49Z
---
MODEL: Opus 5.5 | EFFORT: high | Mode: solo | Ledger: 0402 | Migration: 0275-0284 - new tables and RPCs for marketplace, transfers, banner, hall pass minutes and stock market

```
Before doing anything else:

git fetch origin main
git config user.email   # set one if empty, and say so

Every statement below about the repo is a claim from a read-only audit at 793bb159. Check each claim against the tree before relying on it.

Mr. Pina is not watching. The work goes live for students the moment you push. Do not stop to ask him anything. Where this prompt leaves a choice open, take the most reasonable reading and record it under "Calls I made". Stop only for an irreversible, ambiguous choice about live student data. If that happens, ship the rest, leave that part out, and say so.

==================================================================
0. NUMBERS AND OWNERSHIP
==================================================================

Ledger 0402. Migrations: as many as the work needs, each under the next free migration number at landing (never a fixed or reserved number): write each file under the next free number, take the next free numbers again when you rebase to land, rename your files (and every test and doc naming them) if someone landed first, keep them contiguous, and list exactly the final numbers on the ledger entry's Claims: line (CLAUDE.md, "A MIGRATION NUMBER IS TAKEN AT LANDING"). Wherever this prompt says 0275 to 0284, read your final numbers. Decision 70.

If 0402 or any of those migration numbers already exists on origin/main when you rebase, renumber yours to the next free number, update every reference, and say so. Never edit another session's file.

Owns:
- supabase/migrations/0275_*.sql through 0284_*.sql
- src/routes/market/**
- src/routes/coin-balance/** (marketplace and transfer additions only)
- src/routes/coin-desk/** (marketplace moderation, banner, stocks and settings additions only)
- src/lib/coin-market/**
- src/lib/coin-stocks/**
- the IDEA Classroom header banner component, and its mount in the classroom layout
- the hall pass purchase hooks in src/lib/classroom/HallPass.svelte and hall-pass.ts
- the Ledger's transfer feed and stock tile (src/lib/legacy/coins/index.html, src/lib/server/coin-public.ts)
- tests/coin-market-*, tests/coin-stocks-*, tests/db/coin-market-*, tests/db/coin-stocks-*, tests/db/coin-transfer-*, tests/db/coin-hallpass-minutes-*
- tools/browser-verify/routes/coin-market-*.mjs and coin-stocks-*.mjs, plus the generated counts block in tools/browser-verify/README.md
- tools/coin-stock-backtest.mjs
- docs/coin-economy/IDEA_COIN_V2.md
- docs/decisions/entries/70-*
- classroom-updates.json
- the CLAUDE.md coin rules these change (edited in place)
- this ledger entry and your own docs/history/ entry

Nothing outside that list.

==================================================================
1. READ FIRST
==================================================================

Read these in full:
- CLAUDE.md: the coin rules, the migration rules, the verification rules
- docs/coin-economy/IDEA_COIN_V2.md: the spec as built through ledger 0386
- the history entries for ledgers 0384 and 0386
- docs/standards/IDEA_INTERFACE_STANDARDS.md
- docs/standards/IDEA_CLAUDE_DESIGN_STANDARDS.md
- docs/skills/idea-design/SKILL.md

Read standards from the repo, never from memory or older copies.

The visual standard is the live site's own components and tokens. The IDEA Design System (https://claude.ai/artifact/Gb9XpTcK43gZMGSkqy22xs) is built from them.
- Use existing components before writing new ones.
- Green is the accent, never the fill.
- No neon or machined-green fills, no "//" motif, and no grid backgrounds outside real charts.
- Dead space is a defect. Ship complete and refined, never bare minimum.
- 44px touch targets on every student surface.

Usage matters:
- Read only what this prompt names, plus what the audit shows you need.
- Subagents may split independent parts inside this lane.
- Run targeted tests while working. Run the full suite once, at the end.

Governing rule, unchanged: nothing is set in stone. Every number this prompt introduces is a default:
- It is editable on /coin-desk/settings, and recorded in coin_settings_audit.
- It is overridable for a single case.

==================================================================
2. AUDIT PHASE (gates the build)
==================================================================

Confirm or correct each claim, and record each false one.

a. Student coin actions all pass through _coin_student_seam(action) (0241). This includes the identity check, the per-student rate limit, and the debt rule that a purchase must leave the balance >= 0.

b. Settings live in coin_settings plus coin_settings_audit (0240). Section-scoped coin staff were added in 0244. The queue, split payment and payday were added in 0245 and 0246. Number editing went in 0250, and the old system was retired in 0251.
   - The balance is the sum of digital rows.
   - Amounts are numeric(12,2).
   - coin_autopay_run() is the nightly job, and later features hang their daily work on it.

c. The hall pass is migrations 0237 and 0243.
   - The default daily budget is 10 minutes. Auto check-in is per section, with a default of 30 minutes.
   - The warning is logged at 10 minutes and the fine at 20, once per pass. Passes that an instructor opened or closed never fine.
   - The thresholds are the settings hall_pass_warn_minutes and hall_pass_fine_minutes.

d. The /coin-balance student page holds the shop: Eating Pass, Extra Credit, Pay Raise, 3D print, coins out, claims, the role portal and the stats dashboard. There is no marketplace, transfer, stock or banner code anywhere.

e. Top-level routes can collide with short links. The [shortlink] route sits at the root, and later migrations reserve names (0156, 0166, 0196, 0215, 0269). Any new top-level route needs its name reserved the same way, in one of your migrations.

f. No chart library is installed. Charts are plain SVG, as in the session-two stats dashboard.

g. The apply path, as learned in sessions one and two:
   - migrate.yml applies the lowest unapplied migration, then chains to the next.
   - Each migration file must OPEN by creating a genuinely new object, because the production probe reads the first object.
   - A redefined function needs a distinguishing line in its body, or the probe cannot tell it from the earlier version.
   - Top-level insert, update, drop table and drop column are refused. Put data changes inside do $$ ... $$ blocks or functions.

==================================================================
3. INVARIANTS (true of every feature below)
==================================================================

Coins are conserved. A transfer, a trade, an escrow hold, a release, a refund and a fee each write rows that net exactly.
- The only coins that leave the economy are fees, which are sinks logged to a named category.
- No student action can create a coin.
- One db test proves this: run a randomized sequence of every action and confirm that the sum of all balances plus escrow and open positions changes only by the logged fees and the existing faucets.

Every student action:
- goes through the seam
- takes no email and no amount the server cannot check
- validates everything before any charge, so a refused request never costs coins

The debt rule:
- A student below zero can earn, sell and receive transfers.
- They cannot buy, post a paid request, send a transfer, buy minutes or buy shares.

Section-scoped staff moderate only their own sections. Full coin admins moderate everything.

All student-facing text:
- is short and scannable, with detail behind a disclosure
- uses no weekday names, no em dashes, and American spelling
- gives every new fee, limit and rule explanation text in the rules list

==================================================================
4. BUILD
==================================================================

4.1 MARKETPLACE: /market, "one marketplace roof"

Two zones on one page, plus search and class and category filters.

The Official zone, pinned at the top:
- the shop items now on /coin-balance: Eating Pass, Extra Credit, Pay Raise, 3D print
- the donations want-ad
- desktop backgrounds
- open admin contracts, including restitution jobs for students in debt
Each card opens the existing flow; do not duplicate the purchase logic. /coin-balance keeps its Buy section and gains a link to /market.

The Student zone:
- A listing is an offer (a service or product a student sells) or a request (something a student needs done).
- Each listing has a title, a description, a price in coins (decimals allowed), an optional photo through the existing private-bucket upload pattern, a category, and a quantity or "one time".
- Listing limits: up to 5 open listings per student. Listings expire after 14 days and can be renewed.

Escrow, so nobody gets scammed:

  1. Claiming an offer moves the buyer's coins into escrow at once.
  2. The seller delivers and marks it done.
  3. The buyer confirms, and the coins go to the seller, minus the sale fee.
  4. If the buyer neither confirms nor disputes within 5 school days, the coins auto-release to the seller. That run happens inside coin_autopay_run.

- The seller can cancel before delivery, which refunds the buyer.
- Either side can dispute. A dispute is a queue card for staff, who resolve it as release, refund, or a split amount.

A request works the same way in reverse. The requester's coins go into escrow when someone claims the request.

Fee and featuring:
- The sale fee defaults to 0%, editable. It is a sink when above zero.
- Staff can "feature" a student listing, which shows a badge and pins it near the top. Staff can also hide any listing, with a reason the poster sees.
- Only staff can post into the Official zone.
- Admin contracts keep their hourly, flat or quality-adjusted pay types and appear as featured listings.

4.2 REVIEWS

- After a released trade, each side may leave one review of the other: 1 to 5 stars and written text of at least 20 characters.
- A student's profile in the market shows the average stars and the count, and their 10 most recent reviews.
- A review cannot be edited after 24 hours.
- Staff can remove a review, with a logged reason.
- Reviews on refunded or disputed-and-refunded trades are not allowed.

4.3 STUDENT-TO-STUDENT TRANSFERS

- A student sets a 4 to 6 digit PIN once. It is stored hashed (pgcrypto crypt).
- After 5 wrong tries, sending is locked for 15 minutes.
- A transfer goes to any student in the economy, with an optional message of up to 200 characters.
- Limits: 20 coins per day sent, and no sending while in debt.
- Visibility:
  - A transfer is public by default and appears in a transfer feed on the Ledger and on /market: from, to, amount, message.
  - "Private" costs a fee of 10% of the amount, with a minimum of 0.1, as a sink. A private transfer stays out of the public feed. Both parties and staff still see it.
- Staff can remove a message from the feed. The amount record stays.
- Note in decision 70 that the fee rate is to be tuned from telemetry.

4.4 IDEA CLASSROOM HEADER BANNER

- Staff pin one or more items to an animated banner in the IDEA Classroom header. An item can be a featured listing, an official item (such as the tissue-box want-ad or Extra Credit) or a contract.
- Each pin has an optional start and end date and an optional class scope.
- The banner rotates through the pins. A click opens the item.
- A student can dismiss it for the rest of the day.
- It respects prefers-reduced-motion and the site theme, Space White included.
- Build three visual candidates of the banner, selectable on the settings page. Default to the one you judge best and name it. Mr. Pina will pick. Screenshot all three in the history entry.

4.5 BUY HALL PASS TIME

- A student buys extra pass minutes for today in blocks of 5 minutes, at 1 coin per block, with a cap of 15 extra minutes per day.
- Bought minutes add to today's budget. They also push that day's warning and fine thresholds later by the same amount, for passes opened after the purchase. The fine threshold never goes past the section's auto check-in cap.
- Paying never removes a fine that was already posted.
- Buying is available from the hall pass panel and on /coin-balance.
- Write this rule into decision 70.

4.6 STOCK MARKET: /market/stocks

Every price must trace back to real recorded site data.
- Store each daily close with the raw inputs and the formula version that produced it.
- Show those inputs on the stock's page, under "How this price is made".
- Never invent, fill gaps with, or smooth over missing data. A day with no data carries the previous close and says so.

The stocks are defined in code. Staff can switch each one on or off and edit its parameters.

  1. CLASS stocks
     - One stock per economy-on class.
     - The signal is the class grade ratio over the trailing 4 weeks: the sum of (score minus extra credit) over the sum of out-of, on returned work.
  2. FOUNDRY
     - The signal is distinct students active in the IDEA Foundry per day, as a trailing 7-day average.
     - Count people, not minutes, so one student cannot pump the price. Read the Foundry's existing activity data; if none is usable, leave FOUNDRY off and say so.
  3. Up to three more stocks, only where the tree holds clean daily data. Candidates: on-time submission rate, tournament matches played, GAUNTLET runs. List each one you add and each you rejected, with the reason.
  4. IDEA, the master index
     - An equal-weighted index of every active stock, so it tracks the health of the whole platform.

Pricing:
- The price is 10 × (signal ÷ the signal's trailing 8-week median), with daily moves clamped to ±10%.
- Floor 1, ceiling 100.
- Prices update in the nightly coin_autopay_run, on days with data.

Trading:
- The house is the counterparty, at the last close.
- Buy and sell in coin amounts; fractional shares are allowed.
- A 2% fee each way, as a sink.
- Position cap: 50 coins of cost basis per stock.
- Trading only on class days.
- No shorting: refuse it and explain why in the rules list.
- Selling is always allowed.

Display:
- Portfolio value is shown on /coin-balance. It is never counted in the balance.
- A separate portfolio leaderboard sits on /market/stocks.

Charts:
- Each stock shows a plain-SVG price history.
- The IDEA index is on the /market/stocks hero.

Backtest. This is the outside judge for the pricing.
- Write tools/coin-stock-backtest.mjs. It replays the pricing formula over the last 8 weeks of real data, reading through the existing db test harness and fixtures built from the real schema. A container cannot reach production; say what data it used.
- Output each stock's daily series as a CSV.
- Assert that no stock hits the floor or ceiling under normal data. If one does, tune the formula's parameters, not the data, and report the change.
- Commit the CSV under docs/coin-economy/backtests/ and show the chart in the history entry.

4.7 ECONOMY HEALTH

Add three things to the existing digest and stats:
- total coins in circulation
- this week's sinks: fees, purchases and fines, set against faucets
- total coins in escrow and in stocks

Data for this already exists. This piece is display only.

==================================================================
5. CHECKS (targeted while working, full suite once at the end)
==================================================================

tests/db, each with a planted control that makes it fail first:
- the conservation test from section 3
- escrow:
  - claim holds the coins
  - confirm releases them minus the fee
  - cancel refunds
  - auto-release happens after 5 school days
  - dispute release, refund and split each net correctly
- a student in debt is refused every spend path, and can still sell and receive
- review rules: one per side, released trades only, the 24-hour edit lock
- transfers:
  - PIN lockout after 5 wrong tries
  - the daily cap
  - private fee math, with private transfers absent from the public feed
- hall pass minutes:
  - the cap
  - the threshold shift applies only to passes opened after the purchase
  - the threshold is clamped at the auto check-in cap
  - an existing fine stays
- stocks:
  - a close stores its inputs
  - a missing day carries the previous close
  - the clamp holds
  - no short is possible
  - the fee math is right
  - the position cap holds
  - the index is the equal-weighted mean
- scope: section staff cannot moderate outside their sections
- short-link names reserved for every new top-level route

Browser harness: specs at 375 px and 1440 px for /market (both zones), a listing with its escrow states, the review form, the transfer sheet with PIN, /market/stocks with a stock page, the banner (all three candidates) in default and Space White, and the hall pass purchase. Look at every screenshot.

Then run npm run check, and one full npm test at the end. Read the summary line and stderr.

==================================================================
6. DOCS
==================================================================

- Update docs/coin-economy/IDEA_COIN_V2.md with everything built here, and with every default listed in a table.
- Write decision 70 as answered: Mr. Pina chose these six features on 2026-10-17. Record the defaults this prompt set (escrow, auto-release, fees, caps, PIN, hall pass minutes, stock formula, no shorting), so he can change any of them.
- Add one classroom-updates.json entry for students covering the marketplace, transfers, stocks and buying pass time.
- Your docs/history/ entry:
  - what shipped
  - the backtest results
  - the three banner candidates
  - calls you made
  - false claims found
  - anything Mr. Pina must do, which should be only picking a banner, with the exact URL

==================================================================
7. LAND
==================================================================

1. git fetch origin main && git rebase origin/main, applying the renumbering rule if needed.
2. Rerun what the rebase could affect.
3. Push ONCE: git push origin HEAD:main, with the ledger entry inside. Never force-push.
4. migrate.yml applies 0275 upward in order. Every client surface must degrade cleanly (PGRST202/42883) until its migration is applied.
5. Watch for the docs/migrations-applied/ records. If a run refuses, read its log, fix the cause, and push again, until every record says applied.

Report:
- the pushed sha
- the migrations used and each record's outcome
- the version ideabosco.com serves, if this container can reach it
- the backtest summary
- every call you made
- what you could not verify without a signed-in session

==================================================================
8. LEDGER ENTRY: docs/prompt-ledger/entries/0402-idea-coin-later-features.md
==================================================================

# 0402 IDEA Coin later features: marketplace, reviews, transfers, header banner, hall pass time, stock market

- Issued: 2026-10-17
- By: Mr. Pina, via the router chat. In his words: "build out the student marketplace, marketplace reviews, student to student transfers, header banner, buy hall pass time, and the stock market."
- Repo: pina-hash/idea-app
- Owns: (copy section 0's Owns list verbatim)
- Migration permitted: yes. Claims: <the numbers you used>
- Status: pushed
```
