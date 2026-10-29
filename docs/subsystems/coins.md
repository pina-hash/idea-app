# IDEA Coin economy

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Coin write gates and the student seam, the transaction type vocabulary, and the spec rule. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

- **EVERY STAFF COIN WRITE OPENS WITH ONE OF TWO TIER GATES, AND A STUDENT'S
  OWN COIN ACTION GOES THROUGH ONE SEAM, `_coin_student_seam` (0241, IDEA Coin
  V2).** Decision 68 (0244): `_coin_full_staff()` (the owner, plus the
  `coin_full_admins` list, and always `is_admin()` first) gates every full
  power -- settings, amount edits, autopay reversals, contracts, roles,
  tournament transfers, any student; `_coin_staff()` plus
  `_coin_student_in_scope` / `_coin_section_in_scope` gates the section powers
  (fine, Award, queue, payday, digest, student stats) for every other admin and
  every class's teacher of record. **Scope is read from `teacher_email`, never
  from `classroom_manages_section`**, which answers yes for every section to
  any admin. `coin_log_transaction` refuses with 'Only coin staff can log IDEA
  Coin transactions.'; a nested SECURITY DEFINER call does not escape either
  gate, because both read the session's JWT claims. **A new coin function
  that opens with `is_admin()` is the defect**: 0244 and 0251 each sweep every
  `coin_%` function onto `_coin_full_staff()` and 0251's self-check refuses an
  apply that leaves one.
  - **THE SEAM IS THE STATED EXCEPTION, AND IT IS THE RETROFIT THIS LINE USED TO
    NAME.** A student buys an Eating Pass, extra credit, a pay raise or a 3D
    print through `coin_buy_*`, each a definer function that TAKES NO EMAIL AND
    NO AMOUNT: identity is `current_user_email()`, every price comes from
    `coin_categories` and `coin_settings`, every check runs before the charge,
    and the seam rate-limits per student. 0241's self-check refuses to apply if
    any of them names an email, an amount, a cost or a price, and
    `tests/db/coin-v2.test.ts` asserts it on the catalog with the admin logger
    as its positive control. **A new student coin action is a caller of the
    seam, never a second gate.**
  - **AN AMOUNT A STUDENT CHOOSES IS AN ARGUMENT; A PRICE THE ECONOMY SETS IS
    NEVER ONE (ledger 0402, decision 70).** A listing's price
    (`coin_market_post`), a transfer (`coin_transfer_send`) and a stock trade
    (`coin_stock_buy`, `coin_stock_sell`) take the amount the student typed,
    because the student is the one choosing it; the database checks its shape,
    its bounds and the balance before any row moves, and every FEE on them is
    read from `coin_settings`. Hall pass time (`coin_buy_hall_pass_minutes`)
    takes a block COUNT, never a price. A claim takes only a listing id: what
    it costs comes from the listing row. Still no identity parameter anywhere:
    a counterparty is an opaque market id (`_coin_market_pid`), never an
    address.
  - **COINS IN ESCROW ARE ROWS, NOT A STATE ON A BALANCE (0276).** A claim
    writes a `market_escrow_hold` row out of the payer; `_coin_market_settle`
    is the one writer of what happens next (release less `market_fee`,
    refund, or a staff split). `tests/db/coin-market-conservation.test.ts`
    walks a seeded random sequence of every market, transfer, hall pass and
    stock action and holds every balance plus escrow plus stock cost basis
    moving by exactly the logged fees, purchases and house gains, with a
    planted unbalanced release as its control. A new market path writes
    through `_coin_market_settle` or that test is the one that reddens.
  - **AN AREA STOCK IS PRICED FROM THREE OR FOUR REAL COUNTS AND NOTHING ELSE
    (0287).** `_coin_area_metrics` is the one list of what each area's stock
    reads; `_coin_stock_area_signal` turns it into a reading (this week over its
    own four-week average, each softened by 2) and records every count on the
    price change. A new area is a new branch in the first, a new `area:<name>`
    row in `coin_stocks`, and a test that works its signal by hand. An area that
    cannot be read answers "no reading", never an error that stops the tick.
  - **A STOCK PRICE IS A STORED TICK WITH ITS INPUTS, NEVER COMPUTED ON READ
    (0279, relaunched as formula v2 in 0283).** `_coin_stock_price` is the only
    writer: it stores the raw inputs, the signal, what the data said, the day's
    reference and `formula_version` on the day's row in `coin_stock_closes` and,
    when the price changed, a row in `coin_stock_ticks`; a moment with no data
    holds the price with a note. Every caller goes through `_coin_stocks_tick`
    (pg_cron each minute, the stocks page, each trade, `coin_autopay_run`), which
    throttles itself. **The launch ramp and the circuit breakers are stated once,
    in `_coin_stock_rules`**; the board hands that object and each stock's
    worked-out `phase` and `halt` to the page, and the client only puts them into
    words, so a cap or a halt threshold is never written a second time in
    TypeScript. A formula change is a new version string, never an edit that
    rewrites what earlier prices said; and `node tools/coin-stock-backtest.mjs`
    replays it before it ships.
  - **A PRIVATE TRANSFER IS PRIVATE ON EVERY PUBLIC READ.** Its rows carry
    `meta.private_transfer`, and `coin_public_transactions`,
    `coin_public_student` and `coin_public_transfers` all exclude it; a new
    anon read over `coin_transactions` excludes it too.
  - **AUTOMATIC ROWS ARE `system`'S, through `_coin_insert`'s `p_actor`**:
    autopay (0242), the hall pass fine (0243) and the Perfect Score hook in
    `classroom_grade_submission`. `coin_autopay_run` is granted to `anon` on
    purpose: it can only pay what is owed (every kind of pay is a uniqueness
    key), throttles itself and answers counts. Song approval (0145) and the
    tournament award (0212) were the two older non-admin `_coin_insert` paths;
    the tournament one no longer mints (0239).
  - **ONE BALANCE, DIGITAL ONLY.** `_coin_balance` is the digital sum; physical
    rows are history. The spec is `docs/coin-economy/IDEA_COIN_V2.md`, which
    replaces the v3 draft wherever they disagree.

- **No new coin-economy surface without reading the spec.** Every category
  name, price and rule transcribes `docs/coin-economy/IDEA_COIN_V2.md`, which
  replaces `docs/coin-economy/idea_coin_economy_draft_v3.md` wherever the two
  disagree. Prices are DATA now: an admin edits them on `/coin/settings`
  (audited in `coin_settings_audit`), so a price change is not a code change.
  Supabase is the sole system of record for IDEA Coins; there is no second
  ledger.
- **A TRANSACTION TYPE HAS ONE VOCABULARY, ONE TONE AND ONE GLYPH, AND ALL
  THREE ARE KEYED ON `COIN_TXN_TYPES`.** `coinTxnType()` in
  `$lib/coin-format.ts` derives a row's type exactly the way
  `coin_public_transactions` derives it in SQL (0103) and is the ONLY
  derivation -- the category picker asks it too, which is why `coin_payout`
  offers a payout glyph in the list it is chosen from and a payout chip in the
  history it lands in rather than two answers to one question.
  `$lib/coin-desk/transaction-types.ts` adds the presentation over that union
  and nothing else may: a sixth type added to `coin-format.ts` with no entry
  there renders an EMPTY `<svg>` in the tone of `--dim`, which throws nothing
  and type-checks, so `tests/coin-transaction-types.test.ts` asserts both maps
  exhaustive at runtime.
  - **GLYPH PER TYPE, NEVER PER CATEGORY.** Six types against forty-odd
    categories: six silhouettes a reader can learn beats forty they cannot,
    and forty would mean inventing lookalikes, which is worse than no glyph.
  - **A DEPOSIT IS A TYPE READ FROM ITS CATEGORY ID, LIKE A PAYOUT (ledger
    0455, migration 0322).** `coin_deposit` is kind `award` in the price list,
    so every path that treats an award as a credit keeps working, and
    `coinTxnType` and both public reads call it Deposit
    (`COIN_DEPOSIT_CATEGORY_ID`). It is priced `formula`, so only
    `coin_log_deposit` writes it, and that function holds the
    `deposit_minimum` setting (default 5) and writes "Physical to digital" on
    the record. Physical coins stay untracked cash: a deposit adds to the
    digital balance and records nothing physical.
- **A CUSTOM RECORD IS CALLED BY WHAT IT WAS FOR, EVERYWHERE IT IS LISTED
  (ledger 0455, report 65c46fcf).** `coinRowLabel` in `$lib/coin-format.ts` is
  the one rule for a list: a Custom Award, Fine or Purchase
  (`COIN_CUSTOM_CATEGORY_IDS`) shows its note, every other row its category
  name. The public reads (`coin_public_transactions`, `coin_public_student`)
  make the same choice in SQL, cut to 120 characters; that widened a public
  payload by Mr. Pina's own request, for those three categories only, and
  every other row's note stays off the public reads.
- **A COIN RECORD'S NOTE IS THE REASON, NEVER THE REQUEST (ledger 0455, report
  3bcf3c90).** On the connector `said` is the request, kept in its own log;
  `decideCoin` makes a note only from the `reason` passed with the call, and a
  Custom record or a category priced by hand with no reason asks and writes
  nothing. A past record's note or category is corrected through
  `coin_transactions_relabel` (full coin admin, all or nothing, amounts
  untouched, every change kept in `coin_relabel_log`), never by a reversal
  and a new record.
  - **COLOUR IS NEVER THE ONLY SIGNAL AND NEVER THE ONLY THING THAT MOVED.**
    Every place a type is rendered carries the glyph, the tone AND the type's
    own word; the glyph is `aria-hidden` precisely because the word is always
    beside it.
  - **THE PICKER IS IN `coin_categories.sort_order`, THE ORDER AN ADMIN SETS
    ON ECONOMY.** It used to be sorted by a static use-count table derived
    from the retired Sheets ledger's export; IDEA Coin V2 session two (ledger
    0386) retired that table, because a frozen count of the old ledger was
    ranking a category list it no longer described. A live per-category tally
    is still a query the desk does not make.
- **EVERY COIN PAGE CARRIES ONE IDEA COIN BAR, AND `COIN_PAGES` IS ITS ONE
  LIST (ledger 0422).** `src/lib/coin-bar/CoinBar.svelte` sits under the header
  of My coins, the role page, the Market, Stocks, a stock's page and the staff
  areas; `src/lib/coin-bar/pages.ts` holds the tabs (`COIN_PAGES`,
  `coinPagesFor`) and `coinPageFor` names the current one. A new coin page
  joins that list, never a second bar. The tabs wrap and never scroll, the
  lesson the Ledger's own spec recorded.
  - **THE STAFF TOOLS TAB IS THE STAFF AREAS' OWN GATE.** `coinBarDesk` in
    `src/lib/server/coin-bar.ts` asks `coinStaff`, so the tab is offered
    exactly to the people the staff areas open for; signed out is false with
    no call, and any error is false (it fails closed).
  - **THE COIN DESK IS PART OF THE COIN HOME (ledger 0432, Mr. Pina
    2026-10-23).** Its areas are `/coin/<area>` (the `(staff)` route group
    under `src/routes/coin/`, gated once in its `+layout.server.ts`, 404 to
    anyone who is not coin staff), listed by `COIN_DESK_AREAS` in
    `src/lib/coin-desk/nav.ts`; the coin home's Staff tools card and the bar's
    Staff tools tab are the way in, and there is no launcher tile. Every old
    `/coin-desk` address answers a 308 from
    `src/routes/coin-desk/[...path]/+server.ts` through `coinDeskRedirect`: an
    area to its new address, anything else to `/coin`. A new staff area joins
    `COIN_DESK_AREAS` and the group, never a second desk.
  - **THE FROZEN LEDGER GETS THE REAL COMPONENT AT SERVE TIME.**
    `injectCoinBar` server-renders the bar under the Ledger's header and adds
    its stylesheet, so the Ledger file stays byte-identical (the freeze in
    `docs/subsystems/legacy-content.md`). The bar's site tokens
    (`COIN_BAR_TOKENS`) are re-declared INSIDE `.coin-bar`, read out of the
    design system's own stylesheets by `coinBarTokenCss`, because the Ledger
    defines `--green` and `--white` as its old neon set and a bare
    `var(--green)` would resolve to that. A page with no header or head comes
    back unchanged, so the bar is never half-added.
  - **`/coin` IS THE COIN HOME AND IT IS PUBLIC.** One preview card per coin
    page, each card a single link, each preview its page's own read run best
    effort (`src/routes/coin/+page.server.ts`, `coinHomeFrom`). Signed out,
    the Ledger's card comes from the public board and every other card asks
    the visitor to sign in. `coin` is a reserved short-link name (0292).
- **EVERY IDEA MARKET CARD HAS ONE FEATURED STATE, AND THE TILE KEY NAMES IT
  (ledger 0425, migration 0294).** The Official zone draws cards that are not
  listings (the shop's tiles, want-ads, contracts, the background card) next
  to official listings, and `officialTiles` in `src/lib/coin-market/official.ts`
  keys each one (`shop:eating_pass`, `donation:<id>`, `contract:<id>`,
  `background`). A switch staff set is a row of `coin_market_card_features`
  under that key; no row is the default (contracts featured, the rest not). A
  listing, official or student, keeps its own `featured_at`, and
  `coin_market_card_set_featured` sends it through `coin_market_listing_staff`
  rather than restating that function's scope rule. Switching a card that is
  not a listing is a full coin admin's, because it shows in every class.
  - **A NEW KIND OF OFFICIAL TILE NEEDS ITS KEY IN TWO PLACES:**
    `FIXED_CARD_KEYS` (or a prefix) in `official.ts` and 0294's check
    constraint and `_coin_market_card_exists`, in a new migration.
    `tests/db/coin-market-cards-0294.test.ts` holds the fixed list equal to
    the file's.
  - **"FEATURE ONLY THESE" IS ONE CALL.** `coin_market_cards_feature_only`
    checks every card named before it writes, so an unknown card refuses the
    whole call; staff list every card, with its id, through
    `coin_market_cards_admin`.
- **CONTRACTS ARE RETIRED (ledger 0432, migration 0296, Mr. Pina
  2026-10-23: "everything is on the marketplace now").** Every contract was
  closed with nobody paid again, every contract write function lost its
  client grant, and the coin page, the Market, the staff areas and the
  connector carry no contract surface. Jobs are official cards on the IDEA
  Market. The reads (`coin_my_contracts`, `coin_contracts_admin`) stay so old
  history still renders; a new contract surface is a decision, not a fix.
- **A STUDENT ACTION IS NEVER A STAFF TOOL, AND THE SEAM SAYS WHO ASKED
  (ledger 0432, gap 3f52bae9).** `_coin_student_seam` answers `staff_account`
  to coin staff (0296), never `not_in_economy`, which is what a student
  action run as Mr. Pina used to say. For the connector, `CALLER_SEAMS` in
  `tools/connector/gates.mjs` stops the gate walk at the seam and marks every
  function reaching it `acts_as_caller`, which the generated layer excludes;
  on 2026-10-23 that took 21 student coin actions off the generated tools.
  `tests/connector-coverage.test.ts` holds every such function off the
  connector, with an admin coin write as the control.
