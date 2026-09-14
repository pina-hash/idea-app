---
title: "The ideacad.css fork: two lanes wrote one file from nothing, and resolving it cost one landed decision (`claude/hopeful-archimedes-7nlrwr`, no migration)"
date: 2026-09-14
branches: [claude/hopeful-archimedes-7nlrwr, claude/vigilant-feynman-aa3onu]
migrations: []
subsystems: ["IdeaCAD", "Design system", "Browser verification"]
---

Ledger 0248. `src/lib/ideacad/ideacad.css` had **two authors and no common
ancestor**. Ledger 0231 created it as a 1129-line scoped design system and its PR
(#96) sat open; while it sat, ledger 0232 created its own 19-line version of the same
path on `main` and landed it. Every later IdeaCAD lane -- 0233's drag-to-scrub, 0236's
tree operations, 0237's viewport render, 0232's docking shell -- then built on the
19-line one. This bundle merges #96 into `main` by content, hunk by hunk, and closes
#96 as superseded rather than landing it separately.

## Which version of `ideacad.css` won, and why

**Ledger 0231's file is the one that survives, and it is not a preference.** It is a
whole design system -- plate, ink measured against every ground, a type scale with
jobs, states that carry a word and a shape as well as a hue -- and it is what
`.ic-root` means. Ledger 0232's file was four `!important` blocks under a *different*
`.ic-dense`, and every intent in it is expressed by rules already in 0231's file
without `!important`: tight rows and a hairline between them is `.ft li` /
`.ft button` / `.metric`. So nothing was lost by dropping the 19 lines, and the
alternative -- keeping both -- would have meant `min-height: 24px !important` fighting
every rule in the system it was merged into.

**What the merge did NOT do is take either file wholesale.** 0231's file gained a
docked-chrome section it had never seen (`.status-bar`, `.view-toolbar`,
`.viewport-well`, `.edit-footer`, from 0232 and 0237), restyled onto `--ic-*` tokens,
because those four are skin and the room owns skin. Three of its own rules were
changed by the merge, each because the markup had moved underneath it: `.orient` lost
its drop shadow, `.viewport` stopped being the graphics ground, and the unit rule
gained `.number-control i`. Each is noted in the file at the point of use.

## The one landed decision this reverses

**`class="ideacad ic-dense"` came off the editor's root element.** Ledger 0232's own
comment called the Blade editor "the deliberately dense instructor-style tool
surface". It is not one: `src/lib/classroom/ItemDetail.svelte` mounts this same
component for a **student** working a schema-4 item, and `/ideacad` is on the student
launcher. `CLAUDE.md` is explicit that the 24px floor belongs to a surface that is
instructor-only and declares it, and that a surface with no such class is
student-facing *whatever the density argument* -- so `min-height: 24px !important` on
every button, input and select there is the defect the rule exists to name. The class
survives in the sheet as `.ic-root .ic-dense`, a **descendant** selector re-pointing
`--ic-tap`, carried by nothing, which is also why the two classes never sat on one
element even mechanically.

Measured after: `--ic-tap` computes to `44px` on the editor root, where on `main` it
computes to the empty string because no token system was in scope at all.

## Hunk by hunk: 13 conflicts, four files

The recurring shape is **float versus dock**, and ledger 0232 wins it every time
because the merged *markup* is docked and cannot express a float. `.orient` is row 2
of `.viewport`'s grid, so 0231's `position: absolute` would pull it out of the grid it
now lives in; the only `<footer>` carries `.edit-footer`, so 0231's bare
`footer { position: absolute }` would lift the docked band out of its own row. Same
call, same reason, four times (`.orient` twice, `footer`, and `.left-toggle` /
`.right-toggle`, which no element carries any more).

The other recurring shape is **skin that moved**. Roughly forty selectors on `main`'s
side were rules 0231 had relocated into the sheet; keeping them would have been a
second definition of each at a specificity that ties with the room's, where source
order decides. Those were dropped from the components.

**Three hunks went the other way and are the ones a side-picking merge would have
silently destroyed**, because 0231 never saw them -- they landed on `main` after it
branched, so its side of each hunk is *empty*:

- `.number-control`, `.number-control input` -- ledger 0233's drag-to-scrub.
- `td input`'s scrub affordance in the station table -- the same lane.
- `.shortcut` / `.shortcut b` -- 0233's keyboard hint, which has **no rule anywhere in
  the sheet**, so taking 0231's empty side would have left it unstyled with nothing
  reporting it.

`.lock` (ledger 0236's per-row glyph) is a fourth of these, in `FeatureTree`.

## `var(--copper)` is defined nowhere and never was

Six references under `src/lib/ideacad/ui/` and one more in
`src/routes/admin/ideacad-materials/+page.svelte` name `--copper`. **No file in
`src/` declares it** -- `src/lib/design-system/colors.css` only mentions the word in a
comment on `--amber` ("warning: copper"). So every one was inert: the property fell
back to nothing and the element inherited its parent's colour. All six meant caution
(an expiring checkout, a refusal notice, a sharing setting that is off, a read-only
role) and now read `var(--ic-warn, var(--amber))`. The **fallback is load-bearing**:
`PartsPanel`, `SharePanel` and `SharedDocuments` are mounted by `ItemDetail.svelte`
*outside* `.ic-root`, so the room token is not in scope there -- this is the room-hook
pattern, portal token as the fallback.

The seventh is in `src/routes/**`, which this bundle does not own. **It is still
there.**

## What was measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`.
  Re-derived on `origin/main` at `799d2033` in a clean `git worktree` rather than read
  off `CLAUDE.md`, and it came out identical on both, breakdown included. The
  intermediate merge sat at 40/22 and the three extra were all
  `css_unused_selector` -- `.left-toggle`, `.right-toggle`, `.why` -- each a rule
  whose element another lane had removed. The compiler found the float/dock leftovers
  I had missed.
- **Undefined custom properties: 0**, across 469 fallback-less `var()` uses in the
  owned files, swept with comments stripped and **with a positive control** proving
  the sweep flags an unknown token. It is what found `--copper`.
- **Double-definition sweep**: every class carrying the same property in both the
  sheet and a component's scoped block. Three at first; `.viewport`'s `background`
  was a real disagreement (`--ic-ground` against `--surface-2`) and is now one
  definition. The two left, `.divider`'s `min-height` and `.hist`'s `padding`, are
  **identical values** in both places, so they are duplication and not a fork; the
  `.divider` one is deliberately left as defence against the specificity tie, since
  both say `0` and it is what defeats the base control's tap floor on a 6px grip.
- **Chromium 141 at 1440 and 375, rasterized and looked at.** `.ic-root` applies
  (`--ic-ground` `#0e1114`, `--surface-0` aliased to it, `--ic-tap` `44px`, Rajdhani).
  No horizontal scroll at either width (`scrollWidth` equals `innerWidth`, 1440 and
  375). Zero console errors. The phone pane switcher renders FEATURES / GRAPHICS /
  PROPERTIES with the current one filled.

## The black viewport is NOT this bundle's, and here is its mechanism

`main` renders an empty graphics area and **this merge does not change it**, measured
both ways: the canvas box is `912x0` on `main` and `914x0` merged, inside a
`.viewport-well` that is **2px tall** on both.

What it actually is, which is more specific than "renders black": **`.viewport`
declares four grid rows (`auto auto minmax(0, 1fr) auto`) and renders three in-flow
children** when the orientation list is closed, which is the default. So
`.viewport-well` lands on row 2 -- an `auto` row -- and collapses to its content, and
`.edit-footer` takes the `1fr`. It is visible in both screenshots as the Accept and
Cancel pair stretched floor to ceiling as two tall dashed columns. The grid line is
identical on both sides of the merge and conflicted in neither, so it predates both
lanes. **Not fixed here, deliberately** -- ledger 0239 owns it -- and the one-line
shape of the fix is worth knowing: the row count and the in-flow child count have to
agree, or the well needs to name its row.

The canvas readback differs and **must not be read as the model appearing**:
`nonBlackPct` goes 0.44% to 100% only because the clear colour moved from the
portal's `#0a0c0b` to the room's `#0e1114` and crossed the sweep's own threshold. The
drawing buffer is one pixel tall in both. Nothing of the model is visible on either
tree.

## Not verified

- **The ten failing tests in `tests/dom/ideacad-ui-mount.test.ts`,
  `ideacad-timeline-mount.test.ts` and `ideacad-mount.test.ts` were not diagnosed or
  fixed.** They fail identically on `origin/main` at `799d2033` -- `10 failed | 66
  passed (76)` on both trees, and the failing test NAMES diff to an empty set in both
  directions. They are pre-existing and outside this bundle.
- No signed-in surface. `/dev/ideacad` is the harness; `ItemDetail`'s mount of this
  editor needs a Bosco Tech Google session and was not driven.
- `prefers-reduced-motion` is `no-preference` in the harness, so that path is
  unexercised.
- Contrast ratios were **not** re-measured. Ledger 0231 measured its own palette and
  nothing in this merge moves an ink or a ground except `.viewport`'s background,
  which carries no text.
- The three-way behaviour of the resolved surface was judged by reading and by two
  screenshots, not by driving every control.
