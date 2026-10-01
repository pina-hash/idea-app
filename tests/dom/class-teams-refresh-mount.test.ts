// tests/dom/class-teams-refresh-mount.test.ts
//
// POSTED TEAMS REACH A CLASS PAGE THAT WAS ALREADY OPEN (ledger 0298, R23), ON
// THE REAL COMPONENT.
//
// Mr. Pina posted a draw and neither the class nor he saw it anywhere but the
// People tab. The section layout's load runs once per visit to the class and
// never on a navigation inside it, so a draw posted after the page loaded
// reached nobody who had it open. `ClassTeams` is now mounted whether or not
// anything is posted and re-asks through an injected `refresh`. That is an
// `$effect` with a timer and two listeners, and effects run ONLY in this
// project, so this is the one place the claim is not vacuous.
//
// Why it is a test and not only a harness: a refresh that silently stopped
// (a listener never attached, an interval torn down on the first tick, a
// failed read blanking the board) renders exactly the page load's answer,
// which is what a person checking by eye expects to see.
//
// Structure, events and call counts only; no geometry (happy-dom has no
// layout engine). The layout and colours are
// tools/browser-verify/routes/classroom-teams*.mjs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClassTeams from '../../src/lib/classroom/ClassTeams.svelte';
import { CLASS_TEAMS_POLL_MS, type ClassTeamSet } from '../../src/lib/classroom/class-teams';
import { PollSignedOut, backoffMs, defaultPokeGapMs } from '../../src/lib/classroom/poll';
import { _resetPollSession } from '../../src/lib/classroom/poll-session';
import { calls as navigationCalls, reset as resetNavigation } from '../../tests/stubs/app-navigation';
import { mountInto, type Mounted } from './mount';

const POSTED: ClassTeamSet = {
	id: 'set-1',
	label: 'Lab pairs',
	posted_at: '2026-09-25T15:00:00.000Z',
	visible_until: '2026-09-26T06:59:59.999Z',
	edited: false,
	teams: [
		{
			id: 't-1',
			team_number: 1,
			name: 'Torque Squad',
			accent_color: null,
			background_type: null,
			background_value: null,
			badge: null,
			flourish: null,
			tagline: null,
			mine: true,
			members: ['Ana Reyes', 'Ben Okafor']
		},
		{
			id: 't-2',
			team_number: 2,
			name: null,
			accent_color: null,
			background_type: null,
			background_value: null,
			badge: null,
			flourish: null,
			tagline: null,
			mine: false,
			members: ['Dee Marsh', 'Eli Nakamura']
		}
	]
};

let mounted: Mounted | null = null;
/**
 * THE SHARED POLLER'S CLOCK, PINNED (ledger 0357). Every case runs on fake
 * timers with `Date` faked and `Math.random` held at 0.5, so the first tick is
 * at exactly half the interval and every later wait is exactly the interval.
 * A tab return inside the poke gap of the last read (or of the page load) asks
 * nothing, so each case moves the clock past the gap before it returns.
 */
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
	vi.spyOn(Math, 'random').mockReturnValue(0.5);
	_resetPollSession();
	resetNavigation();
});
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

const GAP = defaultPokeGapMs(CLASS_TEAMS_POLL_MS);
/** Let the answer land: microtasks only, because the timers are fake. */
async function drain(m: Mounted) {
	m.flush();
	await vi.advanceTimersByTimeAsync(0);
	m.flush();
}
/** Wait out the poke gap, then return to the tab (both events, as a browser fires them). */
async function returnToTab(m: Mounted) {
	await vi.advanceTimersByTimeAsync(GAP);
	document.dispatchEvent(new Event('visibilitychange'));
	window.dispatchEvent(new Event('focus'));
	await drain(m);
}

function mountTeams(props: Record<string, unknown>): Mounted {
	mounted = mountInto(ClassTeams as never, props);
	return mounted;
}

const region = (m: Mounted) => m.all('[data-testid="class-teams"]').length;
const ownCards = (m: Mounted) => m.all('[data-testid="class-team-mine"]').length;
const focus = () => window.dispatchEvent(new Event('focus'));

describe('an open class page learns of a draw posted after it loaded', () => {
	it('nothing posted at load renders nothing, and a refresh that finds a draw puts the own team first', async () => {
		const refresh = vi.fn(async () => [POSTED]);
		const m = mountTeams({ sets: [], refresh });
		// Nothing posted when the page loaded: no region at all, never an empty card.
		expect(region(m)).toBe(0);
		expect(refresh).toHaveBeenCalledTimes(0);
		// A return inside the gap after the load asks nothing: the load just answered.
		focus();
		await drain(m);
		expect(refresh).toHaveBeenCalledTimes(0);

		await returnToTab(m);
		// visibilitychange AND focus are ONE read (the 2-3x-per-tick defect).
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(region(m)).toBe(1);
		expect(ownCards(m)).toBe(1);
		expect(m.one('[data-testid="class-team-mine"] .ct-name').textContent?.trim()).toBe('Torque Squad');
	});

	it('the interval re-asks on its own, while the tab is visible, out of step with the class', async () => {
		const refresh = vi.fn(async () => [POSTED]);
		const m = mountTeams({ sets: [], refresh });
		// The first read is a random offset into the interval (0.5 here), never
		// the instant every student's page loaded.
		await vi.advanceTimersByTimeAsync(CLASS_TEAMS_POLL_MS / 2 - 1);
		expect(refresh).toHaveBeenCalledTimes(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		await drain(m);
		expect(region(m)).toBe(1);
		await vi.advanceTimersByTimeAsync(CLASS_TEAMS_POLL_MS);
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	it('a failed refresh keeps what is on screen and backs off; a draw taken down comes off', async () => {
		let answer: ClassTeamSet[] | null = null;
		const refresh = vi.fn(async () => answer);
		const m = mountTeams({ sets: [POSTED], refresh });
		expect(region(m)).toBe(1);

		// A read that failed answers null: the teams stay.
		await returnToTab(m);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(region(m)).toBe(1);
		expect(ownCards(m)).toBe(1);

		// The teacher took it down: the database answers nothing posted. A tab
		// return does not cut the backoff short; the backed-off tick reads it.
		answer = [];
		await returnToTab(m);
		expect(refresh).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(backoffMs(CLASS_TEAMS_POLL_MS, 1));
		await drain(m);
		expect(refresh).toHaveBeenCalledTimes(2);
		expect(region(m)).toBe(0);
	});

	it('the teacher strip follows the refreshed draw', async () => {
		const refresh = vi.fn(async () => [POSTED]);
		const m = mountTeams({
			sets: [],
			refresh,
			manage: { href: '/classroom/s-1/people', label: 'People' },
			today: '2026-09-25'
		});
		expect(m.all('[data-testid="class-teams-posted"]').length).toBe(0);
		await returnToTab(m);
		const strip = m.one('[data-testid="class-teams-posted"]').textContent ?? '';
		expect(strip).toContain('Teams posted until');
		expect(strip).toContain('11:59');
	});

	it('a refresh refused for want of a session stops for good and hands over once', async () => {
		let lost = false;
		const refresh = vi.fn(async () => {
			if (lost) throw new PollSignedOut();
			return [POSTED];
		});
		const m = mountTeams({ sets: [POSTED], refresh });
		await returnToTab(m);
		expect(refresh).toHaveBeenCalledTimes(1);
		lost = true;
		await vi.advanceTimersByTimeAsync(CLASS_TEAMS_POLL_MS);
		await drain(m);
		expect(refresh).toHaveBeenCalledTimes(2);
		expect(navigationCalls.filter((c) => c.fn === 'invalidate')).toEqual([
			{ fn: 'invalidate', args: ['supabase:auth'] }
		]);
		// Never again as anon: an hour of ticks and returns asks nothing.
		for (let i = 0; i < 20; i++) await returnToTab(m);
		await vi.advanceTimersByTimeAsync(60 * 60_000);
		expect(refresh).toHaveBeenCalledTimes(2);
		// What was on screen stays.
		expect(region(m)).toBe(1);
	});

	it('unmounting stops the listeners, and no refresh means no reads at all', async () => {
		const refresh = vi.fn(async () => [POSTED]);
		const m = mountTeams({ sets: [], refresh });
		await m.stop();
		mounted = null;
		await vi.advanceTimersByTimeAsync(GAP);
		focus();
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(CLASS_TEAMS_POLL_MS * 3);
		expect(refresh).toHaveBeenCalledTimes(0);

		// Absence is the mechanism: omitted, the component is the page load's answer.
		const still = mountTeams({ sets: [POSTED] });
		await returnToTab(still);
		expect(region(still)).toBe(1);
	});
});

describe('a posted draw a teacher changed by hand says so on the class page (decision 44)', () => {
	it('says Edited by hand beside the board and the own-team label when `edited` is true', () => {
		const m = mountTeams({ sets: [{ ...POSTED, edited: true }] });
		const marks = m.all('[data-testid="class-teams-edited"]');
		// Once on the student's own card label and once on the whole board.
		expect(marks.length).toBe(2);
		for (const mark of marks) expect(mark.textContent).toContain('Edited by hand');
	});

	it('says nothing for a draw exactly as its seed dealt it (the same board, the control)', () => {
		const m = mountTeams({ sets: [POSTED] });
		expect(m.all('[data-testid="class-teams-edited"]').length).toBe(0);
		expect(region(m)).toBe(1);
		expect(ownCards(m)).toBe(1);
	});
});
