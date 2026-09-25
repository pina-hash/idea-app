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

import { afterEach, describe, expect, it, vi } from 'vitest';
import ClassTeams from '../../src/lib/classroom/ClassTeams.svelte';
import { CLASS_TEAMS_POLL_MS, type ClassTeamSet } from '../../src/lib/classroom/class-teams';
import { mountInto, type Mounted } from './mount';

const POSTED: ClassTeamSet = {
	id: 'set-1',
	label: 'Lab pairs',
	posted_at: '2026-09-25T15:00:00.000Z',
	visible_until: '2026-09-26T06:59:59.999Z',
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
afterEach(async () => {
	vi.useRealTimers();
	await mounted?.stop();
	mounted = null;
});

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

		focus();
		await m.settle();
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(region(m)).toBe(1);
		expect(ownCards(m)).toBe(1);
		expect(m.one('[data-testid="class-team-mine"] .ct-name').textContent?.trim()).toBe('Torque Squad');
	});

	it('the interval re-asks on its own, while the tab is visible', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		const refresh = vi.fn(async () => [POSTED]);
		const m = mountTeams({ sets: [], refresh });
		vi.advanceTimersByTime(CLASS_TEAMS_POLL_MS - 1);
		expect(refresh).toHaveBeenCalledTimes(0);
		vi.advanceTimersByTime(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		await m.settle();
		expect(region(m)).toBe(1);
		vi.advanceTimersByTime(CLASS_TEAMS_POLL_MS);
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	it('a failed refresh keeps what is on screen; a draw taken down comes off', async () => {
		let answer: ClassTeamSet[] | null = null;
		const refresh = vi.fn(async () => answer);
		const m = mountTeams({ sets: [POSTED], refresh });
		expect(region(m)).toBe(1);

		// A read that failed answers null: the teams stay.
		focus();
		await m.settle();
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(region(m)).toBe(1);
		expect(ownCards(m)).toBe(1);

		// The teacher took it down: the database answers nothing posted.
		answer = [];
		focus();
		await m.settle();
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
		focus();
		await m.settle();
		const strip = m.one('[data-testid="class-teams-posted"]').textContent ?? '';
		expect(strip).toContain('Teams posted until');
		expect(strip).toContain('11:59');
	});

	it('unmounting stops the listeners, and no refresh means no reads at all', async () => {
		const refresh = vi.fn(async () => [POSTED]);
		const m = mountTeams({ sets: [], refresh });
		await m.stop();
		mounted = null;
		focus();
		document.dispatchEvent(new Event('visibilitychange'));
		await new Promise((r) => setTimeout(r, 30));
		expect(refresh).toHaveBeenCalledTimes(0);

		// Absence is the mechanism: omitted, the component is the page load's answer.
		const still = mountTeams({ sets: [POSTED] });
		focus();
		await still.settle();
		expect(region(still)).toBe(1);
	});
});
