---
title: "apply-migration's ordering rule now reads the migration history table, so a migration with no derivable probe and a history row is APPLIED there as it is in the deploy probe (`claude/elegant-hawking-l61p15`, ledger 0365)"
date: 2026-10-06
branches: [claude/elegant-hawking-l61p15]
migrations: ["0231"]
subsystems: ["Tooling", "Migrations"]
---

**What failed.** Migrate run 37484392652 probed 0230 applied and 0231 not, and
then refused 0231: "8 migration(s) below 0231 cannot be confirmed applied (0153,
0177, 0181, 0183, 0202, 0203, 0204, 0206). Cannot say is never a pass." Every one
of the eight is "no probe -- no probeable object could be derived".

**Why.** `verdicts` in `tools/deploy-probe.mjs` already decides "history row,
no probe" as APPLIED (what the 0209 seed bought), but its `history` argument is
optional and defaults to "the record cannot speak". `tools/apply-migration.mjs`
called it with two arguments, so in the apply tool those eight could only ever
be CANNOT SAY and `orderVerdict` would have refused every migration above them
for good. The deploy probe and the apply tool were reading two different tables.

**The fix.** The probe read moved into `appliedFindings(client, probes, url)` in
`tools/apply-migration.mjs`. It reads the record with deploy-probe's own
`readHistory` (no second reader): that reader is synchronous over a `run`
function, so the tool asks both of its statements (`buildHistorySql`,
`buildHistoryVersionsSql`) over its own pg client, inside read-only
transactions, converts the rows to the `psql` field shape (`t`/`f`), and hands
them over. The versions statement is also asked when the table is absent; it
fails harmlessly and `readHistory` never reads that answer. The result goes to
`verdicts` as its third argument. The run now prints `record: <why>` beside the
probe list. Nothing else changed: CONFLICT (row, object absent) is still NOT
APPLIED, no row and no probe is still CANNOT SAY, and an absent or unreadable
table still leaves the no-probe migrations CANNOT SAY, so the refusal stands.

**Measured.** Four new cases in `tests/apply-migration.test.ts` drive
`appliedFindings` over a fake client: a no-probe migration below the target
with a row passes `orderVerdict`; the same with no row refuses; a row with its
object absent refuses as not applied; no history table refuses. Targeted run
(`npm test --` over apply-migration, -guard, -trace, deploy-probe-history,
-cli, -step and db/deploy-probe-history-live): 7 files, 161 tests passed.
Mutation: dropping the third argument again reddened the first case (and the
conflict case, whose agreement falls back to "agree"), 2 failed of 43; the file
was restored from a copy, md5 `05524d61295c71a8a04b07476c69aa4f` before and
after, and 43 of 43 passed. `svelte-check`: 0 errors, 37 warnings in 20 files,
unchanged.

**Not verified here.** The production run itself; it is the Migrate run this
push triggers, and its result is the report's last line. The apply-guard suite
needs `origin/integration` fetched with history, as its own message says, and
fails without it.
