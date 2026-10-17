/**
 * SELECT ALL, THEN ARMING DELETE (ledger 0396, part 7, review rounds 1 and 2),
 * at 375 and 1440. Every label in the tray that changes holds the room of its
 * longest form from the first tick, so neither press changes a width or moves
 * anything: Select all keeps its box as it turns into Deselect all, Delete
 * keeps its box as it arms ("Really delete 21 items?"), the count stays, and
 * the class does not move, so the confirming press lands where the first one
 * did. Round 2's reviewer found arming moving the bar up a line in a 16px band
 * of widths, where the count used to step aside for the armed label.
 */
import { ARM, ARMED, ARMED_EXPECTED, IGNORE, READY, RECORD, RECORD_ARMED, RECORD_TICKED, SELECT_ALL, TEACHER, TICK } from './_class-toolbar.mjs';

export default {
	path: `${TEACHER}&state=armed`,
	aliasOf: TEACHER,
	label: 'The class toolbar: Select all and arming Delete move nothing under the pointer',
	ignoreConsole: IGNORE,
	prepare: [READY, RECORD, TICK, RECORD_TICKED, SELECT_ALL, ARM, RECORD_ARMED],
	orderResult: [{ label: 'Select all, Delete and the tray keep their boxes; the count stays; the class does not move', evaluate: ARMED, expected: ARMED_EXPECTED }],
	presence: [
		{ selector: '[data-testid="bulk-delete"]', label: 'Delete, armed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-select-all"]', label: 'Deselect all', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="bulk-delete"]', label: 'the armed Delete names the count', must: ['Really delete 21 items?'] },
		{ selector: '[data-testid="bulk-select-all"]', label: 'Select all reads Deselect all', must: ['Deselect all (21)'] }
	],
	contrast: [{ selector: '[data-testid="bulk-delete"] .bulk-label > span', label: 'the armed Delete', min: 4.5 }],
	tapTargets: [{ selector: '.class-toolbar :is([data-testid="bulk-bar"] :is(.btn, select), [data-testid="bulk-select-all"])', label: 'every control in the tray, and Select all', min: 44 }]
};
