// tests/ideacad-solid-sketching-snap.test.ts
//
// QUICK SNAPPING, INFERRED RELATIONS AND THE NEW RELATION OFFERS (feedback
// R05, ledger 0298). Three claims, each of which fails SILENTLY if it breaks:
//
//  - WHERE A PRESS LANDS. Every expected position is ANALYTIC (a midpoint is
//    the mean of two ends, a crossing solves two line equations, a guide
//    shares one coordinate with its source) and never a number read off the
//    code. The order is asserted in pairs: each outranking snap is placed
//    where the one it outranks is ALSO in reach, so a swapped order reddens.
//  - WHAT IS ADDED. The relation a snap earns is committed IN THE SAME DRAFT
//    as the point it holds, is taken away with it by ONE undo on the real
//    engine, and is load-bearing on the real kernel: perturb the geometry and
//    the point follows, strip the relation and it does not.
//  - THAT NOTHING STORED CHANGED SHAPE. Every sketch this bundle produces goes
//    through a JSON round trip and the document validator unchanged, against
//    a negative control the validator refuses.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { createKernel } from '../src/lib/ideacad/kernel/remus';
import { emptyManifest, type Feature, type FeatureOf, type SketchConstraint, type SketchEntity } from '../src/lib/ideacad/solid/types';
import { validateFeature, validateManifest } from '../src/lib/ideacad/solid/validate';
import { pointOf, regions, solveSketch } from '../src/lib/ideacad/solid/sketch/model';
import { SketchSession, chainDraft, constraintLabel, constraintOffers, joinPoints, rectangleEntities, snapPoint, snapRelations, snapCue, snapSentence, type SessionContext, type SketchDraft, type Snap, type SnapKind } from '../src/lib/ideacad/solid/sketch/editor';
import { constraintGlyph, snapStrokes } from '../src/lib/ideacad/solid/viewport/sketch-layer';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });

const R = 0.25;
const P = (id: string, x: number, y: number): SketchEntity => ({ id, type: 'point', x, y });
const L = (id: string, a: string, b: string): SketchEntity => ({ id, type: 'line', a, b });
/** A 4x3 rectangle with stable ids: p0..p3 counter-clockwise from the origin, l0 the bottom, l1 the right side, l2 the top, l3 the left. */
function rect(): SketchDraft {
	return {
		entities: [P('p0', 0, 0), P('p1', 4, 0), P('p2', 4, 3), P('p3', 0, 3), L('l0', 'p0', 'p1'), L('l1', 'p1', 'p2'), L('l2', 'p2', 'p3'), L('l3', 'p3', 'p0')],
		constraints: [{ id: 'h0', type: 'horizontal', line: 'l0' }, { id: 'v1', type: 'vertical', line: 'l1' }, { id: 'h2', type: 'horizontal', line: 'l2' }, { id: 'v3', type: 'vertical', line: 'l3' }]
	};
}
const ctx = (s: SketchDraft, over: Partial<SessionContext> = {}): SessionContext => ({ entities: s.entities, constraints: s.constraints, tolerance: 0.15, snapRadius: R, polygonSides: 6, filletRadius: 0.5, canWrite: true, ...over });
const types = (cs: readonly SketchConstraint[]) => cs.map((c) => c.type);
const newOf = (before: SketchDraft, after: SketchDraft) => after.entities.filter((e) => !before.entities.some((b) => b.id === e.id));

describe('where a press lands', () => {
	it('lands on a midpoint, and a point outranks the midpoint of the short line it ends', () => {
		const s = rect();
		expect(snapPoint([2.1, 0.1], { entities: s.entities, radius: R })).toMatchObject({ kind: 'midpoint', at: [2, 0], curves: [{ id: 'l0', type: 'line' }] });
		/* A 0.6in line: pressed 0.102 from its end and 0.201 from its middle, both in reach, the end wins; pressed on its middle, out of both ends' reach, the middle does. */
		const short = [P('a', 10, 0), P('b', 10.6, 0), L('m', 'a', 'b')];
		expect(snapPoint([10.1, 0.02], { entities: short, radius: R })).toMatchObject({ kind: 'point', point: 'a', at: [10, 0] });
		expect(snapPoint([10.3, 0.05], { entities: short, radius: R })).toMatchObject({ kind: 'midpoint', at: [10.3, 0] });
	});
	it('lands on a line at the foot of the perpendicular, and on a circle along the radius', () => {
		const s = rect();
		expect(snapPoint([3, 0.1], { entities: s.entities, radius: R })).toMatchObject({ kind: 'onCurve', at: [3, 0], curves: [{ id: 'l0', type: 'line' }] });
		const circle = [P('c', 20, 0), { id: 'k', type: 'circle', center: 'c', radius: 2 } as SketchEntity];
		const on = snapPoint([22.1, 0.1], { entities: circle, radius: R }), bearing = Math.atan2(0.1, 2.1);
		expect(on).toMatchObject({ kind: 'onCurve', curves: [{ id: 'k', type: 'circle' }] });
		expect(on.at[0]).toBeCloseTo(20 + 2 * Math.cos(bearing), 12); expect(on.at[1]).toBeCloseTo(2 * Math.sin(bearing), 12);
	});
	it('lands on an arc only inside its own sweep', () => {
		const arc = [P('c', 30, 0), P('s', 31, 0), P('e', 30, 1), { id: 'u', type: 'arc', center: 'c', start: 's', end: 'e' } as SketchEntity];
		const inside = snapPoint([30.72, 0.72], { entities: arc, radius: R });
		expect(inside).toMatchObject({ kind: 'onCurve', curves: [{ id: 'u', type: 'arc' }] });
		expect(inside.at[0]).toBeCloseTo(30 + Math.SQRT1_2, 12); expect(inside.at[1]).toBeCloseTo(Math.SQRT1_2, 12);
		/* The same distance off the circle, but at 225 degrees, which the quarter arc does not reach. */
		expect(snapPoint([29.28, -0.72], { entities: arc, radius: R }).kind).toBe('none');
	});
	it('lands where two curves cross, over landing on either of them', () => {
		/* y = x - 6 and y = 8 - x cross at (7, 1); neither middle is within reach of it. */
		const cross = [P('a0', 5, -1), P('a1', 10, 4), P('b0', 4, 4), P('b1', 9, -1), L('a', 'a0', 'a1'), L('b', 'b0', 'b1')];
		const snap = snapPoint([7.1, 1.05], { entities: cross, radius: R });
		expect(snap.kind).toBe('intersection'); expect(snap.at[0]).toBeCloseTo(7, 12); expect(snap.at[1]).toBeCloseTo(1, 12);
		expect(snap.curves!.map((c) => c.id).sort()).toEqual(['a', 'b']);
		/* The positive control that the crossing was OUTRANKING something: with one line gone the same press lands on the other. */
		expect(snapPoint([7.1, 1.05], { entities: cross.filter((e) => e.id !== 'b'), radius: R }).kind).toBe('onCurve');
	});
	it('lands on a curve where the level guide from the last point crosses it, and keeps the level', () => {
		const s = rect();
		const snap = snapPoint([4.05, 1.08], { entities: s.entities, radius: R, reference: [-3, 1] });
		expect(snap).toMatchObject({ kind: 'onCurve', curves: [{ id: 'l1' }], level: 'horizontal', reference: [-3, 1] });
		expect(snap.at[0]).toBeCloseTo(4, 12); expect(snap.at[1]).toBeCloseTo(1, 12);
		/* Without the reference, the same press is the foot of the perpendicular, not the guide's crossing. */
		expect(snapPoint([4.05, 1.08], { entities: s.entities, radius: R })).toMatchObject({ kind: 'onCurve', at: [4, 1.08] });
	});
	it('lines up with a point passed over, crosses two guides from different points, and never pairs a point with itself', () => {
		expect(snapPoint([1.05, 7], { entities: [], radius: R, woken: [[1, 3]] })).toMatchObject({ kind: 'alignment', at: [1, 7], aligned: [{ from: [1, 3], axis: 'vertical' }] });
		expect(snapPoint([3.08, 0.1], { entities: [], radius: R, reference: [-2, 0], woken: [[3, 5]] })).toMatchObject({ kind: 'horizontal', at: [3, 0], level: 'horizontal', reference: [-2, 0], aligned: [{ from: [3, 5], axis: 'vertical' }] });
		/* Both of the reference's own guides in reach meet only AT the reference: the nearer one wins, as it always did. */
		expect(snapPoint([5.1, 5.12], { entities: [], radius: R, reference: [5, 5] })).toMatchObject({ kind: 'vertical', at: [5, 5.12] });
		expect(snapPoint([5.12, 5.1], { entities: [], radius: R, reference: [5, 5] })).toMatchObject({ kind: 'horizontal', at: [5.12, 5] });
	});
	it('makes no twin: two guides crossing on a point that is already there land ON that point', () => {
		const pts = [P('w1', 10, 10), P('w2', 14, 13), P('t', 10, 13)];
		/* 0.28 from t, outside the point snap's reach; the guides from w1 and w2 cross exactly on t. */
		expect(snapPoint([10.2, 12.8], { entities: pts, radius: R, woken: [[10, 10], [14, 13]] })).toMatchObject({ kind: 'point', point: 't', at: [10, 13] });
		expect(snapPoint([10.2, 12.8], { entities: pts.filter((e) => e.id !== 't'), radius: R, woken: [[10, 10], [14, 13]] })).toMatchObject({ kind: 'alignment', at: [10, 13] });
	});
	it('snaps to nothing with Ctrl held, and skips a dragged point with every curve that names it', () => {
		const s = rect();
		expect(snapPoint([2.1, 0.1], { entities: s.entities, radius: R, free: true })).toEqual({ at: [2.1, 0.1], kind: 'none' });
		expect(snapPoint([2.1, 0.1], { entities: s.entities, radius: R, exclude: new Set(['p0']) }).kind).toBe('none');
		expect(snapPoint([2.1, 0.1], { entities: s.entities, radius: R, exclude: new Set(['p2']) }).kind).toBe('midpoint');
	});
});

describe('what a snap adds', () => {
	it('spells the relation for each kind of landing, and none for a point, the origin or a guide', () => {
		expect(types(snapRelations({ kind: 'midpoint', curves: [{ id: 'l', type: 'line' }] }, 'q'))).toEqual(['midpoint']);
		expect(snapRelations({ kind: 'onCurve', curves: [{ id: 'l', type: 'line' }] }, 'q')).toEqual([expect.objectContaining({ type: 'pointLineDistance', point: 'q', line: 'l', value: 0 })]);
		expect(snapRelations({ kind: 'onCurve', curves: [{ id: 'k', type: 'circle' }] }, 'q')).toEqual([expect.objectContaining({ type: 'pointOnCircle', point: 'q', circle: 'k' })]);
		expect(snapRelations({ kind: 'onCurve', curves: [{ id: 'u', type: 'arc' }] }, 'q')).toEqual([expect.objectContaining({ type: 'pointOnArc', point: 'q', arc: 'u' })]);
		expect(types(snapRelations({ kind: 'intersection', curves: [{ id: 'l', type: 'line' }, { id: 'u', type: 'arc' }] }, 'q'))).toEqual(['pointLineDistance', 'pointOnArc']);
		for (const kind of ['point', 'origin', 'alignment', 'horizontal', 'vertical', 'none'] as SnapKind[]) expect(snapRelations({ kind }, 'q'), kind).toEqual([]);
	});
	it('a line chain carries the relation of every snapped corner and the level of every level step, in the one draft', () => {
		const s = rect(), session = new SketchSession(); session.setTool('line');
		session.down([2.1, 3.1], ctx(s));
		session.down([2.05, 5], ctx(s));
		const r = session.key('Enter', ctx(s)), next = r.commit!.sketch, added = newOf(s, next);
		expect(r.commit!.label).toBe('Draw line');
		expect(types(next.constraints)).toEqual(['horizontal', 'vertical', 'horizontal', 'vertical', 'midpoint', 'vertical']);
		const corner = added.find((e) => e.type === 'point' && e.x === 2 && e.y === 3);
		expect(corner).toBeDefined(); expect(next.constraints[4]).toMatchObject({ point: corner!.id, line: 'l2' });
		/* The chain draft alone, for every other kind of corner: a point on a circle, an intersection, a level step onto a line. */
		const draft = chainDraft([{ at: [0, 0], kind: 'onCurve', curves: [{ id: 'k', type: 'circle' }] }, { at: [4, 1], kind: 'onCurve', curves: [{ id: 'l1', type: 'line' }], level: 'horizontal' }, { at: [5, 5], kind: 'intersection', curves: [{ id: 'a', type: 'line' }, { id: 'u', type: 'arc' }] }], false);
		expect(types(draft.constraints)).toEqual(['pointOnCircle', 'pointLineDistance', 'pointLineDistance', 'pointOnArc', 'horizontal']);
	});
	it('Ctrl held places every corner where the pointer is, with no relation and no level', () => {
		const s = rect(), session = new SketchSession(); session.setTool('line');
		session.down([2.1, 3.1], ctx(s, { free: true }));
		session.down([2.05, 5], ctx(s, { free: true }));
		const next = session.key('Enter', ctx(s)).commit!.sketch;
		expect(types(next.constraints)).toEqual(types(s.constraints));
		expect(newOf(s, next).filter((e) => e.type === 'point').map((e) => [(e as { x: number }).x, (e as { y: number }).y])).toEqual([[2.1, 3.1], [2.05, 5]]);
	});
	it('a point dropped on a line keeps a Point on line relation in the same step as the move; Ctrl drops it free', () => {
		const s: SketchDraft = { entities: [...rect().entities, P('q1', 6, 1), P('q2', 8, 1), L('m', 'q1', 'q2')], constraints: rect().constraints };
		const drop = (free: boolean) => {
			const session = new SketchSession();
			session.down([6, 1], ctx(s)); session.move([4.05, 2.2], ctx(s, { free }));
			return session.up([4.05, 2.2], ctx(s, { free })).commit!;
		};
		const snapped = drop(false);
		expect(snapped.label).toBe('Move point'); expect(pointOf(snapped.sketch.entities, 'q1')).toEqual([4, 2.2]);
		expect(snapped.sketch.constraints.slice(4)).toEqual([expect.objectContaining({ type: 'pointLineDistance', point: 'q1', line: 'l1', value: 0 })]);
		const free = drop(true);
		expect(pointOf(free.sketch.entities, 'q1')).toEqual([4.05, 2.2]); expect(free.sketch.constraints).toHaveLength(4);
	});
	it('a rectangle started on a line holds its first corner there; a polygon, whose press is its center, adds nothing', () => {
		const s = rect(), session = new SketchSession(); session.setTool('rectangle');
		session.down([1, 3.08], ctx(s)); session.move([2, 5], ctx(s));
		const r = session.up([2, 5], ctx(s)).commit!.sketch;
		const corner = newOf(s, r).find((e) => e.type === 'point' && e.x === 1 && e.y === 3)!;
		expect(r.constraints.filter((c) => c.type === 'pointLineDistance')).toEqual([expect.objectContaining({ point: corner.id, line: 'l2', value: 0 })]);
		session.setTool('polygon'); session.down([2.1, 0.1], ctx(s)); session.move([3, -2], ctx(s));
		expect(session.up([3, -2], ctx(s)).commit!.sketch.constraints).toHaveLength(4);
	});
	it('Ctrl pressed without moving takes the snap away and gives it back', () => {
		const s = rect(), session = new SketchSession(); session.setTool('line');
		session.move([2.1, 0.1], ctx(s));
		expect(session.liveSnap?.kind).toBe('midpoint'); expect(session.freeAt).toBeNull();
		expect(session.setFree(true, ctx(s))).toBe(true);
		expect(session.liveSnap).toBeNull(); expect(session.freeAt).toEqual([2.1, 0.1]);
		expect(session.setFree(true, ctx(s))).toBe(false);
		expect(session.setFree(false, ctx(s))).toBe(true); expect(session.liveSnap?.kind).toBe('midpoint');
	});
	it('a join that makes a held point a line\'s own end drops the relation, which would otherwise read Over defined', () => {
		const s: SketchDraft = { entities: [P('a', 0, 0), P('b', 4, 0), L('l', 'a', 'b'), P('q', 2, 0), P('r', 2, 2), L('n', 'q', 'r')], constraints: [{ id: 'on', type: 'pointLineDistance', point: 'q', line: 'l', value: 0 }] };
		expect(joinPoints(s, 'q', 'b').constraints).toEqual([]);
		/* Joined anywhere else it stays: the positive control. */
		const elsewhere: SketchDraft = { ...s, entities: [...s.entities, P('z', 3, 0)] };
		expect(joinPoints(elsewhere, 'q', 'z').constraints).toEqual([expect.objectContaining({ type: 'pointLineDistance', point: 'z', line: 'l' })]);
	});
});

describe('the words and the marks', () => {
	it('names every snap in a word beside a glyph, and says which relation the press adds for the tool in hand', () => {
		const name = (id: string) => ({ l0: 'Line 1', l2: 'Line 3', u: 'Arc 1' })[id] ?? id;
		expect(snapCue({ at: [0, 0], kind: 'onCurve', curves: [{ id: 'u', type: 'arc' }], level: 'horizontal' })).toEqual({ glyph: '○', word: 'On arc, horizontal' });
		expect(snapCue({ at: [0, 0], kind: 'midpoint' }).word).toBe('Midpoint');
		const on: Snap = { at: [3, 0], kind: 'onCurve', curves: [{ id: 'l0', type: 'line' }], level: 'horizontal', reference: [0, 0] };
		expect(snapSentence(on, { point: true, step: true }, name)).toBe('On Line 1, level with the last point. Adds Point on line and Horizontal.');
		expect(snapSentence(on, { point: true, step: false }, name)).toBe('On Line 1, level with the last point. Adds Point on line.');
		expect(snapSentence({ at: [2, 3], kind: 'midpoint', curves: [{ id: 'l2', type: 'line' }] }, { point: false, step: false }, name)).toBe('Midpoint of Line 3.');
		for (const kind of ['point', 'origin', 'midpoint', 'intersection', 'onCurve', 'alignment', 'horizontal', 'vertical'] as SnapKind[]) {
			const snap: Snap = { at: [1, 1], kind, point: 'p', curves: [{ id: 'l0', type: 'line' }, { id: 'u', type: 'arc' }], ...(kind === 'alignment' ? { aligned: [{ from: [1, 5], axis: 'vertical' as const }] } : kind === 'horizontal' || kind === 'vertical' ? { reference: [0, 1], level: kind } : {}) };
			expect(snapCue(snap).word, kind).not.toBe(''); expect(snapCue(snap).glyph, kind).not.toBe('');
			expect(snapStrokes(snap, 0.1).length, kind).toBeGreaterThan(0);
		}
		expect(snapStrokes({ at: [1, 1], kind: 'none' }, 0.1)).toEqual([]);
		/* The dashed guide is dashes, not one stroke, and the level rule still leads. */
		const both = snapStrokes({ at: [3, 0], kind: 'horizontal', reference: [0, 0], level: 'horizontal', aligned: [{ from: [3, 5], axis: 'vertical' }] }, 0.1);
		expect(both[0]).toEqual([[0, 0], [3, 0]]); expect(both.length).toBeGreaterThan(5);
	});
	it('lists a zero distance to a line as Point on line with no number, and draws it a ring rather than nothing', () => {
		const s = rect(), c: SketchConstraint = { id: 'o', type: 'pointLineDistance', point: 'p2', line: 'l0', value: 0 };
		expect(constraintLabel(s.entities, c)).toEqual({ word: 'Point on line', names: 'Point 3, Line 1' });
		expect(constraintLabel(s.entities, { ...c, value: 3 })).toMatchObject({ word: 'Distance to line', value: 3 });
		const ring = constraintGlyph(s.entities, c, 0.1);
		expect(ring).toHaveLength(1); expect(ring[0].length).toBeGreaterThan(4);
	});
});

describe('the relations offered from a selection', () => {
	/* q and r end two separate lines; no line joins them. (A point no curve names is pruned by any join, as the drag join always did, so the fixture draws none.) */
	const pts = (): SketchDraft => ({ entities: [...rect().entities, P('q', 6, 1), P('t', 7, -1), L('m1', 'q', 't'), P('r', 9, 2.5), P('u', 10, 0), L('m2', 'r', 'u')], constraints: rect().constraints });
	it('offers Coincident, Horizontal and Vertical for two points, through a line that already joins them or a construction line that does not', () => {
		const s = pts();
		expect(constraintOffers(s.entities, ['q', 'r']).map((o) => o.key)).toEqual(['coincident', 'horizontal', 'vertical', 'distance']);
		const h = constraintOffers(s.entities, ['q', 'r']).find((o) => o.key === 'horizontal')!;
		expect(h.build()).toEqual([]);
		const drawn = h.apply!(s), line = newOf(s, drawn);
		expect(line).toEqual([expect.objectContaining({ type: 'line', a: 'q', b: 'r', construction: true })]);
		expect(drawn.constraints.slice(-1)).toEqual([expect.objectContaining({ type: 'horizontal', line: line[0].id })]);
		/* Joined already: the relation goes on the line that is there, and nothing is drawn. */
		const joined = constraintOffers(s.entities, ['p0', 'p1']).find((o) => o.key === 'vertical')!;
		expect(joined.apply).toBeUndefined(); expect(joined.build()).toEqual([expect.objectContaining({ type: 'vertical', line: 'l0' })]);
		/* Coincident JOINS: one point fewer, nothing added to the constraint list. */
		const merged = constraintOffers(s.entities, ['q', 'r']).find((o) => o.key === 'coincident')!.apply!(s);
		expect(merged.entities.filter((e) => e.type === 'point')).toHaveLength(s.entities.filter((e) => e.type === 'point').length - 1);
		expect(merged.constraints).toHaveLength(s.constraints.length);
		/* A line's own two ends cannot be joined, so it is not offered there. */
		expect(constraintOffers(s.entities, ['p0', 'p1']).map((o) => o.key)).not.toContain('coincident');
	});
	it('offers Symmetric about a line, and not about a line one of the points ends', () => {
		const s = pts();
		expect(constraintOffers(s.entities, ['q', 'r', 'l2']).map((o) => o.key)).toEqual(['symmetric']);
		expect(constraintOffers(s.entities, ['q', 'r', 'l2'])[0].build()).toEqual([expect.objectContaining({ type: 'symmetric', a: 'q', b: 'r', axis: 'l2' })]);
		expect(constraintOffers(s.entities, ['q', 'p2', 'l2'])).toEqual([]);
	});
	it('offers Point on line except for a line\'s own end, and Collinear as the loose ends only', () => {
		const s = pts();
		expect(constraintOffers(s.entities, ['q', 'l0']).map((o) => o.key)).toEqual(['midpoint', 'onLine', 'pointLineDistance']);
		expect(constraintOffers(s.entities, ['p1', 'l0']).map((o) => o.key)).toEqual(['midpoint', 'pointLineDistance']);
		expect(constraintOffers(s.entities, ['l0', 'l1']).map((o) => o.key)).toEqual(['parallel', 'perpendicular', 'equal', 'collinear', 'angle']);
		/* l0 and l1 share p1, so only p2 is held on l0; l0 and l2 share nothing, so both of l2's ends are. */
		expect(constraintOffers(s.entities, ['l0', 'l1']).find((o) => o.key === 'collinear')!.build()).toEqual([expect.objectContaining({ type: 'pointLineDistance', point: 'p2', line: 'l0', value: 0 })]);
		expect(constraintOffers(s.entities, ['l0', 'l2']).find((o) => o.key === 'collinear')!.build().map((c) => (c as { point: string }).point)).toEqual(['p2', 'p3']);
	});
	it('offers Tangent where a line and an arc, or two arcs, share an end, and nowhere else', () => {
		const e = [P('c', 0, 1), P('s', 0, 0), P('e', 1, 1), { id: 'u', type: 'arc', center: 'c', start: 's', end: 'e' } as SketchEntity, P('q', -3, 0.4), L('l', 'q', 's'), P('c2', 1, 3), P('e2', 1, 4), { id: 'w', type: 'arc', center: 'c2', start: 'e', end: 'e2' } as SketchEntity, P('f', 5, 5), P('g', 6, 5), L('far', 'f', 'g'), { id: 'v', type: 'arc', center: 'c', start: 'f', end: 'g' } as SketchEntity];
		expect(constraintOffers(e, ['l', 'u']).map((o) => o.key)).toEqual(['tangent']);
		expect(constraintOffers(e, ['l', 'u'])[0].build()).toEqual([expect.objectContaining({ type: 'tangentLineArc', line: 'l', arc: 'u', point: 's' })]);
		expect(constraintOffers(e, ['u', 'w']).map((o) => o.key)).toEqual(['equalRadius', 'concentric', 'tangent']);
		expect(constraintOffers(e, ['u', 'w'])[2].build()).toEqual([expect.objectContaining({ type: 'tangentArcArc', arc1: 'u', arc2: 'w', point: 'e' })]);
		/* Sharing only a CENTER, or nothing, is no tangency point. */
		expect(constraintOffers(e, ['u', 'v']).map((o) => o.key)).toEqual(['equalRadius', 'concentric']);
		expect(constraintOffers(e, ['far', 'u'])).toEqual([]);
	});
	it('does not offer a relation the sketch already holds', () => {
		const s = rect();
		expect(constraintOffers(s.entities, ['l0']).map((o) => o.key)).toEqual(['horizontal', 'vertical', 'distance']);
		expect(constraintOffers(s.entities, ['l0'], s.constraints).map((o) => o.key)).toEqual(['vertical', 'distance']);
	});
});

describe('against the real kernel', () => {
	it('every offered relation converges to what its name says, and none reads Over defined or Cannot be solved', async () => {
		const k = await createKernel(WASM);
		const solve = (entities: SketchEntity[], constraints: SketchConstraint[]) => solveSketch(k, { entities, constraints });
		const ok = (r: ReturnType<typeof solve>) => { expect(r.report.converged).toBe(true); expect(['solved', 'underConstrained']).toContain(r.report.classification); expect(r.report.trouble).toEqual([]); };
		const fixed = (id: string, x: number, y: number): SketchEntity => ({ id, type: 'point', x, y, fixed: true });
		{
			const e = [fixed('a', 0, 0), fixed('b', 4, 0), L('l1', 'a', 'b'), P('c', 5, 0.5), P('d', 7, 1), L('l2', 'c', 'd')];
			const r = solve(e, constraintOffers(e, ['l1', 'l2']).find((o) => o.key === 'collinear')!.build()); ok(r);
			expect(pointOf(r.entities, 'c')[1]).toBeCloseTo(0, 9); expect(pointOf(r.entities, 'd')[1]).toBeCloseTo(0, 9);
		}
		{
			const e = [P('c', 0, 1), P('s', 0, 0), P('e', 1, 1), { id: 'u', type: 'arc', center: 'c', start: 's', end: 'e' } as SketchEntity, P('q', -3, 0.4), L('l', 'q', 's')];
			const r = solve(e, constraintOffers(e, ['l', 'u'])[0].build()); ok(r);
			const [c, s, q] = ['c', 's', 'q'].map((id) => pointOf(r.entities, id));
			/* Tangent: the line runs square to the radius at the shared end. */
			expect(Math.abs((s[0] - q[0]) * (s[0] - c[0]) + (s[1] - q[1]) * (s[1] - c[1])) / (Math.hypot(s[0] - q[0], s[1] - q[1]) * Math.hypot(s[0] - c[0], s[1] - c[1]))).toBeLessThan(1e-6);
		}
		{
			const e = [fixed('a', 0, -2), fixed('b', 0, 2), L('ax', 'a', 'b'), P('p', -1, 0.5), P('q', 1.5, 0.2)];
			const r = solve(e, constraintOffers(e, ['p', 'q', 'ax'])[0].build()); ok(r);
			const p = pointOf(r.entities, 'p'), q = pointOf(r.entities, 'q');
			expect(p[0] + q[0]).toBeCloseTo(0, 9); expect(p[1] - q[1]).toBeCloseTo(0, 9);
		}
		{
			const e = [fixed('a', 0, 0), P('r', 3, 0.4)];
			const applied = constraintOffers(e, ['a', 'r']).find((o) => o.key === 'horizontal')!.apply!({ entities: e, constraints: [] });
			const r = solve(applied.entities, applied.constraints); ok(r);
			expect(pointOf(r.entities, 'r')[1]).toBeCloseTo(0, 9);
			/* A construction line bounds no region, so the relation drew nothing a profile could pick up. */
			expect(regions(r.entities)).toEqual([]);
		}
		{
			const e = [fixed('a', 0, 0), fixed('b', 4, 0), L('l', 'a', 'b'), P('p', 2, 1)];
			const r = solve(e, constraintOffers(e, ['p', 'l']).find((o) => o.key === 'onLine')!.build()); ok(r);
			expect(pointOf(r.entities, 'p')).toEqual([expect.closeTo(2, 9), expect.closeTo(0, 9)]);
		}
		k.free();
	});
	it('a snapped relation is load-bearing: move what it names and the point follows, strip it and the point stays behind', async () => {
		const k = await createKernel(WASM);
		const s = rect(), session = new SketchSession(); session.setTool('line');
		session.down([2.1, 3.1], ctx(s)); session.down([2.05, 5], ctx(s));
		const drawn = session.key('Enter', ctx(s)).commit!.sketch;
		const corner = newOf(s, drawn).find((e) => e.type === 'point' && e.x === 2 && e.y === 3)!.id;
		const at = solveSketch(k, drawn);
		expect(at.report.converged).toBe(true); expect(['solved', 'underConstrained']).toContain(at.report.classification);
		expect(pointOf(at.entities, corner)).toEqual([expect.closeTo(2, 9), expect.closeTo(3, 9)]);
		/* Pull the top edge's left end out to x = -2 (the rectangle has no dimensions, so the solver keeps it there). */
		const pulled = (d: SketchDraft) => ({ ...d, entities: d.entities.map((e) => (e.id === 'p3' ? { ...e, x: -2 } : e.id === 'p0' ? { ...e, x: -2 } : e)) });
		const held = solveSketch(k, pulled(drawn)), stripped = solveSketch(k, pulled({ ...drawn, constraints: drawn.constraints.filter((c) => c.type !== 'midpoint') }));
		const mid = (r: typeof held) => (pointOf(r.entities, 'p2')[0] + pointOf(r.entities, 'p3')[0]) / 2;
		expect(pointOf(held.entities, corner)[0]).toBeCloseTo(mid(held), 9);
		expect(Math.abs(pointOf(stripped.entities, corner)[0] - mid(stripped))).toBeGreaterThan(0.5);
		k.free();
	});
	it('one undo on the real engine takes the inferred relation away with the line that brought it', async () => {
		const e = await SolidEngine.create(WASM); engines.push(e);
		const s = rect();
		await e.apply({ type: 'add-feature', feature: { id: 'sk', name: 'Sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: s.entities, constraints: s.constraints } as Feature });
		const session = new SketchSession(); session.setTool('line');
		session.down([2.1, 3.1], ctx(s)); session.down([2.05, 5], ctx(s));
		const commit = session.key('Enter', ctx(s)).commit!;
		const after = await e.apply({ type: 'set-feature', id: 'sk', patch: { entities: commit.sketch.entities, constraints: commit.sketch.constraints } });
		expect(types(after.sketches[0].constraints)).toEqual(['horizontal', 'vertical', 'horizontal', 'vertical', 'midpoint', 'vertical']);
		expect(after.sketches[0].entities.filter((x) => x.type === 'line')).toHaveLength(5);
		const back = await e.undo();
		expect(types(back.sketches[0].constraints)).toEqual(['horizontal', 'vertical', 'horizontal', 'vertical']);
		expect(back.sketches[0].entities.filter((x) => x.type === 'line')).toHaveLength(4);
	});
});

describe('nothing stored changed shape', () => {
	it('every sketch this bundle writes survives a JSON round trip and the document validator unchanged', () => {
		const s = rect();
		const line = new SketchSession(); line.setTool('line');
		line.down([2.1, 3.1], ctx(s)); line.down([4.05, 4.08], ctx(s)); line.down([6, 4.1], ctx(s));
		const chained = line.key('Enter', ctx(s)).commit!.sketch;
		const offers = { entities: [...chained.entities, P('q', 7, 1), P('r', 9, 2.5)], constraints: chained.constraints };
		const construction = constraintOffers(offers.entities, ['q', 'r']).find((o) => o.key === 'vertical')!.apply!(offers);
		const all: SketchDraft = { entities: construction.entities, constraints: [...construction.constraints, ...constraintOffers(construction.entities, ['l0', 'l2']).find((o) => o.key === 'collinear')!.build(), ...constraintOffers(construction.entities, ['q', 'r', 'l3'])[0].build()] };
		/* What is being validated has every inferred and offered kind in it, so a pass is not a pass over nothing. */
		expect(new Set(types(all.constraints))).toEqual(new Set(['horizontal', 'vertical', 'midpoint', 'pointLineDistance', 'symmetric']));
		expect(all.entities.some((e) => e.type === 'line' && e.construction)).toBe(true);
		const feature: FeatureOf<'sketch'> = { id: 'sk', name: 'Sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: all.entities, constraints: all.constraints };
		const trip = JSON.parse(JSON.stringify(feature));
		expect(trip).toEqual(feature);
		expect(() => validateFeature(trip, new Set())).not.toThrow();
		expect(() => validateManifest({ ...emptyManifest(), features: [trip] })).not.toThrow();
		/* The negative control: a kind outside the stored vocabulary is refused, so the validator was looking. */
		expect(() => validateFeature({ ...trip, constraints: [...trip.constraints, { id: 'x', type: 'pointOnLine', point: 'q', line: 'l0' }] }, new Set())).toThrow(/known type/);
	});
});

