import { hydrated, SPACE_WHITE_ON } from './_coin-market.mjs';

/** IDEA Stocks on Space White: up and down are words and a hue that clears the light plate. */
export default {
	path: '/dev/coin-stocks?theme=space-white',
	label: 'IDEA Stocks on Space White',
	prepare: [...hydrated(), SPACE_WHITE_ON],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="sk-stock"]', label: 'four stocks', expectPresent: 4, maxPresent: 4, expectVisible: 4 }
	],
	contrast: [
		{ selector: '[data-testid="sk-stock"] .sk-name', label: 'stock names', min: 4.5 },
		{ selector: '[data-testid="sk-stock"] .sk-move', label: 'the move, in words', min: 4.5 },
		{ selector: '[data-testid="sk-rules"] p', label: 'the rules', min: 4.5 }
	]
};
