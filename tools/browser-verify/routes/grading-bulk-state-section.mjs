/**
 * BATCH GRADING ON THE PER-SECTION CONSOLE, AND THE FOUR THINGS THAT MUST
 * STILL BE ABSENT FROM IT (0288).
 *
 * Mr. Pina filed "I must be able to quick return a zero or incomplete
 * assignments" from `/classroom/<section>/item/<item>/grade`, where every
 * piece of the batch machinery already existed and none of it was reachable:
 * the only prop that switched it on -- `bulk` -- also carried the CROSS-CLASS
 * READ, so handing it over would have swapped his one class for every class he
 * teaches the assignment in. `loadAcross` is optional now, and this spec is
 * the shape of the console that gets the first without the second.
 *
 * IT IS A TWO-DIRECTION SPEC AND THE ABSENCES ARE THE POINT. Anyone can assert
 * a batch bar exists; what a regression here looks like is a page that quietly
 * became the cross-class console -- section groups appearing over somebody
 * else's students, and the link ACROSS disappearing because it used to live in
 * the `{:else}` of the very conditional the batch bar lives in. So:
 *
 *   PRESENT  the presets, a tick box per student, the batch bar, the zero
 *            control, and the link to the cross-class console
 *   ABSENT   every section group heading
 *
 * THE NEGATIVE CONTROLS ARE TWO OTHER SPECS ON THIS SAME FIXTURE, which is
 * what stops any of it passing vacuously: `grading-bulk.mjs` runs the default
 * state and counts section groups ABOVE zero with no cross-class link, and
 * `grading-bulk-state-single.mjs` runs `?state=single` and counts NO presets
 * at all. One fixture, three transport shapes, three readings.
 *
 * THE TICK-BOX COUNT IS THE ONE THAT CATCHES A WIDENED READ. This console
 * shows ONE section's roster; the cross-class one shows seven students across
 * two. A count is the only thing that tells them apart -- the markup is
 * identical either way.
 */

const PRESETS = '[data-testid="pick-presets"]';

export default {
	path: '/dev/grading-bulk?state=section',
	label: 'Batch grading over ONE section: the bar is there, the grouping is not, the way across survives',
	/* NO `aliasOf`. It makes `urlFor` visit the BASE path, which is right for a
	   state a prepare step CLICKS into and wrong for one the query string
	   carries: this spec's whole subject is the transport shape
	   `?state=section` hands the console, and visiting `/dev/grading-bulk`
	   would measure the cross-class console while claiming to measure the
	   per-section one -- and every assertion below would invert. */

	/*
		OPEN A STUDENT, because the rubric pane -- and with it the zero control
		and the batch bar -- only exists once somebody is selected.

		THE WAIT IS NOT OPTIONAL AND ITS ABSENCE WAS MEASURED HERE. The roster
		arrives from a transport, so it is not on screen when the document is:
		without this step the click reported "0 matched, 0 attempts, no match"
		at 375 and every assertion below read zero -- which the harness
		correctly calls a finding rather than passing quietly. The sibling specs
		on this fixture carry the same wait for the same reason; one of them
		measured the rows arriving at 1663ms.

		The `until` is the work split arriving, which is something ONLY the
		click can produce, so the step cannot short-circuit on a state the page
		already had.
	*/
	prepare: [
		{
			waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 4',
			attempts: 40,
			gapMs: 250
		},
		{
			click: '.roster-list .roster-row',
			until: "() => document.querySelectorAll('.work-split').length === 1"
		}
	],

	presence: [
		/* --- PRESENT: what this bundle put on this route ------------------ */
		{ selector: PRESETS, label: 'the selection presets', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{
			selector: '[data-preset="missing"]',
			label: 'the "Nothing handed in" preset, which is the selection a zero is for',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.roster-item input[type="checkbox"]',
			label: 'a tick box per student in THIS section (4), never the cross-class roster (7)',
			expectPresent: 4,
			maxPresent: 4
		},
		{ selector: '[data-testid="batch-bar"]', label: 'the batch bar', expectPresent: 1, maxPresent: 1 },
		{
			selector: '[data-testid="score-bottom-levels"]',
			label: 'the zero control',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		/* --- ABSENT: what would mean this page became the other page ------ */
		{
			selector: '[data-testid="roster-group"]',
			label: 'section group headings -- this console reads one class and must not group',
			expectPresent: 0
		},
		{
			selector: '[data-testid="roster-unplaced"]',
			label: 'the off-roster group, which is a cross-class finding only',
			expectPresent: 0
		},
		/* --- AND THE WAY ACROSS, which the old conditional would have eaten */
		{
			selector: '[data-testid="cross-class-link"]',
			label: 'the link to the cross-class console, which must survive batch arriving here',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	],

	textContains: [
		{
			selector: PRESETS,
			label: 'both hand-in presets are offered, and they read as a pair',
			must: ['Handed in', 'Nothing handed in', 'Not graded yet'],
			mustNot: ['undefined']
		},
		{
			selector: '[data-testid="batch-count"]',
			label: 'the count names this one class rather than claiming several',
			must: ['selected'],
			mustNot: ['across', 'classes:']
		},
		{
			selector: '[data-testid="score-bottom-levels"]',
			label: 'the zero control says what it DOES, not what it means',
			must: ['lowest level'],
			/* "Give a zero" is a claim about a total that an extra-credit award
			   on the line above can falsify. */
			mustNot: ['Give a zero', 'undefined']
		}
	],

	contrast: [
		{ selector: '[data-testid="score-bottom-levels"]', label: 'the zero control', min: 4.5 },
		{ selector: '[data-preset="missing"]', label: 'the "Nothing handed in" preset', min: 4.5 }
	],

	tapTargets: [
		/* 44px and not 24px: `.cr-console` declares no density class, and
		   CLAUDE.md's rule is that a surface with no such class is
		   student-facing for the purpose of this floor whatever it is really
		   for. Measured 212.1x44 and 269x44 on the zero control. */
		{ selector: '[data-testid="score-bottom-levels"]', label: 'the zero control', min: 44 },
		{ selector: `${PRESETS} button`, label: 'the selection presets', min: 44 },
		{ selector: '[data-testid="cross-class-link"]', label: 'the link across', min: 44 }
	],

	ignoreConsole: ['ERR_CONNECTION_RESET', 'ERR_BLOCKED_BY_CLIENT']
};
