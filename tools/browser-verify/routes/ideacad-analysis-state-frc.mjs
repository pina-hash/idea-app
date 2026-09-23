/**
 * THE FRC CHECKS ADD-ON, WITH A WHEEL'S ROUND FACE SELECTED. Ledger 0296.
 *
 * A different STATE of `/dev/ideacad-analysis`, reached by its query: the
 * FRC checks add-on on and the left wheel's round face selected, so the axis
 * is the wheel's own and the wheel diameter comes off the face (1.5 in). The
 * section is marked Estimate, reads the holding torque about the chosen axis
 * (zero here: a wheel's CG sits on its own axis), and waits on two typed
 * fields for the free speed, which reads Unknown until a motor speed is typed
 * -- never a guessed motor. The positive control for its absence is the cited
 * spec.
 */
export default {
	path: '/dev/ideacad-analysis?state=frc',
	label: 'IdeaCAD analysis: FRC checks from a selected wheel',
	prepare: [{ waitFor: '() => document.querySelector("main")?.dataset.ready === "true" && !!document.querySelector(\'[data-testid="ideacad-analysis-frc"]\')', waitMs: 300 }],
	presence: [
		{ selector: '[data-testid="ideacad-analysis-frc"]', label: 'the FRC checks section', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="ideacad-analysis-frc"] input[inputmode="decimal"]', label: 'two typed fields, motor speed and reduction', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="ideacad-analysis-panel"] input[type="number"], [data-testid="ideacad-analysis-panel"] input[min], [data-testid="ideacad-analysis-panel"] input[max]', label: 'no number-typed or bounded field', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-analysis-frc"]', label: 'estimate, the wheel off its face, and no guessed motor', must: ['Estimate', '1.500 in', 'N·m', 'Unknown'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-analysis-frc"] dd', label: 'an FRC readout', min: 4.5 },
		{ selector: '[data-testid="ideacad-analysis-frc"] label', label: 'an FRC field label', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-analysis-panel"] button, [data-testid="ideacad-analysis-panel"] select, [data-testid="ideacad-analysis-panel"] input', label: 'every control in the analysis panel', min: 44 }],
	/* A control inside a CLOSED disclosure has a `display: none` ancestor and no box, which is the disclosure working; see `ideacad-analysis.mjs`. */
	layoutSanity: [{ root: '.panels', label: 'the panel column with the FRC checks', reserved: null, interactive: 'button:not(.disc-body[data-open="false"] *), select, input, a[href]:not(.disc-body[data-open="false"] *)' }],
	ignoreConsole: []
};
