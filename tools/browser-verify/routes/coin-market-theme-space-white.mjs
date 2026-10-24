import { hydrated, MARKET_CONTRAST, MARKET_TAPS, SPACE_WHITE_ON } from './_coin-market.mjs';

/** The IDEA Market on Space White: the same page, every word re-measured on the light grounds. */
export default {
	path: '/dev/coin-market?theme=space-white',
	label: 'IDEA Market on Space White',
	prepare: [...hydrated(), SPACE_WHITE_ON],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="mk-official-tile"]', label: 'eight official tiles (contracts are retired)', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
		{ selector: '[data-testid="mk-trade"]', label: 'six trades', expectPresent: 6, maxPresent: 6, expectVisible: 6 }
	],
	tapTargets: MARKET_TAPS,
	contrast: MARKET_CONTRAST
};
