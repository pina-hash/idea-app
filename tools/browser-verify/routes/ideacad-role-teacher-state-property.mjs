/**
 * The same PropertyManager a teacher gets: role parity as an ABSENCE, measured.
 *
 * 0145 PART 5's rule is one component gated by `readOnly` and by which
 * transports it is handed -- no second render path. So the claim worth
 * measuring is not that the teacher's panel looks different; it is that it is
 * the SAME panel with the writes gone. This file asserts both halves at once:
 * the panel, its station table and its profile preview are all present and
 * countable (the positive control, and the parity claim), and every confirm,
 * every reorder and every add-or-remove is at zero.
 *
 * A ONE-SIDED VERSION OF THIS FILE WOULD PASS ON A BLANK PAGE, which is the
 * shape of absence assertion this repository has paid for before.
 */
export default {
	path: '/dev/ideacad?role=teacher&state=property',
	label: 'IdeaCAD: the read-only PropertyManager, role parity as an absence',
	prepare: [
		{ waitFor: '() => typeof window.__ideacadPaneVerdicts === "function"' },
		{ waitFor: '() => !!window.__ideacadCamera?.()' },
		{ evaluate: '() => window.__ideacadOpenPropertyManager()' },
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"ideacad-property-manager\\"]")' }
	],
	orderResult: [
		{
			label: 'the read-only panel occupies the pane exactly as the student’s does',
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
		/* PRESENT: the same panel, the same four stations, the same preview. */
		{ selector: '[data-testid="ideacad-property-manager"]', label: 'the PropertyManager', expectPresent: 1, expectVisible: 1 },
		{ selector: '.pm tbody tr', label: 'station rows, the same four', expectPresent: 4, expectVisible: 4 },
		{ selector: '.pm tbody input', label: 'the r and z cells, shown and disabled', expectPresent: 8, expectVisible: 8 },
		{ selector: '.pm .profile circle', label: 'one dot per station on the profile', expectPresent: 4, expectVisible: 4 },
		/* ABSENT: every write. */
		{ selector: '.pm .confirm', label: 'the confirm pair', expectPresent: 0 },
		{ selector: '.pm .reorder', label: 'the reorder pair', expectPresent: 0 },
		{ selector: '.pm .acts button', label: 'add and remove a station', expectPresent: 0 },
		{ selector: '.pm .standing', label: 'the refusal prose, which answers a question a reader cannot ask here', expectPresent: 0 },
		{ selector: 'footer button', label: 'the viewport’s confirm pair', expectPresent: 0 },
		{ selector: 'header .hist', label: 'Undo and Redo', expectPresent: 0 },
		{ selector: '.concepts button:not(.card)', label: 'every concept-strip write control', expectPresent: 0 },
		/* And the positive control for THAT absence: the cards themselves are
		   still there, so the strip rendered. */
		{ selector: '.concepts .card', label: 'the concept cards, which a teacher still reads', expectPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.pm h3', label: 'the panel heading on the pane ground', min: 4.5 },
		{ selector: '.pm caption', label: 'the station table caption', min: 4.5 },
		{ selector: '.pm tbody th', label: 'a station row number', min: 4.5 }
	],
	tapTargets: [{ selector: '.pm .back', label: 'the way back to the tree' }]
};
