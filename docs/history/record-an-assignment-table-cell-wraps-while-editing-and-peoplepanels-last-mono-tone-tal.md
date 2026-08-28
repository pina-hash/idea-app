---
title: "An assignment table cell wraps while editing, and PeoplePanel's last mono-tone tally gets a hue (code only, no migration)"
date: 2026-08-27
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 164
---

## An assignment table cell wraps while editing, and PeoplePanel's last mono-tone tally gets a hue (code only, no migration)

Two small, unrelated fixes scoped to `SpecRenderer.svelte` and
`PeoplePanel.svelte`, done together because both were reported in one
session and neither touches the other's surface.

- **The editable table cell in `SpecRenderer` was a single-line `<input
  type="text">`, which scrolled a long value out of view instead of wrapping
  it.** The read-only render already handled this correctly --
  `<span class="cell-text">` under `white-space: pre-wrap` grows the row to
  fit -- and the same file already had the precedent for the editable side:
  the `textField` block's `<textarea use:autoresize>`, capped by
  `.answer`'s own `max-height` and read back rather than restated. The
  table cell now uses the identical `autoresize` action on a `<textarea
  class="cell">`, uncapped (no `max-height` set on `.cell`, matching the
  read view's unbounded growth), so a long or multi-line answer stays fully
  visible and the row grows with it -- read and edit no longer disagree.
  `oninput`/`onchange` and the existing `trimCellEnds`-on-commit contract
  are unchanged; only the element and its CSS (`resize: none`,
  `overflow: hidden`, `line-height`) moved to match `.answer`'s shape. Two
  already-existing tests asserted the old `<input class="cell">` markup
  (`classroom-manager-spec-visibility.test.ts`'s "renders no editable
  table-cell" case, keyed on the manager/readonly render never emitting
  one, and `classroom-module-collapse.test.ts`'s collapsed-module case,
  which read a filled cell back via `value="1"`/`value="2"`); both were
  updated to look for `<textarea class="cell">` and for the value as the
  textarea's text content rather than an attribute -- the same assertions,
  ported to the new element.

- **`PeoplePanel`'s notebook-compliance tallies read `CELL_STATES` (from
  `notebook-review.ts`) and colour each glyph by hand, one CSS rule per
  status; `missing` was the one left on the base `--text-2` instead of a
  named hue.** The notebook review grid's own locked six-colour contract
  (`CLAUDE.md`, "Visual theme" -> `.nb-root`) already answers what
  `missing`'s hue is: green on time, amber late, cyan awaiting, crimson
  flagged, ice excused, **sage missing** -- and in `colors.css`,
  `--nb-cell-missing` resolves to `var(--dim)`. `--dim` is a general,
  unscoped design-system token (not one of the `--nb-*` room-scoped
  aliases), so `PeoplePanel` -- which is not under `.nb-root` and reads the
  bare portal tokens for its other five tallies exactly as `.nb-on_time`
  etc. do -- can use it directly with no new token and no room wrapper.
  `.nb-missing .nb-glyph` now reads `var(--dim)`, matching the grid's own
  answer for the same status rather than inventing a fresh one.

### What was measured

- **Cell geometry**, driven headlessly against the real `/dev/spec-table`
  harness (`playwright-core` at the repo-pinned Chromium, matching
  `tools/browser-verify`'s own instrument) with Module 1's disclosure
  expanded and the first table cell scripted directly, since the harness's
  own fixture pre-fills that module and the module disclosure collapses a
  completed one by default:
  - **375px**, short value ("Ti-6Al-4V"): 96 x 33px box, `scrollHeight`
    31px. Long multi-line value (three lines, one an authored newline, the
    rest wrapped): 96 x **595px**, `scrollHeight` 593px, row height
    602.375px -- the row visibly grows with the cell.
  - **1440px**, same short value: 236.9 x 33px. Same long value: 236.9 x
    **206px**, `scrollHeight` 204px, row height 213.375px (shorter than at
    375px because the wider column wraps to fewer lines).
  - **No horizontal overflow at either width**: `document.documentElement
    .scrollWidth === clientWidth` (375 and 1440 respectively) in both
    cases.
- **`npm run verify:browser -- --route spec-table`**: 4 route/width runs
  (`/dev/spec-table` and `/dev/spec-table-open`, both widths), 20
  measurements, 0 outside threshold -- `horizontal-scroll` reports 0px
  overflow at both widths on both routes, and the opened-disclosure route's
  table-cell contrast is unaffected (14.96:1, unchanged element, only its
  input type moved).
- **`npm run verify:browser`, full route table**: 18 route/width runs, 120
  measurements, 2 outside threshold -- the pre-existing, unowned
  `/dev/pathways` tap-target finding and nothing else. Unchanged from the
  baseline this bundle started from.
- **The `--dim` glyph's contrast**, measured the same way against the real
  `/dev/classroom` harness's People tab (`?view=people`, the "notebook
  migrations applied" toggle on, section `s-1`'s fixture carrying four
  `missing` cells so the tally renders with a nonzero count): glyph colour
  `rgb(132, 144, 128)` (`--dim`) on the card background `rgb(16, 19, 18)`
  (`--surface-1`, the same ground `.cr-root .card` paints under this
  component) -- **5.59:1**, matching the figure `colors.css` already
  documents for `--nb-cell-missing` against `--nb-surface` on the default
  plate (this is the identical portal-token pair, not a coincidence), and
  clear of the 4.5:1 text floor.
- **Full suite: 131 files / 3030 tests**, unchanged from baseline (the two
  markup-assertion tests above were updated, not added or removed; no
  count moved).
- **`svelte-check`: 0 errors / 37 warnings**, 31/5/1 breakdown
  (`state_referenced_locally` / `css_unused_selector` /
  `perf_avoid_nested_class`) -- unchanged from baseline.

### What was NOT verified

- No production or preview deployment; nothing here was opened on
  `ideabosco.com` or a Vercel preview.
- No signed-in surface and no live Supabase project -- the placeholder
  `.env` convention.
- No migration; neither change touches the database.
- `npm run build` was not run (the Windows EPERM trap does not apply on
  Linux, and a build was not part of this pass).

---

