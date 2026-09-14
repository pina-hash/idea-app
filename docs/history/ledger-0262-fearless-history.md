---
title: "Fearless IdeaCAD history closes divergent redo branches, names people, and reports both ends (`codex/ledger-0262-fearless-history`, ledger 0262)"
date: 2026-09-14
branches: [codex/ledger-0262-fearless-history]
migrations: []
subsystems: ["IDEACAD", "Testing"]
---

No migration. The existing action layer already represents every accepted tree
mutation as `set`, `insert`, `remove`, or `move`; its whole-tree diff is the one
capture point, including station edits, feature insertion/removal/reordering,
material, rotation, and all numeric parameter edits. The audit found no accepted
feature-tree edit bypassing that diff. It did find three history defects: a fresh
edit after Undo incorrectly left the abandoned branch redoable, unavailable Undo
and Redo controls silently did nothing, and another person's row showed an email
local-part rather than a readable name.

`foldHistory` now treats a depth-zero action newer than an outstanding inverse as
a branch divergence. The inverse rows remain in the append-only audit record, but
Redo is unavailable and the fold exposes that it was discarded. The timeline
uses that fact to say explicitly that the new change started a different path.
The same live region says "There is nothing to undo" at the origin and "There is
nothing to redo" at the newest state; the controls remain focusable and expose
`aria-disabled` rather than becoming silent disabled elements.

Actor storage remains unchanged and no identity migration was introduced. The
reader's rows still say "You"; another school address with a dotted, underscored,
or hyphenated local part is rendered as title-cased name words. Ambiguous local
parts still fall back to the full address rather than merging two people, and
system-authored rows remain labelled system.

The randomized property test drives 75 deterministic streams of 20 to 119 edits,
undoes each stream until the origin is reached and compares the tree exactly,
then redoes to the end and compares the exact final tree. The focused suite also
covers all four action kinds through the existing realistic corpus and now pins
the divergence flag and both visible boundary messages.

No browser harness file was changed because ledger ownership forbids routes and
the existing real-component DOM mount exercises the timeline interactions. The
full repository test and Svelte checks are recorded in the completion report.
