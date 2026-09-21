// tests/ideacad-solid-sketching-session.test.ts
//
// THE POINTER STATE MACHINE, driven with plane coordinates and no DOM: what a
// press, a move, a release and a key produce for each sketch tool, as the
// COMMIT the panel would apply and the PREVIEW the layer would draw. Every
// gating claim is asserted in both directions (a read-only context refuses
// and a writable one commits; a fixed point refuses a drag and a free one
// moves), and a refusal is a sentence, never a silent nothing.
import { describe, expect, it } from 'vitest';
import type { SketchEntity, Vec2 } from '../src/lib/ideacad/solid/types';
import { SketchSession, constraintOffers, constraintLabel, entityLabel, rectangleEntities, type SessionContext, type SketchDraft } from '../src/lib/ideacad/solid/sketch/editor';
import { regions, pointOf } from '../src/lib/ideacad/solid/sketch/model';

const rectangle = (): SketchDraft => {
	const s = rectangleEntities([0, 0], [4, 3]);
	/* Stable ids for the assertions: the drafts mint random ones. */
	const ids = new Map<string, string>(); let p = 0, l = 0, k = 0;
	for (const e of s.entities) ids.set(e.id, e.type === 'point' ? `p${p++}` : `l${l++}`);
	const rename = (id: string) => ids.get(id) ?? id;
	return { entities: s.entities.map((e): SketchEntity => e.type === 'point' ? { ...e, id: rename(e.id) } : e.type === 'line' ? { id: rename(e.id), type: 'line', a: rename(e.a), b: rename(e.b) } : e), constraints: s.constraints.map((c) => ({ ...c, id: `k${k++}`, ...('line' in c ? { line: rename(c.line) } : {}) }) as typeof c) };
};
const ctx = (sketch: SketchDraft, over: Partial<SessionContext> = {}): SessionContext => ({ entities: sketch.entities, constraints: sketch.constraints, tolerance: 0.15, snapRadius: 0.25, polygonSides: 6, filletRadius: 0.5, canWrite: true, ...over });
const lines = (s: SketchDraft) => s.entities.filter((e) => e.type === 'line');

describe('drawing inside the sketch', () => {
	it('a line chain closes on its first point, shares a snapped existing point, and constrains level and plumb steps', () => {
		const s = rectangle(), session = new SketchSession(); session.setTool('line');
		expect(session.down([4.05, 3.05], ctx(s)).commit).toBeUndefined();
		expect(session.anchorCount).toBe(1);
		session.down([6, 3.1], ctx(s)); session.down([6.05, 5], ctx(s)); session.down([4, 5.02], ctx(s));
		expect(session.preview(ctx(s)).anchors).toHaveLength(4);
		const result = session.down([4.1, 3.1], ctx(s));
		expect(result.commit?.label).toBe('Draw closed outline');
		const next = result.commit!.sketch;
		expect(lines(next)).toHaveLength(8); expect(next.entities.filter((e) => e.type === 'point')).toHaveLength(7);
		/* The rectangle's four, then the chain's three snapped steps; the closing step back to the shared corner was not snapped and carries none. */
		expect(next.constraints.map((c) => c.type)).toEqual(['horizontal', 'vertical', 'horizontal', 'vertical', 'horizontal', 'vertical', 'horizontal']);
		expect(regions(next.entities).map((r) => r.area)).toEqual([12, 4]);
		expect(session.anchorCount).toBe(0);
	});
	it('Enter ends a chain open; Escape with one anchor cancels it; a read-only document refuses with a sentence', () => {
		const s = rectangle(), session = new SketchSession(); session.setTool('line');
		session.down([6, 0], ctx(s)); session.down([8, 0], ctx(s)); session.down([8, 2], ctx(s));
		const open = session.key('Enter', ctx(s));
		expect(open.commit?.label).toBe('Draw 2 lines'); expect(lines(open.commit!.sketch)).toHaveLength(6); expect(regions(open.commit!.sketch.entities)).toHaveLength(1);
		session.down([6, 6], ctx(s)); expect(session.key('Escape', ctx(s)).commit).toBeUndefined(); expect(session.anchorCount).toBe(0);
		const refused = session.down([6, 6], ctx(s, { canWrite: false }));
		expect(refused.error).toBe('This document is read-only.'); expect(refused.commit).toBeUndefined(); expect(session.anchorCount).toBe(0);
	});
	it('rectangle and circle drags commit on release, a click without a drag commits nothing, and the snapped center is shared', () => {
		const s = rectangle(), session = new SketchSession(); session.setTool('rectangle');
		session.down([6, 0], ctx(s)); session.move([8, 2], ctx(s));
		expect(session.preview(ctx(s)).polylines[0]).toEqual([[6, 0], [8, 0], [8, 2], [6, 2], [6, 0]]);
		const r = session.up([8, 2], ctx(s));
		expect(r.commit?.label).toBe('Draw rectangle'); expect(lines(r.commit!.sketch)).toHaveLength(8); expect(r.commit!.sketch.constraints).toHaveLength(8);
		session.down([6, 0], ctx(s)); expect(session.up([6.01, 0], ctx(s)).commit).toBeUndefined();
		session.setTool('circle'); session.down([4.05, 2.95], ctx(s)); session.move([4, 4], ctx(s));
		const c = session.up([4, 4], ctx(s));
		const circle = c.commit!.sketch.entities.find((e) => e.type === 'circle') as Extract<SketchEntity, { type: 'circle' }>;
		expect(circle.center).toBe('p2'); expect(circle.radius).toBeCloseTo(1, 12);
	});
	it('a polygon takes the side count from the context, refuses a count under three, and an arc takes three clicks', () => {
		const s = rectangle(), session = new SketchSession(); session.setTool('polygon');
		session.down([10, 10], ctx(s, { polygonSides: 8 })); session.move([12, 10], ctx(s, { polygonSides: 8 }));
		const eight = session.up([12, 10], ctx(s, { polygonSides: 8 }));
		expect(eight.commit?.label).toBe('Draw 8-sided polygon'); expect(lines(eight.commit!.sketch)).toHaveLength(12);
		session.down([10, 10], ctx(s)); session.move([12, 10], ctx(s));
		const two = session.up([12, 10], ctx(s, { polygonSides: 2 }));
		expect(two.error).toBe('A polygon needs a whole number of sides, at least 3.'); expect(two.commit).toBeUndefined();
		session.setTool('arc'); session.down([6, 0], ctx(s)); session.down([7, 0], ctx(s));
		expect(session.preview(ctx(s)).anchors).toHaveLength(2);
		const arc = session.down([6, 2], ctx(s));
		expect(arc.commit?.label).toBe('Draw arc');
		const a = arc.commit!.sketch.entities.find((e) => e.type === 'arc') as Extract<SketchEntity, { type: 'arc' }>;
		expect(pointOf(arc.commit!.sketch.entities, a.end)).toEqual([expect.closeTo(6, 12), expect.closeTo(1, 12)]);
	});
});

describe('select, move, join, delete', () => {
	it('a press selects, a drag past the tolerance moves the point, and the commit carries the new position', () => {
		const s = rectangle(), session = new SketchSession();
		expect(session.down([4.05, 3.05], ctx(s)).changed).toBe(true); expect(session.selected).toEqual(['p2']);
		expect(session.move([4.1, 3.1], ctx(s)).changed).toBe(false);
		session.move([5, 4], ctx(s));
		expect(session.dragging).toBe(true);
		const moved = session.preview(ctx(s)).moved!; expect(moved.curves.sort()).toEqual(['l1', 'l2']); expect(moved.entities.find((e) => e.id === 'p2')).toMatchObject({ x: 5, y: 4 });
		const r = session.up([5, 4], ctx(s));
		expect(r.commit?.label).toBe('Move point'); expect(pointOf(r.commit!.sketch.entities, 'p2')).toEqual([5, 4]);
		/* Dragging a line moves both its points and everything sharing them. */
		session.down([2, 0], ctx(s)); session.move([2, -1], ctx(s));
		const l = session.up([2, -1], ctx(s));
		expect(l.commit?.label).toBe('Move line'); expect(pointOf(l.commit!.sketch.entities, 'p0')).toEqual([0, -1]); expect(pointOf(l.commit!.sketch.entities, 'p1')).toEqual([4, -1]);
	});
	it('a point dropped on another point joins them; a fixed point refuses the drag with a sentence', () => {
		const open: SketchDraft = { entities: [{ id: 'a', type: 'point', x: 0, y: 0 }, { id: 'b', type: 'point', x: 4, y: 0 }, { id: 'c', type: 'point', x: 4, y: 3 }, { id: 'd', type: 'point', x: 0, y: 3 }, { id: 'e', type: 'point', x: 1, y: 1 }, { id: 'l0', type: 'line', a: 'a', b: 'b' }, { id: 'l1', type: 'line', a: 'b', b: 'c' }, { id: 'l2', type: 'line', a: 'c', b: 'd' }, { id: 'l3', type: 'line', a: 'd', b: 'e' }], constraints: [] };
		const session = new SketchSession();
		session.down([1, 1], ctx(open)); session.move([0.1, 0.1], ctx(open));
		expect(session.preview(ctx(open)).snap).toMatchObject({ kind: 'point', point: 'a' });
		const r = session.up([0.1, 0.1], ctx(open));
		expect(r.commit?.label).toBe('Join points'); expect(regions(r.commit!.sketch.entities)).toHaveLength(1);
		const fixed: SketchDraft = { ...open, entities: open.entities.map((e) => (e.id === 'e' ? { ...e, fixed: true } : e)) };
		const refused = session.down([1, 1], ctx(fixed));
		expect(refused.error).toBe('Point 5 is fixed in place. Remove its Fix constraint to move it.');
		session.move([2, 2], ctx(fixed)); expect(session.up([2, 2], ctx(fixed)).commit).toBeUndefined();
	});
	it('shift-click adds to the selection, Delete removes every selected entity, and Delete with nothing selected commits nothing', () => {
		const s = rectangle(), session = new SketchSession();
		session.down([2, 0], ctx(s)); session.up([2, 0], ctx(s));
		session.down([4, 1.5], ctx(s, { shift: true })); session.up([4, 1.5], ctx(s, { shift: true }));
		expect(session.selected).toEqual(['l0', 'l1']);
		const r = session.key('Delete', ctx(s));
		expect(r.commit?.label).toBe('Delete 2 entities'); expect(lines(r.commit!.sketch)).toHaveLength(2); expect(session.selected).toEqual([]);
		expect(session.key('Delete', ctx(s)).commit).toBeUndefined();
		session.down([2, 0], ctx(s)); expect(session.key('Delete', ctx(s, { canWrite: false })).error).toBe('This document is read-only.');
	});
	it('hover follows the pointer for the picking tools and names nothing for the drawing tools', () => {
		const s = rectangle(), session = new SketchSession();
		expect(session.move([2, 0.05], ctx(s)).changed).toBe(true); expect(session.hovered).toBe('l0');
		expect(session.move([2, 1.5], ctx(s)).changed).toBe(true); expect(session.hovered).toBeNull();
		session.setTool('trim'); session.move([0.02, 0.02], ctx(s)); expect(['l0', 'l3']).toContain(session.hovered);
		session.setTool('rectangle'); session.move([2, 0.05], ctx(s)); expect(session.hovered).toBeNull();
	});
});

describe('trim, extend and fillet through the session', () => {
	it('trim removes the pressed segment and refuses a press on nothing', () => {
		const s = rectangle(), session = new SketchSession(); session.setTool('trim');
		const r = session.down([2, 0], ctx(s));
		expect(r.commit?.label).toBe('Trim'); expect(lines(r.commit!.sketch)).toHaveLength(3);
		expect(session.down([9, 9], ctx(s)).error).toBe('Click the part of a line, arc or circle to remove.');
	});
	it('fillet takes a corner point in one press or two lines in two, and reports a radius the lines cannot hold', () => {
		const s = rectangle(), session = new SketchSession(); session.setTool('fillet');
		const one = session.down([4.02, 0.02], ctx(s));
		expect(one.commit?.label).toBe('Fillet corner'); expect(one.commit!.sketch.entities.filter((e) => e.type === 'arc')).toHaveLength(1);
		expect(session.down([2, 0], ctx(s)).commit).toBeUndefined(); expect(session.pendingFillet).toBe('l0');
		const two = session.down([4, 1.5], ctx(s));
		expect(two.commit?.label).toBe('Fillet corner'); expect(session.pendingFillet).toBeNull();
		session.down([2, 0], ctx(s));
		expect(session.down([4, 1.5], ctx(s, { filletRadius: 9 })).error).toMatch(/larger than the lines allow/);
		expect(session.down([2, 0], ctx(s)).commit).toBeUndefined(); expect(session.down([2, 3], ctx(s)).error).toBe('Pick two lines that meet at a corner.');
	});
	it('extend names what it cannot do rather than doing nothing', () => {
		const s = rectangle(), session = new SketchSession(); session.setTool('extend');
		expect(session.down([2, 0.02], ctx(s)).error).toMatch(/Nothing lies ahead/);
		expect(session.down([9, 9], ctx(s)).error).toBe('Click a line near the end to extend.');
	});
});

describe('constraint offers and labels', () => {
	it('offers what the selection can take, seeded with the measured value', () => {
		const s = rectangle();
		expect(constraintOffers(s.entities, ['l0']).map((o) => o.key)).toEqual(['horizontal', 'vertical', 'distance']);
		expect(constraintOffers(s.entities, ['l0']).find((o) => o.key === 'distance')!.value).toBe(4);
		expect(constraintOffers(s.entities, ['l0', 'l1']).map((o) => o.key)).toEqual(['parallel', 'perpendicular', 'equal', 'angle']);
		expect(constraintOffers(s.entities, ['l0', 'l1']).find((o) => o.key === 'angle')!.value).toBeCloseTo(90, 9);
		expect(constraintOffers(s.entities, ['p0', 'p2']).find((o) => o.key === 'distance')!.value).toBe(5);
		expect(constraintOffers(s.entities, ['p0']).map((o) => o.key)).toEqual(['fix']);
		expect(constraintOffers(s.entities, ['p0'])[0].build().map((c) => c.type)).toEqual(['fixX', 'fixY']);
		expect(constraintOffers(s.entities, [])).toEqual([]);
		expect(constraintOffers(s.entities, ['l0'])[2].build(7)[0]).toMatchObject({ type: 'distance', a: 'p0', b: 'p1', value: 7 });
	});
	it('labels an entity by its ordinal among its type and a constraint by its word and names', () => {
		const s = rectangle();
		expect(entityLabel(s.entities, 'l2')).toBe('Line 3'); expect(entityLabel(s.entities, 'p0')).toBe('Point 1'); expect(entityLabel(s.entities, 'nope')).toBe('Entity');
		expect(constraintLabel(s.entities, s.constraints[0])).toEqual({ word: 'Horizontal', names: 'Line 1' });
		expect(constraintLabel(s.entities, { id: 'd', type: 'distance', a: 'p0', b: 'p1', value: 4 })).toEqual({ word: 'Distance', names: 'Point 1, Point 2', value: 4, unit: 'in' });
	});
});
