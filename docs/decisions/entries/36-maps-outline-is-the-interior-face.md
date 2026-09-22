# 36 A Maps outline is the interior face

- Raised: 2026-09-14  By: feedback report 38, filed by Mr. Pina, "wall
  thicknesses must be accounted for"
- Status: DECIDED 2026-09-21 by Mr. Pina, who said "i dont know what this
  means. use your best judgement", so the answer below is this assistant's
  and is recorded as such.
- Build: OPEN. Not built by this bundle. The surfaces are
  `src/lib/maps/maps.ts` (`mapsFootprint`, `mapsSnapTargets`,
  `mapsPlaceShape`), the editor canvas `src/lib/maps/PlanCanvas.svelte`, and
  the public viewer `src/lib/maps/viewer/MapsPlan.svelte`.

## The decision

**The typed outline is the INTERIOR face of the space it describes.** Wall
thickness is a separate per-node value with a building-level default, and a
wall is drawn as a band lying OUTWARD from the outline.

## Why, because it is the whole argument

Every outline already in the database was typed by somebody measuring a room,
and a room is measured on the inside. Reading the stored numbers as interior
keeps every existing published row correct with no backfill. Reading them as
centerline or exterior would silently move every room by a wall thickness and
would make the existing data ambiguous, which is the thing this decision
exists to prevent. A 240 inch room stays 240 inches of usable space.

## The three consequences, recorded so the build session does not have to rediscover them

1. **Thickness is nullable with a building default**, so a node that has
   never been given one behaves exactly as it does today. Zero is a legal
   value and means a drawn line.
2. **Snapping gains a face.** A unit placed inside a room snaps to the room's
   INNER face, which is the outline as typed. A room placed against a
   building snaps to the building's OUTER face. Confirmed against the tree:
   today `mapsSnapTargets` (`src/lib/maps/maps.ts`) offers exactly one box per
   target, built from `mapsFootprint` -- a plain bounding box with no notion
   of a face -- and its own tie-break comment on `mapsPlaceShape` reads "a
   wall is the edge somebody means when two candidates coincide" (verbatim,
   same file), which stops describing a single edge the moment a wall has
   two faces on either side of a thickness.
3. **The viewer must answer a question it currently avoids.**
   `src/lib/maps/viewer/MapsPlan.svelte` draws walls with `vector-effect:
   non-scaling-stroke` deliberately -- its own comment says this is so
   "a small room does not draw with fat walls" (verbatim) -- so a hairline is
   one device pixel at every scale regardless of the room's real size. A band
   with a real dimension reverses that on purpose and needs its own answer for
   how a thin wall reads at 375px, where a literal wall-thickness stroke could
   be thinner than the hairline it replaces or could visually swallow a small
   room.

## What is still open, and this entry does not answer it

Whether a polygon room's thickness is uniform per edge or per node. Today a
polygon already snaps to its bounding box rather than its real edges --
confirmed: `mapsFootprint` computes `minX/minY/maxX/maxY` over
`mapsShapeCorners` for both the `rect` and `polygon` outline kinds alike, with
no per-edge branch, so `mapsSnapTargets`'s one box per target is already an
axis-aligned rectangle even for a five-sided room. That is a separate,
existing defect worth naming here rather than folding into this decision: a
polygon's real edges are not consulted for snapping today, wall thickness or
not, and fixing it is independent of picking interior-face semantics.

## Context

- Feedback report 38 (Mr. Pina, 2026-09-14) -- the raised question.
- `docs/standards/IDEA_MAPS_SPEC.md` -- the owning spec this decision's build
  will need to extend with the thickness column and the two-face snap.
- `src/lib/maps/maps.ts` -- `mapsFootprint`, `MapsSnapTarget`,
  `mapsSnapTargets`, `mapsPlaceShape`, all read as they stand today rather
  than assumed.
- `src/lib/maps/viewer/MapsPlan.svelte` -- the public viewer's
  `non-scaling-stroke` rule and its own stated reason.
- `src/lib/maps/PlanCanvas.svelte` -- the editor's canvas, which draws the
  same shapes while a node is being placed and inherits the same open
  question about how a band reads at small sizes.
