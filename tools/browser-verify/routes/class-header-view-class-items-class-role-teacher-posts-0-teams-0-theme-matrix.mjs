/**
 * THE CLASS TOOLBAR UNDER MATRIX (ledger 0396, part 7), at 375 and 1440: the
 * same row as the IDEA spec, read on Matrix's grounds, so the Videos key's
 * words are measured on that theme's key face. The geometry is the theme's
 * too: a theme block holds colours only, so the row and its step must read
 * exactly as they do on IDEA.
 */
import { IGNORE, KEY_CONTRAST, MEASURE, READY, ROW, ROW_EXPECTED_TEACHER, TAPS, TEACHER } from './_class-toolbar.mjs';

export default {
	path: `${TEACHER}&theme=matrix`,
	label: 'The class toolbar on Matrix (teacher)',
	ignoreConsole: IGNORE,
	prepare: [READY, MEASURE],
	orderResult: [{ label: 'one row, in order, Select all at the right edge, the plate step on both sides', evaluate: ROW(true), expected: ROW_EXPECTED_TEACHER }],
	presence: [{ selector: '[data-testid="harness-class"] .class-toolbar', label: 'one toolbar row', expectPresent: 1, maxPresent: 1, expectVisible: 1 }],
	contrast: KEY_CONTRAST,
	tapTargets: TAPS(true)
};
