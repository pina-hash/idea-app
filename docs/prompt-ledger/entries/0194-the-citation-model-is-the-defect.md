# 0194 The material citations name documents that carry no density

- Issued: 2026-09-13T00:10:00Z
- By: router chat
- Owns: `supabase/data/` material files, `tests/db/ideacad-materials*`,
  `docs/prompt-ledger/entries/0194-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/integration at issue: 0208
- Status: pushed
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

**The corrected citation model, one line each.** Stainless: A240 is a
procurement spec, open a physical-properties reference for UNS S30400 or the
mill certificate. Galvanized: A653 governs coating and grade, not the base
steel's density. Carbon or unknown steel: A36 is a procurement spec AND the row
is unknown provenance, so nothing can answer for the piece. **6061: 0208's
SECOND citation was already right** -- the Aluminum Association's Aluminum
Standards and Data carries a per-alloy table, B209 does not, so half a citation
is dropped rather than the whole replaced. Polycarbonate: ISO 1183 and ASTM D792
are test methods; open the sheet's datasheet. Wood: FPL-GTR-282 is species data
and a manufactured panel is not a species (0191's finding).

**Where no single density is true, the data says so**, in `note`, in 0208's own
vocabulary rather than a new one and with no column added: 304 is `RANGE` (every
figure in the spread is correct for a compliant material), carbon/unknown steel
keeps `ESTIMATE` and gains that it cannot become anything else, galvanized
becomes `ESTIMATE` (**my proposal**), plywood keeps `ESTIMATE` with the reason,
and **6061 is flagged as the one row where a single number is the right SHAPE**
-- said out loud so a later sweep does not make a correct value vaguer.

**The wood row is renamed to `Baltic birch plywood`; `slug` stays `wood`**,
because the slug is the join key and the name is display text.

**Polycarbonate 0.093 is NOT A TYPO and stays.** It is the 3/32 nominal as
suppliers spell it. Changing it to 0.09375 is a REMOVAL in disguise -- the id
moves from `polycarbonate-0093` to `polycarbonate-009375` -- and, measured
against the shipping helper, `formatThicknessIn` rounds to four places, so a
stored 0.09375 would RENDER as 0.0938: a row displaying a number that is not its
own value. No supplier catalogue was reachable, so the decision rests entirely
on those two checkable facts. The note now states the exact fraction.

**Paste trap: zero, two ways, against four planted controls.** Both correction
files read 0 / 0 CLEAN; a `$report$` in a comment, a bare `$$` in a comment, an
unbalanced `$$` on a code line and a lone `$5` in a comment all read PASTE TRAP
PRESENT and exit 1. Controls C and D each fire on exactly one of the two ways,
which is what proves they are different instruments.

**Numbers.** Suite **444 files / 8477 tests / 0 failed**, from a **443 / 8469 /
0** baseline measured on `origin/integration` `62ef6bc7` before any edit; delta
is exactly the new file's 8 tests. `svelte-check` **0 errors, 37 warnings in 20
files** (31/5/1), measured at the branch point with the new test held aside and
again with it -- `tests/**/*.ts` is inside svelte-check's include list -- and
identical both times and to CLAUDE.md's figure, so **no correction was needed**.
`tools/claude-md-check.mjs` agrees with the tree. Three mutants planted in the
real correction file each reddened the suite (a filled density: 4 of 8; a slug
moved with the name: 4 of 8; a 301-character source: the whole file refused by
`ideacad_materials_source_length`), restored from a `cp` copy and md5-identical
at `de870b06e7f0a1199fcbe3dcb5406842` each time. `verify:readme` was not run.

**THE MERGE WAS NOT TAKEN AND THE CHECKLIST SAYS WHICH GATES.** 1 PASS
(`git merge-base --is-ancestor origin/main origin/integration`, exit 0). 2
**UNMET** -- the newest CI run on `integration` is for `88f0f26f`, the tip is
`843b3860`, so no run exists for the current tip. 3 not reached. 4 **UNMET** --
`node tools/deploy-probe.mjs --ref origin/integration` exits 1,
`DEPLOY_PROBE_URL` unset, "cannot confirm", never a pass. 5 **UNMET** --
`git diff --name-only origin/main...origin/integration -- supabase/migrations/`
prints `0209_ideacad_history.sql` and `0210_notebook_note_grid.sql`; ledger 0189
records 0209 as "Not applied anywhere". 6 PASS -- 0189, 0190 and 0193 all read
`Status: pushed`. **Ledger 0114's substitution does NOT rescue gate 4 here**: it
applies only while the migration range is EMPTY, and 0114 says so itself. So the
merge is Mr. Pina's, after 0209 and 0210 are applied.

**Production was not reachable and is not claimed.** `ideabosco.com`,
`www.ideabosco.com`, `apps.ideabosco.com` and `idea-app-sage.vercel.app` all
answer 000 through the proxy with `CONNECT tunnel failed, response 403`.
