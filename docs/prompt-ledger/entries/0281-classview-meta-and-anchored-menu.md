# 0281 Lane N2 - the section page: a truncated metadata line and a menu that escapes nothing
- Issued: 2026-09-22T00:00:00Z
- By: Mr. Pina, from his own report of 2026-09-09 against the section page in
  manage mode at 1196x1304 ("this shit is such a mess lmao", with a
  screenshot), routed as ledger 0281. That screenshot held four problems: the
  dead left column (fixed by `fd640e69`), the duplicated "No unit" (a
  non-defect, see below), and these two.
- Owns: `src/lib/classroom/ClassView.svelte`,
  `tools/browser-verify/routes/classroom-stream*.mjs` and their
  `measured/*.json`, `docs/prompt-ledger/entries/0281-*`, and its own
  `docs/history/` entry.
- Migration permitted: no. Claims: 1-8. Six confirmed, ONE WRONG, one confirmed
  with its stated mechanism wrong.
  Highest on origin/main at issue: 0217
- Status: pushed
- Branch: `claude/new-session-ht1e8l`
- Notes: CLAIM 5 IS THE ONE THAT WAS WRONG, and it was wrong in the direction
  the prompt warned about: it says the menu "ends up painted over the page
  footer" because a multicol fragmentainer mis-positions it. Measured, neither
  half holds. The menu is positioned correctly against its own `.row-menu` (top
  = trigger bottom + 0.2rem to the pixel, right edge = wrapper right edge), and
  `.stream` is `overflow: visible` so it clips nothing. What clips is
  `.cr-nav`'s `overflow-y: auto` plus 0277's `.cr-root { overflow: hidden }`,
  which is why the menu does NOT reach the footer: there is nowhere below the
  pane for it to paint. 0277 converted "paints over the footer" into "silently
  invisible", exactly as the prompt said to re-measure for.
  CLAIM 3 IS TRUE BUT NOT FOR ITS STATED REASON. The meta box is the same width
  at 1196, 1440 and 1920 (213px measured on all three), but the binding
  constraint is not `--cr-stream-col` alone -- a manage-mode row spends 136px
  of its 332px on controls (select 30, grip 44, expand 30, menu 32), so the
  text column is 143px with an item open against 349px of content.
  CLAIM 8 CONFIRMED AS A NON-DEFECT and not touched: the row menu renders one
  `No unit` option (`ClassView.svelte:1277`), `orderedUnits` is `sortUnits(units)`
  and `UNFILED_GROUP_ID` is the literal `'unfiled'` which is never a unit id, and
  the second "No unit" on screen is the BULK BAR's own select (`:1542`), which
  is simultaneously visible whenever something is ticked.
  SCOPE COLLISION WORTH KNOWING: the committed harness coverage for the menu
  could not be written. `classroom-stream*.mjs` is the only spec glob this lane
  owns, its fixture passes no `transports`, and `editable` is
  `canManage && !!transports` -- so `/dev/classroom-stream` renders no row menu
  at all. The menu was measured by hand on `/dev/classroom-split/s-1`, whose
  spec belongs to 0277. A committed check belongs there and is not this lane's
  to add.
  TWO THINGS FOUND AND LEFT ALONE, both outside the Owns line: the shell's
  `SiteFeedback` trigger (z-index 90) paints over the bottom of a row menu that
  lands under it in the bottom-right corner -- present identically before this
  change, and visible in the before screenshot; and `.menu`'s items render
  two-up rather than as a single column, also pre-existing and unchanged here.
