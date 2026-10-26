// Ledger 0439: an admin's calendar: program events carry Edit and Remove, and Add opens the form.
export default {
	path: '/dev/calendar?admin=1&view=month',
	label: 'IDEA calendar as a site admin: add, edit and remove program events',
	prepare: [
		{ waitFor: `() => !!document.querySelector('.cal-cell')`, timeoutMs: 20000 },
		{ click: '.cal-cell[data-day="2026-10-29"]', until: `() => document.querySelector('.cal-cell[data-day="2026-10-29"]').getAttribute('aria-pressed') === 'true'`, attempts: 5, gapMs: 400 },
		{ click: '[data-testid="calendar-day"] > .btn', until: `() => !!document.querySelector('[data-testid="calendar-event-form"]')`, attempts: 5, gapMs: 400 }
	],
	presence: [
		{ selector: '[data-testid="calendar-event-form"]', label: 'the event form', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="calendar-day"] .ev-tools', label: 'Edit and Remove on the one program event that day', expectPresent: 1, maxPresent: 1 }
	],
	tapTargets: [{ selector: '[data-testid="calendar-event-form"] .btn', label: 'a form key' }]
};
