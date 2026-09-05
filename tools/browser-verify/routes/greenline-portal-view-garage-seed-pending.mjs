/**
 * THE STUDENT'S OWN TRACK, WAITING. State one of three.
 *
 * This is the screen the whole bundle is named after: a student has submitted a
 * track, can select and race it right here in their own garage, and has to be
 * able to tell -- without asking anybody -- that nobody else can see it yet.
 * Before this bundle the tile carried a three-word chip and put the reason in a
 * `title` attribute, which a phone cannot show at all, so on the device most of
 * them use the answer was simply not on the page.
 *
 * What is measured is therefore the SENTENCE, present and visible and readable,
 * not the chip. Its two siblings are `...-seed-rejected` and `...-seed-approved`.
 */
export default {
	path: '/dev/greenline-portal?view=garage&seed=pending',
	label: 'GREENLINE garage -- the author’s own track, awaiting review',
	prepare: [
		/* THE GARAGE IS THE HEAVIEST SURFACE IN THE APP and `waitForApp` returns
		   on painted-and-settled markup, which the harness chrome satisfies
		   before the component has mounted. Measured: the tab strip is not in
		   the DOM until well after that. `clickUntil` does NOT retry a selector
		   that matches nothing (it reports `0 matched, 0 attempt(s)`), so the
		   wait has to come first or every row after it describes a screen the
		   run never reached -- which is exactly what the first version of this
		   spec measured. */
		{
			waitFor: '() => !!document.querySelector(\'[data-testid="gg-tab-garage"]\')',
			timeoutMs: 20000
		},
		/* THE TRACK PICKER LIVES ON THE GARAGE TAB, and the component opens on
		   BUILD. A spec that measured without pressing it would report zero
		   matches for every row and read exactly like a surface that renders
		   nothing -- so the tab press is a step, with a predicate naming
		   something only the press can produce. */
		{
			click: '[data-testid="gg-tab-garage"]',
			until: '() => !!document.querySelector(".gg-track")'
		},
		{
			waitFor: '() => !!document.querySelector(\'[data-testid="track-review-note"]\')',
			timeoutMs: 20000
		}
	],
	presence: [
		{ selector: '[data-testid="track-review-note"]', label: 'the review sentence, on the page rather than in a tooltip', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		{ selector: '.gg-track-tag.review', label: 'the chip beside it (colour is never the only signal)', expectPresent: 1, expectVisible: 1 },
		/* The "changes asked" branch must NOT be on screen for a pending track.
		   Its positive control is the rejected spec, where the same selector is
		   asserted present. */
		{ selector: '[data-testid="track-review-note"].changes', label: 'not the sent-back branch', expectPresent: 0, maxPresent: 0 },
		{ selector: '.gg-track-review-fb', label: 'no teacher quote when nothing was said', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="track-review-note"]',
			label: 'what a student is told at pending',
			/* Three claims, and the middle one is the one that was missing: the
			   student CAN race it, and that is exactly why "I can see it" is not
			   evidence anybody else can. */
			must: ['Waiting for a teacher to review it', 'nobody else can see it yet', 'once a teacher approves it'],
			/* It must never read as published. */
			mustNot: ['published', 'live']
		}
	],
	contrast: [
		{ selector: '[data-testid="track-review-note"] b', min: 4.5, label: 'the lead line' },
		{ selector: '[data-testid="track-review-note"] span', min: 4.5, label: 'the explanation' },
		{ selector: '.gg-track-tag.review', min: 4.5, label: 'the IN REVIEW chip' }
	],
	tapTargets: [
		/* The garage is a student surface played on a phone and declares no
		   instructor-only density class, so 44px applies at both widths. These
		   were 14px (`.gg-track-act`) and 24px (`.gg-pattern`). */
		/* `.gg-pattern` (the livery and decal controls) took the same floor in
		   this bundle but lives on the LIVERY tab, so it is measured by
		   `...-seed-pending-panel-livery.mjs` rather than here: one DOM state
		   per run, and a selector that matches nothing is not a measurement. */
		{ selector: '.gg-track-act', label: 'per-track actions (REPORT / REMOVE)', min: 44 }
	]
};
