---
title: "IdeaCAD's Blade editor gains docked application chrome"
date: 2026-09-14
branches: ["codex/ideacad-application-chrome-0232"]
migrations: []
subsystems: ["IdeaCAD"]
---

The Blade editor no longer treats the graphics area as a page background with
controls laid over it. The view controls and labeled FeatureManager and
PropertyManager toggles now occupy a dedicated toolbar surface. The orientation
chooser expands as another docked toolbar row rather than covering the model.
Accept and Cancel occupy an edit-action footer below the graphics well.

The graphics area itself is inset inside a hard border and two-layer inner
shadow. FeatureManager and PropertyManager remain independently resizable, but
their backgrounds, boundary lines, title treatment, and six-pixel divider grips
now read as surrounding application surfaces. The concept strip remains a thin
bottom dock, followed by one status bar containing the live orientation, save
state, and selected feature.

The editor explicitly declares `ic-dense`. Its panel controls use the allowed
24px instructor-tool floor, reduced vertical padding, tight leading, and
hairline row separation. This exception is scoped to the Blade editor and does
not change the normal 44px student-control floor elsewhere.

No props, feature-editing operations, or persistence paths changed. The
viewport adds one optional view-name callback so the status bar follows camera
changes; its former visible in-canvas orientation label remains in the DOM only
for assistive context and existing structural verification.

The focused 62-test DOM pass covering the editor, viewport, and shared-document
mounts passed. `svelte-check` completed with zero diagnostics after
`svelte-kit sync`. Full `npm test` was run and its summary and stderr were read
separately because the runner does not encode failures in its exit status.

Live visual verification and a screenshot were attempted through the existing
`/dev/ideacad` browser harness. Chromium could not launch because this container
lacks `libatk-1.0.so.0`; therefore the docked spacing, inset-well depth,
responsive wrapping, and final rendered density could not be verified by
looking at them. Those visual decisions remain explicitly unverified.
