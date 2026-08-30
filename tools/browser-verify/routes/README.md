# `tools/browser-verify/routes/` -- one file per route spec

This directory holds the individual route specs `../routes.mjs` assembles into
the array `run.mjs` drives. It exists for the same reason
`docs/history/` does, and the mechanism is the same: see
`docs/HISTORY.md`'s "Why it was split" and
`docs/history/history-merge-split-vx1fmk.md` for the full argument, and read
the top-of-file comment in `../routes.mjs` before adding anything here.

**The loader's two collision guards are exercised by
`_tools/verify-loader-guards.mjs`** (`node
tools/browser-verify/routes/_tools/verify-loader-guards.mjs`), which mutates
this directory in place (a rename, then a decoy file) and restores it from an
in-memory copy, never with `git checkout --`. Run it after touching the loop
in `../routes.mjs` -- the order of its checks matters more than it looks: the
duplicate-path and slug-collision checks must run BEFORE the filename-match
check, or they become unreachable (see the comment above them in
`../routes.mjs`).

## Adding a route

Create `<slug>.mjs`, where `<slug>` is your route's own `path` with the
leading `/dev/` stripped, lowercased, and every run of non-alphanumeric
characters (`/`, `?`, `&`, `=`) collapsed to a single `-` -- e.g.
`/dev/home-order?role=student&classes=1&rows=3` becomes
`home-order-role-student-classes-1-rows-3.mjs`. `../routes.mjs`'s loader
computes the same slug from your spec's `path` and refuses to load the file
if the two disagree, so a typo in the filename is a load-time error rather
than a route silently never running.

This is collision-free BY CONSTRUCTION, not by convention: your route answers
on a URL nothing else in the app does, so your filename cannot collide with
another lane's. Do not derive a filename from a counter, a date, or your
branch name -- any of those is a number two parallel sessions could pick
identically, which is exactly the shared write point this split removes.

**Do not add an `order` export.** That field exists only on the 25 files the
original split produced (see below); everything else sorts after them,
alphabetically by filename, which is why the slug rule above matters more
than it looks -- it is also your file's place in line.

The file's default export is the spec object:

```js
export default {
	path: '/dev/your-route',
	label: 'What the surface is',
	// ...the fields below
};
```

## The spec shape

- `path` -- the dev route. Doubles as this file's own name (see above).
- `label` -- what the surface is.
- `aliasOf` -- present when this spec measures a different STATE of a route
  another spec already names; `urlFor` visits `aliasOf` instead of `path` in
  that case, and the two specs' filenames are independently derived from
  their own (different) `path`s regardless.
- `prepare` -- `[{ click }|{ waitFor }|{ evaluate }, waitMs?]`, reaching the
  state to measure. `click` presses a selector and waits on an `until`
  predicate SOURCE; `waitFor` is a page-side predicate SOURCE waited on until
  it holds, for a state reached by an async payload landing rather than a
  press; `evaluate` runs a page-side function SOURCE and reports its return
  value.
  **Every step is a measurement** (`prepare-click`, `prepare-wait`,
  `prepare-eval`), counted in the summary and gating `--strict`. A click step
  passes only if the click ACTUALLY FIRED: a `until` the page satisfies at REST
  short-circuits `clickUntil` and the step reaches no state, which is a finding.
  Write the predicate against something only the click can produce; `force: true`
  is the escape hatch and annotates itself in the report.
- `settleMs` -- how long to let entrance animations finish before measuring.
- `contrast` -- `[{ selector, label, min }]` -- 4.5 for copy, 3 for a
  boundary.
- `tapTargets` -- `[{ selector, label, min }]`.
- `tapReach` -- `[{ selector, label, min }]` -- for a `.tap-reach-44` control
  whose HIT AREA is grown by a pseudo-element rather than its own box; see
  `checks.mjs`.
- `presence` -- `[{ selector, label, expectPresent, maxPresent, expectVisible,
  maxVisible }]`. The two `expect*` values are FLOORS; the two `max*` values are
  the ceilings. **`expectPresent: 0` implies `maxPresent: 0`** -- a floor of
  zero asserts nothing, and every absence row in this directory means exactly
  zero. State `maxPresent` explicitly wherever the row's own prose names a count
  ("2 chips, never 3"); leave it off only where a floor is genuinely wanted, and
  say so in the comment. An absence row cannot tell "the rule holds" from "the
  selector was renamed", so it belongs beside a positive control in the same
  spec.
- `domOrder` -- `[{ before, after, label }]` -- asserts one selector precedes
  another in DOM order.
- `orderResult` -- `[{ evaluate, expected, label }]` -- asserts a page-side
  evaluation's return value against an expected value, for a claim no DOM
  read can settle (a write that landed, a reachability probe).
- `statePairs` -- `[{ activeSelector, inactiveSelector, label }]` -- asserts a
  pressed/active control actually renders differently from its unpressed
  siblings, not merely that both individually clear a contrast minimum.
- `datalistOrder` -- `[{ inputSelector, evaluateExpected, label }]` -- an
  input's `list` attribute resolves to a real datalist, options in the order
  a page-side probe function produces (`evaluateExpected` calls that probe
  rather than a list retyped here).
- `motion` -- `[{ selector, label, expect }]`, where `expect` is `'gated'`
  (default) or `'never'`. Sweeps every element under `selector` in BOTH
  reduced-motion states: `'gated'` needs at least one element animating under
  `no-preference` and none of them still moving, still transformed or unpainted
  under `reduce`; `'never'` needs zero animated elements in either state (the
  FRC brand rule). Every entry in one spec is measured in ONE pair of media
  flips, so adding entries is cheap; see `checks.mjs` and the harness README's
  `motion` section.
- `textContains` -- `[{ selector, label, must, mustNot }]`.
- `ignoreConsole` -- regex sources for errors that belong to the FIXTURE.

Selectors are ANCHORED (a component root, then the element) rather than bare
tag names. A bare `svg` on `/dev/animated-logo` matched the site-feedback
glyph mounted by the root layout and reported it as a failure; the emblem
there is not an svg at all.

## A harness must be in the room production is in

A spec's numbers are only as good as the layout chain the harness mounts. Room
classes come from the LAYOUT chain (`/coin-desk/+layout.svelte` gives every area
`.cd-root`, `/gauntlet/+layout.svelte` gives `.gt-root`, `/reference/+layout.svelte`
gives `.cr-root`), so a dev route -- which has no such layout above it -- carries
whatever wrapper its own page puts there, and by default that is none.

Four mismatches were found and closed at once, each one measured rather than
assumed: `ShortLinkManager` was harnessed inside `.cr-root` while `/admin/links`
has no room; `AnimatedLogo`, `PathwayChip`, `Avatar` and `StudentPreview` were
harnessed with no room while `/reference/[itemId]`, `/gauntlet/leaderboard` and
`/coin-desk/preview` are `.cr-root`, `.gt-root` and `.cd-root`.

Three things that fall out of fixing them are worth knowing before doing it
again:

- **A room class needs its stylesheet imported too.** `.cd-root` is registered
  in `$lib/shell/split.css`, `.gt-root` in
  `$lib/gauntlet/viewport/viewport.css`, `.cr-root` in
  `$lib/classroom/classroom.css`. Without the import the wrapper is a class with
  no rules: a room in the markup that paints nothing, which is a worse fixture
  than no wrapper at all. Every room fix here therefore carries a `presence` row
  asserting the room actually mounted, because the contrast rows alone would
  quietly go on reporting the portal plate.
- **A room can repaint the whole page, not just its subtree.**
  `classroom.css` carries `body:has(.cr-root) { background: var(--surface-0) }`,
  so a `.cr-root` section added to a roomless harness takes the plate out from
  under the roomless half. Measured on `/dev/animated-logo`: the note copy's
  ground moved rgb(18, 26, 18) -> rgb(10, 12, 11) and its ratio 5.31:1 ->
  5.87:1. That is what forced `/dev/animated-logo-room` to be a second ROUTE
  rather than a section, and it is the general shape of "where a component ships
  in two rooms it needs two harnesses".
  `.gt-root` has no such rule, which is why `/dev/pathways` could take a second
  stage in the same page.
- **Anchor a contrast selector away from the new stage.** `contrast` reports the
  WORST match, so an unanchored selector silently folds two rooms into one
  number and the second row becomes a duplicate of the first.

## Shared values

`_shared.mjs` holds `WIDTHS` and `SETTLE_ENTRANCE`, the two things more than
one route file needs. The leading underscore marks it as infrastructure
rather than a route spec -- `../routes.mjs`'s loader skips any `_`-prefixed
file here, the same escape hatch a SvelteKit `+server.ts` uses for a
non-route export (CLAUDE.md: "anything whose key starts with `_`"). A route
file that needs `SETTLE_ENTRANCE` imports it with
`import { SETTLE_ENTRANCE } from './_shared.mjs';`.

## `_tools/split-routes.mjs`

The one-shot script that produced the 25 files below from the monolithic
`routes.mjs` array (pinned at `b4ceb02`, the commit this split branched from).
It is not a tool anyone runs again -- it refuses to overwrite a file that
already exists -- and is kept only as the record of how the split was done
and that it was mechanical rather than retyped.

## The 25 original files, and their `order`

Every file below carries `export const order = N`, its exact position (1-25)
in the array before the split. That is what proves the split lossless: the
assembled table reproduces the original array's route order exactly, the same
way `docs/history/_tools/verify-split.mjs` proves the history split's byte
equality. A new file never gets one of these numbers -- see "Adding a route"
above.
