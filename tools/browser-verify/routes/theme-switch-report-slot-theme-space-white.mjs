/**
 * THE CLASSROOM HEADER'S REPORT SLOT UNDER SPACE WHITE (report 30, 2026-09-25)
 * -- the theme Mr. Pina teaches in, and the one he filed the report under.
 * `theme-switch-report-slot` measures the slot on the default theme; this is
 * the same slot after pressing the header's own Light switch, on the REAL
 * `ClassroomShell` with the REAL profile menu beside it.
 *
 * The switch sits inside the Menu below 1180px, so the Menu is opened to reach
 * it and then shut again with Escape, and every read happens with nothing
 * open: Report has to be on screen by itself, not because a Menu was left open.
 */
import { OPEN_SHELL_MENU } from './_shell-menu.mjs';

export default {
	path: '/dev/theme-switch?report=slot&theme=space-white',
	label: 'Classroom header under Space White: Report in its own slot, nothing opened',
	prepare: [
		OPEN_SHELL_MENU,
		{
			click: '[data-testid="theme-switch"]',
			until: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`,
			label: 'press Light: Space White on'
		},
		{
			evaluate: `() => { const m = document.querySelector('[data-testid="shell-menu"]'); if (m && m.getAttribute('aria-expanded') === 'true') m.click(); return m ? 'menu ' + m.getAttribute('aria-expanded') : 'no menu at this width'; }`,
			until: `() => { const m = document.querySelector('[data-testid="shell-menu"]'); return !m || m.offsetParent === null || m.getAttribute('aria-expanded') === 'false'; }`,
			label: 'shut the Menu again, so nothing is open when Report is measured'
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cr-header .shell-report .sfb-trigger', label: 'Report, in its own header slot, visible with nothing opened', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.shell-tools .sfb-trigger', label: 'none inside the tools the Menu folds', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.shell-report .sfb-word', label: 'the Report word, Space White', min: 4.5 },
		{ selector: '.shell-report .sfb-word', label: 'the Report word on the wall', min: 3, projector: true }
	],
	tapTargets: [{ selector: '.shell-report .sfb-trigger', label: 'the Report control', min: 44 }],
	orderResult: [
		{
			label: 'Report answers a tap at its centre and its edge clears 3:1 on the header behind it',
			evaluate: `() => {
				const t = document.querySelector('.shell-report .sfb-trigger');
				if (!t) return ['NO REPORT CONTROL'];
				const r = t.getBoundingClientRect();
				const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				const cv = document.createElement('canvas'); cv.width = cv.height = 1;
				const cx = cv.getContext('2d', { willReadFrequently: true });
				const paint = (c, g) => { cx.fillStyle = g || '#000'; cx.fillRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
				const lum = (p) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); };
				const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
				let ground = null;
				for (let el = t.parentElement; el; el = el.parentElement) { const bg = getComputedStyle(el).backgroundColor; const a = paint(bg, '#fff'), b = paint(bg, '#000'); if (a.join() === b.join()) { ground = bg; break; } }
				const g = paint(ground || '#fff', '#fff');
				const edge = ratio(paint(getComputedStyle(t).borderTopColor, ground || '#fff'), g);
				return [hit && t.contains(hit) ? 'report answers at its centre' : 'COVERED at its centre', edge >= 3 ? 'edge clears 3 on the header' : 'EDGE ' + edge.toFixed(2)];
			}`,
			expected: ['report answers at its centre', 'edge clears 3 on the header']
		}
	]
};
