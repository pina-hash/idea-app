// tests/ideacad-viewport-rig.test.ts
//
// THE RIG, AND THE ONE PROPERTY THAT TIES IT TO `controls-math.ts`.
//
// `controls-math.ts` was written by ledger 0145, is tested, and is correct. It
// had NO IMPORTER outside its own test until this bundle: there was no canvas,
// no camera and no controls anywhere in the tree, so nothing had ever asked it
// for a camera. `camera-rig.ts` is that reading, and the reading is not free to
// choose -- `zoomOrthoAboutCursor` asserts
//
//     (cursorX - width / 2) / orthoZoom + rotationCenter.x   is unchanged
//
// which forces `orthoZoom` to be PIXELS PER WORLD UNIT and `rotationCenter.x/y`
// to be a pan offset along the camera's own right and up axes rather than a
// world point. A rig that read either differently would render a perfectly
// plausible model and zoom to the wrong place, and nothing on screen would say
// so.
//
// SO THE CENTRAL TEST HERE IS A CROSS-MODULE ONE: put a state through
// `zoomOrthoAboutCursor` -- the real function, not a restatement of it -- and
// require `worldUnderCursor` to answer identically before and after. Neither
// module can be changed without the other noticing.
//
// The expected values below come from the SPECIFICATION or from an independent
// formula, never from the implementation: the quaternion rotation is checked
// against hand-computed axis images, the standard views against
// `docs/prompts/0145-ideacad.md` PART 4's own sentence ("Front looks down -Z
// with +Y up; Isometric is the view from (1, 1, 1)"), and the zoom invariant
// against the other module.

import { describe, expect, it } from 'vitest';
import {
	IDENTITY_QUATERNION,
	STANDARD_VIEWS,
	axisAngle,
	rotateScreen,
	zoomOrthoAboutCursor,
	type CameraState
} from '../src/lib/ideacad/viewport/controls-math';
import {
	FIT_FILL,
	applyQuaternion,
	cameraBasis,
	cameraPosition,
	fitZoom,
	fitted,
	panByPixels,
	spinArrowTurn,
	viewName,
	wheelFactor,
	worldUnderCursor
} from '../src/lib/ideacad/viewport/camera-rig';

const ORIGIN = { x: 0, y: 0, z: 0 };
const base: CameraState = {
	quaternion: IDENTITY_QUATERNION,
	rotationCenter: { x: 0, y: 0, z: 0 },
	orthoZoom: 10,
	distance: 100,
	projection: 'orthographic'
};
const VIEWPORT = { width: 800, height: 600 };

describe('applyQuaternion', () => {
	it('leaves a vector alone under the identity', () => {
		expect(applyQuaternion({ x: 1, y: 2, z: 3 }, IDENTITY_QUATERNION)).toEqual({ x: 1, y: 2, z: 3 });
	});

	it('sends +X to -Z under a quarter turn about +Y', () => {
		/* Right-handed: a +90 degree rotation about +Y carries +X onto -Z. Hand
		   computed, not read off the implementation. */
		const q = axisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
		const v = applyQuaternion({ x: 1, y: 0, z: 0 }, q);
		expect(v.x).toBeCloseTo(0, 12);
		expect(v.y).toBeCloseTo(0, 12);
		expect(v.z).toBeCloseTo(-1, 12);
	});

	it('preserves length', () => {
		/* A UNIT axis, which is `axisAngle`'s contract and what every caller in
		   `controls.ts` passes. Written first with an axis of length 0.998 this
		   failed by 0.0139 -- the module is right and the fixture was not, which
		   is worth a sentence because the next person to reach for a "nice"
		   arbitrary axis will write an un-normalised one too. */
		const n = Math.hypot(0.4, -0.6, 0.69);
		const q = axisAngle({ x: 0.4 / n, y: -0.6 / n, z: 0.69 / n }, 1.1);
		const v = applyQuaternion({ x: 3, y: -4, z: 12 }, q);
		expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(13, 10);
	});
});

describe('cameraBasis', () => {
	it('is orthonormal and right-handed for every standard view', () => {
		for (const [name, q] of Object.entries(STANDARD_VIEWS)) {
			const b = cameraBasis(q);
			const dot = (a: typeof b.right, c: typeof b.right) => a.x * c.x + a.y * c.y + a.z * c.z;
			expect(Math.hypot(b.right.x, b.right.y, b.right.z), name).toBeCloseTo(1, 12);
			expect(Math.hypot(b.up.x, b.up.y, b.up.z), name).toBeCloseTo(1, 12);
			expect(dot(b.right, b.up), name).toBeCloseTo(0, 12);
			expect(dot(b.right, b.forward), name).toBeCloseTo(0, 12);
			/* right x up = forward, which is what makes the camera look down its
			   own -Z the way three.js does. */
			const cross = {
				x: b.right.y * b.up.z - b.right.z * b.up.y,
				y: b.right.z * b.up.x - b.right.x * b.up.z,
				z: b.right.x * b.up.y - b.right.y * b.up.x
			};
			expect(dot(cross, b.forward), name).toBeCloseTo(1, 10);
		}
	});

	it('puts Front on the +Z side looking down -Z with +Y up', () => {
		/* PART 4: "Front looks down -Z with +Y up". */
		const b = cameraBasis(STANDARD_VIEWS.Front);
		expect(b.forward).toEqual({ x: 0, y: 0, z: 1 });
		expect(b.up).toEqual({ x: 0, y: 1, z: 0 });
	});

	it('puts Isometric on the (1, 1, 1) diagonal', () => {
		/* PART 4: "Isometric is the view from (1, 1, 1) with +Y up". */
		const b = cameraBasis(STANDARD_VIEWS.Isometric);
		const k = 1 / Math.sqrt(3);
		expect(b.forward.x).toBeCloseTo(k, 4);
		expect(b.forward.y).toBeCloseTo(k, 4);
		expect(b.forward.z).toBeCloseTo(k, 4);
	});

	it('puts Top above the model looking down', () => {
		const b = cameraBasis(STANDARD_VIEWS.Top);
		expect(b.forward.y).toBeCloseTo(1, 12);
		/* Screen up is -Z from above, which is why +Z paints DOWNWARD in the Top
		   view -- the fact the rotation arrow's direction rests on. */
		expect(b.up.z).toBeCloseTo(-1, 12);
	});
});

describe('cameraPosition', () => {
	it('backs the camera off along its own view axis', () => {
		const p = cameraPosition(base, ORIGIN);
		expect(p).toEqual({ x: 0, y: 0, z: 100 });
	});

	it('keeps the pivot in front of the camera at every standard view', () => {
		for (const [name, q] of Object.entries(STANDARD_VIEWS)) {
			const p = cameraPosition({ ...base, quaternion: q }, { x: 1, y: 2, z: 3 });
			const b = cameraBasis(q);
			/* The vector from the camera to the pivot points along -forward. */
			const toPivot = { x: 1 - p.x, y: 2 - p.y, z: 3 - p.z };
			const along = toPivot.x * b.forward.x + toPivot.y * b.forward.y + toPivot.z * b.forward.z;
			expect(along, name).toBeCloseTo(-100, 8);
		}
	});

	it('applies the pan offset along the camera axes, not the world ones', () => {
		const q = STANDARD_VIEWS.Right;
		const panned = { ...base, quaternion: q, rotationCenter: { x: 5, y: 0, z: 0 } };
		const b = cameraBasis(q);
		const plain = cameraPosition({ ...base, quaternion: q }, ORIGIN);
		const moved = cameraPosition(panned, ORIGIN);
		expect(moved.x - plain.x).toBeCloseTo(5 * b.right.x, 10);
		expect(moved.y - plain.y).toBeCloseTo(5 * b.right.y, 10);
		expect(moved.z - plain.z).toBeCloseTo(5 * b.right.z, 10);
	});
});

describe('worldUnderCursor against zoomOrthoAboutCursor', () => {
	/* The cross-module property. `zoomOrthoAboutCursor` is imported and run for
	   real; nothing here restates its arithmetic. */
	const cases: { label: string; state: CameraState; cursor: { x: number; y: number }; factor: number }[] = [
		{ label: 'centre, zooming in', state: base, cursor: { x: 400, y: 300 }, factor: 1.25 },
		{ label: 'off centre, zooming in', state: base, cursor: { x: 617, y: 122 }, factor: 1.25 },
		{ label: 'off centre, zooming out', state: base, cursor: { x: 33, y: 571 }, factor: 1 / 1.25 },
		{
			label: 'already panned and rotated',
			state: {
				...base,
				quaternion: STANDARD_VIEWS.Isometric,
				rotationCenter: { x: -3.5, y: 2.25, z: 0.5 },
				orthoZoom: 87.125
			},
			cursor: { x: 129, y: 480 },
			factor: 1.25
		},
		{
			label: 'a corner pixel',
			state: { ...base, quaternion: STANDARD_VIEWS.Top },
			cursor: { x: 0, y: 0 },
			factor: 1 / 1.25
		}
	];

	for (const c of cases) {
		it(`keeps the world point fixed: ${c.label}`, () => {
			const anchor = { x: 1.5, y: -2, z: 0.25 };
			const before = worldUnderCursor(c.state, anchor, c.cursor, VIEWPORT);
			const next = zoomOrthoAboutCursor(c.state, c.factor, c.cursor, VIEWPORT);
			const after = worldUnderCursor(next, anchor, c.cursor, VIEWPORT);
			expect(next.orthoZoom).toBeCloseTo(c.state.orthoZoom * c.factor, 10);
			expect(after.x).toBeCloseTo(before.x, 10);
			expect(after.y).toBeCloseTo(before.y, 10);
			expect(after.z).toBeCloseTo(before.z, 10);
		});
	}

	it('a DIFFERENT pixel does move, so the check above is not vacuous', () => {
		/* The positive control. If `worldUnderCursor` ignored the zoom entirely
		   every case above would pass and mean nothing. */
		const anchor = ORIGIN;
		const other = { x: 100, y: 100 };
		const before = worldUnderCursor(base, anchor, other, VIEWPORT);
		const next = zoomOrthoAboutCursor(base, 1.25, { x: 617, y: 122 }, VIEWPORT);
		const after = worldUnderCursor(next, anchor, other, VIEWPORT);
		expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)).toBeGreaterThan(1);
	});
});

describe('panByPixels', () => {
	it('moves the model with the drag, which is SolidWorks direction', () => {
		/* Dragging right by 40px at 10 px per world unit moves what is under a
		   fixed pixel 4 world units to the LEFT along the camera's right axis. */
		const anchor = ORIGIN;
		const pixel = { x: 400, y: 300 };
		const before = worldUnderCursor(base, anchor, pixel, VIEWPORT);
		const after = worldUnderCursor(panByPixels(base, 40, 0), anchor, pixel, VIEWPORT);
		expect(after.x - before.x).toBeCloseTo(-4, 10);
	});

	it('leaves the pivot depth alone', () => {
		const panned = panByPixels({ ...base, rotationCenter: { x: 0, y: 0, z: 7 } }, 33, -21);
		expect(panned.rotationCenter.z).toBe(7);
	});

	it('scales with the zoom, so a drag moves the same distance on screen', () => {
		const far = panByPixels({ ...base, orthoZoom: 100 }, 50, 0);
		const near = panByPixels({ ...base, orthoZoom: 10 }, 50, 0);
		expect(far.rotationCenter.x).toBeCloseTo(-0.5, 10);
		expect(near.rotationCenter.x).toBeCloseTo(-5, 10);
	});
});

describe('fit', () => {
	it('fills the SMALLER dimension to the stated fraction', () => {
		const z = fitZoom(2, { width: 800, height: 600 });
		expect(2 * 2 * z).toBeCloseTo(600 * FIT_FILL, 8);
	});

	it('leaves real air around the model', () => {
		expect(FIT_FILL).toBeLessThan(1);
	});

	it('clears the pan so a fitted model is centred', () => {
		const f = fitted({ ...base, rotationCenter: { x: 9, y: -4, z: 2 } }, 2, VIEWPORT);
		expect(f.rotationCenter.x).toBe(0);
		expect(f.rotationCenter.y).toBe(0);
		/* The pivot depth is not a pan and is kept. */
		expect(f.rotationCenter.z).toBe(2);
	});

	it('does not divide by zero on a degenerate model', () => {
		expect(Number.isFinite(fitZoom(0, VIEWPORT))).toBe(true);
		expect(Number.isFinite(fitZoom(2, { width: 0, height: 0 }))).toBe(true);
	});
});

describe('viewName', () => {
	it('names every standard view from its own quaternion', () => {
		for (const [name, q] of Object.entries(STANDARD_VIEWS)) expect(viewName(q)).toBe(name);
	});

	it('names the negated quaternion the same, because it is the same orientation', () => {
		const q = STANDARD_VIEWS.Right;
		expect(viewName({ x: -q.x, y: -q.y, z: -q.z, w: -q.w })).toBe('Right');
	});

	it('says Custom once the camera has been dragged off a standard view', () => {
		/* The readout is derived rather than remembered, so a drag off Front has
		   to stop saying Front. 40px of a 800px pane is about 9 degrees. */
		expect(viewName(rotateScreen(STANDARD_VIEWS.Front, 40, 0, 800))).toBe('Custom');
	});

	it('still names a view a hair off itself, so a slerp that lands is not Custom', () => {
		const nudged = rotateScreen(STANDARD_VIEWS.Front, 0.002, 0, 800);
		expect(viewName(nudged)).toBe('Front');
	});
});

describe('wheelFactor', () => {
	it('zooms in on a negative delta and out on a positive one', () => {
		expect(wheelFactor(-100)).toBeCloseTo(1.25, 10);
		expect(wheelFactor(100)).toBeCloseTo(1 / 1.25, 10);
	});

	it('is exactly reversible, so a notch back undoes a notch', () => {
		expect(wheelFactor(-100) * wheelFactor(100)).toBeCloseTo(1, 12);
	});

	it('swaps both directions when the option is on, and nothing else', () => {
		expect(wheelFactor(-100, 1.25, true)).toBeCloseTo(1 / 1.25, 10);
		expect(wheelFactor(100, 1.25, true)).toBeCloseTo(1.25, 10);
	});
});

describe('spinArrowTurn', () => {
	/* `docs/prompts/0145-ideacad.md` line 356: `rotation: 'cw' | 'ccw'  //
	   viewed from above`. The arc is built running +X toward +Z, and the Top
	   view looks down +Y with screen-up at -Z, so that sweep paints
	   right-bottom-left: clockwise. Shipped inverted, so a `cw` document drew a
	   counter-clockwise arrow. */
	it('leaves a clockwise document alone, because the arc is already clockwise from above', () => {
		expect(spinArrowTurn('cw')).toBe(0);
	});

	it('turns a counter-clockwise document by half a turn', () => {
		expect(spinArrowTurn('ccw')).toBeCloseTo(Math.PI, 12);
	});

	it('is a rotation and NEVER a mirror, which would cull the arrow for one document', () => {
		/* A half turn about an axis is a proper rotation: its determinant is +1
		   and face winding survives. The assertion that carries that is simply
		   that the answer is an ANGLE and that the two answers differ by half a
		   turn -- a scale factor of -1 could not be either. */
		expect(Math.abs(spinArrowTurn('ccw') - spinArrowTurn('cw'))).toBeCloseTo(Math.PI, 12);
		for (const r of ['cw', 'ccw'] as const) expect(Number.isFinite(spinArrowTurn(r))).toBe(true);
	});

	it('agrees with the Top view being the one that shows it', () => {
		/* The claim the turn rests on, asserted rather than asserted-about: from
		   the Top view, +Z is DOWN on screen. */
		const b = cameraBasis(STANDARD_VIEWS.Top);
		expect(b.up.z).toBeCloseTo(-1, 12);
		expect(b.right.x).toBeCloseTo(1, 12);
	});
});
