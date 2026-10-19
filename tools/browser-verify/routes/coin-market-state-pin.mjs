import { hydrated } from './_coin-market.mjs';

/** Send coins with no PIN yet: the sheet asks for one first, and nothing else. */
export default {
	path: '/dev/coin-market-state-pin',
	aliasOf: '/dev/coin-market',
	label: 'IDEA Market: Send coins asks for a PIN first',
	prepare: [...hydrated(), { click: '[data-testid="mk-send-open"]', until: '() => !!document.querySelector("[data-testid=\\"mk-pin-form\\"]")' }],
	presence: [
		{ selector: '[data-testid="mk-transfer-sheet"]', label: 'the transfer sheet', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-pin-form"]', label: 'the PIN form', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-send-amount"]', label: 'no send form before a PIN', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [{ selector: '[data-testid="mk-pin-form"]', label: 'the PIN rule', must: ['4 to 6 digits'] }],
	tapTargets: [{ selector: '[data-testid="mk-transfer-sheet"] button', label: 'every key in the sheet', min: 44 }],
	contrast: [{ selector: '[data-testid="mk-pin-form"] label, [data-testid="mk-pin-form"] p', label: 'PIN form words', min: 4.5 }]
};
