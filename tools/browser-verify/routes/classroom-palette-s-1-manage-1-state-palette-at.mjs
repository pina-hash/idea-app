/**
 * THE COMMAND PALETTE'S `@` SEARCH, as a teacher of the class.
 *
 * The roster is loaded when the palette OPENS, never on page load, and only
 * for a manager; "@an" then finds the one student whose name starts a word
 * with it. This is the positive control for the student state of the same
 * route, where the Students scope and every student row are absent.
 */
import { MANAGER, PALETTE_OPEN, PALETTE_ROWS, READY, pressKey, typeInto } from './_classroom-palette.mjs';

export default {
	path: `${MANAGER}&state=palette-at`,
	aliasOf: MANAGER,
	label: 'Command palette (teacher): @ finds a student',
	prepare: [
		READY,
		pressKey({ key: 'k', metaKey: true }, PALETTE_OPEN),
		typeInto('palette-input', '@an', '() => document.querySelectorAll(\'[data-testid="palette-row"][data-kind="student"]\').length === 1')
	],
	orderResult: [
		{ label: 'the one student the query names', evaluate: PALETTE_ROWS, expected: ['student:ana.reyes@boscotech.net'] },
		{ label: 'the roster was asked for once, on open', evaluate: '() => [window.__paletteProbe().rosterLoads]', expected: [1] }
	],
	presence: [
		{ selector: '[data-testid="palette-scope-students"]', label: 'the Students scope for a teacher', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="palette-scope-students"][aria-pressed="true"]', label: 'and it is the one pressed', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [{ selector: '[data-testid="palette-row"]', label: 'the row is a name and a door, never an address', must: ['Ana Reyes', 'Notebook in this class'], mustNot: ['@boscotech'] }],
	tapTargets: [{ selector: '[data-testid="palette-row"]', label: 'result row' }]
};
