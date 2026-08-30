/**
 * The coin desk's Economy area -- the price list, which is where "the coin
 * desk wastes horizontal space" was worst.
 *
 * MEASURED BEFORE THE CHANGE, at a 1440px viewport: the page element was
 * 832px wide (58% of the window) because every area except Log read
 * `--measure-panel` (52rem) while Log read `--measure-split` through
 * split.css's `:has(.cr-split)`; and inside that 768px column the price list
 * card stood 3180px TALL for 42 rows. The scrolling was the symptom and the
 * narrow column was the cause.
 *
 * TWO SEPARATE CLAIMS, MEASURED SEPARATELY, because fixing either one alone
 * looks like fixing both:
 *
 *  - the page fills the width it is given (the `orderResult` width probe);
 *  - and the list USES it. A single column stretched to 1376px is the same
 *    height it always was, so the grid probe reads the computed column count
 *    off `grid-template-columns` rather than trusting the page width to imply
 *    it, and reports the card's height beside it.
 *
 * AT 375 BOTH PROBES ANSWER DIFFERENTLY ON PURPOSE. `minmax(min(24rem, 100%),
 * 1fr)` is one column at phone width with no breakpoint of its own, so the
 * expected value is width-dependent and the probe returns a shape that says
 * which it measured rather than a boolean that hides it.
 */
export default {
	path: '/dev/coin-desk-area-economy',
	aliasOf: '/dev/coin-desk',
	label: 'Coin desk Economy area (price list in columns)',
	prepare: [
		{
			/* THE NAV IS THE ONLY WAY IN and the harness has no router, so this
			   is a real click on the real `CoinDeskNav` in its callback mode.
			   The predicate names the price list, which only this area renders --
			   never `aria-current`, which the Log tab satisfies at rest. */
			click: '.cd-root .desk-nav li:nth-child(5) button',
			until: '() => !!document.querySelector(".cd-root .category-rows .kind-group")',
			attempts: 8,
			waitMs: 300
		},
		{
			/* AN `evaluate` STEP PRINTS ITS RETURN VALUE, which is the only way
			   to get a raw MEASUREMENT into this report -- an `orderResult` row
			   prints the array it compares and nothing else. These are the
			   numbers the instructor's report was about (832px page, 3180px
			   card at 1440 before this bundle), reported rather than gated, so
			   a future reader can see them move without a threshold reddening
			   the day somebody adds a category. */
			evaluate:
				'() => { const p = document.querySelector(".cd-root .coin-desk-page"); const list = document.querySelector(".cd-root .category-rows"); const card = document.querySelector(".cd-root .categories-manager"); if (!p || !list || !card) return "MEASUREMENT FAILED: a selector matched nothing"; const cs = getComputedStyle(list); const cols = cs.display === "grid" ? cs.gridTemplateColumns.trim().split(/\\s+/).length : 0; return "economy area: page " + Math.round(p.getBoundingClientRect().width) + "px of a " + window.innerWidth + "px viewport, price list in " + cols + " column(s), card " + Math.round(card.getBoundingClientRect().height) + "px tall"; }'
		}
	],
	presence: [
		{ selector: '.cd-root .categories-manager', label: 'the price list card', expectPresent: 1 },
		/* FOUR KIND GROUPS, NEVER A FLAT LIST. This is the structural half of
		   the column layout: poured in as one flat sequence, a kind heading
		   would land halfway down the second column with the previous kind's
		   rows above it. Exactly four -- fine, award, purchase, adjustment. */
		{ selector: '.cd-root .category-rows .kind-group', label: 'kind groups', expectPresent: 4, maxPresent: 4 },
		{ selector: '.cd-root .category-rows .kind-group .kind-heading', label: 'a heading inside every group', expectPresent: 4, maxPresent: 4 },
		{ selector: '.cd-root .category-rows .row', label: 'price list rows (positive control)', expectPresent: 30 },
		/* THE PAYOUT CARD IS THE SECOND CARD IN THIS AREA and is the control
		   that says the area rendered whole rather than just its first card. */
		{ selector: '.cd-root .payout-manager', label: 'the payout card', expectPresent: 1 }
	],
	contrast: [
		{ selector: '.cd-root .category-rows .kind-heading', label: 'a kind heading on the card', min: 4.5 },
		{ selector: '.cd-root .category-rows .row .email', label: 'a category name', min: 4.5 },
		{ selector: '.cd-root .category-rows .row .since', label: 'the price and note line', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.cd-root .category-rows .row .mini', label: 'the retire/reactivate control', min: 24 }
	],
	orderResult: [
		{
			label: 'the Economy page occupies the width it is given (it was 832 of 1440)',
			evaluate:
				'() => { const p = document.querySelector(".cd-root .coin-desk-page"); if (!p) return ["NO PAGE"]; const w = Math.round(p.getBoundingClientRect().width); const vw = window.innerWidth; return [w >= vw - 1 ? "fills-viewport" : "narrower:" + w + "/" + vw]; }',
			expected: ['fills-viewport']
		},
		{
			label: 'the price list USES that width, in columns, and collapses to one on a phone',
			/* THE COLUMN COUNT FROM `grid-template-columns` -- the RESOLVED
			   track list, not the authored rule -- so this reads what the
			   browser actually laid out.
			 *
			 * ONE VERDICT AT BOTH WIDTHS, because `expected` is a fixed value
			 * and the correct layout is not the same at 375 as at 1440. The
			 * probe applies the rule (`minmax(min(24rem, 100%), 1fr)`: several
			 * columns where there is room, exactly one where there is not) and
			 * answers whether what it found IS that. A width-shaped expectation
			 * would have to be written twice and could only ever be checked at
			 * one of them. The raw numbers are in the `prepare-eval` line above.
			 *
			 * A PAGE THAT MERELY GOT WIDER PASSES THE WIDTH PROBE AND FAILS
			 * THIS ONE, which is the whole reason it is a second row: one
			 * stretched column is 1376px wide and exactly as tall as it was. */
			evaluate:
				'() => { const list = document.querySelector(".cd-root .category-rows"); if (!list) return ["NO LIST"]; const cs = getComputedStyle(list); if (cs.display !== "grid") return ["not a grid: " + cs.display]; const cols = cs.gridTemplateColumns.trim().split(/\\s+/).length; const wide = window.innerWidth >= 1024; if (wide) return [cols >= 3 ? "as designed" : "only " + cols + " column(s) at " + window.innerWidth + "px"]; return [cols === 1 ? "as designed" : cols + " columns at " + window.innerWidth + "px"]; }',
			expected: ['as designed']
		}
	]
};
