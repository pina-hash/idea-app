/**
 * THE REPORT BOX WITH NO ROOM HOOK (report 35, 2026-09-25). On a page inside Space White's scope the box sets no room hook and reads the site theme's own tokens, so it is Space White.
 *
 * The REAL floating control and the REAL box on the site-theme harness. The
 * probe in `_report-room.mjs` prints every measured ratio in the prepare line
 * (canvas readback, against BOTH gradient stops of the box and its field
 * fill); the order-result row is the verdict. This is the other half of the
 * room specs: a room that declares nothing gets the site theme, and the site
 * theme's own values clear the same bars.
 */
import { OPEN_REPORT_BOX, ROOM_INKS, ROOM_INKS_CHECK, TYPE_REPORT } from './_report-room.mjs';

export default {
	path: '/dev/themes?state=space-white&report=room',
	label: 'Space White: the report box follows the site theme on an in-scope page, with no room hook',
	prepare: [OPEN_REPORT_BOX, TYPE_REPORT, ROOM_INKS],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'the site theme this spec is about (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.sfb-shell .sfb-trigger', label: 'the floating report control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.sfb-host .fb-box', label: 'the report box, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.sfb-shell .sfb-word', label: 'the floating control word', min: 4.5 },
		{ selector: '.fb-title', label: 'the box title', min: 4.5 },
		{ selector: '.fb-note', label: 'the opening note', min: 4.5 },
		{ selector: '.fb-kind', label: 'the kind chips', min: 4.5 },
		{ selector: '.fb-label', label: 'the field labels', min: 4.5 },
		{ selector: '.fb-state .save-ind-text', label: 'the save line (Unsaved changes)', min: 4.5 },
		{ selector: '.fb-btn-primary', label: 'SEND', min: 4.5 },
		{ selector: '.fb-count', label: 'the characters-left count', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.sfb-shell .sfb-trigger', label: 'the floating report control', min: 44 },
		{ selector: '.fb-box .fb-btn', label: 'the box buttons', min: 44 }
	],
	orderResult: [ROOM_INKS_CHECK]
};
