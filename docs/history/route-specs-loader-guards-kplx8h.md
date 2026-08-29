---
title: "The route-specs split's guards get exercised, and one of them turns out to be dead code (`claude/route-specs-loader-guards-kplx8h`, tools/browser-verify only, no migration)"
date: 2026-08-29
branches: [claude/route-specs-loader-guards-kplx8h]
migrations: []
subsystems: ["tools/browser-verify"]
---

## The route-specs split's guards get exercised, and one of them turns out to be dead code (`claude/route-specs-loader-guards-kplx8h`, tools/browser-verify only, no migration)

A prior session (branch `claude/browser-verify-routes-refactor-w5dtxf`, commit
`dfa8572`, already merged into `integration`) split `routes.mjs`'s single
route-spec array into `routes/`, one file per route, for the same reason
`docs/history/` was split: a shared append point two lanes touch on every
unrelated pair of features. That split left two things undone, which is what
this bundle does. Nothing under `src/`, `tests/` or `supabase/` was touched.

### 1. The README's route count, re-measured

`tools/browser-verify/README.md` said "23 specs over 17 distinct routes."
Counted against `routes/*.mjs` as it stands (excluding `_shared.mjs`): **25
specs over 20 distinct routes** (`ROUTES.length` is 25; the distinct
`path.split('?')[0]` values, with each `aliasOf` spec resolved to the route it
measures a different state of, is 20). The two directory-count figures in the
same paragraph had also drifted (53 -> 57 directories, 52 -> 56
`+page.svelte` files) and were corrected too, since they were free to measure
alongside the number this bundle was asked to check.

**This can and will go stale again** -- it is a snapshot typed into prose, not
a value derived from source, and the file's own text shows it already drifted
once before this session (15 -> 17 distinct routes when `/dev/gauntlet-shell`
and `/dev/gauntlet-run` joined on 2026-08-29) and had fallen behind again by
the time this session measured it (17 -> 20). The fix is not to keep
re-typing a fresher number: the README now says so
explicitly and gives the two one-liners that recompute it (`ls routes/*.mjs |
grep -v '/_' | wc -l` for the spec count; importing `routes.mjs` and reading
`ROUTES.length` against the distinct alias-resolved pathnames for both
numbers at once) rather than asking a future session to trust the prose.

### 2. The loader's two collision guards, and the one that could never fire

The task was to write negative controls for `routes.mjs`'s two refusals -- a
filename that disagrees with its own spec's `path`, and a duplicate `path`
across two files -- rename a route file, confirm the refusal; add a decoy
file at an already-taken path, confirm the same.

The first control worked exactly as expected. The second did not: **the
"duplicate route path" guard, as the split shipped it, is unreachable dead
code**, and this was verified empirically before being believed. The loop
checked filename-vs-slug agreement BEFORE checking `seenPath`/`seenSlug`, and
`slug` is a pure function of `spec.path` -- so any file that reaches the
duplicate-path check has, by definition, already proven its own filename is
the ONE name `slugify(spec.path)` requires. Two files sharing a `path` would
therefore both need the identical required filename, which `readdirSync`
can never return twice for one directory. No file arrangement can make the
duplicate-path or slug-collision branches execute while the filename check
runs first -- confirmed by actually placing a decoy file (`zzz-duplicate-of-
pathways.mjs`, sorted after `pathways.mjs` so the original loads first) at
`/dev/pathways` and watching the loader throw the FILENAME message, never the
duplicate one, no matter which decoy name or position was tried.

**Fixed by reordering**, in `routes.mjs`'s `loadRoutes()`: the
`seenPath`/`seenSlug` checks now run before the filename-match check, with a
comment explaining why the order is load-bearing rather than cosmetic. This
makes both guards genuinely reachable without weakening the filename check
for the case it already caught (a lone misnamed file, no duplicate involved,
still throws the filename message exactly as before -- verified by control 1
staying green after the reorder).

`routes/_tools/verify-loader-guards.mjs` is the control script, run with
`node tools/browser-verify/routes/_tools/verify-loader-guards.mjs` (no
browser, no npm test -- pure Node against the real `routes/` directory). It
mutates `routes/pathways.mjs` in place (a rename for control 1, a decoy copy
for control 2) and restores from an in-memory copy taken before the mutation,
never with `git checkout --`, then asserts the directory is back to
byte-identical as a third check. Both controls now report PASS; exit code is
1 if either guard stops firing. `routes/README.md` and the main README's file
table both point at it.

Verified: `node tools/browser-verify/routes/_tools/verify-loader-guards.mjs`
exits 0, "ALL GUARDS FIRED"; a fresh `node -e` import of `routes.mjs`
afterwards still reports `ROUTES.length === 25` with no stray files left in
`routes/` (`git status --short` clean before and after).

### The three-run browser pass

Ran `npm run verify:browser` three times (not once), each with a fresh
`--json` capture, per this bundle's instruction that a single clean run has
already misled a prior session in this project:

- **Run 1**: 50 route/width runs, 418 measurements, 3 findings -- `/dev/pathways`
  tap-target at both 375px and 1440px, `/dev/notebook` presence
  ("free-entry title + folder fields ... not row-flex") at 1440px only.
- **Run 2**: 3 findings became different findings -- `/dev/pathways` tap-target
  at both widths (stable across all three runs), `/dev/notebook` presence at
  BOTH widths this time, and `/dev/gauntlet-shell-countdown`'s three countdown-
  overlay presence checks (all absent) that did not appear in run 1 at all.
- **Run 3**: `/dev/pathways` tap-target at both widths again (stable), `/dev/
  notebook` presence at both widths again, `/dev/gauntlet-shell-countdown`
  clean this time.

This matches the brief exactly: `/dev/pathways` is a stable finding across all
three runs (a real, reproducible tap-target gap, not this bundle's to fix --
out of scope, `src/` is untouched), `/dev/notebook` and `/dev/gauntlet-shell-
countdown` are intermittent, and the intermittency is only visible because
the pass ran three times -- a single run (this session's first) would have
reported `/dev/gauntlet-shell-countdown` as clean, which run 2 shows is not
reliably true.

### Verified

- `svelte-check`: 0 errors, 37 warnings (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), matching baseline,
  measured against a fresh `npm ci` + `svelte-kit sync` + placeholder `.env`
  (removed afterward, never committed).
- Full suite: 171 files, 3660 tests, all passing -- unchanged from baseline,
  as expected since this bundle adds no application code.
- `npm run verify:browser -- --probe`: real Chromium 141.0.7390.37 at
  `/opt/pw-browsers`, rAF/IntersectionObserver/ResizeObserver all fire,
  canvas readback and `color-mix()` parse correctly.

### Not verified

- The `/dev/pathways` tap-target and `/dev/notebook` presence findings
  themselves -- diagnosing or fixing them is outside this bundle's scope
  (`src/` was not touched) and outside what was asked.
- No live Supabase project, Drive round trip, or signed-in session was used
  anywhere in this bundle; none of this work touches that surface.

### Left undone

Nothing under `tools/browser-verify/` was left half-finished. The stale
sibling branch `claude/browser-verify-routes-refactor-p2e8ae` (an independent,
differently-shaped attempt at the same routes.mjs split, not merged into
`integration`) was left alone -- not this session's branch, not this
session's decision.
