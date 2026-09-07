# 0093 The maps editor is a form stack, and it should be a workspace
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `src/lib/maps/**` except the viewer, `src/routes/maps/edit/**`, the entry control on `src/routes/maps/+page.svelte`, `src/routes/dev/maps-editor/**`, migration 0191 (conditional), `tests/maps-editor*`, `tests/dom/maps-editor*`, `tools/browser-verify/routes/maps-editor*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0093-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0191, conditional. Claims: 0191. Highest on origin/main at issue: 0189
- Status: pushed
- Branch: assigned by the harness
- Notes: Mr. Pina used the editor on 2026-09-06 and reported he is typing
  inch dimensions into boxes with nothing appearing anywhere. He is right,
  and the cause is layout rather than absence.
  
  `PlanCanvas.svelte` EXISTS -- 519 lines -- and is mounted inside
  `NodeDetail.svelte` at line 636, which is below the geometry fields, below
  Placement, below Publish subtree, below Add inside this building, below
  Items in here, below Stock in here and above Delete. So the drawing is at
  the bottom of a scroll of forms, and a person typing a width at the top
  never sees it change.
  
  `IDEA_MAPS_SPEC.md` section 7 already specifies what he is asking for:
  "Draw dimensioned shapes: typed inch dimensions, drag placement, snapping,
  parent assignment. Accuracy comes from the typed numbers, not the mouse."
  That is the SolidWorks model. It was scheduled as a later bundle and never
  came back.
  
  Two more things from the report, both true and both small next to the
  first. There is no way into the editor from `/maps` -- the route is typed.
  And the layout is a single column that does not use a wide screen, on a
  tool meant to be used for hours.
  
  This is the highest-frequency authoring surface in the project and its
  first real user says it is confusing. That is the whole brief.
  
  Deliberately excluded: the public viewer, settled and used by signed-out
  visitors; the token files; DXF import, which the spec puts in P2; and 3D,
  which section 4 excludes outright.
