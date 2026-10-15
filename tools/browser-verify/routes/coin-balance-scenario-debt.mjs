/**
 * The student coin page IN DEBT: the balance is negative and is the only
 * figure, "In debt" is said in words beside it, the revoked pass says so, and
 * every purchase with a cost is refused BEFORE the press, in words, with the
 * key aria-disabled rather than disabled. Session two: no split payment is
 * offered while in debt (the reason is said), a restitution job is listed and
 * labeled, and coins out says there is nothing to take out.
 */
export default {
	path: '/dev/coin-balance?scenario=debt',
	label: 'Student coin page (V2): in debt, pass revoked, purchases refused in words',
	prepare: [{ waitFor: '() => !!document.querySelector("[data-coin-hydrated]")' }],
	presence: [
		{ selector: '[data-testid="coin-debt"]', label: 'in debt, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="buy-eating-pass"] [data-testid="buy-arm"][aria-disabled="true"]', label: 'the pass is held back', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="buy-pay-raise"] [data-testid="buy-arm"][aria-disabled="true"]', label: 'the raise is held back', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="buy-arm"][disabled]', label: 'never disabled, so it can explain itself', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="buy-blocked"]', label: 'every held purchase says why', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="split-toggle"]', label: 'no split payment while in debt (0246)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="split-in-debt"]', label: 'and the two priced purchases say why', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="contract-restitution"]', label: 'a restitution job is open to a student in debt, and labeled', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="payout-blocked"]', label: 'coins out waits, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="coin-standing"]', label: 'debt is the balance, said', must: ['In debt', 'in debt by 12.25'], mustNot: ['physical', 'digital'] },
		{ selector: '[data-testid="coin-pass"]', label: 'the revoked pass', must: ['Not held', 'revoked'] },
		{ selector: '[data-testid="buy-eating-pass"] [data-testid="buy-blocked"]', label: 'why the pass is refused', must: ['This costs 15', 'your balance is -12.25'] }
	],
	tapTargets: [{ selector: '[data-testid="coin-page"] button', label: 'every button', min: 44 }],
	contrast: [
		{ selector: '[data-testid="coin-balance"]', label: 'a negative balance', min: 4.5 },
		{ selector: '[data-testid="coin-debt"]', label: 'the In debt chip', min: 4.5 },
		{ selector: '.cp-debt-line', label: 'the debt sentence', min: 4.5 },
		{ selector: '[data-testid="buy-blocked"]', label: 'the refusal sentences', min: 4.5 },
		{ selector: '[data-testid="buy-arm"][aria-disabled="true"]', label: 'a held key', min: 4.5 }
	]
};
