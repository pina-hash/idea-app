/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE GALLERY USES THE WINDOW (ledger 0360, reports 162057f0 and 94e312c4).
 *
 * Above 1024px the gallery is a full-height application: the room is a flex
 * COLUMN and the page is an item in it. The page had `margin: 0 auto` and no
 * width, so it shrink-wrapped to its widest child -- the lead paragraph at
 * 42rem -- and the whole gallery was about 608px wide at every desktop size,
 * which is what the report's 2560px screenshot measures. `/dev/foundry-gallery`
 * never showed it, because its wrapper carried `width: 100%` and no `.cr-app`;
 * `/dev/foundry-room` builds the real column around the real components.
 *
 * WHAT FAILS WITHOUT THE FIX: the first row below. With `width: 100%` taken
 * off `FoundryPage` the list pane comes back at the paragraph's width, far
 * under the window. Run at `--width 2560` too for the report's own size.
 */
export default {
	path: '/dev/foundry-room',
	label: 'Foundry room: the gallery in its real full-height column (reports 162057f0, 94e312c4)',
	presence: [
		{ selector: '[data-testid="foundry-gallery-page"]', label: 'the shared page wrapper', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fg-root.cr-app', label: 'the room is an application on this path', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="foundry-gallery-grid"] [data-testid="fdy-card"]', label: 'every card in the mosaic', expectPresent: 16, maxPresent: 16 },
		{ selector: '.fdy-gal-head a[href="/foundry/requests"]', label: 'the request board door beside the list', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			/* THE MEASUREMENT THE REPORT IS ABOUT. The list pane, with nothing
			   open, takes the window less the room's gutter on each side (2rem
			   above 1024px, 1rem below) and its own 1px frame. Stated as a floor
			   with 2px of slack so a rounding pixel cannot redden it. */
			label: 'the list pane spans the window, less the gutter',
			evaluate: `() => { const nav = document.querySelector('.cr-split > .cr-nav'); if (!nav) return ['NO LIST PANE']; const g = innerWidth >= 1024 ? 32 : 16; const w = nav.getBoundingClientRect().width; return [w >= innerWidth - 2 * g - 2 ? 'list pane spans the window' : 'list pane ' + w.toFixed(1) + 'px of ' + innerWidth]; }`,
			expected: ['list pane spans the window']
		},
		{
			/* AND THE PAGE WRAPPER IS AS WIDE AS THE BODY IT SITS IN, which is the
			   shrink-to-fit defect read at its source rather than at its symptom. */
			label: 'the page wrapper fills the room body',
			evaluate: `() => { const p = document.querySelector('[data-testid="foundry-gallery-page"]'); const b = document.querySelector('.fg-body'); if (!p || !b) return ['MISSING']; const d = Math.abs(p.getBoundingClientRect().width - b.getBoundingClientRect().width); return [d < 1 ? 'page = body width' : 'page short of body by ' + d.toFixed(1) + 'px']; }`,
			expected: ['page = body width']
		},
		{
			/* THE MOSAIC USES THE ROOM IT WAS GIVEN. Sixteen cards: at 1440 the
			   pane holds five 15rem columns and balance fills four of them; at
			   2560 it holds eight and fills eight; below the breakpoint one or
			   two. The row is a floor per band so it does not re-type the
			   arithmetic `mosaic.ts` already owns. */
			label: 'the mosaic fills the width it has',
			evaluate: `() => { const ul = document.querySelector('[data-testid="foundry-gallery-grid"]'); if (!ul) return ['NO MOSAIC']; const c = Number(getComputedStyle(ul).columnCount) || 1; const want = innerWidth >= 2400 ? 8 : innerWidth >= 1400 ? 4 : 1; return [c >= want ? 'columns fill the width' : c + ' column(s) at ' + innerWidth + 'px, wanted ' + want]; }`,
			expected: ['columns fill the width']
		},
		{
			/* THE MASTHEAD SPANS IT TOO: the same token the page reads. */
			label: 'the masthead is not capped in the middle of the window',
			evaluate: `() => { const m = document.querySelector('.fg-mast'); if (!m) return ['NO MASTHEAD']; const w = m.getBoundingClientRect().width; return [w >= innerWidth - 2 ? 'masthead spans the window' : 'masthead ' + w.toFixed(1) + 'px of ' + innerWidth]; }`,
			expected: ['masthead spans the window']
		}
	],
	tapTargets: [
		{ selector: '.fdy-gal-head a[href="/foundry/requests"]', label: 'Request a game', min: 44 },
		{ selector: '.fdy-gal-head a[href="/foundry/contract"]', label: 'Build contract', min: 44 },
		{ selector: '.fg-tabs a[href="/foundry/requests"]', label: 'the Requests tab', min: 44 }
	],
	contrast: [
		{ selector: '.fdy-gal-head a[href="/foundry/requests"]', label: 'Request a game', min: 4.5 },
		{ selector: '.fg-tabs a[href="/foundry/requests"]', label: 'the Requests tab', min: 4.5 }
	]
};
