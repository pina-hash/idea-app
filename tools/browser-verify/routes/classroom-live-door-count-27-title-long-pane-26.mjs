import { DOOR_GEOMETRY, TYPE_PAIRING, doorExpected, doorReady, doorVerdicts } from './_classroom-live-door.mjs';

/**
 * A NARROW DOOR SHARING ITS ROW (ledger 0298, R21): the class-tools row capped
 * at 26rem with the pass and the door sharing it, which puts the door near
 * 200px. That is NOT the default class list: the list's pane is 26rem but its
 * padding hands the row about 23rem (366px, measured), where every tool takes
 * its own line and the door is 366px wide. A door this narrow is a list
 * widened to about 28rem, or a phone near 430px, with two tools in the row.
 * Too narrow for the word and the status on one line, so the status takes a
 * line of its own under the word -- as one piece, count and "on" together,
 * the title ellipsized. At 375 the row is the phone's width and the two tools
 * stack, so the status sits beside the word again. Where it sits is printed
 * by the geometry step; what must hold everywhere is asserted.
 */
export default {
	path: '/dev/classroom-live-door?count=27&title=long&pane=26',
	label: 'Class page: the Live door in a class-list-width row, 27 on a long-titled assignment',
	prepare: [doorReady(27), { evaluate: DOOR_GEOMETRY }],
	orderResult: [
		{ label: 'the count holds together and only the title gives', evaluate: doorVerdicts(27), expected: doorExpected(27) },
		{ label: 'the door wears the tools\' type', evaluate: TYPE_PAIRING, expected: ['word matches the tool word', 'status matches the tool chip'] }
	],
	presence: [
		{ selector: '[data-testid="class-tools"] > *', label: 'two tools in the row', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="live-door-count"]', label: 'the count', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="live-door"] .ld-word', label: 'door word', min: 4.5 },
		{ selector: '[data-testid="live-door-count"]', label: 'door count', min: 4.5 },
		{ selector: '[data-testid="live-door-item"]', label: 'door title', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="live-door"]', label: 'the door' },
		{ selector: '[data-testid="hall-pass-tool"]', label: 'the hall pass beside it' }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
