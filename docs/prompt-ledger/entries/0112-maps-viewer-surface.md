# 0112 The maps viewer must use the full screen, the way Google Maps does
- Issued: 2026-09-09
- By: router chat for IDEA portal work
- Owns: `src/routes/maps/` EXCEPT `edit/`, `src/lib/maps/viewer/**`, the public read paths in `src/lib/maps/transports.ts`, `src/routes/dev/maps-viewer/**`, `tests/maps-viewer*`, `tools/browser-verify/routes/maps-viewer*.mjs` and `maps-media*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0112-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none.
- Status: pushed
- Branch: claude/maps-viewer-surface-alxaev
- Notes: Two things from Mr. Pina. One, the black "The map" banner at the top of
  the page looks out of place: that is `nav.mv-crumbs` in
  `MapsBreadcrumb.svelte`, a breadcrumb doing a title's job on a full black
  bar. Its wayfinding (`aria-label="Where you are"`, `aria-current`) stays.
  Two, the outcome: IDEA Maps must use the full screen the way Google Maps
  does, and take whatever Google Maps conventions genuinely transfer to a
  building-and-shelf map, so that somebody who has used Google Maps
  understands IDEA Maps at once. He runs 2844x1450. The surface stays
  signed-out-reachable, works at 375px on a phone in a workshop, and clears
  44px tap targets at both viewport ends per `IDEA_INTERFACE_STANDARDS.md`.

  Deliberately excluded: the editor (`src/routes/maps/edit/**`,
  `MapsEditor.svelte`, `MapsEditorShell.svelte`, `NodeTree.svelte`,
  `PlanCanvas.svelte`, `shelf*.ts`, `grants.ts`), which is reported on and not
  changed; and the guesser game, which Mr. Pina deferred until the map has more
  depth.
