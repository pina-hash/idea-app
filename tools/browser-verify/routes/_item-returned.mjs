/**
 * Shared rows for the four `item-returned*` specs (ledger 0297, package ITEM).
 * `_`-prefixed so the loader does not read it as a route spec.
 */
export const RETURNED = {
	presence: [
		{ selector: '.cr-root', label: 'the classroom room mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="returned-grade"]', label: 'one returned card', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="returned-grade-comment"]', label: 'the teacher comment', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="returned-grade-breakdown"]', label: 'the rubric breakdown', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		/* The unscored "How this is graded" copy stands down on a return: the
		   card IS the scored copy of the same rubric. */
		{ selector: '[data-testid="item-rubric"]', label: 'no second, unscored rubric', expectPresent: 0 }
	],
	domOrder: [
		{ before: '[data-testid="returned-grade-comment"]', after: '[data-testid="returned-grade-breakdown"]', label: 'the comment comes before the breakdown' }
	],
	orderResult: [
		{
			label: 'the comment sits right under the score, not under the breakdown',
			/* Distance from the score line to the comment, in px. The defect was
			   the breakdown's own height (937px here) between the two. */
			evaluate: `() => {
				const head = document.querySelector('[data-testid="returned-grade-head"]');
				const comment = document.querySelector('[data-testid="returned-grade-comment"]');
				const breakdown = document.querySelector('[data-testid="returned-grade-breakdown"]');
				if (!head || !comment || !breakdown) return ['missing'];
				const gap = comment.getBoundingClientRect().top - head.getBoundingClientRect().bottom;
				return [gap >= 0 && gap < 80 && breakdown.getBoundingClientRect().height > 200 ? 'under the score' : 'gap ' + Math.round(gap)];
			}`,
			expected: ['under the score']
		}
	],
	contrast: [
		{ selector: '[data-testid="returned-grade-comment"] .comment-text', label: 'the teacher comment', min: 4.5 },
		{ selector: '[data-testid="returned-grade-head"]', label: 'the returned score', min: 4.5 },
		{ selector: '[data-testid="returned-grade-comment"] .comment-label', label: 'the comment label', min: 4.5 }
	]
};
