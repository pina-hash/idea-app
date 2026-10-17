/**
 * THE BLADE RULEBOOK, THE ONE ASSIGNMENT PAGE THAT HIDES THE MOUSE POINTER
 * (ledger 0298 review of report 20), and a page that keeps fixed controls of
 * its own near the bottom right.
 *
 * `IDEA-Blade_Rulebook_v2_2.html` sets `*,*::before,*::after{cursor:none}` and
 * draws its own dot at z-index 99999. The universal rule matches the button's
 * word and glyph directly, so the injected stylesheet gives the button an
 * id-scoped pointer; inside the frame the window's own document decides its
 * cursors, so nothing in the window hides the pointer either.
 *
 * WHAT IS READ: that the page really does hide its own cursor (the positive
 * control, without which a zero proves nothing), that no element of the button
 * or the window computes `cursor: none`, and that Escape closes the window and
 * hands focus back to the button.
 */
import { ESCAPE_CLOSES_FRAME, frameFields, OFFICIAL_CORNER_CHECK, OPEN_FRAME_BOX, ROOM_INKS, ROOM_INKS_CHECK, TYPE_FRAME_REPORT } from './_report-room.mjs';

export default {
	path: '/dev/feedback/assignment?slug=IDEA-Blade_Rulebook_v2_2&signedIn=0',
	label: 'Blade Rulebook (hides its own cursor): the button and window keep a visible pointer, and Escape closes it',
	settleMs: 1200,
	prepare: [OPEN_FRAME_BOX, TYPE_FRAME_REPORT, ROOM_INKS],
	presence: [
		{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the official feedback button, server-rendered', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-feedback-frame.is-open', label: 'the window, open in its frame', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-legacy-report, #idea-legacy-report-btn', label: 'no look-alike panel or its button', expectPresent: 0 }
	],
	contrast: [{ selector: '#idea-feedback-launch .sfb-word', label: 'the button word', min: 4.5 }],
	tapTargets: [{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the feedback button', min: 44 }],
	orderResult: [
		frameFields(false),
		OFFICIAL_CORNER_CHECK,
		ROOM_INKS_CHECK,
		{
			label: 'the window files against the assignment route, without the plate, and the page stays session-blind',
			evaluate: `() => {
				const f = document.getElementById('idea-feedback-frame');
				if (!f) return ['NO FRAME'];
				const q = new URL(f.src, location.href).searchParams;
				const scripts = [...document.scripts].map((s) => s.textContent || '').join('\\n');
				return [
					'route ' + q.get('route'),
					'plate ' + (q.get('plate') || 'off'),
					/signedIn|sessionProbe|assignment-feedback/.test(scripts.replace(/"extra":\\{[^}]*\\}/, '')) ? 'THE PAGE NAMES A SESSION' : 'the page names no session'
				];
			}`,
			expected: ['route /assignments/[slug]', 'plate off', 'the page names no session']
		},
		{
			label: 'the page hides its own cursor, and nothing in the button or the window does',
			evaluate: `() => {
				const f = document.getElementById('idea-feedback-frame');
				const w = document.getElementById('idea-feedback-launch');
				if (!f || !w) return ['NO FRAME OR BUTTON'];
				const t = w.querySelector('.sfb-trigger');
				const own = [t, ...t.querySelectorAll('*')].filter((el) => getComputedStyle(el).cursor === 'none').length;
				const d = f.contentDocument;
				const inner = [...d.querySelectorAll('.fb-scrim, .fb-scrim *')].filter((el) => d.defaultView.getComputedStyle(el).cursor === 'none').length;
				return [
					getComputedStyle(document.body).cursor === 'none' ? 'the page hides its own cursor' : 'THE PAGE DOES NOT HIDE ITS CURSOR (the fixture lost its point)',
					own === 0 ? 'no element of the button hides the pointer' : own + ' BUTTON ELEMENTS HIDE THE POINTER',
					inner === 0 ? 'no element of the window hides the pointer' : inner + ' WINDOW ELEMENTS HIDE THE POINTER'
				];
			}`,
			expected: ['the page hides its own cursor', 'no element of the button hides the pointer', 'no element of the window hides the pointer']
		},
		ESCAPE_CLOSES_FRAME
	]
};
