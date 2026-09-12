# 0188 Merge four lanes into `integration`, land `integration` on `main`

- Issued: 2026-09-12
- By: router chat
- Owns: the merges of `claude/great-bell-ppysbn`, `claude/amazing-bohr-qxhly9`,
  `claude/vibrant-brown-mgym02` and `claude/busy-newton-trto6y` into `integration`, the
  merge of `integration` into `main`, the reconciling merge back,
  `tools/browser-verify/` measured entries if a merge conflicts inside them,
  `docs/prompt-ledger/entries/0188-*`, and its own `docs/history/` entry. NO OTHER
  SOURCE FILE. NO MIGRATION.
- Migration permitted: no. Claims: none. `0205`, `0206`, `0207` and `0208` are all
  applied to production by hand on 2026-09-13, in that order; with `0193` through
  `0204` that is the whole chain through `0208`. Those are permitted in range and any
  other migration is a stop.
- Status: pushed
- Branch: `claude/modest-lovelace-purl4k`, branched from `origin/integration` at
  `096aa371`.
- Notes: `claude/busy-newton-trto6y` conflicts and is one of the two branches keeping
  every Integrate run red; ledger 0182 measured it colliding on `CLAUDE.md`,
  `classroom-updates.json` and two decision entries. The other red branch,
  `claude/notebook-ui-theme-overhaul-0gnx0f`, was archived by ledger 0182 at
  `refs/heads/archive/notebook-theme-0gnx0f` and is neither merged nor deleted here --
  a container cannot delete it, the proxy returns 403 and git reports success over the
  failure.

## Outcome

**All four lanes merged and `integration` landed on `main`.** The migration chain
is contiguous `0204` through `0208` and nothing outside the permitted range
appeared at any of the three re-reads (branch time, before the merge, before the
push).

**THE WORK WAS NOT THE FOUR MERGES, IT WAS THE COLLISION THEY PRODUCED.** Every
branch was green alone; merged, **16 tests failed across 5 files**, because
0205's test files assert the ideacad function surface by ENUMERATION and 0207
adds fourteen functions and 0208 four. Generalized to the rule rather than
deleted, split the way `0206`'s own header splits it -- the UNIVERSAL properties
(no ideacad function is anon-executable, every public one holds `authenticated`)
stay swept by prefix over the whole surface, and the counts and exact lists are
scoped to the migration that owns them. 0207's fourteen and 0208's four are
CLASSIFIED `client`/`definer` in
`tests/db/ideacad-grants-anon-execute-surface.test.ts`, each read off its own
migration's grant block, which is the extension point `0206` names in words. Its
section F seam is scoped to `0206`'s own migrations, with an assertion in the
other direction that no later function leaked into the applied guard, because
`0206` is applied and cannot classify its successors. Four mutants, all
reddening, both files restored byte-identically from a copy.

**`claude/busy-newton-trto6y` collided exactly where ledger 0182 measured it**:
`CLAUDE.md`, `classroom-updates.json` and decision entries 05 and 07.
`classroom-updates.json` resolved textually keeping both (157 entries, valid
JSON, tabs intact); 05 and 07 resolved to the BUILT side, because `0204` arrives
in the same merge and HEAD's `Build: OPEN` would be false in the commit that
closes it; decision 24's conflict kept both additive sections, as its own text
instructs. `CLAUDE.md`'s baseline was RE-DERIVED on the merged tree rather than
picked: **0 errors, 37 warnings in 20 files (31/5/1)**, identical at the branch
point, mid-merge and final, so the line needed no correction -- the first time in
six lanes it has held.

**Measured.** Baseline off `integration` at `096aa371`: **418 files, 8099 tests,
0 failures**. Merged tree: **433 files, 8318 tests, 0 failures**. Browser pass on
the merged tree over the sixteen Foundry and IdeaCAD specs the merge touched:
**32 route/width runs, 708 measurements, 0 outside threshold**; store now 202
specs, 404 runs, 7184 measurements, **0 outside threshold, so no row to name**.

**NOT VERIFIED: production.** `https://ideabosco.com/` is refused by this
container's proxy (`CONNECT tunnel failed, response 403`, code `000`). No Vercel
URL was substituted. The deploy is unconfirmed from here.

**`claude/notebook-ui-theme-overhaul-0gnx0f` remains standing, correctly.** Its
archive ref `refs/heads/archive/notebook-theme-0gnx0f` was confirmed present by
`git ls-remote` at `30adfd77`, byte-identical to the branch tip. Not merged, not
deleted: a container cannot delete it and git reports success over the proxy's
403.
