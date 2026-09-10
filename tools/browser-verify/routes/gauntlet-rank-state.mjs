// NO `order` EXPORT, deliberately: `../routes.mjs` reserves that field for the
// original 25 files and sorts everything since by FILENAME, so a new route
// needs nobody to pick a number and cannot collide with a parallel bundle's.

export default {
	path: '/dev/gauntlet-rank-state',
	label: 'GAUNTLET rank state -- a held run on the board and on the result card (0194)',
	/*
		0194 gave a board row the FIRST status it has ever carried. Before it,
		membership was binary: a run was in `gauntlet_leaderboard` or it was
		not, and a run under the plausibility floor was simply not, with the
		student told nothing at all.

		EVERY ROW BELOW IS AN EXCLUSION WITH ITS POSITIVE CONTROL IN THE SAME
		MEASUREMENT, because the way this regresses is not an error on screen.
		A chip that rendered on every row, or on no row, would look entirely
		deliberate; only the COUNT against the other rows says which.
	*/
	presence: [
		/*
			Four board rows, ONE of them held. `maxPresent` on both, because a
			floor alone is satisfied by a fifth row and by a second chip -- and
			a second chip is exactly the shape of the regression (a `ranked`
			state that stopped rendering nothing).
		*/
		{ selector: '.board tbody tr', label: 'board rows in the fixture', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{
			selector: '.board tbody .rs-chip',
			label: 'held chips on the board (exactly one of four rows)',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1,
			maxVisible: 1
		},
		/*
			The whole page: the board's one chip, the result-card mount's one,
			and NOTHING for the `ranked` mount. Three would mean the ranked
			state started drawing itself.
		*/
		{ selector: '.rs-chip', label: 'chips on the page (board + result card, never the ranked mount)', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		/*
			The explaining form is the branch of the result card that never
			rendered before 0194. Exactly one, and the board's chip must not be
			wearing it.
		*/
		{ selector: '.rs-detail', label: 'the result card sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		/*
			THE GLYPH IS NOT THE SIGNAL ON ITS OWN and neither is the hue, so
			the word rides with every chip: one `.rs-word` per `.rs-chip`, which
			a chip reduced to an icon would fail.
		*/
		{ selector: '.rs-chip .rs-word', label: 'the word beside every glyph', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 },
		{ selector: '.rs-chip .rs-glyph', label: 'the glyph beside every word', expectPresent: 2, maxPresent: 2 }
	],
	textContains: [
		{
			selector: '.board tbody .rs-chip',
			label: 'the held row says what it is, in a word',
			must: ['Pending verification']
		},
		{
			selector: '.rs-detail',
			label: 'the student is told what happened AND what comes next',
			must: ['held for a teacher to check', 'nothing to redo', 'instructor can see it']
		},
		/*
			THE RULE THIS PAGE EXISTS TO PROTECT, asserted as an absence.
			Decision 19's whole argument for a status rather than an explanation
			is that it says something true WITHOUT handing a forger the number.
			A sentence that acquired "30 seconds" would read perfectly well and
			would give the threshold away on a page every student can reach.
		*/
		{
			selector: 'main',
			label: 'no threshold is named anywhere on the surface',
			mustNot: ['30 seconds', '30s', '4.3 seconds', 'under 30', 'plausibility floor']
		},
		/*
			The `#` column is never blank on a held row -- an empty cell in a
			numbered column reads as a rendering fault. The ranked rows keep
			their numbers, which is also the control saying the board did not
			renumber itself around the held one.
		*/
		{
			selector: '.board tbody',
			label: 'ranked rows keep 1/2/3 and the held row shows a mark, not a blank',
			must: ['1', '2', '3', '–']
		}
	],
	contrast: [
		/*
			The chip is the only thing on screen saying a run is held, so its
			ink is read at the 4.5 text floor and its edge at the 3.0 non-text
			floor. Measured against the REAL rendered ground rather than the
			token, because the fill is pinned to `--bg2` and the ground behind
			the row is the board's, not the page plate's.
		*/
		{ selector: '.rs-chip .rs-word', label: 'the held chip word', min: 4.5 },
		{ selector: '.rs-detail', label: 'the result card sentence', min: 4.5 }
	]
};
