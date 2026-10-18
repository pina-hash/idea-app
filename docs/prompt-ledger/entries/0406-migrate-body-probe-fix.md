# 0406 The apply tool lets the body probe outrank an existence probe that proves nothing (unblocks 0271).

- Issued: 2026-10-18
- By: the claude.ai chat "IDEA Website Connector", through the session queue (`docs/dispatch/queue/2026-10-18-migrate-body-probe-fix.md`). Mode: solo.
- Repo: `pina-hash/idea-app`
- Owns: `tools/apply-migration.mjs`, `tests/apply-migration.test.ts`, `tests/apply-migration-guard.test.ts`, `docs/prompt-ledger/entries/0406-*`, and your own `docs/history/` entry. Nothing else.
- Migration permitted: none. Highest on origin/main at issue: 0271.
- Status: pushed
- Branch: `fix/migrate-body-probe`, rebased onto `origin/main` and pushed straight to `main`.
- Notes: `orderVerdict` is the only place the tool decides "applied" (the claim check, `budgetAllows`, reads the trace, not the probe; there is no range summary in this file), so the rule moved into one new function, `migrationState`, and `orderVerdict` asks it per migration, below the target and at it. An existence finding labelled "existence proves nothing" no longer decides when a body finding (`marker`, `superseded`, `marker-missing`) exists for the same object; over the deciding findings, all applied is applied, all not applied is not applied, anything else is CANNOT SAY. `appliedFindings` now carries each probe's `kind` onto its finding. Measured locally on `origin/main` with `tools/idea-status.py --since 260`: 0271 has an `object` probe (proves nothing) and a `marker` probe for `public._app_short_link_reserved`; 0269 has an `object` probe and a `superseded` one. A body finding is not always produced beside a proves-nothing existence probe (a body with no distinguishing line gives `marker-missing`, sql null, which now leaves CANNOT SAY rather than ALREADY applied; both refuse). Checks: the three apply-migration files 106 of 106; `npm run check` 0 errors, 33 warnings in 18 files. Migrate was not run. History: `docs/history/migrate-body-probe-0406.md`.
