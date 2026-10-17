/**
 * THE ONE LIGHT ASSIGNMENT PAGE (report 35's rule, applied to a legacy page):
 * `idea113-blade-05-qr.html` is a white, printable QR sheet, and every other
 * carried-over assignment is neon on black. The launcher reads the page's own
 * ground and marks the button's wrapper `data-tone="light"`, so the button and
 * the window it opens are ink on white, and on a printout neither appears.
 */
import { ESCAPE_CLOSES_FRAME, frameFields, OFFICIAL_CORNER_CHECK, OPEN_FRAME_BOX, ROOM_INKS, ROOM_INKS_CHECK, TYPE_FRAME_REPORT } from './_report-room.mjs';

export default {
	path: '/dev/feedback/assignment?slug=idea113-blade-05-qr&signedIn=0',
	label: 'Assignment QR sheet (light page): the button and the framed window in ink on white',
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
			label: 'the light page takes the light palette, button and window both',
			evaluate: `() => {
				const w = document.getElementById('idea-feedback-launch');
				const f = document.getElementById('idea-feedback-frame');
				const box = f?.contentDocument?.querySelector('.fb-box');
				const bg = box ? f.contentDocument.defaultView.getComputedStyle(box).backgroundColor : 'none';
				return [w?.getAttribute('data-tone') === 'light' ? 'tone light' : 'TONE ' + w?.getAttribute('data-tone'), bg];
			}`,
			expected: ['tone light', 'rgb(244, 244, 244)']
		}
	],
	/* The page draws its QR code with a script from a CDN the harness blocks
	   (every non-loopback request is), so its own call fails here and not in
	   a classroom. Nothing the feedback button does. */
	ignoreConsole: [/QRCode is not defined/]
};
