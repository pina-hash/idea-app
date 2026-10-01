/**
 * A PERSON WHO MOVED THE POSTS ABOVE THE TEAMS (ledger 0360, report R23). The
 * stored order puts the anchor second, under the class header, so every panel
 * after it renders BELOW the posts, in the stored order, through
 * `PanelStack`'s second list. The class tools (a piece of the header) and the
 * page's h1 are still there: moving is not hiding.
 */
import { DOM_ORDER, IGNORE, READY } from './_classroom-layout.mjs';

export default {
	path: '/dev/classroom-layout?page=class&preset=reordered',
	label: 'Class page as a student who moved the posts above the teams',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	orderResult: [
		{
			label: 'the posts come second, and everything after them in the stored order',
			evaluate: DOM_ORDER,
			expected: ['banner', 'stream', 'teams', 'find', 'videos']
		}
	],
	domOrder: [
		{ before: '[data-testid="lh-anchor"]', after: '[data-panel="teams"]', label: 'the posts before the teams', beforeLabel: 'posts', afterLabel: 'teams' }
	],
	presence: [
		{ selector: '[data-testid="class-tools"]', label: 'the class tools, still shown', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.lh-main h1', label: "the page's h1, moved but never hidden", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'nothing hidden, so no hidden-panels line', expectPresent: 0 }
	],
	ignoreConsole: IGNORE
};
