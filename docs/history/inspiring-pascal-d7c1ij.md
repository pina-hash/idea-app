---
title: "Two small things left open for days: the gallery default's stale Build line, and the migration-claims parser that reads two real claims as none"
date: 2026-09-13
branches: [claude/inspiring-pascal-d7c1ij]
migrations: []
subsystems: ["foundry", "tooling"]
---

Two threads that had already been reported, in the ledger, and never closed.
Neither needed a line of new feature code -- one needed a decision entry
corrected to match the tree, the other needed a parser taught two shapes its
own report already named.

## One: decision 04's Build line was stale, not open

The prompt asked to change `FoundryGallery.svelte` line 127 from `'recent'` to
`'played'`. The line does not read that any more. Ledger 0185
(`claude/awesome-keller-pj6hkc`) built the fix on 2026-09-12, the same day Mr.
Pina answered decision 04, and it is on both `origin/main` and
`origin/integration` in commit `7a833149`. Verified by reading the tree rather
than trusting the decision entry: `FoundryGallery.svelte` seeds `sort` from
`FOUNDRY_GALLERY_DEFAULT_SORT`, which `telemetry.ts` defines as `'played'` --
one named export rather than the literal the decision entry described, which
is stronger than what was asked for. `tests/dom/foundry-sort.test.ts` already
pins the default, that it is not merely the first button in the picker, and
the tiebreak at sixty tied apps (past any small-array insertion-sort
threshold a V8-class engine might apply).

What never happened is the paperwork: ledger 0185 wrote its own history entry
(`docs/history/awesome-keller-pj6hkc.md`) but never touched decision 04's own
Build line, which is a file this ledger owns and that one did not. It read
`OPEN` for a full day after the fix landed, naming a specific line number
that had already moved. Closed here with the commit that actually did it,
and the specific tree facts re-derived rather than copied forward from the
Build line's original wording (the line-number citations are gone -- the
value has one named home now, so a reader does not need a line number to
trust it).

**The coverage note question the decision itself raised, checked and
reported rather than fixed.** Decision 04's own Build line said "the note
matters more under this default than it did under Recent," pointing at
`FOUNDRY_PLAY_COVERAGE_NOTE`. It IS rendered wherever a play figure appears
at the level of one app -- `FoundryPlayStats.svelte` and
`FoundryOwnerStats.svelte`, both on the detail pane a card opens into. It is
NOT repeated on the gallery LIST itself: `FoundryGallery.svelte` prints a
bare play count on each card under a play sort, with no note near the sort
control or the mosaic. Ledger 0185 considered exactly this question for the
personal-stats block and deliberately did not duplicate the note a second
time inside `FoundryGallery` (its own history entry says duplicating it there
would have meant "a second coverage note or none"), but that reasoning
covers the personal-stats layer, not the per-card ranking numbers, which
carry no note anywhere on the list surface. Not fixed here: adding prose to
a card mosaic is a design decision, and CLAUDE.md's design-cost rules for
this exact surface (measured contrast, measured column counts, a rasterized
look before shipping) are not something to spend inside a report-and-close
bundle. Recorded on decision 04 itself, where the next lane that touches this
surface will read it.

## Two: `migration-claims.mjs` silently dropped two real claims

Ledger 0197 found this and reported it without fixing it -- it did not own
`tools/migration-claims.mjs`. Two shapes:

- **Entry 0131** writes `` - Migration permitted: exactly one. Claims:
  `0196`. NOT APPLIED -- this container cannot reach the production
  database.`` The explicit `Claims:` regex required the digits to follow
  `Claims:` past only whitespace; a backtick in between failed the whole
  match, and the entry fell through every later branch (there is no comma
  after "one.", so the intent shape does not catch it either) to
  `unspecified`.
- **Entry 0138** writes `Migration permitted:` and `Claims:` as two SEPARATE
  bullets:
  ```
  - Migration permitted: exactly one.
  - Claims: 0197.
  ```
  `parseEntry` reads bullets into distinct `fields` keys, so `Claims: 0197.`
  never reached `fields['Migration permitted']` at all, and `classify()`
  only ever read that one field.

Verified both shapes were still present, unedited, before touching the
parser (ledger entries are effectively permanent records, so this was a
formality rather than a real risk, but CLAUDE.md's instructions were explicit
about re-checking rather than trusting a report). Measured the actual effect
on the live report: before the fix, `node tools/migration-claims.mjs --json`
listed both `0131-reserve-hx-slug.md` and `0138-html-assignment-write-gate.md`
under `unspecified`, with `raw` values showing exactly the mis-parse
described above; after, neither appears there. (Both numbers, `0196` and
`0197`, are long since landed migrations, so they do not show up in
`claimed` either way -- the report-level proof is the disappearance from
`unspecified`, not a new claimed row, and the fixture tests below are what
actually pin the parsed numbers.)

**The fix, in two independent pieces, matching the two independent causes:**

1. `parsePermitted` strips backticks from the body before any of its regexes
   run, rather than adding a second optional-backtick clause to the explicit
   `Claims:` regex. The `TAKEN:`/`TOOK:` shape already carries one such
   clause (`` `?(\d{4}) ``); a second copy next to it is exactly the kind of
   duplicate rule this repository's own conventions flag as the thing that
   quietly stops matching the first one. Stripping is global and covers any
   future backtick placement around a `Claims:` value, not just the one
   entry that happened to trigger this bundle.
2. A new `permittedText(fields)` helper joins a separately-bulleted `Claims:`
   field onto the `Migration permitted` text before it reaches
   `parsePermitted`, and ONLY when the `Migration permitted` text does not
   already carry its own `Claims:` clause -- so the ordinary inline shape,
   which is the overwhelming majority of the corpus, is read identically to
   before. This lives in `classify()`'s call site rather than inside
   `parsePermitted`, because `parsePermitted`'s own header states its job as
   reading ONE value; deciding which ledger bullets belong together is a
   decision about entry SHAPE, which is `classify()`'s layer (it already
   reads the full `fields` record for `Status` and everything else).

**Fixtures added, not just the two real-entry checks.** `tests/migration-claims.test.ts`'s
`entry()` helper gained an optional `claims` parameter that writes `Claims:`
as its own bullet (0138's shape) rather than folding it into `permitted`
(every other fixture in the file). Three new assertions: the backtick shape
directly against `parsePermitted`, the separate-bullet shape through
`classify()` (asserting the claim is now seen AND that `unspecified` is
empty), and an inline CONTROL proving the join does not fire -- and does not
need to -- when `Claims:` is already part of the `Migration permitted` text.
A future rewrite of either function has all three to answer to, not just the
one shape that happened to be fixed.

**Deliberately not widened into guessing.** No change here makes the parser
infer a number it cannot see; the two fixes make it see numbers that were
always stated, just past a backtick or on the wrong bullet. A line the
parser genuinely cannot parse still reports `unspecified`, as the file's own
comment says it must.

## What was measured

- `svelte-check`: 0 errors, 37 warnings in 20 files, matching CLAUDE.md's
  stated baseline exactly (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`). Re-derived on a fresh
  `npm ci` checkout with placeholder `PUBLIC_SUPABASE_URL`/`_ANON_KEY`
  exported before `svelte-kit sync`, per the checkout traps.
- `tests/migration-claims.test.ts`: 34 tests, all green, including the three
  new ones.
- `tests/apply-migration-trace.test.ts`: 29 tests, all green (this file also
  imports `parsePermitted`; unaffected by either fix, as expected since
  neither call site there uses the separately-bulleted shape and the
  backtick stripping only helps).
- Full suite: **458 files / 8684 tests, all green** (456.19s). Read off the
  summary line rather than the exit code, per CLAUDE.md's own instruction that
  `npm test` can exit 0 with a failing test in this repo -- the summary line
  itself is what was read here, not just its presence.
- `npm run verify:readme -- --route foundry`: 20 route/width run(s), 394
  measurement(s), 0 outside threshold, 65.8s wall clock. The store now holds
  214 specs, 428 runs, 7650 measurements, 0 outside threshold, newest on
  `8fe7a07`. This is a measuring instrument, not a gate (`exit 0` regardless);
  the ten regenerated `measured/foundry-*.json` files and the README's two
  counts regions are committed alongside, since they are the store's own
  record of the run rather than a hand edit.

## What was NOT verified

- Nothing was applied to any database; this bundle carries no migration.
- No signed-in Foundry surface was driven; the gallery's default-sort
  behaviour was verified by reading the code and its existing DOM-level test
  suite (`tests/dom/foundry-sort.test.ts`), which was already comprehensive
  before this bundle and needed no change.
- The gallery mosaic's per-card play-count rendering was read, not
  rasterized in this bundle -- the browser pass named in the prompt was
  scoped to the migration-claims parser's own concerns and the existing
  Foundry gallery route was not re-driven visually, since no pixel changed:
  this bundle's Foundry-facing change is zero lines of `.svelte`/`.ts` in
  `FoundryGallery.svelte` (it was already correct) and a documentation
  correction in a decision entry.

## What was deferred

- Whether the gallery's ranked list should carry its own
  `FOUNDRY_PLAY_COVERAGE_NOTE`, or some shorter form of it, beside the sort
  control or the mosaic. Recorded as an open question on decision 04 itself
  rather than decided here.
