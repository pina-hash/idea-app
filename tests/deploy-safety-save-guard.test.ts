import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE SAVE GUARD'S TWO NEW OBLIGATIONS, asserted where they fail silently.
 *
 *  1. A FLUSH HAS A DEADLINE. A save that never answers used to hold every
 *     in-app link dead for as long as it hung (measured on the real engine: the
 *     address unchanged at 300ms, 1s, 3s and 8s). After
 *     `SAVE_GUARD_FLUSH_TIMEOUT_MS` the guard asks, exactly as it does for a
 *     flush that failed.
 *  2. THE RE-ISSUED NAVIGATION IS MARKED WHILE IT RUNS, for the navigation the
 *     person made. `DeployWatch` refuses to reload on a programmatic `goto`, so
 *     without the mark a page with unsaved work could never take a new version
 *     of the site -- and with it on the wrong navigation, a form would reload.
 *
 * `$app/navigation` is mocked HERE rather than through the shared stub,
 * because the thing under test is what is true DURING the `goto`: the mock
 * records `resumedNavigation(...)` at the moment it is called, which the
 * shared stub's recorder cannot see. The SaveState is the real one.
 */

const nav = vi.hoisted(() => ({
	guards: [] as ((n: unknown) => void)[],
	gotos: [] as { path: string; resumedDuring: boolean; ackedBefore: number }[],
	acked: 0
}));

vi.mock('$app/navigation', async () => {
	const safety = await import('../src/lib/shell/deploy-safety');
	return {
		beforeNavigate: (cb: (n: unknown) => void) => {
			nav.guards.push(cb);
		},
		goto: async (url: URL | string) => {
			const path = new URL(String(url), 'http://x').pathname;
			nav.gotos.push({
				path,
				resumedDuring: safety.resumedNavigation(path),
				ackedBefore: nav.acked
			});
		}
	};
});

import { SaveState } from '../src/lib/save-state.svelte';
import { SAVE_GUARD_FLUSH_TIMEOUT_MS, guardSaveNavigation } from '../src/lib/save-guard.svelte';
import { resumedNavigation } from '../src/lib/shell/deploy-safety';

const WARNING = 'Your answer has not been saved yet.';

function linkTo(path: string, type = 'link') {
	let cancelled = false;
	return {
		nav: {
			type,
			from: { route: { id: '/classroom/[sectionId]/item/[itemId]' }, url: new URL('http://x/a') },
			to: { route: { id: '/classroom/[sectionId]' }, url: new URL(`http://x${path}`) },
			cancel: () => {
				cancelled = true;
			}
		},
		cancelled: () => cancelled
	};
}

let confirm: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.useFakeTimers();
	nav.guards.length = 0;
	nav.gotos.length = 0;
	nav.acked = 0;
	confirm = vi.fn(() => true);
	vi.stubGlobal('window', { confirm });
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

/** A SaveState whose write settles after `ms`, or never with `ms` null. */
function machine(ms: number | null) {
	return new SaveState({
		save: () =>
			ms === null
				? new Promise(() => {})
				: new Promise((resolve) =>
						setTimeout(() => {
							nav.acked += 1;
							resolve({ ok: true });
						}, ms)
					)
	});
}

describe('the flush deadline', () => {
	it('is twelve seconds, inside the 12-15s the brief allows', () => {
		expect(SAVE_GUARD_FLUSH_TIMEOUT_MS).toBe(12_000);
	});

	it('asks after the deadline when the save never answers, and not a moment before', async () => {
		const state = machine(null);
		guardSaveNavigation(state, { warning: WARNING });
		state.markDirty();
		const click = linkTo('/classroom/s-1');
		nav.guards[0](click.nav);
		expect(click.cancelled()).toBe(true);

		await vi.advanceTimersByTimeAsync(SAVE_GUARD_FLUSH_TIMEOUT_MS - 1);
		expect(confirm).not.toHaveBeenCalled();
		expect(nav.gotos).toEqual([]);

		await vi.advanceTimersByTimeAsync(1);
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(String(confirm.mock.calls[0][0])).toContain(WARNING);
		// "Leave anyway?" answered yes: the navigation goes, marked as the
		// person's own, with nothing acknowledged -- the question was the point.
		expect(nav.gotos).toEqual([{ path: '/classroom/s-1', resumedDuring: true, ackedBefore: 0 }]);
	});

	it('stays when the question is answered no', async () => {
		confirm.mockImplementation(() => false);
		const state = machine(null);
		guardSaveNavigation(state, { warning: WARNING });
		state.markDirty();
		nav.guards[0](linkTo('/classroom/s-1').nav);
		await vi.advanceTimersByTimeAsync(SAVE_GUARD_FLUSH_TIMEOUT_MS);
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(nav.gotos).toEqual([]);
	});
});

describe('the re-issued navigation', () => {
	it('is acknowledged first, then marked resumed while it runs, then unmarked', async () => {
		const state = machine(300);
		guardSaveNavigation(state, { warning: WARNING });
		state.markDirty();
		nav.guards[0](linkTo('/classroom/s-1/item/i-2').nav);

		await vi.advanceTimersByTimeAsync(300);
		expect(confirm).not.toHaveBeenCalled();
		expect(nav.gotos).toEqual([
			{ path: '/classroom/s-1/item/i-2', resumedDuring: true, ackedBefore: 1 }
		]);
		// And the mark does not outlive the navigation it was for.
		await vi.advanceTimersByTimeAsync(1);
		expect(resumedNavigation('/classroom/s-1/item/i-2')).toBe(false);
	});

	it('is marked for the back button too', async () => {
		const state = machine(300);
		guardSaveNavigation(state, { warning: WARNING });
		state.markDirty();
		nav.guards[0](linkTo('/classroom/s-1', 'popstate').nav);
		await vi.advanceTimersByTimeAsync(300);
		expect(nav.gotos[0]?.resumedDuring).toBe(true);
	});

	it('is NOT marked for a form, which must never reload', async () => {
		const state = machine(300);
		guardSaveNavigation(state, { warning: WARNING });
		state.markDirty();
		nav.guards[0](linkTo('/search', 'form').nav);
		await vi.advanceTimersByTimeAsync(300);
		expect(nav.gotos).toEqual([{ path: '/search', resumedDuring: false, ackedBefore: 1 }]);
	});

	it('lets a clean page through untouched: nothing cancelled, nothing re-issued', async () => {
		const state = machine(300);
		guardSaveNavigation(state, { warning: WARNING });
		const click = linkTo('/classroom/s-1');
		nav.guards[0](click.nav);
		await vi.advanceTimersByTimeAsync(SAVE_GUARD_FLUSH_TIMEOUT_MS);
		expect(click.cancelled()).toBe(false);
		expect(nav.gotos).toEqual([]);
	});
});
