// tests/armory-live-coalesce.test.ts
//
// THE ARMORY PROJECT PAGE'S RELOAD TIMING. Realtime fires one event per change
// row and every change is a full reload of the project, so events are
// coalesced: a burst is ONE reload after it goes quiet for a second. A
// trailing timer alone is restarted by every event, so a steady stream (a
// class saving rows less than a second apart) held the page on stale data
// until the stream stopped; the reload is now never later than
// ARMORY_CHANGE_MAX_WAIT_MS after the burst's first event.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARMORY_CHANGE_COALESCE_MS, ARMORY_CHANGE_MAX_WAIT_MS, changeCoalescer } from '../src/lib/armory/live';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
	vi.setSystemTime(Date.parse('2026-10-08T15:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('changeCoalescer', () => {
	it('a burst of sixty events in a second is one reload, a second after the last', () => {
		let reloads = 0;
		const c = changeCoalescer(() => reloads++);
		for (let i = 0; i < 60; i++) {
			c.changed();
			vi.advanceTimersByTime(15);
		}
		expect(reloads).toBe(0);
		vi.advanceTimersByTime(ARMORY_CHANGE_COALESCE_MS);
		expect(reloads).toBe(1);
		vi.advanceTimersByTime(60_000);
		expect(reloads).toBe(1);
	});

	it('a stream that never goes quiet still reloads within the maximum wait, and keeps reloading', () => {
		const at: number[] = [];
		const start = Date.now();
		const c = changeCoalescer(() => at.push(Date.now() - start));
		// An event every 600ms for 12 seconds: never a quiet second.
		for (let t = 0; t < 12_000; t += 600) {
			c.changed();
			vi.advanceTimersByTime(600);
		}
		vi.advanceTimersByTime(ARMORY_CHANGE_COALESCE_MS);
		expect(at.length).toBeGreaterThanOrEqual(3);
		expect(at[0]).toBeLessThanOrEqual(ARMORY_CHANGE_MAX_WAIT_MS);
		for (let i = 1; i < at.length - 1; i++) expect(at[i] - at[i - 1]).toBeLessThanOrEqual(ARMORY_CHANGE_MAX_WAIT_MS + 600);
	});

	it('one change still lands within a second, and stop() drops a pending one', () => {
		let reloads = 0;
		const c = changeCoalescer(() => reloads++);
		c.changed();
		vi.advanceTimersByTime(ARMORY_CHANGE_COALESCE_MS);
		expect(reloads).toBe(1);
		c.changed();
		c.stop();
		vi.advanceTimersByTime(10_000);
		c.changed();
		vi.advanceTimersByTime(10_000);
		expect(reloads).toBe(1);
	});
});
