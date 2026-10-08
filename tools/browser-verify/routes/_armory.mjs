/**
 * Shared steps for the single-state Armory specs (the loader skips `_` files).
 *
 * HYDRATED, TWICE. A tab and a file row are real links, so a click that
 * lands before hydration follows the link off the harness; and a cold Vite
 * reloads the page once while it optimizes the route's dependencies. Wait
 * for the marker, let that reload happen, wait again (CLAUDE.md, "A SPEC
 * THAT CLICKS A REAL LINK WAITS FOR A HYDRATION MARKER").
 */
export const ARMORY_HYDRATED = [
	{ waitFor: `() => !!document.querySelector('[data-armory-hydrated="yes"]')`, timeoutMs: 20000, waitMs: 2000 },
	{ waitFor: `() => !!document.querySelector('[data-armory-hydrated="yes"]')`, timeoutMs: 20000 }
];

/** The document's height, and how many 952px windows (Mr. Pina's report's own viewport) it is. */
export const DOC_HEIGHT = `() => { const h = document.documentElement.scrollHeight; return 'document ' + h + 'px at ' + innerWidth + ' wide, ' + (h / 952).toFixed(1) + ' windows of 952px'; }`;

/**
 * Every visible control matching `selector` answers a hit test at its own
 * centre (scrolled into view first), so nothing is painted over it: not the
 * report control, not a neighbour.
 */
export const hitsSelf = (selector) => `() => {
	const all = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((el) => el.getBoundingClientRect().width > 0);
	if (all.length === 0) return ['NONE MATCHED'];
	const missed = [];
	for (const el of all) {
		el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
		const b = el.getBoundingClientRect();
		const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
		if (!hit || !(hit === el || el.contains(hit))) missed.push((el.textContent || '').trim().slice(0, 30) + ' -> ' + (hit ? hit.className || hit.tagName : 'nothing'));
	}
	window.scrollTo({ top: 0, behavior: 'instant' });
	return missed.length ? missed.slice(0, 5) : ['every one answers itself'];
}`;
