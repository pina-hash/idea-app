/**
 * THE ANALYSIS PANEL ON THE EVERYDAY ROBOT, WHERE THE DENSITY RULE BITES.
 * Ledger 0296.
 *
 * A different STATE of `/dev/ideacad-analysis`, reached by its query: the wheels are
 * printed with a measured mass and the motor has no material. The total mass,
 * the CG and the inertia all read Unknown -- never a guess -- and the bodies
 * that block them are named with the reason each does, with ONE Material
 * control per blocking body as the way forward (the inertia's list names the
 * same bodies without repeating the controls). No tip angle is offered without
 * a CG. The positive control is the cited spec, where the same selectors find
 * numbers and no blockers.
 */
export default {
	path: '/dev/ideacad-analysis?state=printed',
	label: 'IdeaCAD analysis: Unknown with its blocking bodies, on a robot with printed wheels',
	prepare: [{ waitFor: '() => document.querySelector("main")?.dataset.ready === "true" && !!document.querySelector(\'[data-testid="ideacad-analysis-cg-blockers"]\')', waitMs: 300 }],
	presence: [
		{ selector: '[data-testid="ideacad-analysis-cg-blockers"] li', label: 'the three bodies that block the CG', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="ideacad-analysis-material"]', label: 'one Material control per blocking body', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="ideacad-analysis-inertia-blockers"] li', label: 'the same three named under the inertia', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="ideacad-analysis-inertia-blockers"] select', label: 'no repeated Material controls under the inertia', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-analysis-tip"]', label: 'no tip angle without a CG', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-analysis-panel"] p:not(.meta)', label: 'no sentence of instructions in the panel', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-analysis-total"]', label: 'the total is Unknown', must: ['Unknown'] },
		{ selector: '[data-testid="ideacad-analysis-cg-blockers"]', label: 'each blocker with its reason', must: ['Left wheel', 'Right wheel', 'Weapon motor', 'Measured mass only', 'No material'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-analysis-cg-blockers"] .who', label: 'a blocking body name', min: 4.5 },
		{ selector: '[data-testid="ideacad-analysis-cg-blockers"] .an-why', label: 'a blocker reason', min: 4.5 },
		{ selector: '[data-testid="ideacad-analysis-cg"]', label: 'the Unknown readout', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-analysis-panel"] button, [data-testid="ideacad-analysis-panel"] select, [data-testid="ideacad-analysis-panel"] input', label: 'every control in the analysis panel', min: 44 }],
	/* A control inside a CLOSED disclosure has a `display: none` ancestor and no box, which is the disclosure working; the default selector judges only the element's own display, so the closed bodies are left out here and measured open by `ideacad-analysis-state-spinner-view-open`. */
	layoutSanity: [{ root: '.panels', label: 'the panel column with the blocker lists open', reserved: null, interactive: 'button:not(.disc-body[data-open="false"] *), select, input, a[href]:not(.disc-body[data-open="false"] *)' }],
	ignoreConsole: []
};
