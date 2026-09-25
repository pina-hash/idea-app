/**
 * THE REPORT BOX IN THIS ROOM'S COLOURS (report 35, 2026-09-25). On FSP it is the Bosco Tech navy on white, system sans, like the page.
 *
 * The REAL floating control and the REAL box, opened on a harness that mounts
 * the REAL room wrapper, so the only thing standing between them is the
 * `--fb-room-*` hooks the room declares on `body:has(...)`. The probe in
 * `_report-room.mjs` prints every measured ratio in the prepare line (canvas
 * readback, against BOTH gradient stops of the box and its field fill) and
 * the order-result row turns them into a verdict; the `contrast` rows below
 * are the harness's own text reads of the same box, for a second instrument.
 */
import { OPEN_REPORT_BOX, ROOM_INKS, ROOM_INKS_CHECK, TYPE_REPORT } from './_report-room.mjs';

export default {
	path: '/dev/fsp-tech-selection?report=room',
	label: 'FSP: the report box and its control in the navy and white palette',
	prepare: [OPEN_REPORT_BOX, TYPE_REPORT, ROOM_INKS],
	presence: [
		{ selector: '.fsp-root', label: 'the room wrapper (positive control: the hooks key on it)', expectPresent: 1 },
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
