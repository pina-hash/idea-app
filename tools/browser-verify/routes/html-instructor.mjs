/* NO `order` EXPORT, deliberately: `../routes.mjs` reserves that field for the
   original 25 files and sorts everything since by FILENAME, so a new route
   needs nobody to pick a number and cannot collide with a parallel bundle's. */

/**
 * REPLACING A POSTED PORTED DOCUMENT, AND THE COST REPORT THAT HOLDS IT
 * (ledger 0154).
 *
 * A posted HTML assignment could not be changed at all: the composer's upload
 * panel was create-only, so a typo in a worksheet a class was already working
 * in was permanent. Decision 10's recorded narrowing is that the instructor
 * edit path IS re-upload producing a new revision.
 *
 * WHAT ONLY A BROWSER CAN SEE HERE. A BLOCK ID IS THE JOIN KEY FOR EVERY
 * STORED ANSWER, so a new document that renames one leaves the rows under the
 * old id in the database and out of the worksheet -- silently. The defence is
 * a panel that appears, counts, and HOLDS the post until a second press. Every
 * part of that is a rendering question: the panel is present or it is not, the
 * confirmation is offered or it is not, the post control carries
 * `aria-disabled` or it does not. `svelte-check` reports 0 errors across a
 * version of this file that renders none of it.
 *
 * THE DANGEROUS SHAPE IS THE ONE DRIVEN. The prepare steps push a REAL `.html`
 * file into the composer's own picker -- the harness's buttons build a `File`
 * and dispatch `change`, so `readStagedHtml` and `validateHtmlManifest` run
 * exactly as they do for a teacher's export -- and the document they push
 * renames `b-reading`, which three students have answered.
 *
 * THE COUNT IS THE ASSERTION, NOT THE WARNING. "This could affect student
 * work" is a sentence people learn to click through; "3 answers" is not. The
 * harness's in-memory table holds 3 answers under that block, so the figure in
 * the confirmation and the rows behind it cannot disagree.
 */

export default {
	path: '/dev/html-instructor',
	label: 'Replacing a ported HTML document -- the manifest diff and the orphan confirmation (0154)',

	prepare: [
		/* HYDRATION, NOT A TIMER. `waitForApp` returns on DOM stability, which
		   the server-rendered markup satisfies BEFORE any handler is attached,
		   so a press here can land on a page that is not yet interactive. The
		   predicate is the EFFECT wanted -- the diff panel is on screen with
		   the renamed block named in it -- and the runner prints the attempt
		   count, so a step that needed nine tries says nine. */
		{
			click: '[data-testid="upload-renamed"]',
			until: `() => {
				const el = document.querySelector('[data-testid="staged-html-diff"]');
				return !!el && el.textContent.includes('b-reading') && el.textContent.includes('3 answers');
			}`,
			attempts: 20,
			waitMs: 250
		},
		/*
			THE THREE FACTS BELOW ARE `evaluate` + `until` STEPS AND NOT A
			TOP-LEVEL `evaluate` BLOCK, BECAUSE THERE IS NO SUCH CHECK. The
			runner reads `presence`, `textContains`, `contrast`, `tapTargets`,
			`tapReach`, `domOrder`, `orderResult`, `datalistOrder`, `statePairs`
			and `motion`; an `evaluate:` array beside them is a field nothing
			consumes, which is the silent shape `prepareStepShapeResults` exists
			to catch one level down. A prepare step's `until` IS measured -- the
			row's threshold is "the step runs without throwing AND its `until`
			then holds" -- so a fact written this way reddens rather than
			evaporating.
		*/
		/*
			THE POST IS HELD WITH `aria-disabled` AND NOT `disabled`. A genuinely
			disabled control swallows the pointer event, so it can never explain
			itself -- and the whole point of this hold is that there IS a reason
			the teacher has to be able to reach. Both halves are read, because
			either alone is satisfied by the wrong implementation.
		*/
		{
			evaluate: `() => {
				const el = document.querySelector('[data-testid="composer-publish-bottom"]');
				window.__hx0 = el
					? 'aria-disabled=' + el.getAttribute('aria-disabled') + ' disabledAttr=' + el.hasAttribute('disabled')
					: 'absent';
				return window.__hx0;
			}`,
			until: `() => window.__hx0 === 'aria-disabled=true disabledAttr=false'`,
			attempts: 12,
			waitMs: 150
		},
		/* A box that arrived ticked is a second press nobody made. */
		{
			evaluate: `() => {
				window.__hx1 = String(document.querySelector('[data-testid="staged-html-confirm"]').checked);
				return window.__hx1;
			}`,
			until: `() => window.__hx1 === 'false'`,
			attempts: 12,
			waitMs: 150
		},
		/*
			TICKING IT RELEASES THE POST. Without this, every assertion in this
			file is satisfied by a panel that holds the post FOREVER -- a
			different defect with the same screenshot.
			
			IT IS TWO STEPS, AND THE SPLIT IS A MEASURED FACT ABOUT THE FLUSH
			RATHER THAN TIDINESS. Written as one step -- click the box, then read
			`aria-disabled` off the publish control in the same synchronous tick
			-- it reported `aria-disabled=true` through all twelve attempts, at
			both widths, on a page where the release genuinely works: the click
			sets `checked` and schedules the derived, and Svelte applies the
			attribute on a later microtask, so a same-tick read is guaranteed to
			see the old value. A step whose ACTION and whose ASSERTION are the
			same statement cannot wait for its own effect; the `until` on a
			SEPARATE step can, and retries until it holds.
		*/
		{
			click: '[data-testid="staged-html-confirm"]',
			until: `() => document.querySelector('[data-testid="composer-publish-bottom"]').getAttribute('aria-disabled') === null`,
			attempts: 12,
			waitMs: 150
		},
		/*
			AND UNTICKED AGAIN, so every check below still measures the HELD
			state -- which is the state this route exists to describe. The
			`until` reads both halves, because a box that unticked without the
			hold coming back would be the release leaking.
		*/
		{
			click: '[data-testid="staged-html-confirm"]',
			until: `() => {
				const box = document.querySelector('[data-testid="staged-html-confirm"]');
				const el = document.querySelector('[data-testid="composer-publish-bottom"]');
				return box.checked === false && el.getAttribute('aria-disabled') === 'true';
			}`,
			attempts: 12,
			waitMs: 150
		}
	],

	presence: [
		/*
			THE PANEL IS THERE AT ALL, which is the whole of what 0154 adds to
			this surface. `maxPresent` as well as `expectPresent`, because a
			second copy of the report is as wrong as none -- it would mean the
			edit arm and the create arm were both rendering.
		*/
		{ selector: '[data-testid="staged-html"]', label: 'the replace panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="staged-html-diff"]', label: 'the cost report', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/*
			THE SECOND PRESS. Exactly one, and it must be VISIBLE: a confirmation
			rendered inside a collapsed region is a post held by a control nobody
			can reach.
		*/
		{ selector: '[data-testid="staged-html-confirm"]', label: 'the orphan confirmation', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/*
			AND THE REASON, STANDING WHERE THE WORK IS. The post control explains
			itself when pressed; this is the same sentence beside the document,
			so nobody has to press a control to find out why it is held.
		*/
		{ selector: '[data-testid="staged-html-hold"]', label: 'the held sentence beside the document', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/*
			THE DIFF IS THREE SENTENCES ON THIS SHAPE -- kept, added, dropped.
			A panel that lost one would still look deliberate, which is why the
			count is asserted rather than the presence of a list.
		*/
		{ selector: '.reupload-lines li', label: 'the three verdict sentences', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],

	textContains: [
		{
			selector: '[data-testid="staged-html-diff"]',
			label: 'the real count, the named block, and what actually happens to the rows',
			must: [
				// THE FIGURE. Counted from the stored answers, never estimated.
				'3 answers are stored under that block',
				// THE BLOCK, BY NAME, so a teacher can put the id back.
				'b-reading',
				// WHAT IS KEPT, so the report is not only bad news.
				'Every answer stored under them is kept',
				// "will be lost" WOULD BE WRONG -- nothing is deleted -- and a
				// teacher who believes the rows are gone will not think to
				// restore the id.
				'does not delete them',
				'SAME block ids'
			],
			/*
				THE VAGUE WARNING THIS REPLACES, asserted as an absence. A
				sentence that acquired "may affect" or "could be lost" would read
				perfectly well and would be the thing people click through.
			*/
			mustNot: ['may affect', 'could be lost', 'will be lost', 'Are you sure']
		},
		{
			selector: '.reupload-confirm',
			label: 'the confirmation names the count rather than asking a yes/no question',
			must: ['Replace the document and orphan 3 answers'],
			mustNot: ['Are you sure', 'Confirm', 'OK']
		},
		{
			selector: '[data-testid="staged-html-hold"]',
			label: 'the held sentence says the post has not happened and what to do',
			must: ['not posted yet', 'confirm']
		},
		{
			selector: '[data-testid="staged-html"] .mini-label',
			label: 'the panel says it is a REPLACEMENT, not a first import',
			must: ['Replace the ported document']
		}
	],

	tapTargets: [
		/*
			THE CONFIRMATION IS THE CONTROL THIS WHOLE PANEL EXISTS FOR, and it
			is measured at the LABEL, which is what a finger hits. It failed the
			first time it was drawn: this form's own `label { flex-direction:
			column }` outranked a bare class selector, so the box and the
			sentence stacked and overflowed a box that still reported 44px tall
			-- which is exactly why this is a hit test and not a computed-height
			read.
		*/
		{ selector: '.reupload-confirm', label: 'the orphan confirmation label', min: 44 }
	],

	contrast: [
		/*
			The cost report is the only thing on screen saying what a re-upload
			costs, so its sentences are read at the 4.5 text floor against the
			REAL rendered ground -- the panel's own `--surface-2`, not the page
			plate behind it.
		*/
		{ selector: '.reupload-lines li', label: 'the verdict sentences', min: 4.5 },
		{ selector: '.reupload-confirm span', label: 'the confirmation label', min: 4.5 },
		{ selector: '[data-testid="staged-html-hold"]', label: 'the held sentence', min: 4.5 }
	]
};
