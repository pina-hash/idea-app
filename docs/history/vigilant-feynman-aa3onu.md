---
title: "IdeaCAD gets a design system of its own: one root class, a type scale with jobs, and panel chrome a person can tell apart at a glance (`claude/vigilant-feynman-aa3onu`, no migration)"
date: 2026-09-14
branches: [claude/vigilant-feynman-aa3onu]
migrations: []
subsystems: ["IdeaCAD", "Design system", "Browser verification"]
---

Ledger 0231. IdeaCAD inherited the site's generic green look and had no identity of
its own; the owner asked for something unique and identifiable, SolidWorks' shape with
green where SolidWorks spends red, nothing too crazy, beautiful and functional. This
bundle is `src/lib/ideacad/ideacad.css`, a scoped design system declared as custom
properties on one root class, applied to the Blade editor and every panel inside it.
No markup structure and no component logic changed; the whole diff to the components
is one import, one class on the root element, and their `<style>` blocks cut down to
layout.

Baselines re-derived on `main` at `2bb8b56` at branch time: **`svelte-check` 0 errors,
37 warnings in 20 files (31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class`)**, which is `CLAUDE.md`'s stated figure. The same reading
after the change, and none of the five unused selectors is in an IdeaCAD file.

## The room

**One root class, `.ic-root`, on `BladeEditor`'s own root element.** Every token is
`--ic-*` on that element and nothing in the stylesheet is written outside its scope,
so nothing can reach the rest of the site. The SHARED vocabulary (`--surface-*`,
`--text-*`, `--boundary`, `--hairline`, `--green-tint`, `--radius-control`,
`--bevel-raised`) is ALIASED onto the room's tokens on that same element, the way
`.nb-root` and `.fg-root` do it, so a component that still reads the shared names
follows this plate. That includes the WebGL canvas: `Viewport.svelte` reads its clear
colour off the host's `--surface-0` at mount, so the graphics ground re-tints with no
change to the viewport at all.

**The plate is cool graphite, one step apart per surface, and deliberately a third
thing** beside the portal's green metal and the classroom's near-neutral: ground
`#0e1114` (the graphics area, darkest, so the sage model is the brightest object on
screen), panel `#191d21`, title band `#22272c`, control plate `#262c31`, recessed field
`#0d1012`, selection tint `#123222`. Ink and edge ratios were computed (WCAG 2.x, in
a scratch script, not read from anything under test) against every one of those
grounds: `--ic-text-1` worst 11.45, `--ic-text-2` worst 6.13, the accent green worst
5.91, `--ic-edge` worst 3.32 against a 3:1 boundary floor. `--crimson` measures 4.12 on
a band, so the FAIL **word** takes `--ic-fail-ink` (`#e07474`, the same hue at 67%
lightness instead of 61%, 4.96 on a band); fills and edges keep the raw token. That is
the `--acc-ink` contract in this room's costume: the identity paints the fill, the ink
paints the word, and the move is lightness only.

**A type scale with jobs, which is the whole fix.** The failure named in the prompt was
two different things rendering as identical grey paragraphs, and it was literal: a
field label, a readout, a chip and a sentence of prose were all 12px Share Tech Mono in
`--text-2`. Now `--font-mono` is the INSTRUMENT face (eyebrows, field labels, chips,
units, every number, with `tabular-nums` on the root for the Rajdhani figures beside
them) and `--font-display` is the READING face (control words, tree rows, every
sentence). A sentence is never set in the instrument face. So the note under a field
and the label above it differ in face, size and case before either is read, which is
the "can a person tell the two apart at a glance" test the prompt asked for and which
"present, visible, 44px, contrast" cannot ask.

**Panel headers, dividers and rails are separate surfaces.** Every panel (the
FeatureManager, the PropertyManager, the Materials panel, the History, the rules rail
and the compare sheet) opens with a full-bleed title band on `--ic-head` with a
boundary beneath it, bled across the pane's gutter with a negative margin. A section
label is an eyebrow with a rule running out from it. A control is a raised plate with a
1px bevel, an input a recessed field with an inset shadow. The pane divider is a dark
channel with a three-dot grip that turns green when held. The view toolbar is one
joined floating plate (SolidWorks' heads-up strip) rather than five separate buttons;
the join is a 1px overlap and every control keeps all four borders, so when the strip
wraps at 375 (Perspective takes a second row, measured) the first row's last control
still has its right edge.

**States carry a word and a shape as well as a hue, on every one.** Selected: a 3px
green rail plus the tint. Active concept: a green top rail plus the word ACTIVE.
Suppressed (`aria-disabled`): `--ic-text-2`, a DASHED edge, the plate goes flat.
Error: a crimson rail plus the REBUILD chip. Pass / fail: an OUTLINED green PASS chip
against a FILLED crimson FAIL chip, so the two differ in fill as well as in hue and in
word. Pressed (History open, the phone pane tabs): the accent as fill with dark ink.

**The FeatureManager is flat rows, not bordered boxes.** Rows sit directly on the panel
separated by hairlines, each with a small mark (a filled diamond for a feature, a
hollow one for a node, a dash for a station) so the list scans as a tree. The tap floor
is unchanged; only the borders went.

**The rules rail is label-above, value-and-verdict-beneath.** A readout used to be
three rows: label left, value right, PASS on its own line. It is now an eyebrow, a 15px
mono value and the chip at the right of that value. Measured at 1440 after the change:
the rail's content ends at about 470px of a 543px box, and the harness's own "the
readouts rail shows its last row" claim holds.

## The tap floor and the density class

**44px everywhere a student taps, which is everywhere in IdeaCAD.** `--ic-tap` is the
one floor, declared on the root at 44px and read by every control. **`.ic-dense` is
the declared 24px density claim `IDEA_INTERFACE_STANDARDS` 10 requires** (it re-points
`--ic-tap` for the subtree carrying it) **and no element carries it today, on
purpose.** Every IdeaCAD surface is reachable by a student on a phone through the pane
switcher and on a desktop through the same rows; there is no instructor-only subtree
to claim it for. The class exists so a later instructor console built inside this room
writes the claim on the element a sweep reads it from, rather than asserting it from a
bundle.

## What was measured, and how

The container has a real Chromium at `/opt/pw-browsers`, so this was LOOKED AT rather
than reasoned about. A scratch script over `tools/browser-verify`'s own `launch`,
`openPage`, `waitForApp` and `clickUntil` rasterized `/dev/ideacad` in its default,
`three`, `property`, `materials`, `history` and `compare` states and
`/dev/ideacad-item` as owner and viewer, at 1440 and 375, before and after, with a
crop per panel (header, tree pane, viewport, rules rail, concept strip, compare sheet,
pane switcher) and the phone's Features and Properties panes reached through the real
switcher. Two instrument lessons from that pass:

- **A pane-switch click dispatched once after `waitForApp` raced hydration**: the
  same script that switched the pane on the before run did not on the after run,
  with nothing reporting it beyond the crop list lacking a tree. `clickUntil` against
  the `data-mobile-pane` predicate fixed it (two attempts, printed). Paint is not
  interactivity.
- **A style-block swap keyed on the first `<style>` in the file matched the literal
  inside a comment inserted two lines earlier** and cut `BladeEditor.svelte` off at
  line 43. The tail was intact (the new block had been appended), so the file was
  restored from git and re-cut on the LAST `<style>`. The first after-run's default
  1440 frame carried Vite's error overlay from that window; it was re-shot.

Box measurements off the after rasters at 1440: header 82px to 58px, so the stage
gained 28px (515 to 543); the rules rail's last row visible with room over; the tree's
eight rows and the sentence under them inside the pane. At 375: the concept strip's
controls now WRAP into three rows (before, the raster shows them on one row running
past the strip's right edge, "Re" sliced at the window), which costs the graphics pane
56px of height (521 to 465) and buys every control being reachable without a gesture,
per `ConceptStrip`'s own rule; the confirm pair, the triad and the view name still
clear each other.

`npm run verify:browser` over every `ideacad*` route spec at both widths, and
`npm test`, are reported in the ledger entry's own pushed state and in the PR.

## Not verified, deliberately said

- **Fonts are the fallback stack in every raster and every harness number**: the
  harness blocks every non-loopback request, so Rajdhani and Share Tech Mono were
  measured as their fallbacks. The instrument/reading split rests on face as well as
  size and case, and the face half was not seen.
- **No painted scrollbar**: this Chromium paints none at any colour, so the tree pane
  and the history list's `scrollbar-gutter` reservations were measured as widths, not
  seen.
- **`prefers-reduced-motion` is `no-preference`** on the harness; nothing here
  animates, but the hover transitions were frozen by the harness's own freeze.
- **The real item page and the standalone `/ideacad` app** were not signed into; the
  dev harnesses mount the real components, and `/ideacad`'s command bar lives in
  `src/lib/ideacad/app/**`, which this lane does not own and did not restyle.
- **`tools/browser-verify/measured/`** was not regenerated for the IdeaCAD specs; the
  README states that half is allowed to be stale, and a fresh pass is a
  `verify:readme -- --route <spec>` per spec when somebody wants the block current.
- **`CLAUDE.md`'s "Scoped themes" list does not yet name `.ic-root`**; that file is
  outside this lane's owned surface, and the entry belongs beside `.fg-root`'s.
