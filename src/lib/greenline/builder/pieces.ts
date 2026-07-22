/**
 * GREENLINE track builder, stage 1 (dev tool): the PIECE MODEL and COMPILER.
 *
 * Trackmania-style discrete pieces (straight / curve / banked turn / jump /
 * chicane / start-finish) that snap entry-socket-to-exit-socket and compile
 * into the game's REAL schema-v2 `TrackData` (`track-schema.ts`) — a smooth
 * continuous corridor, never a blocky grid. Pure math: no three.js, no
 * Svelte, no DOM, so the compiler is scriptable from the console and the
 * 2D/3D views are strictly presentation over `CompiledTrack`.
 *
 * Placement model: a piece is appended after the current last piece and its
 * ENTRY socket (position, heading, elevation, bank, width) is the previous
 * piece's EXIT socket, always. The piece's own parameters decide where its
 * exit lands. There are no typed coordinates anywhere, so the corridor is
 * continuous by construction and editing an early piece re-derives everything
 * downstream.
 *
 * Invariants the compiler enforces BY CONSTRUCTION (not merely checked):
 * - The banked-ribbon authoring rule (Phase 8a, learned live on
 *   relief-proof-01): the y-0 catch plane swallows the low half of a banked
 *   section unless the centerline is raised, so every sample's elevation is
 *   lifted to at least halfWidth * sin(|bank|) — the low edge always clears
 *   the plane. `validate.ts` re-verifies the OUTCOME against the real
 *   `buildRuntime` 3D sweep rather than trusting this code.
 * - The run-off margin rule (Terminal Nine, Phase 8b): the generated boundary
 *   offset shrinks from the flat 9 m toward ~1.8 m wherever the ribbon edge
 *   is raised, so a car engages the soft wall instead of fall-recovering off
 *   a deck edge.
 *
 * Deliberately NOT in this stage (the next bundle): authored checkpoints and
 * branch-grouped gates, zones (boost / hazard / pit), props, and
 * junction/merge pieces. The export carries two AUTO-PLACED placeholder
 * checkpoints purely because `parseTrack` requires at least one gate — a
 * track that "validates in the tool" must be provably loadable, and an empty
 * checkpoint list is not.
 */

import { buildRuntime, type TrackRuntime } from '../track-runtime';
import type { TrackBoundary, TrackData, TrackGate } from '../track-schema';

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
 * ELEVATED_EDGE_M and this, the margin tapers (a shoulder-height drop is
 * recoverable; the taper just keeps the wall closing in as the edge rises).
 */
export const DECK_EDGE_M = 3;

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
	| 'loop-close';

export interface PlacedPiece {
	id: string;
	type: PieceType;
	params: Record<string, number>;
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
}

interface GenContext {
	/** Where the track begins (the loop-close connector's snap target). */
	trackStart: BuilderSocket;
}

export interface PieceDef {
	type: PieceType;
	name: string;
	params: ParamSpec[];
	defaults: Record<string, number>;
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

/**
 * Loop-close connector: a cubic Hermite from the current exit socket back to
 * the track's start, tangents from the two headings, resampled to even
 * spacing. Elevation and bank blend smoothly to the start's (flat, unbanked)
 * values, so the wrap joint is continuous. Its geometry is DERIVED at compile
 * time, so editing earlier pieces keeps the loop closed with no re-placement.
 * Works best when the last piece roughly faces the start; a doubled-back
 * connector shows up immediately in the overlap check.
 */
function loopCloseGen(entry: BuilderSocket, _p: Record<string, number>, ctx: GenContext): PieceGen {
	const T = ctx.trackStart;
	const chord = Math.hypot(T.x - entry.x, T.z - entry.z);
	const m = clamp(chord * 0.55, 20, 140);
	const d0 = dirOf(entry.headingDeg);
	const d1 = dirOf(T.headingDeg);
	const at = (t: number): { x: number; z: number } => {
		const t2 = t * t;
		const t3 = t2 * t;
		const h00 = 2 * t3 - 3 * t2 + 1;
		const h10 = t3 - 2 * t2 + t;
		const h01 = -2 * t3 + 3 * t2;
		const h11 = t3 - t2;
		return {
			x: h00 * entry.x + h10 * d0.x * m + h01 * T.x + h11 * d1.x * m,
			z: h00 * entry.z + h10 * d0.z * m + h01 * T.z + h11 * d1.z * m
		};
	};
	// Dense pass for arc length, then even-spacing resample.
	const DENSE = 280;
	const dense: { x: number; z: number }[] = [];
	const cum: number[] = [0];
	for (let k = 0; k <= DENSE; k++) {
		const pt = at(k / DENSE);
		dense.push(pt);
		if (k > 0)
			cum.push(cum[k - 1] + Math.hypot(pt.x - dense[k - 1].x, pt.z - dense[k - 1].z));
	}
	const total = cum[DENSE] || 1;
	const N = Math.max(4, Math.ceil(total / SAMPLE_SPACING));
	const samples: PieceSample[] = [];
	let seg = 0;
	for (let j = 0; j <= N; j++) {
		const target = (j / N) * total;
		while (seg < DENSE - 1 && cum[seg + 1] < target) seg++;
		const span = cum[seg + 1] - cum[seg] || 1;
		const f = clamp((target - cum[seg]) / span, 0, 1);
		const x = dense[seg].x + (dense[seg + 1].x - dense[seg].x) * f;
		const z = dense[seg].z + (dense[seg + 1].z - dense[seg].z) * f;
		const tf = j / N;
		samples.push({
			x,
			z,
			elev: entry.elev + (T.elev - entry.elev) * smootherstep01(tf),
			bankDeg: entry.bankDeg + (T.bankDeg - entry.bankDeg) * smootherstep01(tf),
			width: entry.width + (T.width - entry.width) * smoothstep01(tf),
			cliff: false
		});
	}
	// Land EXACTLY on the start so the compiler's closure snap is trivial.
	const lastSample = samples[samples.length - 1];
	lastSample.x = T.x;
	lastSample.z = T.z;
	lastSample.elev = T.elev;
	lastSample.bankDeg = T.bankDeg;
	return { samples, exit: { ...T } };
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
	{ type: 'loop-close', label: 'CLOSE LOOP' }
];

let uidCounter = 0;
export function makePiece(type: PieceType, overrides?: Record<string, number>): PlacedPiece {
	uidCounter += 1;
	return {
		id: `p${uidCounter}-${Math.random().toString(36).slice(2, 7)}`,
		type,
		params: { ...PIECES[type].defaults, ...(overrides ?? {}) }
	};
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
	pieceIdx: number;
}

export interface PieceRange {
	/** Global sample index of the piece's entry joint (shared with prev). */
	start: number;
	/** Global sample index of the piece's exit joint. */
	end: number;
}

export interface CompiledTrack {
	ok: boolean;
	error?: string;
	track: TrackData | null;
	/** The REAL runtime built from the compiled data (null if it threw). */
	runtime: TrackRuntime | null;
	runtimeError?: string;
	samples: CompiledSample[];
	ranges: PieceRange[];
	/** Exit socket per piece (inspector readout). */
	exits: BuilderSocket[];
	pieceLabels: string[];
	closure: {
		closed: boolean;
		snapped: boolean;
		gapM: number;
		headingGapDeg: number;
		elevGapM: number;
	};
	gates: { sfIndex: number; spawnIndex: number; cpIndices: number[] };
	/** Largest banked centerline auto-raise applied (0 = none needed). */
	maxRaise: { value: number; pieceIdx: number };
	totalLengthM: number;
	marginStats: {
		flat: number;
		/** Shoulder-height edges (1.5-3 m): the margin tapers here. */
		transitionCount: number;
		minTransition: number | null;
		maxTransition: number | null;
		/** Deck-height edges (> 3 m): the margin must be wall-tight. */
		deckCount: number;
		minDeck: number | null;
		maxDeck: number | null;
	};
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
	ranges: [],
	exits: [],
	pieceLabels: [],
	closure: { closed: false, snapped: false, gapM: 0, headingGapDeg: 0, elevGapM: 0 },
	gates: { sfIndex: 0, spawnIndex: 0, cpIndices: [] },
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
	bbox: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
});

export function compile(pieces: PlacedPiece[], opts: CompileOptions): CompiledTrack {
	if (!pieces.length) return EMPTY_COMPILE('no pieces');
	if (pieces[0].type !== 'start-finish')
		return EMPTY_COMPILE('the first piece must be START / FINISH');
	if (pieces.slice(1).some((p) => p.type === 'start-finish'))
		return EMPTY_COMPILE('only one START / FINISH piece is allowed');
	const lcIdx = pieces.findIndex((p) => p.type === 'loop-close');
	if (lcIdx !== -1 && lcIdx !== pieces.length - 1)
		return EMPTY_COMPILE('CLOSE LOOP must be the last piece');

	const startWidth =
		pieces[0].params.width ?? (PIECES['start-finish'].defaults.width as number);
	const trackStart: BuilderSocket = {
		x: 0,
		z: 0,
		headingDeg: 0,
		elev: 0,
		bankDeg: 0,
		width: startWidth
	};

	// --- walk the piece chain, entry socket = previous exit socket ---
	const samples: CompiledSample[] = [];
	const ranges: PieceRange[] = [];
	const exits: BuilderSocket[] = [];
	let socket = trackStart;
	pieces.forEach((piece, pi) => {
		const def = PIECES[piece.type];
		const gen = def.generate(socket, { ...def.defaults, ...piece.params }, { trackStart });
		const startIdx = pi === 0 ? 0 : samples.length - 1;
		gen.samples.forEach((s, k) => {
			if (pi > 0 && k === 0) return; // shared joint: already emitted by the previous piece
			samples.push({
				x: s.x,
				z: s.z,
				elev: s.elev,
				elevAuthored: s.elev,
				bankDeg: s.bankDeg,
				width: s.width,
				cliff: s.cliff,
				pieceIdx: pi
			});
		});
		ranges.push({ start: startIdx, end: samples.length - 1 });
		exits.push(gen.exit);
		socket = gen.exit;
	});
	if (samples.length < 4) return EMPTY_COMPILE('track too short (add pieces)');

	// --- closure: snap when the exit lands back on the start ---
	const first = samples[0];
	const preLast = samples[samples.length - 1];
	const gapM = Math.hypot(preLast.x - first.x, preLast.z - first.z);
	const headingGapDeg = Math.abs(normDeg(socket.headingDeg - trackStart.headingDeg));
	const elevGapM = Math.abs(socket.elev - trackStart.elev);
	let closed = false;
	let snapped = false;
	if (gapM < 1.5 && headingGapDeg < 12 && samples.length > 8) {
		closed = true;
		snapped = gapM > 0.01;
		samples.pop(); // the wrap supplies the final segment; never duplicate the start point
		const lastRange = ranges[ranges.length - 1];
		lastRange.end = Math.max(lastRange.start, samples.length - 1);
	}
	const N = samples.length;

	// --- banked centerline auto-raise (the Phase 8a authoring rule) ---
	// The y-0 catch plane swallows the low half of a banked section unless the
	// centerline is raised: elevation >= halfWidth * sin(|bank|) keeps the low
	// edge at or above the plane. Raised spans (elev already above the need)
	// are untouched, and since bank ramps smoothly to its ends, the raise does
	// too — continuity with neighboring pieces holds by construction.
	let maxRaise = { value: 0, pieceIdx: -1 };
	for (const s of samples) {
		const br = Math.abs(s.bankDeg) * DEG;
		if (br < 0.001) continue;
		// +1 cm so the exported 2-decimal rounding can never dip the low edge
		// a few millimeters under the plane.
		const need = (s.width / 2) * Math.sin(br) + 0.01;
		if (need > s.elev) {
			const d = need - s.elev;
			s.elev = need;
			if (d > maxRaise.value) maxRaise = { value: d, pieceIdx: s.pieceIdx };
		}
	}

	// --- per-sample tangents/normals (wrap-aware once closed) ---
	const tang = samples.map((_, i) => {
		const iPrev = closed ? (i - 1 + N) % N : Math.max(0, i - 1);
		const iNext = closed ? (i + 1) % N : Math.min(N - 1, i + 1);
		const tx = samples[iNext].x - samples[iPrev].x;
		const tz = samples[iNext].z - samples[iPrev].z;
		const l = Math.hypot(tx, tz) || 1;
		return { tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l };
	});
	const headingAt = (i: number) => Math.atan2(-tang[i].tz, tang[i].tx) / DEG;

	// --- start gate, spawn, and placeholder checkpoints ---
	const r0 = ranges[0];
	const idxAt = (r: PieceRange, f: number) =>
		clamp(Math.round(r.start + (r.end - r.start) * f), r.start, r.end);
	const sfIndex = idxAt(r0, 0.7);
	const spawnIndex = idxAt(r0, 0.35);
	// Gates sit at the MIDPOINT between two samples, not on a sample point.
	// A gate exactly on a centerline point is degenerate: a vehicle passing
	// through that point lands on the gate line at a motion-segment endpoint,
	// and `crossesGate` accepts t at both 0 and 1, so the gate registers on two
	// consecutive segments (the second is then reported as out-of-order).
	// Laps still count, but the spurious rejections are confusing; the
	// hand-authored tracks place gates at arbitrary positions and never hit it.
	const gateAt = (i: number, id: string, name: string): TrackGate => {
		const j = closed ? (i + 1) % N : Math.min(N - 1, i + 1);
		return {
			id,
			name,
			x: (samples[i].x + samples[j].x) / 2,
			z: (samples[i].z + samples[j].z) / 2,
			headingDeg: headingAt(i),
			halfWidth: samples[i].width / 2 + 1
		};
	};
	let cpIndices: number[];
	if (closed) {
		cpIndices = [
			(sfIndex + Math.round(N / 3)) % N,
			(sfIndex + Math.round((2 * N) / 3)) % N
		];
	} else {
		const span = N - 1 - sfIndex;
		cpIndices =
			span >= 12
				? [sfIndex + Math.round(span / 3), sfIndex + Math.round((2 * span) / 3)]
				: [clamp(sfIndex + Math.max(1, Math.round(span / 2)), 0, N - 1)];
	}
	cpIndices = [...new Set(cpIndices)].filter((i) => i !== sfIndex);
	if (!cpIndices.length) cpIndices = [Math.min(N - 1, sfIndex + 1)];

	// --- boundaries with the run-off margin rule ---
	// Flat ground gets the Proving Ground 9 m offset; the margin shrinks
	// beside raised edges (the Terminal Nine deck lesson: run-off that is thin
	// air is worse than a close soft wall), reaching wall-tight (< 3 m) by the
	// time the edge is DECK_EDGE_M up and bottoming out at 1.8 m.
	const marginFor = (edgeY: number) =>
		clamp(FLAT_MARGIN_M - Math.max(0, edgeY - 0.4) * 2.4, MIN_ELEVATED_MARGIN_M, FLAT_MARGIN_M);
	const hwOf = (i: number) => samples[i].width / 2;
	const bankROf = (i: number) => samples[i].bankDeg * DEG;
	const armOf = (i: number) => hwOf(i) * Math.cos(bankROf(i));
	const leftYOf = (i: number) => samples[i].elev + hwOf(i) * Math.sin(bankROf(i));
	const rightYOf = (i: number) => samples[i].elev - hwOf(i) * Math.sin(bankROf(i));
	const mL: number[] = [];
	const mR: number[] = [];
	const transitionMargins: number[] = [];
	const deckMargins: number[] = [];
	for (let i = 0; i < N; i++) {
		const a = marginFor(leftYOf(i));
		const b = marginFor(rightYOf(i));
		mL.push(a);
		mR.push(b);
		for (const [y, m] of [
			[leftYOf(i), a],
			[rightYOf(i), b]
		]) {
			if (y > DECK_EDGE_M) deckMargins.push(m);
			else if (y > ELEVATED_EDGE_M) transitionMargins.push(m);
		}
	}
	const ptL = (i: number, extra: number) => ({
		x: samples[i].x + tang[i].nx * (armOf(i) + extra),
		z: samples[i].z + tang[i].nz * (armOf(i) + extra)
	});
	const ptR = (i: number, extra: number) => ({
		x: samples[i].x - tang[i].nx * (armOf(i) + extra),
		z: samples[i].z - tang[i].nz * (armOf(i) + extra)
	});
	const boundaries: TrackBoundary[] = [];
	if (closed) {
		// Which lateral side faces outward: vote against the loop centroid.
		let cxm = 0;
		let czm = 0;
		for (const s of samples) {
			cxm += s.x;
			czm += s.z;
		}
		cxm /= N;
		czm /= N;
		let vote = 0;
		for (let i = 0; i < N; i++) {
			const dl = Math.hypot(samples[i].x + tang[i].nx - cxm, samples[i].z + tang[i].nz - czm);
			const dr = Math.hypot(samples[i].x - tang[i].nx - cxm, samples[i].z - tang[i].nz - czm);
			vote += dl > dr ? 1 : -1;
		}
		const leftOut = vote >= 0;
		boundaries.push({
			id: 'outer',
			closed: true,
			points: samples.map((_, i) => (leftOut ? ptL(i, mL[i]) : ptR(i, mR[i])))
		});
		boundaries.push({
			id: 'infield',
			closed: true,
			points: samples.map((_, i) => (leftOut ? ptR(i, mR[i]) : ptL(i, mL[i])))
		});
	} else {
		// Open corridor: one capsule loop around it, with end caps extended a
		// margin past the ends so an overrun engages the wall, not the void.
		const capEnd = {
			x: samples[N - 1].x + tang[N - 1].tx * FLAT_MARGIN_M,
			z: samples[N - 1].z + tang[N - 1].tz * FLAT_MARGIN_M
		};
		const capStart = {
			x: samples[0].x - tang[0].tx * FLAT_MARGIN_M,
			z: samples[0].z - tang[0].tz * FLAT_MARGIN_M
		};
		boundaries.push({
			id: 'outer',
			closed: true,
			points: [
				...samples.map((_, i) => ptL(i, mL[i])),
				capEnd,
				...samples.map((_, i) => ptR(i, mR[i])).reverse(),
				capStart
			]
		});
	}

	// --- assemble the TrackData ---
	const w0 = samples[0].width;
	const widthsVary = samples.some((s) => Math.abs(s.width - w0) > 0.01);
	const anyElev = samples.some((s) => Math.abs(s.elev) > 0.001);
	const anyBank = samples.some((s) => Math.abs(s.bankDeg) > 0.001);
	const track: TrackData = {
		schemaVersion: 2,
		id: opts.id,
		name: opts.name,
		description: 'Authored in the GREENLINE track builder (dev tool).',
		units: 'meters',
		spawn: {
			x: samples[spawnIndex].x,
			z: samples[spawnIndex].z,
			headingDeg: headingAt(spawnIndex)
		},
		surface: {
			type: 'ribbon',
			width: w0,
			...(widthsVary ? { widths: samples.map((s) => s.width) } : {}),
			closed,
			centerline: samples.map((s) => ({ x: s.x, z: s.z })),
			...(anyElev ? { elevations: samples.map((s) => s.elev) } : {}),
			...(anyBank ? { banking: samples.map((s) => s.bankDeg) } : {})
		},
		startFinish: gateAt(sfIndex, 'sf', 'Start/Finish'),
		checkpoints: cpIndices.map((idx, k) =>
			gateAt(idx, `auto-cp-${k + 1}`, `Auto placeholder ${k + 1}`)
		),
		boundaries,
		zones: [],
		props: []
	};

	let runtime: TrackRuntime | null = null;
	let runtimeError: string | undefined;
	try {
		runtime = buildRuntime(track);
	} catch (e) {
		runtimeError = e instanceof Error ? e.message : String(e);
	}

	let totalLengthM = 0;
	for (let i = 0; i + 1 < N; i++)
		totalLengthM += Math.hypot(samples[i + 1].x - samples[i].x, samples[i + 1].z - samples[i].z);
	if (closed)
		totalLengthM += Math.hypot(samples[0].x - samples[N - 1].x, samples[0].z - samples[N - 1].z);

	const bbox = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
	for (const s of samples) {
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
		samples,
		ranges,
		exits,
		pieceLabels: pieces.map((p, i) => `#${i} ${PIECES[p.type].name}`),
		closure: { closed, snapped, gapM, headingGapDeg, elevGapM },
		gates: { sfIndex, spawnIndex, cpIndices },
		maxRaise,
		totalLengthM,
		marginStats: {
			flat: FLAT_MARGIN_M,
			transitionCount: transitionMargins.length,
			minTransition: transitionMargins.length ? Math.min(...transitionMargins) : null,
			maxTransition: transitionMargins.length ? Math.max(...transitionMargins) : null,
			deckCount: deckMargins.length,
			minDeck: deckMargins.length ? Math.min(...deckMargins) : null,
			maxDeck: deckMargins.length ? Math.max(...deckMargins) : null
		},
		bbox
	};
}
