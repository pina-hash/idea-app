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
			click: '.rt-toolbar button[aria-expanded]:not([aria-pressed])',
			until: '() => !!document.querySelector(".image-pop")',
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
		/* The editor's image form, open, with its two fields and its refusal. */
		{ selector: '.image-pop', label: 'the image form (opened by the prepare click)', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '.image-pop .link-input', label: 'its two fields: the file and the description', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
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
		{ selector: '.image-hint', label: 'the image form\u2019s required-description sentence', min: 4.5 }
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
		{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows, cover and glyph alike', min: 44 }
	]
};
