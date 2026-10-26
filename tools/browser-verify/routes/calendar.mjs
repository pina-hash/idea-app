// Ledger 0439: the calendar with no view chosen: a phone opens on the list, a desktop on the month.
export default {
	path: '/dev/calendar',
	label: 'IDEA calendar with no view chosen: the list under 720px, the month above',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="calendar-list"], [data-testid="calendar-month"]')`, timeoutMs: 20000 }],
	orderResult: [
		{
			label: 'the view follows the width',
			evaluate: `() => [innerWidth < 720 ? !!document.querySelector('[data-testid="calendar-list"]') : !!document.querySelector('[data-testid="calendar-month"]')]`,
			expected: [true]
		}
	],
	presence: [{ selector: '[data-testid="calendar"]', label: 'the calendar', expectPresent: 1, maxPresent: 1, expectVisible: 1 }]
};
