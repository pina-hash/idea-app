// tests/ideacad-solid-analysis-kernel.test.ts
//
// THE ANALYSIS PANEL'S NUMBERS AGAINST THE REAL KERNEL. Everything the panel
// shows about mass rests on one reading of `massProperties` -- its units, that
// its tensor is about the body's own center of mass, and the SIGN of its three
// products -- and everything it shows about interference rests on how the
// kernel answers an intersection of two bodies that do, do not, and only just
// touch. A wrong reading of either renders a perfectly plausible number, which
// is exactly the silent regression this suite exists for, so both are pinned
// here on the vendored kernel rather than on a stand-in:
//
//   * an L-shaped body (two boxes fused) read through `tensorAbout` reproduces
//     the kernel's own smallest principal moment about its own principal axis,
//     and the kernel's largest about Z, which is what pins the minus sign on
//     the products; a disk reproduces m r^2 / 2 about its axis;
//   * `checkInterference` on two overlapping boxes returns the exact shared
//     volume (1 in³ for two 2 in cubes offset by 1 in each way) at the shared
//     cube's center; on two separated boxes it returns no interference and the
//     exact 2 in clearance; on two boxes face to face it returns touching;
//     and on a plate crossed by a steel disk it returns the analytic
//     circle-segment volume;
//   * the pin-in-a-hole case the exact pipeline refuses comes back from the
//     approximate path marked approximate, with the clearance still exact;
//   * `solidToSolidDistance` answers the nearest CORNERS when the closest
//     points lie inside a curved face (0.564 in for a disk 0.125 in above a
//     plate), so the clearance search is what gives 0.125, and a motor resting
//     on a plate's edge reads touching; past `SEARCH_PAIRS` a clearance keeps
//     the kernel's answer and says approximate;
//   * the harness's representative model: the closed-form mass properties
//     `sample.ts` writes down equal the kernel's for every primitive, and the
//     canned `SAMPLE_INTERFERENCE` report equals what `checkInterference`
//     really answers on that geometry, pair by pair.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createKernel, type BrepKernel } from '../src/lib/ideacad/kernel/remus';
import { SEARCH_PAIRS, checkInterference, sortPairs, type InterferencePair } from '../src/lib/ideacad/solid/analysis/interference';
import { tensorAbout } from '../src/lib/ideacad/solid/analysis/mass';
import { AXIS_VECTOR, SAMPLE_INTERFERENCE, SAMPLE_PRIMITIVES, primitiveMass, type SamplePrimitive } from '../src/lib/ideacad/solid/analysis/sample';
import type { Vec3 } from '../src/lib/ideacad/solid/types';

const kernels: BrepKernel[] = [];
async function kernel() { const k = await createKernel(new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'))); kernels.push(k); return k; }
afterEach(() => { for (const k of kernels) k.free(); kernels.length = 0; });
const json = <T = Record<string, any>>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
/** Row-major 4x4: rotate local Z onto `axis` (x or y or z), then move. */
function place(k: BrepKernel, solid: number, r: number[][], t: Vec3) { k.transformSolid(solid, new Float64Array([r[0][0], r[0][1], r[0][2], t[0], r[1][0], r[1][1], r[1][2], t[1], r[2][0], r[2][1], r[2][2], t[2], 0, 0, 0, 1])); return solid; }
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const ROTATE: Record<'x' | 'y' | 'z', number[][]> = { x: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], y: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], z: I3 };
const box = (k: BrepKernel, min: Vec3, max: Vec3) => place(k, k.makeBox(max[0] - min[0], max[1] - min[1], max[2] - min[2]), I3, min);
/** The same primitive `sample.ts` describes, built by the kernel. */
function build(k: BrepKernel, p: SamplePrimitive): number {
	if (p.kind === 'box') return box(k, p.min, p.max);
	let solid = k.makeCylinder(p.outer, p.length);
	if (p.inner > 0) solid = k.cut(solid, place(k, k.makeCylinder(p.inner, p.length + 2), I3, [0, 0, -1]));
	const a = AXIS_VECTOR[p.axis], h = p.length / 2;
	return place(k, solid, ROTATE[p.axis], [p.center[0] - a[0] * h, p.center[1] - a[1] * h, p.center[2] - a[2] * h]);
}

describe('massProperties as the analysis panel reads it', () => {
	it('an L of two fused boxes: the products carry a minus sign in the tensor, pinned by the kernel\'s own principal moments', async () => {
		const k = await kernel();
		const L = k.fuse(box(k, [0, 0, 0], [2, 1, 1]), box(k, [0, 1, 0], [1, 3, 1]));
		const p = json<{ volume: number; centerOfMass: number[]; inertia: number[]; principalMoments: number[]; principalAxes: number[] }>(k.massProperties(L));
		expect(p.volume).toBeCloseTo(4, 10);
		expect(p.centerOfMass[0]).toBeCloseTo(0.75, 10); expect(p.centerOfMass[1]).toBeCloseTo(1.25, 10); expect(p.centerOfMass[2]).toBeCloseTo(0.5, 10);
		/* Hand: the product integral of (x - 0.75)(y - 1.25) over the L is -0.75. The kernel reports the PRODUCT, not the tensor entry. */
		expect(p.inertia[3]).toBeCloseTo(-0.75, 10);
		const axes = [0, 1, 2].map((i) => p.principalAxes.slice(i * 3, i * 3 + 3) as Vec3);
		for (let i = 0; i < 3; i++) expect(tensorAbout(p.inertia, axes[i])).toBeCloseTo(p.principalMoments[i], 9);
		/* Positive control: the OTHER sign gives a different, wrong number on the tilted axis, so the assertion above can fail. */
		const flipped = [...p.inertia.slice(0, 3), ...p.inertia.slice(3).map((n) => -n)];
		expect(Math.abs(tensorAbout(flipped, axes[0]) - p.principalMoments[0])).toBeGreaterThan(0.5);
	});
	it('a disk about its own axis is m r^2 / 2 at unit density, and the tensor is about the body\'s center, not the origin', async () => {
		const k = await kernel();
		const disk = place(k, k.makeCylinder(2, 0.25), I3, [10, -4, 3]);
		const p = json<{ volume: number; centerOfMass: number[]; inertia: number[] }>(k.massProperties(disk));
		const v = Math.PI * 4 * 0.25;
		expect(p.volume).toBeCloseTo(v, 9);
		expect(tensorAbout(p.inertia, [0, 0, 1])).toBeCloseTo((v * 4) / 2, 8);
		expect(p.centerOfMass[0]).toBeCloseTo(10, 9);
	});
});

describe('checkInterference on the kernel', () => {
	it('two overlapping boxes share exactly 1 in³ at the shared cube\'s center; separated boxes are clear by exactly 2 in; face to face is touching', async () => {
		const k = await kernel();
		const bodies = [
			{ id: 'a', solid: box(k, [0, 0, 0], [2, 2, 2]) },
			{ id: 'b', solid: box(k, [1, 1, 1], [3, 3, 3]) },
			{ id: 'c', solid: box(k, [5, 0, 0], [6, 1, 1]) },
			{ id: 'd', solid: box(k, [6, 0, 0], [7, 1, 1]) }
		];
		const report = checkInterference(k, bodies);
		expect(report.pairsChecked).toBe(6);
		const pair = (a: string, b: string) => report.pairs.find((p) => p.a === a && p.b === b)!;
		const ab = pair('a', 'b');
		expect(ab.kind).toBe('interference'); expect(ab.quality).toBe('exact');
		expect(ab.volume).toBeCloseTo(1, 10);
		for (const n of ab.point!) expect(n).toBeCloseTo(1.5, 10);
		const cd = pair('c', 'd');
		expect(cd.kind).toBe('touching'); expect(cd.distance).toBeCloseTo(0, 12);
		const bc = pair('b', 'c');
		expect(bc.kind).toBe('clear'); expect(bc.distance).toBeCloseTo(2, 10); expect(bc.volume).toBeUndefined();
		const ac = pair('a', 'c');
		expect(ac.kind).toBe('clear'); expect(ac.distance).toBeCloseTo(3, 10);
		/* Both directions counted: one interference, one touching, four clear, no unknown. */
		expect(report.pairs.filter((p) => p.kind === 'interference')).toHaveLength(1);
		expect(report.pairs.filter((p) => p.kind === 'touching')).toHaveLength(1);
		expect(report.pairs.filter((p) => p.kind === 'clear')).toHaveLength(4);
		expect(report.pairs.filter((p) => p.kind === 'unknown')).toHaveLength(0);
		expect(sortPairs(report.pairs).map((p) => p.kind)).toEqual(['interference', 'touching', 'clear', 'clear', 'clear', 'clear']);
		expect(report.ms).toBeGreaterThanOrEqual(0);
	});
	it('a steel disk dipping into a plate shares the analytic circle-segment volume', async () => {
		const k = await kernel();
		/* Disk r = 2 centered at x = 2, plate ends at x = 3: the part of the circle with x <= 3 is the circle less a segment at distance 1, times the 0.05 in overlap. */
		const plate = box(k, [-3, -2.5, 0], [3, 2.5, 0.25]);
		const disk = place(k, k.makeCylinder(2, 0.25), I3, [2, 0, 0.2]);
		const segment = 4 * Math.acos(0.5) - Math.sqrt(3), expected = (Math.PI * 4 - segment) * 0.05;
		const [pair] = checkInterference(k, [{ id: 'plate', solid: plate }, { id: 'disk', solid: disk }]).pairs;
		expect(pair.kind).toBe('interference'); expect(pair.quality).toBe('exact');
		expect(pair.volume).toBeCloseTo(expected, 8);
	});
	it('a pin in its hole, which the exact pipeline refuses, comes back approximate with an exact clearance, and an oversize pin as an exact interference', async () => {
		const k = await kernel();
		const plate = () => k.cut(box(k, [0, 0, 0], [4, 4, 0.5]), place(k, k.makeCylinder(0.25, 2), I3, [2, 2, -0.5]));
		const pin = (r: number) => place(k, k.makeCylinder(r, 2), I3, [2, 2, -0.5]);
		const [clear] = checkInterference(k, [{ id: 'plate', solid: plate() }, { id: 'pin', solid: pin(0.2) }]).pairs;
		expect(clear.kind).toBe('clear'); expect(clear.quality).toBe('approximate'); expect(clear.deflection).toBeGreaterThan(0);
		expect(clear.distance).toBeCloseTo(0.05, 10);
		const [fit] = checkInterference(k, [{ id: 'plate', solid: plate() }, { id: 'pin', solid: pin(0.25) }]).pairs;
		expect(fit.kind).toBe('touching'); expect(fit.quality).toBe('approximate');
		const [over] = checkInterference(k, [{ id: 'plate', solid: plate() }, { id: 'pin', solid: pin(0.3) }]).pairs;
		expect(over.kind).toBe('interference'); expect(over.quality).toBe('exact');
		expect(over.volume).toBeCloseTo(Math.PI * (0.09 - 0.0625) * 0.5, 9);
	});
});

describe('clearance does not trust solidToSolidDistance alone', () => {
	it('a disk 0.125 in above a plate: the kernel answers the nearest corners, the search answers 0.125, certified by the bounding-box gap', async () => {
		const k = await kernel();
		const plate = box(k, [-3, -2.5, 0.35], [3, 2.5, 0.6]), disk = place(k, k.makeCylinder(2, 0.25), I3, [3.5, 0, 0.725]);
		/* The defect the search exists for, measured: the kernel's own answer is the corner pair, over four times the gap. */
		expect(k.solidToSolidDistance(plate, disk)[0]).toBeGreaterThan(0.5);
		const [pair] = checkInterference(k, [{ id: 'plate', solid: plate }, { id: 'disk', solid: disk }]).pairs;
		expect(pair.kind).toBe('clear'); expect(pair.quality).toBe('exact');
		expect(pair.distance).toBeCloseTo(0.125, 12);
		expect(pair.points![1][2] - pair.points![0][2]).toBeCloseTo(0.125, 12);
	});
	it('a motor resting on a plate\'s edge touches, at the one point no corner sits on', async () => {
		const k = await kernel();
		const plate = box(k, [-3, -2.5, 0.35], [3, 2.5, 0.6]), motor = place(k, k.makeCylinder(0.5, 0.45), I3, [3.5, 0, 0.35]);
		expect(k.solidToSolidDistance(plate, motor)[0]).toBeGreaterThan(0.1);
		const [pair] = checkInterference(k, [{ id: 'plate', solid: plate }, { id: 'motor', solid: motor }]).pairs;
		expect(pair.kind).toBe('touching');
		expect(pair.distance!).toBeLessThan(1e-9);
	});
	it('past SEARCH_PAIRS uncertified clearances, the rest keep the kernel\'s answer and say approximate and unsearched', async () => {
		const k = await kernel();
		const bodies = [0, 12, 24].flatMap((dx, c) => SAMPLE_PRIMITIVES.map((p) => { const solid = build(k, p); place(k, solid, I3, [dx, 0, 0]); return { id: `${p.id}/${c}`, solid }; }));
		const report = checkInterference(k, bodies);
		expect(report.pairsChecked).toBe(153);
		expect(report.searched).toBe(SEARCH_PAIRS);
		const unsearched = report.pairs.filter((p) => p.searched === false);
		expect(unsearched.length).toBeGreaterThan(0);
		for (const p of unsearched) { expect(p.quality).toBe('approximate'); expect(p.kind).toBe('clear'); }
		/* Positive control: every copy's own near pairs were searched and read as in the single model. */
		for (const c of [0, 1, 2]) expect(report.pairs.find((p) => p.a === `chassis#0/${c}` && p.b === `disk#0/${c}`)).toMatchObject({ kind: 'clear', quality: 'exact', distance: 0.125 });
		expect(report.pairs.filter((p) => p.kind === 'interference')).toHaveLength(3);
	});
});

describe('the harness\'s representative model is the kernel\'s', () => {
	it('every primitive\'s closed-form volume, center and tensor equal massProperties', async () => {
		const k = await kernel();
		expect(SAMPLE_PRIMITIVES).toHaveLength(6);
		for (const p of SAMPLE_PRIMITIVES) {
			const got = json<{ volume: number; centerOfMass: number[]; inertia: number[] }>(k.massProperties(build(k, p))), want = primitiveMass(p);
			expect(got.volume, p.id).toBeCloseTo(want.volume, 8);
			for (let d = 0; d < 3; d++) expect(got.centerOfMass[d], `${p.id} center ${d}`).toBeCloseTo(want.centerOfMass[d], 8);
			for (let i = 0; i < 6; i++) expect(got.inertia[i], `${p.id} inertia ${i}`).toBeCloseTo(want.inertia[i], 7);
		}
	});
	it('SAMPLE_INTERFERENCE is what checkInterference answers for that geometry, pair by pair', async () => {
		const k = await kernel();
		const report = checkInterference(k, SAMPLE_PRIMITIVES.map((p) => ({ id: p.id, solid: build(k, p) })));
		const shape = (p: InterferencePair) => ({ a: p.a, b: p.b, kind: p.kind, quality: p.quality, volume: p.volume === undefined ? undefined : Number(p.volume.toFixed(6)), distance: p.distance === undefined ? undefined : Number(p.distance.toFixed(6)) });
		expect(report.pairs.map(shape)).toEqual(SAMPLE_INTERFERENCE.pairs.map(shape));
		expect(report.pairsChecked).toBe(SAMPLE_INTERFERENCE.pairsChecked);
		expect(report.broadPhase).toBe(SAMPLE_INTERFERENCE.broadPhase);
		expect(report.searched).toBe(SAMPLE_INTERFERENCE.searched);
		/* The points the harness draws are the kernel's, to the four places the list keeps. */
		for (const [i, p] of report.pairs.entries()) {
			const want = SAMPLE_INTERFERENCE.pairs[i];
			for (const [got, exp] of [[p.point, want.point], ...(p.points ?? []).map((q, j) => [q, want.points?.[j]])] as [Vec3 | undefined, Vec3 | undefined][]) if (got || exp) for (let d = 0; d < 3; d++) expect(got![d], `${p.a} ${p.b}`).toBeCloseTo(exp![d], 3);
		}
	});
});
