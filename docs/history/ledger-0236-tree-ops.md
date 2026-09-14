---
title: "IdeaCAD feature-tree model operations"
date: "2026-09-14"
branches: ["codex/ledger-0236-tree-ops"]
migrations: []
subsystems: ["ideacad", "blade-model"]
---

Ledger 0236 replaces the fixed-ID model assumption with backward-compatible optional
feature names and suppression state, and adds pure operations for adding, deleting,
reordering, duplicating, renaming, and suppressing features. Each operation clones before
writing and returns either a new validated tree or a typed refusal with a complete
student-readable sentence.

## Load-bearing decisions

`validateBladeTree` has only one required geometry invariant: at least one active revolve
feature must remain. That makes the body structural. Hex bosses and the
sketch -> extrude -> circular-pattern -> mount chain are free features; their reference
fields, rather than a parallel hardcoded dependency list, determine their ordering and
whether deletion or suppression is safe.

Deletion refuses when direct dependents exist instead of cascading. A single delete
should not silently erase work a student did on rows they may not currently see. The
refusal names those dependents, and the student can remove them deliberately from the
leaves upward. Suppression follows the same dependency rule, and restoration proceeds
from parents to children.

The persisted schema number remains 1. Existing documents need no rewrite because
`name` and `suppressed` are optional, defaulting to the existing ID label and active
state. No geometry math, transport, store, route, viewport, or editor code changed.

## Verification

The focused suite includes 80 deterministic seeds of 75 mixed operations: 6,000 attempted
adds, deletes, moves, duplicates, renames, suppressions, and restorations. It checks input
immutability after every attempt and calls `validateBladeTree` after every success. It
also pins structural, named-refusal, dependent-delete, dependent-suppression, and both
reorder directions directly.

The focused file passed 6 of 6 tests. The full suite reported 472 passed files and 5
failed files, with 9,078 passed tests, 12 failed tests, and 15 skipped tests. The 12
failures were all outside this bundle: two known `/ideacad` reserved-slug assertions,
seven known missing-`psql` deploy-probe assertions, and three applied-set suites refusing
because this checkout had no `origin` ref. Adding the public remote was attempted, but
the container's network proxy returned HTTP 403. `svelte-check` matched baseline exactly:
0 errors and 37 warnings in 20 files.

## Deferred integration

A later UI/evaluator bundle must call `addFeature`, `deleteFeature`, `reorderFeature`,
`duplicateFeature`, `renameFeature`, and `suppressFeature` from
`src/lib/ideacad/blade/ops.ts`, render a failed result's `message`, and persist a
successful result's `tree`. Before exposing deletion or suppression in the editor, that
bundle must also make evaluation select active features and define how geometry behaves
when a free feature is absent; this model-only bundle was expressly forbidden from
changing `evaluate.ts` or wiring the editor.
