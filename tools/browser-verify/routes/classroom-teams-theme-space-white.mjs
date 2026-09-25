/**
 * A STUDENT'S OWN TEAM UNDER SPACE WHITE (ledger 0298, R23). The class page is
 * in the light theme's scope; the harness holds no session, so the attribute
 * is forced the classroom-live way. The card paints in the team's own colours
 * whatever the theme, so what moves here is the label above it and the board
 * trigger below it.
 */
import { IGNORE, PARTS, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?theme=space-white',
	label: 'Class page as a student under Space White: their team first',
	prepare: [
		{ waitFor: READY, timeoutMs: 20000 },
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }
	],
	orderResult: [{ label: 'own team first, then the board', evaluate: PARTS, expected: ['class-team-mine-wrap', 'class-teams-board'] }],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-team-mine"]', label: 'their own team, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="class-team-mine-wrap"] .ct-mine-label', label: 'Your team label', min: 4.5 },
		{ selector: '[data-testid="class-teams-board"]', label: 'board trigger', min: 4.5 },
		{ selector: '[data-testid="class-teams-board"] .ct-count', label: 'board count', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="class-teams-board"]', label: 'the board trigger' }],
	ignoreConsole: IGNORE
};
