// tests/ideacad-solid-mates-solver.test.ts
//
// THE MATE SOLVER WITHOUT A KERNEL. Two boxes are described by the frames of
// their faces, exactly what `features/mate.ts` reads off the kernel, and every
// expected transform is the analytic answer for those boxes -- a translation
// of 1 in to close a gap, a 180-degree turn to oppose two normals, a 0.25 in
// gap -- never a number read off the solver and typed back in.
//
// What is pinned: which body moves (a fixed body never, the first-named body
// stays), sequential solving within the freedom earlier mates leave, the
// degrees of freedom and their names, and the three over-constraint sentences
// naming the mates involved -- with the body put back where it was.
import { describe, expect, it } from 'vitest';
import { solveAssembly, chooseMover, MATE_TOLERANCE, freedomFromProjection, type AssemblyMate, type AssemblyBody, type MateSide } from '../src/lib/ideacad/solid/mates/solve';
import { axisFrame, planeFrame, pointFrame, transformFrame, type EntityFrame } from '../src/lib/ideacad/solid/mates/frames';
import { residual, orientationSign, residualReport } from '../src/lib/ideacad/solid/mates/constraints';
import { describeFreedom, freedomOf } from '../src/lib/ideacad/solid/mates/freedom';
import { applyMatrix, applyDirection, multiply, twistMatrix, IDENTITY } from '../src/lib/ideacad/solid/mates/rigid';
import { nullSpace, rowRank } from '../src/lib/ideacad/solid/mates/linalg';
import type { MateKind, ModelProjection, Vec3 } from '../src/lib/ideacad/solid/types';

/* Box A: 4 x 3 x 1 at the origin. Box B: 2 x 2 x 1 at x = 6..8. Faces are named by the side they face. */
const A: AssemblyBody = { id: 'A', name: 'Base', center: [2, 1.5, 0.5] };
const B: AssemblyBody = { id: 'B', name: 'Bracket', center: [7, 1, 0.5] };
const C: AssemblyBody = { id: 'C', name: 'Cap', center: [7, 1, 2.5] };
const F = {
	aTop: planeFrame([2, 1.5, 1], [0, 0, 1]), aBottom: planeFrame([2, 1.5, 0], [0, 0, -1]), aPlusX: planeFrame([4, 1.5, 0.5], [1, 0, 0]), aMinusY: planeFrame([2, 0, 0.5], [0, -1, 0]), aPlusY: planeFrame([2, 3, 0.5], [0, 1, 0]),
	bTop: planeFrame([7, 1, 1], [0, 0, 1]), bBottom: planeFrame([7, 1, 0], [0, 0, -1]), bMinusX: planeFrame([6, 1, 0.5], [-1, 0, 0]), bPlusX: planeFrame([8, 1, 0.5], [1, 0, 0]), bMinusY: planeFrame([7, 0, 0.5], [0, -1, 0]),
	cBottom: planeFrame([7, 1, 2], [0, 0, -1]),
	aHole: axisFrame([2, 1.5, 0], [0, 0, 1], 0.25), bPin: axisFrame([7, 1, 0.5], [1, 0, 0], 0.25),
	aCorner: pointFrame([0, 0, 1]), bCorner: pointFrame([6, 0, 0])
};
const side = (body: string | null, frame: EntityFrame): MateSide => ({ body, frame });
let n = 0;
const mate = (kind: MateKind, a: MateSide, b: MateSide, extra: Partial<AssemblyMate> = {}): AssemblyMate => { n++; return { feature: `m${n}`, name: `Mate ${n}`, kind, a, b, ...extra }; };
const solve = (mates: AssemblyMate[], bodies: AssemblyBody[] = [A, B]) => { n = 0; return solveAssembly({ bodies, mates }); };
const moved = (r: ReturnType<typeof solveAssembly>, id: string, frame: EntityFrame) => transformFrame(frame, r.transforms.get(id) ?? [...IDENTITY]);
const origin = (f: EntityFrame): Vec3 => (f.kind === 'point' ? f.point : f.origin);
const direction = (f: EntityFrame): Vec3 => (f.kind === 'plane' ? f.normal : f.kind === 'axis' ? f.direction : [0, 0, 0]);
const gap = (r: ReturnType<typeof solveAssembly>, a: EntityFrame, bId: string, b: EntityFrame) => { const wb = moved(r, bId, b); const d = origin(wb), n = direction(a); return (d[0] - origin(a)[0]) * n[0] + (d[1] - origin(a)[1]) * n[1] + (d[2] - origin(a)[2]) * n[2]; };

describe('one mate moves one body', () => {
	it('coincident: the bracket rises 1 in onto the base, the base stays, and the gap is inside 1e-9', () => {
		const m = mate('coincident', side('A', F.aTop), side('B', F.bBottom));
		const r = solve([m]);
		expect(r.errors).toEqual([]);
		expect(r.moved).toEqual(['B']);
		expect(r.transforms.has('A')).toBe(false);
		const bottom = moved(r, 'B', F.bBottom);
		expect(Math.abs(gap(r, F.aTop, 'B', F.bBottom))).toBeLessThanOrEqual(1e-9);
		expect(bottom.kind === 'plane' && bottom.normal[2]).toBeCloseTo(-1, 12);
		/* A pure lift: x and y untouched. */
		expect(origin(bottom)[0]).toBeCloseTo(7, 12); expect(origin(bottom)[1]).toBeCloseTo(1, 12); expect(origin(bottom)[2]).toBeCloseTo(1, 12);
		expect(r.residuals.get('m1')).toBeLessThanOrEqual(1e-9); expect(r.units.get('m1')).toBe('in');
		expect(r.dof.get('B')).toBe(3); expect(r.dof.get('A')).toBe(6);
		expect(r.freedom.get('B')).toMatchObject({ dof: 3, translations: 2, slides: ['X', 'Y'], turns: ['Z'] });
		expect(describeFreedom('Bracket', r.freedom.get('B'))).toBe('Bracket: 3 degrees of freedom left, slides along X and Y, turns about Z.');
		expect(describeFreedom('Base', r.freedom.get('A'))).toBe('Base: nothing holds it; the other bodies are placed against it.');
		console.log(`solver ms per mate: ${[...r.ms].map(([k, v]) => `${k}=${v.toFixed(3)}`).join(' ')}`);
	});
	it('coincident on two faces that point the same way turns the bracket over (the 180-degree kick)', () => {
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bTop))]);
		expect(r.errors).toEqual([]);
		const top = moved(r, 'B', F.bTop);
		expect(direction(top)[2]).toBeCloseTo(-1, 9);
		expect(Math.abs(gap(r, F.aTop, 'B', F.bTop))).toBeLessThanOrEqual(1e-9);
		/* The bracket is now upside down above the base: its bottom face points up, above z = 1. */
		const bottom = moved(r, 'B', F.bBottom);
		expect(direction(bottom)[2]).toBeCloseTo(1, 9); expect(origin(bottom)[2]).toBeCloseTo(2, 9);
	});
	it('flip keeps the normals aligned instead: the bracket stacks the same way up, with its top on the base top', () => {
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bTop), { flip: true })]);
		expect(r.errors).toEqual([]);
		const top = moved(r, 'B', F.bTop);
		expect(direction(top)[2]).toBeCloseTo(1, 9); expect(origin(top)[2]).toBeCloseTo(1, 9);
	});
	it('distance 0.25 leaves a 0.25 in gap, and a negative value pulls the face through', () => {
		const r = solve([mate('distance', side('A', F.aTop), side('B', F.bBottom), { value: 0.25 })]);
		expect(r.errors).toEqual([]);
		expect(gap(r, F.aTop, 'B', F.bBottom)).toBeCloseTo(0.25, 9);
		expect(r.residuals.get('m1')).toBeLessThanOrEqual(1e-9);
		const inside = solve([mate('distance', side('A', F.aTop), side('B', F.bBottom), { value: -0.5 })]);
		expect(gap(inside, F.aTop, 'B', F.bBottom)).toBeCloseTo(-0.5, 9);
	});
	it('concentric turns the pin onto the hole axis: axes parallel, 0 in apart, 2 degrees of freedom (slides along Z, turns about Z)', () => {
		const r = solve([mate('concentric', side('A', F.aHole), side('B', F.bPin))]);
		expect(r.errors).toEqual([]);
		const pin = moved(r, 'B', F.bPin);
		expect(Math.abs(direction(pin)[2])).toBeCloseTo(1, 9);
		const o = origin(pin); expect(Math.hypot(o[0] - 2, o[1] - 1.5)).toBeLessThanOrEqual(1e-9);
		expect(r.freedom.get('B')).toMatchObject({ dof: 2, translations: 1, slides: ['Z'], turns: ['Z'] });
		expect(describeFreedom('Bracket', r.freedom.get('B'))).toBe('Bracket: 2 degrees of freedom left, slides along Z, turns about Z.');
	});
	it('parallel, perpendicular and angle: the right number of degrees of freedom and the angle asked for', () => {
		const parallel = solve([mate('parallel', side('A', F.aTop), side('B', F.bTop))]);
		expect(parallel.errors).toEqual([]); expect(parallel.moved).toEqual([]); expect(parallel.dof.get('B')).toBe(4);
		expect(parallel.freedom.get('B')).toMatchObject({ translations: 3, slides: ['X', 'Y', 'Z'], turns: ['Z'] });
		const perpendicular = solve([mate('perpendicular', side('A', F.aTop), side('B', F.bPlusX))]);
		expect(perpendicular.errors).toEqual([]); expect(perpendicular.moved).toEqual([]); expect(perpendicular.dof.get('B')).toBe(5);
		const angle = solve([mate('angle', side('A', F.aTop), side('B', F.bTop), { value: 45 })]);
		expect(angle.errors).toEqual([]);
		const top = moved(angle, 'B', F.bTop);
		expect(Math.acos(direction(top)[2]) * 180 / Math.PI).toBeCloseTo(45, 8);
		expect(angle.units.get('m1')).toBe('deg'); expect(angle.residuals.get('m1')).toBeLessThanOrEqual(1e-7);
		expect(angle.dof.get('B')).toBe(5);
		/* Perpendicular from a parallel start needs the kick too. */
		const turned = solve([mate('perpendicular', side('A', F.aTop), side('B', F.bTop))]);
		expect(turned.errors).toEqual([]);
		expect(Math.abs(direction(moved(turned, 'B', F.bTop))[2])).toBeLessThanOrEqual(1e-9);
	});
	it('a corner on a face, and two corners together', () => {
		const onFace = solve([mate('coincident', side('A', F.aTop), side('B', F.bCorner))]);
		expect(onFace.errors).toEqual([]); expect(origin(moved(onFace, 'B', F.bCorner))[2]).toBeCloseTo(1, 12); expect(onFace.dof.get('B')).toBe(5);
		const together = solve([mate('coincident', side('A', F.aCorner), side('B', F.bCorner))]);
		expect(together.errors).toEqual([]); const corner = origin(moved(together, 'B', F.bCorner)); expect(corner[0]).toBeCloseTo(0, 9); expect(corner[1]).toBeCloseTo(0, 9); expect(corner[2]).toBeCloseTo(1, 9);
		expect(together.dof.get('B')).toBe(3); expect(together.freedom.get('B')).toMatchObject({ translations: 0, turns: ['X', 'Y', 'Z'] });
	});
});

describe('who moves', () => {
	it('a fixed body never moves: with the bracket fixed the base drops 1 in instead', () => {
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom))], [A, { ...B, fixed: true }]);
		expect(r.errors).toEqual([]);
		expect(r.moved).toEqual(['A']); expect(r.transforms.has('B')).toBe(false);
		expect(origin(moved(r, 'A', F.aTop))[2]).toBeCloseTo(0, 12);
		expect(r.dof.get('B')).toBe(0); expect(describeFreedom('Bracket', r.freedom.get('B'), true)).toBe('Bracket: fixed in place, it never moves.');
	});
	it('with both fixed nothing moves and the mate says so by name; a mate already holding is accepted', () => {
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom))], [{ ...A, fixed: true }, { ...B, fixed: true }]);
		expect(r.moved).toEqual([]);
		expect(r.errors).toEqual([{ feature: 'm1', message: 'Mate 1 would move Base or Bracket, but both are fixed. Unfix one of them.' }]);
		expect(r.residuals.get('m1')).toBeCloseTo(1, 12);
		const held = solve([mate('coincident', side('A', F.aBottom), side('B', F.bBottom), { flip: true })], [{ ...A, fixed: true }, { ...B, fixed: true }]);
		expect(held.errors).toEqual([]);
	});
	it('with nothing fixed the FIRST body the mate names stays', () => {
		const r = solve([mate('coincident', side('B', F.bBottom), side('A', F.aTop))]);
		expect(r.moved).toEqual(['A']);
		expect(origin(moved(r, 'A', F.aTop))[2]).toBeCloseTo(0, 12);
		expect(chooseMover('A', 'B', 0, new Set(), { placedAt: new Map(), ground: new Set() })).toEqual({ mover: 'B', anchored: 'A' });
		expect(chooseMover('A', 'B', 1, new Set(['B']), { placedAt: new Map(), ground: new Set() })).toEqual({ mover: 'A' });
		expect(chooseMover('A', null, 1, new Set(), { placedAt: new Map(), ground: new Set() })).toEqual({ mover: 'A' });
		expect(chooseMover('A', 'B', 2, new Set(), { placedAt: new Map([['A', 0]]), ground: new Set() })).toEqual({ mover: 'B' });
		expect(chooseMover('A', 'B', 3, new Set(), { placedAt: new Map([['A', 0], ['B', 1]]), ground: new Set(['A']) })).toEqual({ mover: 'B' });
	});
	it('a mate to reference geometry moves the body onto it', () => {
		const r = solve([mate('coincident', side(null, planeFrame([0, 0, 3], [0, 0, 1])), side('B', F.bBottom))]);
		expect(r.errors).toEqual([]); expect(origin(moved(r, 'B', F.bBottom))[2]).toBeCloseTo(3, 12);
		const two = solve([mate('coincident', side(null, planeFrame([0, 0, 3], [0, 0, 1])), side(null, planeFrame([0, 0, 4], [0, 0, 1])))]);
		expect(two.errors[0].message).toMatch(/two references and no body/);
	});
});

describe('mates in sequence', () => {
	it('a second coincident mate slides the placed bracket along the first face instead of tearing it off', () => {
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom)), mate('coincident', side('A', F.aPlusX), side('B', F.bMinusX))]);
		expect(r.errors).toEqual([]);
		expect(Math.abs(gap(r, F.aTop, 'B', F.bBottom))).toBeLessThanOrEqual(1e-9);
		expect(Math.abs(gap(r, F.aPlusX, 'B', F.bMinusX))).toBeLessThanOrEqual(1e-9);
		const bottom = moved(r, 'B', F.bBottom);
		/* Lifted by 1 and slid 2 in along -x: the bracket's -x face now sits at x = 4. */
		expect(origin(bottom)[2]).toBeCloseTo(1, 12); expect(origin(moved(r, 'B', F.bMinusX))[0]).toBeCloseTo(4, 12); expect(origin(bottom)[1]).toBeCloseTo(1, 12);
		expect(r.dof.get('B')).toBe(1); expect(r.freedom.get('B')).toMatchObject({ dof: 1, translations: 1, slides: ['Y'], turns: [] });
		expect(describeFreedom('Bracket', r.freedom.get('B'))).toBe('Bracket: 1 degree of freedom left, slides along Y.');
		console.log(`solver ms per mate: ${[...r.ms].map(([k, v]) => `${k}=${v.toFixed(3)}`).join(' ')}`);
	});
	it('three coincident mates place the bracket fully, 0 degrees of freedom', () => {
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom)), mate('coincident', side('A', F.aPlusX), side('B', F.bMinusX)), mate('coincident', side('A', F.aMinusY), side('B', F.bMinusY), { flip: true })]);
		expect(r.errors).toEqual([]);
		expect(r.dof.get('B')).toBe(0);
		expect(describeFreedom('Bracket', r.freedom.get('B'))).toBe('Bracket: fully placed, 0 degrees of freedom left.');
		const minusY = moved(r, 'B', F.bMinusY); expect(origin(minusY)[1]).toBeCloseTo(0, 12); expect(direction(minusY)[1]).toBeCloseTo(-1, 12);
	});
	it('a second mate needing a turn the first mate allows: the bracket spins about Z to oppose the side faces', () => {
		/* Bracket's +x face against the base's +x face: both point +x, so the bracket must spin 180 about Z while staying on the top. */
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom)), mate('coincident', side('A', F.aPlusX), side('B', F.bPlusX))]);
		expect(r.errors).toEqual([]);
		expect(direction(moved(r, 'B', F.bPlusX))[0]).toBeCloseTo(-1, 9);
		expect(Math.abs(gap(r, F.aTop, 'B', F.bBottom))).toBeLessThanOrEqual(1e-9);
		expect(Math.abs(gap(r, F.aPlusX, 'B', F.bPlusX))).toBeLessThanOrEqual(1e-9);
		expect(direction(moved(r, 'B', F.bBottom))[2]).toBeCloseTo(-1, 9);
	});
	it('an over-constrained third mate is refused by name and moves nothing', () => {
		const first = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom)), mate('coincident', side('A', F.aPlusX), side('B', F.bMinusX))]);
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom)), mate('coincident', side('A', F.aPlusX), side('B', F.bMinusX)), mate('distance', side('A', F.aTop), side('B', F.bBottom), { value: 0.25 })]);
		expect(r.errors).toEqual([{ feature: 'm3', message: 'Mate 3 conflicts with Mate 1: Bracket cannot satisfy both. Delete one of them, or change its value.' }]);
		expect(r.errors[0].message).not.toContain('Mate 2');
		expect(r.transforms.get('B')).toEqual(first.transforms.get('B'));
		expect(r.residuals.get('m3')).toBeCloseTo(0.25, 9);
		expect(r.residuals.get('m1')).toBeLessThanOrEqual(1e-9);
		expect(r.dof.get('B')).toBe(1);
	});
	it('a redundant mate adds nothing and says so, naming the mate that already holds the body', () => {
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom)), mate('parallel', side('A', F.aTop), side('B', F.bBottom))]);
		expect(r.errors).toEqual([{ feature: 'm2', message: 'Mate 2 adds nothing: Mate 1 already hold Bracket this way. Delete it, or mate a different face.' }]);
		expect(r.dof.get('B')).toBe(3);
	});
	it('a mate on a body with no freedom left is refused by the names of what holds it', () => {
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom)), mate('coincident', side('A', F.aPlusX), side('B', F.bMinusX)), mate('coincident', side('A', F.aMinusY), side('B', F.bMinusY), { flip: true }), mate('distance', side('A', F.aPlusY), side('B', F.bMinusY), { value: 1 })]);
		expect(r.errors).toHaveLength(1);
		expect(r.errors[0]).toEqual({ feature: 'm4', message: 'Mate 4 would move Bracket, but Mate 1, Mate 2 and Mate 3 already hold it in place. Delete one of them first.' });
	});
	it('a body placed against another follows when that other is slid by a later mate (the re-check pass)', () => {
		const r = solve([mate('coincident', side('A', F.aTop), side('B', F.bBottom)), mate('coincident', side('B', F.bTop), side('C', F.cBottom)), mate('coincident', side('A', F.aPlusX), side('B', F.bMinusX))], [A, B, C]);
		expect(r.errors).toEqual([]);
		expect(origin(moved(r, 'B', F.bMinusX))[0]).toBeCloseTo(4, 9);
		/* The cap's bottom stays on the bracket's top, which is now at z = 2 and slid 2 in along -x. */
		const capBottom = moved(r, 'C', F.cBottom), bracketTop = moved(r, 'B', F.bTop);
		expect(origin(capBottom)[2]).toBeCloseTo(origin(bracketTop)[2], 9);
		expect(Math.abs(gap(r, bracketTop, 'C', F.cBottom))).toBeLessThanOrEqual(1e-9);
	});
	it('a lost reference and an impossible pairing are reported on their own row, by the mate name, and move nothing', () => {
		const r = solve([mate('coincident', side('A', F.aTop), { error: 'Lost reference: the face this feature used (x2.end) is no longer on the model. Edit the feature and pick it again.' }), mate('concentric', side('A', F.aTop), side('B', F.bBottom))]);
		expect(r.moved).toEqual([]);
		expect(r.errors[0].message).toBe('Mate 1: Lost reference: the face this feature used (x2.end) is no longer on the model. Edit the feature and pick it again.');
		expect(r.errors[1].message).toBe('Mate 2: A concentric mate needs two round faces or circular edges.');
	});
});

describe('the arithmetic underneath', () => {
	it('residuals are zero exactly when the mate holds, and report inches or degrees', () => {
		expect(residual('coincident', F.aTop, planeFrame([9, 9, 1], [0, 0, -1]), undefined, -1).every((x) => Math.abs(x) < 1e-12)).toBe(true);
		expect(residual('coincident', F.aTop, F.bBottom, undefined, -1)).toEqual([0, 0, 0, -1]);
		expect(orientationSign('coincident', F.aTop, F.bBottom)).toBe(-1); expect(orientationSign('coincident', F.aTop, F.bBottom, true)).toBe(1);
		expect(orientationSign('parallel', F.aTop, F.bTop)).toBe(1); expect(orientationSign('parallel', F.aTop, F.bBottom)).toBe(-1);
		expect(residualReport('distance', F.aTop, F.bBottom, 0.25, -1)).toBeCloseTo(1.25, 12);
		expect(residualReport('angle', F.aTop, F.bPlusX, 30, 1)).toBeCloseTo(60, 12);
		expect(residualReport('perpendicular', F.aTop, F.bTop, undefined, 1)).toBeCloseTo(90, 12);
		expect(() => residual('angle', F.aTop, F.bCorner, 10, 1)).toThrow(/corner has no direction/);
	});
	it('rank, null space and named freedom of hand-written Jacobian rows', () => {
		/* Rows over (rx, ry, rz, tx, ty, tz): a coincident plane mate on a horizontal face fixes rx, ry and tz. */
		const rows = [[1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1]];
		expect(rowRank(rows)).toBe(3); expect(nullSpace(rows)).toHaveLength(3);
		expect(freedomOf(rows)).toEqual({ dof: 3, translations: 2, slides: ['X', 'Y'], turns: ['Z'] });
		/* A turn about Z that drags a slide along Y with it is still a turn about Z, and the pure slide left is X alone. */
		expect(freedomOf([[1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1], [0, 0, 1, 0, -1, 0]])).toEqual({ dof: 2, translations: 1, slides: ['X'], turns: ['Z'] });
		expect(freedomOf([[1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1], [0, 0, 0, 1, 0, 0]])).toMatchObject({ dof: 2, translations: 1, slides: ['Y'], turns: ['Z'] });
		expect(freedomOf([])).toMatchObject({ dof: 6 });
		expect(describeFreedom('Cap', freedomOf([[0, 0, 0, 1, 1, 0], [0, 0, 0, 0, 0, 1]]))).toBe('Cap: 4 degrees of freedom left, slides in 1 direction, turns about X, Y and Z.');
	});
	it('a twist about a centre and its matrix agree with the point arithmetic', () => {
		const m = twistMatrix([1, 1, 1], [0, 0, Math.PI / 2], [0, 0, 2]);
		const p = applyMatrix(m, [2, 1, 1]);
		expect(p[0]).toBeCloseTo(1, 12); expect(p[1]).toBeCloseTo(2, 12); expect(p[2]).toBeCloseTo(3, 12);
		expect(applyDirection(m, [1, 0, 0]).map((x) => Math.round(x * 1e9) / 1e9)).toEqual([0, 1, 0]);
		expect(multiply(m, [...IDENTITY])).toEqual(m);
		expect(MATE_TOLERANCE).toBe(1e-9);
	});
	it('the projection reading of freedom agrees with the solver for the placed bracket', () => {
		const model: ModelProjection = { sketches: [], references: [], features: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0,
			bodies: [
				{ id: 'A', name: 'Base', materialId: null, role: 'part', createdBy: 'x1', volume: 12, bounds: [0, 0, 0, 4, 3, 1], centerOfMass: [2, 1.5, 0.5], inertia: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, edges: [], vertices: [],
					faces: [{ id: 'a.top', kind: 'plane', center: [2, 1.5, 1], normal: [0, 0, 1], area: 12, surface: { type: 'plane', normal: [0, 0, 1], d: 1 }, edges: [], positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }] },
				{ id: 'B', name: 'Bracket', materialId: null, role: 'part', createdBy: 'x2', volume: 4, bounds: [6, 0, 1, 8, 2, 2], centerOfMass: [7, 1, 1.5], inertia: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, edges: [], vertices: [], dof: 3,
					faces: [{ id: 'b.bottom', kind: 'plane', center: [7, 1, 1], normal: [0, 0, -1], area: 4, surface: { type: 'plane', normal: [0, 0, -1], d: -1 }, edges: [], positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }] }
			],
			mates: [{ feature: 'm1', kind: 'coincident', a: { kind: 'face', body: 'A', name: 'a.top' }, b: { kind: 'face', body: 'B', name: 'b.bottom' }, status: 'ok', residual: 0 }] };
		const f = freedomFromProjection(model);
		expect(f.get('B')).toMatchObject({ dof: 3, translations: 2, slides: ['X', 'Y'], turns: ['Z'] });
		expect(f.get('A')).toMatchObject({ dof: 6, ground: true });
		/* A mate that is not holding constrains nothing. */
		expect(freedomFromProjection({ ...model, mates: [{ ...model.mates[0], status: 'error' }] }).get('B')).toMatchObject({ dof: 6 });
	});
});
