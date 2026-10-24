/**
 * THE COMMUNITY SPEEDRUN BUILDER WITH THREE PARTS PICKED (0297, ledger 0433).
 * The real RouteBuilder: three order rows each with up, down and remove (the
 * first row's up and the last row's down disabled), eight parts in the pick
 * list with exactly three ticked, and Save live with no "why" sentence. Every
 * control is a 44px target and the builder fits a 375px phone.
 */
export default {
	path: '/dev/gauntlet-community?picked=3',
	label: 'Community speedrun builder, three parts picked: order controls, pick list, Save live',
	settleMs: 700,
	presence: [
		{ selector: '[data-testid="route-order"] li', label: 'three order rows', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="route-parts"] button', label: 'eight parts to pick from', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
		{ selector: '[data-testid="route-parts"] button[aria-pressed="true"]', label: 'exactly three ticked', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="route-order"] button:disabled', label: 'first up and last down disabled', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-action="save-route"]:not([disabled])', label: 'Save is live', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="route-why"]', label: 'no reason sentence when the draft is saveable', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="route-builder"]', label: 'the builder words', must: ['Name', 'Description', 'Your order', '3 / 8', 'Published parts', 'Save speedrun'], mustNot: ['—'] }
	],
	tapTargets: [
		{ selector: '[data-testid="route-builder"] button', label: 'every builder control', min: 44 },
		{ selector: '[data-testid="route-builder"] input, [data-testid="route-builder"] textarea', label: 'the two fields', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="route-builder"] .rb-label', label: 'the mono labels', min: 4.5 },
		{ selector: '[data-testid="route-builder"] .rb-title', label: 'part names', min: 4.5 },
		{ selector: '[data-testid="route-builder"] .rb-n', label: 'order numbers', min: 4.5 }
	]
};
