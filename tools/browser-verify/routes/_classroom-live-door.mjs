/**
 * Shared probes for the class page's Live door specs (ledger 0298, R21).
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 *
 * THE DEFECT, AS IT WAS FILED: in a three-tool row at 871px the door's count
 * broke across two lines, "0" above "on", while the title beside it was
 * squeezed to nothing. The bare text "{count} on" was an anonymous flex item
 * whose automatic minimum is its min-content, which for "0 on " is the word
 * "on" alone -- so it shrank by wrapping. These probes read that failure back
 * the way it would show: LINE BOXES, counted from a Range over the count's own
 * text, never the element's box (a nowrap span is one box however it paints).
 */

/** The door has painted once its count reads "<n> on". */
export const doorReady = (n) => ({
	waitFor: `() => /^${n} on$/.test((document.querySelector('[data-testid="live-door-count"]')?.textContent || '').replace(/\\s+/g, ' ').trim())`,
	timeoutMs: 20000
});

/**
 * THE MEASURED NUMBERS, printed beside the prepare row: the door's box, the
 * line boxes each piece of text paints in, where the status sits relative to
 * the word, the title's visible against its full width, and the widest
 * overhang of anything inside the door past its border box.
 */
export const DOOR_GEOMETRY = `() => {
	const door = document.querySelector('[data-testid="live-door"]');
	const count = door.querySelector('[data-testid="live-door-count"]');
	const item = door.querySelector('[data-testid="live-door-item"], .ld-item');
	const word = door.querySelector('.ld-word');
	const lines = (el) => {
		const tops = new Set();
		const r = document.createRange();
		for (const n of el.childNodes) {
			if (n.nodeType !== 3 || !n.textContent.trim()) continue;
			r.selectNodeContents(n);
			for (const x of r.getClientRects()) if (x.width > 0) tops.add(Math.round(x.top));
		}
		return tops.size;
	};
	const d = door.getBoundingClientRect();
	let over = 0;
	for (const el of door.querySelectorAll('*')) {
		const b = el.getBoundingClientRect();
		if (!b.width && !b.height) continue;
		over = Math.max(over, d.left - b.left, b.right - d.right, d.top - b.top, b.bottom - d.bottom);
	}
	const w = word.getBoundingClientRect();
	const c = count.getBoundingClientRect();
	const f = (x) => Math.round(x * 10) / 10;
	return 'door ' + f(d.width) + 'x' + f(d.height)
		+ ', count "' + count.textContent.trim() + '" ' + f(c.width) + 'px on ' + lines(count) + ' line(s)'
		+ ', word on ' + lines(word) + ' line(s)'
		+ ', status ' + (Math.abs(c.top + c.height / 2 - (w.top + w.height / 2)) < w.height / 2 ? 'beside the word' : 'on its own line')
		+ ', title ' + f(item.clientWidth) + ' of ' + f(item.scrollWidth) + 'px'
		+ ', worst overhang ' + f(Math.max(0, over)) + 'px';
}`;

/**
 * THE VERDICTS, as words, so a failure names itself. Every one is a property
 * that must hold at every width: the count and "on" on ONE line, the word on
 * one line, the title the ONLY thing that gives (ellipsized, not wrapped), and
 * nothing inside the door painting past its edge or the door past its row.
 */
export const doorVerdicts = (n) => `() => {
	const door = document.querySelector('[data-testid="live-door"]');
	const row = document.querySelector('[data-testid="class-tools"]');
	const count = door.querySelector('[data-testid="live-door-count"]');
	const item = door.querySelector('[data-testid="live-door-item"], .ld-item');
	const word = door.querySelector('.ld-word');
	const lines = (el) => {
		const tops = new Set();
		const r = document.createRange();
		for (const node of el.childNodes) {
			if (node.nodeType !== 3 || !node.textContent.trim()) continue;
			r.selectNodeContents(node);
			for (const x of r.getClientRects()) if (x.width > 0) tops.add(Math.round(x.top));
		}
		return tops.size;
	};
	const d = door.getBoundingClientRect();
	const inside = [...door.querySelectorAll('*')].every((el) => {
		const b = el.getBoundingClientRect();
		if (!b.width && !b.height) return true;
		return b.left >= d.left - 0.5 && b.right <= d.right + 0.5 && b.top >= d.top - 0.5 && b.bottom <= d.bottom + 0.5;
	});
	const rw = row.getBoundingClientRect();
	const itemLines = item ? lines(item) : 0;
	return [
		count.textContent.replace(/\\s+/g, ' ').trim(),
		lines(count) === 1 ? 'count on one line' : 'COUNT WRAPS onto ' + lines(count) + ' lines',
		lines(word) === 1 ? 'word on one line' : 'WORD WRAPS onto ' + lines(word) + ' lines',
		item && item.scrollWidth > item.clientWidth + 0.5 && itemLines === 1
			? 'title ellipsized on one line'
			: 'TITLE NOT ELLIPSIZED (' + (item ? item.clientWidth + '/' + item.scrollWidth + 'px, ' + itemLines + ' line(s)' : 'absent') + ')',
		inside && door.scrollWidth <= door.clientWidth ? 'nothing past the door' : 'SOMETHING PAINTS PAST THE DOOR',
		d.left >= rw.left - 0.5 && d.right <= rw.right + 0.5 ? 'door inside its row' : 'DOOR PAST ITS ROW'
	];
}`;

export const doorExpected = (n) => [
	`${n} on`,
	'count on one line',
	'word on one line',
	'title ellipsized on one line',
	'nothing past the door',
	'door inside its row'
];

/**
 * THE TYPE PAIRING: the door is one of the class tools, so its word and its
 * status wear the SAME family the hall pass and the music tool wear on the
 * same row -- read off the siblings' computed styles rather than a list typed
 * here, so a restyle of the tool shell reddens this rather than silently
 * leaving the door behind.
 */
export const TYPE_PAIRING = `() => {
	const door = document.querySelector('[data-testid="live-door"]');
	const sib = document.querySelector('[data-testid="hall-pass-tool"]');
	const sibChip = document.querySelector('[data-testid="hall-pass-tool-chip"]');
	const cs = (el) => getComputedStyle(el);
	const word = cs(door.querySelector('.ld-word'));
	const status = cs(door.querySelector('[data-testid="live-door-status"]'));
	const t = cs(sib), c = cs(sibChip);
	return [
		word.fontFamily === t.fontFamily && word.textTransform === t.textTransform && word.fontSize === t.fontSize && word.fontWeight === t.fontWeight
			? 'word matches the tool word' : 'WORD DIFFERS: ' + [word.fontFamily, word.textTransform, word.fontSize, word.fontWeight].join(' / ') + ' vs ' + [t.fontFamily, t.textTransform, t.fontSize, t.fontWeight].join(' / '),
		status.fontFamily === c.fontFamily && status.fontSize === c.fontSize && status.textTransform === c.textTransform
			? 'status matches the tool chip' : 'STATUS DIFFERS: ' + [status.fontFamily, status.fontSize, status.textTransform].join(' / ') + ' vs ' + [c.fontFamily, c.fontSize, c.textTransform].join(' / ')
	];
}`;
