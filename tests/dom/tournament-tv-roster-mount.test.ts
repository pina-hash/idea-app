// tests/dom/tournament-tv-roster-mount.test.ts
//
// THE PROJECTOR'S ROSTER PAGE, TURNED BY A REAL KEY (prompt 0110, item 1).
//
// `tests/tournament-members.test.ts` proves `rosterWindow`'s arithmetic. The
// guarantee a student at the back of the room needs is different: that the
// register view shows the whole field a page at a time, that ArrowRight and
// ArrowLeft turn the page, that the key is CLAIMED (defaultPrevented) only
// while there is a page to turn to, and that a keydown arriving from a text
// field is left alone -- the same rule the F key already obeys. All of that
// lives in a `svelte:window` handler no source sweep can invoke.
//
// WHAT IS ASSERTED: banner counts, the indicator's text, `defaultPrevented`.
// NOT that the body scrolls: happy-dom has no layout engine and a
// scrollHeight read here is zero (tests/dom/README.md); that claim is
// `tools/browser-verify/routes/tournaments-view-tv-status-registration-open-field-22.mjs`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

import TvStage from '$lib/tournaments/TvStage.svelte';
import { ROSTER_PAGE_MS, ROSTER_PAGE_SIZE } from '$lib/tournaments/live';
import { mountInto, type Mounted } from './mount';

const Stage = TvStage as unknown as Component<Record<string, unknown>>;

const mounted: Mounted[] = [];
const cleanup: Array<() => void> = [];
afterEach(async () => {
	for (const c of cleanup.splice(0)) c();
	while (mounted.length) await mounted.pop()!.stop();
});

function field(n: number) {
	return Array.from({ length: n }, (_, i) => ({
		id: `e${i + 1}`,
		tournament_id: 't-1',
		user_id: null,
		display_name: `Entry ${i + 1}`,
		description: '',
		thumbnail_url: null,
		seed: null,
		created_at: '2026-09-01T00:00:00Z'
	}));
}

function mountRegister(n: number, extra: Record<string, unknown> = {}) {
	const m = mountInto(Stage, {
		tournament: {
			id: 't-1',
			name: 'IDEA100 Hook Design Competition',
			status: 'registration_open',
			champion_entry_id: null
		},
		entries: field(n),
		styles: {},
		matches: [],
		games: [],
		members: {},
		shareUrl: 'https://ideabosco.com/tournaments/t-1',
		showHint: false,
		fullscreen: false,
		...extra
	});
	mounted.push(m);
	return m;
}

function keydown(key: string, target: EventTarget = document.body) {
	const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	target.dispatchEvent(e);
	return e;
}

const indicator = (m: Mounted) =>
	(m.one('[data-testid="tv-roster-page"]').textContent ?? '').replace(/\s+/g, ' ').trim();
const banners = (m: Mounted) => m.all('[data-testid="tv-roster"] .entry-banner').length;

describe('a 22-entry field on the register view', () => {
	it('shows 8 of 22 with a page indicator, and every entry reachable across 3 pages', () => {
		expect(ROSTER_PAGE_SIZE).toBe(8);
		const m = mountRegister(22);
		expect(banners(m)).toBe(8);
		expect(indicator(m)).toBe('Showing 1 to 8 of 22 · page 1 of 3');

		// ArrowRight turns the page and is claimed.
		expect(keydown('ArrowRight').defaultPrevented).toBe(true);
		m.flush();
		expect(banners(m)).toBe(8);
		expect(indicator(m)).toBe('Showing 9 to 16 of 22 · page 2 of 3');
		expect(m.one('[data-testid="tv-roster"]').textContent).toContain('Entry 9');

		expect(keydown('PageDown').defaultPrevented).toBe(true);
		m.flush();
		expect(banners(m)).toBe(6);
		expect(indicator(m)).toBe('Showing 17 to 22 of 22 · page 3 of 3');
		expect(m.one('[data-testid="tv-roster"]').textContent).toContain('Entry 22');

		// Off the end wraps to the front; ArrowLeft wraps back to the end.
		keydown('ArrowRight');
		m.flush();
		expect(indicator(m)).toBe('Showing 1 to 8 of 22 · page 1 of 3');
		expect(keydown('ArrowLeft').defaultPrevented).toBe(true);
		m.flush();
		expect(indicator(m)).toBe('Showing 17 to 22 of 22 · page 3 of 3');
		expect(keydown('PageUp').defaultPrevented).toBe(true);
		m.flush();
		expect(indicator(m)).toBe('Showing 9 to 16 of 22 · page 2 of 3');
	});

	it('leaves an arrow alone when it comes from a text field (the F-key rule)', () => {
		const m = mountRegister(22);
		const area = document.createElement('textarea');
		document.body.appendChild(area);
		cleanup.push(() => area.remove());
		expect(keydown('ArrowRight', area).defaultPrevented).toBe(false);
		m.flush();
		expect(indicator(m)).toBe('Showing 1 to 8 of 22 · page 1 of 3');
	});

	it('still renders 0 controls other than the exit control (none, not fullscreen)', () => {
		const m = mountRegister(22);
		expect(m.all('button, a, input, select, textarea')).toHaveLength(0);
	});
});

describe('the auto-page interval', () => {
	it('is set ONCE for a 3-page field and survives 3 ticks without being torn down and reset', () => {
		// A silent regression: an effect that read `roster.pages` re-ran on
		// every tick (the tick is one of `roster`'s inputs), cleared the
		// interval and set a fresh one -- which still paged, so nothing on
		// screen said so. Counted here on the fake clock: mount sets the
		// rotate interval and the roster interval (2), and three roster
		// periods later the count has not moved and no interval was cleared.
		vi.useFakeTimers();
		cleanup.push(() => vi.useRealTimers());
		const setSpy = vi.spyOn(globalThis, 'setInterval');
		const clearSpy = vi.spyOn(globalThis, 'clearInterval');
		cleanup.push(() => {
			setSpy.mockRestore();
			clearSpy.mockRestore();
		});
		const m = mountRegister(22);
		m.flush();
		const atMount = setSpy.mock.calls.length;
		expect(atMount).toBe(2);
		expect(clearSpy).toHaveBeenCalledTimes(0);
		for (let i = 1; i <= 3; i++) {
			vi.advanceTimersByTime(ROSTER_PAGE_MS);
			m.flush();
		}
		// Three ticks: page 1 -> 2 -> 3 -> back to 1.
		expect(indicator(m)).toBe('Showing 1 to 8 of 22 · page 1 of 3');
		expect(setSpy.mock.calls.length).toBe(atMount);
		expect(clearSpy).toHaveBeenCalledTimes(0);
	});

	it('is not set at all for a field that fits one page', () => {
		vi.useFakeTimers();
		cleanup.push(() => vi.useRealTimers());
		const setSpy = vi.spyOn(globalThis, 'setInterval');
		cleanup.push(() => setSpy.mockRestore());
		const m = mountRegister(5);
		m.flush();
		// The rotate interval alone.
		expect(setSpy.mock.calls.length).toBe(1);
	});
});

describe('a field that fits one page', () => {
	it('shows every entry, no page count, and claims no key', () => {
		const m = mountRegister(5);
		expect(banners(m)).toBe(5);
		expect(indicator(m)).toBe('Showing 1 to 5 of 5');
		expect(keydown('ArrowRight').defaultPrevented).toBe(false);
		expect(keydown('ArrowLeft').defaultPrevented).toBe(false);
		m.flush();
		expect(indicator(m)).toBe('Showing 1 to 5 of 5');
		// Exactly eight is still one page.
		const eight = mountRegister(8);
		expect(banners(eight)).toBe(8);
		expect(indicator(eight)).toBe('Showing 1 to 8 of 8');
	});

	it('names every registrant on a banner when members are supplied', () => {
		const m = mountRegister(2, {
			members: {
				e1: [
					{ id: 'm1', entry_id: 'e1', tournament_id: 't-1', user_id: 'u1', name: 'Azad', created_at: '2026-09-01T00:00:00Z' },
					{ id: 'm2', entry_id: 'e1', tournament_id: 't-1', user_id: null, name: 'Diego', created_at: '2026-09-01T00:00:01Z' }
				]
			}
		});
		const roster = m.one('[data-testid="tv-roster"]');
		expect(roster.querySelectorAll('.members')).toHaveLength(1);
		expect(roster.querySelector('.members')?.textContent).toBe('Azad · Diego');
	});
});
