---
title: "Ledger 0432: voice to action for coins and feedback, bulk status on the three feedback lists, contracts retired and the Coin Desk folded into the coin home, the report box against spam with a fine prompt, and rewards for reports"
date: 2026-10-23
branches: [main]
migrations: ["0296", "0299", "0300"]
subsystems: [Coins, Connector, Feedback]
---

A solo session from `docs/feedback/2026-10-23/QUEUE.md` items 6 to 11, beside ledgers 0431 and 0433 in their own worktrees. It landed in two pushes in the prompt's order: part C first (112b8b15, migration 0296, applied on production 2026-10-24 05:10 UTC), then A, B, D and E. The full account, with the measurements and the steps for Mr. Pina, is `docs/feedback/2026-10-23/RESULTS-0432.md`; this entry keeps the decisions and their reasons.

## Load-bearing decisions

- **The contract bug was a staff tool over a student action.** `coin_contract_mark_done` goes through `_coin_student_seam`, which asks about the CALLER; the connector registered it as staff "mark done and pay", so as Mr. Pina it answered `not_in_economy`. The fix that keeps it from recurring is in the connector, not the enrollment rule: `CALLER_SEAMS` (`tools/connector/gates.mjs`) stops the gate walk at the seam and marks every function reaching it `acts_as_caller`, which the generated layer excludes. That took 21 student coin actions off the generated tools that had been offered to an admin. The seam also says `staff_account` now.
- **Contracts closed with nobody paid again, and the write functions lost their grants** rather than their bodies, so the undo is a grant and the record (claims, cancelled rows) stays. The IDEA Coin Launcher closes as done; everything else open closes as cancelled.
- **The Coin Desk folded into the coin home by moving its areas, not by deleting them.** Its staff tools are used daily (fines, queue, payday, settings), so "remove the Coin Desk page" was read as removing the separate app: the launcher card, the desk's own front door and the Contracts area went; the areas live at `/coin/<area>` in a `(staff)` group with the same gate, and every old address answers a 308. Links on pages this session does not own still say `/coin-desk/...` and redirect.
- **Bulk status is reversible, so it never asks first** (Mr. Pina's standing answer). One function per list returns each row's previous status, and the restore function is its own undo.
- **The amount rule is his and lives in one file** (`coin-voice.ts`); the database only stores phrases and logs what it is handed. A seed phrase never carries an amount. A number that disagrees with a set price asks rather than guessing which he meant.
- **Replaced tools still answer.** `award_coins` and `fine_coins` are `replaced_by: coin_transact`: out of the tool list a phone model reads, but an old chat or saved request naming them still works and the replay still finds them.
- **The burst rule is per account, and the cross-account run is evidence, not a fine.** The 2026-10-22 runs were one report per account across ten accounts; fining each for a "burst" they did not send would fine the wrong thing, so each pays 1i¢ a report and every card names the run it was in. Where the run came from one computer, the card says the evidence points away from the owner and offers "Fine anyway".
- **The spam guard refuses only a burst and never drops a report.** Junk is kept and marked spam with the reason; the refusal is a sentence and the words stay typed. An admin is never shaped.

## What was measured

- From his 222 saved requests (1775 requests) on 2026-10-23: 1417 needed `site_call`; 2059 calls were one status change at a time; coin requests averaged 1.64 calls. Production 0296: 1 contract done, 7 cancelled, 0 waiting cards, 8 functions closed.
- Mutation proofs (each restored byte-identically and re-run green): the connector exclusion of caller actions; a bulk update widened to every row; a fine accepted across two accounts; junk never marked; the coin tool logging with no number.
- `svelte-check` 0 errors, 33 warnings in 18 files.
- One full `npm test` (2026-10-24, before the last rebase): 16715 tests, 16696 passed, 19 failed. 13 of the 19 are the four files ledger 0430 recorded as failing on unchanged main, by name: tests/classroom-panel-layout-render (4), tests/db/cert-0262-exam (7), tests/db/feedback-round-0380-foundry (1), tests/db/ideacad-feature-graph-storage (1). The other 6 were this bundle's (tests/derived-numbers 2, tests/home-tour 2, tests/preferences-store 1, tests/db/armory-proposed 1); each was fixed and its file re-run green, with every file this bundle touches re-run after the final rebase (2837 tests, all passed).

## Not verified

Haiku on a phone running the new tools; the spam guard's `auth.sessions` read on production; the real `/coin/<area>` pages signed in; 0299 and 0300 on production at the time of writing.

## Outside the stated Owns, and why

`src/lib/classroom/FeedbackConsole.svelte` (the feedback console is that file; the bulk transport, the reward control and the spam card slot), `tests/portal-admin-console.test.ts` (it asserted the Coin Desk card), `tests/connector-registry.test.ts`'s tool cap, and one name in `docs/subsystems/ui-shell.md` (`claude-md-check` reads it).
