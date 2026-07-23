/**
 * GREENLINE track pieces (schema v3): the piece-chain compiler.
 *
 * A v3 track's surface is an ordered chain of `TrackPiece` segments. Each piece
 * has an ENTRY POSE (position, heading, pitch, bank), kind-specific params, and
 * a DETERMINISTIC exit pose computed in closed form from entry + kind + params;
 * the chain walk threads the exit of one piece into the entry of the next, the
 * same way the ribbon sweep derives each cross-section from its neighbors. The
 * compiler turns the chain into exactly the per-point arrays the ribbon runtime
 * has always consumed (centerline, widths, elevations, banking), so EVERYTHING
 * downstream — `buildPath`'s 3D sweep, the visual mesh, the physics Trimesh,
 * paths/routes, the minimap — is the same single code path for every track.
 *
 * BACKWARD COMPATIBILITY (the load-bearing contract, the 8a 2D-projection /
 * 8b paths[0]-aliasing principle): a legacy `ribbon` surface IS a piece chain —
 * one `freeform` piece whose compile is verbatim passthrough of the authored
 * arrays, with zero arithmetic on any coordinate. `buildRuntime` routes every
 * surface through `compileSurface`, so the old system is a trivial instance of
 * the new one, not a parallel generator that can drift. Freeform passthrough is
 * exempt from every parametric-chain rule (closure, bank raise, grade lint):
 * its geometry is already authored world truth.
 *
 * Scope guardrails, fixed on purpose:
 * - Bank stays WELL CLEAR of 90 degrees on every kind (`PIECE_BANK_MAX_DEG`
 *   60): the cross-section sweep degenerates toward vertical and the catch
 *   plane raise diverges. This is not building toward loops, wallrides, or
 *   inversion — there is no general 6DOF rotation and no vertical piece.
 * - Pitch is a grade, not a free rotation (`PIECE_PITCH_MAX_DEG` 25); only the
 *   jump's drop face (marked `cliff`, the Terminal Nine deck-edge pattern) is
 *   exempt from the grade lint.
 * - The corkscrew is THE feature v3 unlocks: bank and grade move together over
 *   the piece's own length through one shared profile — the climb follows
 *   smootherstep and the bank swells in proportion to the EXTRA grade the
 *   spiral adds (the normalized derivative of the same curve), peaking
 *   mid-piece and returning to the entry bank at the exit. The v2 global
 *   banking array can sample that shape but cannot EXPRESS it: the coupling is
 *   authored intent, one parameter set, not two hand-synced point arrays.
 *
 * Pure math: no three.js, no cannon-es, no Svelte (the track-runtime
 * convention), so scratch scripts and the console can drive it directly.
 */

import type {
	PieceChainSurface,
	RibbonSurface,
	TrackPiece,
	TrackSurface,
	TrackVec2
} from './track-schema';

const DEG = Math.PI / 180;

/** Centerline sample spacing, meters (the committed tracks' 4 m convention). */
export const PIECE_SAMPLE_STEP = 4;
/**
 * Hard bank ceiling for every piece kind, degrees. Well clear of 90: at 90 the
 * swept cross-section's plan width collapses to zero and the catch-plane raise
 * (halfWidth * sin(bank)) equals the full half width. Legacy ribbon surfaces
 * keep their own ±75 schema bound untouched; this cap governs pieces only.
 */
export const PIECE_BANK_MAX_DEG = 60;
/** Pitch (grade angle) ceiling for authored piece params, degrees. */
export const PIECE_PITCH_MAX_DEG = 25;
/** Per-segment grade lint ceiling, |dElev| / dPlan (jump drop faces exempt). */
export const PIECE_GRADE_MAX = 0.62;
/** Loop-closure tolerances for a parametric chain (exit pose vs chain start). */
export const PIECE_CLOSURE_GAP_M = 1.0;
export const PIECE_CLOSURE_HEADING_DEG = 5;
export const PIECE_CLOSURE_ELEV_M = 0.5;
export const PIECE_CLOSURE_BANK_DEG = 3;
/**
 * Clearance the swept low edge keeps above the y = 0 catch plane, meters. One
 * centimeter, sized for the exported 2-decimal rounding, not for physics.
 */
export const PIECE_CATCH_PLANE_MARGIN_M = 0.01;
/**
 * Floor on the corkscrew arch's own profile value before a sample is allowed
 * to SIZE the arch (see `corkscrewArchLift`). The arch shape vanishes at both
 * joints, so the required-lift-over-shape ratio diverges there; samples inside
 * this band are left to the pointwise raise, which by then has at most the
 * centimeter margin to add.
 */
const ARCH_SHAPE_EPS = 0.02;

/**
 * A pose on the chain: where a piece begins or ends. Heading is the schema
 * convention (degrees, 0 = +x, CCW positive); pitch is the grade angle above
 * horizontal along the direction of travel (dy/dPlan = tan(pitch)); bank is
 * the schema banking sign (positive raises the runtime's leftEdge side, the
 * driver's right). Deliberately NOT a full 3D rotation: heading/pitch/bank is
 * the whole orientation space v3 admits.
 */
export interface PiecePose {
	x: number;
	z: number;
	y: number;
	headingDeg: number;
	pitchDeg: number;
	bankDeg: number;
}

/** One compiled piece: its poses and its sample range on the stitched chain. */
export interface CompiledPiece {
	/** Index into the authored `pieces` array (a ribbon's single piece is 0). */
	index: number;
	kind: TrackPiece['kind'];
	entry: PiecePose;
	exit: PiecePose;
	/** Stitched-chain sample indices (entry joint shared with the previous piece). */
	start: number;
	end: number;
	/**
	 * Corkscrew catch-plane arch applied by the generator itself, meters (0 on
	 * every other kind, and 0 on a corkscrew that already clears the plane).
	 * See `corkscrewArchLift`.
	 */
	archLiftM: number;
}

/**
 * The compiled chain: exactly the ribbon-shaped per-point arrays `buildPath`
 * sweeps. For a legacy ribbon surface these are the authored values verbatim
 * (`center` holds the ORIGINAL point objects; widths/elevations/banking carry
 * the same numbers the runtime's old defaults produced), which is what makes
 * the migration byte-identical.
 */
export interface CompiledChain {
	center: TrackVec2[];
	/** Chain/ribbon fallback full width (`RibbonSurface.width` semantics). */
	width: number;
	/** Per-point FULL widths (widths[i] === authored widths?.[i] ?? width). */
	widths: number[];
	elevations: number[];
	/** Degrees, the schema banking convention. */
	banking: number[];
	closed: boolean;
	/** Plan lap length including the wrap segment when closed. */
	lengthM: number;
	pieces: CompiledPiece[];
	/**
	 * Parametric chains: the measured pose mismatch at the loop joint (all
	 * within the PIECE_CLOSURE_* tolerances, or compile throws). Null for a
	 * ribbon wrap, whose closure is the legacy wrap-segment convention.
	 */
	closure: {
		gapM: number;
		headingGapDeg: number;
		elevGapM: number;
		bankGapDeg: number;
	} | null;
	/**
	 * Largest catch-plane raise applied to any parametric sample (the 8a
	 * banked-centerline rule, enforced in code the way the builder's compiler
	 * does: elevation lifted to at least halfWidth * sin(|bank|) + 1 cm so the
	 * low edge never dips under the y=0 catch plane). 0 = no lift was needed.
	 * Never applied to freeform samples — verbatim geometry stays verbatim.
	 *
	 * This is the RESIDUAL raise: it is a pointwise clamp, so where it bites
	 * hard it replaces a stretch of authored profile and leaves a slope
	 * discontinuity. A corkscrew arches its own base first (see
	 * `corkscrewArchLift`), which is why the only raise left on a spiral that
	 * starts at ground level is the centimeter margin.
	 */
	maxBankRaiseM: number;
	/** Per-sample catch-plane raise actually applied, meters (0 where none). */
	bankRaises: number[];
}

/* ------------------------------------------------------------------ */
/* math helpers                                                        */
/* ------------------------------------------------------------------ */

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Smootherstep 6t^5 - 15t^4 + 10t^3. */
const s01 = (t: number): number => {
	const c = clamp01(t);
	return c * c * c * (c * (c * 6 - 15) + 10);
};
/** Integral of smootherstep: t^6 - 3t^5 + 2.5t^4 (equals 0.5 at t = 1). */
const s01Int = (t: number): number => {
	const c = clamp01(t);
	const c4 = c * c * c * c;
	return c4 * (c * c - 3 * c + 2.5);
};
/**
 * The corkscrew coupling profile: smootherstep's derivative normalized to peak
 * 1 at t = 0.5 (30t^2(1-t)^2 / 1.875 = 16t^2(1-t)^2). Zero at both ends, so a
 * corkscrew always returns to its entry bank; peaked exactly where the
 * smootherstep climb is steepest, so bank and grade move together.
 */
const bankPulse = (t: number): number => {
	const c = clamp01(t);
	const u = c * (1 - c);
	return 16 * u * u;
};
/** Smoothstep, for width blends (the builder's blend convention). */
const smooth01 = (t: number): number => {
	const c = clamp01(t);
	return c * c * (3 - 2 * c);
};
const gradeOf = (pitchDeg: number): number => Math.tan(pitchDeg * DEG);
/** Heading degrees -> unit direction (0 = +x, CCW positive). */
const dirOf = (h: number): TrackVec2 => ({ x: Math.cos(h * DEG), z: -Math.sin(h * DEG) });
/** Driver's-LEFT unit normal (the builder's convention; a +turn curves here). */
const leftOf = (h: number): TrackVec2 => ({ x: -Math.sin(h * DEG), z: -Math.cos(h * DEG) });
const normDeg = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/* ------------------------------------------------------------------ */
/* piece validation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Structural + range validation for one piece. Returns a readable issue string
 * or null. Shared by `parseTrack` (load-time errors) and the compiler itself,
 * so a piece can never reach the generators invalid.
 */
export function pieceIssue(p: TrackPiece): string | null {
	if (typeof p !== 'object' || p === null) return 'piece is not an object';
	const inRange = (v: unknown, lo: number, hi: number): v is number =>
		fin(v) && v >= lo && v <= hi;
	switch (p.kind) {
		case 'straight':
			if (!inRange(p.length, 1, 2000)) return 'straight length must be 1..2000 m';
			if (p.targetPitchDeg !== undefined && !inRange(p.targetPitchDeg, -PIECE_PITCH_MAX_DEG, PIECE_PITCH_MAX_DEG))
				return `straight targetPitchDeg must be within ±${PIECE_PITCH_MAX_DEG}`;
			break;
		case 'curve':
			if (!inRange(p.radius, 4, 2000)) return 'curve radius must be 4..2000 m';
			if (!fin(p.turnDeg) || p.turnDeg === 0 || Math.abs(p.turnDeg) > 270)
				return 'curve turnDeg must be nonzero and within ±270';
			break;
		case 'bank':
			if (!inRange(p.length, 1, 2000)) return 'bank length must be 1..2000 m';
			if (!inRange(p.targetBankDeg, -PIECE_BANK_MAX_DEG, PIECE_BANK_MAX_DEG))
				return `bank targetBankDeg must be within ±${PIECE_BANK_MAX_DEG}`;
			break;
		case 'jump':
			if (!inRange(p.length, 10, 2000)) return 'jump length must be 10..2000 m';
			if (!inRange(p.kickHeight, 0.25, 20)) return 'jump kickHeight must be 0.25..20 m';
			break;
		case 'corkscrew':
			if (!inRange(p.length, 8, 2000)) return 'corkscrew length must be 8..2000 m';
			if (!fin(p.turnDeg) || Math.abs(p.turnDeg) > 270)
				return 'corkscrew turnDeg must be within ±270 (0 = straight spiral)';
			if (p.turnDeg !== 0 && p.length / (Math.abs(p.turnDeg) * DEG) < 4)
				return 'corkscrew is too tight (derived radius under 4 m)';
			if (!inRange(p.rise, -40, 40)) return 'corkscrew rise must be within ±40 m';
			if (!inRange(p.peakBankDeg, -PIECE_BANK_MAX_DEG, PIECE_BANK_MAX_DEG))
				return `corkscrew peakBankDeg must be within ±${PIECE_BANK_MAX_DEG}`;
			break;
		case 'freeform': {
			if (!Array.isArray(p.centerline) || p.centerline.length < 2)
				return 'freeform centerline needs at least 2 points';
			if (p.centerline.some((q) => !fin(q?.x) || !fin(q?.z)))
				return 'freeform centerline points must be finite {x, z}';
			for (const [key, arr] of [
				['widths', p.widths],
				['elevations', p.elevations],
				['banking', p.banking]
			] as const) {
				if (arr === undefined) continue;
				if (!Array.isArray(arr) || arr.length !== p.centerline.length)
					return `freeform ${key} must have one entry per centerline point`;
				if (arr.some((v) => !fin(v))) return `freeform ${key} must all be finite`;
			}
			if (p.widths?.some((w) => !(w > 0))) return 'freeform widths must be positive';
			if (p.banking?.some((b) => Math.abs(b) > PIECE_BANK_MAX_DEG))
				return `freeform banking must stay within ±${PIECE_BANK_MAX_DEG} in a piece chain`;
			break;
		}
		default:
			return `unknown piece kind ${String((p as { kind?: unknown }).kind)}`;
	}
	if (p.kind !== 'freeform' && p.width !== undefined && !(fin(p.width) && p.width >= 4 && p.width <= 40))
		return 'piece width must be 4..40 m';
	return null;
}

/* ------------------------------------------------------------------ */
/* per-kind generators                                                 */
/* ------------------------------------------------------------------ */

interface ChainSample {
	pt: TrackVec2;
	elev: number;
	bankDeg: number;
	width: number;
	/** Verbatim freeform geometry: exempt from the bank raise and grade lint. */
	verbatim: boolean;
	/** Jump drop-face samples: deliberately steep, grade lint exempt. */
	cliff: boolean;
}

interface PieceGen {
	/** Samples INCLUDING both endpoints; the stitcher drops duplicate joints. */
	samples: ChainSample[];
	exit: PiecePose;
	exitWidth: number;
	/** Corkscrew catch-plane arch height, meters (0 on every other kind). */
	archLiftM: number;
}

/**
 * The corkscrew catch-plane ARCH: the 8a banked-centerline rule enforced where
 * the geometry is authored instead of left to the pointwise raise downstream.
 *
 * A corkscrew banks hardest at mid-piece while its smootherstep climb is still
 * barely off the floor, so a spiral that starts near y = 0 asks its low edge to
 * sit UNDER the catch plane through the first third of the piece. The pointwise
 * raise does clamp that (nothing ever ends up below the plane), but clamping
 * REPLACES a stretch of the authored profile with the clearance curve and then
 * hands back to it, which leaves a slope discontinuity — the measured 0.80 m
 * hump on `piece-proof-01` and the floor catches at that one spot.
 *
 * So the piece raises its OWN base instead, by one scalar, applied through a
 * profile that is:
 * - zero at both joints (it rides `bankPulse`, the same curve that swells the
 *   bank), so entry/exit elevation, the analytic exit pose, and every sample of
 *   every neighbouring piece are untouched;
 * - weighted to the piece's LOW END (`1 - climb progress`), so the lift decays
 *   as the natural climb takes over instead of arching back over the high joint.
 *
 * `lift` is the smallest scalar for which `natural + lift * shape` clears every
 * sample's requirement, so a corkscrew that already sits clear of the plane
 * gets exactly 0 and compiles byte-identically to before. This is corkscrew-only
 * on purpose: it is the one kind that returns to its entry bank, which is what
 * makes a self-contained arch possible at all. A `bank` piece ends banked, so
 * its clearance is a joint-level obligation its neighbour shares, and the
 * pointwise raise remains the right tool there.
 */
interface ArchSample {
	elev: number;
	bankDeg: number;
	width: number;
	/** `bankPulse(t)`: the arch shape before the low-end weighting. */
	pulse: number;
	/** Final arch weight for this sample (`pulse * lowSide`), filled in below. */
	weight: number;
}

function corkscrewArchLift(natural: ArchSample[]): number {
	let lo = Infinity;
	let hi = -Infinity;
	for (const s of natural) {
		if (s.elev < lo) lo = s.elev;
		if (s.elev > hi) hi = s.elev;
	}
	const span = hi - lo;
	let lift = 0;
	for (const s of natural) {
		// Low-end weight: 1 where the piece is at its floor, 0 at its ceiling.
		s.weight = s.pulse * (span > 1e-6 ? (hi - s.elev) / span : 1);
		const br = Math.abs(s.bankDeg) * DEG;
		if (br < 0.001) continue;
		const need = (s.width / 2) * Math.sin(br) + PIECE_CATCH_PLANE_MARGIN_M;
		const short = need - s.elev;
		if (short <= 0 || s.weight < ARCH_SHAPE_EPS) continue;
		lift = Math.max(lift, short / s.weight);
	}
	return lift;
}

const nFor = (planLen: number): number => Math.max(2, Math.ceil(planLen / PIECE_SAMPLE_STEP));

function generate(entry: PiecePose, entryWidth: number, piece: TrackPiece): PieceGen {
	const wTo = piece.kind === 'freeform' ? entryWidth : (piece.width ?? entryWidth);
	const wAt = (t: number): number => entryWidth + (wTo - entryWidth) * smooth01(t);
	const g0 = gradeOf(entry.pitchDeg);

	switch (piece.kind) {
		case 'straight': {
			const L = piece.length;
			const g1 = gradeOf(piece.targetPitchDeg ?? entry.pitchDeg);
			const d = dirOf(entry.headingDeg);
			const N = nFor(L);
			const samples: ChainSample[] = [];
			for (let k = 0; k <= N; k++) {
				const t = k / N;
				samples.push({
					pt: { x: entry.x + d.x * L * t, z: entry.z + d.z * L * t },
					// Grade eases g0 -> g1 along smootherstep; elevation is its
					// closed-form integral, so the exit height is exact.
					elev: entry.y + L * (g0 * t + (g1 - g0) * s01Int(t)),
					bankDeg: entry.bankDeg,
					width: wAt(t),
					verbatim: false,
					cliff: false
				});
			}
			return {
				samples,
				exit: {
					x: entry.x + d.x * L,
					z: entry.z + d.z * L,
					y: entry.y + (L * (g0 + gradeOf(piece.targetPitchDeg ?? entry.pitchDeg))) / 2,
					headingDeg: entry.headingDeg,
					pitchDeg: piece.targetPitchDeg ?? entry.pitchDeg,
					bankDeg: entry.bankDeg
				},
				exitWidth: wTo,
				archLiftM: 0
			};
		}
		case 'curve': {
			const R = piece.radius;
			const A = piece.turnDeg;
			const sgn = A >= 0 ? 1 : -1;
			const planLen = R * Math.abs(A) * DEG;
			const lf0 = leftOf(entry.headingDeg);
			const cx = entry.x + lf0.x * R * sgn;
			const cz = entry.z + lf0.z * R * sgn;
			const posAt = (t: number): TrackVec2 => {
				const lf = leftOf(entry.headingDeg + A * t);
				return { x: cx - lf.x * R * sgn, z: cz - lf.z * R * sgn };
			};
			const N = nFor(planLen);
			const samples: ChainSample[] = [];
			for (let k = 0; k <= N; k++) {
				const t = k / N;
				samples.push({
					pt: posAt(t),
					elev: entry.y + planLen * g0 * t,
					bankDeg: entry.bankDeg,
					width: wAt(t),
					verbatim: false,
					cliff: false
				});
			}
			return {
				samples,
				exit: {
					...posAt(1),
					y: entry.y + planLen * g0,
					headingDeg: entry.headingDeg + A,
					pitchDeg: entry.pitchDeg,
					bankDeg: entry.bankDeg
				},
				exitWidth: wTo,
				archLiftM: 0
			};
		}
		case 'bank': {
			// A roll transition on a straight plan run: bank eases smootherstep
			// from the entry value to the target; pitch and heading are held.
			const L = piece.length;
			const d = dirOf(entry.headingDeg);
			const N = nFor(L);
			const samples: ChainSample[] = [];
			for (let k = 0; k <= N; k++) {
				const t = k / N;
				samples.push({
					pt: { x: entry.x + d.x * L * t, z: entry.z + d.z * L * t },
					elev: entry.y + L * g0 * t,
					bankDeg: entry.bankDeg + (piece.targetBankDeg - entry.bankDeg) * s01(t),
					width: wAt(t),
					verbatim: false,
					cliff: false
				});
			}
			return {
				samples,
				exit: {
					x: entry.x + d.x * L,
					z: entry.z + d.z * L,
					y: entry.y + L * g0,
					headingDeg: entry.headingDeg,
					pitchDeg: entry.pitchDeg,
					bankDeg: piece.targetBankDeg
				},
				exitWidth: wTo,
				archLiftM: 0
			};
		}
		case 'jump': {
			// Closure-neutral kicker (the builder's jump profile, the Terminal
			// Nine deck-edge pattern): rise to the lip, a deliberately steep drop
			// face back to the entry elevation line, flat run-out. The ribbon
			// stays continuous; the car goes ballistic because it cannot follow
			// the drop. Exit pose = the straight's (nothing to un-wind).
			const L = piece.length;
			const T_LIP = 0.52;
			const T_LAND = 0.72;
			const bump = (t: number): number =>
				t <= T_LIP ? Math.pow(t / T_LIP, 1.7) : t < T_LAND ? 1 - smooth01((t - T_LIP) / (T_LAND - T_LIP)) : 0;
			const d = dirOf(entry.headingDeg);
			const N = Math.max(6, nFor(L));
			const samples: ChainSample[] = [];
			for (let k = 0; k <= N; k++) {
				const t = k / N;
				samples.push({
					pt: { x: entry.x + d.x * L * t, z: entry.z + d.z * L * t },
					elev: entry.y + L * g0 * t + piece.kickHeight * bump(t),
					bankDeg: entry.bankDeg,
					width: wAt(t),
					verbatim: false,
					cliff: t > T_LIP - 0.02 && t < T_LAND + 0.04
				});
			}
			return {
				samples,
				exit: {
					x: entry.x + d.x * L,
					z: entry.z + d.z * L,
					y: entry.y + L * g0,
					headingDeg: entry.headingDeg,
					pitchDeg: entry.pitchDeg,
					bankDeg: entry.bankDeg
				},
				exitWidth: wTo,
				archLiftM: 0
			};
		}
		case 'corkscrew': {
			// THE v3 feature: bank and grade move together over the piece's own
			// length. The climb follows smootherstep (`rise * s01`), and the bank
			// swells in proportion to the EXTRA grade the spiral adds — the
			// normalized derivative of the same curve (`bankPulse`) — peaking at
			// mid-piece and landing back on the entry bank at the exit. One
			// parameter set expresses the coupling the global banking array
			// could only hand-sample.
			const L = piece.length;
			const A = piece.turnDeg;
			const straightPlan = A === 0;
			const d = dirOf(entry.headingDeg);
			const sgn = A >= 0 ? 1 : -1;
			const R = straightPlan ? 0 : L / (Math.abs(A) * DEG);
			const lf0 = leftOf(entry.headingDeg);
			const cx = entry.x + lf0.x * R * sgn;
			const cz = entry.z + lf0.z * R * sgn;
			const posAt = (t: number): TrackVec2 => {
				if (straightPlan) return { x: entry.x + d.x * L * t, z: entry.z + d.z * L * t };
				const lf = leftOf(entry.headingDeg + A * t);
				return { x: cx - lf.x * R * sgn, z: cz - lf.z * R * sgn };
			};
			const N = nFor(L);
			const arch: ArchSample[] = [];
			for (let k = 0; k <= N; k++) {
				const t = k / N;
				arch.push({
					elev: entry.y + L * g0 * t + piece.rise * s01(t),
					bankDeg: entry.bankDeg + (piece.peakBankDeg - entry.bankDeg) * bankPulse(t),
					width: wAt(t),
					pulse: bankPulse(t),
					weight: 0
				});
			}
			// The catch-plane arch (see `corkscrewArchLift`): its profile is zero at
			// both joints, so the exit pose below and every downstream piece are
			// untouched by it.
			const archLiftM = corkscrewArchLift(arch);
			const samples: ChainSample[] = arch.map((s, k) => ({
				pt: posAt(k / N),
				elev: s.elev + archLiftM * s.weight,
				bankDeg: s.bankDeg,
				width: s.width,
				verbatim: false,
				cliff: false
			}));
			return {
				samples,
				exit: {
					...posAt(1),
					y: entry.y + L * g0 + piece.rise,
					headingDeg: entry.headingDeg + A,
					pitchDeg: entry.pitchDeg,
					bankDeg: entry.bankDeg
				},
				exitWidth: wTo,
				archLiftM
			};
		}
		case 'freeform': {
			// Verbatim authored geometry: absolute coordinates, zero arithmetic.
			// This is the backward-compatibility container — a legacy ribbon is
			// exactly one of these — and it deliberately ignores the incoming
			// pose (its data IS its placement). Exit pose is derived from its own
			// last two points so a mixed chain can continue after it.
			const pts = piece.centerline;
			const n = pts.length;
			const samples: ChainSample[] = pts.map((pt, i) => ({
				pt,
				elev: piece.elevations?.[i] ?? 0,
				bankDeg: piece.banking?.[i] ?? 0,
				width: piece.widths?.[i] ?? piece.width ?? entryWidth,
				verbatim: true,
				cliff: false
			}));
			const poseAt = (i0: number, i1: number, at: number): PiecePose => {
				const dx = pts[i1].x - pts[i0].x;
				const dz = pts[i1].z - pts[i0].z;
				const plan = Math.hypot(dx, dz) || 1;
				const dy = samples[i1].elev - samples[i0].elev;
				return {
					x: pts[at].x,
					z: pts[at].z,
					y: samples[at].elev,
					headingDeg: Math.atan2(-dz, dx) / DEG,
					pitchDeg: Math.atan2(dy, plan) / DEG,
					bankDeg: samples[at].bankDeg
				};
			};
			return {
				samples,
				exit: poseAt(n - 2, n - 1, n - 1),
				exitWidth: samples[n - 1].width,
				archLiftM: 0
			};
		}
	}
}

/** Derived entry pose of a freeform piece (its data is its placement). */
function freeformEntryPose(piece: Extract<TrackPiece, { kind: 'freeform' }>): PiecePose {
	const pts = piece.centerline;
	const dx = pts[1].x - pts[0].x;
	const dz = pts[1].z - pts[0].z;
	const plan = Math.hypot(dx, dz) || 1;
	const e0 = piece.elevations?.[0] ?? 0;
	const e1 = piece.elevations?.[1] ?? 0;
	return {
		x: pts[0].x,
		z: pts[0].z,
		y: e0,
		headingDeg: Math.atan2(-dz, dx) / DEG,
		pitchDeg: Math.atan2(e1 - e0, plan) / DEG,
		bankDeg: piece.banking?.[0] ?? 0
	};
}

/* ------------------------------------------------------------------ */
/* the chain compiler                                                  */
/* ------------------------------------------------------------------ */

interface PieceChain {
	width: number;
	start: PiecePose;
	pieces: TrackPiece[];
	closed: boolean;
	/**
	 * Parametric-chain rules on/off. False for the legacy ribbon wrap: its one
	 * freeform piece is verbatim world truth, already governed by the ribbon's
	 * own schema validation, and its closure is the wrap-segment convention.
	 */
	strict: boolean;
}

/**
 * The compile walk. `sink`, when given, switches the guardrails from THROW to
 * COLLECT: every violation is recorded against the piece it belongs to and the
 * walk carries on, so the builder can show a whole chain's problems at once
 * instead of only the first one. Without a sink the behavior is identical to
 * before — the first violation throws the same message it always did, which is
 * what `parseTrack` and every track load rely on.
 */
function compileChain(chain: PieceChain, sink?: ChainIssue[]): CompiledChain {
	let pieceCursor: number | null = null;
	const fail = (msg: string): void => {
		if (!sink) throw new Error(`Invalid piece chain: ${msg}`);
		sink.push({ pieceIndex: pieceCursor, message: msg });
	};
	if (!chain.pieces.length) fail('no pieces');

	const samples: ChainSample[] = [];
	const compiledPieces: CompiledPiece[] = [];
	let pose = chain.start;
	let width = chain.width;
	chain.pieces.forEach((piece, pi) => {
		pieceCursor = pi;
		if (chain.strict) {
			const issue = pieceIssue(piece);
			if (issue) {
				fail(`pieces[${pi}]: ${issue}`);
				// Collect mode only: a piece with out-of-range params cannot be
				// generated, so it is skipped and the chain walks on from the
				// unchanged pose. Throw mode never reaches here.
				return;
			}
		}
		const entry = piece.kind === 'freeform' ? freeformEntryPose(piece) : pose;
		const gen = generate(entry, width, piece);
		const startIdx = samples.length === 0 ? 0 : samples.length - 1;
		gen.samples.forEach((s, k) => {
			if (k === 0 && samples.length > 0) {
				const last = samples[samples.length - 1];
				const gap = Math.hypot(s.pt.x - last.pt.x, s.pt.z - last.pt.z);
				// Parametric joints coincide exactly by construction; a freeform
				// piece sharing its first point with the previous exit does too.
				// Either way the joint is emitted once.
				if (gap < 1e-6) return;
				if (chain.strict && gap > 6)
					fail(
						`pieces[${pi}] (${piece.kind}) does not connect: its first sample is ${gap.toFixed(2)} m from the previous piece's exit`
					);
			}
			samples.push(s);
		});
		compiledPieces.push({
			index: pi,
			kind: piece.kind,
			entry,
			exit: gen.exit,
			start: startIdx,
			end: samples.length - 1,
			archLiftM: gen.archLiftM
		});
		pose = gen.exit;
		width = gen.exitWidth;
	});
	pieceCursor = null;
	if (samples.length < 4) fail('chain too short (under 4 samples)');

	// --- closure (parametric chains only): the exit pose must land back on the
	// chain start, then the duplicated closing sample is dropped so the wrap
	// segment supplies the final stretch (the committed tracks' convention).
	let closure: CompiledChain['closure'] = null;
	if (chain.strict && chain.closed && samples.length >= 2) {
		const gapM = Math.hypot(pose.x - chain.start.x, pose.z - chain.start.z);
		const headingGapDeg = Math.abs(normDeg(pose.headingDeg - chain.start.headingDeg));
		const elevGapM = Math.abs(pose.y - chain.start.y);
		const bankGapDeg = Math.abs(pose.bankDeg - chain.start.bankDeg);
		const pitchGapDeg = Math.abs(normDeg(pose.pitchDeg - chain.start.pitchDeg));
		if (gapM > PIECE_CLOSURE_GAP_M)
			fail(`chain does not close: exit lands ${gapM.toFixed(2)} m from the start`);
		if (headingGapDeg > PIECE_CLOSURE_HEADING_DEG)
			fail(`chain does not close: exit heading is off by ${headingGapDeg.toFixed(1)} deg`);
		if (elevGapM > PIECE_CLOSURE_ELEV_M)
			fail(`chain does not close: exit elevation is off by ${elevGapM.toFixed(2)} m`);
		if (bankGapDeg > PIECE_CLOSURE_BANK_DEG)
			fail(`chain does not close: exit bank is off by ${bankGapDeg.toFixed(1)} deg`);
		if (pitchGapDeg > PIECE_CLOSURE_BANK_DEG)
			fail(`chain does not close: exit pitch is off by ${pitchGapDeg.toFixed(1)} deg`);
		closure = { gapM, headingGapDeg, elevGapM, bankGapDeg };
		const first = samples[0];
		const last = samples[samples.length - 1];
		if (Math.hypot(last.pt.x - first.pt.x, last.pt.z - first.pt.z) <= 0.01) {
			samples.pop();
			const lastPiece = compiledPieces[compiledPieces.length - 1];
			lastPiece.end = Math.max(lastPiece.start, samples.length - 1);
		}
	}

	// --- catch-plane bank raise (parametric samples only, the 8a rule the
	// builder's compiler enforces the same way): the y=0 plane swallows the low
	// half of a banked section unless the centerline is lifted. Freeform samples
	// are never touched (verbatim contract). Endpoint poses are unaffected —
	// pieces enter and leave at their authored bank, so the lift fades to zero
	// at every joint whose bank does.
	let maxBankRaiseM = 0;
	const bankRaises = samples.map(() => 0);
	if (chain.strict) {
		samples.forEach((s, i) => {
			if (s.verbatim) return;
			const br = Math.abs(s.bankDeg) * DEG;
			if (br < 0.001) return;
			const need = (s.width / 2) * Math.sin(br) + PIECE_CATCH_PLANE_MARGIN_M;
			if (need > s.elev) {
				bankRaises[i] = need - s.elev;
				maxBankRaiseM = Math.max(maxBankRaiseM, bankRaises[i]);
				s.elev = need;
			}
		});
	}

	// --- grade lint (parametric segments only; jump drop faces exempt) ---
	if (chain.strict) {
		/** Which authored piece a stitched sample belongs to (collect mode only). */
		const pieceAt = (i: number): number | null => {
			if (!sink) return null;
			const hit = compiledPieces.find((p) => i >= p.start && i <= p.end);
			return hit ? hit.index : null;
		};
		const n = samples.length;
		const segs = chain.closed ? n : n - 1;
		for (let i = 0; i < segs; i++) {
			const a = samples[i];
			const b = samples[(i + 1) % n];
			if (a.verbatim || b.verbatim || a.cliff || b.cliff) continue;
			const plan = Math.hypot(b.pt.x - a.pt.x, b.pt.z - a.pt.z);
			if (plan < 0.01) continue;
			const g = Math.abs(b.elev - a.elev) / plan;
			if (g > PIECE_GRADE_MAX) {
				pieceCursor = pieceAt(i);
				fail(`grade ${g.toFixed(2)} between samples ${i} and ${(i + 1) % n} exceeds ${PIECE_GRADE_MAX}`);
			}
		}
		for (let i = 0; i < n; i++) {
			if (Math.abs(samples[i].bankDeg) > PIECE_BANK_MAX_DEG + 1e-9) {
				pieceCursor = pieceAt(i);
				fail(`sample ${i} bank ${samples[i].bankDeg.toFixed(1)} exceeds ±${PIECE_BANK_MAX_DEG}`);
			}
		}
		pieceCursor = null;
	}

	let lengthM = 0;
	for (let i = 1; i < samples.length; i++)
		lengthM += Math.hypot(samples[i].pt.x - samples[i - 1].pt.x, samples[i].pt.z - samples[i - 1].pt.z);
	if (chain.closed && samples.length > 1) {
		const a = samples[samples.length - 1];
		const b = samples[0];
		lengthM += Math.hypot(a.pt.x - b.pt.x, a.pt.z - b.pt.z);
	}

	return {
		center: samples.map((s) => s.pt),
		width: chain.width,
		widths: samples.map((s) => s.width),
		elevations: samples.map((s) => s.elev),
		banking: samples.map((s) => s.bankDeg),
		closed: chain.closed,
		lengthM,
		pieces: compiledPieces,
		closure,
		maxBankRaiseM,
		bankRaises
	};
}

/* ------------------------------------------------------------------ */
/* surface entry points                                                */
/* ------------------------------------------------------------------ */

/**
 * A legacy ribbon AS a piece chain: exactly one freeform piece carrying the
 * authored arrays. This is the whole backward-compatibility story — the old
 * format is the trivial instance of the new model, compiled through the same
 * walk, with the freeform verbatim contract guaranteeing byte-identical
 * output (same point objects, same width/elevation/banking values the
 * runtime's old `??` defaults produced).
 */
function ribbonChain(surface: RibbonSurface): PieceChain {
	const piece: TrackPiece = {
		kind: 'freeform',
		centerline: surface.centerline,
		width: surface.width,
		...(surface.widths !== undefined ? { widths: surface.widths } : {}),
		...(surface.elevations !== undefined ? { elevations: surface.elevations } : {}),
		...(surface.banking !== undefined ? { banking: surface.banking } : {})
	};
	return {
		width: surface.width,
		start: freeformEntryPose(piece as Extract<TrackPiece, { kind: 'freeform' }>),
		pieces: [piece],
		closed: surface.closed,
		strict: false
	};
}

function piecesChain(surface: PieceChainSurface): PieceChain {
	const st = surface.start;
	return {
		width: surface.width,
		start: {
			x: st.x,
			z: st.z,
			y: st.y ?? 0,
			headingDeg: st.headingDeg,
			pitchDeg: st.pitchDeg ?? 0,
			bankDeg: st.bankDeg ?? 0
		},
		pieces: surface.pieces,
		closed: true,
		strict: true
	};
}

/** Compile results are pure functions of the surface object; cache per object
 * so parse-time validation, `buildRuntime`, and `lapLengthM` share one walk. */
const compileCache = new WeakMap<TrackSurface, CompiledChain>();

/**
 * The ONE way any consumer turns a surface into per-point ribbon arrays.
 * `buildRuntime` calls this for EVERY track — ribbon or pieces — so there is a
 * single geometry pipeline and no parallel system to drift.
 */
export function compileSurface(surface: TrackSurface): CompiledChain {
	const hit = compileCache.get(surface);
	if (hit) return hit;
	const out = compileChain(surface.type === 'ribbon' ? ribbonChain(surface) : piecesChain(surface));
	compileCache.set(surface, out);
	return out;
}

/* ------------------------------------------------------------------ */
/* authoring diagnostics                                               */
/* ------------------------------------------------------------------ */

/** One guardrail violation, attributed to a piece where the compiler knows it. */
export interface ChainIssue {
	/** Index into the authored piece list, or null for a whole-chain issue. */
	pieceIndex: number | null;
	message: string;
}

/** What one piece did to the chain: its poses plus its measured extremes. */
export interface PieceDiagnostic {
	index: number;
	kind: TrackPiece['kind'];
	entry: PiecePose;
	exit: PiecePose;
	/** Stitched-chain sample range (the entry joint is shared with the previous piece). */
	start: number;
	end: number;
	/** Plan length of this piece's own samples, meters. */
	lengthM: number;
	/** Steepest |dElev| / dPlan on this piece's segments (cliff faces included). */
	maxGrade: number;
	maxBankDeg: number;
	minElevM: number;
	maxElevM: number;
	/**
	 * Lowest point of the SWEPT surface on this piece: `elev - halfWidth *
	 * |sin(bank)|`. This is the number the y = 0 catch plane actually judges, so
	 * a negative value is a section the plane would swallow.
	 */
	minEdgeYM: number;
	/** Corkscrew catch-plane arch this piece applied to itself, meters. */
	archLiftM: number;
	/** Largest residual pointwise catch-plane raise inside this piece, meters. */
	bankRaiseM: number;
	issues: string[];
}

/** A whole-chain authoring report: the compiled geometry plus every violation. */
export interface ChainDiagnostics {
	chain: CompiledChain;
	pieces: PieceDiagnostic[];
	/** Every violation found, in compile order. Empty = the chain is exportable. */
	issues: ChainIssue[];
	/** Violations that belong to no single piece (closure, chain length). */
	chainIssues: string[];
	ok: boolean;
}

/**
 * Compile a piece chain for AUTHORING: same walk, same generators, same
 * guardrails as a real track load, but collecting every violation instead of
 * throwing on the first, and rolling up the per-piece measurements a builder
 * needs to show. This is the builder's only entry point into the compiler, so
 * what an author is told and what `parseTrack` will accept can never diverge.
 */
export function diagnoseChain(surface: PieceChainSurface): ChainDiagnostics {
	const issues: ChainIssue[] = [];
	const chain = compileChain(piecesChain(surface), issues);
	const pieces: PieceDiagnostic[] = chain.pieces.map((p) => {
		const index = p.index;
		let lengthM = 0;
		let maxGrade = 0;
		let maxBankDeg = 0;
		let minElevM = Infinity;
		let maxElevM = -Infinity;
		let minEdgeYM = Infinity;
		let bankRaiseM = 0;
		for (let i = p.start; i <= p.end && i < chain.center.length; i++) {
			const elev = chain.elevations[i];
			const bank = Math.abs(chain.banking[i]);
			minElevM = Math.min(minElevM, elev);
			maxElevM = Math.max(maxElevM, elev);
			maxBankDeg = Math.max(maxBankDeg, bank);
			minEdgeYM = Math.min(minEdgeYM, elev - (chain.widths[i] / 2) * Math.sin(bank * DEG));
			bankRaiseM = Math.max(bankRaiseM, chain.bankRaises[i] ?? 0);
			if (i > p.start) {
				const plan = Math.hypot(
					chain.center[i].x - chain.center[i - 1].x,
					chain.center[i].z - chain.center[i - 1].z
				);
				lengthM += plan;
				if (plan > 0.01)
					maxGrade = Math.max(maxGrade, Math.abs(elev - chain.elevations[i - 1]) / plan);
			}
		}
		return {
			index,
			kind: p.kind,
			entry: p.entry,
			exit: p.exit,
			start: p.start,
			end: p.end,
			lengthM,
			maxGrade,
			maxBankDeg,
			minElevM: minElevM === Infinity ? 0 : minElevM,
			maxElevM: maxElevM === -Infinity ? 0 : maxElevM,
			minEdgeYM: minEdgeYM === Infinity ? 0 : minEdgeYM,
			archLiftM: p.archLiftM,
			bankRaiseM,
			issues: issues.filter((x) => x.pieceIndex === index).map((x) => x.message)
		};
	});
	// A piece whose params are out of range is skipped by the walk, so it has no
	// compiled entry; its issues still have to reach the author.
	const orphaned = issues.filter(
		(x) => x.pieceIndex !== null && !pieces.some((p) => p.index === x.pieceIndex)
	);
	return {
		chain,
		pieces,
		issues,
		chainIssues: [
			...issues.filter((x) => x.pieceIndex === null).map((x) => x.message),
			...orphaned.map((x) => x.message)
		],
		ok: issues.length === 0
	};
}
