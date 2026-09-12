// original array position 13 of 25 -- see ../README.md for what `order` means
export const order = 13;

export default {
	path: '/dev/foundry-gallery',
	label: 'Foundry gallery / review harness (telemetry + admin metadata)',
	/* Both `gallerySlug` and `reviewSlug` default to 'hostile-probe', so the
	   page loads with a detail pane already open on both halves. Under
	   `ClassSplit`'s `narrow="swap"` that means the GALLERY's nav pane --
	   where the sort control lives -- is the one pane hidden at 375px, same
	   as a student who followed a deep link straight to an app. The
	   harness's own deselect control is what a visitor to bare `/foundry`
	   does; clicking it is what makes the sort buttons measurable at both
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
			MOST PLAYED HAS TO BE PRESSED FOR A COUNT TO EXIST AT ALL NOW, and
			that is the gallery's rule rather than a harness convenience: a card
			carries a play count only while a play RANKING is in force. Under
			`Recent` -- the default, and where this spec used to assert two
			chips -- every card shows none, because a number on every card of a
			gallery nobody ordered by plays reads as a verdict on the work
			rather than as a measurement.
		*/
		{
			click: '.fdy-gal-sort-btn[data-sort="played"]',
			until: '() => document.querySelectorAll("[data-testid=\'fdy-card-plays\']").length === 2'
		}
	],
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
		{ selector: '[data-testid="foundry-gallery-grid"] li', label: 'gallery cards', expectPresent: 3, maxPresent: 3 },
		{ selector: '.fdy-gal-sort-btn', label: 'gallery sort buttons', expectPresent: 3, maxPresent: 3 },
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
		{ selector: '.fdy-gal-sort-btn[aria-pressed="true"]', label: 'sort control, active', min: 4.5 },
		{ selector: '.fdy-gal-sort-btn[aria-pressed="false"]', label: 'sort control, inactive', min: 4.5 },
		{ selector: '[data-testid="foundry-inspector"] .fdy-insp-get a.btn', label: 'inspector download control', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.fdy-gal-sort-btn', label: 'gallery sort buttons', min: 44 },
		{ selector: '[data-testid="foundry-inspector"] .fdy-insp-get a.btn', label: 'inspector download control', min: 44 }
	],
	/*
		THE REGRESSION THIS CATCHES: a first draft styled the active sort
		button `color: var(--green)`, which `.btn` was already setting, so
		pressed and unpressed rendered the IDENTICAL foreground at the
		IDENTICAL 8.28:1 ratio and only `aria-pressed` told them apart --
		invisible to a sighted reader. Two ordinary `contrast` checks above
		would not have caught it (8.28:1 clears 4.5:1 twice over); this one
		asserts the two states actually differ from EACH OTHER.
	*/
	statePairs: [
		{
			activeSelector: '.fdy-gal-sort-btn[aria-pressed="true"]',
			inactiveSelector: '.fdy-gal-sort-btn[aria-pressed="false"]',
			label: 'sort control: active vs inactive must render differently'
		}
	]
};
