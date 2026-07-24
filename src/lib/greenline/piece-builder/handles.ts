/**
 * GREENLINE piece-chain builder: direct-manipulation handle framework.
 *
 * A handle is a grabbable point in the 3D preview that reshapes ONE parameter
 * of the selected piece by dragging — shaping by feel, beside the numeric
 * field's landing an exact number. Both are first-class and neither replaces
 * the other: a handle drag writes through the SAME `setParams` pipeline the
 * fields use (one mutation path, so the field ticks live under a drag and a
 * typed value moves the handle), and drag-written values snap to a coarse
 * quantum so a shaped number still reads like a typed one.
 *
 * Pure math, no three.js and no Svelte (the track-pieces convention): the 3D
 * layer supplies world-space pointer RAYS and this module solves them against
 * each handle's own constraint, so every drag mapping is testable from the
 * console with no scene at all. The constraints are exact loci, not
 * approximations — each one is derived from the same closed forms the
 * generators in `track-pieces.ts` use, captured at drag start:
 *
 * - STRAIGHT `length`: with the entry pose fixed, the exit point's locus as
 *   length varies is the horizontal line through the exit along
 *   `dirOf(entry.heading)` (length is PLAN length; any climb rides on top).
 *   Ray-to-line closest point, delta-based so grabbing the ball off-center
 *   never jumps the value.
 * - CURVE `radius`: with the entry pose and the turn fixed, the mid-arc
 *   point sits at `E + R·u` where `u = sgn·(leftOf(h) − leftOf(h + A/2))` —
 *   a straight LINE through the entry, so pulling the middle of the arc
 *   wider or tighter is again a ray-to-line solve with gain `1/|u|`.
 * - CURVE `turnDeg` (sweep): with the entry pose and radius fixed, the arc
 *   center C is fixed, and the exit's angular position about C moves 1:1
 *   with the turn. The drag unwraps frame-to-frame deltas (so sweeping past
 *   180 never snaps to −180) and PRESERVES THE TURN'S SIGN: crossing zero
 *   would flip the center to the entry's other side — a discontinuous jump —
 *   so a drag can tighten to ±MIN_SWEEP_DEG but never flip; flipping a
 *   curve's direction is a typed edit.
 * - BANK `length`: a bank piece is a straight plan run, so its exit locus is
 *   the straight's exactly.
 * - BANK `targetBankDeg`: an ANGLE, so the drag is rotational rather than
 *   linear. Banking rolls the cross-section about the plan tangent, and
 *   `buildRuntime` sweeps the edge to
 *   `centre + halfWidth·(cos β·n + sin β·up)` (n = the horizontal cross
 *   normal, the runtime's `leftEdge` side). That is a CIRCLE in the vertical
 *   plane perpendicular to travel, with the edge's angle in that plane
 *   equal to β itself — so grabbing the road's edge and swinging it about
 *   the centreline reads the bank off directly, 1:1. A bank piece's exit
 *   bank IS `targetBankDeg`, so the handle sits on the exit cross-section.
 * - CORKSCREW `turnDeg` (twist): the plan is a fixed-LENGTH arc, so radius
 *   is derived (`R = L/|a|`) and the exit does not ride a circle. Summing
 *   the arc gives the exact chord form
 *   `exit = entry + L·sinc(a/2)·dirOf(h + A/2)`: the exit's BEARING from
 *   the entry is `h + A/2`, so an angular drag about the entry solves the
 *   twist exactly at gain 2. (The chord SHORTENS as the twist grows, so the
 *   handle slides along the ray rather than staying under the cursor — the
 *   solve reads the bearing only, exactly as the curve's sweep reads its
 *   angular position only.) Zero is a legal, continuous value here (a
 *   straight spiral), so unlike the curve there is no sign lock.
 * - CORKSCREW `peakBankDeg`: `bankPulse(0.5) = 1`, so the bank at mid-piece
 *   IS `peakBankDeg` exactly. Same rotational solve as the bank piece, on
 *   the mid-piece cross-section.
 *
 * An angle handle rides the road's EDGE, so it needs the road as swept rather
 * than the analytic pose: the compiler lifts samples clear of the y=0 catch
 * plane on a banked run and arches a corkscrew's base, and neither raise
 * appears in a piece's exit pose. `HandleContext` supplies the compiled
 * centreline and half-width from the real runtime, so the pivot is exact.
 * Both angle handles additionally ACCUMULATE frame-to-frame angular deltas
 * (the sweep handle's pattern) rather than reading an absolute angle, which
 * keeps a grab anywhere on the ball from jumping, lets a swing pass ±180
 * without snapping, and makes any residual pivot error cancel out of a
 * difference instead of biasing the value.
 *
 * - JUMP `takeoffDeg` / `landingDeg`: both angles are realised as SPANS
 *   (`sKick = KICK_EXP·kickHeight / tan(takeoff)`, `sLand = hLand /
 *   tan(landing)`), so the lip and the landing's base each travel on a
 *   straight LINE along the run, not on a circle — the drag is a slide, and
 *   the readout inverts the span back to the angle in closed form
 *   (`atan(h / s)`). That is what `AxisOpts.solve` exists for: an exact
 *   non-linear readout instead of a linearised `gain`. Pull the lip back and
 *   the kicker shortens and steepens; pull the landing's base toward its
 *   crest and the landing face does. A flat landing (0 deg) has no face, so
 *   it has no handle — the field is the way back in.
 *
 * Implemented for `straight`, `curve`, `bank`, `corkscrew` and `jump`.
 * `closer` has none (its shape is solved from the chain, not authored);
 * `freeform` never gets handles — it is verbatim world geometry.
 */

import type { TrackPiece } from '../track-schema';
import { JUMP_KICK_EXP, JUMP_LAND_EASE, jumpGeometry, type PiecePose } from '../track-pieces';
import { kindSpec } from './chain-doc';

const DEG = Math.PI / 180;

/** Smallest sweep magnitude a drag can tighten a curve to, degrees. */
export const MIN_SWEEP_DEG = 2;

/**
 * How close to a rotational handle's pivot a pointer may get before the solve
 * is refused, as a fraction of that handle's own lever arm. Purely a
 * singularity guard: at the centre an arbitrarily small movement sweeps an
 * arbitrarily large angle, so a pointer crossing the middle would fling the
 * value. Outside this radius the mapping is untouched and exactly 1:1.
 */
const ANGLE_GUARD_FRAC = 0.3;

export interface HandleVec3 {
	x: number;
	y: number;
	z: number;
}

/** A world-space pointer ray (the 3D layer's raycaster ray, engine-free). */
export interface HandleRay {
	origin: HandleVec3;
	dir: HandleVec3;
}

export interface PieceHandle {
	/** Unique within the piece ('length' | 'radius' | 'sweep'). */
	id: string;
	/** Readout copy while hovered / dragged. */
	label: string;
	/** The doc param this handle writes — through the field's own pipeline. */
	paramKey: string;
	/** World position the 3D layer places the handle at. */
	pos: HandleVec3;
	/** 'ball' slides along an axis; 'diamond' swings along an arc. */
	shape: 'ball' | 'diamond';
	min: number;
	max: number;
	/** Drag-written values snap to this, so a shaped number reads typed. */
	quantum: number;
	unit: string;
	/**
	 * Begin a drag. The returned solver maps each pointer ray to a raw param
	 * value (the caller clamps + snaps), or null for a ray the constraint
	 * cannot solve (near-parallel view), meaning "keep the last value". The
	 * solver is a closure over drag-start state; the constraint stays exact
	 * for the whole drag because the entry pose and the piece's OTHER params
	 * are fixed while this one is being dragged.
	 */
	beginDrag(grab: HandleRay): (move: HandleRay) => number | null;
}

/* ------------------------------------------------------------------ */
/* math helpers (the track-pieces conventions)                         */
/* ------------------------------------------------------------------ */

const dirOf = (h: number): { x: number; z: number } => ({
	x: Math.cos(h * DEG),
	z: -Math.sin(h * DEG)
});
const leftOf = (h: number): { x: number; z: number } => ({
	x: -Math.sin(h * DEG),
	z: -Math.cos(h * DEG)
});
const normDeg = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;
/** Plan angle of a vector in the schema heading convention (0 = +x, CCW+). */
const headingOfVec = (x: number, z: number): number => Math.atan2(-z, x) / DEG;

/**
 * Line param s of the closest point between a pointer ray and the line
 * `Q + s·a` (a unit). Null when the two are near parallel — the solve is
 * unstable there and the caller should keep the last value.
 */
function rayLineS(ray: HandleRay, q: HandleVec3, a: HandleVec3): number | null {
	const dl = Math.hypot(ray.dir.x, ray.dir.y, ray.dir.z) || 1;
	const dx = ray.dir.x / dl;
	const dy = ray.dir.y / dl;
	const dz = ray.dir.z / dl;
	const wx = ray.origin.x - q.x;
	const wy = ray.origin.y - q.y;
	const wz = ray.origin.z - q.z;
	const b = dx * a.x + dy * a.y + dz * a.z;
	const denom = 1 - b * b;
	if (denom < 1e-6) return null;
	const wd = wx * dx + wy * dy + wz * dz;
	const wa = wx * a.x + wy * a.y + wz * a.z;
	return (wa - b * wd) / denom;
}

/** Pointer ray ∩ the horizontal plane at height y (forward hits only). */
function rayPlaneY(ray: HandleRay, y: number): { x: number; z: number } | null {
	if (Math.abs(ray.dir.y) < 1e-6) return null;
	const t = (y - ray.origin.y) / ray.dir.y;
	if (t <= 0) return null;
	return { x: ray.origin.x + ray.dir.x * t, z: ray.origin.z + ray.dir.z * t };
}

const cross = (a: HandleVec3, b: HandleVec3): HandleVec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
const dot = (a: HandleVec3, b: HandleVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Pointer ray ∩ an arbitrary plane (point `q`, unit normal `n`), forward hits
 * only. Null when the ray nearly lies IN the plane — for a cross-section
 * handle that is the view looking edge-on at the roll circle, where the solve
 * is meaningless and the caller should keep the last value.
 */
function rayPlaneN(ray: HandleRay, q: HandleVec3, n: HandleVec3): HandleVec3 | null {
	const dl = Math.hypot(ray.dir.x, ray.dir.y, ray.dir.z) || 1;
	const d = { x: ray.dir.x / dl, y: ray.dir.y / dl, z: ray.dir.z / dl };
	const dn = dot(d, n);
	if (Math.abs(dn) < 1e-6) return null;
	const t = dot({ x: q.x - ray.origin.x, y: q.y - ray.origin.y, z: q.z - ray.origin.z }, n) / dn;
	if (t <= 0) return null;
	return { x: ray.origin.x + d.x * t, y: ray.origin.y + d.y * t, z: ray.origin.z + d.z * t };
}

/* ------------------------------------------------------------------ */
/* the two solver shapes                                               */
/* ------------------------------------------------------------------ */

interface AxisOpts {
	id: string;
	label: string;
	paramKey: string;
	pos: HandleVec3;
	/** Unit drag axis (horizontal for both shipped handles). */
	axis: HandleVec3;
	/** Param units per meter of travel along the axis. Ignored when `solve` is set. */
	gain: number;
	/** Param value at drag start (the piece's current value at build time). */
	v0: number;
	/**
	 * Exact NON-LINEAR readout, for a param whose relationship to distance
	 * along the axis is a closed form rather than a constant rate. Given the
	 * signed travel from the grab, it returns the param value outright — so an
	 * angle derived from a span (`atan(h / s)`) stays exact instead of being
	 * linearised into a `gain`. Omitted = the plain `v0 + travel * gain`.
	 */
	solve?: (travelM: number) => number | null;
	min: number;
	max: number;
	quantum: number;
	unit: string;
}

/**
 * Slide-along-a-line handle. Delta-based: the value moves by how far the
 * closest-point param travels from where the GRAB landed, so a grab anywhere
 * on the ball starts from the current value with no first-move jump.
 */
function axisHandle(o: AxisOpts): PieceHandle {
	return {
		id: o.id,
		label: o.label,
		paramKey: o.paramKey,
		pos: o.pos,
		shape: 'ball',
		min: o.min,
		max: o.max,
		quantum: o.quantum,
		unit: o.unit,
		beginDrag(grab) {
			const s0 = rayLineS(grab, o.pos, o.axis) ?? 0;
			return (move) => {
				const s = rayLineS(move, o.pos, o.axis);
				if (s === null) return null;
				return o.solve ? o.solve(s - s0) : o.v0 + (s - s0) * o.gain;
			};
		}
	};
}

interface AngleOpts {
	id: string;
	label: string;
	paramKey: string;
	pos: HandleVec3;
	/** A point on the solve plane (the cross-section, or a height plane). */
	planePoint: HandleVec3;
	/** Centre the angle is measured about, inside that plane. */
	pivot: HandleVec3;
	/** In-plane unit direction the angle is measured FROM. */
	refU: HandleVec3;
	/** In-plane unit direction a quarter turn on; the angle runs refU -> refV. */
	refV: HandleVec3;
	/** Param degrees per degree of angular travel (1, or 2 for a chord bearing). */
	gain: number;
	/**
	 * In-plane distance from the pivot below which a solve is refused. The
	 * pivot is a genuine singularity — a pointer crossing near it sweeps an
	 * enormous angle from a tiny movement — so a pass close to the centre
	 * HOLDS the value instead of flinging it. Sized as a fraction of the
	 * handle's own radius, in world units, so it is zoom-independent.
	 */
	minRadius: number;
	v0: number;
	min: number;
	max: number;
	quantum: number;
	unit: string;
}

/**
 * Swing-about-an-axis handle: the rotational counterpart to `axisHandle`, for
 * params that ARE an angle. The plane normal is `refU × refV`, so the caller
 * only states the two in-plane reference directions and the sign follows from
 * their order — no separate axis to keep consistent with them.
 *
 * DELTA-based, like the curve's sweep: each frame adds the unwrapped angular
 * step rather than reading an absolute angle. Three things fall out of that,
 * all of them wanted — grabbing the ball anywhere starts from the current
 * value with no jump, swinging past ±180 never snaps, and a small error in
 * the pivot cancels out of the difference instead of biasing the value.
 *
 * The ACCUMULATOR is clamped, not just the output, so a drag pushed past a
 * stop reverses immediately instead of unwinding invisible excess first.
 */
function angleHandle(o: AngleOpts): PieceHandle {
	const n = cross(o.refU, o.refV);
	/** In-plane angle about the pivot, or null inside the singularity guard. */
	const angleAt = (p: HandleVec3): number | null => {
		const w = { x: p.x - o.pivot.x, y: p.y - o.pivot.y, z: p.z - o.pivot.z };
		const u = dot(w, o.refU);
		const v = dot(w, o.refV);
		if (Math.hypot(u, v) < o.minRadius) return null;
		return Math.atan2(v, u) / DEG;
	};
	return {
		id: o.id,
		label: o.label,
		paramKey: o.paramKey,
		pos: o.pos,
		shape: 'diamond',
		min: o.min,
		max: o.max,
		quantum: o.quantum,
		unit: o.unit,
		beginDrag(grab) {
			const g = rayPlaneN(grab, o.planePoint, n);
			let prev = g ? angleAt(g) : null;
			let acc = o.v0;
			return (move) => {
				const p = rayPlaneN(move, o.planePoint, n);
				if (!p) return null;
				const phi = angleAt(p);
				if (phi === null) return null;
				// A grab whose own ray could not be solved seeds on the first
				// move that can be, so the drag starts from where it is rather
				// than snapping through an unknown delta.
				if (prev === null) {
					prev = phi;
					return acc;
				}
				acc += normDeg(phi - prev) * o.gain;
				prev = phi;
				acc = Math.min(o.max, Math.max(o.min, acc));
				return acc;
			};
		}
	};
}

/* ------------------------------------------------------------------ */
/* per-kind handle sets                                                */
/* ------------------------------------------------------------------ */

/** World up, and the horizontal cross normal `buildRuntime` banks about. */
const UP: HandleVec3 = { x: 0, y: 1, z: 0 };
/**
 * The side a POSITIVE bank raises. `buildRuntime`'s cross normal is
 * `(-tz, tx)` of the plan tangent, which for `dirOf(h)` is `(sin h, cos h)` —
 * exactly `-leftOf(h)`, i.e. the driver's RIGHT. Deriving it from the
 * runtime's own sweep rather than restating a sign keeps the handle on the
 * edge that actually rises.
 */
const bankNormal = (h: number): HandleVec3 => {
	const l = leftOf(h);
	return { x: -l.x, y: 0, z: -l.z };
};
/** Where the banked edge sits: centre + halfWidth·(cos β·n + sin β·up). */
const bankedEdge = (
	centre: HandleVec3,
	n: HandleVec3,
	halfWidth: number,
	bankDeg: number
): HandleVec3 => {
	const c = Math.cos(bankDeg * DEG) * halfWidth;
	const s = Math.sin(bankDeg * DEG) * halfWidth;
	return { x: centre.x + n.x * c, y: centre.y + s, z: centre.z + n.z * c };
};

/**
 * Extra geometry an angle handle needs that a pose cannot carry: how wide the
 * road actually is where the handle sits. Supplied by the 3D layer from the
 * REAL runtime (`path.halfWidths` over the piece's own sample range), so the
 * grabbable point lands on the road's true edge rather than on a guess at how
 * the width blend resolved.
 */
export interface HandleContext {
	/** Half-width at parameter t along this piece, meters. */
	halfWidthAt(t: number): number;
	/**
	 * The COMPILED centreline point at parameter t — the road as actually
	 * swept, not the analytic pose. The two differ in y wherever the compiler
	 * lifted a sample clear of the y=0 catch plane (a banked run) or arched a
	 * corkscrew's base: those raises are applied to SAMPLES and are absent from
	 * the piece's exit pose by design. An angle handle rides the road's edge,
	 * so it has to pivot on the road that is there.
	 */
	centreAt(t: number): HandleVec3;
}

/**
 * The handles for one piece, positioned from its compiled entry/exit poses
 * (diagnoseChain's own numbers — a piece the compiler skipped has no poses
 * and gets no handles). Kinds without an entry here have none yet.
 */
export function handlesForPiece(
	piece: TrackPiece,
	entry: PiecePose,
	exit: PiecePose,
	ctx?: HandleContext
): PieceHandle[] {
	// Falls back to the piece's own width, then a sane road, so the module
	// stays usable (and console-testable) with no runtime attached.
	const ownWidth = (piece as { width?: number }).width;
	const halfWidthAt = (t: number): number => ctx?.halfWidthAt(t) ?? (ownWidth ? ownWidth / 2 : 6);
	/** Compiled road centre, falling back to a lerp of the poses with no runtime. */
	const centreAt = (t: number): HandleVec3 =>
		ctx?.centreAt(t) ?? {
			x: entry.x + (exit.x - entry.x) * t,
			y: entry.y + (exit.y - entry.y) * t,
			z: entry.z + (exit.z - entry.z) * t
		};
	// Ranges come from the SAME spec the numeric inputs render, so a handle
	// can never drag a value the field would refuse.
	const range = (key: string, fbMin: number, fbMax: number) => {
		const p = kindSpec(piece.kind).params.find((s) => s.key === key);
		return { min: p?.min ?? fbMin, max: p?.max ?? fbMax, unit: p?.unit ?? '' };
	};

	switch (piece.kind) {
		case 'straight': {
			const d = dirOf(entry.headingDeg);
			return [
				axisHandle({
					id: 'length',
					label: 'length',
					paramKey: 'length',
					pos: { x: exit.x, y: exit.y, z: exit.z },
					axis: { x: d.x, y: 0, z: d.z },
					gain: 1, // length IS plan length; the axis is the plan direction
					v0: piece.length,
					quantum: 0.5,
					...range('length', 1, 2000)
				})
			];
		}
		case 'curve': {
			const R = piece.radius;
			const A = piece.turnDeg;
			const sgn = A >= 0 ? 1 : -1;
			const h = entry.headingDeg;
			// Mid-arc locus (see module doc): P(R) = E + R·u, u fixed while the
			// turn is fixed, so the radius drag is a line solve with gain 1/|u|.
			const l0 = leftOf(h);
			const lm = leftOf(h + A / 2);
			const ux = (l0.x - lm.x) * sgn;
			const uz = (l0.z - lm.z) * sgn;
			const uLen = Math.hypot(ux, uz) || 1e-6;
			// Height only: x/z stay on the radius locus (that IS the constraint).
			// With a runtime attached this is the compiled road rather than the
			// straight-line climb estimate it replaces.
			const midY = centreAt(0.5).y;
			const rr = range('radius', 4, 2000);
			const rt = range('turnDeg', -270, 270);
			return [
				axisHandle({
					id: 'radius',
					label: 'radius',
					paramKey: 'radius',
					pos: { x: entry.x + ux * R, y: midY, z: entry.z + uz * R },
					axis: { x: ux / uLen, y: 0, z: uz / uLen },
					gain: 1 / uLen,
					v0: R,
					quantum: 0.5,
					...rr
				}),
				{
					id: 'sweep',
					label: 'sweep',
					paramKey: 'turnDeg',
					pos: { x: exit.x, y: exit.y, z: exit.z },
					shape: 'diamond',
					min: rt.min,
					max: rt.max,
					quantum: 1,
					unit: rt.unit,
					beginDrag(grab) {
						// The arc center is fixed while radius is fixed; the exit's
						// angular position about it moves 1:1 with the turn (for
						// either sign, since the center flips side with it).
						const lf = leftOf(h);
						const cx = entry.x + lf.x * R * sgn;
						const cz = entry.z + lf.z * R * sgn;
						const phiOf = (p: { x: number; z: number }): number =>
							headingOfVec(p.x - cx, p.z - cz);
						const g = rayPlaneY(grab, exit.y);
						let prevPhi = g ? phiOf(g) : phiOf({ x: exit.x, z: exit.z });
						let acc = A;
						return (move) => {
							const p = rayPlaneY(move, exit.y);
							if (!p) return null;
							const phi = phiOf(p);
							acc += normDeg(phi - prevPhi);
							prevPhi = phi;
							// Clamp the ACCUMULATOR, not just the output, so a drag
							// pushed past a stop reverses immediately instead of
							// having to unwind invisible excess first. Sign is the
							// drag's fixed frame (see module doc).
							acc =
								sgn > 0
									? Math.min(rt.max, Math.max(MIN_SWEEP_DEG, acc))
									: Math.max(rt.min, Math.min(-MIN_SWEEP_DEG, acc));
							return acc;
						};
					}
				}
			];
		}
		case 'bank': {
			// A straight plan run that rolls: the length solve is the straight's,
			// and the exit bank IS `targetBankDeg`, so the roll handle rides the
			// exit cross-section.
			const h = entry.headingDeg;
			const d = dirOf(h);
			const centre = centreAt(1);
			const n = bankNormal(h);
			const rb = range('targetBankDeg', -60, 60);
			return [
				axisHandle({
					id: 'length',
					label: 'length',
					paramKey: 'length',
					pos: centre,
					axis: { x: d.x, y: 0, z: d.z },
					gain: 1,
					v0: piece.length,
					quantum: 0.5,
					...range('length', 1, 2000)
				}),
				angleHandle({
					id: 'bank',
					label: 'bank',
					paramKey: 'targetBankDeg',
					pos: bankedEdge(centre, n, halfWidthAt(1), piece.targetBankDeg),
					planePoint: centre,
					pivot: centre,
					refU: n,
					refV: UP,
					gain: 1,
					minRadius: halfWidthAt(1) * ANGLE_GUARD_FRAC,
					v0: piece.targetBankDeg,
					quantum: 1,
					...rb
				})
			];
		}
		case 'corkscrew': {
			const L = piece.length;
			const A = piece.turnDeg;
			const h = entry.headingDeg;
			const a = A * DEG;
			const g0 = Math.tan(entry.pitchDeg * DEG);
			// Arc-summed plan position (see the module doc): a run of arc length
			// `L·t` turning `A·t` lands `L·t·sinc(a·t/2)` along `h + A·t/2`.
			const planAt = (t: number): { x: number; z: number } => {
				const half = (a * t) / 2;
				const chord = Math.abs(half) < 1e-9 ? L * t : (L * t * Math.sin(half)) / half;
				const dm = dirOf(h + (A * t) / 2);
				return { x: entry.x + dm.x * chord, z: entry.z + dm.z * chord };
			};
			const midHeading = h + A / 2;
			const nMid = bankNormal(midHeading);
			// The COMPILED mid centre: the corkscrew's catch-plane arch lifts its
			// own base, so the analytic `entry.y + L*g0/2 + rise/2` is not where
			// the road is. Plan x/z still come from the arc sum (planAt) when no
			// runtime is attached; with one, the compiled point wins outright.
			const midCentre = ctx ? centreAt(0.5) : { ...planAt(0.5), y: entry.y + L * g0 * 0.5 + piece.rise * 0.5 };
			const rt = range('turnDeg', -270, 270);
			const rp = range('peakBankDeg', -60, 60);
			return [
				angleHandle({
					id: 'twist',
					label: 'twist',
					paramKey: 'turnDeg',
					pos: { x: exit.x, y: exit.y, z: exit.z },
					// The exit's bearing about the entry moves at half the twist,
					// hence gain 2. Solved in the horizontal plane the exit sits in.
					planePoint: { x: entry.x, y: exit.y, z: entry.z },
					pivot: { x: entry.x, y: exit.y, z: entry.z },
					refU: { x: dirOf(h).x, y: 0, z: dirOf(h).z },
					refV: { x: leftOf(h).x, y: 0, z: leftOf(h).z },
					gain: 2,
					// The chord is the twist handle's own lever arm.
					minRadius: Math.hypot(exit.x - entry.x, exit.z - entry.z) * ANGLE_GUARD_FRAC,
					v0: A,
					quantum: 1,
					...rt
				}),
				angleHandle({
					id: 'peakbank',
					label: 'peak bank',
					paramKey: 'peakBankDeg',
					pos: bankedEdge(midCentre, nMid, halfWidthAt(0.5), piece.peakBankDeg),
					planePoint: midCentre,
					pivot: midCentre,
					refU: nMid,
					refV: UP,
					gain: 1,
					minRadius: halfWidthAt(0.5) * ANGLE_GUARD_FRAC,
					v0: piece.peakBankDeg,
					quantum: 1,
					...rp
				})
			];
		}
		case 'jump': {
			// Both angles are DERIVED spans, so the handle that shapes them is a
			// slide along the run whose readout inverts the span exactly — not a
			// swing, because neither the lip nor the landing base travels on a
			// circle. Grab the lip and pull it back toward the entry: the kicker
			// gets shorter and therefore steeper. Grab the landing's base and
			// pull it toward the crest: the landing face gets shorter and
			// steeper. In both cases the ANGLE is what the drag writes.
			const g = jumpGeometry(piece);
			const h = entry.headingDeg;
			const d = dirOf(h);
			const axis: HandleVec3 = { x: d.x, y: 0, z: d.z };
			const at = (s: number, lift: number): HandleVec3 => ({
				x: entry.x + d.x * s,
				y: centreAt(Math.min(1, Math.max(0, s / piece.length))).y + lift,
				z: entry.z + d.z * s
			});
			const rTake = range('takeoffDeg', 3, 30);
			const rLand = range('landingDeg', 0, 30);
			// The kicker's span is `KICK_EXP * kickHeight / tan(takeoff)`, so the
			// lip's plan distance inverts straight back to the angle.
			const kickC = JUMP_KICK_EXP * piece.kickHeight;
			// The crest is fixed while takeoff and kickHeight are (see
			// jumpGeometry: sGap depends only on kickHeight and the crest
			// height), so the landing base's travel maps exactly onto its span.
			const crestS = g.sKick + g.sGap;
			const out: PieceHandle[] = [
				axisHandle({
					id: 'takeoff',
					label: 'takeoff',
					paramKey: 'takeoffDeg',
					pos: at(g.sKick, 0),
					axis,
					gain: 0,
					v0: g.takeoffDeg,
					solve: (travel) => {
						const s = g.sKick + travel;
						return s > 0.2 ? Math.atan(kickC / s) / DEG : null;
					},
					quantum: 1,
					...rTake
				})
			];
			// A flat landing has no ramp and so nothing to grab; the field is the
			// way in from 0, and the handle appears as soon as there is a face.
			if (g.sLand > 0)
				out.push(
					axisHandle({
						id: 'landing',
						label: 'landing',
						paramKey: 'landingDeg',
						pos: at(crestS + g.sLand, 0),
						axis,
						gain: 0,
						v0: g.landingDeg,
						solve: (travel) => {
							const s = g.sLand + travel;
							return s > 0.2 ? Math.atan((JUMP_LAND_EASE * g.hLand) / s) / DEG : null;
						},
						quantum: 1,
						...rLand
					})
				);
			return out;
		}
		default:
			// closer: no handle yet (its shape is solved, not authored).
			// freeform: never — verbatim geometry has no parameter to shape.
			return [];
	}
}
