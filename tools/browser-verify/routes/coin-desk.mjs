/**
 * The coin desk's Log area, in the room it ships in.
 *
 * `/dev/coin-desk` mounts the REAL `LogView`, `SectionManager`,
 * `ContractsManager`, `RolesManager`, `CategoriesManager` and `PayoutManager`
 * against an in-memory ledger, inside the same `.cd-root` +
 * `$lib/coin-desk/coin-desk.css` the real `/coin-desk/+layout.svelte` wraps
 * every area in. Those two imports are the fixture: without them the room is a
 * class with no rules and every number here would be the portal plate with the
 * page measure missing.
 *
 * WHAT THIS SPEC IS FOR. Three instructor reports about this surface, and the
 * two that leave a measurable trace at rest are here (the third, the category
 * picker, needs the picker OPEN and is `coin-desk-state-picker`):
 *
 *  - THE DESK FILLS THE WIDTH IT IS GIVEN. Every area used to read
 *    `--measure-panel` (52rem) except Log, which reads `--measure-split`
 *    through split.css's `:has(.cr-split)` -- so four of five areas measured
 *    832px of a 1440px window. The `orderResult` probe reads the page
 *    element's own box rather than its `max-width`, because a max-width is a
 *    cap and the question is what the page actually occupies.
 *  - THE TAB BAR IS THE LEDGER'S. It was a row of filled pills 26.2px tall;
 *    the tap-target row is what says the 44px floor holds now, and the
 *    `statePairs` row is what says the current tab still renders differently
 *    from its siblings after the fill became an underline.
 */
export default {
	path: '/dev/coin-desk',
	label: 'Coin desk, Log area (.cd-root)',
	presence: [
		/* The room and its stylesheet, asserted as a MOUNT rather than assumed
		   from the markup: `.cd-root` would still be in the DOM with neither
		   stylesheet imported, and every measurement below would quietly be
		   the portal's. The page element carrying a real max-width is what
		   proves coin-desk.css is actually loaded. */
		{ selector: '.cd-root', label: 'the coin desk room', expectPresent: 1 },
		{ selector: '.cd-root .coin-desk-page', label: 'the desk page', expectPresent: 1 },
		{ selector: '.cd-root .desk-nav [aria-current="page"]', label: 'exactly one current tab', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root .cr-split', label: 'the Log area is the shared split', expectPresent: 1 },
		/* THE POSITIVE CONTROL FOR THE ABSENCE ROW BELOW. A roster with rows is
		   what says the fixture rendered a working desk at all, so "no combo
		   list is open" cannot pass by the page being empty. */
		{ selector: '.cd-root [data-testid="cd-roster"] .roster-row', label: 'roster rows (positive control)', expectPresent: 2 },
		/* AT REST THE PICKER IS CLOSED. `expectPresent: 0` implies
		   `maxPresent: 0`, so this is an exact zero and not a floor. */
		{ selector: '.cd-root [data-testid="cd-category-list"]', label: 'category list closed at rest', expectPresent: 0, expectVisible: 0, maxVisible: 0 }
	],
	contrast: [
		{ selector: '.cd-root .desk-nav [aria-current="page"]', label: 'the current tab on the room plate', min: 4.5 },
		{ selector: '.cd-root .desk-nav a:not(.active), .cd-root .desk-nav button:not(.active)', label: 'a resting tab', min: 4.5 },
		{ selector: '.cd-root .desk-nav .blurb', label: "the area's description line", min: 4.5 },
		{ selector: '.cd-root .coin-desk-page .hero h1', label: 'the masthead title', min: 4.5 }
	],
	tapTargets: [
		/* IT WAS 26.2px. Hit-tested on a 375px viewport before this bundle the
		   tab row measured 26px tall -- under the 44px floor and only just over
		   the 24px absolute one -- on the control every area of the desk is
		   reached through. */
		{ selector: '.cd-root .desk-nav a, .cd-root .desk-nav button', label: 'the sub-nav tabs', min: 44 },
		{ selector: '.cd-root [data-testid="cd-roster"] .roster-row', label: 'roster rows', min: 44 }
	],
	statePairs: [
		/* THE UNDERLINE HAS TO BE VISIBLY DIFFERENT, not merely readable. Both
		   states clear 4.5:1 above, and they would go on clearing it if the
		   current tab stopped being marked at all. */
		{
			activeSelector: '.cd-root .desk-nav [aria-current="page"]',
			inactiveSelector: '.cd-root .desk-nav a:not(.active), .cd-root .desk-nav button:not(.active)',
			label: 'the current tab renders differently from a resting one'
		}
	],
	orderResult: [
		{
			label: 'the desk page occupies the width it is given (px, at this viewport)',
			/* THE BOX, NOT THE `max-width`. A cap of 92rem tells you nothing
			   about what the element occupies -- the old 52rem cap was also a
			   real number and the page still sat in 58% of the window. */
			evaluate:
				'() => { const p = document.querySelector(".cd-root .coin-desk-page"); if (!p) return ["NO PAGE"]; const w = Math.round(p.getBoundingClientRect().width); const vw = window.innerWidth; return [w >= vw - 1 ? "fills-viewport" : "narrower:" + w + "/" + vw]; }',
			expected: ['fills-viewport']
		},
		{
			label: 'prose is capped at the reading measure while the page is not',
			/* THE OTHER HALF OF THE SAME DECISION, and the one a width probe
			   alone would hide: widening the page and letting a sentence run
			   the whole 1376px would satisfy every check above. `--measure-reading`
			   is 46rem / 736px; below 1024 the page is narrower than the cap and
			   the blurb is simply the page, which is the correct answer there. */
			evaluate:
				'() => { const b = document.querySelector(".cd-root .desk-nav .blurb"); if (!b) return ["NO BLURB"]; const w = b.getBoundingClientRect().width; const page = document.querySelector(".cd-root .coin-desk-page").getBoundingClientRect().width; return [w <= 737 && w <= page ? "capped" : "uncapped:" + Math.round(w)]; }',
			expected: ['capped']
		}
	]
};
