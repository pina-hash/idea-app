---
title: "IdeaCAD direct solids, admin advisories, and part mass provenance"
date: "2026-09-15"
branches: ["codex/ideacad-direct-modeler"]
migrations: ["0216"]
subsystems: ["IdeaCAD", "Classroom", "Testing"]
---

New documents open empty in a general solid modeler, with IdeaBlade disabled.
The old feature-tree documents keep their original reader. A measured kernel
spike selected a pinned Remus BREP artifact behind a worker adapter. The app adds
direct modeling, sketch tools, solid operations, grouped persistent undo/redo,
3MF/STL/DXF exports and verified, undoable backup import.

Alejandro's follow-up requires administrator-editable numeric advisory bounds,
and restricts density sources to MatWeb/Bambu Lab. The global revisioned settings
editor changes diameter, height, mass and hex-extension checks without constraining
geometry. Printed parts use entered Bambu Studio estimates or scale measurements;
no bulk-plastic density or fill percentage supplies their mass. Generic shop
stock remains unverified. Geometry changes clear measured/estimated overrides.
Unknown distributions prevent unsupported center-of-mass/inertia claims.

0216 adds standalone documents, copied assignment context, format discrimination,
immutable BREP storage, operation receipts, exact-revision writes and separate
permissions. Private/named/class sharing and deliberate archiving preserve old
work and captured instructor access. Legacy writers cannot overwrite new formats.
The migration remains unapplied in production; Alejandro's manual process owns
application. The final SQL returns 27 readiness rows.

Validation: 72 IdeaCAD files / 1,077 passing tests; browser-driven modeling and
real SQL/RLS role, save/reopen, undo/redo, archive/link/share and admin flows at
1440 and 375 px. The deliberately blank-render and corrupt-backup controls fail
as intended. Node 24 compilation and local packaging passed with a Windows
junction workaround; output is not a deployable cross-platform artifact.
Unrelated full-suite failures were reproduced on the original baseline, including
the one line-ending control. See `docs/ideacad/verification/README.md`.

The specification's novice five-minute test and 60 fps on school graphics remain
unverified. Curved edge/vertex deformation, arbitrary pattern/revolve axes,
general mixed-curve sketch editing, automatic live refresh and measured hardware
fit are not implemented. Collar height is still unspecified; the prior invented
clamp was not adopted. `docs/IDEACAD.md` records current scope; the earlier product
record and supplied specifications are preserved beside the verification evidence.
