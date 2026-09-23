// tests/ideacad-solid-selection.test.ts
//
// WHAT A PRESS, A HOVER AND A BOX PICK. Every rule pinned here fails SILENTLY
// in use: a box that reads its direction backwards picks the wrong things with
// nothing on screen to say which rule ran; a boundary that is not inside makes
// an edge along the box's side a coin toss; a box that picks the edges behind a
// block rounds edges nobody could see; a Hole press that takes the sketch on
// the face extrudes the sketch (F036); a drawing press that takes the edge
// beside a face draws on the wrong plane (F031); and a loop that walks across
// to a hole's rim selects edges that are not the loop. Each absence is paired
// with a positive control, and each generated case list asserts its own count.
import { describe, expect, it } from 'vitest';
import { BOX_WORDS, boxMode, boxRect, boxSelect, inTriangle, segmentTouches, triangleTouches, type ScreenRect } from '../src/lib/ideacad/solid/viewport/box-select';
import { edgeLoop, loopFace } from '../src/lib/ideacad/solid/viewport/edge-loop';
import { orderPicks, selectionKey, type PickHit, type PickRules } from '../src/lib/ideacad/solid/viewport/pick';
import type { BodyProjection, EdgeProjection, FaceProjection, Selection, Vec3, VertexProjection } from '../src/lib/ideacad/solid/types';

/* A top-down orthographic projection: 100px per inch, screen y down. */
const project = (p: Vec3) => ({ x: p[0] * 100, y: -p[1] * 100 });
const rect = (left: number, top: number, right: number, bottom: number): ScreenRect => ({ left, top, right, bottom });
function face(id: string, corners: Vec3[], edges: string[] = []): FaceProjection {
	const positions = new Float32Array(corners.flat()), c = corners.reduce((a, p) => [a[0] + p[0] / corners.length, a[1] + p[1] / corners.length, a[2] + p[2] / corners.length] as Vec3, [0, 0, 0] as Vec3);
	return { id, kind: 'plane', center: c, normal: [0, 0, 1], area: 1, surface: {}, positions, normals: new Float32Array(corners.length * 3), indices: new Uint32Array(corners.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]), edges };
}
function edge(id: string, points: Vec3[], faces: string[]): EdgeProjection {
	const mid = points[Math.floor(points.length / 2)];
	return { id, curve: 'LINE', points: new Float32Array(points.flat()), faces, length: 1, mid };
}
const vertex = (id: string, point: Vec3): VertexProjection => ({ id, point, faces: [] });
/** A unit square plate at height z, offset by (dx, dy): one top face, its four edges, its four corners. */
function plate(id: string, z: number, dx = 0, dy = 0, size = 1): BodyProjection {
	const p = (x: number, y: number): Vec3 => [dx + x * size, dy + y * size, z];
	const top = `${id}-top`;
	const edges = [edge(`${id}-e0`, [p(0, 0), p(1, 0)], [top, 's0']), edge(`${id}-e1`, [p(1, 0), p(1, 1)], [top, 's1']), edge(`${id}-e2`, [p(1, 1), p(0, 1)], [top, 's2']), edge(`${id}-e3`, [p(0, 1), p(0, 0)], [top, 's3'])];
	return { id, name: id, materialId: null, role: 'part', faces: [face(`${id}-top`, [p(0, 0), p(1, 0), p(1, 1), p(0, 1)], edges.map((e) => e.id))], edges, vertices: [vertex(`${id}-v0`, p(0, 0)), vertex(`${id}-v1`, p(1, 0)), vertex(`${id}-v2`, p(1, 1)), vertex(`${id}-v3`, p(0, 1))], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, bounds: [dx, dy, z, dx + size, dy + size, z], volume: 1, centerOfMass: p(0.5, 0.5), inertia: [], createdBy: id } as BodyProjection;
}
const ids = (list: Selection[]) => list.map((s) => `${s.kind}:${s.id}`);

describe('box direction', () => {
	it('left to right is a window (Inside), right to left a crossing (Touching); straight down reads as a window', () => {
		expect(boxMode({ x: 10, y: 10 }, { x: 50, y: 60 })).toBe('window');
		expect(boxMode({ x: 50, y: 10 }, { x: 10, y: 60 })).toBe('crossing');
		expect(boxMode({ x: 50, y: 60 }, { x: 10, y: 10 })).toBe('crossing');
		expect(boxMode({ x: 30, y: 10 }, { x: 30, y: 90 })).toBe('window');
		expect(BOX_WORDS).toEqual({ window: 'Inside', crossing: 'Touching' });
		expect(boxRect({ x: 50, y: 60 }, { x: 10, y: 10 })).toEqual(rect(10, 10, 50, 60));
	});
});

describe('the geometry of touching', () => {
	const r = rect(0, 0, 10, 10);
	it('a segment touches when an end is inside, when it crosses, and when it only grazes the boundary', () => {
		expect(segmentTouches({ x: 5, y: 5 }, { x: 50, y: 50 }, r)).toBe(true);
		expect(segmentTouches({ x: -5, y: 5 }, { x: 15, y: 5 }, r)).toBe(true);
		expect(segmentTouches({ x: -5, y: 0 }, { x: 15, y: 0 }, r)).toBe(true);
		expect(segmentTouches({ x: 10, y: 20 }, { x: 10, y: 10 }, r)).toBe(true);
		/* Positive control for the absences: the same segment moved a hair outside. */
		expect(segmentTouches({ x: -5, y: -0.01 }, { x: 15, y: -0.01 }, r)).toBe(false);
		expect(segmentTouches({ x: 11, y: -5 }, { x: 11, y: 15 }, r)).toBe(false);
		expect(segmentTouches({ x: 20, y: -5 }, { x: 25, y: 30 }, r)).toBe(false);
	});
	it('a triangle touches when one of its sides does, or when the box sits wholly inside it; winding does not matter', () => {
		const big = [{ x: -100, y: -100 }, { x: 100, y: -100 }, { x: 0, y: 100 }] as const;
		expect(triangleTouches(big[0], big[1], big[2], r)).toBe(true);
		expect(triangleTouches(big[2], big[1], big[0], r)).toBe(true);
		expect(inTriangle({ x: 5, y: 5 }, big[0], big[1], big[2])).toBe(true);
		expect(triangleTouches({ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 25, y: 30 }, r)).toBe(false);
	});
});

describe('box select over the projection', () => {
	const a = plate('A', 1), bodies = [a];
	const all = ['face', 'edge', 'vertex'] as const;
	it('a window picks only what lies fully inside, a crossing anything it touches', () => {
		/* The plate is x 0..100, y -100..0 on screen. A window over its left half holds the left edge whole and nothing else of it. */
		const half = rect(-10, -110, 50, 10);
		expect(ids(boxSelect({ bodies }, half, 'window', all, { project }))).toEqual(['edge:A-e3', 'vertex:A-v0', 'vertex:A-v3']);
		expect(ids(boxSelect({ bodies }, half, 'crossing', all, { project }))).toEqual(['face:A-top', 'edge:A-e0', 'edge:A-e2', 'edge:A-e3', 'vertex:A-v0', 'vertex:A-v3']);
		/* Positive control: a window around the whole plate picks all nine. */
		expect(boxSelect({ bodies }, rect(-10, -110, 110, 10), 'window', all, { project })).toHaveLength(9);
	});
	it('AN ITEM EXACTLY ON THE BOUNDARY IS INSIDE, for both rules', () => {
		/* The window's sides lie exactly on the plate's outline. */
		expect(boxSelect({ bodies }, rect(0, -100, 100, 0), 'window', all, { project })).toHaveLength(9);
		/* A crossing whose top edge lies exactly along the bottom edge (screen y 0) touches that edge and its face, nothing else. */
		expect(ids(boxSelect({ bodies }, rect(40, 0, 60, 30), 'crossing', all, { project }))).toEqual(['face:A-top', 'edge:A-e0']);
		/* A window whose corner sits exactly on a corner picks that corner. */
		expect(ids(boxSelect({ bodies }, rect(90, -10, 130, 0), 'window', ['vertex'], { project }))).toEqual(['vertex:A-v1']);
		/* Positive control: a hair past the boundary is outside. */
		expect(boxSelect({ bodies }, rect(40, 0.01, 60, 30), 'crossing', all, { project })).toEqual([]);
	});
	it('a crossing drawn wholly inside one face touches the face and none of its edges; a window there picks nothing', () => {
		expect(ids(boxSelect({ bodies }, rect(30, -70, 60, -40), 'crossing', all, { project }))).toEqual(['face:A-top']);
		expect(boxSelect({ bodies }, rect(30, -70, 60, -40), 'window', all, { project })).toEqual([]);
	});
	it('the kinds asked for are the only kinds returned', () => {
		const whole = rect(-10, -110, 110, 10);
		expect(ids(boxSelect({ bodies }, whole, 'window', ['edge'], { project }))).toEqual(['edge:A-e0', 'edge:A-e1', 'edge:A-e2', 'edge:A-e3']);
		expect(ids(boxSelect({ bodies }, whole, 'window', ['body'], { project }))).toEqual(['body:A']);
		expect(ids(boxSelect({ bodies }, whole, 'window', ['face'], { project }))).toEqual(['face:A-top']);
	});
	it('A BODY BEHIND ANOTHER: a box around both picks both bodies, but only the surface items that can be seen', () => {
		/* B sits exactly under A (z 0 against z 1), so from above every point of B is hidden behind A. */
		const b = plate('B', 0), both = [a, b], whole = rect(-10, -110, 110, 10);
		const visible = (points: Vec3[]) => points.some((p) => p[2] >= 0.5);
		expect(ids(boxSelect({ bodies: both }, whole, 'window', ['body'], { project, visible }))).toEqual(['body:A', 'body:B']);
		const surface = ids(boxSelect({ bodies: both }, whole, 'window', all, { project, visible }));
		expect(surface).toHaveLength(9);
		expect(surface.every((s) => s.includes(':A-'))).toBe(true);
		/* Positive control: with nothing hidden, B's nine come back too. */
		expect(boxSelect({ bodies: both }, whole, 'window', all, { project })).toHaveLength(18);
		/* And a hidden body is not boxed at all. */
		expect(ids(boxSelect({ bodies: both }, whole, 'window', ['body'], { project, hidden: new Set(['A']) }))).toEqual(['body:B']);
	});
	it('a body is picked by a window only when all of it is inside, and by a crossing when any of it is', () => {
		const wide = plate('W', 0, 0, 0, 2);
		expect(boxSelect({ bodies: [wide] }, rect(-10, -110, 110, 10), 'window', ['body'], { project })).toEqual([]);
		expect(ids(boxSelect({ bodies: [wide] }, rect(-10, -110, 110, 10), 'crossing', ['body'], { project }))).toEqual(['body:W']);
	});
});

describe('select loop', () => {
	/* A top face whose outline is four edges and which has one round hole: the rim is one closed edge. */
	const rim: Vec3[] = Array.from({ length: 17 }, (_, i) => [0.5 + 0.2 * Math.cos((i / 16) * Math.PI * 2), 0.5 + 0.2 * Math.sin((i / 16) * Math.PI * 2), 1]);
	const body = plate('A', 1);
	body.edges.push(edge('rim', rim, ['A-top', 'hole-wall']));
	body.faces[0].edges.push('rim');
	body.faces.push({ ...face('s0', [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], ['A-e0']), kind: 'plane' });
	it('an outline edge gives the four outline edges, walked end to end, and never the hole rim', () => {
		const loop = edgeLoop(body, 'A-e1', 'A-top');
		expect(loop[0]).toBe('A-e1');
		expect([...loop].sort()).toEqual(['A-e0', 'A-e1', 'A-e2', 'A-e3']);
	});
	it('the rim is a loop on its own: a closed edge joins nothing', () => {
		expect(edgeLoop(body, 'rim', 'A-top')).toEqual(['rim']);
	});
	it('the loop runs around the face asked for; an edge not on the body gives nothing', () => {
		/* Around the side face s0, whose only edge on this body is A-e0. */
		expect(edgeLoop(body, 'A-e0', 's0')).toEqual(['A-e0']);
		expect(edgeLoop(body, 'nope', 'A-top')).toEqual([]);
	});
	it('which face: the one under the pointer first, then a flat one, then the first', () => {
		expect(loopFace(body, 'A-e0', ['s0'])).toBe('s0');
		expect(loopFace(body, 'A-e0', ['elsewhere'])).toBe('A-top');
		expect(loopFace(body, 'rim', [])).toBe('A-top');
	});
});

describe('what a press or a hover takes', () => {
	const sel = (kind: Selection['kind'], id: string, bodyId = 'b'): Selection => ({ bodyId, kind, id });
	const hit = (s: Selection, part: PickHit['part'], distance: number, datumPart?: PickHit['datumPart']): PickHit => ({ selection: s, part, distance, point: [0, 0, 0], datumPart });
	/* The ray meets, nearest first: Top plane's fill in front of everything, a sketch lying on the front face, the front face, an edge and a vertex on it, and a face and an edge of the body behind. */
	const hits: PickHit[] = [
		hit(sel('reference', 'datum:XY', ''), 'datum', 1, 'fill'),
		hit(sel('sketch', 'sk', ''), 'sketch', 4.999, undefined),
		hit(sel('face', 'front'), 'face', 5),
		hit(sel('edge', 'rim'), 'edge', 5.005),
		hit(sel('vertex', 'corner'), 'vertex', 5.01),
		hit(sel('face', 'behind'), 'face', 8),
		hit(sel('edge', 'back-edge'), 'edge', 8.001)
	];
	const rules = (over: Partial<PickRules> = {}): PickRules => ({ allowed: null, drawing: false, edgesFirst: false, referencesWin: true, alt: false, epsilon: 0.025, ...over });
	const best = (list: PickHit[], over?: Partial<PickRules>) => { const b = orderPicks(list, rules(over)).best; return b ? `${b.selection.kind}:${b.selection.id}` : null; };
	it('the precedence: a sketch on the face, then a corner, an edge, the face, and a plane last', () => {
		expect(best(hits)).toBe('sketch:sk');
		const noSketch = hits.filter((h) => h.part !== 'sketch');
		expect(best(noSketch)).toBe('vertex:corner');
		expect(best(noSketch, { edgesFirst: true })).toBe('edge:rim');
		expect(best(noSketch, { alt: true })).toBe('face:front');
		expect(best(noSketch.filter((h) => h.part !== 'vertex' && h.part !== 'edge'))).toBe('face:front');
		/* Nothing of a body under the pointer: a plane's outline is taken, its fill only by a drawing tool. */
		expect(best([hit(sel('reference', 'datum:XY', ''), 'datum', 1, 'fill')])).toBeNull();
		expect(best([hit(sel('reference', 'datum:XY', ''), 'datum', 1, 'fill')], { drawing: true, allowed: new Set(['face', 'reference']) })).toBe('reference:datum:XY');
		expect(best([hit(sel('reference', 'datum:XY', ''), 'datum', 1, 'outline')])).toBe('reference:datum:XY');
	});
	it('F036: a tool that takes a face never takes the sketch lying on it; F031: a drawing press never takes the edge beside the face', () => {
		expect(best(hits, { allowed: new Set(['face']) })).toBe('face:front');
		expect(best(hits, { allowed: new Set(['face', 'reference']), drawing: true })).toBe('face:front');
		/* Positive control: Select, which takes anything, does take the sketch and, without one, the corner. */
		expect(best(hits)).toBe('sketch:sk');
	});
	it('what is behind the nearest face is never the press, even for Fillet, whatever the filter', () => {
		expect(best(hits.filter((h) => h.part !== 'edge' || h.selection.id !== 'rim').filter((h) => h.part !== 'vertex' && h.part !== 'sketch'), { edgesFirst: true })).toBe('face:front');
		/* A filter that takes only edges: the front rim, never the back edge; with the rim gone, nothing (the face still hides what is behind it). */
		expect(best(hits, { allowed: new Set(['edge']) })).toBe('edge:rim');
		expect(best(hits.filter((h) => h.selection.id !== 'rim'), { allowed: new Set(['edge']) })).toBeNull();
	});
	it('Select Other lists every distinct thing under the pointer, nearest first, in the kinds allowed', () => {
		const all = orderPicks([...hits, hit(sel('face', 'front'), 'face', 5.2)], rules()).all.map((h) => selectionKey(h.selection));
		expect(all).toEqual(['reference||datum:XY', 'sketch||sk', 'face|b|front', 'edge|b|rim', 'vertex|b|corner', 'face|b|behind', 'edge|b|back-edge']);
		expect(orderPicks(hits, rules({ allowed: new Set(['face']) })).all.map((h) => h.selection.id)).toEqual(['front', 'behind']);
	});
});
