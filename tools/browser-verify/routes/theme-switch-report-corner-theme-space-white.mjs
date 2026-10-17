/**
 * THE FEEDBACK BUTTON ON A CLASSROOM PAGE UNDER SPACE WHITE (ledger 0396) --
 * the theme Mr. Pina teaches in. `theme-switch-report-corner` measures the
 * default theme; this is the same page after pressing the header's own Light
 * switch, on the REAL `ClassroomShell` with the REAL profile menu beside it.
 *
 * The switch sits inside the Menu below 1180px, so the Menu is opened to reach
 * it and then shut again, and every read happens with nothing open.
 */
import { OPEN_SHELL_MENU } from './_shell-menu.mjs';
import { CORNER_FEEDBACK_EXPECTED, CORNER_FEEDBACK_PRESENCE, CORNER_FEEDBACK_PROBE } from './_corner-feedback.mjs';

export default {
	path: '/dev/theme-switch?report=corner&theme=space-white',
	label: 'Classroom page under Space White: the feedback button in the page corner, nothing opened',
	prepare: [
		{
			waitFor: '() => { const t = document.querySelector(".sfb-shell .sfb-trigger"); return !!t && !!t.closest(".cr-plate") && !!document.querySelector(".pm-trigger"); }',
			timeoutMs: 20000,
			label: 'the plated corner button has painted'
		},
		OPEN_SHELL_MENU,
		{
			click: '[data-testid="theme-switch"]',
			until: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`,
			label: 'press Light: Space White on'
		},
		{
			evaluate: `() => { const m = document.querySelector('[data-testid="shell-menu"]'); if (m && m.getAttribute('aria-expanded') === 'true') m.click(); return m ? 'menu ' + m.getAttribute('aria-expanded') : 'no menu at this width'; }`,
			until: `() => { const m = document.querySelector('[data-testid="shell-menu"]'); return !m || m.offsetParent === null || m.getAttribute('aria-expanded') === 'false'; }`,
			label: 'shut the Menu again, so nothing is open when the button is measured'
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on (positive control)', expectPresent: 1, maxPresent: 1 },
		...CORNER_FEEDBACK_PRESENCE
	],
	contrast: [
		{ selector: '.sfb-shell .sfb-word', label: 'the button word, Space White', min: 4.5 },
		{ selector: '.sfb-shell .sfb-word', label: 'the button word on the wall', min: 3, projector: true }
	],
	tapTargets: [{ selector: '.sfb-shell .sfb-trigger', label: 'the feedback button', min: 44 }],
	orderResult: [
		{
			label: 'the button hit-tests to itself, its word is inside it, it is in the corner in the plate key, and a whole class icon is still on screen',
			evaluate: CORNER_FEEDBACK_PROBE,
			expected: CORNER_FEEDBACK_EXPECTED
		}
	]
};
