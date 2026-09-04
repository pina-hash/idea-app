export default {
	path: '/dev/grading-bulk?leak=1',
	label: 'Grading at scale: the cross-section clause OPEN, which is the positive control',
	/*
		THE CONTROL, AND WHY IT IS A ROUTE RATHER THAN A COMMENT.

		The base spec asserts that Period 4 -- a class the caller does not teach --
		is not on the surface. An absence row cannot tell "the rule holds" from
		"the selector was renamed", so it is worth exactly nothing without a
		configuration in which the thing DOES appear. `?leak=1` skips
		`managedPostedSections`, which is the one implementation of that clause and
		is called by the real transport, the real page load and this harness alike.

		WHAT IT PROVES ABOUT PRODUCTION. The postings policy (0109) admits a
		section the caller can merely READ, so postings alone genuinely would list
		somebody else's class here: every grade in it would be refused by
		`classroom_can_review_submission`, but the class and its students would be
		NAMED. That is a disclosure wearing the clothes of a permissions error, and
		this is the row that would go red if the intersection were ever dropped.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 9' }
	],
	presence: [
		{ selector: '[data-testid="roster-group"]', label: 'three classes with the clause open', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="roster-section"]', label: 'nine rows, two of them somebody else\'s', expectPresent: 9, maxPresent: 9 }
	],
	textContains: [
		{
			selector: '.roster-list',
			label: 'the unmanaged class\'s students are reachable with the clause open',
			must: ['Hana Kowalski', 'Idris Bello']
		}
	],
	orderResult: [
		{
			/* NAMED, not just counted: the base spec's row says "no Period 4", and
			   this says "Period 4, with these two people in it". The pair is the
			   whole proof. */
			evaluate: `() => {
				const names = [...document.querySelectorAll('[data-testid="roster-group"] .roster-group-name')].map((e) => e.textContent.trim());
				return [names.some((n) => n.includes('Period 4')), names.length];
			}`,
			expected: [true, 3],
			label: 'Period 4 appears exactly when the clause is open'
		}
	]
};
