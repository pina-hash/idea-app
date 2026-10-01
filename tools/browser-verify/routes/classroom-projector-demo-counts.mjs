/**
 * STUDENT ACTIVITY ON THE WALL, AS COUNTS (reports R12, R13). The teacher
 * pressed Student activity and NOT Names too: the wall shows five counts in
 * the class's own words and names nobody. The cells are built by the REAL
 * `liveCells` over the live harness's own fixture (the twelve students, their
 * presence and their hand-ins), and the frame by the real
 * `buildProjectorFrame`, so the counts are the grid's.
 *
 * WHAT IS MEASURED:
 *   - the five count tiles, in order, with the fixture's counts (4 working,
 *     2 not typing, 2 away, 1 not opened yet, 3 done), which are the live
 *     grid's own groups (`classroom-live`: idle 2, away 2, not-opened 1,
 *     working 4, needs-grading 1, submitted 2);
 *   - no names under any group (the absence), and the ONE roster name on the
 *     whole wall is the pick the teacher chose to show (its positive control:
 *     the probe does find a name when one is there), no address anywhere;
 *   - the "as of" time beside the item, the wall fitting, every card holding its content, the
 *     8H rule, and the count numerals and words clearing their floors.
 */
import { EIGHT_H, PROJECTOR_READY, ROSTER_ON_WALL, WALL_CARDS_FIT, WALL_FITS_ANY, WALL_NAMES } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=counts',
	label: 'Class projector: student activity as counts, names off (R12, R13)',
	prepare: [PROJECTOR_READY, { waitFor: `() => !!document.querySelector('[data-testid="projector-activity"]')`, timeoutMs: 10000 }],
	orderResult: [
		{
			label: 'five counts in order, and no names',
			evaluate: WALL_NAMES,
			expected: ['working 4', 'idle 2', 'away 2', 'not-opened 1', 'done 3']
		},
		{ label: 'roster names and addresses on the wall: only the shown pick', evaluate: ROSTER_ON_WALL, expected: ['Cruz Delgado', 'no address'] },
		{
			label: 'the counts say when they were read',
			evaluate: `() => [/^as of \\d{1,2}:\\d\\d (AM|PM)$/.test(document.querySelector('[data-testid="projector-activity-asof"]')?.textContent.trim() ?? '') ? 'as of a time' : 'no as-of line: ' + (document.querySelector('[data-testid="projector-activity-asof"]')?.textContent ?? 'none')]`,
			expected: ['as of a time']
		},
		{ label: 'every card holds its content', evaluate: WALL_CARDS_FIT, expected: ['every card holds its content', 'the side column holds its cards'] },
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: '[data-testid="projector-activity"]', label: 'the activity card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-count"]', label: 'five counts', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="projector-names"], .lp-name', label: 'no names with the second toggle off', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lp-count', label: 'count numerals', min: 4.5, all: true },
		{ selector: '.lp-tile-word', label: 'count words', min: 4.5, all: true },
		{ selector: '.lp-act-item', label: 'the item counted', min: 4.5 },
		{ selector: '.lp-asof', label: 'as of', min: 4.5 },
		{ selector: '.lp-label', label: 'card labels', min: 4.5, all: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
