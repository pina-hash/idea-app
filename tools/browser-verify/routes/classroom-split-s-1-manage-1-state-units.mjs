/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * PROMPT 0118: THE UNIT MANAGER'S ROWS -- a grip that carries a word, an
 * inline rename, and no glyph-only control anywhere.
 *
 * The `↑`/`↓` buttons this replaced were the visible-word rule broken twice
 * per row (a glyph alone, with the word only in `aria-label`). Each row now
 * has ONE reorder control, a grip reading "Move" whose keyboard spelling is
 * the arrow keys through the same `setUnitOrder` a drag commits to, and
 * Rename turns the name itself into an input with a visible Save / Cancel
 * pair. Every control in the row clears 44px and nothing carries a fixed
 * height, so the inline form can wrap on a phone rather than clip.
 *
 * Reached by pressing the pane's own Units control, so the panel measured is
 * the one ClassView mounts (`chrome={false}`), not a standalone card.
 *
 * `aliasOf` because this is a STATE of the manage-1 route, not a route.
 */
export default {
	path: '/dev/classroom-split/s-1?manage=1&state=units',
	aliasOf: '/dev/classroom-split/s-1?manage=1',
	label: '0118: unit rows reorder by a worded grip and the arrow keys, and rename inline',
	prepare: [
		{
			click: '[data-testid="units-toggle"]',
			until: '() => document.querySelectorAll(\'[data-testid="unit-row"]\').length === 3'
		},
		/* ARROW DOWN ON THE FIRST GRIP: a one-step move committed through the
		   same `ondrop` a drag uses, read back off the transport log. */
		{
			evaluate: `() => {
				const grip = document.querySelector('[data-testid="unit-row"] [data-testid="unit-grip"]');
				grip.focus();
				grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
				return 'ArrowDown on ' + grip.getAttribute('aria-label');
			}`,
			until: '() => window.__composeProbe().unitOrders.length > 0',
			waitMs: 200
		},
		/* INTO VIEW BEFORE THE CLICK (ledger 0297). With the class's chrome as
		   it is after the notebook moved into the class (a Notebook tab where
		   the Check-ins departure was, and the notebook link gone from the
		   pane's tool row), row 2's Rename sits at y=839 at 375, under the Voice
		   float fixed to the bottom of a 900px viewport: the real click landed
		   on the float (measured, elementFromPoint answered span.vnav-word) and
		   this step failed through twelve attempts. A person scrolls; the
		   harness does not, so the step brings the control to the middle of the
		   viewport first and every measurement after it reads the page as
		   scrolled. Where the row sat before the move was not measured. */
		{
			evaluate: `() => {
				const b = document.querySelector('[data-testid="unit-row"]:nth-child(2) [data-testid="unit-rename"]');
				b.scrollIntoView({ block: 'center', behavior: 'instant' });
				const r = b.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				return 'Rename at y=' + Math.round(r.top) + ', hit-tests to itself: ' + (hit === b || b.contains(hit));
			}`,
			until: `() => {
				const b = document.querySelector('[data-testid="unit-row"]:nth-child(2) [data-testid="unit-rename"]');
				const r = b.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				return hit === b || b.contains(hit);
			}`
		},
		{
			click: '[data-testid="unit-row"]:nth-child(2) [data-testid="unit-rename"]',
			until: '() => !!document.querySelector(\'[data-testid="unit-rename-input"]\')'
		}
	],
	presence: [
		{ selector: '[data-testid="unit-row"]', label: 'unit rows', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="unit-grip"][data-sort-handle]', label: 'one worded grip per row', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="unit-up"], [data-testid="unit-down"]', label: 'the retired glyph-only arrow buttons', expectPresent: 0 },
		{ selector: '[data-testid="unit-rename-input"]', label: 'inline rename input (row 2, after Rename)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="unit-rename-save"]', label: 'visible Save', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="unit-rename-cancel"]', label: 'visible Cancel', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [
		{ selector: '[data-testid="unit-grip"]', label: 'unit grips', min: 44 },
		{ selector: '[data-testid="unit-rename"], [data-testid="unit-delete"]', label: 'Rename / Remove', min: 44 },
		{ selector: '[data-testid="unit-rename-save"], [data-testid="unit-rename-cancel"]', label: 'inline Save / Cancel', min: 44 },
		{ selector: '[data-testid="unit-rename-input"]', label: 'inline rename input', min: 44 },
		{ selector: '[data-testid="unit-add"]', label: 'Add unit', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="unit-grip"]', label: 'the grip word (Move)', min: 4.5 },
		{ selector: '.unit-name', label: 'unit names', min: 4.5 }
	],
	textContains: [
		{ selector: '[data-testid="unit-grip"]', label: 'the grip carries a visible word', must: ['Move'] }
	],
	orderResult: [
		{
			evaluate: '() => window.__composeProbe().unitOrders.at(-1)',
			expected: ['u-2', 'u-1', 'u-3'],
			label: 'ArrowDown on Unit 1 stored the full list with it one step down'
		},
		{
			/* NO FIXED HEIGHT ON THE ROW, measured as its consequence rather than
			   as a style read: a row whose height were pinned would CLIP the
			   inline rename form when it wraps (`scrollHeight > clientHeight`),
			   and the row carrying the open form is the one that would show it.
			   At 375 the form does wrap under the grip, which is the case. */
			evaluate: `() => [...document.querySelectorAll('[data-testid="unit-row"]')].map((r) => r.scrollHeight <= r.clientHeight + 1 ? 'fits' : 'clips ' + (r.scrollHeight - r.clientHeight) + 'px')`,
			expected: ['fits', 'fits', 'fits'],
			label: 'no unit row clips its own content (no fixed height anywhere on it)'
		},
		{
			/* The rename input seeded from the row's own name, on the row that
			   was pressed. */
			evaluate: `() => [document.querySelector('[data-testid="unit-rename-input"]')?.value ?? 'absent']`,
			expected: ['Unit 2 · Bridges'],
			label: 'Rename seeds the input with the current name'
		}
	],
	ignoreConsole: ['Failed to load resource: the server responded with a status of 401']
};
