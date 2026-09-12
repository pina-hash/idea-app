/**
 * The PropertyManager, open on the body, at both widths.
 *
 * WHY THIS IS A BROWSER CLAIM AND NOT A `tests/dom/` ONE. The panel REPLACES
 * the feature tree in the same 300px pane, and the way that goes wrong is
 * geometric rather than structural: a panel rendered BELOW the tree instead of
 * instead of it looks almost right, scrolls a little further, and passes every
 * content check ever written about either half. happy-dom has no layout engine,
 * so it reads every box as zero and cannot tell the two apart at all.
 *
 * AND THE PANE'S FOLD IS NOT A METAPHOR HERE. This container's Chromium paints
 * OVERLAY scrollbars -- measured, `.tree`'s offsetWidth and clientWidth differ
 * by its own 1px border and nothing else -- so anything past the fold of a
 * 514.6px pane is invisible with NO cue. That is what moved the standing
 * refusals to the bottom of this panel and the body's stations behind an
 * expander in the tree: prose explaining two controls that do not exist was
 * displacing the four station rows that do.
 *
 * THE STATE IS REACHED THROUGH THE REAL CONTROL. `__ideacadOpenPropertyManager`
 * double-clicks the Body Revolve row, which is exactly what a student does;
 * `BladeEditor` has no `editing` prop and must not gain one, or this file would
 * be measuring an arrangement the surface has no path to.
 *
 * TAP TARGETS ARE MEASURED WITH NO 24px EXCEPTION, as everywhere in IdeaCAD:
 * this is a student surface at every width. The station table's `+` and `−` are
 * the tightest cluster on the whole console and are the reason that matters.
 */
export default {
	path: '/dev/ideacad?role=student&state=property',
	label: 'IdeaCAD: the PropertyManager on the body, with its station table',
	prepare: [
		{ waitFor: '() => typeof window.__ideacadPaneVerdicts === "function"' },
		{ waitFor: '() => !!window.__ideacadCamera?.()' },
		{ evaluate: '() => window.__ideacadOpenPropertyManager()' },
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"ideacad-property-manager\\"]")' }
	],
	orderResult: [
		{
			label: 'the panel replaced the tree, in the tree’s own pane, with its table and preview inside it',
			evaluate: '() => window.__ideacadPaneVerdicts()',
			expected: [
				'the PropertyManager is on screen ok',
				'it replaced the feature tree rather than joining it ok',
				'it is inside the pane the tree was in ok',
				'every station cell is inside that pane ok',
				'the profile preview is drawn and inside the pane ok',
				'nothing is wider than the window ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-property-manager"]', label: 'the PropertyManager', expectPresent: 1, expectVisible: 1 },
		/* The tree, ABSENT, with the panel above as the positive control that the
		   pane rendered something at all. "Replaced in place" is exactly this pair
		   of counts and cannot be asserted by either one alone. */
		{ selector: '.tree [role="tree"]', label: 'the FeatureManager list, replaced', expectPresent: 0 },
		/* Four seeded stations, one row each. A count, because a table that
		   rendered one row looks fine to a selector. */
		{ selector: '.pm tbody tr', label: 'station rows', expectPresent: 4, expectVisible: 4 },
		{ selector: '.pm tbody input', label: 'the r and z cells', expectPresent: 8, expectVisible: 8 },
		{ selector: '.pm .acts button', label: 'add and remove, one pair per station', expectPresent: 8, expectVisible: 8 },
		{ selector: '.pm .profile svg', label: 'the 2D profile preview', expectPresent: 1, expectVisible: 1 },
		{ selector: '.pm .profile circle', label: 'one dot per station on the profile', expectPresent: 4, expectVisible: 4 },
		{ selector: '.pm .confirm button', label: 'the green check and the red X', expectPresent: 2, expectVisible: 2 },
		{ selector: '.pm .reorder button', label: 'Move up and Move down', expectPresent: 2, expectVisible: 2 },
		/* ONE CONFIRM PAIR ON SCREEN. The viewport's own pair is withdrawn while
		   this panel is up: two Accepts on a 1440px console, measured, with
		   nothing saying which one to press. */
		{ selector: 'footer button', label: 'the viewport’s confirm pair, withdrawn while the panel is up', expectPresent: 0 },
		{ selector: '.pm .standing', label: 'the sentence saying why no feature renames or deletes', expectPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '.pm',
			label: 'the panel names its bounds rather than leaving them to be discovered',
			must: ['Stations, 3 to 8', 'r (in)', 'z (in)', 'none of them can be deleted or renamed'],
			/* The body panel has no slider and no numeric parameter of its own --
			   its parameters ARE the stations -- so a stray field here would mean
			   `panelFor` had started answering for the wrong feature. */
			mustNot: ['Across flats', 'Blades']
		}
	],
	contrast: [
		{ selector: '.pm h3', label: 'the panel heading on the pane ground', min: 4.5 },
		{ selector: '.pm caption', label: 'the station table caption', min: 4.5 },
		{ selector: '.pm thead th', label: 'a station column header', min: 4.5 },
		{ selector: '.pm tbody th', label: 'a station row number', min: 4.5 },
		{ selector: '.pm .note', label: 'the panel’s own prose', min: 4.5 },
		{ selector: '.pm .profile figcaption', label: 'the profile caption', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.pm .confirm button', label: 'the confirm pair' },
		{ selector: '.pm .reorder button', label: 'a reorder control' },
		{ selector: '.pm .back', label: 'the way back to the tree' },
		{ selector: '.pm tbody input', label: 'a station cell' },
		{ selector: '.pm .acts button', label: 'add or remove a station' }
	]
};
