/**
 * Shared rows for the four `item-returned*` specs (ledger 0297, package ITEM).
 * `_`-prefixed so the loader does not read it as a route spec.
 *
 * THE BREAKDOWN STARTS CLOSED (report R20, ledger 0360): the score and the
 * teacher comment stay at the top, above the work, and the scored rubric is a
 * closed "Rubric breakdown" disclosure under them, in the DOM and not shown.
 * `item-returned-state-breakdown` presses it and measures what opens.
 */
export const RETURNED = {
	presence: [
		{ selector: '.cr-root', label: 'the classroom room mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="returned-grade"]', label: 'one returned card', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="returned-grade-comment"]', label: 'the teacher comment', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="returned-grade-breakdown-disclosure"]', label: 'the "Rubric breakdown" trigger', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="returned-grade-breakdown-disclosure"][aria-expanded="false"]', label: 'the breakdown closed on arrival', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="returned-grade-breakdown"]', label: 'the rubric breakdown, in the DOM and not shown', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 },
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
			   the breakdown's own height (937px here) between the two; closed, the
			   breakdown takes one row, and its open height is measured by
			   item-returned-state-breakdown. */
			evaluate: `() => {
				const head = document.querySelector('[data-testid="returned-grade-head"]');
				const comment = document.querySelector('[data-testid="returned-grade-comment"]');
				if (!head || !comment) return ['missing'];
				const gap = comment.getBoundingClientRect().top - head.getBoundingClientRect().bottom;
				return [gap >= 0 && gap < 80 ? 'under the score' : 'gap ' + Math.round(gap)];
			}`,
			expected: ['under the score']
		}
	],
	tapTargets: [
		{ selector: '[data-testid="returned-grade-breakdown-disclosure"]', label: 'the "Rubric breakdown" trigger', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="returned-grade-comment"] .comment-text', label: 'the teacher comment', min: 4.5 },
		{ selector: '[data-testid="returned-grade-head"]', label: 'the returned score', min: 4.5 },
		{ selector: '[data-testid="returned-grade-comment"] .comment-label', label: 'the comment label', min: 4.5 },
		{ selector: '[data-testid="returned-grade-breakdown-disclosure"] .disc-label', label: 'the "Rubric breakdown" label', min: 4.5 }
	]
};
