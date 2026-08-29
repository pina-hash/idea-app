---
title: "`.btn` gets its own 44px floor, because the only thing holding the old one up was an unwrapped flex row stretching every control to its tallest sibling (`claude/button-tap-target-sizing-phf7u0`, no migration)"
date: 2026-08-29
branches: [claude/button-tap-target-sizing-phf7u0]
migrations: []
subsystems: ["Interface standards", "Design tokens", "GAUNTLET", "Foundry", "Admin"]
---

## `.btn` gets its own 44px floor, because the only thing holding the old one up was an unwrapped flex row stretching every control to its tallest sibling (`claude/button-tap-target-sizing-phf7u0`, no migration)

Files owned and touched: `src/app.css` and `src/lib/ShortLinkManager.svelte`.
Nothing under `tools/browser-verify/`, `src/routes/dev/`, `src/lib/gauntlet/`,
`supabase/` or `CLAUDE.md` was modified; two other sessions were live on
`integration` and on the GAUNTLET harness.

### What was reported, and what was actually there

A GAUNTLET harness measured four of eight post-run controls under 44px at 375px,
smallest 40.4px, and named the mechanism: `.btn` carries `min-height: auto`, and
`.btn-row` is `flex-wrap: wrap` with the default `align-items: stretch`, so at
1440 the row does not wrap and stretch produces 45.4px by accident.

The mechanism is right and was reproduced here. Two details in that account are
not, and both matter to anyone grepping for the fix:

- **`.btn` carried no `min-height` declaration at all.** There is nothing in
  `src/app.css` setting it on that rule -- `auto` is simply the initial value.
  Grepping `min-height` in that file finds `.tap-44` and a `.legacy-index header`
  inside a media query, and nothing on `.btn`. There was no declaration to
  delete; a floor had to be added.
- **`.btn-row`'s computed `align-items` is `normal`, not `stretch`.** `normal`
  behaves as `stretch` for a flex item whose cross size is auto, so the effect
  the report describes is real, but `align-items: stretch` appears nowhere in
  the rule and searching for it finds nothing.

### The mechanism, measured rather than reasoned

Against the real cascade (`app.css` plus every `design-system` partial it
imports) with the real `@fontsource` faces loaded, rendering the exact markup
shape of `RunResults.svelte`'s post-run row -- a `<button class="btn secondary">`
followed by two `<a class="btn">`:

| | 375px | 1440px |
| --- | --- | --- |
| `.btn-row` lines | 3 (wrapped) | 1 (not wrapped) |
| `button.btn.secondary` | **39.4px** | 45.4px |
| `a.btn` (label wraps) | 66.4px | 45.4px |
| `a.btn.secondary` | 45.4px | 45.4px |

The 45.4px figure reproduces exactly. The reason the `<button>` is the short one
is that it takes `line-height: normal` while an `<a class="btn">` beside it
inherits the body's 1.6 (20.992px), so **the anchor was carrying the button**:
unwrapped, stretch lifted the button from its own 39.4px to the anchors' 45.4px;
wrapped, the button landed alone on its line and fell back to 39.4px.

That is a pass contingent on two accidents at once -- the viewport not wrapping
the row, and a taller sibling happening to be in it. Neither is a rule anybody
wrote down, and the same probe run without the real fonts (Times fallback) put
every control at 43.4px at 1440, under the floor at both widths. The accidental
pass depends on font metrics too.

### The fix

`min-height: 44px` on `.btn`, and nothing else. `display: inline-flex` and
`align-items: center` were already on that rule, so the content stays centred in
the taller box with no padding change; the block padding above it is what carries
the height, so type size and horizontal rhythm are untouched and a label that
wraps to two lines still grows the box rather than clipping.

This is the reasoning `.cr-root .cr-console .btn` and `.cr-root .engine-host .btn`
already use, one scope wider -- a floor, never a height, because rounding to
reach a floor rounds both ways. It is **not** the `.tap-44` reasoning: those are
opt-in classes precisely because a blanket rule cannot tell a photo picker from a
chip, and that comment in `src/app.css` was edited in place rather than left to
read as though `.btn` were still deliberately excluded. `.btn` is one rule with
one padding scale, so its height was never the open question the opt-in classes
exist for.

### The chip that would have been swept, and the one that would not

`.cr-root .btn.tiny` declares its own `min-height: 24px` at specificity (0,3,0),
which outranks a bare `.btn` at (0,1,0), so the classroom's ten-odd chip call
sites are protected by a rule that was already there. Measured before and after:
24px at both widths, unchanged.

`src/lib/ShortLinkManager.svelte` is the one `.btn.tiny` call site **not** inside
`.cr-root`. It mounts at `/admin/links` under `main.admin-page`, and its own
scoped rule set font-size and padding but declared no `min-height` -- so nothing
would have outranked the new floor and its row-ops chips would have inflated from
chip to button. It now declares the 24px floor itself, with the reason beside it.

That fix also closes a defect that was already there and that nothing was
reporting: with no floor at all those chips measured **22.9px at both widths**,
under even the 24px chip floor.

**The dev harness is why this was invisible.** `/dev/classroom-reference` mounts
`ShortLinkManager` *inside* `.cr-root`, where the classroom's floor reaches it;
the real route does not. A harness that does not mirror the room its component
actually mounts in cannot show the divergence.

### The blast radius, measured before as well as after

`npm run verify:browser`, full pass, both widths:

- **before:** 40 route/width runs, 306 measurements, 4 outside threshold
- **after:** 40 route/width runs, 306 measurements, 4 outside threshold
- **diff of all 306 measurement values: empty.** Not one number moved, and the
  four findings are byte-identical.

That result is not the reassurance it looks like, so it was chased rather than
accepted. The four findings are unrelated to this change and pre-date it:
`/dev/pathways` at both widths reports `tap-target [harness controls] 194.7x26.2,
2/2 under 44px` on the harness's own bare `<button>` under a scoped
`.controls button` rule with no `.btn` class, inside `src/routes/dev/` (not
owned, and not reachable by this change); and `/dev/notebook` at both widths
reports the `presence [free-entry title + folder fields]` finding another session
is deliberately leaving alone.

The reason nothing moved is a **coverage hole in the pass, not an absence of
defects**: no registered route has a tap-target check whose selector reaches a
plain `.btn`. Every tap-target check either measures controls already carrying
`.tap-44` or a scoped 44px floor, or `.cr-root` chips at 24px, or non-`.btn`
elements (feed rows, grid cells, selects, harness buttons).

So an independent scan was written that walks all 20 registered routes at both
widths and measures **every visible `.btn`**, with a behavioural marker asserted
per run (a synthetic `.btn`'s computed `min-height`) so a stale served stylesheet
could not be mistaken for a clean result:

| | `.btn` measured | token live | under floor |
| --- | --- | --- | --- |
| before (`git checkout`ed tree, marker `0px`) | 166 | 40/40 | **24** |
| after (marker `44px`) | 166 | 40/40 | **0** |

All 24 are on `/dev/foundry-submit` -- twelve controls at **39.4px**, at 375px
**and** 1440px, none of them in a stretching row: Submit, My apps, Contract, four
fixture pickers, Reset surface, three raw-transport controls and Run the React
fixture. `verify:browser` passes that route because its only tap-target check
covers the per-issue and copy-all controls, which already carry `.tap-44`.

The marker earned its place: a first run of the scan read `0px` on a cold Vite
server, because `app.css` had not been injected yet at 600ms, and would have
reported a clean sweep over a page that was never styled. The served cascade was
then confirmed directly -- one `.btn` rule, `min-height: 44px`, with a synthetic
`.btn` computing 44px on the page.

The pre-fix half was measured by `git checkout`ing both files, running with the
marker inverted to expect `0px`, then restoring from copies taken beforehand and
`md5sum -c`ing both files back to byte-identical.

### Readings that moved

Every reading that changed, at both widths unless stated:

| Reading | Before | After |
| --- | --- | --- |
| `.btn-row` post-run controls @375 | 39.4px, 1/3 under 44 | **44px, 0/3 under** |
| `.btn-row` post-run controls @1440 | 45.4px, 0/3 under | **45.4px, 0/3 under (unchanged)** |
| bare `.btn`, both widths | 39.4px | **44px** |
| `/dev/foundry-submit` `.btn`, both widths | 39.4px x 12 x 2 | **>= 44px** |
| `.cr-root .btn.tiny` chips | 24px | **24px (unchanged)** |
| ShortLinkManager chips, both widths | 22.9px | **24px** |
| all 306 `verify:browser` measurements | -- | **unchanged** |

The 1440 row is the demonstration that was asked for: the number is unchanged
there because stretch was already producing it, and changed at 375 because the
rule now produces it instead of the row. **Bare `.btn` changed at both widths**,
which is the honest scope -- the accidental pass only ever applied to a control
sharing an unwrapped row with a taller sibling, and most `.btn` in this repo are
not in one.

No route gained a finding.

### The second finding: STANDBY, reported and left

`src/lib/gauntlet/SpeedrunClock.svelte` line 279:
`.sr-rec.standby-label { color: #9a5a3a; }` -- a hardcoded hex, not a token, in a
file this session does not own. It is left untouched.

Measured here by compositing onto the real ground and reading the pixel back,
inside a real `.gt-root` (which redeclares `--bg2: var(--panel-2)` = `#0e161b`
and `--dim: #5f8a78`, so the portal plate is the wrong ground for it):

| Label | Colour | Ratio on `.gt-root` `--bg2` |
| --- | --- | --- |
| STANDBY | `#9a5a3a` | **3.39:1 -- below 4.5** |
| REC . RANKED | `#ff5a2b` | 5.87:1 |
| UNRANKED | `--dim` `#5f8a78` | 4.69:1 |

All three reproduce the reported figures exactly. **Measuring it in the wrong
room gets a different answer and looks like a disagreement**: on the portal
`:root` plate (`--bg2` = `#222e22`) the same three read 2.63 / 4.55 / 4.24. The
4.24 is the `--dim`-on-`--bg2` failure `CLAUDE.md` already documents to two
decimal places, which is a useful cross-check that the instrument is right.

STANDBY is what a student reads for the whole window between reveal and the Start
macro firing. Holding hue 20.0 and saturation 45.3% and moving lightness only,
41.6% -> **49.6% (`#b86b45`) reaches 4.55:1** -- offered to the owning session,
not applied. `--crimson` is reserved for live/rec/error in that room, and STANDBY
is by definition not live.

### Verification

- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, mix
  **31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`** -- baseline held on both numbers and the mix.
  A placeholder `.env` was exported before the sync (a checkout with none
  reports 11 phantom errors); it is gitignored and was not committed.
- `npm test`: full suite run, result recorded in the session report. The change
  is CSS only and no test reads either file.
- `npm run verify:browser`: full pass before and after, numbers above.
- `npm run verify:browser -- --probe`: Chromium 141.0.7390.37 at
  `/opt/pw-browsers`, screenshots, rAF, `IntersectionObserver` and
  `ResizeObserver` all live.

### Not verified

- **Nothing was measured on a signed-in or production surface.** Every number
  here is from `/dev` routes against a local dev server with a placeholder
  Supabase project; `/admin/links` in particular was measured by reading
  `ShortLinkManager`'s own `.btn.tiny` block out of the component and mounting
  it under a bare wrapper, not by loading the real admin route, which needs a
  Bosco Tech Google session.
- **The GAUNTLET post-run surface itself was never loaded.** No `/dev` route
  registered in `verify:browser` mounts `RunResults.svelte`; the 39.4px figure
  here is that component's exact markup shape rendered against the real cascade,
  not the component. The originating harness lives on another session's branch.
- **Text is measured in the fallback stack inside `verify:browser`**, which
  blocks `fonts.googleapis.com`; the standalone probes above load the real
  `@fontsource` faces from `node_modules` and say so.
- `prefers-reduced-motion` is `no-preference` throughout, so that path is not
  exercised.
- Only the two widths were measured. No hit-testing was done, because nothing
  here uses `.tap-reach-44`.

### Left undone, deliberately

**`verify:browser` has no check that would catch this class of defect, and one
was not added** -- `tools/browser-verify/` is outside this session's ownership.
The gap is specific and cheap to close: a tap-target check whose selector is
plain `.btn`, on any route that renders one, with `/dev/foundry-submit` as the
positive control (it had twelve at 39.4px and would have reddened). Adding a
check means adding its `--selftest` fixture and a `--break` preset with it.
