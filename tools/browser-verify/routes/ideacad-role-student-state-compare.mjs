/**
 * The prediction gate, open on screen and still closed.
 *
 * THE STATE THIS MEASURES IS THE ONE THAT SHIPPED WRONG. `{#if !prediction}`
 * over `bind:value={prediction}` keyed the lock on the rationale FIELD, so the
 * comparative physics unlocked on the first keystroke. Measured in Chromium
 * before the fix, with nothing picked and Reveal never pressed: one character
 * typed into "Say why" rendered `I 1626.6 g-cm2 / k 2.97 cm` under the heading
 * `Prediction: . h`.
 *
 * `tests/dom/ideacad-editor-mount.test.ts` proves the gate holds through every
 * path that is not the deliberate press; that is structure and belongs there.
 * What CANNOT be asserted there is that the sheet the gate lives in is legible
 * and reachable -- happy-dom has no layout engine, so its every box reads zero.
 * So this file measures the sheet: on screen at both widths, inside the
 * console, its controls at 44px, its copy at 4.5:1, and the physics rows absent
 * with the sheet itself present as the positive control that the state was
 * actually reached.
 */
export default {
	path: '/dev/ideacad?role=student&state=compare',
	label: 'IdeaCAD: the compare sheet with the prediction gate closed',
	prepare: [{ waitFor: '() => !!document.querySelector(".compare")' }],
	presence: [
		/* The positive control. Without it every absence below passes on a page
		   where the sheet never opened. */
		{ selector: '.compare', label: 'the compare sheet, open', expectPresent: 1, expectVisible: 1 },
		{ selector: '.compare select', label: 'the concept picker', expectPresent: 1, expectVisible: 1 },
		{ selector: '.compare input', label: 'the say-why field', expectPresent: 1, expectVisible: 1 },
		/* Three concepts plus the empty placeholder: the picker lists the live
		   concepts and nothing else. */
		/* An <option> in a CLOSED native select has a zero box in every engine, so this
		   one is counted and not measured: `expectVisible: 0` says that deliberately
		   rather than letting the default inherit the present count and report four
		   correct elements as four defects. `maxPresent` is what makes it a count. */
		{
			selector: '.compare option',
			label: 'one option per live concept, plus the placeholder',
			expectPresent: 4,
			maxPresent: 4,
			expectVisible: 0
		},
		{ selector: '.compare dl', label: 'the comparative physics, still locked', expectPresent: 0 },
		{ selector: '.compare .note', label: 'the sentence saying what the gate wants', expectPresent: 1, expectVisible: 1 },
		/* Three cards, because this state seeds three concepts. A gate that
		   offered a picker over one concept would be a question with one answer. */
		{ selector: '.concepts .card', label: 'the seeded concepts', expectPresent: 3, expectVisible: 3 }
	],
	textContains: [
		{
			selector: '.compare',
			label: 'the sheet asks the question and shows no physics',
			must: ['Which of your concepts spins longest', 'Reveal physics'],
			mustNot: ['g·cm²', 'Prediction:']
		}
	],
	contrast: [
		{ selector: '.compare h3', label: 'the compare heading on the sheet ground', min: 4.5 },
		{ selector: '.compare p', label: 'the question on the sheet ground', min: 4.5 },
		{ selector: '.compare .note', label: 'the not-ready sentence on the sheet ground', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.compare select', label: 'the concept picker' },
		{ selector: '.compare input', label: 'the say-why field' },
		{ selector: '.compare button', label: 'a compare-sheet control' }
	]
};
