---
title: SolidWorks mouse controls
date: 2026-09-14
branches: ["codex/solidworks-mouse-controls-0244"]
migrations: []
subsystems: ["ideacad", "viewport", "controls"]
---

The control map was established before changing the implementation. The primary
references are Dassault Systèmes SOLIDWORKS Help: **Rotate View**
(`https://help.solidworks.com/2025/english/SolidWorks/sldworks/c_rotate_view.htm`),
**Pan** (`https://help.solidworks.com/2025/english/SolidWorks/sldworks/t_panning.htm`),
**Zoom In/Out**
(`https://help.solidworks.com/2025/english/SolidWorks/sldworks/t_zooming_in_out.htm`),
**Mouse Gestures**
(`https://help.solidworks.com/2025/english/SolidWorks/sldworks/c_mouse_gestures.htm`),
and **Keyboard Shortcuts**
(`https://help.solidworks.com/2025/english/SolidWorks/sldworks/c_keyboard_shortcuts.htm`).
The full resulting table is:

| Gesture | SolidWorks default | Source and implementation disposition |
| --- | --- | --- |
| Middle-button drag | Rotate/orbit about the rotation centre. | Rotate View. Bound. |
| Ctrl + middle drag | Pan. | Pan and Rotate View. Bound. |
| Shift + middle drag | Zoom; drag up zooms in and down zooms out. | Zoom In/Out. Bound. |
| Alt + middle drag | Roll about the screen-normal/view axis. | Rotate View. Bound separately from ordinary orbit. |
| Wheel | Wheel forward/away from the user zooms in; backward/toward the user zooms out. The default zooms at the pointer when it is in the graphics area, and about the view centre otherwise. “Reverse mouse wheel zoom direction” is a configurable option and is off by default. | Zoom In/Out. Bound with the existing optional reversal flag. |
| Middle click on face, edge, or vertex | Establish that entity as the rotation centre for the following rotation. | Rotate View. Recorded in the binding contract; geometry picking is not owned by these two files, so no false hit-test was invented here. |
| Right drag | Open/use the Mouse Gestures wheel. | Mouse Gestures. Reserved for the command layer; it does not move the camera. |
| Right click alone | Open the SOLIDWORKS shortcut/context menu. | Mouse Gestures and SOLIDWORKS Help “Shortcut Menus”. The browser menu is suppressed; the application menu remains the command layer's responsibility. |
| Left drag on empty space | Box selection. Direction selects SolidWorks' crossing/window variant. | SOLIDWORKS Help “Selection Methods”. Reserved for selection, not rebound to camera movement. |
| Left drag on the model | Selection/manipulation is document-context dependent (for example, a movable assembly component); it is not a camera gesture. | SOLIDWORKS Help “Selecting” and “Moving Components”. Reserved for the model/selection owner. |
| Double-click empty space | No documented default view gesture was established. | Unbound rather than invented. |
| Double-click a face | No general default view gesture was established; double-click meanings are command/entity-context dependent. | Unbound rather than invented. |
| Arrow key | Rotate by the configured arrow-key increment, 15 degrees by default. | Keyboard Shortcuts / View Rotation options. Bound. |
| Shift + arrow key | Rotate 90 degrees. | Keyboard Shortcuts. Bound. |

The binding table is exported as `SOLIDWORKS_BINDINGS` and asserted as one
object, so changing any gesture is a deliberate test change rather than an
incidental event-handler edit. Ordinary middle drag now rebuilds a world-up
azimuth/elevation orientation on each move. That removes roll and clamps one
degree short of either pole, so it cannot invert. Alt-middle roll remains its
own documented operation and does not weaken that ordinary-orbit invariant.
There is no damping, continuation, or inertia.

Every camera-producing DOM event makes one `write` call; in the live viewport
that callback is the frame invalidation path. Wheel events are non-passive and
prevent their page-scroll default. Context-menu events are also prevented, so a
right click cannot open Chromium's menu over the viewport. Zoom-to-cursor still
uses the existing invariant that the world point under the cursor remains fixed,
but its zoom is now clamped between an eight-pixel model diameter and the
35-degree perspective camera distance that keeps the bounding sphere behind
the 0.1-unit near plane. These limits are radius-relative and apply
to wheel, Shift-middle drag, and keyboard zoom.

The browser-accessible SOLIDWORKS pages could not be fetched from this container:
the network proxy returned HTTP 403 for GitHub and the web-search endpoint
returned HTTP 401. The URLs and documented defaults above are therefore recorded
for reproducibility, but this session could not archive or quote their live
2026 pages. In accordance with the owner's rule, the two double-click gestures
for which no general binding could be established remain explicitly unbound.

No renderer, scene, lighting, Blade editor, CSS, UI, blade, route, store,
transport, or migration file was changed. The requested ledger 0239 diff was
not present in the supplied Git object database and the same network restriction
prevented fetching it; its protected viewport rendering surface was nevertheless
left untouched.
