/**
 * THE ARENA BOARD AS A SITE ADMIN (prompt 0110, items 3 and 5).
 *
 * Same fixture, same room; the viewer is signed in and holds the admin
 * grant and NO hosts row. Item 5 is "an admin manages, edits and deletes
 * any tournament regardless of host", and on the board that is one control
 * on every card and the marquee: Manage on all five, and the compact
 * delete control (`DeleteTournament compact`) under all five, because
 * `ondelete` is supplied AND the viewer can manage. "You host this" stays
 * absent -- managing as an admin is not hosting, and the card says nothing
 * it cannot stand behind.
 */
import { BOARD_CONTRAST, BOARD_MOTION, BOARD_ORDER, BOARD_PRESENCE, BOARD_PROBES, BOARD_TAPS, BOARD_WORDS } from './tournaments-view-list.mjs';

export default {
	path: '/dev/tournaments?view=list&signedin=1&admin=1',
	label: 'The arena board as a site admin: Manage and delete on every tournament, host of none',
	settleMs: 900,
	presence: [
		...BOARD_PRESENCE,
		{ selector: '[data-testid="tournament-board"] [data-manage]', label: 'Manage on every tournament (4 cards + the marquee)', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="tournament-board"] .card-admin', label: 'a delete control under every tournament', expectPresent: 5, maxPresent: 5 },
		{ selector: '[data-testid="tournament-board"] .card-admin .trigger', label: 'the armed-in-two-steps delete trigger, at rest', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="board-marquee"] [data-manage]', label: 'Manage on the marquee too', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="tournament-board"] .host-tag', label: 'no "You host this" tag: an admin hosts nothing here', expectPresent: 0 },
		{ selector: '[data-testid="board-invites"]', label: 'the invites section (signed in)', expectPresent: 1, maxPresent: 1 }
	],
	domOrder: BOARD_ORDER,
	contrast: [
		...BOARD_CONTRAST,
		{ selector: '[data-testid="tournament-board"] [data-manage]', label: 'Manage', min: 4.5 },
		/* The delete trigger is DeleteTournament's own (0066): dim ink over
		   the room's panel, measured here because this is the first room the
		   compact form has been mounted in. */
		{ selector: '[data-testid="tournament-board"] .card-admin .trigger', label: 'the delete trigger (dim ink on the card)', min: 4.5 }
	],
	tapTargets: [
		...BOARD_TAPS,
		{ selector: '[data-testid="tournament-board"] [data-manage]', label: 'Manage links', min: 44 },
		/* The compact trigger measured 18.8px before the 0110 fix round, under
		   even the 24px floor; DeleteTournament's `.trigger` / `.cancel` now
		   carry `min-height: 44px` in the component itself, so every mount
		   inherits the floor and this row is an expectation again. */
		{ selector: '[data-testid="tournament-board"] .card-admin .trigger', label: 'the compact delete trigger', min: 44 }
	],
	motion: BOARD_MOTION,
	orderResult: [
		...BOARD_PROBES,
		{
			/* "ON EVERY CARD" is a per-card claim and a count cannot make it:
			   five Manage links could all sit under one card. So each card
			   and the marquee is asked for its own. */
			evaluate: () => {
				const items = Array.from(document.querySelectorAll('[data-testid="board-card"], [data-testid="board-marquee"]'));
				const withManage = items.filter((c) => c.querySelector('[data-manage]')).length;
				const withDelete = items.filter((c) => c.querySelector('.card-admin .trigger')).length;
				return [
					'items:' + items.length,
					'with-manage:' + withManage + '/' + items.length,
					'with-delete:' + withDelete + '/' + items.length
				];
			},
			expected: ['items:5', 'with-manage:5/5', 'with-delete:5/5'],
			label: 'every card and the marquee carries its own Manage and its own delete control'
		}
	],
	textContains: [
		...BOARD_WORDS,
		{ selector: '[data-testid="tournament-board"] .tnm-actions', label: 'Manage appears in the action rows', must: ['Manage', 'Watch', 'Register'] },
		{ selector: '[data-testid="tournament-board"] .card-admin', label: 'the delete control names what it does', must: ['Delete tournament'] },
		{ selector: '[data-testid="tournament-board"]', label: 'an admin who hosts nothing is not told they host', mustNot: ['You host this'], must: ['Manage'] }
	]
};
