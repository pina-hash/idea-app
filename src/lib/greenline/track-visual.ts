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
import { otherStretchAt, surfaceProbe, surfaceYAt } from './track-runtime';
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
/**
 * Rise at which a jump's fill starts. Lower than the deck threshold because a
 * kicker's mass should appear as soon as the road leaves the ground — the
 * point of the fill is that the ramp is built UP from the apron.
 */
export const JUMP_FILL_MIN_RISE_M = 0.12;
/** Supports appear once the deck is this far above the apron, meters. */
const SUPPORT_MIN_RISE_M = 2;
/** Target spacing between supports along an elevated run, meters. */
const SUPPORT_SPACING_M = 17;
/** Boundary points further than this off the ribbon edge stand on the apron. */
const BOUNDARY_TRACKSIDE_M = 20;
/**
 * Vertical clearance every deck structure must leave over ANOTHER pass of
 * the same road (a self-crossing chain, Terminal-Nine-style overpasses built
 * in the piece builder). A shoulder ledge, slab skirt, or jump fill ending
 * inside this window over the other pass would read as furniture in the
 * roadway; a proper overpass (several meters of clearance) is far outside it
 * and gets exactly the pre-overpass geometry.
 */
export const OVERPASS_CLEAR_M = 2.75;

/**
 * The lowest y a structure hung downward from `(x, z, topY)` may reach,
 * given whatever OTHER pass of the road runs underneath: over that pass's
 * roadway it must stop `OVERPASS_CLEAR_M` above the surface (the roadway
 * stays open), over its run-off strip it sits on that ground, and past the
 * strip the apron (0) is the floor as before. Returns 0 — today's behavior
 * exactly — everywhere the path never self-overlaps.
 */
function underFloorAt(path: RibbonRuntime, i: number, x: number, z: number, topY: number): number {
	if (!path.overlapZones.length) return 0;
	let floor = 0;
	for (const m of otherStretchAt(path, i, x, z)) {
		if (m.y >= topY - 0.2) continue;
		const f =
			m.absLat <= m.hw + 0.75
				? m.y + OVERPASS_CLEAR_M
				: m.absLat <= m.hw + SHOULDER_M + 1
					? m.y
					: 0;
		floor = Math.max(floor, Math.min(topY, f));
	}
	return floor;
}

/**
 * How far the shoulder at sample `i` may extend on the given side (`sign`
 * +1 = left) before it would intrude into another pass's drivable envelope:
 * the strip runs out at the edge's own height, so anywhere it would cross
 * the other pass's corridor less than `OVERPASS_CLEAR_M` above that road
 * (or below it, poking up through), it stops short instead. A clean
 * overpass — the other road several meters down — never clips, so the strip
 * is exactly what it was; the clip bites only where the two passes are at
 * SIMILAR heights (the start of a climb-over), which is precisely where a
 * ledge across the other corridor would catch wheels.
 */
function clippedShoulderExtra(
	path: RibbonRuntime,
	i: number,
	sign: 1 | -1,
	extraM: number
): number {
	if (!path.overlapZones.length || extraM <= 0) return extraM;
	const E = sign > 0 ? path.leftEdge3[i] : path.rightEdge3[i];
	const n = lateralAt(path, i);
	const hl = Math.hypot(n.x, n.z) || 1;
	const dx = (n.x / hl) * sign;
	const dz = (n.z / hl) * sign;
	const STEP = 0.75;
	for (let s = STEP; s <= extraM + 1e-6; s += STEP) {
		for (const m of otherStretchAt(path, i, E.x + dx * s, E.z + dz * s)) {
			if (m.absLat <= m.hw + 0.75 && E.y > m.y - 0.3 && E.y < m.y + OVERPASS_CLEAR_M)
				return Math.max(0, s - STEP);
		}
	}
	return extraM;
}

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
		const raised = raisedAt(path, i, minRise);
		// Per side, because a self-crossing road can have the OTHER pass on
		// one side only: each strip stops short of that pass's envelope.
		const eL = raised ? clippedShoulderExtra(path, i, 1, extraM) : 0;
		const eR = raised ? clippedShoulderExtra(path, i, -1, extraM) : 0;
		const L = path.leftEdge3[i];
		const R = path.rightEdge3[i];
		left.push({ x: L.x + (n.x / hl) * eL, y: L.y, z: L.z + (n.z / hl) * eL });
		right.push({ x: R.x - (n.x / hl) * eR, y: R.y, z: R.z - (n.z / hl) * eR });
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
	// grade. On a self-crossing road the floor under a point may be the OTHER
	// pass rather than the apron — `underFloorAt` raises the clamp so the
	// skirt can never hang down into (or through) that pass's envelope.
	const push = (p: TrackVec3, sample: number, drop = 0) => {
		const floor = drop > 0 ? underFloorAt(path, sample, p.x, p.z, p.y) : 0;
		positions.push(p.x, Math.max(floor, p.y - drop), p.z);
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
		const a = push(left[i], i);
		const b = push(left[j], j);
		const c = push(left[i], i, ti);
		const d = push(left[j], j, tj);
		indices.push(a, c, b, b, c, d);
		const e = push(right[i], i);
		const f = push(right[j], j);
		const g = push(right[i], i, ti);
		const h = push(right[j], j, tj);
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
 * Solid FILL under a jump's kicker and landing: a mound founded on the apron,
 * not a slab hung beneath the road.
 *
 * A deck is a bridge — constant thickness, trestles underneath, daylight below
 * — and that treatment is what made a jump ramp read as a folded sheet of card
 * rather than a structure: the underside simply paralleled the top all the way
 * over the lip. A kicker is earthwork. Its underside is the GROUND, so the
 * mass grows with the ramp and the lip becomes a real edge with real
 * thickness behind it.
 *
 * The fill is ONE continuous mound, not two: the drop face falls from the lip
 * only as far as the landing crest, so the mass never pinches out between
 * them. What makes the launch and the landing distinguishable is the profile
 * itself — a lip at the high point with the steep drop face immediately
 * behind it, then the landing's own shallower face — and the fill's job is to
 * put real material under all of it so those features read as built rather
 * than as creases in a sheet. (A `landingDeg` of 0 has no crest at all, so
 * there the fill genuinely does end at the drop and the kicker stands alone.)
 *
 * PURELY DECORATIVE, like the slab and the trestles: no body, no shape, never
 * handed to cannon-es. The car interacts only with the swept ribbon.
 */
export function jumpSolidMesh(
	path: RibbonRuntime,
	/**
	 * Which sample ranges are jumps. Defaults to the runtime's own, which a
	 * real `pieces` track carries — but the piece-builder's preview deliberately
	 * re-wraps its compiled chain as a verbatim RIBBON (so a chain that fails a
	 * guardrail still renders), and that erases piece kinds. The builder has the
	 * ranges in its diagnostics, so it passes them in rather than going without.
	 */
	spans: { start: number; end: number }[] = path.jumpSpans,
	minRise = JUMP_FILL_MIN_RISE_M
): MeshData | null {
	if (!spans.length) return null;
	const m: MeshData = { positions: [], indices: [] };
	const push = (x: number, y: number, z: number) => {
		m.positions.push(x, y, z);
		return m.positions.length / 3 - 1;
	};
	// A quad with its own four vertices: flat-shaded faces keep the lip and the
	// side walls crisp, where shared corners would smooth them into a lump.
	const quad = (
		a: TrackVec3,
		b: TrackVec3,
		c: TrackVec3,
		d: TrackVec3
	) => {
		const i0 = push(a.x, a.y, a.z);
		const i1 = push(b.x, b.y, b.z);
		const i2 = push(c.x, c.y, c.z);
		const i3 = push(d.x, d.y, d.z);
		m.indices.push(i0, i1, i2, i0, i2, i3);
	};
	// The fill's underside is the ground — normally the apron, but on a
	// self-crossing road the ground under a jump may be the OTHER pass, and
	// earthwork must never drop through (or seal off) that pass's envelope.
	const ground = (p: TrackVec3, sample: number): TrackVec3 => ({
		x: p.x,
		y: underFloorAt(path, sample, p.x, p.z, p.y),
		z: p.z
	});
	let any = false;
	for (const span of spans) {
		for (let i = span.start; i < span.end; i++) {
			const j = i + 1;
			if (j >= path.center.length) break;
			const li = path.leftEdge3[i];
			const lj = path.leftEdge3[j];
			const ri = path.rightEdge3[i];
			const rj = path.rightEdge3[j];
			const hi = Math.min(li.y, ri.y);
			const hj = Math.min(lj.y, rj.y);
			// Only where the road actually stands off the apron; the flat run-in
			// and run-out need no fill and would otherwise emit degenerate faces.
			if (hi <= minRise && hj <= minRise) continue;
			any = true;
			// Two side walls dropping from the road edge straight to the ground,
			// wound outward, plus an end cap wherever the mound begins or ends so
			// the lip and the landing's back both close off as solid faces
			// instead of showing a hollow shell.
			quad(li, lj, ground(lj, j), ground(li, i));
			quad(ground(ri, i), ground(rj, j), rj, ri);
			const prevRaised = i > span.start && Math.min(path.leftEdge3[i - 1].y, path.rightEdge3[i - 1].y) > minRise;
			const nextRaised =
				j < span.end && Math.min(path.leftEdge3[j + 1]?.y ?? 0, path.rightEdge3[j + 1]?.y ?? 0) > minRise;
			if (!prevRaised && hi > minRise) quad(ri, li, ground(li, i), ground(ri, i));
			if (!nextRaised && hj > minRise) quad(lj, rj, ground(rj, j), ground(lj, j));
		}
	}
	return any ? m : null;
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
		const thick = Math.max(0.4, Math.min(1.4, path.halfWidths[i] * 0.16));
		const c = path.center[i];
		const nx = path.center[j].x - path.center[i].x;
		const nz = path.center[j].z - path.center[i].z;
		const yaw = Math.atan2(nx, nz);
		const lat = lateralAt(path, i);
		const arm = path.halfWidths[i] * 0.62;
		const legW = Math.max(0.45, Math.min(1.1, path.halfWidths[i] * 0.12));
		// What is actually under this bent? On a self-crossing road the answer
		// can be the OTHER pass rather than the apron. Probe the two feet AND
		// the centre (their roadway can run between the legs on a
		// perpendicular crossing): a bent whose span sits over the other
		// pass's drivable corridor is SKIPPED outright — the crossing reads as
		// a clear bridged span, and a column standing in a roadway cars pass
		// through would be worse than no column. A foot beside their road
		// stops on that local ground (their run-off strip) instead of
		// piercing down through it to the apron.
		let blocked = false;
		let anyBelow = false;
		const footBase = [0, 0];
		const probes: [number, number, number][] = [
			[c.x, c.z, -1],
			[c.x + lat.x * arm, c.z + lat.z * arm, 0],
			[c.x - lat.x * arm, c.z - lat.z * arm, 1]
		];
		if (path.overlapZones.length) {
			for (const [px, pz, foot] of probes) {
				for (const o of otherStretchAt(path, i, px, pz)) {
					if (o.y >= deckY - 0.5) continue;
					anyBelow = true;
					if (o.absLat <= o.hw + 1) blocked = true;
					else if (foot >= 0 && o.absLat <= o.hw + SHOULDER_M + 1)
						footBase[foot] = Math.max(footBase[foot], o.y);
				}
			}
		}
		// Skipped, not placed: sinceLast stays past the spacing, so the very
		// next sample clear of the crossing plants the bent immediately.
		if (blocked) continue;
		sinceLast = 0;
		any = true;
		for (const s of [1, -1]) {
			const lx = c.x + lat.x * arm * s;
			const lz = c.z + lat.z * arm * s;
			const base = footBase[s === 1 ? 0 : 1];
			// The deck tilts with the bank, so each leg meets its own underside.
			const top = deckY + lat.y * arm * s - thick;
			if (top - base <= 0.6) continue;
			pushBox(m, lx, base + (top - base) / 2, lz, legW, top - base, legW, yaw);
		}
		// Cross-beam just under the slab, plus a lower brace on tall bents —
		// the brace is dropped whenever another pass runs anywhere below,
		// since a mid-height bar over (or near) that road would read as an
		// obstacle across it.
		const beamY = deckY - thick - 0.35;
		if (beamY > 1) {
			pushBox(m, c.x, beamY, c.z, arm * 2 + legW, 0.42, legW * 0.8, yaw + Math.PI / 2);
			if (beamY > 4.5 && !anyBelow)
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
 * The wall bands for a SELF-CROSSING track: one per side per path, standing
 * exactly on the per-sample lateral limits the runtime actually enforces
 * there (`limitLeft`/`limitRight`, present only on such tracks), footed at
 * each sample's own edge height.
 *
 * Exists because the authored boundary polygons follow a centerline that
 * crosses itself, so drawn as loops they visibly cut ACROSS the other pass's
 * road — and worse, `buildBoundaryGeometry` foots each post at the
 * nearest-in-XZ surface, which near a crossing is the WRONG pass, jumping
 * the band to the other deck's height. These bands are strictly local to the
 * road generating them: the lower pass's wall runs under the overpass at its
 * own height, the upper pass's above, each marking the limit the soft wall
 * really springs at. Returns [] on every normal track (no limits computed),
 * so callers fall through to the boundary loops unchanged.
 */
export function buildLimitWallGeometries(
	THREE: ThreeModule,
	rt: TrackRuntime,
	height = 0.9
): THREE_NS.BufferGeometry[] {
	const out: THREE_NS.BufferGeometry[] = [];
	for (const p of rt.paths) {
		if (!p.limitLeft || !p.limitRight) continue;
		const n = p.center.length;
		for (const side of [1, -1] as const) {
			const lims = side > 0 ? p.limitLeft : p.limitRight;
			const verts = new Float32Array(n * 2 * 3);
			for (let i = 0; i < n; i++) {
				const nv = lateralAt(p, i);
				const hl = Math.hypot(nv.x, nv.z) || 1;
				const x = p.center[i].x + (nv.x / hl) * lims[i] * side;
				const z = p.center[i].z + (nv.z / hl) * lims[i] * side;
				const y = side > 0 ? p.leftEdge3[i].y : p.rightEdge3[i].y;
				verts.set([x, y, z], i * 6);
				verts.set([x, y + height, z], i * 6 + 3);
			}
			const idx: number[] = [];
			const last = p.closed ? n : n - 1;
			for (let i = 0; i < last; i++) {
				const j = (i + 1) % n;
				idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
			}
			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
			geo.setIndex(idx);
			out.push(geo);
		}
	}
	return out;
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
