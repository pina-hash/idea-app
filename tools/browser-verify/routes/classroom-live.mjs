/**
 * THE TEACHER'S LIVE CLASS, ON THE IDEA THEME (ledger 0297, package LIVE),
 * inside the REAL ClassroomShell with the class's own tabs and Live current.
 *
 * WHAT IS MEASURED:
 *   - who is working on today's assignment, in the order a teacher acts on it
 *     (idle first, handed in last): 2 idle, 2 away, 1 not opened, 4 working,
 *     1 needing grading, 2 handed in -- the twelve students, from presence
 *     offsets against the real clock and the fixture's hand-ins;
 *   - the teacher enrolled in their own class and the student who left are
 *     NOT rows, beside the twelve who are (the absence and its positive control);
 *   - the chosen item is an assignment, so the "Materials send no presence"
 *     chip is absent (its presence is `classroom-live-item-i-levers`);
 *   - the Live tab is the current one, and the agenda holds today's check-in,
 *     what was posted today, what opens later (held back) and what is due;
 *   - every control and every row clears 44px (the surface declares no
 *     instructor density class, so it is held to the student floor).
 */
import { LIVE_GROUPS, LIVE_NAMES, LIVE_READY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-live',
	label: 'Live class control view: who is working, timer, hall pass, agenda, pick',
	prepare: [LIVE_READY],
	orderResult: [
		{
			label: 'the groups, in the order a teacher acts on them, with their counts',
			evaluate: LIVE_GROUPS,
			expected: ['idle 2', 'away 2', 'not-opened 1', 'working 4', 'needs-grading 1', 'submitted 2']
		},
		{
			label: 'the twelve active students and nobody else',
			evaluate: LIVE_NAMES,
			expected: [
				'Ana Reyes',
				'Ben Okafor',
				'Cruz Delgado',
				'Dee Marsh',
				'Eli Nakamura',
				'Fay Obi',
				'Gus Varga',
				'Hana Ito',
				'Ivan Petrov',
				'Jo Lindqvist',
				'Kim Soto',
				'Lee Amari'
			]
		},
		{
			label: "today's agenda: the check-in, what was posted, what opens later (held back), what is due",
			evaluate: `() => [...document.querySelectorAll('[data-testid="live-agenda-line"]')].map((l) =>
				(() => { const c = l.querySelector('.lc-line-text').cloneNode(true); c.querySelector('.lc-line-when')?.remove(); return c.textContent.replace(/\\s+/g, ' ').trim(); })() + ' / ' + (l.querySelector('[data-testid="live-agenda-toggle"]').getAttribute('aria-pressed') === 'true' ? 'shown' : 'hidden'))`,
			expected: [
				'Notebook check-in: Gearbox teardown / shown',
				'Slides: levers and linkages / shown',
				'Quiz 2: gear ratios / hidden',
				'Truss sketch / shown'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="live-control"]', label: 'the control view', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-cell"]', label: 'rows on the grid', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '[data-testid="live-cell"]:has(.lg-name)', label: 'rows with a name', expectPresent: 12, maxPresent: 12 },
		{ selector: '[data-testid="live-no-signal"]', label: 'no "no presence" chip on an assignment', expectPresent: 0 },
		{ selector: '[data-testid="live-open-projector"]', label: 'the Open projector control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-timer"], [data-testid="live-hall"], [data-testid="live-agenda"], [data-testid="live-work"], [data-testid="live-picker"]', label: 'the five panels', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '.shell-tab[aria-current="page"], [aria-current="page"]', label: 'a current tab', expectPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="live-control"]', label: 'the manager and the student who left are not on the grid', must: ['Who is working'], mustNot: ['Mr. Pina', 'Max Left'] },
		{ selector: '[aria-current="page"]', label: 'the current tab is Live', must: ['Live'] },
		{ selector: '[data-testid="live-hall-wall"]', label: 'the wall says the pass is taken, in the student word', must: ['On the wall', 'Taken'], mustNot: ['Ana'] }
	],
	contrast: [
		{ selector: '.lc-root .lc-panel-title', label: 'panel title', min: 4.5 },
		{ selector: '.lc-root .lg-name', label: 'student name', min: 4.5 },
		{ selector: '.lc-root .lg-detail', label: 'row detail', min: 4.5 },
		{ selector: '.lc-root .lg-chip', label: 'tally chip', min: 4.5 },
		{ selector: '.lc-root .lc-line-text', label: 'agenda line', min: 4.5 },
		{ selector: '.lc-root .lc-clock', label: 'clock', min: 4.5 },
		{ selector: '.lc-root .lc-wall-state', label: 'projector state', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.lc-root button', label: 'buttons' },
		{ selector: '.lc-root select', label: 'item chooser' },
		{ selector: '.lc-root input', label: 'text inputs' },
		{ selector: '.lc-root a', label: 'links' }
	],
	ignoreConsole: [
		/* The shell asks for web fonts; the harness blocks every non-loopback request. */
		'Failed to load resource: net::ERR_FAILED'
	]
};
