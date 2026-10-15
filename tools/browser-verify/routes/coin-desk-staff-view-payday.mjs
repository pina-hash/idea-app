/**
 * PAYDAY, ONE CLASS OPEN: three requests, every one ticked by default, and the
 * two students in debt. Done is one key and asks nothing yet; the date is said.
 */
export default {
	path: '/dev/coin-desk-staff?view=payday',
	label: 'Coin V2 payday, a class open, everyone ticked',
	prepare: [
		{
			waitFor:
				'() => document.querySelector("[data-staff-hydrated=\\"true\\"]") && document.querySelectorAll("[data-testid=\\"cd-payday-class\\"]").length === 2',
			timeoutMs: 20000
		},
		{
			click: '[data-testid="cd-payday-class"]',
			until: '() => document.querySelectorAll("[data-testid=\\"cd-payday-request\\"]").length === 3'
		}
	],
	presence: [
		{ selector: '[data-testid="cd-payday-request"]', label: 'the three requests in Block 2', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="cd-payday-debt"]', label: 'the two students in debt', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cd-payday-done"]', label: 'Done', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cd-payday-done-confirm"]', label: 'no confirmation at rest', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'every request ticked by default',
			evaluate: '() => [...document.querySelectorAll("[data-testid=\\"cd-payday-request\\"] input")].map((i) => i.checked)',
			expected: [true, true, true]
		}
	],
	textContains: [
		{ selector: '[data-testid="cd-payday-date"]', label: 'the payday date', must: ['Next payday', 'Nov 2, 2026'] }
	],
	contrast: [
		{ selector: '[data-testid="cd-payday-request"] .p-name', label: 'request name', min: 4.5 },
		{ selector: '[data-testid="cd-payday-request"] .p-coins', label: 'request coins', min: 4.5 },
		{ selector: '[data-testid="cd-payday-date"]', label: 'payday date', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="cd-payday-request"]', label: 'request rows (the whole row ticks)', min: 44 },
		{ selector: '[data-testid="cd-payday-debt"] button', label: 'debt rows', min: 44 },
		{ selector: '[data-testid="cd-payday-done"]', label: 'Done', min: 44 },
		{ selector: '[data-testid="cd-payday-back"]', label: 'All classes', min: 44 }
	]
};
