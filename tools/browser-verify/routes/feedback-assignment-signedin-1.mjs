/**
 * The assignment page's feedback window, SIGNED IN: the other half of the
 * signed-out spec. No contact field (a signed-in report already carries an
 * account, and the contact is never an identity), and a note that says the
 * role is attached. The page's own bytes are identical in both states.
 */
import { ESCAPE_CLOSES_FRAME, frameFields, OFFICIAL_CORNER_CHECK, OPEN_FRAME_BOX, ROOM_INKS, ROOM_INKS_CHECK, sinkReportCheck, TYPE_FRAME_REPORT } from './_report-room.mjs';

export default {
	path: '/dev/feedback/assignment?signedIn=1',
	label: 'Assignment page (signed in): the framed window has no contact field',
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
		frameFields(true),
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
		sinkReportCheck(true)
	]
};
