/**
 * The prediction gate OPEN, which is the half nobody had ever measured.
 *
 * `ideacad-role-student-state-compare.mjs` measures the sheet with the gate
 * SHUT and the physics absent. That absence is only worth anything beside a
 * state where the identical selector is PRESENT -- otherwise "no `.compare dl`"
 * is satisfied by a sheet that never renders one under any circumstances, which
 * is exactly how an exclusion assertion passes on a surface that is broken.
 * This file is that positive control, and it is a real one: the physics is on
 * screen, one block per concept, with the numbers 0160 measured leaking.
 *
 * THE STATE COMES FROM A PREDICTION ALREADY RECORDED, not from pressing Reveal
 * here, and that is the second thing it measures. A student who predicted last
 * week and comes back must not be asked again -- the gate would then overwrite
 * the answer it is teaching them by. `BladeEditor` takes a `prediction` prop and
 * seeds `revealed` from it; this route hands one in.
 *
 * WHAT IS LOCKED IS THE COMPARATIVE PHYSICS ONLY, which is decision 26's own
 * default: diameter, full height, hex extension and mass stay visible in both
 * states, because a student needs them to build a legal concept at all. So the
 * rule rows are asserted PRESENT here and present there, and only the `<dl>`
 * moves.
 */
export default {
	path: '/dev/ideacad?role=student&state=revealed',
	label: 'IdeaCAD: the compare sheet with the prediction gate open',
	prepare: [{ waitFor: '() => !!document.querySelector(".compare dl")' }],
	presence: [
		{ selector: '.compare', label: 'the compare sheet, open', expectPresent: 1, expectVisible: 1 },
		/* One column per concept, and one physics block in each. The COUNT is the
		   claim: a sheet that revealed the active concept's numbers alone would
		   answer "which of your concepts spins longest" with one answer. */
		{ selector: '.compare .cols article', label: 'one column per concept', expectPresent: 3, expectVisible: 3 },
		{ selector: '.compare dl', label: 'the comparative physics, revealed', expectPresent: 3, expectVisible: 3 },
		{ selector: '.compare .cols li', label: 'four rule rows per concept', expectPresent: 12, expectVisible: 12 },
		{ selector: '.compare .thumb', label: 'a profile thumbnail per column', expectPresent: 3, expectVisible: 3 },
		{ selector: '.compare .said', label: 'the prediction, shown back with its date', expectPresent: 1, expectVisible: 1 },
		/* THE GATE DOES NOT ASK AGAIN. The picker and the say-why field are gone,
		   which is what stops a second answer overwriting the recorded one. */
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
			   the gate rendering both states at once. */
			mustNot: ['Which of your concepts spins longest']
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
