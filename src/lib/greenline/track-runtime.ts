/**
 * GREENLINE track runtime: pure geometry and lap logic over a parsed
 * `TrackData`. No three.js, no cannon-es, no Svelte; the harness turns the
 * facts returned here (gate crossings, surface state) into visuals and
 * forces. Keeping force decisions out of this module is what makes the
 * boundary behavior easy to swap later.
 */

import type { TrackBoundary, TrackData, TrackGate, TrackVec2, TrackZone } from './track-schema';
import { compileSurface } from './track-pieces';

const DEG = Math.PI / 180;

/** Heading degrees -> unit direction vector, matching the schema convention. */
export function headingToDir(headingDeg: number): TrackVec2 {
	const r = headingDeg * DEG;
	return { x: Math.cos(r), z: -Math.sin(r) };
}

export interface GateRuntime {
	gate: TrackGate;
	/** Gate segment endpoints. */
	ax: number;
	az: number;
	bx: number;
	bz: number;
	/** Required crossing direction (unit). */
	dx: number;
	dz: number;
}

function buildGate(gate: TrackGate): GateRuntime {
	const d = headingToDir(gate.headingDeg);
	// Perpendicular of (dx, dz): the gate line spans across the direction.
	const px = -d.z;
	const pz = d.x;
	return {
		gate,
		ax: gate.x - px * gate.halfWidth,
		az: gate.z - pz * gate.halfWidth,
		bx: gate.x + px * gate.halfWidth,
		bz: gate.z + pz * gate.halfWidth,
		dx: d.x,
		dz: d.z
	};
}

/**
 * Does the motion segment `prev -> cur` cross the gate in its required
 * direction? Returns the interpolation parameter t in [0, 1] along the motion
 * (for sub-frame lap timing), or null. Segment-vs-segment, so fast vehicles
 * cannot tunnel through a gate between frames.
 */
export function crossesGate(prev: TrackVec2, cur: TrackVec2, g: GateRuntime): number | null {
	const mx = cur.x - prev.x;
	const mz = cur.z - prev.z;
	// Directional requirement: moving with the gate, not against it.
	if (mx * g.dx + mz * g.dz <= 0) return null;
	const gx = g.bx - g.ax;
	const gz = g.bz - g.az;
	const denom = mx * gz - mz * gx;
	if (Math.abs(denom) < 1e-12) return null;
	const t = ((g.ax - prev.x) * gz - (g.az - prev.z) * gx) / denom;
	const u = ((g.ax - prev.x) * mz - (g.az - prev.z) * mx) / denom;
	return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** A point on the 3D ribbon sweep (schema v2 elevation/banking applied). */
export interface TrackVec3 {
	x: number;
	y: number;
	z: number;
}

/**
 * One swept ribbon path. A track always has at least one (`paths[0]`, the main
 * centerline); schema-v2 `surface.branches` add more. Every field mirrors what
 * the pre-8b runtime exposed at the top level, because that is exactly what
 * `paths[0]` IS — the top-level fields are aliases of it, so single-path tracks
 * are unchanged in both data and behavior.
 */
export interface RibbonRuntime {
	id: string;
	/** False for branch spurs: no wraparound at the ends. */
	closed: boolean;
	center: TrackVec2[];
	halfWidths: number[];
	elevations: number[];
	bankingRad: number[];
	leftEdge: TrackVec2[];
	rightEdge: TrackVec2[];
	leftEdge3: TrackVec3[];
	rightEdge3: TrackVec3[];
	/**
	 * Where this path's own footprint comes back over itself in XZ (a loop
	 * returning above an earlier straight): pairs of sample-index ranges that
	 * are far apart ALONG the road but close ACROSS it. Empty on every normal
	 * circuit. This is the fact every overpass-aware consumer reads — the
	 * supports/shoulder/slab builders ask "is another stretch of road under
	 * me here", and the runtime's own enforcement decides the 2D boundary
	 * polygons cannot be trusted (see `selfOverlaps` on TrackRuntime).
	 */
	overlapZones: PathOverlapZone[];
	/**
	 * Per-sample allowed lateral extent (meters from the centerline) on the
	 * leftEdge / rightEdge side: the bank-shortened half width plus the same
	 * elevation-aware run-off margin the builder authors boundaries with.
	 * Computed only for self-overlapping tracks, where these limits REPLACE
	 * the 2D boundary polygons as the enforced track edge (strictly local to
	 * the road generating them, so one pass can never wall off another).
	 */
	limitLeft?: number[];
	limitRight?: number[];
	/**
	 * Sample ranges of this path's JUMP pieces. Carried on the runtime so the
	 * visual layer can found a jump's fill on the ground (a kicker is an
	 * earthwork sitting on the apron, not a deck on trestles) without either
	 * caller needing to know what a piece is. Empty for a ribbon surface.
	 */
	jumpSpans: { start: number; end: number }[];
	/** Main-centerline indices this spur leaves and rejoins (branches only). */
	joinStart?: number;
	joinEnd?: number;
	/** Path extent, used to cull far-away paths from the nearest-path search. */
	bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
	/** Largest half width on this path (the bbox cull margin). */
	maxHalfWidth: number;
}

export interface TrackRuntime {
	data: TrackData;
	startFinish: GateRuntime;
	checkpoints: GateRuntime[];
	/**
	 * Sequence step each checkpoint satisfies, parallel to `checkpoints`.
	 * Ungrouped gates get their own step, so a track with no groups reads
	 * `[0, 1, 2, ...]` and every comparison below is the pre-8b index match.
	 */
	checkpointSteps: number[];
	/** Number of distinct steps a lap must clear (<= checkpoints.length). */
	stepCount: number;
	/**
	 * Every drivable path: `[0]` is the main centerline, the rest are branch
	 * spurs. Surface queries consider all of them.
	 */
	paths: RibbonRuntime[];
	/**
	 * Complete lap routes as closed point lists, one per branch combination:
	 * `[0]` is the pure main line, and each later entry splices one branch in
	 * between its join indices. This is what the AI follows — a route is just
	 * a polyline, so branch-following needs no special path-handoff logic in
	 * the driver. Single-path tracks have exactly one route (the centerline).
	 */
	routes: TrackVec2[][];
	/**
	 * Route indices that are PIT LANES (Phase 9c): a branch whose id begins with
	 * `pit`. A pit lane is structurally a branch like any other (8b) — the only
	 * difference the runtime marks is that it is a deliberate slow detour with a
	 * repair box, so the AI's simple "pit when hurt" heuristic can pick it out
	 * from a risk/reward shortcut. Empty on tracks with no pit lane.
	 */
	pitRoutes: number[];
	/** Ribbon centerline (same points as the data, kept for hot loops). */
	center: TrackVec2[];
	/** Maximum half width across the lap (margins, spawn placement). */
	halfWidth: number;
	/** Per-point half width; constant-width tracks repeat the same value. */
	halfWidths: number[];
	/** Per-point centerline elevation (world y); 0-filled for flat tracks. */
	elevations: number[];
	/** Per-point banking in RADIANS; 0-filled for unbanked tracks. */
	bankingRad: number[];
	/**
	 * True when any point carries nonzero elevation or banking: the signal
	 * for consumers to build real 3D collision for the ribbon. Flat tracks
	 * read false and keep their plane-only physics untouched.
	 */
	hasRelief: boolean;
	/**
	 * True when any single path's corridor genuinely comes back over its own
	 * XZ footprint (an overpass, or a flat figure-eight). On such a track the
	 * closed 2D boundary polygons are structurally unreliable — an offset
	 * loop that follows a self-crossing centerline crosses the OTHER pass's
	 * corridor, and the even-odd containment test misreads whole regions —
	 * so `surfaceState` enforces the per-sample `limitLeft`/`limitRight`
	 * corridor instead. Every non-self-crossing track reads false and keeps
	 * the polygon enforcement byte-identical.
	 */
	selfOverlaps: boolean;
	boundaries: TrackBoundary[];
	/** Gameplay trigger zones (schema v2); empty when the track has none. */
	zones: TrackZone[];
	bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
	/** Ribbon edge polylines, precomputed for meshes and the minimap. These
	 * are the exact x/z projection of `leftEdge3`/`rightEdge3`. */
	leftEdge: TrackVec2[];
	rightEdge: TrackVec2[];
	/**
	 * The 3D ribbon sweep (elevation + banking applied): the ONE geometry
	 * both the visual ribbon mesh AND the physics collision build from, so
	 * they can never drift apart. Flat tracks sweep at y 0.
	 */
	leftEdge3: TrackVec3[];
	rightEdge3: TrackVec3[];
}

/* ------------------------------------------------------------------ */
/* self-overlap detection: where one road crosses back over itself      */
/* ------------------------------------------------------------------ */

/**
 * Two stretches of the SAME path that occupy the same XZ neighborhood while
 * being far apart along the road — the two passes of an overpass (or of a
 * flat crossing). `aStart..aEnd` is always the earlier range along the chain.
 * `real` marks zones where the two corridors genuinely overlap (centerline
 * distance under the summed half widths), as opposed to merely coming close
 * enough that trackside structure (shoulder, wall, support foot) from one
 * could reach the other; only `real` zones flip a track's `selfOverlaps`.
 */
export interface PathOverlapZone {
	aStart: number;
	aEnd: number;
	bStart: number;
	bEnd: number;
	real: boolean;
}

/** Flat-ground boundary offset beyond the ribbon edge (Proving Ground's 9 m). */
export const FLAT_MARGIN_M = 9;
/** Boundary offset floor beside raised track (Terminal Nine's deck lesson). */
export const MIN_ELEVATED_MARGIN_M = 1.8;

/**
 * Run-off margin beyond the ribbon edge for an edge at height `edgeY`: the
 * flat 9 m shrinking toward wall-tight as the edge rises, because 9 m of
 * run-off beside a deck is 9 m of thin air. This is the ONE margin rule —
 * the piece-chain builder authors its boundary loops with it, and on
 * self-overlapping tracks the runtime enforces the same number directly, so
 * the authored line and the enforced line can never disagree.
 */
export const boundaryMarginFor = (edgeY: number): number =>
	Math.min(
		FLAT_MARGIN_M,
		Math.max(MIN_ELEVATED_MARGIN_M, FLAT_MARGIN_M - Math.max(0, edgeY - 0.4) * 2.4)
	);

/**
 * How far past the summed corridor half-widths two stretches still count as
 * NEAR (a zone worth tracking for structure queries): covers the widest
 * trackside reach — the flat boundary margin (9 m) and the run-off shoulder
 * (5.5 m) — with padding, so a wall or shoulder generated by one stretch
 * always knows about the other before it can touch it.
 */
const OVERLAP_NEAR_SLACK_M = 12;

/**
 * Find where a path's own footprint comes back over itself. Pure XZ +
 * along-chain arithmetic on the raw compiled arrays, so the piece-chain
 * builder's export can run the identical detection on `CompiledChain` data
 * before a runtime exists (gate placement steers clear of the zones).
 *
 * Pairs of samples closer across the ground than their corridors reach are
 * candidates; pairs closer ALONG the road than ~1.75x their summed half
 * widths are the same stretch of road (a hairpin's two legs at worst) and
 * are excluded. What survives is clustered into contiguous range pairs.
 *
 * Deliberately SAME-PATH only: a branch spur genuinely shares ground with
 * the main line at its join points (that is what a merge is), so cross-path
 * proximity is normal geometry, not an overpass. A branch flying over the
 * main line is out of scope for this pass and stays on the old behavior.
 */
export function computePathOverlapZones(
	center: TrackVec2[],
	halfWidths: number[],
	closed: boolean
): PathOverlapZone[] {
	const n = center.length;
	if (n < 12) return [];
	// Cumulative plan arc length, for the along-chain exclusion window.
	const cum: number[] = [0];
	for (let i = 1; i < n; i++)
		cum[i] = cum[i - 1] + Math.hypot(center[i].x - center[i - 1].x, center[i].z - center[i - 1].z);
	const total = closed
		? cum[n - 1] + Math.hypot(center[0].x - center[n - 1].x, center[0].z - center[n - 1].z)
		: cum[n - 1];
	let maxHw = 0;
	for (const hw of halfWidths) if (hw > maxHw) maxHw = hw;
	// Spatial hash sized so any relevant pair sits in adjacent cells.
	const cell = Math.max(10, 2 * maxHw + OVERLAP_NEAR_SLACK_M);
	const grid = new Map<string, number[]>();
	for (let i = 0; i < n; i++) {
		const key = `${Math.floor(center[i].x / cell)},${Math.floor(center[i].z / cell)}`;
		let list = grid.get(key);
		if (!list) grid.set(key, (list = []));
		list.push(i);
	}
	const pairs: { a: number; b: number; real: boolean }[] = [];
	for (let i = 0; i < n; i++) {
		const cx = Math.floor(center[i].x / cell);
		const cz = Math.floor(center[i].z / cell);
		for (let gx = cx - 1; gx <= cx + 1; gx++) {
			for (let gz = cz - 1; gz <= cz + 1; gz++) {
				const list = grid.get(`${gx},${gz}`);
				if (!list) continue;
				for (const j of list) {
					if (j <= i) continue;
					const hwSum = halfWidths[i] + halfWidths[j];
					// Along-chain separation (shorter way around on a loop):
					// under ~1.75x the summed half widths it is one continuous
					// stretch of road (a hairpin's legs at the extreme), not a
					// second pass over the same ground.
					let arc = cum[j] - cum[i];
					if (closed) arc = Math.min(arc, total - arc);
					if (arc <= 1.75 * hwSum + 8) continue;
					const d = Math.hypot(center[j].x - center[i].x, center[j].z - center[i].z);
					if (d < hwSum + OVERLAP_NEAR_SLACK_M) pairs.push({ a: i, b: j, real: d < hwSum });
				}
			}
		}
	}
	if (!pairs.length) return [];
	// Cluster the pairs into contiguous range pairs. GAP tolerates the sample
	// striping a grid walk produces; PAD keeps queries safe at range edges.
	const GAP = 8;
	const PAD = 3;
	const zones: PathOverlapZone[] = [];
	pairs.sort((p, q) => p.a - q.a || p.b - q.b);
	for (const p of pairs) {
		let hit: PathOverlapZone | null = null;
		for (const z of zones) {
			if (
				p.a >= z.aStart - GAP &&
				p.a <= z.aEnd + GAP &&
				p.b >= z.bStart - GAP &&
				p.b <= z.bEnd + GAP
			) {
				hit = z;
				break;
			}
		}
		if (hit) {
			hit.aStart = Math.min(hit.aStart, p.a);
			hit.aEnd = Math.max(hit.aEnd, p.a);
			hit.bStart = Math.min(hit.bStart, p.b);
			hit.bEnd = Math.max(hit.bEnd, p.b);
			hit.real = hit.real || p.real;
		} else {
			zones.push({ aStart: p.a, aEnd: p.a, bStart: p.b, bEnd: p.b, real: p.real });
		}
	}
	for (const z of zones) {
		z.aStart = Math.max(0, z.aStart - PAD);
		z.aEnd = Math.min(n - 1, z.aEnd + PAD);
		z.bStart = Math.max(0, z.bStart - PAD);
		z.bEnd = Math.min(n - 1, z.bEnd + PAD);
	}
	return zones;
}

/**
 * Sweep one ribbon path into its 3D edges. Shared by the main centerline and
 * every branch spur, so both get identical banking/elevation treatment. An
 * OPEN path (a branch) uses one-sided differences at its ends instead of
 * wrapping, which would otherwise fold the first and last cross-sections
 * across the whole track.
 */
function buildPath(
	id: string,
	closed: boolean,
	center: TrackVec2[],
	width: number,
	widths: number[] | undefined,
	elevs: number[] | undefined,
	banks: number[] | undefined
): RibbonRuntime {
	const n = center.length;
	const halfWidths = center.map((_, i) => (widths?.[i] ?? width) / 2);
	const elevations = center.map((_, i) => elevs?.[i] ?? 0);
	const bankingRad = center.map((_, i) => ((banks?.[i] ?? 0) * Math.PI) / 180);
	const leftEdge3: TrackVec3[] = [];
	const rightEdge3: TrackVec3[] = [];
	for (let i = 0; i < n; i++) {
		const iPrev = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
		const iNext = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
		const p0 = center[iPrev];
		const p2 = center[iNext];
		const tx = p2.x - p0.x;
		const tz = p2.z - p0.z;
		const l = Math.hypot(tx, tz) || 1;
		const nx = -tz / l;
		const nz = tx / l;
		// Banking rotates the cross-section about the local tangent: the
		// lateral arm shortens to cos(bank) horizontally and gains sin(bank)
		// vertically. Positive bank raises the leftEdge side. Flat tracks
		// (bank 0, elevation 0) produce the exact pre-v2 2D edges.
		const hw = halfWidths[i];
		const latX = nx * Math.cos(bankingRad[i]) * hw;
		const latZ = nz * Math.cos(bankingRad[i]) * hw;
		const latY = Math.sin(bankingRad[i]) * hw;
		const cy = elevations[i];
		leftEdge3.push({ x: center[i].x + latX, y: cy + latY, z: center[i].z + latZ });
		rightEdge3.push({ x: center[i].x - latX, y: cy - latY, z: center[i].z - latZ });
	}
	const bbox = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
	for (const p of center) {
		if (p.x < bbox.minX) bbox.minX = p.x;
		if (p.x > bbox.maxX) bbox.maxX = p.x;
		if (p.z < bbox.minZ) bbox.minZ = p.z;
		if (p.z > bbox.maxZ) bbox.maxZ = p.z;
	}
	return {
		id,
		// Filled in by the caller for the main path of a piece chain; a ribbon
		// surface and every branch spur genuinely have none.
		jumpSpans: [],
		overlapZones: computePathOverlapZones(center, halfWidths, closed),
		closed,
		center,
		halfWidths,
		elevations,
		bankingRad,
		leftEdge: leftEdge3.map((p) => ({ x: p.x, z: p.z })),
		rightEdge: rightEdge3.map((p) => ({ x: p.x, z: p.z })),
		leftEdge3,
		rightEdge3,
		bbox,
		maxHalfWidth: Math.max(...halfWidths)
	};
}

export function buildRuntime(data: TrackData): TrackRuntime {
	// Schema v3: EVERY surface goes through the piece-chain compiler. A legacy
	// ribbon compiles as one verbatim `freeform` piece (same point objects,
	// same width/elevation/banking values its old `??` defaults produced), so
	// this is the identical sweep input, not a parallel path; a `pieces`
	// surface arrives here as the same per-point arrays. One pipeline for both.
	const compiled = compileSurface(data.surface);
	const center = compiled.center;
	const main = buildPath(
		'main',
		compiled.closed,
		center,
		compiled.width,
		compiled.widths,
		compiled.elevations,
		compiled.banking
	);
	// A jump's kicker and landing are earthworks on the apron, so the visual
	// layer founds their fill on the ground rather than hanging a slab under
	// them. The compiler already knows which samples belong to which piece.
	main.jumpSpans = compiled.pieces
		.filter((p) => p.kind === 'jump')
		.map((p) => ({ start: p.start, end: p.end }));
	const paths: RibbonRuntime[] = [main];
	// Branch spurs are ribbon territory (piece chains are linear in v3).
	const branches = data.surface.type === 'ribbon' ? (data.surface.branches ?? []) : [];
	for (const br of branches) {
		const p = buildPath('branch:' + br.id, false, br.centerline, br.width, br.widths, br.elevations, br.banking);
		p.joinStart = br.joinStart;
		p.joinEnd = br.joinEnd;
		paths.push(p);
	}
	// Lap routes: the pure main line, then one spliced route per branch. A
	// route is a plain closed polyline, which is why the AI can follow a
	// branch with no path-switching logic of its own.
	const routes: TrackVec2[][] = [center.slice()];
	for (const p of paths.slice(1)) {
		routes.push([
			...center.slice(0, p.joinStart! + 1),
			...p.center,
			...center.slice(p.joinEnd!)
		]);
	}
	// Pit-lane routes: a branch id beginning with `pit` marks a pit lane. routes[i]
	// splices paths[i] (both in branch order), so the route index is the path index.
	const pitRoutes: number[] = [];
	paths.forEach((p, i) => {
		if (i > 0 && (p.id === 'branch:pit' || p.id.startsWith('branch:pit-'))) pitRoutes.push(i);
	});
	const { halfWidths, elevations, bankingRad, leftEdge, rightEdge, leftEdge3, rightEdge3 } = main;
	const halfWidth = Math.max(...paths.flatMap((p) => p.halfWidths));
	const hasRelief = paths.some(
		(p) => p.elevations.some((e) => e !== 0) || p.bankingRad.some((b) => b !== 0)
	);
	// Self-overlap: only a REAL corridor-on-corridor zone flips the flag (a
	// merely-near zone keeps polygon enforcement; structure queries still see
	// it). When flipped, every path gets its per-sample lateral limits — the
	// bank-shortened arm plus the same margin rule the builder authors
	// boundaries with — which is what surfaceState enforces instead of the
	// self-crossing polygons.
	const selfOverlaps = paths.some((p) => p.overlapZones.some((z) => z.real));
	if (selfOverlaps) {
		for (const p of paths) {
			p.limitLeft = p.halfWidths.map(
				(hw, i) => hw * Math.cos(p.bankingRad[i]) + boundaryMarginFor(p.leftEdge3[i].y)
			);
			p.limitRight = p.halfWidths.map(
				(hw, i) => hw * Math.cos(p.bankingRad[i]) + boundaryMarginFor(p.rightEdge3[i].y)
			);
		}
	}
	// Sequence steps: a new step whenever the group id changes, so ungrouped
	// checkpoints read [0, 1, 2, ...] and grouped alternatives share a step.
	const checkpointSteps: number[] = [];
	let step = -1;
	let runGroup: string | undefined | symbol = Symbol('none');
	data.checkpoints.forEach((g) => {
		if (g.group === undefined || g.group !== runGroup) step += 1;
		runGroup = g.group;
		checkpointSteps.push(step);
	});
	const stepCount = step + 1;
	let minX = Infinity,
		maxX = -Infinity,
		minZ = Infinity,
		maxZ = -Infinity;
	for (const b of data.boundaries) {
		for (const p of b.points) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.z < minZ) minZ = p.z;
			if (p.z > maxZ) maxZ = p.z;
		}
	}
	return {
		data,
		startFinish: buildGate(data.startFinish),
		checkpoints: data.checkpoints.map(buildGate),
		checkpointSteps,
		stepCount,
		paths,
		routes,
		pitRoutes,
		center,
		halfWidth,
		halfWidths,
		elevations,
		bankingRad,
		hasRelief,
		selfOverlaps,
		boundaries: data.boundaries,
		zones: data.zones ?? [],
		bbox: { minX, maxX, minZ, maxZ },
		leftEdge,
		rightEdge,
		leftEdge3,
		rightEdge3
	};
}

/**
 * Surface height (world y) of the ribbon nearest to `(x, z)`: nearest
 * centerline SEGMENT projection, with elevation and banking interpolated
 * along the segment and the point's signed lateral offset tilted by the bank
 * (clamped to the local half width, so a point far off the ribbon reads the
 * edge height rather than an extrapolated cliff). Flat tracks return 0
 * everywhere via the fast path. `warmIndex` follows the `surfaceState`
 * convention: pass a vehicle's last nearest-centerline index for an O(few)
 * query, or omit it for a one-off full scan (build-time placement).
 */
/**
 * Nearest centerline point on ONE path. Warm-started when `warmIndex` is
 * given (the caller's last index on this path), full scan otherwise. Branch
 * spurs are short, so callers full-scan them rather than tracking a warm index
 * per path.
 */
function nearestPointOnPath(
	p: RibbonRuntime,
	x: number,
	z: number,
	warmIndex?: number
): { index: number; dist2: number } {
	const n = p.center.length;
	let bestI = 0;
	let bestD = Infinity;
	const probe = (i: number) => {
		const ii = p.closed ? ((i % n) + n) % n : i;
		if (ii < 0 || ii >= n) return;
		const q = p.center[ii];
		const d = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z);
		if (d < bestD) {
			bestD = d;
			bestI = ii;
		}
	};
	if (warmIndex === undefined) {
		for (let i = 0; i < n; i++) probe(i);
	} else {
		for (let k = -8; k <= 8; k++) probe(warmIndex + k);
		if (bestD > 40 * 40) for (let i = 0; i < n; i++) probe(i);
	}
	return { index: bestI, dist2: bestD };
}

/**
 * Pick the path a point is closest to, across every path on the track. Branch
 * spurs are short (tens of points) so they are scanned in full; only the main
 * line uses the warm index. Single-path tracks reduce to exactly the pre-8b
 * warm-started scan of the main centerline.
 */
function nearestPath(
	rt: TrackRuntime,
	x: number,
	z: number,
	warmIndex?: number,
	warmPath = 0
): { path: number; index: number; dist2: number } {
	// The path the caller was on last frame keeps its warm index; every other
	// path is scanned in full, but only when the point is actually near it.
	const wp = warmPath >= 0 && warmPath < rt.paths.length ? warmPath : 0;
	const w = nearestPointOnPath(rt.paths[wp], x, z, warmIndex);
	let best = { path: wp, index: w.index, dist2: w.dist2 };
	for (let pi = 0; pi < rt.paths.length; pi++) {
		if (pi === wp) continue;
		const p = rt.paths[pi];
		// Bbox cull: a car on the far side of the circuit never pays for the
		// branch scan, and a car on a branch only rescans the main line while
		// it is geometrically plausible to be near it.
		const m = p.maxHalfWidth + 60;
		if (x < p.bbox.minX - m || x > p.bbox.maxX + m || z < p.bbox.minZ - m || z > p.bbox.maxZ + m)
			continue;
		const r = nearestPointOnPath(p, x, z);
		if (r.dist2 < best.dist2) best = { path: pi, index: r.index, dist2: r.dist2 };
	}
	return best;
}

/**
 * Local cross-section frame at `(x, z)` against one path: the point projected
 * onto the better of the two centerline segments flanking `bestI`, with the
 * interpolated elevation / bank / half width there and the SIGNED lateral
 * offset along the segment's left normal (positive = the leftEdge side, the
 * side positive banking raises). `lat` is UNCLAMPED — the surface query
 * clamps it to the half width, the boundary-limit test compares it to the
 * allowed corridor, and the overlap queries read it raw to ask "is this
 * point over that road at all".
 */
function projectOnPath(
	p: RibbonRuntime,
	x: number,
	z: number,
	bestI: number
): { i: number; j: number; t: number; lat: number; elev: number; bank: number; hw: number; px: number; pz: number } {
	const n = p.center.length;
	const flank: [number, number][] = p.closed
		? [
				[(bestI - 1 + n) % n, bestI],
				[bestI, (bestI + 1) % n]
			]
		: [
				[Math.max(0, bestI - 1), bestI],
				[bestI, Math.min(n - 1, bestI + 1)]
			];
	// Project onto the better of the two segments flanking the nearest point.
	let best: { i: number; j: number; t: number; dist: number } | null = null;
	for (const [i, j] of flank) {
		if (i === j) continue;
		const a = p.center[i];
		const b = p.center[j];
		const ex = b.x - a.x;
		const ez = b.z - a.z;
		const len2 = ex * ex + ez * ez || 1;
		let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const px = a.x + ex * t;
		const pz = a.z + ez * t;
		const d = (x - px) * (x - px) + (z - pz) * (z - pz);
		if (!best || d < best.dist) best = { i, j, t, dist: d };
	}
	if (!best)
		return {
			i: bestI,
			j: bestI,
			t: 0,
			lat: 0,
			elev: p.elevations[bestI],
			bank: p.bankingRad[bestI],
			hw: p.halfWidths[bestI],
			px: p.center[bestI].x,
			pz: p.center[bestI].z
		};
	const { i, j, t } = best;
	const elev = p.elevations[i] + (p.elevations[j] - p.elevations[i]) * t;
	const bank = p.bankingRad[i] + (p.bankingRad[j] - p.bankingRad[i]) * t;
	const hw = p.halfWidths[i] + (p.halfWidths[j] - p.halfWidths[i]) * t;
	// Signed lateral offset along the segment's left normal (-ez, ex).
	const a = p.center[i];
	const b = p.center[j];
	const ex = b.x - a.x;
	const ez = b.z - a.z;
	const el = Math.hypot(ex, ez) || 1;
	const px = a.x + ex * t;
	const pz = a.z + ez * t;
	const lat = (x - px) * (-ez / el) + (z - pz) * (ex / el);
	return { i, j, t, lat, elev, bank, hw, px, pz };
}

/** Interpolated surface height at `(x, z)` against one path. */
function surfaceYOnPath(p: RibbonRuntime, x: number, z: number, bestI: number): number {
	const f = projectOnPath(p, x, z, bestI);
	const lat = Math.max(-f.hw, Math.min(f.hw, f.lat));
	return f.elev + lat * Math.tan(f.bank);
}

/** One "other pass" answer from `otherStretchAt`: the surface of a DIFFERENT
 * stretch of the same road at a queried point. `y` is its surface height
 * (edge-clamped, exactly what `surfaceYAt` would report standing there),
 * `absLat` how far the point sits from that stretch's centerline, `hw` its
 * local half width, `index` its nearest sample (a valid warm index). */
export interface OtherStretch {
	y: number;
	absLat: number;
	hw: number;
	index: number;
}

/**
 * The OTHER pass(es) of the road at `(x, z)`, judged from sample `i`: for
 * every overlap zone covering `i`, project the point against the opposing
 * range and report that stretch's surface there. Empty everywhere a path
 * never self-overlaps, which is every committed track — callers pay nothing
 * outside a genuine crossing. This is the query that keeps overpass-aware
 * geometry LOCAL: a support/wall/shoulder generated by sample `i` asks what
 * other road is here instead of assuming clear air to the apron.
 */
export function otherStretchAt(p: RibbonRuntime, i: number, x: number, z: number): OtherStretch[] {
	if (!p.overlapZones.length) return [];
	const out: OtherStretch[] = [];
	for (const zn of p.overlapZones) {
		const ranges: [number, number][] = [];
		if (i >= zn.aStart && i <= zn.aEnd) ranges.push([zn.bStart, zn.bEnd]);
		if (i >= zn.bStart && i <= zn.bEnd) ranges.push([zn.aStart, zn.aEnd]);
		for (const [s, e] of ranges) {
			let bestJ = -1;
			let bd = Infinity;
			for (let j = s; j <= e; j++) {
				const q = p.center[j];
				const d = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z);
				if (d < bd) {
					bd = d;
					bestJ = j;
				}
			}
			if (bestJ < 0) continue;
			const f = projectOnPath(p, x, z, bestJ);
			const lat = Math.max(-f.hw, Math.min(f.hw, f.lat));
			out.push({ y: f.elev + lat * Math.tan(f.bank), absLat: Math.abs(f.lat), hw: f.hw, index: bestJ });
		}
	}
	return out;
}

/**
 * A vehicle whose warm index says it is far BELOW its road may in fact be
 * standing on the OTHER pass of that road (it dropped off the overpass onto
 * the pass underneath). If a different stretch's surface sits right under
 * the vehicle — within its drivable corridor or run-off strip, no more than
 * `maxAbove` under it — return that stretch's nearest sample so the caller
 * can adopt it as the new warm index instead of "recovering" a car that is
 * already on real road. Null when nothing drivable is under it (a genuine
 * fall; the watchdog proceeds).
 */
export function adoptStretchUnder(
	p: RibbonRuntime,
	i: number,
	x: number,
	z: number,
	vehicleY: number,
	maxAbove: number
): number | null {
	let best: OtherStretch | null = null;
	for (const m of otherStretchAt(p, i, x, z)) {
		// Corridor plus the run-off strip (the shoulder is 5.5 m; margin a
		// little wider so the adopt hands over anywhere the car can stand).
		if (m.absLat > m.hw + 6) continue;
		const above = vehicleY - m.y;
		if (above < -0.5 || above > maxAbove) continue;
		if (!best || m.y > best.y) best = m;
	}
	return best ? best.index : null;
}

export function surfaceYAt(
	rt: TrackRuntime,
	x: number,
	z: number,
	warmIndex?: number,
	warmPath = 0
): number {
	if (!rt.hasRelief) return 0;
	const near = nearestPath(rt, x, z, warmIndex, warmPath);
	return surfaceYOnPath(rt.paths[near.path], x, z, near.index);
}

/**
 * Build-time placement probe: the surface height at `(x, z)` plus how far the
 * point lies BEYOND the nearest ribbon edge (0 when it is over the ribbon).
 * Always a full scan, so it is for one-off placement (scenery, decals), never
 * a per-frame query — use `surfaceYAt` with a warm index for those.
 *
 * The edge gap is the FACT a caller needs to decide whether something sits on
 * the ribbon's local ground or on the flat apron beside it; what to do with it
 * is the caller's policy, not the runtime's.
 */
export function surfaceProbe(
	rt: TrackRuntime,
	x: number,
	z: number
): { y: number; edgeGap: number } {
	const near = nearestPath(rt, x, z);
	const p = rt.paths[near.path];
	return {
		y: rt.hasRelief ? surfaceYOnPath(p, x, z, near.index) : 0,
		edgeGap: Math.max(0, Math.sqrt(near.dist2) - p.halfWidths[near.index])
	};
}

/**
 * Circular trigger-zone occupancy: updates the caller's persistent
 * per-vehicle `inside` array (one boolean per zone, parallel to `zones`; the
 * warmIndex spirit — state lives with the vehicle, logic stays pure) and
 * returns the indices of zones ENTERED since the last call (empty most
 * frames). Top-down radius test only: zones are authored on the surface, so
 * containment viewed from above is the whole question; a car under an
 * elevated span never lingers there (the caller's fall recovery removes it).
 */
export function zoneEntries(
	zones: TrackZone[],
	x: number,
	z: number,
	inside: boolean[]
): number[] {
	const entered: number[] = [];
	for (let i = 0; i < zones.length; i++) {
		const zn = zones[i];
		const dx = x - zn.x;
		const dz = z - zn.z;
		const isIn = dx * dx + dz * dz <= zn.radius * zn.radius;
		if (isIn && !inside[i]) entered.push(i);
		inside[i] = isIn;
	}
	return entered;
}

/** Even-odd point-in-polygon over a boundary loop. */
function insideLoop(points: TrackVec2[], x: number, z: number): boolean {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const a = points[i];
		const b = points[j];
		if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

function nearestOnLoop(points: TrackVec2[], x: number, z: number): { x: number; z: number; dist: number } {
	let best = { x: points[0].x, z: points[0].z, dist: Infinity };
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const a = points[j];
		const b = points[i];
		const ex = b.x - a.x;
		const ez = b.z - a.z;
		const len2 = ex * ex + ez * ez || 1;
		let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const px = a.x + ex * t;
		const pz = a.z + ez * t;
		const d = Math.hypot(x - px, z - pz);
		if (d < best.dist) best = { x: px, z: pz, dist: d };
	}
	return best;
}

export interface SurfaceState {
	/** Within the ribbon corridor (racing surface). */
	onRibbon: boolean;
	/** Distance from the centerline, world units. */
	centerDist: number;
	/**
	 * Set when the vehicle is past a boundary: how deep, and the unit push
	 * direction back toward the violated boundary line. The harness decides
	 * what force to make of it.
	 */
	violation: { boundaryId: string; depth: number; pushX: number; pushZ: number } | null;
}

/**
 * Where is `(x, z)` relative to the track? `warmIndex` is the centerline
 * segment found last frame; passing it back in keeps the query O(few) while
 * the vehicle moves continuously (a full scan runs on big jumps/teleports).
 * The bounds test convention is: on course = inside `outer` and outside
 * `inner` for the ribbon's two closed boundary loops.
 */
export function surfaceState(
	rt: TrackRuntime,
	x: number,
	z: number,
	warmIndex: number,
	warmPath = 0
): { state: SurfaceState; warmIndex: number; path: number } {
	// Nearest across every path: a vehicle on a branch spur is on real track,
	// so it must read on-ribbon there, not off-course beside the main line.
	// Single-path tracks reduce to the original warm-started main-line scan.
	const near = nearestPath(rt, x, z, warmIndex, warmPath);
	const bestI = near.index;
	const centerDist = Math.sqrt(near.dist2);

	let violation: SurfaceState['violation'] = null;
	if (rt.selfOverlaps && rt.boundaries.length) {
		// Self-crossing track: the closed 2D loops follow a centerline that
		// crosses itself, so somewhere they cross the OTHER pass's corridor
		// and the even-odd test reads clear road as out of bounds — a car on
		// the lower pass of an overpass gets pinned by the soft wall. The
		// limit the boundaries were AUTHORED from (half width + the
		// elevation-aware margin) is enforced directly instead, strictly
		// against the pass the vehicle is actually on, pushing back toward
		// that pass's own centerline. Data unchanged; enforcement is the
		// runtime's call (the schema doctrine: the data says where the
		// limits are, never how they are enforced).
		const p = rt.paths[near.path];
		if (p.limitLeft && p.limitRight) {
			const f = projectOnPath(p, x, z, bestI);
			const lims = f.lat >= 0 ? p.limitLeft : p.limitRight;
			const lim = lims[f.i] + (lims[f.j] - lims[f.i]) * f.t;
			const a = Math.abs(f.lat);
			if (a > lim) {
				const len = Math.hypot(f.px - x, f.pz - z) || 1;
				violation = {
					boundaryId: `limit:${p.id}`,
					depth: a - lim,
					pushX: (f.px - x) / len,
					pushZ: (f.pz - z) / len
				};
			}
		}
	} else
	for (const b of rt.boundaries) {
		if (!b.closed) continue;
		const inside = insideLoop(b.points, x, z);
		// Convention: violated when outside the "outer" loop or inside any
		// other (inner island) loop.
		const violated = b.id === 'outer' ? !inside : inside;
		if (violated) {
			const near = nearestOnLoop(b.points, x, z);
			const len = near.dist || 1;
			violation = {
				boundaryId: b.id,
				depth: near.dist,
				pushX: (near.x - x) / len,
				pushZ: (near.z - z) / len
			};
			break;
		}
	}

	return {
		state: {
			onRibbon: centerDist <= rt.paths[near.path].halfWidths[bestI],
			centerDist,
			violation
		},
		warmIndex: bestI,
		path: near.path
	};
}

export type LapEvent =
	| { type: 'timing-started'; atMs: number }
	/** `index` is the checkpoint ARRAY index actually crossed (which
	 * alternative, on a grouped step); `step` is the sequence position it
	 * satisfied. Ungrouped tracks always have index === step. */
	| { type: 'checkpoint'; index: number; step: number; atMs: number }
	| { type: 'lap'; lapMs: number; best: boolean; atMs: number }
	| { type: 'rejected'; gateId: string; reason: 'out-of-order' | 'not-started'; atMs: number };

/**
 * Ordered-checkpoint lap state machine. Timing starts on the first
 * start/finish crossing; a lap counts only after every sequence STEP has been
 * cleared in order; out-of-order and skipped crossings are rejected (reported,
 * never advance state). Crossing times are interpolated within the frame for
 * sub-frame timing.
 *
 * `nextCheckpoint` counts SEQUENCE STEPS, not array indices (Phase 8b). On a
 * track with no checkpoint groups every gate is its own step, so steps and
 * indices coincide and the behavior is exactly what it was before groups
 * existed. On a branching track, the gates sharing a group are alternatives
 * for one step: crossing EITHER advances the step, and because the step
 * counter only moves forward, the alternative that was not taken can never
 * also be credited for that lap (it now maps to an already-passed step and is
 * rejected out-of-order, the same as any other backtrack).
 */
export class LapTracker {
	/** Next sequence step required (see the class note; not an array index). */
	nextCheckpoint = 0;
	lapsCompleted = 0;
	timing = false;
	lapStartMs = 0;
	lastLapMs: number | null = null;
	bestLapMs: number | null = null;
	/**
	 * Checkpoint array index credited for each cleared step this lap attempt,
	 * i.e. WHICH alternative was taken. Cleared at every lap boundary. Read by
	 * the harness/AI to report the route a vehicle actually drove.
	 */
	takenByStep: number[] = [];

	reset(): void {
		this.nextCheckpoint = 0;
		this.lapsCompleted = 0;
		this.timing = false;
		this.lapStartMs = 0;
		this.lastLapMs = null;
		this.bestLapMs = null;
		this.takenByStep = [];
	}

	currentLapMs(nowMs: number): number | null {
		return this.timing ? nowMs - this.lapStartMs : null;
	}

	update(
		rt: TrackRuntime,
		prev: TrackVec2,
		cur: TrackVec2,
		prevMs: number,
		nowMs: number
	): LapEvent[] {
		// Collect every gate crossed this frame, process in motion order so a
		// checkpoint and the finish line in one frame still resolve correctly.
		const crossings: { t: number; gateId: string; cpIndex: number | null }[] = [];
		const sfT = crossesGate(prev, cur, rt.startFinish);
		if (sfT !== null) crossings.push({ t: sfT, gateId: rt.startFinish.gate.id, cpIndex: null });
		rt.checkpoints.forEach((g, i) => {
			const t = crossesGate(prev, cur, g);
			if (t !== null) crossings.push({ t, gateId: g.gate.id, cpIndex: i });
		});
		crossings.sort((a, b) => a.t - b.t);

		const events: LapEvent[] = [];
		for (const c of crossings) {
			const atMs = prevMs + (nowMs - prevMs) * c.t;
			if (c.cpIndex === null) {
				if (!this.timing) {
					this.timing = true;
					this.lapStartMs = atMs;
					this.nextCheckpoint = 0;
					this.takenByStep = [];
					events.push({ type: 'timing-started', atMs });
				} else if (this.nextCheckpoint === rt.stepCount) {
					const lapMs = atMs - this.lapStartMs;
					this.lapsCompleted += 1;
					this.lastLapMs = lapMs;
					const best = this.bestLapMs === null || lapMs < this.bestLapMs;
					if (best) this.bestLapMs = lapMs;
					this.lapStartMs = atMs;
					this.nextCheckpoint = 0;
					this.takenByStep = [];
					events.push({ type: 'lap', lapMs, best, atMs });
				} else {
					events.push({ type: 'rejected', gateId: c.gateId, reason: 'out-of-order', atMs });
				}
			} else if (!this.timing) {
				events.push({ type: 'rejected', gateId: c.gateId, reason: 'not-started', atMs });
			} else if (rt.checkpointSteps[c.cpIndex] === this.nextCheckpoint) {
				// Any gate mapped to the awaited step satisfies it. The counter
				// then moves past that step, so a sibling alternative crossed
				// afterwards falls into the out-of-order branch below.
				const step = this.nextCheckpoint;
				this.takenByStep[step] = c.cpIndex;
				this.nextCheckpoint += 1;
				events.push({ type: 'checkpoint', index: c.cpIndex, step, atMs });
			} else {
				events.push({ type: 'rejected', gateId: c.gateId, reason: 'out-of-order', atMs });
			}
		}
		return events;
	}
}

/** mm:ss.hh for lap displays; null-safe. */
export function formatLapMs(ms: number | null): string {
	if (ms === null || !Number.isFinite(ms)) return '--:--.--';
	const total = Math.max(0, Math.round(ms / 10));
	const hh = total % 100;
	const s = Math.floor(total / 100) % 60;
	const m = Math.floor(total / 6000);
	return `${m}:${String(s).padStart(2, '0')}.${String(hh).padStart(2, '0')}`;
}
