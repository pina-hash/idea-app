/**
 * THE REPORT CONTROL INJECTED INTO A CARRIED-OVER ASSIGNMENT PAGE (report 20,
 * 2026-09-25) -- the steps and the probe the `feedback-assignment-*` specs
 * share. The page is `/dev/feedback/assignment`, which serves the REAL
 * assignment HTML through the REAL `/assignments/<slug>` pipeline with only the
 * session probe and the signed-in endpoint pointed at fixtures.
 *
 * `_`-prefixed: a helper module, not a route spec.
 */

/** Press the floating trigger and wait for the panel AND the session answer. */
export const openPanel = (settled) => ({
	click: '#idea-legacy-report-btn',
	until: `() => { const p = document.getElementById('idea-legacy-report'); if (!p || getComputedStyle(p).display === 'none') return false; return (${settled})(); }`,
	attempts: 12,
	waitMs: 300,
	label: 'press Report and wait for the panel and the session answer'
});

/**
 * The trigger answers a tap at its own centre, its outer edge clears 3:1
 * against the page ground behind it (canvas readback), and the palette the
 * panel chose matches the page's own ground (light on a light page, dark on a
 * dark one). Returns words, and the numbers ride the verdict strings only when
 * something fails, so a pass compares exactly.
 */
export const TRIGGER_FACTS = `() => {
	const t = document.getElementById('idea-legacy-report-btn');
	if (!t) return ['NO TRIGGER'];
	const r = t.getBoundingClientRect();
	/* The open panel is a full-window overlay above the trigger, correctly, so
	   the hit test takes it out of the way for the one read and puts it back. */
	const open = document.getElementById('idea-legacy-report');
	const was = open ? open.style.display : null;
	if (open) open.style.display = 'none';
	const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
	if (open) open.style.display = was;
	const cv = document.createElement('canvas');
	cv.width = cv.height = 1;
	const cx = cv.getContext('2d', { willReadFrequently: true });
	const paint = (c, g) => { cx.fillStyle = g || '#000'; cx.fillRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
	const lum = (p) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); };
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	let ground = null;
	for (const el of [document.body, document.documentElement]) {
		const bg = getComputedStyle(el).backgroundColor;
		if (bg && !/rgba\\([^)]*,\\s*0\\)$/.test(bg) && bg !== 'transparent') { ground = bg; break; }
	}
	ground = ground || '#ffffff';
	const g = paint(ground, '#fff');
	const edge = ratio(paint(getComputedStyle(t).borderTopColor, ground), g);
	const light = lum(g) > 0.5;
	const panelBg = (() => { const card = document.querySelector('#idea-legacy-report > div'); return card ? paint(getComputedStyle(card).backgroundColor, '#000') : null; })();
	const panelLight = panelBg ? lum(panelBg) > 0.5 : null;
	return [
		hit && t.contains(hit) ? 'trigger answers at its centre' : 'TRIGGER COVERED at its centre',
		edge >= 3 ? 'trigger edge clears 3 on the page' : 'TRIGGER EDGE ' + edge.toFixed(2) + ' ON ' + ground,
		panelLight === null ? 'NO PANEL' : panelLight === light ? 'panel palette matches the page' : 'PANEL ' + (panelLight ? 'LIGHT' : 'DARK') + ' ON A ' + (light ? 'LIGHT' : 'DARK') + ' PAGE'
	];
}`;

export const TRIGGER_FACTS_EXPECTED = [
	'trigger answers at its centre',
	'trigger edge clears 3 on the page',
	'panel palette matches the page'
];
