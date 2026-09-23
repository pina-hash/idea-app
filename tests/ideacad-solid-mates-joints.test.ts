// tests/ideacad-solid-mates-joints.test.ts
//
// JOINTS, MOVE WITHIN FREEDOM AND READABLE NAMES, WITHOUT A KERNEL. A plate
// with a hole and a pin with a head are described the way the engine projects
// them: a hole wall is a cylinder about Z through (1, 1), the plate's top is
// the plane z = 1, the pin's shank is a cylinder about the same axis and its
// head's underside faces down at z = 1. Every expectation is the analytic
// answer for that geometry (a hinge leaves one turn about Z; a pin in a hole
// slides along Z and turns about it; a request across the axis is refused
// whole), never a number read off the code and typed back in.
//
// Why these are tests and not a harness: a joint that promised one degree of
// freedom and quietly added mates leaving two, or a drag that let a mated pin
// wander off its axis, looks plausible on screen and is wrong silently.
import { describe, expect, it } from 'vitest';
import { JOINTS, mateFit, pairShape, pickShape, planJoint } from '../src/lib/ideacad/solid/mates/joints';
import { moveWithinFreedom, projectMotion, requestTwist } from '../src/lib/ideacad/solid/mates/motion';
import { faceWord, refWords, selectionWords } from '../src/lib/ideacad/solid/mates/words';
import { holdOf, mateTrouble, proposedFreedom } from '../src/lib/ideacad/solid/mates/solve';
import { reduce } from '../src/lib/ideacad/solid/commands';
import { featureSummary as summary } from '../src/lib/ideacad/solid/features';
import { emptyManifest, type BodyProjection, type FaceProjection, type ModelProjection, type Selection, type SolidManifest, type Vec3 } from '../src/lib/ideacad/solid/types';

const mesh = () => ({ positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
const plane = (id: string, center: Vec3, normal: Vec3): FaceProjection => ({ id, kind: 'plane', center, normal, area: 1, surface: { type: 'plane', normal }, edges: [], ...mesh() });
const round = (id: string, origin: Vec3, axis: Vec3, radius: number, center: Vec3): FaceProjection => ({ id, kind: 'cylinder', center, normal: [1, 0, 0], area: 1, surface: { type: 'cylinder', axis, origin, radius }, edges: [], ...mesh() });
const body = (id: string, name: string, bounds: number[], faces: FaceProjection[], extra: Partial<BodyProjection> = {}): BodyProjection => ({ id, name, materialId: null, role: 'part', createdBy: id.split('#')[0], faces, edges: [], vertices: [], mesh: mesh(), bounds, volume: 1, centerOfMass: [0, 0, 0], inertia: [], ...extra });
/* Plate 0..2 x 0..2 x 0..1 with a hole about Z through (1, 1). Pin: shank r 0.25 about the same axis, head underside at z = 1. */
const PLATE = () => body('x1#0', 'Plate', [0, 0, 0, 2, 2, 1], [plane('x1.end', [0.5, 0.5, 1], [0, 0, 1]), plane('x1.side.1', [2, 1, 0.5], [1, 0, 0]), plane('x1.side.2', [1, 2, 0.5], [0, 1, 0]), round('h1.wall', [1, 1, 0], [0, 0, 1], 0.25, [1.25, 1, 0.5])]);
const PIN = () => body('p1#0', 'Pin', [0.75, 0.75, 0, 1.25, 1.25, 2], [round('p1.side.0', [1, 1, 0], [0, 0, 1], 0.25, [1.25, 1, 0.5]), plane('p1.start', [1, 1, 1], [0, 0, -1]), plane('p1.face.3', [1.25, 1, 1.5], [-1, 0, 0]), plane('p1.face.4', [1, 1.25, 1.5], [0, -1, 0]), plane('p1.end', [1, 1, 2], [0, 0, 1])]);
const EMPTY: ModelProjection = { bodies: [], sketches: [], references: [], features: [], mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 };
const model = (over: Partial<ModelProjection> = {}): ModelProjection => ({ ...EMPTY, bodies: [PLATE(), PIN()], ...over });
const manifest = (): SolidManifest => ({ ...emptyManifest(), features: [
	{ id: 'x1', name: 'Plate', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' },
	{ id: 'h1', name: 'Hole 1', type: 'hole', face: { body: 'x1#0', name: 'x1.end' }, center: [1, 1], standard: 'custom', fit: 'custom', diameter: 0.5, depth: 'through' },
	{ id: 'p1', name: 'Pin', type: 'extrude', sketch: 's2', distance: 2, operation: 'new' }
] } as SolidManifest);
const ctx = (m = model()) => ({ model: m, manifest: manifest() });
const face = (bodyId: string, id: string): Selection => ({ kind: 'face', bodyId, id });
const WALL = face('x1#0', 'h1.wall'), TOP = face('x1#0', 'x1.end'), SIDE = face('x1#0', 'x1.side.1'), SIDE2 = face('x1#0', 'x1.side.2');
const SHANK = face('p1#0', 'p1.side.0'), HEAD = face('p1#0', 'p1.start'), PINTOP = face('p1#0', 'p1.end'), FLATX = face('p1#0', 'p1.face.3'), FLATY = face('p1#0', 'p1.face.4');
const close = (a: readonly number[], b: readonly number[], eps = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) < eps);

describe('what a pick can pair as', () => {
	it('round faces pair with round ones or an axis, flat with flat, and nothing else', () => {
		const m = model();
		expect([WALL, TOP, SHANK, HEAD].map((s) => pickShape(m, s))).toEqual(['round', 'flat', 'round', 'flat']);
		expect(pairShape('round', 'round')).toBe('round'); expect(pairShape('round', 'line')).toBe('round'); expect(pairShape('line', 'round')).toBe('round');
		expect(pairShape('flat', 'flat')).toBe('flat'); expect(pairShape('flat', 'round')).toBeNull(); expect(pairShape('point', 'flat')).toBeNull();
	});
});

describe('a joint is planned from its picks before anything is added', () => {
	it('a hinge from a hole wall, a shank, the plate top and the head underside leaves one turn about Z, and is two mates first body first', () => {
		const plan = planJoint(ctx(), 'hinge', [WALL, SHANK, TOP, HEAD]);
		expect(plan.reason).toBeNull(); expect(plan.ready).toBe(true);
		expect(plan.mates.map((m) => m.kind)).toEqual(['concentric', 'coincident']);
		expect(plan.mates.every((m) => m.a.kind === 'face' && m.a.body === 'x1#0' && m.b.kind === 'face' && m.b.body === 'p1#0')).toBe(true);
		expect(plan.freedom).toEqual({ dof: 1, translations: 0, slides: [], turns: ['Z'] });
		expect(plan.sentence).toBe('Pin: 1 degree of freedom left, turns about Z.');
		expect(plan.stays).toBe('x1#0'); expect(plan.moves).toBe('p1#0');
		expect(plan.slots.map((s) => [s.shape, s.words])).toEqual([['round', 'Plate, hole wall'], ['round', 'Pin, round face 1'], ['flat', 'Plate, end face'], ['flat', 'Pin, start face']]);
	});
	it('a hinge picked top to top turns the pin over: the round pair is flipped so the solve holds both pairs (measured in the browser as a conflict before this)', () => {
		const plan = planJoint(ctx(), 'hinge', [WALL, SHANK, TOP, PINTOP]);
		expect(plan.reason).toBeNull(); expect(plan.ready).toBe(true);
		expect(plan.mates.map((m) => [m.kind, !!m.flip])).toEqual([['concentric', true], ['coincident', false]]);
		expect(planJoint(ctx(), 'hinge', [WALL, SHANK, TOP, HEAD]).mates.map((m) => !!m.flip)).toEqual([false, false]);
	});
	it('picks may come in either order within a pair and pairs in any order; the part named first still stays', () => {
		const plan = planJoint(ctx(), 'hinge', [TOP, HEAD, SHANK, WALL]);
		expect(plan.ready).toBe(true); expect(plan.stays).toBe('x1#0');
		expect(plan.mates.map((m) => m.kind)).toEqual(['coincident', 'concentric']);
		expect(plan.mates.every((m) => m.a.kind !== 'reference' && m.a.kind !== 'sketch-entity' && (m.a as { body: string }).body === 'x1#0')).toBe(true);
	});
	it('a part-way hinge names the slots still to fill and gives no reason yet; a pair across shapes is refused in words', () => {
		const half = planJoint(ctx(), 'hinge', [WALL, SHANK]);
		expect(half.ready).toBe(false); expect(half.reason).toBeNull();
		expect(half.slots.map((s) => !!s.pick)).toEqual([true, true, false, false]); expect(half.slots[2].shape).toBe('flat');
		const mixed = planJoint(ctx(), 'hinge', [WALL, HEAD]);
		expect(mixed.ready).toBe(false); expect(mixed.reason).toMatch(/^A round pick pairs with a round one\. Pick a matching face on Pin\.$/);
	});
	it('a hinge whose flat faces run along its axis would slide, not spin, and is refused naming what it would do (against the square pair above)', () => {
		const plan = planJoint(ctx(), 'hinge', [WALL, SHANK, SIDE, FLATX]);
		expect(plan.ready).toBe(false);
		expect(plan.reason).toBe('Not a hinge. Pin: 1 degree of freedom left, slides along Z. Pick flat faces square to the round ones.');
	});
	it('picks the chosen joint cannot take name the joints they can make', () => {
		expect(planJoint(ctx(), 'planar', [WALL, SHANK]).reason).toBe('A planar pairs flat to flat. These picks make a Hinge, Cylindrical or Fixed.');
		expect(planJoint(ctx(), 'cylindrical', [TOP, HEAD]).reason).toBe('A cylindrical pairs round to round. These picks make a Hinge, Slider, Planar or Fixed.');
	});
	it('two picks on one part are refused naming the part', () => {
		const same = planJoint(ctx(), 'cylindrical', [WALL, TOP]);
		expect(same.reason).toBe('Both picks are on Plate. Pick one on each part.');
		/* The refused picks stay on screen in their own words and shapes, beside the reason. */
		expect(same.slots.map((s) => [s.shape, s.words ?? null])).toEqual([['round', 'Plate, hole wall'], ['flat', 'Plate, end face']]);
	});
	it('a cylindrical joint is one concentric pair and leaves a slide and a turn; planar is one flat pair and leaves three', () => {
		const cyl = planJoint(ctx(), 'cylindrical', [WALL, SHANK]);
		expect(cyl.ready).toBe(true); expect(cyl.freedom).toEqual({ dof: 2, translations: 1, slides: ['Z'], turns: ['Z'] });
		const planar = planJoint(ctx(), 'planar', [TOP, HEAD]);
		expect(planar.ready).toBe(true); expect(planar.freedom?.dof).toBe(3); expect(planar.freedom?.translations).toBe(2);
	});
	it('a slider needs two flat pairs that meet at an angle: parallel pairs are refused, square ones leave one slide', () => {
		const parallel = planJoint(ctx(), 'slider', [SIDE, FLATX, SIDE, FLATX]);
		expect(parallel.ready).toBe(false); expect(parallel.reason).toMatch(/^Not a slider\. Pin: 3 degrees of freedom left/);
		const square = planJoint(ctx(), 'slider', [SIDE, FLATX, SIDE2, FLATY]);
		expect(square.reason).toBeNull(); expect(square.ready).toBe(true); expect(square.freedom).toEqual({ dof: 1, translations: 1, slides: ['Z'], turns: [] });
	});
	it('a fixed joint leaves nothing, and every joint states its promise', () => {
		const fixed = planJoint(ctx(), 'fixed', [TOP, HEAD, SIDE, FLATX, SIDE2, FLATY]);
		expect(fixed.reason).toBeNull(); expect(fixed.ready).toBe(true); expect(fixed.freedom?.dof).toBe(0);
		/* A pin held in its hole cannot also put a flat face against the plate's far side: the trial solve refuses it in the solver's words. */
		const torn = planJoint(ctx(), 'fixed', [WALL, SHANK, TOP, HEAD, SIDE, FLATX]);
		expect(torn.ready).toBe(false); expect(torn.reason).toBe('Pair 3 cannot hold together with the others. Pick a different face for pair 3.');
		expect(Object.fromEntries(Object.entries(JOINTS).map(([k, j]) => [k, j.dof]))).toEqual({ hinge: 1, slider: 1, cylindrical: 2, planar: 3, fixed: 0 });
	});
	it('a single concentric mate on a flat face and a round face is refused up front with the solver pairing sentence (F047), and the round pair is accepted', () => {
		expect(mateFit(ctx(), 'concentric', TOP, SHANK)).toBe('A concentric mate needs two round faces or circular edges.');
		expect(mateFit(ctx(), 'concentric', WALL, SHANK)).toBeNull();
		expect(mateFit(ctx(), 'coincident', WALL, TOP)).toBe('Both picks are on Plate. Pick one on each part.');
	});
});

describe('a joint lands as one step', () => {
	it('a batch command adds every mate in one reduce, in order, and an empty batch is refused', () => {
		const base = manifest();
		const next = reduce(base, { type: 'batch', commands: [
			{ type: 'add-feature', feature: { id: 'j1', name: 'Hinge 1 axis', type: 'mate', kind: 'concentric', a: { kind: 'face', body: 'x1#0', name: 'h1.wall' }, b: { kind: 'face', body: 'p1#0', name: 'p1.side.0' }, joint: 'hinge', group: 'j1' } },
			{ type: 'add-feature', feature: { id: 'j2', name: 'Hinge 1 face', type: 'mate', kind: 'coincident', a: { kind: 'face', body: 'x1#0', name: 'x1.end' }, b: { kind: 'face', body: 'p1#0', name: 'p1.start' }, joint: 'hinge', group: 'j1' } }
		] });
		expect(next.features.slice(-2).map((f) => f.id)).toEqual(['j1', 'j2']);
		expect(base.features).toHaveLength(3);
		expect(summary(next.features[3])).toBe('hinge');
		expect(() => reduce(base, { type: 'batch', commands: [] })).toThrow('Nothing to change.');
		/* A failing member refuses the whole batch: nothing half-lands. */
		expect(() => reduce(base, { type: 'batch', commands: [{ type: 'remove-feature', id: 'x1' }, { type: 'remove-feature', id: 'nope' }] })).toThrow();
	});
});

describe('move within freedom', () => {
	/* The pin sits in the hole: a concentric mate, solved, with the plate as the part it was placed against. */
	const mated = (fixedPin = false) => model({ bodies: [PLATE(), PIN()].map((b) => (fixedPin && b.id === 'p1#0' ? { ...b, fixed: true } : b)), mates: [{ feature: 'm1', kind: 'concentric', a: { kind: 'face', body: 'x1#0', name: 'h1.wall' }, b: { kind: 'face', body: 'p1#0', name: 'p1.side.0' }, status: 'ok', residual: 0 }] });
	it('a pin with a concentric mate slides along its axis and turns about it, and nothing else of the drag survives', () => {
		const slide = moveWithinFreedom(mated(), 'p1#0', { translation: [1, 2, 3] });
		expect(slide.dof).toBe(2); expect(close(slide.v, [0, 0, 3])).toBe(true); expect(close(slide.omega, [0, 0, 0])).toBe(true);
		const turn = moveWithinFreedom(mated(), 'p1#0', { rotation: { axis: [0, 0, 2], angle: 0.5, pivot: [1, 1, 0] } });
		expect(close(turn.omega, [0, 0, 0.5])).toBe(true); expect(close(turn.v, [0, 0, 0])).toBe(true);
		const tip = moveWithinFreedom(mated(), 'p1#0', { rotation: { axis: [1, 0, 0], angle: 0.3 } });
		expect(tip.held).toBe(true); expect(tip.matrix).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
		/* The matrix is the motion: the axis point (1, 1, 0) slides to (1, 1, 3). */
		const m = slide.matrix; expect(close([m[0] * 1 + m[1] * 1 + m[3], m[4] * 1 + m[5] * 1 + m[7], m[11]], [1, 1, 3])).toBe(true);
	});
	it('a fixed body does not move at all; a free body and the part the pin was placed against move exactly as dragged', () => {
		expect(moveWithinFreedom(mated(true), 'p1#0', { translation: [0, 0, 5] })).toMatchObject({ held: true, dof: 0, v: [0, 0, 0] });
		const plate = moveWithinFreedom(mated(), 'x1#0', { translation: [1, 2, 3] });
		expect(plate.dof).toBe(6); expect(close(plate.v, [1, 2, 3])).toBe(true);
		const free = moveWithinFreedom(model(), 'p1#0', { translation: [0.5, -1, 0], rotation: { axis: [0, 1, 0], angle: 0.2 } });
		expect(close(free.v, [0.5, -1, 0])).toBe(true); expect(close(free.omega, [0, 0.2, 0])).toBe(true);
		expect(holdOf(mated(), 'p1#0')?.rows.length).toBeGreaterThan(0); expect(holdOf(mated(), 'x1#0')?.ground).toBe(true);
	});
	it('a turn about a pivot off the centre carries the centre along, and projection is unit-fair for a pure axis', () => {
		expect(requestTwist([1, 0, 0], { rotation: { axis: [0, 0, 1], angle: Math.PI / 2, pivot: [0, 0, 0] } }).v.map((x) => Number(x.toFixed(9)))).toEqual([0, Math.PI / 2, 0].map((x) => Number(x.toFixed(9))));
		const rows = [[0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0]]; /* slides in X and Y held, everything else free */
		for (const L of [0.1, 1, 10]) { const r = projectMotion(rows, [0, 0, 0], { translation: [3, 4, 5], rotation: { axis: [0, 0, 1], angle: 0.1 } }, L); expect(close(r.v, [0, 0, 5])).toBe(true); expect(close(r.omega, [0, 0, 0.1])).toBe(true); }
	});
});

describe('readable names and statuses', () => {
	it('a face reads as its part and its role, never its stored id (F034)', () => {
		const c = ctx();
		expect(selectionWords(c, WALL)).toBe('Plate, hole wall');
		expect(selectionWords(c, SHANK)).toBe('Pin, round face 1');
		expect(faceWord(c, PIN(), 'p1.face.3')).toBe('flat face 4');
		expect(faceWord(c, PLATE(), 'x1.end~1')).toBe('end face (2)');
		expect(refWords(c, { kind: 'face', body: 'x1#0', name: 'h1.wall' })).toBe('Plate, hole wall');
		expect(refWords(c, { kind: 'edge', body: 'x1#0', faces: ['a', 'b'] })).toBe('Plate, edge (missing)');
		for (const s of [WALL, SHANK, TOP, HEAD]) expect(selectionWords(c, s)).not.toMatch(/[a-z0-9]{6,}\.|#/);
	});
	it('a mate trouble is read off the solver sentence it came from', () => {
		expect(mateTrouble('Mate 2 adds nothing: Mate 1 already holds Pin this way. Delete it, or mate a different face.')).toBe('redundant');
		expect(mateTrouble('Mate 2 conflicts with Mate 1: Pin cannot satisfy both. Delete one of them, or change its value.')).toBe('conflict');
		expect(mateTrouble('Mate 4 would move Pin, but Mate 1 already holds it in place. Delete it first.')).toBe('conflict');
		expect(mateTrouble('Mate 1: That face is no longer on the model.')).toBe('unsolved');
	});
	it('the freedom a proposal would leave is the solver reading, and a pairing the solver cannot take is its sentence', () => {
		const ok = proposedFreedom(model(), [{ kind: 'concentric', a: { kind: 'face', body: 'x1#0', name: 'h1.wall' }, b: { kind: 'face', body: 'p1#0', name: 'p1.side.0' } }]);
		expect('freedom' in ok && ok.mover === 'p1#0' && ok.freedom.dof === 2).toBe(true);
		const bad = proposedFreedom(model(), [{ kind: 'concentric', a: { kind: 'face', body: 'x1#0', name: 'x1.end' }, b: { kind: 'face', body: 'p1#0', name: 'p1.side.0' } }]);
		expect(bad).toEqual({ error: 'A concentric mate needs two round faces or circular edges.' });
	});
});
