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

	/*
		LEDGER 0278 COLLAPSED THE CLOSE PANEL, SO THIS SPEC OPENS IT.

		"Closing this assignment" is a `Disclosure` now, closed by default, because
		it and the export panel together were taking most of a roster pane and
		leaving one name on screen (Mr. Pina, 2026-09-13). Collapsing HIDES rather
		than removes, so every selector below still matches -- but a hidden element
		has a zero box, which is exactly the state a contrast read and a
		tap-target read report an honest zero about.

		SO THE PANEL IS OPENED AS A PREPARE STEP AND EVERY ASSERTION BELOW IS
		UNCHANGED. That is the point: the controls, their wording, their counts and
		their measurements are the same controls measured the same way, one press
		further in. Deleting the assertions because their subject moved would have
		been the alternative, and it would have silently stopped checking the
		refusal wording and the 44px floor on the two most consequential controls
		on this surface. The collapsed state has its own row, below.
	*/
	prepare: [
		...OPEN_FIRST_STUDENT,
		{
			click: '[data-testid="close-disclosure"]',
			until: `() => document.querySelector('[data-testid="close-disclosure"]')?.getAttribute('aria-expanded') === 'true'`,
			label: 'the close panel is open, which is one press from its collapsed default',
			attempts: 12,
			gapMs: 200
		}
	],

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
					/*
						THE PROPERTY, NOT THE PIXEL. The first draft of this row
						reported the notice's height in pixels and the harness correctly
						called it a finding: it measured 83px at 375 and 62px at 1440,
						so no single expected value can be right at both widths, and
						pinning two would be pinning the font metrics of the fallback
						stack the harness measures in. What is worth asserting is that
						the notice is not a ZERO BOX: present in the DOM and invisible
						on screen is exactly how a sentence nobody reads gets shipped.

						NOTE FOR ANYONE EDITING THIS BLOCK -- it lives inside a TEMPLATE
						LITERAL, so a backtick in a comment here ends the string and the
						module stops parsing. That is how the first attempt at this very
						comment failed, with a SyntaxError naming an identifier three
						lines away.
					*/
					'noticeHasHeight=' + (nb ? nb.height > 0 : false),
					/* The document is still there -- a closed worksheet is read only,
					   never removed. Everything the student wrote is still on screen,
					   which is what the sentence promises. */
					'frames=' + document.querySelectorAll('iframe[data-hx-frame]').length,
					/* A standing fact, not an event. An assertive region would
					   interrupt a reader on every render for something not urgent. */
					'role=' + (notice?.getAttribute('role') ?? 'absent')
				];
			}`,
			expected: [
				'notices=1',
				'kind=closed',
				'aboveFrame=true',
				'noticeHasHeight=true',
				'frames=1',
				'role=status'
			]
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
			label: 'the panel is a real disclosure, and the count it is read for survives collapsing',
			evaluate: `() => {
				const trigger = document.querySelector('[data-testid="close-disclosure"]');
				const counts = document.querySelector('[data-testid="close-counts"]');
				if (!trigger) return ['trigger=absent'];
				const cb = counts ? counts.getBoundingClientRect() : null;
				const body = document.getElementById(trigger.getAttribute('aria-controls') || '');
				return [
					/* A REAL BUTTON WITH THE TWO ATTRIBUTES, never a div plus a
					   document click listener: that shape is mouse-only, invisible to
					   assistive tech, and double-toggles against anything added later. */
					'tag=' + trigger.tagName,
					'hasAriaExpanded=' + trigger.hasAttribute('aria-expanded'),
					'ariaControlsResolves=' + !!body,
					/* A WORD, NOT ONLY A CARET. */
					'labelHasWords=' + /Closing this assignment/.test(trigger.textContent || ''),
					/* THE COUNT IS ON THE TRIGGER ROW, so shutting the panel does not
					   hide whether there is anything left to close -- which is the
					   number a teacher acts on. */
					'countIsOutsideTheBody=' + (!!cb && !!body && !body.contains(counts)),
					'countHasBox=' + (!!cb && cb.width > 0 && cb.height > 0)
				];
			}`,
			expected: [
				'tag=BUTTON',
				'hasAriaExpanded=true',
				'ariaControlsResolves=true',
				'labelHasWords=true',
				'countIsOutsideTheBody=true',
				'countHasBox=true'
			]
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
		{
			/* OPENED BY `prepare`, so this is the panel's CONTENT being on screen
			   rather than merely in the DOM. The collapsed reading is the
			   `grading-bulk?state=dock` spec's, on the export panel, where it is
			   asserted as present-and-not-visible. */
			selector: '[data-testid="close-tool"]',
			label: 'the close control, opened',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="close-disclosure"]',
			label: 'its trigger, which stays on screen either way',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
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
		{ selector: '[data-testid="close-reopen"]', label: 'Reopen', min: 44 },
		{ selector: '[data-testid="close-disclosure"]', label: 'the panel trigger', min: 44 }
	]
};
