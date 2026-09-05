/**
 * THE STUDENT'S OWN TRACK, SENT BACK. State two of three, and the one that
 * carries somebody else's words.
 *
 * `0051`'s header states the rule the whole GREENLINE review flow is built on:
 * never a blunt reject. A track that comes back keeps its data, keeps its
 * history, and arrives with the teacher's own sentence attached so the author
 * can act on it. That sentence used to be reachable only by hovering the chip,
 * which is to say: not reachable on a phone, which is to say: for most students,
 * a track came back with no reason at all.
 *
 * This spec's `.gg-track-review-fb` row is the positive control for the pending
 * spec's assertion that the same element is absent there.
 */
export default {
	path: '/dev/greenline-portal?view=garage&seed=rejected',
	label: 'GREENLINE garage -- the author’s own track, sent back with a note',
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
			waitFor: '() => !!document.querySelector(\'[data-testid="track-review-note"].changes\')',
			timeoutMs: 20000
		}
	],
	presence: [
		{ selector: '[data-testid="track-review-note"].changes', label: 'the sent-back sentence', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		{ selector: '.gg-track-review-fb', label: 'THE TEACHER’S OWN WORDS, on the page', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		{ selector: '.gg-track-tag.review', label: 'the CHANGES ASKED chip', expectPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="track-review-note"]',
			label: 'what a student is told when it comes back',
			must: [
				'Your teacher asked for changes',
				'Add a runoff at turn 3',
				'Nobody else can see or race it',
				'submit it again'
			],
			/* Never a blunt reject: the words the surface must not use. */
			mustNot: ['rejected', 'denied', 'refused']
		},
		{
			selector: '.gg-track-tag.review',
			label: 'the chip, which is a flag and not the explanation',
			must: ['CHANGES ASKED']
		}
	],
	contrast: [
		{ selector: '[data-testid="track-review-note"] b', min: 4.5, label: 'the lead line' },
		{ selector: '.gg-track-review-fb', min: 4.5, label: 'the teacher’s quoted note' },
		{ selector: '.gg-track-tag.review', min: 4.5, label: 'the CHANGES ASKED chip' }
	],
	tapTargets: [
		/* `.gg-pattern` (the livery and decal controls) took the same floor in
		   this bundle but lives on the LIVERY tab, so it is measured by
		   `...-seed-pending-panel-livery.mjs` rather than here: one DOM state
		   per run, and a selector that matches nothing is not a measurement. */
		{ selector: '.gg-track-act', label: 'per-track actions (REPORT / REMOVE)', min: 44 }
	]
};
