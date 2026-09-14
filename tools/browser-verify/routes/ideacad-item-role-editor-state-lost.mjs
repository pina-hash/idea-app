/**
 * THE REVOKED GRANT, REACHING THE PAGE.
 *
 * Ledger 0201 chose `ideacad_shared_with_me` -- which ANSWERS -- over
 * `ideacad_open_shared_document` -- which RAISES -- precisely so a revoked
 * grant and a dead network could be told apart. That asymmetry is worth nothing
 * if the page does not render it, and until this bundle no page did.
 *
 * IT IS DRIVEN THROUGH THE REAL STORE. The harness opens the document, revokes
 * the grant behind the scenes and then edits, so the terminal state is produced
 * by the shipping store reacting to the shipping refusal rather than by setting
 * a flag.
 *
 * TWO CLAIMS ON ONE SCREEN ARE COMPARED. Ledger 0201's third defect was a row
 * reading "Can edit / Open now" three lines under a notice saying the access
 * was gone -- every check passed, because nothing compares two claims for
 * agreement. `no row claims a role the panel has just withdrawn` is that
 * comparison.
 */
import { WIDTHS } from './_shared.mjs';

import { IDEACAD_DRAWN } from './_ideacad-drawn.mjs';

/* THE THREE "WAS ANYTHING ACTUALLY DRAWN" CHECKS (ledger 0247). Stated once in
   `_ideacad-drawn.mjs` because they are properties of the Blade editor rather
   than of this state; see that file for which routes take them and why. */

export default {
	...IDEACAD_DRAWN,
	path: '/dev/ideacad-item?role=editor&state=lost',
	label: 'IdeaCAD item page: the grant removed while the document was open',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadItemStore === "function"' },
		{ waitFor: '() => window.__ideacadItemStore().accessLost === true' }
	],
	orderResult: [
		{
			label: 'the store is terminal and canWrite went false with it',
			evaluate:
				'() => { const s = window.__ideacadItemStore(); return ["phase " + s.phase, "accessLost " + s.accessLost, "canWrite " + s.canWrite]; }',
			// `canWrite false` is the hole ledger 0201 found and closed: `conflict`
			// stops the autosave MACHINE, but create, rename and delete are
			// explicit presses that went straight to their RPC while it stayed
			// true. Asserted here on the tree this bundle branches from.
			expected: ['phase conflict', 'accessLost true', 'canWrite false']
		},
		{
			label: 'the EDITOR is not swapped out under the student, so the refused edit survives',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["editors " + c.editors, "concept " + c.concept, "undo " + c.undo]; }',
			// THE SUBTLE ONE. A branch keyed on `canWrite` alone would unmount the
			// writable editor at exactly this moment and re-seed from the last
			// SAVED state -- silently losing the work `IDEACAD_SHARED_ACCESS_LOST`
			// promises in words is still on screen. `store.ts`'s `refuseWrite` is
			// the floor, and it throws that same sentence at every press.
			expected: ['editors 1', 'concept Their concept', 'undo 1']
		},
		{
			label: 'no two claims on this screen disagree',
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
				'no row claims a role the panel has just withdrawn ok',
				'exactly one row is marked as having lost its grant ok',
				'no row carries both an Open control and the Open-now mark ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the terminal notice', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-row-lost"]', label: 'the row says the access was removed instead of naming a role', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-shared-current"]', label: 'the Open-now mark, which a document this caller cannot reach must NOT carry', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-summary"]', label: 'the count, withheld because the list is known to be out of date', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-shared-row"]', label: 'the rows are still on screen, which is the control for the two zeroes above', expectPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-return-mine"]', label: 'and the way back out is still offered, which is the point of it', expectPresent: 1, expectVisible: 1 },
		/* THE SECOND NEGATIVE CONTROL FOR `state=conflict`, and the one that
		   matters most: a revoked grant and a stale revision share this phase,
		   so a sentence keyed on the phase rather than on the LABEL the call
		   site hands down would light up here too -- under a notice that
		   already says the access was removed, which is a different thing. The
		   terminal notice asserted at the top of this block is the control that
		   stops this zero reading as a broken selector. Ledger 0224. */
		{ selector: '[data-testid="ideacad-save-stopped"]', label: 'the stale-revision sentence, which a revoked grant must NOT also produce', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-editor"] header',
			label: 'the save chip does not claim something changed elsewhere',
			// It was the ACCESS that changed, not the concept. The phase is reused
			// because the consequence is identical; the WORD is not, and this is
			// the second defect rasterizing this mount found.
			must: ['Not saved'],
			mustNot: ['Changed elsewhere']
		},
		{
			selector: '[data-testid="ideacad-shared-access-lost"]',
			label: 'the notice says what is still true first',
			must: ['What is on screen is still here'],
			mustNot: ['This concept changed elsewhere']
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the terminal notice', min: 4.5 },
		{ selector: '[data-testid="ideacad-shared-row-lost-note"]', label: 'the row note that replaced the role note', min: 4.5 }
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
