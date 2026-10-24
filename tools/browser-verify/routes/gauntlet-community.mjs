/**
 * THE COMMUNITY SPEEDRUN BUILDER, EMPTY (0297, ledger 0433). Nothing picked
 * and no name: Save is disabled AND the reason is said beside it in words, so
 * the button never offers a press whose only answer is a refusal. The empty
 * order says what to do.
 */
export default {
	path: '/dev/gauntlet-community',
	label: 'Community speedrun builder, empty: Save disabled with its reason in words',
	settleMs: 700,
	presence: [
		{ selector: '[data-action="save-route"][disabled]', label: 'Save disabled', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="route-why"]', label: 'the reason beside it', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="route-order"]', label: 'no order list yet', expectPresent: 0 },
		{ selector: '[data-testid="route-parts"] button', label: 'the parts to pick from (positive control)', expectPresent: 8, maxPresent: 8, expectVisible: 8 }
	],
	textContains: [
		{ selector: '[data-testid="route-why"]', label: 'the first reason', must: ['Name your speedrun.'] },
		{ selector: '[data-testid="route-builder"]', label: 'the empty order says what to do', must: ['Pick parts from the list'], mustNot: ['—'] }
	],
	contrast: [
		{ selector: '[data-testid="route-why"]', label: 'the reason sentence', min: 4.5 },
		{ selector: '[data-testid="route-builder"] .rb-empty', label: 'the empty-order sentence', min: 4.5 }
	]
};
