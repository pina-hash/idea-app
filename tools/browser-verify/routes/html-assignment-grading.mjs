/**
 * THE GRADING CONSOLE'S WORK PANE ON A PORTED HTML ASSIGNMENT, MEASURED.
 *
 * WHAT WAS WRONG. Measured in production at `89b8154` on 2026-09-10: opening
 * `/classroom/<s>/item/<i>/grade` on a schema-3 assignment gave a roster
 * reading "In progress", a rubric that rendered, and an EMPTY WORK PANE.
 * Mr. Pina could not grade at all. Every layer above the screen was correct --
 * the responses were stored, the manifest was stored, `GradingConsole` had
 * carried its `htmlWork` seam since 0195 -- and the grade load simply never
 * asked whether the item was a ported document. That is precisely the class of
 * defect `svelte-check` cannot see and a unit test of either component passes
 * straight through, which is why the claim is settled here.
 *
 * AND WHY A CONTENT CHECK WOULD NOT HAVE BEEN ENOUGH. The first version of
 * this pane put the document BESIDE the rubric, in the two-column arrangement a
 * spec render uses. Every content assertion passed: the frame was present, it
 * was ready, it was listening, the seeded values were in it. RASTERIZED, it was
 * 275px wide with the worksheet's own headings wrapping over three lines --
 * unusable, and invisible to every check that reads text. So this spec measures
 * the WIDTH of the frame, and the number is the finding rather than a pass.
 *
 * THE CAP IS THE CONSOLE'S OWN, WHICH IS WHY THE FIX WAS AN ARRANGEMENT AND NOT
 * A RATIO. Measured on the real console at two viewport widths:
 * `main.cr-console` caps itself at 960px (nav.ts's `console` measure), so the
 * roster takes 320 and the work split gets 562 AT 1440 AND AT 1920 ALIKE. Split
 * `1.05fr : 1fr` that is 280px of document at every width there will ever be.
 * The wide arrangement never has room, so it is dropped here rather than
 * lowered into two columns too narrow to read.
 *
 *   before  frame 275px wide at 1440, 275px at 1920
 *   after   frame 562px wide at 1440, 562px at 1920, rubric stacked below
 *
 * THE THREE STATES, each its own URL because a route spec measures one:
 *
 *   (default)      Alice, who has answers and a photograph.
 *   ?state=empty   Bruno, who has nothing. The document must render EMPTY --
 *                  `0 value(s)` -- rather than the pane going blank, because
 *                  "has not started" and "started and cleared it" are the same
 *                  state and a blank pane reads as lost work.
 *   ?state=broken  The photograph points at bytes that will not decode, so the
 *                  fallback row is measured rather than assumed. That branch is
 *                  not hypothetical: the first fixture PNG here was valid
 *                  base64 carrying malformed PNG and silently put this row on
 *                  screen in the state meant to show a working thumbnail.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT: that grading writes anything. Nothing
 * on this page holds a Supabase client. The write path is proven against real
 * Postgres in `tests/db/`, and the seeding projections in
 * `tests/html-assignment-grading.test.ts`.
 */
/**
 * OPEN THE FIRST STUDENT, RETRYING AGAINST THE EFFECT RATHER THAN A TIMER.
 * Paint is not interactivity and no marker separates them: the roster is on
 * screen before hydration attaches a handler, so a single click after a fixed
 * delay lands on a dead row about half the time. The predicate names something
 * only the click can produce -- the work pane does not exist at rest -- so a
 * step that reached no state is a finding rather than a silent pass.
 */
export const OPEN_FIRST_STUDENT = [
	/*
		THE ROSTER ARRIVES FROM A TRANSPORT, so it is not on screen when the
		document is. Measured: at 375 the page reported "rendered" at 418ms and
		the click step found `0 matched` -- a step that reached no state, which
		the harness correctly calls a finding rather than passing quietly. Waiting
		on the rows existing is the fix; a longer `gapMs` on the click would be
		waiting on a timer for something that has its own signal.
	*/
	{
		waitFor: `() => document.querySelectorAll('.roster-row').length > 0`,
		attempts: 40,
		gapMs: 250
	},
	{
		click: '.roster-row',
		until: `() => !!document.querySelector('.hx-frame-wrap')`,
		attempts: 25,
		gapMs: 300
	}
];

export default {
	path: '/dev/html-assignment-grading',
	label: 'Grading console: a ported HTML assignment, in the pane a teacher grades from',

	prepare: OPEN_FIRST_STUDENT,

	orderResult: [
		{
			label: 'the work pane holds the document and it FILLS the column',
			/*
				NOTHING HERE READS INSIDE THE FRAME, AND THAT IS THE SANDBOX WORKING
				RATHER THAN A GAP. `iframe.contentDocument` is NULL from page-side
				JavaScript -- measured -- because `sandbox="allow-scripts"` with no
				`allow-same-origin` puts the document in an opaque origin, so the
				parent cannot reach its DOM. A spec that read the seeded value from
				out here would be asserting the containment had failed.
				The seeding is proven where it can be: `hxFrameSeed` against stored
				rows in `tests/html-assignment-grading.test.ts`, and inside the real
				frame through playwright's own frame API (which is a browser protocol,
				not page script) -- the numbers are in this bundle's history entry.
			*/
			evaluate: `() => {
				const wrap = document.querySelector('.hx-frame-wrap');
				const frame = document.querySelector('iframe[data-hx-frame]');
				const col = document.querySelector('.work-left');
				const fw = frame ? frame.getBoundingClientRect().width : 0;
				const cw = col ? col.getBoundingClientRect().width : 0;
				return [
					'frames=' + document.querySelectorAll('iframe[data-hx-frame]').length,
					'ready=' + (wrap?.getAttribute('data-hx-ready') ?? 'absent'),
					'listening=' + (wrap?.getAttribute('data-hx-listening') ?? 'absent'),
					/*
						THE FINDING IS THE SHARE OF THE COLUMN, NOT A PIXEL COUNT. An
						absolute threshold cannot be the same claim at 375 and at 1440,
						and the defect was never about an absolute width: the document
						sat BESIDE the rubric and got half the row (measured 275px at
						1440 and 275px at 1920 alike, because the console caps itself at
						960px). Filling its column is the property that was lost.
					*/
					'frameFillsColumn=' + (cw > 0 && fw / cw > 0.95),
					/* And the rubric is BELOW it rather than beside it, which is what
					   makes that possible. */
					'rubricBeside=' + document.querySelectorAll('.work-split.has-rubric').length
				];
			}`,
			expected: [
				'frames=1',
				'ready=yes',
				'listening=yes',
				'frameFillsColumn=true',
				'rubricBeside=0'
			]
		},
		{
			label: 'the photograph is beside the frame, decoded, with its caption',
			/*
				PARENT CHROME, NOT THE DOCUMENT. `idea:state` carries an image URL
				down and the document CANNOT render it -- the URL is a portal proxy
				the sandbox CSP admits no host for, and the request would arrive
				credential-free off an opaque origin. So a restored picture belongs
				beside the frame, and `naturalWidth` is what says it genuinely
				decoded rather than merely being present.
			*/
			evaluate: `() => {
				const img = document.querySelector('.hx-image-thumb');
				return [
					'strip=' + document.querySelectorAll('.hx-images').length,
					'thumbs=' + document.querySelectorAll('.hx-image-thumb').length,
					'decoded=' + (img ? img.naturalWidth > 0 : false),
					'fallbacks=' + document.querySelectorAll('.hx-image-missing').length,
					'caption=' + (document.querySelector('.hx-image-caption')?.textContent ?? 'absent')
				];
			}`,
			expected: [
				'strip=1',
				'thumbs=1',
				'decoded=true',
				'fallbacks=0',
				'caption=The fillet after the third rebuild'
			]
		}
	],

	presence: [
		{ selector: 'iframe[data-hx-frame]', label: 'the sandboxed frame in the work pane', expectPresent: 1, maxPresent: 1 },
		/*
			THE GRADER'S OWN CONTROLS ARE STILL THERE. Every row above is about the
			document; without this the whole pane could have replaced the rubric and
			every assertion would still pass.
		*/
		{ selector: '[data-grade-level]', label: 'the rubric level buttons', expectPresent: 3 },
		/*
			AND NOTHING THE STUDENT USES IS. A read-only mount hands down none of
			the four write callbacks, so the document disables its own inputs --
			this asserts the PARENT side, that no upload control was rendered beside
			the frame for a grader to press.
		*/
		{ selector: '.hx-images input[type="file"]', label: 'file inputs in the photo strip (none)', expectPresent: 0 }
	],

	textContains: [
		{
			selector: '.hx-frame-wrap',
			label: 'the strip names the field, the file and the caption',
			must: ['photo', 'blade-root-fillet.png', 'The fillet after the third rebuild']
		}
	],

	contrast: [
		{ selector: '.hx-image-name', label: 'the attached filename', min: 4.5 },
		{ selector: '.hx-image-caption', label: "the student's caption", min: 4.5 },
		{ selector: '.hx-image-field', label: "the document's own field name", min: 4.5 },
		{ selector: '.hx-images-head', label: 'the Photos heading', min: 4.5 }
	]
};
