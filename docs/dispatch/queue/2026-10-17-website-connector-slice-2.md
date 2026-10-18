---
id: 2026-10-17-website-connector-slice-2
repo: pina-hash/idea-app
chat: IDEA Website Connector
ledger: 0401
migration: none - the registry overlay, the generic caller's endpoint wiring and the coverage check change no table; 0273 only if a log table seed row proves necessary
model: opus-5.5
effort: high
size: L
owns: src/lib/server/connector/registry/**, src/lib/server/connector/endpoints.ts, src/lib/server/connector/inventory.generated.json, src/lib/server/connector/schema.generated.json, tools/connector/evals/**, tests/connector-coverage.test.ts, tests/connector-registry.test.ts, tests/db/connector-permissions.test.ts, tests/db/connector-levels.test.ts, supabase/migrations/0273_*.sql, docs/connector/**, docs/prompt-ledger/entries/0401-*, its own docs/history/ entry, db:idea-supabase
after: 2026-10-17-website-connector-slice-1
needs_go: no
go: no
status: queued
queued_at: 2026-10-17T23:40:00-07:00
---
Before doing anything else: `git fetch origin main`, check out `origin/main` on a working branch, and confirm the committer identity is `Claude <noreply@anthropic.com>`. This is a solo session: you will rebase on `origin/main` and push `HEAD:main` once at the end, with the ledger entry in the same push.

Every statement below about the repo is a claim; check each one in the tree before relying on it.

Read first: `docs/connector/DESIGN.md` (sections 2, 3, 6 and 7 are yours to complete), the "What 0400 built" note at its end, `docs/connector/EVALS.md`, the "THE IDEA WEBSITE CONNECTOR" section of `CLAUDE.md`, `src/lib/server/connector/registry.ts` and the overlay files ledger 0400 left, and `src/lib/server/connector/inventory.generated.json`.

## Owns

You may write only: `src/lib/server/connector/registry/**`, `src/lib/server/connector/endpoints.ts`, the two generated JSON files under `src/lib/server/connector/`, `tools/connector/evals/**`, `tests/connector-coverage.test.ts`, `tests/connector-registry.test.ts`, `tests/db/connector-permissions.test.ts`, `tests/db/connector-levels.test.ts`, `supabase/migrations/0273_*.sql` (only if proven necessary), `docs/connector/**`, `docs/prompt-ledger/entries/0401-*`, and your own `docs/history/` entry. Nothing else. If a defect in a file outside this list blocks you, stop and report it rather than editing it.

## Numbers

Ledger 0401. Migration: none, unless a `connector_log_tables` seed row for a family 0400 did not cover proves necessary; then exactly `0273`. The highest migration on origin/main at issue was whatever 0400 landed (0270 to 0272).

## Audit phase

1. List every inventoried function and endpoint still marked `pending` in the overlay. That list is the whole job; count it and record the count with the date.
2. For each family in DESIGN.md section 7, read the functions' bodies in `supabase/migrations/` (the latest definition of each) to classify honestly: a function that writes is never `read`; a function with no reverse and no revision table is `confirm`, not `undo`, unless its value can simply be set back.
3. For each `+server.ts` endpoint, decide whether it is a function a person performs by hand (then a `call` entry that invokes the handler in-process with the minted session, through `src/lib/server/connector/endpoints.ts`) or transport, cron, auth, file bytes or a browser instrument (then `exclude` with the reason in one line). The two tournament live-operation functions are `exclude: live tournament operation stays manual (Mr. Pina, 2026-10-17)`.

## The build

- Complete the overlay: every function and endpoint gets `tool` or `call` with `level`, `describe`, `say` (three or more, in Mr. Pina's words: coins, classes, posts, students, Shop Fix, Block 2; never a table or column name), argument names in his nouns with `resolve: student` wherever an email or student id is meant, `undo:` on every `undo` entry, and `idempotent:` keys; or `exclude` with its reason. Promote to `surface: tool` any function he would say in one breath (the section 7 `undo` column for coins, posts, grading, feedback, hall pass, tournaments setup, Foundry review); the long tail stays behind `site_call`.
- Remove the `pending` allowance from `tests/connector-coverage.test.ts` for good: the check now fails on any function or endpoint with neither a tool, a call entry nor an exclusion reason, and on any overlay entry naming something not in the inventory.
- Extend `tests/db/connector-permissions.test.ts` to every write entry now in the registry (student, non-admin teacher and signed-out callers get the direct call's exact refusal; the admin's rows match the direct call's apart from ids and timestamps), and add `tests/db/connector-levels.test.ts`: every `confirm` entry refuses without a valid `confirm_token`, every `undo` entry's `undo:` target exists and reverses its effect on the log tables, every `read` entry writes no row in any log table.
- The eval runner, `tools/connector/evals/run.mjs`: reads `docs/connector/EVALS.md`, and for every line with a database proof prints the SQL that reads it back, so the phone run's judge is a query per line rather than a chat's word. It does not call the model.
- DESIGN.md section 7 becomes the actual table from the overlay (generated by `tools/connector/evals/levels.mjs` into the doc between markers), with its date.

Constraints: no new permission; nothing outside Owns; levels enforced by the server from the registry, never by prompt text. Copy conventions apply (no em dashes, American spelling).

## Checks, sized to the job

The four test files named above as you go, `npm run connector:build` until the coverage test is green, `npm run check`, then ONE full `npm test` with its summary line read.

## Landing

Rebase on `origin/main`, run the gate, push `HEAD:main` once. Never force-push, never delete a remote branch. A real content conflict is a stop.

## Report

The pushed sha; the counts (tools, call entries, exclusions, each with the date); any function whose classification you had to decide against the section 7 proposal, with the reason; the live site's footer sha if reachable; set the queue entry `docs/dispatch/queue/2026-10-17-website-connector-slice-2.md` to `status: done` in the same push, per your launcher's instructions.

## Ledger entry (`docs/prompt-ledger/entries/0401-website-connector-coverage.md`, in the format of its neighbors)

Title: IDEA Website Connector, slice 2: the full registry, levels for every function, and the coverage check with no allowance.
Owns: (copy the Owns list above verbatim.)
Migration permitted: none, or exactly 0273 if a log table seed row is proven necessary. Highest on origin/main at issue: as landed by 0400.
