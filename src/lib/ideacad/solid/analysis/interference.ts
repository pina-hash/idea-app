/**
 * INTERFERENCE AND CLEARANCE BETWEEN BODIES: the most honest analysis a B-rep
 * modeler can offer, because every number is the kernel's exact geometry and
 * nothing is modeled. Pure over a kernel handed in: the engine calls it with
 * its own kernel and the live bodies' solid handles, INSIDE `scratch`, so every
 * intersection solid it builds is rolled back with the checkpoint and nothing
 * it touches survives the call. It never edits a body.
 *
 * FOR EVERY PAIR OF BODIES:
 *  1. BROAD PHASE. Axis-aligned bounding boxes. Boxes further apart than
 *     `CONTACT_TOLERANCE_IN` cannot touch, so the pair is CLEAR and only its
 *     minimum distance is asked for.
 *  2. EXACT INTERSECT (`intersectDetailed`, the typed twin of `intersect`).
 *     A result with faces and a volume above `VOLUME_NOISE_IN3` is an
 *     INTERFERENCE: its volume is `massProperties(result).volume`, exact over
 *     the analytic surfaces, and its center of mass is the point shown.
 *     An EMPTY result (no faces; the kernel's own "solid has zero volume" when
 *     its mass is asked for) means the bodies share no volume.
 *  3. The kernel's exact pipeline REFUSES some pairs it cannot settle exactly
 *     (`quality_refused`), and a pin sitting in its hole is the everyday case:
 *     two coaxial cylinders, measured refusing whether they fit, clear or
 *     touch. Only then is the approximate boolean asked, and every row that
 *     came from it says APPROXIMATE with the deflection the kernel used.
 *  4. NO SHARED VOLUME: `minimumDistance` says whether the pair TOUCHES
 *     (within `CONTACT_TOLERANCE_IN`) or is CLEAR by how much, with the two
 *     closest points. It is asked only once the boolean has said the bodies
 *     do not overlap.
 *  5. Anything else the kernel says is UNKNOWN for that pair, with the
 *     kernel's own sentence. It is never guessed to be clear.
 *
 * THE KERNEL'S `solidToSolidDistance` IS NOT A MINIMUM DISTANCE ON ITS OWN,
 * AND THE MEASURE TOOL STILL TRUSTS IT. Measured on the vendored kernel: two
 * boxes crossed over a gap get the right 0.5 in, but a disk lying 0.125 in
 * above a plate gets 0.564 in, a wheel 0.1 in beside a plate gets 0.180 in,
 * and a motor touching a skid at one point gets 0.618 in -- in each case the
 * nearest pair of CORNERS, because the closest points lie inside a curved
 * face. On two overlapping boxes it answers 1 in. So its answer is only a
 * starting point here: `minimumDistance` takes it, adds every corner and the
 * nearest points along every curved edge of both bodies (narrowed along the
 * edge by golden section), walks the best of those downhill by alternating
 * `pointToSolidDistance` between the two bodies (which lands on the true
 * closest pair whenever the bodies are convex), and keeps the smallest real
 * distance it found. The answer is CERTIFIED EXACT
 * only when it equals the bounding-box gap, which nothing can undercut; any
 * other clearance is shown as APPROXIMATE, because for a concave shape the
 * walk can settle in a local minimum.
 */
import type { BrepKernel } from '../../kernel/remus';
import type { Vec3 } from '../types';

/** Volumes below this are the boolean's arithmetic, not an overlap anybody can make. */
export const VOLUME_NOISE_IN3 = 1e-9;
/** Two bodies closer than this touch. The kernel answers exactly 0 for two boxes face to face. */
export const CONTACT_TOLERANCE_IN = 1e-6;

export type PairKind = 'interference' | 'touching' | 'clear' | 'unknown';
export interface InterferencePair {
	a: string;
	b: string;
	kind: PairKind;
	/** in³, for an interference. */
	volume?: number;
	/** A point inside the shared volume (its center of mass), for an interference. */
	point?: Vec3;
	/** in, for a touching or clear pair. */
	distance?: number;
	/** The two closest points, a on body a and b on body b. */
	points?: [Vec3, Vec3];
	/** `approximate` when the kernel's exact boolean refused and the answer came from its faceted fallback. */
	quality: 'exact' | 'approximate';
	/** The fallback's deflection, in inches, when approximate. */
	deflection?: number;
	/** The kernel's sentence, for an unknown pair. */
	message?: string;
	/** False for a clearance past `SEARCH_PAIRS`, which keeps the kernel's own answer. */
	searched?: false;
}
export interface InterferenceReport {
	pairs: InterferencePair[];
	bodies: number;
	pairsChecked: number;
	/** Pairs the bounding boxes settled without a boolean. */
	broadPhase: number;
	/** Clearances that got the full search. */
	searched: number;
	ms: number;
}
export interface InterferenceBody { id: string; solid: number }
export type InterferenceKernel = Pick<BrepKernel, 'boundingBox' | 'intersectDetailed' | 'booleanWithQuality' | 'getSolidFaces' | 'massProperties' | 'solidToSolidDistance' | 'pointToSolidDistance' | 'getSolidVertices' | 'getSolidEdges' | 'getVertexPosition' | 'getEdgeCurveType' | 'getEdgeParamSpan' | 'evaluateEdgeCurve'>;

const json = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The gap between two boxes `[minx,miny,minz,maxx,maxy,maxz]`, 0 when they overlap or touch. */
export function boxGap(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let s = 0;
	for (let d = 0; d < 3; d++) { const g = a[d] > b[d + 3] ? a[d] - b[d + 3] : b[d] > a[d + 3] ? b[d] - a[d + 3] : 0; s += g * g; }
	return Math.sqrt(s);
}

/** A shared-volume solid's volume and center, or null when it is empty. */
function shared(k: InterferenceKernel, solid: number): { volume: number; point: Vec3 } | null {
	if (!k.getSolidFaces(solid).length) return null;
	try {
		const props = json<{ volume: number; centerOfMass: number[] }>(k.massProperties(solid));
		return props.volume > VOLUME_NOISE_IN3 ? { volume: props.volume, point: [props.centerOfMass[0], props.centerOfMass[1], props.centerOfMass[2]] } : null;
	} catch (e) {
		if (/zero volume/i.test(message(e))) return null;
		throw e;
	}
}

interface Candidate { distance: number; onA: Vec3; onB: Vec3 }
/** The closest point of `solid` to `p`, and the distance. */
const project = (k: InterferenceKernel, p: Vec3, solid: number): { distance: number; point: Vec3 } => { const r = k.pointToSolidDistance(p[0], p[1], p[2], solid); return { distance: r[0], point: [r[1], r[2], r[3]] }; };
const vec = (p: ArrayLike<number>): Vec3 => [p[0], p[1], p[2]];
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * Starting points on `from`, each paired with its closest point on `to`:
 * every corner, and on every edge that is not a straight line the nearest of
 * `EDGE_SAMPLES` points along it, the best `EDGE_REFINE` of which are then
 * narrowed by a golden-section search along the edge. That is what finds a
 * contact at a point no corner sits on -- a motor's rim resting on a plate's
 * edge -- where a walk between two faces meeting at a tangent crawls.
 */
function seedsFrom(k: InterferenceKernel, from: number, to: number, fromIsA: boolean): Candidate[] {
	const pair = (p: Vec3): Candidate => { const q = project(k, p, to); return fromIsA ? { distance: q.distance, onA: p, onB: q.point } : { distance: q.distance, onA: q.point, onB: p }; };
	const out: Candidate[] = [];
	for (const v of k.getSolidVertices(from)) out.push(pair(vec(k.getVertexPosition(v))));
	const edges: { at: (t: number) => Vec3; ts: number[]; ds: number[]; i: number }[] = [];
	for (const e of k.getSolidEdges(from)) {
		if (k.getEdgeCurveType(e) === 'LINE') continue;
		try {
			const span = k.getEdgeParamSpan(e), at = (t: number) => vec(k.evaluateEdgeCurve(e, t));
			const ts = Array.from({ length: EDGE_SAMPLES + 1 }, (_, i) => span[0] + ((span[1] - span[0]) * i) / EDGE_SAMPLES);
			const ds = ts.map((t) => { const c = pair(at(t)); out.push(c); return c.distance; });
			let i = 0; for (let j = 1; j < ds.length; j++) if (ds[j] < ds[i]) i = j;
			edges.push({ at, ts, ds, i });
		} catch { /* an edge the kernel cannot evaluate contributes its corners only */ }
	}
	edges.sort((x, y) => x.ds[x.i] - y.ds[y.i]);
	for (const edge of edges.slice(0, EDGE_REFINE)) {
		let lo = edge.ts[edge.i === 0 ? 0 : edge.i - 1], hi = edge.ts[edge.i === edge.ts.length - 1 ? edge.i : edge.i + 1];
		let x1 = hi - GOLDEN * (hi - lo), x2 = lo + GOLDEN * (hi - lo), c1 = pair(edge.at(x1)), c2 = pair(edge.at(x2));
		for (let n = 0; n < GOLDEN_STEPS; n++) {
			if (c1.distance <= c2.distance) { hi = x2; x2 = x1; c2 = c1; x1 = hi - GOLDEN * (hi - lo); c1 = pair(edge.at(x1)); }
			else { lo = x1; x1 = x2; c1 = c2; x2 = lo + GOLDEN * (hi - lo); c2 = pair(edge.at(x2)); }
		}
		out.push(c1.distance <= c2.distance ? c1 : c2);
	}
	return out;
}

export interface Separation { distance: number; points: [Vec3, Vec3]; /** True when the distance equals the bounding-box gap, a lower bound nothing can undercut. */ certified: boolean }
const certifies = (distance: number, lowerBound: number) => distance <= lowerBound + CERTIFY_TOLERANCE_IN;
/** The kernel's own answer: a real pair of points, so an upper bound, and certified when it meets the bounding-box gap. */
export function kernelDistance(k: InterferenceKernel, a: number, b: number, lowerBound: number): Separation {
	const d = k.solidToSolidDistance(a, b);
	return { distance: d[0], points: [[d[1], d[2], d[3]], [d[4], d[5], d[6]]], certified: certifies(d[0], lowerBound) };
}
/**
 * The smallest distance between two solids that do not overlap, as the
 * header describes: the kernel's answer, then a search from corners and
 * points along curved edges, then a walk downhill from the best of them.
 * Every candidate is a real pair of surface points, so the answer never
 * undershoots the truth.
 */
export function minimumDistance(k: InterferenceKernel, a: number, b: number, lowerBound: number, start: Separation = kernelDistance(k, a, b, lowerBound)): Separation {
	let best: Candidate = { distance: start.distance, onA: start.points[0], onB: start.points[1] };
	const done = () => certifies(best.distance, lowerBound);
	if (!done()) {
		const seeds = [best, ...seedsFrom(k, a, b, true), ...seedsFrom(k, b, a, false)].sort((x, y) => x.distance - y.distance);
		if (seeds[0].distance < best.distance) best = seeds[0];
		for (const seed of seeds.slice(0, SEEDS)) {
			if (done()) break;
			let c = seed;
			for (let i = 0; i < WALK_STEPS; i++) {
				const onA = project(k, c.onB, a), onB = project(k, onA.point, b);
				if (!(onB.distance < c.distance - 1e-12)) break;
				c = { distance: onB.distance, onA: onA.point, onB: onB.point };
			}
			if (c.distance < best.distance) best = c;
		}
	}
	return { distance: best.distance, points: [best.onA, best.onB], certified: done() };
}
/** Points per curved edge the search samples. */
export const EDGE_SAMPLES = 16;
/** Curved edges per body narrowed by golden section, nearest first. */
export const EDGE_REFINE = 3;
export const GOLDEN_STEPS = 40;
/** Starting points walked downhill, best first. */
export const SEEDS = 4;
export const WALK_STEPS = 60;
/** How close to the bounding-box gap a distance must be to count as exactly it. */
export const CERTIFY_TOLERANCE_IN = 1e-9;
/**
 * How many uncertified clearances get the full search, nearest first. The
 * search costs tens of kernel calls per pair and the worker runs one thing at
 * a time, so a model of many bodies must not stall a drag behind its far
 * pairs; a pair past this count keeps the kernel's own answer, marked
 * approximate and not searched. It is an amount of work, never a bound on a
 * value, and the report says how many pairs it covered.
 */
export const SEARCH_PAIRS = 24;

/** A pair the booleans settled as sharing no volume, waiting for its clearance. */
interface Pending { a: InterferenceBody; b: InterferenceBody; gap: number; quality: 'exact' | 'approximate'; deflection?: number; start: Separation }
type Settled = InterferencePair | Pending;
const isPending = (x: Settled): x is Pending => 'start' in x;

function separated(p: Pending, s: Separation, searched: boolean): InterferencePair {
	const kind = s.distance <= CONTACT_TOLERANCE_IN ? 'touching' : 'clear';
	/* A clearance nothing certifies is approximate even when the boolean that said "no overlap" was exact; two bodies a real pair of points joins at zero do touch. */
	const quality: InterferencePair['quality'] = p.quality === 'exact' && (s.certified || kind === 'touching') ? 'exact' : 'approximate';
	return { a: p.a.id, b: p.b.id, kind, distance: s.distance, points: s.points, quality, ...(p.deflection !== undefined ? { deflection: p.deflection } : {}), ...(searched ? {} : { searched: false }) };
}

/** One pair through the booleans: an interference, an unknown, or a pair waiting for its clearance. */
function settle(k: InterferenceKernel, a: InterferenceBody, b: InterferenceBody, ba: ArrayLike<number>, bb: ArrayLike<number>): Settled {
	try {
		const gap = boxGap(ba, bb);
		const pending = (quality: 'exact' | 'approximate', deflection?: number): Pending => ({ a, b, gap, quality, ...(deflection !== undefined ? { deflection } : {}), start: kernelDistance(k, a.solid, b.solid, gap) });
		if (gap > CONTACT_TOLERANCE_IN) return pending('exact');
		const exact = k.intersectDetailed(a.solid, b.solid);
		if (exact.status === 'ok') {
			const s = shared(k, exact.value);
			return s ? { a: a.id, b: b.id, kind: 'interference', volume: s.volume, point: s.point, quality: 'exact' } : pending('exact');
		}
		if (exact.category !== 'quality_refused') return { a: a.id, b: b.id, kind: 'unknown', quality: 'exact', message: String((exact.details as { message?: unknown })?.message ?? exact.code) };
		const approx = k.booleanWithQuality('intersect', a.solid, b.solid);
		const s = shared(k, approx.solid), quality: InterferencePair['quality'] = approx.quality === 'exact' ? 'exact' : 'approximate';
		const deflection = quality === 'approximate' ? approx.deflection : undefined;
		return s ? { a: a.id, b: b.id, kind: 'interference', volume: s.volume, point: s.point, quality, ...(deflection !== undefined ? { deflection } : {}) } : pending(quality, deflection);
	} catch (e) {
		return { a: a.id, b: b.id, kind: 'unknown', quality: 'exact', message: message(e) };
	}
}

/** One pair, start to finish, searched. */
export function checkPair(k: InterferenceKernel, a: InterferenceBody, b: InterferenceBody): InterferencePair {
	try {
		const settled = settle(k, a, b, k.boundingBox(a.solid), k.boundingBox(b.solid));
		return isPending(settled) ? separated(settled, minimumDistance(k, a.solid, b.solid, settled.gap, settled.start), true) : settled;
	} catch (e) { return { a: a.id, b: b.id, kind: 'unknown', quality: 'exact', message: message(e) }; }
}

/** Every pair, in body order. The caller wraps this in the engine's `scratch`. */
export function checkInterference(k: InterferenceKernel, bodies: readonly InterferenceBody[], now: () => number = () => performance.now()): InterferenceReport {
	const begin = now(), boxes = new Map<string, ArrayLike<number>>(), settled: Settled[] = [];
	let broadPhase = 0;
	const box = (b: InterferenceBody) => { let v = boxes.get(b.id); if (!v) { v = [...k.boundingBox(b.solid)]; boxes.set(b.id, v); } return v; };
	for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
		const a = bodies[i], b = bodies[j];
		let ba: ArrayLike<number>, bb: ArrayLike<number>;
		try { ba = box(a); bb = box(b); } catch (e) { settled.push({ a: a.id, b: b.id, kind: 'unknown', quality: 'exact', message: message(e) }); continue; }
		if (boxGap(ba, bb) > CONTACT_TOLERANCE_IN) broadPhase++;
		settled.push(settle(k, a, b, ba, bb));
	}
	/* The full search goes to the uncertified clearances nearest first, up to SEARCH_PAIRS of them. */
	const queue = settled.filter((x): x is Pending => isPending(x) && !x.start.certified).sort((x, y) => x.start.distance - y.start.distance);
	const searched = new Set(queue.slice(0, SEARCH_PAIRS));
	const pairs = settled.map((x) => {
		if (!isPending(x)) return x;
		if (x.start.certified) return separated(x, x.start, true);
		if (!searched.has(x)) return separated(x, x.start, false);
		try { return separated(x, minimumDistance(k, x.a.solid, x.b.solid, x.gap, x.start), true); }
		catch (e) { return { a: x.a.id, b: x.b.id, kind: 'unknown', quality: 'exact', message: message(e) } as InterferencePair; }
	});
	return { pairs, bodies: bodies.length, pairsChecked: pairs.length, broadPhase, searched: searched.size, ms: now() - begin };
}

/** Interferences largest first, then touching, then clear pairs nearest first, then unknown. */
export function sortPairs(pairs: readonly InterferencePair[]): InterferencePair[] {
	const rank: Record<PairKind, number> = { interference: 0, touching: 1, clear: 2, unknown: 3 };
	return [...pairs].sort((p, q) => rank[p.kind] - rank[q.kind] || (p.kind === 'interference' ? (q.volume ?? 0) - (p.volume ?? 0) : (p.distance ?? 0) - (q.distance ?? 0)));
}
