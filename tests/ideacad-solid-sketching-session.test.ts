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
import { regions, pointOf, arcSweep, arcSweepToward, inconsistentArcs, samples } from '../src/lib/ideacad/solid/sketch/model';

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

/**
 * THE ARC TOOL, WHICH A STUDENT REPORTED ON 2026-09-21 AS "isn't helpful and
 * causes great issue" AGAINST BUILD 3793ea2.
 *
 * THE TABLE BELOW IS THE ANSWER TO THAT REPORT and is the reason this block
 * is table-driven rather than a handful of cases. Every arc used to sweep
 * COUNTER-CLOCKWISE whatever the third click said, because the entity has no
 * direction field and the tool read `arcSweep`, which normalizes into
 * (0, 2pi] -- correct for READING a stored arc back, wrong for deciding which
 * arc somebody just drew. Measured on the deployed code, center (0,0) and
 * start (1,0): a click ten degrees below the start gave 350 degrees, ninety
 * below gave 270, and a click a hundredth of an inch below gave 359.427, a
 * near-circle bulging away from the click. The `was` column is that code's
 * answer, transcribed from a run of it, and it is here so the row says what
 * CHANGED and not merely what holds.
 */
describe('the arc tool: which way round, and how far', () => {
	const C: Vec2 = [0, 0], S: Vec2 = [1, 0];
	const at = (deg: number, r = 1): Vec2 => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)];
	const bare = (): SketchDraft => ({ entities: [], constraints: [] });
	/** The arc a three-click sequence commits, with its center, start and end resolved. */
	function drawn(third: Vec2, over: Partial<SessionContext> = {}, sketch: SketchDraft = bare()) {
		const session = new SketchSession(); session.setTool('arc');
		session.down(C, ctx(sketch, over)); session.down(S, ctx(sketch, over));
		const result = session.down(third, ctx(sketch, over));
		if (!result.commit) return { result, arc: null, sweep: null, entities: [] as SketchEntity[] };
		const entities = result.commit.sketch.entities;
		const arc = entities.find((e) => e.type === 'arc') as Extract<SketchEntity, { type: 'arc' }>;
		const c = pointOf(entities, arc.center), s = pointOf(entities, arc.start), e = pointOf(entities, arc.end);
		/* Signed: `arcSweep` is the stored counter-clockwise run, and the stored start is the DRAWN start only when the drawn arc ran counter-clockwise. */
		const ccw = Math.abs(s[0] - S[0]) < 1e-9 && Math.abs(s[1] - S[1]) < 1e-9;
		return { result, arc, entities, sweep: (ccw ? 1 : -1) * arcSweep(c, s, e) * 180 / Math.PI };
	}

	/* degrees from the start, measured counter-clockwise; `was` is the deployed code's answer, `now` is this one's. */
	const TABLE: { label: string; third: Vec2; was: number; now: number }[] = [
		{ label: '10 degrees counter-clockwise', third: at(10), was: 10, now: 10 },
		{ label: '10 degrees clockwise', third: at(-10), was: 350, now: -10 },
		{ label: '90 degrees counter-clockwise', third: at(90), was: 90, now: 90 },
		{ label: '90 degrees clockwise', third: at(-90), was: 270, now: -90 },
		{ label: '170 degrees counter-clockwise', third: at(170), was: 170, now: 170 },
		{ label: '170 degrees clockwise', third: at(-170), was: 190, now: -170 },
		{ label: 'a hair below the start (0.01 in)', third: [1, -0.01], was: 359.427, now: -0.573 },
		{ label: 'a hair above the start (0.01 in)', third: [1, 0.01], was: 0.573, now: 0.573 },
		{ label: 'collinear, opposite side', third: [-2, 0], was: 180, now: 180 },
		{ label: 'well outside the radius, 90 clockwise', third: at(-90, 7), was: 270, now: -90 },
		{ label: 'well inside the radius, 90 clockwise', third: at(-90, 0.4), was: 270, now: -90 }
	];

	it('sweeps the short way round toward the third click, on whichever side of the start it fell', () => {
		const rows: string[] = [];
		for (const row of TABLE) {
			const { sweep } = drawn(row.third);
			rows.push(`${row.label.padEnd(34)} was ${row.was.toFixed(3).padStart(8)}   now ${sweep!.toFixed(3).padStart(8)}`);
			/*
			 * THE `was` COLUMN IS DERIVED, NOT TYPED IN. The deployed tool put
			 * the end on the ray to the third click and then read `arcSweep`,
			 * which projecting does not move -- so the old answer IS
			 * `arcSweep(center, start, third click)`, and that function is
			 * still here, unchanged, because reading a STORED arc back is
			 * still its job. A column of remembered numbers would be a column
			 * nothing can check; this one reddens if the claim about the old
			 * behaviour is wrong. (No row snaps: the sketch is empty, so there
			 * is no point to catch one, and every row sits further than the
			 * snap radius from the origin.)
			 */
			expect(arcSweep(C, S, row.third) * 180 / Math.PI, row.label).toBeCloseTo(row.was, 3);
			expect(sweep).toBeCloseTo(row.now, 3);
			/* The whole point: no third click may produce a near-whole turn any more. */
			expect(Math.abs(sweep!)).toBeLessThanOrEqual(180 + 1e-9);
		}
		console.log('\n  THIRD CLICK vs SWEEP, center (0,0) start (1,0), degrees\n  ' + rows.join('\n  ') + '\n');
		expect(rows).toHaveLength(11);
	});

	it('holding Shift takes the long way round to the same end point, and nothing else does', () => {
		for (const row of TABLE) {
			const minor = drawn(row.third), major = drawn(row.third, { shift: true });
			/* Same two points on the circle, the other way round: the sweeps have opposite signs and sum to a whole turn. */
			expect(Math.sign(major.sweep!)).toBe(-Math.sign(minor.sweep!));
			expect(Math.abs(minor.sweep!) + Math.abs(major.sweep!)).toBeCloseTo(360, 6);
			expect(Math.abs(major.sweep!)).toBeGreaterThanOrEqual(180 - 1e-9);
		}
	});

	it('every arc it can draw has one radius, snapped third click included, which the kernel requires and used not to hold', () => {
		/* An existing point 3 in from the center: the third click snaps to it, which is exactly what a student does to close a profile. */
		const sketch: SketchDraft = { entities: [{ id: 'far', type: 'point', x: 0, y: 3 }], constraints: [] };
		const radii: number[] = [];
		for (const third of [...TABLE.map((t) => t.third), [0, 3] as Vec2, [0.02, 2.98] as Vec2]) {
			for (const shift of [false, true]) {
				const { entities, arc } = drawn(third, { shift }, sketch);
				const all = [...sketch.entities, ...entities];
				const c = pointOf(all, arc!.center), s = pointOf(all, arc!.start), e = pointOf(all, arc!.end);
				const r = Math.hypot(s[0] - c[0], s[1] - c[1]), rEnd = Math.hypot(e[0] - c[0], e[1] - c[1]);
				expect(rEnd).toBeCloseTo(r, 12);
				expect(inconsistentArcs(all)).toEqual([]);
				radii.push(r);
			}
		}
		/* Positive control for the sweep: it ran, and every arc it drew was the unit circle the center and start describe. */
		expect(radii).toHaveLength(26);
		for (const r of radii) expect(r).toBeCloseTo(1, 12);
		/* And the arc does NOT quietly adopt the point it snapped to. The commit carries the sketch's own point plus the arc's three, and no curve in it names the snapped one. */
		const { entities, arc } = drawn([0, 3], {}, sketch);
		expect(entities.filter((e) => e.type === 'point').map((e) => e.id)).toContain('far');
		expect(entities.filter((e) => e.type === 'point')).toHaveLength(4);
		expect([arc!.center, arc!.start, arc!.end]).not.toContain('far');
		/* It does take the DIRECTION from it: the end is that point's bearing from the center, at the arc's own radius. */
		expect(pointOf(entities, arc!.end)).toEqual([expect.closeTo(0, 12), expect.closeTo(1, 12)]);
	});

	it('draws the arc it previewed, on a snapped third click as well as a loose one', () => {
		const sketch: SketchDraft = { entities: [{ id: 'far', type: 'point', x: 0, y: 3 }], constraints: [] };
		for (const [label, third] of [['loose', [0.7, 0.7]], ['snapped to a point off the radius', [0, 3]], ['clockwise', [0.7, -0.7]]] as [string, Vec2][]) {
			for (const shift of [false, true]) {
				const session = new SketchSession(); session.setTool('arc');
				session.down(C, ctx(sketch, { shift })); session.down(S, ctx(sketch, { shift }));
				session.move(third, ctx(sketch, { shift }));
				/* The preview's polylines are [center..start], the arc itself, then [center..end]. */
				const previewed = session.preview(ctx(sketch, { shift })).polylines[1];
				const result = session.down(third, ctx(sketch, { shift }));
				const entities = result.commit!.sketch.entities;
				const arc = entities.find((e) => e.type === 'arc') as Extract<SketchEntity, { type: 'arc' }>;
				const committed = samples(entities, arc);
				expect(previewed.length, label).toBe(committed.length);
				for (let i = 0; i < previewed.length; i++) {
					expect(previewed[i][0], `${label} shift=${shift} x[${i}]`).toBeCloseTo(committed[i][0], 12);
					expect(previewed[i][1], `${label} shift=${shift} y[${i}]`).toBeCloseTo(committed[i][1], 12);
				}
			}
		}
	});

	it('follows Shift pressed with the pointer still, because the redraw has no event to read it from', () => {
		const sketch = bare(), session = new SketchSession(); session.setTool('arc');
		session.down(C, ctx(sketch)); session.down(S, ctx(sketch)); session.move([0.7, 0.7], ctx(sketch));
		const minor = session.preview(ctx(sketch)).polylines[1];
		expect(session.setModifier(true)).toBe(true);
		const major = session.preview(ctx(sketch)).polylines[1];
		expect(major.length).toBeGreaterThan(minor.length);
		/* The same two points on the circle either way. They are not in the same ORDER: the long way round is clockwise here, and a clockwise arc is stored with its ends swapped, so its polyline runs from the new end back to the start. */
		const ends = (line: Vec2[]) => [line[0], line[line.length - 1]].map((q) => `${q[0].toFixed(9)},${q[1].toFixed(9)}`).sort();
		expect(ends(major)).toEqual(ends(minor));
		/* A key that changes nothing on screen asks for no redraw, and neither does a repeat. */
		expect(session.setModifier(true)).toBe(false);
		expect(session.setModifier(false)).toBe(true);
		session.setTool('select'); session.setTool('arc');
		expect(session.setModifier(true)).toBe(false);
	});

	it('refuses the three degenerate clicks in words, and commits the ordinary one beside them', () => {
		const s = bare();
		const start = new SketchSession(); start.setTool('arc');
		start.down([2, 2], ctx(s));
		expect(start.down([2, 2], ctx(s)).error).toBe('Pick the start of the arc away from its center.');
		expect(start.anchorCount).toBe(1);

		expect(drawn([0, 0]).result.error).toBe('Click away from the center to say where the arc ends.');
		/* Exactly on the center-to-start ray: the sweep is nothing at all, or a whole turn with Shift. */
		expect(drawn([2, 0]).result.error).toBe('Click to one side of the start to say how far the arc goes around.');
		expect(drawn([2, 0], { shift: true }).result.error).toBe('Click to one side of the start to say how far the arc goes around.');
		/* The positive control: a third of a degree off the ray still commits, because the tool refuses only what is not an arc. */
		const sliver = drawn(at(1 / 3));
		expect(sliver.result.error).toBeUndefined();
		expect(sliver.sweep).toBeCloseTo(1 / 3, 9);
		/* A hair above and a hair below the start give MIRROR slivers, which is the student's report answered in one line: below used to give 359.427 degrees the other way. */
		expect(drawn([2, 0.1]).sweep).toBeCloseTo(Math.atan2(0.1, 2) * 180 / Math.PI, 9);
		expect(drawn([2, -0.1]).sweep).toBeCloseTo(-Math.atan2(0.1, 2) * 180 / Math.PI, 9);
		/*
		 * AND A SNAP MUST NOT MANUFACTURE A REFUSAL. This sketch's center is
		 * the origin, so a third click inside the origin's snap radius is
		 * moved ONTO the center, where there is no direction at all -- an
		 * ordinary click turned into the refusal above by the snap alone.
		 */
		const nearOrigin = drawn([0.12, -0.12]);
		expect(nearOrigin.result.error).toBeUndefined();
		expect(nearOrigin.sweep).toBeCloseTo(-45, 9);
	});

	it('stores a clockwise arc with its ends swapped, so the entity shape and every reader of it are unchanged', () => {
		const ccw = drawn(at(90)), cw = drawn(at(-90));
		for (const { arc, entities } of [ccw, cw]) {
			const c = pointOf(entities, arc!.center), st = pointOf(entities, arc!.start), en = pointOf(entities, arc!.end);
			/* The invariant the whole codebase assumes: counter-clockwise from the stored start to the stored end, never more than a whole turn. */
			expect(arcSweep(c, st, en)).toBeLessThanOrEqual(Math.PI * 2 + 1e-9);
			expect(Object.keys(arc!).sort()).toEqual(['center', 'end', 'id', 'start', 'type']);
		}
		/* The drawn start is the STORED start counter-clockwise and the STORED END clockwise. */
		expect(pointOf(ccw.entities, ccw.arc!.start)).toEqual([expect.closeTo(1, 12), expect.closeTo(0, 12)]);
		expect(pointOf(cw.entities, cw.arc!.end)).toEqual([expect.closeTo(1, 12), expect.closeTo(0, 12)]);
		expect(arcSweep([0, 0], pointOf(cw.entities, cw.arc!.start), pointOf(cw.entities, cw.arc!.end)) * 180 / Math.PI).toBeCloseTo(90, 9);
	});

	it('places the start level or plumb with the center, and leaves the third click referenced to nothing', () => {
		const s = bare(), session = new SketchSession(); session.setTool('arc');
		session.down([0, 0], ctx(s));
		/* The second click, a shade above level with the center, lands LEVEL: the deployed tool referenced every arc click to nothing and could not offer that. */
		session.down([1, 0.05], ctx(s));
		const third = session.down([0.04, 2], ctx(s));
		const entities = third.commit!.sketch.entities;
		const arc = entities.find((e) => e.type === 'arc') as Extract<SketchEntity, { type: 'arc' }>;
		const st = pointOf(entities, arc.start), en = pointOf(entities, arc.end);
		expect(st).toEqual([expect.closeTo(1, 12), expect.closeTo(0, 12)]);
		/* The THIRD click is not snapped, so the end follows the click's own bearing rather than jumping to the axis. */
		expect(arcSweepToward([0, 0], st, en) * 180 / Math.PI).toBeCloseTo(Math.atan2(2, 0.04) * 180 / Math.PI, 9);
		expect(Math.hypot(en[0], en[1])).toBeCloseTo(1, 12);
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
