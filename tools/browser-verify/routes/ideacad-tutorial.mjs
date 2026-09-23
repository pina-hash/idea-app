/**
 * THE LEARNING HARNESS, `/dev/ideacad-tutorial`. Ledger 0296.
 *
 * The REAL `Tutorial` panel beside the REAL palette `ToolButton`s. The prepare
 * steps press Start, then arm Rectangle from the palette, which is exactly the
 * first step's own ask: the proof that a step moves on is the second step's
 * line on screen with nothing pressed in the panel. Measured in that state: the
 * ring sits on the real Rectangle button (the control the step names), and the
 * tool's first-use hint shows beside it because the rectangle has not been
 * drawn yet.
 *
 * Every tutorial control carries a word and clears 44px at every width; the
 * step is one line.
 */
export default {
	path: '/dev/ideacad-tutorial',
	label: 'IdeaCAD: the tutorial on its second step, ringing Rectangle',
	prepare: [
		{ waitFor: '() => !!window.ideaCadTutorial && !!document.querySelector(\'[data-testid="ideacad-tutorial-start"]\')', timeoutMs: 30000 },
		{ click: '[data-testid="ideacad-tutorial-start"]', until: '() => window.ideaCadTutorial.prefs.hints.tutorial.step === "draw-tool"', attempts: 10, gapMs: 200 },
		{ click: '[data-command="rectangle"]', until: '() => window.ideaCadTutorial.prefs.hints.tutorial.step === "draw-drag"', attempts: 10, gapMs: 200 },
		{ waitFor: '() => !!document.querySelector(\'[data-testid="ideacad-tutorial-ring"]\')', timeoutMs: 5000 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-tutorial"]', label: 'the tutorial panel', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-tutorial"] .task-row', label: 'the five tasks', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="ideacad-tutorial-ring"]', label: 'the ring on the named control', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-tool-hint"]:not([hidden])', label: 'the first-use hint beside Rectangle', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-tutorial-run"]', label: 'no Run button while the control is on screen', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-tutorial-step"]', label: 'the second step, reached by doing the first', must: ['Drag corner to corner'] },
		{ selector: '[data-testid="ideacad-tutorial-count"]', label: 'tasks done', must: ['0 of 5'] },
		{ selector: '[data-testid="ideacad-tool-hint"]:not([hidden])', label: 'the hint says the gesture', must: ['Drag corner to corner'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-tutorial-step"]', label: 'the step line', min: 4.5 },
		{ selector: '[data-testid="ideacad-tutorial"] .task-row .title', label: 'a task title', min: 4.5 },
		{ selector: '[data-testid="ideacad-tool-hint"]:not([hidden])', label: 'the first-use hint', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-tutorial"] button', label: 'every tutorial control', min: 44 },
		{ selector: '.tools button', label: 'every palette tool', min: 44 }
	],
	layoutSanity: [{ root: '[data-testid="ideacad-tutorial"]', label: 'the tutorial panel', reserved: null }],
	ignoreConsole: []
};
