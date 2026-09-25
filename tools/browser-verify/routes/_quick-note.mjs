/**
 * Shared by the quick-note route specs (ledger 0298): opening the header's
 * quick note the way a person at this width would, typing into the real note
 * editor inside its panel, and the header-row probe. A leading underscore keeps
 * the loader from reading this as a route.
 *
 * ONE CONTROL PER WIDTH. From 560px up the Note control is in the classroom
 * header row; below it the row's control is not drawn and the Menu carries a
 * Note entry that opens the same panel (ClassroomShell explains the
 * measurement). Every probe here reads which arrangement it is looking at from
 * the page and returns the SAME words at both widths when that arrangement is
 * right, so one expected array serves 375 and 1440.
 */

/* Opens the panel through whichever control this width shows, with real
   clicks on real elements, and says which way it went. */
export const OPEN = `async () => {
	const panelOpen = () => {
		const p = document.querySelector('[data-testid="qn-panel"]');
		return !!p && !p.hidden && !!p.querySelector('[data-testid="note-editor-input"]');
	};
	const shown = (el) => !!el && el.getClientRects().length > 0;
	for (let attempt = 1; attempt <= 12; attempt++) {
		const row = document.querySelector('.cr-header [data-testid="qn-trigger"]');
		if (shown(row)) {
			row.click();
		} else {
			const menu = document.querySelector('.cr-header .menu-trigger');
			if (menu && menu.getAttribute('aria-expanded') !== 'true') menu.click();
			await new Promise((r) => setTimeout(r, 150));
			const item = document.querySelector('[data-testid="quicknote-menu-item"]');
			if (shown(item)) item.click();
		}
		for (let i = 0; i < 10 && !panelOpen(); i++) await new Promise((r) => setTimeout(r, 150));
		if (panelOpen()) return (shown(row) ? 'opened from the header row' : 'opened from the Menu') + ' on attempt ' + attempt;
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error('the quick note panel never opened');
}`;

/* Types into the editor the way a keyboard does: `insertText` on the focused
   contenteditable, which ProseMirror reads as input. Retries until the
   editor's own document holds the words, and says how many tries it took. */
export const TYPE = (text) => `async () => {
	for (let attempt = 1; attempt <= 12; attempt++) {
		const input = document.querySelector('[data-testid="qn-panel"] [data-testid="note-editor-input"]');
		if (input) {
			input.focus();
			document.execCommand('insertText', false, ${JSON.stringify(text)});
			await new Promise((r) => setTimeout(r, 150));
			if ((input.textContent || '').includes(${JSON.stringify(text)})) return 'typed on attempt ' + attempt;
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error('the quick note editor never took the text');
}`;

/*
 * THE HEADER ROW AT REST, read off the page: exactly one Note control for this
 * width, Report and the profile menu each answering a tap at their own centre,
 * and a whole class icon still in the class row -- the report-slot spec's own
 * guarantee, re-read with the quick note present. Stored on `window` by a
 * prepare step (before anything opens) and returned by an orderResult row.
 */
export const HEADER_PROBE = `() => {
	const shown = (el) => !!el && el.getClientRects().length > 0;
	const hits = (sel) => {
		const el = document.querySelector(sel);
		if (!shown(el)) return 'MISSING ' + sel;
		const r = el.getBoundingClientRect();
		const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
		return hit && el.contains(hit) ? 'answers' : 'COVERED';
	};
	const wide = window.innerWidth >= 560;
	const row = document.querySelector('.cr-header [data-testid="qn-trigger"]');
	const item = document.querySelector('[data-testid="quicknote-menu-item"]');
	let note;
	if (wide) {
		const r = row && row.getBoundingClientRect();
		const w = row && row.querySelector('.qn-word').getBoundingClientRect();
		const inside = !!w && w.width > 0 && w.left >= r.left - 0.5 && w.right <= r.right + 0.5;
		note = shown(row) && hits('.cr-header [data-testid="qn-trigger"]') === 'answers' && inside && r.height >= 44 && !shown(item)
			? 'one Note control for this width, answering at its centre, word inside'
			: 'ROW: shown=' + shown(row) + ' hit=' + hits('.cr-header [data-testid="qn-trigger"]') + ' inside=' + inside + ' h=' + (r && r.height) + ' menuItemShown=' + shown(item);
	} else {
		note = !shown(row) && !!item
			? 'one Note control for this width, answering at its centre, word inside'
			: 'PHONE: rowShown=' + shown(row) + ' menuItem=' + !!item;
	}
	const strip = document.querySelector('[data-testid="class-strip"]').getBoundingClientRect();
	const whole = [...document.querySelectorAll('[data-testid="class-icon"]')].filter((i) => {
		const b = i.getBoundingClientRect();
		return b.width > 0 && b.left >= strip.left - 0.5 && b.right <= strip.right + 0.5;
	}).length;
	const out = [
		note,
		'report ' + hits('.shell-report .sfb-trigger'),
		'profile ' + hits('.cr-header .pm-trigger'),
		whole >= 1 ? 'a whole class icon on screen' : 'NO WHOLE CLASS ICON (strip ' + Math.round(strip.width * 10) / 10 + 'px)'
	];
	window.__qnHeader = out;
	return 'header at ' + window.innerWidth + ': strip ' + Math.round(strip.width * 10) / 10 + 'px, ' + whole + ' whole class icon(s)';
}`;

export const HEADER_EXPECTED = [
	'one Note control for this width, answering at its centre, word inside',
	'report answers',
	'profile answers',
	'a whole class icon on screen'
];

/* The fixture photo has no bytes behind the real proxy, so its thumbnail 401s. */
export const IGNORE_FIXTURE_PHOTO = [/\/api\/notebook\/photo\/p-1/];
