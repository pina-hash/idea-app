/* NO `order` EXPORT -- see routes.mjs. */

/**
 * LEDGER 0298, A6, ON THE PER-CLASS CONSOLE: `/classroom/<class>/item/<item>/grade`.
 *
 * That console reads ONE class's roster and every file the item has, because an
 * assignment posted to two classes is one item and RLS rightly hands a teacher
 * of both every hand-in. So without the wider roster, Period 3's students would
 * read as strangers and land under `_not-on-roster/`. The control asks for every
 * roster the teacher manages once, and this spec measures the answer: the same
 * count as the all-classes console, Period 3 counted OUT and said in words.
 */
import { WIDTHS } from './_shared.mjs';
import { OPEN_FILES_PANEL } from './_grading-files.mjs';

export default {
	path: '/dev/grading-files?mode=section',
	label: 'Grading console, one class: Download all files recognises the other class',
	widths: WIDTHS,
	prepare: OPEN_FILES_PANEL,
	presence: [
		{ selector: '[data-testid="bulk-files-download"]', label: 'one Download all files control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE PER-CLASS CONSOLE HAS NO CLASS PICKER, which is what makes this
		   the per-class case rather than the all-classes one. */
		{ selector: '[data-testid="export-section"]', label: 'no class picker on the per-class console', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="bulk-files-count"]',
			label: 'the same count as the all-classes console',
			must: ['10 files from 4 students', 'Period 1']
		},
		{
			selector: '[data-testid="bulk-files"]',
			label: 'the other class is counted out, and the strangers are only the two real ones',
			must: [
				'2 files from 2 students in your other classes are not in this download',
				'2 files from 2 people not on this class roster'
			]
		}
	],
	tapTargets: [
		{ selector: '[data-testid="bulk-files-download"]', label: 'Download all files', min: 44 }
	]
};
