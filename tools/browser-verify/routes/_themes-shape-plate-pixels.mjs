/**
 * THE PIXEL AND CROSS-THEME HALF OF THE PLATE MEASUREMENTS. Written for round
 * 2 (ledger 0341); since ledger 0344 it measures ROUND 3 (`Plate v3`), the
 * page's default view. `_`-prefixed, so `../routes.mjs` does not load it as a
 * route spec; run by hand, against /dev/themes-shape:
 *
 *   node tools/browser-verify/routes/_themes-shape-plate-pixels.mjs [--shots <dir>] [--face b]
 *
 * What it answers that a route spec cannot, because a spec visits one theme
 * and reads the DOM:
 *
 *   1. THE ONE RULE: every control's bounding box, in every theme, at 1440 and
 *      375, diffed against IDEA's. A control is every button, link, input,
 *      select and label under the view, before and after columns alike. Every
 *      other element's box is diffed too, minus the logo's spinning gear (a
 *      rotation animates its box) and the emblem's dark/light twin (the theme
 *      swaps which one is displayed; the slot they share is a control and is
 *      in the first count). `--face b` repeats it with the pixel face on.
 *   2. THE FOCUS RING, counted in pixels as round 1 counted it (`focusRing`
 *      from ../_themes-shape-pixels.mjs): each control focused for real,
 *      pixels that change, against the ~2px ring a full outline draws.
 *   3. THE COMPOSITE EDGE (`diagonal` from the same file): the pixel standing
 *      furthest from the ground on the straight top edge and on each row of
 *      the top-left corner, against the plate outside the shape, on a monitor
 *      and under `PROJECTOR_MODEL`. That pixel is the dark hairline, which is
 *      the load-bearing boundary of the composite edge.
 *   4. THE MONO LABEL SIZE, before and after, as the smallest rendered size.
 *   5. WHERE A PRESS LANDS: the centre and four points 3px inside each edge of
 *      every after control, hit-tested, so a decoration over a target would
 *      show up as a press landing on something else.
 *   6. THE CHIPS, before and after, holding the same word: width and height.
 *   7. THE PROGRESS RING'S READOUT against the face it is actually drawn on.
 *      The route spec's contrast walk stops at the first opaque BOX, and the
 *      ring's face is SVG paint, so the walk reads the plate behind the whole
 *      ring. Here the words are hidden, the box they occupy is shot, and the
 *      readout is scored against the 5th- and 95th-percentile pixels of that
 *      patch: whichever is worse is the figure.
 *   8. THE PAINT COST at 1440 in each theme: the window scrolled through the
 *      whole page over 180 animation frames, frame times from rAF and the
 *      paint and raster time from a trace. The ring's three SVG blurs are the
 *      only filters on the page and none is page-wide.
 *   9. With `--shots`, the screenshots shapes-v3.md carries.
 *
 * Every figure is printed; nothing here passes or fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openPage, waitForApp, settle, waitUntil } from '../browser.mjs';
import { startDevServer } from '../server.mjs';
import { focusRing, diagonal, f2, pixelsOf, at, colourOf, wcag, lum } from '../_themes-shape-pixels.mjs';
import { washedRatio } from '../checks.mjs';

const shotsIdx = process.argv.indexOf('--shots');
const shotsDir = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const faceB = process.argv.includes('--face') && process.argv[process.argv.indexOf('--face') + 1] === 'b';

const THEMES = ['idea', 'matrix', 'space-white'];
const WIDTHS = [1440, 375];
const VIEW = '.p3-view';

async function openPlate(browser, origin, theme, width, { dsf = 1 } = {}) {
	const { context, page } = await openPage(browser, { width, height: width < 500 ? 780 : 900 });
	if (dsf !== 1) {
		await context.close();
		const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dsf, reducedMotion: 'no-preference' });
		const p = await ctx.newPage();
		await p.route((u) => !(u.hostname === '127.0.0.1' || u.hostname === 'localhost'), (r) => r.abort());
		return finishOpen(ctx, p, origin, theme);
	}
	return finishOpen(context, page, origin, theme);
}

async function finishOpen(context, page, origin, theme) {
	await page.goto(`${origin}/dev/themes-shape?state=${theme}${faceB ? '&face=b' : ''}`, { waitUntil: 'domcontentloaded' });
	await waitForApp(page);
	const attr = theme === 'idea' ? null : theme;
	const ok = await waitUntil(
		page,
		`() => document.documentElement.getAttribute('data-theme') === ${JSON.stringify(attr)} && document.querySelectorAll('${VIEW} .cr-header').length === 6`,
		{ timeoutMs: 30_000 }
	);
	if (!ok.ok) throw new Error(`${theme}: the Plate v3 view never reached its theme`);
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
	/* A click that lands before the page has finished hydrating does nothing,
	   and a box read with one menu shut compares a different set of elements
	   (round 3's first 1440 run did exactly that in IDEA). So the menus are
	   pressed again until both are open, and a page that never opens them
	   stops the run rather than reporting a diff of two different pages. */
	let menus = { ok: false };
	for (let i = 0; i < 8 && !menus.ok; i++) {
		menus = await waitUntil(page, `() => document.querySelectorAll('[data-testid="menu-stage"] [data-testid="section-switcher-menu"]').length === 2`, { timeoutMs: 1500 });
		if (!menus.ok)
			await page.evaluate(() =>
				document.querySelectorAll('[data-testid="menu-stage"] [data-testid="section-switcher"]').forEach((b) => {
					if (b.getAttribute('aria-expanded') !== 'true') b.click();
				})
			);
	}
	if (!menus.ok) throw new Error(`${theme}: the two class menus never opened`);
	await settle(page);
	await new Promise((r) => setTimeout(r, 400));
	return { context, page };
}

const BOXES = `() => {
	const ctl = 'button, a[href], input, select, label';
	const skip = (el) => el.matches('.wordmark img, .wordmark picture, .wordmark picture *, .spin');
	const key = (el, i) => (el.closest('[data-pl-sec]')?.dataset.plSec ?? '-') + '/' + (el.closest('[data-col]')?.dataset.col ?? '-') + '/' + i + '/' + el.tagName.toLowerCase();
	/* An element with no box at all (display: none, or inside something that
	   is) reports a zero rect at the VIEWPORT's origin, so adding scrollY to it
	   would make its "position" the scroll offset of the moment it was read:
	   round 3's first 1440 run diffed 36 hidden controls by 1090px that way,
	   because IDEA's menus took a retry that scrolled the page. Boxless is
	   recorded as boxless, and the page is read from the top. */
	scrollTo(0, 0);
	const box = (el) => { if (!el.getClientRects().length) return [-1, -1, 0, 0]; const r = el.getBoundingClientRect(); return [+(r.x).toFixed(2), +(r.y + scrollY).toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]; };
	const controls = [...document.querySelectorAll('${VIEW} :is(' + ctl + ')')].map((el, i) => [key(el, i), ...box(el)]);
	const all = [...document.querySelectorAll('${VIEW} *')].filter((el) => !skip(el)).map((el, i) => [key(el, i), ...box(el)]);
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
	for (const el of document.querySelectorAll('${VIEW} [data-col="' + col + '"] *')) {
		if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
		const cs = getComputedStyle(el);
		if (!/Share Tech Mono|VT323/i.test(cs.fontFamily)) continue;
		const r = el.getBoundingClientRect();
		if (!r.width || !r.height || cs.visibility === 'hidden') continue;
		const px = parseFloat(cs.fontSize);
		n++;
		if (px < 11) under++;
		min = Math.min(min, px);
	}
	return col + ': ' + n + ' mono labels, smallest ' + min.toFixed(2) + 'px, ' + under + ' under 11px';
}`;

/* THE CHIPS, holding the same word before and after: today's chip against the
   proposal's, width and height, in document order. */
const CHIPS = `() => {
	const rows = [];
	const read = (col) => [...document.querySelectorAll('${VIEW} [data-col="' + col + '"] :is(.draft-chip, .sched-chip, .kind-chip, .chip)')].filter((el) => el.getBoundingClientRect().width).map((el) => ({ sec: el.closest('[data-pl-sec]')?.dataset.plSec, word: el.textContent.trim(), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
	const b = read('before'), a = read('after');
	const seen = new Set();
	for (const x of b) {
		const k = x.word;
		if (seen.has(k)) continue;
		seen.add(k);
		const y = a.find((z) => z.word === x.word && z.sec === x.sec) ?? a.find((z) => z.word === x.word);
		rows.push(k + ': before ' + x.w.toFixed(2) + 'x' + x.h.toFixed(2) + ', after ' + (y ? y.w.toFixed(2) + 'x' + y.h.toFixed(2) + ' (' + (y.w <= x.w + 0.005 ? 'no wider' : 'WIDER by ' + (y.w - x.w).toFixed(2)) + ')' : 'MISSING'));
	}
	return rows;
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
	for (const el of document.querySelectorAll('${VIEW} [data-pl-sec="' + sec + '"] [data-col="' + col + '"] :is(button, a[href], input, select)')) {
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

/* The controls whose ring is read, per column. */
const RING = [
	['primary button', '[data-pl-sec="buttons"] [data-col="COL"] [data-ts="btn-primary"]'],
	['secondary button', '[data-pl-sec="buttons"] [data-col="COL"] [data-ts="btn-secondary"]'],
	['selected button', '[data-pl-sec="buttons"] [data-col="COL"] [data-ts="btn-selected"]'],
	['select', '[data-pl-sec="fields"] [data-col="COL"] [data-ts="select"]'],
	['text input', '[data-pl-sec="fields"] [data-col="COL"] [data-ts="input"]'],
	['card button', '[data-pl-sec="card"] [data-col="COL"] [data-ts="card-btn"]'],
	['header tool', '[data-pl-sec="header"] [data-col="COL"] .cr-header .shell-tool'],
	['class icon (pad)', '[data-pl-sec="header"] [data-col="COL"] .cr-header .cls-icon'],
	['theme switch', '[data-pl-sec="header"] [data-col="COL"] .cr-header .theme-switch'],
	['list row link', '[data-pl-sec="list"] [data-col="COL"] .row-wrap.selected .row-main']
];
/* The composite edges read, after column: [label, selector, corner reach]. */
const CUTS = [
	['card (radius 12px)', '[data-pl-sec="card"] [data-col="after"] [data-ts="card"]', 12],
	['secondary button (radius 11px)', '[data-pl-sec="buttons"] [data-col="after"] [data-ts="btn-secondary"]', 11],
	['chip (radius 5px)', '[data-pl-sec="buttons"] [data-col="after"] [data-ts="chip-kind"]', 5],
	['dropdown well (radius 11px)', '[data-pl-sec="fields"] [data-col="after"] [data-ts="select"]', 11],
	['list well (radius 12px)', '[data-pl-sec="list"] [data-col="after"] .group-card', 12],
	['pad (radius 8px, outer hairline ring)', '[data-pl-sec="header"] [data-col="after"] .cr-header .cls-icon:not(.current)', 8],
	['display housing (radius 14px)', '[data-pl-sec="display"] [data-col="after"] .grade-card', 14]
];

/* THE RING READOUT'S REAL GROUND (7 above). */
async function ringReadout(page, sel) {
	const el = await page.$(sel);
	await el.scrollIntoViewIfNeeded();
	await new Promise((r) => setTimeout(r, 150));
	const value = await el.$('.p3-ring-value');
	const fgCss = await value.evaluate((n) => getComputedStyle(n).color);
	/* The glyphs' own box, not the full-size span that centres them. */
	const box = await value.evaluate((n) => {
		const range = document.createRange();
		range.selectNodeContents(n);
		const r = range.getBoundingClientRect();
		return { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height };
	});
	await value.evaluate((n) => (n.style.visibility = 'hidden'));
	await new Promise((r) => setTimeout(r, 80));
	const buf = await page.screenshot({ clip: { x: box.x, y: box.y - (await page.evaluate(() => window.scrollY)), width: box.width, height: box.height } });
	await value.evaluate((n) => (n.style.visibility = ''));
	const px = await pixelsOf(page, buf);
	const all = [];
	for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) all.push(at(px, x, y));
	all.sort((a, b) => lum(a) - lum(b));
	const lo = all[Math.floor(all.length * 0.05)];
	const hi = all[Math.floor(all.length * 0.95)];
	const fg = await colourOf(page, fgCss);
	const worst = [lo, hi].map((g) => ({ g, m: wcag(fg, g), w: washedRatio(fg, g) })).sort((a, b) => a.m - b.m)[0];
	const c = (k) => `rgb(${k.r},${k.g},${k.b})`;
	return `${f2(worst.m)}:1 on a monitor, ${f2(worst.w)}:1 washed (projector), ${c(fg)} on ${c(worst.g)} (patch 5th..95th percentile ${c(lo)}..${c(hi)}, ${all.length} px)`;
}

/* THE PAINT COST (8 above). */
async function paintCost(browser, page) {
	await page.evaluate(() => window.scrollTo(0, 0));
	await settle(page);
	let traced = true;
	try {
		await browser.startTracing(page, { categories: ['disabled-by-default-devtools.timeline', 'devtools.timeline', 'cc', 'viz', 'blink'] });
	} catch (e) {
		traced = false;
	}
	const raf = await page.evaluate(
		() =>
			new Promise((resolve) => {
				const max = document.documentElement.scrollHeight - innerHeight;
				const times = [];
				let last = performance.now();
				let n = 0;
				const step = (t) => {
					times.push(t - last);
					last = t;
					window.scrollTo(0, (n / 179) * max);
					n++;
					if (n < 180) requestAnimationFrame(step);
					else {
						const s = times.slice(5).sort((a, b) => a - b);
						resolve({ frames: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] });
					}
				};
				requestAnimationFrame(step);
			})
	);
	let paint = 'no trace';
	if (traced) {
		const trace = JSON.parse((await browser.stopTracing()).toString());
		const sum = (names) => (trace.traceEvents ?? trace).filter((e) => e.ph === 'X' && names.includes(e.name)).reduce((a, e) => a + e.dur, 0) / 1000;
		/* The event names this Chromium actually emits, read off a trace of
		   this page: the main thread's paint phase, and the compositor's draw,
		   which in a headless container is Chromium's SOFTWARE renderer (so it
		   is a worst case, not a GPU figure). */
		paint = `main-thread paint ${f2(sum(['LocalFrameView::RunPaintLifecyclePhase']))}ms, style and layout ${f2(sum(['Document::UpdateStyleAndLayout']))}ms, compositor draw (software) ${f2(sum(['DirectRenderer::DrawFrame']))}ms, over the whole scroll`;
	}
	return `${raf.frames} frames, mean ${f2(raf.mean)}ms, p95 ${f2(raf.p95)}ms, max ${f2(raf.max)}ms; ${paint}`;
}

/* A sheet of 2x crops, composed in a page of its own and shot there, so no
   image library is needed. Each entry: [caption, data URL]. */
async function sheet(browser, items, file, { cols = 2 } = {}) {
	const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	const cells = items.map(([cap, url]) => `<figure><img src="${url}"><figcaption>${cap}</figcaption></figure>`).join('');
	await page.setContent(
		`<style>body{margin:0;padding:24px;background:#8d939b;font:14px/1.3 sans-serif;color:#fff;width:max-content}main{display:grid;grid-template-columns:repeat(${cols},max-content);gap:24px 32px;align-items:start}figure{margin:0}figcaption{margin-top:6px}img{display:block}</style><main>${cells}</main>`
	);
	await page.waitForTimeout(300);
	writeFileSync(file, await page.screenshot({ fullPage: true }));
	await ctx.close();
}

async function crop(page, sel, margin = 12) {
	const el = await page.$(sel);
	if (!el) throw new Error(`crop: ${sel} missing`);
	await el.scrollIntoViewIfNeeded();
	await new Promise((r) => setTimeout(r, 150));
	const b = await el.boundingBox();
	const buf = await page.screenshot({ clip: { x: Math.max(0, b.x - margin), y: Math.max(0, b.y - margin), width: b.width + 2 * margin, height: b.height + 2 * margin } });
	return 'data:image/png;base64,' + buf.toString('base64');
}

const server = await startDevServer({ cwd: process.cwd() });
const { browser } = await launch();
try {
	for (const width of WIDTHS) {
		console.log(`\n=== ${width}px${faceB ? ' (face B)' : ''} ===`);
		const read = {};
		for (const theme of THEMES) {
			const { context, page } = await openPlate(browser, server.origin, theme, width);
			read[theme] = await page.evaluate(`(${BOXES})()`);
			console.log(`\n-- ${theme} --  page ${read[theme].page.join('x')}`);
			for (const col of ['before', 'after']) console.log('  ' + (await page.evaluate(`(${MONO})(${JSON.stringify(col)})`)));
			if (theme === 'space-white' || width === 1440) for (const l of await page.evaluate(`(${CHIPS})()`)) console.log('  chip ' + l);
			if (shotsDir && !faceB) {
				writeFileSync(`${shotsDir}/shapes-v3-${theme}-${width}.png`, await page.screenshot({ fullPage: true }));
				if (width === 1440) {
					const el = await page.$('[data-pl-sec="region"]');
					await el.scrollIntoViewIfNeeded();
					writeFileSync(`${shotsDir}/shapes-v3-page-${theme}-1440.png`, await el.screenshot());
				}
			}
			/* Hit tests section by section, each scrolled into view. */
			for (const sec of ['buttons', 'fields', 'list', 'header', 'menu', 'display', 'region']) {
				for (const col of ['before', 'after']) {
					await page.evaluate(([s, c]) => document.querySelector(`[data-pl-sec="${s}"] [data-col="${c}"]`).scrollIntoView({ block: 'start', behavior: 'instant' }), [sec, col]);
					await settle(page);
					console.log(`  hits ${sec} ` + (await page.evaluate(`(${HITS})(${JSON.stringify(sec)}, ${JSON.stringify(col)})`)));
				}
			}

			if (width === 1440 && !faceB) {
				for (const [label, sel] of RING) {
					for (const col of ['before', 'after']) console.log(`  ring ${col} ${label}: ` + (await focusRing(page, sel.replace('COL', col))).replace(/^[^:]*: /, ''));
				}
				for (const [label, sel, cut] of CUTS) console.log(`  edge ${label}: ` + (await diagonal(page, sel, cut)).replace(/^[^:]*: /, ''));
				for (const sec of ['display', 'region']) console.log(`  ring readout (${sec}): ` + (await ringReadout(page, `[data-pl-sec="${sec}"] [data-col="after"] [data-testid="p3-ring"]`)));
				console.log('  paint cost: ' + (await paintCost(browser, page)));
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

	/* THE 2x SHEETS: the chips before and after, and the detail sheet. */
	if (shotsDir && !faceB) {
		const { context, page } = await openPlate(browser, server.origin, 'space-white', 1440, { dsf: 2 });
		await sheet(
			browser,
			[
				['Before: today\'s chips', await crop(page, '[data-pl-sec="buttons"] [data-col="before"] [data-pl="group-chips"] .pl-row', 8)],
				['After: Plate v3 chips (no wider holding the same word)', await crop(page, '[data-pl-sec="buttons"] [data-col="after"] [data-pl="group-chips"] .pl-row', 8)],
				['Before: the list row chips', await crop(page, '[data-pl-sec="list"] [data-col="before"] .row-wrap.selected', 4)],
				['After', await crop(page, '[data-pl-sec="list"] [data-col="after"] .row-wrap.selected', 14)]
			],
			`${shotsDir}/shapes-v3-chips-space-white-2x.png`
		);
		await sheet(
			browser,
			[
				['Button, unselected', await crop(page, '[data-pl-sec="buttons"] [data-col="after"] [data-ts="btn-secondary"]')],
				['Button, selected (the broken, ticked ring)', await crop(page, '[data-pl-sec="buttons"] [data-col="after"] [data-ts="btn-selected"]')],
				['Pads: unlit, lit (the current class), unlit', await crop(page, '[data-pl-sec="header"] [data-col="after"] .cls-strip', 8)],
				['Switch, off and on', await crop(page, '[data-pl-sec="buttons"] [data-col="after"] [data-pl="group-switches"] .pl-row')],
				['List well, the selected row and the position bar', await crop(page, '[data-pl-sec="list"] [data-col="after"] .group-card', 16)],
				['Display: housing, screen, screws, perforation', await crop(page, '[data-pl-sec="display"] [data-col="after"] .grade-card', 20)],
				['Progress ring', await crop(page, '[data-pl-sec="display"] [data-col="after"] [data-testid="p3-ring"]', 16)],
				['Dropdown well', await crop(page, '[data-pl-sec="fields"] [data-col="after"] [data-ts="select"]')]
			],
			`${shotsDir}/shapes-v3-detail-space-white-2x.png`
		);
		await context.close();
	}
} finally {
	await browser.close();
	await server.stop();
}
