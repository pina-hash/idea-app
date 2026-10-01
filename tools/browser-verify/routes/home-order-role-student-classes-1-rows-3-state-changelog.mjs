import { SETTLE_ENTRANCE } from './_shared.mjs';
import { reach } from './_home-theme.mjs';

/**
 * THE PORTAL UPDATES PANEL, OPENED (ledger 0360, report R24).
 *
 * The panel rendered the WHOLE commit log the moment it opened -- 2,507 rows on
 * the day it was reported, about seven nodes each -- and opening it lagged. It
 * now renders a first page (`CHANGELOG_PAGE_SIZE` in `$lib/site-versions`) with
 * a "Show more" key under it and a readout of how many it is showing.
 *
 * WHAT IS GATED: exactly one page of rows on open (the ceiling is the row that
 * fails on the old panel, which rendered every entry), the Show more key there
 * once, 44px, carrying its word, and readable, and the readout saying "Showing
 * <page> of". WHAT IS PRINTED, NEVER PINNED: the total (it grows with every
 * commit), the node count under the panel and the longest main-thread task
 * observed while it opened -- a timing is the machine's, not the page's.
 *
 * The log is the REAL lazy `virtual:site-changelog` module the dev server
 * builds from this checkout's git history (the first build walks numstat, a
 * few seconds), so the wait is long.
 */
export const PAGE = 150;

const HIDE_STRIP = `() => { const s = document.querySelector('.harness-strip'); if (s) s.style.display = 'none'; return s ? 'harness strip hidden' : 'no harness strip'; }`;

/** Open the panel and wait for the lazy log, under `theme` (reached through the shipping profile-menu control). */
export const openChangelog = (theme = 'idea') => [
	{ evaluate: SETTLE_ENTRANCE, label: 'settle the entrance' },
	...(theme === 'idea' ? [] : reach(theme)),
	{ evaluate: HIDE_STRIP, label: 'the harness strip is not the page' },
	{
		evaluate: `() => {
			window.__lt = [];
			try {
				new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__lt.push(e.duration); })
					.observe({ type: 'longtask', buffered: true });
				return 'long-task observer installed';
			} catch (e) { return 'no long-task observer here: ' + e.message; }
		}`,
		label: 'watch for long tasks'
	},
	{
		click: '#changelog-btn',
		until: '() => !!document.querySelector("#changelog-body.open")',
		attempts: 12,
		waitMs: 250,
		label: 'open the panel'
	},
	{
		waitFor: '() => document.querySelectorAll("#changelog-body .changelog-entry").length > 0',
		timeoutMs: 90000,
		label: 'the lazy log has arrived and rendered'
	},
	{
		evaluate: `async () => {
			await new Promise((r) => setTimeout(r, 400));
			const body = document.querySelector('#changelog-body');
			const rows = body.querySelectorAll('.changelog-entry').length;
			const nodes = body.querySelectorAll('*').length;
			const longest = Math.round(Math.max(0, ...(window.__lt || [])));
			const shown = body.querySelector('.cl-shown')?.textContent?.trim() ?? '(no readout)';
			return rows + ' rows rendered, ' + nodes + ' nodes under the panel, longest task ' + longest + 'ms, readout: ' + shown;
		}`,
		label: 'what the open panel cost (printed, never pinned)'
	}
];

export const OPEN_CHANGELOG = openChangelog('idea');

/**
 * The open panel's spec under one theme. IDEA is this file's own; Space White
 * and Matrix are siblings that call this, so the three tables measure one set
 * of rows. Under Space White (the theme the home page has for the projector)
 * the copy is also gated on the wall, the way ./_home-theme.mjs gates it.
 */
export const changelogSpec = (theme) => ({
	path: `/dev/home-order?role=student&classes=1&rows=3&state=changelog${theme === 'idea' ? '' : '-' + theme}`,
	label: `Portal Updates opened${theme === 'idea' ? '' : ' under ' + theme}: one page of the log, a Show more key, and a readout`,
	prepare: openChangelog(theme),
	presence: [
		...(theme === 'idea' ? [] : [{ selector: `html[data-theme="${theme}"]`, label: `the ${theme} attribute is on <html>`, expectPresent: 1, maxPresent: 1 }]),
		{ selector: '#changelog-body.open', label: 'the panel is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#changelog-body .changelog-entry', label: `one page of rows (${PAGE}), never the whole log`, expectPresent: PAGE, maxPresent: PAGE },
		{ selector: '#changelog-body .cl-more', label: 'the Show more key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#changelog-body .cl-shown', label: 'the Showing N of M readout', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '#changelog-body .cl-shown', label: 'the readout names the page', must: [`Showing ${PAGE} of`] },
		{ selector: '#changelog-body .cl-more', label: 'the key carries its word', must: ['Show', 'more'] }
	],
	contrast: [
		{ selector: '#changelog-body .cl-more', label: 'Show more key', min: 4.5 },
		{ selector: '#changelog-body .cl-more .cl-more-left', label: 'Show more key: how many are not shown', min: 4.5 },
		{ selector: '#changelog-body .cl-shown', label: 'the readout', min: 4.5 },
		{ selector: '#changelog-body .changelog-note', label: 'a changelog line', min: 4.5 },
		{ selector: '#changelog-btn', label: 'the Changelog toggle', min: 4.5 },
		...(theme === 'space-white'
			? [{ selector: '#changelog-body .cl-more, #changelog-body .cl-shown', label: 'on the wall: the key and the readout (3.0 washed)', min: 3, projector: true }]
			: [])
	],
	tapTargets: [{ selector: '#changelog-body .cl-more', label: 'Show more key', min: 44 }],
	orderResult: [
		{
			label: 'the toggle says it is open',
			evaluate: `() => [document.querySelector('#changelog-btn')?.getAttribute('aria-expanded') ?? 'no aria-expanded']`,
			expected: ['true']
		}
	]
});

export default changelogSpec('idea');
