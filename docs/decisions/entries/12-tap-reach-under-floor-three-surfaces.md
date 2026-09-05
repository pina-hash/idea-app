# 12 Three `.tap-reach-44` controls measured under the floor, on surfaces no one bundle owns
- Raised: 2026-09-05  By: prompt 0044, `claude/tap-reach-44-class-bug-fschcn`
- Status: open
- Decision:
- Default this assistant would pick: fix all three under `IDEA_INTERFACE_STANDARDS` 10
  (2.12) step 1, which is available for each of them; the reason they are here rather
  than fixed is ownership, not difficulty.
- Why it is blocked on him: each sits in a component prompt 0044 did not own
  (`FolderManager.svelte`, `NotebookView.svelte`, `AttachmentList.svelte`), and two of
  the three trade a measured floor against a deliberate design decision another bundle
  took and wrote down. 2.12 says a measured violation is never left as a standing
  finding, so they are recorded here with an owner rather than in a report.
- What it unblocks: three small, independent bundles, each one component.
- Context: these became visible only on 2026-09-05, when `tapReach` in
  `tools/browser-verify/checks.mjs` started WALKING a control's hit area instead of
  reconstructing it from the CSS. Before that the reported height was
  `max(ownHeight, 44)`, which is 44 by construction, so no `.tap-reach-44` control in
  the repo had ever had its reach measured. No route spec points at any of these three,
  so the full harness run is still 0 outside threshold; that is the point of writing
  them down.

  Measured with the walked probe at 375 and 1440, both widths identical in all three
  cases. A hit counts only the control, something inside it, or a `<label>` that
  activates it.

  1. **`FolderManager.svelte` colour swatches, 7 of 7: walked 25 x 45.** The height is
     right and the WIDTH is 25px against a 44px floor. Not a clip and not a bug: the
     swatches set `--tap-reach-w: 0px` deliberately, because seven of them sit in a row
     closer than 44px apart and overlapping reaches hand the tap to the wrong colour.
     `src/app.css` and `CLAUDE.md` both name this as the ordinary case for the knob. So
     the knob is doing what it was written to do and the result is still under the
     floor, which is a conflict the width knob's own documentation never resolved.
     2.12 step 1 (re-lay: fewer swatches per line, or a wider swatch) is arithmetic and
     available; it costs the picker's height.

  2. **`NotebookView.svelte` `.inline-link`, 1 of 3 at 375 and 1 of 2 at 1440: walked
     32.5 x 45**, own box 31.1 x 20 -- the toolbar's shortest link. Same shape as (1):
     `--tap-reach-w: 0px` is correct there (the toolbar's links sit side by side) and
     the shortest word is narrower than the floor. The other links on the same toolbar
     clear it, so this is one control rather than a component-wide problem.

  3. **`AttachmentList.svelte` `.attach-name`, 1 of 2 on a packed item page: walked
     88 x 41.5**, own box 149.1 x 22.5. This one is VERTICAL overlap and is the more
     interesting of the three: the row above is a `h2.section-label` and the row below
     is the NEXT `a.attach-name.tap-reach-44`, whose own 44px reach takes the bottom
     2.5px of this one. Two reaches stacked closer than 44px apart steal from each
     other exactly as two side by side do, which is the failure `--tap-reach-w: 0px`
     exists to prevent horizontally and which nothing prevents vertically. THE SAME
     COMPONENT MEASURES 45 CLEAN on `/dev/classroom-images`, so it is the row spacing at
     this mount and not the component. 2.12 step 1 is row spacing.
- Tree check (2026-09-05): all three reproduce on the `/dev` harness at both widths --
  `/dev/notebook` (with the folder manager opened), `/dev/notebook`, and
  `/dev/classroom-split/s-1/item/i-crowded?manage=1`. The fourth control this bundle
  found under the floor, `InfoTip`'s column-tip trigger at 34.5px, was inside prompt
  0044's ownership and is fixed: it walks 45 at both widths now.
