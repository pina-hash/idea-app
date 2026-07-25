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
 * - STRAIGHT `targetPitchDeg`: the grade eases g0 -> g1 along smootherstep and
 *   the elevation is its closed-form integral, so the exit lands at
 *   `entry.y + L·(g0 + tan g1)/2` — affine in `tan g1`. A vertical drag at the
 *   exit therefore inverts exactly: `tan p = tan p0 + 2·Δy/L`, with the entry
 *   grade cancelling out of the difference entirely.
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
 * - CORKSCREW `length`: the same chord form read the other way round. With
 *   the twist fixed, `exit = entry + L·sinc(a/2)·dirOf(h + A/2)` is a
 *   straight LINE in `L` along a fixed bearing, so the plan-length drag is a
 *   line solve at gain `1/sinc(a/2)` (1 for a straight spiral).
 * - CORKSCREW `rise`: the exit sits at `entry.y + L·g0 + rise`, so with the
 *   length fixed the exit's locus is the vertical line through it — gain 1,
 *   and the arch never interferes because its profile is zero at both joints.
 *
 * - CLOSER `radius`: the closer has no authored shape to grab, but its own
 *   solve supplies an exact anchor. Every candidate word is built from the two
 *   turning circles at the entry pose (`closerCandidates`), and the left one's
 *   centre is exactly `entry + R·leftOf(h)` — so that point's distance from
 *   the entry IS the param, at gain 1 along a fixed horizontal line. Which
 *   side the winning word actually turns does not change the radius, and the
 *   left circle is a stable anchor whichever word wins. The value starts from
 *   what the compiler RESOLVED (`HandleContext.solvedRadiusM`, after auto
 *   selection and the grade ladder), so a drag never jumps off an auto radius
 *   the handle layer cannot re-derive; writing one leaves auto mode, exactly
 *   as typing in the field does.
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
 *   crest and the landing face does. A FLAT landing (0 deg) has no face yet,
 *   so its handle sits on the bare crest and pulling it out along the run is
 *   what creates one: the crest height a landing would have depends on the
 *   kick alone, so the same closed form covers both states and 0 is not a
 *   corner only a typed value can leave.
 *   The four jump params are COUPLED — every span eats the same run — so each
 *   is additionally bounded by `jumpFitBounds` (see `fit`). Without that a
 *   drag can push a jump into the does-not-fit state, where the compile walk
 *   skips the piece: no geometry, no diagnostic, and no handles left to drag
 *   back out with.
 * - JUMP `length`: the run is a straight plan run, so the exit locus is the
 *   straight's exactly.
 * - JUMP `kickHeight`: with the takeoff angle fixed the kicker SCALES, so the
 *   lip slides along the ray from its own foot. `sKick = c·kh` (c =
 *   KICK_EXP/tan takeoff) and the lip's height is `entry.y + kh·(1 + g0·c)`,
 *   so `lip = entry + kh·(c·d, 1 + g0·c)` — a line through the entry point,
 *   solved at gain `1/|that vector|`. Reading the whole locus rather than its
 *   vertical component alone is what keeps the drag well conditioned on a
 *   sloped entry, where the vertical part can vanish.
 * - `width`: a piece's width param IS its exit width (the blend lands on it),
 *   and the swept edge sits at `centre + halfWidth·edgeDir`, so sliding the
 *   edge straight out from the centreline reads the FULL width at gain 2 —
 *   exact at any bank, since the edge direction is captured at drag start.
 *
 * WHERE THEY SIT. Every param is handle-driven, so a cross-section can owe
 * several at once; the placement is a fixed convention rather than a per-kind
 * choice, so no two ever share a grab point and the layout is learnable:
 *   - centreline: the plan-extent param (`length`)
 *   - floating above the centreline: the height param (`targetPitchDeg`,
 *     `rise`, `kickHeight`) — offset ALONG that handle's own constraint line,
 *     so the spacing never changes what the drag solves
 *   - driver's-LEFT edge: `width`
 *   - driver's-RIGHT edge: that cross-section's angle (`targetBankDeg`,
 *     `peakBankDeg`) or the plan angle that swings it (`turnDeg`)
 *
 * Implemented for every kind that has an authored param: `straight`, `curve`,
 * `bank`, `jump`, `corkscrew` and `closer`. `freeform` never gets handles — it
 * is verbatim world geometry, with no parameter to shape.
 */

import type { TrackPiece } from "../track-schema";
import {
  JUMP_KICK_EXP,
  JUMP_LAND_CREST_FRAC,
  JUMP_LAND_EASE,
  jumpFitBounds,
  jumpGeometry,
  type PiecePose,
} from "../track-pieces";
import { kindSpec } from "./chain-doc";

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
  /** Unique within the piece ('length' | 'radius' | 'sweep' | ...). */
  id: string;
  /** Readout copy while hovered / dragged. */
  label: string;
  /** The doc param this handle writes — through the field's own pipeline. */
  paramKey: string;
  /**
   * The param's EFFECTIVE value right now, so a drag can seed its readout
   * without reading the doc. That matters for the optional params (`width`,
   * `targetPitchDeg`, both jump angles, the closer's radius): absent from the
   * doc they still have a resolved value — the inherited width, the held
   * pitch, the legacy profile, the auto radius — and the handle already knows
   * it, where the doc alone would report nothing.
   */
  value: number;
  /** World position the 3D layer places the handle at. */
  pos: HandleVec3;
  /** 'ball' slides along an axis; 'diamond' swings along an arc. */
  shape: "ball" | "diamond";
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
  z: -Math.sin(h * DEG),
});
const leftOf = (h: number): { x: number; z: number } => ({
  x: -Math.sin(h * DEG),
  z: -Math.cos(h * DEG),
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
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: HandleVec3, b: HandleVec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Pointer ray ∩ an arbitrary plane (point `q`, unit normal `n`), forward hits
 * only. Null when the ray nearly lies IN the plane — for a cross-section
 * handle that is the view looking edge-on at the roll circle, where the solve
 * is meaningless and the caller should keep the last value.
 */
function rayPlaneN(
  ray: HandleRay,
  q: HandleVec3,
  n: HandleVec3,
): HandleVec3 | null {
  const dl = Math.hypot(ray.dir.x, ray.dir.y, ray.dir.z) || 1;
  const d = { x: ray.dir.x / dl, y: ray.dir.y / dl, z: ray.dir.z / dl };
  const dn = dot(d, n);
  if (Math.abs(dn) < 1e-6) return null;
  const t =
    dot(
      { x: q.x - ray.origin.x, y: q.y - ray.origin.y, z: q.z - ray.origin.z },
      n,
    ) / dn;
  if (t <= 0) return null;
  return {
    x: ray.origin.x + d.x * t,
    y: ray.origin.y + d.y * t,
    z: ray.origin.z + d.z * t,
  };
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
    value: o.v0,
    pos: o.pos,
    shape: "ball",
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
    },
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
    value: o.v0,
    pos: o.pos,
    shape: "diamond",
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
    },
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
/**
 * UNIT direction from a cross-section's centre out to the edge a positive bank
 * raises: `cos β·n + sin β·up`, the runtime's own sweep with the half width
 * factored out. Both the bank handle (which swings this direction about the
 * centreline) and the width handle (which slides along it) are stated in terms
 * of it, so the two can never disagree about where the road's edge is.
 */
const edgeDir = (n: HandleVec3, bankDeg: number): HandleVec3 => ({
  x: n.x * Math.cos(bankDeg * DEG),
  y: Math.sin(bankDeg * DEG),
  z: n.z * Math.cos(bankDeg * DEG),
});
const along = (p: HandleVec3, d: HandleVec3, s: number): HandleVec3 => ({
  x: p.x + d.x * s,
  y: p.y + d.y * s,
  z: p.z + d.z * s,
});
/** Where the banked edge sits: centre + halfWidth·(cos β·n + sin β·up). */
const bankedEdge = (
  centre: HandleVec3,
  n: HandleVec3,
  halfWidth: number,
  bankDeg: number,
): HandleVec3 => along(centre, edgeDir(n, bankDeg), halfWidth);

/**
 * How far a HEIGHT-family handle floats above the centreline ball it shares a
 * cross-section with, as a fraction of the road's half width (with a floor, so
 * a narrow road still separates them). Purely spacing: the offset runs ALONG
 * that handle's own constraint line, so the line — and therefore everything the
 * drag solves — is exactly unchanged by it.
 */
const HEIGHT_LIFT_FRAC = 0.55;
const HEIGHT_LIFT_MIN_M = 1.5;
const liftFor = (halfWidth: number): number =>
  Math.max(HEIGHT_LIFT_MIN_M, halfWidth * HEIGHT_LIFT_FRAC);

/**
 * Extra facts a handle needs that a pose cannot carry: how wide the road
 * actually is where the handle sits, where the road actually is, and what a
 * self-solving piece resolved. Supplied by the 3D layer from the REAL runtime
 * and diagnostics, so a grabbable point lands on the road's true edge rather
 * than on a guess at how the width blend resolved.
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
  /**
   * What a self-solving piece resolved its radius to (`PieceDiagnostic
   * .solvedRadiusM`, the closer's, after auto selection and the grade
   * ladder). The handle layer cannot re-derive it — where the ladder stops
   * depends on the whole chain — so without it a drag on an AUTO closer
   * would have to start from a guess and jump the road on its first move.
   */
  solvedRadiusM?: number;
}

/**
 * The handles for one piece, positioned from its compiled entry/exit poses
 * (diagnoseChain's own numbers — a piece the compiler skipped has no poses
 * and gets no handles). Every kind with an authored param has a full set.
 */
export function handlesForPiece(
  piece: TrackPiece,
  entry: PiecePose,
  exit: PiecePose,
  ctx?: HandleContext,
): PieceHandle[] {
  // Falls back to the piece's own width, then a sane road, so the module
  // stays usable (and console-testable) with no runtime attached.
  const ownWidth = (piece as { width?: number }).width;
  const halfWidthAt = (t: number): number =>
    ctx?.halfWidthAt(t) ?? (ownWidth ? ownWidth / 2 : 6);
  /** Compiled road centre, falling back to a lerp of the poses with no runtime. */
  const centreAt = (t: number): HandleVec3 =>
    ctx?.centreAt(t) ?? {
      x: entry.x + (exit.x - entry.x) * t,
      y: entry.y + (exit.y - entry.y) * t,
      z: entry.z + (exit.z - entry.z) * t,
    };
  // Ranges come from the SAME spec the numeric inputs render, so a handle
  // can never drag a value the field would refuse.
  const range = (key: string, fbMin: number, fbMax: number) => {
    const p = kindSpec(piece.kind).params.find((s) => s.key === key);
    return { min: p?.min ?? fbMin, max: p?.max ?? fbMax, unit: p?.unit ?? "" };
  };
  /**
   * Tighten a spec range with a DERIVED bound — a limit no single field can
   * state because it couples several params (today: whether a jump still fits
   * its run). Strictly a subset of the field's range, so the invariant above
   * only gets stronger: a handle can now drag no value the field would refuse
   * AND none the compiler would refuse either.
   *
   * Rounded OUTWARD-safe to the handle's own quantum, because the caller snaps
   * after it clamps — an un-rounded bound could snap back across itself and
   * land a hair inside the very violation it exists to prevent.
   */
  const fit = <T extends { min: number; max: number }>(
    r: T,
    q: number,
    lo?: number,
    hi?: number,
  ): T => ({
    ...r,
    min:
      lo === undefined
        ? r.min
        : Math.max(r.min, Math.ceil((lo - 1e-9) / q) * q),
    max:
      hi === undefined
        ? r.max
        : Math.min(r.max, Math.floor((hi + 1e-9) / q) * q),
  });
  /** Exit centreline: plan from the exact pose, height from the compiled road. */
  const exitCentre = (): HandleVec3 => ({
    x: exit.x,
    y: centreAt(1).y,
    z: exit.z,
  });
  /**
   * WIDTH slides the cross-section's driver's-LEFT edge straight out from the
   * centreline. A piece's `width` param IS its exit width (the smooth blend
   * lands exactly on it), so this rides the exit section, and one metre of
   * outward travel is two metres of full width — gain 2, exact at any bank
   * because the edge direction is captured at drag start with the rest of the
   * constraint. The driver's-RIGHT edge is where every bank handle swings, so
   * putting width on this one keeps the two off each other's grab point.
   */
  const widthHandle = (
    centre: HandleVec3,
    headingDeg: number,
    bankDeg: number,
  ): PieceHandle => {
    const hw = halfWidthAt(1);
    const e = edgeDir(bankNormal(headingDeg), bankDeg);
    const axis: HandleVec3 = { x: -e.x, y: -e.y, z: -e.z };
    return axisHandle({
      id: "width",
      label: "width",
      paramKey: "width",
      pos: along(centre, axis, hw),
      axis,
      gain: 2,
      // Unset means the piece INHERITS the incoming width, which is what the
      // road is already that wide with; a drag makes that explicit, exactly
      // as typing in the field would.
      v0: ownWidth ?? hw * 2,
      quantum: 0.5,
      ...range("width", 4, 40),
    });
  };

  /**
   * A derived bound can tighten a range until it is EMPTY — no value for this
   * param keeps the piece legal, whatever the field would otherwise allow (a
   * jump whose kicker already eats the run has no landing angle that fits, at
   * any steepness). The caller's clamp cannot express that: `min(max, max(min,
   * raw))` on an inverted range silently returns the max, which is exactly the
   * illegal value the bound exists to prevent, and writing it strands the
   * piece. So a handle with nothing legal to write is not offered at all —
   * the author fixes the param that actually has room, and this one comes back.
   */
  const build = (): PieceHandle[] => {
    switch (piece.kind) {
      case "straight": {
        const d = dirOf(entry.headingDeg);
        const centre = exitCentre();
        const L = piece.length;
        // `targetPitchDeg` unset means the entry grade is HELD, and the exit
        // pose already carries that resolution — so the handle starts from the
        // grade the road actually has either way.
        const p0 = exit.pitchDeg;
        const tan0 = Math.tan(p0 * DEG);
        return [
          axisHandle({
            id: "length",
            label: "length",
            paramKey: "length",
            pos: centre,
            axis: { x: d.x, y: 0, z: d.z },
            gain: 1, // length IS plan length; the axis is the plan direction
            v0: L,
            quantum: 0.5,
            ...range("length", 1, 2000),
          }),
          axisHandle({
            id: "grade",
            label: "target pitch",
            paramKey: "targetPitchDeg",
            // Floats above the exit ball on its own (vertical) constraint
            // line, so lifting the far end of the road tilts it.
            pos: {
              x: centre.x,
              y: centre.y + liftFor(halfWidthAt(1)),
              z: centre.z,
            },
            axis: UP,
            gain: 0,
            v0: p0,
            // exit.y = entry.y + L·(g0 + tan p)/2 (the eased grade's exact
            // integral), so vertical travel Δ inverts to tan p0 + 2Δ/L. The
            // entry grade cancels out of the difference entirely.
            solve: (travel) => Math.atan(tan0 + (2 * travel) / L) / DEG,
            quantum: 1,
            ...range("targetPitchDeg", -25, 25),
          }),
          widthHandle(centre, exit.headingDeg, exit.bankDeg),
        ];
      }
      case "curve": {
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
        const centre = exitCentre();
        const rr = range("radius", 4, 2000);
        const rt = range("turnDeg", -270, 270);
        return [
          axisHandle({
            id: "radius",
            label: "radius",
            paramKey: "radius",
            pos: { x: entry.x + ux * R, y: midY, z: entry.z + uz * R },
            axis: { x: ux / uLen, y: 0, z: uz / uLen },
            gain: 1 / uLen,
            v0: R,
            quantum: 0.5,
            ...rr,
          }),
          widthHandle(centre, exit.headingDeg, exit.bankDeg),
          {
            id: "sweep",
            label: "sweep",
            paramKey: "turnDeg",
            value: A,
            // The exit cross-section's driver's-RIGHT edge, per the layout
            // convention: cosmetic only, since this solve reads an angle
            // about the arc centre and never touches `pos`.
            pos: bankedEdge(
              centre,
              bankNormal(exit.headingDeg),
              halfWidthAt(1),
              exit.bankDeg,
            ),
            shape: "diamond",
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
            },
          },
        ];
      }
      case "bank": {
        // A straight plan run that rolls: the length solve is the straight's,
        // and the exit bank IS `targetBankDeg`, so the roll handle rides the
        // exit cross-section.
        const h = entry.headingDeg;
        const d = dirOf(h);
        const centre = exitCentre();
        const n = bankNormal(h);
        const rb = range("targetBankDeg", -60, 60);
        return [
          axisHandle({
            id: "length",
            label: "length",
            paramKey: "length",
            pos: centre,
            axis: { x: d.x, y: 0, z: d.z },
            gain: 1,
            v0: piece.length,
            quantum: 0.5,
            ...range("length", 1, 2000),
          }),
          widthHandle(centre, exit.headingDeg, piece.targetBankDeg),
          angleHandle({
            id: "bank",
            label: "bank",
            paramKey: "targetBankDeg",
            pos: bankedEdge(centre, n, halfWidthAt(1), piece.targetBankDeg),
            planePoint: centre,
            pivot: centre,
            refU: n,
            refV: UP,
            gain: 1,
            minRadius: halfWidthAt(1) * ANGLE_GUARD_FRAC,
            v0: piece.targetBankDeg,
            quantum: 1,
            ...rb,
          }),
        ];
      }
      case "corkscrew": {
        const L = piece.length;
        const A = piece.turnDeg;
        const h = entry.headingDeg;
        const a = A * DEG;
        const g0 = Math.tan(entry.pitchDeg * DEG);
        // Arc-summed plan position (see the module doc): a run of arc length
        // `L·t` turning `A·t` lands `L·t·sinc(a·t/2)` along `h + A·t/2`.
        const planAt = (t: number): { x: number; z: number } => {
          const half = (a * t) / 2;
          const chord =
            Math.abs(half) < 1e-9 ? L * t : (L * t * Math.sin(half)) / half;
          const dm = dirOf(h + (A * t) / 2);
          return { x: entry.x + dm.x * chord, z: entry.z + dm.z * chord };
        };
        const midHeading = h + A / 2;
        const nMid = bankNormal(midHeading);
        // The COMPILED mid centre: the corkscrew's catch-plane arch lifts its
        // own base, so the analytic `entry.y + L*g0/2 + rise/2` is not where
        // the road is. Plan x/z still come from the arc sum (planAt) when no
        // runtime is attached; with one, the compiled point wins outright.
        const midCentre = ctx
          ? centreAt(0.5)
          : { ...planAt(0.5), y: entry.y + L * g0 * 0.5 + piece.rise * 0.5 };
        const centre = exitCentre();
        // The chord form read the other way round: with the twist fixed the
        // exit is `entry + L·sinc(a/2)·dirOf(h + A/2)`, a straight line in L
        // along a fixed bearing. sinc -> 1 for a straight spiral.
        const halfA = a / 2;
        const sinc = Math.abs(halfA) < 1e-9 ? 1 : Math.sin(halfA) / halfA;
        const dm = dirOf(h + A / 2);
        const rt = range("turnDeg", -270, 270);
        const rp = range("peakBankDeg", -60, 60);
        return [
          axisHandle({
            id: "length",
            label: "length",
            paramKey: "length",
            pos: centre,
            axis: { x: dm.x, y: 0, z: dm.z },
            gain: 1 / sinc,
            v0: L,
            quantum: 0.5,
            ...range("length", 8, 2000),
          }),
          axisHandle({
            id: "rise",
            label: "rise",
            paramKey: "rise",
            // exit.y = entry.y + L·g0 + rise, so with the length fixed this
            // is the vertical line through the exit at gain 1. The arch never
            // interferes: its profile is zero at both joints.
            pos: {
              x: centre.x,
              y: centre.y + liftFor(halfWidthAt(1)),
              z: centre.z,
            },
            axis: UP,
            gain: 1,
            v0: piece.rise,
            quantum: 0.5,
            ...range("rise", -40, 40),
          }),
          widthHandle(centre, exit.headingDeg, exit.bankDeg),
          angleHandle({
            id: "twist",
            label: "twist",
            paramKey: "turnDeg",
            // The exit section's driver's-RIGHT edge, per the layout
            // convention, leaving the joint itself to the length ball.
            // Cosmetic: an angle solve reads `pivot`/`planePoint`, never `pos`.
            pos: bankedEdge(
              centre,
              bankNormal(exit.headingDeg),
              halfWidthAt(1),
              exit.bankDeg,
            ),
            // The exit's bearing about the entry moves at half the twist,
            // hence gain 2. Solved in the horizontal plane the exit sits in.
            planePoint: { x: entry.x, y: exit.y, z: entry.z },
            pivot: { x: entry.x, y: exit.y, z: entry.z },
            refU: { x: dirOf(h).x, y: 0, z: dirOf(h).z },
            refV: { x: leftOf(h).x, y: 0, z: leftOf(h).z },
            gain: 2,
            // The chord is the twist handle's own lever arm.
            minRadius:
              Math.hypot(exit.x - entry.x, exit.z - entry.z) * ANGLE_GUARD_FRAC,
            v0: A,
            quantum: 1,
            ...rt,
          }),
          angleHandle({
            id: "peakbank",
            label: "peak bank",
            paramKey: "peakBankDeg",
            pos: bankedEdge(
              midCentre,
              nMid,
              halfWidthAt(0.5),
              piece.peakBankDeg,
            ),
            planePoint: midCentre,
            pivot: midCentre,
            refU: nMid,
            refV: UP,
            gain: 1,
            minRadius: halfWidthAt(0.5) * ANGLE_GUARD_FRAC,
            v0: piece.peakBankDeg,
            quantum: 1,
            ...rp,
          }),
        ];
      }
      case "jump": {
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
          z: entry.z + d.z * s,
        });
        // A jump's four params are COUPLED — each span eats the same run — so
        // every one of them is additionally bounded by whether the piece still
        // fits. Without that a drag can push a jump into `pieceIssue`'s
        // does-not-fit state, where the compile walk skips it: no geometry, no
        // diagnostic, and no handles left to drag back out with.
        const fb = jumpFitBounds(piece);
        const rTake = fit(range("takeoffDeg", 3, 30), 1, fb.minTakeoffDeg);
        // 0 (flat, no face at all) remains legal and is the field's to set; the
        // bound governs only how shallow a LIVE face may get, which is all this
        // handle can reach anyway — it exists only while there is a face.
        const rLand = fit(range("landingDeg", 0, 30), 1, fb.minLandingDeg);
        // The kicker's span is `KICK_EXP * kickHeight / tan(takeoff)`, so the
        // lip's plan distance inverts straight back to the angle.
        const kickC = JUMP_KICK_EXP * piece.kickHeight;
        // The crest is fixed while takeoff and kickHeight are (see
        // jumpGeometry: sGap depends only on kickHeight and the crest
        // height), so the landing base's travel maps exactly onto its span.
        const crestS = g.sKick + g.sGap;
        // The crest height a landing WOULD have, live or flat: it is a function
        // of the kick alone (`hLand = JUMP_LAND_CREST_FRAC · kickHeight`), which
        // is what lets the landing handle exist at 0 and drag a face into being.
        const hLandEff = JUMP_LAND_CREST_FRAC * piece.kickHeight;
        const centre = exitCentre();
        // KICK HEIGHT: with the takeoff angle fixed the whole kicker SCALES,
        // so the lip slides along the ray from its own foot —
        // `lip = entry + kh·(c·d, 1 + g0·c)` with `c = sKick/kh`. Solving the
        // whole locus rather than its vertical part alone is what keeps the
        // drag well conditioned on a sloped entry, where a long kicker can
        // cancel the climb and the vertical component vanishes.
        const g0 = Math.tan(entry.pitchDeg * DEG);
        const c = JUMP_KICK_EXP / Math.tan(g.takeoffDeg * DEG);
        const kv: HandleVec3 = { x: c * d.x, y: 1 + g0 * c, z: c * d.z };
        const kLen = Math.hypot(kv.x, kv.y, kv.z) || 1;
        const kAxis: HandleVec3 = {
          x: kv.x / kLen,
          y: kv.y / kLen,
          z: kv.z / kLen,
        };
        const out: PieceHandle[] = [
          axisHandle({
            id: "length",
            label: "length",
            paramKey: "length",
            pos: centre,
            axis,
            gain: 1,
            v0: piece.length,
            quantum: 0.5,
            ...fit(range("length", 10, 2000), 0.5, fb.minLength),
          }),
          widthHandle(centre, exit.headingDeg, exit.bankDeg),
          axisHandle({
            id: "kick",
            label: "kick height",
            paramKey: "kickHeight",
            // Offset ALONG the locus, so the constraint line is untouched
            // and only the grab point clears the takeoff ball on the lip.
            pos: along(
              along(entry, kv, piece.kickHeight),
              kAxis,
              liftFor(halfWidthAt(g.sKick / piece.length)),
            ),
            axis: kAxis,
            gain: 1 / kLen,
            v0: piece.kickHeight,
            quantum: 0.25,
            ...fit(
              range("kickHeight", 0.25, 20),
              0.25,
              undefined,
              fb.maxKickHeight,
            ),
          }),
          axisHandle({
            id: "takeoff",
            label: "takeoff",
            paramKey: "takeoffDeg",
            pos: at(g.sKick, 0),
            axis,
            gain: 0,
            v0: g.takeoffDeg,
            solve: (travel) => {
              const s = g.sKick + travel;
              return s > 0.2 ? Math.atan(kickC / s) / DEG : null;
            },
            quantum: 1,
            ...rTake,
          }),
          axisHandle({
            id: "landing",
            label: "landing",
            paramKey: "landingDeg",
            // A FLAT landing has no face, so this sits exactly on the crest
            // with nothing yet extending from it; pulling it out along the run
            // is what creates one, and pulling it further makes it shallower.
            // The crest height a live landing WOULD have is a function of the
            // kick alone, so the same closed form serves both states and 0 is
            // no longer a corner only a typed value can leave.
            pos: at(crestS + g.sLand, 0),
            axis,
            gain: 0,
            v0: g.landingDeg,
            solve: (travel) => {
              const s = g.sLand + travel;
              return s > 0.2
                ? Math.atan((JUMP_LAND_EASE * hLandEff) / s) / DEG
                : null;
            },
            quantum: 1,
            ...rLand,
          }),
        ];
        return out;
      }
      case "closer": {
        // The closer has no authored SHAPE to grab — the compiler solves its
        // path from the chain — but `radius` is a real authored preference,
        // and the solve's own construction gives it an exact anchor: every
        // candidate word is built from the two turning circles at the entry
        // pose (`closerCandidates`), and the left one's centre sits exactly
        // `entry + R·leftOf(h)`. So that point's distance from the entry IS
        // the param, at gain 1 along a fixed horizontal line. Which side the
        // winning word actually turns does not change the radius, and the
        // left circle is a stable anchor whichever word wins.
        const lf = leftOf(entry.headingDeg);
        // Unset means AUTO, whose value only the compiler knows (the ladder's
        // stopping point depends on the whole chain), so the drag starts from
        // what it resolved; writing one leaves auto mode, as typing does.
        const R = piece.radius ?? ctx?.solvedRadiusM ?? 0;
        // No radius to anchor on (a pre-`solvedRadiusM` diagnostic, or a
        // closer the compiler could not reach) — no handle, rather than one
        // sitting on the entry that would fling the value on first move.
        if (!(R > 0)) return [];
        const axis: HandleVec3 = { x: lf.x, y: 0, z: lf.z };
        return [
          axisHandle({
            id: "radius",
            label: "turn radius",
            paramKey: "radius",
            pos: { x: entry.x + lf.x * R, y: entry.y, z: entry.z + lf.z * R },
            axis,
            gain: 1,
            v0: R,
            quantum: 0.5,
            ...range("radius", 4, 2000),
          }),
        ];
      }
      default:
        // freeform: never — verbatim world geometry has no parameter to shape.
        return [];
    }
  };
  return build().filter((h) => h.min <= h.max);
}
