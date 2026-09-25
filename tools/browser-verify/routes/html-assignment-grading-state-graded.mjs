/**
 * WHICH ANSWERS MOVED AFTER THE GRADE, PER BLOCK (decision 37, ledger 0298).
 *
 * The fixture stamps a grade a day and a half ago. Since then Alice edited her
 * reflection and added her photo; her checkbox and her name are older than the
 * grade. So the pane lists exactly two blocks, newest first, named by the
 * worksheet's module and field, and the existing "Edited after grading" chip
 * is still on her row. Her work is still complete and ungraded work does not
 * return, so her state chip still reads "Complete".
 */
import { CHANGED_BLOCKS, OPEN_ALICE, ROSTER_STATES } from './_html-assignment-roster.mjs';

export default {
	path: '/dev/html-assignment-grading?state=graded',
	label: 'Grading console: the answers changed after grading, each with its time',
	prepare: OPEN_ALICE,
	orderResult: [
		{ label: 'the two blocks that moved, newest first', evaluate: CHANGED_BLOCKS, expected: ['Work: photo had a picture added after grading', 'Work: reflection changed after grading'] },
		{
			label: 'every entry carries its own time',
			evaluate: `() => [...document.querySelectorAll('[data-testid="changed-block"]')].map((li) => / at \\S/.test(li.textContent))`,
			expected: [true, true]
		},
		{ label: 'the row keeps its state and gains the existing chip', evaluate: ROSTER_STATES, expected: ['Alice Alvarez: Complete', 'Bruno Baptiste: Not submitted'] }
	],
	presence: [
		{ selector: '[data-testid="changed-block"]', label: 'changed blocks', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="roster-changed"]', label: 'the row chip', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [{ selector: '[data-testid="changed-block"]', label: 'changed-block line', min: 4.5 }]
};
