/**
 * THE HOME TOUR, AS A FIRST-TIME STUDENT GETS IT (ledger 0298, report R22),
 * walked with Next from the first step to the last on the REAL home page.
 *
 * Every step points at a control that is present, on screen, reachable and
 * not under the callout (`WALK_TOUR`, the classroom walk, same engine), and
 * the steps are the ones this student can see: one per app card the launcher
 * renders for them, the to-do door, the profile menu, Report and Take the
 * tour -- and NOT the two admin-only cards, which this student's launcher does
 * not render and the tour must not name. That absence has its positive
 * control beside it (GAUNTLET's card, and the staff spec, where both admin
 * cards are steps). The quick note is not in this tree (it arrives with the
 * notebook bundle), so its step is dropped, which is the engine's rule for a
 * control that is not on the page.
 *
 * A student's apps sit above their classes, so the body is walked in page
 * order: the to-do, the app strip and cards, then the classes.
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
	walkVerdict,
	walkedBefore
} from './_home-tour.mjs';

export default {
	path: '/dev/tour?mode=student&state=walk',
	aliasOf: '/dev/tour?mode=student',
	label: 'Home tour (first-time student): every step on screen, no staff-only step, walked in page order',
	settleMs: 1500,
	prepare: [HIDE_HARNESS_PANEL, TOUR_AUTO_LAUNCHED, WALK_TOUR],
	presence: [
		{ selector: '[data-testid="tour-callout"]', label: 'the callout, on its last step', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="gauntlet"]', label: 'POSITIVE CONTROL: a student-facing card the tour names', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-tour="coin-desk"]', label: 'the admin-only Coin Desk card is not rendered for a student', expectPresent: 0 },
		{ selector: '[data-tour="dashboard"]', label: 'the admin-only Admin card is not rendered for a student', expectPresent: 0 },
		{ selector: '[data-testid="todo-strip"]', label: 'the to-do door the tour points at', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="profile"]', label: 'the profile menu the tour points at', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="report"]', label: 'the Report control the tour points at', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tour-offer"]', label: 'no offer row: a first visit runs the tour instead', expectPresent: 0 }
	],
	contrast: CALLOUT_CONTRAST,
	tapTargets: CALLOUT_TAPS,
	orderResult: [
		{ label: 'every step: target present, on screen, clear of the callout; at least 18 steps', evaluate: walkVerdict(18), expected: ['none', 'true'] },
		{ label: 'opens on the welcome, ends on Take the tour', evaluate: FIRST_AND_LAST, expected: ['Welcome to IDEA', 'Take the tour'] },
		{
			label: 'the steps a student can see are all walked',
			evaluate: titlesInclude(['Your profile', 'Your to-do', 'Apps', 'Your classes', 'Report a problem', 'Take the tour', 'IdeaCAD', 'IDEA // FOUNDRY', 'IDEA Maps']),
			expected: ['true', 'true', 'true', 'true', 'true', 'true', 'true', 'true', 'true']
		},
		{
			label: 'no staff-only step (Coin Desk, Admin), and no quick note on a build without one',
			evaluate: titlesInclude(['Coin Desk', 'Admin', 'Note']),
			expected: ['false', 'false', 'false']
		},
		{ label: 'page order: the to-do before the apps', evaluate: walkedBefore('Your to-do', 'Apps'), expected: ['true'] },
		{ label: 'page order: a student gets the apps before the classes', evaluate: walkedBefore('Apps', 'Your classes'), expected: ['true'] },
		{
			label: 'the student words, not the staff words (moves the tour back; runs last)',
			evaluate: bodyAt('Your classes'),
			expected: ['true', 'What each teacher posted, what is due next and work handed back. Open a class to see its work unit by unit.']
		}
	]
};
