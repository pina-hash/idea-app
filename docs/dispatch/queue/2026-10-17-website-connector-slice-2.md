---
id: 2026-10-17-website-connector-slice-2
repo: pina-hash/idea-app
chat: IDEA Website Connector
ledger: 0401
migration: 0273
model: opus-5.5
effort: high
size: L
owns: src/lib/server/connector/**, src/routes/mcp/**, src/routes/admin/connector/**, src/routes/admin/feedback/connector/**, the tab list in src/routes/admin/feedback/+layout.svelte, tools/connector/**, tests/connector-*, tests/db/connector-*, supabase/migrations/0273_*.sql, supabase/migrations/0274_*.sql, docs/connector/**, the "THE IDEA WEBSITE CONNECTOR" section of CLAUDE.md, docs/prompt-ledger/entries/0401-*, its own docs/history/ entry, db:idea-supabase
after: 2026-10-17-website-connector-slice-1
needs_go: no
go: no
status: queued
queued_at: 2026-10-17T23:40:00-07:00
---
Before doing anything else: `git fetch origin main`, check out `origin/main` on a working branch, and confirm the committer identity is `Claude <noreply@anthropic.com>`. This is a solo session: you will rebase on `origin/main` and push `HEAD:main` once at the end, with the ledger entry in the same push.

Every statement below about the repo is a claim; check each one in the tree before relying on it.

Read first: `docs/connector/DESIGN.md` in full (sections 2, 3, 6, 7, 8 and 9 are yours to complete; section 7 is APPROVED by Mr. Pina with the balance-adjustment change it records), the "What 0400 built" note at its end, `docs/connector/EVALS.md`, the "THE IDEA WEBSITE CONNECTOR" section of `CLAUDE.md`, ledger 0400's history entry, everything under `src/lib/server/connector/`, and `src/routes/admin/feedback/` (the Armory and incidents tabs are the pattern for the new Connector tab).

## Owns

You may write only: `src/lib/server/connector/**`, `src/routes/mcp/**`, `src/routes/admin/connector/**`, `src/routes/admin/feedback/connector/**`, the tab list in `src/routes/admin/feedback/+layout.svelte`, `tools/connector/**`, `tests/connector-*`, `tests/db/connector-*`, `supabase/migrations/0273_*.sql`, `supabase/migrations/0274_*.sql`, `docs/connector/**`, the "THE IDEA WEBSITE CONNECTOR" section of `CLAUDE.md`, `docs/prompt-ledger/entries/0401-*`, and your own `docs/history/` entry. Nothing else. If a defect outside this list blocks you, stop and report it rather than editing it.

## Numbers

Ledger 0401. Migrations 0273, and 0274 if needed. Ledger 0400 was permitted 0270 to 0272. If it landed fewer than three, first check how `migrate.yml` and the migration tests treat a gap in numbering; if a gap is refused, use the lowest free numbers instead and say so in the ledger entry.

## Audit phase

1. List every inventoried function and endpoint still marked `pending` in the overlay. That list is the coverage job; count it and record the count with the date.
2. For each family in DESIGN.md section 7, read the latest definition of each function in `supabase/migrations/` to classify honestly: a function that writes is never `read`; a function with no reverse and no revision table is `confirm` unless its value can simply be set back. Where you depart from the approved table, say why in the history entry.
3. For each `+server.ts` endpoint, decide whether it is something a person does by hand (a `call` entry that invokes the handler in-process with the minted session, through `src/lib/server/connector/endpoints.ts`) or transport, cron, auth, file bytes or a browser instrument (`exclude` with a one-line reason). The tournament live-operation functions are `exclude: live tournament operation stays manual (Mr. Pina, 2026-10-17)`.
4. Read how 0400 built the tool list, the levels and the audit row, so `said`, `level_when` and the practice endpoint go into the one builder and the one call path, never beside them.

## The build

1. **The full overlay.** Every function and endpoint gets `tool` or `call` with `level` (or `level_when`), `describe`, `say` (three or more, in Mr. Pina's words: coins, classes, posts, students, Shop Fix, Block 2; never a table or column name), argument names in his nouns with `resolve: student` wherever an email or student id is meant, `undo:` on every `undo` entry, and `idempotent:` keys; or `exclude` with its reason. Promote to `surface: tool` what he would say in one breath (the section 7 `undo` column for coins, posts, grading, feedback, hall pass, tournament setup, Foundry review); the long tail stays behind `site_call`. Remove the `pending` allowance from `tests/connector-coverage.test.ts` for good.
2. **`level_when`** (DESIGN.md section 7): evaluated by the server on the resolved arguments. `coin_admin_adjust_balance` runs at once when the amount is positive and asks first otherwise.
3. **Haiku first** (section 8): every refusal and ambiguity names the next move in plain words; `site_find_tool` returns at most five ranked candidates with the exact `site_call` arguments to use; no tool's description assumes judgment the server could supply.
4. **The request log, the growing eval set and gaps** (section 9): `said` required on every tool; `connector_requests`, `connector_evals` (seeded from the 52 lines of `EVALS.md` with expected path, level and proof query), `connector_gaps` and `connector_eval_runs` in 0273, each with no client policy, written only through `connector_call` or a definer function that re-checks `is_admin()` as the caller; new requests appended as evals automatically; `report_gap` and the automatic gap on an unknown `site_call` name; `tools/connector/evals/export.mjs` regenerating `EVALS.md` from the table.
5. **The Connector feedback section**, `/admin/feedback/connector`, a tab beside Armory and incidents: open gaps first with his words, what was tried, a status control (`open`, `built`, `declined`, with the ledger that built it) and the evals each produced. Admin tier, 404 otherwise. Run the idea-design skill first; instructor-facing, no mascot GIFs. `/admin/connector` gains a Requests view (the eval set with each one's last replay result).
6. **The practice endpoint**, `/mcp/practice`: the same server, where the URL alone forces every write to preview and nothing commits, proven by a test that runs every write entry through it and finds zero new rows in every log table. Same sign-in and same gates.
7. **Tests**: extend `tests/db/connector-permissions.test.ts` to every write entry; add `tests/db/connector-levels.test.ts` (every `confirm` entry refuses without a valid `confirm_token`; every `undo:` target exists and reverses its effect on the log tables; every `read` entry writes no log row; `level_when` on the balance adjustment both ways); `tests/db/connector-requests.test.ts` (a request is logged with `said`; an unmatched request becomes an eval; an unknown `site_call` name becomes a gap; practice writes nothing).
8. DESIGN.md section 7 becomes the actual table generated from the overlay between markers, with its date; DESIGN.md gets a "What 0401 built" note; CLAUDE.md's connector section gains the request log, gaps and the practice endpoint.

Constraints: no new permission; levels enforced by the server from the registry, never by prompt text; nothing outside Owns. Copy conventions apply (no em dashes, American spelling).

## Checks, sized to the job

The test files named above as you go, `npm run connector:build` until the coverage test is green, `npm run check`, then ONE full `npm test` with its summary line read, and `npm run build`.

## Landing

Rebase on `origin/main`, run the gate, push `HEAD:main` once. Never force-push, never delete a remote branch. A real content conflict is a stop.

## Report

The pushed sha; the counts (tools, call entries, exclusions, seeded evals, each with the date); any classification that departs from the approved table, with the reason; the migration numbers used; the live site's footer sha if reachable; anything a person must do. Set the queue entry `docs/dispatch/queue/2026-10-17-website-connector-slice-2.md` to `status: done` in the same push, per your launcher's instructions.

## Ledger entry (`docs/prompt-ledger/entries/0401-website-connector-coverage.md`, in the format of its neighbors)

Title: IDEA Website Connector, slice 2: every function covered, levels by argument, the growing eval set, gaps as feedback, and the practice endpoint.
Owns: (copy the Owns list above verbatim.)
Migration permitted: 0273, and 0274 if needed (lowest free numbers if 0400 left a gap that migrate.yml refuses). Highest on origin/main at issue: as landed by 0400.
