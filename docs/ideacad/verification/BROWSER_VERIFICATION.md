# IdeaCAD real database browser verification

Date: 2026-09-15. Browser: Codex in-app Chromium, driven through CUA browser APIs.
Viewports actually measured: 1440 × 900 and 375 × 812.

## Boundary and evidence

The dev page mounts the actual `IdeaCadApp`, `SolidWorkspace`, body properties,
advisory settings, chooser and persistence transports. Its snapshot invokes the
actual `/ideacad/+page.server.ts` loader. A scratch loopback bridge uses
`tests/db/postgrest-shim.ts` and `tests/db/harness.ts` against real PostgreSQL,
with the migration chain applied verbatim and fixed, synthetic identities.
Every browser write ran as authenticated under RLS and the actual RPC permission
predicates. Browser mutations used controls, keyboard events and canvas drags;
no debug function created or altered geometry. No production account, service key,
database or authentication hook was used.

The bridge booted before the final sketch-validation helper was added to 0216.
This browser pass therefore covers the previously validated 26-check version of
0216. The root task's newer database tests cover that later helper separately.
This run does not claim to verify Supabase Auth, deployed PostgREST, production
deployment, import/export, or every geometry command; the root task handles the
separate export/import/fillet pass.

SQL evidence is in `browser-final-evidence.json`, including all bridge RPC calls,
persisted manifests, operation-history rows, immutable artifact sizes and rules.
`browser-printed-evidence.json` captures the intermediate HIPS mass state.
`browser-console.json` contains zero captured warnings/errors from the final page.
`browser-ui-replay.mjs` records reusable CUA helpers for the executed UI sequence;
it was written after the interactive pass and was not separately rerun as one batch.

## Executed browser cases

1. **Private creation and geometry at 1440.** Owner opened New document, selected
   Top view and Rectangle, dragged (600,360) to (840,570), typed exact extrusion
   depth 1 inch, and switched to isometric view. Normal keyboard rename to
   `Persisted box`, then Documents, saved the model. Full browser reload and card
   open restored one solid. The two unrelated private seed documents stayed
   separated by account.
2. **Durable grouped undo/redo.** After a full reload, Undo reverted the rename,
   then Undo removed the extrusion, leaving its sketch. Documents saved both
   inverse operations. Another full reload reopened the zero-body model with Redo
   available. Redo restored the solid; the next Redo restored `Persisted box`.
   The database retained the same immutable BREP artifact through both inverses.
3. **Named viewer/editor.** Owner shared view access with the synthetic viewer
   and edit access with the synthetic editor. Viewer saw a read-only name,
   disabled Undo/Redo and View only badge. Attempting a rectangle drag selected a
   face and created no sketch or save. Editor renamed the model `Shared editor
   box`, saved, and owner reloaded that title. Desktop model ended at revision 9.
4. **Archive and assignment link.** Owner archived the standalone model using the
   two-step control. It remained readable with Archived badge and disabled edits.
   Restore reopened editing. Linking the same model to Direct model assignment
   removed the student's archive/link controls. The teacher's chooser then showed
   that model, with archive available. Teacher archived it successfully.
5. **Revocation and class sharing.** Owner removed the viewer's named grant;
   that account's chooser became empty. Teacher then selected Bridge class and
   Share view only on the archived model. The viewer's chooser regained that
   archived reference. This positive case was not masked by a named grant.
6. **Admin limits, including rejection.** At 375, site admin opened IdeaBlade
   limits. Maximum mass -1 was rejected with the actual SQL error. Replacing it
   with 700 g and setting maximum hex extension to 0.9 inch saved revision 2.
   Full reload reopened revision 2 with both values intact. The ordinary teacher
   had no limits-editor control and the fixture's actual SQL returned canEdit=false.
7. **Phone creation and reopening.** At 375 × 812, owner created another blank
   document, selected Top view/Rectangle, dragged (90,280) to (250,450), entered
   exact extrusion 0.75 inch, renamed `Phone box`, saved, fully reloaded and reopened
   the same solid. It was revision 4 before metadata tests.
8. **Printed mass provenance.** Objects → Body 1 → Material `3D print · HIPS`;
   selected Bambu Studio estimate and entered 42.5 g with normal keyboard input.
   Save/reload/reopen restored HIPS, 42.5 g, Bambu Studio estimate and the
   `42.50 g · Estimate` readout. SQL stored `materialId: printed-hips`,
   `massG: 42.5`, `massSource: bambu-studio`.
9. **Switching to stock.** Changing material to 6061-T6/T651 aluminum cleared the
   mass override. SQL stored `massG: null`, reset `massSource: measured`, and
   `materialId: aluminum-6061-t6`. The active mass readout became the stock-density
   estimate 60.31 g; the old 42.5 g estimate no longer contributed.
10. **Advisory limits do not change geometry.** Enabled IdeaBlade on Phone box.
    Under rules revision 2 its measured diameter was 2.776 in, within maximum 5.
    Admin changed maximum diameter to 1 in, producing revision 3. Owner reopened
    the same model: diameter stayed 2.776 in and its state changed to Outside
    limits. Height stayed 0.750 in and mass stayed 60.3 g. The BREP hash remained
    `1335ced3eae848fdd3113fa3fc2a31b3b60841c83db67f4d8c8e46589f3d7d11`.

## Persisted measurements

| Model | Final revision | Bodies | BREP bytes |
|---|---:|---:|---:|
| Shared editor box | 9 | 1 | 4,970 |
| Phone box | 9 | 1 | 4,963 |

The final fixture contains the two original private seed documents and the two
models created through UI. The one intentional RPC error was the negative-mass
admin validation case. Rules revisions 1, 2 and 3 remain stored.

## Defects found and verified corrections

- The chooser inherited global `main` max-width 880 px and padding despite its
  route layout reset. CSS order put app.css later. Root added a scoped app-shell
  reset. Final 375 measurement: main max-width `none`, padding `0px`, and no
  element with horizontal overflow greater than 2 px. Final desktop and phone
  screenshots were recaptured after the correction.
- The phone toolbar showed a vertical scrollbar beside the intended horizontal
  scrollbar. Root set overflow-y hidden. Final screenshot confirms the vertical
  scrollbar is gone; computed overflow-y is hidden.
- An apparent rename loss occurred with the browser tool's `locator.fill`, which
  did not trigger the native change path. Normal click/Ctrl+A/type/Tab correctly
  saved every subsequent rename. This was not retained as a reproduced app defect.
- Earlier read-only code review found instructor-owned class sharing excluded by
  role==='manager'. Root changed the UI to linked canArchive. The shared student
  model class-share path was executed here; the instructor-owned variant was not
  separately driven in this browser pass.

## Final inspected screenshots

- `chooser-1440.png`, `solid-1440.png`: final desktop chooser and geometry.
- `chooser-375.png`, `solid-375.png`: final phone chooser and geometry.
- `viewer-1440.png`: viewer read-only state.
- `printed-mass-375.png`: persisted HIPS/Bambu Studio mass.
- `advisory-375.png`: rules revision 3 warning without geometry clamping.
- `admin-375.png`, `archive-375.png`: earlier admin/archive states; chooser
  background in these predates the scoped layout correction.
