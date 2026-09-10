import { SETTLE_ENTRANCE } from './_shared.mjs';

// original array position 4 of 25 -- see ../README.md for what `order` means
export const order = 4;

export default {
	path: '/dev/home-order?role=student&classes=1&rows=3',
	label: 'Home page section order, student with a class (Apps above Classes, ledger 0117)',
	/* Mounts the REAL src/routes/+page.svelte (see the route's own +page.ts
	   for why its fixture items are dated off Date.now() rather than a
	   frozen clock). A prior vitest probe asserted `managesAnySection` as a
	   computed boolean and passed while never rendering a single row --
	   every assertion here reads elements actually painted in the DOM. */
	/* `.course-card` and `.app-card` mount at opacity:0 and are handed
	   `.visible` by an IntersectionObserver in this page's own onMount
	   (threshold 0.08) -- real entrance chrome, not a fixture gap. This
	   harness does not scroll, so a card below the fold at a given
	   viewport genuinely never intersects and never fades in.

	   THIS USED TO SAY `present` OVER `visible` WAS CORRECT HERE, AND IT
	   WAS HALF RIGHT. It was correct about the CARDS and it quietly covered
	   for the ROWS, which had no `expectVisible` of their own and were
	   reported visible only because `isVisible` did not walk ancestors for
	   opacity -- the rows compute opacity 1 inside an opacity-0 card. The
	   entrance is settled in `prepare` now (see SETTLE_ENTRANCE), so every
	   row below is measured painted and the card assertions are `visible`
	   rather than an exemption. */
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-tour="classes"] .course-card.section-card.feed-card', label: 'rendered class card(s)', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'rendered due-soon rows', expectPresent: 1, expectVisible: 1 },
		{ selector: '.launcher .app-card', label: 'rendered app cards', expectPresent: 1, expectVisible: 1 }
	],
	/* SINCE LEDGER 0117 A STUDENT GETS APPS FIRST, CLASSES OR NO CLASSES. This
	   row used to assert the opposite ("Classes precedes Apps for a viewer who
	   manages nothing") on the strength of a 375px scroll measurement; Mr. Pina
	   asked a second time with that cost known, and the page keys a student's
	   order on the ROLE now. The staff rule is unchanged and is measured by
	   the teacher spec beside this one. */
	domOrder: [
		{
			before: '.launcher',
			after: '[data-tour="classes"]',
			label: 'Apps precedes Classes for a student, even with a class to show'
		}
	],
	contrast: [{ selector: '[data-tour="classes"] .assignment-name', label: 'feed row title', min: 4.5 }],
	tapTargets: [{ selector: '[data-tour="classes"] .assignment-item.linked', label: 'feed rows', min: 44 }]
};
