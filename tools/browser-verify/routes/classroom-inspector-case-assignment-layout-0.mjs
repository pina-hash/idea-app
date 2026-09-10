/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE ABSENT HALF OF THE 0193 GATING (prompt 0118, item FOUR).
 *
 * The same fixture as `...-layout-1`, the same press, the same editor layer --
 * and NO layout transport, which is the state of a deployment where the
 * migration has not been pasted yet, and of every caller that hands null.
 * Absence is the mechanism: the placement radio groups and the link-row
 * grips must not exist, not merely be hidden, because a control whose save
 * would answer `PGRST202` is worse than none.
 *
 * An absence row cannot tell "the rule holds" from "the selector was
 * renamed", so every 0 below sits beside a positive control that is present
 * in this exact state: the layer itself, its actions row, and the two link
 * rows the grips would have been on.
 */
export default {
	path: '/dev/classroom-inspector?case=assignment&layout=0',
	label: 'Item page: the editor layer without the 0193 transport offers no placement or order controls',
	prepare: [
		{
			click: '[data-testid="item-edit-toggle"]',
			until: `() => !!document.querySelector('[role="dialog"].composer-screen')`,
			attempts: 12,
			waitMs: 350
		}
	],
	presence: [
		/* Positive controls: the state was reached. */
		{ selector: '[role="dialog"].composer-screen', label: 'the editor layer, after the press', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.composer-screen .composer-actions.top', label: 'the actions row, inside the layer', expectPresent: 1 },
		{ selector: '.composer > .resources-editor .resource-row', label: 'the two link rows the grips would sit on', expectPresent: 2, maxPresent: 2 },
		/* The absences. */
		{ selector: '[data-testid="place-files"]', label: 'Files placement, ABSENT without the transport', expectPresent: 0 },
		{ selector: '[data-testid="place-links"]', label: 'Links placement, ABSENT without the transport', expectPresent: 0 },
		{ selector: '.composer [data-testid="attach-grip"]', label: 'existing-file grips, ABSENT without the transport', expectPresent: 0 },
		{ selector: '.composer [data-testid="attach-move-up"]', label: 'existing-file Move up, ABSENT without the transport', expectPresent: 0 },
		/* NOT gated: a link's order is stored by the save that has always
		   existed, so the link grips stay -- the positive control beside the
		   two absences above. */
		{ selector: '.composer > .resources-editor .order-grip', label: 'link row grips, present WITHOUT the transport (ungated)', expectPresent: 2, maxPresent: 2 }
	],
	tapTargets: [
		{ selector: '[data-testid="composer-screen-close"]', label: 'Close (layer header)', min: 44 }
	],
	ignoreConsole: [
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
