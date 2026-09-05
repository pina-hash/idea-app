import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/item-images',
	label: 'Pictures in an item body, and the feed card that shows one (0176)',
	/* The feed half of this route mounts ClassroomFeed inside `.legacy-index`,
	   whose shared rule stamps `opacity: 0` on `.course-card` at mount and waits
	   for the home page's own IntersectionObserver to add `.visible`. That
	   observer belongs to src/routes/+page.svelte and never runs here, so
	   without this step every feed row is measured at opacity 0 -- the exact
	   vacuum /dev/home-feed's own spec documents. */
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
		/* THE EDITOR'S IMAGE CONTROL, driven for real.
		
		   `clickUntil` RETRIES AGAINST ITS OWN `until` PREDICATE rather than
		   waiting on a timer or a `window` marker, and reports the attempt count.
		   That is not belt and braces here: `waitForApp` returns on DOM
		   STABILITY, which the server-rendered markup satisfies before hydration
		   has attached a single handler, and this particular control is behind a
		   DYNAMIC IMPORT of Tiptap on top of that -- so the toolbar is painted,
		   and inert, for longer than on any ordinary surface. A single click here
		   would be a coin flip. */
		{
			/* SCOPED TO ONE EDITOR, and that is forced rather than tidy: each
			   instance's outside-dismiss listener closes its own popover on a
			   pointerdown anywhere outside its wrapper, so opening a second one
			   CLOSES the first. Three popovers cannot be measured in one pass,
			   which is why the empty case and the free-text case are alias specs
			   of this same page rather than more rows here.

			   `button[aria-expanded]:not([aria-pressed])` is the Image button and
			   only the Image button: Link carries both attributes. */
			click: '[data-editor-case="picker"] .rt-toolbar button[aria-expanded]:not([aria-pressed])',
			until: '() => !!document.querySelector(\'[data-editor-case="picker"] .image-pop\')',
			waitMs: 150
		},
		/* CHOOSE ONE, so the checks below read a control that has actually been
		   operated rather than one that merely rendered. The `until` is the
		   selection landing on the row, not the click reporting itself: an
		   `aria-checked` that never flips is a picker whose handler is not
		   wired, which is exactly what a click-count would fail to notice. */
		{
			click: '[data-editor-case="picker"] .image-choice',
			until: '() => !!document.querySelector(\'[data-editor-case="picker"] .image-choice[aria-checked="true"]\')',
			waitMs: 150
		}
	],
	presence: [
		/* THE LOAD-BEARING PAIR. Three body fixtures are mounted and exactly ONE
		   of them may produce an `img`: the resolvable one. The other two are an
		   unresolvable alias and three refused references, and every one of those
		   must render its caption plus a marker instead. Counting BOTH in the
		   same run is what stops "0 hostile images" being satisfied by a renderer
		   that stopped drawing images at all. */
		/* EVERY COUNT CARRIES ITS CEILING. `expectPresent` is a FLOOR, so a row
		   written with the floor alone comes back green when an extra `img`
		   appears -- which is the one outcome this route exists to notice. The
		   resolvable fixture is mounted twice (once roomy, once compact), hence
		   two rather than one. */
		{ selector: '.item-body img', label: 'body images (only the resolvable fixture may draw one, mounted twice)', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		{ selector: '.item-figure-missing', label: 'refusal markers, one per unresolvable or refused reference', expectPresent: 4, maxPresent: 4, expectVisible: 4, maxVisible: 4 },
		{ selector: '.item-body figcaption', label: 'captions, one per figure whether it drew or not', expectPresent: 6, maxPresent: 6, expectVisible: 6, maxVisible: 6 },
		/* The feed: one card carries a cover, two keep their per-kind glyph. */
		{ selector: '.legacy-index .assignment-icon-thumb.has-cover', label: 'feed cards showing a cover', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '.legacy-index .assignment-icon-thumb svg', label: 'feed cards keeping the per-kind glyph', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', expectPresent: 3, maxPresent: 3, expectVisible: 3, maxVisible: 3 },
		/* The editor's image form, open. ONE form, because opening a second
		   would have closed this one -- see the prepare note. */
		{ selector: '.image-pop', label: 'the image form (opened by the prepare click)', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		/* ONE field now, not two: the file NAME is no longer typed. The
		   description is the only thing left that a person writes, and its
		   `.link-input` is what says the free-text src box is genuinely gone
		   from this surface rather than merely hidden. */
		{ selector: '.image-pop .link-input', label: 'the one remaining field: the description', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '.image-pop input[aria-label="Picture file"]', label: 'the free-text file field, GONE from the picker', expectPresent: 0 },
		/* THE OFFER, EXACTLY. Five attachments and two staged files go in; three
		   come out. Counting the CEILING as well as the floor is the whole
		   point: an extra row here is a picture offered that the page will then
		   refuse to draw, which is the defect this bundle exists to remove. */
		{ selector: '[data-editor-case="picker"] .image-choice', label: 'pictures offered (2 attached + 2 staged, out of 7 candidates)', expectPresent: 4, maxPresent: 4, expectVisible: 4, maxVisible: 4 },
		{ selector: '[data-editor-case="picker"] .image-choice[aria-checked="true"]', label: 'exactly one chosen, after the prepare click', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		/* The two attached rows carry the SAME proxy src the page uses; the
		   staged row carries no thumbnail and a word saying why. */
		{ selector: '[data-editor-case="picker"] .image-choice-thumb:not(.is-none)', label: 'thumbnails, one per attached picture', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		{ selector: '[data-editor-case="picker"] .image-choice-state', label: 'the staged rows say their reference lands on save', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		{ selector: '[data-editor-case="picker"] .image-empty', label: 'no empty-case sentence while there is something to offer', expectPresent: 0 },
		/* AND THE CONTROL IS `aria-disabled`, NEVER `disabled`. A genuinely
		   disabled control swallows pointer events, so it could never explain
		   why it is refusing -- which is the only reason somebody presses it. */
		{ selector: '.image-pop .link-go[aria-disabled="true"]', label: 'Add, refusing and able to say so', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '.image-pop .link-go[disabled]', label: 'Add is NOT hard-disabled', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '.image-hint',
			label: 'the image form says the description is required BEFORE anything is pressed',
			must: ['description is required', 'screen reader']
		},
		{
			selector: '[data-editor-case="picker"] .image-pick',
			label: 'the picker names this item\u2019s own pictures, and says which one is not on it yet',
			must: [
				'bearing-race.png',
				'truss-detail.png',
				'Added when you save',
				/* THE SANITIZED NAME IS SHOWN, and shown BESIDE the one that was
				   picked. A person choosing `first cut.JPG` off a list must not
				   have to discover afterwards that the item calls it something
				   else -- the reference the document carries is the right-hand
				   name, and the record route is what will write it. */
				'first cut.JPG (saved as first-cut.JPG)'
			],
			/* THE REFUSALS, BY NAME. Each is a different rule and each fails
			   silently if it gets through: an SVG is a document, a PDF resolves
			   perfectly and does not decode, and a case-variant duplicate cannot
			   be told from the row it duplicates by the document it produces. */
			mustNot: ['schematic.svg', 'safety-sheet.pdf', 'BEARING-RACE.PNG']
		},
		{
			selector: '.item-body',
			label: 'a refused reference never reaches the page as text either',
			must: ['Image unavailable'],
			mustNot: ['evil.example', 'javascript:', '/etc/passwd', 'attachment:diagram.svg']
		}
	],
	contrast: [
		{ selector: '.item-body figcaption', label: 'figure caption', min: 4.5 },
		/* A graphical marker rather than body copy, but it is a WORD, so it takes
		   the text threshold and not the 3:1 non-text one. */
		{ selector: '.item-figure-missing', label: 'the refusal marker', min: 4.5 },
		{ selector: '.legacy-index .assignment-name', label: 'feed row title beside a cover', min: 4.5 },
		{ selector: '.image-hint', label: 'the image form\u2019s required-description sentence', min: 4.5 },
		{ selector: '[data-editor-case="picker"] .image-choice-name', label: 'a picture\u2019s name in the picker', min: 4.5 },
		/* The staged chip is a WORD carrying the one thing that distinguishes
		   the row, so it takes the text threshold and not the 3:1 non-text one. */
		{ selector: '[data-editor-case="picker"] .image-choice-state', label: 'the added-on-save chip', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the three feed rows are the SAME height, cover and glyph alike',
			/* THE TAP-TARGET CHECK CANNOT SAY THIS. It reports the SMALLEST box,
			   so three rows of 34, 60 and 60 pass a 44px floor on two of them and
			   report 34 -- and three rows of 60, 60 and 60 report the same
			   number as three of 60, 60 and 34 would if the small one were the
			   one measured last. The claim here is EQUALITY: a class that starts
			   attaching photographs must not turn the home feed into a ragged
			   list, and the only reading that says so is how many DISTINCT
			   heights there are. Rounded to the pixel, because sub-pixel
			   layout noise is not raggedness. */
			evaluate: `() => {
				const rows = [...document.querySelectorAll('.legacy-index .assignment-item.linked')];
				const heights = rows.map((r) => Math.round(r.getBoundingClientRect().height));
				return [rows.length, new Set(heights).size];
			}`,
			/* Three rows, ONE distinct height. The row count rides along so a
			   selector that stopped matching cannot report "1 distinct height"
			   over an empty list. */
			expected: [3, 1]
		}
	],
	tapTargets: [
		/* A cover must not change what a finger has to hit: the rows are measured
		   with one carrying a picture and two carrying a glyph, in one reading. */
		{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows, cover and glyph alike', min: 44 },
		/* THE PICKER ROWS TAKE THE FULL 44px FLOOR. The editor declares no named
		   density contract, so decision 09 grants it no exception -- and this is
		   an instructor surface, which the floor covers at every width anyway. */
		{ selector: '[data-editor-case="picker"] .image-choice', label: 'a picture row in the picker', min: 44 }
	]
};
