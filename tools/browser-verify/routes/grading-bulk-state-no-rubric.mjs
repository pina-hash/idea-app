export default {
	path: '/dev/grading-bulk?state=no-rubric',
	label: 'Grading console: score out of N typed, with no rubric, and the Perfect Score switches (0242)',
	/*
		AN ASSIGNMENT WITH NO RUBRIC IS GRADED BY TYPING THE SCORE (0242). Before
		it the console refused to grade such an item at all; now the score card
		is there with one field, "Score out of 20", and the warn card above the
		roster says how to grade rather than to go away.

		THE COINS PANEL IS IN THE PAGE HEADER BESIDE EXPORT (decision 43: tools
		live in the header, never above the names). Two classes, two independent
		switches, each saying its state in a word as well as the lit key, and the
		class with coins off says so.

		`grading-bulk-state-pre-0242.mjs` is the negative control: the same
		console with neither capability, where every one of these is absent.

		THE CLICKS RETRY AGAINST THEIR OWN EFFECT, inside one evaluate, because
		paint is not interactivity (CLAUDE.md) and `_shot.mjs` runs only
		`waitFor` and `evaluate` steps.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-row").length === 7' },
		{
			evaluate: `async () => {
				const wait = (ms) => new Promise((r) => setTimeout(r, ms));
				for (let i = 0; i < 40 && !document.querySelector('[data-testid="direct-score-input"]'); i++) {
					document.querySelector('.roster-row')?.click();
					await wait(250);
				}
				const coins = document.querySelector('[data-testid="perfect-score-disclosure"]');
				for (let i = 0; i < 40 && coins && coins.getAttribute('aria-expanded') !== 'true'; i++) {
					coins.click();
					await wait(250);
				}
			}`
		},
		{ waitFor: '() => !!document.querySelector(\'[data-testid="direct-score-input"]\')' },
		{
			waitFor:
				'() => document.querySelector(\'[data-testid="perfect-score-disclosure"]\')?.getAttribute("aria-expanded") === "true"'
		}
	],
	presence: [
		{ selector: '[data-testid="direct-score-input"]', label: 'the score-out-of field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="no-rubric-direct"]', label: 'the no-rubric sentence that says how to grade', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grade-return"]', label: 'Return to student, now reachable without a rubric', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="perfect-score-toggle"]', label: 'one Perfect Score switch per class', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="perfect-score-economy-off"]', label: 'the class with coins off says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="select-unavailable"]', label: 'the old "no rubric, no batch" sentence', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="direct-score"]', label: 'the field names its total', must: ['Score out of 20', 'no rubric'] },
		{ selector: '[data-testid="perfect-score-note"]', label: 'the switch explains itself with the real figure', must: ['1i¢', 'extra credit not counted'] },
		{ selector: '[data-testid="perfect-score-panel"]', label: 'each switch says its state in words', must: ['Perfect Score award: On', 'Perfect Score award: Off'] }
	],
	contrast: [
		{ selector: '[data-testid="direct-score-note"]', label: 'the field note', min: 4.5 },
		{ selector: '[data-testid="perfect-score-note"]', label: 'the Perfect Score explanation', min: 4.5 },
		{ selector: '[data-testid="perfect-score-economy-off"]', label: 'the coins-off note', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="direct-score-input"]', label: 'the score field', min: 44 },
		{ selector: '[data-testid="perfect-score-toggle"]', label: 'each Perfect Score switch', min: 44 }
	]
};
