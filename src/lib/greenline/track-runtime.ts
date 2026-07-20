/**
 * GREENLINE track runtime: pure geometry and lap logic over a parsed
 * `TrackData`. No three.js, no cannon-es, no Svelte; the harness turns the
 * facts returned here (gate crossings, surface state) into visuals and
 * forces. Keeping force decisions out of this module is what makes the
 * boundary behavior easy to swap later.
 */

import type { TrackBoundary, TrackData, TrackGate, TrackVec2, TrackZone } from './track-schema';

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
	const center = data.surface.centerline;
	const main = buildPath(
		'main',
		data.surface.closed,
		center,
		data.surface.width,
		data.surface.widths,
		data.surface.elevations,
		data.surface.banking
	);
	const paths: RibbonRuntime[] = [main];
	for (const br of data.surface.branches ?? []) {
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

/** Interpolated surface height at `(x, z)` against one path. */
function surfaceYOnPath(p: RibbonRuntime, x: number, z: number, bestI: number): number {
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
	if (!best) return p.elevations[bestI];
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
	let lat = (x - px) * (-ez / el) + (z - pz) * (ex / el);
	lat = Math.max(-hw, Math.min(hw, lat));
	return elev + lat * Math.tan(bank);
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
