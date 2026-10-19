import { hydrated } from './_coin-market.mjs';

/** A paid trade's review form: five stars as radio keys and a body with its shortest length said. */
export default {
	path: '/dev/coin-market-state-review',
	aliasOf: '/dev/coin-market',
	label: 'IDEA Market: the review form on a paid trade',
	prepare: [...hydrated(), { click: '[data-testid="mk-review-open"]', until: '() => !!document.querySelector("[data-testid=\\"mk-review-form\\"]")' }],
	presence: [
		{ selector: '[data-testid="mk-review-form"]', label: 'the review form', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-review-form"] [data-testid^="mk-star-"]', label: 'five star keys', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="mk-review-body"]', label: 'the review body', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="mk-review-form"]', label: 'the rules are said', must: ['20'] }],
	tapTargets: [{ selector: '[data-testid="mk-review-form"] button', label: 'every key in the form', min: 44 }],
	contrast: [{ selector: '[data-testid="mk-review-form"] label, [data-testid="mk-review-form"] p', label: 'form words', min: 4.5 }]
};
