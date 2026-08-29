---
title: "The two surfaces the knowledge-clock bundle deferred: an unranked mode's empty board and blurb now say so (`claude/gauntlet-leaderboard-unranked-messaging-4cup6n`)"
date: 2026-08-29
branches: [claude/gauntlet-leaderboard-unranked-messaging-4cup6n]
migrations: []
subsystems: ["GAUNTLET"]
---

## The two surfaces the knowledge-clock bundle deferred: an unranked mode's empty board and blurb now say so (`claude/gauntlet-leaderboard-unranked-messaging-4cup6n`)

`0146` took Reverse Engineer and Feature Golf off `gauntlet_leaderboard`, because
neither ranks on anything the server can check. `claude/knowledge-clock-leaderboard-khus4g`
(merged into `integration` before this branch started, see
`docs/history/knowledge-clock-leaderboard-khus4g.md` Part 1) fixed the post-run
sentence so a passing run in either mode says it passed. It explicitly deferred
two surfaces sitting below that sentence, because fixing them "needs a `ranked`
prop from the two routes that mount the component, which this session did not
own":

1. The empty board card, which still read "No verified runs yet. Be the first
   to clear it." to a student who just cleared an unranked challenge.
2. The leaderboard blurb above it, which still read "Machine-verified runs,
   best first. Failed runs are recorded but do not rank." -- true, but silent
   about the one fact that matters here.

Both are fixed here by threading exactly the prop that history entry named.

### Why this could not be inferred from `board` alone

An empty `board` array means two different things depending on the mode, and
the component cannot tell them apart from the array itself: "nobody has
cleared this ranked mode yet" and "this mode never puts a run on a board" both
render as `board.length === 0`. The distinguishing fact -- whether the mode
ranks at all -- lives in `gauntlet_leaderboard`'s WHERE clause (`0146`), a
migration this session was forbidden to touch. The client-side representation
of that same fact has to come from somewhere the client can read, and it has
to be ONE place, or it becomes the second list the task brief warned against.

### One source of truth: `ranked` on `GauntletMode`

`src/lib/gauntlet.ts`'s `MODES` catalog already IS the client's one statement
of everything about a mode (name, family, status, route). A `ranked: boolean`
field was added there -- `true` for `speedrun`, `drawing_reading`,
`gdt_tolerance`, `spot_the_error` (all unconditionally or conditionally
admitted by the view's WHERE), `false` for `reverse_engineer` and
`feature_golf` (0146's exclusion) -- read via a new `modeRanks(id)` helper,
the same shape as the existing `modeById`.

`ModelingRun.svelte` gained a required `ranked: boolean` prop (no default: a
component that renders leaderboard copy has no honest default for whether its
own leaderboard exists) and used it for the two deferred surfaces:

- The blurb: unchanged text when `ranked`; when not, "This mode is off the
  leaderboard: its score is not something the server can verify, so no run in
  it ranks. Runs are still recorded, and a supervised room still ranks it
  live." -- the same reason `0146`'s own header gives, echoing the wording the
  prior bundle already settled on for the post-run sentence, not a second
  version of it.
- The empty-board card: unchanged text when `ranked`; when not, "There is no
  board here to be first on. Clearing this challenge still counts toward your
  XP, it just does not rank." -- stated as a property of the mode, never a
  verdict on the student, per the task brief's own framing.

The two routes that mount the component (`feature-golf/[id]/+page.svelte`,
`reverse-engineer/[id]/+page.svelte`, neither owned by the prior session
either) each pass `ranked={modeRanks('feature_golf')}` /
`ranked={modeRanks('reverse_engineer')}` -- a call into the one catalog, never
a mode name typed into the component itself. If a future bundle promotes
either mode onto the board, flipping one `ranked` field in `gauntlet.ts` is
the whole of what both surfaces need; nothing in `ModelingRun.svelte` or the
two routes changes.

**What the post-run sentence (the fix the prior bundle already shipped) did
NOT need touching, and was left alone**: it is keyed on `myBest` and
`boardSettled`, which are themselves downstream of the same SQL exclusion
(`gauntlet_leaderboard` never returns a row for an unranked mode, so `myBest`
is structurally always null there) rather than on a second name-typed list.
Re-deriving it from `ranked` would have been a cosmetic rewrite of something
already correct and already covered by its own mutation-proved tests.

### A guard against the two facts drifting apart

Nothing type-checks that `MODES[].ranked` agrees with `gauntlet_leaderboard`'s
WHERE clause -- one is a plain TypeScript array, the other is SQL applied by
hand. Per this repo's own lesson from `gauntlet-tolerance-test-fix-u79q4y`
("ask a real Postgres for a runtime behaviour question, don't parse SQL for
what it happens to look like today"), `tests/gauntlet-mode-ranked-parity.test.ts`
seeds one passing run per mode against the real embedded Postgres with the
real migration chain through `0146`, reads `gauntlet_leaderboard` back for
each, and asserts `modeRanks(mode)` agrees with whether that mode's run
appears. A second test asserts the catalog names all six modes of the
`gauntlet_mode` enum exactly once, because `it.each(MODES...)` only ever
checks what `MODES` already lists -- a mode silently absent from the catalog
would never be checked against the database at all.

### Verification

- **`svelte-check`: 0 errors / 37 warnings, the 31/5/1 mix**, re-derived after
  `svelte-kit sync` with placeholder `PUBLIC_SUPABASE_*` exported (unchanged
  from the pre-existing baseline).
- **Full suite before: 169 files / 3618 tests, all passing** (measured by
  stashing this branch's changes and running `npm test` against
  `origin/integration`'s tip). **After: 170 files / 3628 tests, all passing**
  (+1 file, +10 tests: 3 new assertions in the existing DOM mount file, 7 in
  the new parity file).
- **Mutation proofs, all restored from a backup copy and md5-checked, never
  `git checkout --`:**
  - `ModelingRun.svelte`'s `{#if ranked}` branches collapsed to always render
    the RANKED copy (the pre-fix world): the two new UNRANKED-direction DOM
    tests reddened (`UNRANKED, nobody has run it`, `UNRANKED, after a passing
    run`); the RANKED positive control stayed green. Restored, md5 matched,
    re-verified 9/9 green.
  - The same branches collapsed the other way, to always render the UNRANKED
    copy: the `RANKED, no clears yet: still says "be the first to clear it"`
    positive control reddened, exactly the direction the task brief asked to
    be proved ("a ranked mode with no clears still says 'be the first'").
    Restored, md5 matched, re-verified 9/9 green.
  - `gauntlet.ts`'s `feature_golf` entry flipped from `ranked: false` to
    `ranked: true`: the new parity test's `feature_golf` case reddened
    (`expected true to be false`) against the real database, the other five
    modes stayed green. Restored, md5 matched, re-verified 7/7 green.
- `git diff --stat` after every restore showed only the intended five files
  (`src/lib/gauntlet.ts`, `src/lib/gauntlet/ModelingRun.svelte`, the two route
  files, and the two test files this session created/extended).

### How this was driven, and why not a browser route

No `/dev` route mounts `ModelingRun` -- the harness the prior bundle built for
it is the real-DOM mount in `tests/dom/gauntlet-modeling-run-mount.test.ts`
(`mountInto`, real Svelte effects, a real Realtime channel stub whose
registered handler is invoked the way a genuine Supabase INSERT would reach
it). That is the harness this session extended rather than building a second
one: `mountRun`/`runTo` gained an optional `ranked` param, and a new `describe`
block drives the empty-board card and the blurb through it in both directions,
including immediately after a passing run.

Per `tests/dom/README.md` and this repo's own documented trap, happy-dom has
no layout engine, so nothing here is a geometry, colour or tap-target claim --
every assertion is text content read off the mounted DOM (`.card p`,
`.board-note`). That is a real, driven mount (real effects, a real emitted
Realtime row, real conditional rendering), not a static read of the source;
it is not `npm run verify:browser`'s real Chromium, and no claim here should
be read as one.

### NOT verified

- **A signed-in browser session against either route.** Both need a Bosco
  Tech Google session; `npm run verify:browser` covers `/dev` routes only,
  and there is still no `/dev` route for `ModelingRun`.
- **The live Supabase project.** All database claims are against the embedded
  Postgres fixture with the real, unmodified migration files through `0146`.
- **`gdt_tolerance` and `spot_the_error` against a live board with more than
  one competing run.** The new parity test seeds one passing run per mode and
  checks presence/absence only; the existing `gauntlet-modeling-reveal.test.ts`
  already covers ranking ORDER for the modes it drives.
- No `classroom-updates.json` entry: GAUNTLET is not a classroom surface and
  has never appeared in that log.

### Not touched, per this session's ownership

`supabase/migrations/*`, `tools/`, `src/app.css`,
`src/lib/gauntlet/SpeedrunClock.svelte` -- confirmed by `git diff --stat`
showing no changes to any of them. `src/routes/gauntlet/speedrun/[id]/` and
`src/routes/gauntlet/leaderboard/` (this session's other owned paths) needed
no change: neither mounts `ModelingRun`, and `SpeedrunClock.svelte` already
had a `ranked` prop of its own (unrelated to this bundle, driving a different
copy question) before this session started.
