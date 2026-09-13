# 0214 Foundry gallery default: close the stale Build line, and the two migration-claims shapes

- Issued: 2026-09-13
- By: router chat
- Owns: `src/lib/foundry/FoundryGallery.svelte`, `src/lib/foundry/telemetry.ts`,
  `tools/migration-claims.mjs`, `tests/dom/foundry-sort*`,
  `tests/migration-claims*`, `docs/decisions/entries/04-*`,
  `docs/prompt-ledger/entries/0214-*`, and its own `docs/history/` entry.
  Ledgers 0207, 0211 and 0213 run alongside; none of their files touched.
  `tools/deploy-probe.mjs` and `CLAUDE.md` are ledger 0213's and are untouched.
- Migration permitted: no. Claims: none.
- Status: pushed
- Branch: `claude/inspiring-pascal-d7c1ij`, branched from `origin/integration` at
  `8fe7a076`.
- Notes: TWO SMALL THINGS, BOTH ALREADY FLAGGED IN THE LEDGER AND NEITHER
  CLOSED. One: decision 04 (gallery default to most played) was answered
  2026-09-12 and its own Build line still read OPEN naming a specific line
  number to change; ledger 0185 built the actual fix the same day
  (`claude/awesome-keller-pj6hkc`, merged in commit `7a833149`) but never
  circled back to close the decision entry. Two: ledger 0197 reported, and did
  not fix (out of its Owns), that `parsePermitted` in
  `tools/migration-claims.mjs` misreads two real ledger shapes -- a backticked
  number (entry 0131) and a `Claims:` bullet written separately from
  `Migration permitted:` (entry 0138) -- as PERMITTED BUT NAMING NO NUMBER.
  Both are fixed; full account in the history entry.
