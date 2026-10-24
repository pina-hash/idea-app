/**
 * THE STUDENT COIN PAGE (IDEA Coin V2, 0241, and session two, 0245 to 0250):
 * `/coin-balance` through its harness, populated. One balance and nothing
 * else, the Eating Pass held with strikes, no shop today with its reason, four
 * purchases each behind a first press (each offering a split payment), a
 * history whose undone pair is gone and said, an edited row with its old value,
 * a disputable automatic fine, and every rule a closed button that opens on a
 * press. Session two adds coins out (held, with Cancel), the desktop
 * background, the want ad, coins on hand, the student's own
 * submissions, and the stats with two charts and an export. The absence rows
 * are the V2 rule that no second figure is drawn in the standing, and that the
 * auditor block needs the auditor read.
 */
export default {
	path: '/dev/coin-balance',
	label: 'Student coin page (V2): balance, pass, no shop, buy, split, coins out, background, donations, submissions, stats, history, rules',
	prepare: [{ waitFor: '() => !!document.querySelector("[data-coin-hydrated]")' }],
	presence: [
		{ selector: '[data-testid="coin-balance"]', label: 'one balance', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-debt"]', label: 'a positive balance says nothing about debt', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="coin-noshop"]', label: 'no shop today, said', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-buy"] button[data-testid="buy-arm"]', label: 'four purchases, each a first press', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="buy-confirm"]', label: 'nothing is confirmed before the first press', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="split-toggle"]', label: 'the two purchases with a price offer a split (print and extra credit wait for their inputs)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="split-physical"]', label: 'no split field before the split is ticked', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="print-spool"]', label: 'the spool grams beside the print', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-row"]', label: 'history rows (12 less one undone pair)', expectPresent: 10, maxPresent: 10, expectVisible: 10 },
		{ selector: '[data-testid="coin-undone-note"]', label: 'the hidden pair is said', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-auto"]', label: 'automatic rows marked', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="coin-edited"]', label: 'the one edited row is marked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-edits"] li', label: 'its change and its first value', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="coin-dispute"]', label: 'the one automatic fine has a Dispute key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="rule"] button.disc-trigger[aria-expanded="false"]', label: 'every rule a closed button', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="payout-held"]', label: 'coins out, held', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="payout-cancel"]', label: 'the held coins can be cancelled', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="payout-arm"]', label: 'no second ask while one is held', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="bg-current"]', label: 'the approved background is drawn', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bg-send"][aria-disabled="true"]', label: 'Send waits for a picture, and says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="want-item"]', label: 'the want list, active items only', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="onhand-send"]', label: 'coins on hand', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="request"]', label: 'four submissions', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="request-cancel"]', label: 'Cancel only on the pending donation (a split cannot be cancelled)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stats-balance-chart"]', label: 'the balance chart', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stats-weeks-chart"]', label: 'the weekly chart', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stats-categories"] tbody tr', label: 'totals by category', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="stats-export-csv"], [data-testid="stats-export-json"]', label: 'the two downloads', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="coin-role-link"] a[href="/coin-balance/role"]', label: 'the link to the role page', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-auditor"]', label: 'no auditor block without the auditor read', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="coin-contracts"]', label: 'no contracts section: contracts are retired (ledger 0432)', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="coin-standing"]', label: 'one number, no split', must: ['Weekly wage', 'tier 2', 'Strikes: 1 of 3'], mustNot: ['physical', 'Physical', 'digital', 'Digital', 'lifetime', 'paid out'] },
		{ selector: '[data-testid="coin-noshop"]', label: 'why there is no shop', must: ['No shop today', 'No safety glasses at the drill press.'] },
		{ selector: '[data-testid="buy-eating-pass"]', label: 'a held pass cannot be bought again, in words', must: ['already hold an Eating Pass', 'Pay part in physical coins'] },
		{ selector: '[data-testid="buy-pay-raise"]', label: 'the raise names both wages', must: ['tier 2', 'tier 3'] },
		{ selector: '[data-testid="buy-print"]', label: 'the spool is said', must: ['120 grams', 'before coins'] },
		{ selector: '[data-testid="buy-extra-credit"]', label: 'the cap is said', must: ['5', 'points left in this class this semester'] },
		{ selector: '[data-testid="coin-history"]', label: 'the undone pair is gone', mustNot: ['Logged on the wrong student'] },
		{ selector: '[data-testid="coin-payout"]', label: 'coins out, the rules and the date', must: ['first class day of the month', 'November 2', 'Cancel any time', 'If you are absent on payday', '20'] },
		{ selector: '[data-testid="coin-background"]', label: 'the background rules', must: ['16:9', '1920 by 1080', 'One every 14 days', 'pays', 'parent and tour test'] },
		{ selector: '[data-testid="coin-donations"]', label: 'the want ad rules', must: ['rate per item', 'Other is set by your teacher', 'every 14 days', 'pays up to the limit'] },
		{ selector: '[data-testid="coin-onhand"]', label: 'who checks and what shows', must: ['Student Auditor', 'Ledger', 'leaderboard still ranks your'] },
		{ selector: '[data-testid="coin-requests"]', label: 'what happened to each', must: ['Waiting for your teacher', 'Denied: The count did not match', 'Approved, paid 2'] }
	],
	tapTargets: [
		{ selector: '[data-testid="coin-page"] button', label: 'every button on the page', min: 44 },
		{ selector: '[data-testid="coin-page"] input:not([type="checkbox"]), [data-testid="coin-page"] select, [data-testid="coin-page"] textarea', label: 'every field', min: 44 },
		{ selector: '[data-testid="coin-page"] label:has(> input[type="checkbox"])', label: 'every tick box, at its label', min: 44 },
		{ selector: '[data-testid="coin-role-link"] a', label: 'the role page link', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="coin-balance"]', label: 'the balance', min: 4.5 },
		{ selector: '[data-testid="coin-standing"] dd', label: 'the standing facts', min: 4.5 },
		{ selector: '[data-testid="coin-standing"] dt', label: 'the fact labels', min: 4.5 },
		{ selector: '[data-testid="buy-blocked"]', label: 'why a purchase is refused', min: 4.5 },
		{ selector: '.cp-reason', label: 'history reasons', min: 4.5 },
		{ selector: '.cp-row-note', label: 'history notes', min: 4.5 },
		{ selector: '.cp-when', label: 'history times', min: 4.5 },
		{ selector: '.cp-chip', label: 'type, Automatic and Edited chips', min: 4.5 },
		{ selector: '.cp-edits li', label: 'an edit, in words', min: 4.5 },
		{ selector: '.cp-amount', label: 'amounts', min: 4.5 },
		{ selector: '.cp-rule-amount', label: 'rule amounts', min: 4.5 },
		{ selector: '.cp-note', label: 'notes', min: 4.5 },
		{ selector: '.cpx-lead', label: 'section leads', min: 4.5 },
		{ selector: '.cpx-note', label: 'section notes', min: 4.5 },
		{ selector: '.cpx-limits li', label: 'the limits, in words', min: 4.5 },
		{ selector: '.cpx-meta', label: 'section metadata', min: 4.5 },
		{ selector: '.cpx-chip', label: 'state chips', min: 4.5 },
		{ selector: '.cpx-why', label: 'why a section control waits', min: 4.5 },
		{ selector: '.cpx-text', label: 'section text', min: 4.5 },
		{ selector: '.cpx-table td', label: 'table cells', min: 4.5 },
		{ selector: '.cpx-table th', label: 'table headings', min: 4.5 }
	]
};
