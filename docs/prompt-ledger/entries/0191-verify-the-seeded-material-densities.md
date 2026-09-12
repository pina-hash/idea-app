# 0191 Verify the seeded material densities against their published sources

- Issued: 2026-09-12T21:45:00Z
- By: router chat
- Owns: the material seed data path, `tests/db/ideacad-materials*`,
  `docs/prompt-ledger/entries/0191-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0208
- Status: pushed
- Branch: claude/dazzling-pascal-faz8t0 (cut from origin/integration 7f5ca8f0)
- Notes: `0208` is applied and every one of its eight materials landed
  `source_verified = false`, with an UNVERIFIED chip on every surface. That was
  correct and honest: ledger 0186's container had NO EGRESS -- matweb, azom,
  wikipedia, mcmaster, onlinemetals and the USDA FPL were each tried and each
  refused by the proxy -- so it named the owning standard per row and declined to
  assert a number it could not check.

  THIS BUNDLE'S FIRST JOB IS THE EGRESS TEST, and everything downstream is
  conditional on it. If no published source can be reached, the bundle STOPS on
  the densities rather than filling one in from recollection;
  `IDEA_MATERIALS_PROCESS.md` governs that and its "a file that was searched but
  not read" clause is the operative one.

  THE VALUES ARE DATA, NOT CODE. Materials are admin-managed as of `0208` and Mr.
  Pina edits them in the app, so a verified density ships as a read-only-safe SQL
  UPDATE he pastes, with a citation per row -- never as a migration. A migration
  for this is the shape `0208` exists to end.

  TWO ROWS NEED A JUDGMENT AND ARE FLAGGED, NEVER SILENTLY PICKED. "Carbon or
  unknown steel" is Mr. Pina's own category for stock of unknown provenance;
  `0208` assumes A36 and says so in the UI. "Wood" is not one material and a
  single density for it is a fiction.

  Ledgers 0189 and 0190 run in parallel and own `history.ts` and the sharing
  surfaces; neither is touched here.

**Duplicate check, three ways, all clear.** (1) `git ls-tree` over all 54 remote
refs after `--unshallow`: no `0189`, `0190` or `0191` ledger entry on ANY ref,
highest anywhere `0188`. (2) A live GitHub contents listing of
`entries?ref=main`: 177 entries, highest `0188`, none of the three present.
(3) `tools/idea-status.py` across `main`, `integration` and every `claude/**`
and `codex/**`: 168 prompts in flight, **zero** still `Status: issued`. `0191`
exists in this repo ONLY as a MIGRATION number, claimed conditionally by prompts
`0093`, `0098` and `0099` and never written; this entry claims none, so nothing
collides.

**The three fetches and the identity check.** The clone WAS shallow
(`is-shallow-repository` true); `git fetch --unshallow origin` took it to 2318
commits and 54 remote refs and reported false afterwards. `git fetch origin
integration` exit 0. The identity was already set -- `Claude
<noreply@anthropic.com>` -- so nothing was written. Identity read from the
session rather than asserted: configured `claude-opus-5`, effort high,
permission mode auto.

**THE EGRESS TEST, WHICH WAS THIS BUNDLE'S FIRST JOB, CAME BACK NEGATIVE AND THE
DENSITIES ARE THEREFORE UNCHANGED.** Sixteen hosts refused with `403` on
CONNECT (organization egress policy, per `/root/.ccr/README.md`, which says to
report rather than retry): the USDA FPL both hosts, `astm.org`, `iso.org`,
`aluminum.org`, `aisi.org`, `nist.gov`, `doi.org`, `matweb.com`, `azom.com`,
`mcmaster.com`, `onlinemetals.com`, `outokumpu.com`, `sabic.com`,
`kaiseraluminum.com`, `en.wikipedia.org`. `WebFetch`, a different path
entirely, answered `EGRESS_BLOCKED` on every domain including the FPL chapter
PDF and two manufacturer datasheets. What IS reachable is the build allowlist
and only that: `api.github.com`, `raw.githubusercontent.com`,
`registry.npmjs.org`, all 200. **`WebSearch` works and was deliberately not used
to set a number** -- it returns a model's summary of snippets, not the document,
which `IDEA_MATERIALS_PROCESS.md` refuses under "a file that was searched but
not read"; its 304 figure (7.93) disagreed with the seeded 8.00, which is
precisely the case that cannot be adjudicated without opening the datasheet.
Zero flags cleared, zero numbers written.

**What shipped instead**, none of which needs a source:
`tests/db/ideacad-materials-seed-resolves.test.ts` (the existing pure test asks
whether the deployed stock ids resolve, but asks it of a hand-typed transcript
of the migration; this asks the database the migration built, and is proven to
bite by dropping 0.1875 from the steel row);
`supabase/data/0191-material-density-verification.sql` (a correction form in
which every density is NULL and a blind paste writes zero rows); and the two
flagged judgments in the history entry. **ONE FILE OUTSIDE THE OWNS LIST:**
`CLAUDE.md`, for the new `supabase/data/` convention, under its own standing
rule that a convention lands in the same change. `history.ts` and the sharing
surfaces were not opened.

**Paste trap: zero, two ways, against four planted controls**, all of which
read PASTE TRAP PRESENT and exit 1 while the real file reads CLEAN and exits 0.

**Numbers.** Suite 434 files / 8322 tests / 0 failed, from a 433 / 8318 / 0
baseline measured on `origin/integration` `7f5ca8f0` before any edit; delta is
exactly the new file. `svelte-check` 0 errors, 37 warnings in 20 files
(31/5/1), unchanged and matching CLAUDE.md's stated figure with no correction
needed. `verify:readme` was not run, per the prompt.
