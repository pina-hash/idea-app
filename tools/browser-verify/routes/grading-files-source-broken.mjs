/* NO `order` EXPORT -- see routes.mjs. */

/**
 * LEDGER 0298, A6: A PLAN THAT THROWS COSTS THE EXPORT, NEVER THE CONSOLE.
 *
 * "Download all files" plans its zip while the grading console RENDERS, so a
 * stored shape nobody anticipated (0195 accepts a module titled with a number,
 * for one) must not take the console down. The harness hands in a transport
 * whose block names throw when read. What this asserts is the console still
 * works -- the roster is there and the export panel opens -- and the control
 * says it is unavailable, with no count that would be false and no button
 * whose only outcome is nothing.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/grading-files?source=broken',
	label: 'Grading console whose file plan throws: the console survives, the control says so',
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
		{ selector: '.roster-list .roster-row', label: 'the positive control: the roster rendered', expectPresent: 5, expectVisible: 1 },
		{ selector: '[data-testid="export-json-class"]', label: 'the other exports are still there', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-files"]', label: 'the file download group', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-files-unavailable"]', label: 'the sentence saying it is unavailable', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-files-count"]', label: 'no count, which would be false', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="bulk-files-download"]', label: 'no Download all files control', expectPresent: 0, maxPresent: 0 }
	],
	contrast: [{ selector: '[data-testid="bulk-files-unavailable"]', label: 'the unavailable sentence', min: 4.5 }],
	/* THE THROW IS DELIBERATE and the component logs it; nothing else may. */
	ignoreConsole: [/Download all files: the plan could not be built/]
};
