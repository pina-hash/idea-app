# Results, session 0432: coins, feedback and the connector (voice to action)

Ledger 0432, issued 2026-10-23 from `QUEUE.md` items 6 to 11. Solo, landed on main in two pushes: part C (contracts retired, the Coin Desk folded into the coin home) first, then A, B, D and E together. Migrations 0296, 0299 and 0300 (0295 and 0297 went to ledger 0433, 0298 to ledger 0431). No student name is in this file.

## What was found and what was built

### C. Contracts retired (item 8, gap 3f52bae9)

- **Found.** Contracts were live in five places: the Coin Desk's Contracts area, the student coin page's contracts panel (claim, mark done), the IDEA Market's official tiles, the connector (nine hand entries) and the frozen Ledger's tab. The "not_in_economy" bug was not the class-enrollment check: the connector entry `coin_contract_mark_done` was a STUDENT action (it goes through `_coin_student_seam`, which asks whether the CALLER is a coin member), registered as if it were a staff "mark done and pay". Run as Mr. Pina, the seam answered for him, and a staff account is never a member. The same shape had leaked further: the connector's generated layer followed the seam into `_coin_economy_enrollments`, which calls `_admin_is_email` to exclude admins, and so classed **21 student coin actions** (buy a pass, send a transfer, post a listing, buy a stock and more) as admin tools.
- **Built.** 0296 closed every open or full contract and paid nobody: on production it reported 1 contract closed as done (the IDEA Coin Launcher, already paid 20 by hand on 2026-10-21), 7 closed as cancelled, 0 waiting contract cards, and 8 contract write functions closed to every client. The seam now answers `staff_account` to coin staff. `CALLER_SEAMS` in `tools/connector/gates.mjs` stops the gate walk at the seam and marks every function reaching it `acts_as_caller`; the generated layer excludes them and `tests/connector-coverage.test.ts` holds it, proven by mutation (removing the exclusion reddens it). Contracts are gone from the coin page, the Market, the staff areas and the connector. The Coin Desk launcher card is gone; its areas live at `/coin/<area>` under the coin home's Staff tools card and the coin bar's Staff tools tab, and every old `/coin-desk` address answers a 308 (an area to its new address, anything else to `/coin`). Gap 3f52bae9: built (mark it built in ledger 0432).

### B. Bulk actions (item 7, gap 7432f89f)

- **Found.** All three consoles (site reports, Armory notes, Armory incidents) already had select-many and one bulk press with an undo, but each press sent one database call per row. The connector had only the one-row status calls and no read of an incident's report. Measured from his saved requests on 2026-10-23: **2059 calls were single status changes through site_call** (1037 Armory incidents, 926 Armory notes, 96 site reports).
- **Built.** `*_set_status_many` and `*_restore_statuses` for all three lists (one call, the previous status of each row returned, its undo putting each back) and `armory_app_incident_report` (one incident whole). The consoles move a selection in one call (`$lib/feedback/bulk.ts`, falling back to one call per row before the migration lands). Connector: `mark_feedback` (any of the three lists, by ids, short ids, or status, version and date; undo level, no confirm, per the standing answer), `list_armory_reports` and `read_armory_incident`. Mutation-proven: a bulk update widened to every row reddens the bulk test.
- **Other lists where many rows get the same change:** the coin queue already has approve-all of one kind; the connector gaps list moves one at a time and was not changed (20 calls in the measurement); the Foundry review queue and certification desk were not measured as bulk work.

### A. Voice to action (item 6)

- **Found.** `award_coins` and `fine_coins` needed the category named (or answered `needs_category`), and a name usually went through `find_student` first: coin requests averaged **1.64 calls**. No phrase or alias table existed. The request log already records the model per request; calls per request were not recorded on a replay result.
- **Built.** `coin_transact`: student (fuzzy, server-side, one question when more than one fits), his words, an optional amount. The server decides award, fine or purchase from the verb, matches a saved phrase or a category name, and applies his amount rule exactly (`src/lib/server/connector/coin-voice.ts`): a set price is used; a saved phrase uses its default unless he says a number, which replaces it; a new phrase with a number logs a Custom Award, Fine or Purchase with his words as the reason and saves the phrase; no number and nothing listed asks for the number and writes nothing; a number that disagrees with a set price asks which. 0300 adds `coin_phrase_aliases` (seeded with up to 45 everyday phrases, only for categories that are on, every amount left to its category), the three custom categories, `coin_voice_log`, and the coin settings list ("Phrases Claude learned": change a default, make it official, forget it). `award_coins` and `fine_coins` still answer by name but are no longer offered (`replaced_by`). Mutation-proven: letting the custom branch log with no number reddens the no-write test.
- **The most common everyday voice requests, measured** (222 saved requests, 1775 requests, read 2026-10-23 through the connector's own request list; 1417 of the 1775 needed `site_call`): status changes on the Armory incidents (1037), Armory notes (926) and site reports (96); the Armory lists (181); coin fines and awards (185 requests, 69 saved lines); the connector gaps (55 list, 20 set); class roster (20). Tools added for them: `mark_feedback`, `list_armory_reports`, `read_armory_incident`, `coin_transact`, `list_gaps` (promoted), `class_roster` (promoted). The tool list is 44 (the cap was 40; raised to 45 with the reason in the test).
- **Evals.** Twelve saved requests added for the new tools (three in 0299, nine in 0300). Each passes the nightly route check (`tests/connector-replay.test.ts`). `record_eval_result` now stores calls per request and takes the model that ran it. **Haiku success rate: not measured.** No Haiku client is reachable from this session; the nightly replay is a route check, not a model run. Calls per request on the new paths: 1 for every coin request (from 1.64), 1 for a bulk status change of any size (from one call per row).

### D. Spam (items 9 and 10)

- **Found.** The anonymous path was rate limited per address; a signed-in report (most reports) had no limit, no junk handling, and nothing recorded about the session or device. Shape of the 2026-10-22 runs, read from the live list: 18 signed-in spam reports from 15 accounts, the noon run being 10 reports from 10 accounts between 12:03 and 12:08 PM, each 15 to 40 seconds apart ("hi", "stock"), and an afternoon run of 6 "a" reports from 6 accounts in one minute. No single account sent three.
- **Built.** A trigger on `app_feedback` (0299) for both paths: a fifth report inside two minutes or a sixteenth inside an hour is refused with a sentence that keeps the words in the box; obvious junk and a same-day repeat are kept and marked spam with the reason; the server stamps the sign-in session's start and browser and the gap since the last report; the box sends a random per-browser device key. The fine prompt on the feedback page groups open spam by account with the reports, the evidence, the doubts (a shared lab computer, a sign-in hours old, a browser this student does not usually use, a run from one computer across accounts) and the amount: **a burst is 3 or more spam reports from one account within 10 minutes; each burst is 5i¢, and every other spam report is 1i¢.** Against the 2026-10-22 shape: no burst, 1i¢ per report, 18i¢ across 15 accounts, both runs named on every card in them. One press fines (a system fine, disputable from the coin page) or dismisses; it never fines on its own. Mutation-proven: a fine accepted across two accounts reddens the test.

### E. Rewards (item 11)

- **Found.** No award path was tied to resolving a report.
- **Built.** "Led to a change" on a student's report opens an amount box (1 to 10, his number each time); Award pays once (`app_feedback_reward`) and resolves the report. The report box tells a signed-in student, in one line, that a report leading to a change can earn up to 10i¢.

## Migrations, in apply order

- `supabase/migrations/0296_coin_contracts_retired.sql` (applied 2026-10-24 05:10 UTC)
- `supabase/migrations/0299_feedback_bulk_spam_rewards.sql`
- `supabase/migrations/0300_coin_voice_aliases.sql`

## Checks

- `svelte-check`: 0 errors, 33 warnings in 18 files (baseline), after `svelte-kit sync`, with `.env` copied from `.env.example`; without an `.env` the container reports 20 errors, all `$env/static/public`, which are the environment and not the tree.
- Migrations tested over seeded pre-migration data and re-applied twice: `tests/db/coin-contracts-retired.test.ts`, `tests/db/feedback-bulk-spam-rewards.test.ts`, `tests/db/coin-voice-aliases.test.ts`; all three pass the production apply scanner and the editor paste check (`tests/db/coin-feedback-0432-scan.test.ts`).
- Browser pass at 375 and 1440 on the coin and feedback harness routes: green except `/dev/feedback?view=incidents`'s filter check, which fails identically on main's code (measured both).
- One full `npm test` (2026-10-24, before the last rebase): 16715 tests, 16696 passed, 19 failed. 13 of the 19 are the four files ledger 0430 recorded as failing on unchanged main, by name: tests/classroom-panel-layout-render (4), tests/db/cert-0262-exam (7), tests/db/feedback-round-0380-foundry (1), tests/db/ideacad-feature-graph-storage (1). The other 6 were this bundle's (tests/derived-numbers 2, tests/home-tour 2, tests/preferences-store 1, tests/db/armory-proposed 1); each was fixed and its file re-run green, with every file this bundle touches re-run after the final rebase (2837 tests, all passed).

## Not verified

- Haiku 5.5 running the new tools from a phone: no such client here.
- Production behaviour of the spam guard's session evidence: it reads `auth.sessions`, which the test cluster only imitates.
- The real `/coin/<area>` pages in a signed-in browser (the harnesses mount the same components).
- Migrations 0299 and 0300 on production: they apply through migrate.yml after the push.

## For Mr. Pina

1. Nothing to do for the migrations: they apply on their own after the push. If either is refused, its record appears under `docs/migrations-applied/`.
2. On your phone, try: "Fine Daniel R, phone out", then "Give Mateo 10 coins for hitting a sick trick shot", then "Give Leo coins for hitting a sick trick shot" (it should use 10 without asking).
3. Open ideabosco.com/admin/feedback: the Spam to review card shows the ready fines from the last two weeks; press Fine or Dismiss on each.
4. Coin settings (ideabosco.com/coin/settings): "Phrases Claude learned" lists what it remembers.
