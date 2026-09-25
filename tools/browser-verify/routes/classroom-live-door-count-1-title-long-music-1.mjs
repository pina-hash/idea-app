import { DOOR_GEOMETRY, TYPE_PAIRING, doorExpected, doorReady, doorVerdicts } from './_classroom-live-door.mjs';

/**
 * THE LIVE DOOR IN THE ROW IT WRAPPED IN (ledger 0298, R21): the hall pass,
 * the music tool and the door sharing one class-tools row, with 1 student(s)
 * on the assignment and a title far longer than the row can hold. Filed at
 * 871px, where "0" sat above "on"; run this spec at `--width 871` as well as
 * the two defaults. The count and "on" must stay on one line at every width,
 * the title must be the only thing that gives, and nothing may paint past the
 * door. The type probe reads the hall pass's own computed styles as the
 * expectation, so the door cannot drift from the tools it sits beside.
 */
export default {
	path: '/dev/classroom-live-door?count=1&title=long&music=1',
	label: 'Class page: the Live door with 1 on a long-titled assignment, three tools in the row',
	prepare: [doorReady(1), { evaluate: DOOR_GEOMETRY }],
	orderResult: [
		{ label: 'the count holds together and only the title gives', evaluate: doorVerdicts(1), expected: doorExpected(1) },
		{ label: 'the door wears the tools\' type', evaluate: TYPE_PAIRING, expected: ['word matches the tool word', 'status matches the tool chip'] }
	],
	presence: [
		{ selector: '[data-testid="class-tools"] > *', label: 'three tools in the row', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="live-door-count"]', label: 'the count', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-door-item"]', label: 'the title', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="live-door"] .ld-word', label: 'door word', min: 4.5 },
		{ selector: '[data-testid="live-door-count"]', label: 'door count', min: 4.5 },
		{ selector: '[data-testid="live-door-item"]', label: 'door title', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="live-door"]', label: 'the door' },
		{ selector: '[data-testid="hall-pass-tool"]', label: 'the hall pass beside it' },
		{ selector: '[data-testid="song-queue-tool"]', label: 'the music tool beside it' }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
