import { hydrated } from './_coin-market.mjs';

/**
 * IDEA Stocks with a trading pause in force (the relaunch, 0283): GAUNTLET is
 * past the launch weeks and paused after an 11.4% move, so its card says when
 * trading opens again, in words, and its Buy key is off; the other stocks
 * still say their launch week.
 */
export default {
	path: '/dev/coin-stocks?halt=1',
	label: 'IDEA Stocks: one stock paused after a big move',
	prepare: hydrated(),
	presence: [
		{ selector: '[data-testid="sk-halt"]', label: 'one pause notice', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-stock-id="gauntlet"] [data-testid="sk-buy"]:disabled', label: 'the paused stock cannot be bought', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-stock-id="foundry"] [data-testid="sk-buy"]:disabled', label: 'an open stock can', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="sk-ramp"]', label: 'the launch ramp in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="sk-breakers"]', label: 'the breakers in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="sk-halt"]', label: 'when trading opens again', must: ['paused until', '11.4%'] },
		{ selector: '[data-testid="sk-ramp"]', label: 'the ramp schedule', must: ['5% in week 1', '25% in week 4'] },
		{ selector: '[data-testid="sk-breakers"]', label: 'the breaker schedule', must: ['10% pauses it for 15 minutes', 'rest of the day'] }
	],
	contrast: [{ selector: '[data-testid="sk-halt"]', label: 'the pause notice', min: 4.5 }]
};
