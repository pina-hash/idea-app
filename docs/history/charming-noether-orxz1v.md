---
title: "Fifteen decisions answered, and the two things measuring them turned up"
date: 2026-09-12
branches: ["claude/charming-noether-orxz1v"]
migrations: []
subsystems: ["docs", "foundry", "notebook", "classroom", "maps", "tournaments"]
---

Mr. Pina answered fifteen open decisions on 2026-09-12. This bundle recorded them
and nothing else: no migration, no file under `src/`, no test, no workflow. Every
`- Decision:` line is his answer in his words, and where he decided against the
default a predecessor had written into the entry, the entry now says so plainly
rather than quietly adopting the new answer as though it had always been the plan.

Open decisions went from eight to four. What is left is entry 13, which is
explained below, and the three IdeaCAD entries 24, 25 and 26, which he did not
reach.

## What was recorded, and the three shapes it came in

**Twelve closed.** 04 gallery order to MOST PLAYED. 07 Foundry stats FULLY PUBLIC in
two layers. 14 profile photos KEEP, because it makes students responsible for what
they upload. 17 tournament thumbnails KEEP PUBLIC. 18 map photos PUBLIC including
drafts, because the editing team is responsible for what goes on the map. 20 the maps
guesser game ON HOLD. 01 the Foundry class disable ALREADY SHIPPED. 05 publishing
requires a description NO. 02 the coin ledger test RLS policy REMOVE IT. 23
link-preview DNS pinning LEAVE AS IS. 11 the Cosso Unit 1 checkpoint image STALE. 21
the blocking merge gate YES, BLOCK.

Four of those twelve are reversals of this assistant's own stated default: 04 (which
proposed keeping Recent), 05 (which proposed the narrowing), 07 (which proposed not
public at all, and which he widened in a second direction the entry had not even
raised -- a figure proposed for an app's AUTHOR is now owed to every PLAYER about
themselves), and 21. Each entry names the reversal in an `- Against the default:`
line, because an entry that silently absorbs a correction is one nobody can later
read as a correction.

**Two closures are not decisions and are labelled as neither.** 01 closed as
already-done: `0173_foundry_section_gate_description_and_trust.sql` section 1 shipped
the per-section toggle, which is the entry's own stated default, so the capability
exists and the answer was never owed. 11 closed as withdrawn: stale, and kept as a
file rather than deleted, because a deleted entry answers "was this ever raised"
wrongly.

**Three are builds and were rewritten as scoped build items**, each measured against
the tree with file and line rather than described: 03 the Foundry gallery, 08 the
notebook spreadsheet, and 07's per-user layer.

## Decision 20 is gated on content, and the entry says what unblocks it

He asked explicitly that the guesser game be written down so it is not forgotten,
and deferred it because there are no real rooms to guess from. So the entry states
the gate rather than a date: what unblocks it is PUBLISHED ROOMS WITH
COMPARTMENT-LEVEL PHOTOS, and nothing else. Every mechanism it would need has already
shipped -- nine maps migrations are on `origin/main` and the public viewer is live --
so the next person asking "can we do this yet" answers by listing published rooms,
not by reading a schedule. What he did NOT do is scope it, and the one part that
changes what `/maps` currently is, whether the game keeps score, is left open in the
entry rather than assumed away.

## Decision 05 had already been built on the default he just reversed

This is the finding worth the bundle. Entry 05 asked whether publishing should
require a description. Its stated default was a schema narrowing on the existing
column. Prompt 0015 shipped exactly that on 2026-09-02 -- while the entry was still
`Status: open` with a blank `- Decision:` line -- so the requirement has been in the
tree for ten days on the assistant's default and never on his answer. On 2026-09-12
he answered NO: minimize requirements to name, thumbnail and contents.

Measured, the requirement is enforced in three places:

- `0173_foundry_section_gate_description_and_trust.sql` **line 283**, the trigger
  `_foundry_published_version_check`, which raises "Write a description before
  publishing." whenever the publication MOVES. The trigger is careful about existing
  work -- it fires only when the column genuinely changes, so an app already
  published with no description keeps serving and stays rollable.
- **Line 498**, inside `foundry_submit_version`: "Write a description before
  submitting." So the requirement bites EARLIER than publication -- a student cannot
  send a build for review at all without one, which is worth knowing before anybody
  prices the reversal off the publish path alone.
- `src/lib/foundry/surface.ts` lines 129-142, `foundryPublishBlockers`, whose own
  comment opens "A DESCRIPTION IS THE ONE REQUIREMENT AND IT IS THE DATABASE'S".

So the reversal is a new migration plus a source change; 0173 is an applied record
and is not rewritten.

**What could not be established, and it is the thing the urgency turns on: whether
0173 is applied to production.** `docs/migrations-applied/` holds nothing for it, a
cloud container cannot reach the production database, and no file in this repository
records applied state. If it is applied, a student cannot SUBMIT a build without a
description right now, let alone publish one. The entry says that in those terms rather than guessing.

One thing his answer does NOT settle, and the entry refuses to read into it: whether
"thumbnail" in his list of three makes `cover_path` required. It is optional today.
That question is bound up with decision 03, where the card IS the thumbnail and a
gallery of thumbnails has nothing to draw for an app without one, so it is raised
there instead.

## Decision 13 was a contradiction, and the entry was right

Entry 13 records that drag-to-reorder was removed from the spec table's rows to fit
two 44px actions on one line. Mr. Pina reports it works for him right now. One of
those had to be wrong, so the instruction was to read the component and change no
code.

Measured on `origin/integration`:

- `src/lib/classroom/SpecRenderer.svelte` lines 613-616 are the whole row-action
  cell and hold TWO controls, Duplicate row and Delete row. There is no `moveRow`
  function in the file; the only occurrence of the name is line 1130, inside the
  comment explaining its removal. Line 1151 pins `grid-template-columns: repeat(2,
  44px)`.
- **At every width.** The file contains zero `@media` and zero `@container` rules, so
  there is no viewport at which a third or fourth control appears. The cell is gated
  only on `canEdit` (line 127, `!locked && !readonly`), which is about editability
  and not about width.
- **On `main` too.** The removal is `be46fe87`, 2026-09-05 17:17Z, and
  `git merge-base --is-ancestor be46fe87 origin/main` answers yes. Reading
  `origin/main`'s own copy of the file, `grep -c "function moveRow"` is 0.

So the entry is correct and needed no repair. What he is using is one of five other
classroom surfaces that still reorder, and the likely one matches the word "drag":
`ClassView.svelte` has drag-to-reorder from line 507 via `$lib/classroom/sort-drag`
(also on `main`) AND a row menu carrying worded Move up / Move down at lines 1234 and
1240, for items within a unit group. The others are `ContentComposer.svelte`
2171/2180, `RubricBuilder.svelte` 420-421, `FileUploadPanel.svelte` 687/696 and
`AttachmentList.svelte` 382/391.

The reason the confusion is the expected one rather than a surprising one: a spec
table is a STUDENT's grid, filled in at a bench. An instructor has little reason to
be typing in one, and every surface he does rearrange still reorders.

**Entry 13 therefore stays `open`.** The measurement is done; the decision it asks
for -- whether losing in-place row reordering is a fair price for roughly a third of
a phone screen per table -- is not answered by a report that another screen works.
Setting it `decided` would have dropped a genuinely owed decision off
`tools/idea-status.py`'s list, which is the opposite of what this directory is for.

## Decision 07's per-user layer needs no collection change

The question the prompt asked was whether the data to show a student their own
playtime already exists or needs collecting. **It exists, and it is already being
recorded.** `student_app_plays` (`0139_foundry_telemetry.sql` lines 183-195) carries
`player`, `app_id`, `started_at` and `last_seen_at`, and the duration is
`last_seen_at - started_at` -- the same arithmetic `foundry_app_play_stats` already
sums, only unfiltered by player. The index is there too:
`student_app_plays_resume_idx` at line 208 is `(player, app_id, last_seen_at desc)`,
built for the resume lookup and exactly what a per-caller read wants.

What is missing is a READ, and only that. The table has RLS enabled with no policy
and no grant to `anon` or `authenticated` (line 229; 0139's header calls it "two
refusals rather than one"), and no function, view or grant returns a per-player
figure to any client. So layer two is one new SECURITY DEFINER function taking no
identity parameter, which must revoke from `anon` by name in 0166's shape because
0137's sweep does not cover a function created after it.

Layer one is smaller than it looks: `plays` and `plays_7d` are ALREADY readable by
any signed-in caller through `foundry_play_counts`. Only `players`, `seconds_played`
and `last_played_at` are owner-or-admin, at 0139 lines 448-450.

Two caveats went into the entry because without them the number lies. Every figure
is plays THROUGH THE PORTAL: a play started from `/a/<appId>/` is structurally
uncounted, so twenty hours played from a shared link is zero hours here, and
`FOUNDRY_PLAY_COVERAGE_NOTE` has to sit beside every figure. And `player` is
`on delete set null`, so a departed student's hours stay in the app's total and stop
being anybody's own.

And what his answer does not widen: he answered what a student sees about THEMSELVES
and what everyone sees in AGGREGATE. `CLAUDE.md`'s "NO PER-PLAYER READ OF PLAY DATA
EXISTS FOR ANYONE, ADMIN INCLUDED" survives intact.

## Decision 03's hard part is a dimension nobody stores

He wants the gallery to look like a Steam library: the card IS the uploaded
thumbnail, no chrome, no generated colour, and the card's aspect ratio conforms to
whatever the student uploaded, so the gallery is a mosaic rather than a uniform grid.

The "same brownish orange" is measured and it is the ROOM, not a per-card colour:
there is no `data-app` variation on `.fdy-card` at all. `.fg-root`
(`src/lib/foundry/forge.css` lines 153-155) aliases `--surface-1` to `--fg-surface`
`#14110d` and `--surface-2` to `--fg-surface-2` `#1b1712`, the forge's warm "worked
steel" plate, so every card is that ground identically and a cover-less tile is the
slightly lighter one. He is describing it correctly.

The single line his answer reverses is `FoundryGallery.svelte` lines 466-474, the
cover box's fixed `aspect-ratio: 16 / 9` -- which was itself a measured decision, on
the grounds that browser windows and phone screens "sit close to it". And the thing
that makes it a build rather than a CSS edit: **there is no stored cover dimension.**
A sweep of `supabase/migrations/` and `src/` for `cover_width`, `cover_height`,
`cover_aspect` and `cover_ratio` returns zero hits, so the mosaic has two possible
shapes and the choice is real -- measure the intrinsic ratio in the browser (no
migration, but the grid reflows as covers arrive) or store it at upload (a migration
plus a write at all three upload sites). The entry says to pick before any CSS is
written.

Two constraints went in beside it. A mosaic of unequal heights is a multi-column
container and never a grid, because a grid row is as tall as its tallest member --
already measured and written into `CLAUDE.md`. And a name drawn into a PNG still
needs a text name: a phone cannot hover, a screen reader cannot read an image, and an
app with no cover has no name at all. "More customization" he named and did not
scope, so the entry says so rather than inventing it.

## Decision 08 is a dependency decision first

He was explicit: not a table, a real spreadsheet engine with working formulas, and he
dislikes how Google Docs tables behave. His bar is that it work as well inside a note
as the text editing does.

Measured, a note is three block types. `0125_notebook_run_text_parity.sql` lines
206-287 is the live gate: `p` with keys `type`/`runs`, `ul` and `ol` with keys
`type`/`items`, and line 278's `else return false` refuses everything else -- "an
unknown block type is the whole point of this function". The editor schema
(`rich-text-schema.ts` lines 45-57) is a closed StarterKit union where nothing
table-shaped is even switched off; it is absent. And there is no formula engine in
the dependency tree: 17 runtime dependencies, and hyperformula, formulajs, xlsx,
handsontable, jspreadsheet, univer and luckysheet all return nothing.

So the first thing the build settles is the evaluator, because `CLAUDE.md` prices a
new dependency at a 4,649-line lockfile commit and nothing else can be estimated
until that is answered. Then the gate widens ALONE, before anything can emit a grid,
and must answer every already-stored note exactly as the deployed gate does. Then
every walk carries the node down -- `rich-text-doc.ts` is the one shared walk and the
SQL projection mirrors it. Then append-only decides what a cell edit costs, which is
0129's problem at spreadsheet scale.

## What was measured

- **Full suite, `origin/integration` at branch time and again after the edits:** 405
  files, 7819 tests, 0 failures, 365.8s. Unchanged, which is the expected answer for
  a bundle that touched nothing outside `docs/`.
- **`svelte-check`, same two readings:** 0 errors, 38 warnings, 21 files -- 32
  `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`.
- **Production reachability, before the merge:** `https://ideabosco.com/` 200 in
  0.68s. `https://ideabosco.com/coins/` 308 and `https://idea-app-sage.vercel.app/`
  308, both documented redirects.
- **`npm ci` left `package-lock.json` untouched**, confirmed with
  `git status --porcelain` -- which is the reason it is `npm ci` and never
  `npm install` in a fresh container.

## What is explicitly NOT verified

- **Whether migration 0173 is applied to production.** `DEPLOY_PROBE_URL` and
  `IDEA_MIGRATION_URL` are both unset here, so the applied set is CANNOT SAY and
  never "applied". This decides how urgent decision 05's reversal is and nothing in
  this container can answer it.
- **Nothing was rendered.** No browser pass was run: every claim here is a source or
  catalog reading. Decision 03's layout claims in particular are read off stylesheets
  and are not measured geometry, and the entry is written that way.
- **`verify:readme` was not run**, per the prompt.
- **Decision 02's premise is still unverified.** His approval to remove the policy
  does not identify which policy, and the 2026-09-02 tree check that could not find
  one still stands. The entry says 0174 names it or reports that the premise has
  nothing behind it.

## Reported, not fixed

- **`CLAUDE.md`'s `svelte-check` baseline is stale.** It says 40 warnings in 22 files
  (34/5/1); the tree measures 38 in 21 (32/5/1). `CLAUDE.md`'s own rule is that a
  session measuring a different number corrects the line in the same change -- but
  `CLAUDE.md` is outside this bundle's owned surface, which is three paths under
  `docs/`. Ledgers 0168 and 0172 each reported the same gap for the same reason, so
  this is the third report. The drift is entirely `state_referenced_locally`.
- **Entry 17 had been printing as an owed decision since 2026-09-06.** Its `Status`
  line read `open -> ANSWERED 2026-09-06 ...`, and `tools/idea-status.py` takes the
  FIRST WORD of that line, so a fully answered entry sat in DECISIONS OWED for six
  days. It reads `decided` now, and its 2026-09-06 note is preserved verbatim under a
  `- Prior note:` field rather than overwritten, because a dated record is not
  rewritten.
- **A `Status` line's first word is load-bearing and punctuation breaks it.** Writing
  `- Status: open. MEASURED ...` on entry 13 parsed as `open.`, which does not equal
  `open`, and would have dropped the one genuinely open decision in this bundle off
  the list. Caught by running the tool's own parser over every entry before
  committing. Worth knowing before the next person writes a status with a clause after
  it.
- **`RubricBuilder.svelte`'s reorder arrows are 28px on a desktop.** Lines 595-596
  set `1.75rem` squares, rising to `2.75rem` only under `@media (max-width: 640px)`
  (line 686), and the component's root carries no named instructor-only class to
  claim the 24px floor. That is decisions 09 and 12's shape; it is noted in entry 13
  and not acted on.

## What was deferred

Every build these entries now scope: 02's migration (ledger 0174), 04's one-line
default, 05's three-place reversal, 07's two layers, 08's whole project, 03's
redesign, and 21's workflow change, which is still the single-lane bundle entry 21
already said it had to be. None of them is this bundle's, which owned no file under
`src/`.
