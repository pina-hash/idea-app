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

Every baseline is **re-derived on `origin/main` in a clean `git worktree`**, not
read off `CLAUDE.md`, and the second merge moved the reference commit from
`799d2033` to `fe62631f`.

- **`svelte-check`: 1 error, 37 warnings in 21 files -- IDENTICAL to
  `fe62631f`.** `CLAUDE.md`'s written baseline (0 errors, 37 in 20) was
  accurate for `799d2033`, which was measured and matched exactly, breakdown
  included (31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`). **The 1 error is `main`'s**, not this bundle's:
  `src/lib/ideacad/viewport/picking.ts:80` passes a `Vector2Like` where
  three.js wants a `Vector2`, in a file ledger 0245 added and this branch
  leaves byte-identical. Not fixed -- see below.
- Each pass surfaced extra `css_unused_selector` warnings and **the compiler
  found float/dock leftovers I had missed**: `.left-toggle`, `.right-toggle`,
  `.why` after the first merge, `.shortcut` after the second. Each was a rule
  whose element another lane had removed.
- **Undefined custom properties: 0**, across 477 fallback-less `var()` uses in
  the owned files, comments stripped, **with a positive control** proving the
  sweep flags an unknown token. It is what found `--copper`.
- **Double-definition sweep** over every class carrying the same property in
  both the sheet and a component's scoped block. `.viewport`'s `background` was
  a real disagreement and is now one definition. Two remain, `.divider`'s
  `min-height` and `.hist`'s `padding`, with **identical values** in both
  places -- duplication, not a fork; the `.divider` one is left deliberately as
  defence against the specificity tie, since both say `0` and it is what
  defeats the base control's tap floor on a 6px grip.
- **The three `tests/dom/ideacad-*` files: `3 failed | 73 passed (76)`, the
  same three names, on this branch AND on `fe62631f`.** The failing-name sets
  diff to empty in both directions. They were 10 on `799d2033`; the lanes that
  landed meanwhile fixed seven.
- **`tests/db/migrations-applied-record.test.ts`: `1 failed | 22 passed (23)`
  on this branch AND on `fe62631f`**, the same assertion -- there is no
  `docs/migrations-applied/` record for migration `0215`, which ledger 0234
  added in `dc6a2f4a`. A third pre-existing cause of `main`'s red CI, and this
  branch touches no migration and no record.
- **THE LOCAL FULL SUITE DID NOT COMPLETE AND ITS TOTALS ARE NOT REPORTED.**
  `npm test` was run twice on this container and both runs went silent partway
  (282 of 479 files, then 72 of 479) with vitest still resident -- 479 test
  files each booting databases on one shared cluster is more than this
  container finishes. **No total is quoted rather than a guessed one**, and
  because vitest's exit code cannot be trusted here anyway (`tools/run-tests.mjs`
  says so in its own header), the reading that stands is the three files above,
  each measured against the same file on `origin/main`, plus the PR's own CI
  run on a real runner. A first, concurrent run is discarded outright: a second
  vitest was running against the same cluster, which `CLAUDE.md` warns races
  the `create role` guards.
- **Chromium 141 at 1440 and 375, rasterized and looked at.** `.ic-root`
  applies, `--ic-tap` computes to `44px` (on `main` it computes to the EMPTY
  STRING, because no token system was in scope), `--surface-0` is aliased to
  the room's ground so the canvas clear colour follows the room. No horizontal
  scroll at either width (`scrollWidth` equals `innerWidth`). **Zero console
  errors.**

## Two merges, because `main` moved seven times mid-session

Between the first resolution and the push, ledgers **0239, 0240, 0241, 0242,
0244, 0245 and 0246 all landed on `main`** -- the sequencing gate this session
first refused to cross turned out to be seven lanes deep, and they touch the
same four files. So `origin/main` was merged in a second time and resolved the
same way, 13 more hunks. The pattern repeated almost exactly:

- **Float versus dock, again, and dock wins again.** 0241 docked the status bar
  with a `minmax(36px, auto)` reserve, dropped `.viewport`'s padding (so the
  negative-margin bleed the first pass preserved is gone), and set the view
  strip and the well FLUSH -- no rule on either side of that seam, because two
  would draw two lines. Carried into the sheet so each has one definition; the
  band keeps `--ic-head`, which is this register's name for a command band.
- **0241's PANE-EDGE TOGGLES are new work, not the float argument**, and stay
  as written: a toggle belongs on the edge it moves.
- **Roughly forty more relocated-skin rules came back** on main's side (`h3`,
  `h4`, the control base, the focus ring, `aria-disabled`, `.rules-label`) and
  went again. `cursor: pointer` was among them and is 0240's affordance --
  kept, because `.ic-root button` already carries it, so nothing was lost.
- **0240 removed the padlock and the keyboard hint.** `.lock` and `.shortcut`,
  both of which the first pass had deliberately preserved, have no elements any
  more; their rules are gone and the reasoning is inverted in the file.

**Two of 0240's decisions were refused, both for the same reason -- a fixed
register:**

- Its tree rows became bordered boxes whose HOVER paints `--green` +
  `--green-tint`. In this room that IS the selected state (green rail + tint
  fill), so applying both would make hover and selected indistinguishable. The
  room's own hover is deliberately a non-accent colour for exactly that reason.
  0240's *intent* -- a new user seeing that a row is clickable -- is delivered
  by the room already (a mark glyph, a hover that moves the rail, and
  `cursor: pointer`), plus 0240's own EDIT chip, which is the clearest
  affordance of the three and survives untouched.
- Its pressed pane tab painted `--cyan`. `--cyan` is METADATA in this
  repository's fixed register and an active tab is navigation, which is
  `--green`; the sheet already fills a pressed control with the accent over
  dark ink, so it carries a fill as well as a hue. **Reassigning a fixed
  semantic role is the one thing the theme rules forbid outright.**

## The black viewport is FIXED, and this merge carries the fix

The first pass measured the graphics area **collapsed to 2px** on `main` -- the
canvas box `912x0` inside a `.viewport-well` `914x2` -- and diagnosed it as
`.viewport` declaring FOUR grid rows while rendering THREE in-flow children, so
the well landed on an `auto` row and `.edit-footer` took the `1fr`. Visible in
the screenshots of both trees as Accept and Cancel stretched floor to ceiling.

**Ledger 0241 found and fixed the same thing independently**, three rows instead
of four with explicit `grid-row` on each child, and 0239 fixed a separate
black-frame cause in `Viewport.svelte` and `camera-rig.ts`. Measured after the
second merge: the well is **926x391 at 1440 and 373x276 at 375**, the canvas
**924x390** and **371x275**, and the screenshots show the sage revolve with its
hex boss, blade mounts, grid floor and reference triad. Nothing here fixed it;
the merge carries it, which is worth writing down only because the first pass's
record said it was unfixed and that sentence is now wrong.

**`readPixels` IS NOT THE INSTRUMENT FOR THIS AND THE FIRST PASS WAS LUCKY.**
After the fix the readback comes back flat -- `meanChannel 0`, ONE distinct
bucket over 810,810 pixels -- on a viewport that visibly renders a shaded
solid, because the drawing buffer is not preserved and a read outside the
render loop gets a cleared one. Before the fix the same call returned the clear
colour, which happened to be meaningful. **A composited screenshot is the
instrument; a canvas readback here reports the buffer's lifetime, not the
picture.**

## The confirm pair is reachable, hit-tested

0231 had the pair floating and measured it UNPRESSABLE at 375 --
`Accept 0/11 reachable, Cancel 0/11 reachable`, painted over by the positioned
canvas and toolbar. The merged tree makes it a grid row at every width, which
retires that failure mode rather than fixing it, and the claim is measured the
same way it was made: `elementFromPoint` across each control's own span,
**Accept 9/9 and Cancel 9/9 reachable at 1440 AND at 375**. A comment at
`.edit-footer` says not to reintroduce an absolute footer without re-running it.

## Not verified, and what is deliberately left broken

- **`main` IS RED AND THIS BRANCH CANNOT BE GREEN.** Every recent CI run on
  `main` is a failure -- #104, #105, #106, #110, #112, #113, #108 -- for two
  independent pre-existing reasons, and this branch inherits both because it
  matches `main` exactly on each: the `picking.ts` type error (which fails
  `npm run check`) and the three `ideacad-*` dom tests. **Neither was
  introduced here and neither is fixed here.** The type error is a one-line,
  behaviour-identical fix (construct a `Vector2` from the `Vector2Like` before
  `setFromCamera`) in a file inside this bundle's owned path, and it was still
  left alone: fixing it would not reach green, because the three test failures
  are in four other lanes' work, so it would be widening the PR for no
  mergeability gain. **The PR is therefore left open rather than merged.**
- The three failing tests were not diagnosed.
- No signed-in surface. `/dev/ideacad` is the harness; `ItemDetail`'s mount of
  this editor needs a Bosco Tech Google session and was not driven.
- `prefers-reduced-motion` is `no-preference` in the harness, so that path is
  unexercised -- which matters here because 0240 shipped an ungated
  `transition` on tree rows; the rule it was dropped by was the hue clash, and
  **the gating question was not reopened** since the rule is gone.
- **Contrast ratios were not re-measured.** Ledger 0231 measured its palette;
  nothing here moves an ink or a ground except `.viewport`'s background, which
  carries no text, and `.status-bar`'s ink, which takes the register's
  `--ic-text-2` on a ground 0231 had already measured.
- `var(--copper)` survives in `src/routes/admin/ideacad-materials/+page.svelte`,
  outside this bundle's ownership.
- The resolved surface was judged by reading, two sweeps and four screenshots,
  not by driving every control.
