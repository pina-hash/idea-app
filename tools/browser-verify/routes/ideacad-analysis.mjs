/**
 * THE ANALYSIS PANEL ON A FULLY CITED MODEL. Ledger 0296.
 *
 * `/dev/ideacad-analysis` mounts the REAL `AnalysisPanel` over a fake
 * workspace holding a small combat robot whose every body has a cited
 * density, in the workspace's own 260px panel column. What must be there: a
 * total mass in grams and pounds, a per-part table heaviest first, a CG with
 * its height and the angle it tips at first and toward which side, an inertia
 * about the default axis in both lb·in² and kg·m², a Formulas disclosure per
 * section, and the interference list the engine's request answered (one
 * overlap, three touching pairs, the nearest gaps, the rest behind a
 * disclosure). What must NOT be: a blocker list or a Material control (every
 * body is cited, the positive control being the printed state's spec), and any
 * sentence of instructions -- the panel's only paragraph is its interference
 * count line. Every control clears 44px and nothing in the column is covered.
 */
export default {
	path: '/dev/ideacad-analysis',
	label: 'IdeaCAD analysis: mass, balance, inertia and interference on a cited robot',
	prepare: [{ waitFor: '() => document.querySelector("main")?.dataset.ready === "true" && !!document.querySelector(\'[data-testid="ideacad-analysis-pairs"]\')', waitMs: 300 }],
	presence: [
		{ selector: '[data-testid="ideacad-analysis-panel"]', label: 'the analysis panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-analysis-mass"] tbody tr', label: 'one mass row per body', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="ideacad-analysis-cg"]', label: 'the CG readout', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-analysis-tip"]', label: 'the tip-over readout', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-analysis-inertia-si"]', label: 'the inertia in SI beside lb·in²', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid$="-formulas"]', label: 'a Formulas disclosure per section', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="ideacad-analysis-pairs"] button[data-kind="interference"]', label: 'the one overlap', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="ideacad-analysis-pairs"] button[data-kind="touching"]', label: 'the three touching pairs', expectPresent: 3, maxPresent: 3 },
		/* Every body is cited: nothing blocks, and no control to fix what is not broken. */
		{ selector: '[data-testid$="-blockers"]', label: 'no blocker list on a cited model', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-analysis-material"]', label: 'no Material control on a cited model', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-analysis-spinner"]', label: 'no spinner section while its add-on is off', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-analysis-panel"] p:not(.meta)', label: 'no sentence of instructions in the panel', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-analysis-total"]', label: 'the total in grams and pounds', must: ['818 g', '1.80 lb'] },
		{ selector: '[data-testid="ideacad-analysis-tip"]', label: 'the tip angle toward the skid', must: ['°', 'toward +X'] },
		{ selector: '[data-testid="ideacad-analysis-inertia"]', label: 'the inertia in both units', must: ['lb·in²', 'kg·m²', 'Z through CG'] },
		{ selector: '[data-testid="ideacad-analysis-interference"]', label: 'the overlap named with its volume', must: ['1 overlap', 'Weapon disk', 'Weapon motor', 'in³', 'Touching'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-analysis-panel"] dd', label: 'a readout value', min: 4.5 },
		{ selector: '[data-testid="ideacad-analysis-panel"] dt', label: 'a readout label', min: 4.5 },
		{ selector: '[data-testid="ideacad-analysis-mass"] tbody th', label: 'a body name in the mass table', min: 4.5 },
		{ selector: '[data-testid="ideacad-analysis-pairs"] .names', label: 'a pair of body names', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-analysis-panel"] button, [data-testid="ideacad-analysis-panel"] select, [data-testid="ideacad-analysis-panel"] input', label: 'every control in the analysis panel', min: 44 }],
	/* A control inside a CLOSED disclosure has a `display: none` ancestor and no box, which is the disclosure working; the default selector judges only the element's own display, so the closed bodies are left out here and measured open by `ideacad-analysis-state-spinner-view-open`. */
	layoutSanity: [{ root: '.panels', label: 'the panel column with the analysis panel open', reserved: null, interactive: 'button:not(.disc-body[data-open="false"] *), select, input, a[href]:not(.disc-body[data-open="false"] *)' }],
	ignoreConsole: []
};
