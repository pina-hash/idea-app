/**
 * THE CLASS TOOLBAR UNDER SPACE WHITE (ledger 0396, part 7), at 375 and 1440:
 * the same row as the IDEA spec on the light plate, where the Videos key is a
 * light key face and its words take the key's ink.
 */
import { IGNORE, KEY_CONTRAST, MEASURE, READY, ROW, ROW_EXPECTED_TEACHER, TAPS, TEACHER } from './_class-toolbar.mjs';

export default {
	path: `${TEACHER}&theme=space-white`,
	label: 'The class toolbar on Space White (teacher)',
	ignoreConsole: IGNORE,
	prepare: [READY, MEASURE],
	orderResult: [{ label: 'one row, in order, Select all at the right edge, the plate step on both sides', evaluate: ROW(true), expected: ROW_EXPECTED_TEACHER }],
	presence: [{ selector: '[data-testid="harness-class"] .class-toolbar', label: 'one toolbar row', expectPresent: 1, maxPresent: 1, expectVisible: 1 }],
	contrast: KEY_CONTRAST,
	tapTargets: TAPS(true)
};
