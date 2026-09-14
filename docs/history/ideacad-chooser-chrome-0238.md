---
title: IdeaCAD explicit chooser and command chrome
date: 2026-09-14
branches: ["codex/ideacad-chooser-chrome-0238"]
migrations: []
subsystems: ["ideacad"]
---

The standalone route now treats entry as an explicit choice point: the chooser is
open on every fresh mount, and only a click on one of the signed-in reader's listed
documents or available assignment-backed starters mounts the editor. The deliberate
zero-document state explains where future work will appear, while the independent
zero-starter state explains why a new document cannot currently be created.

The actual supplied-tree cause was not an automatic recent-document open. The route
load only lists non-archived readable rows and editor registrations, and the store is
created with `document: null`; the editor therefore was already conditional on a
choice. The fully populated object appears after choosing New because that existing,
item-keyed open path creates its first concept from `DEFAULT_BLADE_TREE`. This bundle
does not change that default because the Blade tree is owned by another lane. Keeping
`pickerOpen` initially true makes the routing contract explicit and prevents any
future eager store hydration from bypassing the choice point.

The command bar and chooser now share the editor's existing token vocabulary:
layered `--surface-*` panels, `--boundary` square edges, cyan/green state lines,
`--text-*` hierarchy, and the hero/monospace type pairing. “Exit” now reads “Exit to
IDEA.” The requested `src/lib/ideacad/ideacad.css` stylesheet is absent from the
supplied repository snapshot, so there was no file that this owned lane could import;
the app consumes the same globally registered tokens directly and does not create or
edit the forbidden stylesheet. No additional dedicated chooser-empty-state token was
available, so the nearest `--surface-1`, `--boundary`, and `--text-2` tokens are used.

The dev-only `/ideacad/preview/chooser` harness mounts the real application with
representative document and starter rows and retains the production guard. A browser
drive was attempted at 1440 by 900, but Playwright Chromium could not launch because
the container is missing its host libraries, beginning with ATK. Consequently no
screenshot or live interaction measurement is claimed.

No migration was written and the new-document tree was not changed.
