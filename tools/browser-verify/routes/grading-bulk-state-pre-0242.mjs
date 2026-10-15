export default {
	path: '/dev/grading-bulk?state=pre-0242',
	label: 'Grading console before 0242: no typed score and no Coins panel, asserted as absence',
	/*
		THE NEGATIVE CONTROL FOR `grading-bulk-state-no-rubric.mjs`. The transports carry
		neither `gradeDirect` nor the Perfect Score pair and the payload comes back
		without `direct_score`, which is a deployment before 0242. Absence is the
		mechanism: none of that markup exists. The rubric, the Return key and the
		Export panel are the positive controls that the page did render.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-row").length === 7' },
		{
			evaluate: `async () => {
				const wait = (ms) => new Promise((r) => setTimeout(r, ms));
				for (let i = 0; i < 40 && !document.querySelector('[data-testid="grade-return"]'); i++) {
					document.querySelector('.roster-row')?.click();
					await wait(250);
				}
			}`
		},
		{ waitFor: '() => !!document.querySelector(\'[data-testid="grade-return"]\')' }
	],
	presence: [
		{ selector: '[data-testid="direct-score-input"]', label: 'the score-out-of field', expectPresent: 0 },
		{ selector: '[data-testid="perfect-score-disclosure"]', label: 'the Coins panel', expectPresent: 0 },
		{ selector: '[data-testid="perfect-score-toggle"]', label: 'any Perfect Score switch', expectPresent: 0 },
		{ selector: '[data-testid="grade-return"]', label: 'Return to student (positive control)', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="work-export-disclosure"]', label: 'the Export panel (positive control)', expectPresent: 1, expectVisible: 1 },
		{ selector: '.score-row', label: 'the rubric criteria (positive control)', expectPresent: 2, expectVisible: 2 }
	]
};
