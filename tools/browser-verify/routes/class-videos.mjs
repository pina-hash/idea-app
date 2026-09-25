/**
 * EVERY VIDEO IN A CLASS, ON THE CLASS PAGE (ledger 0298, R08), as a student.
 *
 * Over the harness's fixture, the Videos section:
 *   - sits between the search row and the units, CLOSED, with "3 videos" on
 *     its trigger, and asks YouTube for nothing while closed (the three stills
 *     are in the DOM, lazy and no-referrer, and none fired its error; every
 *     off-loopback request is aborted here, so a requested still would have);
 *   - once opened, lists three cards in the page's own order: the caliper
 *     video (a link ending a sentence) with the announcement that re-posts it
 *     under "Also in", the zeroing video (a bare URL in a list item, so "Watch
 *     on YouTube"), and the gear video linked mid-sentence at a timestamp;
 *   - carries NO card for the non-YouTube page with `?v=`, the Vimeo link or
 *     the channel page, while all five items are still rows on the page.
 * The stills are aborted, so every card is measured in its broken-still state
 * (the frame and the play mark), exactly as /dev/item-gallery's video cards are.
 */
import {
	CARDS,
	GRID_GEOMETRY,
	ITEM_HREFS,
	OPEN_VIDEOS,
	RECORD_CLOSED,
	ROW_NAMES,
	STILLS_REQUESTED,
	VIDEOS,
	VIDEOS_READY,
	WATCH_LINKS
} from './_class-videos.mjs';

export default {
	path: VIDEOS,
	label: 'Videos in a class: one closed section, one card per video, each back to its item (student)',
	prepare: [VIDEOS_READY, RECORD_CLOSED, OPEN_VIDEOS, STILLS_REQUESTED, GRID_GEOMETRY],
	orderResult: [
		{
			label: 'closed: three lazy, no-referrer stills in a hidden region, none requested',
			evaluate: `() => window.__cvClosed ?? ['not recorded']`,
			expected: ['stills 3', 'no-referrer 3', 'lazy 3', 'region none']
		},
		{
			// The positive control for the closed reading: once open, every still
			// was requested, aborted by the harness, and dropped to its play mark.
			label: 'open: all three stills requested (aborted here, so each card keeps only its play mark)',
			evaluate: `() => ['stills ' + document.querySelectorAll('[data-testid="class-videos-grid"] img').length]`,
			expected: ['stills 0']
		},
		{
			label: 'one card per video, in the page order, the re-post under Also in',
			evaluate: CARDS,
			expected: [
				'Cal1perDial | Reading a dial caliper | Day 3: calipers | Reminder: the caliper video',
				'Zero1ngStep | Watch on YouTube | Day 3: calipers | -',
				'GearRat1o42 | this gear video | Gear ratio worksheet | -'
			]
		},
		{
			label: 'Posted in / Also in go to the items in this class',
			evaluate: ITEM_HREFS,
			expected: [
				'/dev/class-videos/s-videos/item/mat-calipers',
				'/dev/class-videos/s-videos/item/post-reminder',
				'/dev/class-videos/s-videos/item/mat-calipers',
				'/dev/class-videos/s-videos/item/as-gears'
			]
		},
		{
			label: 'watching opens YouTube in a new tab with no opener and no referrer',
			evaluate: WATCH_LINKS,
			expected: [
				'_blank noopener noreferrer www.youtube.com',
				'_blank noopener noreferrer youtu.be',
				'_blank noopener noreferrer www.youtube.com'
			]
		},
		{
			label: 'every item is still a row (the positive control for the absent cards)',
			evaluate: ROW_NAMES,
			expected: ['Day 3: calipers', 'Gear ratio worksheet', 'Reminder: the caliper video', 'Shop safety rules', 'Shop tour']
		}
	],
	presence: [
		{ selector: '[data-testid="videos-class"].cr-root', label: 'the classroom room mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-videos"]', label: 'one Videos section', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-video"]', label: 'three cards', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="class-video-also"]', label: 'one Also in link', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-video"] .cvid-play', label: 'a play mark on every card', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-video="GearTable01"]', label: 'no card for another host carrying ?v=', expectPresent: 0 },
		{ selector: '[data-testid="class-video-watch"][href*="vimeo"], [data-testid="class-video-watch"][href*="@ideabosco"]', label: 'no card for Vimeo or a channel page', expectPresent: 0 },
		{ selector: '[data-testid="class-videos-held"]', label: 'no held-back note for a student', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="class-videos-count"]', label: 'the count on the trigger', must: ['3 videos'] },
		{ selector: '[data-testid="class-videos-toggle"]', label: 'the trigger says what it does', must: ['Videos', 'Hide'] }
	],
	domOrder: [
		{ before: '[data-testid="stream-find"]', after: '[data-testid="class-videos"]', label: 'under the search row' },
		{ before: '[data-testid="class-videos"]', after: '[data-testid="item-row"]', label: 'above the first unit' }
	],
	tapTargets: [
		{ selector: '[data-testid="class-videos-toggle"]', label: 'the Videos trigger', min: 44 },
		{ selector: '[data-testid="class-video-watch"]', label: 'watch (still and title)', min: 44 },
		{ selector: '[data-testid="class-video"] .cvid-from', label: 'Posted in / Also in', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="class-video"] .cvid-label', label: 'card title', min: 4.5 },
		{ selector: '[data-testid="class-video"] .cvid-meta', label: 'card meta line', min: 4.5 },
		{ selector: '[data-testid="class-video"] .cvid-from-title', label: 'item link', min: 4.5 },
		{ selector: '[data-testid="class-video"] .cvid-from-word', label: 'Posted in', min: 4.5 },
		{ selector: '[data-testid="class-video"] .cvid-also-label', label: 'Also in', min: 4.5 },
		{ selector: '[data-testid="class-videos-count"]', label: 'the count', min: 4.5 }
	]
};
