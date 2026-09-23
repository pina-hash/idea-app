/**
 * THE SPINNER WEAPON ADD-ON'S READOUT, WITH THE WEAPON'S BORE SELECTED.
 * Ledger 0296.
 *
 * A different STATE of `/dev/ideacad-analysis`, reached by its query: the add-on is on
 * and the disk's bore face is selected, so the inertia's axis is that bore and
 * its bodies are the disk alone (selection implies both). The spinner section
 * shows four typed fields (never a number type, never a bound) and the energy,
 * tip speed, bite and motor kV they give against the disk's own inertia; the
 * bite reproduces Ask Aaron's worked example (88 in/s, 2 teeth, 5,300 RPM,
 * about 0.5 in). The positive control for its absence is the cited spec.
 */
export default {
	path: '/dev/ideacad-analysis?state=spinner',
	label: 'IdeaCAD analysis: the spinner weapon readout, fed by the selected disk',
	prepare: [{ waitFor: '() => document.querySelector("main")?.dataset.ready === "true" && !!document.querySelector(\'[data-testid="ideacad-analysis-spinner"]\')', waitMs: 300 }],
	presence: [
		{ selector: '[data-testid="ideacad-analysis-spinner"]', label: 'the spinner section', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="ideacad-analysis-spinner"] input[inputmode="decimal"]', label: 'four typed fields', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="ideacad-analysis-panel"] input[type="number"], [data-testid="ideacad-analysis-panel"] input[min], [data-testid="ideacad-analysis-panel"] input[max]', label: 'no number-typed or bounded field', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-analysis-subject"]', label: 'the bodies choice a selection offers', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-analysis-axis"]', label: 'the bore is the axis', must: ['Weapon disk round face'] },
		{ selector: '[data-testid="ideacad-analysis-spinner"]', label: 'energy, tip speed, bite and kV for the disk', must: ['Weapon disk', ' J', 'mph', '0.498 in', '477 kV'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-analysis-spinner"] dd', label: 'a spinner readout', min: 4.5 },
		{ selector: '[data-testid="ideacad-analysis-spinner"] label', label: 'a spinner field label', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-analysis-panel"] button, [data-testid="ideacad-analysis-panel"] select, [data-testid="ideacad-analysis-panel"] input', label: 'every control in the analysis panel', min: 44 }],
	/* A control inside a CLOSED disclosure has a `display: none` ancestor and no box, which is the disclosure working; the default selector judges only the element's own display, so the closed bodies are left out here and measured open by `ideacad-analysis-state-spinner-view-open`. */
	layoutSanity: [{ root: '.panels', label: 'the panel column with the spinner readout', reserved: null, interactive: 'button:not(.disc-body[data-open="false"] *), select, input, a[href]:not(.disc-body[data-open="false"] *)' }],
	ignoreConsole: []
};
