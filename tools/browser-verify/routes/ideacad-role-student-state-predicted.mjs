/**
 * The compare sheet ONCE A PREDICTION IS RECORDED, which is what a student sees
 * on every visit after the first.
 *
 * THIS FILE WAS `...-state-revealed.mjs` AND THE RENAME IS THE POINT. It
 * measured the prediction GATE open; there is no gate (decision 26, Mr. Pina,
 * 2026-09-12), so a file named for a reveal would be naming a mechanism that no
 * longer exists, which is the kind of stale name this repository pays for in
 * whole sessions. What it measures now is the sheet's OTHER arrangement.
 *
 * THE PHYSICS IS IDENTICAL IN BOTH ARRANGEMENTS, and that is the assertion that
 * carries the decision: three `<dl>` blocks here and three in
 * `ideacad-role-student-state-compare.mjs`, where no prediction has been made.
 * A number that moved between the two would be a gate coming back.
 *
 * WHAT DOES MOVE IS THE FORM. A student who predicted last week must not be
 * asked again -- a second answer would overwrite the one they are being taught
 * by -- so the picker and the say-why field are asserted ABSENT here and
 * present there. `BladeEditor` takes a `prediction` prop and seeds `recorded`
 * from it; this route hands one in.
 */
export default {
	path: '/dev/ideacad?role=student&state=predicted',
	label: 'IdeaCAD: the compare sheet with a prediction already recorded',
	prepare: [{ waitFor: '() => !!document.querySelector(".compare dl")' }],
	presence: [
		{ selector: '.compare', label: 'the compare sheet, open', expectPresent: 1, expectVisible: 1 },
		/* One column per concept, and one physics block in each. The COUNT is the
		   claim: a sheet showing the active concept's numbers alone would answer
		   "which of your concepts spins longest" with one answer. */
		{ selector: '.compare .cols article', label: 'one column per concept', expectPresent: 3, expectVisible: 3 },
		{ selector: '.compare dl', label: 'the comparative physics, the same three as before the prediction', expectPresent: 3, expectVisible: 3 },
		{ selector: '.compare .cols li', label: 'four rule rows per concept', expectPresent: 12, expectVisible: 12 },
		{ selector: '.compare .thumb', label: 'a profile thumbnail per column', expectPresent: 3, expectVisible: 3 },
		{ selector: '.compare .said', label: 'the prediction, shown back with its date', expectPresent: 1, expectVisible: 1 },
		/* IT DOES NOT ASK AGAIN. The picker and the say-why field are gone, which
		   is what stops a second answer overwriting the recorded one. */
		{ selector: '.compare select', label: 'the concept picker, not asked again', expectPresent: 0 },
		{ selector: '.compare input', label: 'the say-why field, not asked again', expectPresent: 0 },
		{ selector: '.compare .note', label: 'the not-ready sentence, spent', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '.compare',
			label: 'the physics is on screen with its units, and the prediction is quoted back',
			must: ['g·cm²', 'cm', 'Prediction:', 'recorded 2026-09-12'],
			/* The question is spent: a sheet still asking it beside the answer is
			   the form and its answer rendering at once. */
			mustNot: ['Which of your concepts spins longest', 'Record prediction']
		}
	],
	contrast: [
		{ selector: '.compare h3', label: 'the compare heading on the sheet ground', min: 4.5 },
		{ selector: '.compare .cols h4', label: 'a concept name on the column ground', min: 4.5 },
		{ selector: '.compare .cols dd', label: 'a physics value on the column ground', min: 4.5, all: true },
		{ selector: '.compare .cols dt', label: 'a physics label on the column ground', min: 4.5, all: true },
		{ selector: '.compare .said', label: 'the prediction quoted back', min: 4.5 }
	],
	tapTargets: [{ selector: '.compare button', label: 'a compare-sheet control' }]
};
