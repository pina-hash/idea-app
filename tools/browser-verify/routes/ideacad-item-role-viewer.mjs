/**
 * THE VIEWER CASE ON THE REAL PAGE, which is the assertion that matters.
 *
 * `0205` gives view-only and editor grants and the payload carries the answer;
 * NOTHING in the page or the component re-derives it. So the read-only
 * direction is measured against the SAME mount as the writable one, with the
 * SAME full write boundary handed down -- `/dev/ideacad-item` builds
 * `IdeacadEditorWrites` unconditionally, exactly as `+page.svelte` does -- and
 * the only thing that moved is the role in the payload.
 *
 * BOTH COUNTS ARE REPORTED. A zero alone is a selector that might simply be
 * wrong; `ideacad-item-role-editor.mjs` is the positive control for every
 * absence here, on the same three controls.
 */
import { WIDTHS } from './_shared.mjs';

import { IDEACAD_DRAWN } from './_ideacad-drawn.mjs';

/* THE THREE "WAS ANYTHING ACTUALLY DRAWN" CHECKS (ledger 0247). Stated once in
   `_ideacad-drawn.mjs` because they are properties of the Blade editor rather
   than of this state; see that file for which routes take them and why. */

export default {
	...IDEACAD_DRAWN,
	path: '/dev/ideacad-item?role=viewer',
	label: 'IdeaCAD item page: a view-only grant offers no control that would be refused',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadItemStore === "function"' },
		{ waitFor: '() => window.__ideacadItemStore().documentId !== null' }
	],
	orderResult: [
		{
			label: 'the store opened the shared document as a viewer',
			evaluate:
				'() => { const s = window.__ideacadItemStore(); return ["role " + s.role, "canWrite " + s.canWrite]; }',
			expected: ['role viewer', 'canWrite false']
		},
		{
			label: 'the same document is on screen with EVERY write control gone',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["editors " + c.editors, "concept " + c.concept, "undo " + c.undo, "redo " + c.redo, "accept " + c.accept, "historyToggle " + c.historyToggle]; }',
			// TWO LAYERS, MEASURED SEPARATELY. Undo and Redo go when the transports
			// are withheld AND when `readOnly` is set; Accept and Cancel go only
			// because `readOnly` is set. The History toggle STAYS, because reading
			// a log is not writing to one -- and a zero there would be this mount
			// quietly taking decision 27 away from a viewer.
			expected: [
				'editors 1',
				'concept Their concept',
				'undo 0',
				'redo 0',
				'accept 0',
				'historyToggle 1'
			]
		},
		{
			label: 'nothing overflows its container in the read-only arrangement either',
			evaluate: '() => window.__ideacadItemVerdicts()',
			expected: [
				'nothing is wider than the window ok',
				'the engine host is on screen ok',
				'the shared panel sits inside the engine host ok',
				'no control in the shared panel is wider than half its panel ok',
				'every control sits inside the panel that owns it ok',
				'every row sits inside the panel ok',
				'the reading-shared banner sits inside the engine host ok',
				'the way back is inside the banner and is not stretched across it ok',
				'the way back clears 44px ok',
				'no row carries both an Open control and the Open-now mark ok'
			]
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the room production is in', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-editor"]', label: 'the editor is mounted, which is the control for every zero above', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-viewonly"]', label: 'the row SAYS it is view-only, so an unpressable row does not read as broken', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-return-mine"]', label: 'a viewer still gets the way back', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the terminal notice, which a view-only grant must NOT produce', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-shared-viewonly"]', label: 'the view-only sentence', min: 4.5 },
		{ selector: '[data-testid="ideacad-reading-shared"] .ic-elsewhere-text', label: 'the banner sentence', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-return-mine"]', label: 'the way back', min: 44 }],
	ignoreConsole: [
		/* THE FIXTURE'S OWN ATTACHMENT, not this surface's. The split fixture's
		   published assignment carries an attachment row, and `/api/classroom/
		   attachment/a-2` answers 401 with no session -- which is correct
		   behaviour from a route that is not what this spec measures. The same
		   two patterns are on every `classroom-inspector-*` spec for the same
		   reason. */
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
