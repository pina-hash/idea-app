// tests/tab-icon-status.test.ts
//
// The tab icon's status registry (ledger 0396): which raised status shows,
// and which ones end themselves. Pure, with an injected timer, so the rules
// are asserted at a pinned instant rather than by waiting.

import { describe, expect, it } from 'vitest';
import {
	createTabStatusRegistry,
	DONE_CLEAR_MS,
	TAB_STATUS_PRIORITY,
	type TabStatusTimers
} from '../src/lib/tab-icon/status';
import { animates, frameFor, framePhase, stillPhase, titleWithUnread, TAB_ICON_RESTING } from '../src/lib/tab-icon/live';
import { icon } from '../src/lib/tab-icon/geometry';

const MINT = '#8FE08A';
const CRIMSON = '#FF3355';
const LIVE_LOW = '#7A1A2A';
const LED_OFF = '#2C332F';
/** The fill of a section icon's lamp core (the corner lamp, radius 3.4). */
const sectionLamp = (svg: string) => /<circle cx="25" cy="25" r="3.4" fill="([^"]+)"\/>/.exec(svg)?.[1] ?? null;
/** The fill of Home's hub core (the gear's lamp, radius 4.4). */
const homeHub = (svg: string) => /<circle cx="16" cy="16" r="4.4" fill="([^"]+)"\/>/.exec(svg)?.[1] ?? null;

/** A timer that only fires when told, so "four seconds later" is one call. */
function fakeTimers() {
	let t = 0;
	const due: Array<{ at: number; fn: () => void; id: number; live: boolean }> = [];
	let ids = 0;
	const timers: TabStatusTimers = {
		set(fn, ms) {
			const id = ++ids;
			due.push({ at: t + ms, fn, id, live: true });
			return id;
		},
		clear(id) {
			const d = due.find((x) => x.id === id);
			if (d) d.live = false;
		}
	};
	return {
		timers,
		advance(ms: number) {
			t += ms;
			for (const d of due) {
				if (d.live && d.at <= t) {
					d.live = false;
					d.fn();
				}
			}
		},
		pending: () => due.filter((d) => d.live).length
	};
}

describe('priority', () => {
	it('the order is the design order', () => {
		expect([...TAB_STATUS_PRIORITY]).toEqual([
			'error',
			'live',
			'unread',
			'attention',
			'progress',
			'saving',
			'done',
			'offline'
		]);
	});

	it('with three statuses raised at once the highest shows, and clearing it reveals the next', () => {
		const r = createTabStatusRegistry(fakeTimers().timers);
		const saving = r.raise('saving');
		const unread = r.raise('unread', { n: 2 });
		const error = r.raise('error');
		expect(r.current()).toEqual({ kind: 'error' });
		error.clear();
		expect(r.current()).toEqual({ kind: 'unread', n: 2 });
		unread.clear();
		expect(r.current()).toEqual({ kind: 'saving' });
		saving.clear();
		expect(r.current()).toEqual({ kind: 'none' });
	});

	it('every adjacent pair in the order: the higher one wins, raised either way round', () => {
		let checked = 0;
		for (let i = 0; i < TAB_STATUS_PRIORITY.length - 1; i++) {
			const hi = TAB_STATUS_PRIORITY[i];
			const lo = TAB_STATUS_PRIORITY[i + 1];
			for (const order of [
				[hi, lo],
				[lo, hi]
			]) {
				const r = createTabStatusRegistry(fakeTimers().timers);
				for (const k of order) r.raise(k, { n: 1, p: 0.5 });
				expect(r.current().kind, `${order.join(' then ')}`).toBe(hi);
				checked++;
			}
		}
		expect(checked).toBe((TAB_STATUS_PRIORITY.length - 1) * 2);
	});

	it('unread counts add up across raisers, and a count of zero shows nothing', () => {
		const r = createTabStatusRegistry(fakeTimers().timers);
		const a = r.raise('unread', { n: 2 });
		r.raise('unread', { n: 3 });
		expect(r.current()).toEqual({ kind: 'unread', n: 5 });
		expect(r.unread()).toBe(5);
		a.update({ n: 0 });
		expect(r.unread()).toBe(3);
		const r2 = createTabStatusRegistry(fakeTimers().timers);
		r2.raise('unread', { n: 0 });
		expect(r2.current()).toEqual({ kind: 'none' });
	});

	it('progress carries the latest raiser\'s fraction, clamped, and follows update()', () => {
		const r = createTabStatusRegistry(fakeTimers().timers);
		const up = r.raise('progress', { p: 0.25 });
		expect(r.current()).toEqual({ kind: 'progress', p: 0.25 });
		up.update({ p: 7 });
		expect(r.current()).toEqual({ kind: 'progress', p: 1 });
		up.update({ p: Number.NaN });
		expect(r.current()).toEqual({ kind: 'progress', p: 0 });
	});
});

describe('what ends itself', () => {
	it('done clears itself after four seconds; error does not', () => {
		const clock = fakeTimers();
		const r = createTabStatusRegistry(clock.timers);
		const done = r.raise('done');
		expect(r.current()).toEqual({ kind: 'done' });
		clock.advance(DONE_CLEAR_MS - 1);
		expect(r.current()).toEqual({ kind: 'done' });
		clock.advance(1);
		expect(done.active).toBe(false);
		expect(r.current()).toEqual({ kind: 'none' });

		const error = r.raise('error');
		clock.advance(DONE_CLEAR_MS * 100);
		expect(error.active).toBe(true);
		expect(r.current()).toEqual({ kind: 'error' });
		expect(clock.pending()).toBe(0);
		error.clear();
		expect(r.current()).toEqual({ kind: 'none' });
	});

	it('clearing a done before its timer cancels the timer; clearing twice is safe', () => {
		const clock = fakeTimers();
		const r = createTabStatusRegistry(clock.timers);
		const done = r.raise('done');
		expect(clock.pending()).toBe(1);
		done.clear();
		done.clear();
		r.clear(null);
		expect(clock.pending()).toBe(0);
		expect(r.current()).toEqual({ kind: 'none' });
	});

	it('every change notifies subscribers, and an update that changes nothing does not', () => {
		const r = createTabStatusRegistry(fakeTimers().timers);
		let calls = 0;
		const off = r.subscribe(() => calls++);
		const h = r.raise('progress', { p: 0.5 });
		h.update({ p: 0.5 });
		h.update({ p: 0.6 });
		h.clear();
		off();
		r.raise('error');
		expect(calls).toBe(3);
	});
});

describe('the painter\'s pure helpers', () => {
	it('only live and saving animate, and never under reduced motion', () => {
		expect(animates('live', false)).toBe(true);
		expect(animates('saving', false)).toBe(true);
		for (const k of ['none', 'unread', 'error', 'attention', 'progress', 'done', 'offline'] as const)
			expect(animates(k, false), k).toBe(false);
		expect(animates('live', true)).toBe(false);
		expect(animates('saving', true)).toBe(false);
	});

	it('the live pulse alternates two distinct frames, half a second each, and opens on its lit half', () => {
		const frames = [0, 1, 2, 3].map((i) => frameFor('maps', { kind: 'live' }, i, false));
		expect(frames[0]).toBe(frames[1]);
		expect(frames[2]).toBe(frames[3]);
		expect(frames[0]).not.toBe(frames[2]);
		// No frame sits on a zero crossing, where float noise would pick the lamp.
		for (const i of [0, 1, 2, 3])
			expect(Math.abs(Math.cos(Math.PI * 2 * framePhase('live', i)))).toBeGreaterThan(0.5);
		expect(sectionLamp(frames[0])).toBe(CRIMSON);
		expect(sectionLamp(frames[2])).toBe(LIVE_LOW);
	});

	it('the saving lamp blinks on alternate frames and opens LIT, on a section and on Home', () => {
		const f = [0, 1, 2, 3].map((i) => frameFor('maps', { kind: 'saving' }, i, false));
		expect(f[0]).toBe(f[2]);
		expect(f[1]).toBe(f[3]);
		expect(f[0]).not.toBe(f[1]);
		for (const i of [0, 1, 2, 3])
			expect(Math.abs(Math.sin(Math.PI * 4 * framePhase('saving', i)))).toBeGreaterThan(0.5);
		// Frame 0 is the mint lamp, frame 1 the dark one: a save shorter than
		// one frame shows the lit lamp, never a dark dot.
		expect(sectionLamp(f[0])).toBe(MINT);
		expect(sectionLamp(f[1])).toBe(LED_OFF);
		// On Home the lit lamp IS the resting mint hub (the drawing's own
		// property), so saving there opens on the resting drawing and blinks the
		// hub dark on the off beat.
		const h = [0, 1].map((i) => frameFor('home', { kind: 'saving' }, i, false));
		expect(h[0]).toBe(TAB_ICON_RESTING);
		expect(homeHub(h[1])).toBe(LED_OFF);
	});

	it('under reduced motion each animated kind holds its LIT opening frame, whatever frame is asked for', () => {
		for (const section of ['maps', 'classroom', 'home'] as const) {
			for (const kind of ['live', 'saving'] as const) {
				const still = frameFor(section, { kind }, 3, true);
				expect(still, `${section} ${kind}`).toBe(frameFor(section, { kind }, 0, false));
				expect(still).toBe(frameFor(section, { kind }, 1, true));
			}
		}
		expect(sectionLamp(frameFor('maps', { kind: 'saving' }, 2, true))).toBe(MINT);
		expect(sectionLamp(frameFor('maps', { kind: 'live' }, 2, true))).toBe(CRIMSON);
		expect(stillPhase('saving')).toBe(framePhase('saving', 0));
		// Why the still frame is not the drawing's own default phase 0: that
		// sits on the saving lamp's zero crossing, which the drawing draws dark.
		expect(sectionLamp(icon('gearkey', 'maps', { kind: 'saving' }))).toBe(LED_OFF);
	});

	it('home at rest is the static favicon drawing', () => {
		expect(frameFor('home', { kind: 'none' }, 0, false)).toBe(TAB_ICON_RESTING);
	});

	it('the title prefix', () => {
		expect(titleWithUnread('Classroom', 3)).toBe('(3) Classroom');
		expect(titleWithUnread('Classroom', 0)).toBe('Classroom');
	});
});
