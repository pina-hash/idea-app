# 0290 Every open Foundry ask: boards, author profiles, gallery sections and search, mobile full screen
- Issued: 2026-09-22T00:00:00Z
- By: Lane D3, closing feedback reports 30 (Azad Arteaga, leaderboards), 31
  (publisher profiles), 32b (gallery sections and search) and 33b (Enrique
  Mercado, iPhone 607x320, full screen) in one bundle, because all four land on
  the same two surfaces and share one migration.
- Owns: `src/lib/foundry/` entirely, `src/routes/foundry/` plus one new route
  directory under it, `src/app.html` (report 33b only),
  `supabase/migrations/0221_*.sql`, matching `tests/`,
  `tools/browser-verify/routes/foundry-*.mjs`, `src/routes/dev/foundry-*/`,
  `docs/prompt-ledger/entries/0290-*` and its own `docs/history/` entry.
- Migration permitted: yes, exactly one. Claims: 0221. Confirmed free with
  `node tools/migration-claims.mjs` at issue (highest landed 0217; 0218 held by
  two other lanes; 0219, 0220, 0221 unclaimed) and by the absence of any
  `supabase/migrations/0221*` file.
  Highest on origin/main at issue: 0217
- Status: pushed
- Branch: `claude/new-session-dsdncq`
- Notes: see `docs/history/new-session-dsdncq.md` for the audit, the two rung
  decisions the prompt required stated (what "trending" means as a formula, and
  how far "smart search" goes), the measurements, and the one half that cannot
  be verified on any engine in this container.
  ALL FOUR REPORTS SHIPPED (30, 31, 32b, 33b), and every prompt claim held
  against the tree; none had to be corrected.
  TWO TESTS ARE RED ON THIS BRANCH AND NEITHER IS A DEFECT IN THE WORK.
  `tests/db/migrations-applied-record.test.ts` wants a record under
  `docs/migrations-applied/` for every migration from 0193 onward, and 0221 is
  unapplied -- structural for any lane carrying a migration, and the exact
  state `0217` sat in for about six hours on 2026-09-21 between `5a2bd197` and
  `e44bc034`. It clears when Mr. Pina applies 0221 and runs
  `node tools/record-applied.mjs 0221`.
  `tests/db/migration-0177-tombstone.test.ts` wants the migration series
  contiguous, tolerating only holes a lane in flight is holding: 0219 and 0220
  are unclaimed by any ledger entry, so taking 0221 leaves a gap nothing
  accounts for. That is a direct consequence of this prompt's instruction
  ("Use 0221 and no other number") and presumably of 0219/0220 being held by
  sibling lanes of the same batch that have not recorded a number yet. It was
  reported rather than resolved by renumbering, which would have disobeyed an
  explicit instruction, and rather than by writing claims on other lanes'
  behalf. Everything else is green: 529 of 532 files, 9951 of 9954 tests.
  TWO FILES OUTSIDE THE OWNS LINE, both required by CLAUDE.md's own standing
  directives rather than chosen: `CLAUDE.md` ("New routes, tiers, roles, env
  vars, traps or conventions update CLAUDE.md in the same change that
  introduces them"), and `classroom-updates.json` ("EVERY session that changes
  classroom-facing behaviour appends a dated, student-readable entry BEFORE
  committing"), which has eleven Foundry precedents including decision 04's own
  bundle. Three entries appended; the append touched 28 lines and reformatted
  nothing.
  ONE ASSERTION GENERALIZED RATHER THAN BUMPED, per CLAUDE.md:
  `tests/foundry-cover-url.test.ts` pinned `passers.length` to exactly 3, which
  the fourth cover-rendering surface necessarily breaks. It asserts the RULE
  now (every such route hands down `foundryCoverUrl`) plus a floor, and was
  re-mutated to confirm it still bites.
  A PROCESS SLIP TO RECORD HONESTLY: this entry was written with
  `Status: pushed` in its very first commit rather than `issued` and flipped at
  the end, so the field was inaccurate for the life of the lane. Nothing
  depended on it, and it is correct as it stands at push time.
