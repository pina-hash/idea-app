/**
 * BACK TO "NO PATHWAY YET" FROM THE PROFILE MENU (ledger 0360, report R18).
 *
 * The select used to carry a disabled "Choose one" that vanished once a
 * pathway was stored, so a student who mis-picked -- a freshman who tapped a
 * pathway to get past the sheet -- could never go back to unset. "No pathway
 * yet" is now always the first option and always pickable. Choosing it must
 * clear the column AND record the answer, because the root layout's
 * first-sign-in sheet fires on exactly "a student with no pathway": a clear
 * without the answer would put the sheet straight back over the menu.
 *
 * IT STARTS FROM A STORED PATHWAY (`?pathway=CSEE`), so the sheet is not up on
 * arrival; the row that matters is that it is STILL not up after the write,
 * whose `invalidateAll()` re-runs every load and hands the sheet a profile
 * with a null pathway. The sheet holds no latch for this path (the answer was
 * given in the menu, not on the sheet), so its absence is the stored answer
 * working.
 */
const TODAY = `new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })`;

export default {
	path: '/dev/profile-menu?pathway=CSEE&state=not-yet',
	label: 'ProfileMenu: a student goes back to No pathway yet, and the sheet does not come back',
	prepare: [
		{
			click: '.pm-trigger',
			until: `() => !!document.querySelector('.pm-panel')`,
			label: 'open the panel from the trigger'
		},
		{
			evaluate: `() => { const sel = document.querySelector('.pm-select'); return 'before: stored=' + document.querySelector('[data-testid="pathway"]').textContent.trim() + ', not-yet=' + document.querySelector('[data-testid="pathway-not-yet"]').textContent.trim() + ', select=' + JSON.stringify(sel.value) + ', chips=' + document.querySelectorAll('.pathway-chip').length + ', sheet=' + (document.querySelector('.pwp-overlay') ? 'UP' : 'none'); }`,
			label: 'the stored pathway, the select and the chips before the choice'
		},
		{
			/* The choice, as a real pick dispatches it. The `until` is the STORED
			   ROW moving: a select shows the picked option before anything is
			   written. */
			evaluate: `() => { const s = document.querySelector('.pm-select'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); return 'picked ' + JSON.stringify(s.value) + ' (' + s.selectedOptions[0].textContent.trim() + ')'; }`,
			until: `() => document.querySelector('[data-testid="pathway"]').textContent.trim() === 'unset' && document.querySelector('[data-testid="pathway-not-yet"]').textContent.trim() !== 'none'`,
			label: 'choose No pathway yet and wait for the stored row to say so'
		}
	],
	presence: [
		{ selector: '.pm-panel', label: 'the panel is still open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-select', label: 'the select, to pick a pathway again', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-select option', label: 'six pathways plus No pathway yet (an option has no box of its own)', expectPresent: 7, maxPresent: 7, expectVisible: 0 },
		/* Both chips WERE there (CSEE was stored); unset renders none. */
		{ selector: '.pathway-chip', label: 'no pathway chip after going back to unset', expectPresent: 0, expectVisible: 0 },
		{ selector: '.pm-error', label: 'no refusal on the path that worked', expectPresent: 0, expectVisible: 0 },
		/* THE ROW THE ANSWER EXISTS FOR. */
		{ selector: '.pwp-overlay', label: 'the first-sign-in sheet did not come back over the menu', expectPresent: 0, expectVisible: 0 }
	],
	orderResult: [
		{
			label: 'the column is unset, the answer is stored today, and the select shows No pathway yet',
			evaluate: `() => { const today = ${TODAY}; const sel = document.querySelector('.pm-select'); const nn = document.querySelector('[data-testid="pathway-not-yet"]').textContent.trim(); return [document.querySelector('[data-testid="pathway"]').textContent.trim(), nn === today ? 'answered today' : 'NOT TODAY: ' + nn, JSON.stringify(sel.value), sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : 'NONE SELECTED']; }`,
			expected: ['unset', 'answered today', '""', 'No pathway yet']
		},
		{
			/* THE SENTENCE UNDER THE SELECT SAYS WHAT UNSET MEANS, rather than
			   the boards line that is about a stored pathway. */
			label: 'the note under the select explains No pathway yet',
			evaluate: `() => [document.querySelector('.pm-note').textContent.trim()]`,
			expected: ['Freshman, or still deciding. Pick a pathway any time from your profile.']
		}
	],
	contrast: [
		{ selector: '.pm-select', label: 'No pathway yet, as a word in the select', min: 4.5 },
		{ selector: '.pm-note', label: 'the note under the select', min: 4.5 }
	],
	tapTargets: [{ selector: '.pm-select', label: 'the pathway select', min: 44 }]
};
