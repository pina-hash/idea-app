# IDEA Maps - Specification
**Version 1.2 - 2026-09-22**

Scoped with Mr. Pina on 2026-08-30 in the IDEA maps scoping chat. This document is the
spec. It authorizes no build by itself: build prompts are written from it only after
Mr. Pina says the spec is settled.

This file has exactly one home and it does not move when the build starts:
`docs/standards/IDEA_MAPS_SPEC.md` in `pina-hash/idea-app`, which is its freshness
authority, with the working copy in project knowledge and a row in `REGISTER.md`.
Fetch the mirror before editing it and again immediately before delivering it. Do not
create `docs/MAPS_SPEC.md`: a second home for a document that will be edited through
three build phases is a fork waiting to happen, and this project has already lost a
week of work to exactly that.

---

## 1. What IDEA Maps is

A public spatial index of the IDEA building. Anyone, signed in or not, can find any
room, any storage unit, and any individual item down to the drawer it lives in, with
photos and details at the deepest level. The map operates at descending levels:
building directory, room, storage unit, compartment, item. A search takes a person
from a word to the drawer.

It is a new surface inside `pina-hash/idea-app`. Not a separate repo, not a separate
app. It holds the migration slot for its wave: schema starts at **0159** (0158 is the
latest at scoping time; re-check at build time).

## 2. Decisions locked in scoping

| Decision | Choice |
|---|---|
| Read access | Fully public, no sign-in. Published data is anonymously readable on every read path. |
| Edit flow | Student edits are drafts. Mr. Pina publishes. Admin edits may save-and-publish in one action. |
| Delegation model | A grant names a container node and covers its whole subtree. No permission matrices. Grants ship in P2. |
| Item model | Two kinds: unique items (this specific machine, serial, own photos) and stocked types (hex keys, qty per location, may sit in several locations). |
| Location model | Containment chain, not coordinates. An item points at its container; geometry belongs to containers. |
| Units | Inches, canonical, everywhere. Entered as typed dimensions. |
| P1 geometry | Drawn in the editor as dimensioned shapes from the SolidWorks numbers. DXF import is P2. |
| Positioning | No live positioning. Search results render a staged route on the map. Beacon support is a schema note only. |
| Verticality | Top-down plan for navigation. Each storage unit carries an authored front elevation of its compartments. No 3D. |
| Route | `/maps`. |
| Search | First-class requirement, see section 5. Vocabulary goes well beyond item names. |

## 3. Explicitly out of scope

Stated so absence is not read as oversight:

- Checkout, borrowing, or possession tracking. Maps says where a thing lives, not who has it.
- Live positioning of any kind: GPS, blue-dot, beacons. Phone GPS is 3 to 5 meters
  outdoors and worse indoors; it cannot place a person at a drawer. Nodes may later
  carry a nullable beacon id. Nothing else is built for it.
- 3D rendering.
- Literal drawn walking paths. Requires a walkable-space graph; P2+ candidate. V1 uses
  staged highlights (section 6).
- DXF import in P1. Retracing one room by typed dimensions is an hour; the importer
  earns its cost at whole-building scale.
- Stock counting or inventory audit workflows. Quantities are recorded, not reconciled.

## 4. Domain model

Contract-level. Exact DDL is authored in the build session inside this shape, migrations
from 0159.

### 4.1 Nodes (containers)

One table of spatial containers, self-referencing:

- `id`, `parent_id`
- `kind`: `site`, `building`, `outdoor_zone`, `room`, `unit`, `compartment`. `unit` is
  any furniture-scale container (toolbox, shelf unit, cabinet, bench). `compartment` is
  a drawer, shelf level, or bin inside a unit, with a free-text subtype label.
- `name`, `description`, photos
- Geometry, in inches, positioned in the parent's frame: outline (rect or polygon),
  position, rotation. Rooms position against the building origin; units against their
  room; compartments have no plan geometry.
- **Reference face: the outline is the INTERIOR face of the space it describes.** Not
  the centerline and not the exterior. Every outline typed to date was measured by
  somebody standing inside a room, so reading the stored numbers as interior is what
  keeps every published row correct with no backfill; centerline or exterior would
  silently move every room by a wall thickness and make the existing data ambiguous. A
  240 inch room is 240 inches of usable space. Decision 36, 2026-09-14, built as
  migration 0224.
- **Wall thickness is a separate per-node value with a building-level default, and the
  wall is a band lying OUTWARD from the outline.** Two values, because a building's
  exterior wall and the partitions between its rooms are different numbers: the node's
  own thickness, and the default its descendants fall back to when they carry none.
  Resolution is own value, then the nearest ancestor carrying a default, then nothing.
  Nothing is the pre-0224 behaviour exactly -- a drawn line, no band -- and ZERO is a
  legal value that also draws a line but stops the inheritance walk, because it is an
  answer somebody gave rather than one nobody gave. Compartments carry no wall, as they
  carry no other plan geometry.
- **Thickness is uniform per node, not per edge.** A polygon room gets one number,
  applied to every edge and mitered at the corners. Per-edge was considered and refused:
  it needs a list parallel to `points` with nothing to keep the two in step when a
  corner is edited out, a second shape for `rect`, and a form asking for five numbers
  where a building index wants one. What it buys -- a room whose north wall is thicker
  than its south wall -- nobody has asked for.
- **Snapping has a face, and which one is decided by the relationship.** A thing being
  placed is INSIDE its parent, so it meets the parent's inner face, which is the outline
  exactly as typed; it is BESIDE a sibling, so it meets that sibling's outer face. The
  thing being placed presents its own outer face in both cases. With no thickness set
  the outer face is the inner face, so every placement made before 0224 is answered
  identically after it.
- Elevation, on `unit` nodes only: an ordered stack of its compartments with typed
  heights and widths. This is the side view for the last ten feet.
- Campus growth is only more nodes: `site` above `building`, `outdoor_zone` siblings of
  rooms. P3 adds no model.

### 4.2 Items

- `item_types`: canonical `name`, `aliases[]`, `tags[]`, `category`, `brand`, `model`,
  `part_number`, `description`, photos. The searchable vocabulary lives here.
- `items` (unique things): optional `item_type_id`, `serial`, condition notes, own
  photos, `node_id` (its container).
- `stock`: (`item_type_id`, `node_id`, `qty`). A stocked type placed somewhere.

### 4.3 Draft and publish

Every node, item type, item, and stock row carries `draft` or `published` state. Editing
a published object writes a pending revision; publishing promotes it and retains the
prior revision (revert is republishing it). Publish operates on a selection or a
subtree. Public reads see published state only, enforced by RLS: anon select where
published, editor roles required for anything else. Student editors (P2) can never
publish.

### 4.4 Photos

Storage bucket `maps-media`, public read. Photos attach to nodes, item types, and items.
Accepted: images only, ceiling set at build time. Public read on the bucket means a
draft photo is fetchable by URL before publish; accepted, because everything in this
system is destined to be public and nothing sensitive is ever photographed into it.

## 5. Search

The requirement, verbatim intent: a student who knows the wrong name, half a name, a
brand, a part number, or only what the thing does still finds it. Search quality is a
P1 acceptance criterion, not a polish item.

### 5.1 Indexed vocabulary

Per item type: name, aliases, tags, category, brand, model, part number, description.
Per unique item: serial and notes, plus its type's vocabulary. Per node: name and
description. Every indexed thing also carries its ancestor chain names, so
"mill room caliper" narrows by place.

### 5.2 Matching contract

Postgres-native, no external search service:

- Weighted full-text vector: A = name and aliases, B = tags, category, brand, model,
  part number, C = description, D = ancestor names.
- Trigram similarity (`pg_trgm`) unioned in for typos and partial tokens.
- Prefix matching for live results while typing.
- Results ranked and merged across the three; ties broken toward shallower items.

### 5.3 Result payload

The matched thing, its full containment chain, and the geometry references needed to
render the staged route (section 6). Never a bare row.

### 5.4 The vocabulary grows from misses

Every query is logged with its result count and timestamp, no identity (readers are
anonymous). An admin surface ranks zero-result and low-result queries by frequency and
offers one-tap "add as alias to ..." authoring. Logging ships in P1; the surface ships
in P2. Alias and tag edits are content and follow draft-and-publish like everything
else.

### 5.5 Acceptance

A fixture corpus with an adversarial query set: typos, synonyms, partial names,
brand-only, function queries ("thing that cuts aluminum" resolving via tags). Asserted
ranks, running in CI, shipping with P1. A search change that demotes a fixture query
fails.

## 6. Viewer (public)

- `/maps`, anonymous, published data only.
- Descending navigation: building directory and plan, room view with units, unit
  elevation with compartments, compartment contents, item detail with photos.
- Persistent search bar at every level.
- A search result opens a staged route: building plan with the room highlighted, room
  plan with the unit highlighted, elevation with the compartment highlighted, then the
  item card. The containment chain stays visible as a breadcrumb throughout.
- Mobile and desktop are both first-class widths, verified at both viewport ends per
  `IDEA_INTERFACE_STANDARDS.md`.
- Tokens from `src/lib/design-system/`; `src/app.css` is never edited. Maps gets its own
  accent identity per the per-app accent pattern, decided in a Claude Design pass, not
  invented in the build session.

## 7. Editor

P1 ships it admin-only. P2 opens it to granted students.

- Draw dimensioned shapes: typed inch dimensions, drag placement, snapping, parent
  assignment. Accuracy comes from the typed numbers, not the mouse.
- Elevation editor per unit: stack compartments with typed heights, name them.
- Item entry at the shelf is the highest-frequency action and gets the most polish:
  mobile camera capture, name, aliases, tags, container, in one flow, standing at the
  toolbox with a phone.
- Draft per object; publish per selection or subtree; admin save-and-publish in one
  action.
- P2 grants: (`user`, `node`) rows meaning subtree edit rights, draft-only. Publish
  stays admin. Revision history gets a surface.

## 8. Phasing

- **P1, vertical slice, one room end to end.** Schema (0159+), admin editor (shapes,
  elevations, item entry, draft and publish), public viewer with staged-route search,
  search per section 5 including miss logging and the CI corpus, photo capture and
  storage. One real room fully cataloged is the acceptance artifact.
- **P2.** DXF import from the SolidWorks sketches, student editor grants, whole-building
  layout, search-miss admin surface, revision history surface.
- **P3.** Outdoor zones, scrap shed, campus. Model already supports it; this is content
  plus the `site` level in the viewer.

## 9. Verification requirements

- Interactive bundles carry a dev-guarded harness route (renders only when dev, 404 in
  production, no auth, no Supabase) with browser verification before finishing.
- Tests assert rendered output, not source text. `IDEA_VERIFICATION_ADDENDA.md` governs.
- RLS proof in the db harness: anonymous reads published rows, cannot read drafts,
  driven both signed-in and anonymous through the PostgREST shim.
- Search corpus per 5.5.
- Migration states confirmed separately: delivered, landed, applied.

## 10. Deliberately undecided

- Maps accent identity (Claude Design pass).
- DXF import specifics (scoped at P2).
- Walkable-space graph for drawn paths (P2+ if ever).
- Anything beacon-shaped beyond a nullable column note.
- **Per-edge snapping for a polygon.** A polygon's snap targets are its axis-aligned
  bounding box rather than its real edges, for both faces alike, so a five-sided room
  already snaps to lines that are not its walls. That predates wall thickness and is
  independent of it: 0224 left it exactly as it found it, because the outer face's box
  is derived the same way as the inner one's and the two therefore stay consistent with
  each other. Fixing it is real per-edge geometry in the editor's drag arithmetic and is
  its own bundle. It is recorded here rather than left unwritten because it is the one
  thing about maps geometry that does not do what a reader of this section would assume.
  Note that the polygon's DRAWN faces are exact -- the wall band is a true mitered
  offset -- so what is approximate is where a shape snaps, never what is on screen.

## Changelog

- **1.2 (2026-09-22).** Wall thickness, from Mr. Pina's report of 2026-09-14 ("wall
  thicknesses must be accounted for") and decision 36, which he delegated. Section 4.1
  gains the reference face -- the outline is the INTERIOR face of the space -- plus the
  two-value thickness model with its building-level default, the answer that thickness
  is uniform per node rather than per edge, and the rule that snapping now has a face
  chosen by the relationship. Section 10 gains the pre-existing polygon bounding-box
  snap as a named open item; it was already true and was nowhere written down. No
  scoping decision was reopened, and nothing here changes what an already-published
  row means -- which is the whole reason the interior face was the answer.
- **1.1 (2026-08-30).** Closeout pass. Registered as a standards file: mirrored to
  `docs/standards/IDEA_MAPS_SPEC.md` with a `REGISTER.md` row, so it now has a freshness
  authority the way every other multi-session document does. The 1.0 preamble planned a
  move to `docs/MAPS_SPEC.md` once the build started, which would have left the same
  document at two paths across P1 to P3; the preamble now names one home and forbids the
  second. No scoping decision changed.
- **1.0 (2026-08-30).** Initial specification from the scoping chat. Decisions taken
  with Mr. Pina by tappable choice: public read, draft-and-publish with admin-only
  publish. Search vocabulary requirement strengthened at his direction beyond names to
  aliases, tags, function vocabulary, and miss-driven growth.
