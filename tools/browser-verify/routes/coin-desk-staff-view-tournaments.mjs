/**
 * THE TOURNAMENT TRANSFER: two concluded tournaments, each team with its total
 * and every member's amount, the walk-up listed and marked, and the default
 * choice "Give each member the full amount" chosen.
 */
export default {
	path: '/dev/coin-desk-staff?view=tournaments',
	label: 'Coin V2 tournament transfer, two tournaments waiting',
	prepare: [
		{
			waitFor:
				'() => document.querySelector("[data-staff-hydrated=\\"true\\"]") && document.querySelectorAll("[data-testid=\\"cd-tournament\\"]").length === 2',
			timeoutMs: 20000
		}
	],
	presence: [
		{ selector: '[data-testid="cd-tournament"]', label: 'two tournaments', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="cd-tournament-entry"]', label: 'five teams', expectPresent: 5, maxPresent: 5 },
		{ selector: '[data-testid="cd-tournament-amount"]', label: 'an amount box for each of the six members with an account', expectPresent: 6, maxPresent: 6 },
		{ selector: '[data-testid="cd-tournament-walkup"]', label: 'the walk-up, marked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="cd-tournament-transfer"]', label: 'Transfer on each', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="cd-tournament-physical"]', label: 'Paid physically on each', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="cd-tournament-confirm"]', label: 'no confirmation at rest', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'the default choice is "full amount" on both',
			evaluate:
				'() => [...document.querySelectorAll("[data-testid=\\"cd-tournament-mode\\"][aria-pressed=\\"true\\"]")].map((b) => b.dataset.mode)',
			expected: ['duplicate', 'duplicate']
		},
		{
			label: 'totals: earned where earned, else the placement default',
			evaluate: '() => [...document.querySelectorAll("[data-testid=\\"cd-tournament-total\\"]")].map((i) => i.value)',
			expected: ['10', '4', '3', '2', '0']
		}
	],
	textContains: [
		{ selector: '[data-testid="cd-tournament-walkup"]', label: 'the walk-up is said in words', must: ['No account, skipped'] }
	],
	contrast: [
		{ selector: '[data-testid="cd-tournament-entry"] .t-entry-name', label: 'team name', min: 4.5 },
		{ selector: '[data-testid="cd-tournament-member"] .t-member-name', label: 'member name', min: 4.5 },
		{ selector: '[data-testid="cd-tournament-walkup"]', label: 'walk-up chip', min: 4.5 },
		{ selector: '[data-testid="cd-tournament-rule"]', label: 'the rule', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="cd-tournament-mode"]', label: 'mode choice', min: 44 },
		{ selector: '[data-testid="cd-tournament-transfer"]', label: 'Transfer', min: 44 },
		{ selector: '[data-testid="cd-tournament-physical"]', label: 'Paid physically', min: 44 },
		{ selector: '[data-testid="cd-tournament-amount"]', label: 'amount boxes', min: 44 }
	]
};
