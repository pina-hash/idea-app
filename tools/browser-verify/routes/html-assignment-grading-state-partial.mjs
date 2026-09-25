/**
 * THE OTHER DIRECTION: ONE BLOCK UNMET IS NOT COMPLETE. The same fixture with
 * Alice's photo taken away -- the one block still empty -- reads "In progress",
 * exactly as every schema-3 row did before; nothing about a nearly finished
 * worksheet reads as done.
 */
import { OPEN_ALICE, ROSTER_STATES } from './_html-assignment-roster.mjs';

export default {
	path: '/dev/html-assignment-grading?state=partial',
	label: 'Grading console: a worksheet with one block empty is still in progress',
	prepare: OPEN_ALICE,
	orderResult: [
		{ label: 'not complete', evaluate: ROSTER_STATES, expected: ['Alice Alvarez: In progress', 'Bruno Baptiste: Not submitted'] }
	],
	presence: [
		{ selector: '.roster-chip.submitted, .roster-chip.late', label: 'no Complete chip of either kind', expectPresent: 0 },
		{ selector: '.roster-chip.progress', label: 'the In progress chip', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	]
};
