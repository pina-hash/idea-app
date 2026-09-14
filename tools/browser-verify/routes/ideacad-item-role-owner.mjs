/**
 * THE ORDINARY CASE, which is every student on every ordinary assignment and
 * which this bundle must not have changed.
 *
 * `open` resolves the caller's own document and can publish nothing but
 * `role: 'owner'`, so the arm that existed before ledger 0217 is still the one
 * taken: the writable editor, no banner, and the shared panel below it. The
 * BANNER's absence is the measurement that matters -- it costs vertical space
 * above a student's work at 375, and the whole argument for putting it first in
 * the slot is that it is absent for everyone who is not in somebody else's
 * document.
 */
import { WIDTHS } from './_shared.mjs';

import { IDEACAD_DRAWN } from './_ideacad-drawn.mjs';

/* THE THREE "WAS ANYTHING ACTUALLY DRAWN" CHECKS (ledger 0247). Stated once in
   `_ideacad-drawn.mjs` because they are properties of the Blade editor rather
   than of this state; see that file for which routes take them and why. */

export default {
	...IDEACAD_DRAWN,
	path: '/dev/ideacad-item?role=owner',
	label: 'IdeaCAD item page: a student on their OWN document is unchanged',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadItemStore === "function"' },
		{ waitFor: '() => window.__ideacadItemStore().role === "owner"' }
	],
	orderResult: [
		{
			label: 'the caller\'s own document, writable, with no banner over it',
			evaluate:
				'() => { const s = window.__ideacadItemStore(); const c = window.__ideacadItemControls(); return ["role " + s.role, "canWrite " + s.canWrite, "concept " + c.concept, "undo " + c.undo, "accept " + c.accept, "banner " + c.banner, "back " + c.back]; }',
			expected: [
				'role owner',
				'canWrite true',
				'concept My concept',
				'undo 1',
				'accept 1',
				'banner 0',
				'back 0'
			]
		},
		{
			label: 'the Sharing panel and its form ARE here, which is the control for the editor route\'s two zeroes',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["sharePanel " + c.sharePanel, "shareForm " + c.shareForm]; }',
			expected: ['sharePanel 1', 'shareForm 1']
		},
		{
			label: 'the shared panel is still there, below the editor, inside its host',
			evaluate: '() => window.__ideacadItemVerdicts()',
			expected: [
				'nothing is wider than the window ok',
				'the engine host is on screen ok',
				'the shared panel sits inside the engine host ok',
				'no control in the shared panel is wider than half its panel ok',
				'every control sits inside the panel that owns it ok',
				'every row sits inside the panel ok',
				'no row carries both an Open control and the Open-now mark ok'
			]
		}
	],
	domOrder: [
		{
			before: '[data-testid="ideacad-editor"]',
			after: '[data-testid="ideacad-shared"]',
			label: 'the shared list reads BELOW the student\'s own work, which is the empty-case argument'
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the room production is in', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-editor"]', label: 'the writable editor', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'both shared documents, still offered', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-shared-open"]', label: 'both are openable, because neither is the one on screen', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-reading-shared"]', label: 'the banner, which must NOT appear on the caller\'s own document', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-current"]', label: 'the Open-now mark, which no row earns here', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-share-form"]', label: 'the share form, which only an owner gets', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE NEGATIVE CONTROL FOR `state=conflict`. A document that is saving
		   normally must carry no sentence saying it has stopped -- and the
		   writable editor asserted two rows up is what stops this reading as a
		   selector that is simply wrong. Ledger 0224. */
		{ selector: '[data-testid="ideacad-save-stopped"]', label: 'the saving-has-stopped sentence, which an ordinary document never earns', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-shared-summary"]', label: 'the summary chip', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-shared-open"]', label: 'the Open control', min: 44 }],
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
