/**
 * Shared steps and probes for the /dev/tour specs of the HOME PAGE'S
 * walkthrough (ledger 0298, report R22), on the REAL home page with a mock
 * session and a stub client whose writes the harness logs.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 *
 * THE WALK IS THE CLASSROOM'S (`_classroom-tour.mjs`), because the engine is
 * the same component and the questions a reader asks are the same: is the
 * control the words name there, on screen, reachable through every clipping
 * ancestor, and clear of the callout. It stops ON the last step, so the
 * callout's own contrast and targets can be measured and no stamp is written.
 */
export { WALK_TOUR, walkVerdict, CALLOUT_CONTRAST, CALLOUT_TAPS, CALLOUT_OPEN } from './_classroom-tour.mjs';

/**
 * THE DEV HARNESS'S OWN PANEL IS HIDDEN FIRST, for the reason
 * `tour-mode-student.mjs` gives: it is fixed over the bottom right, which is
 * exactly where the Report control sits and where the callout's action row
 * lands at 375, and production has no such panel. The step says whether it
 * found one, so a renamed class reports itself instead of measuring under it.
 */
export const HIDE_HARNESS_PANEL = {
	evaluate: `() => {
		const panels = Array.from(document.querySelectorAll('.tour-harness'));
		if (!panels.length) return 'no dev harness panel found to hide (class moved?) -- readings below are unshielded';
		for (const p of panels) p.style.display = 'none';
		return 'hid ' + panels.length + ' dev harness panel(s); production has none';
	}`,
	until: `() => !document.querySelector('.tour-harness') || getComputedStyle(document.querySelector('.tour-harness')).display === 'none'`,
	waitMs: 100
};

/** The first-visit tour starts on its own, half a second after mount. */
export const TOUR_AUTO_LAUNCHED = {
	waitFor: `() => !!document.querySelector('[data-testid="tour-callout"]')`,
	timeoutMs: 15000
};

/** The offer row is up (it renders from the first frame when the stamp is old). */
export const OFFER_UP = {
	waitFor: `() => !!document.querySelector('[data-testid="tour-offer"]')`,
	timeoutMs: 15000
};

/** [each name is among the walked titles], as strings for `orderResult`. */
export const titlesInclude = (names) =>
	`() => { const w = window.__tourWalk; if (!w) return ['NO WALK']; return ${JSON.stringify(names)}.map((n) => String(w.titles.includes(n))); }`;

/** The first and the last title the walk read. */
export const FIRST_AND_LAST = `() => { const w = window.__tourWalk; if (!w) return ['NO WALK']; return [w.titles[0] ?? '', w.titles[w.titles.length - 1] ?? '']; }`;

/** Whether title `a` was walked before title `b`. */
export const walkedBefore = (a, b) =>
	`() => { const w = window.__tourWalk; if (!w) return ['NO WALK']; const i = w.titles.indexOf(${JSON.stringify(a)}), j = w.titles.indexOf(${JSON.stringify(b)}); return [String(i >= 0 && j >= 0 && i < j)]; }`;

/**
 * THE STAMP THE OFFER WROTE, READ OFF THE STUB CLIENT'S OWN LOG: [a
 * `tour_completed_at` write landed, and it is not older than the tour's
 * version]. The version instant is 2026-09-25T00:00 Pacific; a stamp older
 * than it would offer the tour again on the next visit, for ever.
 */
export const STAMP_WRITTEN = `() => {
	const h = window.__tourHarness;
	if (!h) return ['NO HARNESS PROBE'];
	const line = h.log().find((l) => l.includes('tour_completed_at'));
	if (!line) return ['false', 'no write'];
	const m = /"tour_completed_at":"([^"]+)"/.exec(line);
	return ['true', String(!!m && Date.parse(m[1]) >= Date.parse('2026-09-25T07:00:00.000Z'))];
}`;

/**
 * THE WORDS A STEP SHOWED THIS READER, for the one question the titles cannot
 * answer: which of the two tours ran. The staff and student tours share their
 * titles and differ in their words, so this presses Back (the engine's own
 * control) from wherever the walk stopped until the named step is showing,
 * and returns [found, its words]. Run it LAST in a spec: it moves the tour.
 */
export const bodyAt = (title) => `async () => {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	for (let i = 0; i < 30; i++) {
		const c = document.querySelector('[data-testid="tour-callout"]');
		if (!c) return ['false', 'the callout is gone'];
		if ((c.querySelector('h3')?.textContent ?? '').trim() === ${JSON.stringify(title)})
			return ['true', (document.querySelector('[data-testid="tour-body"]')?.textContent ?? '').trim()];
		const back = document.querySelector('[data-testid="tour-back"]');
		if (!back || back.disabled) return ['false', 'reached the first step without finding it'];
		back.click();
		await sleep(120);
	}
	return ['false', 'gave up after 30 steps'];
}`;

/**
 * THE EDGE OF EACH OFFER BUTTON, COMPOSITED ON A CANVAS AND READ BACK, against
 * its own fill and against the row around it -- the two grounds a border
 * separates -- because `contrast` reads a control's words and never its box,
 * and a control edge is load-bearing at 3:1 (CLAUDE.md, `--boundary`).
 */
export const OFFER_EDGES = {
	evaluate: `() => {
		const cv = document.createElement('canvas'); cv.width = cv.height = 1;
		const ctx = cv.getContext('2d', { willReadFrequently: true });
		const paint = (cs) => { ctx.clearRect(0, 0, 1, 1); for (const c of cs) { ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); } const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
		const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
		const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
		const ratio = (a, b) => { const x = lum(a), y = lum(b); return Math.round(100 * (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) / 100; };
		const row = document.querySelector('[data-testid="tour-offer"]');
		if (!row) return 'THE OFFER IS NOT UP: no edge to measure';
		const plate = getComputedStyle(row).backgroundColor;
		return ['tour-offer-start', 'tour-offer-dismiss'].map((id) => {
			const cs = getComputedStyle(document.querySelector('[data-testid="' + id + '"]'));
			const inside = paint([plate, cs.backgroundColor]);
			const edge = paint([plate, cs.backgroundColor, cs.borderTopColor]);
			return id + ' edge ' + ratio(edge, inside) + ':1 on its fill, ' + ratio(edge, paint([plate])) + ':1 on the row';
		}).join(' | ') + '   [floor 3:1, a control edge]';
	}`,
	/* The same arithmetic as a gate: every edge clears 3:1 against both grounds. */
	until: `() => {
		const cv = document.createElement('canvas'); cv.width = cv.height = 1;
		const ctx = cv.getContext('2d', { willReadFrequently: true });
		const paint = (cs) => { ctx.clearRect(0, 0, 1, 1); for (const c of cs) { ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); } const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
		const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
		const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
		const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
		const row = document.querySelector('[data-testid="tour-offer"]');
		if (!row) return false;
		const plate = getComputedStyle(row).backgroundColor;
		return ['tour-offer-start', 'tour-offer-dismiss'].every((id) => {
			const el = document.querySelector('[data-testid="' + id + '"]');
			if (!el) return false;
			const cs = getComputedStyle(el);
			const inside = paint([plate, cs.backgroundColor]);
			const edge = paint([plate, cs.backgroundColor, cs.borderTopColor]);
			return ratio(edge, inside) >= 3 && ratio(edge, paint([plate])) >= 3;
		});
	}`,
	waitMs: 100
};
