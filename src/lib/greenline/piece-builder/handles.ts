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
 *
 * Implemented for `straight` and `curve`; bank / jump / corkscrew extend the
 * same two solver shapes (axis / arc) in a fast-follow once this is proven.
 * `freeform` never gets handles — it is verbatim world geometry, not
 * parametric.
 */

import type { TrackPiece } from '../track-schema';
import type { PiecePose } from '../track-pieces';
import { kindSpec } from './chain-doc';

const DEG = Math.PI / 180;

/** Smallest sweep magnitude a drag can tighten a curve to, degrees. */
export const MIN_SWEEP_DEG = 2;

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
	/** Param units per meter of travel along the axis. */
	gain: number;
	/** Param value at drag start (the piece's current value at build time). */
	v0: number;
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
				return o.v0 + (s - s0) * o.gain;
			};
		}
	};
}

/* ------------------------------------------------------------------ */
/* per-kind handle sets                                                */
/* ------------------------------------------------------------------ */

/**
 * The handles for one piece, positioned from its compiled entry/exit poses
 * (diagnoseChain's own numbers — a piece the compiler skipped has no poses
 * and gets no handles). Kinds without an entry here have none yet.
 */
export function handlesForPiece(
	piece: TrackPiece,
	entry: PiecePose,
	exit: PiecePose
): PieceHandle[] {
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
			const g0 = Math.tan(entry.pitchDeg * DEG);
			const midY = entry.y + R * Math.abs(A) * DEG * g0 * 0.5;
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
		default:
			// bank / jump / corkscrew: deferred fast-follow. freeform: never —
			// verbatim geometry has no parameter a handle could shape.
			return [];
	}
}
