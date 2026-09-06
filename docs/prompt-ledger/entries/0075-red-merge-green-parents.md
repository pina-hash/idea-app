# 0075 A merge can be red when neither parent was, and nothing looks
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `.github/workflows/integrate.yml`, `.github/workflows/README.md`, `tools/integrate-gate-proof.sh`, `tests/workflows.test.ts`, `docs/prompt-ledger/entries/0075-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0185
- Status: pushed
- Branch: `claude/red-merge-green-parents-ft3e57`
- Notes: Prompt 0067 cleared four tests that had been red on `integration`
  for a day and cost five sessions an audit each. Its diagnosis of the
  `gauntlet-doc` half is the reason for this bundle.
  
  `74be202` added `tools/gauntlet-doc-check.mjs` at 19:48 UTC. `7d848d7`
  added `0184_gauntlet_run_event_bounds.sql` at 20:30 UTC. They are siblings
  off merge base `fdf8c68`, neither contains the other, and EACH WAS
  HONESTLY GREEN ON ITS OWN TREE. The check requires every GAUNTLET migration
  to have a row in `docs/GAUNTLET.md`; `0184` added a migration and touched
  no document. Git merged them with no conflict because the files are
  disjoint.
  
  So the failure exists only on the merge `5877f19` and on neither parent.
  Nothing on either branch could have caught it, and nothing looked at the
  merged tree either: `integrate.yml` merges and pushes without running a
  suite, even at the point where prompt 0050 taught it to regenerate the
  static counts region. The daily CI run on `integration` found it about ten
  and a half hours later, and five sessions paid for that window.
  
  This is a general shape, not one incident. Any check that relates two files
  is defeated by two branches each touching one of them. The counts block has
  the same property and prompt 0050 built the regeneration for exactly that
  reason; this is the other half.
  
  Deliberately excluded: `deploy.yml` and `ci.yml`; the gauntlet document,
  which 0067 fixed; and the counts regeneration, which already runs.
