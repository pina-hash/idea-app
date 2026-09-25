/**
 * WHAT A STUDENT OWES, ONE ANSWER ON THREE SURFACES (ledger 0298, R14 + R27).
 *
 * R14: a check-in hanging off the day's material counted "1 missing" on My
 * Classes and the to-do and 0 on the class page, with no row showing it. R27:
 * a ported HTML worksheet has no turn-in, so a finished one read Missing. At
 * 8pm Pacific on the 24th, over the harness's fixture:
 *   - the class page's Missing chip and My Classes' "N missing" are the same
 *     number (the material's check-in, the half-done worksheet, the empty
 *     reading log);
 *   - the material carries "Check-in: Not filed yet" on its own row;
 *   - a worksheet finished before its deadline reads "Complete", one finished
 *     after it "Complete, late", a half-done one and an empty one (whose
 *     manifest asks for no sentences) "Missing";
 *   - the teacher's feed card counts the finished worksheets to grade: three on
 *     the gears worksheet (Ana, Bruno, Carla; not Dev, who did half), one on
 *     the bearings worksheet (Ana, late), none on the shafts worksheet, where
 *     Bruno's answer to the half Ana left empty must not finish hers.
 */
import { STANDING, STANDING_MISSING, STANDING_READY, STANDING_ROWS } from './_classroom-standing.mjs';

export default {
	path: STANDING,
	label: 'What a student owes: class page, My Classes and the teacher tally agree',
	prepare: [STANDING_READY],
	orderResult: [
		{
			label: 'four finished worksheets across the class, from the real completeness read',
			evaluate: `() => [document.querySelector('[data-testid="standing-ready"]')?.getAttribute('data-completions')]`,
			expected: ['4']
		},
		{
			label: 'the class page Missing count is the to-do count',
			evaluate: STANDING_MISSING,
			expected: ['3', '3 missing']
		},
		{
			label: 'each row says where it stands, the material by its check-in',
			evaluate: STANDING_ROWS,
			expected: [
				'Bearing worksheet | Complete, late | -',
				'Day 24: gear trains | - | Check-in: Not filed yet',
				'Gear ratio worksheet | Complete | -',
				'Reading log | Missing | -',
				'Shaft worksheet | Missing | -'
			]
		},
		{
			label: 'Done counts the two finished worksheets',
			evaluate: `() => [document.querySelector('[data-testid="standing-student"] [data-testid="stream-status-done"] .find-count')?.textContent.trim()]`,
			expected: ['2']
		},
		{
			// Every flag on the teacher's card: the two tallies, the header's
			// "need attention" (those two rows and nothing else), and the material
			// on the reference shelf. The half-done shafts and the empty reading
			// log earn no row at all.
			label: 'the teacher tally counts the finished worksheets and nothing else',
			evaluate: `() => [...document.querySelectorAll('[data-testid="standing-teacher"] .feed-flag')].map((f) => f.textContent.trim()).sort()`,
			expected: ['1 to grade', '2 need attention', '3 to grade', 'Reference']
		}
	],
	presence: [
		{ selector: '[data-testid="standing-student"] [data-testid="item-row"]', label: 'class rows', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="item-check-in-status"]', label: 'the check-in chip on the material', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="item-check-in-status"][data-missing="true"] .chip-mark', label: 'a mark beside the missing check-in word', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="work-status"][data-missing="true"]', label: 'missing work chips', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="standing-student"] [data-testid="stream-status"]', label: 'status chips', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="item-check-in-status"]', label: 'check-in chip', min: 4.5 },
		{ selector: '[data-testid="work-status"]', label: 'work chips', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="standing-student"] .find-chip', label: 'status chips' }]
};
