---
title: "Gate 4 gets a record-backed answer, and two feedback decisions land: Foundry leaderboards ranked by app, and a Maps outline is the interior face (`claude/new-session-i70xs0`, no migration)"
date: 2026-09-22
branches: [claude/new-session-i70xs0]
migrations: []
subsystems: ["Decisions", "Standards", "Migrations", "Foundry", "Maps"]
---

Three decisions recorded under `docs/decisions/entries/`, one of which (gate 4) had
stopped ten lanes while existing as a decision nowhere in the tree, and
`docs/standards/IDEA_instructions.md` moved 4.28 to 4.29 to carry its answer. Docs
only; nothing under `src/`, `tools/` or `tests/` changed.

## Entry 34: gate 4 had no decision entry, and the attribution it was given does not hold

Confirmed by reading every file under `docs/decisions/entries/`: none named "gate 4"
or the deploy probe before this bundle. The router chat that raised this also
attributed the question to "decision 31" -- **that attribution is not in this tree.**
Decision 31 is real, is titled "What is IdeaCAD, and where does it run?", and is
DECIDED, but it is about IdeaCAD's scope and application boundary. Grepping
`IDEA_instructions.md`, `CLAUDE.md` and every decision entry for "decision 31" beside
"gate" finds nothing; the only two citations of decision 31 anywhere are
`docs/ideacad/legacy-product-record.md` and decision 32, both about the
technical-drawings boundary. Wherever the "decision 31" attribution came from, it is
not something this repository ever recorded, and entry 34 says so rather than
repeating it.

**What IS in the tree is a narrower precedent that predates this decision by weeks**:
ledger 0114's "GATE 4 SUBSTITUTION", which nine or so later ledger and history entries
cite by name (`grep -rl "gate 4" docs/history docs/prompt-ledger/entries`). That
substitution applies only when the migration range between `main` and `integration`
is EMPTY, on the reasoning that an empty range leaves nothing for gate 4 to prove. It
never covered a non-empty range checked from committed records, which is what entry
34 answers.

**The decision itself:** item 4 is satisfied either by the probe exiting 0, or, where
it cannot run, by every migration a merge would newly deploy having a committed
applied record under `docs/migrations-applied/`, checked by number with the missing
set printed rather than summarized, and never reported as the probe having passed.

**A real gap was found while writing this down, and it is recorded rather than
fixed.** The decision text as raised said "every migration file present on
`origin/integration`" with no floor. Measured against the tree: 215 migration files
exist (0001 through 0217, with two permanent numeric holes at 0190/0191 -- confirmed
no `0190_*.sql` or `0191_*.sql` file exists, and `tools/migration-claims.mjs` already
reports them as holes a lane accounted for rather than as free numbers).
`docs/migrations-applied/` carries exactly 25 records, contiguous from `0193` through
`0217`, and nothing below `0193` -- `tools/record-applied.mjs` backfilled from `0193`
onward and no further (`docs/history/zen-edison-jpgz4s.md`). A literal, unbounded
reading of the substitute would print roughly 190 numbers as missing on every single
run, forever, which is noise rather than a finding. Entry 34 resolves this by scoping
the substitute to the migrations a merge would actually deploy -- the delta
`git diff --name-only origin/main...origin/integration -- supabase/migrations/` names,
exactly what ledger 0114's own "migration check" already computed -- and by naming the
pre-`0193` gap as a known, pre-existing hole that is not this bundle's to close.

**This bundle's own run of both routes, since this is the first bundle to execute item
4 under the new answer:**

- Probe: `node tools/deploy-probe.mjs --ref origin/integration` exits `1`
  (`EXIT.cannotRun` in the tool's own export) -- `DEPLOY_PROBE_URL` is unset in this
  container. The existing item 4 text said "Exit 2 or 3 is a stop", which never
  actually named the code a credential-less session hits (`1`, not `2` or `3`); the
  edit corrects this.
- Delta: empty. `origin/main` and `origin/integration` were the same commit,
  `3793ea2cfe4e7354fadb9b3cef985abd63a1084e`, for the whole of this bundle's run.
  Nothing for the substitute to check under the sensible (delta) scope, matching
  ledger 0114's own precedent exactly.
- Wider window, reported anyway: `0193` through `0217` all carry committed records
  (25 of 25). `0151` through `0189` plus `0192` (40 numbers) carry none -- the
  pre-existing gap above, not a finding about this bundle.
- The two routes do not disagree about anything this bundle is responsible for.

## Entry 35: Foundry leaderboards ranked by app, never by student

Mr. Pina's answer, verbatim: "ranked by app is fine. no need for student ranking."
Recorded what it forecloses (any board naming students -- `student_app_plays` has no
grant or policy to any role, `foundry_app_play_stats.players` is a count and never a
list, and migration `0204`'s own header already states "PUBLIC MEANS AGGREGATE";
this decision strengthens that rather than touching it) and what it unblocks:

- "Most versions or updates" needs zero new SQL. `foundry_list_apps` already projects
  `version_count` (confirmed in `0130`, restated in `0132` and `0173`), and it already
  reaches the client as `FoundryAppSummary.version_count`
  (`src/lib/foundry/transports.ts:219`).
- "Most hours played" needs a migration. `student_app_plays` already stores
  `started_at`/`last_seen_at` and `foundry_app_play_stats` already sums seconds for
  ONE app, but the only cross-app read, `foundry_play_counts`, returns exactly
  `app_id, plays, plays_7d` and no seconds column (confirmed by reading its body in
  `0139`, unchanged since). Widening it, or adding a sibling, is future work and is
  named in the entry as still open, along with the two accuracy facts any hours board
  must carry on its own surface: 60-second heartbeat slop, and `/a/<appId>/` direct
  plays are never counted.

Not built by this bundle.

## Entry 36: a Maps outline is the interior face

Raised by Mr. Pina's own feedback report 38 ("wall thicknesses must be accounted
for"), delegated with "i dont know what this means. use your best judgement." The
decision: the typed outline is the interior face of a room; thickness is a separate,
nullable, per-node value with a building default; a wall draws as a band lying
outward from the outline. The reason, which is the whole argument: every outline
already stored was typed by someone measuring a room from the inside, so reading it
as interior keeps every published row correct with no backfill.

Recorded three consequences a build session will hit, confirmed against the tree
rather than assumed: `mapsSnapTargets` in `src/lib/maps/maps.ts` currently offers one
bounding box per target with no notion of a face, and its own tie-break comment ("a
wall is the edge somebody means when two candidates coincide") stops describing a
single edge once a wall has two; the public viewer,
`src/lib/maps/viewer/MapsPlan.svelte` (not `MapsPlan.svelte` at the repo root -- it
lives under `viewer/`, distinct from the editor's `PlanCanvas.svelte`), draws walls
with `vector-effect: non-scaling-stroke` specifically "so a small room does not draw
with fat walls" (its own comment, quoted verbatim), which a real-dimension band
reverses on purpose. Left explicitly open: whether a polygon room's thickness is
per-edge or per-node, alongside the separate, already-existing defect that a polygon
already snaps to its bounding box rather than its real edges (`mapsFootprint` has no
per-edge branch for either outline kind).

Not built by this bundle.

## The standards edit

`docs/standards/IDEA_instructions.md` moved 4.28 (2026-09-13) to 4.29 (2026-09-21,
the date Mr. Pina answered the three decisions above). Only item 4 of the canned lane
ending changed; items 1, 2, 3, 5, 6 and the three-things-you-cannot-claim paragraph
are byte-identical to 4.28. `docs/standards/REGISTER.md`'s `IDEA_instructions.md` row
moved to 4.29 / 2026-09-21 in the same commit, with its `Owns` cell extended by one
clause naming the item-4 change.

**Freshness, checked twice as the standard requires:** cloned via `git fetch origin`
before editing (base confirmed 4.28, 2026-09-13, matching the claim handed to this
bundle) and again via `git fetch origin main` immediately before delivering, both
times landing on `3793ea2cfe4e7354fadb9b3cef985abd63a1084e` with no drift.

## What was measured

- `npm ci` then `npx svelte-kit sync` (a fresh checkout carries neither
  `node_modules` nor `.svelte-kit`, per the toolchain traps), then
  `npx vitest run tests/standards-version-header.test.ts`: **23 passed, 0 failed.**
  The header (4.29, 2026-09-21) and the newest changelog entry (4.29, 2026-09-21)
  agree.
- `python3 tools/standards-sweep.py`, run BEFORE pushing: reported the pre-edit state
  (register, mirror and local all at 4.28), because the sweep clones from `origin`
  and this bundle's edit was still local and unpushed at that reading. Re-run after
  the push; see the push confirmation below.
- `npm test` (the full suite): reported in the ending section below, since it was
  still running in the background at the time this entry was drafted.
- Decision-entry census: 33 existing entries (01 through 33), confirming the claim
  that 34, 35 and 36 were free. **Only 6 of the 33 carry a `Build:` line -- `04`,
  `21`, `27`, `28`, `29`, `30`.** The other **27 of the 33 existing decision entries
  carry no `Build:` line and therefore appear in no list `tools/idea-status.py`
  prints**, exactly as claim 2 said. This is named here as a record, not fixed here;
  retrofitting the other 27 is a separate bundle and was explicitly not this one's to
  do.
- `docs/migrations-applied/` read with no credential: 25 files, `README.md` plus one
  record per migration `0193` through `0217`, front matter carrying `migration: "NNNN"`
  with no database client anywhere in `tools/record-applied.mjs`'s source (confirmed
  by reading it; its own header states why it must not read `IDEA_MIGRATION_URL`
  or open a socket).
- `node tools/migration-claims.mjs`: highest landed `0217`, next free `0218`; `0190`
  and `0191` reported under "HOLES A LANE IN FLIGHT ACCOUNTS FOR", not as free
  numbers, from ledger entries `0098` and `0099` (both `Status: pushed`, both
  historical and both this session's own branch inherited them from `main`).

## What is explicitly NOT verified

- The Vercel preview. No cloud session can check it; see the report to the chat for
  the URL and the checks to run on it.
- Whether students are in class right now, which bears on whether merging to `main`
  right now is a good idea independent of the six-item checklist.
- Whether the record set in `docs/migrations-applied/` reaching back only to `0193`
  is itself a problem worth a backfill bundle. Named above as a finding; not this
  bundle's to fix.

## What was deferred

- Entries 35 and 36 are recorded decisions with no build. Whoever builds them starts
  from the "What is still open" sections in each entry.
- The pre-`0193` migrations-applied gap (`0001` through `0189`, plus `0192`) is named
  in entry 34 and here; closing it is a separate bundle, exactly as `record-applied.mjs`
  was for `0193` through `0210`.
- Retrofitting `Build:` lines onto the other 27 decision entries. Named, not done, per
  the prompt's own instruction not to.
