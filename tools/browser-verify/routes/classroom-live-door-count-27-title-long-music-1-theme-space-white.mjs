import { DOOR_GEOMETRY, TYPE_PAIRING, doorExpected, doorReady, doorVerdicts } from './_classroom-live-door.mjs';

/**
 * THE LIVE DOOR ON THE LIGHT THEME (ledger 0298, R21): the three-tool row of
 * the count-27 spec with Space White forced, because the class page is in
 * that theme's scope and the door's inks are the register's. The same
 * verdicts as the dark row, and the door's three texts re-measured against
 * the white ground they actually land on.
 */
export default {
	path: '/dev/classroom-live-door?count=27&title=long&music=1&theme=space-white',
	label: 'Class page: the Live door under Space White, 27 on a long-titled assignment',
	prepare: [
		doorReady(27),
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ evaluate: DOOR_GEOMETRY }
	],
	orderResult: [
		{ label: 'the count holds together and only the title gives', evaluate: doorVerdicts(27), expected: doorExpected(27) },
		{ label: 'the door wears the tools\' type', evaluate: TYPE_PAIRING, expected: ['word matches the tool word', 'status matches the tool chip'] }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-tools"] > *', label: 'three tools in the row', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	contrast: [
		{ selector: '[data-testid="live-door"] .ld-word', label: 'door word', min: 4.5 },
		{ selector: '[data-testid="live-door-count"]', label: 'door count', min: 4.5 },
		{ selector: '[data-testid="live-door-item"]', label: 'door title', min: 4.5 },
		{ selector: '[data-testid="live-door"] .ld-glyph', label: 'door glyph (a graphical mark)', min: 3 }
	],
	tapTargets: [{ selector: '[data-testid="live-door"]', label: 'the door' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
