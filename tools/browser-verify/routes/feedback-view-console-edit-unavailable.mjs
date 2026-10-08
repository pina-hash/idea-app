/**
 * THE SAME CONSOLE ON A DEPLOYMENT BEFORE 0233: the page hands the console no
 * edit transport, and absence is the mechanism, so there is no Edit key on any
 * report -- against the count `feedback-view-console-edit-drive` measures with one.
 * The status keys are the positive control that the rows are there.
 */
export default {
	path: '/dev/feedback?view=console&edit=unavailable',
	label: 'Feedback console with no edit transport (before 0233): no Edit key anywhere',
	presence: [
		{ selector: 'button.fb-edit', label: 'an Edit key', expectPresent: 0 },
		{ selector: 'article.fb-row', label: 'the reports themselves (the positive control)', expectPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="fbc-edited-chip"]', label: 'an earlier edit still reads as one', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [{ selector: '.fb-actions .btn', label: "each report's own status buttons", min: 44 }]
};
