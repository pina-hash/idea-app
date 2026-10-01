/**
 * A PERSON WHO MOVED THE SEARCH ROW ABOVE THE CLASS HEADER (ledger 0360,
 * report R23 on R19 and R22). The notice then leads the page, ahead of the
 * search row, because no arrangement may put a teacher's notice below
 * anything but the class header; the header keeps its pieces and its h1.
 */
import { DOM_ORDER, IGNORE, READY } from './_classroom-layout.mjs';

export default {
	path: '/dev/classroom-layout?page=class&preset=search-first',
	label: 'Class page with the search row above the header: the notice leads the page',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	orderResult: [
		{ label: 'the search row first, then the header, in the stored order', evaluate: DOM_ORDER, expected: ['find', 'banner', 'teams', 'videos', 'stream'] }
	],
	domOrder: [
		{ before: '[data-testid="lh-notices"]', after: '[data-panel="find"]', label: 'the notice ahead of the search row', beforeLabel: 'notice', afterLabel: 'search' }
	],
	presence: [
		{ selector: '[data-testid="lh-notices"]', label: 'the notice, once', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.lh-main h1', label: "the page's h1, moved but never hidden", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="lh-header-row"] [data-panel="tools"]', label: 'the class tools, still inside the header', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	ignoreConsole: IGNORE
};
