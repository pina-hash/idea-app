/**
 * THE CLASS PAGE WAS ALREADY OPEN WHEN THE TEACHER POSTED (ledger 0298, R23).
 * This is the case Mr. Pina reported: a draw posted and nobody saw it. The
 * section layout's load never re-runs on a navigation inside the class, so a
 * page opened before the post held "nothing posted" for as long as it stayed
 * open. The page here loads with nothing posted and the region absent (the
 * first step waits for exactly that), then the harness's database "posts", and
 * the student's own team must arrive, first and open, with no reload. It
 * arrives on the refresh's own timer: the harness runs `later` mode on a
 * two-second cadence, because the shared poller (ledger 0357) ignores a tab
 * return inside its gap after the page load and the shipped floor is five
 * minutes. tests/dom/class-teams-refresh-mount.test.ts pins the shipped
 * interval, the gap and the one-read-per-return rule.
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
			evaluate: `() => { window.__teamsPostedNow = true; return true; }`,
			until: `() => !!document.querySelector('[data-testid="class-team-mine"]')`,
			// The refresh's own timer brings it, within one two-second cadence.
			attempts: 30
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
