import { hydrated } from './_coin-market.mjs';

/** Buying hall pass time: +10 minutes picked and confirmed; the card says what was bought and how much room is left. */
export default {
	path: '/dev/coin-market-hall-pass',
	aliasOf: '/dev/classroom-coin-banner',
	label: 'Hall pass time: 10 minutes bought',
	prepare: [
		...hydrated('data-banner-hydrated'),
		{ click: '[data-testid="hall-pass-minutes-2"]', until: '() => !!document.querySelector("[data-testid=\\"hall-pass-minutes-confirm\\"]")' },
		{ click: '[data-testid="hall-pass-minutes-confirm"]', until: '() => !!document.querySelector("[data-testid=\\"hall-pass-minutes-said\\"]")' }
	],
	presence: [
		{ selector: '[data-testid="hall-pass-minutes-said"]', label: 'the receipt', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="hall-pass-minutes-1"]', label: 'one more block still on offer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="hall-pass-minutes-2"]', label: 'two more blocks no longer fit', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [{ selector: '[data-testid="hall-pass-minutes"]', label: 'what was bought', must: ['10 minutes'] }],
	tapTargets: [{ selector: '[data-testid="hall-pass-minutes"] button', label: 'every key', min: 44 }],
	contrast: [{ selector: '[data-testid="hall-pass-minutes"] p', label: 'card words', min: 4.5 }]
};
