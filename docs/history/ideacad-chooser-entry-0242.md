---
title: IdeaCAD chooser entry is an explicit session gate
date: 2026-09-14
branches: ["codex/ideacad-chooser-entry-0242"]
migrations: []
subsystems: ["ideacad"]
---

Ledger 0238 changed `pickerOpen` from false to true, restyled the chooser and command
bar, added a guarded chooser preview, and continued to decide between chooser and
canvas with `pickerOpen || !editorState.document`. It did not introduce the explicit
selection state its history claimed: the only new guard was a presentation flag, while
the editor remained fundamentally keyed to store document state. That made the claim
that future eager hydration could not bypass the chooser stronger than the code.

This bundle makes that boundary literal. A fresh `IdeaCadApp` mount starts with
`documentChosen` false, and the canvas branch additionally requires it to be true.
Only a successful click on an existing-document card or a new-document workspace sets
it. Store hydration, a remembered store document, and failed opens therefore cannot
put the canvas on the entry screen. The audit found no auto-open call in the owned
standalone route: its server load only lists documents and workspaces, and its page
only passes those rows into `IdeaCadApp`.

The chooser still lists all readable, non-archived documents and all available
assignment-backed new-document workspaces. Its no-document state is now composed with
a primary action labelled exactly “New document”; both that action and the command-bar
action move focus to the workspace choice rather than selecting a workspace on the
person's behalf.

The command bar no longer prefixes the current document title with “OPEN.” The title
is rendered only after a document has actually been chosen during this mount, so it
reads as status rather than a third action.

A browser drive could not run because the installed Chromium is missing its ATK host
libraries. Installing them was attempted, but this container's package and npm
registries returned HTTP 403. No screenshot or browser interaction claim is made.
No migration was written and no forbidden IdeaCAD editor, viewport, blade, transport,
store, UI, or stylesheet file was changed.
