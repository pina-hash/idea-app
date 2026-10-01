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
 * WITH THE COLUMN NULL, `PathwayChip` RENDERS NOTHING ANYWHERE and the select
 * shows its placeholder. That is the honest starting point and the harder one to
 * assert, which is why the readout below is read rather than the chip -- an
 * absent chip cannot be told from a component that failed to mount.
 *
 * THE READOUT IS THE STORED ROW. `data-testid="pathway"` on the harness page
 * prints what the stub's store holds after `invalidateAll()`, so a control that
 * changed the markup and not the row reddens here. The chips are asserted
 * BESIDE it, not instead of it.
 *
 * "WITH NO RELOAD" IS MEASURED, NOT ASSUMED. A marker is planted on `window`
 * before the tap; a reload destroys the realm and takes it with it. Reading
 * the value back after the write is the whole instrument -- and it is a
 * POSITIVE CONTROL for itself, since a marker that was never planted and a
 * marker destroyed by a reload both read as missing, so the plant step returns
 * the value it just set.
 *
 * LEDGER 0298 (report R18) MADE THE CONTROL A LABELLED NATIVE SELECT, so the
 * "tap" is now a CHOICE: the step sets the select's value and dispatches the
 * `change` event a real pick dispatches, which is what `onPathwayChange`
 * listens for. The select arrives on a disabled "Choose one" placeholder,
 * because an unset pathway is a legal state with no option to show. And the
 * display name is NO LONGER TINTED by the pathway (decision 40, report R19):
 * the row that used to assert CSEE's identity blue on the name now asserts
 * that the name reads `--text-1` after the write, which is the half that could
 * regress silently.
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
			   there. The select's own value is printed beside the row, because
			   an unset pathway must show the placeholder rather than a pathway. */
			evaluate: `() => { const r = document.querySelector('[data-testid="pathway"]'); const chips = document.querySelectorAll('.pathway-chip'); const sel = document.querySelector('.pm-select'); return 'before: stored=' + (r ? r.textContent.trim() : 'NO READOUT') + ', chips=' + chips.length + ', select=' + (sel ? JSON.stringify(sel.value) + ' showing ' + JSON.stringify(sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.trim() : '') : 'NO SELECT'); }`,
			label: 'the pathway before the choice'
		},
		{
			/* THE NO-RELOAD MARKER, planted and echoed back so the plant itself
			   cannot silently no-op. */
			evaluate: `() => { window.__bvRealm = 'realm-' + Date.now(); return 'planted ' + window.__bvRealm; }`,
			label: 'plant a realm marker the choice must not destroy'
		},
		{
			/* THE CHOICE. CSEE deliberately: its raw identity colour does not
			   clear 4.5:1 as text, so it is the pathway on which painting the
			   identity as a WORD anywhere would show.

			   The `until` is the STORED ROW moving, not the markup: a select
			   already shows the picked value before anything is written, so a
			   control-based predicate would hold on a write that never landed. */
			evaluate: `() => { const s = document.querySelector('.pm-select'); s.value = 'CSEE'; s.dispatchEvent(new Event('change', { bubbles: true })); return 'picked ' + s.value; }`,
			until: `() => document.querySelector('[data-testid="pathway"]').textContent.trim() === 'CSEE'`,
			label: 'choose CSEE and wait for the stored row to say so'
		},
		{
			evaluate: `() => { const r = document.querySelector('[data-testid="pathway"]'); const chips = document.querySelectorAll('.pathway-chip'); const sel = document.querySelector('.pm-select'); return 'after: stored=' + r.textContent.trim() + ', chips=' + chips.length + ' (' + [...chips].map((c) => c.textContent.trim()).join('/') + '), select=' + sel.value + ', options=' + sel.options.length; }`,
			label: 'the pathway after the choice'
		}
	],
	presence: [
		{ selector: '.pm-panel', label: 'the panel is still open (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE WRITE DID NOT CLOSE THE MENU. One pick is the write, so the student
		   stays where they are and can correct a mis-pick with a second one. */
		{ selector: '.pm-select', label: 'the select is still there to pick again', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE PLACEHOLDER IS GONE ONCE A PATHWAY IS STORED: six options, one per
		   pathway, and no "Choose one" left to pick back into. */
		{ selector: '.pm-select option', label: 'six options after the write, no placeholder (an option has no box of its own)', expectPresent: 6, maxPresent: 6, expectVisible: 0 },
		/* BOTH CHIPS CAME BACK. They were absent at the start (unset renders
		   nothing), so this is not a row that could have passed before the
		   choice: one on the trigger, one in the menu's meta row. */
		{ selector: '.pathway-chip', label: 'both pathway chips, absent before the choice', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		/* NO REFUSAL. The panel's one problem list is empty on the path that
		   worked, which is the negative control for the refusal spec. */
		{ selector: '.pm-error', label: 'no refusal on the path that worked', expectPresent: 0, expectVisible: 0 },
		/* AND THE SHEET IS STILL GONE. It is mounted in the root layout and its
		   `show` reads the same column the choice just wrote, so a write that
		   landed can only have moved it further out of scope -- but the panel
		   also calls `invalidateAll()`, which re-runs every load, and a sheet
		   that came back over the menu mid-flow is the failure a student would
		   actually report. */
		{ selector: '.pwp-overlay', label: 'the first-login sheet did not come back', expectPresent: 0, expectVisible: 0 }
	],
	orderResult: [
		{
			/* THE STORED ROW, THE SELECT AND BOTH CHIPS ALL SAY CSEE, and the
			   realm that was alive before the choice is still alive. Four
			   independent readings of one write plus the reload check, in one
			   row, so a partial result cannot be read as a whole one. */
			label: 'the row, the select, both chips and the realm agree after the write',
			evaluate: `() => { const stored = document.querySelector('[data-testid="pathway"]').textContent.trim(); const sel = document.querySelector('.pm-select'); const chips = [...document.querySelectorAll('.pathway-chip')].map((c) => c.textContent.trim()); return [stored, sel ? sel.value : 'NO SELECT', chips.length === 2 && chips.every((c) => c === 'CSEE') ? 'both chips CSEE' : 'chips: ' + JSON.stringify(chips), window.__bvRealm ? 'same realm, no reload' : 'REALM GONE (the page reloaded)']; }`,
			expected: ['CSEE', 'CSEE', 'both chips CSEE', 'same realm, no reload']
		},
		{
			/* THE DISPLAY NAME IS NOT TINTED BY THE NEW PATHWAY (decision 40,
			   report R19). It used to be `pathwayColor(profile.pathway)` as an
			   inline style, which painted CSEE's raw #3D7DFF -- and IDEA's neon
			   #00FF41 on Space White's light panel -- as text. It reads the name
			   tier now, and the chip beside it carries the colour. Compared
			   against `--text-1` resolved in the panel, so the row survives a
			   token retune and still reddens on any tint. The second reading is
			   the chip's own ink, so the colour did not simply vanish. */
			label: 'the name reads --text-1 after the write, and the chip carries the pathway colour',
			evaluate: `() => { const el = document.querySelector('.pm-name'); if (!el) return ['NO NAME']; const probe = document.createElement('span'); probe.style.color = 'var(--text-1)'; document.querySelector('.pm-panel').appendChild(probe); const want = getComputedStyle(probe).color; probe.remove(); const got = getComputedStyle(el).color; const chip = document.querySelector('.pm-meta .pathway-chip'); return [got === want ? 'name is --text-1' : 'TINTED ' + got + ' (text-1 is ' + want + ')', chip && getComputedStyle(chip).color !== want ? 'chip carries its own ink' : 'CHIP INK MISSING']; }`,
			expected: ['name is --text-1', 'chip carries its own ink']
		}
	],
	contrast: [
		{ selector: '.pm-select', label: 'the chosen pathway, as a word in the select', min: 4.5 },
		{ selector: '.pm-name', label: 'the display name, untinted', min: 4.5 },
		{ selector: '.pm-note', label: 'the pathway sentence', min: 4.5 }
	],
	tapTargets: [{ selector: '.pm-select', label: 'the pathway select', min: 44 }]
};
