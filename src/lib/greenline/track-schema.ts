/**
 * GREENLINE track format, v1 (`schemaVersion: 1`).
 *
 * A track is one plain-JSON file conforming to `TrackData` (see
 * `tracks/test-loop.json` for the reference track). This is the schema every
 * future track uses; extend it by adding fields or new discriminated-union
 * members, never by repurposing existing ones.
 *
 * Conventions, fixed for all tracks:
 * - All positions and dimensions are WORLD UNITS (meters). Tracks live on the
 *   ground plane: `x`/`z` are horizontal, `y` is up (tracks are flat in v1;
 *   an elevation field would be an additive v2 change).
 * - Headings are degrees, `0` pointing along `+x`, positive counterclockwise
 *   seen from above, i.e. `headingDeg = atan2(-dz, dx)` for a direction
 *   vector `(dx, dz)`. This matches the movement harness's heading readout.
 * - `checkpoints` is ORDERED: a lap must cross every gate in array order,
 *   then the start/finish line.
 */

export interface TrackVec2 {
	x: number;
	z: number;
}

/**
 * A directional gate line: the segment of length `2 * halfWidth` centered at
 * `(x, z)`, perpendicular to `headingDeg`. A crossing only counts when the
 * vehicle's motion has a positive component along `headingDeg`, so driving
 * backward through a gate never registers. Used for both checkpoints and the
 * start/finish line.
 */
export interface TrackGate {
	id: string;
	name?: string;
	x: number;
	z: number;
	headingDeg: number;
	halfWidth: number;
}

/**
 * The drivable surface. v1 defines one kind, a `ribbon`: a corridor of
 * constant `width` swept along `centerline`. Future surface kinds (mesh,
 * heightmap, variable width) join this union under new `type` tags.
 */
export interface RibbonSurface {
	type: 'ribbon';
	/** Full corridor width in world units. */
	width: number;
	/** Whether the centerline closes back on itself (a circuit). */
	closed: boolean;
	centerline: TrackVec2[];
}
export type TrackSurface = RibbonSurface;

/**
 * Boundary geometry that keeps the vehicle on course. Each boundary is a
 * polyline (closed = polygon). How the runtime enforces them (soft wall,
 * slowdown, hard collision) is a runtime/feel decision, deliberately NOT part
 * of the data; the data only says where the limits are.
 */
export interface TrackBoundary {
	id: string;
	closed: boolean;
	points: TrackVec2[];
}

export interface TrackSpawn {
	x: number;
	z: number;
	headingDeg: number;
}

export interface TrackData {
	schemaVersion: 1;
	/** Stable slug, unique across tracks. */
	id: string;
	name: string;
	description?: string;
	/** Documentation field; always `meters` in v1. */
	units: 'meters';
	spawn: TrackSpawn;
	surface: TrackSurface;
	startFinish: TrackGate;
	/** Ordered. A lap = all of these in order, then `startFinish`. */
	checkpoints: TrackGate[];
	boundaries: TrackBoundary[];
}

/**
 * Minimal structural validation with readable errors, for catching a
 * malformed track file at load time in dev. Returns the same object, typed.
 */
export function parseTrack(raw: unknown): TrackData {
	const fail = (msg: string): never => {
		throw new Error(`Invalid GREENLINE track: ${msg}`);
	};
	if (typeof raw !== 'object' || raw === null) fail('not an object');
	const t = raw as TrackData;
	if (t.schemaVersion !== 1) fail(`unsupported schemaVersion ${String(t.schemaVersion)}`);
	if (!t.id || typeof t.id !== 'string') fail('missing id');
	if (!t.spawn || typeof t.spawn.x !== 'number' || typeof t.spawn.headingDeg !== 'number')
		fail('missing or malformed spawn');
	if (t.surface?.type !== 'ribbon') fail(`unknown surface type ${String(t.surface?.type)}`);
	if (!Array.isArray(t.surface.centerline) || t.surface.centerline.length < 3)
		fail('ribbon centerline needs at least 3 points');
	if (!(t.surface.width > 0)) fail('ribbon width must be positive');
	const checkGate = (g: TrackGate | undefined, label: string) => {
		if (!g || typeof g.x !== 'number' || typeof g.headingDeg !== 'number' || !(g.halfWidth > 0))
			fail(`malformed gate: ${label}`);
	};
	checkGate(t.startFinish, 'startFinish');
	if (!Array.isArray(t.checkpoints) || t.checkpoints.length < 1) fail('no checkpoints');
	t.checkpoints.forEach((g, i) => checkGate(g, `checkpoints[${i}] (${g?.id ?? '?'})`));
	if (!Array.isArray(t.boundaries)) fail('missing boundaries');
	t.boundaries.forEach((b, i) => {
		if (!Array.isArray(b?.points) || b.points.length < 2) fail(`boundaries[${i}] too short`);
	});
	return t;
}
