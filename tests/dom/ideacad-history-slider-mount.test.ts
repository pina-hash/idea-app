// tests/dom/ideacad-history-slider-mount.test.ts
//
// THE HISTORY SLIDER, MOUNTED: that Play actually arms a timer and the steps
// arrive through `onstep`, one at a time, that Pause stops them, that Stop
// shows the whole model, that the buttons and the scrubber send the steps they
// say, and that reduced motion turns `animate` off without changing the steps.
//
// WHY THIS IS AUTOMATED. `playback.ts` is proven on its own; what is not is
// the wiring. A slider whose timer is never armed renders a perfectly good
// Play button that does nothing, and one that forgets to read the motion
// setting eases the camera for a student who asked it not to. Neither shows
// in a screenshot.
//
// NO GEOMETRY HERE: happy-dom has no layout engine. Target sizes and the
// layout at 375, 960 and 1440 are measured in Chromium through the harness.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import HistorySlider from '$lib/ideacad/solid/tree/HistorySlider.svelte';
import { stepInterval } from '$lib/ideacad/solid/tree/playback';
import { mountInto, type Mounted } from './mount';

const Slider = HistorySlider as unknown as Component<Record<string, unknown>>;
const mounted: Mounted[] = [];
const realMatchMedia = window.matchMedia;
afterEach(async () => { for (const m of mounted.splice(0)) await m.stop(); window.matchMedia = realMatchMedia; });
type Call = { step: number; playing: boolean; animate: boolean };
function slider(steps = 4, step = steps) {
	const calls: Call[] = [];
	const m = mountInto(Slider, { steps, step, labels: ['Sketch 1', 'Base plate', 'Fillet 1', 'Bolt holes'].slice(0, steps), onstep: (s: number, how: { playing: boolean; animate: boolean }) => calls.push({ step: s, ...how }) });
	mounted.push(m);
	return { m, calls, control: (name: string) => m.one<HTMLButtonElement>(`[data-control="${name}"]`) };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function reduceMotion(on: boolean) {
	window.matchMedia = ((query: string) => ({ matches: on && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

describe('playing', () => {
	it('Play on a finished model starts from nothing and steps forward on the clock, one step at a time, then stops by itself', async () => {
		reduceMotion(false);
		const { m, calls, control } = slider(3);
		m.one<HTMLSelectElement>('.speed select').value = '2';
		m.one<HTMLSelectElement>('.speed select').dispatchEvent(new Event('change', { bubbles: true }));
		control('play').click(); m.flush();
		expect(calls).toEqual([{ step: 0, playing: true, animate: true }]);
		expect(control('play').getAttribute('aria-pressed')).toBe('true');
		expect(control('play').textContent?.trim()).toBe('Pause');
		await wait(stepInterval(2) * 3 + 250); m.flush();
		expect(calls.map((c) => c.step)).toEqual([0, 1, 2, 3]);
		expect(calls.at(-1)).toEqual({ step: 3, playing: false, animate: true });
		expect(control('play').getAttribute('aria-pressed')).toBe('false');
		expect(m.one('.readout .count').textContent).toBe('3 / 3');
	});
	it('Pause holds the step: nothing more arrives however long it waits', async () => {
		reduceMotion(false);
		const { m, calls, control } = slider(4, 0);
		control('play').click(); m.flush();
		expect(calls).toEqual([]);
		await wait(stepInterval(1) + 120); m.flush();
		expect(calls.map((c) => c.step)).toEqual([1]);
		control('play').click(); m.flush();
		await wait(stepInterval(1) * 2 + 120); m.flush();
		expect(calls.map((c) => c.step)).toEqual([1]);
		expect(control('play').textContent?.trim()).toBe('Play');
	});
	it('under reduced motion the steps still come, as cuts', async () => {
		reduceMotion(true);
		const { m, calls, control } = slider(2, 0);
		control('play').click(); m.flush();
		await wait(stepInterval(1) + 120); m.flush();
		expect(calls).toEqual([{ step: 1, playing: true, animate: false }]);
	});
});
describe('the buttons and the scrubber', () => {
	it('Start, Back, Next, Stop and a scrub each send the step they say, and pause', async () => {
		reduceMotion(false);
		const { m, calls, control } = slider(4, 2);
		control('back').click(); m.flush();
		control('next').click(); m.flush();
		control('next').click(); m.flush();
		control('start').click(); m.flush();
		const range = m.one<HTMLInputElement>('input[type="range"]');
		range.value = '3'; range.dispatchEvent(new Event('input', { bubbles: true })); m.flush();
		control('stop').click(); m.flush();
		expect(calls.map((c) => c.step)).toEqual([1, 2, 3, 0, 3, 4]);
		expect(calls.every((c) => !c.playing)).toBe(true);
		/* At the ends, the step that cannot move says so and sends nothing. */
		expect(control('next').getAttribute('aria-disabled')).toBe('true');
		control('next').click(); m.flush();
		expect(calls).toHaveLength(6);
		control('start').click(); m.flush();
		expect(control('back').getAttribute('aria-disabled')).toBe('true');
		expect(control('next').getAttribute('aria-disabled')).toBeNull();
		expect(m.one('.readout .count').textContent).toBe('0 / 4');
	});
	it('names the feature each step adds, and every control carries a word', () => {
		const { m } = slider(4, 2);
		expect(m.one('.readout .name').textContent).toBe('Base plate');
		expect(m.one<HTMLInputElement>('input[type="range"]').getAttribute('aria-valuetext')).toBe('Step 2 of 4, Base plate');
		expect(m.all<HTMLButtonElement>('.controls button').map((b) => b.textContent?.trim())).toEqual(['Start', 'Back', 'Play', 'Next', 'Stop']);
	});
});
