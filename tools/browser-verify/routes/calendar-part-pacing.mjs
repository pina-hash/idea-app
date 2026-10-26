// Ledger 0439: the day-by-day plan above a worksheet.
export default {
	path: '/dev/calendar?part=pacing',
	label: 'Pacing strip: the step for today, the behind count, the due date',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="pacing-strip"]')`, timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="pacing-strip"]', label: 'the plan', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="pacing-strip"] .pace-step', label: 'all five steps, in the disclosure', expectPresent: 5, maxPresent: 5 }
	],
	orderResult: [
		{ label: 'the full list starts closed; the step for today is the one line shown', evaluate: `() => [document.querySelector('.pace-all').open, document.querySelector('.pace-now').dataset.state]`, expected: [false, 'today'] }
	],
	textContains: [{ selector: '[data-testid="pacing-strip"]', label: 'state and due date', must: ['1 of 5 done', '1 behind', 'due Nov 2', 'Sketch each subsystem', 'Today'] }],
	contrast: [{ selector: '.pace-now', label: 'the current step', min: 4.5 }],
	tapTargets: [{ selector: '.pace-all summary', label: 'the steps disclosure' }]
};
