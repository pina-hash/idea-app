// Ledger 0439: the IDEA calendar, a month, as a student in Unit 4 sees it.
import { READY } from './_calendar.mjs';
export default {
	path: '/dev/calendar?view=month',
	label: 'IDEA calendar: the month, every layer on, the chosen day beside it',
	prepare: [{ waitFor: `() => !!document.querySelector('.cal-cell')`, timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="calendar"]', label: 'the calendar', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="calendar-layers"] button', label: 'the seven layer keys', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="calendar-layers"] button[aria-pressed="true"]', label: 'every layer on by default', expectPresent: 7, maxPresent: 7 },
		{ selector: '.cal-cell', label: 'five weeks of October 2026', expectPresent: 35, maxPresent: 35 },
		{ selector: '.cal-cell.today', label: 'today marked once', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="calendar-day"] .ev', label: "today's nine events: three class and team, one robotics, five school", expectPresent: 9, maxPresent: 9 },
		{ selector: '[data-testid="calendar-event-form"]', label: 'no event form for a student', expectPresent: 0 },
		{ selector: READY, label: 'ready', expectPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="calendar-day"]', label: "today's day list", must: ['Oct 28', 'Sketch each subsystem', 'Frame sketch', 'Waiting for sign-off'], mustNot: ['@', 'Friday', 'Wednesday'] },
		{ selector: '[data-testid="calendar-month"]', label: 'the school calendar is in the month', must: ['Due'] }
	],
	contrast: [
		{ selector: '.cal-month', label: 'the month name', min: 4.5 },
		{ selector: '[data-testid="calendar-day"] .ev-title', label: 'an event title', min: 4.5 },
		{ selector: '[data-testid="calendar-day"] .ev-meta', label: 'an event line', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="calendar-layers"] button', label: 'a layer key' },
		{ selector: '.cal-nav .btn', label: 'a month key' },
		{ selector: '.cal-views .btn', label: 'a view key' }
	]
};
