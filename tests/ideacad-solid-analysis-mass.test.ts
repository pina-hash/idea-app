// tests/ideacad-solid-analysis-mass.test.ts
//
// MASS, BALANCE AND INERTIA, against hand-computed cases. A wrong center of
// gravity, a tip angle about the wrong edge, or an inertia missing its
// parallel-axis term all render a perfectly plausible number, and nothing on
// screen says so -- which is the regression this file exists for. Every
// expected value below is written from the physics (a box's m (a^2 + b^2) / 12,
// a disk's m (R^2 + r^2) / 2, atan(d / h) over a footprint drawn by hand), with
// the MatWeb densities `advisory.ts` cites typed in as numbers, never read back
// from the module under test.
//
// And the density rule, both directions: a body with a cited density gives a
// mass, a center and an inertia; a printed part with a measured mass gives a
// mass and NO center; a body with no material or an unverified grade gives
// neither, and each is named with its reason.
import { describe, expect, it } from 'vitest';
import { BLOCKER_WORDS, G_PER_LB, KG_M2_PER_G_IN2, inertiaAbout, massReport, massRows, radiusAbout, tensorAbout, toKgM2, toLbIn2 } from '../src/lib/ideacad/solid/analysis/mass';
import { convexHull, groundPoints, tipOver, tipReport, towardWord } from '../src/lib/ideacad/solid/analysis/balance';
import { axisChoices, axisFromSelection, defaultAxisChoice, resolveAxis, selectedBodyIds } from '../src/lib/ideacad/solid/analysis/axes';
import * as fmt from '../src/lib/ideacad/solid/analysis/format';
import { primitiveBody, sampleModel, type SamplePrimitive } from '../src/lib/ideacad/solid/analysis/sample';
import type { Vec3 } from '../src/lib/ideacad/solid/types';

/** cm³ per in³, and the four cited densities in g/cm³, typed from the MatWeb records `advisory.ts` links. */
const CM3 = 16.387064, ALUMINUM = 2.7, STEEL = 7.87, POLYCARBONATE = 1.2;
const box = (id: string, min: Vec3, max: Vec3): SamplePrimitive => ({ id, name: id, kind: 'box', min, max });

describe('mass and center of gravity', () => {
	it('an aluminum box: mass from its volume and cited density, CG at its center, height half its thickness', () => {
		const b = primitiveBody(box('plate#0', [0, 0, 0], [4, 2, 1]), { materialId: 'aluminum-6061-t6' });
		const r = massReport({ bodies: [b] });
		const m = 8 * CM3 * ALUMINUM;
		expect(r.totalG).toBeCloseTo(m, 9);
		expect(r.cg).toEqual([2, 1, 0.5]);
		expect(r.groundZ).toBe(0);
		expect(r.cgHeight).toBeCloseTo(0.5, 12);
		expect(r.blockers).toEqual([]);
		expect(r.rows[0].share).toBe(1);
	});
	it('two boxes of different metals: the CG is the mass-weighted mean, the rows run heaviest first', () => {
		const a = primitiveBody(box('al#0', [0, 0, 0], [1, 1, 1]), { materialId: 'aluminum-6061-t6' });
		const b = primitiveBody(box('st#0', [3, 0, 0], [4, 1, 1]), { materialId: 'steel-1018' });
		const r = massReport({ bodies: [a, b] });
		const ma = CM3 * ALUMINUM, mb = CM3 * STEEL;
		expect(r.totalG).toBeCloseTo(ma + mb, 9);
		expect(r.cg![0]).toBeCloseTo((0.5 * ma + 3.5 * mb) / (ma + mb), 12);
		expect(r.cg![1]).toBeCloseTo(0.5, 12);
		expect(r.rows.map((x) => x.id)).toEqual(['st#0', 'al#0']);
		expect(r.rows[0].share! + r.rows[1].share!).toBeCloseTo(1, 12);
	});
	it('the density rule, both directions: measured mass gives a total and no CG; no material and an unverified grade give neither, each named', () => {
		const r = massReport(sampleModel('printed'));
		expect(r.totalG).toBeNull();
		expect(r.missing.map((x) => x.id)).toEqual(['motor#0']);
		expect(r.cg).toBeNull(); expect(r.cgHeight).toBeNull();
		expect(r.blockers.map((x) => [x.id, x.blocker])).toEqual([['wheel-l#0', 'measured'], ['wheel-r#0', 'measured'], ['motor#0', 'no-material']]);
		/* Positive control on the same fixture: the bodies with a cited density are not blockers and carry their mass. */
		const known = r.rows.filter((x) => x.distributed).map((x) => x.id).sort();
		expect(known).toEqual(['chassis#0', 'disk#0', 'skid#0']);
		expect(r.rows.find((x) => x.id === 'wheel-l#0')!.grams).toBe(18);
		expect(r.rows.at(-1)!.id).toBe('motor#0');
		const unverified = massRows([primitiveBody(box('x#0', [0, 0, 0], [1, 1, 1]), { materialId: 'carbon-steel' })])[0];
		expect(unverified.blocker).toBe('unverified'); expect(unverified.grams).toBeNull();
		const printed = massRows([primitiveBody(box('p#0', [0, 0, 0], [1, 1, 1]), { materialId: 'printed-pla' })])[0];
		expect(printed.blocker).toBe('printed');
		for (const k of ['no-material', 'unverified', 'printed', 'measured'] as const) expect(BLOCKER_WORDS[k].length).toBeGreaterThan(3);
	});
	it('the whole cited robot: total and CG from the six volumes typed by hand', () => {
		const r = massReport(sampleModel('cited'));
		const parts: [number, number, Vec3][] = [
			[6 * 5 * 0.25, ALUMINUM, [0, 0, 0.475]],
			[Math.PI * (4 - 0.0625) * 0.25, STEEL, [3.5, 0, 0.85]],
			[Math.PI * 0.5625 * 0.5, POLYCARBONATE, [-1, 2.85, 0.75]],
			[Math.PI * 0.5625 * 0.5, POLYCARBONATE, [-1, -2.85, 0.75]],
			[Math.PI * 0.25 * 0.45, STEEL, [3.5, 0, 0.575]],
			[0.5 * 2 * 0.35, POLYCARBONATE, [2.75, 0, 0.175]]
		];
		const total = parts.reduce((s, [v, d]) => s + v * CM3 * d, 0);
		expect(r.totalG).toBeCloseTo(total, 8);
		for (let d = 0; d < 3; d++) expect(r.cg![d]).toBeCloseTo(parts.reduce((s, [v, rho, c]) => s + v * CM3 * rho * c[d], 0) / total, 10);
		expect(r.rows[0].id).toBe('disk#0');
	});
});

describe('tip-over', () => {
	it('a 4 x 2 x 1 box tips first about a long edge, at atan(1 / 0.5), and at atan(2 / 0.5) about a short one', () => {
		const b = primitiveBody(box('plate#0', [0, 0, 0], [4, 2, 1]), { materialId: 'aluminum-6061-t6' });
		const r = massReport({ bodies: [b] }), t = tipReport([b], r.cg!, r.groundZ!)!;
		expect(t.footprint).toBe('area'); expect(t.stands).toBe(true);
		expect(t.hull).toHaveLength(4); expect(t.edges).toHaveLength(4);
		expect(t.least!.angleDeg).toBeCloseTo((Math.atan(1 / 0.5) * 180) / Math.PI, 10);
		expect(['-Y', '+Y']).toContain(t.least!.toward);
		const angles = t.edges.map((e) => e.angleDeg).sort((a, b) => a - b);
		expect(angles[3]).toBeCloseTo((Math.atan(2 / 0.5) * 180) / Math.PI, 10);
	});
	it('a CG outside the footprint is already tipping, past that edge', () => {
		const t = tipOver([5, 1, 0.5], convexHull([[0, 0], [4, 0], [4, 2], [0, 2]]), 0);
		expect(t.stands).toBe(false);
		expect(t.least!.angleDeg).toBeLessThan(0);
		expect(t.least!.toward).toBe('+X');
		expect(t.least!.inside).toBeCloseTo(-1, 12);
	});
	it('two wheels on one axle rest on a line, and a lone contact rests on a point: no area, no angle', () => {
		const m = sampleModel('cited'), wheels = m.bodies.filter((b) => b.id.startsWith('wheel'));
		const points = groundPoints(wheels, 0)!;
		/* Both directions: the contact row of each rim is in, and the next row up the curve (5 degrees round, 0.0029 in higher) is out. */
		expect(points.length).toBe(4);
		for (const p of points) expect(p[0]).toBeCloseTo(-1, 6);
		expect(tipOver([-1, 0, 0.75], convexHull(points), 0).footprint).toBe('line');
		expect(tipOver([0, 0, 1], convexHull([[0, 0]]), 0).footprint).toBe('point');
	});
	it('the cited robot tips first over its front skid edge, toward +X, at atan((3 - CG x) / CG z)', () => {
		const m = sampleModel('cited'), r = massReport(m), t = tipReport(m.bodies, r.cg!, r.groundZ!)!;
		/* Hand: the footprint is the two wheel contacts at x = -1 (y = +-2.6, +-3.1) and the skid's pad (x 2.5 to 3, y -1 to 1). */
		expect(t.hull.map(([x, y]) => [Number(x.toFixed(6)), Number(y.toFixed(6))])).toEqual([[-1, -3.1], [3, -1], [3, 1], [-1, 3.1]]);
		expect(t.least!.toward).toBe('+X');
		expect(t.least!.angleDeg).toBeCloseTo((Math.atan2(3 - r.cg![0], r.cg![2]) * 180) / Math.PI, 8);
		expect(towardWord([-0.7, -0.7])).toBe('-X -Y');
	});
});

describe('inertia about an axis', () => {
	const plate = () => primitiveBody(box('plate#0', [0, 0, 0], [4, 2, 1]), { materialId: 'aluminum-6061-t6' });
	it('a box about Z through its CG is m (a^2 + b^2) / 12, and about the world Z axis adds m d^2', () => {
		const m = 8 * CM3 * ALUMINUM, own = (m * (16 + 4)) / 12;
		expect(inertiaAbout([plate()], { origin: [2, 1, 0], direction: [0, 0, 1] }).gIn2).toBeCloseTo(own, 8);
		expect(inertiaAbout([plate()], { origin: [0, 0, 0], direction: [0, 0, 5] }).gIn2).toBeCloseTo(own + m * 5, 8);
		/* About X through the CG: m (b^2 + c^2) / 12. */
		expect(inertiaAbout([plate()], { origin: [2, 1, 0.5], direction: [1, 0, 0] }).gIn2).toBeCloseTo((m * (4 + 1)) / 12, 8);
	});
	it('two cubes about a vertical line between them: each m/6 plus m 1.5^2', () => {
		const a = primitiveBody(box('al#0', [0, 0, 0], [1, 1, 1]), { materialId: 'aluminum-6061-t6' }), b = primitiveBody(box('st#0', [3, 0, 0], [4, 1, 1]), { materialId: 'steel-1018' });
		const ma = CM3 * ALUMINUM, mb = CM3 * STEEL;
		const got = inertiaAbout([a, b], { origin: [2, 0.5, 0], direction: [0, 0, 1] });
		expect(got.gIn2).toBeCloseTo((ma + mb) * (1 / 6 + 2.25), 8);
		expect(got.terms.map((t) => t.distance)).toEqual([1.5, 1.5]);
	});
	it('the weapon disk about its own bore: m (R^2 + r^2) / 2, from the axis a selected bore face names', () => {
		const m = sampleModel('cited'), disk = m.bodies.find((b) => b.id === 'disk#0')!;
		const found = axisFromSelection(m, { bodyId: 'disk#0', kind: 'face', id: 'disk.bore' })!;
		expect(found.label).toBe('Weapon disk round face');
		const mass = Math.PI * (4 - 0.0625) * 0.25 * CM3 * STEEL;
		expect(inertiaAbout([disk], found.axis).gIn2).toBeCloseTo((mass * (4 + 0.0625)) / 2, 7);
		expect(radiusAbout([disk], found.axis)).toBeCloseTo(2, 5);
	});
	it('a tilted axis reads the products with a minus sign: an L of two boxes about its own diagonal', () => {
		/* Unit-density products for a thin symmetric pair: n^T J n with J = [[1, -p], [-p, 1]] as the tensor is 1 - 2p n_x n_y; the kernel test pins the same sign on the real kernel. */
		expect(tensorAbout([1, 1, 0, 0.5, 0, 0], [Math.SQRT1_2, Math.SQRT1_2, 0])).toBeCloseTo(0.5, 12);
		expect(tensorAbout([1, 1, 0, 0.5, 0, 0], [Math.SQRT1_2, -Math.SQRT1_2, 0])).toBeCloseTo(1.5, 12);
	});
	it('unknown, with the blocking bodies, when any body in the subject has no cited density', () => {
		const m = sampleModel('printed');
		const got = inertiaAbout(m.bodies, { origin: [0, 0, 0], direction: [0, 0, 1] });
		expect(got.gIn2).toBeNull();
		expect(got.blockers.map((b) => b.id)).toEqual(['wheel-l#0', 'wheel-r#0', 'motor#0']);
		/* The disk alone is fully cited, so selecting it still reads. */
		expect(inertiaAbout(m.bodies.filter((b) => b.id === 'disk#0'), { origin: [3.5, 0, 0], direction: [0, 0, 1] }).gIn2).not.toBeNull();
	});
	it('units: 1 lb·in² is 453.59237 g·in², and 1 g·in² is 6.4516e-7 kg·m²', () => {
		expect(toLbIn2(G_PER_LB)).toBeCloseTo(1, 12);
		expect(KG_M2_PER_G_IN2).toBeCloseTo(6.4516e-7, 18);
		expect(toKgM2(1e6)).toBeCloseTo(0.64516, 12);
	});
});

describe('axes and subjects the selection implies', () => {
	it('a selected bore is offered first and is the default; with nothing selected the default is Z through the CG', () => {
		const m = sampleModel('cited');
		const picked = axisChoices(m, [{ bodyId: 'disk#0', kind: 'face', id: 'disk.bore' }]);
		expect(picked[0]).toMatchObject({ id: 'sel:disk#0/face/disk.bore', label: 'Weapon disk round face' });
		expect(defaultAxisChoice(picked)).toBe('sel:disk#0/face/disk.bore');
		const none = axisChoices(m, []);
		expect(defaultAxisChoice(none)).toBe('cg-z');
		expect(none.map((c) => c.id)).toEqual(['cg-x', 'cg-y', 'cg-z', 'world-x', 'world-y', 'world-z', 'ref:axis1']);
		expect(resolveAxis(none[2], [1, 2, 3])).toEqual({ origin: [1, 2, 3], direction: [0, 0, 1] });
		expect(resolveAxis(none[2], null)).toBeNull();
		/* A flat or a missing face names no axis, and neither does a datum plane; a datum axis is the world axis. */
		expect(axisFromSelection(m, { bodyId: 'chassis#0', kind: 'face', id: 'nope' })).toBeNull();
		expect(axisFromSelection(m, { bodyId: '', kind: 'reference', id: 'datum:XY' })).toBeNull();
		expect(axisFromSelection(m, { bodyId: '', kind: 'reference', id: 'datum:Y' })).toEqual({ label: 'Y axis', axis: { origin: [0, 0, 0], direction: [0, 1, 0] } });
		expect(axisFromSelection(m, { bodyId: '', kind: 'reference', id: 'axis1' })).toMatchObject({ label: 'Weapon axis' });
	});
	it('a selection on a body names that body; a reference names none', () => {
		const m = sampleModel('cited');
		expect(selectedBodyIds(m, [{ bodyId: 'disk#0', kind: 'face', id: 'disk.bore' }, { bodyId: '', kind: 'reference', id: 'axis1' }])).toEqual(['disk#0']);
		expect(selectedBodyIds(m, [])).toEqual([]);
	});
});

describe('how a number is written', () => {
	it('three significant figures, grouped, never an exponent, and a word for what arithmetic cannot give', () => {
		expect(fmt.sig(0.000234)).toBe('0.000234');
		expect(fmt.sig(12.345)).toBe('12.3');
		expect(fmt.sig(1.30058)).toBe('1.30');
		expect(fmt.sig(4567.8)).toBe('4,568');
		expect(fmt.sig(Infinity)).toBe('Undefined');
		expect(fmt.sig(NaN)).toBe('Undefined');
		expect(fmt.grams(353.96)).toBe('354 g');
		expect(fmt.pounds(453.59237)).toBe('1.00 lb');
		expect(fmt.length(0.1)).toBe('0.100 in');
		expect(fmt.length(0.1, 'mm')).toBe('2.54 mm');
		expect(fmt.degrees(63.4349)).toBe('63.4°');
		expect(fmt.percent(0.5)).toBe('50%');
		expect(fmt.point([1, 2, 3])).toBe('1.000, 2.000, 3.000');
	});
});
