/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * PROMPT 0118, ITEMS EIGHT AND FOUR: "EDIT POST" OPENS A FULL-VIEWPORT
 * EDITOR, AND THE 0193 LAYOUT CONTROLS ARE IN IT WHEN THE TRANSPORT IS.
 *
 * The edit composer used to fold the whole authoring form into the detail
 * pane as a `compact` card -- a 26rem column above 1024px, and on a phone a
 * card inside a page it had to share. It is a fixed `role="dialog"` layer now
 * (`screen` on ContentComposer): its own header naming what is being edited,
 * a Close control reachable without scrolling, the sticky actions row under
 * it, and the form scrolling inside the layer while the page behind it does
 * not. None of that is visible to a type check, and happy-dom cannot lay it
 * out, so the geometry is measured here: the layer present only after the
 * press, its Close at 44px, no horizontal overflow at either width (the
 * harness's own check), and focus INSIDE the layer.
 *
 * `?layout=1` hands the 0193 transports to the page, so this run also
 * measures the PRESENT half of the gating: the two placement radio groups and
 * the link-row grips render and clear 44px. The ABSENT half is the sibling
 * spec (`...-layout-0`), and the dialog's absence AT REST is a presence row on
 * the base spec (`...-open-1`), so all three directions are measured against
 * one fixture rather than assumed from one of them.
 *
 * THE PRESS IS RETRIED AGAINST ITS OWN EFFECT: paint is not interactivity, and
 * a click that landed before hydration reads exactly like a click that did
 * nothing. The predicate is the layer appearing, which nothing but the press
 * can produce.
 */
export default {
	path: '/dev/classroom-inspector?case=assignment&layout=1',
	label: 'Item page: Edit post opens the full-viewport editor with the 0193 layout controls in it',
	prepare: [
		{
			click: '[data-testid="item-edit-toggle"]',
			until: `() => !!document.querySelector('[role="dialog"].composer-screen')`,
			attempts: 12,
			waitMs: 350
		}
	],
	presence: [
		{ selector: '[role="dialog"].composer-screen', label: 'the editor layer, after the press', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.composer-screen[aria-modal="true"]', label: 'the layer is modal', expectPresent: 1 },
		{ selector: '[data-testid="composer-screen-close"]', label: 'Close, in the layer header', expectPresent: 1, expectVisible: 1 },
		{ selector: '.composer-screen .composer', label: 'the SAME .composer root, inside the layer', expectPresent: 1, maxPresent: 1 },
		{ selector: '.composer-screen .composer-actions.top', label: 'the sticky actions row, inside the layer', expectPresent: 1 },
		/* `compact` is ignored in screen mode: the card frame must not appear
		   inside the layer. */
		{ selector: '.composer-screen .composer.compact', label: 'no compact card inside the layer', expectPresent: 0 },
		/* THE PRESENT HALF OF THE 0193 GATING. */
		{ selector: '[data-testid="place-files"]', label: 'Files placement, present with the transport', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="place-links"]', label: 'Links placement, present with the transport', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="place-files"] [role="radio"]', label: 'two placement options per group', expectPresent: 2, maxPresent: 2 },
		/* COLOUR IS NEVER THE ONLY SIGNAL: the word is the same on both options,
		   so the checked one carries a check glyph and the unchecked one does
		   not -- one per group, both directions. */
		{ selector: '.place-opt[aria-checked="true"] svg.place-check', label: 'a check glyph on each CHECKED placement option (2 groups)', expectPresent: 2, maxPresent: 2 },
		{ selector: '.place-opt[aria-checked="false"] svg.place-check', label: 'no glyph on an UNCHECKED option', expectPresent: 0 },
		{ selector: '.composer > .resources-editor .row-tools > .order-btn', label: 'a worded Remove per link row', expectPresent: 2, maxPresent: 2 },
		{ selector: '.composer > .resources-editor .order-grip', label: 'a grip per link row (2 links in the fixture)', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="composer-paste-cue"]', label: 'the paste / drop sentence, at body weight', expectPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'focus is inside the layer, the body is scroll-locked, and the heading id resolves',
			evaluate: `() => {
				const dialog = document.querySelector('[role="dialog"].composer-screen');
				const active = document.activeElement;
				const heading = dialog && document.getElementById(dialog.getAttribute('aria-labelledby') || '');
				return [
					active && active.closest('.composer-screen') ? 'focus inside' : 'focus ' + (active ? active.tagName.toLowerCase() : 'nowhere'),
					getComputedStyle(document.body).overflow === 'hidden' ? 'body locked' : 'body ' + getComputedStyle(document.body).overflow,
					heading && heading.textContent.trim() ? 'heading ' + JSON.stringify(heading.textContent.trim()) : 'heading unresolved'
				];
			}`,
			expected: ['focus inside', 'body locked', 'heading "Edit assignment"']
		},
		{
			label: 'the layer sits above the masthead and covers the viewport',
			evaluate: `() => {
				const dialog = document.querySelector('[role="dialog"].composer-screen');
				const r = dialog.getBoundingClientRect();
				const z = Number(getComputedStyle(dialog).zIndex);
				return [
					z > 1 && z < 100 ? 'z between masthead and lightbox' : 'z ' + z,
					Math.round(r.width) === window.innerWidth && Math.round(r.height) === window.innerHeight ? 'covers viewport' : 'covers ' + Math.round(r.width) + 'x' + Math.round(r.height)
				];
			}`,
			expected: ['z between masthead and lightbox', 'covers viewport']
		}
	],
	contrast: [
		{ selector: '.composer-screen-title', label: 'the layer heading', min: 4.5 },
		{ selector: '[data-testid="place-files"] .place-opt[aria-checked="true"]', label: 'the checked placement option', min: 4.5 },
		{ selector: '[data-testid="place-files"] .place-opt[aria-checked="false"]', label: 'the unchecked placement option', min: 4.5 },
		{ selector: '[data-testid="composer-paste-cue"]', label: 'the paste / drop sentence', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="composer-screen-close"]', label: 'Close (layer header)', min: 44 },
		{ selector: '[data-testid="place-files"] .place-opt', label: 'Files placement options', min: 44 },
		{ selector: '[data-testid="place-links"] .place-opt', label: 'Links placement options', min: 44 },
		{ selector: '.composer > .resources-editor .order-grip', label: 'link row grips', min: 44 },
		{ selector: '.composer > .resources-editor .order-tools .btn', label: 'link row Move up / Move down', min: 44 },
		{ selector: '.composer > .resources-editor .row-tools > .order-btn', label: 'link row Remove', min: 44 }
	],
	/* The fixture's instructor-only attachment and the two student files
	   resolve through `/api/classroom/attachment/<id>`, a real server route
	   needing a session this placeholder-.env dev server cannot provide; and
	   the harness blocks every non-loopback request. Instrument and fixture,
	   not this surface. */
	ignoreConsole: [
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
