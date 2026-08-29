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
  state to measure. `click` presses a selector and waits on a `until`
  predicate SOURCE; `waitFor` is a page-side predicate SOURCE waited on until
  it holds, for a state reached by an async payload landing rather than a
  press (the wait is reported in ms and a predicate that never holds prints
  FAILED); `evaluate` runs a page-side function SOURCE and reports its return
  value.
- `settleMs` -- how long to let entrance animations finish before measuring.
- `contrast` -- `[{ selector, label, min }]` -- 4.5 for copy, 3 for a
  boundary.
- `tapTargets` -- `[{ selector, label, min }]`.
- `tapReach` -- `[{ selector, label, min }]` -- for a `.tap-reach-44` control
  whose HIT AREA is grown by a pseudo-element rather than its own box; see
  `checks.mjs`.
- `presence` -- `[{ selector, label, expectPresent, expectVisible }]`.
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
- `textContains` -- `[{ selector, label, must, mustNot }]`.
- `ignoreConsole` -- regex sources for errors that belong to the FIXTURE.

Selectors are ANCHORED (a component root, then the element) rather than bare
tag names. A bare `svg` on `/dev/animated-logo` matched the site-feedback
glyph mounted by the root layout and reported it as a failure; the emblem
there is not an svg at all.

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
