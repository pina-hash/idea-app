# 0267 Repair unionMesh edge contacts without dilation
- Issued: 2026-09-14T18:00:00Z
- By: Codex session
- Owns: `src/lib/ideacad/blade/evaluate.ts`, its tests, `docs/prompt-ledger/entries/0267-*`, `docs/history/union-mesh-edge-contact-fix.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0215
- Status: pushed
- Branch: `codex/union-mesh-edge-contact-fix`
- Notes: No migration. The tree, validator, operations, parts, materials, UI,
  viewport implementation, routes, editor, stylesheet, store and transports were
  forbidden and untouched. The solid-buffer regression test was updated because its
  old numeric ratio encoded the dilated mesh.

## What it did

`unionMesh` now repairs the precise zero-width edge-contact topology: two
face-neighbour cells diagonal in a 2x2 ring, with both other cells empty. An
ordinary sampled surface staircase has the fourth cell occupied and does not
match. Repair runs to a fixpoint under a grid-sized bound and raises if a later
positive pass is not strictly smaller than its predecessor.

The generated-tree sweep found a real repair case: a three-station, three-blade
body with its spin bolt and collar absent produces four edge-contact fills and
then reaches the fixpoint. The default tree produces none. Volume, cell count,
repair deltas and watertightness are now observable in the test, with volume as
the first acceptance boundary rather than topology alone.

## Mutation proof

The old eight-pass predicate was planted back into `unionMesh`. The focused
file reported 3 failed / 8 passed: the spread-volume assertion, real-contact
assertion and default 20.317 in³ assertion all failed. The original file was
restored byte-identically (matching md5).
