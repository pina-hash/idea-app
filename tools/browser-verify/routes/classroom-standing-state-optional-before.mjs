/**
 * THE SAME `?state=optional` CLASS PAGE BEFORE THE TOGGLE (ledger 0360): the
 * positive control for `classroom-standing-state-optional.mjs`. The open
 * worksheet reads "Missing" here, so the "Complete, late" there is the toggle's
 * doing and not the fixture's; and the optional-slot and checkbox-string
 * worksheets already read Complete from the server's own rows.
 */
import { STANDING, STANDING_READY, STANDING_ROWS } from './_classroom-standing.mjs';

export default {
	path: `${STANDING}?state=optional-before`,
	label: 'What a student owes: the 0360 worksheets as the server reads them',
	prepare: [STANDING_READY],
	orderResult: [
		{
			label: 'every row at rest: two Complete, the control and the open one Missing',
			evaluate: STANDING_ROWS,
			expected: [
				'Concept sketches | Missing | -',
				'Portfolio capture | Complete, late | -',
				'Portfolio capture, photo missing | Missing | -',
				'Safety check | Complete | -'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="standing-student"] [data-testid="work-status"][data-missing="true"]', label: 'missing chips at rest', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="standing-finished-here"][aria-pressed="false"]', label: 'the toggle, not pressed', expectPresent: 1, maxPresent: 1 }
	]
};
