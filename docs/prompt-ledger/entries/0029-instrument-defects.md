# 0029 The instrument's own defects, and the record that no longer matches the tree
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `tools/browser-verify/checks.mjs`, `selftest.mjs`, the prose and generated regions of its `README.md`, the two coins route specs, `.github/workflows/integrate.yml`, two paragraphs of `CLAUDE.md`, `docs/prompt-ledger/entries/0029-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0175
- Status: pushed
- Branch: assigned by the harness
- Notes: Four defects in the measuring instrument and one gap in the repo's
  own record. Every one was found by a bundle that could not fix it because
  the file was outside its scope, and each was reported correctly rather than
  smuggled.

  ONE, and it cost weeks. `checks.mjs` line 178 reads
  `if (cs.position === 'fixed') continue`. That tests the ELEMENT'S OWN
  position and never walks up, so a fixed overlay is skipped while its
  static children are not. Those children carry the overlay's coordinates
  and topped every sorted overflow list, which is why the Coin Ledger's
  horizontal-scroll finding blamed `#student-drawer` for weeks while the real
  cause was a tab button. Six true measurements of a non-cause.

  TWO. Line 364's `parseFloat(cs.getPropertyValue('--tap-reach-w')) || 44`
  swallows a deliberate `0`. Harmless for every current caller and wrong the
  first time somebody means it.

  THREE. `orderResult` requires `Array.isArray` on both sides, so a probe
  returning a joined string can NEVER pass, while `measured` and `threshold`
  print identically in the report. Prompt 0027 hit exactly that: four rows
  showing values identical to their expectations and still counted outside
  threshold.

  FOUR. `CLAUDE.md` says a legacy file is unfrozen only by an explicit rule
  added there first. Prompt 0025 edited the frozen Coin Ledger under an
  explicit, scoped authorisation from Mr. Pina, and the record of that
  exception was never written, so the next reader finds an edited legacy file
  with nothing saying why.

  FIVE. `integrate.yml` skips a branch whose tip the target already contains,
  and skipping does not delete. Every branch landed by a merge bundle becomes
  a permanent ref; ten have accumulated across two rounds and Mr. Pina has
  deleted five by hand.

  Deliberately excluded: any product source, and the `/dev/notebook` flake,
  which prompt 0023 could not make fire and claimed no fix for.
