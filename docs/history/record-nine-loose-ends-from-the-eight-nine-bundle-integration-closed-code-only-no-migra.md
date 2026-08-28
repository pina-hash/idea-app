---
title: "Nine loose ends from the eight/nine-bundle integration, closed (code only, no migration)"
date: 2026-08-27
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 160
---

## Nine loose ends from the eight/nine-bundle integration, closed (code only, no migration)

Nine deferred items the prior integration bundle reported and could not reach
from inside its own lane. All nine are closed; none needed a migration.

- **The `dom-order` check and its selftest pair, and the `/dev/home-order` +
  `/dev/home-feed` route entries, ported from the now-redundant
  `claude/integration-eight-bundles-merge-4gd5ei`** (15 commits behind `main`
  and otherwise superseded) -- exactly the six files named, nothing else:
  `docs/HISTORY.md` and `materials/` on that branch were both stale relative
  to what `main` already carried. `npm run verify:browser -- --selftest`
  reported 20 controls / 0 instrument failures immediately after the port
  (before this bundle's own new check below), and both `/dev/home-order`
  variants and `/dev/home-feed`/`-teacher` measure clean in the full run.

- **The bulk-action bar's controls brought to the 44px floor.** `.btn.tiny`
  (21px) and the unit-file `<select>` (36px) were both under the floor on the
  ONE control in `ClassView` that deletes several items at once -- three
  individual controls under the 24px hard floor. Fixed with the same
  `min-height` + block-padding pattern `classroom.css` already uses for
  `.cr-console` and `.engine-host`, scoped to `.bulk-bar`. Proved with the
  harness (see below), not by reasoning about the CSS: both selectors now
  measure exactly 44px at both widths, 0 under 24px.

- **The classroom dev harness's `setOrder` transport was a silent no-op.**
  Every sibling write transport in
  `src/routes/dev/classroom-split/[sectionId]/+layout.svelte`
  (`createItem`, `updateItem`, both attachment uploads) calls `logCall`
  beside its result; `setOrder` alone did not, which is exactly what the
  prior bundle's own deferred note named -- the drag-and-drop pass there
  could measure that a drag moved something on screen but never whether the
  drop's order reached the write path, because the fixture is static data
  and a broken `setOrder` that silently dropped its argument would leave the
  DOM looking identical. `setOrder` now appends to a new
  `composeLog.orders` array and logs like its siblings, read back through
  `__composeProbe().orders`.

  A new `order-result` check (`checks.mjs`/`run.mjs`) reads a value a
  page-side action wrote (here, the transport's own log) and compares it
  element-for-element against what it should be -- the write-claim
  counterpart to `dom-order`'s render-claim. It got its own selftest
  positive/negative pair (22 controls now, up from 20) per the harness's
  own rule that a check that has never failed has not been tested.

  New route: `/dev/classroom-split/s-1?manage=1`, selecting one row to
  reveal the bulk bar, then dispatching synthetic `DragEvent`s to drag the
  last unpinned unit-1 item onto the first. The full per-unit list is
  `[i-crowded(pinned), i-1, i-2, i-2b, i-3..i-7]` (all seven unpinned items
  share one `created_at` in the fixture, so the newest-first tiebreak falls
  through to array order); dragging `i-2b` (index 3) onto `i-1`'s row (index
  1) gives `['i-crowded','i-2b','i-1','i-2','i-3','i-4','i-5','i-6','i-7']`,
  hand-traced against `dragReorderedIds` and confirmed by the real run.

  Along the way, a **latent bug in `run.mjs`'s `evaluate` prepare step** was
  found and fixed: it passed the step's function-source string straight to
  `page.evaluate()`, which treats a bare string as an EXPRESSION rather than
  calling it -- the exact trap `clickUntil`'s `until` already documents and
  works around in `browser.mjs`. No route exercised the `evaluate` step
  before now (only `click` steps existed), so it shipped silently as dead
  code; the new drag prepare step is what surfaced it, initially reading
  back `undefined` from a drag that had genuinely never run.

- **A fresh `npm ci` checkout has no `.svelte-kit`, and `npm test` fails on
  startup with a rolldown/tsconfig error that reads like a broken
  toolchain.** Reproduced directly: `[RESOLVE_ERROR] Could not resolve
  'node:module' in \0rolldown/runtime.js ... Tsconfig not found`, cleared by
  `npx svelte-kit sync`. Documented in `CLAUDE.md` beside the existing note
  about the missing-`.env` phantom `svelte-check` errors, since both bite in
  the same first five minutes of a fresh session for the same underlying
  reason (nothing has generated `.svelte-kit` yet).

- **The future-check-in date bound moved from a row filter onto the query.**
  `tests/db/postgrest-shim.ts` had `eq`/`in`/`is`/`not.is` and no `.lte()`,
  which was the ONLY reason
  `src/routes/classroom/[sectionId]/+layout.server.ts` filtered rows in JS
  after the fetch instead of sending `.lte('notebook_sessions.session_date',
  through)` on the query -- the `notebook_sessions!inner` embed every
  posting rung already carries makes that a real query-level bound, not a
  row filter with different words. `.lte()` was added to the shim (both the
  own-column and the embedded-column code paths), and the query now sends
  the bound directly; same America/Los_Angeles calendar day, same inclusive
  semantics, same comment, moved rather than rewritten. Proved through the
  real load rather than asserted as equivalent to the filter it replaced:
  `tests/classroom-feed-false-counts.test.ts` already drove this exact
  behavior (future check-in excluded; today's and yesterday's both still
  count) through the shipping `load` against a real Postgres instance, and
  all 9 cases in that `describe` block still pass unchanged.

- **`SpecProseField`'s hand-rolled drop/paste glue replaced with
  `use:dropTarget`.** It was written inline specifically because
  `$lib/file-drop.ts` was on an unmerged branch at the time, with a comment
  saying the swap would be a deletion once that branch landed -- it has. Pure
  deletion: `dropTarget`'s unfiltered drop and image-filtered paste matched
  the hand-rolled `filesOf`/`imagesOf` byte for byte, and `upload=null` still
  removes the affordance entirely via the action's own `disabled` flag.

- **New attachment filenames are sanitized so `figureReference` always
  renders.** `FIGURE_RE` excludes whitespace and `()[]` from both its src and
  caption groups, so a filename carrying any of them produced a figure line
  nothing renders -- `SpecProseField`'s own image drop already worked around
  this with a refusal, but every OTHER caller of `figureReference`
  (`AttachmentList`'s "copy reference" on any existing attachment) had the
  identical gap with no warning at all. `sanitizeAttachmentFilename`
  (`classroom.ts`) replaces whitespace/`()[]` runs with a single hyphen,
  applied in `/api/classroom/attachment/+server.ts` at record time -- the
  point a NEW attachment's filename is written, never the storage key
  (already a uuid, untouched either way, so this is a display-name decision
  and not a change to the classroom-files security model). New uploads only:
  a file already stored keeps whatever it was called before, so
  `SpecProseField`'s `figureLineRenders` refusal stays in place, now
  documented as a backstop for that legacy case (and for
  `uploadProseImage`'s `res.row` fallback) rather than the expected path.
  Three new cases in `tests/classroom-figures.test.ts` pin the gap and the
  fix.

- **The reference-mode wording editor driven through `ItemDetail` for the
  first time.** No dev harness had ever passed `canManage` AND
  `referenceTransports` together on a `material`, so
  `canEditReference` had never once been true in a harness and
  `SpecTextEditor`'s reference-mode path had never been mounted at all (only
  its assignment-mode sibling, via `/dev/classroom` and `classroom-phase1`).
  Added a "Material: manage + wording editor" view to the existing
  `/dev/classroom-reference` harness, reusing the `referenceTransports` the
  "Teacher tools" view's `SpecImporter` already exercises. Verified through a
  real headless run: the instructor-tools strip, the "Edit the wording"
  disclosure (expanded by default) and the rich-text editor (a real
  ProseMirror `contenteditable`) all mount and render.
  `tests/dev-routes-excluded.test.ts` sweeps `src/routes/dev` by directory
  and needed no change to cover the new view; confirmed it still passes.

- **`CLAUDE.md` corrected on the Foundry preview-origin config.** A Vercel
  preview deploys to exactly one host, so `PUBLIC_FOUNDRY_APPS_ORIGIN` and
  `PUBLIC_FOUNDRY_PORTAL_ORIGIN` naming two DIFFERENT hosts on a preview is
  always a misconfiguration, never a real topology -- it claims the bundle
  origin and the portal origin differ when they are the same server
  answering both roles, which is exactly the condition
  `foundrySandboxFlags`'s conditional `allow-same-origin` grant reads. The
  wrong preview config therefore grants student bundle code a real origin on
  a host that, on a preview, genuinely carries that preview's session
  cookies (not `httpOnly`, same as production). Equal values -- or both
  unset -- withhold the flag and still fully exercise the serving routes.

### What was measured

- **Full suite: 131 files / 3030 tests** (baseline 131/3027, +3 for the new
  `sanitizeAttachmentFilename` cases in `tests/classroom-figures.test.ts`).
- **`svelte-check`: 0 errors / 37 warnings**, 31/5/1 breakdown
  (`state_referenced_locally` / `css_unused_selector` /
  `perf_avoid_nested_class`) -- unchanged from baseline.
- **`npm run verify:browser`: 18 route/width runs, 120 measurements, 2
  outside threshold.** The two are the pre-existing, unowned
  `/dev/pathways` tap-target finding (194.7x26.2, under the 44px floor at
  both widths) and nothing else -- its chip-label contrast passes at
  4.84:1, as it did before. The bulk-bar finding this bundle fixes is GONE,
  which is the check that proves the fix. 16 of the 18 runs were the
  pre-existing route table (8 routes x 2 widths); the new
  `/dev/classroom-split` entry accounts for the other 2 runs and 12 of the
  measurements over the pre-fix baseline of 108. One `net::ERR_ABORTED` on
  `/dev/pathways/__data.json` did not reproduce on a second run and is a
  harness-network flake, not a finding.
- **`npm run verify:browser -- --selftest`: 22 controls (11 negative, 11
  positive), 0 instrument failures**, up from 20/20 after the port because
  of the new `order-result` check's own pair.

### What was NOT verified

- No production or preview deployment; nothing here was opened on
  `ideabosco.com` or a Vercel preview.
- No signed-in surface and no live Supabase project -- the same placeholder
  `.env` convention every prior bundle in this integration used.
- No migration, because none of these nine items ships SQL.
- `npm run build` was not run (the Windows EPERM trap does not apply on
  Linux, and a build was not part of this pass).

---

