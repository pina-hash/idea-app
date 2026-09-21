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

The ten surfaces were built in parallel by ten agents, each owning its own
files, against the spine above; every request they had of a shared file
(`SolidWorkspace.svelte`, `viewport.ts`, `features/core.ts`, `engine.ts`) was
applied afterwards by one writer, which is how the spine's rules survived ten
hands. Each row says what the surface got, in the surface's own measured
numbers, and what it deliberately did not.

**1. The design tree** (`FeatureTree.svelte`, `FeatureParams.svelte`,
`tree/rows.ts`, `tree/params.ts`). Every feature in tree order with a status
glyph AND a word, its summary, its type, and its message on its own row only
when it has one. A row press selects the geometry the feature made and then
the feature. Beneath the list, `FeatureParams` edits the full feature off the
manifest: number fields are `type=text inputmode=decimal` with no `min`, `max`
or `step`, and -3.5 and 1e6 go out as typed (a distance of 0 is refused by the
KERNEL's own sentence, `Pull the sketch to give it depth.`, and the box is
re-synced from the manifest). Rename inline, reorder by Up/Down or drag,
suppress, delete, and every refusal is the reducer's own sentence obtained by
running the real `reduce` (`refusalFor`), never restated. Up, Down and Delete
are `aria-disabled` with the reason written under them. At 375 the tree is the
workspace's slide-over behind the Tree toggle. Left out: re-picking a broken
reference from the form (a viewport gesture), touch drag (the 44px buttons are
the phone path), shift-click multi-select.

**2. Dimensional control** (`viewport/readout.ts`, `dimensions/model.ts`,
`DimensionPanel.svelte`). A drag reads at the pointer with its unit
(`Extrude 1.208 in`, `2.286 x 0.175 in`, `Rotate 90.0 deg about Z`), sixteen
pixels right and below it, which `tools/browser-verify`'s `readoutNearPointer`
check now measures on the real page. `parseDimension` accepts `1.5`, `1 1/2`,
`3/8`, `2in`, `2"`, `25.4mm` (stores exactly 1), `45deg`, `150%`; it refuses
`abc`, `1/0`, `1,5` and a unit from the wrong family, each with a sentence. A
DRIVING value (a feature parameter, a sketch constraint) is typed and made
true by the replay or the solver; a DRIVEN value (a length, an area, a volume)
is shown beside the word `measured` and is never editable, because an editable
driven value would mean guessing which driving value to move. Left out: a
native number picker (there is none, on purpose).

**3. Reference geometry** (`features/reference.ts`, `ReferencePanel.svelte`,
`viewport/reference-layer.ts`). Planes, axes and points FROM geometry (a flat
face, a round face's axis, an edge, two corners, an edge middle, a face
centroid, a body centre) and BY construction (offset, angle about an axis, mid
plane, three points, two planes meeting, axis meeting plane, coordinates). The
panel decides nothing: `referenceOffers` is one pure function answering every
construction as ready (the feature plus the sentence) or not (the reason), and
the panel renders the list verbatim. A face's centre is its AREA CENTROID
(`faceCentroid` over the tessellation), not the vertex average, which on a
round cap sits on the rim. References follow the topology by name and report a
lost one on their own row; a revolve, a pattern and a mirror name a reference
and follow it. Datum planes are a module-level setting with a listener, drawn
unpickable. Left out: hover emphasis in the viewport (no hover pipeline), a
point-normal plane button.

**4. Mates** (`features/mate.ts`, `mates/*.ts`, `MatePanel.svelte`,
`viewport/mate-preview.ts`). All six kinds (coincident, concentric, parallel,
perpendicular, distance, angle) over faces, edges, corners and references,
solved sequentially in tree order within the freedom earlier mates leave. The
solver is pure and the kernel is touched twice (frames read once, one
transform per moved body); the step is damped Gauss-Newton in dual form over a
numeric Jacobian, because the primal normal equations amplified
finite-difference noise in the free directions. Over-constraint is three
sentences and a restored pose: `already hold it in place`, `conflicts with
Mate 1` (naming exactly the earlier mates whose removal would free it), `adds
nothing`. A fixed body never moves. Each body's remaining freedom is the null
space of the accepted rows, named per world axis (`slides along Z, turns about
Z`) and projected as `BodyProjection.freedom`. The magnetic auto-mate during a
Move drag (`matePreview`, 0.15 in) snaps facing planar faces or parallel
cylinder axes, draws the outlines as guides, and commits a real mate feature on
release unless Ctrl is held. Left out: sphere faces (mate as a point,
untested), a large-model timing.

**5. Sketching** (`SketchEditor.svelte`, `sketch/editor.ts`,
`sketch/model.ts`, `viewport/sketch-layer.ts`). The open sketch is an editable
collection: draw (line chains sharing points, rectangle, circle, polygon with a
typed side count, three-click arc), select, drag-move, join by dropping a
point on a point, trim, extend, corner fillet (two tangent constraints, so a
later dimension keeps the corner round), delete, constraints and dimensions
offered from the selection, and region ticks for extrude. Every edit is ONE
`set-feature` carrying the whole entity and constraint list, built from the
SOLVED entities, and the editing look rides `api.guide`. The pick rule: a
point within the pick radius wins outright over every curve. Left out: splines
(the kernel's 2D solver has no spline entity), dimension VALUE text drawn in
the viewport (guides are polylines; the number lives in the panel), extending
an arc, a rubber-band selection.

**6. Blends and the other features** (`features/blends.ts`,
`features/extra.ts`, `features/holes.ts`, `features/options.ts`,
`FeaturePanel.svelte`, `MeasurePanel.svelte`, `SectionPanel.svelte`). Fillet of
several edges through one feature, face-to-all-its-edges, tangent propagation
(`tangentChain`, walked in code because the kernel has no tangency query),
asymmetric and angle chamfers (the kernel's conventions MEASURED and pinned,
never corrected in code), variable-radius fillet, shell with per-face
thickness on flat faces, a hole feature with a SOURCED size chart (ASME
B18.2.8 clearance, UNC and metric tap drills, each figure naming its source),
draft, sweep along a sketch chain or model edges, ruled loft. Rib is refused
honestly in a sentence (the kernel cannot extend an open sketch to the body).
Smooth loft through three or more profiles returned a negative volume in this
kernel build and is refused in words. Measure reports a word, a number and a
unit with a witness line; Section clips on a datum, a reference plane or a
selected flat face.

**7. Materials and colour** (`BodyProperties.svelte`, `advisory.ts`,
`appearance.ts`). Every stock material carries a colour (required, so no
material can silently draw as machined stock); a body can override it from a
palette of eight named swatches or a typed hex; `describeAppearance` says which
rung applies in words. THE DENSITY CITATION DISCIPLINE IS UNCHANGED:
`hasCitedDensity` is the one predicate, `bodyMass` calls it, a cited material
shows its number and its MatWeb link, an uncited one shows the Unverified chip,
no number and `Mass: Unknown`, and the four cited densities are pinned by a
test against the pre-edit bytes. No material was added, because none could be
sourced from this container. Fixed-for-mates is a labelled checkbox here.

**8. Storage and the launch page** (`transport.ts`, `launch/*`,
`LaunchPage.svelte`, `DocumentCard.svelte`, `TrashList.svelte`,
`DirectDocuments.svelte`, `/ideacad`, `/dev/ideacad-launch`). The front door
lists a student's models as cards (title, thumbnail, feature and body counts,
last edit, owner, role word, assignment and folder chips, tags), grouped and
searchable, with folders, tags, rename, duplicate, archive and the trash.
Archive and trash are two sentences that differ on purpose: archive keeps a
model readable and listed; the trash names the document and says it goes for
good after thirty days. A document linked to an assignment shows decision 29's
sentence in place of a trash control, because 0217 refuses it and a control
whose only outcome is a refusal is not offered. A `PGRST202` on any 0217
function degrades to one sentence (`STORAGE_UNAVAILABLE`), so a deployment
between 0216 and 0217 renders the list with the rail saying why filing is not
offered. Left out: thumbnail GENERATION (the RPC exists; the workspace does
not yet render one), hiding an owner's tags from a grantee.

**9. Add-ons** (`addons/registry.ts`, `addons/ideablade.ts`,
`AddonPanel.svelte`). An add-on is `{ id, name, description, tools, starters,
references, advise? }` and NEVER-RESTRICT IS A TYPE-LEVEL PROPERTY: each
interface's key set is pinned to an exported member list by an `Exact<>`
assertion, the only function-valued members are `run`, `advise`, `steps` and
`step`, and a tool's only door into the document is `api.apply` with the same
commands a student's press sends. A hook that ran before a base command, or
returned a verdict, cannot be added without editing the lists. IdeaBlade
contributes four tools (hex core, collar, spin bolt, body profile), one
starter (the default part: eight features, four bodies with roles) and three
references, every default cited to `blade/tree.ts` or `blade/evaluate.ts` and
every one typed. Left out: a blade-plate tool; one-step undo of a tool run
(each step is its own history row, labelled with the add-on's name).

**10. Part movement** (`viewport/triad.ts`, `viewport/drag-math.ts`,
`MovePanel.svelte`). A real triad at the selection's centre: three arrows with
letters, three plane squares, three rotation rings and a centre free-drag
sphere, hit-tested by invisible fatter twins (a ring's target is a FLAT
annulus, never a torus, because from a top view a torus tube steals the press
meant for the arrow beneath it). Axis, plane, free and ring drags are one pure
function; a 90-degree sweep on the Z ring turned a 4x3x1 box into 3x4x1 with
its centre unchanged. Alt divides a handle drag by ten. Snapping to references
and other bodies' corners within 12 screen pixels is a setting, off by
default, and Ctrl skips it for one drag. The panel types an offset or an angle
as the SAME `transform` feature a gesture makes. The engine's transform
executor now copies (`copyAndTransformSolid`) so undoing a move puts the body
back, which the previous in-place transform did not.

### What is now possible, and what is not built

**Now possible.** A student can build a part as a sequence of editable
operations and change any number in it later; sketch on a face and have the
sketch follow that face when the part beneath it changes; make reference
planes, axes and points from geometry or by construction and revolve, pattern
and mirror about them; place two bodies against each other with named mates
and see how much freedom each has left; round, bevel, shell, drill, draft,
sweep and loft; type any dimension in inches, millimetres or fractions; move a
part with a triad or by typed numbers and undo it; file, tag, rename,
duplicate, archive and trash documents from a front page; open every document
saved before this bundle unchanged. The acceptance model (a motor bracket, its
bolt hole sketched on the flange's top face, an axis from the hole, a pin
mated concentric to it) is in `docs/ideacad/verification/0273/`: editing the
bracket's depth through the tree rebuilt seven later features, and changing
the flange thickness in the FIRST sketch rebuilt all eight with the hole, the
axis and the mate intact, in about 20 ms.

**Not built, and why.** Rib (no extend-to-body in the kernel). Splines (no
spline entity in the kernel's 2D solver). Smooth loft through three or more
profiles (a negative volume from this kernel build). Multi-body boolean
between two feature-made bodies is the existing `boolean` feature and was not
widened. Thumbnails are stored by an RPC nothing calls yet. Assemblies are ONE
file: a mate names two bodies in the same document, and a part reused across
documents is a duplicate, not a link. A hover pipeline in the viewport. A
sketch dimension's value drawn beside the geometry. Touch drag in the tree.
The advisory's `bodyParts` definition disagrees with `blade/evaluate.ts` about
what `Hex extension` and `Body height` measure (the add-on starter's defaults
read hex 0.205 in against a 0.5 in floor and height 3.356 in against 2.9 to
3.1 in); that is reported, not changed, because `blade/**` is outside this
bundle and the advisory is a rule about a blade.

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
