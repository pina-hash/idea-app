/**
 * Shared steps and probes for the /dev/classroom-live and
 * /dev/classroom-projector specs (ledger 0297, package LIVE): the teacher's
 * control view in the REAL ClassroomShell, and the projector view the class
 * sees. `_`-prefixed, so the route loader skips it (routes.mjs).
 */

/** The control view has hydrated once the grid has drawn its rows. */
export const LIVE_READY = {
	waitFor: `() => document.querySelectorAll('[data-testid="live-cell"]').length > 0`,
	timeoutMs: 30000
};

/** Each group on the grid and how many names it holds, in reading order. */
export const LIVE_GROUPS = `() => [...document.querySelectorAll('[data-testid^="live-group-"]')].map((g) =>
	g.getAttribute('data-testid').replace('live-group-', '') + ' ' + g.querySelectorAll('[data-testid="live-cell"]').length
)`;

/** Every name on the grid, sorted, so an absence below is read off the same list. */
export const LIVE_NAMES = `() => [...document.querySelectorAll('[data-testid="live-cell"] .lg-name')].map((n) => n.textContent.trim()).sort()`;

/** The projector has painted once its clock has digits in it. */
export const PROJECTOR_READY = {
	waitFor: `() => /\\d:\\d\\d/.test(document.querySelector('[data-testid="projector-clock"]')?.textContent || '')`,
	timeoutMs: 30000
};

/**
 * THE 8H RULE, MEASURED: the smallest font on the wall against one fiftieth of
 * the window's height, over every element that paints text of its own inside
 * the stage (the teacher's strip is chrome and fades; it is not the wall).
 * A portrait window is not a projector: the rule is about a wall display, so
 * at 375 the probe says so in words rather than passing or failing it.
 */
export const EIGHT_H = `() => {
	if (innerWidth < innerHeight) return 'portrait window, not a wall profile';
	const floor = innerHeight / 50;
	let min = Infinity, what = '';
	for (const el of document.querySelectorAll('.lp-stage *')) {
		if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
		if (!el.getBoundingClientRect().width) continue;
		const fs = parseFloat(getComputedStyle(el).fontSize);
		if (fs < min) { min = fs; what = el.textContent.trim().slice(0, 20); }
	}
	return min >= floor ? 'smallest text clears 1/50 of the height' : 'BELOW 8H: ' + what + ' ' + min + 'px < ' + floor.toFixed(1) + 'px';
}`;

/** The wall fits its window: no scroll in either direction. */
export const WALL_FITS = `() => {
	const d = document.documentElement;
	return [d.scrollWidth <= innerWidth ? 'no horizontal scroll' : 'scrolls sideways ' + d.scrollWidth, d.scrollHeight <= innerHeight ? 'no vertical scroll' : 'scrolls down ' + d.scrollHeight + ' > ' + innerHeight];
}`;

/** Every roster name the fixture holds, against the wall's whole text. */
export const ROSTER_ON_WALL = `() => {
	const names = ['Ana Reyes', 'Ben Okafor', 'Cruz Delgado', 'Dee Marsh', 'Eli Nakamura', 'Fay Obi', 'Gus Varga', 'Hana Ito', 'Ivan Petrov', 'Jo Lindqvist', 'Kim Soto', 'Lee Amari', 'Max Left', 'Mr. Pina'];
	const text = document.body.innerText;
	return [names.filter((n) => text.includes(n)).join(', ') || 'none', text.includes('@') ? 'an address' : 'no address'];
}`;
