/**
 * THE ARENA BOARD, SIGNED IN AS A STUDENT (prompt 0110, item 3).
 *
 * Same fixture and room as `tournaments-view-list.mjs`; the viewer holds an
 * account and nothing else -- no hosts row, no admin grant. What changes is
 * one word and one section: the open card offers "Register" (a link to the
 * event page's `#register` anchor) instead of "Sign in to enter", and the
 * pending invite the harness seeds for a signed-in viewer renders as the
 * invites section with its own display-name field and Accept / Decline.
 * Manage and delete stay absent: the transports are supplied, and the
 * component withholds the controls because this viewer manages nothing.
 */
import { BOARD_CONTRAST, BOARD_MOTION, BOARD_ORDER, BOARD_PRESENCE, BOARD_PROBES, BOARD_TAPS, BOARD_WORDS } from './tournaments-view-list.mjs';

export default {
	path: '/dev/tournaments?view=list&signedin=1',
	label: 'The arena board, signed in: Register on the open card, an invite to answer, nothing to manage',
	settleMs: 900,
	presence: [
		...BOARD_PRESENCE,
		{ selector: '[data-testid="board-lane-open"] a[data-register][href$="#register"]', label: 'Register links to the event page register anchor', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="board-invites"]', label: 'the invites section (one pending invite seeded)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="board-invites"] .invite-row', label: 'one invite row', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="board-invites"] .invite-input', label: 'the display-name field on the invite', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="board-invites"] .btn', label: 'Accept and Decline', expectPresent: 2, maxPresent: 2 },
		/* ABSENCE IS THE MECHANISM, and here it is the component's own gate
		   rather than a missing transport: `ondelete` IS handed in on this
		   view, and the control still renders only where the viewer can
		   manage. A student who manages nothing sees no Manage and no delete.
		   The Register link and the invite controls above are the positive
		   controls. */
		{ selector: '[data-testid="tournament-board"] [data-manage]', label: 'Manage links for a viewer who manages nothing', expectPresent: 0 },
		{ selector: '[data-testid="tournament-board"] .card-admin', label: 'delete controls for a viewer who manages nothing (transport supplied)', expectPresent: 0 }
	],
	domOrder: [
		...BOARD_ORDER,
		{ before: '[data-testid="board-invites"]', after: '[data-testid="board-lane-live"]', label: 'the invites section sits above the lanes' }
	],
	contrast: [
		...BOARD_CONTRAST,
		{ selector: '[data-testid="board-lane-open"] a[data-register]', label: 'Register', min: 4.5 },
		{ selector: '[data-testid="board-invites"] h2', label: 'invites heading', min: 4.5 },
		{ selector: '[data-testid="board-invites"] .invite-name', label: 'the invited tournament name', min: 4.5 },
		{ selector: '[data-testid="board-invites"] .btn.secondary', label: 'Decline', min: 4.5 }
	],
	tapTargets: [
		...BOARD_TAPS,
		{ selector: '[data-testid="board-invites"] .btn', label: 'Accept / Decline', min: 44 },
		/* The field is measured at its label, which is what a finger hits. */
		{ selector: '[data-testid="board-invites"] .invite-field', label: 'the invite display-name field', min: 44 }
	],
	motion: BOARD_MOTION,
	orderResult: BOARD_PROBES,
	textContains: [
		...BOARD_WORDS,
		{ selector: '[data-testid="board-lane-open"] .tnm-actions', label: 'the open card offers Register, never a sign-in prompt', must: ['Register', 'Watch'], mustNot: ['Sign in to enter'] },
		{ selector: '[data-testid="board-invites"]', label: 'the invite names its tournament and both answers', must: ['Your invites', 'IDEA100 Hook Design Open', 'Accept', 'Decline'] },
		{ selector: '[data-testid="tournament-board"]', label: 'nothing on the board manages, deletes or hosts', mustNot: ['Manage', 'Delete tournament', 'You host this'], must: ['Watch'] }
	]
};
