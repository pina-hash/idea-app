// original array position 13 of 25 -- see ../README.md for what `order` means
export const order = 13;

import { choose } from './foundry-boards.mjs';

export default {
	path: '/dev/foundry-gallery',
	label: 'Foundry gallery / review harness (telemetry + admin metadata)',
	/* Both `gallerySlug` and `reviewSlug` default to 'hostile-probe', so the
	   page loads with a detail pane already open on both halves. Under
	   `ClassSplit`'s `narrow="swap"` that means the GALLERY's nav pane --
	   where the sort control lives -- is the one pane hidden at 375px, same
	   as a student who followed a deep link straight to an app. The
	   harness's own deselect control is what a visitor to bare `/foundry`
	   does; clicking it is what makes the sort control measurable at both
	   widths rather than only the one where a selection happens not to
	   collapse the nav pane. The review pane is left alone deliberately: its
	   selection is what puts `FoundryPlayStats` and the metadata editor on
	   screen, which is the whole point of this route being listed. */
	prepare: [
		{
			click: '[data-testid="gallery-deselect"]',
			until: '() => !!document.querySelector("[data-testid=\'foundry-gallery-grid\']") && !document.querySelector(".fdy-gal-detail")'
		},
		/*
			MOST PLAYED HAS TO BE IN FORCE FOR A COUNT TO EXIST AT ALL, and that
			is the gallery's rule rather than a harness convenience: a card
			carries a play count only while a play RANKING is in force. Under
			`Recent` every card shows none, because a number on every card of a
			gallery nobody ordered by plays reads as a verdict on the work
			rather than as a measurement.

			IT IS CHOSEN EXPLICITLY EVEN THOUGH IT IS THE DEFAULT. Decision 04
			(answered 2026-09-12) moved the opening order from `Recent` to
			`Most played`, so choosing it alone would change nothing -- and that
			is the point: a spec whose
			measured state depends on which order happens to be the default is
			one that goes quietly wrong the next time the default moves, which
			is precisely what this bundle was written to fix one level up.
			`routes/foundry-gallery-state-detail-stats.mjs` measures the detail
			pane; which order the gallery OPENS on is
			`tests/dom/foundry-sort.test.ts`'s claim and is made in one place.
		*/
		/* RECENTLY UPDATED FIRST, SO THE CHOICE BELOW IS A REAL ONE. Going to
		   `recent` and back makes both steps move the page, and the pair
		   measures the count rule in both directions rather than asserting one
		   half of it against a default. The control is a native `<select>`
		   since decision 39, so each step is a `change` rather than a click. */
		choose('recent', '() => document.querySelectorAll("[data-testid=\'fdy-card-plays\']").length === 0'),
		choose('played', '() => document.querySelectorAll("[data-testid=\'fdy-card-plays\']").length === 2')
	],
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
		{ selector: '[data-testid="foundry-gallery-grid"] li', label: 'gallery cards', expectPresent: 3, maxPresent: 3 },
		/* ONE NATIVE `<select>` WITH SEVEN ORDERS SINCE DECISION 39. It
		   replaced five buttons, and the two board-only orders (`trending`,
		   `new`) the four ranked sections held are options in it now. The
		   ceilings are the assertion; the old buttons' absence is the exclusion
		   whose positive control is the select on the same paint. */
		{ selector: 'select[data-testid="foundry-gallery-sort"]', label: 'gallery sort control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* Present, not visible: an option in a closed native select has no box. */
		{ selector: '[data-testid="foundry-gallery-sort"] option', label: 'gallery sort orders', expectPresent: 7, maxPresent: 7, expectVisible: 0 },
		{ selector: '.fdy-gal-sort-btn', label: 'the old sort buttons (gone)', expectPresent: 0, maxPresent: 0 },
		/*
			TWO OF THREE FIXTURE APPS CARRY A NONZERO PLAY COUNT; the third is
			zero on purpose (`playCountLabel` renders no chip for zero), so this
			is an exclusion assertion as much as a presence one -- 2 chips
			painted, never 3, proves the zero case is genuinely rendering
			nothing rather than the fixture simply lacking a third number.

			IT IS MEASURED UNDER `Most played`, which the prepare step above
			presses. All three fixture apps carry `cover_path: null`, so all
			three draw a GENERATED cover -- and a generated cover has no name
			plate, because its art already states the name. It gets one only
			when there is a count to put on it, which is exactly this state:
			without that branch a coverless app ranked by plays would show no
			number at all, and the ranking would be one the reader cannot check.
		*/
		/* `maxPresent` IS WHAT MAKES THE SENTENCE ABOVE TRUE. `expectPresent` is
		   a FLOOR, so "never 3" was not measured: giving the third fixture app
		   `plays: 7` painted a third chip and this row came back
		   `ok ... present 3` against `>= 2`, with its own label still reading
		   "2 of 3 apps played". The zero case is the assertion; a ceiling is
		   the only way to state it. */
		/* VISIBLE, not merely present, and at BOTH widths: a plate carrying a
		   count is exempt from the hover reveal, because somebody who pressed
		   Most played asked to see a ranking. */
		{ selector: '[data-testid="fdy-card-plays"]', label: 'play-count chips (2 of 3 apps played)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="foundry-inspector"]', label: 'review inspector (admin path)', expectPresent: 1 },
		{ selector: '[data-testid="foundry-play-stats"]', label: 'FoundryPlayStats block', expectPresent: 1 },
		{ selector: '[data-testid="foundry-metadata-edit"]', label: 'admin metadata editor', expectPresent: 1 },
		/* The inspector's own download control (FoundryInspector.svelte), never
		   measured by the harness before this: 'hostile-probe's reviewed
		   version carries real fixture bundle files (file_count > 0) and its
		   app is not hidden, so `foundryDownloadable` holds and the control
		   renders. Hand-measured previously at 208 x 45.4, 8.28:1. */
		{ selector: '[data-testid="foundry-inspector"] .fdy-insp-get a.btn', label: 'inspector download control', expectPresent: 1 }
	],
	contrast: [
		{ selector: '[data-testid="foundry-gallery-sort"]', label: 'sort control value', min: 4.5 },
		{ selector: 'label[for="fdy-gal-sort"]', label: 'sort control label', min: 4.5 },
		{ selector: '[data-testid="foundry-inspector"] .fdy-insp-get a.btn', label: 'inspector download control', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="foundry-gallery-sort"]', label: 'gallery sort control', min: 44 },
		{ selector: '[data-testid="foundry-inspector"] .fdy-insp-get a.btn', label: 'inspector download control', min: 44 }
	]
	/*
		NO `statePairs` ANY MORE. It pinned that a PRESSED sort button rendered
		differently from its unpressed siblings (a first draft rendered both at
		the identical 8.28:1 and only `aria-pressed` told them apart). A native
		`<select>` shows exactly one value, the one in force, so there is no
		pressed/unpressed pair to compare -- the claim went with the buttons
		(decision 39) rather than being relaxed.
	*/
};
