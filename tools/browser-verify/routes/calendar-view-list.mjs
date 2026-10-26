// Ledger 0439: the calendar as a list of days, the view a phone opens on.
export default {
	path: '/dev/calendar?view=list',
	label: 'IDEA calendar: the list of days',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="calendar-list"]')`, timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="calendar-list"]', label: 'the list', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="calendar-month"]', label: 'no month grid in list view', expectPresent: 0 },
		{ selector: '.list-day.today', label: 'today in the list', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="calendar-list"]', label: 'class, team, program, robotics and school events', must: ['Launcher plan', 'Frame sketch', 'IDEA open lab night', 'Build session', 'Beach Blitz', 'Quarter Break'], mustNot: ['@boscotech'] }
	],
	contrast: [{ selector: '.list-date', label: 'a day heading', min: 4.5 }]
};
