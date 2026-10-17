/**
 * GAUNTLET WEARS THE OFFICIAL FEEDBACK WINDOW (ledger 0396, reports 0fe82a80
 * and 80bb4d23). Until then GAUNTLET was an exclusion: the root control was
 * taken off and a second mount sat in the viewport footer, a different place
 * from every other page. Now the root layout's own `SiteFeedback` shows here,
 * in the official corner, and the only thing GAUNTLET contributes is its
 * colours, through the `--fb-room-*` hooks `SiteFeedback` declares on
 * `body:has(.gt-root)`.
 *
 * The harness mounts the REAL `.gt-root` wrapper and the real viewport
 * furniture, so the hooks key exactly as they do on /gauntlet. The probe in
 * `_report-room.mjs` prints every measured ratio in the prepare line (canvas
 * readback against both gradient stops of the box and its field fill); the
 * `contrast` rows are the harness's own text reads, a second instrument.
 */
import {
	HOME_METRICS_CHECK,
	OFFICIAL_CORNER_CHECK,
	OPEN_REPORT_BOX,
	ROOM_INKS,
	ROOM_INKS_CHECK,
	TYPE_REPORT,
	pageFields
} from './_report-room.mjs';

export default {
	path: '/dev/gauntlet-shell?report=room',
	label: 'GAUNTLET: the official feedback button and window, in the official corner, in GAUNTLET colours',
	prepare: [OPEN_REPORT_BOX, TYPE_REPORT, ROOM_INKS],
	presence: [
		{ selector: '.gt-root', label: 'the room wrapper (positive control: the hooks key on it)', expectPresent: 1 },
		{ selector: '.sfb-shell .sfb-trigger', label: 'the official feedback button, root-mounted', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.sfb-relocated', label: 'no second, footer-docked copy', expectPresent: 0 },
		{ selector: '.sfb-host .fb-box', label: 'the window, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.sfb-shell .sfb-word', label: 'the button word', min: 4.5 },
		{ selector: '.fb-title', label: 'the box title', min: 4.5 },
		{ selector: '.fb-note', label: 'the opening note', min: 4.5 },
		{ selector: '.fb-kind', label: 'the kind chips', min: 4.5 },
		{ selector: '.fb-label', label: 'the field labels', min: 4.5 },
		{ selector: '.fb-state .save-ind-text', label: 'the save line (Unsaved changes)', min: 4.5 },
		{ selector: '.fb-btn-primary', label: 'SEND', min: 4.5 },
		{ selector: '.fb-count', label: 'the characters-left count', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.sfb-shell .sfb-trigger', label: 'the feedback button', min: 44 },
		{ selector: '.fb-box .fb-btn', label: 'the box buttons', min: 44 }
	],
	orderResult: [pageFields(false), OFFICIAL_CORNER_CHECK, ROOM_INKS_CHECK, HOME_METRICS_CHECK]
};
