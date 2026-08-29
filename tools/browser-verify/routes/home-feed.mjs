import { SETTLE_ENTRANCE } from './_shared.mjs';

// original array position 6 of 25 -- see ../README.md for what `order` means
export const order = 6;

export default {
	path: '/dev/home-feed',
	label: 'Home feed harness, student mode',
	/* Mounts the REAL ClassroomFeed through the REAL buildFeed, against a
	   clock frozen in the fixture (`now={NOW}`), so unlike /dev/home-order
	   this one carries no live-clock trap of its own -- the assertions
	   below still read rendered rows rather than a ranking result, for the
	   same reason: a computed value proves the function ran, not that
	   anything painted. */
	/* This route mounts ClassroomFeed directly rather than the real
	   src/routes/+page.svelte, so the entrance IntersectionObserver that
	   page's own onMount wires up for `.course-card` never runs here --
	   the shared `.legacy-index .course-card` rule still stamps opacity:0
	   at mount and NOTHING EVER ADDS `.visible` on this route at all.

	   Which makes it the sharper case of the two: on /dev/home-order a card
	   above the fold does fade in, so the vacuum was intermittent. Here the
	   cards were at opacity 0 at every width on every run, and the nine
	   `.assignment-item` rows inside them were being measured for contrast
	   and tap geometry the whole time. `SETTLE_ENTRANCE` adds the class this
	   route's own page never gets round to adding. */
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '.legacy-index .course-card.section-card.feed-card', label: 'rendered section card(s)', expectPresent: 3, expectVisible: 3 },
		{ selector: '.legacy-index .assignment-item.linked', label: 'rendered feed rows', expectPresent: 1, expectVisible: 1 }
	],
	contrast: [{ selector: '.legacy-index .assignment-name', label: 'feed row title', min: 4.5 }],
	tapTargets: [{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', min: 44 }]
};
