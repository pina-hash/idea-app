/**
 * /admin/test-accounts (ledger 0422): the REAL page over in-memory accounts.
 * Two live test students with their keys, one retired behind a disclosure.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/test-accounts-admin',
	label: 'Test accounts: make one, put it in a class, view or act as it',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-testid="test-accounts-admin"]', label: 'the page', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="test-accounts-list"] > li', label: 'live test students', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="view-as-buttons"]', label: 'View as / Act as for each', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="test-account-create"]', label: 'Create', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{
			label: 'no horizontal scroll',
			evaluate: `() => [document.documentElement.scrollWidth === document.documentElement.clientWidth ? 'no overflow' : 'overflow ' + document.documentElement.scrollWidth]`,
			expected: ['no overflow']
		}
	],
	contrast: [
		{ selector: '.ta-small', label: 'secondary text', min: 4.5 },
		{ selector: '.ta-chip', label: 'class chips', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.ta-page .btn', label: 'every key', min: 44 },
		{ selector: '.ta-page select, .ta-page input', label: 'fields', min: 44 }
	]
};
