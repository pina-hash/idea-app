// tests/ideacad-solid-triad-layout.test.ts
//
// WHAT THE TRIAD OFFERS AND WHAT A PRESS ON IT GRABS, asserted on the objects
// `buildTriad` returns and on real raycasts through them, never on pixels.
// Every expected position is `TRIAD`'s own fractions times the scale, and
// every "grabs nothing" is paired with a "grabs this" on the same fixture.
//
// WHY THIS IS AUTOMATED. A handle without `userData.selection` throws inside
// `SolidViewport.down` on the next press; a visible part left in the pick
// path lets a thin shaft answer a press ahead of its fat hit twin, which is
// the stub's 7px target back again; a rotate tool that still drew arrows
// would offer a handle whose drag `commandFor` reads as a turn by vertical
// travel. None of those shows on screen as a fault.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AXIS_COLOURS, NO_RAYCAST, TRIAD, buildTriad, triadHandle, triadHandles, type TriadHandle, type TriadOptions } from '../src/lib/ideacad/solid/viewport/triad';
import type { LabelTexture } from '../src/lib/ideacad/solid/viewport/reference-layer';
import type { Selection, Vec3 } from '../src/lib/ideacad/solid/types';

/** A label made without a canvas: node has no `document`, so the test hands in its own texture. */
const stubLabel: LabelTexture = (text) => ({ texture: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), aspect: text.length * 0.6 });
const selection: Selection = { bodyId: 'b1', kind: 'body', id: 'b1' };
function build(tool: TriadOptions['tool'], scale = 1, center: Vec3 = [0, 0, 0]) {
	const group = new THREE.Group();
	buildTriad(group, { tool, selection, center, scale, label: stubLabel });
	group.updateMatrixWorld(true);
	return group;
}
/** What a press along this ray grabs first, exactly as the viewport asks: the nearest intersection in the triad group. */
function grab(group: THREE.Group, origin: Vec3, direction: Vec3): TriadHandle | null {
	const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize());
	ray.camera = new THREE.OrthographicCamera();
	return triadHandle(ray.intersectObject(group, true)[0]);
}
const down = (x: number, y: number, group: THREE.Group) => grab(group, [x, y, 5], [0, 0, -1]);
const key = (h: TriadHandle | null) => (h ? `${h.mode}:${h.label}` : null);
const sprites = (g: THREE.Group) => g.children.filter((o) => (o as THREE.Sprite).isSprite) as THREE.Sprite[];

describe('the move triad', () => {
	const g = build('move');
	it('offers three arrows, three plane handles, three rings and a free centre, every one carrying the selection and the centre', () => {
		expect(triadHandles(g).map(key).sort()).toEqual(['axis:X', 'axis:Y', 'axis:Z', 'free:free', 'plane:XY', 'plane:XZ', 'plane:YZ', 'ring:about X', 'ring:about Y', 'ring:about Z']);
		for (const o of g.children) {
			expect(o.userData.selection).toEqual(selection);
			expect((o.userData.handle as TriadHandle).center).toEqual([0, 0, 0]);
		}
		const planes = triadHandles(g).filter((h) => h.mode === 'plane');
		expect(planes.map((h) => `${h.label}=${h.axis.join(',')}`).sort()).toEqual(['XY=0,0,1', 'XZ=0,1,0', 'YZ=1,0,0']);
	});
	it('draws the letters as sprites that are themselves axis handles', () => {
		const letters = sprites(g);
		expect(letters.map((s) => s.userData.label).sort()).toEqual(['X', 'Y', 'Z']);
		for (const s of letters) expect((s.userData.handle as TriadHandle).mode).toBe('axis');
		const x = letters.find((s) => s.userData.label === 'X')!;
		expect(x.position.toArray()).toEqual([TRIAD.arrow + TRIAD.head + TRIAD.letterGap, 0, 0]);
		expect(x.scale.y).toBeCloseTo(TRIAD.letter, 9);
		expect(((x.material as THREE.SpriteMaterial).color.getHexString())).toBe(AXIS_COLOURS.x.slice(1));
	});
	it('every hit target is invisible and every drawn part is out of the pick path (the plane square is both, being fingertip-sized already)', () => {
		const hits = g.children.filter((o) => o.userData.hit), drawn = g.children.filter((o) => !o.userData.hit && !(o as THREE.Sprite).isSprite);
		expect(hits.length).toBeGreaterThanOrEqual(10); expect(drawn.length).toBeGreaterThanOrEqual(10);
		for (const o of hits) if ((o.userData.handle as TriadHandle).mode !== 'plane') expect(o.visible).toBe(false);
		for (const o of drawn) expect(o.raycast).toBe(NO_RAYCAST);
		for (const o of hits) expect(o.raycast).not.toBe(NO_RAYCAST);
	});
	it('a press beside the X arrow within its hit radius grabs X; outside it, off every handle, grabs nothing', () => {
		expect(key(down(0.6, 0.06, g))).toBe('axis:X');
		expect(key(down(0.6, -0.06, g))).toBe('axis:X');
		expect(key(down(0.06, 0.6, g))).toBe('axis:Y');
		expect(TRIAD.hitRadius).toBeGreaterThan(0.06);
		expect(key(down(0.5, 0.2, g))).toBeNull();
		expect(triadHandle(undefined)).toBeNull();
	});
	it('a press on the square between X and Y grabs the XY plane handle, whose axis is the plane normal', () => {
		const h = down(TRIAD.plane, TRIAD.plane, g);
		expect(key(h)).toBe('plane:XY'); expect(h!.axis).toEqual([0, 0, 1]);
		expect(key(grab(g, [5, TRIAD.plane, TRIAD.plane], [-1, 0, 0]))).toBe('plane:YZ');
	});
	it('a press on the ring about Z, away from the arrows and the squares, grabs that ring', () => {
		const a = (30 * Math.PI) / 180;
		expect(key(down(TRIAD.ring * Math.cos(a), TRIAD.ring * Math.sin(a), g))).toBe('ring:about Z');
		expect(key(grab(g, [5, TRIAD.ring * Math.cos(a), TRIAD.ring * Math.sin(a)], [-1, 0, 0]))).toBe('ring:about X');
	});
	it('an edge-on ring has no area to press, so from the top the X arrow answers where the ring about Y lines up with it, and from the front the ring about Z does not cover the Y arrow', () => {
		/* From above, the ring about Y is a line along X through the centre, over the X arrow. */
		expect(key(down(TRIAD.ring, 0.05, g))).toBe('axis:X');
		expect(key(down(0.75, 0.05, g))).toBe('axis:X');
		/* From the front (looking along +Y), the ring about Z is a line along X; a press on the Z arrow's line is the Z arrow. */
		expect(key(grab(g, [0.05, -5, 0.6], [0, 1, 0]))).toBe('axis:Z');
		/* And the same ring, face-on and off both arrows, does answer: the positive control. Where a ring crosses an arrow the arrow answers, since it is nearer. */
		const a = (60 * Math.PI) / 180;
		expect(key(down(TRIAD.ring * Math.cos(a), TRIAD.ring * Math.sin(a), g))).toBe('ring:about Z');
		expect(key(down(0, TRIAD.ring, g))).toBe('axis:Y');
	});
	it('a press on the centre, from a diagonal view, grabs the free handle', () => {
		expect(key(grab(g, [3, 3, 3], [-1, -1, -1]))).toBe('free:free');
	});
	it('scales every part with the scale it is handed, so the triad is the same size on screen at any zoom', () => {
		const big = build('move', 2, [1, 2, 3]);
		const x = sprites(big).find((s) => s.userData.label === 'X')!;
		expect(x.position.toArray()).toEqual([1 + 2 * (TRIAD.arrow + TRIAD.head + TRIAD.letterGap), 2, 3]);
		expect(key(grab(big, [1 + 2 * 0.6, 2 + 2 * 0.06, 10], [0, 0, -1]))).toBe('axis:X');
		/* 0.45 off the axis is outside the doubled hit radius (0.2) and off every other handle. */
		expect(key(grab(big, [1 + 2 * 0.6, 2 + 0.45, 10], [0, 0, -1]))).toBeNull();
		for (const o of big.children) expect((o.userData.handle as TriadHandle).center).toEqual([1, 2, 3]);
	});
	it('paints each axis in its own colour', () => {
		const colourOf = (label: string) => new Set(g.children.filter((o) => (o.userData.handle as TriadHandle).label === label && !(o as THREE.Sprite).isSprite).map((o) => ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHexString()));
		expect(colourOf('X')).toEqual(new Set([AXIS_COLOURS.x.slice(1)]));
		expect(colourOf('about Y')).toEqual(new Set([AXIS_COLOURS.y.slice(1)]));
		expect(colourOf('XY')).toEqual(new Set([AXIS_COLOURS.z.slice(1)]));
	});
});

describe('the rotate and scale triads', () => {
	it('rotate offers the three rings and nothing else, with the letters as ring handles', () => {
		const g = build('rotate');
		expect(triadHandles(g).map(key).sort()).toEqual(['ring:about X', 'ring:about Y', 'ring:about Z']);
		expect(triadHandles(g).filter((h) => h.mode !== 'ring')).toHaveLength(0);
		for (const s of sprites(g)) expect((s.userData.handle as TriadHandle).mode).toBe('ring');
		expect(sprites(g).find((s) => s.userData.label === 'Z')!.position.toArray()).toEqual([0, 0, TRIAD.ring + TRIAD.letterGap]);
		expect(key(down(TRIAD.plane, TRIAD.plane, g))).toBeNull();
		expect(key(grab(g, [3, 3, 3], [-1, -1, -1]))).toBeNull();
	});
	it('scale offers the three arrows and nothing else', () => {
		const g = build('scale');
		expect(triadHandles(g).map(key).sort()).toEqual(['axis:X', 'axis:Y', 'axis:Z']);
		const a = (30 * Math.PI) / 180;
		expect(key(down(TRIAD.ring * Math.cos(a), TRIAD.ring * Math.sin(a), g))).toBeNull();
		expect(key(down(0.6, 0.06, g))).toBe('axis:X');
	});
	it('the move triad is the union, so a handle present for one tool is present for it there too (the positive control for the two absences above)', () => {
		const g = build('move'), a = (30 * Math.PI) / 180;
		expect(key(down(TRIAD.ring * Math.cos(a), TRIAD.ring * Math.sin(a), g))).toBe('ring:about Z');
		expect(key(grab(g, [3, 3, 3], [-1, -1, -1]))).toBe('free:free');
	});
});
