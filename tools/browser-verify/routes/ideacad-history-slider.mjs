/**
 * THE HISTORY SLIDER HARNESS, `/dev/ideacad-history-slider`. Ledger 0296.
 *
 * The REAL `HistorySlider` along the bottom of a workspace-shaped frame, over
 * the motor bracket's fourteen build steps. The prepare steps press Start, then
 * Play at 2x, and wait until the time-lapse has advanced on its own: a Play
 * whose timer is never armed renders a perfectly good button, so the proof is
 * the step moving with no further press. It is then paused, and the controls
 * are measured in that state.
 *
 * Every control carries a word as well as a glyph, and every one clears 44px
 * at every width; at 375 the bar wraps to two rows rather than running off the
 * side.
 */
export default {
	path: '/dev/ideacad-history-slider',
	label: 'IdeaCAD: the history slider, played and paused',
	prepare: [
		{ waitFor: '() => !!window.ideaCadHistory && !!document.querySelector(\'[data-testid="ideacad-history-slider"] [data-control="play"]\')', timeoutMs: 30000 },
		{ click: '[data-testid="ideacad-history-slider"] [data-control="start"]', until: '() => window.ideaCadHistory.step === 0', attempts: 10, gapMs: 200 },
		{ evaluate: '() => { const s = document.querySelector(\'[data-testid="ideacad-history-slider"] .speed select\'); s.value = "2"; s.dispatchEvent(new Event("change", { bubbles: true })); return s.value; }' },
		{ click: '[data-testid="ideacad-history-slider"] [data-control="play"]', until: '() => document.querySelector(\'[data-control="play"]\').getAttribute("aria-pressed") === "true"', attempts: 10, gapMs: 100 },
		/* The clock, with nothing pressed: at 2x a step every 300 ms. */
		{ waitFor: '() => window.ideaCadHistory.step >= 3', timeoutMs: 5000 },
		{ click: '[data-testid="ideacad-history-slider"] [data-control="play"]', until: '() => document.querySelector(\'[data-control="play"]\').getAttribute("aria-pressed") === "false"', attempts: 10, gapMs: 100, waitMs: 400 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-history-slider"]', label: 'the history slider', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-history-slider"] .controls button', label: 'Start, Back, Play, Next and Stop (5)', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="ideacad-history-slider"] input[type="range"]', label: 'the scrubber', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-history-slider"] .speed select', label: 'the speed', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="history-stage"] li.built', label: 'features built at the paused step (3 or more, of 14)', expectPresent: 3 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-history-slider"]', label: 'every control says what it does in a word', must: ['Start', 'Back', 'Play', 'Next', 'Stop', 'Speed', '/ 14'], mustNot: ['Pause'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-history-slider"] .ctl span', label: 'a control word', min: 4.5 },
		{ selector: '[data-testid="ideacad-history-slider"] .count', label: 'the step count', min: 4.5 },
		{ selector: '[data-testid="ideacad-history-slider"] .name', label: 'the feature the step added', min: 4.5 },
		{ selector: '[data-testid="ideacad-history-slider"] .speed-word', label: 'the speed label', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-history-slider"] button, [data-testid="ideacad-history-slider"] select, [data-testid="ideacad-history-slider"] input', label: 'every slider control', min: 44 }
	],
	layoutSanity: [{ root: '[data-testid="ideacad-history-slider"]', label: 'the history slider', reserved: null }],
	ignoreConsole: []
};
