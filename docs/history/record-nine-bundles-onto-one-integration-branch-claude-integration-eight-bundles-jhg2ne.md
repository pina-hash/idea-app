---
title: "Nine bundles onto one integration branch (`claude/integration-eight-bundles-jhg2ne`, later re-merged as `claude/integration-nine-bundles-*`, code only, no migration)"
date: 2026-08-27
branches: [claude/integration-eight-bundles-jhg2ne, claude/integration-nine-bundles-]
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 159
---

## Nine bundles onto one integration branch (`claude/integration-eight-bundles-jhg2ne`, later re-merged as `claude/integration-nine-bundles-*`, code only, no migration)

Eight finished bundles were sitting unmerged against a `main` that had itself
moved on. Landed one at a time they would have produced eight conflicting
merges over the same two ledger files; this carries all eight on one branch so
they land as a single merge, and -- the actual point -- measures the
COMBINATION, which nothing else had.

Merged with `--no-ff`, in this order:

1. `claude/browser-verify-harness-36v3jr` -- `tools/browser-verify`, `npm run verify:browser`
2. `claude/shared-upload-drop-paste-bhwqq1`
3. `claude/classroom-sidebar-collapse-b2xf5c`
4. `claude/outstanding-work-false-counts-k2iua6`
5. `claude/notebook-excusal-grid-control-0ub2q2`
6. `claude/foundry-contract-docs-lhjbhf`
7. `claude/foundry-nav-thumbnails-kk9ffu`
8. `claude/foundry-preview-drafts-60xko9`

The harness goes first because the final pass runs the script it adds.

**A NINTH BUNDLE FOLDED IN LATER, ONTO THIS SAME BRANCH, AFTER TWO THINGS
LANDED ON TOP OF IT.** Starting from this branch's own tip, `origin/main` (app
export commits under `materials/` only -- the classroom GitHub export writing
with no human involved) merged first, then
`claude/classroom-drag-drop-order-ts9usf` (drag-to-reorder in `ClassView`,
native HTML5 DnD from the row grip, plus `tests/classroom-item-order.test.ts`).
**Both merges were clean -- zero conflicts, in either file, this time.** The
eight-bundle pass's own conflict machinery (parse-union-dedupe for
`classroom-updates.json`, text-union for `docs/HISTORY.md`) was not exercised
here because git's own three-way merge resolved both ledgers without a hunk
colliding: `main` only appended `materials/` files, which touch neither ledger,
and the drag-drop bundle's own additions to both landed past the eight bundles'
without overlapping a line either side had touched.

### The conflict surface was exactly the two append-only ledgers

`docs/HISTORY.md` (5 conflicts) and `classroom-updates.json` (4). **No source
file conflicted**, which is a measurement rather than an assumption: no test
file and no module under `src/` is touched by two of the eight.

Both ledgers keep BOTH sides, and the two files need different mechanics:

- **`docs/HISTORY.md` is markdown**, so a text-level union works. Each hunk was
  main's newly appended section against the branch's, joined with the `---`
  separator the file already uses between sections.
- **`classroom-updates.json` is JSON, where a text-level "keep both" produces a
  file that does not parse.** Both stages are parsed, the entries unioned,
  deduplicated on their canonical form (an entry in the merge base appears
  identically on both sides and must not be doubled) and re-emitted newest-first
  with the file's own tab indentation. Round-tripped through `json.load` from
  the written bytes, and validated through the app's own reader --
  `src/lib/classroom/updates.ts`, via `tests/classroom-measure.test.ts`.

**Nothing was dropped, and that is asserted rather than believed.** A sweep over
all eight branches plus `origin/main` confirms every `##` section and every
update entry present on any side is present in the final tree: 163 sections
(158 in the base, 5 added) and 97 entries (90 in the base, 7 added). Zero
conflict markers survive anywhere in the tree.

### The one defect that exists only in the combination

**`/dev/home-order` and `/dev/home-feed` built undated assignments and depended
on the `unsubmitted` reason to turn them into student rows.** Bundle 4 removes
that reason (an item cannot say whether it collects a hand-in, so the reason was
a false count in the "N to do" chip), which leaves both fixtures producing
nothing: `home-order` rendered zero ranked rows on every card, and `home-feed`
lost its never-handed-in row. Neither branch could see it alone -- bundle 4
never opens a dev harness, and the harness bundle never touches the feed.

Each fixture is given a due date inside `DUE_SOON_DAYS`, which ranks it
`due-soon`: the surviving reason that carries the retired one's tone (`info`)
and its actionable-ness, so the header count chip still counts these rows.
Distinct per item, so the deadline tiebreak in `compare` stays decided.

**THE TWO HARNESSES DO NOT SHARE A CLOCK, AND THAT DECIDES THE DATES.**
`/dev/home-feed` threads a frozen `NOW` into `buildFeed` and `ClassroomFeed`, so
a fixed `2026-10-17` is correct there. `/dev/home-order` mounts the REAL
`src/routes/+page.svelte`, which ranks with `const now = new Date()` and cannot
be frozen -- so its due dates come off `Date.now()`. Dated off the fixture's own
frozen `NOW` they were ~50 days out by the time anyone opened the page, ranked
`later`, and produced the same empty cards the change exists to prevent. It
passed a unit probe first and failed in the browser, because the probe called
`buildFeed` with the fixture's frozen clock and the page does not. `NOW` still
stamps `created_at`, where frozen is right: that is only the final tiebreak, and
a fixed DUE date is the half that goes stale.

That is the only change under `src/` on this branch.

### Measured

- **Full suite: 130 files, 3002 tests, all passing, 153.9s.** `origin/main` on
  the same container measures **122 / 2783**, so the branch is +8 files / +219
  tests.
  - **Every one of the +219 is attributed to a branch's own file**, by diffing
    per-file counts between the two runs: `classroom-nav-collapse` +34,
    `foundry-preview-route` +50, `foundry-contract` +35, `notebook-staff-actions`
    +32, `classroom-file-drop` +22, `foundry-preview-control` +14,
    `classroom-upload-picker-parity` +11, `classroom-feed-false-counts` +9, and
    +4 each in `foundry-gallery`, `foundry-inline-scan` and `foundry-shell`.
    **No file lost a test and no file disappeared** -- which is the finding this
    branch existed to look for, and it is negative.
  - The four branches that reported a figure match EXACTLY once rebased onto
    the moved `main`: notebook-excusal +1/+32, foundry-nav +0/+8,
    foundry-preview +2/+64, browser-verify +0/+0. The other four reported none;
    their contributions above are measured here for the first time.
  - **Each branch measured against a 120 / 2733 `main` that no longer exists.**
    `main` has since taken the assignment-spec-editor bundle (+2 files, +50
    tests), so a raw comparison of any branch's own number against this one is
    off by that bundle, not by anything the merge did.
- **`svelte-check`: 0 errors, 37 warnings in 20 files**, mix 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. The documented baseline exactly; no bundle moved
  it. Re-derived after the fixture change too.
- **`npm run verify:browser`: 8 route/width runs, 54 measurements, 2 outside
  threshold**, 22.5s.
  - Both are the SAME known finding at two widths: `/dev/pathways` harness
    controls measure **194.7x26.2 (min dim 26.2px), 2/2 under the 44px floor**,
    0 under the 24px floor.
  - The other known observation reads as expected and passes: the pathway chip
    label at **4.84:1** on its fill (`rgb(255,102,102)` on `rgb(54,43,29)`),
    against a 4.5 threshold.
  - **Nothing else is outside threshold.** Everything else: 0px horizontal
    overflow on all 8 runs; contrast 14.22, 5.31, 15.7, 14.96 and 5.31:1 on the
    copy selectors; 0 console errors everywhere; every presence count met.
  - **`--selftest`: 18 controls (9 negative, 9 positive), 0 instrument
    failures**, so the numbers above are from checks that were proved to bite in
    the same session.
  - One run reported a single `net::ERR_ABORTED` on
    `/dev/pathways/__data.json` at 1440px. **It did not reproduce** on a second
    run of the same route; it is flaky and is recorded here rather than as a
    finding.
- **`/dev/home-order` and `/dev/home-feed` were driven by hand**, at 375px and
  1440px, because they are NOT in `tools/browser-verify/routes.mjs` and
  `npm run verify:browser` never opens them. home-order: **6 ranked rows across
  two cards** ("Due tomorrow", "Due in 2 days", "Due in 3 days" per card).
  home-feed: **7 rows**, with "Shop safety quiz" back as "Due in 2 days"
  alongside Overdue, Returned, Updated and Pinned. 0px overflow on all four.

### Re-measured with the ninth bundle folded in

Everything above is the eight-bundle pass, left as it was measured. Folding in
`origin/main` (app-export commits only) and the drag-drop bundle moves three of
the numbers above and adds one browser pass the eight-bundle branch could not
have run, because the harness it depends on had not shipped yet when the
drag-drop bundle was written -- its own history entry says the browser check it
would have used "reported no browser available" at the time.

- **Full suite: 131 files, 3027 tests, all passing, ~101s.** +1 file / +25
  tests over the eight-bundle figure, and both numbers are attributed: the one
  new file is `tests/classroom-item-order.test.ts` (drag-drop bundle, 25
  cases), and nothing else moved -- `origin/main`'s only change here is
  `materials/` exports, which no test reads (see the standing rule against
  asserting over that directory).
- **`svelte-check`: 0 errors, 37 warnings in 20 files, mix 31/5/1.** Identical
  to the eight-bundle figure and to the documented baseline. Neither `main`'s
  export commits nor the drag-drop bundle moved it.
- **`npm run verify:browser`: 8 route/width runs, 54 measurements, 2 outside
  threshold.** Identical to the eight-bundle figure -- same two known findings
  (`/dev/pathways` controls at 194.7x26.2, and the pathway chip label at
  4.84:1) -- because the drag-drop bundle touches no route this script opens.
- **`/dev/classroom-split/[sectionId]` driven directly, real HTML5 drag events
  dispatched at 1440px and 375px, since drag-and-drop mechanics cannot be read
  off CSS.** The harness mounts the real `ClassView` against a fixture with
  three items (`i-1`, `i-2`, `i-3`) filed into the same unit, under
  `?manage=1` so the grip renders.
  - **Grip hit-test: exact match.** `row-grip-i-1`'s box measures **30x44px**
    at both widths (unchanged by viewport -- the row is a fixed-width flex
    item), and `elementFromPoint` at its center returns the grip itself, not a
    neighboring control. The 30px width is deliberate and already documented
    in the component's own CSS comment: it is a mouse-only affordance, and
    keyboard/assistive tech use the row menu's Move up/Move down instead, so
    this is not a new finding against the 44px floor -- the height clears it
    and the narrow width is the stated exception.
  - **Same-group drag applies live visual feedback and clears it correctly.**
    Dispatching `dragstart` on `row-grip-i-1` then `dragover` on `i-3`'s row
    (same unit) adds the `drag-over` class to that row's `<li>` while the drag
    is in progress (`class="row-wrap svelte-1w65r8g drag-over"`, read after a
    task-boundary wait -- reading synchronously in the same turn misses it,
    per the Svelte-5-effects-are-deferred trap); `drop` followed by `dragend`
    clears it back to `"row-wrap svelte-1w65r8g"`. 0 rows carry `.drag-over`
    after the sequence completes at either width.
  - **Cross-group drag is correctly refused, at the event level.** Dragging
    `row-grip-i-1` (unit `u-1`) over `i-draft`'s row (unit `u-2`) never calls
    `preventDefault` on the `dragover` event -- confirmed by reading the
    dispatch's own return value, which is `true` (not cancelled) -- so the
    browser's native "no drop allowed" cursor applies, and the target row
    never gains `.drag-over`. This matches the component's own documented
    scoping: "a drop in a different group's list is ignored."
  - **The drop handler completes with no thrown error and no visible refusal**
    at either width: `dropThrew` is `null`, and `p.feedback.error` has 0
    matches after the sequence.
  - **What this pass could NOT measure: whether a successful drop persists a
    new order.** This harness's `transports.setOrder` is a no-op stub
    (`() => ok(undefined)`, with no `logCall` beside it, unlike every other
    transport the same file defines) and nothing here wires `onchanged` back
    into a reload, so the row order read before and after a drop is byte-
    identical at both widths -- by construction of the harness, not because
    the reorder failed. `tests/classroom-item-order.test.ts` is what proves
    the actual ID-reordering arithmetic (`dragReorder`, `reorderedIds`,
    `renumberedForFiling`) the drop handler calls before invoking the
    transport; this pass proves the DOM-level mechanics around it -- grip
    targeting, live feedback, group scoping, and that the handler runs
    cleanly -- which is what a unit test cannot reach.
  - **Console errors: 0 real ones.** Two `net::ERR_CONNECTION_RESET` entries
    appeared, both against an external host this container's network policy
    blocks (consistent with `verify:browser`'s own "1 external request blocked:
    fonts.googleapis.com" on every route in this pass); nothing from the app's
    own code threw or logged an error.

### What was NOT verified

- **No production or preview deployment.** Nothing here was opened on
  `ideabosco.com` or a Vercel preview.
- **No signed-in surface.** The container has no `.env` and no Supabase; a
  placeholder `.env` was written from `.env.example` for `svelte-check` only
  (it is git-ignored and is not committed) and no live project was contacted.
- **No migration was applied**, because none of the nine ships SQL.
- **The nine bundles' own claims were not re-verified.** This branch measures
  the COMBINATION; each bundle's own history entry stands for its own feature.
- **`npm run build` was not run.** The Windows EPERM trap does not apply on
  Linux, but a build was not part of this pass.
- **The harness's own limits carry into every number it produced**: web fonts
  are blocked, so text is measured in the fallback stack, and
  `prefers-reduced-motion` is `no-preference`, so the reduced-motion path is
  unexercised.
- **The drag-drop pass could not measure post-drop persistence** (see above,
  under the ninth bundle's own bullet) -- the harness's `setOrder` stub does
  not wire a result back into the rendered list, so that half of the claim
  rests on `tests/classroom-item-order.test.ts` rather than on anything driven
  in a browser here.
- **`npm ci` runs on a container with no `node_modules` and no `.env` by
  design.** A placeholder `.env` from `.env.example` was written for
  `svelte-check` and the browser passes; it is git-ignored and was not
  committed.

### Deferred

- **`/dev/home-order` and `/dev/home-feed` are not in the harness route table.**
  They were driven by hand here. Adding them would have made this defect
  self-reporting, and is a change to `tools/browser-verify/routes.mjs` rather
  than to a fixture, so it is out of this branch's one permitted source change.
- **The `unsubmitted` reason itself.** `feed.ts` keeps the slot, its rank, its
  tone and its indicator on purpose, waiting on a flag saying whether an item
  COLLECTS a hand-in. That is a migration, and when it lands both fixtures
  above can go back to being undated.
- **The `/dev/pathways` tap targets.** A known finding, unchanged by any of
  these nine, and owned by whichever bundle takes the 44px sweep.
- **`/dev/classroom-split`'s `setOrder` stub logging nothing.** Every other
  transport on that harness layout calls `logCall` beside its no-op or fake
  success; `setOrder` alone does not, which is why a persisted-reorder claim
  could not be driven from a browser in this pass. Adding the log call (and,
  if the harness is meant to show a settled reorder, wiring `onchanged` to a
  local re-sort) is a small, self-contained follow-up for whichever bundle
  next touches that harness -- not done here because it is a source change
  beyond what re-measuring calls for.

