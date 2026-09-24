/**
 * A TEACHER'S SETTINGS, AFTER THE TOUR WAS TAKEN (ledger 0297, LEARN). Every
 * group says where it lives and has its own Reset, and the panel only offers a
 * setting something on the page reads: density, list width, what a class opens
 * on and the Grades order for a teacher, and never the student's to-do default.
 * The tour's state is a line, not a choice ("Taken"), and resetting it is how
 * somebody asks for the offer back -- which the page makes at once and records
 * as offered again.
 */
import { TOUR_READY, TOUR_TEACHER } from './_classroom-tour.mjs';
import { OPEN_SHELL_MENU } from './_shell-menu.mjs';

const BASE = `${TOUR_TEACHER}&tour=finished`;
const SETTINGS_OPEN = `() => !!document.querySelector('dialog[data-testid="classroom-settings"][open]')`;

export default {
	path: `${BASE}&state=settings`,
	aliasOf: BASE,
	label: 'Classroom settings (teacher, tour taken): where each group lives, a Reset each, the tour line',
	prepare: [TOUR_READY, OPEN_SHELL_MENU, { click: '[data-testid="settings-trigger"]', until: SETTINGS_OPEN }],
	presence: [
		{ selector: 'dialog[data-testid="classroom-settings"]', label: 'Settings, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-summary-guidance"]', label: 'the tour line', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-reset-guidance"]', label: 'a Reset for the tour (it has been taken)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-default-display"]', label: 'an untouched group says Default', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tour-offer"]', label: 'no offer over a tour that was taken', expectPresent: 0 }
	],
	textContains: [
		{
			selector: 'dialog[data-testid="classroom-settings"]',
			label: "a teacher's settings, each group placed",
			must: ['This device', 'Your account', 'Density', 'List width', 'A class opens on', 'Grades lists by', 'Tours', 'Classroom tour', 'Taken', 'Recent searches'],
			mustNot: ['To-do opens on', 'after returning']
		}
	],
	contrast: [
		{ selector: '[data-testid="classroom-settings"] .cs-setting-title', label: 'setting names', min: 4.5 },
		{ selector: '[data-testid="classroom-settings"] .cs-home', label: 'where a group lives', min: 4.5 },
		{ selector: '[data-testid^="settings-summary-"]', label: 'summary lines', min: 4.5 },
		{ selector: '[data-testid="classroom-settings"] .cs-option', label: 'choices', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="classroom-settings"] .cs-option', label: 'choices' },
		{ selector: '[data-testid^="settings-reset-"]', label: 'Reset' },
		{ selector: '[data-testid="settings-nav-narrower"], [data-testid="settings-nav-wider"]', label: 'Narrower and Wider' }
	],
	orderResult: [
		{
			label: 'Reset on the tour asks for the offer again: it appears and is recorded as offered',
			evaluate: `async () => {
				document.querySelector('[data-testid="settings-reset-guidance"]').click();
				await new Promise((r) => setTimeout(r, 200));
				await window.__tourFlush();
				const p = window.__tourProbe();
				return [String(p.offer), p.tours.teacher, (document.querySelector('[data-testid="settings-summary-guidance"]')?.textContent ?? '').trim()];
			}`,
			expected: ['teacher', 'offered', 'Offered']
		}
	]
};
