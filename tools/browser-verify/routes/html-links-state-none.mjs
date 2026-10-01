/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE STUDENT'S CHECK ON AN EMPTY LINK FIELD DRAWS NOTHING (ledger 0360): no
 * nagging line before they have typed anything; the progress rail already says
 * the field is not done. The harness's own note is the positive control that
 * the page rendered, and the grader's section is still there beside it.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/html-links?state=none',
	label: 'Link hand-ins: an empty link field draws no check at all',
	widths: WIDTHS,
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="html-links-harness"]')`, label: 'the harness has rendered' }],
	presence: [
		{ selector: '[data-testid="html-link-check"]', label: 'the check (none)', expectPresent: 0 },
		{ selector: '[data-testid="hl-none-note"]', label: 'the harness note (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="hl-links-avery"] [data-testid="answer-link-open"]', label: 'the grader’s keys, unchanged', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	]
};
