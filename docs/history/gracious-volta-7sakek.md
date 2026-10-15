---
title: "Ledger 0386: IDEA Coin V2, session two: staff tiers, the queue, split payment, payday, role evidence, and the old model retired (0244 to 0251) (`claude/gracious-volta-7sakek`)"
date: 2026-10-15
branches: [claude/gracious-volta-7sakek]
migrations: ["0244", "0245", "0246", "0247", "0248", "0249", "0250", "0251"]
subsystems: [Coins, Coin Desk, Tournaments, Classroom, Migrations, Legacy]
---

Mr. Pina issued "IDEA Coin V2, session two (finish the system)" through the router
chat, solo mode, while not watching. It was issued as ledger 0385; another session
had pushed `0385-armory-closeout-open-items.md` to `main` first, so this entry took
the next free number, 0386 (the certification portal session holds 0390 and 0391).
The governing rule from the prompt: every value, rule and automatic decision is
editable on `/coin-desk/settings` and overridable per case.

## What shipped

Eight migrations, applied in order by `migrate.yml`, each opening with a genuinely
new table so the probe can speak for it:

| Migration | What it does |
| --- | --- |
| 0244 | Two tiers of coin staff (decision 68): `coin_full_admins`, `_coin_full_staff`, `_coin_staff`, the scope helpers, `coin_staff_scope`; every coin function that opened with `is_admin()` swept onto `_coin_full_staff()`; the fine screen, logger, reversal, lookup, no-shop and debt list rewritten section-scoped. |
| 0245 | The queue (`coin_requests`, one `_coin_decide`), the new settings keys and their seeded defaults, the `donation` and `amount_correction` categories, the donation want list, Student Auditors, the private `coin-uploads` bucket (20 MiB, raster only, own folder), and the student submissions: background, donation, reported coins, fine dispute, cancel. |
| 0246 | Split payment (`coin_buy_split`, `_coin_decide_split`), spool grams (`coin_print_grams`), coins out (`coin_payout_requests`, a `payout_hold` row), payday (`coin_payday`, `coin_payday_settle`, `coin_payday_debt_payment`). |
| 0247 | Roles as evidence jobs: per-class caps and switches, holder rules, day photos and overrides, `coin_role_capture`, `coin_my_role`, `coin_roles_admin`, the public badges; roles moved onto classroom sections with a one-time backfill; the stipend set to 1 a week where nobody had edited it. |
| 0248 | Contracts through the queue (pay type, hourly rate, debt-only restitution jobs, classroom sections); the tournament transfer screen's reads and `coin_tournament_settle`; `tournament_reward_settlement` for the tournament page. |
| 0249 | Autopay pays the role stipend and quarterly debt relief; the digest, its opt-in and the once-a-week push decision; stats and exports. |
| 0250 | Edit any past number (`coin_edit_amount`, `coin_edit_undo`, `coin_edit_log`), spools (`coin_record_spool`), and the folded history every reader now shows. |
| 0251 | The old model retired: rosters and names from IDEA Classroom only, `p_medium` gone from every writer, the dead functions dropped behind a caller guard, the dead tables revoked by name, a final sweep and self-check. |

Client surfaces: the Coin Desk is tiered (`coin_staff_scope` read once in the
layout, `requireCoinArea` per page, 404 for an area a tier may not open), with new
Queue, Payday, Digest and Tournaments areas and rewritten Log, Students, Contracts,
Roles, Economy and Settings; the student page gains coins out, split payment,
backgrounds, donations, coins on hand, disputes, contracts, stats, the auditor list
and an export; `/coin-balance/role` is the role portal with a live camera; the
tournament page says whether its rewards were transferred or paid in coins; the
class People list shows role badges; the Ledger carries role badges and reported
coins and its champion rim and Print key are fixed (CLAUDE.md records the third
unfreezing). The Friday digest push is `src/routes/api/coin/digest-push/+server.ts`,
called by a Vercel cron and a second GitHub Actions schedule.

## Mr. Pina's only action

Turn on digest notifications: open https://ideabosco.com/coin-desk/digest and press
"Friday notification", then allow notifications in the browser. Nothing else needs
him; every default is already filled in and editable on
https://ideabosco.com/coin-desk/settings.

## The old system, inventoried (2.18)

| Item | Migrated or removed | Where |
| --- | --- | --- |
| `coin_sections`, `coin_section_students` (class list, roster) | Migrated: rosters are IDEA Classroom enrollments; roles and contracts carry `class_section_id`. Tables revoked. | 0247, 0248, 0251 |
| `coin_students` (Sheets name directory) | Migrated: names from enrollments and profiles (`_coin_student_name`). Table revoked. | 0245, 0251 |
| `coin_import_mappings`, `coin_import_batches` and the six import functions | Removed (the import finished in 2026-08). Tables revoked, functions dropped. | 0251 |
| The section RPCs (`coin_admin_upsert_section` and four more, `coin_bulk_log_section`) | Dropped; whole-class logging is `coin_bulk_log_students` over a classroom roster. | 0251 |
| `coin_bulk_payout`, `coin_payout_student`, the Economy payout card, `/coin-desk/debt`, `PayoutManager`, `DebtList` | Removed; Payday replaces both. | 0251, client |
| `coin_admin_post_contract`, `coin_admin_complete_contract`, `coin_admin_list_contracts`, `ContractsView` (`/contracts` still redirects to the Ledger) | Removed; posting is `coin_contract_post`, completion goes through the queue. | 0248, 0251, client |
| The role list and capacity functions, `coin_bulk_log_role_stipend` | Removed; `coin_roles_admin`, per-class caps, autopay stipend, `coin_role_stipend_manual` as the override. | 0247, 0251 |
| `coin_my_eating_pass_status`, `coin_public_sections`, `_coin_normalize_media`, `_coin_digital_only` | Dropped (no caller). | 0251 |
| `p_medium` on eight writers | Removed (old arity dropped, new created). | 0251 |
| `coin_balances` physical and digital columns | Rebuilt as one balance. | 0251 |
| `/coin-desk/preview`, `StudentPreview`, `CoinBalanceView`, `/dev/coin-preview`, `/dev/contracts`, `SectionManager`, roster import | Removed. | client |
| The Ledger's class-section colour table and its `sections` fetch | Removed. | `src/lib/legacy/coins/index.html` |
| History rows and `legacy_*` categories | Kept, as the prompt requires. | |

### Dead tables, revoked and waiting for a drop

`tools/apply-migration.mjs` refuses `drop table`, so 0251 revokes every grant on
these from `anon`, `authenticated` and `service_role` and lists them in
`coin_v2_retired`. Each is one statement to paste once Mr. Pina wants the bytes gone
(drop `coin_sections` last, after the old foreign keys named in its note):

```sql
drop table public.coin_section_students cascade;
drop table public.coin_students cascade;
drop table public.coin_import_mappings cascade;
drop table public.coin_import_batches cascade;
drop table public.coin_sections cascade;
```

## Calls I made

- **Tiers read `teacher_email`**, not `classroom_manages_section`, which says yes to every section for any admin. A listed full admin who is not a site admin gets nothing.
- **Coins out holds the coins as a `payout_hold` row**, so the balance drops the moment a student asks and no purchase rule needed rewriting; payday reverses the hold and posts the two-row transfer. If a balance fell after asking, payday pays what is left.
- **The split's digital part posts as `split_payment`**; the physical part is a physical-medium row of the item's own category on approval. One pending split per student.
- **A denied background does not count** toward one per two weeks. The donation cap window is a rolling 14 days, counted at approval.
- **Debt relief is capped at the current debt** and runs once per student per quarter close.
- **Tournaments default to giving every member the full amount** (how team rewards were always recorded); split divides the total evenly to the cent among everyone listed, walk-ups included, and a walk-up's share is not paid. The screen says so.
- **The tournament list** is complete tournaments with rewards awaiting transfer, or with no reward rows, since 2026-10-14.
- **`coin_log_three_d_printing` keeps `p_hours` and `p_overnight`** (history only, never charged).
- **Session one's files are not re-applicable after 0251** (0239's self-check counts arities 0251 removed). The test re-applies 0244 onward only and says so.
- **The v3 economy draft stays where it is**: V2 still cites it for the scoring rubrics, and moving it strands the migration comments that name its path.
- **The Log picker is in `sort_order`**; the static use-count table from the Sheets export was retired.
- **One CSV cell rule** (`csvCell` in `$lib/coin-balance/export.ts`) for the student's and the desk's exports.
- **On the highlighted picker row, the fine word takes amber at 60% lightness** on the dark themes (4.23:1 at 50% on that ground, 4.89 after).

## False claims found in the prompt's audit

None. Each repository claim from the audit at `db0a559` was checked before it was
relied on and held. Two facts it did not state mattered: the role and contract
systems were keyed to `coin_sections` by foreign key (handled by adding
`class_section_id` and leaving the old column as history), and the push module's
service client was already the one reader of the key for push (the digest route
reuses it, so the census stays at six).

## Measured

- `tests/db/coin-v2-session-two.test.ts`: 27 cases, every one with a planted control. Mutation proofs, each restored md5-identical from a copy: scope always true (3 failed), auditor may validate own (1), relief ignores fines (1), split allowed in debt (1), tournament settles twice (1).
- `tests/db/coin-v2.test.ts` 35 of 35; the anon surface sweep reconciled (26).
- Every apply-tool scan of 0244 to 0251: no findings.
- Browser pass over every coin spec at 375 and 1440: 28 specs, 0 outside threshold after four fixes (a harness toolbar overflow, a 39.9px switch, the picker's amber, and the Ledger rim). The Ledger rim spec reddens with the fix removed. Screenshots of the queue, payday, digest, tournaments, role portal, student page and the Ledger on Space White were looked at.
- `svelte-check`: 0 errors, 33 warnings in 18 files (29/3/1); the two that went were in the deleted `ContractsView.svelte`, measured against the base commit in a separate worktree.

## Not verified

- No signed-in session: nothing here was driven against production or with a real Google account. The camera ran against a fake canvas stream; a real phone camera, iOS Safari's `capture` fallback, and a real push notification were not exercised.
- The Print key's wrap did not reproduce in the harness, which loads no web fonts; the fix (`nowrap`, no shrink) holds whatever the font.
## How the migrations landed

Pushed to `main` at `77fa650f`; CI green on it. Migrate applied 0244 to 0250 in
order, one a minute (18:57 to 19:02 UTC), each `outcome: applied` with its history
row. It then REFUSED 0251 (run 203, exit 2, nothing sent): the probe could not
tell 0251's `coin_log_transaction` and `coin_log_property_damage_careless` from
0244's, because only the medium argument had gone and every body line was the
same, and "cannot say" is never a pass. 0251 had never reached the database, so
it was corrected in place: a comment line inside each redefined writer's body
(and `coin_admin_adjust_balance`'s, for margin) gives the probe a line to find.
Pushed at `30f5cd55`; 0251 applied at 20:00:24 UTC, 27 functions dropped, 34
objects listed in `coin_v2_retired`. The lesson for the next migration that only
drops a parameter: give the body a line of its own, or the probe has nothing to
read.
