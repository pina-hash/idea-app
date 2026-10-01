/**
 * THE CLASS PAGE WITH NO STORED LAYOUT RENDERS AS IT SHIPS (ledger 0360,
 * report R23, phase 1). Nobody has arranged anything yet, which is every
 * account the day this lands, so the panels come out in the page's own order,
 * the posts are there (the positive control for every absence below), and no
 * "Hidden on this page" line appears.
 */
import { DOM_ORDER, IGNORE, READY } from './_classroom-layout.mjs';

export default {
	path: '/dev/classroom-layout',
	label: 'Class page as a student, nothing arranged: the shipped order, nothing hidden',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	orderResult: [
		{
			label: "the panels in DOM order: the shipped order, the header's pieces inside it",
			evaluate: DOM_ORDER,
			expected: ['banner', 'teams', 'find', 'videos', 'stream']
		}
	],
	presence: [
		{ selector: '[data-testid="lh-anchor"]', label: 'the posts (the anchor)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="item-row"]', label: 'the posts listed (positive control)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="class-team-mine"]', label: 'the real teams panel renders the own team', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'no hidden-panels line when nothing is hidden', expectPresent: 0 },
		{ selector: '[data-panel="actions"]', label: 'no posting keys for a student', expectPresent: 0 },
		{ selector: '[data-testid="lh-header-row"] [data-panel="tools"]', label: 'the class tools, inside the header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="lh-header-row"] [data-panel="theme"]', label: 'the theme key, inside the header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="lh-notices"]', label: 'the notice', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	domOrder: [
		{ before: '[data-panel="banner"]', after: '[data-testid="lh-notices"]', label: 'the notice directly under the header', beforeLabel: 'header', afterLabel: 'notice' },
		{ before: '[data-testid="lh-notices"]', after: '[data-panel="teams"]', label: 'the notice before the teams', beforeLabel: 'notice', afterLabel: 'teams' }
	],
	tapTargets: [{ selector: '[data-testid="settings-trigger"]', label: 'Display settings', min: 44 }],
	ignoreConsole: IGNORE
};
