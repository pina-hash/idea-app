/**
 * GREENLINE track runtime: pure geometry and lap logic over a parsed
 * `TrackData`. No three.js, no cannon-es, no Svelte; the harness turns the
 * facts returned here (gate crossings, surface state) into visuals and
 * forces. Keeping force decisions out of this module is what makes the
 * boundary behavior easy to swap later.
 */

import type { TrackBoundary, TrackData, TrackGate, TrackVec2 } from './track-schema';

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

export interface TrackRuntime {
	data: TrackData;
	startFinish: GateRuntime;
	checkpoints: GateRuntime[];
	/** Ribbon centerline (same points as the data, kept for hot loops). */
	center: TrackVec2[];
	/** Maximum half width across the lap (margins, spawn placement). */
	halfWidth: number;
	/** Per-point half width; constant-width tracks repeat the same value. */
	halfWidths: number[];
	boundaries: TrackBoundary[];
	bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
	/** Ribbon edge polylines, precomputed for meshes and the minimap. */
	leftEdge: TrackVec2[];
	rightEdge: TrackVec2[];
}

export function buildRuntime(data: TrackData): TrackRuntime {
	const center = data.surface.centerline;
	const n = center.length;
	const halfWidths = center.map((_, i) => (data.surface.widths?.[i] ?? data.surface.width) / 2);
	const halfWidth = Math.max(...halfWidths);
	const leftEdge: TrackVec2[] = [];
	const rightEdge: TrackVec2[] = [];
	for (let i = 0; i < n; i++) {
		const p0 = center[(i - 1 + n) % n];
		const p2 = center[(i + 1) % n];
		const tx = p2.x - p0.x;
		const tz = p2.z - p0.z;
		const l = Math.hypot(tx, tz) || 1;
		const nx = -tz / l;
		const nz = tx / l;
		leftEdge.push({ x: center[i].x + nx * halfWidths[i], z: center[i].z + nz * halfWidths[i] });
		rightEdge.push({ x: center[i].x - nx * halfWidths[i], z: center[i].z - nz * halfWidths[i] });
	}
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
		center,
		halfWidth,
		halfWidths,
		boundaries: data.boundaries,
		bbox: { minX, maxX, minZ, maxZ },
		leftEdge,
		rightEdge
	};
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
	warmIndex: number
): { state: SurfaceState; warmIndex: number } {
	const n = rt.center.length;
	// Warm-start nearest-centerline walk
	let bestI = ((warmIndex % n) + n) % n;
	let bestD = Infinity;
	const probe = (i: number) => {
		const p = rt.center[((i % n) + n) % n];
		const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
		if (d < bestD) {
			bestD = d;
			bestI = ((i % n) + n) % n;
		}
	};
	for (let k = -8; k <= 8; k++) probe(warmIndex + k);
	// If the local window looks wrong (teleport, reset), scan everything.
	if (bestD > 40 * 40) {
		for (let i = 0; i < n; i++) probe(i);
	}
	const centerDist = Math.sqrt(bestD);

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
		state: { onRibbon: centerDist <= rt.halfWidths[bestI], centerDist, violation },
		warmIndex: bestI
	};
}

export type LapEvent =
	| { type: 'timing-started'; atMs: number }
	| { type: 'checkpoint'; index: number; atMs: number }
	| { type: 'lap'; lapMs: number; best: boolean; atMs: number }
	| { type: 'rejected'; gateId: string; reason: 'out-of-order' | 'not-started'; atMs: number };

/**
 * Ordered-checkpoint lap state machine. Timing starts on the first
 * start/finish crossing; a lap counts only after every checkpoint has been
 * crossed in array order; out-of-order and skipped-checkpoint crossings are
 * rejected (reported, never advance state). Crossing times are interpolated
 * within the frame for sub-frame timing.
 */
export class LapTracker {
	nextCheckpoint = 0;
	lapsCompleted = 0;
	timing = false;
	lapStartMs = 0;
	lastLapMs: number | null = null;
	bestLapMs: number | null = null;

	reset(): void {
		this.nextCheckpoint = 0;
		this.lapsCompleted = 0;
		this.timing = false;
		this.lapStartMs = 0;
		this.lastLapMs = null;
		this.bestLapMs = null;
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
					events.push({ type: 'timing-started', atMs });
				} else if (this.nextCheckpoint === rt.checkpoints.length) {
					const lapMs = atMs - this.lapStartMs;
					this.lapsCompleted += 1;
					this.lastLapMs = lapMs;
					const best = this.bestLapMs === null || lapMs < this.bestLapMs;
					if (best) this.bestLapMs = lapMs;
					this.lapStartMs = atMs;
					this.nextCheckpoint = 0;
					events.push({ type: 'lap', lapMs, best, atMs });
				} else {
					events.push({ type: 'rejected', gateId: c.gateId, reason: 'out-of-order', atMs });
				}
			} else if (!this.timing) {
				events.push({ type: 'rejected', gateId: c.gateId, reason: 'not-started', atMs });
			} else if (c.cpIndex === this.nextCheckpoint) {
				this.nextCheckpoint += 1;
				events.push({ type: 'checkpoint', index: c.cpIndex, atMs });
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
