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
 * The drivable surface. v1 defines one kind, a `ribbon`: a corridor swept
 * along `centerline`. Width is constant (`width`) unless the optional
 * per-point `widths` array is present. Future surface kinds (mesh,
 * heightmap) join this union under new `type` tags.
 */
export interface RibbonSurface {
	type: 'ribbon';
	/** Full corridor width in world units (constant fallback). */
	width: number;
	/**
	 * Optional per-point full width, one entry per centerline point, for a
	 * corridor that breathes (a wide combat pad, a narrow chokepoint) within
	 * one lap. Missing = constant `width`. Additive field: every consumer
	 * reads widths through the runtime's precomputed edges/halfWidths, so
	 * constant-width tracks are untouched.
	 */
	widths?: number[];
	/** Whether the centerline closes back on itself (a circuit). */
	closed: boolean;
	centerline: TrackVec2[];
}
export type TrackSurface = RibbonSurface;

/**
 * Optional environmental dressing: cheap primitive set pieces that make a
 * track read as a PLACE (floodlight towers, gantries, container/barrier
 * blocks, skid-pad paint, a banked berm wall). Pure presentation data:
 * nothing in the track runtime reads props, the harness renders them, and
 * gameplay (laps, boundaries, AI) never depends on them.
 */
export type TrackProp =
	| { type: 'lightTower'; x: number; z: number; headingDeg: number; height?: number }
	| { type: 'gantry'; x: number; z: number; headingDeg: number; span: number }
	| {
			type: 'block';
			x: number;
			z: number;
			headingDeg: number;
			w: number;
			l: number;
			h: number;
			kind?: 'container' | 'railcar' | 'barrier';
	  }
	| { type: 'pad'; x: number; z: number; radius: number; rings?: number[] }
	/** Angled wall strip lofted from `inner` (ground) to `outer` (raised). */
	| { type: 'berm'; inner: TrackVec2[]; outer: TrackVec2[]; height: number }
	/**
	 * Freestanding shipping container stack at standard ISO proportions
	 * (unlike `block`, which is a free-sized mass): `long` picks the 12 m
	 * forty-footer over the 6 m box, `stack` is units tall (1-3). The
	 * renderer varies worn paint tones per unit.
	 */
	| { type: 'container'; x: number; z: number; headingDeg: number; stack?: number; long?: boolean }
	/**
	 * Background yard structure, the key art's silhouetted distant masses:
	 * a near-black shape with sparse lit windows and a soft motivated glow.
	 * Deliberately low-detail; place it as depth, never beside the racing
	 * line. `l` runs along the heading, `w` across it.
	 */
	| {
			type: 'building';
			x: number;
			z: number;
			headingDeg: number;
			w: number;
			l: number;
			h: number;
			kind?: 'warehouse' | 'tower';
	  }
	/**
	 * Industrial yard machinery left where it was parked: a rubber-tyred
	 * gantry crane (`crane`) or a wheel loader (`loader`). More detail than
	 * a building; safe to sit near (still outside) the racing line.
	 */
	| { type: 'machine'; x: number; z: number; headingDeg: number; kind?: 'crane' | 'loader' };

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
	/** Optional presentation-only set dressing (see `TrackProp`). */
	props?: TrackProp[];
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
	if (t.surface.widths !== undefined) {
		if (
			!Array.isArray(t.surface.widths) ||
			t.surface.widths.length !== t.surface.centerline.length
		)
			fail('ribbon widths must have one entry per centerline point');
		if (t.surface.widths.some((w) => !(w > 0))) fail('every ribbon width must be positive');
	}
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
	if (t.props !== undefined) {
		if (!Array.isArray(t.props)) fail('props must be an array');
		t.props.forEach((p, i) => {
			if (typeof p !== 'object' || p === null || typeof p.type !== 'string')
				fail(`props[${i}] malformed`);
		});
	}
	return t;
}
