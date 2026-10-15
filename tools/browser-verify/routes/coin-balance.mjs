/**
 * THE STUDENT COIN PAGE (IDEA Coin V2, 0241): `/coin-balance` through its
 * harness, populated. One balance and nothing else, the Eating Pass held with
 * strikes, no shop today with its reason, four purchases each behind a first
 * press, a history whose undone pair is gone and said, and every rule a closed
 * button that opens on a press. The absence rows are the V2 rule that no
 * second figure (physical, digital, lifetime) is drawn anywhere.
 */
export default {
	path: '/dev/coin-balance',
	label: 'Student coin page (V2): balance, pass, no shop, buy, history, rules',
	prepare: [{ waitFor: '() => !!document.querySelector("[data-coin-hydrated]")' }],
	presence: [
		{ selector: '[data-testid="coin-balance"]', label: 'one balance', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-debt"]', label: 'a positive balance says nothing about debt', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="coin-noshop"]', label: 'no shop today, said', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-buy"] button[data-testid="buy-arm"]', label: 'four purchases, each a first press', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="buy-confirm"]', label: 'nothing is confirmed before the first press', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="coin-row"]', label: 'history rows (12 less one undone pair)', expectPresent: 10, maxPresent: 10, expectVisible: 10 },
		{ selector: '[data-testid="coin-undone-note"]', label: 'the hidden pair is said', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-auto"]', label: 'automatic rows marked', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="rule"] button.disc-trigger[aria-expanded="false"]', label: 'every rule a closed button', expectPresent: 12, maxPresent: 12, expectVisible: 12 }
	],
	textContains: [
		{ selector: '[data-testid="coin-standing"]', label: 'one number, no split', must: ['Weekly wage', 'tier 2', 'Strikes: 1 of 3'], mustNot: ['physical', 'Physical', 'digital', 'Digital', 'lifetime', 'paid out'] },
		{ selector: '[data-testid="coin-noshop"]', label: 'why there is no shop', must: ['No shop today', 'No safety glasses at the drill press.'] },
		{ selector: '[data-testid="buy-eating-pass"]', label: 'a held pass cannot be bought again, in words', must: ['already hold an Eating Pass'] },
		{ selector: '[data-testid="buy-pay-raise"]', label: 'the raise names both wages', must: ['tier 2', 'tier 3'] },
		{ selector: '[data-testid="buy-extra-credit"]', label: 'the cap is said', must: ['5', 'points left in this class this semester'] },
		{ selector: '[data-testid="coin-history"]', label: 'the undone pair is gone', mustNot: ['Logged on the wrong student'] }
	],
	tapTargets: [
		{ selector: '[data-testid="coin-page"] button', label: 'every button on the page', min: 44 },
		{ selector: '[data-testid="coin-page"] input, [data-testid="coin-page"] select', label: 'every field', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="coin-balance"]', label: 'the balance', min: 4.5 },
		{ selector: '[data-testid="coin-standing"] dd', label: 'the standing facts', min: 4.5 },
		{ selector: '[data-testid="coin-standing"] dt', label: 'the fact labels', min: 4.5 },
		{ selector: '[data-testid="buy-blocked"]', label: 'why a purchase is refused', min: 4.5 },
		{ selector: '.cp-reason', label: 'history reasons', min: 4.5 },
		{ selector: '.cp-row-note', label: 'history notes', min: 4.5 },
		{ selector: '.cp-when', label: 'history times', min: 4.5 },
		{ selector: '.cp-chip', label: 'type and Automatic chips', min: 4.5 },
		{ selector: '.cp-amount', label: 'amounts', min: 4.5 },
		{ selector: '.cp-rule-amount', label: 'rule amounts', min: 4.5 },
		{ selector: '.cp-note', label: 'notes', min: 4.5 }
	]
};
