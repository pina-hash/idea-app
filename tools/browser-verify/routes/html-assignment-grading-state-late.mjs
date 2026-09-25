/**
 * FINISHED AFTER THE DUE INSTANT READS "Complete, late" (decision 37's
 * default: a word and a tone, never a silent Done). The fixture's due instant
 * sits between Alice's reflection and her photo, and the photo is what
 * finished the worksheet.
 */
import { OPEN_ALICE, ROSTER_STATES } from './_html-assignment-roster.mjs';

export default {
	path: '/dev/html-assignment-grading?state=late',
	label: 'Grading console: a worksheet finished after its deadline reads Complete, late',
	prepare: OPEN_ALICE,
	orderResult: [
		{ label: 'late says so in words', evaluate: ROSTER_STATES, expected: ['Alice Alvarez: Complete, late', 'Bruno Baptiste: Not submitted'] }
	],
	presence: [
		{ selector: '.roster-chip.late', label: 'the late chip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.roster-chip.submitted', label: 'no on-time Complete chip', expectPresent: 0 }
	],
	contrast: [{ selector: '.roster-chip.late', label: 'Complete, late chip', min: 4.5 }]
};
