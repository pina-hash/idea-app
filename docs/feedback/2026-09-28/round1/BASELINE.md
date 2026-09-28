# Ledger 0347, Phase 0: the baseline before any code changed

Measured on 2026-09-28 against `6d59341d` (this session's first commit, the ledger entry, on top of
`origin/main` at `9fe74c00`). Nothing below was edited by hand; every figure is read off the
instrument's own summary line.

## svelte-check

`npx svelte-kit sync && npx svelte-check`, with the two public Supabase values exported as
placeholders (a fresh checkout has no `.env`, which otherwise reports phantom errors):

    svelte-check found 0 errors and 37 warnings in 20 files

Breakdown: 31 `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`.
This matches the figure CLAUDE.md carries.

## npm test

`npm test` (serial, `tools/run-tests.mjs`), 1,609 s wall:

    Test Files  1 failed | 625 passed (626)
         Tests  11771 passed (11771)

The one failed file is `tests/identity-style-shared.test.ts`, which reads `git show f9d43b49^:...`
and died with `fatal: invalid object name 'f9d43b49^'`: the container's clone was SHALLOW, so the
parent of that commit was not there. It is an environment failure, not a code one. After
`git fetch --unshallow origin` the same file runs 28 of 28 green. The full clone also matters to
R10, whose per-update line counts are computed on a full clone only.

## verify:browser, the grading routes

`node tools/browser-verify/run.mjs --route grading`, run in a pristine worktree of `6d59341d` (so it
measures the console before the redesign), with `node_modules` hard-linked rather than symlinked so
the fonts are served (a symlinked copy resolves outside the worktree and Vite refuses the font files):

    72 route/width run(s), 1024 measurement(s), 27 outside threshold

The 27, all present before this round touched anything:

- `/dev/classroom?view=class-teacher` at 375 (5): the `new-post` click's predicate never held, so the
  four composer rows that follow it measured nothing. This spec is only in the `grading` selection
  because its label names a grading-category datalist.
- `/dev/grading-incomplete` at 375 and 1440 (11 each): the `work-export-disclosure` prepare click
  matched nothing, so the export panel was never opened and every row inside it read "0 visible".

Two agents were implementing in other worktrees while this ran, so the machine was not quiet; the
after pass is compared finding by finding against this list rather than by total alone.

## The before pictures

78 pictures, `<surface>-<theme>-<width>-before.png` in this folder: 13 surfaces, each in IDEA,
Matrix and Space White, at 1440 and 375, taken with `tools/browser-verify/_plate-shots.mjs` from the
same pristine worktree. The theme is pinned on `<html>` by an init script, so Space White is also
painted on surfaces whose production route is outside its scope (the maps viewer, the home page's
code counter harness); the history entry says which.

| Surface | Harness |
| --- | --- |
| grading-cross-class | `/dev/grading-bulk` |
| grading-section | `/dev/grading-files?mode=section` |
| grading-ported | `/dev/html-assignment-grading` |
| my-classes | `/dev/classroom?view=home` |
| class-teacher | `/dev/classroom?view=class-bulk` |
| item-teacher | `/dev/classroom?view=item-teacher` |
| people | `/dev/classroom?view=people` |
| feedback-console | `/dev/classroom?view=feedback` |
| composer-drop | `/dev/composer-drop` |
| teams | `/dev/classroom-teams` |
| maps-viewer | `/dev/maps-viewer` |
| home | `/dev/home-order` |
| code-census | `/dev/code-census` |
