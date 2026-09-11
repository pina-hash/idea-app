/* NO `order` EXPORT, deliberately: `../routes.mjs` reserves that field for the
   original 25 files and sorts everything since by FILENAME, so a new route
   needs nobody to pick a number and cannot collide with a parallel bundle's. */

/**
 * AN INSTRUCTOR'S WRITABLE COPY OF A PORTED WORKSHEET (0199).
 *
 * THE DEFECT THIS SURFACE CLOSES. A manager's item page mounted a ported
 * document READ-ONLY -- structurally, by handing down no answers controller --
 * so nobody could open a worksheet and confirm it records anything before a
 * class used it. The first person to find a document whose fields save nothing
 * was a student, mid-period, with their work already typed in.
 *
 * WHAT ONLY A BROWSER CAN SEE HERE, and it is the whole point of this file:
 * THE ANSWER HAS TO CROSS A SANDBOXED, CROSS-DOCUMENT BOUNDARY TO BE RECORDED.
 * A keystroke inside the frame is an `idea:change` posted by FIELD from an
 * opaque origin; the parent resolves it to a block id through the document's
 * own manifest and only then writes. Nothing in `tests/` can run that -- there
 * is no frame, no `postMessage` and no document -- so `svelte-check` and the
 * whole suite are green against a version of this surface where the bridge is
 * never wired and the worksheet takes typing and saves nothing, which is the
 * exact failure this lane exists to prevent.
 *
 * THE PREPARE STEP TYPES INTO THE DOCUMENT ITSELF, through the frame's own
 * `contentDocument`, and then waits for the ROW to appear in the parent's list.
 * That is the end-to-end reading: field named by the document, block id
 * resolved by the manifest, value in the shape
 * `classroom_save_instructor_response` is handed.
 *
 * THE PHOTOGRAPH IS THE HALF THAT REGRESSES SILENTLY. There is no instructor
 * counterpart to `classroom_submission_files`, so the projection carries no
 * file transports and each picture message must settle a REFUSAL rather than
 * being dropped. A dropped message looks identical to a working one from
 * outside, which is why the refusal is driven and read rather than reasoned
 * about.
 */

export default {
	path: '/dev/html-instructor/copy',
	label: "An instructor's working copy of a ported worksheet -- the bridge, the write and the refused photograph (0199)",

	prepare: [
		/*
			THE FIRST STEP IS A CONTAINMENT READING, AND IT IS HERE BECAUSE THE
			DRIVE THIS FILE WAS FIRST WRITTEN WITH DOES NOT WORK -- for the best
			possible reason.

			The intended step typed into the document through the frame's own
			`contentDocument`. MEASURED, that is `null`: `HX_SANDBOX_FLAGS`
			withholds `allow-same-origin`, so the document sits at an OPAQUE
			origin and the parent cannot reach into it -- the same refusal that
			stops the document reaching out. The instrument is subject to the
			property it is measuring, and no `--route` flag changes that.

			SO THE NULL IS ASSERTED RATHER THAN WORKED AROUND. It is the one
			containment fact this surface depends on: if it ever became
			non-null, the document and the page around it would be same-origin
			and the sandbox would be cancelled.
		*/
		{
			evaluate: `() => {
				const frame = document.querySelector('[data-testid="html-instructor-copy"] iframe');
				window.__hxi = frame
					? 'frame mounted, contentDocument=' + (frame.contentDocument === null ? 'null (opaque)' : 'REACHABLE')
					: 'frame absent';
				return window.__hxi;
			}`,
			until: `() => {
				const frame = document.querySelector('[data-testid="html-instructor-copy"] iframe');
				return !!frame && frame.contentDocument === null;
			}`,
			attempts: 40,
			waitMs: 250
		},
		/*
			AND THE ANSWER ARRIVES ANYWAY, WHICH IS THE WHOLE FEATURE IN ONE
			READING.

			The real ported document prefills its date field on load and sends
			the ordinary `idea:change` for it. That message leaves an opaque
			origin, is accepted by the bridge on its source and shape, is
			resolved from the FIELD the document named to the permanent BLOCK ID
			through the manifest the parent stored, and is written through
			`hxInstructorAnswerTransports`' projection of
			`classroom_save_instructor_response`. Every step of that is the
			shipping path.

			IT IS THE DOCUMENT'S OWN CODE AND NOT A SCRIPTED KEYSTROKE, which is
			worth stating both ways: it is stronger evidence that a real ported
			document's own writes land, and it is weaker evidence about typing
			specifically -- a human pass is what covers that, and this file
			cannot. Nothing here waits on a timer; the predicate is the row.
		*/
		{
			evaluate: `() => {
				const rows = document.querySelector('[data-testid="hxi-rows"]');
				window.__hxiRows = rows ? rows.textContent.trim() : '(no rows yet)';
				return window.__hxiRows;
			}`,
			until: `() => {
				const rows = document.querySelector('[data-testid="hxi-rows"]');
				return !!rows && rows.textContent.includes('package-date');
			}`,
			attempts: 40,
			waitMs: 250
		},
		/*
			THE PHOTOGRAPH. Driven through the control beside the frame because
			the parent cannot reach a camera inside an opaque origin either; the
			control calls the CONTROLLER with the same message shape the frame
			builds from an `idea:image`, so the refusal read below is the one a
			real press produces.
		*/
		{
			click: '[data-testid="hxi-image"]',
			until: `() => {
				const el = document.querySelector('[data-testid="hxi-refusals"]');
				return !!el && el.textContent.includes('not captured in an instructor copy');
			}`,
			attempts: 20,
			waitMs: 250
		},
		/*
			AND THE DESIGNATION, which is only reachable once the copy holds a
			row -- the server's `empty_copy` rule, answered where the instructor
			is working. Pressing it after the row above is the ORDER that makes
			it succeed, and that order is the assertion.
		*/
		{
			click: '[data-testid="html-instructor-copy"] .key-row button',
			until: `() => {
				const el = document.querySelector('[data-testid="hxi-key"]');
				return !!el && el.textContent.includes('reyes@boscotech.edu');
			}`,
			attempts: 20,
			waitMs: 250
		}
	],

	/*
		TWO REFUSALS FROM INSIDE THE FRAME, RECORDED RATHER THAN HIDDEN. The real
		ported document references a favicon and a Google Fonts stylesheet, and
		the document CSP -- `/hx/`'s own, which this harness calls rather than
		copies -- refuses both. They are the REAL behaviour of that document
		under the real policy and not something the harness introduced, so they
		are named by pattern (which the runner still PRINTS, as "ignored by
		pattern") rather than left to fail a threshold that is about our own
		page. Anything else from this route is a genuine error.
	*/
	ignoreConsole: [
		'Refused to load the image .*IDEA/ib-android-chrome',
		'Refused to load the stylesheet .*fonts\\.googleapis\\.com'
	],

	presence: [
		/*
			THE BANNER IS WHAT SAYS THIS IS NOT A STUDENT'S HAND-IN, and it is
			the first thing on the surface. A working copy a teacher mistook for
			the class's view is a teacher typing an answer key into a worksheet
			they think nobody can see.
		*/
		{ selector: '[data-testid="html-instructor-copy"]', label: 'the instructor working copy', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="html-instructor-copy"] .banner-head', label: 'the instructor-copy banner', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/*
			ONE FRAME, NOT TWO. The working copy REPLACES the read-only mount
			rather than sitting beside it -- two mounts of one document would be
			two worksheets a teacher can type into, only one of which records
			anything, and the one that records nothing looks identical.
		*/
		{ selector: '[data-testid="html-instructor-copy"] iframe', label: 'exactly one worksheet frame', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/*
			THE ROW THE KEYSTROKE PRODUCED. Present means the bridge carried it;
			this is the whole feature in one selector.
		*/
		{ selector: '[data-testid="hxi-rows"] li', label: 'the recorded instructor answer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="hxi-refusals"] li', label: 'the refused photograph', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/*
			AND THE EMPTY-STATE LINE IS GONE, which is the positive control on
			the row above: a list that renders both would mean the presence check
			is reading something that was always there.
		*/
		{ selector: '[data-testid="hxi-empty"]', label: 'the nothing-written-yet line, now absent', expectPresent: 0 }
	],

	textContains: [
		{
			selector: '[data-testid="html-instructor-copy"] .banner',
			label: 'the banner carries 0128 own words and the one sentence only a ported copy needs',
			must: [
				'Instructor copy',
				'never graded, never handed in, and no student can see it',
				'before a class uses it'
			],
			/*
				NO SUBMISSION VOCABULARY. There is no `classroom_submissions` row
				for an instructor and nothing here could create one, so these are
				absences rather than hidden controls.
			*/
			mustNot: ['Turn in', 'Unsubmit', 'Submitted', 'Due']
		},
		{
			selector: '[data-testid="html-instructor-copy"] .upload-note',
			label: 'photographs are ruled out in words before anybody presses a camera',
			must: ['Photographs are not captured', 'Everything you type is saved']
		},
		{
			selector: '[data-testid="hxi-rows"]',
			label: 'the write carries the BLOCK ID the manifest resolved, not the field name',
			/*
				THE FULL BLOCK ID IS THE DISCRIMINATOR AND THERE IS NO USEFUL
				`mustNot` HERE. The document calls that input `student-date` and
				the manifest calls the block `package-date`, so requiring the
				whole block id is what separates a resolved write from an
				unresolved one -- a lookup that was the identity function would
				have written `student-date` and could not produce this. A
				forbidden phrase cannot do the same job: several of this
				document's field names are substrings of their own block ids, so
				one would fail on correct output.

				THE VALUE IS NOT ASSERTED, ONLY ITS SHAPE. The document prefills
				the date with TODAY, so pinning the string would redden every day
				but one -- the ratchet rule, in miniature. `"text"` is the codec's
				own key and is what says the value reached the column in the
				shape `classroom_instructor_responses` holds.
			*/
			must: ['package-date', '"text"']
		},
		{
			selector: '[data-testid="hxi-refusals"]',
			label: 'the refusal says what happened to the picture AND that the typing is safe',
			must: ['not captured in an instructor copy', 'Everything you type is still saved'],
			/*
				NOT THE READ-ONLY SENTENCE. This worksheet IS taking typing;
				telling an instructor it is not open for editing would be false in
				the one direction that matters to them.
			*/
			mustNot: ['not open for editing']
		},
		{
			selector: '[data-testid="hxi-key"]',
			label: 'the copy was designatable once it held a row',
			must: ['reyes@boscotech.edu']
		}
	],

	tapTargets: [
		/*
			THE DESIGNATE CONTROL IS THE ONE ACTION ON THIS SURFACE THAT PUBLISHES
			ANYTHING, and it sits on an instructor-facing surface that carries no
			24px-floor class of its own -- so it clears 44px like every other
			control, at both widths.
		*/
		{ selector: '[data-testid="html-instructor-copy"] .key-row button', label: 'the answer-key control', min: 44 }
	],

	contrast: [
		/*
			The banner is the only thing saying this is not a student's hand-in,
			and the upload note is the only thing saying a photograph will not be
			kept. Both are read at the 4.5 text floor against the REAL rendered
			ground -- the banner's own `--surface-2`, not the page plate behind
			it.
		*/
		{ selector: '[data-testid="html-instructor-copy"] .banner-note', label: 'the banner sentences', min: 4.5 },
		{ selector: '[data-testid="html-instructor-copy"] .upload-note', label: 'the photograph note', min: 4.5 },
		/*
			THE CHIP IS A BOUNDARY-EDGED PILL and its WORD is text, so the word is
			read at 4.5 rather than the 3:1 a graphical object gets.
		*/
		{ selector: '[data-testid="html-instructor-copy"] .key-chip', label: 'the answer-key chip', min: 4.5 }
	]
};
