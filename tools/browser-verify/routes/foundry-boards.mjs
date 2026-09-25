/*
	THE ROUTE NAME IS HISTORICAL. `/dev/foundry-boards` was built for the four
	ranked sections ("boards") 0221 put above the gallery list; decision 39
	(2026-09-25, Mr. Pina, by filing R11) replaced them with ONE native
	`<select>` over ONE list, and this spec now measures that. The path and the
	file keep their names because the measured store is keyed on them.

	CHOOSING AN ORDER IS AN `evaluate`, because a native select's option list is
	the platform's own popup and a `click` cannot pick from it. Setting `value`
	and dispatching `change` is exactly what a pick does, and the component reads
	`event.currentTarget.value` through `isGallerySort`.
*/
export const choose = (id, until) => ({
	evaluate: `() => { const el = document.querySelector('[data-testid="foundry-gallery-sort"]'); if (!el) return 'NO SORT CONTROL'; el.value = ${JSON.stringify(id)}; el.dispatchEvent(new Event('change', { bubbles: true })); return 'chose ' + el.value + ' (' + el.selectedOptions[0].textContent.trim() + ')'; }`,
	until
});

/* The cards in DOM order, which is the ranking (the mosaic is column-major on
   screen, so a screen read would not be). */
export const SLUGS = `() => [...document.querySelectorAll('.fdy-gal-mosaic [data-testid="fdy-card"]')].map((c) => c.getAttribute('data-app-slug'))`;
export const FIGURES = `() => [...document.querySelectorAll('.fdy-gal-mosaic [data-testid="fdy-card-plays"]')].map((e) => e.textContent.trim())`;

/*
	NO DEAD SPACE, MEASURED RATHER THAN ASSERTED BY ABSENCE OF A REGION. The
	boards' dead space was a flex ROW made tall by one portrait cover; the
	mosaic is multicol, so the only gap between two cards in one column should
	be the card's own bottom margin (0.75rem, 12px). This reads the WORST gap
	between vertically adjacent cards in every column, and reports the ragged
	bottom (the spread of column bottoms) beside it for the reader, unasserted:
	that is the ordinary end of a balanced multicol, not dead space.
*/
export const DEAD_SPACE = {
	evaluate: `() => {
		const lis = [...document.querySelectorAll('.fdy-gal-mosaic > li')];
		const cols = new Map();
		for (const li of lis) { const b = li.getBoundingClientRect(); const x = Math.round(b.left); if (!cols.has(x)) cols.set(x, []); cols.get(x).push(b); }
		let worst = 0; const bottoms = [];
		for (const bs of cols.values()) { bs.sort((a, b) => a.top - b.top); for (let i = 1; i < bs.length; i++) worst = Math.max(worst, bs[i].top - bs[i - 1].bottom); bottoms.push(bs[bs.length - 1].bottom); }
		const top = Math.min(...lis.map((li) => li.getBoundingClientRect().top));
		return lis.length + ' cards in ' + cols.size + ' column(s) at ' + window.innerWidth + 'px; worst gap between two cards in a column ' + worst.toFixed(1) + 'px; column heights ' + bottoms.map((b) => Math.round(b - top)).join('/') + 'px (the ragged end of a balanced multicol, unasserted)';
	}`,
	until: `() => {
		const lis = [...document.querySelectorAll('.fdy-gal-mosaic > li')];
		if (!lis.length) return false;
		const cols = new Map();
		for (const li of lis) { const b = li.getBoundingClientRect(); const x = Math.round(b.left); if (!cols.has(x)) cols.set(x, []); cols.get(x).push(b); }
		for (const bs of cols.values()) { bs.sort((a, b) => a.top - b.top); for (let i = 1; i < bs.length; i++) if (bs[i].top - bs[i - 1].bottom > 13) return false; }
		return true;
	}`
};

/* How many regions inside the gallery pane scroll SIDEWAYS. The boards were
   four of them; the answer is none. */
export const SIDEWAYS_SCROLLERS = `() => [String([...document.querySelectorAll('.fdy-gal-pane, .fdy-gal-pane *')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1).length)]`;

export default {
	path: '/dev/foundry-boards',
	label: 'Foundry gallery: one sort control and search (decision 39)',
	/*
		THE FIRST PAINT IS WHAT IS MEASURED, under the default order (Most
		played, decision 04). The geometry step is the only prepare: nothing is
		chosen, because a student arrives in exactly this state.
	*/
	prepare: [
		{ evaluate: '() => new Promise((r) => setTimeout(() => r("settled"), 600))', until: '() => true' },
		DEAD_SPACE,
		/* THE CONTROL CLEARS 44px AND IS NEVER WIDER THAN ITS PANE, measured on
		   the element rather than inferred from `.tap-44`. */
		{
			evaluate: `() => { const s = document.querySelector('[data-testid="foundry-gallery-sort"]'); const p = document.querySelector('.fdy-gal-pane'); const b = s.getBoundingClientRect(), pb = p.getBoundingClientRect(); return 'select ' + b.width.toFixed(1) + 'x' + b.height.toFixed(1) + ' in a ' + pb.width.toFixed(1) + 'px pane, right edge ' + b.right.toFixed(1) + ' vs ' + pb.right.toFixed(1); }`,
			until: `() => { const s = document.querySelector('[data-testid="foundry-gallery-sort"]'); const p = document.querySelector('.fdy-gal-pane'); if (!s || !p) return false; const b = s.getBoundingClientRect(), pb = p.getBoundingClientRect(); return b.height >= 44 && b.right <= pb.right + 0.5; }`
		}
	],
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
		{
			selector: 'select[data-testid="foundry-gallery-sort"]',
			label: 'one native sort control',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: 'label[for="fdy-gal-sort"]',
			label: 'the sort control has a visible word, not only a value',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		/* PRESENT, NOT VISIBLE: an option inside a closed native select has no
		   box of its own -- the platform draws the list in its own popup when
		   it opens -- so a visibility floor here would redden for the control
		   being correct. The select itself is the visible row above. */
		{
			selector: '[data-testid="foundry-gallery-sort"] option',
			label: 'seven orders, the two former board orders among them',
			expectPresent: 7,
			maxPresent: 7,
			expectVisible: 0
		},
		{
			selector: '[data-testid="foundry-sort-note"]',
			label: 'what the order counts, beside the control',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		/*
			THE COVERAGE NOTE, BESIDE THE CONTROL, because the order in force
			ranks on plays. CLAUDE.md requires it beside every play figure; it
			lived inside the boards region decision 39 deleted.
		*/
		{
			selector: '[data-testid="foundry-play-coverage"]',
			label: 'play coverage note beside the control',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="foundry-gallery-grid"] > li',
			label: 'one list of every app, all nine',
			expectPresent: 9,
			maxPresent: 9
		},
		/* EIGHT OF NINE CARRY A FIGURE: Quiet Quest has no plays and
		   `playCountLabel` prints nothing for zero. The ceiling is the claim. */
		{
			selector: '.fdy-gal-mosaic [data-testid="fdy-card-plays"]',
			label: 'play figures under Most played (8 of 9, never the zero)',
			expectPresent: 8,
			maxPresent: 8,
			expectVisible: 8
		},
		{
			selector: '[data-testid="foundry-gallery-search"]',
			label: 'search box',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fdy-gal-find-label',
			label: 'the search box has a visible word, not only a placeholder',
			expectPresent: 1,
			expectVisible: 1
		},
		/* THE SECTIONS AND THE BUTTONS ARE GONE. Their positive control is the
		   select and the list above, on the same paint. */
		{ selector: '[data-testid="foundry-gallery-boards"]', label: 'ranked sections (gone)', expectPresent: 0, maxPresent: 0 },
		{ selector: '.fdy-gal-board', label: 'a ranked section (gone)', expectPresent: 0, maxPresent: 0 },
		{ selector: '.fdy-gal-sort-btn', label: 'the old sort buttons (gone)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="foundry-search-empty"]', label: 'search empty state (absent before searching)', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="foundry-sort-note"]',
			label: 'the note states what Most played counts, on a gallery that has plays',
			must: ['Every play since the app went live.'],
			mustNot: ['Nothing has been played']
		},
		{
			selector: '[data-testid="foundry-play-coverage"]',
			label: 'the coverage note says the share link is not counted',
			must: ['share link is not counted']
		}
	],
	orderResult: [
		{
			label: 'the control opens on Most played and lists decision 39’s seven orders in its order',
			evaluate: `() => { const s = document.querySelector('[data-testid="foundry-gallery-sort"]'); return [s.value, ...[...s.options].map((o) => o.textContent.trim())]; }`,
			expected: ['played', 'Most played', 'Trending', 'Played this week', 'Most hours', 'Most updated', 'Newest', 'Recently updated']
		},
		{
			label: 'the one list is ranked by plays on first paint',
			evaluate: SLUGS,
			expected: ['cookie-press', 'maze-maker', 'orbit-lab', 'sprout-sim', 'frog-frenzy', 'tide-pool', 'pixel-forge', 'bolt-run', 'quiet-quest']
		},
		{
			label: 'each card carries the metric it is ranked by',
			evaluate: FIGURES,
			expected: ['310 plays', '96 plays', '40 plays', '31 plays', '18 plays', '12 plays', '7 plays', '5 plays']
		},
		{
			label: 'regions in the gallery pane that scroll sideways (the boards were four)',
			evaluate: SIDEWAYS_SCROLLERS,
			expected: ['0']
		}
	],
	contrast: [
		{ selector: 'label[for="fdy-gal-sort"]', label: 'sort label', min: 4.5 },
		{ selector: '[data-testid="foundry-gallery-sort"]', label: 'sort control value', min: 4.5 },
		{ selector: '[data-testid="foundry-sort-note"]', label: 'what the order counts', min: 4.5 },
		{ selector: '[data-testid="foundry-play-coverage"]', label: 'play coverage note', min: 4.5 },
		{ selector: '.fdy-gal-find-label', label: 'search label', min: 4.5 }
	],
	tapTargets: [
		/*
			BOTH ARE STUDENT-FACING CONTROLS, so they clear 44 and not 24: this
			page carries no instructor-only class on its root, and CLAUDE.md's
			rule is that a surface with no such class IS student-facing.
		*/
		{ selector: '[data-testid="foundry-gallery-search"]', label: 'search input', min: 44 },
		{ selector: '[data-testid="foundry-gallery-sort"]', label: 'sort control', min: 44 }
	]
};
