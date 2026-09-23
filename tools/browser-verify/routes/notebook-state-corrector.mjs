/**
 * THE PHOTO CORRECTOR OPENS ABOVE THE CLASSROOM (ledger 0297, package F4a).
 *
 * The corrector is a full-bleed overlay a student straightens a photo in. Once
 * the notebook moved inside the classroom its title and hint painted UNDER the
 * classroom's masthead: the room's old `z-index: 1` made it a stacking context
 * below the header, and every overlay inside it could only ever sit under that
 * header, however high its own z-index. It is a modal `<dialog>` opened with
 * `showModal()` now, which puts it in the TOP LAYER, above any z-index at all
 * -- the masthead, the Voice button and Report a problem included.
 *
 * `?state=corrector` is only a label: the harness ignores it. The corrector is
 * reached for real, through the "Choose a photo" input with a generated JPEG,
 * and the rows are HIT TESTS at the centre of each thing a student has to see
 * or press, because a presence check is green on both defects -- every string
 * is on the page the whole time.
 *
 * POSITIVE CONTROL ON THE HIT TEST: the title's box is asserted to OVERLAP the
 * classroom masthead's box, so "the title is on top" is a claim about the
 * place the defect was, not about an empty corner of the screen.
 */
export const OPEN_CORRECTOR = `async () => {
	const c = document.createElement('canvas');
	c.width = 640;
	c.height = 480;
	const ctx = c.getContext('2d');
	ctx.fillStyle = '#f3efe4';
	ctx.fillRect(0, 0, 640, 480);
	ctx.fillStyle = '#333';
	ctx.fillRect(120, 90, 400, 300);
	const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
	const dt = new DataTransfer();
	dt.items.add(new File([blob], 'page.jpg', { type: 'image/jpeg' }));
	const input = document.querySelector('[data-testid="nb-pick"] input');
	input.files = dt.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
	return 'picked page.jpg';
}`;

export const HIT_TESTS = `() => {
	/* The corrector now opens from an entry further down the page (ledger 0297,
	   F4b), so the page is scrolled back to the top first: the masthead has to
	   be under the dialog for "the title overlaps it and is still on top" to
	   be the claim it is. */
	window.scrollTo({ top: 0, behavior: 'instant' });
	document.querySelector('.cr-detail')?.scrollTo?.({ top: 0, behavior: 'instant' });
	const dlg = document.querySelector('dialog.pc-overlay');
	if (!dlg) return ['no corrector dialog'];
	const header = document.querySelector('.cr-root .cr-header');
	const out = ['modal (top layer): ' + dlg.matches(':modal')];
	const title = dlg.querySelector('.pc-title');
	if (header && title) {
		const a = title.getBoundingClientRect();
		const b = header.getBoundingClientRect();
		out.push('title overlaps the classroom masthead: ' + (a.top < b.bottom && a.bottom > b.top));
	} else out.push('title overlaps the classroom masthead: missing');
	for (const [name, sel] of [
		['title', '.pc-title'],
		['hint', '.pc-hint'],
		['Flatten', '[data-testid="pc-confirm"]'],
		['Skip', '[data-testid="pc-skip"]'],
		['Reset corners', '[data-testid="pc-reset"]']
	]) {
		const el = dlg.querySelector(sel);
		if (!el) {
			out.push(name + ': missing');
			continue;
		}
		const r = el.getBoundingClientRect();
		const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
		out.push(name + ' on top: ' + (!!hit && (hit === el || el.contains(hit))));
	}
	return out;
}`;

export default {
	path: '/dev/notebook?state=corrector',
	label: 'The photo corrector, opened for real, on top of the classroom shell',
	prepare: [
		{
			waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
			timeoutMs: 15_000
		},
		/* STRAIGHTENING IS A CHOICE AFTER THE FACT NOW (ledger 0297, F4b): a
		   picked photo no longer opens the corrector, it is saved to a draft at
		   once, and the corrector opens from "Straighten page 1" on that entry.
		   So the pick lands, the draft opens, and the corrector is opened from
		   the entry, which is the only way a student reaches it here. */
		{
			evaluate: OPEN_CORRECTOR,
			until: '() => !!document.querySelector(\'[data-testid="row-draft"], [data-testid="entry-draft-chip"]\')',
			attempts: 1,
			gapMs: 10_000
		},
		{
			evaluate: `() => {
				// The class tab lists ROWS beside the composer above 1024px and full
				// cards in one column below it; either way, open the draft.
				const chip = document.querySelector('[data-testid="row-draft"], [data-testid="entry-draft-chip"]');
				let n = chip;
				while (n && !n.querySelector('[data-testid="entry-open"], [data-testid="entry-disclosure"]')) n = n.parentElement;
				const open = n && n.querySelector('[data-testid="entry-open"], [data-testid="entry-disclosure"]');
				if (!open) return 'no open control';
				if (open.getAttribute('aria-expanded') !== 'true') open.click();
				return 'opened the draft';
			}`,
			until: '() => !!document.querySelector(\'[data-testid="entry-straighten"]\')',
			attempts: 3,
			gapMs: 1_000
		},
		{
			click: '[data-testid="entry-straighten"]',
			until: '() => !!document.querySelector("dialog.pc-overlay[open]") && !!document.querySelector("[data-testid=\'pc-handle-0\']")',
			attempts: 1,
			gapMs: 10_000
		}
	],
	presence: [
		{ selector: 'dialog.pc-overlay[open]', label: 'the corrector, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: 'dialog.pc-overlay.nb-island', label: 'the corrector is a dark island in every theme', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{
			label: 'every part of the corrector a student reads or presses is the top thing at its own centre',
			evaluate: HIT_TESTS,
			expected: [
				'modal (top layer): true',
				'title overlaps the classroom masthead: true',
				'title on top: true',
				'hint on top: true',
				'Flatten on top: true',
				'Skip on top: true',
				'Reset corners on top: true'
			]
		}
	],
	contrast: [
		{ selector: 'dialog.pc-overlay .pc-title', label: 'corrector title', min: 4.5 },
		{ selector: 'dialog.pc-overlay .pc-hint', label: 'corrector hint', min: 4.5 },
		{ selector: 'dialog.pc-overlay [data-testid="pc-reset"]', label: 'Reset corners', min: 4.5 }
	],
	tapTargets: [
		{ selector: 'dialog.pc-overlay .pc-actions button', label: 'corrector actions (student-facing)', min: 44 }
	],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
