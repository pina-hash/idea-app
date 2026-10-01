/**
 * The returned card's breakdown, opened by its own trigger (report R20, ledger
 * 0360). Closed, the breakdown is one row under the comment
 * (`_item-returned.mjs`); opened, it is the full scored rubric, and the comment
 * still sits above it -- the order ledger 0297 fixed (the comment used to be
 * 1065px below the grade at 375) holds in both states.
 */
const OPEN = '() => document.querySelector(\'[data-testid="returned-grade-breakdown-disclosure"]\')?.getAttribute("aria-expanded") === "true"';

export default {
	path: '/dev/item-returned?state=breakdown',
	aliasOf: '/dev/item-returned',
	label: 'A returned v1 assignment with the breakdown opened: the full rubric, under the comment',
	prepare: [
		{ waitFor: '() => !!document.querySelector(\'[data-testid="returned-grade-breakdown-disclosure"]\')', timeoutMs: 20000 },
		/* Forty attempts: the first width a run loads is a cold, still-hydrating
		   page (see classroom-split-s-1-item-i-draft-manage-1-state-edit-layer). */
		{ click: '[data-testid="returned-grade-breakdown-disclosure"]', until: OPEN, attempts: 40, gapMs: 500 }
	],
	presence: [
		{ selector: '[data-testid="returned-grade-breakdown"]', label: 'the breakdown, shown', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="returned-grade-breakdown"] .criterion-text', label: 'every scored criterion', expectPresent: 4, maxPresent: 4, expectVisible: 4, maxVisible: 4 }
	],
	domOrder: [
		{ before: '[data-testid="returned-grade-comment"]', after: '[data-testid="returned-grade-breakdown"]', label: 'the comment still comes first' }
	],
	orderResult: [
		{
			label: 'the opened breakdown is the full rubric, and the comment is still right under the score',
			evaluate: `() => {
				const head = document.querySelector('[data-testid="returned-grade-head"]');
				const comment = document.querySelector('[data-testid="returned-grade-comment"]');
				const breakdown = document.querySelector('[data-testid="returned-grade-breakdown"]');
				if (!head || !comment || !breakdown) return ['missing'];
				const gap = comment.getBoundingClientRect().top - head.getBoundingClientRect().bottom;
				const h = breakdown.getBoundingClientRect().height;
				return [gap >= 0 && gap < 80 ? 'under the score' : 'gap ' + Math.round(gap), h > 200 ? 'full breakdown' : 'breakdown ' + Math.round(h) + 'px'];
			}`,
			expected: ['under the score', 'full breakdown']
		}
	],
	contrast: [{ selector: '[data-testid="returned-grade-breakdown"] .criterion-text', label: 'a scored criterion name', min: 4.5 }]
};
