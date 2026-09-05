# 12 Three `.tap-reach-44` controls measured under the floor, on surfaces no one bundle owns
- Raised: 2026-09-05  By: prompt 0044, `claude/tap-reach-44-class-bug-fschcn`
- Status: PARTLY CLOSED 2026-09-05 by prompt 0047,
  `claude/decision-12-surfaces-a9e60c`. All three measurements REPRODUCED with the
  tree's own walked probe, identical at 375 and 1440, and the cause named for each:
  none of them is the clipping ancestor 0044 found on its own surface. Two are painted
  small and one is two reaches overlapping vertically, which are different faults with
  different fixes.

  **Swatches: FIXED, 2.12 step 1.** Seven 44px targets need 356px on one line against a
  259px fieldset at 375, so the one-line arrangement genuinely does not fit -- but a
  line was never the only arrangement, and `flex-wrap: wrap` was already declared on the
  fieldset. At 44px they wrap 5+2 at 375 and 6+1 at 1440 inside the container that was
  already there. **Step 2 was NOT reached and this bundle did not have to ask whether
  the palette should carry fewer colours.** Measured after: 45 x 45 on all seven at both
  widths. Cost: the swatch band 24 -> 96px, the folder editor 247 -> 319px, no
  horizontal scroll at either width.

  **Attachments: FIXED, 2.12 step 1.** Not a clip and not a paint size: the two rows sat
  41.3px apart centre to centre (22.5/2 + 8px gap + 44/2), so the second link's reach,
  which paints later, took the bottom 2.7px of the first's. A 44px floor on the line
  holding the link rather than a bigger list gap -- the centre distance is
  `h1/2 + gap + h2/2`, so the 3px gap increase that clears 44 for THIS pair of row
  heights leaves two 22.5px rows 33.5px apart and overlapping again. Measured after:
  88 x 45 on both rows at both widths, list 74.5 -> 96px.

  **Toolbar links: NOT FIXED, RAISED HERE, and the entry below is now asking a narrower
  question than it was.** Four controls, not one: Select 31.1, Done 25.6, Clear 25.7 and
  Expand all 36.3, all in the notebook toolbar's control row, all under the floor on
  width. Both PROSE call sites of the same class already clear it (Clear the filters
  89.9, Manage folders 79.6), so 2.12's prose exemption is not in play and a `min-width`
  on the shared class would move nothing inside a sentence -- measured. **What stops it
  is the row, not the class.** At 375 `.tools` has 293px and already carries 307.7px
  (a 137.4px sort control, a 29.2px counter, three links, four 12px gaps); at 44px each
  it needs 346.6px, and shipping the width alone buys a **13px document overflow**,
  which 2.12 step 3 refuses at the narrow width.

  **The answer is measured and it is one line.** `flex-wrap: wrap` plus `min-width: 0`
  on `.tools` (the second is CLAUDE.md's own automatic-minimum trap, which is why the
  row overflows the page rather than itself) takes the busiest state at 375 to
  `scrollWidth 293 == clientWidth 293`, **0px document overflow**, at a cost of **32px of
  toolbar height at 375 only**; 1440 is unchanged. Prompt 0047 measured that with a
  probe and restored the file byte-identically (md5 `bcbce4eef0705a7976016c5bccc6c73e`)
  rather than shipping it, because `.tools` is outside the rule it was given. So this is
  no longer "should the toolbar carry fewer controls" -- it is **"may `.tools` wrap, for
  32px at phone width"**, which is a yes or no.

  A harness row now measures all three (`notebook.mjs`, `classroom-split-s-1-item-
  i-crowded-manage-1.mjs`), both axes, and the toolbar one is RED on purpose: a number
  that regenerates on every run with this entry against it is the opposite of the
  standing finding 2.12 forbids, which is one nobody has to look at.
- Status was, and the reasoning below is unchanged: open
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
