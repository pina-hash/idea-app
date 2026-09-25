/**
 * A FINISHED WORKSHEET READS "Complete" ON THE ROSTER (decision 37, ledger 0298).
 *
 * Alice has answered every counted block of the ported worksheet -- the
 * two-sentence reflection, the checkbox and the photo -- and a schema-3
 * document has no turn-in, so this row used to read "In progress" forever.
 * Bruno has nothing and still reads "Not submitted". No grade, so no block is
 * listed as changed after grading.
 */
import { CHANGED_BLOCKS, OPEN_ALICE, ROSTER_STATES } from './_html-assignment-roster.mjs';

export default {
	path: '/dev/html-assignment-grading?state=complete',
	label: 'Grading console: a finished ported worksheet reads Complete',
	prepare: OPEN_ALICE,
	orderResult: [
		{ label: 'Alice finished, Bruno has nothing', evaluate: ROSTER_STATES, expected: ['Alice Alvarez: Complete', 'Bruno Baptiste: Not submitted'] },
		{ label: 'no grade, so nothing changed after one', evaluate: CHANGED_BLOCKS, expected: [] }
	],
	presence: [
		{ selector: '.roster-chip.submitted', label: 'the Complete chip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.roster-chip.late', label: 'no late chip', expectPresent: 0 },
		{ selector: '[data-testid="changed-blocks"]', label: 'no changed-block list', expectPresent: 0 }
	],
	contrast: [{ selector: '.roster-chip.submitted', label: 'Complete chip', min: 4.5 }]
};
