/**
 * A CLASS WITH LINKS AND NO VIDEO HAS NO VIDEOS SECTION (ledger 0298, R08).
 *
 * The two items carry a Vimeo link and a YouTube channel page -- links, and
 * neither a video -- and one plain item: the section is absent rather than
 * empty, while both items are rows and the search row is there (the positive
 * controls, so the absence is the rule and not a page that never painted).
 */
import { ROW_NAMES, VIDEOS_READY } from './_class-videos.mjs';

export default {
	path: '/dev/class-videos?state=none',
	label: 'Videos in a class with no video: no section at all',
	prepare: [VIDEOS_READY],
	orderResult: [
		{ label: 'both items are rows', evaluate: ROW_NAMES, expected: ['Shop safety rules', 'Shop tour'] }
	],
	presence: [
		{ selector: '[data-testid="videos-class"] [data-testid="stream-find"]', label: 'the search row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-videos"]', label: 'no Videos section', expectPresent: 0 },
		{ selector: '[data-testid="class-video"]', label: 'no card', expectPresent: 0 }
	]
};
