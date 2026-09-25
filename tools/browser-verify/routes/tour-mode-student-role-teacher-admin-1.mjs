/**
 * THE HOME TOUR, AS A FIRST-TIME STAFF ADMIN GETS IT (ledger 0298, report
 * R22): the other direction of the student spec. The launcher renders the two
 * admin-only cards (Coin Desk, Admin) for this person, so both are steps; the
 * student's to-do door is not on a staff home page, so its step is dropped;
 * and the words are the staff tour's (`homeTourFor`, the classroom's rule),
 * read back off the callout itself.
 */
import {
	CALLOUT_CONTRAST,
	CALLOUT_TAPS,
	FIRST_AND_LAST,
	HIDE_HARNESS_PANEL,
	TOUR_AUTO_LAUNCHED,
	WALK_TOUR,
	bodyAt,
	titlesInclude,
	walkVerdict
} from './_home-tour.mjs';

export default {
	path: '/dev/tour?mode=student&role=teacher&admin=1',
	label: 'Home tour (first-time staff admin): the admin cards are steps, the to-do is not, staff words',
	settleMs: 1500,
	prepare: [HIDE_HARNESS_PANEL, TOUR_AUTO_LAUNCHED, WALK_TOUR],
	presence: [
		{ selector: '[data-testid="tour-callout"]', label: 'the callout, on its last step', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="coin-desk"]', label: 'the admin-only Coin Desk card, rendered for an admin', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-tour="dashboard"]', label: 'the admin-only Admin card, rendered for an admin', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="todo-strip"]', label: 'no student to-do door on a staff home page', expectPresent: 0 },
		{ selector: '[data-tour="profile"]', label: 'POSITIVE CONTROL: the profile menu the tour points at', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: CALLOUT_CONTRAST,
	tapTargets: CALLOUT_TAPS,
	orderResult: [
		{ label: 'every step: target present, on screen, clear of the callout; at least 19 steps', evaluate: walkVerdict(19), expected: ['none', 'true'] },
		{ label: 'opens on the welcome, ends on Take the tour', evaluate: FIRST_AND_LAST, expected: ['Welcome to IDEA', 'Take the tour'] },
		{
			label: 'the admin cards are steps, with the rest of the page',
			evaluate: titlesInclude(['Coin Desk', 'Admin', 'Your profile', 'Your classes', 'Apps', 'Report a problem']),
			expected: ['true', 'true', 'true', 'true', 'true', 'true']
		},
		{ label: 'no to-do step for staff', evaluate: titlesInclude(['Your to-do']), expected: ['false'] },
		{
			label: 'the staff words, not the student words (moves the tour back; runs last)',
			evaluate: bodyAt('Your classes'),
			expected: ['true', 'Every class you teach, with what is waiting to be graded. Open one to post, grade or start a Live class.']
		}
	]
};
