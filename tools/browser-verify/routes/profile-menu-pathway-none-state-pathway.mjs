/**
 * A STUDENT SETS THEIR OWN PATHWAY FROM THE PROFILE MENU, END TO END (ledger
 * 0280). `profile-menu-state-open.mjs` measures that the control is THERE and
 * clears the floors; this spec presses it and follows the value all the way to
 * the stored row and back out to every surface that reads it.
 *
 * WHY THE CONTROL EXISTS. `PathwayPicker` caps a deferral at seven days
 * (`PATHWAY_DEFER_MAX_AGE_MS`), correctly -- a deferral with no end means the
 * student never gets a pathway. But nothing else on the site wrote the column,
 * so that cap turned a one-time sheet into a recurring one. This is the second
 * route, and these rows are what say it works.
 *
 * IT STARTS FROM THE STRANDED STATE ITSELF, not from a convenient one.
 * `?pathway=none` seeds a null column on a student profile, which is exactly
 * what `PathwayPicker`'s own `show` predicate fires on -- so the run OPENS with
 * the first-login sheet up, presses its documented "Choose later" exit, and
 * only then reaches the menu. That is the student this bundle is for, in
 * order: deferred the sheet, has no pathway, and until now had no second route
 * to one. Driving it any other way would measure the control without
 * reproducing the reason it exists.
 *
 * WITH THE COLUMN NULL, `PathwayChip` RENDERS NOTHING ANYWHERE and no tile is
 * checked. That is the honest starting point and it is also the harder one to
 * assert, which is why the readout below is read rather than the chip -- an
 * absent chip cannot be told from a component that failed to mount.
 *
 * THE READOUT IS THE STORED ROW. `data-testid="pathway"` on the harness page
 * prints what the stub's store holds after `invalidateAll()`, so a tile that
 * changed the markup and not the row reddens here. The chips are asserted
 * BESIDE it, not instead of it.
 *
 * "WITH NO RELOAD" IS MEASURED, NOT ASSUMED. A marker is planted on `window`
 * before the tap; a reload destroys the realm and takes it with it. Reading
 * the value back after the write is the whole instrument -- and it is a
 * POSITIVE CONTROL for itself, since a marker that was never planted and a
 * marker destroyed by a reload both read as missing, so the plant step returns
 * the value it just set.
 */
export default {
	path: '/dev/profile-menu?pathway=none&state=pathway',
	label: 'ProfileMenu: a student sets their own pathway, unset to CSEE, no reload',
	prepare: [
		{
			/* THE SHEET IS UP, AND SAYING SO IS THE POSITIVE CONTROL FOR THE
			   PRESS BELOW. Without this reading, a run in which the picker never
			   rendered at all would satisfy "the picker is gone" trivially and
			   the spec would claim to have reproduced a state it never reached. */
			evaluate: `() => { const o = document.querySelector('.pwp-overlay'); return o ? 'the first-login pathway sheet is up, as it is for any student with no pathway' : 'NO SHEET -- this run never reproduced the stranded state'; }`,
			until: `() => !!document.querySelector('.pwp-overlay')`,
			label: 'the stranded student meets the sheet first'
		},
		{
			/* ITS OWN DOCUMENTED EXIT. `Choose later` is what a student presses,
			   and since ledger 0276 it defers for seven days and then comes back
			   -- which is the deadline this bundle answers. */
			click: '.pwp-later',
			until: `() => !document.querySelector('.pwp-overlay')`,
			label: 'press Choose later and the sheet defers'
		},
		{
			click: '.pm-trigger',
			until: `() => !!document.querySelector('.pm-panel')`,
			label: 'open the panel from the trigger'
		},
		{
			/* THE BEFORE READING, taken from inside the run rather than trusted
			   from the seed: a spec that asserts an "after" without printing the
			   "before" cannot tell a working write from a value that was already
			   there. */
			evaluate: `() => { const r = document.querySelector('[data-testid="pathway"]'); const chips = document.querySelectorAll('.pathway-chip'); const checked = document.querySelectorAll('.pm-pathway[aria-checked="true"]'); return 'before: stored=' + (r ? r.textContent.trim() : 'NO READOUT') + ', chips=' + chips.length + ', checked tiles=' + checked.length; }`,
			label: 'the pathway before the tap'
		},
		{
			/* THE NO-RELOAD MARKER, planted and echoed back so the plant itself
			   cannot silently no-op. */
			evaluate: `() => { window.__bvRealm = 'realm-' + Date.now(); return 'planted ' + window.__bvRealm; }`,
			label: 'plant a realm marker the tap must not destroy'
		},
		{
			/* THE TAP. CSEE deliberately: it is one of the three pathways whose
			   raw identity colour does NOT clear 4.5:1 as text on its own tint
			   (3.31-4.17), so the ink derivation in `pathways.ts` is load-bearing
			   for exactly this tile and the contrast row below reads the corrected
			   value rather than a pathway that would have passed either way.

			   The `until` is the STORED ROW moving, not the markup: a tile that
			   painted itself checked without the write landing would satisfy a
			   class-based predicate. */
			click: '.pm-pathway:nth-of-type(4)',
			until: `() => document.querySelector('[data-testid="pathway"]').textContent.trim() === 'CSEE'`,
			label: 'tap CSEE and wait for the stored row to say so'
		},
		{
			evaluate: `() => { const r = document.querySelector('[data-testid="pathway"]'); const chips = document.querySelectorAll('.pathway-chip'); const checked = document.querySelectorAll('.pm-pathway[aria-checked="true"]'); return 'after: stored=' + r.textContent.trim() + ', chips=' + chips.length + ' (' + [...chips].map((c) => c.textContent.trim()).join('/') + '), checked tiles=' + checked.length; }`,
			label: 'the pathway after the tap'
		}
	],
	presence: [
		{ selector: '.pm-panel', label: 'the panel is still open (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE WRITE DID NOT CLOSE THE MENU. One tap is the write, so the student
		   stays where they are and can correct a mis-tap with a second tap. */
		{ selector: '.pm-pathway', label: 'the six tiles are still there to tap again', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '.pm-pathway[aria-checked="true"]', label: 'exactly one tile checked, after', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* BOTH CHIPS CAME BACK. They were absent at the start (unset renders
		   nothing), so this is not a row that could have passed before the tap:
		   one on the trigger, one in the menu's meta row. */
		{ selector: '.pathway-chip', label: 'both pathway chips, absent before the tap', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		/* NO REFUSAL. The panel's one problem list is empty on the path that
		   worked, which is the negative control for the refusal spec. */
		{ selector: '.pm-error', label: 'no refusal on the path that worked', expectPresent: 0, expectVisible: 0 },
		/* AND THE SHEET IS STILL GONE. It is mounted in the root layout and its
		   `show` reads the same column the tap just wrote, so a write that
		   landed can only have moved it further out of scope -- but the panel
		   also calls `invalidateAll()`, which re-runs every load, and a sheet
		   that came back over the menu mid-flow is the failure a student would
		   actually report. */
		{ selector: '.pwp-overlay', label: 'the first-login sheet did not come back', expectPresent: 0, expectVisible: 0 }
	],
	orderResult: [
		{
			/* THE STORED ROW, THE CHECKED TILE AND BOTH CHIPS ALL SAY CSEE, and
			   the realm that was alive before the tap is still alive. Four
			   independent readings of one write plus the reload check, in one
			   row, so a partial result cannot be read as a whole one. */
			label: 'the row, the tile, both chips and the realm agree after the write',
			evaluate: `() => { const stored = document.querySelector('[data-testid="pathway"]').textContent.trim(); const tile = document.querySelector('.pm-pathway[aria-checked="true"] .pm-pathway-word'); const chips = [...document.querySelectorAll('.pathway-chip')].map((c) => c.textContent.trim()); return [stored, tile ? tile.textContent.trim().replace(/[^A-Z]/g, '') : 'NO CHECKED TILE', chips.length === 2 && chips.every((c) => c === 'CSEE') ? 'both chips CSEE' : 'chips: ' + JSON.stringify(chips), window.__bvRealm ? 'same realm, no reload' : 'REALM GONE (the page reloaded)']; }`,
			expected: ['CSEE', 'CSEE', 'both chips CSEE', 'same realm, no reload']
		},
		{
			/* THE DISPLAY NAME'S TINT MOVED TOO. `nameTint` is
			   `pathwayColor(profile.pathway)`, so it is a fourth reader of the
			   same value and the one that is easiest to leave behind: it is
			   written as an inline style on an element the pathway section does
			   not contain. Unset paints no tint at all, so this row could not
			   have passed before the tap either. CSEE's IDENTITY is #3D7DFF --
			   the tint is the identity, not the ink, which is the documented
			   split. */
			label: 'the display name is tinted in the new pathway identity',
			evaluate: `() => { const el = document.querySelector('.pm-name'); if (!el) return ['NO NAME']; return [getComputedStyle(el).color]; }`,
			expected: ['rgb(61, 125, 255)']
		}
	],
	contrast: [
		{ selector: '.pm-pathway-word', label: 'the six pathway codes, with CSEE checked on its own tint', min: 4.5 },
		{ selector: '.pm-pathway[aria-checked="true"] .pm-pathway-word', label: 'the checked CSEE code on its 12% tint', min: 4.5 },
		{ selector: '.pm-note', label: 'the pathway sentence', min: 4.5 }
	],
	tapTargets: [{ selector: '.pm-pathway', label: 'the six pathway tiles', min: 44 }]
};
