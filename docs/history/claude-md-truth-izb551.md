---
title: "`CLAUDE.md` is corrected against the tree in eighteen places, and `tools/claude-md-check.mjs` is the check that keeps it corrected -- seven items reported by other bundles, eleven more found by a sweep, plus the ownership split written down (`claude/claude-md-truth-izb551`, no migration)"
date: 2026-09-06
branches: [claude/claude-md-truth-izb551]
migrations: []
subsystems: ["Documentation", "Tooling", "Testing", "Decisions"]
---

`CLAUDE.md` is read by every Claude Code session in this repository before it
does anything, which makes a false sentence in it an INSTRUCTION rather than a
stale document. Between 2026-09-05 and 2026-09-06 seven bundles each found one,
and every one of them correctly declined to edit a file outside its ownership --
so seven corrections went into `docs/history/`, where the next session does not
look. This bundle owns the file, corrects it, and adds the check.

**No behaviour changed.** Every file `CLAUDE.md` describes is untouched. The
diff is `CLAUDE.md` (+192 / -38), one new tool, one new test, one ledger entry
and this record.

**Base: `origin/main` at `eec8151`, not `origin/integration`.** `integration`
was 0 ahead and 4 behind `main` at session start (`git rev-list --left-right
--count origin/main...origin/integration` answered `4 0`), which is the same
state prompt 0075 found and the same answer: `main` already contains everything
`integration` has. Nothing was merged because there was nothing to merge. Git
had a committer identity already (`Claude <noreply@anthropic.com>`), so the
"Please tell me who you are" failure the prompt warns about did not arise.

## A2 -- the seven reported items, verified one at a time

The prompt's own instruction was not to take the ledger's list on trust, and it
was right not to: two of the seven were not what the report said.

| # | Reported by | Verdict | What the tree said |
| --- | --- | --- | --- |
| 1 | 0055 | **CONFIRMED** | The `claude/**` paragraph read "push the branch, do not merge to `main`, exactly as every prompt already says". `docs/decisions/entries/16-a-lane-may-merge-to-main.md` is `Status: decided 2026-09-05`, `YES, asked for`, and `IDEA_instructions.md` 4.20 carries the six-gate ending that grants it. Decision 16's own "Tree check" line records that prompt 0055 found this and could not fix it. |
| 2 | 0060 | **CONFIRMED** | `gauntlet_practice_meter` appears in the whole repository only inside comments: `supabase/migrations/0155_gauntlet_authoring_tier.sql:628`, three lines of `tests/gauntlet-doc.test.ts` and two of `tools/gauntlet-doc-check.mjs` (both of which name it to say it is fiction), and `CLAUDE.md:1151`. `0151_gauntlet_meter_practice.sql` creates `_gauntlet_practice_min_interval`, `gauntlet_submit` and **`gauntlet_practice_pressure`**. |
| 3 | 0071 | **CONFIRMED** | `supabase/migrations/0168_maps_media_types_and_plan_frame.sql` exists on `main`, replaces the wildcard with six raster types, `raise exception`s if any SVG spelling survives in `allowed_mime_types`, and warns by key about SVG objects already in the bucket. `CLAUDE.md` still said "which no bundle has written yet". |
| 4 | 0071 + 0074 | **CONFIRMED, and the file count was wrong too** | Measured on this checkout with no `.env`: **13 errors across 10 files**, not eleven across eight. Breakdown: 8 `PUBLIC_SUPABASE_URL`, 3 `PUBLIC_SUPABASE_ANON_KEY`, 2 more `PUBLIC_SUPABASE_URL` reported with a `(ts)` tag. With the two values exported before `svelte-kit sync`: **0 errors, 37 warnings, 31/5/1**, exactly as documented. |
| 5 | 0070 | **ALREADY FIXED, with a real residual** | The draft-mirror paragraph is already in `CLAUDE.md` (`$lib/notebook/draft-mirror.ts`, the beacon measurement, the shadow rule, the key layout, the quota rule). What was missing is what the tree gained since: the **24-hour age cap** (`DRAFT_MIRROR_MAX_AGE_MS`), the dropped-not-coerced shape version, and **`src/lib/maps/shelf-mirror.ts`**, a second implementation whose own header argues for being a copy rather than a caller. That is a convention with two instances and no statement of it. Written now. |
| 6 | 0075 | **NOT TRUE ON THIS TREE** | `.github/workflows/integrate.yml` on `origin/main` contains no `npm test` and no suite step of any kind. The change that adds one (`merged_suite()`, a three-way verdict, ~253 added lines) is on **`claude/red-merge-green-parents-ft3e57`**, which is unmerged. Writing the rule as present tense would have made `CLAUDE.md` wrong in the other direction. |
| 7 | -- | **ALREADY FIXED** | The applied-migrations paragraph is already the honest pointer form ("A paragraph stating applied status anywhere in this file is a snapshot and is to be treated as wrong"), and `tools/idea-status.py` exists and does print a probe block. What it did not name is `tools/deploy-probe.mjs`, the newer instrument that reads production's own `pg_catalog` and is the one decision 16's fourth gate reads. Added. |

**Item 6 is the one worth reading twice.** The reported rule is real, the branch
carrying it is real, and it is still not true here -- so the correction is a
POINTER rather than a restatement: the paragraph now says that what "CI goes
green" means is `integrate.yml`'s own definition, that it has moved more than
once, that a change adding a merged-tree suite run is sitting on a named branch,
and that a reader should read the workflow rather than this paragraph. A
mechanism copied into prose is one that goes stale silently, which is exactly
what the two sentences above it had done.

## A3 -- THE FULL SWEEP, and its own count

Every backticked span in `CLAUDE.md` was extracted (2,043 spans, 1,396 distinct)
and classified, then each class was checked against the tree. **The seven
reported items were not the whole of it: the sweep found eleven more**, which is
the same ratio prompt 0060 hit on `docs/GAUNTLET.md` (a prior sweep found eight;
0060 found fifteen).

### What AGREES -- reported so the clean classes are auditable too

| Class | Checked | Result |
| --- | --- | --- |
| Route paths | 55 tokens against a 249-route table built from `src/routes` | 52 resolve. The 3 that do not are `/opt/node22/bin/prettier`, `/opt/pw-browsers` (filesystem paths) and `/IDEA/` (the legacy base path the document itself says is handled by redirects, not a route). |
| `$lib/` module paths | 31 | 30 resolve. The one that does not is `$lib/server/foundry-serve.ts`, which the document names to say it is DELETED. |
| Bare component/module basenames | 43 | 42 resolve anywhere in the tree. The one that does not is `style.css`, an example filename inside a student's Foundry bundle. |
| `tools/` `docs/` `supabase/` `.github/` `static/` `src/` paths | 68 | all resolve but `supabase/.temp/`, which the same sentence says is gitignored and written by `supabase link`. |
| `tests/` paths | 25 | all 25 exist. |
| CSS custom properties | 61 tokens | 54 real ones all appear under `src/`; the other 7 are CLI long flags. |
| npm scripts | 8 invocations | all defined in `package.json`. |
| Environment variables | 31 | every live one is read by code; every one the document calls RETIRED is read by nothing. |
| Mixed-case exported symbols | 177 | 174 resolve. `normalizeContentType` (storage-api, upstream), `closeBundle` (the Vercel adapter) and `helperTable` (the invented export in the `+server.ts` trap) do not, correctly. |
| Database object names | 93 with a subsystem prefix | 85 in real SQL, 4 prose fragments or elisions, 2 fiction (below), 2 correctly-absent (`is_instructor`, a column the document says must never exist; `notebook_pending_capture`, a `localStorage` key). |
| `SUPABASE_SERVICE_ROLE_KEY` readers | claim: "exactly FOUR places" | **AGREES.** `foundry-bundle.ts`, `push.ts`, `api/feedback`, `api/greenline-track-publish`. A fifth hit is prose inside `/dev/feedback`, not a read. |
| `package-lock.json` | claim: 4,649 lines, two-space indented against a tab-indented manifest | **AGREES exactly**, both halves. |
| `COIN_TXN_TYPES` | claim: five types | **AGREES** (`award`, `fine`, `purchase`, `adjustment`, `payout`). |
| `CELL_STATES` | claim: seven states, glyphs checkmark / up-arrow / circle / bang / E / dash / guillemet | **AGREES**, in that order, `src/lib/notebook-review.ts:262`. |
| Pathways | claim: six | **AGREES.** |
| `admin_owner_email()` mirror | claim: `apina@boscotech.edu` in `src/lib/admin.ts` and pinned in the schema | **AGREES**, both. |
| `IDEA_INTERFACE_STANDARDS` 1 and 10 | two citations | **AGREE** -- section 1 carries the reading-collapses bullet, section 10 the 44px and boundary-token rules. |
| Structural claims | no layout resets in `src/routes`; one `+error.svelte`; `SiteFeedback` and `NavigationProgress` mounted in the root layout; `_NON_ADMIN_STRIPS` / `_stripForNonAdmin` exported from `src/routes/vanguard/+server.ts`; `/a/`, `/b/` and `/coins/` route directories | all six **AGREE**. |

### What was STALE -- the eleven the sweep found

| # | Claim | Tree |
| --- | --- | --- |
| S1 | The spec JSON is written by `classroom_set_spec` | **No such object.** `classroom_set_assignment_spec` and `classroom_set_reference_spec` are the two, and `_classroom_check_spec` validates both. The wrong name is echoed in three source comments under `src/lib/classroom/` -- a code finding, reported below. |
| S2 | "The whole screen is a component the route mounts (`ReviewConsole`, `CoinDeskTool`, `GreenlineRace`, `ClassView`)" | **`CoinDeskTool` does not exist.** The other three do. The desk is one component per area now (`LogView`, `SectionManager`, `BalanceAdminPanel`, `ContractsManager`, `RolesManager`, `CategoriesManager`, `PayoutManager`), and four source comments still name `CoinDeskTool.svelte` as what they were factored out of. The document was using a dead component to illustrate a rule the surface no longer follows. |
| S3 | "the public viewer at `/maps` is a later bundle" | `src/routes/maps/+page.svelte` and `+page.server.ts` exist. It has SHIPPED. |
| S4 | "the future `/maps` viewer is PUBLIC ... and must never be prefix-guarded" | Same surface, second sentence, same word. The rule is right; "future" is not. Confirmed public: `/maps` is not in `authedPrefixes` and `+page.server.ts` reads no session. |
| S5 | IDEA Maps "schema 0161-0165 plus the `maps-media` bucket" | 0166 (short-link reserve), **0168** and 0172 (editor grants) all touch maps. |
| S6 | The Public tier list | Omits `/maps` entirely, which is now a public-tier surface. |
| S7 | `$lib/save-state.svelte` | `src/lib/save-state.svelte.ts`. The document spells it correctly forty lines away, in the `Pending.svelte` paragraph. |
| S8 | `$lib/save-guard.svelte` | `src/lib/save-guard.svelte.ts`. Same defect. |
| S9 | The effect sweep walks "350 files, 164 effects at the time of writing" | **423 and 196** measured today. Hedged into unfalsifiability rather than kept true. |
| S10 | "50 `startTestDb` calls request 37 DISTINCT chains" and "5.49s x 48 = 263s of a 320s run" | **194 calls across 139 files** today. The ratio is still the argument; the counts are a 2026-08 snapshot of a tree that has roughly tripled. |
| S11 | `IDEA_INTERFACE_STANDARDS` 2.11 | **There is no section 2.11.** That standard's sections are integers 1 through 13; `2.11` is a CHANGELOG VERSION, and the two rules it added live in **section 6**. The document's own instruction two sections down is "Cite them by section". |

**One item is reported and NOT edited: the `--hairline` count.** The document
says the token is drawn on "~190 elements in the classroom alone"; a source grep
finds 74 `var(--hairline` occurrences under the classroom paths. Those are
different quantities -- one is rendered elements, the other is declarations --
and no grep can settle it, so it is left as written and named here. The standard
itself carries a comparable figure (382 rendered instances repo-wide) taken by a
browser sweep, which is the instrument that would answer it.

## A4 -- where two documents state one rule, and who should own each

| Rule | Stated in | Agree? | Should own it |
| --- | --- | --- | --- |
| Whether a lane may merge `integration` into `main` | `CLAUDE.md` Working conventions; `IDEA_instructions.md` 4.20; `docs/decisions/entries/16`; `IDEA_REPO_WORKFLOW_STANDARD.md` §3 | **NO -- three-way** | `IDEA_instructions.md`. `CLAUDE.md` now defers and says so. **`IDEA_REPO_WORKFLOW_STANDARD.md` §3 still reads "`main` moves only through `deploy.yml`, pressed by a person", which decision 16 also contradicts** -- reported, not edited, since that file is outside this bundle. |
| The 44px / 24px tap floors | `CLAUDE.md`; `IDEA_INTERFACE_STANDARDS` 10 | **Partly** -- the standard's rule that the 24px floor is *declared in a named class on the surface's own root* was missing here | The standard. `CLAUDE.md` now carries the missing half, as a pointer with the section number. |
| The boundary vs hairline split | `CLAUDE.md`; `IDEA_INTERFACE_STANDARDS` 10 | **YES** | The standard; `CLAUDE.md`'s version is the implementation detail (`--boundary`, `--hairline`, `tests/boundary-token.test.ts`) and is correctly repo-local. |
| Reading collapses once work has started | `CLAUDE.md`; `IDEA_INTERFACE_STANDARDS` 1 | **YES** | The standard. |
| `gauntlet_practice_meter` | `CLAUDE.md`; `0155`'s comment; `tools/gauntlet-doc-check.mjs`; `tests/gauntlet-doc.test.ts` | **The tool and the test were already right**; the migration comment is immutable and the document copied it | The tool. `CLAUDE.md` now names the fiction as fiction and the new check pins it. |
| How a history entry is written | `CLAUDE.md`; `docs/HISTORY.md`; `docs/history/_tools/verify-split.mjs` | **YES** | `verify-split.mjs`, which is the only one that can enforce it. |
| Applied migration state | `CLAUDE.md`; `tools/idea-status.py`; `tools/deploy-probe.mjs` | **YES**, because `CLAUDE.md` states no numbers | The tools. |
| What each file owns | `IDEA_REPO_WORKFLOW_STANDARD.md` header | -- | It already says it, and `CLAUDE.md` did not repeat it. Now it does, quoted, which is the B3 answer. |

**The ownership rule was already in the tree and `CLAUDE.md` was the one file
not reading it.** `IDEA_REPO_WORKFLOW_STANDARD.md`'s header: "`IDEA_instructions.md`
owns how a prompt is written and how a session behaves; each repo's own
`CLAUDE.md` owns what is true inside that repo only." That is now a section in
`CLAUDE.md`, with the merge contradiction named as the case that proves it.

## A5 -- what transfers from `tools/gauntlet-doc-check.mjs`, and what does not

**Transfers:** the `{ check, claim, tree }` finding shape and the rule that a
finding names what the tree says INSTEAD; `formatFindings` as the assertion
message; the exported parsers so a test can assert them non-empty; the
comment-stripping corpus, which that tool wrote for `gauntlet_practice_meter`
specifically; the synthetic-tree fixture on real disk rather than a stubbed
`fs`; a `main`-guarded CLI.

**Does not transfer:** everything table-shaped. `docs/GAUNTLET.md` has a
migration table with one row per number, so "every migration has a row" and
"every row names a real migration" are checkable in both directions. `CLAUDE.md`
is prose with no enumerable structure, so there is no completeness direction at
all -- this check can say every name it USES is real and can never say it names
everything it should. That asymmetry is stated in the tool's header.

**Added here and not present there:** the INVERSE rule. `CLAUDE.md` makes
thirteen claims that a name does NOT exist -- a deleted module, five retired
environment variables, two documentation filenames that never resolved, a column
that must never be created, two fictional object names and one dead component.
An existence check cannot express any of them, and the paragraph describing a
retirement is just as wrong if the thing comes back. `ABSENT_BY_DESIGN` is
checked in that direction, and the test proves it bites.

## A6 -- the applied-migrations paragraph

It is already a pointer and stays one. `CLAUDE.md` records that a snapshot of
applied state was wrong for a whole night on 2026-08-31, and the paragraph that
replaced it says a stated applied status "is a snapshot and is to be treated as
wrong". Nothing was deleted; `tools/deploy-probe.mjs` was added beside
`tools/idea-status.py` as the instrument a gate actually reads, and the
generalisation was made explicit: **prefer the instrument to the number for any
figure a commit can move.** Three figures were converted to that form under B1
(the effect sweep's file count, the `startTestDb` counts, the suite timing).

## B2 -- the check, and the three controls

`tools/claude-md-check.mjs` (758 lines), run by `tests/claude-md.test.ts` (25
tests) and directly as `node tools/claude-md-check.mjs`.

Six existence rules and one inverse rule:

1. **`path-missing`** -- every `$lib/`, rooted, or bare-basename file token exists.
2. **`route-missing`** -- every documented route is answered by a `+page`, `+server` or `+layout`, with `[param]` segments matching and section prefixes counting.
3. **`sql-object-unknown`** -- every prefixed snake_case name appears in a migration or under `src/` **outside a comment**, and the finding names the real neighbours.
4. **`symbol-unknown`** -- every mixed-case identifier appears in shipped code outside a comment.
5. **`npm-script-missing`** -- every `npm run X` is in `package.json`, and the finding lists what is.
6. **`css-token-unknown`** -- every custom property is declared or read under `src/`.
7. **`absent-by-design-returned`** -- every one of the thirteen names the document says is gone has stayed gone.

Every finding carries `CLAUDE.md:<line>`, so it names a sentence rather than a
four-thousand-line file.

### Control 1 -- a sentence naming an object that does not exist

Appended to the real `CLAUDE.md`: "The roster is read by
`classroom_section_rosters`, and the component is `RosterPanelTool`." Both were
named, and the SQL finding named the real neighbour:

```
[sql-object-unknown] CLAUDE.md:4262 -- CLAUDE.md names `classroom_section_rosters`
    tree: no such object outside a comment; the real ones starting `classroom_section`
          include ... `classroom_section_roster`
[symbol-unknown]     CLAUDE.md names `RosterPanelTool`
```

Restored from a `cp` copy, **never `git checkout --`**, and verified
byte-identical: `e2880d6c104f8214b77a02b2b23cf587` before and after. Green after
the restore.

### Control 2 -- rename a real object, leave the document alone

A full copy of the tree, six independent renames, the document untouched. **All
six were noticed**, each with the correct line and the new name:

| Mutation | Finding |
| --- | --- |
| `classroom_section_roster` -> `classroom_section_manifest` in every migration and source file | `sql-object-unknown` at `CLAUDE.md:1696`, naming `classroom_section_manifest` as what the tree has |
| `src/lib/edit-baseline.svelte.ts` renamed on disk | `path-missing` at `CLAUDE.md:2526` |
| `foundryBundleUrl` -> `foundryFrameUrl` across `src/`, `tests/`, `tools/` | `symbol-unknown` at `CLAUDE.md:193` |
| `verify:browser` -> `verify:browsers` in the manifest | `npm-script-missing` at `CLAUDE.md:923`, listing the real scripts |
| `--acc-ink` -> `--acc-glyph` across `src/` | `css-token-unknown` at `CLAUDE.md:3626` |
| The deleted Foundry proxy module recreated | `absent-by-design-returned` at `CLAUDE.md:230` |

**The reach limit, stated because the first attempt found it.** Renaming
`foundryBundleUrl` in `src/` ALONE was NOT a finding, because the identifier was
still in `tests/`. That is correct behaviour -- a name present in code we ship or
test is not a fiction -- but it means the symbol rule catches a name that is gone
from the repository, not one that is gone from production code. The SQL rule has
the same shape and the path rule does not.

### Vacuity control -- required, and it is the one this file could not do without

Every assertion in the checker is a loop over something a parser produced, so a
parser matching nothing reports a spotless run over nothing. `tests/claude-md.test.ts`
asserts a floor for all seven document parsers and all five tree readers.
Measured on the corrected document: 2,043 backticked spans, 118 paths, 52
routes, 91 SQL objects, 174 symbols, 6 npm scripts, 54 CSS tokens; 249 routes,
10,372 SQL names and 23,575 symbols read out of the tree.

**And the strippers have their own control, because one of them was wrong.** The
first `stripJsComments` matched `/*` anywhere, which meant a vitest include glob
(`tests/**/*.test.ts`) opened a block comment that did not close for hundreds of
lines -- **most of `vitest.config.ts` was silently removed from the corpus** and
`globalSetup` was reported as a name this repository does not use. That failure
is invisible from the finding: an over-stripped corpus produces findings that
blame the document. The stripper is line-leading-only now, and the test asserts
both directions (a comment removed, the code beside it kept) plus the real
`vitest.config.ts` case.

### Exemption tables, pinned

`NOT_OURS` (9 entries) and `ABSENT_BY_DESIGN` (13) each carry a reason per entry
and are pinned by length and by name in the test, so a list nobody counts cannot
quietly widen. A third assertion checks that every `ABSENT_BY_DESIGN` token is
still NAMED in the document -- an exemption standing over nothing would never
fail and would never be noticed.

### One collision, worth recording

`tests/foundry-bundle-url.test.ts` sweeps every `.ts` directly under `tests/` for
the retired token-proxy names, and the first version of `tests/claude-md.test.ts`
spelled two of them in its fixtures, which reddened that sweep. The fix takes
every fixture name from `ABSENT_BY_DESIGN` instead of spelling one, which is also
the better test: it exercises whatever the table holds rather than a copy of it.

## B4 -- verification

- **`npm run check`: 0 errors, 37 warnings, 20 files.** Breakdown **31 `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`**, matching the documented baseline exactly. Run 2026-09-06 02:06 PDT.
- **Full suite `npm test`: 4 failed, 5,948 passed, 5,952 total, 291 files, 241s.** Run 2026-09-06 02:16 PDT.
- **All four failures are pre-existing on `origin/main` and none is mine.** Proven rather than argued: a detached worktree at `origin/main` (`eec8151`) with the same `node_modules` reproduced exactly those four and no others. They are the two `derived-numbers` assertions (9 route specs that no recorded browser-verify run has measured -- `composer-draft`, seven `greenline-portal*`, `upload-limits`) and the two `gauntlet-doc` assertions (`docs/GAUNTLET.md` has no table row for `0184_gauntlet_run_event_bounds.sql`). Both fixes are outside this bundle's ownership; prompt 0067's `claude/four-red-integration-tests-62a7ba` is still unmerged.
- **B5, confirmed by running it rather than assuming**: this bundle adds no route spec, and `tests/derived-numbers.test.ts` fails on specs OTHER bundles added and no browser run has measured. Its two failures are byte-identical on `origin/main`.
- **`node tools/claude-md-check.mjs`: green** on the corrected document.

## What was NOT verified

- **Nothing was run against the live Supabase project**, and nothing in this bundle could be. No migration, no RPC, no signed-in session. Every database claim above was checked against `supabase/migrations/` and `src/`, which is the schema as COMMITTED and not the schema as APPLIED.
- **No browser pass.** This bundle changes no rendered surface, so `npm run verify:browser` would measure nothing this diff touched; it was not run.
- **The `--hairline` "~190 elements" figure is not settled**, only reported. It needs a rendered-element sweep.
- **The check cannot say `CLAUDE.md` is COMPLETE**, only that the names it uses are real. A rule that should exist and does not is invisible to it, and the ownership section is the only defence against that -- which is a rule for people, not a check.
- **A name renamed in `src/` but still present in `tests/` is not a symbol finding.** Measured, stated above.

## Findings in code, each its own lane

Neither is edited here; both are outside this bundle's ownership.

1. **`classroom_set_spec` is named in three source comments and is not an object.** `src/lib/classroom/ContentComposer.svelte:270`, `src/lib/classroom/composer-staging.ts:95`, `tests/db/classroom-grading-bulk.test.ts:241`. The real RPCs are `classroom_set_assignment_spec` and `classroom_set_reference_spec`. Comments only -- nothing calls a missing function -- but it is the same shape as `gauntlet_practice_meter`: a plausible name living in comments, from which a document was written.
2. **`CoinDeskTool.svelte` is named in four source comments and no such file exists.** `src/lib/coin-balance/CoinBalanceView.svelte` (twice), `src/lib/coin-desk/RolesManager.svelte:28`, `src/lib/coin-desk/PayoutManager.svelte:15`, `src/lib/coin-desk/StudentPreview.svelte:19`. Each says it was "factored out of CoinDeskTool.svelte", which is true history and reads as a live pointer.
3. **`IDEA_REPO_WORKFLOW_STANDARD.md` §3 contradicts decision 16.** It says "`main` moves only through `deploy.yml`, pressed by a person who has typed that the migrations are applied". Decision 16 grants a lane the merge against a six-gate checklist. Its own header defers to `IDEA_instructions.md`, so the sentence is a summary that stopped matching what it summarises.
