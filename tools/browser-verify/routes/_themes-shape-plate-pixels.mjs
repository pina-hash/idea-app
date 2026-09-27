/**
 * THE PIXEL AND CROSS-THEME HALF OF THE PLATE MEASUREMENTS (ledger 0341).
 * `_`-prefixed, so `../routes.mjs` does not load it as a route spec; run by
 * hand, against the Plate view of /dev/themes-shape:
 *
 *   node tools/browser-verify/routes/_themes-shape-plate-pixels.mjs [--shots <dir>]
 *
 * What it answers that a route spec cannot, because a spec visits one theme
 * and reads the DOM:
 *
 *   1. THE ONE RULE: every control's bounding box, in every theme, at 1440 and
 *      375, diffed against IDEA's. A control is every button, link, input,
 *      select and label under the Plate view, before and after columns alike.
 *      Every other element's box is diffed too, minus the logo's spinning gear
 *      (a rotation animates its box) and the emblem's dark/light twin (the
 *      theme swaps which one is displayed; the slot they share is a control
 *      and is in the first count).
 *   2. THE FOCUS RING ALONG A CUT, counted in pixels as round 1 counted it
 *      (`focusRing` from ../_themes-shape-pixels.mjs): each control focused for
 *      real, pixels that change, against the ~2px ring a full outline draws.
 *   3. THE BORDER ALONG A CUT (`diagonal` from the same file): the darkest
 *      pixel per row of the cut, against the ground outside the shape, on a
 *      monitor and under `PROJECTOR_MODEL`.
 *   4. THE MONO LABEL SIZE, before and after, as the smallest rendered size.
 *   5. WHERE A PRESS LANDS: the centre and four points 3px inside each edge of
 *      every after control, hit-tested, so a notch or a bracket over a target
 *      would show up as a press landing on something else.
 *   6. With `--shots`, the screenshots shapes-v2.md carries.
 *
 * Every figure is printed; nothing here passes or fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openPage, waitForApp, settle, waitUntil } from '../browser.mjs';
import { startDevServer } from '../server.mjs';
import { focusRing, diagonal, f2 } from '../_themes-shape-pixels.mjs';

const shotsIdx = process.argv.indexOf('--shots');
const shotsDir = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const THEMES = ['idea', 'matrix', 'space-white'];
const WIDTHS = [1440, 375];

async function openPlate(browser, origin, theme, width) {
	const { context, page } = await openPage(browser, { width, height: width < 500 ? 780 : 900 });
	await page.goto(`${origin}/dev/themes-shape?state=${theme}`, { waitUntil: 'domcontentloaded' });
	await waitForApp(page);
	const attr = theme === 'idea' ? null : theme;
	const ok = await waitUntil(
		page,
		`() => document.documentElement.getAttribute('data-theme') === ${JSON.stringify(attr)} && document.querySelectorAll('.pl-view .cr-header').length === 6`,
		{ timeoutMs: 30_000 }
	);
	if (!ok.ok) throw new Error(`${theme} ${width}: the Plate view never reached its theme`);
	/* Walk the page once so every lazy image (the light emblem is lazy) has
	   loaded before anything is read or shot, then open both class menus. */
	await page.evaluate(async () => {
		for (let y = 0; y < document.body.scrollHeight; y += 500) {
			window.scrollTo(0, y);
			await new Promise((r) => setTimeout(r, 40));
		}
		window.scrollTo(0, 0);
		document.querySelectorAll('[data-testid="menu-stage"] [data-testid="section-switcher"]').forEach((b) => {
			if (b.getAttribute('aria-expanded') !== 'true') b.click();
		});
	});
	await waitUntil(page, `() => document.querySelectorAll('[data-testid="menu-stage"] [data-testid="section-switcher-menu"]').length === 2`, { timeoutMs: 5000 });
	await settle(page);
	await new Promise((r) => setTimeout(r, 400));
	return { context, page };
}

const BOXES = `() => {
	const ctl = 'button, a[href], input, select, label';
	const skip = (el) => el.matches('.wordmark img, .wordmark picture, .wordmark picture *, .spin');
	const key = (el, i) => (el.closest('[data-pl-sec]')?.dataset.plSec ?? '-') + '/' + (el.closest('[data-col]')?.dataset.col ?? '-') + '/' + i + '/' + el.tagName.toLowerCase();
	const box = (el) => { const r = el.getBoundingClientRect(); return [+(r.x).toFixed(2), +(r.y + scrollY).toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]; };
	const controls = [...document.querySelectorAll('.pl-view :is(' + ctl + ')')].map((el, i) => [key(el, i), ...box(el)]);
	const all = [...document.querySelectorAll('.pl-view *')].filter((el) => !skip(el)).map((el, i) => [key(el, i), ...box(el)]);
	return { controls, all, page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
}`;

function diff(base, other) {
	let differ = 0;
	let max = 0;
	const first = [];
	if (base.length !== other.length) return { count: `${base.length} vs ${other.length} ELEMENTS`, differ: NaN, max: NaN, first };
	for (let i = 0; i < base.length; i++) {
		const a = base[i];
		const b = other[i];
		const d = a[0] !== b[0] ? Infinity : Math.max(...[1, 2, 3, 4].map((k) => Math.abs(a[k] - b[k])));
		if (d > 0.01) {
			differ++;
			if (first.length < 5) first.push(`${a[0]} ${a.slice(1).join(',')} -> ${b.slice(1).join(',')}`);
		}
		max = Math.max(max, d);
	}
	return { count: base.length, differ, max, first };
}

const MONO = `(col) => {
	let min = Infinity, n = 0, under = 0;
	for (const el of document.querySelectorAll('.pl-view [data-col="' + col + '"] *')) {
		if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
		const cs = getComputedStyle(el);
		if (!/Share Tech Mono/i.test(cs.fontFamily)) continue;
		const r = el.getBoundingClientRect();
		if (!r.width || !r.height || cs.visibility === 'hidden') continue;
		const px = parseFloat(cs.fontSize);
		n++;
		if (px < 11) under++;
		min = Math.min(min, px);
	}
	return col + ': ' + n + ' mono labels, smallest ' + min.toFixed(2) + 'px, ' + under + ' under 11px';
}`;

const HITS = `(sec, col) => {
	let controls = 0, pts = 0, miss = 0, corners = 0, cornerMiss = 0, clipped = 0;
	const misses = [];
	/* The box a press can actually reach: the control's own box cut by the
	   viewport and by every clipping ancestor (the header's class strip
	   scrolls sideways at 375). A control not wholly inside it is COUNTED as
	   clipped and not pressed, because a point outside it lands on whatever
	   covers it, which says nothing about the control. */
	const reachable = (el) => {
		let r = el.getBoundingClientRect();
		let box = { l: 0, t: 0, r: innerWidth, b: innerHeight };
		for (let p = el.parentElement; p; p = p.parentElement) {
			const cs = getComputedStyle(p);
			if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
				const q = p.getBoundingClientRect();
				box = { l: Math.max(box.l, q.left), t: Math.max(box.t, q.top), r: Math.min(box.r, q.right), b: Math.min(box.b, q.bottom) };
			}
		}
		return r.left >= box.l - 0.5 && r.top >= box.t - 0.5 && r.right <= box.r + 0.5 && r.bottom <= box.b + 0.5;
	};
	for (const el of document.querySelectorAll('.pl-view [data-pl-sec="' + sec + '"] [data-col="' + col + '"] :is(button, a[href], input, select)')) {
		const target = el.closest('label') ?? el;
		const r = target.getBoundingClientRect();
		if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
		if (!reachable(target)) { clipped++; continue; }
		controls++;
		const mine = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === target || target.contains(h)); };
		const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
		for (const [x, y] of [[cx, cy], [r.left + 3, cy], [r.right - 3, cy], [cx, r.top + 3], [cx, r.bottom - 3]]) {
			pts++;
			if (!mine(x, y)) { miss++; if (misses.length < 4) { const h = document.elementFromPoint(x, y); misses.push((el.className || el.tagName) + ' -> ' + (h ? h.tagName.toLowerCase() + '.' + [...h.classList].slice(0, 2).join('.') : 'nothing')); } }
		}
		for (const [x, y] of [[r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]]) {
			corners++;
			if (!mine(x, y)) cornerMiss++;
		}
	}
	return col + ': ' + controls + ' controls wholly reachable (' + clipped + ' clipped, skipped): ' + miss + ' of ' + pts + ' centre and edge-midpoint presses land elsewhere' + (misses.length ? ' (' + misses.join('; ') + ')' : '') + '; ' + cornerMiss + ' of ' + corners + ' presses 2px inside a corner land outside the control';
}`;

/* The controls whose ring and cut are read, per column. */
const RING = [
	['primary button', '[data-pl-sec="buttons"] [data-col="COL"] [data-ts="btn-primary"]'],
	['secondary button', '[data-pl-sec="buttons"] [data-col="COL"] [data-ts="btn-secondary"]'],
	['select', '[data-pl-sec="fields"] [data-col="COL"] [data-ts="select"]'],
	['text input', '[data-pl-sec="fields"] [data-col="COL"] [data-ts="input"]'],
	['card button', '[data-pl-sec="card"] [data-col="COL"] [data-ts="card-btn"]'],
	['header tool', '[data-pl-sec="header"] [data-col="COL"] .cr-header .shell-tool'],
	['class icon', '[data-pl-sec="header"] [data-col="COL"] .cr-header .cls-icon'],
	['list row link', '[data-pl-sec="list"] [data-col="COL"] .row-wrap.selected .row-main']
];
const CUTS = [
	['card (panel cut 14px)', '[data-pl-sec="card"] [data-col="after"] [data-ts="card"]', 14],
	['secondary button (control cut 6px)', '[data-pl-sec="buttons"] [data-col="after"] [data-ts="btn-secondary"]', 6],
	['select well (control cut 6px)', '[data-pl-sec="fields"] [data-col="after"] [data-ts="select"]', 6],
	['list well (panel cut 14px)', '[data-pl-sec="list"] [data-col="after"] .pl-list', 14],
	['display window (panel cut 14px)', '[data-pl-sec="display"] [data-col="after"] .grade-head', 14]
];

const server = await startDevServer({ cwd: process.cwd() });
const { browser } = await launch();
try {
	for (const width of WIDTHS) {
		console.log(`\n=== ${width}px ===`);
		const read = {};
		for (const theme of THEMES) {
			const { context, page } = await openPlate(browser, server.origin, theme, width);
			read[theme] = await page.evaluate(`(${BOXES})()`);
			console.log(`\n-- ${theme} --  page ${read[theme].page.join('x')}`);
			for (const col of ['before', 'after']) console.log('  ' + (await page.evaluate(`(${MONO})(${JSON.stringify(col)})`)));
			if (shotsDir) {
				writeFileSync(`${shotsDir}/shapes-v2-${theme}-${width}.png`, await page.screenshot({ fullPage: true }));
				if (width === 1440) {
					const el = await page.$('[data-pl-sec="region"]');
					await el.scrollIntoViewIfNeeded();
					writeFileSync(`${shotsDir}/shapes-v2-page-${theme}-1440.png`, await el.screenshot());
				}
			}
			/* Hit tests section by section, each scrolled into view. */
			for (const sec of ['buttons', 'fields', 'list', 'header', 'menu', 'region']) {
				for (const col of ['before', 'after']) {
					await page.evaluate(([s, c]) => document.querySelector(`[data-pl-sec="${s}"] [data-col="${c}"]`).scrollIntoView({ block: 'start', behavior: 'instant' }), [sec, col]);
					await settle(page);
					console.log(`  hits ${sec} ` + (await page.evaluate(`(${HITS})(${JSON.stringify(sec)}, ${JSON.stringify(col)})`)));
				}
			}

			if (width === 1440) {
				for (const [label, sel] of RING) {
					for (const col of ['before', 'after']) console.log(`  ring ${col} ${label}: ` + (await focusRing(page, sel.replace('COL', col))).replace(/^[^:]*: /, ''));
				}
				for (const [label, sel, cut] of CUTS) console.log(`  cut ${label}: ` + (await diagonal(page, sel, cut)).replace(/^[^:]*: /, ''));
			}
			await context.close();
		}
		for (const theme of ['matrix', 'space-white']) {
			const c = diff(read.idea.controls, read[theme].controls);
			const a = diff(read.idea.all, read[theme].all);
			console.log(`\n  BOXES ${theme} vs idea at ${width}: controls ${c.count}, differing ${c.differ}, max delta ${f2(c.max)}px; all elements ${a.count}, differing ${a.differ}, max delta ${f2(a.max)}px; page ${read.idea.page.join('x')} vs ${read[theme].page.join('x')}`);
			for (const l of [...c.first, ...a.first]) console.log('    ' + l);
		}
	}
} finally {
	await browser.close();
	await server.stop();
}
