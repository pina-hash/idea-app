import { hydrated, SPACE_WHITE_ON } from './_coin-market.mjs';
import { ROSTER_COUNTS } from '../../../src/routes/dev/coin-stocks/stock-roster.js';

/** IDEA Stocks on Space White: up and down are words and a hue that clears the light plate. */
export default {
	path: '/dev/coin-stocks?theme=space-white',
	label: 'IDEA Stocks on Space White',
	prepare: [...hydrated(), SPACE_WHITE_ON],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="sk-stock"]', label: `every stock in the roster (${ROSTER_COUNTS.cards})`, expectPresent: ROSTER_COUNTS.cards, maxPresent: ROSTER_COUNTS.cards, expectVisible: ROSTER_COUNTS.cards }
	],
	contrast: [
		{ selector: '[data-testid="sk-stock"] .sk-name', label: 'stock names', min: 4.5 },
		{ selector: '[data-testid="sk-stock"] .sk-move', label: 'the move, in words', min: 4.5 },
		{ selector: '[data-testid="sk-rules"] p', label: 'the rules', min: 4.5 }
	]
};
