import { SETTLE_ENTRANCE } from './_shared.mjs';

// original array position 5 of 25 -- see ../README.md for what `order` means
export const order = 5;

export default {
	path: '/dev/home-order?role=teacher&classes=1&rows=3',
	label: 'Home page section order, managing teacher (Apps above Classes)',
	/* Same entrance settling as the student variant above, and for the same
	   reason: the rows are what the assertions are about, and a row inside
	   an opacity-0 card is painted nowhere. */
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-tour="classes"] .course-card.section-card.feed-card', label: 'rendered class card(s)', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'rendered ungraded-work rows', expectPresent: 1, expectVisible: 1 },
		{ selector: '.launcher .app-card', label: 'rendered app cards', expectPresent: 1, expectVisible: 1 }
	],
	domOrder: [
		{
			before: '.launcher',
			after: '[data-tour="classes"]',
			label: 'Apps precedes Classes for a viewer who manages a section'
		}
	],
	contrast: [{ selector: '[data-tour="classes"] .assignment-name', label: 'feed row title', min: 4.5 }],
	tapTargets: [{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'feed rows', min: 44 }]
};
