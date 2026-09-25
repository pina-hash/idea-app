import { IGNORE_PHOTO_PROXY, WAIT_EDITOR } from './_notebook-log.mjs';

/**
 * A TEACHER'S OWN NOTEBOOK, `/classroom/notebook` for somebody who reviews a
 * section (ledger 0298, R32). It is the SAME `NotebookView` a student's is --
 * an instructor's view of a student surface is the student view through the
 * same render path -- so it takes the log with it: the one-box composer at the
 * top of the feed. What a teacher REVIEWS is a different screen and is not
 * touched here: a class's Notebook tab for a manager is the review console, and
 * `notebook-review.mjs` measures its grid.
 *
 * BOTH DIRECTIONS: present, the composer and the way to section review;
 * absent, any check-in chip or filed check-in state, because a teacher holds
 * no check-ins in their own notebook and the chip must not invent one.
 */
export default {
	path: '/dev/notebook?account=instructor',
	label: "A teacher's own notebook: the same log a student has, and the way to section review",
	prepare: [WAIT_EDITOR],
	presence: [
		{ selector: '[data-testid="can-review"]', label: 'the harness is on the instructor account (canReview=true)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.nb-pane-card > .compose-card[data-testid="nb-compose"]', label: 'the composer, at the head of the log', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.nb-head a[href="/dev/notebook-review"]', label: 'Section review, in the head', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-next-check-in"], [data-testid="nb-check-ins-clear"], [data-testid="nb-filed-state"]', label: 'a check-in chip or state for somebody with no check-ins (must be absent)', expectPresent: 0 },
		{ selector: '.pick', label: 'check-in picks for somebody with no check-ins (must be absent)', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="can-review"]', must: ['canReview=true'], label: 'the account is one that reviews' }
	],
	ignoreConsole: IGNORE_PHOTO_PROXY
};
