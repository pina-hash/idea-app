// tests/dom/ideacad-viewport-controls-mount.test.ts
//
// THE CONTROL BINDING, DRIVEN. `controls-math.ts` is pure and tested;
// `controls.ts` is the half that turns a pointer into a call to it, and that
// half is exactly where this bundle's worst defect lived.
//
// WHAT IT WAS: `PreviousViewStack.push` deep-copies with `structuredClone`, and
// the viewport's camera state is a Svelte `$state` PROXY, which
// `structuredClone` refuses. `pushPrevious()` is the FIRST statement of
// `pointerdown`, so the throw aborted the handler before the drag was armed and
// the entire control map went quiet -- no rotation, no Previous, no standard
// view -- with nothing on screen to say why. It surfaced as three unrelated
// symptoms in the browser (a 300-frame drag that recorded 0 frames, a Top that
// stayed Isometric, a Previous that did nothing) and took a page error to
// diagnose. Neither `svelte-check` nor any server render can see it.
//
// So the binding is driven here with the PROXY SHAPE it is handed in
// production, not with a plain object, and the previous-view stack is exercised
// rather than assumed. `controls-math.ts` is not the thing to change and is not
// changed: `structuredClone` is correct for the plain object its own type
// describes, and handing it one is the viewport's job.
//
// NO WIDTH, RATIO OR TAP TARGET IS ASSERTED HERE. happy-dom has no layout
// engine and every one of those reads zero (`tests/dom/README.md`); the
// viewport's geometry is measured in `tools/browser-verify/routes/ideacad.mjs`
// against a real Chromium.

import { beforeEach, describe, expect, it } from 'vitest';
import { SolidWorksControls, typingInto } from '$lib/ideacad/viewport/controls';
import { IDENTITY_QUATERNION, STANDARD_VIEWS, type CameraState } from '$lib/ideacad/viewport/controls-math';
import { viewName } from '$lib/ideacad/viewport/camera-rig';

const START: CameraState = {
	quaternion: IDENTITY_QUATERNION,
	rotationCenter: { x: 0, y: 0, z: 0 },
	orthoZoom: 100,
	distance: 100,
	projection: 'orthographic'
};

const BOX = { width: 800, height: 600 };

/** A rig that stands in for the viewport: the element, the state and the
 *  writes, with the state kept behind a PROXY exactly as `$state` does. */
function rig(opts: { proxy?: boolean } = {}) {
	const el = document.createElement('div');
	document.body.appendChild(el);
	/* `setPointerCapture` does not exist in happy-dom and throws for an unknown
	   pointer in a real browser; the binding guards it either way, and the guard
	   is part of what is under test. */
	let state: CameraState = structuredClone(START);
	const writes: CameraState[] = [];
	const controls = new SolidWorksControls(el, {
		/* PRODUCTION SHAPE BY DEFAULT: `Viewport.svelte` hands over
		   `$state.snapshot(cam)`, a plain object. `proxy: true` hands the
		   reactive shape instead, which is the one that broke everything. */
		get: () => (opts.proxy ? (new Proxy(state, {}) as CameraState) : state),
		write: (next) => {
			state = next;
			writes.push(next);
		},
		size: () => BOX,
		radius: () => 2
	});
	return {
		el,
		controls,
		writes,
		get state() {
			return state;
		},
		stop() {
			controls.destroy();
			el.remove();
		}
	};
}

const pointer = (el: Element, type: string, x: number, y: number, init: PointerEventInit = {}) =>
	el.dispatchEvent(
		new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 1, buttons: 4, clientX: x, clientY: y, bubbles: true, cancelable: true, ...init })
	);

const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
	el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

describe('SolidWorksControls: a middle-drag rotates', () => {
	let r: ReturnType<typeof rig>;
	beforeEach(() => {
		r = rig();
	});

	it('arms the drag and writes a new orientation on every move', () => {
		pointer(r.el, 'pointerdown', 400, 300);
		pointer(r.el, 'pointermove', 440, 300);
		pointer(r.el, 'pointermove', 480, 310);
		pointer(r.el, 'pointerup', 480, 310);
		expect(r.writes.length).toBe(2);
		expect(viewName(r.state.quaternion)).toBe('Custom');
	});

	it('writes NOTHING once the pointer is up, which is the drag actually ending', () => {
		pointer(r.el, 'pointerdown', 400, 300);
		pointer(r.el, 'pointermove', 440, 300);
		pointer(r.el, 'pointerup', 440, 300);
		const after = r.writes.length;
		pointer(r.el, 'pointermove', 600, 300);
		expect(r.writes.length).toBe(after);
	});

	it('ignores a LEFT drag, because left is SolidWorks selection button', () => {
		pointer(r.el, 'pointerdown', 400, 300, { button: 0, buttons: 1 });
		pointer(r.el, 'pointermove', 500, 300, { button: 0, buttons: 1 });
		expect(r.writes.length).toBe(0);
	});

	it('does not write for a move that did not move', () => {
		pointer(r.el, 'pointerdown', 400, 300);
		pointer(r.el, 'pointermove', 400, 300);
		expect(r.writes.length).toBe(0);
	});

	it('pans on Ctrl and leaves the orientation alone', () => {
		pointer(r.el, 'pointerdown', 400, 300, { ctrlKey: true });
		pointer(r.el, 'pointermove', 450, 300, { ctrlKey: true });
		expect(r.state.quaternion).toEqual(START.quaternion);
		expect(r.state.rotationCenter.x).toBeCloseTo(-0.5, 10);
	});

	it('zooms on Shift, upward being in, and leaves the orientation alone', () => {
		pointer(r.el, 'pointerdown', 400, 300, { shiftKey: true });
		pointer(r.el, 'pointermove', 400, 260, { shiftKey: true });
		expect(r.state.quaternion).toEqual(START.quaternion);
		expect(r.state.orthoZoom).toBeGreaterThan(START.orthoZoom);
	});

	it('rolls on Alt about the view axis alone', () => {
		pointer(r.el, 'pointerdown', 400, 300, { altKey: true });
		pointer(r.el, 'pointermove', 500, 300, { altKey: true });
		/* A roll about the screen Z leaves x and y at zero and moves only z. */
		expect(r.state.quaternion.x).toBeCloseTo(0, 12);
		expect(r.state.quaternion.y).toBeCloseTo(0, 12);
		expect(Math.abs(r.state.quaternion.z)).toBeGreaterThan(0.01);
	});
});

describe('SolidWorksControls: the previous-view stack', () => {
	it('records a view on the way into a drag', () => {
		const r = rig();
		pointer(r.el, 'pointerdown', 400, 300);
		expect(r.controls.previous.length).toBe(1);
		r.stop();
	});

	it('DEGRADES rather than dying when the state cannot be cloned', () => {
		/* THE REGRESSION, as the rule rather than as the bug. A reactive proxy
		   is refused by `structuredClone`, and `pushPrevious` is the first
		   statement of `pointerdown` -- so the throw used to abort the handler
		   before the drag was armed and the whole control map went silent. What
		   must hold is that the DRAG still works and only the convenience is
		   lost. Both halves are asserted: no entry recorded, and the rotation
		   written anyway. */
		const r = rig({ proxy: true });
		expect(() => pointer(r.el, 'pointerdown', 400, 300)).not.toThrow();
		expect(r.controls.previous.length).toBe(0);
		pointer(r.el, 'pointermove', 500, 300);
		expect(r.writes.length).toBe(1);
		expect(viewName(r.state.quaternion)).toBe('Custom');
		r.stop();
	});

	it('restores the view it recorded', () => {
		const r = rig();
		r.controls.standardView('Top');
		expect(viewName(r.state.quaternion)).toBe('Top');
		r.controls.standardView('Right');
		expect(viewName(r.state.quaternion)).toBe('Right');
		r.controls.restorePrevious();
		expect(viewName(r.state.quaternion)).toBe('Top');
		r.stop();
	});

	it('does nothing rather than throwing when there is nothing to go back to', () => {
		const r = rig();
		expect(() => r.controls.restorePrevious()).not.toThrow();
		expect(r.writes.length).toBe(0);
		r.stop();
	});
});

describe('SolidWorksControls: keys', () => {
	let r: ReturnType<typeof rig>;
	beforeEach(() => {
		r = rig();
	});

	it('lands each of Ctrl+1 to Ctrl+7 on its own standard view', () => {
		const expected = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom', 'Isometric'];
		expected.forEach((name, i) => {
			key(r.el, String(i + 1), { ctrlKey: true });
			expect(viewName(r.state.quaternion), name).toBe(name);
		});
		expect(Object.keys(STANDARD_VIEWS)).toEqual(expected);
	});

	it('fits on F and zooms on Z', () => {
		key(r.el, 'f');
		const fitZoomValue = r.state.orthoZoom;
		expect(fitZoomValue).not.toBe(START.orthoZoom);
		key(r.el, 'z');
		expect(r.state.orthoZoom).toBeLessThan(fitZoomValue);
		key(r.el, 'Z', { shiftKey: true });
		expect(r.state.orthoZoom).toBeCloseTo(fitZoomValue, 8);
	});

	it('turns by the arrow increment, and by 90 degrees with Shift', () => {
		key(r.el, 'ArrowRight');
		expect(viewName(r.state.quaternion)).toBe('Custom');
		const r2 = rig();
		key(r2.el, 'ArrowRight', { shiftKey: true });
		/* A quarter turn off Front about the screen vertical is the Left view. */
		expect(viewName(r2.state.quaternion)).toBe('Left');
		r2.stop();
	});

	it('pans on Ctrl + arrow rather than turning', () => {
		key(r.el, 'ArrowRight', { ctrlKey: true });
		expect(r.state.quaternion).toEqual(START.quaternion);
		expect(r.state.rotationCenter.x).toBeLessThan(0);
	});

	it('NEVER fires while a text field has focus, which is interface standard 8', () => {
		const input = document.createElement('input');
		r.el.appendChild(input);
		input.focus();
		expect(typingInto(document.activeElement)).toBe(true);
		key(r.el, 'f');
		key(r.el, 'z');
		key(r.el, 'ArrowRight');
		expect(r.writes.length).toBe(0);
		/* The positive control: the same three keys with focus off the field. */
		input.blur();
		input.remove();
		key(r.el, 'f');
		expect(r.writes.length).toBe(1);
	});
});

describe('typingInto', () => {
	it('names every field kind a shortcut must not steal from', () => {
		for (const tag of ['input', 'textarea', 'select']) {
			expect(typingInto(document.createElement(tag)), tag).toBe(true);
		}
		const rich = document.createElement('div');
		Object.defineProperty(rich, 'isContentEditable', { value: true });
		expect(typingInto(rich)).toBe(true);
	});

	it('is false for the ordinary case, so the map is not switched off entirely', () => {
		expect(typingInto(null)).toBe(false);
		expect(typingInto(document.createElement('div'))).toBe(false);
		expect(typingInto(document.createElement('button'))).toBe(false);
	});
});

describe('SolidWorksControls: the wheel', () => {
	it('zooms about the cursor and refuses the page scroll', () => {
		const r = rig();
		const ev = new WheelEvent('wheel', { deltaY: -100, clientX: 600, clientY: 200, bubbles: true, cancelable: true });
		r.el.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		expect(r.state.orthoZoom).toBeCloseTo(125, 8);
		r.stop();
	});

	it('stops answering once destroyed, so a remount cannot leave two bindings', () => {
		const r = rig();
		r.controls.destroy();
		r.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
		pointer(r.el, 'pointerdown', 400, 300);
		pointer(r.el, 'pointermove', 500, 300);
		expect(r.writes.length).toBe(0);
		r.el.remove();
	});
});
