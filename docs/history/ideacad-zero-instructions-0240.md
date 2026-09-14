---
title: "IdeaCAD feature editing becomes self-evident"
date: 2026-09-14
branches: ["codex/ideacad-zero-instructions-0240"]
migrations: []
subsystems: ["IdeaCAD"]
---

The FeatureManager no longer puts a padlock on every row. Editable rows now
carry an EDIT badge, genuinely read-only rows carry VIEW, and every row gets a
pointer cursor plus a visible hover response. Selection still opens the real
PropertyManager in one click, making the row and its useful result one action.
When no row is selected, the manager's heading is the action label “Select a
feature.”

The PropertyManager now names its Parameters region immediately below the
selected feature name and renders the named values and units before workflow or
build-order actions. The keyboard-shortcut paragraph, feature-lock explanation,
and station-limit explanations were removed. A compact FIXED FEATURE state at
the bottom puts the non-deletable fact in context instead of making it the
tree's primary signal; unavailable station actions expose their numeric bound
in the control tooltip.

Number inputs remain ordinary bordered typeable fields and now preview on input,
not only after a drag or blur. An adjacent horizontal-arrow mark, horizontal
resize cursor, and concise tooltip expose scrubbing without an instruction
paragraph. Existing range controls, units, bounds, edit callbacks, and tree
operations are unchanged.

The focused IdeaCAD DOM run reported 72 passed and 3 failed. All three failures
assert the interface this bundle intentionally removes: double-click before
opening parameters, standing prose in the tree, and standing prose in the
PropertyManager. The production code already opened parameters on one click at
the supplied branch tip, so the first assertion was stale before this bundle;
the other two directly contradict the zero-prose requirement. Tests are outside
this bundle's ownership and were not changed.

The full suite reported 9,079 passed, 14 failed, and 15 skipped. Three failures
are the same superseded IdeaCAD assertions above. The remaining failures are
outside this bundle: the live deploy-history probe cannot find the container's
`psql` executable, and the migration-applied record check reports that the
pre-existing 0215 record is absent.

`svelte-check` completed with zero diagnostics after `svelte-kit sync`. Live
verification and a screenshot were attempted through `/dev/ideacad`, but the
installed Chromium could not launch because the container lacks its host shared
libraries. The rendered hover motion, density, and final screenshot therefore
remain visually unverified.
