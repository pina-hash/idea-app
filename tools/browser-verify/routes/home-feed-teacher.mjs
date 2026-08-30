import { SETTLE_ENTRANCE } from './_shared.mjs';

// original array position 7 of 25 -- see ../README.md for what `order` means
export const order = 7;

export default {
	path: '/dev/home-feed-teacher',
	label: 'Home feed harness, teacher mode (ungraded queue)',
	aliasOf: '/dev/home-feed',
	/* The settle comes AFTER the mode switch, not before: switching modes
	   re-renders the feed, and a class added to the cards that were on
	   screen a moment ago is a class on elements that no longer exist. */
	prepare: [
		{
			click: '[data-mode="teacher"]',
			until: '() => document.querySelector(\'[data-mode="teacher"]\').classList.contains("active")'
		},
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }
	],
	presence: [
		{ selector: '.legacy-index .course-card.section-card.feed-card', label: 'rendered section card(s)', expectPresent: 3, expectVisible: 3 },
		{ selector: '.legacy-index .assignment-item.linked', label: 'rendered feed rows (teacher)', expectPresent: 1, expectVisible: 1 }
	],
	contrast: [{ selector: '.legacy-index .assignment-name', label: 'feed row title (teacher)', min: 4.5 }],
	tapTargets: []
};
