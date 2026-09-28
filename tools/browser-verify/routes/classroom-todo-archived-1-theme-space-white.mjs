/**
 * NO BROWN INK ON MY CLASSES UNDER SPACE WHITE (report R14, 2026-09-28: "this
 * kind of brownish color you have for the my classes on the my classes page is
 * ugly for the light theme").
 *
 * The class card's ink (its icon, its code and Open), "All updates" and a
 * note's link read the HOVER-INK ROLE now, not --gold: brass on the dark
 * themes as before, and the green ink under Space White, where a lightness-only
 * gold is the brown #715d22. Measured on the real grounds (the plate's card
 * face included), and read back against a probe painted in each token, so
 * "green" is the room's own --green and not a number typed here.
 *
 * The harness holds no session, so the attribute is forced the way every
 * classroom harness forces it.
 */
import { FORCE_THEME } from './_hover-ink.mjs';
import { ARCHIVED, ARCHIVED_READY } from './_classroom-todo.mjs';

export default {
	path: `${ARCHIVED}&theme=space-white`,
	aliasOf: ARCHIVED,
	label: 'My Classes under Space White: the card ink, All updates and the archived count are green, not brown',
	prepare: [ARCHIVED_READY, FORCE_THEME('space-white')],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="my-classes-active"] a.class-card', label: 'the four active cards', expectPresent: 4, maxPresent: 4, expectVisible: 4 }
	],
	contrast: [
		{ selector: '[data-testid="my-classes-active"] .class-code', label: 'class code', min: 4.5 },
		{ selector: '[data-testid="my-classes-active"] .class-cta', label: 'Open', min: 4.5 },
		{ selector: '.updates-all', label: 'All updates', min: 4.5 },
		{ selector: '[data-testid="my-classes-archived-count"]', label: 'the archived count', min: 4.5 },
		{ selector: '[data-testid="class-strip-archived"] .cls-code', label: 'the strip Archived key', min: 4.5 }
	],
	orderResult: [
		{
			label: 'each ink is the green ink, never the gold (brown) one',
			evaluate: `() => {
				const root = document.querySelector('.cr-root') ?? document.body;
				const probe = (v) => { const s = document.createElement('span'); s.style.color = 'var(' + v + ')'; root.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; };
				const green = probe('--green');
				const gold = probe('--gold');
				const read = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).color : 'absent'; };
				const verdict = (name, sel) => { const c = read(sel); return name + ': ' + (c === green ? 'green' : c === gold ? 'GOLD ' + c : 'other ' + c); };
				return [
					verdict('class code', '[data-testid="my-classes-active"] .class-code'),
					verdict('Open', '[data-testid="my-classes-active"] .class-cta'),
					verdict('class icon', '[data-testid="my-classes-active"] .class-icon'),
					verdict('All updates', '.updates-all')
				];
			}`,
			expected: ['class code: green', 'Open: green', 'class icon: green', 'All updates: green']
		}
	]
};
