/**
 * THE MATES PANEL: JOINTS BY WHAT A PART DOES, AND A REASON BEFORE A MATE
 * THAT CANNOT WORK. Ledger 0296, assembly lane.
 *
 * On the box, the Mates panel opens with its seven tiles (hinge, slider,
 * cylindrical, planar, fixed, pin in slot, and one mate), each with a glyph, a word and the
 * degrees it leaves. Two picks on the box itself (its top face, then a
 * shift-click on its front face) cannot make a hinge, and the panel says so in
 * words beside the slots instead of adding a mate that errors (F047); the Add
 * control stays focusable with `aria-disabled` and nothing is applied. The
 * panel's own content never runs wider than the panel (F064), which the
 * prepare step measures as its scroll width against its client width. The
 * whole column's overflow is returned beside it but not asserted: with a face
 * picked the Dimensions panel above this one runs 3px wide at 1440 (its field
 * row, measured 251px at x 1180 in a column ending at 1428), which is that
 * panel's to fix and is reported as a request rather than pinned here.
 */
import { BOX_READY, pointerSource } from './_ideacad-pointer.mjs';

export default {
	path: '/dev/ideacad-solid?state=mates',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the Mates panel refusing two picks on one part, in words',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: BOX_READY, attempts: 10, gapMs: 400 },
		{ click: '.solid-workspace .right-tools button:has-text("Mates")', until: '() => !!document.querySelector(\'[data-testid="ideacad-mate-panel"]\')', attempts: 6, gapMs: 300 },
		{
			evaluate: pointerSource(`
				await idle(); s.select(null); await wait(100);
				const top = s.project([0.2, 0.3, 1]), front = s.project([0.3, -1, 0.5]);
				await move(top); ev('pointerdown', top); await wait(40); ev('pointerup', top, { buttons: 0 }); await wait(250); await idle();
				await move(front); ev('pointerdown', front, { shiftKey: true }); await wait(40); ev('pointerup', front, { buttons: 0, shiftKey: true }); await wait(300); await idle();
				const panel = document.querySelector('[data-testid="ideacad-mate-panel"]'), column = panel?.parentElement;
				const reason = document.querySelector('[data-testid="ideacad-mate-reason"]')?.textContent ?? null;
				const before = s.model.mates.length;
				document.querySelector('[data-testid="ideacad-mate-add"]')?.click(); await wait(300); await idle();
				window.__icMates = { picks: s.selections.length, reason, applied: s.model.mates.length - before, overflow: panel ? panel.scrollWidth - panel.clientWidth : null, columnOverflow: column ? column.scrollWidth - column.clientWidth : null, tiles: panel?.querySelectorAll('label.tile').length ?? 0 };
				return JSON.stringify(window.__icMates);
			`),
			until: '() => !!window.__icMates && window.__icMates.picks === 2 && window.__icMates.applied === 0 && /^Both picks are on /.test(window.__icMates.reason ?? "") && window.__icMates.overflow <= 0 && window.__icMates.tiles === 7',
			attempts: 3,
			gapMs: 500
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-mate-panel"]', label: 'the Mates panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-mate-joint"] label.tile', label: 'six joints and one mate', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="ideacad-mate-joint"] label.tile svg', label: 'a glyph on every tile', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="ideacad-mate-picks"] li', label: 'the hinge slots', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="ideacad-mate-reason"]', label: 'the reason beside the picks', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-mate-add"][aria-disabled="true"]', label: 'Add, focusable and saying why', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-mate-add"][disabled]', label: 'no bare disabled Add', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-mate-reason"]', label: 'the refusal names the part and the way forward', must: ['Both picks are on', 'Pick one on each part.'] },
		{ selector: '[data-testid="ideacad-mate-joint"]', label: 'every joint by what it does', must: ['Hinge', 'Slider', 'Cylindrical', 'Planar', 'Fixed', 'Pin in slot', 'One mate', '1 free', '2 free', '3 free', '0 free'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-mate-reason"] span', label: 'the reason', min: 4.5 },
		{ selector: '[data-testid="ideacad-mate-joint"] label.tile b', label: 'a joint word', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-mate-joint"] label.tile, [data-testid="ideacad-mate-add"], [data-testid="ideacad-mate-panel"] label.check', label: 'every joint tile, Add and each check', min: 44 }],
	layoutSanity: [{ root: '.solid-workspace .workarea', label: 'the work area with the Mates panel open', reserved: null }],
	ignoreConsole: []
};
