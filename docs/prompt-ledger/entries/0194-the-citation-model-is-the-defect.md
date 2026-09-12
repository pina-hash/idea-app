# 0194 The material citations name documents that carry no density

- Issued: 2026-09-13T00:10:00Z
- By: router chat
- Owns: `supabase/data/` material files, `tests/db/ideacad-materials*`,
  `docs/prompt-ledger/entries/0194-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/integration at issue: 0208
- Status: issued
- Branch: claude/vigilant-hopper-vt669h (cut from origin/integration 62ef6bc7)
- Notes: **THE DEFECT IS UPSTREAM OF EGRESS.** Ledger 0191 tried sixteen sources,
  was refused by the proxy on every one, set no density and flipped no flag. That
  was correct and it is not what this bundle repeats. `0208` attributes a density
  to `ASTM A240/A240M`, which is a PROCUREMENT SPECIFICATION -- chemistry limits
  and mechanical minimums -- and does not state one. The spread across published
  sources (7.90, 7.91, 7.93, 8.00) is nickel content varying inside A240's own
  permitted 8.0 to 11.0 % band, and every one of those values is compliant. So
  the first deliverable is a CORRECTED CITATION MODEL, not a number, and
  `A653`, `A36` and `B209` are checked for the same shape.

  **A CITATION CORRECTION AND A DENSITY CORRECTION HAVE OPPOSITE PROPERTIES, and
  that is this bundle's whole design.** Removing an attribution a document cannot
  support needs no document; asserting a number does. So the correction file's
  citation section WRITES on a blind paste and its density section does not, and
  the file says which and why.

  `WebSearch` is not used to set a number. `IDEA_MATERIALS_PROCESS.md` refuses
  "a file that was searched but not read", and ledger 0191's rule stands.

  Ledgers 0190 and 0192 run in parallel; neither's files are touched.

**Duplicate check, three ways, all clear.** (1) `git ls-tree` over
`docs/prompt-ledger/entries/` on all 55 remote refs after `git fetch
--unshallow`: highest entry anywhere `0193`, no `0194-*` on any ref. (2) A live
GitHub contents listing of `entries?ref=main`: 179 entries, highest `0193`,
`0194` absent. (3) `tools/idea-status.py` across `main`, `integration` and every
`claude/**` and `codex/**`: 173 prompts in flight, **zero** still `Status:
issued`. `0194` exists in this repo ONLY as a MIGRATION number -- `0194_gauntlet_
verification_floor.sql`, landed 2026-09-10 -- which is a different namespace;
this entry claims no migration, so nothing collides.

**The three fetches and the identity check.** The clone WAS shallow
(`is-shallow-repository` true); `git fetch --unshallow origin` took it to 2330
commits and 55 remote refs and reported false afterwards. `git fetch origin
integration` and `git fetch origin main` both exit 0. Identity was already set to
`Claude <noreply@anthropic.com>` and nothing was written. Session identity read
rather than asserted: configured `claude-opus-5`, permission mode auto.

**THE EGRESS TEST CAME BACK NEGATIVE AGAIN AND NO DENSITY WAS WRITTEN.** Two
independent paths. `curl` through the container proxy: 24 hosts, every one
`CONNECT tunnel failed, response 403`, including `asminternational.org`,
`matweb.com`, `astm.org`, both USDA FPL hosts, `en.wikipedia.org`,
`covestro.com`, `sabic.com`, and the three Baltic birch panel makers
(`koskisen.com`, `upm.com`, `metsagroup.com`) that the corrected citation model
newly points at. The proxy's own status endpoint records each as
`connect_rejected -- gateway answered 403 to CONNECT (policy denial)`.
`WebFetch`, a different path, answered `EGRESS_BLOCKED` for
`asminternational.org`, `en.wikipedia.org` and the A240 product page. The build
allowlist is reachable and only it: `api.github.com` 200,
`raw.githubusercontent.com` 301, `registry.npmjs.org` 200. **Zero densities set,
zero `source_verified` flags cleared.**

**What shipped.** `supabase/data/0194-material-citation-model.sql`, which
supersedes `0191`'s form: the corrected citation per row, the range and estimate
language where no single density is true, the wood row renamed to its species,
and `0191`'s density form carried forward unchanged so there is ONE file to
paste. A pointer line added to the head of `0191`'s file so nobody pastes the
stale one. And `tests/db/ideacad-materials-citations.test.ts`, which runs the
correction file against the real chain and proves the blind-paste property in
both directions.
