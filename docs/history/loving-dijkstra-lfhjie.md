---
title: "Ledger 0384: IDEA Coin V2, session one: one digital balance, the student seam, the fine screen, autopay, and the Ledger overhaul (`claude/loving-dijkstra-lfhjie`)"
date: 2026-10-15
branches: [claude/loving-dijkstra-lfhjie]
migrations: ["0239", "0240", "0241", "0242", "0243"]
subsystems: [Coins, Classroom, Grading, Hall pass, Tournaments, Ledger]
---

One unattended run (Mode: solo) building IDEA Coin V2 session one from Mr.
Pina's spec, five migrations (0239 to 0243), straight to `main`. Mid-run Mr.
Pina added a note: overhaul the public Ledger visually so it takes the site's
geometry and works with its themes while keeping its own look. That is built
too (section 7).

## 1. What shipped

- **0239, one balance.** `_coin_balance` is the digital sum; physical rows are
  history. Every coin amount is `numeric(12,2)` (`coin_transactions.amount`,
  `coin_categories.amount/min_amount/max_amount`; `coin_balances` dropped and
  recreated). `_coin_insert` takes a numeric amount and an optional actor
  (`system` for every automatic row). Every admin logger is rewritten digital
  only (a `p_medium` other than digital is refused in words) with the V2
  purchase rule: refused before any charge unless the balance after is zero or
  more. The public projections answer the balance alone (leaderboard columns:
  id, name, section, balance, wage, tier, eating pass), the transaction feed is
  digital rows with `category_id`, undone pairs left out. Song approval obeys
  the purchase rule (0145 allowed an overdraw). `_tournament_award` records the
  reward with `awaiting_transfer` and mints nothing. The catalogue: an
  `explanation` column written for every active fine, award and purchase; the
  fine-button merges (merged categories set inactive, never deleted);
  `inappropriate_screen_content`; a `reversal` category with a unique index so
  a row is reversed at most once; the V2 default prices. `coin_settings`,
  `coin_settings_audit` and `coin_no_shop` are created here. The roster for
  every live feature is `_coin_economy_enrollments` (active, non-manager,
  economy-on classroom sections; `classroom_sections.coin_economy_on`).
- **0240, settings and the fine screen.** `coin_settings_get/set`,
  `coin_settings_set_category`, `coin_settings_set_section_economy` (every
  change audited), `coin_fine_sections/roster/log`, Undo
  (`coin_reverse_transaction`: a reversing row that also puts back a no-shop
  bar, a pay raise's tier or bought extra credit), `coin_debt_list`,
  `coin_record_cash_purchase` (a physical purchase row, refused in debt),
  `coin_no_shop_set/today`.
- **0241, the student seam.** `_coin_student_seam` is the one authorization
  for a student coin action (session identity, economy membership, a per-minute
  rate limit). `coin_buy_eating_pass`, `coin_buy_pay_raise`, `coin_buy_print`,
  `coin_buy_extra_credit` and `coin_my_page` take no email and no amount; the
  migration refuses to apply if one ever does.
- **0242, grading and autopay.** `classroom_submissions.direct_score` and
  `classroom_grade_direct` ("score out of N", with or without a rubric);
  `classroom_grade_submission` (same signature) honours it, keeps bought extra
  credit, and settles Perfect Score after every write (best effort).
  `classroom_postings.perfect_score_award` with its toggle and read.
  `coin_autopay_run` (wage, Highest Grade, Perfect Score), each keyed for
  uniqueness, throttled, granted to anon on purpose; `coin_autopay_recent`.
- **0243, the hall pass (decision 67).** Warned at 10 minutes, fined at 20,
  once per pass, never an instructor's pass, judged on close; checked on the
  sweep, `close_mine` and `close_by_id`; `classroom_hall_pass_events`.
- **Client.** The Coin Desk (one balance everywhere, Undo, Settings, Debt,
  Autopay runs, student tools: no-shop toggle, cash purchase, Eating Pass),
  the fine screen (`/coin-desk/fine` plus the Live tab panel, the manifest
  shortcut), the student page `/coin-balance` (balance, pass, no-shop, history,
  rules, four purchases), grading (the score field in single and bulk, a Coins
  panel with the Perfect Score toggles), hall pass history with warnings and
  fines, the tournament rewards copy, the Ledger (section 7), the nightly route
  `/api/coin/autopay` with a Vercel cron and `.github/workflows/autopay.yml`.

## 2. Calls I made

- **The ledger entry is 0384, not the 0383 the prompt named.** Another session
  pushed `0383-frc-announcements-tool.md` to `main` before this bundle landed,
  the apply tool refuses a duplicated ledger number (Migrate run 181 refused
  0239 with nothing sent), and the FRC entry is not this bundle's to edit. Every
  "ledger 0383" this bundle wrote now reads 0384.

- **Autopay is granted to anon, and the route holds no credential.** The only
  verifiable no-secret scheduler is a public URL. The function can only pay
  what is owed and answers counts; a second WRITER of the migration credential
  (a workflow running SQL) is the thing CLAUDE.md forbids, so that was out.
  Two schedulers call it (Vercel cron 10:17 UTC, GitHub Actions 11:23 UTC);
  idempotence makes the redundancy free. A daily Vercel cron is valid on every
  plan; I could not read the plan from here, which is why the second exists.
- **The balance function keeps its name and arguments.** `p_medium` null and
  'digital' both answer the digital sum; 'physical' still answers the history
  sum for a reader that asks by name. No conversion rows.
- **Old clients:** `p_medium` parameters are kept (renamed nowhere) so a
  deployed client resolves; a non-digital medium is refused with "IDEA Coins are
  digital only now. Reload the page." Argument types that changed (integer to
  numeric) were dropped at the old signature first.
- **Wage eligibility uses the current active enrollment and its start date**
  (`enrolled_at <= week end`). There is no enrollment history to ask; a student
  who left before a run is not paid for earlier weeks. Recorded in the spec as
  session-two work.
- **Highest Grade ratio** is cumulative over the semester up to the period's
  end; "this semester" for an item is its due date, else its first publish,
  else its creation (`_coin_item_day`). A period is evaluated once.
- **Perfect Score respects the pause switch**, like all autopay; the nightly
  run settles it after a pause ends. An admin's manual reversal of a Perfect
  Score row sticks (the state row still reads paid).
- **The hall pass is judged when it is CLOSED**, so "an instructor closed it"
  is knowable. A pass that started before 0243 was applied is never judged. A
  class with its economy off is warned, never fined.
- **Bought extra credit cannot be removed by a regrade**: the stored extra
  credit never drops below the purchased total for that submission.
- **Extra credit cap** is floor(2% of the class's total out-of this semester).
- **Pay raise and print are formulas read from settings**
  (`pay_raise_cost_per_tier` 100, `print_grams_per_coin` 10); the 3D print's
  hours argument is kept for old clients and never charged.
- **The catalogue and explanations are seeded once.** A re-paste never
  overwrites an admin's edited price or wording (`v2_catalogue_applied`).
- **Physical Coin Submission is set inactive**: physical coins are untracked.
- **`/coin-balance` is a real page** (it was a 308 to the Ledger), reached from
  the profile menu's new "My coins" link, inside the site plate's scope.
- **The Ledger follows the site theme**, Space White included: `/coins` joined
  `THEME_SCOPE_PREFIXES` on Mr. Pina's mid-run note that theme compatibility
  is very important. Signed-out visitors keep the default, as everywhere.
- **The Ledger's analytics keep counts only**; no awarded, fined or spent sum
  appears anywhere.
- **Undo on the fine screen** reverses every transaction the press posted.
- **A student in debt** sees the balance drawn in amber (crimson is reserved
  for live and error) with "In debt" in words.

## 3. Claims in the prompt that were false or incomplete

- Claim 6 is incomplete: "out of" equals the rubric total or the item's points,
  but before V2 an item with no rubric could not be graded at all
  (`classroom_grade_submission` raised "Create a rubric for this assignment
  before grading."). The direct score is now the way to grade one.
- Everything else checked out against the tree: the digital/physical model and
  `_coin_balance` (0096), integer amounts, the admin-only loggers with song
  approval (0145) and the tournament award (0212) as the two direct
  `_coin_insert` paths, the per-medium debt lockout on already-negative only,
  the lazy hall pass sweep absent from both close paths, the 0143 and
  `hall-pass.ts` "no coin link" statements, the single writer of `returned`,
  `coin_section_students` keyed on email with no classroom foreign key, the
  Ledger's reason-string Eating Pass badge and wage + 1 display, no scheduler,
  and the apply tool's refusals (destructive DDL and top-level DML; `drop
  function` and `alter column type` allowed).
- Not checked: that any signed-in user can create a tournament (0062); the
  test fixtures create one as a staff account.

## 4. Measured

- `tests/db/coin-v2.test.ts`: 35 tests over the whole tree plus a cutover
  suite that seeds real rows through the PRE-V2 RPCs (both media) and applies
  the five files over them, then re-applies them. Mutation proof (each file
  copied and restored from the copy, md5 checked): a balance that counts
  physical rows, an instructor pass that is fined, an overdraw that is allowed
  and an ignored wage key each reddened (1, 3, 2 and 1 failures).
- Whole-tree suites that apply every migration: the anon-execute allowlist
  gained `coin_autopay_run` with its reason (24 names), the sequence sweep's
  denominator went from 4 to 7 (three new sequences, each revoked), and the
  applied-record test now asserts a gap-free PREFIX (a bundle's migrations are
  legitimately unrecorded in the minutes between push and apply).
- `svelte-check`: 0 errors, 35 warnings in 19 files (31/3/1), down from
  37/20: two unused selectors left coin files.
- Browser (harness Chromium, 375/390 and 1440): fine screen 76 checks, the
  student page 96, grading 62 plus a 358-check regression, the Ledger 74 plus
  a contrast walk in IDEA, Matrix and Space White (worst 5.21, 5.31 and 4.62 to
  1, nothing under 4.5, nothing under 44px, no overflow). Screenshots were
  looked at, not only measured.

## 5. Not verified

- Nothing ran against production or a signed-in session: no RPC was called on
  the real database, and every surface was driven through its `/dev` harness
  over an in-memory backend.
- The press-and-hold multi-select on a real phone (driven with a mouse).
- The Vercel cron's first firing; that is visible in the Vercel dashboard and
  in `coin_autopay_runs` after the first night.

## 6. For Mr. Pina

Nothing is required. The economy pays on its own from Monday 2026-10-19 (the
first completed week after the 2026-10-12 start). Prices, the pause switch,
no-pay weeks and the hall pass thresholds are on
https://ideabosco.com/coin-desk/settings.

## 7. The Ledger overhaul (Mr. Pina's mid-run note)

Kept: the neon-terminal identity, its fonts and glow. Taken from the site: the
plate geometry (raised keys for anything pressable, a lit key for the current
tab, recessed tags for status, plate cards, inset inputs, the 11px label floor,
44px targets), the site's theme (Space White light twins with lightness-only
moves, every ink measured), and a legibility pass (`--dim` raised from 4.0 to
over 4.5 to 1, the hardcoded fine red moved onto the token). Known cosmetic
gaps: the champion card's gold rim does not show in Space White, and the Print
key wraps to its own line at 1440.
