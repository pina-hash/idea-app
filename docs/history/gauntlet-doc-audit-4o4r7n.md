---
title: "docs/GAUNTLET.md audited against the tree and put under a check: 15 stale claims corrected, 2 missing migration rows and 7 unnamed migrations added, and tools/gauntlet-doc-check.mjs with 15 fixture controls (`claude/gauntlet-doc-audit-4o4r7n`, no migration)"
date: 2026-09-05
branches: [claude/gauntlet-doc-audit-4o4r7n]
migrations: []
subsystems: ["GAUNTLET", "docs", "tests"]
---

`docs/GAUNTLET.md` opened with a header telling every reader that a claim in it
was a lead rather than a fact. That header was written by the 2026-08-29 audit
(`docs/history/gauntlet-component-harnesses-gnddjg.md`), it was honest, and it
was also the document reporting that it had stopped paying for itself: a
reference somebody must independently verify costs more than it saves.

This bundle corrects the document against the tree and puts the checkable half
of it under a check. **Nothing under `src/lib/gauntlet/`, `src/routes/gauntlet/`
or `supabase/migrations/` was touched.** No migration was written.

### What the prompt claimed, and what the tree said

The prompt's arithmetic was 42 GAUNTLET migrations against 22 table rows,
therefore twenty missing. **That does not survive contact with the tree, and
the difference matters for what the fix has to be.** The table's own heading
scopes it to what landed AFTER `0027`; the migrations below that number are
described by the document body, not by the table. Measured:

- 42 migrations are filename-matched `*gauntlet*`; the table has 22 rows, of
  which 19 are those and 3 (`0038`, `0067`, `0149`) are migrations written for
  other subsystems that changed GAUNTLET's meaning anyway.
- **GAUNTLET migrations after `0027` with no row: exactly one, `0158`.**
- **Rows naming a migration that does not exist: zero.** All 22 resolve.
- The genuine gap below the floor is different in kind: **seven migrations
  (`0011`, `0012`, `0013`, `0017`, `0021`, `0024`, `0025`) are named NOWHERE in
  the document**, in either form, so nothing told a reader they existed.
- One more row was added on judgement rather than on the filename rule:
  **`0137`**, whose GAUNTLET slice is a decision (it deliberately keeps `anon`
  EXECUTE on the five unauthenticated run-path functions and revokes
  `authenticated` from four private helpers), putting it in the same category
  as `0149`. Derived by reading all 181 migrations: 26 mention GAUNTLET outside
  their own filename and exactly four execute DDL naming a GAUNTLET object.

So "twenty missing" counted pre-`0027` migrations the table never claimed and
missed the one row that was actually absent.

### The fifteen stale claims

Against the eight the 2026-08-29 sweep found. Eleven of these are mechanically
checkable and are what the new check now guards; four are prose.

1. Migration table had no row for `0158`.
2. Migration table had no row for `0137`.
3. Seven pre-`0028` migrations named nowhere (counted as one finding class).
4. **"The live definition is in `0061`" for `gauntlet_macro_submit` is wrong.**
   Eleven migrations define that function and the last one wins: it is `0147`.
5. **"IT NO LONGER RETURNS THE COMPARISON VALUE (`0061`)" repeats a claim
   `0147`'s own header measures as false.** `0061` dropped three fields and left
   `your_mass_level` and `target_mass_level` in the same payload, whose ratio is
   the exact signed deviation the comment it wrote forbids. `0147` closed the
   RPC surface; `0153` closed the `prompt` SELECT surface. The document was
   citing the attempt as the fix.
6. **`gauntlet_practice_meter` has never existed**, named twice. The function is
   `gauntlet_practice_pressure`. The wrong name originates in `0155`'s own
   comment (line 628) and is repeated in `CLAUDE.md` -- see the findings below.
7. Shell route list omitted `/gauntlet/run-review`, which exists.
8. Shell said `/gauntlet` reads `isAdmin()` from `$lib/server/admin`; it reads
   `canAuthorGauntlet` from `$lib/server/gauntlet-authoring`.
9. Shell said a refused caller on `/gauntlet/author` "gets a redirect rather
   than a permission message". It renders `GAUNTLET_AUTHORING_REFUSAL`. **The
   document's own header already recorded that fix and this line never followed
   it**, which is the exact failure mode a per-claim check exists for.
10. "Written and not read" bullet 1: `gauntlet_log_speedrun_attempt` "is
    removable". `0150` removed it, and self-checks that zero overloads survive.
11. Bullet 2: `gauntlet_run_analysis` "no query anywhere in `src/` selects from
    it". `src/routes/gauntlet/speedrun/[id]/+page.svelte` selects four columns
    from it by `run_id`.
12. Bullet 3: `PostRunAnalysis`'s comparisons reach only `/dev/run-analysis`.
    The production mount passes both props; `+page.server.ts` reads the
    student's own five rows and calls `gauntlet_class_run_stats` (`0150`).
13. Three `docs/HISTORY.md` content references. That file is a pointer now; the
    entry is `docs/history/record-idea-gauntlet-cad-skills-dojo.md`.
14. "Applied vs. queued" left `0150` in the gap between "everything from `0151`
    is queued" and "`0149` and everything before it is applied", so the document
    took no position on it at all.
15. "Whoever applies `0151` needs to bring `0148`'s clock block over by hand."
    **`0158` is that merge**, derived by a rerunnable `git merge-file` over
    `0147` rather than a hand splice, and refusing rather than half-applying.
    The document was still issuing manual instructions for a repair that shipped.

The knowledge-modes section also gained the two migrations that moved it after
it was written (`0148`'s server-stamped clock, `0154`'s correctness gate), which
is a gap rather than a wrong sentence.

### The header

Replaced rather than deleted. A blanket "distrust everything here" on a
corrected document trains readers to skip warnings, and deleting it would claim
more than is true. The new one states **what is checked** (six enumerated
comparisons) and **what is not**, which is the half worth reading: every design
argument, every behavioural claim about what a named function DOES as opposed to
whether it exists, every migration row's sentence as opposed to its number, and
which migrations are applied on the live project -- unknowable from this
repository at all.

### The check

`tools/gauntlet-doc-check.mjs`, driven by `tests/gauntlet-doc.test.ts` in the
ordinary suite. It follows `tools/check-vanguard-changelog.mjs`'s shape (a pure
module plus a CLI plus a test) rather than inventing a fourth doc-check idiom
beside `standards-version-header`, `history:verify` and `derived-numbers`.

Six comparisons, each finding carrying the CLAIM and what the TREE says
instead, because a checker that reports "the document is stale" sends a person
to read 800 lines.

Three decisions in it are load-bearing:

- **The route inventory reads the `## Shell` section, not the whole file.**
  `/gauntlet/run-review` WAS named in the document -- once, in a migration table
  row -- so a whole-document check passes on exactly the case worth catching. A
  route named in passing is not a route a reader looking for the route list will
  find. A missing Shell section is itself a finding, so its absence cannot
  silently disable the loop.
- **Identifier existence is tested with full-line SQL comments stripped.**
  `gauntlet_practice_meter` appears in this repository exactly once, in an
  applied migration's header, and an existence test that read comments would
  have certified it. The finding names the near-miss it found instead.
- **A path named in a paragraph that says it DOES NOT EXIST is exempt.**
  `static/gauntlet/` is named in this document precisely to record that the
  tooling is not there, which is a true claim about the tree and the opposite of
  a stale one. Keyed on the sentence, so a later correction of the same shape is
  exempt with no edit to the checker.

### Verification

- **The two required positive controls, run against the REAL tree.**
  (1) `supabase/migrations/0199_gauntlet_probe.sql` created: the check reported
  exactly `[migration-table-missing-row] docs/GAUNTLET.md's migration table has
  no row for 0199`, one finding. Removed; green, and `docs/GAUNTLET.md` md5
  unchanged across the whole control.
  (2) The `0158` row edited to read `0999`: the check reported exactly two
  findings, `migration-table-phantom-row` for `0999` naming that no
  `0999_*.sql` exists, and `migration-table-missing-row` for the `0158` the row
  no longer covers. Restored from a `cp` copy; md5-identical, green.
  **`git checkout --` was not used at any point**, per CLAUDE.md.
- **15 fixture controls in the test**, each differing from a clean synthetic
  scaffold in exactly one way, with the scaffold's own cleanliness asserted
  first so no case can pass for the wrong reason. Both directions are covered
  for the table and for routes; the comment-stripping and the does-not-exist
  exemption each have a paired accept/reject case.
- **A vacuity control**: the parsers are asserted to return non-empty sets over
  the real tree, because every assertion in the checker is a loop and a parser
  matching nothing would report a clean run over nothing.

### `docs/GAUNTLET-DESIGN.md` is clean and was not edited

Swept the same way and it holds up: all 17 token values match
`viewport/viewport.css` character for character, every component named exists,
`/dev/visuals` exists, the `gt-tree-open` storage key is real, `motion.ts`
exports the five helpers it lists, `.gt-root .app-header` and `.gt-vignette` are
where it says. Its paths are checked by the same rule from now on, so it is
guarded without having needed a correction.

### Defects found in GAUNTLET and deliberately NOT fixed

Each is its own lane; this bundle changes no behaviour.

1. **`CLAUDE.md` names `gauntlet_practice_meter` in its GAUNTLET AUTHOR TIER
   section.** No such object exists. The name originates in `0155`'s own comment
   at line 628, which is an applied migration and immutable, so the correction
   belongs in `CLAUDE.md` and the checker cannot reach it: `CLAUDE.md` is
   outside this bundle's ownership and outside the two files the check reads.
   Extending the identifier sweep to `CLAUDE.md` is the obvious follow-up.
2. **`gauntlet_run_events` is anon-granted and client-posted with no server
   attestation**, recorded in the document as a reason a telemetry gate cannot
   work. That is correct and is not a defect. What IS worth a lane: the same
   property means anyone with the anon key can write arbitrary rows into an
   append-only table, and nothing bounds the volume.
3. **`0158` sits unnamed in the queued-migration record.** The sweep in
   `docs/history/anon-coin-public-projections-mrlg0d-queued-migration-sweep.md`
   predates it, and `0158` has a hard apply-order dependency (after `0157` and
   after `0151`) that no file outside its own header states. A queued-migration
   re-sweep is a lane.
4. **`GAUNTLET_VOLUME_TOL_PCT` has four copies** (two SQL functions, the VBA
   macros, `GauntletMath.VolumeTolPct`) and the document says they drift
   silently. Nothing checks them. A check is cheap and was out of scope here.

### Not verified

- **Nothing was run against the live Supabase project.** Which migrations are
  applied is not readable from this repository; every applied/queued statement
  in the document is repeated as the dated measurement it was, not refreshed.
- **No browser pass.** Nothing in this bundle renders; B4 concluded no harness
  is warranted and none was built.
- **The document's prose was corrected, not re-derived.** Design arguments were
  read for internal consistency and left; only claims about the tree were
  checked. The header now says so.
