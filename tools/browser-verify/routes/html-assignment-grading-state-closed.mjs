/**
 * A CLOSED ASSIGNMENT, ON THE ROSTER AND ON THE DOCUMENT (0198).
 *
 * WHAT WOULD FAIL SILENTLY HERE. `submitted` means two different things now --
 * a student turned their work in, or an instructor closed the assignment on
 * them -- and the console had one word for it. A roster printing "Submitted"
 * over a student who never handed anything in tells a teacher something that is
 * not true, and nothing on screen reports it: the chip renders, the layout is
 * right, and only the meaning is wrong. `tests/html-assignment-lock.test.ts`
 * pins the vocabulary; what a browser settles is that the word is ON SCREEN,
 * legible against the plate it actually lands on, and that the notice is above
 * the document rather than below it.
 *
 * THE NOTICE IS THE HALF THAT MATTERS MOST. A student who finds their work
 * frozen with no explanation reports it as a bug -- so the sentence is measured
 * for contrast and for POSITION, and a rasterized check is the only thing that
 * can say it is above the frame rather than merely earlier in the DOM.
 *
 * ITS OWN SPEC RATHER THAN A STATE INSIDE `html-assignment-grading.mjs`,
 * because a route spec measures ONE URL and "here is the work" and "this is
 * closed" are two different claims about two different fixtures.
 */
import { OPEN_FIRST_STUDENT } from './html-assignment-grading.mjs';

export default {
	path: '/dev/html-assignment-grading?state=closed',
	/* NO `aliasOf`: the state is carried in the query string, and `urlFor` would
	   visit the base path and measure the default fixture under this name. */
	label: 'Grading console: an assignment the teacher has closed',

	prepare: OPEN_FIRST_STUDENT,

	orderResult: [
		{
			label: 'the notice sits ABOVE the document, and the frame is still mounted',
			evaluate: `() => {
				const notice = document.querySelector('[data-hx-lock]');
				const frame = document.querySelector('iframe[data-hx-frame]');
				const nb = notice ? notice.getBoundingClientRect() : null;
				const fb = frame ? frame.getBoundingClientRect() : null;
				return [
					'notices=' + document.querySelectorAll('[data-hx-lock]').length,
					'kind=' + (notice?.getAttribute('data-hx-lock') ?? 'absent'),
					/* RASTERIZED, not DOM order: the claim is what a student sees. */
					'aboveFrame=' + (nb && fb ? nb.bottom <= fb.top : false),
					'noticeHeight=' + (nb ? Math.round(nb.height) : 0),
					/* The document is still there -- a closed worksheet is read only,
					   never removed. Everything the student wrote is still on screen,
					   which is what the sentence promises. */
					'frames=' + document.querySelectorAll('iframe[data-hx-frame]').length,
					/* A standing fact, not an event. An assertive region would
					   interrupt a reader on every render for something not urgent. */
					'role=' + (notice?.getAttribute('role') ?? 'absent')
				];
			}`,
			expected: ['notices=1', 'kind=closed', 'aboveFrame=true', 'frames=1', 'role=status']
		},
		{
			label: 'the roster says Closed, not Submitted',
			evaluate: `() => {
				const words = [...document.querySelectorAll('.roster-chip')].map((c) => c.textContent.trim());
				return [
					'closedChips=' + words.filter((w) => w === 'Closed').length,
					/* THE NEGATIVE CONTROL, and it is the whole point of the row: the
					   old code printed this word for exactly this fixture. */
					'submittedChips=' + words.filter((w) => w === 'Submitted').length
				];
			}`,
			expected: ['closedChips=1', 'submittedChips=0']
		},
		{
			label: 'the close control is armed in two steps and names a real count',
			evaluate: `() => {
				const tool = document.querySelector('[data-testid="close-tool"]');
				const counts = document.querySelector('[data-testid="close-counts"]');
				return [
					'tools=' + document.querySelectorAll('[data-testid="close-tool"]').length,
					/* ARM FIRST: no confirm on screen until something is pressed. */
					'confirms=' + document.querySelectorAll('[data-testid="close-confirm"]').length,
					'armButtons=' + document.querySelectorAll('[data-testid="close-arm"]').length,
					/* Offered only because there IS something closed to reopen. */
					'reopenButtons=' + document.querySelectorAll('[data-testid="close-reopen"]').length,
					/* The order note is on screen WITHOUT arming, because a teacher
					   has to read it before deciding rather than after. */
					'orderNote=' + (tool && /Grade first/.test(tool.textContent) ? 'yes' : 'no'),
					'counts=' + (counts ? counts.textContent.replace(/\\s+/g, ' ').trim() : 'absent')
				];
			}`,
			/* 2 on the roster, 1 closed by the fixture, so 1 open. Read off the
			   roster on screen rather than off anything a transport reported. */
			expected: [
				'tools=1',
				'confirms=0',
				'armButtons=1',
				'reopenButtons=1',
				'orderNote=yes',
				'counts=1 open · 1 closed'
			]
		}
	],

	presence: [
		{
			selector: '[data-hx-lock]',
			label: 'the lock notice above the document',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{ selector: '[data-testid="close-tool"]', label: 'the close control', expectPresent: 1, maxPresent: 1 },
		/*
			THE POSITIVE CONTROL FOR THE WHOLE SPEC. Every row above would also hold
			on a console that had stopped rendering the grading half; the rubric
			being there is what says this is the working pane.
		*/
		{ selector: '[data-grade-level]', label: 'the rubric level buttons', expectPresent: 3 },
		/* A closed worksheet is READ ONLY, never emptied. */
		{ selector: 'iframe[data-hx-frame]', label: 'the document, still mounted', expectPresent: 1, maxPresent: 1 }
	],

	textContains: [
		{
			selector: '[data-hx-lock]',
			label: 'the sentence says who closed it and that the work is still there',
			must: ['teacher', 'read only', 'still here'],
			/* AND NEVER THIS. The ported refusal used to say "Unsubmit to keep
			   working", which names a control that has never existed on this
			   surface for a hand-in the student never made. */
			mustNot: ['Unsubmit', 'unsubmit']
		}
	],

	contrast: [
		{ selector: '[data-hx-lock]', label: 'the lock notice on its own plate', min: 4.5 },
		{ selector: '.roster-chip.closed', label: 'the Closed chip, which is a word and not only a hue', min: 4.5 },
		{ selector: '[data-testid="close-counts"]', label: 'the open/closed counts', min: 4.5 },
		{ selector: '.close-order', label: 'the grade-first-then-close sentence', min: 4.5 }
	],

	tapTargets: [
		/* A student-facing surface is 44px at every width; this console is
		   instructor-only but declares no reduced-density class, so by the
		   standard's own rule it is measured at 44 like everything else. */
		{ selector: '[data-testid="close-arm"]', label: 'Close assignment', min: 44 },
		{ selector: '[data-testid="close-reopen"]', label: 'Reopen', min: 44 }
	]
};
