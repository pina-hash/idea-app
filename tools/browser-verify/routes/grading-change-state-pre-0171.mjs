export default {
	path: '/dev/grading-change?state=pre-0171',
	label: 'Grading console: a deployment sitting before 0171 withholds the extra-credit control and says why',
	aliasOf: '/dev/grading-change',
	/*
		THE DEGRADED RUNG, WHICH IS A REAL DEPLOYMENT STATE. Migrations here are
		pasted into the SQL editor by hand, so a build that ships before 0171 is
		applied is not hypothetical -- and on it the submissions payload comes back
		without `extra_credit`, `extraCreditReady` is false, and the 7-argument RPC
		does not exist.

		WHAT MUST HAPPEN THEN IS NOT NOTHING. The console turns off exactly the one
		control that cannot work and SAYS SO. Blanking the grading form would be
		the failure; so would leaving the control up to send an award into an arity
		with no parameter for it.

		THE POSITIVE CONTROL IS `?state=selected`, same fixture, same selectors,
		with the flag on: the input is present there and absent here, and the
		sentence is the other way round. Neither measurement means anything alone.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 5' },
		{
			/* The harness's own switch, which is the payload flag rather than a
			   second route: `force`, because it is an input inside a label. */
			click: '.switch input',
			force: true,
			until: '() => document.querySelector(".switch input").checked === false'
		},
		{
			click: '.roster-list li:nth-child(2) .roster-row',
			until: '() => !!document.querySelector("[data-testid=\'extra-credit-unavailable\']")'
		}
	],
	presence: [
		{ selector: '[data-testid="extra-credit-unavailable"]', label: 'the withheld-control sentence', expectPresent: 1, expectVisible: 1 },
		{ selector: '#grade-extra-credit', label: 'the extra-credit input (must be gone)', expectPresent: 0 },
		/* THE REST OF THE FORM IS UNTOUCHED. Turning off one control must not
		   blank the surface: the criteria, the total and both actions stay. */
		{ selector: '.score-total', label: 'the running total', expectPresent: 1, expectVisible: 1 },
		{ selector: '#grade-comment', label: 'the comment to the student', expectPresent: 1, expectVisible: 1 },
		/* And the OTHER half of this bundle is unaffected by the missing column:
		   the change signal needs no migration at all. */
		{ selector: '[data-testid="changed-after-grading"]', label: 'the post-grade sentence, which needs no migration', expectPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="extra-credit-unavailable"]', label: 'the withheld-control sentence', min: 4.5 }
	],
	textContains: [
		{
			selector: '[data-testid="extra-credit-unavailable"]',
			label: 'it says the capability is missing rather than showing nothing',
			must: ['not available on this deployment']
		}
	],
	orderResult: [
		{
			/* THE TOTAL FALLS BACK TO THE RUBRIC SUM WITH NO ITEMISATION, because
			   there is no award to itemise. A total that still printed "(15 rubric
			   + 0 extra credit)" here would be claiming a capability the payload
			   just said it does not have. */
			evaluate: `() => [document.querySelector('.score-total')?.textContent.replace(/\\s+/g, ' ').trim()]`,
			expected: ['Total: 15 / 20 pts'],
			label: 'the total is the rubric sum, with nothing claiming an award'
		}
	]
};
