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
 *
 * AND `ideacad-role-student-state-revealed.mjs` IS THE OTHER HALF, added by
 * 0171: the identical selector PRESENT, three times, from a prediction already
 * recorded. An absence measured with nothing on the other side of it is
 * satisfied by a sheet that never renders the thing under any circumstances.
 */
export default {
	path: '/dev/ideacad?role=student&state=compare',
	label: 'IdeaCAD: the compare sheet with the prediction gate closed',
	prepare: [{ waitFor: '() => !!document.querySelector(".compare")' }],
	orderResult: [
		{
			/* LEDGER 0160'S OWN EXPERIMENT, RUN AGAINST THE FIXED GATE, in a real
			   Chromium at both widths. It is the LAST step that makes the six
			   absences above it mean anything: the deliberate press with both
			   halves must OPEN the gate, or every "still locked" is satisfied by a
			   sheet that never renders physics at all. The probe is built on the
			   page, so a step that stops running shortens the array and reddens.

			   IT RUNS LAST IN THIS FILE'S ORDER BUT MUTATES THE SHEET, which is why
			   the presence and text blocks below are written against the state the
			   page opened on -- the harness takes those readings before this
			   block. */
			label: 'the gate, measured the way 0160 measured it broken',
			evaluate: '() => window.__ideacadGateProbe()',
			expected: [
				'the sheet opens with the physics locked ok',
				'one character typed into Say why leaves it locked ok',
				'and no inertia figure is anywhere on the sheet ok',
				'a press with no concept picked leaves it locked ok',
				'a concept picked with no reason leaves it locked ok',
				'and a press on that half leaves it locked too ok',
				'both halves present still leaves it locked until the press ok',
				'the deliberate press opens it, one block per concept ok',
				'and the inertia figure is on screen once it is open ok'
			]
		}
	],
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
		/* WHAT IS NOT LOCKED, AND MUST NOT BE. Decision 26's default locks the
		   comparative physics ONLY: a student needs diameter, height, hex
		   extension and mass to build a legal concept at all, so the columns and
		   their rule rows are on screen in BOTH states and only the `<dl>` above
		   moves. These counts are also the positive control for that absence --
		   without them it is satisfied by a sheet that rendered nothing. */
		{ selector: '.compare .cols article', label: 'one column per concept, unlocked', expectPresent: 3, expectVisible: 3 },
		{ selector: '.compare .cols li', label: 'four rule rows per concept, unlocked', expectPresent: 12, expectVisible: 12 },
		{ selector: '.compare .thumb', label: 'a profile thumbnail per column', expectPresent: 3, expectVisible: 3 },
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
		{ selector: '.compare .cols h4', label: 'a concept name on the column ground', min: 4.5 },
		{ selector: '.compare .cols li', label: 'a rule row on the column ground', min: 4.5 },
		{ selector: '.compare p', label: 'the question on the sheet ground', min: 4.5 },
		{ selector: '.compare .note', label: 'the not-ready sentence on the sheet ground', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.compare select', label: 'the concept picker' },
		{ selector: '.compare input', label: 'the say-why field' },
		{ selector: '.compare button', label: 'a compare-sheet control' }
	]
};
