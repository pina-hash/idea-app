export default {
	path: '/dev/tournaments?view=host&field=8&state=live&scores=1',
	label: 'Host console match control, score entry mode',
	/* The other result mode: two number inputs per game instead of two picks.
	   Measured 30.2px before this bundle. */
	settleMs: 700,
	presence: [
		{ selector: '[data-match-state="live"] input.score', label: 'two score inputs on the live match', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-match-state="live"] .pick', label: 'no winner picks in score mode', expectPresent: 0 }
	],
	tapTargets: [
		{ selector: '.hmc input.score', label: 'score inputs', min: 44 },
		{ selector: '.hmc .btn', label: 'Submit / Start controls', min: 44 }
	]
};
