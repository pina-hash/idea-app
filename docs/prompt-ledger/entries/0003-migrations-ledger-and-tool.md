# 0003 Establish docs/migrations-ledger/ and add tools/migration-ledger.py
- Issued: 2026-09-01 03:05 UTC
- By: Cowork session "Claude computer use demo", lane 1
- Owns: `docs/migrations-ledger/**` and `tools/migration-ledger.py`
- Migration permitted: no. Highest on origin/main at issue: 0169
- Status: issued
- Branch: pending
- Notes: Placement of 22 files plus one command to run. Writes no SQL and touches no
  database.

  Closes the last of the three states. Delivered and landed are provable from git; applied
  never was, and 19 migrations have sat above the watermark since 0151 with nothing
  recording whether they ran. `0060` once sat unapplied for six weeks while an audit went
  on describing what it would fix.

  This cannot be automated and should not be. No session holds `SUPABASE_ACCESS_TOKEN`,
  which is the only gate left now that cloud containers carry no deny list. The tool
  prepares a read-only catalog probe; a human runs it; the ledger records the answer.

  Two defects were found by running the tool rather than by reading it, and both are fixed
  in what ships. The `0166` body marker generated `like '%'maps'%'`, unescaped, a syntax
  error on paste. And deduping objects by first creator silently dropped five migrations
  from the probe: attributing `gauntlet_submit` to 0151 rather than 0158 meant 0153, 0158,
  0165, 0166 and 0168 got no verdict and nothing said so. Three now get body probes and
  two are named as out of reach.

  The body-probe markers were verified by measurement on 2026-09-01, extracting both
  function bodies and confirming each marker is present in the new and absent in the old.
  Existence is not evidence for a `create or replace`: that is precisely how 0151 reverted
  0148, with the object present and the server-stamped clock gone.
