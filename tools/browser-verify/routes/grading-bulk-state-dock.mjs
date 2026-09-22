/* NO `order` EXPORT -- see routes.mjs. */

/**
 * LEDGER 0278: THE PINNED RETURN CONTROL, THE PAGER, AND THE TWO COLLAPSED
 * PANELS ABOVE THE NAMES.
 *
 * Three of Mr. Pina's four reports from grading on 2026-09-13 were about REACH
 * rather than about correctness:
 *
 *   - "the closing this assignment and Export graded work sections above the
 *     names take up way too much space to the point where the names are like
 *     microscopic on the screen, I can only see like one student at a time"
 *   - "I want to be able to click the return to student button from anywhere
 *     scrolled on the screen, it should be pinned to the bottom or top when
 *     it's not visible at the very bottom"
 *   - "I want to be able to click the next student button when I finish grading
 *     one student"
 *
 * WHAT ONLY A REAL BROWSER CAN SAY HERE, and it is the whole reason this file
 * exists beside `tests/dom/presence-console-mount.test.ts`. That suite mounts
 * the identical component and asserts the STRUCTURE -- one dock, one Return
 * button, both pager controls present, `aria-disabled` and not `disabled` at the
 * ends, `aria-expanded="false"` on both panels. happy-dom has no layout engine,
 * so every claim below reads zero there and would pass vacuously:
 *
 *   1. THE DOCK ACTUALLY PINS. `position: sticky` in a stylesheet is not a
 *      pinned control: it does nothing without a scrolling ancestor, it does
 *      nothing if an ancestor clips it, and it silently does nothing if its
 *      containing block is shorter than the pane. Only a scrolled page says.
 *   2. AND THE PINNED CONTROL IS CLICKABLE, NOT MERELY VISIBLE. A box with a
 *      height is not a target: `sticky` makes the row POSITIONED, and positioned
 *      siblings paint in TREE order, so every later element in the card can
 *      paint straight over it with an opaque background doing nothing about it
 *      (the notebook grid's sticky header shipped exactly that). So the Return
 *      control is HIT-TESTED at its own centre, which is the only read that can
 *      tell "on screen" from "on top".
 *   3. IT RELEASES AT THE END OF THE RUBRIC rather than hanging over the batch
 *      panel below it. That is what bounds it to `.grade-main`, and a dock
 *      bounded by the score card instead would look identical at rest.
 *   4. THE PANELS ARE COLLAPSED AND THE COUNT IS STILL PAINTED. `aria-expanded`
 *      is assertable without a browser; "the open/closed count still has a box"
 *      is not, and that count is the number he acts on.
 *
 * THE COLUMN DOES NOT SCROLL ON A HARNESS, AND THE SPEC MEASURES WHAT IS
 * THERE. On the real page `.work-col` is its own scroll container above 1024px
 * (the `.cr-app` frame gives it a bounded height); no `/dev` route carries that
 * frame, so here the DOCUMENT scrolls and the dock pins against the viewport.
 * Measured on this tree: both columns report `clientHeight === scrollHeight`, so
 * scrolling the column would move nothing and a spec that tried would report an
 * honest zero about a control that works. Sticky against the document is the
 * same mechanism through the same rules, and it is what a phone gets in any
 * case, so it is the thing driven here.
 */
import { WIDTHS } from './_shared.mjs';

/** Open the first student, which is what mounts the rubric column and the dock. */
const OPEN_FIRST_STUDENT = [
	{
		waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length > 0',
		label: 'the roster has loaded'
	},
	{
		click: '.roster-list li:first-child .roster-row',
		until: '() => !!document.querySelector(".console.split") && !!document.querySelector(".grade-actions")',
		label: 'a student is open, so the rubric column and its dock exist'
	}
];

export default {
	/* `path` IS THE SPEC'S IDENTITY AND `aliasOf` IS THE URL, which is the
	   convention every other state spec here follows: this is a STATE of
	   `/dev/grading-bulk` -- the first student open -- reached by the `prepare`
	   steps below rather than by a query string the harness would have to
	   implement. `?state=dock` never reaches the server. */
	path: '/dev/grading-bulk?state=dock',
	aliasOf: '/dev/grading-bulk',
	label: 'Grading console: the pinned Return control, the student pager, and the two collapsed panels',
	widths: WIDTHS,
	prepare: OPEN_FIRST_STUDENT,

	presence: [
		/* THE TWO PANELS ARE THERE AND CLOSED. Collapsing HIDES rather than
		   removes -- `Disclosure`'s own rule, so the material still prints -- which
		   is why the bodies are asserted PRESENT and NOT VISIBLE rather than
		   absent. Those two numbers together are the whole claim. */
		{
			selector: '[data-testid="work-export-disclosure"]',
			label: 'the export panel trigger',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="work-export"]',
			label: 'the export panel BODY, present but hidden while collapsed',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 0,
			maxVisible: 0
		},
		{
			/* PRESENT AND NOT VISIBLE, which is the whole of what "collapsing hides,
			   it never removes" means: the control is one press away and it still
			   prints, and the zero-box is what says the panel is genuinely shut
			   rather than merely labelled shut. */
			selector: '[data-testid="export-json-class"]',
			label: 'a control inside it, in the DOM but not on screen while collapsed',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 0,
			maxVisible: 0
		},
		/* THE DOCK, AND EXACTLY ONE OF IT. "It must not appear twice when the
		   column does not scroll" is a property of there being a single sticky
		   element rather than a second rendered copy, and this harness is exactly
		   the case that report names: the column here does not scroll. */
		{
			selector: '.grade-actions',
			label: 'the dock, once',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1,
			maxVisible: 1
		},
		{
			selector: '[data-testid="grade-return"]',
			label: 'Return to student, once',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1,
			maxVisible: 1
		},
		{
			selector: '[data-testid="student-next"]',
			label: 'Next student, which existed only on the keyboard before 0278',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="student-prev"]',
			label: 'Previous student',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	],

	tapTargets: [
		{ selector: '[data-testid="grade-return"]', label: 'Return to student', min: 44 },
		{ selector: '[data-testid="student-next"]', label: 'Next student', min: 44 },
		{ selector: '[data-testid="student-prev"]', label: 'Previous student', min: 44 },
		{
			selector: '[data-testid="work-export-disclosure"]',
			label: 'the export panel trigger',
			min: 44
		}
	],

	contrast: [
		/* THE DOCK DRAWS ITS OWN GROUND, so every word in it is measured against
		   that rather than against the card. A transparent dock over scrolling
		   content is two lines of text on top of each other. */
		{ selector: '[data-testid="grade-return"]', label: 'Return to student', min: 4.5 },
		{ selector: '[data-testid="student-next"]', label: 'Next student', min: 4.5 }
		/* NO CLOSE PANEL ON THIS ROUTE. `/dev/grading-bulk` hands the console no
		   `close` transport, so the panel is structurally absent -- absence is the
		   mechanism -- and the collapsed close panel is measured where it exists,
		   on `html-assignment-grading-state-closed`. */
	],

	orderResult: [
		{
			label: 'the dock is a sticky bottom rail bounded by the rubric, not by the card',
			evaluate: `() => {
				const dock = document.querySelector('.grade-actions');
				const main = document.querySelector('.grade-main');
				if (!dock || !main) return ['dock=' + !!dock, 'grademain=' + !!main];
				const cs = getComputedStyle(dock);
				return [
					'position=' + cs.position,
					'bottom=' + cs.bottom,
					/* POSITIONED SIBLINGS PAINT IN TREE ORDER, so a dock at
					   z-index auto is painted over by everything after it. */
					'zIndexAboveAuto=' + (Number(cs.zIndex) > 0),
					/* AN OPAQUE GROUND, or the content scrolling beneath shows
					   through the words. */
					'opaqueGround=' + (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent'),
					/* BOUNDED BY \.grade-main\: the batch panel is further down the
					   same card, and a dock bounded by the card would sit over the
					   batch's own controls once a grader scrolled to them. */
					'boundedByGradeMain=' + (dock.parentElement === main),
					'docks=' + document.querySelectorAll('.grade-actions').length,
					'returnControls=' + document.querySelectorAll('[data-testid="grade-return"]').length
				];
			}`,
			expected: [
				'position=sticky',
				'bottom=0px',
				'zIndexAboveAuto=true',
				'opaqueGround=true',
				'boundedByGradeMain=true',
				'docks=1',
				'returnControls=1'
			]
		},
		{
			label: 'scrolled to the end of the rubric, Return is pinned AND is the thing under the pointer',
			evaluate: `async () => {
				const main = document.querySelector('.grade-main');
				const dock = document.querySelector('.grade-actions');
				const ret = document.querySelector('[data-testid="grade-return"]');
				if (!main || !dock || !ret) return ['setup=false'];
				const settle = () => new Promise((r) => setTimeout(r, 260));

				/*
					DRIVE THE DOCK'S OWN SCROLL CONTAINER, WHICHEVER ONE IT IS, because
					the two widths genuinely have different ones and a probe that
					assumed the viewport would report an honest false about a working
					control at one of them.

					Above 1024px .work-col carries overflow-y: auto, so IT is the
					nearest scrolling ancestor and the dock pins inside that pane --
					which is the arrangement the real page has and the one Mr. Pina
					asked for. Below it the column is overflow: visible and the
					document scrolls, so the dock pins against the viewport.

					AND ON A HARNESS THAT COLUMN NEVER SCROLLS, so its height is FORCED
					here and the forcing is REPORTED. On the real page the column is
					bounded by the .cr-app frame (the layout puts it on the classroom
					wrapper and the console takes what is left under the chrome); no
					/dev route carries that frame, so the column sizes to its content
					and reports clientHeight === scrollHeight -- measured 1412/1412 on
					this route at 1440. Scrolling it would move nothing, and a spec
					that tried would report a zero about a control that works. Bounding
					it reproduces the real page's condition rather than inventing one.
				*/
				let box = dock.parentElement;
				while (box && box !== document.documentElement) {
					const ov = getComputedStyle(box).overflowY;
					if (ov === 'auto' || ov === 'scroll') break;
					box = box.parentElement;
				}
				const inPane = !!box && box !== document.documentElement && box !== document.body;
				let forced = false;
				if (inPane && box.scrollHeight <= box.clientHeight + 1) {
					box.style.height = Math.round(window.innerHeight * 0.55) + 'px';
					box.style.maxHeight = box.style.height;
					forced = true;
					await settle();
				}

				/*
					SCROLL, SETTLE, SCROLL AGAIN, AND REPORT WHAT WAS ACHIEVED.
					Selecting a student lands focus on the first criterion and that
					focus call scrolls: measured, a single scrollTo() to the document
					end came back at scrollY 1080 of a possible 1462, so the probe
					measured a page that had scrolled itself back and reported a sticky
					that does not stick. Two passes put the deliberate scroll last, and
					scrolledToEnd is what says it stayed there.
				*/
				/*
					AIM AT THE BLOCK'S OWN BOTTOM, NOT AT THE CONTAINER'S END, and
					measure the gap rather than computing an absolute target.

					"120px short of the pane's end" is not "120px short of the block's
					end": the batch panel sits below .grade-main inside the same card,
					151px of it on this fixture, so stopping short of the CONTAINER
					still put the block's bottom 31px ABOVE the fold -- measured, and
					it read as a sticky that never pins when the dock had simply and
					correctly released. Scrolling by the difference puts the block's
					bottom exactly NEAR_END below the fold whatever follows it, at
					either width, with no arithmetic about what else is in the box.
				*/
				const NEAR_END = 120;
				const nudge = async () => {
					const foldNow = inPane ? box.getBoundingClientRect().bottom : window.innerHeight;
					const delta = main.getBoundingClientRect().bottom - foldNow - NEAR_END;
					if (inPane) box.scrollTop = Math.max(0, box.scrollTop + delta);
					else window.scrollTo(0, Math.max(0, window.scrollY + delta));
					await settle();
				};
				/* TWICE, because the focus landing after a selection scrolls: measured,
				   a single scrollTo() to the document end came back at scrollY 1080 of
				   a possible 1462, so one pass measures wherever the page put itself. */
				await nudge();
				await nudge();

				/*
					THE FOLD IS THE PANE'S BOTTOM EDGE, not the viewport's, whenever the
					dock pins inside a pane -- so both are read off the same box rather
					than from two different ideas of "the bottom".
				*/
				const fold = inPane ? box.getBoundingClientRect().bottom : window.innerHeight;
				const db = dock.getBoundingClientRect();
				const mb = main.getBoundingClientRect();
				const rb = ret.getBoundingClientRect();
				let hit = 'offscreen';
				if (rb.width > 0 && rb.top >= 0 && rb.bottom <= window.innerHeight) {
					const el = document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2);
					hit = el ? (el.getAttribute('data-testid') || el.tagName) : 'null';
				}
				return [
					/*
						WIDTH-INVARIANT FACTS ONLY, because one expected array is
						compared against BOTH widths and the two genuinely have
						different scroll containers: a pane above 1024px, the document
						below it. Which one it was, and whether the pane had to be
						bounded, is in this row's prose rather than in the assertion --
						a per-width fact in a shared array can only be wrong at one
						of them.
					*/
					'containerPrepared=' + (inPane ? forced || box.scrollHeight > box.clientHeight + 1 : true),
					'containerScrolls=' + (inPane ? box.scrollHeight > box.clientHeight + 1 : document.documentElement.scrollHeight > window.innerHeight),
					/* THE PRECONDITIONS: a bottom sticky lifts only while its block
					   straddles the fold. A false in either is the probe saying it
					   measured the wrong position, not the dock saying it fails. */
					'blockTopAboveTheFold=' + (mb.top < fold - 1),
					'blockStillBelowTheFold=' + (mb.bottom > fold + 1),
					'pinnedToTheFold=' + (Math.abs(db.bottom - fold) < 1.5),
					/* HIT-TESTED, NOT READ OFF A BOX. This is the row that tells a
					   covered control from a clickable one: sticky makes the dock
					   POSITIONED, and positioned siblings paint in tree order. */
					'elementAtReturnCentre=' + hit
				];
			}`,
			expected: [
				'containerPrepared=true',
				'containerScrolls=true',
				'blockTopAboveTheFold=true',
				'blockStillBelowTheFold=true',
				'pinnedToTheFold=true',
				'elementAtReturnCentre=grade-return'
			]
		},
		{
			label: 'at the end of the rubric it sits back down, so it covers nothing',
			evaluate: `async () => {
				const main = document.querySelector('.grade-main');
				const dock = document.querySelector('.grade-actions');
				if (!main || !dock) return ['setup=false'];
				const settle = () => new Promise((r) => setTimeout(r, 260));
				/* PAST THE END OF THE BLOCK, COMPUTED AND RE-AIMED, for the same
				   reason the pinned probe above re-aims: the focus landing after a
				   selection scrolls the page, so one scrollTo measures wherever the
				   page ended up. 20px of clearance above the fold rather than the
				   document end, which can be clamped short on a page with more
				   content below. */
				const aim = () => Math.max(0, window.scrollY + main.getBoundingClientRect().bottom - window.innerHeight + 20);
				window.scrollTo(0, aim());
				await settle();
				const target = aim();
				window.scrollTo(0, target);
				await settle();
				const db = dock.getBoundingClientRect();
				const mb = main.getBoundingClientRect();
				return [
					'scrolledToTarget=' + (Math.abs(window.scrollY - target) < 2),
					/* THE PRECONDITION AGAIN, from the other side. */
					'blockEndedAboveTheFold=' + (mb.bottom <= window.innerHeight + 1),
					/* RELEASED: the dock's bottom is no longer at the viewport edge,
					   which is what "it returns to its flow position" means. */
					'releasedIntoFlow=' + (db.bottom < window.innerHeight - 1.5),
					/* AND IT IS STILL INSIDE ITS OWN BLOCK, never below it. */
					'stillInsideItsBlock=' + (db.bottom <= mb.bottom + 1.5),
					'docks=' + document.querySelectorAll('.grade-actions').length
				];
			}`,
			expected: [
				'scrolledToTarget=true',
				'blockEndedAboveTheFold=true',
				'releasedIntoFlow=true',
				'stillInsideItsBlock=true',
				'docks=1'
			]
		},
		{
			label: 'the pager says which end of the roster it is at, and explains itself rather than going dead',
			evaluate: `() => {
				const prev = document.querySelector('[data-testid="student-prev"]');
				const next = document.querySelector('[data-testid="student-next"]');
				if (!prev || !next) return ['controls=false'];
				return [
					/* THE FIRST STUDENT IS OPEN, so there is no previous one. */
					'prevAriaDisabled=' + prev.getAttribute('aria-disabled'),
					/* AND IT IS NOT GENUINELY DISABLED: a disabled control swallows
					   its own pointer events and can never say why it did nothing. */
					'prevHasDisabledAttribute=' + prev.hasAttribute('disabled'),
					'nextAriaDisabled=' + next.getAttribute('aria-disabled'),
					/* BOTH CARRY A WORD, not only a chevron. */
					'prevHasWord=' + /[A-Za-z]/.test(prev.textContent || ''),
					'nextHasWord=' + /[A-Za-z]/.test(next.textContent || '')
				];
			}`,
			expected: [
				'prevAriaDisabled=true',
				'prevHasDisabledAttribute=false',
				'nextAriaDisabled=false',
				'prevHasWord=true',
				'nextHasWord=true'
			]
		},
		{
			label: 'nothing above the names is clipped: every over-full region there can be scrolled',
			evaluate: `() => {
				const roster = document.querySelector('.roster');
				if (!roster) return ['roster=false'];
				/* A PANE THAT CLIPS ITS OVERFLOW SATISFIES A NO-SCROLL MEASUREMENT BY
				   HIDING THE CONTENT, which is the failure this region's own scroll
				   container exists to prevent -- and the first attempt at the list
				   floor produced exactly it (a 0px-tall tools region with 156px of
				   panels in it). So the check is: no descendant of the roster card
				   holds more than it shows without a way to reach the rest. */
				const clipped = [...roster.children].filter((el) => {
					const cs = getComputedStyle(el);
					const over = el.scrollHeight > el.clientHeight + 1;
					const reachable = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
					return over && !reachable && cs.display !== 'none' && el.clientHeight > 0;
				});
				return [
					/* NAMED, not counted: a bare number here is unactionable, and the
					   first attempt at the list floor produced exactly one of these. */
					'clippedRegions=' + (clipped.length === 0
						? '0'
						: clipped.map((el) => (el.className || el.tagName).toString().split(' ')[0] + '(' + el.clientHeight + '/' + el.scrollHeight + ')').join('+')),
					/* THE POSITIVE CONTROL: the card really is on screen, so the zero
					   above is about clipping and not about a page that never rendered. */
					'rosterHasBox=' + (roster.getBoundingClientRect().height > 0),
					'names=' + (document.querySelectorAll('.roster-item').length > 0)
				];
			}`,
			expected: ['clippedRegions=0', 'rosterHasBox=true', 'names=true']
		}
	]
};
