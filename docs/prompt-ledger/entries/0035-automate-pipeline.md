# 0035 Remove the manual steps: mechanical conflict resolution, and a deploy that checks production itself
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `.github/workflows/integrate.yml`, `deploy.yml`, `.github/workflows/README.md`, the gate-proof harness under `tools/`, `tools/deploy-probe.mjs` (new), `tests/workflows.test.ts`, the Status line of decision 0010, `docs/prompt-ledger/entries/0035-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0178
- Status: pushed
- Branch: assigned by the harness. BRANCHED FROM `claude/unblock-pipeline-deadlock-j239zg`.
- Notes: Mr. Pina's standing instruction on 2026-09-03: his manual inputs
  must be minimal, and the only step he accepts keeping is applying a
  migration, because a cloud session must never hold a credential that can
  write to production.

  TWO THINGS REMOVE ALMOST ALL OF THE REST.

  ONE. Every branch conflict in two weeks has been one of exactly two files
  and both have a deterministic answer. `tools/browser-verify/README.md`'s
  generated regions: take the target's side, then regenerate the STATIC half,
  which prompt 0019 made a tree read of about 0.2s needing no browser.
  `classroom-updates.json`: an append-only array, so keep both sides' appends.
  Resolving those two mechanically removes the conflicts that have cost five
  hand deletions and three landing bundles.

  TWO. Decision 0010 declined an unattended deploy in August for a stated
  reason: CI cannot see which migrations production has applied, so a person
  types the assertion. Mr. Pina approved the fix on 2026-09-03 -- a read-only
  Postgres role whose connection string lives in a GitHub secret. The
  workflow then reads production's own catalog and answers the question it
  used to ask him.

  THE TRAP THAT DECIDES THE PROBE. `information_schema` is
  PRIVILEGE-FILTERED: a role with no grants sees no rows there, so a probe
  built on it reports every migration unapplied and the deploy refuses
  forever, or reports the inverse and deploys wrongly. `pg_catalog` is not
  filtered. Every probe reads `pg_catalog` and nothing else.

  Deliberately excluded: applying a migration from CI, which needs a
  write credential and stays Mr. Pina's; and any change to what CI tests.
