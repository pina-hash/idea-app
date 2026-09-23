/**
 * THE CLASS PAGE AT REST, as a student, with the two new header tools and the
 * search-and-filter bar (ledger 0297, F3+F5, report 19).
 *
 * WHAT IS MEASURED:
 *   - the Search and Settings controls are in the classroom header, carry a
 *     word as well as a glyph, and clear 44px at every width;
 *   - the class page's search bar, kind select and the student's three status
 *     chips are there and clear 44px (a student surface: no 24px floor);
 *   - the chips COUNT from the loader's one clock: at 8pm Pacific on the 27th
 *     a check-in dated the 27th is to do, not missing;
 *   - THE TEACHER'S ORDER IS UNTOUCHED: the rows read in unit order, each
 *     unit in its own order, which is the positive control the filtered
 *     states beside this one narrow from.
 *   - A MANAGER'S CHIP IS ABSENT: no Drafts chip for a student, beside the
 *     three student chips as its positive control.
 */
import { READY, STREAM_ROWS, STUDENT } from './_classroom-palette.mjs';
import { OPEN_SHELL_MENU } from './_shell-menu.mjs';

export default {
	path: STUDENT,
	label: 'Class page at rest (student): header tools and the class search bar',
	prepare: [READY, OPEN_SHELL_MENU],
	presence: [
		{ selector: '[data-testid="palette-trigger"]', label: 'the Search control in the header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-trigger"]', label: 'the Settings control in the header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stream-search"]', label: 'the class search field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stream-kind"]', label: 'the kind select', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stream-status"] .find-chip', label: "the student's three status chips", expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="stream-status-drafts"]', label: "no manager's Drafts chip for a student", expectPresent: 0 },
		{ selector: '[data-testid="stream-find-result"]', label: 'no "shown" count while nothing narrows', expectPresent: 0 },
		{ selector: '[data-testid="command-palette"]', label: 'the palette is closed until asked for', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="palette-trigger"]', label: 'Search says so in a word', must: ['Search'] },
		{ selector: '[data-testid="settings-trigger"]', label: 'Settings says so in a word', must: ['Settings'] },
		{ selector: '[data-testid="stream-status-todo"]', label: 'to do, by the one clock', must: ['To do', '4'] },
		{ selector: '[data-testid="stream-status-missing"]', label: 'missing, by the one clock', must: ['Missing', '2'] },
		{ selector: '[data-testid="stream-status-done"]', label: 'done', must: ['Done', '3'] }
	],
	orderResult: [
		{
			label: "every row in the teacher's own order, unit by unit",
			evaluate: STREAM_ROWS,
			expected: [
				'u-1:item:i-welcome',
				'u-1:item:i-reference',
				'u-1:item:i-returned',
				'u-1:item:i-undated',
				'u-2:item:i-missing',
				'u-2:item:i-tonight',
				'u-2:item:i-turned-in',
				'u-3:item:i-safety',
				'u-3:item:i-tensile',
				'u-3:item:i-beam',
				'unfiled:checkin:Day 13 load test',
				'unfiled:checkin:Day 12 sketches',
				'unfiled:checkin:Day 11 truss',
				'unfiled:checkin:Day 14 bridge fit'
			]
		}
	],
	contrast: [
		{ selector: '[data-testid="palette-trigger"] .shell-tool-word', label: 'Search word', min: 4.5 },
		{ selector: '[data-testid="settings-trigger"] .shell-tool-word', label: 'Settings word', min: 4.5 },
		{ selector: '.find-chip', label: 'status chip label', min: 4.5 },
		{ selector: '.find-count', label: 'status chip count', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="palette-trigger"]', label: 'Search control' },
		{ selector: '[data-testid="settings-trigger"]', label: 'Settings control' },
		{ selector: '[data-testid="stream-search"]', label: 'class search field' },
		{ selector: '[data-testid="stream-kind"]', label: 'kind select' },
		{ selector: '.find-chip', label: 'status chips' }
	]
};
