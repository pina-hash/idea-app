---
title: "Migrate workflow could not apply anything: GitHub's default `bash -e` killed the probe step on exit 2 and would have killed the apply step on exit 4 (`claude/intelligent-brahmagupta-56q6sx`, ledgers 0363 and 0364)"
date: 2026-10-06
branches: [claude/intelligent-brahmagupta-56q6sx]
migrations: ["0230", "0231"]
subsystems: ["Tooling", "Migrations", "IDEA Armory"]
---

Two pushes in one session. Ledger 0363 moved the proposed Armory schema into
`supabase/migrations/0231_armory.sql` (decision 46). Ledger 0364 fixed
`.github/workflows/migrate.yml` so the workflow could apply it, and the 0230 file
queued ahead of it.

**The defect.** `migrate.yml` sets no `shell:` and no `defaults:`, so GitHub runs every
`run:` block as `bash -e {0}`. The probe step and the apply step each opened with
`set -uo pipefail`, which leaves `-e` on. `tools/deploy-probe.mjs` exits 2 when a
migration is not applied, which is the one case the workflow exists for, so the step
ended at the `--json` call before `PROBE=$?` or the `case` ran. Measured: run
37482331806 on `4fc641b7` failed in "Ask production which migrations it has" with exit
code 2 and every later step skipped. The run on `75cd5979` (2026-10-01, when 0230
landed) failed in the same step, and 0230 has no record under
`docs/migrations-applied/`. Runs where nothing was pending (probe exit 0) went green,
which is why the bug only showed itself when there was work to do. The apply step has
the same shape: with `pipefail`, `node ... | tee` returns the tool's exit, so exit 4
(applied, not verified) would have ended the step before `code` was written. The record
step keys on that output, so the one run somebody needs to find afterwards would have
left no record.

**The fix.** `set +e` straight after `set -uo pipefail` in those two steps, with a
comment saying why. Both steps already handle every exit code explicitly, so nothing
else changed. A minimal `bash -e -c` reproduction of each shape exits 2 and 4 before
the fix and reaches the handling after it. Running the extracted step script itself
was blocked by the session's safety check, so this is a reproduction, not the real step.

**The matcher was left alone.** For 0230, `parsePermitted` over every `NNNN-*.md`
entry finds exactly one match, 0360 (Claims: 0230, 0228, 0229). 0347 names 0230 only
in prose, and its Claims list reads as 0225. For 0231 it finds 0363.
`tools/apply-migration.mjs 0230 --dry-run --ledger 0360` accepts the entry.

**Ledger naming trap (0363).** The migrate matcher reads only files named
`^\d{4}-.*\.md$` and uses that prefix as the bundle id. A slug-only entry such as
`armory-land-0231.md` is silently skipped and the run refuses with zero matches, so the
entry was filed as `0363-armory-land-0231.md`.

**Not verified here.** Whether 0230 and 0231 are unapplied on production. Only the
probe, run in CI against `pg_catalog`, can answer that; this container cannot reach
the database.
