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
| Left click | Select what is under the pointer; Ctrl or Shift + click adds or toggles |
| Alt + left click | Take the face under the pointer, even where an edge or corner would win |
| Left drag on empty space, left to right | Window box, drawn solid ("Inside"): selects what lies wholly inside |
| Left drag on empty space, right to left | Crossing box, drawn dashed ("Touching"): selects what it touches |
| Right click | Open IdeaCAD's own menu for what is under the pointer; the browser's menu never opens in the viewport |
| Escape | Step back one thing: cancel a drag or drawing, then close a box or menu, then clear the selection |

The owner's down-and-drag pivot preference takes precedence over SOLIDWORKS'
documented click-entity-then-drag refinement. The two box directions follow
SOLIDWORKS. The left-button, right-click and Escape rows were brought up to
date on 2026-09-23 by ledger 0296, which built the menu and box select; before
then a right click only suppressed the browser's menu. Sources:
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
the phone path), shift-click multi-select. Ledger 0296 rebuilt this tree on
2026-09-23: nested sketches, one row menu in place of the buttons, rename in
place, the rollback bar and the history slider (see "Overnight run 0296").

**2. Dimensional control** (`viewport/readout.ts`, `dimensions/model.ts`,
`DimensionPanel.svelte`). A drag reads at the pointer with its unit
(`Extrude 1.208 in`, `2.286 × 0.175 in`, `Rotate 90.0° about Z`), sixteen
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
point-normal plane button. Since 2026-09-23 (ledger 0296) the datum planes are
Front, Top and Right, pickable by outline or name, and the viewport has hover.

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
untested), a large-model timing. Ledger 0296 added joints over these mates and
movement within the freedom they leave (see "Overnight run 0296").

JOINTS (`mates/joints.ts`, round 2 of ledger 0296) name a mate by what the part
should do: Hinge (spins, 1 free), Slider (slides, 1), Cylindrical (spins and
slides, 2), Planar (slides flat, 3), Fixed (0) and Pin in slot (slides and
spins, 2). A joint is the solver's own mate kinds, added as ONE `batch`
command (one undo), and each of its mate features carries `joint` and a shared
`group` so the Mates panel lists them as one row; `flip` turns a coincident
pair to face the other way. Nothing is added until a plan's numeric freedom
(`proposedFreedom`, the solver's Jacobian) matches the joint's promise and a
trial solve succeeds, so a hinge whose flat faces run along its axis is refused
in words before any feature lands. `mates/motion.ts` (`moveWithinFreedom`)
projects a drag on a mated body onto the freedom its accepted mates leave and
answers the row-major matrix the `transform` feature stores; wiring it into
the workspace's move gesture is a request on the writer's files. Picks and
stored mate sides read in the student's words through `mates/words.ts`
("Body 1, hole wall"), which the Measure panel, the Section panel and the
feature parameter form share.

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
the viewport (guides are polylines; the number lives in the panel; ledger 0296
draws them as labels over the canvas), extending an arc, a rubber-band
selection.

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
selected flat face. Ledger 0296 reworked the fillet gesture, its preview and its
refusals (see "Overnight run 0296").

A refused round or bevel is a sentence in the student's words with a one-click
way forward: the largest size that fits (found by at most 8 kernel attempts or
1.5 s, and only on refusal), adding the edges to the earlier round they meet,
leaving out the edges that run into another round, or the whole tangent
chain. The kernel text is kept only as a development detail. Tangent
propagation is on by default. Every edge of an L bracket at once is refused by
this kernel at any radius (2 stripes meet), while the edges along the pull
round. The design tree's refused row offers the same fix as the Feature panel.

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
offered. The workspace stores a 160x120 JPEG through that RPC after every
successful save (an oversize one is not sent; the column caps a data URL at
60000 characters), and the card renders it. Left out: a thumbnail for a
document saved before 0217 until it is saved again. Filing is the owner's:
a grantee, a classmate under a section grant and a manager see a shared
row with no tags and no folder, on the list and in the open payload.

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
bracket's depth through the tree replayed seven of the eight features (the
bracket and the six after it), and changing the flange thickness in the FIRST
sketch rebuilt all eight with the hole, the axis and the mate intact, in 29
to 30 ms on the committed run.

**Not built, and why.** Rib (no extend-to-body in the kernel). Splines (no
spline entity in the kernel's 2D solver). Smooth loft through three or more
profiles (a negative volume from this kernel build). Multi-body boolean
between two feature-made bodies is the existing `boolean` feature and was not
widened. Assemblies are ONE
file: a mate names two bodies in the same document, and a part reused across
documents is a duplicate, not a link. A hover pipeline in the viewport. A
sketch dimension's value drawn beside the geometry. (Ledger 0296 built both on
2026-09-23.) Touch drag in the tree.
The advisory's `bodyParts` definition disagrees with `blade/evaluate.ts` about
what `Hex extension` and `Body height` measure (the add-on starter's defaults
read hex 0.205 in against a 0.5 in floor and height 3.356 in against 2.9 to
3.1 in); that is reported, not changed, because `blade/**` is outside this
bundle and the advisory is a rule about a blade.

## Overnight run 0296, 2026-09-23

Ledger 0296 was one overnight run under Mr. Pina's catch-up rule in
`docs/ideacad/VISION.md`: "If one part of the program is built out really in
depth right now, I want the other parts to catch up before further progress is
made on the more developed parts." The brief is
`docs/ideacad/OVERNIGHT_0296.md`. A Phase 0 audit
(`docs/ideacad/overnight-0296/AUDIT.md`) drove the real workspace at 1440, 960
and 375 px, tried to model a motor bracket, a spinner disk and a pinned two-part
assembly from nothing, and scored seventeen areas. The scores before and after,
with their evidence, are in `docs/ideacad/overnight-0296/MATURITY.md`, and every
defect found by using the program is a numbered line in `FRICTION.md` beside it.
This section records what exists afterwards and what was measured. It does not
restate the scores.

**How it was built.** In rounds, least mature area first. One writer owned every
shared file (`SolidWorkspace.svelte`, `viewport.ts`, `viewport/**`, `engine.ts`,
`worker.ts`, `client.ts`, `workspace-api.ts`, `features/core.ts`, `tools.ts`,
`command-registry.ts`, `preferences.ts`) and worked in stages, one after
another. Every other lane worked in its own worktree on a `wip/0296-*` branch,
owned a disjoint set of files, and sent the writer tested requests. Round 1 was
the foundation (writer stages 1 and 2) beside the front door, the design tree
and analysis. Round 2 was dimensions, fillets, assembly and learning. Writer
stage 3 wired the tree into the workspace and built rollback, the time-lapse,
the fillet preview and view modes. Writer stage 4 merged the round 2 branches
and mounted what they built: the sizes overlay, typed sizes while drawing, the
fillet help on tree rows, move within freedom for joints, the Learn panel and
hints, and the Analysis toggle (commits 7e257d60, 38667e2e, 5427e7e1). One
round 2 piece was not wired: the fillet edge-set accelerator near the pointer
(the helpers exist in `features/blends.ts` as `edgeSetOffers`). The ending then
fixed blind pockets (below, part features).

**What did not change.** No migration: nothing was written under
`supabase/migrations/`. The manifest format did not change, so every saved
document opens as it did; the one addition to what a document can hold is two
optional fields on a mate feature (`joint` and `group`, below), and 0217's
validator checks a feature's id, type, name and suppressed flag, not its other
fields. Hover, the rollback position, the time-lapse, hidden
bodies, the view mode and layout are workspace state and never enter a manifest,
because `record()` diffs manifests and every difference would become a history
row and a save. The vendored kernel was not modified, and `blade/**` was not
touched.

**What the numbers are worth.** Everything was measured in the container's
Chromium 141, with software WebGL, on four cores that up to four agents shared
at once. Geometry, overlap, text-to-border and pixel-count readings do not
depend on timing and stand. Frame and pick times are readings on this machine.
They say nothing about the school's desktops, which were not measured.

### The preferences store

**Everything a student customizes is one typed store,
`src/lib/ideacad/solid/preferences.ts`, and on `/ideacad` it lives in the
student's own profile row.** The audit found that `profiles.preferences` already
held a per-user `ideacad` namespace under the "update own profile" policy,
written by the legacy chooser's pane layout. So the store needed no migration,
and the `0226` table the brief allowed for was not proposed. The store writes
under `preferences.ideacad.solid` as a whole-blob SPREAD-MERGE:
`mergeSolidPreferences` replaces `ideacad.solid` and keeps every sibling
namespace, and `ideacad.panes` beside it, exactly as they were. The legacy
chooser's own writer in `IdeaCadApp.svelte`, which used to replace the whole
`ideacad` object, now merges inside it too.

- **The groups** (`PREFERENCE_GROUPS`): `view` (datum planes `auto`, `always` or
  `never`; the corner triad; the display mode), `toolbar` (the quick tools and
  their order), `shortcuts` (a command id to its key, or null for off), `snaps`,
  `drawing` (polygon sides), `features` (fillet, chamfer and hole defaults),
  `hints` (tooltip delay, retired hints, tutorial progress), `commands` (recent
  commands, at most 20), `units` (inches or millimeters on screen) and `pick`
  (the pick filter).
- **Validated on read, field by field** (`readPreferences`). An unknown key or
  an invalid value falls back to its default and costs only that value, so a
  stored value can never put the modeler in a state no branch renders.
- **Only what differs from the defaults is written** (`compactPreferences`), so
  a better default later reaches every student who never chose. A value is a
  default, never an entry: nothing in the store remembers a face, a body or a
  document.
- **Three implementations behind one `PreferenceStore` interface.**
  `MemoryPreferenceStore` is for tests. `LocalPreferenceStore` keeps it in
  `localStorage` per viewer, with every access inside a try, and is what
  `/dev/ideacad-solid` uses (`?fresh=1` resets it). `ProfilePreferenceStore` is
  the real route's: it waits 400 ms, READS the row before each write,
  spread-merges, and skips the write rather than writing over a row it could not
  read. The `/ideacad` page builds it lazily with the workspace, so three.js
  stays off the launch page.
- **The older module settings keep their exports** (`snapSettings`,
  `drawingSettings`, `featureOptions` and the datum-plane mode).
  `applyToModules` fills them from the store before any panel mounts, and
  `captureFromModules` reads them back, so a panel that writes one has written a
  preference.
- **`PreferencesPanel.svelte`** opens from the header gear with six groups
  (View, Toolbar, Shortcuts, Snaps, Hints, Units), each with its own Reset. A
  shortcut is recorded by pressing it. A key already in use is refused with a
  sentence naming the command that holds it, and digits, the point, the minus
  sign, Escape, Enter and Tab are refused because typing values and moving focus
  need them.
- **Not verified:** the profile store's merge and failure paths are unit-tested,
  but it was never run against a real profile row, because no session here can
  sign in against production. Panel layout and widths, and colors, are not in
  the store yet.

### What exists now, by area

The order is the maturity ledger's.

**1. Launch and documents** (`launch/**`, `LaunchPage.svelte`,
`DocumentCard.svelte`). The front door's masthead and toolbar are one band: the
site's own logo at top left linking home, then the IdeaCAD lockup (the cube
mark, extruding once on arrival, as the page's `h1`), then New model, search,
sort and views. The band is one row at 1280 px and wider, two rows from 900 to
1279, and short rows on a phone. Measured: masthead dead space fell from 88% to
33% at 1440; the first card rose from 193 px to 94.2 px at 1440 and from 571.7
px to 306.2 px at 375; the gap between card rows fell from 51.7 px to 12.4 px at
every width. That gap was `src/app.css`'s global `.card { margin: 1.25rem 0 }`,
and renaming the class (`.doc-card`) fixed it after six layout changes did not.
Below 960 px the folder and tag rail folds into one 44 px `Disclosure` row
naming the active filter. Still open: a new model takes three steps (F001).

**2. Sketching.** A drawing tool can press Front, Top or Right to sketch on it.
A press on empty space draws on the selected plane, otherwise the plane the view
faces, otherwise Top. A rectangle with no width or height is refused with a
sentence and a way forward, where it used to make an empty sketch. On the
dimensions branch (`dimensions/drawn.ts`, `dimensions/typed-draw.ts`), a drawn
shape arrives sized: a rectangle with its width and height as driving
dimensions, a circle with its diameter, a regular polygon with a construction
circle, equal sides and a radius, and any other line with its length. Sizes can
also be typed while drawing, with Tab between fields: a held drag with `2 Tab 1`
gave a 2 x 1 in rectangle, `50.8mm Tab 1` gave 2 x 1, and a circle with `2`
typed gave radius 1, with the active field bracketed in the readout. A letter
continues a number but never starts one, so shortcuts still work. The call site
in `viewport/drawing.ts` is a writer patch. Not built: horizontal and vertical
inference on the Line tool (so an automatic length on a nearly horizontal line
leaves its angle free), and splines.

**3. Part features.** A click with the Hole tool drills where the face was
clicked (measured: 2 clicks, 2 holes, 1 body, 0 errors), and the tool says so.
"Start from a box" on an empty part adds a 2 x 2 in sketch and a 1 in extrude as
one change and one undo, and a refusal puts the model back.

**A blind pocket from a face sketch cuts now, and had never cut before.** A
circle sketched in the middle of a block's top face and pushed 0.5 in down was
refused with "This change could not form a valid solid. Try a different size."
The cause, measured against the vendored kernel: a tool swept AGAINST its own
profile's normal makes `cutJournaled` and `fuseJournaled` return an invalid
solid, while the identical cylinder swept the other way (from the pocket floor
up) cuts cleanly; starting the tool 0.001 in above the face does not help. It
was the same on `main` at `bf04a223`, so every interior blind pocket had always
been refused; a cut that broke out of an edge, or went all the way through,
happened to survive. The extrude executor (`features/core.ts`) now rebuilds such
a tool from its far end and sweeps it back along the normal, only when the first
result is invalid, so a cut that already worked is never rebuilt and its bytes
do not change. The caps are still named against the sketch plane, so the pocket
floor is `<fid>.end` and the wall `<fid>.side.0`.
`tests/ideacad-solid-blind-pocket.test.ts` pins the exact pocket volume (to
1e-6), the names, a boss pulled down off a bottom face, and an unchanged
through-cut; removing the fix fails it. Still open: patterns copy bodies, not
features; there is no counterbore or countersink.

**4. Fillets and chamfers.** Mr. Pina said they "totally suck". What changed:

- **The drag grows live.** `commandFor` reads every edge and face reference from
  the model as the gesture found it, so an edge drag no longer freezes at its
  first sample with "That edge is no longer on the model". Measured: R 0.047,
  0.190 and 0.332 in across eight samples at 1440 and 960 (F011).
- **A preview before the press.** Under Fillet or Chamfer, hovering an edge
  draws its tangent chain (a worker op, cached per edge per model and never
  asked while the worker is busy), and hovering a face draws all its edges.
  Pressing a face rounds every edge around it (F012).
- **The largest size that fits, searched only on a refusal** (fillets branch,
  `features/blends.ts`). A successful blend never searches (0 probes, counted in
  a test). On a refusal it first tries a hair under the limit the kernel's own
  sentence names, then the radius of an earlier round these edges run along,
  then a bounded search of at most `FIT_ATTEMPTS` (8) kernel attempts or
  `FIT_BUDGET_MS` (1500 ms), each inside a scratch checkpoint. Measured with the
  real kernel: a limit the kernel names costs exactly 1 extra probe (a 4 x 3 x
  0.5 in plate edge asked at R 3 offers 0.499 in, and pressing it rounds the
  edge to the exact analytic volume); the same refusal asked again costs 0 (a
  memo keyed by the edges, the bounding box and the volume, so a drag past the
  limit does not search on every frame); in the hardest case, a round that
  runs into a bigger one at a corner, the whole refusal, failing attempt and
  search included, took 2.6 to 3.5 s. Every value offered was tried and fitted.
  If the time ran out first, the sentence says "The largest found that fits
  here".
- **Refusals in the student's words, each with a one-click way forward**,
  carried on `FeatureRow.help`: an edge that is already smooth (checked before
  any kernel call), edges that meet an earlier round at a corner ("Add 3 edges
  to Fillet 1"), edges that run into a bigger round ("Leave out 2 edges"), and a
  tangent run with the chain turned off. The kernel's own text is kept for
  development only.
- **Defaults.** Tangent propagation (SolidWorks' word) is on by default. Radius
  and distance are sticky, and the panel's boxes follow a round made by
  dragging, typing or a fix (F026). Variable radius sits behind a closed
  `Disclosure`. "Before Shell 1, for even walls" puts the round ahead of the
  shell.
- **Edge sets** are pure functions over the projection (`edgeSet`: chain, loop,
  feature, body, convex, concave), each offered as a "+N" button that lights its
  edges on hover. On a real L bracket they found 17 convex edges and 1 concave.
- **A kernel limit, measured.** Every edge of an L bracket at once is refused at
  R 0.05, 0.1 and 0.2 ("2 stripes meet"), and so are all 17 convex edges; the
  concave edge alone and the 6 edges along the pull round. Probing each corner
  alone fails at all 16 corners, so the refusal cannot say which corner is the
  problem.

All of this is mounted: the engine carries a refusal's help onto the
`FeatureRow`, and the design tree's error row offers the same one-click fix as
the panel. Not wired: the edge-set accelerator near the pointer.

**5. Reference geometry.** Front, Top and Right are named everywhere through
`DATUM_NAMES`: Front is XZ, Top is XY and Right is YZ. They are datum planes,
not features, and they show according to the `view.planes` preference, whose
default `auto` shows them while the part has no body. Select takes a plane by
its outline or its name, so a click in its empty middle still clears the
selection; only drawing tools take its fill. The design tree lists Front Plane,
Top Plane, Right Plane and Origin above the features, in SolidWorks' order. A
plane row's menu starts a sketch on that plane and opens it, and selecting a
plane or the Origin in the tree draws the planes whatever the setting. Plane and
reference names stay 20 px tall on screen at every zoom. A selected reference
axis drives revolve and both patterns, and a selected reference or datum plane
drives mirror. The Reference panel lost its prose and
folds the offers that are not ready behind "Show N not ready": 2013 px tall at
1440 in the audit, 711 px after. Not built: per-plane visibility (the tree's eye
shows or hides all three), and the Origin as a pick target.

**6. Design tree and history** (`FeatureTree.svelte`, `tree/**`). Rebuilt to
resemble SolidWorks' FeatureManager.

- Each sketch nests under the first later feature made from it (`nestRows`),
  collapsed by default behind a 44 px caret. A sketch nobody consumes stays at
  the top level. Moving a feature carries its sketches as ONE `move-features`
  command and one undo, with each member checked by `move-feature`'s own rule.
- Rows are quiet: an icon, the name and a summary, with the status glyph and
  word only on an error, warning or suppressed row. The six buttons and two
  sentences that sat under the selected row are one menu, opened from the row's
  control or by right-click and drawn in the workspace's one
  `ContextMenu.svelte`. A refused entry is `aria-disabled` with the reducer's
  reason under its word.
- Rename in place with F2, a slow second press on the name (500 ms), or the
  menu. The 60-character rule is the reducer's refusal, not a `maxlength` clamp.
  A fast double-click edits the feature.
- Hovering a row preselects its geometry, hovering the model lights the row that
  made what is under the pointer, and a picked face marks its feature's row and
  scrolls it into view.
- **The rollback bar** (`tree/RollbackBar.svelte`, the engine's `limit`, the
  worker's `rollback`). The engine builds only the features above the bar, from
  the nearest checkpoint, with the checkpoint window counted from the bar so an
  edit there stays cheap. Features below it keep their last full-build status
  and the manifest never changes. A feature added while rolled back goes in at
  the bar and the bar moves past it, and undo and redo keep the bar where it
  stood. `tests/ideacad-solid-rollback.test.ts` is 7 tests against the real
  kernel.
- **The history slider and time-lapse** (`tree/HistorySlider.svelte`,
  `tree/playback.ts`) sit in their own row between the work area and the footer:
  Start, Back, Play or Pause, Next, Stop, a scrubber, the step's feature name,
  and 0.5x, 1x and 2x (one step per 600 ms by default; measured 300 to 304 ms at
  2x). Steps are scheduled on `setTimeout`, never on rAF alone, and reduced
  motion keeps the timing and drops the animation. Scrubbing and Play never
  touch the kernel: a worker op, `timelapse`, replays once from the base and
  returns what each step made or changed, and the main thread keeps every step
  as shared body references keyed on the feature list, so any edit invalidates
  the cache. For the forty-feature test document that one build took 130.5 ms
  (40 steps, 39 body meshes, 0.04 MB). In Chromium a step swap took a median 1.1
  to 1.4 ms, and the first step, including the worker build, 235 to 264 ms.
  "Roll back here" is the one control on it that touches the kernel. The row is
  53 px tall at 1440 and 960 and 103 px (two rows) at 375, with 0 px of overlap
  with the footer or the shell's controls.
- Still open: while a time-lapse step is on screen, the first click returns to
  the live model and selects nothing; there is no touch drag in the tree.

**7. Dimensions.** The audit's typed-value race is gone: "0.25" and Enter right
after a draw used to give plates of 2, 0.25, 0.25 and 25 in, and now gave
exactly 0.25 in 9 of 9 trials across three widths. Digits typed before the box
has focus are added in order, and an Enter pressed while the worker is busy
waits for it. `DimensionOverlay.svelte`, mounted over the canvas, draws every
driving size beside the geometry it controls, as a button at least 44 px tall in
the display unit, with dimension, witness and leader lines, placed through
`api.project`. `dimensions/anchors.ts` gives exactly one anchor per feature
dimension and per dimensional sketch constraint. A click or Enter opens an input
in place with the value selected; Enter applies one `set-feature`, Escape
cancels, and a refusal keeps the box open with what was typed. A driven size is
gray and carries the word "measured". Labels hide during a drag, spread apart
and off the chrome, and light the geometry they control on hover. On the
harness: 0 overlapping labels and 0 labels under chrome at 1440, 960 and 375,
and after an orbit the labels moved 95, 52 and 74 px with still 0 overlaps. In
the real workspace, with the mount patch applied: a depth retyped to 0.5 gave a
body whose top sits at z 0.5, and a fillet typed as 0.2 showed "R 0.200 in" on
its round face and was retyped to 0.3. A round edge now measures as a diameter,
and picking a fillet's round face or a hole's wall finds that fillet or hole
rather than the base extrude. Still open: at 375 nothing re-fits the view after
a size changes, so an anchor can leave the screen.

**8. Selection and interaction.** One pick function, `orderPicks` in
`viewport/pick.ts`, returns every candidate under the pointer in depth order and
the best one by a single precedence, and hover, click, box select, the
right-click menu and Select Other all ask it. An idle `pointermove` is throttled
to 32 ms (rAF or timeout) and ray-cast once over the tessellation.

- **Hover** tints a face, draws an edge thick (5 px hovered and 3.5 px selected,
  as `Line2` in an overlay pulled 6 px toward the camera), puts a dot on a
  vertex and brightens a plane or sketch. Canvas pixels changed on hover at
  1440: 141,935 for a face and 2,603 for an edge, against 0 in the audit.
- **Pick cost** per pointer move: a 6-face box, median 0.1 to 0.2 ms (p95 0.4);
  a 402-face, 1,200-edge prism, median 0.8 to 0.9 ms (p95 1.2 to 1.7, worst 3 to
  5.5).
- **Box select** by dragging on empty space. Left to right is a window (drawn
  solid, labeled "Inside"): it takes what lies wholly inside. Right to left is a
  crossing (drawn dashed, labeled "Touching"): it takes what it touches. That is
  SolidWorks' convention. Visibility is decided by a ray-cast at points inside
  each edge, so a hidden back edge is never taken, and bodies go by their
  extent. The work area is `user-select: none`, so a drag no longer selects page
  text.
- **Click** selects, Ctrl or Shift adds or toggles, and **Escape** steps back
  one thing at a time: it cancels a drag or drawing, then closes the value box,
  search, a menu or the preferences, then clears the selection. The picks that
  made a mate, a combine or a mirror are cleared afterwards.
- **Select Other** lists every candidate under the pointer in depth order, named
  by role ("End face", "Side face 3", "Hole wall"), with an x-ray preview of
  each. **Select tangent chain** and **Select loop** grow an edge pick. The
  **pick filter** is a preference and says in words what it lets through while
  it is on.
- **Right-click** opens IdeaCAD's own `ContextMenu.svelte`, built from the
  command registry for whatever is under the pointer (a face, edge, vertex,
  body, sketch, plane, or empty space). It is keyboard operable and its rows are
  44 px. The browser's own menu never opens over the model.
- **The context toolbar and breadcrumb** (`ContextBar.svelte`: face, feature,
  sketch, body) appear near the pointer on a selection, in whichever of four
  spots covers the least chrome. Presses pass through until the pointer has
  rested on it for 120 ms, so a press just above a fresh pick is not taken as a
  command; a finger uses it at once.
- A sketch that a feature has consumed is no longer drawn or pickable unless it
  is open, selected or hovered in a list. In the audit such sketches won 8 of 8
  picks on a hole wall. A body can be hidden for the session, and a cue counts
  the hidden ones.
- **Command search** opens at the pointer with W, ranks recent commands first,
  and Space opens it narrowed to the view commands.
- Still open: at 375 an open panel covers the model, so hover previews and picks
  there reach nothing (F044).

**9. Viewport and display.** `ViewControls.svelte` offers Fit, Iso, Front, Top,
Normal to (a second press flips 180 degrees) and Right as words, and folds the
last of them into a Views menu when the row is short rather than overlapping
anything. The axes are a triad in the bottom-left corner that turns with the
view: the same red, green and blue lines, with X, Y and Z beside them, drawn in
a corner inset of the same canvas. With the triad on, the orbit frame cost a
median 0.7 to 1.0 ms against 0.6 to 0.7 ms with it off, which is within noise. A
small Origin marker is drawn while the planes are.

- **Display modes:** Shaded with edges (the default), Shaded, Hidden lines
  visible (edges behind faces drawn dashed and dimmer, with the faces still
  shaded) and Wireframe, from the view control, the preferences, search and
  keys, and stored in `view.mode`.
- **Display tessellation is size-relative,** for the per-face display meshes
  only: a chord of 2e-4 of the model's largest side (never below 1e-5 in) and
  0.06 rad (`DISPLAY_TESSELLATION`, in `engine.ts`), where it was a fixed 0.002
  in. The export and advisory whole-body mesh stays 0.002 in and 0.15 rad
  (`EXPORT_TESSELLATION`), pinned by
  `tests/ideacad-solid-display-tessellation.test.ts`. A 6 in spinner disk went
  from 2,580 to 5,956 triangles (about 42 to 105 segments around a full circle)
  and its orbit frame p95 from 1.7 to 0.8 ms. A small filleted plate with a boss
  now draws 20,988 triangles; fillet-heavy parts were not measured on the school
  desktops.
- **Orbit frame cost with hover in place:** the 402-face prism a median 14.5 to
  14.7 ms after, against 15.8 to 16.8 before; the box 0.5 to 0.6 against 0.8 to
  1.0.
- **Writer stage 4:** a right drag orbits (Ctrl or Shift pans) and a right
  click in place still opens the menu; Fit frames the model in the area the
  palette, the top bar and an open panel column leave free; an edit that takes a
  model that was wholly on screen partly off screen refits it; Edit sketch
  faces the plane, frames the sketch in the free area and draws it over the
  body. Below 700 px the panels are a bottom sheet under one Panels handle that
  folds without unmounting.
- Not built: section caps and a view cube. A datum section now starts through
  the model's centre.

**10. Assembly** (`mates/joints.ts`, `mates/words.ts`,
`mates/motion.ts`, `MatePanel.svelte`). The Mates panel opens on joints named by
what the part should do, each showing the freedom it leaves: Hinge (1), Slider
(1), Cylindrical (2), Planar (3), Fixed (0) and Pin in slot (2), plus One mate.
A joint lands as ONE new `batch` command, so it is one undo and one history
label, and each of its mates carries `joint` and `group` fields; the Mates list
shows it as one entry with one Delete. Before anything is added, the planner
runs the solver's own rank count and a trial solve: a hinge whose flat faces run
along its axis is refused as "Not a hinge", naming what the picks can make
instead, and a hinge picked top face to top face flips the round pair so both
halves hold. Faces read as "Body 1, hole wall" rather than an internal id.
Measured in the real workspace: a hinge in 6 actions once the parts exist (the
Mate tool, four picks, Add hinge), the pin left with 1 degree of freedom, and
one Ctrl+Z leaving 0 mates; before this a hinge was two separate mates with no
joint concept. The magnetic snap no longer adds a mate the existing ones already
hold (F046). `moveWithinFreedom` projects a drag onto the freedom the mates
leave the body: with its patch applied, a Z-arrow drag slid a cylindrical-joint
pin 0.334 in up its hole, still centered, and an X-arrow drag moved nothing and
added nothing. Before this, moving a mated pin moved both parts. Still open:
parts as definitions and occurrences (see below), mate connectors, and a ground
part that shows as Floating with nothing to say it should be fixed.

**11. Simulation and analysis** (`analysis/**`, `AnalysisPanel.svelte`,
`/dev/ideacad-analysis`). Every number obeys the density rule: `bodyMass` in
`advisory.ts` is still the one density predicate, and no density is ever
assumed.

- **Mass and balance.** A mass table, heaviest first, with each part's share;
  the combined center of gravity and its height, or Unknown naming each blocking
  body and why (No material, Density unverified, Printed with no mass, Measured
  mass only); the tip angle about each edge of the footprint, atan(d/h), and
  "Tips at N g sideways".
- **Inertia** about any picked axis by the parallel-axis theorem, in lb·in² and
  kg·m². The kernel's tensor was measured rather than assumed: it is at unit
  density, in in^5, about each body's own center of mass, ordered
  `[Ixx, Iyy, Izz, Pxy, Pxz, Pyz]`, and the last three are products of inertia,
  so the tensor's off-diagonal terms are their negatives.
- **Interference** for each pair of bodies: a bounding-box check, then an exact
  intersection; where the exact pipeline refuses (a coaxial pin in a hole), an
  approximate boolean labeled Approximate with its 0.1 in deflection; otherwise
  Unknown with the kernel's own sentence. A check took a median 76 ms for 6
  bodies and 158 ms for 12.
- **Clearance does not trust the kernel's `solidToSolidDistance`**, which
  returns the nearest pair of CORNERS when the closest points lie inside a
  curved face. Measured: 0.564 in for a disk 0.125 in above a plate, 0.180 for a
  wheel 0.100 beside a plate, 0.618 for a motor touching a skid's edge, and 1.0
  for two overlapping boxes. `minimumDistance` starts from the kernel's answer,
  samples the corners and 16 points on each curved edge, refines the best three
  by golden-section search and walks downhill, so every candidate is a real pair
  of surface points and the result can never read smaller than the true gap. It
  is called exact only when it equals the bounding-box gap. The three bad cases
  then read 0.125 exact, 0.100 exact and touching.
- **Two add-ons, off by default and with no functions:** a spinner weapon
  (energy, tip speed, bite and motor kV, with both published worked examples as
  tests) and FRC checks (arm holding torque from the model's own center of
  gravity, drivetrain free speed; motor RPM is left blank rather than guessed).

The Analysis panel opens from an Analysis toggle beside Objects and from the
`panel-analysis` command; the worker's `interference` op backs its clash list,
and Measure's body-to-body distance now goes through `checkPair` rather than
the kernel's `solidToSolidDistance`, which returns nearest corners on curved
faces rather than a true minimum.

**12. Materials and appearance.** Unchanged. The Analysis panel's Material
select on a blocking body sends the same command `BodyProperties` sends. The
solid modeler's materials are still the list in `advisory.ts`, not the
`ideacad_materials` table (see below).

**13. Add-ons.** The spinner weapon and FRC checks joined IdeaBlade in the
registry. Neither carries a function, so the registry's function count is still
IdeaBlade's alone and the never-restrict property is untouched. Still open: an
enabled add-on with no tools shows an empty "Tools 0" heading.

**14. Import and export.** Unchanged. STEP was spiked and not shipped (see
below).

**15. Learning and onboarding.** A tool's card waits for the student's own delay
(`hints.tooltipDelayMs`, 400 ms by default): in the workspace it was hidden at
120 ms and shown at 620 ms, where the audit measured 1 ms. On the learning
branch (`ToolButton.svelte`, `learn/**`) the card opened 406 to 427 ms after the
pointer arrived, also opens on keyboard focus and is linked with
`aria-describedby`, stays open while the pointer is inside it, closes 453 to 499
ms after the pointer leaves, and passes to the next tool in 7 to 21 ms. It shows
the name, the key, the one-line description and, for 17 tools, a looping picture
of the gesture that stops under reduced motion, and it is placed beside the
whole palette so it covered 0 px² of any tool at any width. An empty part shows
one line, "Press a plane to sketch on it", with "Sketch on a plane" and "Start
from a box". A Learn button in the header opens a five-task, eleven-step tutorial
(draw a rectangle, pull it into a solid, round an edge, cut a hole, mate two
parts) that never blocks the work, rings the real control, and counts a step
done from what the student did after the step began; first-use hints that retire
once the tool has made a feature; and the instruction prose removed from the
Reference, Section, Measure, Add-ons and Body properties panels.

**16. Customization.** The preferences store above, and the command registry,
`command-registry.ts`, as the one list of the 23 tools and the view, edit,
selection and panel commands, which the palette, the right-click menu, the
context toolbar, command search and the shortcuts all read. Shortcuts are one
layer in the workspace, never fire inside an input, and can each be remapped or
turned off; the defaults are R, C, L, E, F, W, Space, Ctrl+Z, Ctrl+Y (and
Ctrl+Shift+Z) and Delete. The palette shows the student's own quick tools in
their own order. SolidWorks' Ctrl+1 to Ctrl+8 view keys were not adopted,
because Chrome takes Ctrl with a digit for switching tabs before the page sees
it. Not yet customizable: panel layout and widths, and colors.

**17. Branding and chrome.** The home card's cube is
`src/lib/marks/IdeaCadMark.svelte`: a lit top face, shaded sides and the sketch
drawn dashed beneath, extruding on a 4.4 s loop only under
`prefers-reduced-motion: no-preference`. With motion reduced, 12 of 12 elements
measured opacity 1, no transform and no animation.

- **Button text never touches its border.** `src/app.css` zeroes padding on
  every element and `.ic-root button` set sizes with no padding, so
  `ideacad.css` now carries `:where(.ic-root) button { padding: 2px 10px }`, at
  the specificity of a bare `button` so a component's own padding still wins.
  Comparing each page with the floor against the same page with it cancelled
  moved 0 buttons on `/dev/ideacad`, `/dev/ideacad-item` and
  `/dev/ideacad-solid`. Front door: 25 of 42 controls were under threshold
  before, as close as 0 px; afterwards the smallest gap is 6.4 px across and 2.5
  px up and down, in every view at every width. Workspace chrome: the smallest
  gap is 10.5 px, where "Edit advisory limits" and the Tree toggle sat 1.0 px
  from an edge.
- **Nothing overlaps at half width.** At 960 the view tools and the panel
  toggles overlapped by 59.6 x 46 px and the "3D" button could not be reached;
  afterwards 0 px at 1440, 960 and 375. The shell's Voice and Report controls
  sit inside the two ends of a 48 px footer instead of over it.
- **No dead space in the tool menu.** The expanded palette is 3 x 8 (6 x 4 on a
  phone) with 0 empty cells, where it was 2 x 17 with 10 of its 34 cells empty.

### Measured, before and after

| Measure | Before | After |
| --- | ---: | ---: |
| Canvas pixels changed by hovering a face, 1440 | 0 | 141,935 |
| Hover pick per pointer move, 402-face prism, median | no hover | 0.8 to 0.9 ms |
| Orbit frame, 402-face prism, median | 15.8 to 16.8 ms | 14.5 to 14.7 ms |
| Overlap between workspace chrome at 960 | 59.6 x 46 px | 0 |
| Smallest text-to-border gap, front door | 0 px | 6.4 px |
| Smallest text-to-border gap, workspace chrome | 1.0 px | 10.5 px |
| Empty cells in the expanded palette | 10 of 34 | 0 |
| Masthead dead space at 1440 | 88% | 33% |
| Reference panel height at 1440 | 2013 px | 711 px |
| Tool card delay | 1 ms | 406 to 427 ms (400 ms setting) |
| "0.25" typed and entered right after a draw | 2, 0.25, 0.25 or 25 in | 0.25 in, 9 of 9 |
| Fillet drag across 8 samples | froze at the first | R 0.047 to 0.332 in |
| Kernel probes, largest fillet that fits | none offered | 0 on success, 1 when the kernel names its limit, at most 8 or 1.5 s |
| Time-lapse, 40-feature document | none | 130.5 ms once, then 1.1 to 1.4 ms a step |
| Rollback tests against the real kernel | none | 7 |

**Verification.** Every lane measured `svelte-check` at 0 errors and 37 warnings
in 20 files (31 `state_referenced_locally`, 5 `css_unused_selector`, 1
`perf_avoid_nested_class`), unchanged from the Phase 0 baseline. The full suite
at the end of writer stage 3 ran 558 files and 10,630 tests with 1 failure.
That one is `tests/identity-style-shared.test.ts`, which compares against
`origin/main`, is red on `main` itself, and failed identically at the Phase 0
baseline (548 files, 10,491 tests). The browser pass at that point covered every
`ideacad-solid*` and `ideacad-launch*` spec at 375, 960 and 1440: 42 route and
width runs, 723 measurements, 0 outside threshold. Not verified: the school
desktops' integrated graphics, a preference written to a real profile row,
deployed authentication, a STEP file opened in SolidWorks, and a novice's cold
test.

### Deliberately not built, and why

- **Parts as definitions and occurrences.** A part defined once and placed
  several times is a manifest-format change. The 0217 validator would accept new
  feature types, so it needs no migration, but it is the riskiest change to
  saved documents this run could have made, and the audit deferred it until the
  lowest areas had moved. So a mated pin's own sketch still stays behind when
  the pin moves (F048), and a part used in two documents is still two copies.
- **STEP.** A spike settled what it takes. The vendored core kernel's `toBREP`
  refuses with "toBREP requires the optional 'io' feature for STEP export", so
  the audit's reading that the core kernel already writes STEP was wrong.
  `remus-wasm-io` from the same pinned tree (`9307e73`), package v2.130.20,
  which is the vendored core's package version (artifact refresh `f7907f5`), is
  2,500,965 bytes of WASM, and it round-tripped in Node: a 4 x 3 x 1 in box and
  an r 0.5 x 3 in cylinder exported as 11,056 bytes of AP203 in 16.8 ms, with
  native PLANE, CYLINDRICAL_SURFACE and CIRCLE entities, and imported in 25.0 ms
  with no diagnostics and exact volumes. The file declares millimeters, so a
  solid is scaled by 25.4 before export and by 1/25.4 after import with
  `copyAndTransformSolid` (a row-major 4 x 4 matrix); measured, the box came
  back as 11.99999999999998 in³ with bounds 0 to 4, 0 to 3 and 0 to 1. It was
  not vendored tonight: nobody has opened the file in SolidWorks, which is the
  point of STEP for these students; a vendor STEP with hairline overlaps and a
  sheet body were not tried; and 2.5 MB more to download is a decision rather
  than a default.
- **Smooth loft** through three or more profiles still returns a negative volume
  from this kernel build and is still refused in words.
- **Rib** still needs an extend-to-body the kernel does not have and is still
  refused in words.
- **FEA.** Whether any simulation beyond closed-form checks and exact geometry
  belongs in IdeaCAD is an open question only Mr. Pina can answer (`VISION.md`),
  and a stress result would rest on material properties the density rule could
  not vouch for. Analysis stops at mass, balance, inertia, interference and
  clearance.
- **The materials table.** The solid modeler's materials are still the list in
  `advisory.ts`, not the admin-editable `ideacad_materials` table that Mr.
  Pina's decision of 2026-09-12 made the home for materials. Moving onto it
  means reconciling material ids and the citation discipline, and the run did
  not make that change without a decision.
- Also left: a hidden body staying hidden across a reopen (a manifest decision),
  per-plane visibility, panels that fold away at 375 (F044), and rescaling the
  whole sketch to fit the first typed dimension, as SolidWorks does.

### Questions the run raised for Mr. Pina

- Should Front, Top and Right show only until the first solid (the `auto`
  default chosen here), or always, as SolidWorks does until they are hidden?
- Should IdeaCAD show the site's voice navigation at all, now that it sits in
  the footer?
- A mirror with no plane picked still goes across Top. Would Right, the usual
  symmetry plane, be the better default?
- Should Hidden lines visible keep the faces shaded, or draw lines only, as
  SolidWorks does?
- Is the finer display tessellation (about twice the triangles on round parts)
  acceptable on the school desktops, or should its factor be a setting?
- Should Analysis check for clashes on its own whenever the model changes
  (debounced 400 ms, never while busy), or only when a button is pressed?
- Should a size typed right after drawing rescale the whole sketch to fit, or
  change only that size, which is what was built?
- Is folding new edges into an earlier round of the same size ("Add to Fillet
  1") the right default?
- Should a hinge picked outside face to outside face turn the pin over, as it
  does now, or offer aligned and anti-aligned?
- Pin in slot rides one wall at the pin's radius. Is that enough for now, or is
  a true slot mate wanted?
- Should the help control say "Learn" or "Help"?

## Current implementation

`/ideacad` opens its chooser. Any signed-in user can create an empty standalone
document. The classroom item links to the app; it no longer creates a legacy
blade automatically. IdeaBlade is off for every new document.

- **Geometry:** `solid/engine.ts` owns exact solids in a Web Worker. Face names
  survive supported edits through the kernel journal; split faces receive new,
  distinct IDs. Edge/vertex selections use the body topology epoch and incidence
  handles. Tessellated meshes are disposable viewport/export projections: the
  display meshes take a chord of 2e-4 of the model's largest side and 0.06 rad
  (since 2026-09-23), while the export and advisory mesh stays 0.002 in and
  0.15 rad.
- **Modeling:** line/rectangle/circle/polygon/arc sketches, extrusion and cuts,
  revolve, fillet/chamfer/shell, direct face edits, qualified edge/vertex edits,
  transforms, mirror, linear/circular patterns, and multi-body Booleans, each
  a feature in an editable tree. Every tool is registered once in
  `command-registry.ts` with its icon, one-line description and optional
  shortcut; its card waits for the student's hint delay (400 ms by default).
  Typed values appear at the cursor, and a digit typed with something selected
  opens the value box. Rule limits never become geometry clamps.
- **Selection and menus:** hover preselects faces, edges, corners, planes and
  sketches; click, Ctrl or Shift + click, and Escape to step back; box select
  (left to right takes what lies inside, right to left what it touches); Select
  Other, tangent chain, loop and a pick filter. Right-click opens IdeaCAD's own
  menu for what is under the pointer, on the model and on tree rows, and a
  context toolbar with a breadcrumb follows a selection. Command search opens
  with W.
- **Viewing:** Fit, Iso, Front, Top, Right and Normal to as words; a triad in
  the bottom-left corner that turns with the view; Front, Top and Right planes
  and the Origin on an empty part; four display modes (Shaded with edges,
  Shaded, Hidden lines visible, Wireframe). Sizes are drawn beside the geometry
  they control and can be clicked to type a new value.
- **Tree and history:** sketches nest under the features that consume them,
  rows are renamed in place, one menu per row, and hovering links rows and
  geometry both ways. A rollback bar builds the model only down to where it
  sits, and a history slider along the bottom plays a time-lapse of the model
  being built, from cached meshes, at 0.5x, 1x or 2x.
- **Customization:** one preference store in the student's own profile
  (`profiles.preferences.ideacad.solid`) for planes, triad, display mode, quick
  toolbar, shortcuts, snaps, feature defaults, hints, units and the pick
  filter, edited in the Preferences panel.
- **Storage:** migration 0216 makes assignment linking optional, adds a format
  discriminator, copied assignment context and immutable hash-addressed BREP
  artifacts. Existing feature trees stay `blade-v1`; new manifests were
  `ideacad-solid-v1` until migration 0217's feature graph made them
  `ideacad-solid-v2`, and both open. Unknown kernel encodings refuse to open.
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

The polygon tool draws any whole number of sides from three up, typed in the
open sketch and remembered as a preference (six by default); the arc tool takes
three clicks and closes with its chord for the first profile. The default
planes are Front (XZ), Top (XY) and Right (YZ). A reference axis selected
before the command drives revolve and both patterns; without one, revolve uses
the sketch's vertical axis, linear patterns world X, and circular patterns
world Z with full-circle spacing. Mirror uses a selected reference plane, then
a selected Front, Top or Right plane, then Top. An axis anywhere is placed by
making a reference axis first. General mixed-curve sketch editing and arbitrary
local edits on curved edges/vertices are not implemented.
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
