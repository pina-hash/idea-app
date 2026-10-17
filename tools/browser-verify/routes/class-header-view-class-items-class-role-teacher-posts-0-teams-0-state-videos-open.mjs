/**
 * THE VIDEOS KEY OPENED (ledger 0396, part 7), at 375 and 1440. Collapsed it
 * is a key in the toolbar row ("Videos 7"); opened, the list is a band under
 * the whole row, as wide as the row, that pushes the class down rather than
 * covering it; closed again, the class is back where it was to the pixel.
 */
import { IGNORE, OPEN_VIDEOS, READY, RECORD, TEACHER, VIDEOS_BAND, VIDEOS_BAND_EXPECTED } from './_class-toolbar.mjs';

export default {
	path: `${TEACHER}&state=videos-open`,
	aliasOf: TEACHER,
	label: 'The Videos key opened: a full-width band under the row, and closing gives the space back',
	ignoreConsole: IGNORE,
	prepare: [READY, RECORD, OPEN_VIDEOS],
	presence: [
		{ selector: '[data-testid="class-video"]', label: 'the seven cards, painted', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="class-videos-toggle"].on', label: 'the key is lit while its list is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="class-videos-toggle"]', label: 'the key says what pressing it does', must: ['Videos 7', 'Hide'] }],
	// LAST: the probe closes the list again.
	orderResult: [{ label: 'a band under the row, as wide as the row; closing gives the space back', evaluate: VIDEOS_BAND, expected: VIDEOS_BAND_EXPECTED }]
};
