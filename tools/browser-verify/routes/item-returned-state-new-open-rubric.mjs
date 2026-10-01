/**
 * The closed rubric opens with one press, and what it shows is legible
 * (report R20, ledger 0360). `item-returned-state-new` holds the closed state
 * and the position; this one presses the real trigger and reads the criteria,
 * which a closed panel cannot measure (its rows draw no box).
 */
const OPEN = '() => document.querySelector(\'[data-testid="item-rubric-disclosure"]\')?.getAttribute("aria-expanded") === "true"';

export default {
	path: '/dev/item-returned?state=new&open=rubric',
	aliasOf: '/dev/item-returned?state=new',
	label: 'The rubric, opened by its own trigger: every criterion shown and legible',
	prepare: [
		{ waitFor: '() => !!document.querySelector(\'[data-testid="item-rubric-disclosure"]\')', timeoutMs: 20000 },
		/* Forty attempts: the first width a run loads is a cold, still-hydrating
		   page (see classroom-split-s-1-item-i-draft-manage-1-state-edit-layer). */
		{ click: '[data-testid="item-rubric-disclosure"]', until: OPEN, attempts: 40, gapMs: 500 }
	],
	presence: [
		{ selector: '[data-testid="item-rubric"] [aria-expanded="true"]', label: 'open after the press', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="item-rubric"] .criterion-text', label: 'every criterion shown', expectPresent: 4, maxPresent: 4, expectVisible: 4, maxVisible: 4 }
	],
	domOrder: [{ before: '.engine-host', after: '[data-testid="item-rubric"]', label: 'still after the work once open' }],
	contrast: [{ selector: '[data-testid="item-rubric"] .criterion-text', label: 'a criterion name', min: 4.5 }]
};
