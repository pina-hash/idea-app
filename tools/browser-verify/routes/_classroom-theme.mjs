/**
 * Shared pieces of the /dev/classroom-theme specs (decision 45, ledger 0347).
 * `_`-prefixed, so `routes.mjs` does not load it as a route.
 *
 * WHAT A BROWSER IS FOR HERE. The class banner is a translucent WASH over the
 * room's own ground, so the number that matters is the class name's contrast
 * against the COMPOSITED ground, which the contrast check computes by walking
 * and compositing background colours (the wash is a colour, not an image, for
 * exactly that reason). The accent stripe, the strip key's bar and a card's
 * edge are graphical objects measured at 3:1 against their own composited
 * ground by `GRAPHIC` below, which reports what it examined.
 */

/** The class page has painted, with its item list. */
export const READY = `() => !!document.querySelector('[data-testid="harness-class"] .pane-title') && document.querySelectorAll('.class-card').length === 3`;

/** Open the vote panel; it only reads while open. */
export const OPEN_PANEL = {
	click: '[data-testid="class-theme-toggle"]',
	until: `() => document.querySelector('[data-testid="class-theme-toggle"]')?.getAttribute('aria-expanded') === 'true'`,
	label: 'the Class theme panel is open'
};

/**
 * GRAPHICAL CONTRAST, COMPOSITED: the banner's accent stripe (its left border),
 * the strip key's top bar and a card's edge element, each against the ground its
 * own box sits on, with every translucent layer composited. Returns
 * [count examined, worst ratio >= 3, the worst ratio rounded] so a zero count
 * cannot read as a pass.
 */
const GRAPHIC_BODY = `
	const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
	const over = (top, bot) => { const a = top.a + bot.a * (1 - top.a); if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }; return { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a }; };
	const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const groundUnder = (el) => { let acc = { r: 0, g: 0, b: 0, a: 0 }; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const bg = parse(getComputedStyle(n).backgroundColor); if (bg && bg.a > 0) { acc = over(acc, bg); if (acc.a >= 0.999) return acc; } } return over(acc, parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }); };
	const pairs = [];
	for (const b of document.querySelectorAll('.ct-banner')) pairs.push([parse(getComputedStyle(b).borderLeftColor), groundUnder(b.parentElement)]);
	for (const bar of document.querySelectorAll('[data-testid="class-icon-theme"]')) pairs.push([parse(getComputedStyle(bar).backgroundColor), groundUnder(bar.parentElement)]);
	for (const edge of document.querySelectorAll('[data-testid="class-card-edge"]')) pairs.push([parse(getComputedStyle(edge).backgroundColor), groundUnder(edge.parentElement)]);
	const ratios = pairs.filter(([f, g]) => f && g).map(([f, g]) => ratio(over(f, g), g));
	const worst = ratios.length ? Math.min(...ratios) : 0;`;

/** A prepare-step REPORT: how many were examined and the worst ratio, printed, not asserted. */
export const GRAPHIC_REPORT = `() => {${GRAPHIC_BODY}
	return 'graphical edges examined=' + ratios.length + ' worst=' + worst.toFixed(2) + ':1';
}`;

/** The verdict: something was examined, and every one clears 3:1. */
export const GRAPHIC_PASS = `() => {${GRAPHIC_BODY}
	return ['examined=' + ratios.length, 'allClear3=' + (ratios.length > 0 && worst >= 3)];
}`;

export const IGNORE = ['Failed to load resource: net::ERR_FAILED'];
