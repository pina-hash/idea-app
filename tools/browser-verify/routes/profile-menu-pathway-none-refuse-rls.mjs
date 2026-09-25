/**
 * A PATHWAY WRITE THE DATABASE DECLINES, AND WHAT THE STUDENT SEES (ledger
 * 0280). `profile-menu-pathway-none-state-pathway.mjs` drives the write that works; this
 * one drives the write that does not, because a control whose failure is
 * silent is worse than no control -- the student walks away believing their
 * pathway is set, and the sheet comes back next week with no explanation.
 *
 * THE SHAPE BEING FORCED IS THE SILENT ONE. `?refuse=rls` makes the stub client
 * answer ZERO ROWS with `error: null`, which is exactly what supabase-js
 * returns for an UPDATE that RLS matched no row for. It is not an error by any
 * check a caller would naturally write: `if (error)` is false, the promise
 * resolves, and the only thing that distinguishes it from success is the row
 * count -- which is why `saveProfile` selects the row back at all, and why
 * `PathwayPicker`'s own comment points at this component for the lesson. The
 * companion `?refuse=error` shape (a PostgREST error object) is the LOUD one
 * and is handled by the same branch one line up.
 *
 * WHAT MUST BE TRUE AFTERWARDS, and all four are asserted below because the
 * defect this guards is a partial success:
 *   1. the stored row did NOT move;
 *   2. the select is back on its placeholder -- the markup did not run
 *      ahead of the write (a native select moves the moment somebody picks,
 *      so since ledger 0298 `onPathwayChange` puts it back on the stored row);
 *   3. no chip appeared anywhere, so nothing on screen claims the value took;
 *   4. the panel says why, in a visible sentence, in its one problem list.
 *
 * (2) AND (3) ARE THE ONES WORTH KEEPING. A control that shows the new value
 * and never goes back is the standard way this goes wrong with a select, and
 * a screenshot of it looks exactly like success.
 *
 * IT IS DRIVEN FROM THE SAME STRANDED START as the success spec -- a student
 * with no pathway, past the sheet -- so the two runs differ in exactly one
 * thing: what the database said.
 */
export default {
	path: '/dev/profile-menu?pathway=none&refuse=rls',
	label: 'ProfileMenu: a refused pathway write is reported, never shown as saved',
	prepare: [
		{
			evaluate: `() => { const o = document.querySelector('.pwp-overlay'); return o ? 'the first-login sheet is up (positive control)' : 'NO SHEET -- this run never reproduced the stranded state'; }`,
			until: `() => !!document.querySelector('.pwp-overlay')`,
			label: 'the stranded student meets the sheet first'
		},
		{
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
			evaluate: `() => { const r = document.querySelector('[data-testid="pathway"]'); const sel = document.querySelector('.pm-select'); return 'before: stored=' + (r ? r.textContent.trim() : 'NO READOUT') + ', select=' + (sel ? JSON.stringify(sel.value) : 'NO SELECT') + ', chips=' + document.querySelectorAll('.pathway-chip').length + ', errors=' + document.querySelectorAll('.pm-error').length; }`,
			label: 'the pathway before the refused choice'
		},
		{
			/* THE CHOICE, AND THE `until` IS THE REFUSAL RATHER THAN THE WRITE.
			   Waiting on the stored row would time out by design here, and a
			   prepare step that times out invalidates every number after it --
			   so the predicate is the outcome this run is actually expecting.
			   The select is set and a real `change` dispatched, which is what a
			   pick does and what `onPathwayChange` listens for. */
			evaluate: `() => { const s = document.querySelector('.pm-select'); s.value = 'CSEE'; s.dispatchEvent(new Event('change', { bubbles: true })); return 'picked ' + s.value; }`,
			until: `() => !!document.querySelector('.pm-error')`,
			label: 'choose CSEE and wait for the panel to report the refusal'
		},
		{
			/* THE SENTENCE ITSELF, PRINTED. What a student reads is the thing
			   this spec exists to check, and a presence count cannot show it. */
			evaluate: `() => { const e = document.querySelector('.pm-error'); const r = e ? e.getBoundingClientRect() : null; return 'the student reads: "' + (e ? e.textContent.trim() : 'NOTHING') + '" (' + (r && r.width > 0 && r.height > 0 ? Math.round(r.width) + 'x' + Math.round(r.height) + ' painted' : 'zero box') + ')'; }`,
			label: 'what the refusal says'
		}
	],
	presence: [
		{ selector: '.pm-panel', label: 'the panel is still open (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-select', label: 'the select is still there (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE REFUSAL IS ON SCREEN, in the panel's one problem list rather than
		   a second place a student has to learn about. */
		{ selector: '.pm-error', label: 'the refusal, visible in the panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* AND NOTHING CLAIMS THE WRITE LANDED. The placeholder is still there to
		   be selected, no chip on the trigger, no chip in the meta row -- the
		   column is still null and every surface agrees with it. */
		{ selector: '.pm-select option[value=""]', label: 'the placeholder survives a refused write (an option has no box of its own)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '.pathway-chip', label: 'no chip appeared after a refused write', expectPresent: 0, expectVisible: 0 }
	],
	orderResult: [
		{
			/* THE STORED ROW IS STILL UNSET AND THE SENTENCE IS THE COMPONENT'S
			   OWN. Pinned by TEXT, because the words are the deliverable: a
			   refusal that renders "Upload failed" or an empty string would
			   satisfy every presence row above. */
			label: 'the row did not move, the select went back, and the panel names the problem',
			evaluate: `() => { const stored = document.querySelector('[data-testid="pathway"]').textContent.trim(); const sel = document.querySelector('.pm-select'); const e = document.querySelector('.pm-error'); return [stored, sel ? 'select=' + JSON.stringify(sel.value) : 'NO SELECT', e ? e.textContent.trim() : 'NO SENTENCE']; }`,
			expected: ['unset', 'select=""', 'Could not save your profile. Try signing out and back in.']
		},
		{
			/* THE STUDENT CAN SEE IT WITHOUT SCROLLING PAST THE FOLD, which is
			   the half a presence check cannot answer: `expectVisible` asks
			   whether the element is painted, not whether it is on screen. And
			   since ledger 0298 Sign out is a sticky footer the sentence sits
			   directly above, so it must also clear that footer: the panel's
			   `scroll-padding-bottom` is what makes `scrollIntoView` stop short
			   of it. */
			label: 'the refusal is inside the viewport, not below the fold, and not under the Sign out footer',
			evaluate: `() => { const r = document.querySelector('.pm-error').getBoundingClientRect(); const foot = document.querySelector('.pm-actions').getBoundingClientRect(); return [r.top >= 0 && r.bottom <= innerHeight ? 'inside the viewport' : 'off screen: ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' of ' + innerHeight, r.bottom <= foot.top + 0.5 ? 'clear of the footer' : 'UNDER THE STICKY FOOTER: ' + Math.round(r.bottom) + ' > ' + Math.round(foot.top)]; }`,
			expected: ['inside the viewport', 'clear of the footer']
		}
	],
	contrast: [{ selector: '.pm-error', label: 'the refusal sentence', min: 4.5 }]
};
