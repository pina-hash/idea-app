/**
 * The generated sweep the pan/zoom arithmetic is characterized by.
 *
 * THIS FILE IS THE SHARED CASE GENERATOR, and that is the point: the golden
 * outputs in `tests/fixtures/panzoom-golden.json` were produced by running these
 * exact cases against the arithmetic AS IT STOOD INSIDE
 * `src/lib/gauntlet/DrawingViewer.svelte`, BEFORE any of it moved to
 * `$lib/panzoom`. The generation was mechanical -- a script pulled the literal
 * expression and statement text out of the .svelte source with regexes and
 * spliced it into a runnable module, so the baseline is the shipped code rather
 * than a retyping of it. `tests/panzoom-transform.test.ts` then replays the same
 * cases through the extracted module and requires every value to match.
 *
 * A sweep written after a move only proves the new code agrees with itself.
 * These numbers predate the move.
 *
 * Deliberately NOT hand-picked: the geometry is a full cross product of stage
 * sizes against content sizes, and it carries the degenerate rows on purpose --
 * a zero stage, a zero content, content SMALLER than the stage, content exactly
 * one pixel wider than the stage, aspect ratios nothing like the stage's, and
 * scales sitting exactly on each clamp bound. A browser sweep reaches the
 * layouts somebody thought to build; this reaches the ones nobody did.
 */

export interface SweepCase {
	/** Stage box (CSS px). */
	W: number;
	H: number;
	/** Intrinsic content box (world units). */
	cw: number;
	ch: number;
	/** Starting view transform. */
	s: number;
	tx: number;
	ty: number;
	op: 'sFit' | 'maxS' | 'clampScale' | 'clampPan' | 'fit' | 'zoom' | 'pan' | 'resize';
	/** Args: clampScale(a) | zoom(a=factor, b=px, c=py) | pan(a=dx, b=dy) | resize(a=W, b=H). */
	a?: number;
	b?: number;
	c?: number;
}

/** Stage boxes, including a zero stage, a 1px stage, and both phone widths. */
const STAGES: [number, number][] = [
	[0, 0],
	[1, 1],
	[375, 600],
	[375, 812],
	[1440, 900],
	[1280, 720],
	[800, 600],
	[320, 240],
	[1920, 1080],
	[600, 600],
	[2000, 300],
	[300, 2000],
	[100, 100]
];

/**
 * Content boxes. Rows 9 and 10 are content ONE PIXEL wider / taller than the
 * 375px stage -- the boundary where `ow <= W` flips and the pan clamp changes
 * branch. Rows 6 and 7 are aspect ratios far from any stage's. Rows 8, 12 and
 * 13 are content SMALLER than most stages, which centres instead of edge-locks.
 */
const CONTENTS: [number, number][] = [
	[0, 0],
	[1, 1],
	[1000, 750],
	[792, 612],
	[612, 792],
	[10000, 200],
	[200, 10000],
	[100, 100],
	[376, 600],
	[375, 601],
	[3000, 2000],
	[50, 40],
	[1000, 1000]
];

/** The component's own fit margin, mirrored here so the states land on the bounds. */
const FIT = 0.92;

function fitOf(W: number, H: number, cw: number, ch: number): number {
	const ready = cw > 0 && ch > 0;
	return W && H && ready ? Math.min(W / cw, H / ch) * FIT : 1;
}

export function sweepCases(): SweepCase[] {
	const out: SweepCase[] = [];
	for (const [W, H] of STAGES) {
		for (const [cw, ch] of CONTENTS) {
			const sFit = fitOf(W, H, cw, ch);
			const maxS = Math.max(sFit * 8, 3);
			const base = { W, H, cw, ch };

			// Scalars and the fit transform.
			out.push({ ...base, s: 1, tx: 0, ty: 0, op: 'sFit' });
			out.push({ ...base, s: 1, tx: 0, ty: 0, op: 'maxS' });
			out.push({ ...base, s: 1, tx: 0, ty: 0, op: 'fit' });

			// clampScale probed EXACTLY on each bound and immediately either side.
			for (const v of [sFit, sFit - 1e-9, sFit * 0.5, maxS, maxS + 1e-9, maxS * 2, 3, 1, 0, -5]) {
				out.push({ ...base, s: 1, tx: 0, ty: 0, op: 'clampScale', a: v });
			}

			// View states: sitting on the fit bound, mid-range, on the max bound,
			// and one deliberately outside both, each with a real pan offset.
			const states: [number, number, number][] = [
				[sFit, (W - cw * sFit) / 2, (H - ch * sFit) / 2],
				[sFit * 2, -cw * sFit, -ch * sFit * 0.25],
				[maxS, -cw * maxS + W, -ch * maxS + H],
				[maxS * 3, 12345, -6789]
			];
			// The pan clamp gets four more states. Two start far outside every
			// bound; the other two sit at the scale where the content fills the
			// stage EXACTLY on one axis -- the equality boundary where the clamp
			// changes branch, which the 0.92 fit margin means no fitted view ever
			// lands on, so nothing else in this sweep would reach it.
			const panStates: [number, number, number][] = [
				...states,
				[sFit, -99999, 99999],
				[maxS, 1e6, -1e6],
				[cw > 0 ? W / cw : 1, -50, -50],
				[ch > 0 ? H / ch : 1, -50, -50]
			];
			for (const [s, tx, ty] of panStates) {
				out.push({ ...base, s, tx, ty, op: 'clampPan' });
			}

			// Zoom anchored at each stage corner and at the EXACT centre.
			const anchors: [number, number][] = [
				[0, 0],
				[W, 0],
				[0, H],
				[W, H],
				[W / 2, H / 2]
			];
			const opStates: [number, number, number][] = [
				...states,
				[cw > 0 ? W / cw : 1, -50, -50],
				[ch > 0 ? H / ch : 1, -50, -50]
			];
			for (const [s, tx, ty] of opStates) {
				for (const f of [1.4, 1 / 1.4, 1, Math.exp(-100 * 0.0015)]) {
					for (const [px, py] of anchors) {
						out.push({ ...base, s, tx, ty, op: 'zoom', a: f, b: px, c: py });
					}
				}
				for (const [dx, dy] of [
					[0, 0],
					[40, 40],
					[-40, -40],
					[9999, 0],
					[0, -9999]
				]) {
					out.push({ ...base, s, tx, ty, op: 'pan', a: dx, b: dy });
				}
				for (const [nw, nh] of [
					[W, H],
					[375, 600],
					[1440, 900],
					[0, 0]
				]) {
					out.push({ ...base, s, tx, ty, op: 'resize', a: nw, b: nh });
				}
			}
		}
	}
	return out;
}

/**
 * Numbers are recorded as STRINGS: `String(v)` round-trips a double exactly and,
 * unlike JSON's number type, it survives NaN and +/-Infinity -- both of which
 * this sweep genuinely produces (a zero content box divides by zero).
 */
export function encode(v: unknown): string {
	if (v && typeof v === 'object') {
		return Object.entries(v as Record<string, number>)
			.map(([k, val]) => `${k}=${String(val)}`)
			.join(' ');
	}
	return String(v);
}
