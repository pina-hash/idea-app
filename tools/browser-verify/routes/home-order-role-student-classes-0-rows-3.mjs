import { SETTLE_ENTRANCE } from './_shared.mjs';

/**
 * THE EMPTY FEED, which is the case the other two home-order specs could not
 * express: both of them carry one section, so both measure a page whose
 * classes block has something in it.
 *
 * A viewer with NO feed used to get the student order -- the page keyed the
 * decision on `managesAnySection` alone -- so `ClassroomFeed`'s own empty
 * state ("You are not in any classes yet") sat above the launcher as a 230px
 * card with nothing in it to open. That is not a rare shape: it is every
 * student between enrolment and the roster import, every viewer whose
 * classroom read failed, a teacher between terms, and every signed-out visitor
 * on a public-first landing page.
 *
 * Measured at 375px on this very route, first app card from the top of the
 * document: 900px (1.13 screens) before, 629px (0.79 screens) after. The rule
 * keeps its own stated reason -- the feed earns the top by deep-linking a
 * student into the exact item that is due -- and stops applying where there is
 * nothing to link to.
 *
 * THE ABSENCE ROW HAS ITS POSITIVE CONTROL IN THIS SAME SPEC, which is what
 * `checks.mjs` requires of every `expectPresent: 0`: a selector matching
 * nothing reads `present 0` whether the rows are genuinely absent or the
 * markup was renamed underneath it. The empty-state CARD and the app cards are
 * both asserted present here, so "no due rows" cannot come from a page that
 * rendered nothing at all.
 */
export default {
	path: '/dev/home-order?role=student&classes=0&rows=3',
	label: 'Home page section order, viewer with no classes (Apps above the empty feed)',
	/* Same entrance settling as the other two variants, and for the same
	   reason: a card at opacity 0 is painted nowhere, and `domOrder` reads
	   elements the page actually mounted. */
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		/* The empty state IS a `.course-card.section-card.feed-card`, which is
		   exactly why "is the block there" was never the question and why the
		   order was worth changing rather than the block worth hiding. */
		{
			selector: '[data-tour="classes"] .course-card.section-card.feed-card',
			label: 'the empty-state card (positive control for the absence row below)',
			expectPresent: 1,
			expectVisible: 1
		},
		/* THE ABSENCE, and the whole argument for the reorder: this block has
		   nothing actionable in it. Exact zero -- `maxPresent` defaults to 0
		   when `expectPresent` is 0. */
		{
			selector: '[data-tour="classes"] .assignment-item.linked',
			label: 'no due-soon rows: nothing in this block to deep-link into',
			expectPresent: 0
		},
		{
			selector: '.launcher .app-card',
			label: 'rendered app cards',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	domOrder: [
		{
			before: '.launcher',
			after: '[data-tour="classes"]',
			label: 'Apps precedes Classes when the feed has no class in it'
		}
	],
	contrast: [
		{ selector: '.launcher .app-title', label: 'app card title', min: 4.5 }
	]
};
