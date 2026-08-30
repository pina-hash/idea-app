import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/navigation?force=1',
	aliasOf: '/dev/navigation?force=1',
	label: 'Route-transition indicator, pinned on: the reduced-motion state',
	widths: WIDTHS,
	/*
		WHY THIS IS A SECOND SPEC RATHER THAN A ROW ON THE FIRST ONE. `motion`
		flips Chromium's own emulation of `prefers-reduced-motion` and re-reads
		the SAME elements in both states. An element that exists only inside a
		probe's own toggle is gone before the second read, so the sweep would
		find nothing to animate -- which the check counts as a failure, correctly
		(an empty case list satisfies "nothing moves under reduce" perfectly),
		and which would be a fixture gap reported as a finding. `?force=1` pins
		the bar for the whole visit so both reads land on the same element.

		MEASURING THE ANIMATION RUNNING PROVES NOTHING ABOUT THE CANCELLED
		STATE, which is the whole difficulty and the reason this route exists.
		The rule the component has to satisfy is CLAUDE.md's, stated for the
		marks and general: with the animation cancelled the element is at full
		opacity with no transform, so a reduced-motion reader sees the whole
		thing. Here that is load-bearing rather than cosmetic -- under `reduce`
		the static sweep IS the entire signal that a navigation is in flight.
	*/
	motion: [
		{
			selector: '.nav-prog-sweep',
			label: 'the indicator sweep: animated under no-preference, static and painted under reduce',
			expect: 'gated'
		}
	],
	presence: [
		/*
			THE POSITIVE CONTROL FOR THE ABSENCE ROW ON `/dev/navigation`. That
			route asserts `[data-nav-progress="nav-progress"] .nav-prog-track` is
			exactly 0 at rest, and an absence row cannot tell "the rule holds"
			from "the selector was renamed". This row proves the same class name
			matches something real when the bar IS drawn, on the same page, in
			the same run.

			It reads the FORCED instance's testid, because the root layout's live
			one is correctly empty here: nothing is navigating.
		*/
		{
			selector: '[data-nav-progress="nav-progress-forced"] .nav-prog-track',
			label: 'the track paints when the indicator is on (control for the absence row)',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1,
			maxVisible: 1
		},
		{
			selector: '[data-nav-progress="nav-progress-forced"] .nav-prog-sweep',
			label: 'the sweep paints when the indicator is on',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1,
			maxVisible: 1
		},
		/*
			BOTH REGIONS ARE STILL `role="status"` AND THERE ARE STILL EXACTLY
			TWO OF THEM -- the root layout's live one and this route's pinned
			one. A ceiling, because a third would mean a surface started mounting
			its own, which is the one thing the "mounted once in the root layout"
			rule forbids and the thing nothing else here would notice.
		*/
		{
			selector: '[data-nav-progress="nav-progress"], [data-nav-progress="nav-progress-forced"]',
			label: 'exactly two indicator regions: the live one and this route\'s pinned one',
			expectPresent: 2,
			maxPresent: 2,
			/*
				TWO PRESENT, ONE PAINTING. The live region is correctly empty here
				-- nothing is navigating -- so it holds a zero box, and only the
				pinned one has a bar in it. `expectVisible` defaults to
				`expectPresent` when omitted, which asked for 2 and reddened the
				resting state the design requires; both bounds are stated.
			*/
			expectVisible: 1,
			maxVisible: 1
		},
		{
			selector: '[data-nav-progress="nav-progress-forced"][role="status"]',
			label: 'the indicator is reachable as a status, not as decoration',
			expectPresent: 1,
			maxPresent: 1
		}
	],
	textContains: [
		/*
			THE SENTENCE A SCREEN READER GETS. It is visually hidden by design --
			the bar carries the visual half -- so `presence` would report it as an
			invisible node and `contrast` has no ink to measure. What can be
			checked is that it SAYS something, in the one ellipsis spelling, and
			`mustNot` catches the case where the region is present and empty.
		*/
		{
			selector: '[data-nav-progress="nav-progress-forced"] .nav-prog-label',
			label: 'the live region carries a sentence, in the one spelling',
			must: ['Loading the next page…'],
			mustNot: ['...', '&hellip;']
		}
	]
};
