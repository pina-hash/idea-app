/**
 * The coin desk's category picker, OPEN -- which is the only state the
 * instructor's first report can be measured in.
 *
 * "Transaction selection is unordered and unreadable at a glance." Three
 * things came out of that and all three need the list on screen:
 *
 *  - THE ORDER. The price list's own order, `coin_categories.sort_order`
 *    (IDEA Coin V2 session two retired the static "most used" table that was
 *    counted off the retired Sheets ledger's archive). The `orderResult`
 *    probe reads the first four rows' names, which is the assertion a
 *    screenshot cannot make.
 *  - THE GLYPHS. One per TYPE, five types, five distinct silhouettes. The probe
 *    counts DISTINCT `data-glyph` values against DISTINCT `data-type` values
 *    on the same list, so "every type has an icon" and "no two types share
 *    one" are one measurement rather than two half-assertions.
 *  - THE TONES. Every type's chip has to clear 4.5:1 against the ground it is
 *    actually painted on, which is the highlighted row's fill for one of them
 *    and the list plate for the rest. One contrast row per type, never one row
 *    with a selector that matches all five -- `contrast` reports the WORST
 *    match, so a single row would hide four readings behind one number.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL, and the `textContains` row is what says so:
 * the type's WORD is in the chip beside the glyph, so a colour-blind reader and
 * a greyscale printout both still have two signals left.
 */
export default {
	path: '/dev/coin-desk-state-picker',
	aliasOf: '/dev/coin-desk',
	label: 'Coin desk category picker, open',
	prepare: [
		{
			/* A STUDENT FIRST: the category field does not exist until there is
			   somebody to log against, so this predicate names something only
			   the click can produce. */
			click: '.cd-root [data-testid="cd-roster"] .roster-row',
			until: '() => !!document.querySelector("#cd-category")',
			attempts: 8,
			waitMs: 250
		},
		{
			/* A WAIT, NOT A SECOND CLICK, and the difference is a finding this
			   spec reported before it was written this way.
			 *
			 * Picking a student calls `advance()`, which FOCUSES the category
			 * field, which opens the list -- so by the time a `click: '#cd-category'`
			 * step ran, its `until` already held, `clickUntil` short-circuited,
			 * and the report said `0 attempt(s), the predicate ALREADY HELD`.
			 * That is the harness working: a click that never fires reaches no
			 * state, and `force: true` would only have made a redundant click
			 * fire. The list is a state that ARRIVES here, so it is waited on.
			 * A `waitFor` returning at 0ms is not a finding -- waiting is not
			 * supposed to cause anything. */
			waitFor:
				'() => document.querySelectorAll("[data-testid=\\"cd-category-list\\"] .combo-option").length > 0',
			timeoutMs: 8000
		}
	],
	presence: [
		{ selector: '.cd-root [data-testid="cd-category-list"] .combo-option', label: 'category rows in the open list', expectPresent: 30 },
		/* THE POSITIVE CONTROL for every absence and every count below: a glyph
		   on every row. A run where the component rendered no glyphs at all
		   would satisfy "no two glyphs are the same" perfectly. */
		{ selector: '.cd-root [data-testid="cd-category-list"] .status-chip-glyph', label: 'one glyph per row', expectPresent: 30 },
		/* A DECORATIVE GLYPH IS aria-hidden, ALL OF THEM. It never appears
		   without the type's word beside it, so announcing it would read the
		   type twice. */
		{ selector: '.cd-root [data-testid="cd-category-list"] .status-chip-glyph:not([aria-hidden="true"])', label: 'no glyph announces itself', expectPresent: 0, expectVisible: 0, maxVisible: 0 }
	],
	contrast: [
		{ selector: '.cd-root .combo-option[data-type="award"] .status-chip', label: 'AWARD chip (ok)', min: 4.5 },
		{ selector: '.cd-root .combo-option[data-type="fine"] .status-chip', label: 'FINE chip (warn)', min: 4.5 },
		{ selector: '.cd-root .combo-option[data-type="purchase"] .status-chip', label: 'PURCHASE chip (neutral)', min: 4.5 },
		{ selector: '.cd-root .combo-option[data-type="adjustment"] .status-chip', label: 'ADJUSTMENT chip (special)', min: 4.5 },
		/* No PAYOUT chip since IDEA Coin V2 (ledger 0384): Coin Payout is not
		   loggable, so the picker carries four types; the payout transfer is the
		   Economy page's. */
		{ selector: '.cd-root [data-testid="cd-category-list"] .combo-name', label: 'the category name itself', min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-category-list"] .combo-price', label: 'the price hint', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.cd-root [data-testid="cd-category-list"] .combo-option', label: 'category rows', min: 44 }
	],
	textContains: [
		{
			selector: '.cd-root .combo-option[data-type="fine"] .status-chip',
			label: 'a fine chip says the word, not only the colour',
			must: ['Fines']
		},
		{
			selector: '.cd-root .combo-option[data-type="award"] .status-chip',
			label: 'an award chip says the word',
			must: ['Awards']
		}
	],
	orderResult: [
		{
			label: 'the list opens in the price list order',
			/* THE FIXTURE'S FIRST FOUR ACTIVE, LOGGABLE CATEGORIES in
			   `coin_categories.sort_order` (the harness ledger's own order):
			   Shop Not Cleaned Up is retired and is skipped. Four and not all,
			   so an unrelated category edit further down cannot redden this. */
			evaluate:
				'() => [...document.querySelectorAll("[data-testid=\\"cd-category-list\\"] .combo-option .combo-name")].slice(0, 4).map((e) => e.textContent.trim())',
			expected: ['Shop Safety Violation', 'Coin Theft', 'Classmate Trust Violation', 'Eating Violation']
		},
		{
			label: 'the count of distinct glyphs equals the count of distinct types',
			evaluate:
				'() => { const rows = [...document.querySelectorAll("[data-testid=\\"cd-category-list\\"] .combo-option")]; if (!rows.length) return ["NO ROWS"]; const types = new Set(rows.map((r) => r.dataset.type)); const glyphs = new Set(rows.map((r) => { const g = r.querySelector(".status-chip-glyph"); return g && g.dataset.glyph; })); if (glyphs.has(null) || glyphs.has(undefined)) return ["A ROW HAS NO GLYPH"]; return [types.size + " types / " + glyphs.size + " glyphs"]; }',
			expected: ['4 types / 4 glyphs']
		},
		{
			label: 'every row carries a tone, so none falls through uncoloured',
			evaluate:
				'() => { const rows = [...document.querySelectorAll("[data-testid=\\"cd-category-list\\"] .combo-option")]; if (!rows.length) return ["NO ROWS"]; const untoned = rows.filter((r) => !(r.getAttribute("style") || "").includes("--st-ink") || !r.querySelector(".status-chip[data-tone]")); return [untoned.length === 0 ? "all toned (" + rows.length + " rows)" : untoned.length + " untoned"]; }',
			expected: ['all toned (33 rows)']
		}
	]
};
