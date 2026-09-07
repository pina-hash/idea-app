// tests/dom/theme-rain-mount.svelte.test.ts
//
// `.svelte.test.ts` because one test drives a reactive `active` prop with a
// `$state` rune, which only compiles in a rune-aware module (the
// avatar-fallback mount test is the precedent).
//
// THE RAIN'S LIFECYCLE AND ITS REDUCED-MOTION GATE, THROUGH THE REAL COMPONENT.
//
// `MatrixRain.svelte` renders no markup: it creates a <canvas> inside `.bg-fx`
// while `active` is true, drives it from requestAnimationFrame, and holds a
// still field instead when `prefers-reduced-motion: reduce` matches. Every one
// of those is an `$effect`, and an effect never runs under `svelte/server` --
// so this lives in the `dom` project, where `mount()` runs it for real.
//
// WHAT IS ASSERTED: where the canvas lands, whether a frame is ever scheduled,
// what `data-motion` says, that the still frame is PAINTED (draw calls, not a
// blank), that a media flip mid-session stops and restarts the loop, and that
// unmounting removes the canvas and cancels the pending frame. NOT asserted:
// any pixel, any size, any frame rate -- happy-dom has no layout engine and no
// raster, so `tools/browser-verify` and the history entry's drive script hold
// those numbers.
//
// THE INSTRUMENTS ARE STUBS, AND EACH IS THE SMALLEST ONE THAT LETS THE REAL
// CODE PATH RUN. happy-dom has no layout, so `.bg-fx` measures 0x0 and the
// component correctly idles (a room that suppresses the shell background is
// exactly that case, and it is asserted below); the host is given a size by
// defining `clientWidth`/`clientHeight` on the element. Its canvas has no 2D
// context, so `getContext` is stubbed with an object that COUNTS the calls
// the painter makes. `matchMedia` is stubbed so the preference can be flipped
// and its change listener fired. `requestAnimationFrame` is a hand-pumped
// queue so "a frame was scheduled" is a fact and not a race.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MatrixRain from '../../src/lib/MatrixRain.svelte';

type Listener = (e: { matches: boolean }) => void;

let reduce = false;
const mqListeners = new Set<Listener>();
let rafQueue: (FrameRequestCallback | null)[] = [];
let cancelled = 0;
let draw = { drawImage: 0, clearRect: 0, fillRect: 0, fillText: 0 };
let host: HTMLElement;
let target: HTMLElement;
let now = 0;

function pump(frames = 1, stepMs = 1000 / 60) {
	for (let i = 0; i < frames; i++) {
		now += stepMs;
		const q = rafQueue;
		rafQueue = [];
		for (const cb of q) if (cb) cb(now);
	}
}
const pending = () => rafQueue.filter(Boolean).length;
const canvas = () => host.querySelector('canvas.matrix-rain') as HTMLCanvasElement | null;

function fakeContext() {
	return {
		globalAlpha: 1,
		globalCompositeOperation: 'source-over',
		fillStyle: '',
		font: '',
		textAlign: '',
		textBaseline: '',
		setTransform() {},
		save() {},
		restore() {},
		translate() {},
		scale() {},
		fillText() {
			draw.fillText++;
		},
		clearRect() {
			draw.clearRect++;
		},
		fillRect() {
			draw.fillRect++;
		},
		drawImage() {
			draw.drawImage++;
		}
	};
}

beforeEach(() => {
	reduce = false;
	mqListeners.clear();
	rafQueue = [];
	cancelled = 0;
	now = 0;
	draw = { drawImage: 0, clearRect: 0, fillRect: 0, fillText: 0 };

	window.matchMedia = ((query: string) => ({
		media: query,
		get matches() {
			return /reduce/.test(query) ? reduce : false;
		},
		onchange: null,
		addEventListener: (_: string, fn: Listener) => mqListeners.add(fn),
		removeEventListener: (_: string, fn: Listener) => mqListeners.delete(fn),
		addListener: (fn: Listener) => mqListeners.add(fn),
		removeListener: (fn: Listener) => mqListeners.delete(fn),
		dispatchEvent: () => true
	})) as unknown as typeof window.matchMedia;
	window.requestAnimationFrame = ((cb: FrameRequestCallback) => rafQueue.push(cb)) as typeof window.requestAnimationFrame;
	window.cancelAnimationFrame = ((id: number) => {
		cancelled++;
		rafQueue[id - 1] = null;
	}) as typeof window.cancelAnimationFrame;
	(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => fakeContext();

	host = document.createElement('div');
	host.className = 'bg-fx';
	host.setAttribute('aria-hidden', 'true');
	Object.defineProperty(host, 'clientWidth', { value: 640, configurable: true });
	Object.defineProperty(host, 'clientHeight', { value: 400, configurable: true });
	document.body.appendChild(host);
	target = document.createElement('div');
	document.body.appendChild(target);
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('mounting and unmounting', () => {
	it('active: a canvas lands INSIDE .bg-fx, aria-hidden, running, and frames advance when pumped', () => {
		const app = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		const c = canvas();
		expect(c).not.toBeNull();
		expect(c!.parentElement).toBe(host);
		expect(c!.getAttribute('aria-hidden')).toBe('true');
		expect(c!.dataset.motion).toBe('running');
		expect(target.childElementCount).toBe(0); // it renders no markup of its own
		expect(pending()).toBe(1);
		const drawnBefore = draw.drawImage;
		pump(60);
		/* Painting every other animation frame, and stamping data-frames every
		   thirty paints: sixty pumps are thirty paints, so the stamp reads 30. */
		expect(c!.dataset.frames).toBe('30');
		expect(draw.drawImage).toBeGreaterThan(drawnBefore);
		expect(draw.fillRect).toBe(30); // one alpha strip per paint
		expect(pending()).toBe(1); // still exactly one frame in flight
		unmount(app);
		flushSync();
		expect(canvas()).toBeNull();
		expect(pending()).toBe(0);
		expect(cancelled).toBeGreaterThan(0);
	});

	it('inactive: nothing is created; flipping active on creates it and off removes it', () => {
		let active = $state(false);
		const app = mount(MatrixRain, {
			target,
			props: {
				get active() {
					return active;
				}
			}
		});
		flushSync();
		expect(canvas()).toBeNull();
		expect(pending()).toBe(0);
		active = true;
		flushSync();
		expect(canvas()).not.toBeNull();
		expect(pending()).toBe(1);
		active = false;
		flushSync();
		expect(canvas()).toBeNull();
		expect(pending()).toBe(0);
		unmount(app);
	});

	it('with no .bg-fx on the page there is nothing to rain on, and nothing is created', () => {
		host.remove();
		const app = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		expect(document.querySelector('canvas')).toBeNull();
		expect(pending()).toBe(0);
		unmount(app);
	});

	it('a host at 0x0 -- a room that suppresses the shell background -- idles and schedules nothing', () => {
		Object.defineProperty(host, 'clientWidth', { value: 0, configurable: true });
		Object.defineProperty(host, 'clientHeight', { value: 0, configurable: true });
		const app = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		expect(canvas()).not.toBeNull();
		expect(canvas()!.dataset.motion).toBe('idle');
		expect(pending()).toBe(0);
		unmount(app);
	});
});

describe('prefers-reduced-motion', () => {
	it('with the preference set no frame is ever scheduled, and the still field is PAINTED, not blank', () => {
		reduce = true;
		const app = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		const c = canvas();
		expect(c).not.toBeNull();
		expect(c!.dataset.motion).toBe('reduced');
		expect(pending()).toBe(0);
		expect(draw.drawImage).toBeGreaterThan(50); // heads and tails, over 40 columns
		expect(draw.fillRect).toBe(0); // no fade strip: nothing is moving
		pump(120);
		expect(c!.dataset.frames).toBe('0');
		expect(pending()).toBe(0);
		unmount(app);
	});

	it('the still field is the same picture twice: seeded, so a reload draws what it drew', () => {
		reduce = true;
		const app1 = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		const first = draw.drawImage;
		unmount(app1);
		draw.drawImage = 0;
		const app2 = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		expect(draw.drawImage).toBe(first);
		unmount(app2);
	});

	it('flipping the preference mid-session stops the loop and parks the field; flipping back restarts it', () => {
		const app = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		const c = canvas()!;
		expect(c.dataset.motion).toBe('running');
		pump(10);
		expect(pending()).toBe(1);

		reduce = true;
		for (const fn of mqListeners) fn({ matches: true });
		expect(c.dataset.motion).toBe('reduced');
		expect(pending()).toBe(0);
		const parkedDraws = draw.drawImage;
		pump(30);
		expect(draw.drawImage).toBe(parkedDraws); // nothing painted while parked

		reduce = false;
		for (const fn of mqListeners) fn({ matches: false });
		expect(c.dataset.motion).toBe('running');
		expect(pending()).toBe(1);
		pump(4);
		expect(draw.drawImage).toBeGreaterThan(parkedDraws);
		unmount(app);
		expect(mqListeners.size).toBe(0); // the listener came off with the canvas
	});

	it('POSITIVE CONTROL: the media stub is what the component reads -- with it unset, the loop runs', () => {
		reduce = false;
		const app = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		expect(canvas()!.dataset.motion).toBe('running');
		expect(pending()).toBe(1);
		unmount(app);
	});
});

describe('a device that cannot keep up', () => {
	it('slow frames in a row halve the rate, and a second run of them parks the field', () => {
		const app = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		const c = canvas()!;
		// 90 frames at 50ms each: every one is past the 34ms slow floor.
		pump(91, 50);
		expect(c.dataset.motion).toBe('half');
		expect(pending()).toBe(1);
		pump(91, 50);
		expect(c.dataset.motion).toBe('still-slow');
		expect(pending()).toBe(0);
		const parked = draw.drawImage;
		pump(30, 50);
		expect(draw.drawImage).toBe(parked);
		unmount(app);
	});

	it('a single long gap -- a tab coming back from the background -- is not counted as a slow device', () => {
		const app = mount(MatrixRain, { target, props: { active: true } });
		flushSync();
		const c = canvas()!;
		for (let i = 0; i < 100; i++) {
			pump(1, 16.7);
			pump(1, 5000); // a hidden tab's gap, every other frame
		}
		expect(c.dataset.motion).toBe('running');
		unmount(app);
	});
});
