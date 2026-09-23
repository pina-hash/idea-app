/**
 * THE ANALYSIS PANEL IN A WORKSPACE WHOSE WORKER HAS NO INTERFERENCE REQUEST.
 * Ledger 0296.
 *
 * A different STATE of `/dev/ideacad-analysis`, reached by its query: the fake worker
 * answers "Unknown geometry operation." exactly as the real one does for a
 * request it has no case for. The interference section is ABSENT, not an
 * error and not an empty list -- an absent transport removes its control --
 * while mass, balance and inertia render as ever (the positive control).
 */
export default {
	path: '/dev/ideacad-analysis?interference=off',
	label: 'IdeaCAD analysis: no interference section when the worker has no such request',
	prepare: [{ waitFor: '() => document.querySelector("main")?.dataset.ready === "true" && (window.ideaCadAnalysis?.requests ?? []).includes("interference")', waitMs: 400 }],
	presence: [
		{ selector: '[data-testid="ideacad-analysis-interference"]', label: 'the interference section, absent', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-analysis-mass"]', label: 'the mass section, present', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-analysis-inertia"]', label: 'the inertia section, present', expectPresent: 1, maxPresent: 1 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-analysis-panel"] button, [data-testid="ideacad-analysis-panel"] select', label: 'every control in the analysis panel', min: 44 }],
	/* A control inside a CLOSED disclosure has a `display: none` ancestor and no box, which is the disclosure working; the default selector judges only the element's own display, so the closed bodies are left out here and measured open by `ideacad-analysis-state-spinner-view-open`. */
	layoutSanity: [{ root: '.panels', label: 'the panel column without the interference section', reserved: null, interactive: 'button:not(.disc-body[data-open="false"] *), select, input, a[href]:not(.disc-body[data-open="false"] *)' }],
	ignoreConsole: []
};
