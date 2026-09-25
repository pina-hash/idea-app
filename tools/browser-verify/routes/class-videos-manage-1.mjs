/**
 * THE CLASS'S VIDEOS AS ITS TEACHER SEES THEM (ledger 0298, R08).
 *
 * A manager's read carries two things a student's does not: a DRAFT (with its
 * own video) and an item's INSTRUCTOR-ONLY links (one of them a video). The
 * Videos section is what the class sees, so neither is a card; the draft's
 * video is COUNTED in one line, so a teacher is told why it is absent. Both
 * items are rows on the page (the positive control for the two absences).
 */
import { CARDS, OPEN_VIDEOS, ROW_NAMES, VIDEOS_READY } from './_class-videos.mjs';

export default {
	path: '/dev/class-videos?manage=1',
	label: 'Videos in a class, as its teacher: a draft is held back and counted, an instructor-only link never listed',
	prepare: [VIDEOS_READY, OPEN_VIDEOS],
	orderResult: [
		{
			label: 'the same three cards the class sees',
			evaluate: `() => (${CARDS})().map((c) => c.split(' | ')[0])`,
			expected: ['Cal1perDial', 'Zero1ngStep', 'GearRat1o42']
		},
		{
			label: 'the draft and the item with an instructor-only video are both rows here',
			evaluate: ROW_NAMES,
			expected: [
				'Caliper quiz',
				'Day 3: calipers',
				'Gear ratio worksheet',
				'Next week: bearings',
				'Reminder: the caliper video',
				'Shop safety rules',
				'Shop tour'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="class-video"]', label: 'three cards', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-video="Bear1ngsNxt"]', label: "no card for the draft's video", expectPresent: 0 },
		{ selector: '[data-video="AnswerKey01"]', label: 'no card for an instructor-only video', expectPresent: 0 },
		{ selector: '[data-testid="class-videos-held"]', label: 'one held-back line', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="class-videos-held"]',
			label: 'what is held back, and why',
			must: ['1 more video is in a draft or scheduled post', 'once students can see it']
		},
		{ selector: '[data-testid="class-videos-count"]', label: 'the count is the class count', must: ['3 videos'] }
	],
	contrast: [{ selector: '[data-testid="class-videos-held"]', label: 'held-back line', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="class-videos-toggle"]', label: 'the Videos trigger', min: 44 }]
};
