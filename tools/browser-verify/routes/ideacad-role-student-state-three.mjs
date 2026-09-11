/**
 * Three concepts with the active one FAILING a rule.
 *
 * THE FAIL RENDERING HAD NEVER BEEN SEEN. Every other IdeaCAD state passes all
 * four rules, so the crimson `b.fail` branch in the readouts rail existed, type
 * checked, and had never been painted by anything -- which is exactly the
 * shape of thing that turns out to be unreadable the first time a student hits
 * it in class. This fixture makes the oversized concept the ACTIVE one so the
 * rail renders it at rest, and the measurement below is the first ratio ever
 * taken on it: 5.12:1 for `rgb(217, 95, 95)` on the rail's own
 * `rgb(16, 19, 18)`, against the 4.5 floor for copy.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL, so the assertion is the WORD as well as the
 * ratio: `textContains` requires FAIL and PASS to both be on the rail, which a
 * hue-only chip would not satisfy. `--crimson` is the reserved error colour in
 * this register and a rule failure is the one thing on this surface entitled to
 * it.
 *
 * The concept strip is measured here rather than on the default state for the
 * same reason: one card is not a strip, and a scroller with a single item
 * cannot show whether the cards keep their targets when there are several.
 */
export default {
	path: '/dev/ideacad?role=student&state=three',
	label: 'IdeaCAD: three concepts, the active one over the diameter rule',
	prepare: [{ waitFor: '() => !!document.querySelector(".readouts .metric b")' }],
	presence: [
		{ selector: '.concepts .card', label: 'the three seeded concepts', expectPresent: 3, expectVisible: 3 },
		{ selector: '.concepts .card.active', label: 'exactly one active concept', expectPresent: 1, expectVisible: 1 },
		{ selector: '.readouts .metric b.fail', label: 'the failing rule chip', expectPresent: 1, expectVisible: 1 },
		/* Positive control: three of the four rules still pass, so the fixture is
		   showing a real mixed state rather than a rail that fails everything. */
		{ selector: '.readouts .metric b:not(.fail)', label: 'the passing rule chips', expectPresent: 3, expectVisible: 3 }
	],
	textContains: [
		{
			selector: '.readouts',
			label: 'the rail says FAIL and PASS in words, not in hue alone',
			must: ['FAIL', 'PASS', 'Diameter'],
			mustNot: []
		}
	],
	contrast: [
		{ selector: '.readouts .metric b.fail', label: 'the FAIL word on the rail ground', min: 4.5 },
		{ selector: '.readouts .metric b:not(.fail)', label: 'the PASS word beside it', min: 4.5 },
		{ selector: '.concepts .card.active small', label: 'the ACTIVE marker on a concept card', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.concepts .card', label: 'a concept card' },
		{ selector: '.concepts button:not(.card)', label: 'a concept strip control' }
	]
};
