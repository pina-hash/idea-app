# IDEA Coin V2

Status: session one built (ledger 0383, 2026-10-14/15). This document is the
coin spec as built. Where it disagrees with `idea_coin_economy_draft_v3.md`,
this document wins.

Governing rule: nothing is set in stone. Every value, rule and automatic
decision has a manual override, as a global default (on `/coin-desk/settings`)
and for a single case (Undo, a manual log, a no-shop toggle).

## 1. One balance

- The digital balance is the only number a student has. It is the sum of the
  digital rows in `coin_transactions` (`_coin_balance`, migration 0239).
- Physical coins are untracked cash. Mr. Pina hands them out and takes them in
  with no logging. Physical rows from before V2 stay in the history and count
  toward nothing.
- The cutover wrote no rows: the starting balance is the old digital balance.
- Every write is digital. RPCs still accept a `p_medium` argument so an old
  client resolves, and refuse anything except digital.
- No surface shows awarded, fines, spent, paid out, lifetime earned, a separate
  debt figure, or physical and digital balances. A negative balance is debt.
- Amounts are `numeric(12,2)`. A whole number displays bare; anything else
  shows two decimals (`coinNumber` in `$lib/coin-format`).

## 2. Debt rules

- A purchase is refused before any charge unless the balance after it is zero
  or more. Song approval follows the same rule.
- Fines and awards post at any balance.
- Debt payment: physical coins handed over are credited digitally as
  `debt_payment` (Coin Desk, Debt payment panel).
- A purchase paid in physical coins is recorded as a physical-medium purchase
  row (history only, no balance change) and is refused while the balance is
  negative (`coin_record_cash_purchase`).

## 3. Who can do what

- Every admin coin write still opens with `is_admin()`.
- Student actions go through ONE seam, `_coin_student_seam(action)` (0241):
  identity from the session, prices from `coin_categories` and
  `coin_settings`, every check before the charge, a per-student rate limit
  (`student_actions_per_minute`, default 10). No student function takes an
  email or an amount. A student is in the economy when they hold an active,
  non-manager enrollment in an active classroom section whose economy is on.
- `coin_autopay_run` is granted to anon and authenticated: it takes nothing
  that names a person or an amount, can only pay what is owed, throttles itself
  and answers a non-admin with counts.

## 4. Rosters

Every live feature reads `classroom_enrollments` (active, non-manager,
economy-on sections), through `_coin_economy_enrollments` (0239). The old
`coin_sections` and `coin_section_students` are history and drive nothing new.
A student in two sections is one coin account: one wage, and Highest Grade and
extra credit are per class.

## 5. Prices and rules (defaults; all editable)

### Fines (the fine screen's buttons, in order)

| Button | Category id | Default |
|---|---|---|
| Shop Safety (also: no shop for the rest of the day) | `shop_safety_violation` | 12 |
| Coin Integrity | `coin_theft` | 12 |
| Classmate Trust | `classmate_trust_violation` | 5 |
| Eating (strike logic kept) | `eating_violation` | 5 |
| Left Without Permission | `leaving_without_permission` | 5 |
| Property Damage | `property_damage_first_accident` 0 / `property_damage_repeat_accident` 5 / `property_damage_careless` 3 + 1 per $0.25 | |
| Disruptive | `disruptive_behavior` | 3 |
| Printer Not Reset | `printer_not_reset` | 3 |
| Off-Task | `off_task_device_use` | 2 |
| Inappropriate Screen Content (new) | `inappropriate_screen_content` | 2 |
| Classroom Standards | `classroom_standards_violation` | 1 |

Merged categories set inactive (history kept): `shop_not_cleaned_up`,
`mint_tampering_known`, `unauthorized_printing`. Property Damage: an accident
is free the first time in a semester and 5 after; careless asks the cost.

Automatic: Long Hall Pass (`long_bathroom_break`, 2) at 20 minutes, with a
logged warning at 10 (decision 67).

### Awards

- Weekly Wage: 1 x wage tier, per completed school week, automatic.
- Highest Grade in Section: 2, per class per period (2 weeks), automatic.
- Perfect Score: max(1, round(out-of / 25)), automatic, per toggled posting.
- Quality Desktop Background 2 (monthly cap), Weekly Role Stipend 2 (every
  two weeks by the existing button), Above and Beyond 1 to 3, donations,
  Correct Answer 1 (daily cap), Contract Completion, Debt Payment.
- Competition winnings: no longer minted by a tournament (section 9).

### Purchases (a student buys these on `/coin-balance`)

- Eating Pass 150, refused if one is already active.
- Extra Credit 2 per point, capped per class at 2% of that class's total
  out-of over this semester's posted assignments (purchases this semester in
  that class count against it). Points are added to the chosen returned
  submission's `extra_credit`; a regrade can never take bought points away;
  extra credit never counts toward Highest Grade or Perfect Score.
- Pay Raise 100 x current tier, raises the tier by 1 (the weekly wage only).
- 3D print: round half up (grams / 10), material HIPS, generic ABS profile.
  Print time is never charged.
- Song Request 2 (approved by the teacher in class).
- Hidden or inactive: Platform Cosmetic Unlock, Text Printing, Physical Coin
  Submission. Coin Payout is not loggable; the Economy payout transfer stays.

Every active fine, award and purchase carries explanation text
(`coin_categories.explanation`), shown in the rules list and the Ledger guide.

## 6. Autopay

`coin_autopay_run()` (0242) pays everything owed and nothing more. Runs: a
Vercel cron once a day (`vercel.json`), a GitHub Actions schedule
(`.github/workflows/autopay.yml`) as a second nightly call, and a catch-up on
every coin page load. Pause switch stops all of it.

- Weekly Wage: once per completed Monday-to-Sunday Los Angeles week from the
  start date (default 2026-10-12), skipping weeks on the no-pay list and weeks
  starting after `no_pay_after` (2027-06-04), to students enrolled in an
  economy-on class by that week's end. Key: (student, week).
- Highest Grade: per economy-on class and completed period (default 2 weeks
  from anchor Monday 2026-10-12): top ratio of (sum of score minus extra
  credit) / (sum of out-of) over returned work this semester, ties all paid,
  no returned work excluded, a period skipped only if every week in it is
  no-pay. Key: (class, period) evaluated once, winners keyed (class, period,
  student).
- Perfect Score: on a posting whose toggle is on, when score minus extra credit
  reaches out-of. Hooked inside `classroom_grade_submission` (single, bulk,
  Documentation Check) and settled nightly. A lower regrade posts one reversal;
  back to full re-pays. Key: one state row per submission.
- Every automatic row's actor is `system` and its period is in `meta`.
- The Coin Desk home lists recent autopay rows with a one-tap reversal each.

No-pay weeks (default, by Monday): 2026-11-23, 2026-12-21, 2026-12-28,
2027-03-29, and every week after 2027-06-04. Semesters: fall 2026-08-17 to
2026-12-18, spring 2027-01-05 to 2027-06-03.

## 7. Fine screen

`/coin-desk/fine` (phone first, home-screen shortcut in the manifest) and the
same component in the Live tab. Lands on the class in session (the Foundry
class schedule) or the last class used. Tap a student (press and hold for
several), tap a fine: it posts. A 10-second Undo posts a reversing row
(`coin_reverse_transaction`); no row is ever deleted and undone pairs collapse
in history. An Award button gives any active award.

No shop today (`coin_no_shop`): written by the Shop Safety fine, editable by
an admin, shown on the fine tile, the live panel and the student's own page,
lapses at the end of the Los Angeles day.

## 8. Grading

- "Score out of N" (`classroom_grade_direct`) sets the score of record with
  or without a rubric (`classroom_submissions.direct_score`). Works in single
  and bulk grading; the CSV reads the score of record.
- The Perfect Score toggle is per class posting
  (`classroom_postings.perfect_score_award`, default off).

## 9. Tournaments

`_tournament_award` no longer mints coins. Each earned amount is still
recorded in `tournament_reward_ledger` with `coin_transaction_id` null and
`awaiting_transfer` true. Mr. Pina awards the coins after the event. Nothing
already paid is clawed back.

## 10. Session two (not built here)

- The admin transfer screen for tournament rewards awaiting transfer.
- The full autopay digest (session one shows a simple runs list).
- Enrollment history: wage eligibility uses the CURRENT active enrollment and
  its start date, so a student who left before a run is not paid for weeks
  they were enrolled.
- A teacher seeing a student's custom coin history beyond what the Coin Desk
  shows an admin.
