/**
 * THE SHORTCUT LEGEND, opened with `?` outside anything being typed in.
 *
 * It lists THIS screen's keys from the registry and nothing else: the palette
 * (Ctrl K), the legend itself (?) and the class search (/). The grading
 * console's keys are not here -- they belong to the grading screen -- which is
 * the absence measured beside the three present rows.
 */
import { LEGEND_OPEN, READY, STUDENT, pressKey } from './_classroom-palette.mjs';

export default {
	path: `${STUDENT}&state=legend`,
	aliasOf: STUDENT,
	label: 'Shortcut legend (student): ? on the class page',
	prepare: [READY, pressKey({ key: '?', shiftKey: true }, LEGEND_OPEN)],
	orderResult: [
		{
			label: "this screen's keys, from the registry",
			evaluate: '() => [...document.querySelectorAll(\'[data-testid="shortcut-legend"] kbd\')].map((k) => k.textContent.trim())',
			expected: ['Ctrl K', '?', '/']
		}
	],
	presence: [
		{ selector: '[data-testid="shortcut-legend"]', label: 'the legend', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="palette-back"]', label: 'a way back to search', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="shortcut-legend"]', label: 'the rows say what each key does', must: ['Search and commands', 'Keyboard shortcuts', 'Search this class'], mustNot: ['Return to student', 'Back to roster', 'Save draft'] }
	],
	contrast: [{ selector: '[data-testid="shortcut-legend"] dd', label: 'legend row', min: 4.5 }],
	tapTargets: [
		{ selector: '[data-testid="palette-back"]', label: 'Search' },
		{ selector: '[data-testid="command-palette"] [data-testid="palette-close"]', label: 'Close' }
	]
};
