/**
 * THE PAGE-BUG STATE, ON THE MOUNT RATHER THAN ON THE PANEL.
 *
 * Ledger 0195's shape: a wiring mistake hands every callback down regardless,
 * so a proof resting on absence cannot see the case it matters for. This route
 * drives exactly that mistake one layer deeper than
 * `/dev/ideacad-shared?role=viewer&state=callbacks` does -- the real
 * `ItemDetail` is mounted with a full `IdeacadEditorWrites`, a viewer's
 * document is opened, and then all nine of the store's write methods are called
 * anyway. Each must come back refused with `0205`'s own sentence, and the
 * editor on screen must still be offering nothing.
 *
 * THE ATTEMPT COUNT IS ASSERTED, not just the refusal count: a probe that
 * attempted nothing would otherwise report nine-of-nine and read as a pass.
 */
import { WIDTHS } from './_shared.mjs';

import { IDEACAD_DRAWN } from './_ideacad-drawn.mjs';

/* THE THREE "WAS ANYTHING ACTUALLY DRAWN" CHECKS (ledger 0247). Stated once in
   `_ideacad-drawn.mjs` because they are properties of the Blade editor rather
   than of this state; see that file for which routes take them and why. */

export default {
	...IDEACAD_DRAWN,
	path: '/dev/ideacad-item?role=viewer&state=callbacks',
	label: 'IdeaCAD item page: every write handed in over a read-only payload is still refused',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadItemStore === "function"' },
		{ waitFor: '() => window.__ideacadItemStore().attempted === 9' }
	],
	orderResult: [
		{
			label: 'nine writes attempted, nine refused, and the revision did not move',
			evaluate:
				'() => { const s = window.__ideacadItemStore(); return ["attempted " + s.attempted, "refused " + s.refused, "canWrite " + s.canWrite, "revision " + s.revision]; }',
			// 4 is the revision the fixture's concept was opened at. A write that
			// landed would move it, which no content check can see.
			expected: ['attempted 9', 'refused 9', 'canWrite false', 'revision 4']
		},
		{
			label: 'the editor is unchanged by nine refused writes',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["editors " + c.editors, "undo " + c.undo, "accept " + c.accept, "rows " + c.rows]; }',
			expected: ['editors 1', 'undo 0', 'accept 0', 'rows 2']
		},
		{
			label: 'and nothing overflowed while it happened',
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
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'the rows survived, which is the control for the counts above', expectPresent: 2, expectVisible: 2 },
		/* NO TERMINAL NOTICE. A refused write on a document that was ALWAYS
		   read-only is not a lost grant, and reporting it as one would tell a
		   viewer their access was removed when it never changed. */
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the terminal notice, which a refusal on a read-only document must NOT produce', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-item-probe"]',
			label: 'the refusals say the same thing the database says',
			must: ['You have view-only access to this document.'],
			mustNot: ['WROTE (this is the defect)', 'undefined']
		}
	],
	contrast: [],
	tapTargets: [],
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
