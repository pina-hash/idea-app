/**
 * THE CLASS PAGE WAS ALREADY OPEN WHEN THE TEACHER POSTED (ledger 0298, R23).
 * This is the case Mr. Pina reported: a draw posted and nobody saw it. The
 * section layout's load never re-runs on a navigation inside the class, so a
 * page opened before the post held "nothing posted" for as long as it stayed
 * open. The page here loads with nothing posted and the region absent (the
 * first step waits for exactly that), then the harness's database "posts" and
 * the window regains focus, and the student's own team must arrive, first and
 * open, with no reload. The same arrival happens on a timer while the tab is
 * visible; tests/dom/class-teams-refresh-mount.test.ts pins the interval.
 */
import { CLASS_LIST, IGNORE, PARTS, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?later=posted',
	label: 'Class page open before the teams were posted: the draw arrives without a reload',
	prepare: [
		{
			waitFor: `() => (${READY})() && !document.querySelector('[data-testid="class-teams"]')`,
			timeoutMs: 20000
		},
		{
			evaluate: `() => { window.__teamsPostedNow = true; window.dispatchEvent(new Event('focus')); return true; }`,
			until: `() => !!document.querySelector('[data-testid="class-team-mine"]')`
		}
	],
	orderResult: [
		{ label: 'own team first, then the board, and no teacher strip', evaluate: PARTS, expected: ['class-team-mine-wrap', 'class-teams-board'] },
		{
			label: 'it arrived through the refresh, not a reload',
			evaluate: `() => [Number(document.querySelector('[data-testid="class-teams-harness"]').dataset.teams), Number(document.querySelector('[data-testid="class-teams-harness"]').dataset.refreshes) >= 1]`,
			expected: [0, true]
		}
	],
	presence: [
		{ selector: '[data-testid="class-team-mine"]', label: 'their own team, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-teams-board"][aria-expanded="false"]', label: 'the whole draw, closed by default', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		CLASS_LIST
	],
	textContains: [{ selector: '[data-testid="class-teams"]', label: 'names, never addresses', must: ['Your team', 'Torque Squad'], mustNot: ['@', 'boscotech'] }],
	ignoreConsole: IGNORE
};
