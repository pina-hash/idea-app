import { OPEN_MANAGE } from './_coin-roster-import.mjs';

/**
 * "Import from class roster" with NO classroom transport handed in
 * (`?roster=none`). An omitted optional transport removes the control it
 * drives, so the import block must be absent -- and the paste box beside it,
 * which needs no transport, is the positive control that says the panel
 * opened at all.
 */
export default {
	path: '/dev/coin-desk?roster=none',
	label: 'Coin desk: no class roster transport, no import control',
	prepare: [...OPEN_MANAGE('.assign-row textarea')],
	presence: [
		{ selector: '.cd-root .assign-row textarea', label: 'the paste box (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-roster-import"]', label: 'no import without a transport', expectPresent: 0 }
	]
};
