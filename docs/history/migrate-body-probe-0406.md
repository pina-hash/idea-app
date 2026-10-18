---
title: "The apply tool lets the body probe outrank an existence probe that proves nothing (ledger 0406, no migration)"
date: 2026-10-18
branches: [main]
migrations: []
subsystems: ["Migrations", "Workflow"]
---

The Migrate run after ledger 0400 refused `0271_short_link_reserve_connector.sql` as "ALREADY applied", and so blocked every migration above it. The probe had two findings for 0271's one function, `public._app_short_link_reserved`: an existence probe, APPLIED, which `tools/idea-status.py` labels "existence proves nothing" because six earlier migrations define the same function, and a body probe, NOT APPLIED. `orderVerdict` refused on any applied finding.

What changed, in `tools/apply-migration.mjs` only:

- `migrationState(findings)` is the one answer to "is this migration applied". An existence finding carrying the probe's own "existence proves nothing" label is outranked when a body finding (`marker`, `superseded` or `marker-missing`, read from the finding's `kind`, or from its label when none was attached) exists for the same object. Over the remaining deciding findings: every one applied is APPLIED, every one not applied is NOT APPLIED, anything else (an unknown, or two that disagree) is CANNOT SAY.
- `orderVerdict` groups findings by migration and asks `migrationState`, below the target and at it, so the ordering gate and the already-applied check read one rule. It now counts migrations, not findings, in its messages.
- `appliedFindings` copies each probe's `kind` onto its finding (`verdicts` answers one finding per probe, in order).
- The run prints `[outranked by the body probe; does not decide]` beside an outranked finding.

Audit: `orderVerdict` was the only `some(...applied)` decision in the tool; `budgetAllows` (the claim check) reads the committed trace, not the probe, and there is no range summary in this file. Every refusal that existed still refuses; two change their wording (a target whose deciding findings disagree, and one whose only body probe is out of reach, now read CANNOT SAY instead of ALREADY applied).

Measured: `python3 tools/idea-status.py --local . --json --since 260` on `origin/main` gives 0271 an `object` and a `marker` probe and 0269 an `object` and a `superseded` probe for that function; the new tests use those labels verbatim. The three apply-migration test files pass 106 of 106; `npm run check` is 0 errors and 33 warnings in 18 files.

Not verified: no run against production (a container cannot reach it); the Migrate workflow is left to the chat that queued this.
