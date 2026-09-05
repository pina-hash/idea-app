/**
 * THE STUDENT'S OWN TRACK, APPROVED. State three of three, and the one whose
 * whole content is an ABSENCE.
 *
 * Once a teacher approves a track it is visible and playable to every signed-in
 * player, so there is nothing left to warn the author about and the review
 * sentence must be gone entirely. That is the positive control for the other two
 * specs from the other direction: a note rendered unconditionally would pass
 * both of them and be wrong exactly here, telling a student their published
 * track is still waiting.
 */
export default {
	path: '/dev/greenline-portal?view=garage&seed=approved',
	label: 'GREENLINE garage -- the author’s own track, approved and public',
	prepare: [
		/* THE GARAGE IS THE HEAVIEST SURFACE IN THE APP and `waitForApp` returns
		   on painted-and-settled markup, which the harness chrome satisfies
		   before the component has mounted. Measured: the tab strip is not in
		   the DOM until well after that. `clickUntil` does NOT retry a selector
		   that matches nothing (it reports `0 matched, 0 attempt(s)`), so the
		   wait has to come first or every row after it describes a screen the
		   run never reached -- which is exactly what the first version of this
		   spec measured. */
		{
			waitFor: '() => !!document.querySelector(\'[data-testid="gg-tab-garage"]\')',
			timeoutMs: 20000
		},
		/* The picker lives on the GARAGE tab and the component opens on BUILD.
		   The predicate names the tile, which only the press can produce. */
		{
			click: '[data-testid="gg-tab-garage"]',
			until: '() => !!document.querySelector(".gg-track")'
		},
		/* Then wait for the SEED, not for the note: the note is what must be
		   absent here, so waiting on it would either time out or prove the
		   opposite. The community tile arriving is what says the seed landed. */
		{
			waitFor: '() => !!document.querySelector(".gg-tracks-divider")',
			timeoutMs: 20000
		}
	],
	presence: [
		{ selector: '.gg-tracks-divider', label: 'the community section exists (the seed landed)', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="track-review-note"]', label: 'NO review sentence once approved', expectPresent: 0, expectVisible: 0, maxPresent: 0 },
		{ selector: '.gg-track-tag.review', label: 'NO review chip once approved', expectPresent: 0, expectVisible: 0, maxPresent: 0 },
		/* The COMMUNITY tag stays -- the tile still says what kind of venue it
		   is, which is the row proving the tile itself is on screen and that
		   the two absences above are not an empty page. */
		{ selector: '.gg-track-tag', label: 'the tile still carries its kind tag (control for the absences)', expectPresent: 1, expectVisible: 1 }
	],
	tapTargets: [
		{ selector: '.gg-track-act', label: 'per-track actions (REPORT / REMOVE)', min: 44 }
	]
};
