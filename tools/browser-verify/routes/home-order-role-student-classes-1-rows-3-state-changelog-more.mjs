import { OPEN_CHANGELOG, PAGE } from './home-order-role-student-classes-1-rows-3-state-changelog.mjs';

/**
 * THE PORTAL UPDATES PANEL, ASKED FOR MORE (ledger 0360, report R24): once by
 * pressing Show more, and once by scrolling the panel to its end, which loads
 * the next page on its own. Two mechanisms, measured separately, so each step's
 * `until` names a count only its own mechanism can reach.
 *
 * The press takes the panel from one page to two; the scroll from two to
 * three. Neither total is pinned (the log grows with every commit), only the
 * page arithmetic, and the node count after three pages is printed.
 */
export default {
	path: '/dev/home-order?role=student&classes=1&rows=3&state=changelog-more',
	label: 'Portal Updates: Show more adds a page, and scrolling to the end adds the next on its own',
	prepare: [
		...OPEN_CHANGELOG,
		{
			click: '#changelog-body .cl-more',
			until: `() => document.querySelectorAll('#changelog-body .changelog-entry').length === ${2 * PAGE}`,
			attempts: 12,
			waitMs: 300,
			label: 'press Show more: one page becomes two'
		},
		{
			evaluate: `() => { const b = document.querySelector('#changelog-body'); b.scrollTop = b.scrollHeight; return 'scrolled the panel to ' + Math.round(b.scrollTop); }`,
			until: `() => document.querySelectorAll('#changelog-body .changelog-entry').length >= ${3 * PAGE}`,
			attempts: 20,
			waitMs: 300,
			label: 'scroll the panel to its end: the third page loads with no press'
		},
		{
			evaluate: `() => { const b = document.querySelector('#changelog-body'); return b.querySelectorAll('.changelog-entry').length + ' rows, ' + b.querySelectorAll('*').length + ' nodes, readout: ' + (b.querySelector('.cl-shown')?.textContent?.trim() ?? '(none)'); }`,
			label: 'three pages in (printed, never pinned)'
		}
	],
	presence: [
		{ selector: '#changelog-body .changelog-entry', label: `three pages of rows (${3 * PAGE})`, expectPresent: 3 * PAGE, maxPresent: 3 * PAGE },
		{ selector: '#changelog-body .cl-shown', label: 'the readout', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '#changelog-body .cl-shown', label: 'the readout follows the pages', must: [`Showing ${3 * PAGE} of`] }]
};
