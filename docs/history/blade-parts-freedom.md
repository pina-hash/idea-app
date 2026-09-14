---
title: "Ledger 0255: blade and body parts become an unrestricted, independently placed collection (code only, no migration)"
date: 2026-09-14
branches: [codex/blade-parts-freedom]
migrations: []
subsystems: [ideacad, blade-model]
---

The model now has an additive `BladePartsTree` representation whose `parts` array can
hold any number of `BodyPart` and `BladePart` values in any order. Every part owns its
height (`z`), angular clocking (`angleDeg`), name, stable ID, and geometry/material
parameters. A second blade row at another height and angle, or another body section, is
therefore data rather than another feature type or a code change.

`addPart`, `deletePart`, `duplicatePart`, `reorderPart`, `movePart`, and `rotatePart` are
pure model operations. They clone before changing data, return a new tree on success,
and return named, readable refusals for malformed requests. A deterministic property-style
test runs 10,000 mixed operations and checks both the legacy feature validator and the
part-collection validator after every successful result.

**The structural rule is derived from geometry rather than appearance.** The existing
feature validator requires at least one active `revolve` because evaluation reads a body
unconditionally. No blade sketch, extrusion, pattern, or mount is independently required.
The collection therefore refuses only deletion of the last body part. Any blade part can
be removed, and any body part can be removed when another remains.

Backward compatibility is additive and lossless. `upgradeBladeParts` clones the complete
schema-1 tree, leaves its feature graph and material references untouched, and derives an
initial body part and blade row beside them. Existing readers ignore the additional
property, so stored documents still open and evaluate through the unchanged schema-1
path. A hand-written pre-change fixture proves evaluation is byte-for-byte equivalent
before and after the in-memory upgrade and proves the source tree is not mutated. No row
or stored JSON document is rewritten.

A later integration bundle must call `upgradeBladeParts` when opening a document, then
call `addPart`, `deletePart`, `duplicatePart`, `reorderPart`, `movePart`, and `rotatePart`
for authoring. It should call `validatePartCollection` alongside `validateBladeTree` until
the evaluator and renderer gain native multi-part consumption. This bundle deliberately
does not wire the editor, renderer, viewport, persistence, or evaluation path, and it
does not change any ledger-0254-owned module.
