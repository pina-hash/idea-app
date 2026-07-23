/**
 * GREENLINE track VISUALS: the one place the drivable surface becomes geometry.
 *
 * The rig-visual.ts convention, applied to the track. `GreenlineRace.svelte`
 * built the ribbon mesh, edge lines, boundary walls and gate panes inline; the
 * piece-chain builder's 3D preview needs exactly those, and a second
 * implementation would be free to disagree with the road the game actually
 * renders and collides. So the geometry construction lives here and BOTH mount
 * it: what an author sees in the builder is by construction the surface the
 * race sweeps.
 *
 * The chain is unchanged and single: `compileSurface` -> `buildRuntime` ->
 * `leftEdge3`/`rightEdge3` -> these builders (and, in the race, the physics
 * Trimesh off the SAME two edge arrays). Nothing here recomputes a pose, a
 * sweep, an elevation or a bank; it reads the runtime the compiler produced.
 *
 * Geometry only, materials at the call site: the race dresses its ribbon in
 * worn asphalt under night lighting, the builder wants a flat readable surface,
 * and neither should have to inherit the other's look to share a shape.
 *
 * three.js is passed IN (the rig-visual.ts pattern) rather than imported, so
 * this module stays free of a static three dependency and both callers keep
 * their dynamic browser-only import.
 */

import type * as THREE_NS from 'three';
import type { GateRuntime, RibbonRuntime, TrackRuntime, TrackVec3 } from './track-runtime';
import { surfaceProbe, surfaceYAt } from './track-runtime';
import type { TrackBoundary } from './track-schema';

type ThreeModule = typeof THREE_NS;

/** Ribbon surface sits this far above the swept centerline plane, meters. */
export const RIBBON_LIFT_M = 0.03;
/** Painted edge lines sit this far above the swept edge, meters. */
export const EDGE_LINE_LIFT_M = 0.06;

/**
 * How far the run-off SHOULDER extends past each ribbon edge, meters.
 *
 * MEASURED, not guessed. Two distances have to fit inside it:
 *  - the authored elevated run-off margin, i.e. how far past the edge the
 *    boundary line sits before the soft wall engages at all (Terminal Nine
 *    narrows to 1.6 m beside its 13.5 m deck, piece-proof-01 to 1.8 m), plus
 *  - how deep past that line the wall actually lets a car go before it
 *    arrests it. Driven on piece-proof-01's elevated straight at 18/25/35
 *    degree approach angles, that came out at 2.07 / 2.08 / 2.48 m.
 * 1.8 + 2.5 is 4.3, so 5.5 leaves real headroom. An earlier 3 m strip ran out
 * of ground mid-arrest and the car fell anyway, which is the whole failure
 * this is here to fix — see `deckShoulderMesh`.
 *
 * Deliberately NOT sized to make a raised deck impossible to leave: a car
 * driven hard off the side still goes, and a deck-edge cliff jump (Terminal
 * Nine authors one on purpose) is untouched, because the shoulder only ever
 * extends the cross-section SIDEWAYS, never forward past the end of the road.
 */
export const SHOULDER_M = 5.5;
/**
 * A sample only gets shoulder/slab/support treatment once its surface is this
 * far above the apron plane, meters. Below it the flat y-0 plane already IS
 * the run-off ground, so a shoulder there would be a coincident duplicate.
 * Deliberately the same 0.5 m the race's chassis floor uses to decide the
 * plane is no longer doing the job.
 */
export const DECK_MIN_RISE_M = 0.5;
/** Supports appear once the deck is this far above the apron, meters. */
const SUPPORT_MIN_RISE_M = 2;
/** Target spacing between supports along an elevated run, meters. */
const SUPPORT_SPACING_M = 17;
/** Boundary points further than this off the ribbon edge stand on the apron. */
const BOUNDARY_TRACKSIDE_M = 20;

/** Raw triangle soup: the ONE form both a BufferGeometry and a Trimesh read. */
export interface MeshData {
	positions: number[];
	indices: number[];
}

/** MeshData -> BufferGeometry, so a caller never re-derives the numbers. */
export function toGeometry(THREE: ThreeModule, mesh: MeshData): THREE_NS.BufferGeometry {
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
	geo.setIndex(mesh.indices);
	geo.computeVertexNormals();
	return geo;
}

/**
 * The banked lateral unit vector at sample `i`, recovered from the sweep
 * itself (centerline -> left edge) rather than recomputed from tangents and
 * bank angles. Reading it back off `leftEdge3`/`rightEdge3` is what guarantees
 * anything built out here shares the road's exact cross-section plane, bank
 * included, with no second derivation to drift.
 */
function lateralAt(path: RibbonRuntime, i: number): TrackVec3 {
	const L = path.leftEdge3[i];
	const R = path.rightEdge3[i];
	const dx = (L.x - R.x) / 2;
	const dy = (L.y - R.y) / 2;
	const dz = (L.z - R.z) / 2;
	const len = Math.hypot(dx, dy, dz) || 1;
	return { x: dx / len, y: dy / len, z: dz / len };
}

/** Is this sample high enough above the apron to need a real deck structure? */
function raisedAt(path: RibbonRuntime, i: number, minRise: number): boolean {
	return Math.min(path.leftEdge3[i].y, path.rightEdge3[i].y) > minRise;
}

/**
 * The outermost silhouette of the deck: the shoulder point where the ribbon is
 * raised, the bare road edge where it is not. Everything that gives the deck
 * physical presence (slab skirt, underside, supports) hangs off THIS, so the
 * road, its shoulder and its slab read as one solid object.
 *
 * The strip runs out HORIZONTALLY at the edge's own height rather than
 * continuing the banked cross-section plane, and that is a correctness
 * requirement, not a style choice. `surfaceYAt` clamps a query past the edge
 * to that edge's height — so the runtime ALREADY declares the surface out here
 * to be flat at the edge, and the shoulder simply has to BE that surface. An
 * earlier version raked the strip along the bank instead, which put real
 * ground BELOW the height the runtime reported on the low side of every banked
 * deck; the race's chassis-floor watchdog read the difference as a car sunk
 * through the floor and shoved it back up 467 times in a single pass over
 * Terminal Nine's banked sweeper, against 8 before. Flat at the edge height,
 * the two agree exactly and the watchdog has nothing to correct.
 */
function outerSilhouette(
	path: RibbonRuntime,
	extraM: number,
	minRise: number
): { left: TrackVec3[]; right: TrackVec3[] } {
	const left: TrackVec3[] = [];
	const right: TrackVec3[] = [];
	for (let i = 0; i < path.center.length; i++) {
		const n = lateralAt(path, i);
		// Horizontal component only: a banked edge still runs its shoulder out
		// level, matching what `surfaceYAt` reports beyond the ribbon.
		const hl = Math.hypot(n.x, n.z) || 1;
		const e = raisedAt(path, i, minRise) ? extraM : 0;
		const L = path.leftEdge3[i];
		const R = path.rightEdge3[i];
		left.push({ x: L.x + (n.x / hl) * e, y: L.y, z: L.z + (n.z / hl) * e });
		right.push({ x: R.x - (n.x / hl) * e, y: R.y, z: R.z - (n.z / hl) * e });
	}
	return { left, right };
}

/**
 * The run-off SHOULDER: a strip of real ground continuing the road's own
 * cross-section plane `extraM` past each edge, emitted only where the ribbon
 * is raised.
 *
 * This exists because of a measured gap, not for looks. The soft wall is a
 * horizontal spring that only engages once a vehicle is past the boundary
 * polygon, and on an elevated deck the authored run-off margin puts that line
 * ~1.8 m BEYOND the last collision surface. So a car leaving the deck edge
 * crossed 1.8 m of thin air, lost every wheel contact, and was already
 * ballistic by the time the wall had anything to push against — it fell to the
 * y-0 catch plane instead of being caught. On a flat track that strip is solid
 * ground (the apron plane), which is exactly why the wall works there. The
 * shoulder restores that same ground at height, so the soft-wall doctrine
 * behaves identically raised or not; it is deliberately NOT a hard collision
 * wall, which the track runtime rules out on purpose.
 *
 * Sits OUTSIDE the ribbon, so `onRibbon` (a half-width test) is untouched and
 * a vehicle out here still takes the off-track drag it always did.
 *
 * Returns null when a path never rises — flat tracks build nothing and keep
 * their plane-only physics exactly as before.
 */
export function deckShoulderMesh(
	path: RibbonRuntime,
	extraM = SHOULDER_M,
	minRise = DECK_MIN_RISE_M
): MeshData | null {
	const n = path.center.length;
	const { left, right } = outerSilhouette(path, extraM, minRise);
	const positions: number[] = [];
	const indices: number[] = [];
	const push = (p: TrackVec3) => {
		positions.push(p.x, p.y, p.z);
		return positions.length / 3 - 1;
	};
	const quads = path.closed ? n : n - 1;
	let any = false;
	for (let i = 0; i < quads; i++) {
		const j = (i + 1) % n;
		// One quad feathers past the end of a raised run, so a shoulder covers
		// every elevated sample and tapers into flat ground rather than ending
		// mid-air.
		if (!raisedAt(path, i, minRise) && !raisedAt(path, j, minRise)) continue;
		any = true;
		// Left strip: the shoulder point plays the road's "left" role, the road
		// edge its "right", so the winding matches the ribbon and normals face
		// UP. Up-facing normals are load-bearing, not cosmetic: `world.rayTest`
		// skips backfaces, so a flipped strip is invisible to the wheel rays.
		const lo = push(left[i]);
		const lo2 = push(left[j]);
		const li = push(path.leftEdge3[i]);
		const li2 = push(path.leftEdge3[j]);
		indices.push(lo, lo2, li, li, lo2, li2);
		// Right strip: roles reversed (road edge is the "left" of this pair).
		const ri = push(path.rightEdge3[i]);
		const ri2 = push(path.rightEdge3[j]);
		const ro = push(right[i]);
		const ro2 = push(right[j]);
		indices.push(ri, ri2, ro, ro, ri2, ro2);
	}
	return any ? { positions, indices } : null;
}

/**
 * The deck SLAB: the raised road extruded down to a real thickness, so an
 * elevated span reads as an object rather than a two-sided plane. Emits the
 * two side faces plus the underside, hung off `outerSilhouette` so the road
 * and its shoulder share one continuous edge.
 *
 * PURELY DECORATIVE. Nothing here is ever handed to physics: the drivable
 * surface is the ribbon trimesh and the run-off is the shoulder, both built
 * above. Thickness scales with the deck's own width so a wide deck does not
 * look like a sheet of paper and a narrow spur does not look like a bridge
 * pier.
 */
export function deckSlabMesh(
	path: RibbonRuntime,
	extraM = SHOULDER_M,
	minRise = DECK_MIN_RISE_M
): MeshData | null {
	const n = path.center.length;
	const { left, right } = outerSilhouette(path, extraM, minRise);
	const thickAt = (i: number) => Math.max(0.4, Math.min(1.4, path.halfWidths[i] * 0.16));
	const positions: number[] = [];
	const indices: number[] = [];
	// Clamped at the apron: a deck only just over `minRise` is shallower than a
	// full slab is thick, so an unclamped underside sank up to 0.63 m THROUGH
	// the y-0 plane and the skirt showed up poking out of the ground beside the
	// road. Clamping shortens the skirt to meet the apron exactly where the
	// deck is low, which is what a real structure does as it comes down to
	// grade.
	const push = (p: TrackVec3, drop = 0) => {
		positions.push(p.x, Math.max(0, p.y - drop), p.z);
		return positions.length / 3 - 1;
	};
	const quads = path.closed ? n : n - 1;
	let any = false;
	for (let i = 0; i < quads; i++) {
		const j = (i + 1) % n;
		if (!raisedAt(path, i, minRise) && !raisedAt(path, j, minRise)) continue;
		any = true;
		const ti = thickAt(i);
		const tj = thickAt(j);
		// Left face (outward-facing), right face, then the underside.
		const a = push(left[i]);
		const b = push(left[j]);
		const c = push(left[i], ti);
		const d = push(left[j], tj);
		indices.push(a, c, b, b, c, d);
		const e = push(right[i]);
		const f = push(right[j]);
		const g = push(right[i], ti);
		const h = push(right[j], tj);
		indices.push(e, f, g, g, f, h);
		indices.push(c, d, h, c, h, g);
	}
	return any ? { positions, indices } : null;
}

/**
 * Append an axis-aligned-in-local box, yawed about y, to a mesh soup.
 *
 * Each face gets its OWN four vertices rather than sharing eight corners.
 * Sharing is cheaper but leaves `computeVertexNormals` averaging three faces
 * per corner, which shades a box like a rounded lump — precisely the soft,
 * unstructural read this geometry exists to avoid. Four verts per face keeps
 * every edge crisp; at ~190 boxes on the busiest track the extra vertices are
 * nothing next to the draw call already saved by merging them all into one
 * mesh.
 */
function pushBox(
	m: MeshData,
	cx: number,
	cy: number,
	cz: number,
	sx: number,
	sy: number,
	sz: number,
	yaw: number
): void {
	const co = Math.cos(yaw);
	const si = Math.sin(yaw);
	const corner = (ux: number, uy: number, uz: number) => {
		const lx = (ux * sx) / 2;
		const lz = (uz * sz) / 2;
		m.positions.push(cx + lx * co - lz * si, cy + (uy * sy) / 2, cz + lx * si + lz * co);
	};
	// Each row is one face, wound counter-clockwise seen from OUTSIDE.
	const faces: [number, number, number][][] = [
		[
			[-1, -1, 1],
			[1, -1, 1],
			[1, -1, -1],
			[-1, -1, -1]
		], // bottom
		[
			[-1, 1, -1],
			[1, 1, -1],
			[1, 1, 1],
			[-1, 1, 1]
		], // top
		[
			[-1, -1, -1],
			[1, -1, -1],
			[1, 1, -1],
			[-1, 1, -1]
		],
		[
			[1, -1, -1],
			[1, -1, 1],
			[1, 1, 1],
			[1, 1, -1]
		],
		[
			[1, -1, 1],
			[-1, -1, 1],
			[-1, 1, 1],
			[1, 1, 1]
		],
		[
			[-1, -1, 1],
			[-1, -1, -1],
			[-1, 1, -1],
			[-1, 1, 1]
		]
	];
	for (const f of faces) {
		const base = m.positions.length / 3;
		for (const [ux, uy, uz] of f) corner(ux, uy, uz);
		m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
	}
}

/**
 * Trestle SUPPORTS under an elevated run: a pair of legs down to the apron
 * plus a cross-beam and braces, repeated along the deck at roughly
 * `SUPPORT_SPACING_M`. Answers the question an elevated span otherwise begs —
 * what is holding this up.
 *
 * PURELY DECORATIVE, like the slab: no body, no shape, never handed to
 * cannon-es. Everything is merged into ONE mesh per path so a fully supported
 * circuit costs a single draw call, which matters on the 6-8 year old school
 * desktops this targets.
 */
export function deckSupportsMesh(
	path: RibbonRuntime,
	extraM = SHOULDER_M,
	minRise = DECK_MIN_RISE_M
): MeshData | null {
	const n = path.center.length;
	const { left, right } = outerSilhouette(path, extraM, minRise);
	const m: MeshData = { positions: [], indices: [] };
	let sinceLast = Infinity;
	let any = false;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		const step = Math.hypot(path.center[j].x - path.center[i].x, path.center[j].z - path.center[i].z);
		const deckY = (left[i].y + right[i].y) / 2;
		// Only where the deck is genuinely up in the air; a kerb-height berm
		// wants no scaffolding under it.
		if (deckY < SUPPORT_MIN_RISE_M) {
			sinceLast = Infinity;
			continue;
		}
		if (sinceLast < SUPPORT_SPACING_M) {
			sinceLast += step;
			continue;
		}
		sinceLast = 0;
		any = true;
		const thick = Math.max(0.4, Math.min(1.4, path.halfWidths[i] * 0.16));
		const c = path.center[i];
		const nx = path.center[j].x - path.center[i].x;
		const nz = path.center[j].z - path.center[i].z;
		const yaw = Math.atan2(nx, nz);
		const lat = lateralAt(path, i);
		const arm = path.halfWidths[i] * 0.62;
		const legW = Math.max(0.45, Math.min(1.1, path.halfWidths[i] * 0.12));
		for (const s of [1, -1]) {
			const lx = c.x + lat.x * arm * s;
			const lz = c.z + lat.z * arm * s;
			// The deck tilts with the bank, so each leg meets its own underside.
			const top = deckY + lat.y * arm * s - thick;
			if (top <= 0.6) continue;
			pushBox(m, lx, top / 2, lz, legW, top, legW, yaw);
		}
		// Cross-beam just under the slab, plus a lower brace on tall bents.
		const beamY = deckY - thick - 0.35;
		if (beamY > 1) {
			pushBox(m, c.x, beamY, c.z, arm * 2 + legW, 0.42, legW * 0.8, yaw + Math.PI / 2);
			if (beamY > 4.5)
				pushBox(m, c.x, beamY * 0.45, c.z, arm * 2 + legW, 0.34, legW * 0.7, yaw + Math.PI / 2);
		}
	}
	return any ? m : null;
}
/** Texture tiling distance along the centerline, meters. */
const RIBBON_TILE_M = 13.5;
/** Braking-zone wear ramp length before a gate, meters. */
const WEAR_APPROACH_M = 30;
/** Braking-zone wear ramp length past a gate (closed paths), meters. */
const WEAR_PAST_M = 9;

/**
 * The swept road surface for ONE path (the main line or a branch spur; a
 * branch is real road and gets the same treatment). Returns geometry with:
 * - `position` from the 3D sweep (`leftEdge3`/`rightEdge3` — the same arrays
 *   the physics Trimesh is built from, lifted `RIBBON_LIFT_M` so the paint
 *   never z-fights the collision surface),
 * - `uv` running with cumulative centerline distance, so a texture tiles by
 *   real meters rather than by sample count,
 * - `color` carrying the rubbered-in braking-zone darkening near gates,
 * - indices wound so the right-hand-rule normals point UP. That winding is
 *   load-bearing: the original faced DOWN, which FrontSide culling silently
 *   hid — invisible against the apron on a flat track, but a see-through hole
 *   on an elevated span.
 *
 * A closed path emits one extra duplicated ring carrying the end-of-loop u, so
 * the closing quad does not smear the texture backwards.
 */
export function buildRibbonGeometry(
	THREE: ThreeModule,
	path: RibbonRuntime,
	gates: GateRuntime[]
): THREE_NS.BufferGeometry {
	const nP = path.center.length;
	const closed = path.closed;
	const cum: number[] = [0];
	for (let i = 1; i < nP; i++)
		cum[i] =
			cum[i - 1] +
			Math.hypot(path.center[i].x - path.center[i - 1].x, path.center[i].z - path.center[i - 1].z);
	const total = closed
		? cum[nP - 1] +
			Math.hypot(path.center[0].x - path.center[nP - 1].x, path.center[0].z - path.center[nP - 1].z)
		: cum[nP - 1];
	// Only gates that actually sit on THIS path get a wear ramp on it, so a
	// branch does not inherit rubber from a gate 200 m away on the main line.
	const gateS: number[] = [];
	for (const g of gates) {
		let best = 0;
		let bd = Infinity;
		for (let i = 0; i < nP; i++) {
			const d = (path.center[i].x - g.gate.x) ** 2 + (path.center[i].z - g.gate.z) ** 2;
			if (d < bd) {
				bd = d;
				best = i;
			}
		}
		if (bd <= (path.maxHalfWidth + 12) ** 2) gateS.push(cum[best]);
	}
	const wearAt = (s: number) => {
		let w = 0;
		for (const gs of gateS) {
			const d = closed ? (((gs - s) % total) + total) % total : Math.max(0, gs - s);
			if (d < WEAR_APPROACH_M) w = Math.max(w, 1 - d / WEAR_APPROACH_M);
			else if (closed && total - d < WEAR_PAST_M)
				w = Math.max(w, (1 - (total - d) / WEAR_PAST_M) * 0.5);
		}
		return w;
	};
	const rings = closed ? nP + 1 : nP;
	const verts = new Float32Array(rings * 2 * 3);
	const uvs = new Float32Array(rings * 2 * 2);
	const cols = new Float32Array(rings * 2 * 3);
	for (let i = 0; i < rings; i++) {
		const j = i % nP;
		const s = i === nP ? total : cum[i];
		verts.set(
			[path.leftEdge3[j].x, path.leftEdge3[j].y + RIBBON_LIFT_M, path.leftEdge3[j].z],
			i * 6
		);
		verts.set(
			[path.rightEdge3[j].x, path.rightEdge3[j].y + RIBBON_LIFT_M, path.rightEdge3[j].z],
			i * 6 + 3
		);
		uvs.set([s / RIBBON_TILE_M, 0], i * 4);
		uvs.set([s / RIBBON_TILE_M, 1], i * 4 + 2);
		const tone = 1 - 0.5 * wearAt(s);
		cols.set([tone, tone, tone], i * 6);
		cols.set([tone, tone, tone], i * 6 + 3);
	}
	const idx: number[] = [];
	for (let i = 0; i < rings - 1; i++)
		idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
	geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
	geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
	geo.setIndex(idx);
	geo.computeVertexNormals();
	return geo;
}

/**
 * The two painted edge lines of a path, as point lists ready for a Line. A
 * closed path repeats its first point so the loop shuts.
 */
export function edgeLinePoints(path: RibbonRuntime): { x: number; y: number; z: number }[][] {
	return [path.leftEdge3, path.rightEdge3].map((edge) => {
		const loop = path.closed ? [...edge, edge[0]] : edge;
		return loop.map((p) => ({ x: p.x, y: p.y + EDGE_LINE_LIFT_M, z: p.z }));
	});
}

/**
 * A boundary loop as an upright wall band of `height`, standing on the ground
 * the boundary actually runs over.
 *
 * Pass `rt` and each post is footed at the LOCAL surface height, read from the
 * same swept runtime the road is built from (`surfaceProbe`, which clamps a
 * point past the ribbon edge to that edge's height, bank included). Without it
 * the band was pinned to y 0 for every track: beside piece-proof-01's raised
 * deck that drew the wall 6.4 m BELOW the road it marks, and on any elevated
 * span the boundary simply was not where the driver could see it.
 *
 * Two grounds, one rule — the same one the race's scenery placement uses: a
 * point within `BOUNDARY_TRACKSIDE_M` of the ribbon edge rides the ribbon's
 * local surface, anything further out stays on the apron plane. The physical
 * boundary is unaffected either way; it is a top-down polygon test that
 * already applies at every height (see `surfaceState`), so this brings the
 * VISUAL into agreement with a rule that was always height-independent.
 *
 * Omitting `rt` keeps the flat y-0 band, so a caller with no runtime in hand
 * is unchanged.
 */
export function buildBoundaryGeometry(
	THREE: ThreeModule,
	boundary: TrackBoundary,
	height = 0.9,
	rt?: TrackRuntime
): THREE_NS.BufferGeometry {
	const m = boundary.points.length;
	const verts = new Float32Array(m * 2 * 3);
	const baseY = (x: number, z: number) => {
		if (!rt?.hasRelief) return 0;
		const s = surfaceProbe(rt, x, z);
		return s.edgeGap <= BOUNDARY_TRACKSIDE_M ? s.y : 0;
	};
	for (let i = 0; i < m; i++) {
		const p = boundary.points[i];
		const y = baseY(p.x, p.z);
		verts.set([p.x, y, p.z], i * 6);
		verts.set([p.x, y + height, p.z], i * 6 + 3);
	}
	const idx: number[] = [];
	const last = boundary.closed ? m : m - 1;
	for (let i = 0; i < last; i++) {
		const j = (i + 1) % m;
		idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
	geo.setIndex(idx);
	return geo;
}

/**
 * A gate marker: two posts and a translucent pane across the gate line. The
 * visual sits on the LOCAL surface height (relief tracks); the crossing math
 * itself stays top-down 2D and is unaffected by height. The materials come
 * back so a caller can recolor one live (the race highlights the next
 * checkpoint this way).
 */
export function buildGatePane(
	THREE: ThreeModule,
	rt: TrackRuntime,
	g: GateRuntime,
	color: number,
	opacity: number,
	postGeo?: THREE_NS.BufferGeometry
): {
	group: THREE_NS.Group;
	mat: THREE_NS.MeshBasicMaterial;
	postMat: THREE_NS.MeshBasicMaterial;
} {
	const group = new THREE.Group();
	const gy = surfaceYAt(rt, g.gate.x, g.gate.z);
	const mat = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity,
		side: THREE.DoubleSide,
		depthWrite: false
	});
	const postMat = new THREE.MeshBasicMaterial({ color });
	const posts = postGeo ?? new THREE.CylinderGeometry(0.22, 0.22, 2.6, 10);
	for (const [px, pz] of [
		[g.ax, g.az],
		[g.bx, g.bz]
	]) {
		const post = new THREE.Mesh(posts, postMat);
		post.position.set(px, gy + 1.3, pz);
		group.add(post);
	}
	const pane = new THREE.Mesh(new THREE.PlaneGeometry(g.gate.halfWidth * 2, 2.6), mat);
	pane.position.set(g.gate.x, gy + 1.3, g.gate.z);
	pane.rotation.y = Math.atan2(g.dx, g.dz);
	group.add(pane);
	return { group, mat, postMat };
}
