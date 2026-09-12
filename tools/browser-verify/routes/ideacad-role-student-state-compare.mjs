/**
 * The compare sheet before a prediction has been made, with the physics on it.
 *
 * THERE IS NO GATE ANY MORE. Mr. Pina decided on 2026-09-12 that physics is
 * always visible (`docs/decisions/entries/26-*`): IDEA100 is a rotation class,
 * there is no time to teach the mathematics behind rotational inertia, and
 * visible numbers help students build maximally competitive designs. This file
 * used to measure the sheet with the numbers ABSENT; every such assertion is
 * inverted below rather than deleted, so the reversal is on the record.
 *
 * `tests/dom/ideacad-editor-mount.test.ts` proves the structure -- the physics
 * on every path, the prediction still collected. What CANNOT be asserted there
 * is that the sheet is legible and reachable: happy-dom has no layout engine,
 * so its every box reads zero. So this file measures the sheet at both widths,
 * inside the console, its controls at 44px and its copy at 4.5:1.
 *
 * AND `ideacad-role-student-state-predicted.mjs` IS THE OTHER ARRANGEMENT: the
 * same sheet once a prediction is recorded, where the form is replaced by what
 * was said and the physics is exactly where it was.
 */
export default {
	path: '/dev/ideacad?role=student&state=compare',
	label: 'IdeaCAD: the compare sheet before a prediction, physics on screen',
	prepare: [{ waitFor: '() => !!document.querySelector(".compare")' }],
	orderResult: [
		{
			/* LEDGER 0160'S OWN EXPERIMENT, RUN AGAINST A SURFACE WITH NO GATE IN
			   IT, in a real Chromium at both widths. Same keystrokes, same order,
			   inverted answers -- which is what makes the reversal auditable rather
			   than a set of assertions that simply stopped existing.

			   THE LAST THREE STEPS ARE THE NEGATIVE CONTROL. With nothing locked,
			   every "the physics is visible" claim above is also satisfied by a
			   sheet that shows physics and asks nothing, so the probe ends by
			   proving the PREDICTION is still collected and recorded. That is the
			   half Mr. Pina kept.

			   IT RUNS LAST IN THIS FILE'S ORDER BUT MUTATES THE SHEET, which is why
			   the presence and text blocks below are written against the state the
			   page opened on -- the harness takes those readings before this
			   block. */
			label: 'the physics, measured the way 0160 measured the gate leaking',
			evaluate: '() => window.__ideacadPhysicsProbe()',
			expected: [
				'the Rules rail carries the rotational inertia ok',
				'and the radius of gyration beside it ok',
				'with a real figure rather than a label alone ok',
				'the sheet opens with the physics already on it ok',
				'one character typed into Say why changes nothing about the physics ok',
				'and the inertia figure is on the sheet ok',
				'a press with no concept picked records nothing ok',
				'and still leaves the physics where it was ok',
				'a concept picked with no reason records nothing either ok',
				'the deliberate press records the prediction ok',
				'and the form is gone, so nobody is asked twice ok',
				'and the physics never moved ok'
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
		/* DECISION 26, ANSWERED: one physics block per concept with no prediction
		   made. The COUNT is the claim -- a sheet showing the active concept's
		   numbers alone would answer "which of your concepts spins longest" with
		   one answer. */
		{ selector: '.compare dl', label: 'the comparative physics, never locked', expectPresent: 3, expectVisible: 3 },
		{ selector: '.compare .note', label: 'the sentence saying what the form wants', expectPresent: 1, expectVisible: 1 },
		{ selector: '.compare .cols article', label: 'one column per concept', expectPresent: 3, expectVisible: 3 },
		{ selector: '.compare .cols li', label: 'four rule rows per concept', expectPresent: 12, expectVisible: 12 },
		{ selector: '.compare .thumb', label: 'a profile thumbnail per column', expectPresent: 3, expectVisible: 3 },
		/* Three cards, because this state seeds three concepts. A gate that
		   offered a picker over one concept would be a question with one answer. */
		{ selector: '.concepts .card', label: 'the seeded concepts', expectPresent: 3, expectVisible: 3 }
	],
	textContains: [
		{
			selector: '.compare',
			label: 'the sheet asks the question AND shows the physics',
			must: ['Which of your concepts spins longest', 'Record prediction', 'g·cm²'],
			/* The recorded line is the OTHER arrangement; a sheet rendering both
			   at once is the form and its answer on screen together. */
			mustNot: ['Prediction:', 'Reveal physics']
		}
	],
	contrast: [
		{ selector: '.compare h3', label: 'the compare heading on the sheet ground', min: 4.5 },
		{ selector: '.compare .cols h4', label: 'a concept name on the column ground', min: 4.5 },
		{ selector: '.compare .cols li', label: 'a rule row on the column ground', min: 4.5 },
		{ selector: '.compare p', label: 'the question on the sheet ground', min: 4.5 },
		{ selector: '.compare .note', label: 'the not-ready sentence on the sheet ground', min: 4.5 },
		{ selector: '.compare .cols dd', label: 'a physics value on the column ground', min: 4.5, all: true },
		{ selector: '.compare .cols dt', label: 'a physics label on the column ground', min: 4.5, all: true }
	],
	tapTargets: [
		{ selector: '.compare select', label: 'the concept picker' },
		{ selector: '.compare input', label: 'the say-why field' },
		{ selector: '.compare button', label: 'a compare-sheet control' }
	]
};
