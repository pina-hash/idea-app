/* NO `order` EXPORT -- see routes.mjs. */

/**
 * LEDGER 0298, A6: ABSENCE OF THE TRANSPORT REMOVES THE CONTROL.
 *
 * The other direction of `grading-files.mjs`, on the same fixture: no file
 * transport handed in, so there is no "Download all files" group at all -- not
 * a disabled button, not a sentence. The export panel it would sit in is
 * asserted PRESENT and open, which is what makes the zero mean something.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/grading-files?source=none',
	label: 'Grading console with no file transport: no Download all files control',
	widths: WIDTHS,
	prepare: [
		{
			waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length > 0',
			label: 'the roster has loaded'
		},
		{
			click: '[data-testid="work-export-disclosure"]',
			until: `() => document.querySelector('[data-testid="work-export-disclosure"]')?.getAttribute('aria-expanded') === 'true'`,
			label: 'the export panel is open',
			attempts: 12,
			gapMs: 200
		}
	],
	presence: [
		{ selector: '[data-testid="export-json-class"]', label: 'the positive control: the export panel is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-files"]', label: 'no file download group', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="bulk-files-download"]', label: 'no Download all files control', expectPresent: 0, maxPresent: 0 }
	]
};
