/**
 * THE COMMAND PALETTE, opened with Ctrl+K and searched, as a student.
 *
 * Ctrl+K is dispatched as a real keydown on the body, which bubbles to the
 * palette's own window listener exactly as a keystroke does. "trus" then finds
 * the assignment whose name starts with it and the student's own check-in
 * whose name carries it as a word, ranked in that order, and nothing a student
 * may not open.
 *
 * TWO ABSENCES, each beside its positive control: the Students scope (a
 * manager's `@`) is not offered to a student while Items and Actions are, and
 * no student row appears for a student while the `?manage=1` state of this
 * same route shows one.
 *
 * THE DIALOG IS THE TOP LAYER AND HOLDS FOCUS: the search field has focus the
 * moment it opens, and the rows are 44px or taller at every width.
 */
import { PALETTE_OPEN, PALETTE_ROWS, READY, STUDENT, pressKey, typeInto } from './_classroom-palette.mjs';

export default {
	path: `${STUDENT}&state=palette`,
	aliasOf: STUDENT,
	label: 'Command palette (student): Ctrl K, then "trus"',
	prepare: [
		READY,
		pressKey({ key: 'k', ctrlKey: true }, PALETTE_OPEN),
		typeInto('palette-input', 'trus', '() => document.querySelectorAll(\'[data-testid="palette-row"]\').length === 2')
	],
	orderResult: [
		{ label: 'the item that starts with it, then the check-in that carries it', evaluate: PALETTE_ROWS, expected: ['item:i-missing', 'checkin:ns-11'] },
		{
			label: 'the search field has focus inside the open dialog',
			evaluate: '() => [document.querySelector(\'dialog[data-testid="command-palette"]\')?.open === true, document.activeElement?.getAttribute("data-testid")]',
			expected: [true, 'palette-input']
		}
	],
	presence: [
		{ selector: 'dialog[data-testid="command-palette"]', label: 'one palette, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="palette-row"]', label: 'two results', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="palette-scope-items"]', label: 'the Items scope', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="palette-scope-actions"]', label: 'the Actions scope', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="palette-scope-students"]', label: "no Students scope for a student", expectPresent: 0 },
		{ selector: '[data-kind="student"]', label: 'no student row for a student', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="palette-row"][data-key="item:i-missing"]', label: 'the row names its kind in a word', must: ['Truss sketch', 'Assignment', 'Item'] },
		{ selector: '[data-testid="palette-count"]', label: 'a count of results', must: ['2 results'] }
	],
	contrast: [
		{ selector: '.cp-row-name', label: 'row name', min: 4.5 },
		{ selector: '.cp-row-detail', label: 'row detail', min: 4.5 },
		{ selector: '.cp-row-kind', label: 'row kind word', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="palette-row"]', label: 'result rows' },
		{ selector: '.cp-scope', label: 'scope buttons' },
		{ selector: '[data-testid="palette-close"]', label: 'Close' },
		{ selector: '[data-testid="palette-input"]', label: 'search field' }
	]
};
