/**
 * /admin/view-as (ledger 0422): the REAL page over an in-memory search and
 * record. Every person has both keys, the record shows both kinds of session,
 * and every control clears 44px.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/view-as-admin',
	label: 'View as: find anyone, the two ways in, and the record',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-testid="view-as-admin"]', label: 'the page', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="view-as-people"] li', label: 'people found', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="view-as-view"]', label: 'a View as key per person', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="view-as-act"]', label: 'an Act as key per person', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="view-as-record"] li.va-entry', label: 'sessions in the record', expectPresent: 2, maxPresent: 2 }
	],
	orderResult: [
		{
			label: 'no horizontal scroll',
			evaluate: `() => [document.documentElement.scrollWidth === document.documentElement.clientWidth ? 'no overflow' : 'overflow ' + document.documentElement.scrollWidth]`,
			expected: ['no overflow']
		}
	],
	contrast: [
		{ selector: '.va-small', label: 'secondary text', min: 4.5 },
		{ selector: '.va-tag', label: 'session tags', min: 4.5 },
		{ selector: '.va-modes dd', label: 'the two ways in', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.va-page .btn', label: 'every key', min: 44 },
		{ selector: '.va-page input', label: 'the search box', min: 44 }
	]
};
