/**
 * STUDENT ACTIVITY WITH NAMES, THE SECOND OPT-IN (reports R12, R13). The
 * teacher pressed Student activity AND Names too. The wall names the students
 * who are not typing, away, have not opened the work, or are done, as
 * "First L.", and NEVER the students who are working.
 *
 * WHAT IS MEASURED:
 *   - the counts, then the names per group, read off the painted wall: the
 *     live grid's own fixture, shortened (Cruz D. and Kim S. not typing, Hana
 *     I. away, Gus V. not opened, Eli N., Fay O. and Ivan P. done);
 *   - the student OUT ON THE HALL PASS (Ana) is counted under Away and never
 *     named: the wall says the pass is Taken and never who took it, and an
 *     Away list naming her would say it for it;
 *   - no names under Working, and none of the four working students' names
 *     anywhere on the wall in any spelling;
 *   - no address anywhere; names clear 4.5:1; the wall fits and 8H holds.
 */
import { EIGHT_H, PROJECTOR_READY, WALL_CARDS_FIT, WALL_FITS_ANY, WALL_NAMES } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=names',
	label: 'Class projector: student activity with names, the second opt-in (R12, R13)',
	prepare: [PROJECTOR_READY, { waitFor: `() => !!document.querySelector('[data-testid="projector-names"]')`, timeoutMs: 10000 }],
	orderResult: [
		{
			label: 'counts, then names per group, never under Working',
			evaluate: WALL_NAMES,
			expected: [
				'working 4',
				'idle 2',
				'away 2',
				'not-opened 1',
				'done 3',
				'idle: Cruz D., Kim S.',
				'away: Hana I.',
				'not-opened: Gus V.',
				'done: Eli N., Fay O., Ivan P.'
			]
		},
		{
			label: 'the working students and the student on the hall pass are named nowhere on the wall, and no address appears',
			evaluate: `() => { const t = document.body.innerText; const working = ['Ben Okafor', 'Ben O.', 'Dee Marsh', 'Dee M.', 'Jo Lindqvist', 'Jo L.', 'Lee Amari', 'Lee A.', 'Ana Reyes', 'Ana R.']; const found = working.filter((n) => t.includes(n)); return [found.length ? 'named: ' + found.join(', ') : 'no working student named', t.includes('@') ? 'an address' : 'no address']; }`,
			expected: ['no working student named', 'no address']
		},
		{ label: 'every card holds its content', evaluate: WALL_CARDS_FIT, expected: ['every card holds its content', 'the side column holds its cards'] },
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: '[data-testid="projector-names"]', label: 'four named groups', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="projector-names"][data-key="working"]', label: 'no names under Working', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lp-name', label: 'names', min: 4.5, all: true },
		{ selector: '.lp-namegroup-word', label: 'group words', min: 4.5, all: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
