/**
 * THE HOME TOUR, AS A FIRST-TIME TEACHER WHO IS NOT AN ADMIN GETS IT (ledger
 * 0298, report R22): the case between the other two walks. This person gets
 * the STAFF words (`homeTourFor`: the email domain's `teacher` role alone is
 * enough) and the STUDENT-FACING cards only, because the launcher renders the
 * two admin-only cards (Coin Desk, Admin) for an admin and for nobody else --
 * a teacher is not an admin (0067). So the absence of both admin cards is
 * measured here with GAUNTLET's card as its positive control, and the staff
 * words are read back off the callout, with the admin spec as the other
 * direction of the first and the student spec the other direction of the
 * second.
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
	path: '/dev/tour?mode=student&role=teacher',
	label: 'Home tour (first-time teacher, not an admin): staff words, no admin card, no to-do',
	settleMs: 1500,
	prepare: [HIDE_HARNESS_PANEL, TOUR_AUTO_LAUNCHED, WALK_TOUR],
	presence: [
		{ selector: '[data-testid="tour-callout"]', label: 'the callout, on its last step', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="gauntlet"]', label: 'POSITIVE CONTROL: a student-facing card the tour names', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-tour="coin-desk"]', label: 'the admin-only Coin Desk card is not rendered for a teacher', expectPresent: 0 },
		{ selector: '[data-tour="dashboard"]', label: 'the admin-only Admin card is not rendered for a teacher', expectPresent: 0 },
		{ selector: '[data-testid="todo-strip"]', label: 'no student to-do door on a staff home page', expectPresent: 0 },
		{ selector: '[data-tour="profile"]', label: 'POSITIVE CONTROL: the profile menu the tour points at', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: CALLOUT_CONTRAST,
	tapTargets: CALLOUT_TAPS,
	orderResult: [
		{ label: 'every step: target present, on screen, clear of the callout; at least 17 steps', evaluate: walkVerdict(17), expected: ['none', 'true'] },
		{ label: 'opens on the welcome, ends on Take the tour', evaluate: FIRST_AND_LAST, expected: ['Welcome to IDEA', 'Take the tour'] },
		{
			label: 'the page a teacher can see is walked',
			evaluate: titlesInclude(['Your profile', 'Your classes', 'Apps', 'IDEA // GAUNTLET', 'Report a problem', 'Take the tour']),
			expected: ['true', 'true', 'true', 'true', 'true', 'true']
		},
		{
			label: 'no admin card and no to-do step for a teacher who is not an admin',
			evaluate: titlesInclude(['Coin Desk', 'Admin', 'Your to-do']),
			expected: ['false', 'false', 'false']
		},
		{
			label: 'the staff words, not the student words (moves the tour back; runs last)',
			evaluate: bodyAt('Your classes'),
			expected: ['true', 'Every class you teach, with what is waiting to be graded. Open one to post, grade or start a Live class.']
		}
	]
};
