/**
 * Shared steps and probes for the /dev/classroom-tour specs (ledger 0297,
 * LEARN): the classroom walkthroughs on the REAL ClassroomShell, the REAL
 * ClassView and the real preference store, with the profile row held in
 * memory and written through the shipping read-then-merge writer.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 *
 * THE WALK IS A MEASUREMENT, NOT A NARRATION. It presses Next through every
 * step the engine kept for this page at this width and, at each one, asks the
 * questions a reader would: is the control the words name actually there, is
 * it on screen (the centre of its box reaches it through every clipping
 * ancestor, which is what a tab scrolled out of its strip fails), and is the
 * callout clear of it and inside the window. It stops ON the last step rather
 * than finishing, so the callout's own contrast and targets can be measured,
 * and leaves its findings on `window.__tourWalk` for an `orderResult` to judge.
 */

/** Where the harness is, as a teacher and as a student. */
export const TOUR_TEACHER = '/dev/classroom-tour/s-1?manage=1';
export const TOUR_STUDENT = '/dev/classroom-tour/s-1?manage=0';

/** Client-rendered, so the class search and the probe arrive together. */
export const TOUR_READY = {
	waitFor: `() => !!document.querySelector('[data-testid="stream-search"]') && typeof window.__tourProbe === 'function'`,
	timeoutMs: 20000
};

export const CALLOUT_OPEN = `() => !!document.querySelector('[data-testid="tour-callout"]')`;

/**
 * THE WALK. Waits out the smooth scroll the engine asks for (the harness runs
 * at `prefers-reduced-motion: no-preference`), then reads each step.
 */
export const WALK_TOUR = {
	label: 'walk the tour: every step, its target and its callout',
	evaluate: `async () => {
		const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
		const titles = [];
		const bad = [];
		let total = 0;
		for (let i = 0; i < 24; i++) {
			const c = document.querySelector('[data-testid="tour-callout"]');
			if (!c) { bad.push('callout closed early at step ' + (i + 1)); break; }
			await sleep(700);
			const title = (c.querySelector('h3')?.textContent ?? '').trim();
			titles.push(title);
			const sel = c.getAttribute('data-target');
			const el = sel ? document.querySelector(sel) : null;
			if (!el) { bad.push(title + ': target gone'); }
			else {
				const r = el.getBoundingClientRect();
				const onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
				const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
				const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
				const reached = document.elementsFromPoint(cx, cy).some((e) => e === el || el.contains(e));
				if (!onScreen) bad.push(title + ': target off screen');
				else if (!reached) bad.push(title + ': target clipped');
				const cr = c.getBoundingClientRect();
				const ox = Math.max(0, Math.min(cr.right, r.right) - Math.max(cr.left, r.left));
				const oy = Math.max(0, Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top));
				if (ox * oy > 0) bad.push(title + ': callout covers target (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
				if (cr.left < 0 || cr.top < 0 || cr.right > innerWidth + 0.5 || cr.bottom > innerHeight + 0.5) bad.push(title + ': callout outside the window');
			}
			const count = (document.querySelector('[data-testid="tour-count"]')?.textContent ?? '').trim();
			const m = /^(\\d+) of (\\d+)$/.exec(count);
			if (!m) { bad.push('unreadable count "' + count + '"'); break; }
			total = Number(m[2]);
			if (m[1] === m[2]) break;
			document.querySelector('[data-testid="tour-next"]').click();
			await sleep(60);
		}
		window.__tourWalk = { titles, bad, total };
		return titles.length + ' step(s): ' + titles.join(' > ') + (bad.length ? ' | FINDINGS: ' + bad.join('; ') : '');
	}`
};

/** The walk's verdict: what went wrong (nothing, if right), and whether it covered at least `min` steps. */
export const walkVerdict = (min) =>
	`() => { const w = window.__tourWalk; if (!w) return ['NO WALK', 'false']; return [w.bad.join('; ') || 'none', String(w.titles.length === w.total && w.total >= ${min})]; }`;

/**
 * A REAL KEY PRESS at whatever holds focus, bubbling to `window` where the
 * engine and the offer listen, then the stored state flushed through the
 * writer. Returns [callout gone, default prevented, stored state, focus on a
 * visible header control].
 */
export const pressThenRead = (key, tour, clickSelector = null) => `async () => {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	let prevented = 'clicked';
	if (${JSON.stringify(clickSelector)}) {
		document.querySelector(${JSON.stringify(clickSelector)}).click();
	} else {
		const at = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.querySelector('[data-testid="tour-callout"]');
		const ev = new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true });
		(at ?? document.body).dispatchEvent(ev);
		prevented = String(ev.defaultPrevented);
	}
	await sleep(150);
	await window.__tourFlush();
	const p = window.__tourProbe();
	const a = document.activeElement;
	const focusOk = !!a && a.matches('[data-testid="tour-trigger"], .menu-trigger') && a.getClientRects().length > 0;
	return [String(!document.querySelector('[data-testid="tour-callout"]')), prevented, p.tours[${JSON.stringify(tour)}], String(focusOk)];
}`;

/** The callout's own words and controls, measured on whichever step it is showing. */
export const CALLOUT_CONTRAST = [
	{ selector: '[data-testid="tour-callout"] h3', label: 'step title', min: 4.5 },
	{ selector: '[data-testid="tour-body"]', label: 'step words', min: 4.5 },
	{ selector: '[data-testid="tour-count"]', label: 'step count', min: 4.5 },
	{ selector: '[data-testid="tour-skip"]', label: 'Skip tour', min: 4.5 },
	{ selector: '[data-testid="tour-next"]', label: 'Next / Done', min: 4.5 },
	{ selector: '[data-testid="tour-close"]', label: 'close', min: 4.5 }
];

export const CALLOUT_TAPS = [
	{ selector: '[data-testid="tour-callout"] button', label: 'the callout controls' }
];
