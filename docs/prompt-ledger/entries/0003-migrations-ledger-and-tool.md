# 0003 Establish docs/migrations-ledger/ and add tools/migration-ledger.py
- Issued: 2026-09-01 03:05 UTC
- By: Cowork session "Claude computer use demo", lane 1
- Owns: `docs/migrations-ledger/**` and `tools/migration-ledger.py`
- Migration permitted: no. Highest on origin/main at issue: 0169
- Status: superseded by 0005
- Branch: none. Neither `tools/migration-ledger.py` nor `docs/migrations-ledger/`
  exists on any ref: swept on 2026-09-02 across `origin/main`, `origin/integration`
  and every `claude/**` branch, zero hits. The prompt was issued and no session ever
  received it.
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

  **Superseded by 0005 on 2026-09-02.** That bundle implements the probe block
  inside `tools/idea-status.py` section [3a] rather than as a second tool, because
  the status tool is what a session and a router chat already run first
  (`IDEA_instructions.md` 4.17, "The state of the world is one command") and a
  probe printed by a tool nobody runs answers nothing. The design this entry
  describes is carried over intact: one read-only catalog probe per migration, a
  body-probe marker wherever a `create or replace` means existence proves nothing,
  and a human running the query because no session holds a credential. What is NOT
  carried over is `docs/migrations-ledger/`, the file a human fills in afterwards;
  if that is still wanted it is a new prompt, and it now has a generator to fill
  it from.
