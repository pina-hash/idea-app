/**
 * THE STALE SAVE, WHICH IS THE STATE NO HARNESS REACHED.
 *
 * `store.ts` publishes the terminal `conflict` phase down TWO different paths
 * and ledger 0201 built a harness for only one of them. A REVOKED GRANT makes
 * the write throw, ends in `accessLost: true`, and the item page rewrites its
 * chip to "Not saved" and renders a full sentence beside the shared panel --
 * that is `ideacad-item-role-editor-state-lost`, and it has been measured for
 * three bundles. A STALE REVISION is the other path: the RPC RESOLVES with
 * `ok: false` and the server's own newer row, `accessLost` stays false,
 * `canWrite` stays true, and the chip keeps the phase's own word.
 *
 * WHAT THAT MEANT ON SCREEN, measured on this tree before ledger 0224: the
 * words "Changed elsewhere" in a 16px chip in the editor header, and nothing
 * else, anywhere. The store's own sentence -- "This concept changed elsewhere.
 * Your unsaved work is still here." -- lives in `state.error`, which no mount
 * renders. And the state is effectively permanent: the local row deliberately
 * keeps its old revision (the server's copy is held beside it for a resolution
 * surface nobody has built), so every following edit re-sends the same stale
 * number and is refused again. A student keeps modelling for the rest of the
 * period and loses all of it at the next reload.
 *
 * IT IS DRIVEN THROUGH THE REAL STORE, the way `state=lost` is: the harness
 * opens the document, makes the transport answer stale, and then edits. No
 * phase is published by hand and no flag is set on the editor.
 *
 * THE NEGATIVE CONTROLS ARE THE POINT OF THIS FILE AND THEY ARE IN TWO OTHER
 * SPECS. `ideacad-item-role-owner` is the ordinary document, where this
 * sentence must be absent and the chip reads "Saved"; `state=lost` is the
 * revoked grant, which shares this phase and must keep its OWN wording. A
 * sentence keyed too loosely would light up on both.
 */
import { WIDTHS } from './_shared.mjs';

import { IDEACAD_DRAWN } from './_ideacad-drawn.mjs';

/* THE THREE "WAS ANYTHING ACTUALLY DRAWN" CHECKS (ledger 0247). Stated once in
   `_ideacad-drawn.mjs` because they are properties of the Blade editor rather
   than of this state; see that file for which routes take them and why. */

export default {
	...IDEACAD_DRAWN,
	path: '/dev/ideacad-item?role=owner&state=conflict',
	label: 'IdeaCAD item page: the document changed elsewhere and saving has stopped',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadItemStore === "function"' },
		{ waitFor: '() => window.__ideacadItemStore().phase === "conflict"' }
	],
	orderResult: [
		{
			label: 'the store is in the STALE terminal state, not the revoked one',
			evaluate:
				'() => { const s = window.__ideacadItemStore(); return ["phase " + s.phase, "accessLost " + s.accessLost, "canWrite " + s.canWrite, "role " + s.role]; }',
			/* `accessLost false` is what separates this from `state=lost`: both
			   are `conflict`, and a spec that only asserted the phase would pass
			   on either one and prove nothing about which was driven. */
			expected: ['phase conflict', 'accessLost false', 'canWrite true', 'role owner']
		},
		{
			label: 'the chip and the sentence are both on screen and agree',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["saveChip " + c.saveChip, "saveStopped " + c.saveStopped, "editors " + c.editors]; }',
			/* THE CHIP IS NOT REPLACED. The word is the state's own vocabulary
			   and stays; what is added is the sentence under it. Two claims, one
			   screen, compared -- which is what nothing did before. */
			expected: ['saveChip Changed elsewhere', 'saveStopped 1', 'editors 1']
		},
		{
			label: 'the editor is not swapped out under the student, so the unsaved work survives',
			evaluate:
				'() => { const c = window.__ideacadItemControls(); return ["concept " + c.concept, "accept " + c.accept, "undo " + c.undo]; }',
			/* The same subtlety `state=lost` names: a branch that unmounted the
			   writable editor here would re-seed from the last SAVED state and
			   silently destroy the very work the sentence promises is still
			   here. */
			expected: ['concept My concept', 'accept 1', 'undo 1']
		}
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-save-stopped"]',
			label: 'the sentence says what stopped, what survives, and what costs it',
			/* WRITTEN AS THREE CLAIMS RATHER THAN AS THE WHOLE STRING: a student
			   needs to know that saving has stopped (not that a stranger edited
			   something), that what is on screen is still theirs, and that
			   reloading is the thing that would take it. */
			must: ['stopped saving', 'still here', 'lost if you reload'],
			/* AND IT IS NOT THE RETRYABLE SENTENCE. `IDEACAD_WRITE_REFUSED` ends
			   "Try again", which is exactly wrong here: trying again re-sends the
			   same stale revision forever. */
			mustNot: ['Try again']
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-editor"]', label: 'the editor console', expectPresent: 1, expectVisible: 1 },
		{
			selector: '[data-testid="ideacad-save-stopped"]',
			label: 'the sentence saying saving has stopped',
			expectPresent: 1,
			expectVisible: 1
		},
		/* ABSENCES, each with its live counterpart above as the positive control:
		   this is a stale revision on the caller's OWN document, so nothing about
		   a removed grant belongs on the screen. */
		{ selector: '[data-testid="ideacad-shared-access-lost"]', label: 'the revoked-grant notice, which is a different state', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-reading-shared"]', label: 'the reading-somebody-elses banner, absent on your own document', expectPresent: 0 }
	],
	contrast: [
		{
			selector: '[data-testid="ideacad-save-stopped"]',
			label: 'the sentence saying saving has stopped',
			min: 4.5
		},
		{ selector: '[data-testid="ideacad-editor"] .save', label: 'the save chip beside it', min: 4.5 }
	],
	ignoreConsole: [
		/* THE FIXTURE'S OWN ATTACHMENT, not this surface's -- the same two
		   patterns every other `ideacad-item-*` and `classroom-inspector-*` spec
		   carries, for the same reason: the split fixture's published assignment
		   has an attachment row and `/api/classroom/attachment/a-2` answers 401
		   with no session. */
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
