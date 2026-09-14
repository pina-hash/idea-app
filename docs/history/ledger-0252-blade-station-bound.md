---
title: "Ledger 0252: the 3-to-8 blade-body station bound is real and enforced at the model mutation boundary; a segment representation is designed but deferred (code only, no migration)"
date: 2026-09-14
branches: [codex/ledger-0252-blade-station-bound]
migrations: []
subsystems: [ideacad, blade-model]
---

**Finding: the bound already existed, but it was possible to bypass.** The production
sixteen-station body cannot have been produced through the editor's Add control: that
control stops at eight. `validateBladeTree` also reported any count outside 3 through 8,
but schema-1 stores `stations` as an ordinary JSON array, and callers can construct or
replace that array without invoking either control or validation. Evaluation likewise
iterates whatever array it receives. The screenshot is therefore evidence of a tree
created or rewritten programmatically (or loaded despite validation), not evidence that
the validator accepted sixteen stations. The defect was a missing model mutation
boundary: the only station add/remove helpers lived in the UI feature model.

The model now names `MIN_BODY_STATIONS = 3` and `MAX_BODY_STATIONS = 8` once. Both
validation and the new immutable `addBodyStation` / `removeBodyStation` operations use
those constants. Addition refuses before cloning or splicing when eight stations already
exist; removal similarly refuses at three. The operation then runs full-tree validation,
so an inserted station whose height does not strictly increase is refused too. Tests
construct the reported sixteen-point shape directly and prove validation rejects it, then
exercise additions through eight and prove the ninth is refused without mutation.

**No geometry was collapsed.** In particular, the ten reported consecutive stations at
radius 0.7 remain ten stored stations. This bundle neither deduplicates them nor changes a
loaded student's work. Existing invalid documents remain diagnosable rather than being
silently repaired.

## Deferred design: profile segments

A profile wants an explicit segment vocabulary if the editor is to distinguish design
intent from sampling density. The smallest forward format would keep stations as named
endpoints and put one segment between each adjacent pair, for example
`segments: [{ from: 0, to: 1, kind: 'line' }]`. A curve needs parameters as well as a
label: an arc could store radius/centre or bulge, while a spline would need control points
and a declared interpolation rule. Index references are compact but fragile under insert
and reorder; stable station IDs plus `from`/`to` IDs cost more bytes but make edits and
history comprehensible. The invariant would become one connected, ordered path with
exactly one segment joining each consecutive endpoint, rather than today's implicit
straight frustum between every adjacent pair.

Evaluation would tessellate curved segments at a documented tolerance for preview and
would integrate their solids of revolution for mass and inertia. Picking and history
would name segments as first-class entities. Validation would check connectivity,
nonzero span, supported curve parameters, monotonic z where the manufacturing model still
requires it, and a complexity ceiling on authored segments rather than sampled points.
A line between two endpoints would finally express the work now represented by ten equal-
radius stations; it would not infer that intent by deleting points.

Stored schema-1 documents can migrate forward without loss: each adjacent station pair
becomes an explicit `line` segment, preserving every endpoint and therefore preserving
geometry exactly. That is a deterministic schema-1 to schema-2 reader conversion and can
initially remain in memory, with schema-1 writes continuing until a separately authorized
migration exists. The reverse is exact for lines but not generally exact for arcs or
splines unless they are tessellated, so once curved authoring ships schema 2 must be the
canonical write format. No database migration is inherently required because the tree is
JSON, but changing the document schema, every reader, and compatibility promises is still
a migration of stored document format and is deliberately outside this bundle.

The cost is substantial: tree types and codecs; validator and operation invariants;
frustum/general solid-of-revolution math; deterministic curve tessellation; feature-tree,
property-manager, preview, viewport and picking work; history/diff sentences; fixtures;
round-trip and physics tests; and an explicit tolerance policy so mass does not change
with zoom. Collaboration also needs stable segment identity so concurrent edits do not
address shifting array positions. A straight-only first stage lowers the geometry cost
but gives little capability beyond making implicit edges explicit; curves are where the
model earns the added format complexity.

**Not done:** no segment type, no automatic simplification, no schema conversion, no UI
wiring, no stored-document rewrite, and no migration.
