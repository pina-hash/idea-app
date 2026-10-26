// Ledger 0439: one class's calendar: the other class's due date is not on it.
export default {
	path: '/dev/calendar?view=list&scope=1',
	label: "IDEA calendar narrowed to one class: the other class's work absent",
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="calendar-list"]')`, timeoutMs: 20000 }],
	presence: [{ selector: '.cal-classes', label: 'no class switches on a class calendar', expectPresent: 0 }],
	textContains: [{ selector: '[data-testid="calendar-list"]', label: "this class's and everyone's, never the other class's", must: ['Launcher plan', 'Quarter Break'], mustNot: ['Blade CAD 02'] }]
};
