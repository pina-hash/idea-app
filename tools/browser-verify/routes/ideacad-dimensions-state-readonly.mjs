/**
 * A READ-ONLY DOCUMENT'S NUMBERS: SHOWN, AND NOT CONTROLS. Ledger 0296 (F025).
 *
 * `/dev/ideacad-dimensions?state=readonly` (the harness reads its own query): the same box in
 * a document the viewer cannot write. The three numbers are drawn as plain
 * text (spans, dashed and gray) and there is no button and no box: absence of
 * the control is the mechanism, as it is on the Dimensions panel. The
 * positive control is the default state's three buttons on the same fixture.
 */
export default {
	path: '/dev/ideacad-dimensions?state=readonly',
	label: 'IdeaCAD: dimensions in a read-only document',
	prepare: [
		{ waitFor: '() => !!window.ideaCadDims && document.querySelectorAll(\'[data-dimension-label]\').length === 3', waitMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-dimension-overlay"] span[data-dimension-label]', label: 'width, height and depth, as text', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="ideacad-dimension-overlay"] button', label: 'no button over a read-only document', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-dimension-overlay"] input', label: 'no box over a read-only document', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-dimension-overlay"]', label: 'every number still shown', must: ['4.000 in', '3.000 in', '1.000 in'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-dimension-overlay"] span[data-dimension-label]', label: 'a read-only value', min: 4.5 }
	],
	ignoreConsole: []
};
