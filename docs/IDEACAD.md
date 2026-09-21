# IdeaCAD

This document owns IdeaCAD's product scope. It separates Mr. Pina's decisions
from what the repository happens to implement today. Implementation is evidence,
not permission to infer the unanswered product decisions listed at the end.

## Direct modeler rewrite, 2026-09-15

Alejandro explicitly adopted Product Specification v1 and Addendum A as the
instructions for the rewrite. The addendum takes precedence. New documents are
standalone, empty exact-solid documents, with IdeaBlade disabled. The eight-row
blade generator remains a compatibility reader for existing work, rather than
the model for new work. The full product acceptance test is still outstanding.

### Kernel decision and measured spike

Choose **Remus**, pinned to its frozen WASM compatibility artifact at
`9307e73d880ed824b2b62e44c4a1beb9d5d7b787`, behind an application-owned adapter.
This is an unpublished snapshot, not a claimed stable upstream release. Its
direct face operation and construction journal fit the product better than an
application that emulates each local edit with booleans. Keep exact B-rep bytes
as the durable geometry; generated meshes are projections. All kernel work runs
in a Web Worker. Persist the encoding revision so upgrades cannot reinterpret
old documents silently.

Measurements on this Windows workstation (Intel i9-10900K, Node 26.2.0, Chrome
152.0.7977.84, localhost, fresh browser context) use a 4 × 3 × 1 inch box minus
a radius-0.5 through-cylinder. Expected volume is `12 - pi/4`, or
11.2146018366 in³. Both kernels returned one valid solid with that volume; a
40-inch top-face push returned 459.7986753007 in³ and preserved selection.

| Measure | occt-wasm 5.0.0 | Remus pinned artifact |
| --- | ---: | ---: |
| WASM raw bytes | 22,226,346 | 8,315,198 |
| WASM Brotli-11 bytes | 4,902,428 | 2,047,764 |
| Worker kernel initialization | 78.2 ms | 31.7 ms |
| First browser cylinder subtraction | 72.1 ms | 60.0 ms |
| Warm browser drag, representative range | 19–29 ms | 4.7–7.8 ms |
| Selection correspondence | Custom unique planar correspondence | Native construction provenance |

The spike renderer submitted warm frames in approximately 8–14 ms, with a
72–83 ms first shader/render cost. Those are CPU-side submission times, not GPU
completion measurements or proof of 60 fps on school integrated graphics.
Download times over a school network and novice-user testing remain unmeasured.
The harness uses real pointer selection and drag, checks painted pixels with
preserved drawing buffers, and captures 1440px and 375px screenshots. Its source
is `tools/ideacad-kernel-spike`; evidence is in `docs/ideacad/kernel-spike`.

The Remus runtime trials also passed a non-blade L-bracket with a drilled hole
and concave fillet, chamfer, shell, revolve, analytic arc extrusion, patterns,
mirror, and scale. B-rep save/reload preserved the selection journal. A push
through the opposite wall was refused without changing the original solid.
Two adapter requirements emerged: normalize inner sketch winding, and compute
per-face shading normals because the shared export mesh averages sharp corners.

Neither tested facade exposes arbitrary edge and vertex movement. The adapter
now moves qualified edges and vertices by rebuilding adjoining planar support
surfaces, and pushes planar/cylindrical faces. Curved local deformation remains
unsupported and returns a refusal. This is not a general surface editor.

Alternatives: occt-wasm has strong exact construction but lacks a direct local
face/edge/vertex editing facade. brepjs does not fill that gap. OpenCascade.js's
tested beta WASM was 50,305,130 bytes raw and 9,847,550 Brotli. Manifold is much
smaller but uses mesh geometry; its face/OriginalID attribution exists, contrary
to the addendum's categorical claim. The quoted claim that its author rejected
real-time use could not be verified and was not used in the choice.

Primary references: [Remus API](https://github.com/esaueng/remus/blob/9307e73d880ed824b2b62e44c4a1beb9d5d7b787/crates/wasm/pkg/remus_wasm.d.ts),
[Remus release policy](https://github.com/esaueng/remus/blob/9307e73d880ed824b2b62e44c4a1beb9d5d7b787/docs/production-readiness/fork-maintenance.md),
[OpenZCAD architecture](https://github.com/esaueng/OpenZCAD/blob/main/architecture.md),
[occt-wasm facade](https://github.com/andymai/occt-wasm), and
[Manifold attribution](https://manifoldcad.org/docs/jsapi/classes/manifold.Mesh.html).

### Mouse contract for the rewrite

| Gesture | Result |
| --- | --- |
| Middle down + drag | Orbit about the point raycast at down; capture it once |
| Middle down on empty space | Use the view-plane point through the current target |
| Upward middle drag | Show the underside; preserve the existing horizontal sign |
| Ctrl + middle drag | Pan |
| Shift + middle drag | Zoom |
| Wheel | Zoom toward the cursor |
| Ctrl + Alt + middle drag | Unbound; camera-edit mode is outside this scope |
| Alt + middle drag | Unbound; no verified binding adopted |
| Right click | Suppress the browser context menu inside the viewport |

The owner's down-and-drag pivot preference takes precedence over SOLIDWORKS'
documented click-entity-then-drag refinement. Sources:
[SOLIDWORKS view controls](https://blogs.solidworks.com/products/solidworks/how-do-i-manipulate-my-model-view-let-me-count-the-ways/) and
[middle button documentation](https://help.solidworks.com/2024/English/SolidWorks/sldworks/r_Middle_Mouse_Button.htm).

### Preservation and unresolved domain input

Keep existing student rows unchanged and open them with their recorded format.
Use additive schema changes for standalone documents and a compare-and-swap
save that checks the stored revision while holding a row lock. Production
migration application remains Alejandro's action. Preserve deliberate archive
and instructor reachability from decision 29; leaving a section must not delete
work. The collar-height relationship is unspecified in Addendum A and has been
asked of Alejandro; the invented 10% clamp is not adopted.

## Feature graph, 2026-09-21

Ledger 0273 turned the direct modeler's document from a list of bodies into a
FEATURE GRAPH: an ordered, re-playable list of features, each recording its
command, its parameters and what it consumed, so editing a number replays the
model from that feature forward. Everything below is what was built, why, what
was measured, and what was left undone. The code is `src/lib/ideacad/solid/`;
the storage is migration `0217_ideacad_feature_graph.sql`.

### The graph is a linear list with an implicit dependency DAG

A document (`ideacad-solid-v2`) stores `features: Feature[]` in tree order.
Each feature is `{ id, name, type, suppressed?, ...parameters }`; a parameter
that names something another feature made is a REFERENCE (`FaceRef`,
`EdgeRef`, `VertexRef`, a sketch feature id, a reference-plane feature id, a
body id) and never a copy of geometry. The dependency graph is derived from
those references (`featureDependencies` in `features.ts`), not stored, so it
cannot drift from the parameters.

Linear-with-derived-DAG was chosen over a stored DAG for three reasons. A
student reads a tree, not a graph: "what happens if I change this" is answered
by the rows below it. Replay order is then a property of the list and needs no
topological sort that could disagree with the order on screen. And reordering
is a validated move rather than a re-wiring: `reorderRange` says how far a
feature may move without passing something it depends on or something that
depends on it, and the reducer refuses anything outside that range with a
sentence naming the feature in the way. What a DAG would have bought, running
independent branches in parallel, the kernel cannot use: it is one WASM
instance on one worker thread.

The engine (`engine.ts`) replays through one kernel and keeps a KERNEL
CHECKPOINT after each of the newest `CHECKPOINT_WINDOW` (12) features, plus the
document's body and reference tables at every feature. An edit to feature k
restores the checkpoint after k-1 and runs k..n. A feature that fails is
SKIPPED, not fatal: its row carries `status: 'error'` and the kernel's own
sentence, the kernel is restored to the checkpoint before it, and every later
feature still runs. One that depended on the failed feature fails in turn with
a lost-reference sentence naming what it needed, which is how a document with
a broken fillet still opens and still renders everything else.

Every edit is one `SolidCommand` through one reducer (`commands.ts`): add,
set, remove, move, suppress, rename, body metadata, add-on state, title. A
drag is a gesture whose every frame is a `set-feature` on a feature created at
the gesture's start, so a drag costs one kernel operation per frame on the
last feature exactly as the 2026-09-15 modeler did.

### Topological naming: the scheme and when it breaks

The scheme is stated once in `naming.ts` and is repeated here because every
reference a student makes rests on it.

**Tier 1, construction names.** Every face is named when it is created, by
the feature that created it, deterministically from the feature id and the
face's role: an extrude names `<fid>.start`, `<fid>.end`, `<fid>.side.<i>` and
`<fid>.hole.<h>.<i>` where `<i>` is the index of the profile edge that swept
the face, in the sketch's own entity order; a revolve `<fid>.rev.<i>` plus caps
under 360 degrees; a saved body `<fid>.face.<i>` in the order of its bytes; a
fillet `<fid>.blend.<A>|<B>` from the two faces it runs along (the two sharing
the most edge length with it, so a fillet down a box edge is named by the two
sides and not by the end caps it also touches); a chamfer `<fid>.bevel.<A>|<B>`;
a corner patch `<fid>.corner.<A>|<B>|<C>`; a shell's inner face
`<fid>.inner.<source>`. Names carry the feature id, so a boolean merging two
bodies cannot collide two names. Names ride through every journaled kernel
operation (`propagateAttributesForOp`), which is what lets a face keep its name
through a push, a cut, a fillet on a neighbouring edge or a boolean. An edge is
named by the sorted pair of faces it joins (`edge:<A>|<B>`), a vertex by the
sorted set of faces meeting at it. **It breaks** when a face genuinely has no
construction role: a face the kernel created in an operation whose carrier
rules cannot place it. Those fall to tier 4.

**Tier 2, ordinals.** When one name lands on more than one face (a slot cut
through a top splits it into two, both carried as `<fid>.end`), the pieces get
`<name>~<k>` by the lexicographic order of a stable anchor (the average of the
face's vertices); two edges joining the same two faces get `#<k>` by midpoint.
**It breaks silently** when an upstream edit moves the pieces past each other:
a slot dragged from the left half of a plate to the right swaps which piece is
`~0`, and a fillet on `<fid>.end~1` lands on the other piece with no error,
because the name resolves. That is why tier 3 is recorded for every reference
and checked even when the name resolves.

**Tier 3, geometric hints.** Every reference stores the surface kind, anchor,
normal and area of the face it was made on (`FaceHint`, `EdgeHint`,
`VertexHint`). When a name no longer resolves, the hint is matched against the
current faces within tolerance: a UNIQUE match re-attaches the reference and
the feature row says so as a WARNING naming what it did; an ambiguous match (a
symmetric part has two faces with one signature) or no match is an ERROR
naming the reference, and the feature is skipped rather than guessed. When the
name resolves but the hint disagrees, the row warns. **It breaks** when the
face genuinely moved: a hint is a picture of the past, so a face pushed two
inches after the reference was made no longer matches its own hint and the
reference has to be re-picked.

**Tier 4, nothing.** A face nothing above named is `<fid>.face.<k>` by anchor
order and COUNTED; `NamingReport.fallback` says how many faces in a replay
rest on ordinals, which is the number to watch.

**What is deliberately not done.** A stored feature is never rewritten to
repair a reference: a repair that changes somebody's saved feature during a
load is a silent edit of their work, so the warning stays until the student
re-picks. The kernel's own `captureSignatureRef` / `resolveRef` were not used
for tier 3: they bind to a session's journal op ids, which do not survive a
replay from bytes.

**How a broken reference reports itself.** `lostReference(kind, what)`,
`ambiguousReference(kind, what, count)` and `reattachedReference(kind, what)`
in `naming.ts` are the three sentences, and they land on the feature's own row
(`FeatureRow.message`, status `error` or `warning`). The row is selectable,
its parameters open, and the reference can be re-picked. Nothing throws out of
a replay, and nothing builds a wrong face silently in the tiers that can tell.

### Replay cost, measured

`tests/ideacad-solid-features.test.ts` builds a forty-feature document (a box
and thirty-eight pushes) and prints the cost on every run. On this container
during the 2026-09-21 session, with two other processes sharing four cores:

| Edit | Replays from | Replay |
| --- | ---: | ---: |
| feature 1 (the extrude, 39 features below it) | 0 (the base) | 80.9 ms |
| feature 7 | 0 (outside the window) | 93.7 ms |
| the last feature | 39 | 4.2 ms |
| the oldest feature inside the window | 0 | 111.5 ms |

An unloaded run earlier in the session measured 63.2 ms for the deep edit and
3.0 ms for the last feature. The arithmetic behind the window: a kernel push
costs about 5.4 ms and a cut about 1.9 ms at the median (the 2026-09-15 spike),
so replaying thirty-nine features is order 60 to 100 ms, which is one dropped
frame, once, at the moment a deep number changes; a drag on the newest feature
stays at one operation per frame. A checkpoint is a clone of the kernel arena:
kernel memory grew from 2.8 MB to 25.0 MB across the forty-feature build with
the window holding twelve checkpoints, and an earlier reading with a
checkpoint after every feature (26 held) reached 17.6 MB on a smaller
document. The decision: cache the newest twelve features' checkpoints, replay
from the base for anything deeper, and report `replayedFrom` and `replayMs` on
every projection (the dev harness shows them) so the number is a reading. The
kernel cannot discard one checkpoint (discarding any checkpoint drops every
later one, measured), so the stack is compacted by rebuilding from the base
once it has grown past twice the window.

### Backward compatibility: a saved body is a `body` feature

Every document saved before the graph (`ideacad-solid-v1`, bodies with no
feature list) opens unchanged. `upgradeManifest` turns each saved body into one
`{ type: 'body', bodyId, artifact, source: 'legacy' }` feature, so it renders
identically (the same bytes), keeps its name, material, role and mass, and can
be pushed, blended, mirrored, patterned and mated like any other body. Its
first save from the new client carries the upgrade as ordinary history actions
diffed from the stored version 1 tree, so 0209's action log replays across the
boundary and an undo can cross back. A version 1 sketch drawn on an arbitrary
face becomes a sketch feature on a `fixed` plane held by value. What such a
document cannot do is what it never could: the operations that made its bodies
are not on record, so they cannot be edited as parameters. The document
validator in 0217 accepts both formats and refuses a version 1 tree that
carries a feature list, so version 1 stays exactly version 1 for the deployed
client until this one ships.

### Storage: migration 0217

One file, applied by hand before the client is merged: the validator widened
to two formats; a TRASH for a student's own unlinked models (thirty-day window,
restore, a real purge through the preserve trigger, and no trash path at all
for a document linked to an assignment, per decision 29); folders, tags, a
rename that writes a history row rather than editing the stored tree behind
the log's back, duplicate, and a thumbnail the workspace stores after each
save. Every function revokes from `public, anon, authenticated` by name (0166
shape). `tests/db/ideacad-feature-graph-storage.test.ts` seeds four documents
through 0216's real functions, applies 0217 over them, and proves the list
exclusion and the expiry sweep with positive controls.

### The ten surfaces

<!-- FILL:SURFACES -->

### What is now possible, and what is not built

<!-- FILL:POSSIBLE -->

## Current implementation

`/ideacad` opens its chooser. Any signed-in user can create an empty standalone
document. The classroom item links to the app; it no longer creates a legacy
blade automatically. IdeaBlade is off for every new document.

- **Geometry:** `solid/engine.ts` owns exact solids in a Web Worker. Face names
  survive supported edits through the kernel journal; split faces receive new,
  distinct IDs. Edge/vertex selections use the body topology epoch and incidence
  handles. Tessellated meshes are disposable viewport/export projections.
- **Modeling:** line/rectangle/circle/polygon/arc sketches, extrusion and cuts,
  revolve, fillet/chamfer/shell, direct face edits, qualified edge/vertex edits,
  transforms, mirror, linear/circular patterns, and multi-body Booleans.
  Tools have icons and short hover descriptions. Typed values appear at the
  cursor. Rule limits never become geometry clamps.
- **Storage:** migration 0216 makes assignment linking optional, adds a format
  discriminator, copied assignment context and immutable hash-addressed BREP
  artifacts. Existing feature trees stay `blade-v1`; new manifests are
  `ideacad-solid-v1`. Unknown kernel encodings refuse to open.
- **History:** every accepted gesture is one durable operation. Undo and redo
  append attributed inverse actions, and survive closing/reopening the app.
  Writes require an exact revision; UUID receipts make uncertain retries
  idempotent. A newer remote edit produces a conflict instead of an overwrite.
  Save recovery offers a backup and an explicit discard-and-reopen confirmation.
- **Sharing:** private by default, named viewers/editors, captured instructor
  authority after assignment linking, deliberate archive/restore, and class
  reference sharing of archived models. Classroom deletion cannot cascade away
  new solid documents. New clients discover other editors' changes on reopen;
  automatic live refresh is not implemented.
- **Exports:** 3MF is first, STL remains available, and DXF exports a selected
  sketch or planar face with analytic lines, arcs and circular holes in mm.
  `.ideacad` backups contain the manifest and original BREP bytes. Import is
  undoable, checks hashes/units/structure, and preserves the open model on failure.

### Administrator controls

Site admins can open **IdeaBlade limits** in the chooser, or **Edit limits** in
the model's IdeaBlade panel. There are minimum and maximum fields for diameter,
body height, assembly mass and hex extension. Empty means no bound. These are
the eight numeric values used by the automatic checks. Ordinary teachers do not
gain this global permission merely by managing a class.

Saving appends a rules revision and records the admin. A stale settings window
cannot overwrite newer settings. Open modelers refresh rules on focus and once
per minute, and read fresh settings when the dialog opens. Changing a threshold
changes the verdict without editing geometry or document history.

### Part mass and approved density sources

Alejandro's later instruction limits density references to **MatWeb and Bambu
Lab**, and supersedes the previous generic printed-plastic/fill calculation.

In **Objects → body → Material**, printed PLA, ABS, HIPS, TPU and Other have no
bulk density. Enter the finished part's **Bambu Studio estimate** or **scale
measurement** in grams. Exclude supports, purge, brim and other removable
material. A geometry change clears the entered mass; moving or rotating the
unchanged part preserves it. Changing material clears the old override/source.

The four stock reference choices use the cited MatWeb values: 6061-T6/T651
aluminum 2.70 g/cm³, AISI 1018 carbon steel 7.87, annealed 304 stainless 8.00,
and Makrolon ET2613 solid polycarbonate 1.20. The catalog links directly to each
record. MatWeb's indexed records supplied these numbers; direct pages blocked
automated full-page retrieval. They are reference estimates, not certificates
for unidentified shop stock. Generic carbon, stainless, galvanized and unknown
steel, and unidentified polycarbonate, stay unverified. A measured mass can be
entered for any body.

Bambu Studio's source distinguishes model filament from support/purge categories,
but a plate subtotal can still include brim/skirt. No automatic slicer integration
or inferred effective density is claimed. Reference:
[Bambu Studio filament accounting](https://github.com/bambulab/BambuStudio/blob/56e0ee35f0e720ba6819ec2395a17e679aa95751/src/slic3r/GUI/GCodeRenderer/BaseRenderer.cpp#L1850).

Assembly mass is unknown until every part has a supported value. Slicer and
stock-density results say **Estimate**. Center of mass, inertia and radius of
gyration are calculated only when every body's mass distribution is supported
by a uniform stock reference; a printed/measured total alone cannot establish
its internal distribution. Legacy geometry remains readable, but the website
shows its unsupported mass/physics as Unknown and exports those values as null.
The old closed-form arithmetic remains testable for historical interpretation.

### Limits of the current tools

The polygon tool draws six sides; the arc tool creates a closed arc-and-chord
profile. Revolve uses the sketch's vertical axis. Linear patterns use world X;
circular patterns use world Z with full-circle spacing. Mirrors use the selected
origin plane. General mixed-curve sketch editing, arbitrary local edits on curved
edges/vertices, and free placement of pattern/revolve axes are not implemented.
The standard-parts check reports **Manual inspection**; unknown launcher-fit and
collar-height rules are not invented. Body roles identify hex core and other
hardware for the advisory measurements.

Diameter is the swept diameter about origin Z from a mesh with known tolerance;
near-limit results are Unknown. Height excludes bodies marked Hex core. Hex
extension is measured above the other bodies' top. Students must orient the
assembly and assign roles consistently with those definitions.

## Verification and release

The local run passed **72 IdeaCAD files / 1,077 tests**, including real kernel
operations, persistence, permissions, failure recovery and legacy compatibility.
The complete repo run also exposed unrelated Windows/line-ending/Node failures;
all 39 affected non-IdeaCAD files were compared against the original baseline.
See [verification](ideacad/verification/README.md) and the
[real-database browser report](ideacad/verification/BROWSER_VERIFICATION.md).

The novice student's five-minute cold test, school integrated-GPU 60 fps target,
school-network behavior and deployed authentication are
still unverified. Local tests and screenshots do not substitute for those checks.

Alejandro confirmed manual application of migration 0216 on 2026-09-15 and
supplied its **27 readiness rows, all true**, then authorized release to main.
The [application record](migrations-applied/0216-ideacad-direct-modeler.md) is
based on his report; this task did not connect to or write the production database.

The prior product record, including the numbered decisions and older schema
limitations, is preserved in [legacy-product-record.md](ideacad/legacy-product-record.md).
The adopted [v1 specification](ideacad/specifications/IDEACAD_SPEC_v1.md) and
[addendum](ideacad/specifications/IDEACAD_SPEC_ADDENDUM.md) are retained verbatim.
