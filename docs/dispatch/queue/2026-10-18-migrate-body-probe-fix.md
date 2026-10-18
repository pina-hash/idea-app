---
id: 2026-10-18-migrate-body-probe-fix
repo: pina-hash/idea-app
chat: IDEA Website Connector
ledger: 0406
migration: none
model: opus-5.5
effort: high
size: S
owns: tools/apply-migration.mjs, tests/apply-migration.test.ts, tests/apply-migration-guard.test.ts, docs/prompt-ledger/entries/0406-*, its own docs/history/ entry
after:
needs_go: no
go: no
status: queued
queued_at: 2026-10-18T02:52:00-07:00
---
Before doing anything else: `git fetch origin main`, check out `origin/main` on a working branch, and confirm the committer identity is `Claude <noreply@anthropic.com>`. Solo mode: rebase on `origin/main` and push `HEAD:main` once at the end, with the ledger entry in the same push. Another session (ledger 0401) is writing `src/lib/server/connector/**` and migrations 0272 to 0273 at the same time; nothing in your Owns overlaps it.

Every statement below about the repo is a claim; check each one in the tree before relying on it.

## Owns

`tools/apply-migration.mjs`, `tests/apply-migration.test.ts`, `tests/apply-migration-guard.test.ts`, `docs/prompt-ledger/entries/0406-*`, and your own `docs/history/` entry. Nothing else.

## Numbers

Ledger 0406. Migration: none. This changes the apply tool, not the schema.

## The defect (measured 2026-10-18, Migrate run on main after ledger 0400)

`orderVerdict` in `tools/apply-migration.mjs` refuses with "`<n>` is ALREADY applied" when ANY finding for the target has state `applied` (`self.some((f) => f.state === 'applied')`). For `0271_short_link_reserve_connector.sql` the probe produced two findings for the same function, `public._app_short_link_reserved`:

- `APPLIED`, existence only, annotated "(also defined by another migration in range; existence proves nothing)", because 0156, 0166, 0215, 0231, 0260 and 0269 all define it;
- `NOT APPLIED`, "carries 0271's body", the body check, which is the evidence that actually decides.

The tool therefore refused to apply 0271 even though its body is not in production. Because the tool always applies the lowest unapplied migration, every later migration (0272 onward) is now blocked behind it too.

## Audit

1. Confirm the above from the tree: how findings are built, which ones carry the "existence proves nothing" annotation, and whether a body finding is always produced alongside it for a redefined function.
2. Find every other caller of the same `some(...applied)` shape in the tool (the range summary, the claim check, the trace), so the rule changes in one place.

## The build

Make the strongest evidence win, everywhere the tool decides "applied":

- A body finding outranks an existence finding for the same object. An existence finding the probe itself marks as proving nothing never counts as applied when a body finding exists for that object.
- A target is "already applied" only when every DECIDING finding for it says applied. Any deciding `not-applied` means it is not applied and the tool may apply it (subject to every other existing gate, unchanged).
- If the deciding findings disagree with each other, the answer stays `unknown` ("cannot say is never a pass"), exactly as now.

Keep every other refusal unchanged. Write tests in the existing files for: the 0271 shape (existence `applied` that proves nothing plus body `not-applied`: may apply); the same shape with body `applied` (already applied: refuse); two deciding findings that disagree (unknown: refuse); and the ordering gate seeing the 0271 shape below a target (0271 counts as not applied, so the target is refused as not lowest). Run the three apply-migration test files and `npm run check`; no full suite is needed for a tool-only change, but run `npm test -- apply-migration` if the runner supports a filter.

## Landing

Rebase on `origin/main`, run those checks, push `HEAD:main` once. Never force-push. A content conflict is a stop.

## Report

The pushed sha and the rule as it now reads. Do not run the Migrate workflow yourself; the chat that queued this will run it with ledger 0400 to apply 0271 once your push lands. Set `docs/dispatch/queue/2026-10-18-migrate-body-probe-fix.md` to `status: done` in the same push, per your launcher's instructions.

## Ledger entry (`docs/prompt-ledger/entries/0406-migrate-body-probe-fix.md`, in the format of its neighbors)

Title: The apply tool lets the body probe outrank an existence probe that proves nothing (unblocks 0271).
Owns: (copy the Owns list above verbatim.)
Migration permitted: none. Highest on origin/main at issue: 0271.
