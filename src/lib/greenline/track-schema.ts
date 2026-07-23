/**
 * GREENLINE track format, v3 (`schemaVersion: 1 | 2 | 3`).
 *
 * A track is one plain-JSON file conforming to `TrackData` (see
 * `tracks/proving-ground-07.json` for the flat v1 reference,
 * `tracks/relief-proof-01.json` for the v2 proof segment, and
 * `tracks/piece-proof-01.json` for the v3 piece-chain proof loop). This is the
 * schema every future track uses; extend it by adding fields or new
 * discriminated-union members, never by repurposing existing ones. v2 is
 * purely ADDITIVE over v1: per-point `elevations` / `banking` on the ribbon
 * (the `widths` convention) and the gameplay `zones` list; every v1 track
 * parses and behaves exactly as before. v3 is likewise additive: it adds the
 * `pieces` SURFACE kind (a chain of parametric `TrackPiece` segments compiled
 * by `track-pieces.ts` into the same per-point arrays the ribbon runtime has
 * always swept); every v1/v2 ribbon track parses and behaves exactly as
 * before — internally a ribbon IS a one-piece chain (one verbatim `freeform`
 * piece), so the old format is the trivial instance of the new model rather
 * than a parallel system.
 *
 * Conventions, fixed for all tracks:
 * - All positions and dimensions are WORLD UNITS (meters). `x`/`z` are
 *   horizontal, `y` is up. A track without `elevations`/`banking` is flat on
 *   the ground plane at y 0.
 * - Headings are degrees, `0` pointing along `+x`, positive counterclockwise
 *   seen from above, i.e. `headingDeg = atan2(-dz, dx)` for a direction
 *   vector `(dx, dz)`. This matches the movement harness's heading readout.
 * - `checkpoints` is ORDERED: a lap must cross every gate in array order,
 *   then the start/finish line.
 */

// Value import only (the piece compiler + its validators); track-pieces
// imports nothing but TYPES from this module, so there is no runtime cycle.
import {
	compileSurface,
	pieceIssue,
	PIECE_BANK_MAX_DEG,
	PIECE_PITCH_MAX_DEG
} from './track-pieces';

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
	/**
	 * Optional alternative-gate group (schema v2, Phase 8b). Checkpoints
	 * sharing a group id are ALTERNATIVES for the same sequence position: a
	 * lap credits whichever one the driver crosses, and the others become
	 * uncreditable for that lap. This is what makes a route branch lawful —
	 * the main line and the shortcut each carry their own gate, and either
	 * satisfies the step.
	 *
	 * Group members must be CONTIGUOUS in the `checkpoints` array; the runtime
	 * derives sequence steps by walking the array and starting a new step
	 * whenever the group id changes (an ungrouped gate is always its own
	 * step). Ungrouped is the default, so a track with no groups gets one step
	 * per checkpoint, exactly the pre-8b ordering.
	 */
	group?: string;
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
	/**
	 * Optional per-point surface elevation: the world-unit `y` of the
	 * centerline at each point, one entry per centerline point (the `widths`
	 * convention exactly; missing = flat at y 0). Every consumer reads
	 * elevation through the runtime's precomputed 3D sweep
	 * (`leftEdge3`/`rightEdge3`), so flat tracks are untouched. Schema v2.
	 */
	elevations?: number[];
	/**
	 * Optional per-point banking: the surface's roll about the local
	 * direction of travel, in DEGREES, one entry per centerline point
	 * (`widths` convention; missing = 0 everywhere). Positive raises the
	 * runtime's `leftEdge` side of the sweep (the lateral normal
	 * `(-tz, tx)`, which is the driver's RIGHT traveling in point order), so
	 * a right-hand turn banks correctly with NEGATIVE values (outside edge
	 * raised). Schema v2.
	 */
	banking?: number[];
	/** Whether the centerline closes back on itself (a circuit). */
	closed: boolean;
	centerline: TrackVec2[];
	/**
	 * Optional alternate routes (schema v2, Phase 8b): OPEN ribbon spurs that
	 * diverge from the main centerline and rejoin it later. Each is a REAL
	 * drivable surface — its own swept mesh, its own physics collision, and
	 * `surfaceState` counts a vehicle on it as on-ribbon — not a painted lane
	 * or a scoring trick.
	 *
	 * Additive: a surface with no `branches` builds exactly one path and every
	 * consumer sees the pre-8b single-ribbon runtime unchanged.
	 *
	 * Keeping the two routes APART is boundary work, not surface work: the
	 * data says where each path is, and a boundary island between them (the
	 * existing inner-loop convention) is what stops a driver cutting across
	 * the gap.
	 */
	branches?: RibbonBranch[];
}

/**
 * An alternate route spur. Always OPEN (it starts on the main line and ends
 * back on it); `joinStart`/`joinEnd` are the main-centerline point indices it
 * leaves from and returns to, which is what lets the runtime splice a complete
 * lap route for the AI to follow. Geometry fields mirror `RibbonSurface`.
 */
export interface RibbonBranch {
	id: string;
	name?: string;
	width: number;
	widths?: number[];
	elevations?: number[];
	banking?: number[];
	centerline: TrackVec2[];
	/** Main-centerline index this spur diverges from. */
	joinStart: number;
	/** Main-centerline index this spur rejoins at (> joinStart). */
	joinEnd: number;
}
/**
 * One segment of a v3 piece chain. Every parametric kind takes its ENTRY POSE
 * (position, heading, pitch, bank — threaded through the chain walk, never
 * stored per piece) plus the params here, and produces a DETERMINISTIC exit
 * pose in closed form; `track-pieces.ts` owns the generators and the exact
 * profile math. Angles are degrees throughout (the schema convention); pitch
 * is a grade angle (dy/dPlan = tan(pitch)), bank is the ribbon banking sign
 * (positive raises the runtime's leftEdge side, the driver's right), and a
 * positive `turnDeg` increases heading (a left turn). Bank on every kind is
 * capped WELL CLEAR of 90 degrees (`PIECE_BANK_MAX_DEG` 60): v3 deliberately
 * has no vertical pieces, no loops/wallrides, no general 6DOF rotation.
 *
 * New kinds join this union under new `kind` tags (the TrackZone/WeaponDef
 * catalog pattern); `parseTrack` fails loudly on an unknown kind.
 */
export type TrackPiece =
	/** Constant heading/bank; grade eases to `targetPitchDeg` (default: held). */
	| { kind: 'straight'; length: number; targetPitchDeg?: number; width?: number }
	/** Plan arc at `radius` through signed `turnDeg`; pitch and bank held. */
	| { kind: 'curve'; radius: number; turnDeg: number; width?: number }
	/** Roll transition on a straight run: bank eases to `targetBankDeg`. */
	| { kind: 'bank'; length: number; targetBankDeg: number; width?: number }
	/**
	 * Closure-neutral kicker: climb to a lip `kickHeight` above the entry
	 * elevation line, a deliberately steep drop face back down (grade-lint
	 * exempt, the Terminal Nine deck-edge pattern), flat run-out. Exit pose
	 * equals a plain straight's.
	 */
	| { kind: 'jump'; length: number; kickHeight: number; width?: number }
	/**
	 * THE piece v3 exists for: bank and grade move together over the piece's
	 * own length. Elevation gains `rise` along smootherstep while the bank
	 * swells to `peakBankDeg` in proportion to the extra grade the spiral adds
	 * (the same curve's normalized derivative), returning to the entry bank at
	 * the exit. `turnDeg` 0 is a straight spiral; nonzero sweeps a plan arc of
	 * derived radius `length / |turnDeg in radians|`.
	 */
	| { kind: 'corkscrew'; length: number; turnDeg: number; rise: number; peakBankDeg: number; width?: number }
	/**
	 * Verbatim authored geometry in ABSOLUTE world coordinates — the ribbon
	 * fields, embedded as a piece. This is the backward-compatibility
	 * container: a legacy ribbon surface compiles as exactly one of these,
	 * passed through with zero arithmetic (byte-identical sweep + collision).
	 * It ignores the incoming pose; its exit pose derives from its own data.
	 */
	| {
			kind: 'freeform';
			centerline: TrackVec2[];
			width?: number;
			widths?: number[];
			elevations?: number[];
			banking?: number[];
	  };

/** Entry pose of a piece chain's first piece. Missing y/pitch/bank = 0. */
export interface PieceChainStart {
	x: number;
	z: number;
	y?: number;
	headingDeg: number;
	pitchDeg?: number;
	bankDeg?: number;
}

/**
 * The v3 surface kind: an ordered chain of `TrackPiece` segments, walked from
 * `start` with each piece's exit pose feeding the next piece's entry. Always a
 * CLOSED circuit: `parseTrack` (via the compiler) rejects a chain whose final
 * exit pose does not land back on `start` within tight tolerances. Piece
 * chains are linear — no `branches` (route splits remain ribbon territory for
 * now) — and compile into the same per-point centerline/width/elevation/
 * banking arrays a ribbon carries, so every runtime consumer downstream of
 * `compileSurface` is shared, unchanged code.
 */
export interface PieceChainSurface {
	type: 'pieces';
	/** Corridor full width the chain starts at (pieces may blend to their own). */
	width: number;
	start: PieceChainStart;
	pieces: TrackPiece[];
}

export type TrackSurface = RibbonSurface | PieceChainSurface;

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
 * Gameplay trigger zones (schema v2). Deliberately NOT a `TrackProp`: props
 * are documented as pure presentation the runtime never reads, and zones ARE
 * gameplay — the runtime tracks per-vehicle occupancy and the harness applies
 * the effects. Each zone is a circular trigger area on the surface (position
 * + radius, world units), checked top-down like `surfaceState`. New zone
 * families join the discriminated union under new `type` tags, and new
 * hazard behaviors grow the `kind` field (the WeaponDef-catalog pattern from
 * combat phases 4a/4b).
 */
export type TrackZone =
	| {
			type: 'boost';
			id: string;
			x: number;
			z: number;
			radius: number;
			/** Engine-force multiplier while the boost window runs (default 1.8). */
			strength?: number;
			/** Boost window in seconds from entry (default 1.5). */
			durationSec?: number;
	  }
	| {
			type: 'hazard';
			id: string;
			x: number;
			z: number;
			radius: number;
			/**
			 * Hazard behavior. v2 ships `oil`: a permanent slick patch — entering
			 * applies the deployed-oil-slick traction cut (per-vehicle retrigger
			 * window, never consumed). More kinds join here in 8b.
			 */
			kind: 'oil';
	  }
	| {
			/**
			 * Pit repair box (Phase 9c). Unlike boost/hazard, which fire ONCE on
			 * entry, the pit zone rewards a genuine STOP: a vehicle nearly stopped
			 * (speed <= `stopSpeed`) inside the box heals continuously at
			 * `repairPerSec` through `VehicleCombat.repair()`, so the amount healed
			 * scales with how long it dwells — a quick splash tops up a little, a
			 * full stop restores everything (the pool caps clamp it). The whole
			 * point of the pit LANE is that this is paid for in time (a longer
			 * detour plus the stop), not a meter, which is why it heals far more
			 * completely than the Overcharge Repair ability's fixed partial heal.
			 * Authored INSIDE a pit-lane branch so you must take the detour to use
			 * it. Zone families join `TrackZone` under new `type` tags.
			 */
			type: 'pit';
			id: string;
			x: number;
			z: number;
			radius: number;
			/** Health restored per second while stopped in the box (default 50). */
			repairPerSec?: number;
			/** Speed (m/s) at or below which the car counts as stopped (default 2.5). */
			stopSpeed?: number;
	  };

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
	schemaVersion: 1 | 2 | 3;
	/** Stable slug, unique across tracks. */
	id: string;
	name: string;
	description?: string;
	/** Documentation field; always `meters`. */
	units: 'meters';
	spawn: TrackSpawn;
	surface: TrackSurface;
	startFinish: TrackGate;
	/** Ordered. A lap = all of these in order, then `startFinish`. */
	checkpoints: TrackGate[];
	boundaries: TrackBoundary[];
	/** Optional gameplay trigger zones (see `TrackZone`). Schema v2. */
	zones?: TrackZone[];
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
	if (t.schemaVersion !== 1 && t.schemaVersion !== 2 && t.schemaVersion !== 3)
		fail(`unsupported schemaVersion ${String(t.schemaVersion)}`);
	if (!t.id || typeof t.id !== 'string') fail('missing id');
	if (!t.spawn || typeof t.spawn.x !== 'number' || typeof t.spawn.headingDeg !== 'number')
		fail('missing or malformed spawn');
	const surfType = (t.surface as { type?: unknown } | undefined)?.type;
	if (surfType !== 'ribbon' && surfType !== 'pieces')
		fail(`unknown surface type ${String(surfType)}`);
	if (t.surface.type === 'pieces') {
		// v3 piece-chain surface: structural checks here, then the compiler
		// (cached, so the runtime build reuses this walk) performs the deep
		// geometric validation — per-piece params, joint continuity, loop
		// closure, the catch-plane bank raise, the grade lint, the bank cap.
		if (t.schemaVersion !== 3) fail('a pieces surface requires schemaVersion 3');
		if (!(t.surface.width > 0)) fail('piece chain width must be positive');
		const st = t.surface.start;
		if (
			!st ||
			typeof st.x !== 'number' ||
			typeof st.z !== 'number' ||
			typeof st.headingDeg !== 'number'
		)
			fail('piece chain start pose needs numeric x, z, headingDeg');
		for (const [key, cap] of [
			['y', Infinity],
			['pitchDeg', PIECE_PITCH_MAX_DEG],
			['bankDeg', PIECE_BANK_MAX_DEG]
		] as const) {
			const v = st[key];
			if (v === undefined) continue;
			if (!Number.isFinite(v) || Math.abs(v) > cap)
				fail(`piece chain start ${key} must be finite${cap !== Infinity ? ` and within ±${cap}` : ''}`);
		}
		if (!Array.isArray(t.surface.pieces) || t.surface.pieces.length < 1)
			fail('piece chain needs at least 1 piece');
		t.surface.pieces.forEach((p, i) => {
			const issue = pieceIssue(p);
			if (issue) fail(`pieces[${i}]: ${issue}`);
		});
		try {
			compileSurface(t.surface);
		} catch (e) {
			fail(e instanceof Error ? e.message : String(e));
		}
	}
	if (t.surface.type === 'ribbon') {
		const s = t.surface;
		if (!Array.isArray(s.centerline) || s.centerline.length < 3)
			fail('ribbon centerline needs at least 3 points');
		if (!(s.width > 0)) fail('ribbon width must be positive');
		if (s.widths !== undefined) {
			if (!Array.isArray(s.widths) || s.widths.length !== s.centerline.length)
				fail('ribbon widths must have one entry per centerline point');
			if (s.widths.some((w) => !(w > 0))) fail('every ribbon width must be positive');
		}
		if (s.elevations !== undefined) {
			if (!Array.isArray(s.elevations) || s.elevations.length !== s.centerline.length)
				fail('ribbon elevations must have one entry per centerline point');
			if (s.elevations.some((e) => !Number.isFinite(e)))
				fail('every ribbon elevation must be a finite number');
		}
		if (s.banking !== undefined) {
			if (!Array.isArray(s.banking) || s.banking.length !== s.centerline.length)
				fail('ribbon banking must have one entry per centerline point');
			if (s.banking.some((b) => !Number.isFinite(b) || Math.abs(b) > 75))
				fail('every ribbon banking angle must be finite and within +/-75 degrees');
		}
		if (s.branches !== undefined) {
		if (!Array.isArray(s.branches)) fail('surface.branches must be an array');
		const mainN = s.centerline.length;
		s.branches.forEach((br, i) => {
			const tag = `surface.branches[${i}] (${br?.id ?? '?'})`;
			if (typeof br !== 'object' || br === null) fail(`${tag} malformed`);
			if (!br.id || typeof br.id !== 'string') fail(`${tag} missing id`);
			if (!Array.isArray(br.centerline) || br.centerline.length < 2)
				fail(`${tag} centerline needs at least 2 points`);
			if (!(br.width > 0)) fail(`${tag} width must be positive`);
			for (const [key, arr] of [
				['widths', br.widths],
				['elevations', br.elevations],
				['banking', br.banking]
			] as const) {
				if (arr === undefined) continue;
				if (!Array.isArray(arr) || arr.length !== br.centerline.length)
					fail(`${tag} ${key} must have one entry per branch centerline point`);
				if (arr.some((v) => !Number.isFinite(v))) fail(`${tag} ${key} must all be finite`);
			}
			if (br.widths?.some((w) => !(w > 0))) fail(`${tag} every width must be positive`);
			if (br.banking?.some((b) => Math.abs(b) > 75))
				fail(`${tag} banking angles must be within +/-75 degrees`);
			// Join indices must address the main centerline, in order, or the
			// spliced AI route would be nonsense.
			if (!Number.isInteger(br.joinStart) || br.joinStart < 0 || br.joinStart >= mainN)
				fail(`${tag} joinStart ${String(br.joinStart)} is not a main centerline index`);
			if (!Number.isInteger(br.joinEnd) || br.joinEnd <= br.joinStart || br.joinEnd >= mainN)
				fail(`${tag} joinEnd ${String(br.joinEnd)} must be a main index after joinStart`);
		});
		}
	}
	const checkGate = (g: TrackGate | undefined, label: string) => {
		if (!g || typeof g.x !== 'number' || typeof g.headingDeg !== 'number' || !(g.halfWidth > 0))
			fail(`malformed gate: ${label}`);
		if (g?.group !== undefined && (typeof g.group !== 'string' || !g.group))
			fail(`gate ${label} has a malformed group`);
	};
	checkGate(t.startFinish, 'startFinish');
	if (t.startFinish?.group !== undefined) fail('startFinish cannot belong to a checkpoint group');
	if (!Array.isArray(t.checkpoints) || t.checkpoints.length < 1) fail('no checkpoints');
	t.checkpoints.forEach((g, i) => checkGate(g, `checkpoints[${i}] (${g?.id ?? '?'})`));
	// Groups define one sequence step, so their members must be contiguous:
	// a group that reappears after a gap would silently become two steps.
	const seenGroups = new Set<string>();
	let runGroup: string | undefined;
	t.checkpoints.forEach((g, i) => {
		const grp = g?.group;
		if (grp === runGroup) return;
		if (grp !== undefined) {
			if (seenGroups.has(grp))
				fail(`checkpoints[${i}] reopens group "${grp}"; group members must be contiguous`);
			seenGroups.add(grp);
		}
		runGroup = grp;
	});
	if (!Array.isArray(t.boundaries)) fail('missing boundaries');
	t.boundaries.forEach((b, i) => {
		if (!Array.isArray(b?.points) || b.points.length < 2) fail(`boundaries[${i}] too short`);
	});
	if (t.zones !== undefined) {
		if (!Array.isArray(t.zones)) fail('zones must be an array');
		t.zones.forEach((zn, i) => {
			if (typeof zn !== 'object' || zn === null) fail(`zones[${i}] malformed`);
			if (zn.type !== 'boost' && zn.type !== 'hazard' && zn.type !== 'pit')
				fail(`zones[${i}] has unknown type ${String((zn as { type?: unknown }).type)}`);
			if (!zn.id || typeof zn.id !== 'string') fail(`zones[${i}] missing id`);
			if (typeof zn.x !== 'number' || typeof zn.z !== 'number' || !(zn.radius > 0))
				fail(`zones[${i}] (${zn.id}) needs numeric x/z and a positive radius`);
			// Unknown hazard kinds fail loudly at load, not silently at play.
			if (zn.type === 'hazard' && zn.kind !== 'oil')
				fail(`zones[${i}] (${zn.id}) has unknown hazard kind ${String(zn.kind)}`);
			if (zn.type === 'pit') {
				if (zn.repairPerSec !== undefined && !(zn.repairPerSec > 0))
					fail(`zones[${i}] (${zn.id}) repairPerSec must be positive`);
				if (zn.stopSpeed !== undefined && !(zn.stopSpeed > 0))
					fail(`zones[${i}] (${zn.id}) stopSpeed must be positive`);
			}
		});
	}
	if (t.props !== undefined) {
		if (!Array.isArray(t.props)) fail('props must be an array');
		t.props.forEach((p, i) => {
			if (typeof p !== 'object' || p === null || typeof p.type !== 'string')
				fail(`props[${i}] malformed`);
		});
	}
	return t;
}
