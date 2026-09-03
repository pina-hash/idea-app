# 0021 Land the maps viewer and make it reachable from the launcher
- Issued: 2026-09-03
- By: router chat for IDEA portal work (Lane 1, Maps)
- Owns: the maps entry in `src/lib/portal-apps.ts`, `src/lib/marks/MapsMark.svelte`, the maps card's mark wiring in `src/lib/AppLauncher.svelte`, the maps rows in `tests/home-order-and-accent.test.ts`, `tests/portal-apps*`, an appended entry in `static/classroom-updates.json`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0021-*`, its own `docs/history/` entry, and the merge of `claude/idea-maps-public-viewer-hxz2cx`.
- Migration permitted: no. Highest on origin/main at issue: 0174
- Status: issued
- Branch: assigned by the harness. BRANCHED FROM `origin/integration`.
- Notes: Prompt 0020 built the public viewer at `/maps` and landed its
  launcher accent rule, and reported that the rule PAINTS NOTHING: there is
  no `maps` entry in `PORTAL_APPS` and no `MapsMark.svelte`, so the surface
  is reachable only by typing the address. A viewer nobody can find is the
  same as no viewer.

  0020's branch also conflicts with `integration` on
  `tools/browser-verify/README.md`, because 0020 regenerated the block in its
  OLD single-region shape while prompt 0019 split it into a cheap static
  region and an expensive measured one. That conflict is the first real test
  of 0019's fix: the resolution should be taking one side and running
  `npm run verify:counts`, which 0019 measured at 0.237s, rather than a
  six-minute browser run.

  0018 and 0020 each left an entry owed in `static/classroom-updates.json`
  and each deliberately did not write it, because it is a single shared array
  and the history split exists to keep sessions off shared write points. Both
  drafted their text in their history entries. This bundle appends both.

  Deliberately excluded: revising anything 0020 built; the `case=fresh`
  oracle gap 0018 reported, which is its own bundle; and any migration.
