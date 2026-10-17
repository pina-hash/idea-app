/**
 * THE TOOLBAR FOLLOWS A PERSON'S OWN ARRANGEMENT (ledger 0396, part 7, on the
 * R23 page layout), at 375 and 1440. This teacher put the posted teams
 * between the search row and the Videos key, so the two are not side by side
 * and do not join: two rows, the search alone, then the Videos key with
 * Select all, because only the row directly above the posts carries the bulk
 * controls that act on them.
 */
import { IGNORE, READY, TOOLBAR_BASE } from './_class-toolbar.mjs';

export default {
	path: `${TOOLBAR_BASE}&role=teacher&posts=0&layout=split`,
	label: 'The class toolbar split by the teams: two rows, Select all with the one above the posts',
	ignoreConsole: IGNORE,
	prepare: [READY],
	orderResult: [
		{
			label: 'two rows in the person’s order, the bar with the second',
			evaluate: `() => [...document.querySelectorAll('[data-testid="harness-class"] .class-toolbar')].map((r) => r.dataset.toolbar + (r.querySelector('[data-testid="bulk-select-all"]') ? ' + select all' : ''))`,
			expected: ['find', 'videos + select all']
		}
	],
	domOrder: [
		{ before: '[data-testid="stream-find"]', after: '[data-testid="class-teams"]', label: 'the search row, then the teams', beforeLabel: 'search', afterLabel: 'teams' },
		{ before: '[data-testid="class-teams"]', after: '[data-testid="class-toolbar"]', label: 'the teams, then the Videos row', beforeLabel: 'teams', afterLabel: 'videos row' }
	],
	presence: [{ selector: '[data-testid="bulk-select-all"]', label: 'Select all, once', expectPresent: 1, maxPresent: 1, expectVisible: 1 }]
};
