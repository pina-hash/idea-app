# IDEA Coin V2

Status: session two built (ledger 0384, 2026-10-14/15; ledger 0385,
2026-10-15). This document is the coin spec as built. Where it disagrees with `idea_coin_economy_draft_v3.md`,
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
- Every write is digital, and no writer takes a medium any more: 0251 removed
  the `p_medium` argument from every coin RPC. The one physical row a new
  write makes is the history row of a split payment's physical part (section
  11.2), which counts toward nothing.
- No surface shows awarded, fines, spent, paid out, lifetime earned, a separate
  debt figure, or physical and digital balances. A negative balance is debt.
- Amounts are `numeric(12,2)`. A whole number displays bare; anything else
  shows two decimals (`coinNumber` in `$lib/coin-format`).

## 2. Debt rules

- A purchase is refused before any charge unless the balance after it is zero
  or more. Song approval follows the same rule.
- Fines and awards post at any balance.
- Debt payment: physical coins handed over are credited digitally as
  `debt_payment`, from the Payday screen (section 11.3). The old Debt area is
  gone; Payday lists every student in debt per class.
- A purchase may be paid partly in physical coins (a split payment, section
  11.2); a student in debt cannot split.

## 3. Who can do what

- Two tiers of coin staff (decision 68, 0244). A full coin admin (the owner
  and the list on `/coin-desk/settings`) has everything; section coin staff
  (every other site admin, Mr. Cosso included, and every class's teacher of
  record) work the fine screen, Award, the queue, payday, the digest and
  student stats for their own sections' students only. Full powers open with
  `_coin_full_staff()`; section powers with `_coin_staff()` plus a scope
  check (`_coin_student_in_scope`).
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
economy-on sections), through `_coin_economy_enrollments` (0239). Roles and
contracts moved onto classroom sections too (0247, 0248). The old
`coin_sections`, `coin_section_students`, `coin_students` and the two import
tables drive nothing; 0251 revoked every grant on them (section 11.12).
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
- Quality Desktop Background 2 (one approved per two weeks, section 11.5),
  Weekly Role Stipend 1 per week (paid every two weeks by autopay, section
  11.4), Above and Beyond 1 to 3, donations (section 11.6), Correct Answer 1
  (daily cap), Contract Completion, Debt Payment, Debt Relief (section 11.10).
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
  Print time is never charged. A recorded spool (default 1000 g) is drawn
  first and only the rest is charged (section 11.11).
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

## 10. Not built

- Enrollment history: wage eligibility uses the CURRENT active enrollment and
  its start date, so a student who left before a run is not paid for weeks
  they were enrolled.
- A teacher seeing a student's custom material (IdeaCAD) is unrelated and
  still open.

## 11. Session two (ledger 0385)

Every number below is a default on `/coin-desk/settings`; every automatic
decision has a manual override.

### 11.1 The queue (`/coin-desk/queue`, 0245)

One list of everything a student submits: desktop backgrounds, donations,
contract completions, role-evidence exceptions, split-payment confirmations,
reported physical balances and fine disputes. One `coin_requests` table and
one decision function (`_coin_decide`). Approve or deny with one tap; a
denial's reason is shown to the student. Filter by kind; Approve All per kind.
Section staff see their own students only. Nothing expires. A student may
cancel their own pending card.

### 11.2 Split payment (0246)

Every purchase may be paid partly digital and partly physical. The digital
part is charged at once under the balance-stays-at-or-above-zero rule (as
`split_payment`); the physical part becomes a queue card. On approval the
item is granted and a physical-medium history row of the item's category is
written; on denial the digital part is refunded by a reversal. A student in
debt cannot split. One pending split per student.

### 11.3 Payday (`/coin-desk/payday`, 0246)

A student asks for coins out, up to their balance; the coins are held at once
(a `payout_hold` row) and paid on payday, by default the first class day of
each month (`payday_dates` lists exceptions). The screen goes one class at a
time: the requests, and every student in debt. Hand the coins out, untick
anyone absent, press Done once: each ticked request becomes the two-row payout
transfer, and an unticked one rolls to the next payday. A debt paid in coins
posts `debt_payment`.

### 11.4 Roles are evidence jobs (`/coin-balance/role`, 0247)

Each class has its own cap (default 1 per role) and its own on and off switch
(`coin_role_class_settings`). A student applies as before and Mr. Pina
accepts. Role types are fixed in code. A holder proves each class day with a
live start photo and a live end photo (`role_photos_per_day` 2), taken in the
browser with the camera (no camera roll), stamped by the server, inside the
school-day window (07:00 to 16:00 Los Angeles), with the end at least
`role_min_gap_minutes` (45) after the start on the same day. A day that meets
the rules passes automatically; an instructor can pass or fail any day, and
the variables are global or per holder. Pay is 1 coin per week, paid every two
weeks by `coin_autopay_run`, prorated by valid days over required days, where
required days are the weekdays in the pay weeks minus the no-class list
(prefilled 2026-11-11, 2027-01-04, 2027-01-18, 2027-02-15, 2027-03-15,
2027-04-23, 2027-04-26, 2027-05-31) and, where a class has a Foundry
schedule, the days it does not meet. Absence is never checked. The manual
stipend button stays as an override. Roles are a public badge on the Ledger
and on the class People list.

### 11.5 Desktop backgrounds (0245)

A student submits a picture from `/coin-balance`, with the guidance and an AI
prompt starter beside it. The floor is 16:9 at 1920 by 1080 or more, and at
least 100 KB per megapixel; anything below the floor is refused at once. One
approved background per 14 days; a denied one does not count. Award 2. The
current approved background is shown on the student's page.

### 11.6 Donations (0245)

An admin keeps a want list (name, rate, photo, active), prefilled with a small
square tissue box (1) and a large rectangular tissue box (2). A student claims
an item, a quantity and a photo; Other is priced at approval. Cap 10 coins per
14 days: over the cap pays up to the cap and says so.

### 11.7 Contracts (0248)

Pay type is hourly, flat or quality, set at posting and editable at approval.
A student marks a job done, which makes a queue card. A restitution job is
debt-only: visible and claimable only while the balance is below zero.

### 11.8 Tournament transfers (`/coin-desk/tournaments`, 0248)

Concluded tournaments with rewards awaiting transfer, each amount prefilled
from what was earned (placement defaults 3, 2, 1 where the tournament has no
rule) and editable. A team's award is duplicated to every member by default,
or split. Transfer posts `competition_winnings`, full admin only, after one
confirmation. Paid physically moves nothing and records that it was paid. The
record is kept (`coin_tournament_settlements`) and the tournament page says
which. Walk-up entries with no account are listed and skipped.

### 11.9 Reported physical balance and the Student Auditor (0245)

A student reports how many physical coins they have. An admin or a Student
Auditor validates it; admins assign auditors, an auditor can never validate
their own report and cannot pass the role on, and the validator's name is
kept. Revocable. The Ledger shows "coins on hand (reported, date)"; the
leaderboard ranks the digital balance only.

### 11.10 Disputes and deep debt relief (0245, 0249)

A student may dispute an automatic fine; approval reverses it. At each quarter
close (2026-12-18, 2027-03-12, 2027-06-03) a student below zero with no fines
in the quarter has their debt halved by one `debt_relief` row from autopay
(the first quarter counts fines after 2026-10-15). Restitution jobs are the
other way out. A student below -20 for 3 straight weeks is listed in the
digest as chronic debt. Fines stay full price.

### 11.11 Digest, stats, edits and spools (0249, 0250)

- `/coin-desk/digest`: autopay paid this week (each reversible), gainers over
  10, chronic debt, the queue count, money in against money out, section
  scoped. Staff who switch it on get a push on Friday afternoon.
- Stats: balance over time, weekly earn and spend, totals by category, and
  every fine, award and purchase, for a student on `/coin-balance` and for
  staff in scope. Exports per student, per class, and the whole economy (full
  admin only) as raw rows.
- A full coin admin can edit any past amount: a linked `amount_correction`
  row (meta carries the original id and the old and new amounts), shown as
  edited with the old values viewable, and undoable.
- 3D printing: cash is history only. A recorded spool is a grams credit
  (default 1000 g), drawn before coins; the student sees their grams.

### 11.12 Retired (0251)

The section RPCs, the legacy import functions, the old payout, contract and
role-list functions and the medium arguments are dropped. Tables cannot be
dropped by the apply tool, so the five dead tables are revoked by name and
listed with their drop statements in the session-two history entry.
