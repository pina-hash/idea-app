/**
 * THE TERMINAL STATE: a student holding a part, and the owner moving it.
 *
 * This is the case the whole lane exists for. A hold that is gone and a surface
 * that looks fine is how a student keeps working into a part they no longer
 * hold and loses the lot at the next reload, so the prompt's own rule is that a
 * student whose hold lapsed must SEE that rather than discover it on a refused
 * write.
 *
 * IT IS DRIVEN THROUGH THE REAL CONTROLLER, NOT SET AS A PROP. The harness has
 * the owner reassign the part this client is holding; the next read sees a
 * moved generation and `holdLostAgainst` produces the terminal notice. A
 * harness that published `phase: 'lost'` directly would be measuring an
 * arrangement `checkout.ts` has no path to, which is the same rule
 * `__ideacadOpenMaterials` follows one surface over.
 *
 * WHAT ONLY A BROWSER CAN SAY HERE. `tests/dom/` already proves the notice is
 * rendered with the right tone and that a terminal one carries no Dismiss. What
 * it cannot prove is that the sentence is READABLE -- a notice at 3:1 on its
 * own ground is a notice nobody reads, and happy-dom answers the empty string
 * for every colour. The contrast rows below are the half that only exists here.
 *
 * AND THE ROW UNDERNEATH GOES BACK TO OFFERING A TAKE, which is the way out of
 * the terminal state and the reason the notice is not a dead end.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-team?role=editor&state=lost',
	label: 'IdeaCAD team: the owner moved the part this student was holding, and the student is told',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadTeamVerdicts === "function"' },
		{ waitFor: '() => document.querySelectorAll("[data-testid=\\"ideacad-part-row\\"]").length === 3' },
		/* The reassignment is scheduled by the harness and reaches this client
		   through the controller's own read. Waiting on the PHASE rather than on
		   a timer is what makes the step honest about what it is waiting for. */
		{ waitFor: '() => window.__ideacadTeamState()?.phase === "lost"' }
	],
	orderResult: [
		{
			label: 'the terminal notice is on screen and nothing has run off the window',
			evaluate: '() => window.__ideacadTeamVerdicts()',
			expected: [
				'the parts list is on screen ok',
				'every part has a row ok',
				'nothing is wider than the window ok',
				'every control sits inside the panel that owns it ok',
				'every sharing control sits inside the sharing panel ok'
			]
		},
		{
			label: 'the notice carries the database’s own reason and the terminal tone',
			evaluate:
				'() => { const el = document.querySelector("[data-testid=\\"ideacad-parts-notice\\"]"); return [el ? el.getAttribute("data-reason") : "MISSING", el && el.className.includes("terminal") ? "terminal" : "NOT terminal"]; }',
			expected: ['lost', 'terminal']
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-parts-notice"]', label: 'the terminal notice', expectPresent: 1, expectVisible: 1 },
		/* NO DISMISS ON A TERMINAL NOTICE. A student who dismissed "you do not
		   have this part any more" would be back to a surface that looks correct
		   and saves nothing. The positive control is the notice itself, present
		   above -- the block rendered, and the button inside it did not. */
		{ selector: '[data-testid="ideacad-parts-notice"] .dismiss', label: 'Dismiss, refused on a terminal notice', expectPresent: 0 },
		/* THE HOLD CLOCK IS GONE, because there is no hold. A countdown still
		   running under a "you have lost this part" notice is two answers to one
		   question. */
		{ selector: '[data-testid="ideacad-hold-clock"]', label: 'the hold countdown, withdrawn with the hold', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-part-row"]', label: 'every part still listed', expectPresent: 3, expectVisible: 3 },
		/* THE WAY OUT. Two parts are free (the owner took p2 and p1 was never
		   held), so a deliberate re-claim is offered -- the terminal state is a
		   statement, not a dead end. */
		{ selector: '.act.claim', label: 'Take this part, still offered on the free rows', expectPresent: 2, expectVisible: 2 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-parts-notice"]',
			label: 'the sentence says the work is still on screen and what the next press is',
			must: ['still here', 'Take the part again'],
			mustNot: ['undefined', 'NaN', 'Error', 'refused']
		}
	],
	contrast: [
		/* THE HALF THAT ONLY EXISTS IN A BROWSER: a notice nobody can read is a
		   notice that was not rendered, and happy-dom answers "" for every
		   colour. */
		{ selector: '[data-testid="ideacad-parts-notice"] span:last-of-type', label: 'the terminal sentence on its own ground', min: 4.5 },
		{ selector: '[data-testid="ideacad-part-holder"]', label: 'the holder line beside it', min: 4.5 }
	],
	tapTargets: [{ selector: '.act.claim', label: 'Take this part, the way back out of the terminal state' }]
};
