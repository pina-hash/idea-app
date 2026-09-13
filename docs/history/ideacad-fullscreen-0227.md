---
title: Standalone full-screen IdeaCAD
date: 2026-09-13
branches: ["codex/ideacad-fullscreen-0227"]
migrations: []
subsystems: ["ideacad", "portal"]
---

IdeaCAD now has its own authenticated route at `/ideacad`. The route starts at a
document chooser, reads the signed-in owner's existing non-archived documents,
and can create the next document through the existing item-keyed
`ideacad_open_document` transport. This deliberately does not invent a workspace
or template system and changes no database object: until that open design question
is resolved, the existing editor registrations remain the available document
starters.

The existing `BladeEditor`, viewport, feature model, rules and store remain the
render path. Their mount can now fill its parent. On desktop the FeatureManager
and PropertyManager/rules rail have draggable six-pixel dividers, independent
collapse controls and per-user widths stored in `profiles.preferences.ideacad`.
The default 1440px grid allocates 260px + 6px + 934px + 6px + 240px, leaving a
934px graphics area. At 375px the media layout overlays the three panes at the
full 375px width and exposes exactly one through a Features / Graphics /
Properties switcher. The concept strip remains the final thin grid row and the
document does not scroll.

A development-only `/ideacad/preview` route mounts the real editor without
Supabase so the standalone layout remains directly inspectable. A browser drive
was attempted, but the installed Chromium could not start because the container
lacks `libatk-1.0.so.0`, and the configured package repositories were unreachable;
therefore no screenshot or live DOM measurement was produced in this environment.
The widths above are the exact resolved CSS grid arithmetic, not a browser claim.

The home launcher places IdeaCAD immediately after My Notebook, alongside the
other signed-in applications, and routes its card to `/ideacad`.
