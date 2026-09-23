/**
 * THE NEGATIVE CONTROL: a census the build could not take.
 *
 * `virtual:site-code` answers `complete: false` with every figure at zero when
 * `git ls-files` returns nothing -- a checkout with no tracked file list, or a
 * git that is not there. A code count that can silently come out LOW is worse
 * than no count, which is the rule `site-versions.ts` already applies to a
 * shallow clone: it withholds every version number rather than emitting a
 * smaller one. So the readout must render NOTHING. Not a zero, not a dash, not
 * a "not available" chip: a banner claiming this repository holds 0 lines of
 * code is a worse sentence than a banner that says nothing at all.
 *
 * An absence row cannot tell "the rule holds" from "the markup was renamed", so
 * the harness page's own heading is asserted present in the same spec.
 */
export default {
	path: '/dev/code-census?census=empty',
	label: 'The lines-of-code readout with a census the build could not take (nothing renders)',
	presence: [
		/* THE POSITIVE CONTROL, and the whole reason the rows below mean
		   anything: the page rendered. */
		{ selector: '.census-harness h1', label: 'the harness page rendered (positive control)', expectPresent: 1, expectVisible: 1 },
		/* PRESENT, NOT VISIBLE, AND THAT IS THE CORRECT READING: a stage whose
		   only child rendered nothing holds a ZERO BOX (measured 343x0 at 375
		   and 928x0 at 1440). Asserting it VISIBLE would be asserting the
		   readout rendered something after all. The `orderResult` row below is
		   what proves the stage is empty rather than merely unpainted. */
		{ selector: '[data-testid="counter-stage"]', label: 'the stage the readout would mount into (zero-box, by design)', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 },
		/* THE ABSENCES. Exact zero -- `maxPresent` defaults to 0 when
		   `expectPresent` is 0. */
		{ selector: '[data-testid="counter-stage"] .loc-chip', label: 'no readout', expectPresent: 0 },
		{ selector: '.loc-panel', label: 'no panel', expectPresent: 0 },
		{ selector: '[data-testid="counter-stage"] button', label: 'no control of any kind', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'nothing in the stage claims a figure',
			/* A DIGIT IN THE STAGE IS THE FAILURE, whatever element carries it:
			   the zeroed census must produce no readout, not a readout showing
			   zero. The harness strip prints the zeroes deliberately and is
			   outside the stage. */
			evaluate:
				'() => { const stage = document.querySelector(\'[data-testid="counter-stage"]\'); if (!stage) return ["NO STAGE"]; const text = (stage.textContent || "").trim(); return [text === "" ? "the stage is empty" : "THE STAGE SAYS: " + text.slice(0, 40)]; }',
			expected: ['the stage is empty']
		}
	]
};
