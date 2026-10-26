// Ledger 0439: the "this week" strip My Classes and every class page show.
export default {
	path: '/dev/calendar?part=strip',
	label: 'This week strip: the school week, three events a day, the calendar door',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="week-strip"]')`, timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="week-strip"]', label: 'the strip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="week-strip"] .wd', label: 'five school days', expectPresent: 5, maxPresent: 5 },
		{ selector: '[data-testid="week-strip"] .wd.today', label: 'today', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="week-strip"] .week-open', label: 'the door to the calendar', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="week-strip"]', label: 'this week', must: ['This week', 'Oct 28', 'Frame sketch'], mustNot: ['@', 'Monday', 'Friday'] }],
	tapTargets: [{ selector: '[data-testid="week-strip"] .week-open', label: 'the calendar door' }]
};
