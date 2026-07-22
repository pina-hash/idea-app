/**
 * GREENLINE track builder, stage 2 (dev tool): the PIECE MODEL and COMPILER.
 *
 * Trackmania-style discrete pieces that snap socket-to-socket and compile into
 * the game's REAL schema-v2 `TrackData` (`track-schema.ts`) — a smooth
 * continuous corridor, never a blocky grid. Pure math: no three.js, no Svelte,
 * no DOM, so the compiler is scriptable from the console and the 2D/3D views
 * are strictly presentation over `CompiledTrack`.
 *
 * SOCKET MODEL (generalized in stage 2). A socket is the full connection state
 * at a joint: position, heading, elevation, bank, width. A piece takes ONE
 * entry socket and returns its samples plus its exits. Most pieces return a
 * single `exit`, so the chain is linear and the corridor is continuous by
 * construction. A FORK additionally returns a `branch` socket — one entry, two
 * exits — which seeds a nested sub-chain; that sub-chain's terminating MERGE
 * piece is a derived connector back onto the main line (two entries, one exit).
 * Nothing about the linear pieces changed to make that work: forks and merges
 * are additional sockets on the same model, not a special-cased piece type.
 *
 * That maps ONTO the schema rather than inventing a parallel one: the game
 * already represents a route split as `surface.branches[]` — a spur with its
 * own centerline plus `joinStart`/`joinEnd` indices into the MAIN centerline,
 * which `buildRuntime` turns into `paths[]` and splices into lap `routes[]`.
 * The main line runs through the split untouched. So a builder branch emits
 * exactly one `RibbonBranch`, sharing its first and last points EXACTLY with
 * `main[joinStart]` / `main[joinEnd]` (verified against Terminal Nine, which
 * shares both endpoints to 0.00 m).
 *
 * Invariants the compiler enforces BY CONSTRUCTION (not merely checked):
 * - The banked-ribbon authoring rule (Phase 8a): the y-0 catch plane swallows
 *   the low half of a banked section unless the centerline is raised, so every
 *   sample's elevation is lifted to at least halfWidth * sin(|bank|). Applied
 *   to EVERY lane, main and branch alike.
 * - The run-off margin rule (Terminal Nine, Phase 8b): the generated boundary
 *   offset shrinks from the flat 9 m toward ~1.8 m wherever the ribbon edge is
 *   raised, so a car engages the soft wall instead of falling off a deck edge.
 * - Gates sit BETWEEN centerline samples, never on one (the stage-1 degenerate
 *   -placement fix, now applied to every authored gate, not just auto ones).
 * - A branch's bypassed stretch may not contain an ungrouped checkpoint — the
 *   bug that shipped once on Terminal Nine, where every shortcut car drove the
 *   branch perfectly and could never complete a lap.
 *
 * `validate.ts` re-verifies the OUTCOME against the real `parseTrack` /
 * `buildRuntime` / `surfaceState` rather than trusting any of this code.
 */

import { buildRuntime, surfaceState, type TrackRuntime } from '../track-runtime';
import type {
	RibbonBranch,
	TrackBoundary,
	TrackData,
	TrackGate,
	TrackVec2,
	TrackZone
} from '../track-schema';

const DEG = Math.PI / 180;

/** Centerline sample spacing, meters (the committed tracks' 4 m convention). */
export const SAMPLE_SPACING = 4;

/** Flat-ground boundary offset beyond the ribbon edge (Proving Ground's 9 m). */
export const FLAT_MARGIN_M = 9;
/** Boundary offset floor beside raised track (Terminal Nine's deck lesson). */
export const MIN_ELEVATED_MARGIN_M = 1.8;
/** Edge elevation above which a span counts as "raised" for the margin rule. */
export const ELEVATED_EDGE_M = 1.5;
/**
 * Edge elevation above which a span is DECK territory (a fall a car cannot
 * drive back from): the margin there must be wall-tight. Between
 * ELEVATED_EDGE_M and this, the margin tapers.
 */
export const DECK_EDGE_M = 3;

/** Minimum clear gap between a branch corridor and the main one, for the island. */
export const MIN_BRANCH_SEPARATION_M = 6;

/**
 * A socket: the full connection state at a piece joint. Snapping is just
 * "the next piece's entry socket IS this object".
 */
export interface BuilderSocket {
	x: number;
	z: number;
	headingDeg: number;
	elev: number;
	bankDeg: number;
	/** Corridor width at the joint, so the next piece can blend from it. */
	width: number;
}

export type PieceType =
	| 'start-finish'
	| 'straight'
	| 'curve-left'
	| 'curve-right'
	| 'banked-left'
	| 'banked-right'
	| 'jump'
	| 'chicane-left'
	| 'chicane-right'
	| 'fork-left'
	| 'fork-right'
	| 'merge'
	| 'loop-close';

export interface PlacedPiece {
	id: string;
	type: PieceType;
	params: Record<string, number>;
	/**
	 * Fork pieces only: the nested branch sub-sequence, always terminated by a
	 * `merge` piece. Keeping it nested (rather than a flag on a flat list) is
	 * what lets the UI render the split as two visible sub-sequences and makes
	 * "delete the fork" unambiguously mean "delete its branch too".
	 */
	branch?: PlacedPiece[];
}

export interface ParamSpec {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
}

interface PieceSample {
	x: number;
	z: number;
	elev: number;
	bankDeg: number;
	width: number;
	/** Grade-check exempt: the deliberately near-vertical jump drop face. */
	cliff: boolean;
}

interface PieceGen {
	/** Samples INCLUDING both endpoints; the compiler drops duplicate joints. */
	samples: PieceSample[];
	exit: BuilderSocket;
	/** Fork pieces: the second exit, seeding the nested branch sub-chain. */
	branch?: BuilderSocket;
}

interface GenContext {
	/** Where the track begins (the loop-close connector's snap target). */
	trackStart: BuilderSocket;
	/** Where a merge connector must land (branch sub-chains only). */
	mergeTarget?: BuilderSocket;
}

export interface PieceDef {
	type: PieceType;
	name: string;
	params: ParamSpec[];
	defaults: Record<string, number>;
	/** True for pieces that open a nested branch sub-sequence. */
	forks?: boolean;
	generate(entry: BuilderSocket, params: Record<string, number>, ctx: GenContext): PieceGen;
}

/* ------------------------------------------------------------------ */
/* math helpers                                                        */
/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep01(t: number): number {
	const c = clamp(t, 0, 1);
	return c * c * (3 - 2 * c);
}
function smootherstep01(t: number): number {
	const c = clamp(t, 0, 1);
	return c * c * c * (c * (c * 6 - 15) + 10);
}
export function normDeg(a: number): number {
	return ((((a + 180) % 360) + 360) % 360) - 180;
}
/** Heading degrees -> unit direction, the schema convention (0 = +x, CCW+). */
function dirOf(headingDeg: number): { x: number; z: number } {
	const r = headingDeg * DEG;
	return { x: Math.cos(r), z: -Math.sin(r) };
}
/**
 * Driver's-LEFT unit normal for a heading. Note this is the OPPOSITE side
 * from the runtime's `leftEdge` normal `(-tz, tx)` (which is the driver's
 * right — see track-schema's banking doc). Increasing heading turns the car
 * toward this side, so a LEFT turn is a positive heading delta and banks the
 * outside (driver's right) edge up with POSITIVE banking values.
 */
function leftOf(headingDeg: number): { x: number; z: number } {
	const r = headingDeg * DEG;
	return { x: -Math.sin(r), z: -Math.cos(r) };
}
/** Corridor width blends across the first 35% of a piece, never a step. */
function blendW(from: number, to: number, t: number): number {
	return from + (to - from) * smoothstep01(t / 0.35);
}

/**
 * Even-spaced cubic Hermite from one socket to another, blending elevation,
 * bank and width along the way. Shared by the two DERIVED connectors:
 * `loop-close` (main exit -> track start) and `merge` (branch exit -> a point
 * on the main line). Deriving both means editing an earlier piece keeps the
 * loop closed and the branch rejoined with no re-placement.
 */
function hermiteConnector(entry: BuilderSocket, target: BuilderSocket): PieceGen {
	const chord = Math.hypot(target.x - entry.x, target.z - entry.z);
	const m = clamp(chord * 0.55, 12, 140);
	const d0 = dirOf(entry.headingDeg);
	const d1 = dirOf(target.headingDeg);
	const at = (t: number): TrackVec2 => {
		const t2 = t * t;
		const t3 = t2 * t;
		const h00 = 2 * t3 - 3 * t2 + 1;
		const h10 = t3 - 2 * t2 + t;
		const h01 = -2 * t3 + 3 * t2;
		const h11 = t3 - t2;
		return {
			x: h00 * entry.x + h10 * d0.x * m + h01 * target.x + h11 * d1.x * m,
			z: h00 * entry.z + h10 * d0.z * m + h01 * target.z + h11 * d1.z * m
		};
	};
	// Dense pass for arc length, then even-spacing resample.
	const DENSE = 280;
	const dense: TrackVec2[] = [];
	const cum: number[] = [0];
	for (let k = 0; k <= DENSE; k++) {
		const pt = at(k / DENSE);
		dense.push(pt);
		if (k > 0) cum.push(cum[k - 1] + Math.hypot(pt.x - dense[k - 1].x, pt.z - dense[k - 1].z));
	}
	const total = cum[DENSE] || 1;
	const N = Math.max(4, Math.ceil(total / SAMPLE_SPACING));
	const samples: PieceSample[] = [];
	let seg = 0;
	for (let j = 0; j <= N; j++) {
		const targetLen = (j / N) * total;
		while (seg < DENSE - 1 && cum[seg + 1] < targetLen) seg++;
		const span = cum[seg + 1] - cum[seg] || 1;
		const f = clamp((targetLen - cum[seg]) / span, 0, 1);
		const tf = j / N;
		samples.push({
			x: dense[seg].x + (dense[seg + 1].x - dense[seg].x) * f,
			z: dense[seg].z + (dense[seg + 1].z - dense[seg].z) * f,
			elev: entry.elev + (target.elev - entry.elev) * smootherstep01(tf),
			bankDeg: entry.bankDeg + (target.bankDeg - entry.bankDeg) * smootherstep01(tf),
			width: entry.width + (target.width - entry.width) * smoothstep01(tf),
			cliff: false
		});
	}
	// Land EXACTLY on the target: the schema shares branch endpoints with the
	// main centerline exactly, and loop closure snaps on an exact match.
	const last = samples[samples.length - 1];
	last.x = target.x;
	last.z = target.z;
	last.elev = target.elev;
	last.bankDeg = target.bankDeg;
	return { samples, exit: { ...target } };
}

/* ------------------------------------------------------------------ */
/* piece generators                                                    */
/* ------------------------------------------------------------------ */

function straightGen(isStart: boolean) {
	return (entry: BuilderSocket, p: Record<string, number>): PieceGen => {
		const L = p.length;
		const W = p.width;
		const eD = isStart ? 0 : (p.elevationDelta ?? 0);
		const bD = isStart ? 0 : (p.bankDelta ?? 0);
		const d = dirOf(entry.headingDeg);
		const N = Math.max(2, Math.ceil(L / SAMPLE_SPACING));
		const samples: PieceSample[] = [];
		for (let k = 0; k <= N; k++) {
			const t = k / N;
			samples.push({
				x: entry.x + d.x * L * t,
				z: entry.z + d.z * L * t,
				elev: entry.elev + eD * smootherstep01(t),
				bankDeg: entry.bankDeg + bD * smoothstep01(t),
				width: isStart ? W : blendW(entry.width, W, t),
				cliff: false
			});
		}
		return {
			samples,
			exit: {
				x: entry.x + d.x * L,
				z: entry.z + d.z * L,
				headingDeg: entry.headingDeg,
				elev: entry.elev + eD,
				bankDeg: entry.bankDeg + bD,
				width: W
			}
		};
	};
}

/**
 * FORK: a straight run of MAIN path that also emits a second exit socket, the
 * branch entry. The branch leaves from the fork's exit POINT at an angle, so
 * the two routes share that point exactly — which is precisely what
 * `joinStart` means in the schema (`branch.centerline[0] === main[joinStart]`).
 * `s` is the side: +1 branch peels left, -1 right.
 */
function forkGen(s: 1 | -1) {
	return (entry: BuilderSocket, p: Record<string, number>): PieceGen => {
		const base = straightGen(false)(entry, {
			length: p.length,
			width: p.width,
			elevationDelta: 0,
			bankDelta: 0
		});
		return {
			...base,
			branch: {
				x: base.exit.x,
				z: base.exit.z,
				headingDeg: base.exit.headingDeg + s * p.splitAngleDeg,
				elev: base.exit.elev,
				bankDeg: 0,
				width: p.branchWidth
			}
		};
	};
}

/**
 * MERGE: the branch sub-chain's terminator. Two entries, one exit — it takes
 * the branch's running socket and the main-line point it must land on
 * (resolved by the compiler from `mainAheadM` and supplied as
 * `ctx.mergeTarget`), and derives the connecting curve. Same machinery as
 * `loop-close`, so a rejoin survives edits to any earlier piece.
 */
function mergeGen(entry: BuilderSocket, _p: Record<string, number>, ctx: GenContext): PieceGen {
	if (!ctx.mergeTarget) {
		// Unreachable in normal compilation (the compiler always supplies a
		// target); degrade to a stub rather than throwing mid-walk.
		return { samples: [{ ...entry, cliff: false }], exit: entry };
	}
	return hermiteConnector(entry, ctx.mergeTarget);
}

/**
 * Arc pieces. `s` is the turn sign: +1 left (heading increases), -1 right.
 * `bankMode`: 'delta' ramps entry bank -> entry bank + bankDelta (plain
 * curves); 'plateau' is the self-contained banked turn — ramp in over the
 * first ~third to the signed peak bank, hold, ramp back out to the entry
 * bank, so the piece needs no partner piece to un-bank.
 */
function arcGen(s: 1 | -1, bankMode: 'delta' | 'plateau') {
	return (entry: BuilderSocket, p: Record<string, number>): PieceGen => {
		const R = p.radius;
		const A = p.angleDeg;
		const W = p.width;
		const eD = p.elevationDelta ?? 0;
		const lf0 = leftOf(entry.headingDeg);
		const cx = entry.x + lf0.x * R * s;
		const cz = entry.z + lf0.z * R * s;
		const len = R * A * DEG;
		const N = Math.max(2, Math.ceil(len / SAMPLE_SPACING));
		// The signed plateau bank: a left turn's outside edge is the driver's
		// right = the runtime's leftEdge side, which positive banking raises,
		// so left turns bank positive and right turns bank negative.
		const peak = bankMode === 'plateau' ? s * (p.bankDeg ?? 0) : 0;
		const bD = bankMode === 'delta' ? (p.bankDelta ?? 0) : 0;
		const RAMP = 0.32;
		const bankAt = (t: number): number => {
			if (bankMode === 'delta') return entry.bankDeg + bD * smoothstep01(t);
			if (t < RAMP) return entry.bankDeg + (peak - entry.bankDeg) * smootherstep01(t / RAMP);
			if (t > 1 - RAMP)
				return peak + (entry.bankDeg - peak) * smootherstep01((t - (1 - RAMP)) / RAMP);
			return peak;
		};
		const samples: PieceSample[] = [];
		for (let k = 0; k <= N; k++) {
			const t = k / N;
			const h = entry.headingDeg + s * A * t;
			const lf = leftOf(h);
			samples.push({
				x: cx - lf.x * R * s,
				z: cz - lf.z * R * s,
				elev: entry.elev + eD * smootherstep01(t),
				bankDeg: bankAt(t),
				width: blendW(entry.width, W, t),
				cliff: false
			});
		}
		const hEnd = entry.headingDeg + s * A;
		const lfEnd = leftOf(hEnd);
		return {
			samples,
			exit: {
				x: cx - lfEnd.x * R * s,
				z: cz - lfEnd.z * R * s,
				headingDeg: hEnd,
				elev: entry.elev + eD,
				bankDeg: bankMode === 'delta' ? entry.bankDeg + bD : entry.bankDeg,
				width: W
			}
		};
	};
}

/**
 * Jump/ramp: an accelerating climb into a kicker lip, a deliberately steep
 * drop face (the Terminal Nine deck-edge pattern — the ribbon stays
 * continuous, the car goes ballistic because it cannot follow the drop), then
 * a flat landing run-out at entry elevation + landingDelta. Any entry bank is
 * flattened over the first quarter; nobody jumps banked.
 */
function jumpGen(entry: BuilderSocket, p: Record<string, number>): PieceGen {
	const L = p.length;
	const W = p.width;
	const H = p.apexHeight;
	const D = p.landingDelta ?? 0;
	const TAKEOFF_T = 0.52;
	const LAND_T = 0.6;
	// The kicker LIP (the last stretch of the climb) and the drop face are the
	// jump's intentionally steep zone, exempt from the grade lint; the approach
	// climb before the lip stays checked like any other slope.
	const LIP_T = 0.38;
	const d = dirOf(entry.headingDeg);
	const N = Math.max(4, Math.ceil(L / SAMPLE_SPACING));
	const profile = (t: number): number => {
		if (t <= TAKEOFF_T) return H * Math.pow(t / TAKEOFF_T, 1.7);
		if (t < LAND_T) return H + (D - H) * smoothstep01((t - TAKEOFF_T) / (LAND_T - TAKEOFF_T));
		return D;
	};
	const samples: PieceSample[] = [];
	for (let k = 0; k <= N; k++) {
		const t = k / N;
		samples.push({
			x: entry.x + d.x * L * t,
			z: entry.z + d.z * L * t,
			elev: entry.elev + profile(t),
			bankDeg: entry.bankDeg * (1 - smoothstep01(t / 0.25)),
			width: blendW(entry.width, W, t),
			cliff: t > LIP_T - 0.01 && t < LAND_T + 0.03
		});
	}
	return {
		samples,
		exit: {
			x: entry.x + d.x * L,
			z: entry.z + d.z * L,
			headingDeg: entry.headingDeg,
			elev: entry.elev + D,
			bankDeg: 0,
			width: W
		}
	};
}

/** Chicane: a smootherstep lateral S-offset; exit heading = entry heading. */
function chicaneGen(s: 1 | -1) {
	return (entry: BuilderSocket, p: Record<string, number>): PieceGen => {
		const L = p.length;
		const O = p.offset;
		const W = p.width;
		const eD = p.elevationDelta ?? 0;
		const d = dirOf(entry.headingDeg);
		const lf = leftOf(entry.headingDeg);
		const N = Math.max(4, Math.ceil(L / SAMPLE_SPACING));
		const samples: PieceSample[] = [];
		for (let k = 0; k <= N; k++) {
			const t = k / N;
			const lat = s * O * smootherstep01(t);
			samples.push({
				x: entry.x + d.x * L * t + lf.x * lat,
				z: entry.z + d.z * L * t + lf.z * lat,
				elev: entry.elev + eD * smootherstep01(t),
				bankDeg: entry.bankDeg,
				width: blendW(entry.width, W, t),
				cliff: false
			});
		}
		return {
			samples,
			exit: {
				x: entry.x + d.x * L + lf.x * s * O,
				z: entry.z + d.z * L + lf.z * s * O,
				headingDeg: entry.headingDeg,
				elev: entry.elev + eD,
				bankDeg: entry.bankDeg,
				width: W
			}
		};
	};
}

/** Loop-close: the derived connector from the running exit back to the start. */
function loopCloseGen(entry: BuilderSocket, _p: Record<string, number>, ctx: GenContext): PieceGen {
	return hermiteConnector(entry, ctx.trackStart);
}

/* ------------------------------------------------------------------ */
/* the piece catalog                                                   */
/* ------------------------------------------------------------------ */

const P = (
	key: string,
	label: string,
	min: number,
	max: number,
	step: number,
	unit = 'm'
): ParamSpec => ({ key, label, min, max, step, unit });

const WIDTH = P('width', 'Width', 8, 30, 0.5);
const ELEV_DELTA = P('elevationDelta', 'Elevation delta', -24, 24, 0.5);
const BANK_DELTA = P('bankDelta', 'Bank delta', -30, 30, 1, 'deg');

export const PIECES: Record<PieceType, PieceDef> = {
	'start-finish': {
		type: 'start-finish',
		name: 'START / FINISH',
		params: [P('length', 'Length', 40, 200, 2), P('width', 'Width', 10, 30, 0.5)],
		defaults: { length: 90, width: 20 },
		generate: straightGen(true)
	},
	straight: {
		type: 'straight',
		name: 'STRAIGHT',
		params: [P('length', 'Length', 8, 400, 2), WIDTH, ELEV_DELTA, BANK_DELTA],
		defaults: { length: 60, width: 14, elevationDelta: 0, bankDelta: 0 },
		generate: straightGen(false)
	},
	'curve-left': {
		type: 'curve-left',
		name: 'CURVE LEFT',
		params: [
			P('radius', 'Radius', 12, 160, 1),
			P('angleDeg', 'Turn angle', 10, 180, 5, 'deg'),
			WIDTH,
			ELEV_DELTA,
			BANK_DELTA
		],
		defaults: { radius: 35, angleDeg: 90, width: 14, elevationDelta: 0, bankDelta: 0 },
		generate: arcGen(1, 'delta')
	},
	'curve-right': {
		type: 'curve-right',
		name: 'CURVE RIGHT',
		params: [
			P('radius', 'Radius', 12, 160, 1),
			P('angleDeg', 'Turn angle', 10, 180, 5, 'deg'),
			WIDTH,
			ELEV_DELTA,
			BANK_DELTA
		],
		defaults: { radius: 35, angleDeg: 90, width: 14, elevationDelta: 0, bankDelta: 0 },
		generate: arcGen(-1, 'delta')
	},
	'banked-left': {
		type: 'banked-left',
		name: 'BANKED TURN LEFT',
		params: [
			P('radius', 'Radius', 15, 160, 1),
			P('angleDeg', 'Turn angle', 15, 180, 5, 'deg'),
			P('bankDeg', 'Bank angle', 4, 40, 1, 'deg'),
			WIDTH,
			ELEV_DELTA
		],
		defaults: { radius: 45, angleDeg: 90, bankDeg: 18, width: 14, elevationDelta: 0 },
		generate: arcGen(1, 'plateau')
	},
	'banked-right': {
		type: 'banked-right',
		name: 'BANKED TURN RIGHT',
		params: [
			P('radius', 'Radius', 15, 160, 1),
			P('angleDeg', 'Turn angle', 15, 180, 5, 'deg'),
			P('bankDeg', 'Bank angle', 4, 40, 1, 'deg'),
			WIDTH,
			ELEV_DELTA
		],
		defaults: { radius: 45, angleDeg: 90, bankDeg: 18, width: 14, elevationDelta: 0 },
		generate: arcGen(-1, 'plateau')
	},
	jump: {
		type: 'jump',
		name: 'JUMP RAMP',
		params: [
			P('length', 'Length', 40, 220, 2),
			P('apexHeight', 'Apex height', 1, 16, 0.5),
			P('landingDelta', 'Landing delta', -16, 24, 0.5),
			WIDTH
		],
		defaults: { length: 90, apexHeight: 6, landingDelta: 0, width: 14 },
		generate: jumpGen
	},
	'chicane-left': {
		type: 'chicane-left',
		name: 'CHICANE LEFT',
		params: [
			P('length', 'Length', 24, 160, 2),
			P('offset', 'Lateral offset', 4, 40, 1),
			WIDTH,
			ELEV_DELTA
		],
		defaults: { length: 60, offset: 12, width: 14, elevationDelta: 0 },
		generate: chicaneGen(1)
	},
	'chicane-right': {
		type: 'chicane-right',
		name: 'CHICANE RIGHT',
		params: [
			P('length', 'Length', 24, 160, 2),
			P('offset', 'Lateral offset', 4, 40, 1),
			WIDTH,
			ELEV_DELTA
		],
		defaults: { length: 60, offset: 12, width: 14, elevationDelta: 0 },
		generate: chicaneGen(-1)
	},
	'fork-left': {
		type: 'fork-left',
		name: 'FORK LEFT',
		params: [
			P('length', 'Length', 20, 200, 2),
			WIDTH,
			P('splitAngleDeg', 'Split angle', 8, 70, 1, 'deg'),
			P('branchWidth', 'Branch width', 7, 24, 0.5)
		],
		defaults: { length: 40, width: 16, splitAngleDeg: 28, branchWidth: 10 },
		forks: true,
		generate: forkGen(1)
	},
	'fork-right': {
		type: 'fork-right',
		name: 'FORK RIGHT',
		params: [
			P('length', 'Length', 20, 200, 2),
			WIDTH,
			P('splitAngleDeg', 'Split angle', 8, 70, 1, 'deg'),
			P('branchWidth', 'Branch width', 7, 24, 0.5)
		],
		defaults: { length: 40, width: 16, splitAngleDeg: 28, branchWidth: 10 },
		forks: true,
		generate: forkGen(-1)
	},
	merge: {
		type: 'merge',
		name: 'MERGE TO MAIN',
		params: [P('mainAheadM', 'Rejoin ahead on main', 40, 2000, 10)],
		defaults: { mainAheadM: 260 },
		generate: mergeGen
	},
	'loop-close': {
		type: 'loop-close',
		name: 'CLOSE LOOP',
		params: [],
		defaults: {},
		generate: loopCloseGen
	}
};

export interface PaletteEntry {
	type: PieceType;
	label: string;
	params?: Record<string, number>;
}

/** The placement palette (start/finish is auto-seeded, never placed). */
export const PALETTE: PaletteEntry[] = [
	{ type: 'straight', label: 'STRAIGHT' },
	{ type: 'curve-left', label: 'CURVE L · R20', params: { radius: 20 } },
	{ type: 'curve-left', label: 'CURVE L · R50', params: { radius: 50 } },
	{ type: 'curve-right', label: 'CURVE R · R20', params: { radius: 20 } },
	{ type: 'curve-right', label: 'CURVE R · R50', params: { radius: 50 } },
	{ type: 'banked-left', label: 'BANKED TURN L' },
	{ type: 'banked-right', label: 'BANKED TURN R' },
	{ type: 'jump', label: 'JUMP RAMP' },
	{ type: 'chicane-left', label: 'CHICANE L' },
	{ type: 'chicane-right', label: 'CHICANE R' },
	{ type: 'fork-left', label: 'FORK L (branch)' },
	{ type: 'fork-right', label: 'FORK R (branch)' },
	{ type: 'loop-close', label: 'CLOSE LOOP' }
];

let uidCounter = 0;
function uid(prefix: string): string {
	uidCounter += 1;
	return `${prefix}${uidCounter}-${Math.random().toString(36).slice(2, 7)}`;
}
export function makePiece(type: PieceType, overrides?: Record<string, number>): PlacedPiece {
	const piece: PlacedPiece = {
		id: uid('p'),
		type,
		params: { ...PIECES[type].defaults, ...(overrides ?? {}) }
	};
	// A fork is meaningless without somewhere for the branch to go and a way
	// back, so it is born with its sub-sequence already terminated by a merge.
	if (PIECES[type].forks) piece.branch = [makePiece('merge')];
	return piece;
}

/* ------------------------------------------------------------------ */
/* zones + gates (authored, anchored to piece geometry)                */
/* ------------------------------------------------------------------ */

export type ZoneKind = 'boost' | 'hazard' | 'pit';

/**
 * An authored zone: an EXTENT along a piece, not a freeform world position.
 * Anchoring to `pieceId` + fractions is what stops it drifting when the piece
 * is retuned — move the piece and the zone moves with it, by construction.
 *
 * The runtime's `TrackZone` is strictly a CIRCLE (`zoneEntries` is a top-down
 * radius test), so the compiler lays the extent down as the chain of circles
 * the game actually reads. See `zoneCircles` for why pit is capped at one.
 */
export interface ZoneSpec {
	id: string;
	kind: ZoneKind;
	pieceId: string;
	/** Extent along that piece, as fractions of its length. */
	startFrac: number;
	endFrac: number;
	radius: number;
	/** boost only. */
	strength?: number;
	durationSec?: number;
	/** pit only. */
	repairPerSec?: number;
	stopSpeed?: number;
}

/** An authored checkpoint gate, anchored to a piece the same way. */
export interface GateSpec {
	id: string;
	name?: string;
	pieceId: string;
	frac: number;
	/**
	 * Alternative-gate group (`TrackGate.group`). Gates sharing a group are
	 * ALTERNATIVES for one sequence step, which is what makes a route split
	 * lawful: the main line and the shortcut each carry one, either satisfies
	 * the step. Members are emitted contiguously, as the schema requires.
	 */
	group?: string;
}

export interface TrackDoc {
	pieces: PlacedPiece[];
	gates: GateSpec[];
	zones: ZoneSpec[];
}

export function makeZone(kind: ZoneKind, pieceId: string, overrides?: Partial<ZoneSpec>): ZoneSpec {
	const base: ZoneSpec = {
		id: uid(kind === 'hazard' ? 'oil' : kind),
		kind,
		pieceId,
		startFrac: kind === 'pit' ? 0.4 : 0.3,
		endFrac: kind === 'pit' ? 0.6 : 0.55,
		radius: kind === 'pit' ? 6 : 5.5
	};
	if (kind === 'boost') {
		base.strength = 1.8;
		base.durationSec = 1.5;
	}
	if (kind === 'pit') {
		base.repairPerSec = 125;
		base.stopSpeed = 2.5;
	}
	return { ...base, ...overrides };
}

export function makeGate(pieceId: string, overrides?: Partial<GateSpec>): GateSpec {
	return { id: uid('cp'), pieceId, frac: 0.5, ...overrides };
}

/** One-line list summary for a placed piece. */
export function pieceSummary(piece: PlacedPiece): string {
	const p = { ...PIECES[piece.type].defaults, ...piece.params };
	const sign = (v: number) => `${v > 0 ? '+' : ''}${v}`;
	switch (piece.type) {
		case 'start-finish':
			return `${p.length} m · w${p.width}`;
		case 'straight': {
			let s = `${p.length} m`;
			if (p.elevationDelta) s += ` · ${sign(p.elevationDelta)} m`;
			if (p.bankDelta) s += ` · bank ${sign(p.bankDelta)}°`;
			return s;
		}
		case 'curve-left':
		case 'curve-right':
			return `R${p.radius} · ${p.angleDeg}°`;
		case 'banked-left':
		case 'banked-right':
			return `R${p.radius} · ${p.angleDeg}° · bank ${p.bankDeg}°`;
		case 'jump':
			return `${p.length} m · apex ${p.apexHeight} m`;
		case 'chicane-left':
		case 'chicane-right':
			return `${p.length} m · offset ${p.offset} m`;
		case 'fork-left':
		case 'fork-right':
			return `${p.length} m · split ${p.splitAngleDeg}° · branch w${p.branchWidth}`;
		case 'merge':
			return `rejoin ${p.mainAheadM} m ahead`;
		case 'loop-close':
			return 'auto connector';
	}
}

/* ------------------------------------------------------------------ */
/* the compiler                                                        */
/* ------------------------------------------------------------------ */

export interface CompiledSample {
	x: number;
	z: number;
	/** Final elevation (after the banked centerline auto-raise). */
	elev: number;
	/** What the piece profiles authored, before the auto-raise. */
	elevAuthored: number;
	bankDeg: number;
	width: number;
	cliff: boolean;
	/** Index into `CompiledTrack.flat` (global across every lane). */
	pieceIdx: number;
}

export interface PieceRange {
	/** Lane-local sample index of the piece's entry joint (shared with prev). */
	start: number;
	/** Lane-local sample index of the piece's exit joint. */
	end: number;
	/** Which lane this piece belongs to (0 = main). */
	lane: number;
}

/** A tangent frame at one sample. */
interface Frame {
	tx: number;
	tz: number;
	nx: number;
	nz: number;
}

export interface CompiledLane {
	/** 'main', or the branch id used in the exported `RibbonBranch`. */
	id: string;
	isMain: boolean;
	closed: boolean;
	samples: CompiledSample[];
	frames: Frame[];
	/** Cumulative arc length at each sample. */
	arc: number[];
	lengthM: number;
	/** Branch lanes only: the main-centerline indices it leaves and rejoins. */
	joinStart?: number;
	joinEnd?: number;
	/** Branch lanes only: index of the fork piece in `flat`. */
	forkFlatIdx?: number;
}

/** A piece flattened across every lane, with where it landed. */
export interface FlatPiece {
	piece: PlacedPiece;
	lane: number;
	/** Position within its own lane's sequence. */
	posInLane: number;
	label: string;
}

export interface CompiledTrack {
	ok: boolean;
	error?: string;
	track: TrackData | null;
	/** The REAL runtime built from the compiled data (null if it threw). */
	runtime: TrackRuntime | null;
	runtimeError?: string;
	/** Main-lane samples (alias of `lanes[0].samples`). */
	samples: CompiledSample[];
	lanes: CompiledLane[];
	ranges: PieceRange[];
	flat: FlatPiece[];
	/** Exit socket per flat piece (inspector readout). */
	exits: BuilderSocket[];
	pieceLabels: string[];
	closure: {
		closed: boolean;
		snapped: boolean;
		gapM: number;
		headingGapDeg: number;
		elevGapM: number;
	};
	gates: {
		sfIndex: number;
		spawnIndex: number;
		/** Resolved checkpoints in emission order. */
		resolved: {
			specId: string;
			lane: number;
			index: number;
			group?: string;
			step: number;
			gate: TrackGate;
		}[];
		stepCount: number;
	};
	/** Emitted trigger circles per authored zone (for the report + 2D view). */
	zones: { spec: ZoneSpec; lane: number; circles: TrackZone[] }[];
	/** Largest banked centerline auto-raise applied (0 = none needed). */
	maxRaise: { value: number; pieceIdx: number };
	totalLengthM: number;
	marginStats: {
		flat: number;
		transitionCount: number;
		minTransition: number | null;
		maxTransition: number | null;
		deckCount: number;
		minDeck: number | null;
		maxDeck: number | null;
	};
	/** Per-branch geometry facts the validator reports on. */
	branchStats: {
		id: string;
		lane: number;
		joinStart: number;
		joinEnd: number;
		branchLengthM: number;
		bypassedMainM: number;
		/** Widest clear gap between this branch and the main corridor. */
		maxSeparationM: number;
		islandBuilt: boolean;
	}[];
	bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface CompileOptions {
	id: string;
	name: string;
}

const EMPTY_COMPILE = (error: string): CompiledTrack => ({
	ok: false,
	error,
	track: null,
	runtime: null,
	samples: [],
	lanes: [],
	ranges: [],
	flat: [],
	exits: [],
	pieceLabels: [],
	closure: { closed: false, snapped: false, gapM: 0, headingGapDeg: 0, elevGapM: 0 },
	gates: { sfIndex: 0, spawnIndex: 0, resolved: [], stepCount: 0 },
	zones: [],
	maxRaise: { value: 0, pieceIdx: -1 },
	totalLengthM: 0,
	marginStats: {
		flat: FLAT_MARGIN_M,
		transitionCount: 0,
		minTransition: null,
		maxTransition: null,
		deckCount: 0,
		minDeck: null,
		maxDeck: null
	},
	branchStats: [],
	bbox: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
});

/** Lift banked samples so the low edge meets the y=0 catch plane. */
function applyBankRaise(
	samples: CompiledSample[],
	maxRaise: { value: number; pieceIdx: number }
): void {
	for (const s of samples) {
		const br = Math.abs(s.bankDeg) * DEG;
		if (br < 0.001) continue;
		// +1 cm so the exported 2-decimal rounding can never dip the low edge
		// a few millimeters under the plane.
		const need = (s.width / 2) * Math.sin(br) + 0.01;
		if (need > s.elev) {
			const d = need - s.elev;
			s.elev = need;
			if (d > maxRaise.value) {
				maxRaise.value = d;
				maxRaise.pieceIdx = s.pieceIdx;
			}
		}
	}
}

function buildFrames(samples: CompiledSample[], closed: boolean): Frame[] {
	const n = samples.length;
	return samples.map((_, i) => {
		const iPrev = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
		const iNext = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
		const tx = samples[iNext].x - samples[iPrev].x;
		const tz = samples[iNext].z - samples[iPrev].z;
		const l = Math.hypot(tx, tz) || 1;
		return { tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l };
	});
}

function buildArc(samples: CompiledSample[], closed: boolean): { arc: number[]; total: number } {
	const arc: number[] = [0];
	for (let i = 1; i < samples.length; i++)
		arc.push(arc[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z));
	let total = arc[arc.length - 1];
	if (closed && samples.length)
		total += Math.hypot(
			samples[0].x - samples[samples.length - 1].x,
			samples[0].z - samples[samples.length - 1].z
		);
	return { arc, total };
}

export function compile(doc: TrackDoc, opts: CompileOptions): CompiledTrack {
	const pieces = doc.pieces;
	if (!pieces.length) return EMPTY_COMPILE('no pieces');
	if (pieces[0].type !== 'start-finish')
		return EMPTY_COMPILE('the first piece must be START / FINISH');
	if (pieces.slice(1).some((p) => p.type === 'start-finish'))
		return EMPTY_COMPILE('only one START / FINISH piece is allowed');
	const lcIdx = pieces.findIndex((p) => p.type === 'loop-close');
	if (lcIdx !== -1 && lcIdx !== pieces.length - 1)
		return EMPTY_COMPILE('CLOSE LOOP must be the last piece');
	if (pieces.some((p) => p.type === 'merge')) return EMPTY_COMPILE('MERGE belongs to a branch');
	for (const p of pieces) {
		if (!PIECES[p.type].forks) continue;
		const br = p.branch ?? [];
		if (!br.length || br[br.length - 1].type !== 'merge')
			return EMPTY_COMPILE(`${PIECES[p.type].name}: its branch must end with MERGE`);
		if (br.slice(0, -1).some((b) => b.type === 'merge' || PIECES[b.type].forks))
			return EMPTY_COMPILE('a branch cannot contain another fork or a second merge');
	}

	const startWidth = pieces[0].params.width ?? (PIECES['start-finish'].defaults.width as number);
	const trackStart: BuilderSocket = {
		x: 0,
		z: 0,
		headingDeg: 0,
		elev: 0,
		bankDeg: 0,
		width: startWidth
	};

	const flat: FlatPiece[] = [];
	const ranges: PieceRange[] = [];
	const exits: BuilderSocket[] = [];
	const maxRaise = { value: 0, pieceIdx: -1 };

	// --- lane 0: walk the main chain, entry socket = previous exit socket ---
	const mainSamples: CompiledSample[] = [];
	/** Fork flat-index -> its branch entry socket + main sample index. */
	const pendingForks: { flatIdx: number; socket: BuilderSocket; mainIdx: number }[] = [];
	let socket = trackStart;
	pieces.forEach((piece, posInLane) => {
		const def = PIECES[piece.type];
		const flatIdx = flat.length;
		flat.push({ piece, lane: 0, posInLane, label: `#${flatIdx} ${def.name}` });
		const gen = def.generate(socket, { ...def.defaults, ...piece.params }, { trackStart });
		const startIdx = posInLane === 0 ? 0 : mainSamples.length - 1;
		gen.samples.forEach((s, k) => {
			if (posInLane > 0 && k === 0) return; // shared joint, already emitted
			mainSamples.push({
				x: s.x,
				z: s.z,
				elev: s.elev,
				elevAuthored: s.elev,
				bankDeg: s.bankDeg,
				width: s.width,
				cliff: s.cliff,
				pieceIdx: flatIdx
			});
		});
		ranges.push({ start: startIdx, end: mainSamples.length - 1, lane: 0 });
		exits.push(gen.exit);
		if (gen.branch)
			pendingForks.push({ flatIdx, socket: gen.branch, mainIdx: mainSamples.length - 1 });
		socket = gen.exit;
	});
	if (mainSamples.length < 4) return EMPTY_COMPILE('track too short (add pieces)');

	// --- closure: snap when the exit lands back on the start ---
	const first = mainSamples[0];
	const preLast = mainSamples[mainSamples.length - 1];
	const gapM = Math.hypot(preLast.x - first.x, preLast.z - first.z);
	const headingGapDeg = Math.abs(normDeg(socket.headingDeg - trackStart.headingDeg));
	const elevGapM = Math.abs(socket.elev - trackStart.elev);
	let closed = false;
	let snapped = false;
	if (gapM < 1.5 && headingGapDeg < 12 && mainSamples.length > 8) {
		closed = true;
		snapped = gapM > 0.01;
		mainSamples.pop(); // the wrap supplies the final segment
		const lastRange = ranges[ranges.length - 1];
		lastRange.end = Math.max(lastRange.start, mainSamples.length - 1);
		for (const f of pendingForks) f.mainIdx = Math.min(f.mainIdx, mainSamples.length - 1);
	}
	const N = mainSamples.length;
	applyBankRaise(mainSamples, maxRaise);
	const mainFrames = buildFrames(mainSamples, closed);
	const mainArcInfo = buildArc(mainSamples, closed);

	const lanes: CompiledLane[] = [
		{
			id: 'main',
			isMain: true,
			closed,
			samples: mainSamples,
			frames: mainFrames,
			arc: mainArcInfo.arc,
			lengthM: mainArcInfo.total
		}
	];

	// --- branch lanes ---
	// Each fork's sub-chain runs from the fork's second exit socket; its MERGE
	// resolves to a main sample a chosen arc distance ahead, and the derived
	// connector lands on it exactly, which is what `joinEnd` asserts.
	// A branch carrying a PIT box must be named `pit-*`: `buildRuntime` marks
	// `pitRoutes` by that id prefix alone, and the AI's `startPitStop` only ever
	// diverts onto a route in that list. Naming it `branch-*` would export a
	// pit lane the AI could never use, so the id follows the zone.
	const pitPieceIds = new Set(doc.zones.filter((z) => z.kind === 'pit').map((z) => z.pieceId));
	for (const pf of pendingForks) {
		const forkPiece = flat[pf.flatIdx].piece;
		const branchPieces = forkPiece.branch ?? [];
		const carriesPit = branchPieces.some((p) => pitPieceIds.has(p.id));
		const joinStart = pf.mainIdx;
		const mergePiece = branchPieces[branchPieces.length - 1];
		const aheadM = mergePiece.params.mainAheadM ?? (PIECES.merge.defaults.mainAheadM as number);
		// Resolve joinEnd by arc distance ahead of joinStart on the main line.
		let joinEnd = -1;
		const startArc = mainArcInfo.arc[joinStart];
		for (let i = joinStart + 1; i < N; i++) {
			if (mainArcInfo.arc[i] - startArc >= aheadM) {
				joinEnd = i;
				break;
			}
		}
		if (joinEnd === -1) joinEnd = N - 1;
		// The schema requires joinStart < joinEnd < mainN, so a branch may not
		// wrap past the start/finish point. Surface that instead of emitting a
		// track parseTrack would reject.
		if (joinEnd <= joinStart + 1)
			return EMPTY_COMPILE(
				`${PIECES[forkPiece.type].name}: the merge point must be further ahead on the main line`
			);
		const laneIdx = lanes.length;
		const branchId = carriesPit ? `pit-${laneIdx}` : `branch-${laneIdx}`;
		const target: BuilderSocket = {
			x: mainSamples[joinEnd].x,
			z: mainSamples[joinEnd].z,
			headingDeg: Math.atan2(-mainFrames[joinEnd].tz, mainFrames[joinEnd].tx) / DEG,
			elev: mainSamples[joinEnd].elev,
			bankDeg: mainSamples[joinEnd].bankDeg,
			width: pf.socket.width
		};
		const bSamples: CompiledSample[] = [];
		let bSocket = pf.socket;
		// The branch's first point IS main[joinStart] (the schema's convention,
		// verified against Terminal Nine: both endpoints shared to 0.00 m).
		bSamples.push({
			x: mainSamples[joinStart].x,
			z: mainSamples[joinStart].z,
			elev: mainSamples[joinStart].elev,
			elevAuthored: mainSamples[joinStart].elev,
			bankDeg: 0,
			width: pf.socket.width,
			cliff: false,
			pieceIdx: pf.flatIdx
		});
		branchPieces.forEach((piece, posInLane) => {
			const def = PIECES[piece.type];
			const flatIdx = flat.length;
			flat.push({ piece, lane: laneIdx, posInLane, label: `#${flatIdx} ${def.name}` });
			const gen = def.generate(
				bSocket,
				{ ...def.defaults, ...piece.params },
				{ trackStart, mergeTarget: target }
			);
			const startIdx = Math.max(0, bSamples.length - 1);
			gen.samples.forEach((s, k) => {
				if (k === 0) return; // shared joint with the fork / previous piece
				bSamples.push({
					x: s.x,
					z: s.z,
					elev: s.elev,
					elevAuthored: s.elev,
					bankDeg: s.bankDeg,
					width: s.width,
					cliff: s.cliff,
					pieceIdx: flatIdx
				});
			});
			ranges.push({ start: startIdx, end: bSamples.length - 1, lane: laneIdx });
			exits.push(gen.exit);
			bSocket = gen.exit;
		});
		if (bSamples.length < 3)
			return EMPTY_COMPILE(`${PIECES[forkPiece.type].name}: the branch needs more pieces`);
		applyBankRaise(bSamples, maxRaise);
		const bArc = buildArc(bSamples, false);
		lanes.push({
			id: branchId,
			isMain: false,
			closed: false,
			samples: bSamples,
			frames: buildFrames(bSamples, false),
			arc: bArc.arc,
			lengthM: bArc.total,
			joinStart,
			joinEnd,
			forkFlatIdx: pf.flatIdx
		});
	}

	const laneOf = (pieceId: string): { lane: number; range: PieceRange } | null => {
		const fi = flat.findIndex((f) => f.piece.id === pieceId);
		if (fi === -1) return null;
		return { lane: flat[fi].lane, range: ranges[fi] };
	};

	/** Sample index on a lane for a piece + fraction along that piece. */
	const indexFor = (pieceId: string, frac: number): { lane: number; index: number } | null => {
		const hit = laneOf(pieceId);
		if (!hit) return null;
		const { start, end } = hit.range;
		return {
			lane: hit.lane,
			index: clamp(Math.round(start + (end - start) * clamp(frac, 0, 1)), start, end)
		};
	};

	const headingOn = (lane: number, i: number) =>
		Math.atan2(-lanes[lane].frames[i].tz, lanes[lane].frames[i].tx) / DEG;

	/**
	 * Gates sit at the MIDPOINT between two samples, never on one. A gate
	 * exactly on a centerline point is degenerate: a vehicle passing through
	 * that point meets the gate line at a motion-segment endpoint, and
	 * `crossesGate` accepts t at both 0 and 1, so the gate registers on two
	 * consecutive segments and the second is reported out-of-order. Applied to
	 * EVERY gate here, authored or automatic.
	 */
	const gateOn = (lane: number, i: number, id: string, name: string, group?: string): TrackGate => {
		const L = lanes[lane];
		const n = L.samples.length;
		const j = L.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
		return {
			id,
			name,
			x: (L.samples[i].x + L.samples[j].x) / 2,
			z: (L.samples[i].z + L.samples[j].z) / 2,
			headingDeg: headingOn(lane, i),
			halfWidth: L.samples[i].width / 2 + 1,
			...(group ? { group } : {})
		};
	};

	// --- start/finish + spawn on the first piece ---
	const r0 = ranges[0];
	const idxAt = (r: PieceRange, f: number) =>
		clamp(Math.round(r.start + (r.end - r.start) * f), r.start, r.end);
	const sfIndex = idxAt(r0, 0.7);
	const spawnIndex = idxAt(r0, 0.35);

	// --- authored checkpoints, ordered along the lap ---
	// Sort key is position along the MAIN line: a branch gate maps to the point
	// in the bypassed stretch its progress corresponds to, so it lands beside
	// the main alternative it is grouped with. Group members are then pulled
	// together, because the schema requires them contiguous.
	interface ResolvedGate {
		specId: string;
		lane: number;
		index: number;
		group?: string;
		key: number;
		gate: TrackGate;
	}
	// A lap begins at the start/finish LINE, not at main sample 0, so ordering
	// is measured from there and wraps. Without this a gate placed just before
	// the line sorts first, when a car actually reaches it last.
	const sfArc = mainArcInfo.arc[sfIndex];
	const lapTotal = mainArcInfo.total || 1;
	const lapKey = (mainArc: number) =>
		closed ? (((mainArc - sfArc) % lapTotal) + lapTotal) % lapTotal : mainArc;
	const resolvedRaw: ResolvedGate[] = [];
	for (const g of doc.gates) {
		const hit = indexFor(g.pieceId, g.frac);
		if (!hit) continue; // anchor piece deleted: the spec is inert, not fatal
		const L = lanes[hit.lane];
		let key: number;
		if (L.isMain) {
			key = lapKey(L.arc[hit.index]);
		} else {
			const a = lanes[0].arc[L.joinStart!];
			const b = lanes[0].arc[L.joinEnd!];
			key = lapKey(a + (b - a) * (L.arc[hit.index] / (L.lengthM || 1)));
		}
		resolvedRaw.push({
			specId: g.id,
			lane: hit.lane,
			index: hit.index,
			group: g.group,
			key,
			gate: gateOn(hit.lane, hit.index, g.id, g.name ?? 'Checkpoint', g.group)
		});
	}
	resolvedRaw.sort((a, b) => a.key - b.key || a.lane - b.lane);
	// Contiguity pass: emit each group at the position of its first member.
	const ordered: ResolvedGate[] = [];
	const emittedGroups = new Set<string>();
	for (const g of resolvedRaw) {
		if (g.group === undefined) {
			ordered.push(g);
			continue;
		}
		if (emittedGroups.has(g.group)) continue;
		emittedGroups.add(g.group);
		for (const m of resolvedRaw) if (m.group === g.group) ordered.push(m);
	}
	// Sequence steps, mirroring buildRuntime's own derivation.
	let step = -1;
	let runGroup: string | undefined | symbol = Symbol('none');
	const resolved = ordered.map((g) => {
		if (g.group === undefined || g.group !== runGroup) step += 1;
		runGroup = g.group;
		return {
			specId: g.specId,
			lane: g.lane,
			index: g.index,
			group: g.group,
			step,
			gate: g.gate
		};
	});
	const stepCount = step + 1;

	// --- zones: extents resolved to the circles the runtime reads ---
	const zonesOut: { spec: ZoneSpec; lane: number; circles: TrackZone[] }[] = [];
	for (const z of doc.zones) {
		const hit = laneOf(z.pieceId);
		if (!hit) continue;
		const L = lanes[hit.lane];
		const a = clamp(Math.min(z.startFrac, z.endFrac), 0, 1);
		const b = clamp(Math.max(z.startFrac, z.endFrac), 0, 1);
		const iA = clamp(
			Math.round(hit.range.start + (hit.range.end - hit.range.start) * a),
			hit.range.start,
			hit.range.end
		);
		const iB = clamp(
			Math.round(hit.range.start + (hit.range.end - hit.range.start) * b),
			hit.range.start,
			hit.range.end
		);
		const spanM = Math.abs(L.arc[iB] - L.arc[iA]);
		const radius = Math.max(1.5, z.radius);
		// A PIT box is capped at ONE circle on purpose: the harness heals per
		// occupied pit zone per frame, so two overlapping pit circles would
		// double the repair rate. Boost/hazard chain along the extent, spaced
		// 2r (tangent) so a car is inside at most one at a time.
		const count =
			z.kind === 'pit' ? 1 : Math.max(1, Math.min(24, Math.floor(spanM / (2 * radius)) + 1));
		const circles: TrackZone[] = [];
		for (let k = 0; k < count; k++) {
			const t = count === 1 ? 0.5 : k / (count - 1);
			const idx = clamp(Math.round(iA + (iB - iA) * t), Math.min(iA, iB), Math.max(iA, iB));
			const s = L.samples[idx];
			const id = count === 1 ? z.id : `${z.id}-${k + 1}`;
			if (z.kind === 'boost')
				circles.push({
					type: 'boost',
					id,
					x: s.x,
					z: s.z,
					radius,
					...(z.strength !== undefined ? { strength: z.strength } : {}),
					...(z.durationSec !== undefined ? { durationSec: z.durationSec } : {})
				});
			else if (z.kind === 'hazard')
				circles.push({ type: 'hazard', id, x: s.x, z: s.z, radius, kind: 'oil' });
			else
				circles.push({
					type: 'pit',
					id,
					x: s.x,
					z: s.z,
					radius,
					...(z.repairPerSec !== undefined ? { repairPerSec: z.repairPerSec } : {}),
					...(z.stopSpeed !== undefined ? { stopSpeed: z.stopSpeed } : {})
				});
		}
		zonesOut.push({ spec: z, lane: hit.lane, circles });
	}

	// --- boundaries ---
	// Flat ground gets the Proving Ground 9 m offset; the margin shrinks beside
	// raised edges (the Terminal Nine deck lesson), wall-tight by deck height.
	const marginFor = (edgeY: number) =>
		clamp(FLAT_MARGIN_M - Math.max(0, edgeY - 0.4) * 2.4, MIN_ELEVATED_MARGIN_M, FLAT_MARGIN_M);
	const transitionMargins: number[] = [];
	const deckMargins: number[] = [];
	/** Lateral arm + margin on each side of a lane sample. */
	const sideInfo = (lane: number, i: number) => {
		const L = lanes[lane];
		const s = L.samples[i];
		const hw = s.width / 2;
		const br = s.bankDeg * DEG;
		const arm = hw * Math.cos(br);
		const leftY = s.elev + hw * Math.sin(br);
		const rightY = s.elev - hw * Math.sin(br);
		const mL = marginFor(leftY);
		const mR = marginFor(rightY);
		for (const [y, m] of [
			[leftY, mL],
			[rightY, mR]
		]) {
			if (y > DECK_EDGE_M) deckMargins.push(m);
			else if (y > ELEVATED_EDGE_M) transitionMargins.push(m);
		}
		return { arm, mL, mR };
	};
	const offsetPt = (lane: number, i: number, sign: 1 | -1, extra: number): TrackVec2 => {
		const L = lanes[lane];
		const f = L.frames[i];
		return {
			x: L.samples[i].x + f.nx * sign * extra,
			z: L.samples[i].z + f.nz * sign * extra
		};
	};
	// Precompute per-sample side offsets for every lane.
	const sideOff: { arm: number; mL: number; mR: number }[][] = lanes.map((L, li) =>
		L.samples.map((_, i) => sideInfo(li, i))
	);

	const boundaries: TrackBoundary[] = [];
	const branchStats: CompiledTrack['branchStats'] = [];

	// Which lateral side of a main sample each branch sits on, and how far out
	// the boundary must be pushed there to enclose the branch corridor.
	// Resolved geometrically (project the branch onto the main normal) rather
	// than from the fork's turn sign, so it is correct regardless of how the
	// branch curves after leaving.
	const pushOut: { plus: number; minus: number }[] = mainSamples.map((_, i) => ({
		plus: sideOff[0][i].arm + sideOff[0][i].mL,
		minus: sideOff[0][i].arm + sideOff[0][i].mR
	}));

	for (let li = 1; li < lanes.length; li++) {
		const L = lanes[li];
		const js = L.joinStart!;
		const je = L.joinEnd!;
		// Per branch sample: the nearest main point in the bypassed span, the
		// signed lateral offset from it, and the CLEAR gap between the two
		// corridors (edge to edge, not centre to centre).
		const rel = L.samples.map((b, bi) => {
			let best = js;
			let bestD = Infinity;
			for (let mi = js; mi <= je; mi++) {
				const d = (mainSamples[mi].x - b.x) ** 2 + (mainSamples[mi].z - b.z) ** 2;
				if (d < bestD) {
					bestD = d;
					best = mi;
				}
			}
			const f = mainFrames[best];
			const lat = (b.x - mainSamples[best].x) * f.nx + (b.z - mainSamples[best].z) * f.nz;
			return {
				main: best,
				lat,
				gap: Math.abs(lat) - sideOff[0][best].arm - sideOff[li][bi].arm
			};
		});
		const plusSide = rel.reduce((v, r) => v + (r.lat >= 0 ? 1 : -1), 0) >= 0;

		// Push the main boundary on the branch's side out past the branch, so
		// the enclosing loop contains BOTH corridors.
		//
		// The boundary polygon can only move a point along ITS OWN normal, so
		// it is not enough to widen at the branch's nearest main index: where a
		// branch runs diagonally, its deepest point is shadowed by a whole span
		// of main indices, and widening only the nearest few leaves a notch the
		// branch pokes through (measured live — 8 samples up to 11.2 m inside
		// the infield). So every main index within a tangential window of a
		// branch sample is pushed past it, then a running max closes any
		// residual notch between samples.
		const TANGENT_WINDOW_M = 40;
		const need = mainSamples.map(() => 0);
		rel.forEach((r, bi) => {
			const b = L.samples[bi];
			const clear = sideOff[li][bi].arm + Math.max(sideOff[li][bi].mL, sideOff[li][bi].mR);
			for (let mi = js; mi <= je; mi++) {
				const f = mainFrames[mi];
				const dx = b.x - mainSamples[mi].x;
				const dz = b.z - mainSamples[mi].z;
				if (Math.abs(dx * f.tx + dz * f.tz) > TANGENT_WINDOW_M) continue;
				const dn = (dx * f.nx + dz * f.nz) * (plusSide ? 1 : -1);
				if (dn <= 0) continue;
				need[mi] = Math.max(need[mi], dn + clear);
			}
		});
		for (let mi = js; mi <= je; mi++) {
			let m = 0;
			for (let k = -4; k <= 4; k++) m = Math.max(m, need[clamp(mi + k, js, je)]);
			if (m <= 0) continue;
			if (plusSide) pushOut[mi].plus = Math.max(pushOut[mi].plus, m);
			else pushOut[mi].minus = Math.max(pushOut[mi].minus, m);
		}

		// The island in the lens between the two corridors: without it a driver
		// simply cuts across instead of committing to a route (the Terminal
		// Nine depot-block / pit-wall convention).
		//
		// It is CLIPPED to the longest run where a real gap exists. The two
		// corridors necessarily converge to nothing at the fork and at the
		// merge — that is what joining means — so an island spanning the whole
		// bypass would fold through itself at both ends. Each side is then
		// inset by a quarter of the LOCAL gap, so the island can never poke
		// into either corridor however the branch curves.
		let runStart = -1;
		let runEnd = -1;
		let curStart = -1;
		for (let bi = 0; bi <= rel.length; bi++) {
			const ok = bi < rel.length && rel[bi].gap >= MIN_BRANCH_SEPARATION_M;
			if (ok && curStart === -1) curStart = bi;
			if (!ok && curStart !== -1) {
				if (bi - 1 - curStart > runEnd - runStart) {
					runStart = curStart;
					runEnd = bi - 1;
				}
				curStart = -1;
			}
		}
		const islandBuilt = runStart !== -1 && runEnd - runStart >= 3;
		if (islandBuilt) {
			const sign: 1 | -1 = plusSide ? 1 : -1;
			const inset = (bi: number) => clamp(rel[bi].gap * 0.25, 0.4, MIN_ELEVATED_MARGIN_M * 1.5);
			const mainSide: TrackVec2[] = [];
			const branchSide: TrackVec2[] = [];
			for (let bi = runStart; bi <= runEnd; bi++) {
				mainSide.push(offsetPt(0, rel[bi].main, sign, sideOff[0][rel[bi].main].arm + inset(bi)));
				branchSide.push(
					offsetPt(li, bi, plusSide ? -1 : 1, sideOff[li][bi].arm + inset(bi))
				);
			}
			boundaries.push({
				id: `${L.id}-island`,
				closed: true,
				points: [...mainSide, ...branchSide.reverse()]
			});
		}
		const gaps = rel.slice(1, -1).map((r) => r.gap);
		branchStats.push({
			id: L.id,
			lane: li,
			joinStart: js,
			joinEnd: je,
			branchLengthM: L.lengthM,
			bypassedMainM: mainArcInfo.arc[je] - mainArcInfo.arc[js],
			maxSeparationM: gaps.length ? Math.max(...gaps) : 0,
			islandBuilt
		});
	}

	if (closed) {
		// Which lateral side faces outward: vote against the loop centroid.
		let cxm = 0;
		let czm = 0;
		for (const s of mainSamples) {
			cxm += s.x;
			czm += s.z;
		}
		cxm /= N;
		czm /= N;
		let vote = 0;
		for (let i = 0; i < N; i++) {
			const dl = Math.hypot(mainSamples[i].x + mainFrames[i].nx - cxm, mainSamples[i].z + mainFrames[i].nz - czm);
			const dr = Math.hypot(mainSamples[i].x - mainFrames[i].nx - cxm, mainSamples[i].z - mainFrames[i].nz - czm);
			vote += dl > dr ? 1 : -1;
		}
		const plusIsOuter = vote >= 0;
		boundaries.unshift({
			id: 'infield',
			closed: true,
			points: mainSamples.map((_, i) =>
				plusIsOuter ? offsetPt(0, i, -1, pushOut[i].minus) : offsetPt(0, i, 1, pushOut[i].plus)
			)
		});
		boundaries.unshift({
			id: 'outer',
			closed: true,
			points: mainSamples.map((_, i) =>
				plusIsOuter ? offsetPt(0, i, 1, pushOut[i].plus) : offsetPt(0, i, -1, pushOut[i].minus)
			)
		});
	} else {
		// Open corridor: one capsule loop around it, end caps extended a margin
		// past the ends so an overrun engages the wall, not the void.
		const capEnd = {
			x: mainSamples[N - 1].x + mainFrames[N - 1].tx * FLAT_MARGIN_M,
			z: mainSamples[N - 1].z + mainFrames[N - 1].tz * FLAT_MARGIN_M
		};
		const capStart = {
			x: mainSamples[0].x - mainFrames[0].tx * FLAT_MARGIN_M,
			z: mainSamples[0].z - mainFrames[0].tz * FLAT_MARGIN_M
		};
		boundaries.unshift({
			id: 'outer',
			closed: true,
			points: [
				...mainSamples.map((_, i) => offsetPt(0, i, 1, pushOut[i].plus)),
				capEnd,
				...mainSamples.map((_, i) => offsetPt(0, i, -1, pushOut[i].minus)).reverse(),
				capStart
			]
		});
	}

	// --- assemble the TrackData ---
	const laneSurface = (L: CompiledLane) => {
		const w0 = L.samples[0].width;
		const widthsVary = L.samples.some((s) => Math.abs(s.width - w0) > 0.01);
		const anyElev = L.samples.some((s) => Math.abs(s.elev) > 0.001);
		const anyBank = L.samples.some((s) => Math.abs(s.bankDeg) > 0.001);
		return {
			width: w0,
			...(widthsVary ? { widths: L.samples.map((s) => s.width) } : {}),
			centerline: L.samples.map((s) => ({ x: s.x, z: s.z })),
			...(anyElev ? { elevations: L.samples.map((s) => s.elev) } : {}),
			...(anyBank ? { banking: L.samples.map((s) => s.bankDeg) } : {})
		};
	};
	const mainSurface = laneSurface(lanes[0]);
	const branches: RibbonBranch[] = lanes.slice(1).map((L) => ({
		id: L.id,
		name: `Branch ${L.id}`,
		...laneSurface(L),
		joinStart: L.joinStart!,
		joinEnd: L.joinEnd!
	}));

	// parseTrack requires at least one checkpoint, so an unauthored track still
	// gets one placeholder rather than exporting something that cannot load.
	const checkpoints: TrackGate[] = resolved.length
		? resolved.map((r) => r.gate)
		: [gateOn(0, (sfIndex + Math.round(N / 2)) % N, 'auto-cp-1', 'Auto placeholder')];

	const track: TrackData = {
		schemaVersion: 2,
		id: opts.id,
		name: opts.name,
		description: 'Authored in the GREENLINE track builder (dev tool).',
		units: 'meters',
		spawn: {
			x: mainSamples[spawnIndex].x,
			z: mainSamples[spawnIndex].z,
			headingDeg: headingOn(0, spawnIndex)
		},
		surface: {
			type: 'ribbon',
			...mainSurface,
			closed,
			...(branches.length ? { branches } : {})
		},
		startFinish: gateOn(0, sfIndex, 'sf', 'Start/Finish'),
		checkpoints,
		boundaries,
		zones: zonesOut.flatMap((z) => z.circles),
		props: []
	};

	let runtime: TrackRuntime | null = null;
	let runtimeError: string | undefined;
	try {
		runtime = buildRuntime(track);
	} catch (e) {
		runtimeError = e instanceof Error ? e.message : String(e);
	}

	const bbox = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
	for (const L of lanes)
		for (const s of L.samples) {
			if (s.x < bbox.minX) bbox.minX = s.x;
			if (s.x > bbox.maxX) bbox.maxX = s.x;
			if (s.z < bbox.minZ) bbox.minZ = s.z;
			if (s.z > bbox.maxZ) bbox.maxZ = s.z;
		}

	return {
		ok: true,
		track,
		runtime,
		runtimeError,
		samples: mainSamples,
		lanes,
		ranges,
		flat,
		exits,
		pieceLabels: flat.map((f) => f.label),
		closure: { closed, snapped, gapM, headingGapDeg, elevGapM },
		gates: { sfIndex, spawnIndex, resolved, stepCount },
		zones: zonesOut,
		maxRaise,
		totalLengthM: mainArcInfo.total,
		marginStats: {
			flat: FLAT_MARGIN_M,
			transitionCount: transitionMargins.length,
			minTransition: transitionMargins.length ? Math.min(...transitionMargins) : null,
			maxTransition: transitionMargins.length ? Math.max(...transitionMargins) : null,
			deckCount: deckMargins.length,
			minDeck: deckMargins.length ? Math.min(...deckMargins) : null,
			maxDeck: deckMargins.length ? Math.max(...deckMargins) : null
		},
		branchStats,
		bbox
	};
}

/**
 * Drive every lane's centerline through the REAL `surfaceState` and report
 * what the game would say. This is how the generated boundaries are checked:
 * not by trusting the polygon construction, but by asking the same function
 * the harness asks every frame whether a car there is on the ribbon and inside
 * the walls. Also probes the gap between a branch and the main line, which
 * MUST read as a violation or the island is not doing its job.
 */
export function probeSurface(c: CompiledTrack): {
	laneId: string;
	samples: number;
	offRibbon: number;
	violations: number;
	worstViolationM: number;
}[] {
	const rt = c.runtime;
	if (!rt) return [];
	return c.lanes.map((L) => {
		let offRibbon = 0;
		let violations = 0;
		let worst = 0;
		let warm = 0;
		let warmPath = 0;
		for (const s of L.samples) {
			const r = surfaceState(rt, s.x, s.z, warm, warmPath);
			warm = r.warmIndex;
			warmPath = r.path;
			if (!r.state.onRibbon) offRibbon++;
			if (r.state.violation) {
				violations++;
				worst = Math.max(worst, r.state.violation.depth);
			}
		}
		return {
			laneId: L.id,
			samples: L.samples.length,
			offRibbon,
			violations,
			worstViolationM: worst
		};
	});
}

/**
 * Sample the lens between a branch and the main line and report how many of
 * those points the runtime rejects. A working island rejects (nearly) all of
 * them; that is what stops a driver cutting across instead of committing to a
 * route. Returns one entry per branch.
 */
export function probeBranchGap(c: CompiledTrack): {
	laneId: string;
	probes: number;
	blocked: number;
}[] {
	const rt = c.runtime;
	if (!rt) return [];
	const out: { laneId: string; probes: number; blocked: number }[] = [];
	for (let li = 1; li < c.lanes.length; li++) {
		const L = c.lanes[li];
		const main = c.lanes[0];
		let probes = 0;
		let blocked = 0;
		for (let bi = 4; bi < L.samples.length - 4; bi++) {
			const b = L.samples[bi];
			// Nearest main point inside the bypassed span.
			let best = L.joinStart!;
			let bestD = Infinity;
			for (let mi = L.joinStart!; mi <= L.joinEnd!; mi++) {
				const d = (main.samples[mi].x - b.x) ** 2 + (main.samples[mi].z - b.z) ** 2;
				if (d < bestD) {
					bestD = d;
					best = mi;
				}
			}
			const m = main.samples[best];
			// Only probe where a real gap exists. Near the fork and the merge the
			// two corridors converge to nothing by definition, so a midpoint
			// there is simply ON the track — counting it as an unblocked "gap"
			// would measure convergence, not a hole in the wall.
			const gap =
				Math.hypot(b.x - m.x, b.z - m.z) - m.width / 2 - b.width / 2;
			if (gap < 6) continue;
			for (const t of [0.4, 0.5, 0.6]) {
				const x = m.x + (b.x - m.x) * t;
				const z = m.z + (b.z - m.z) * t;
				const r = surfaceState(rt, x, z, 0, 0);
				probes++;
				if (r.state.violation || !r.state.onRibbon) blocked++;
			}
		}
		out.push({ laneId: L.id, probes, blocked });
	}
	return out;
}
