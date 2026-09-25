/**
 * THE PIXEL HALF OF THE SHAPE-LANGUAGE MOCKUP'S MEASUREMENTS (decision 40
 * item 4, ledger 0298). `_`-prefixed, so `routes.mjs` does not load it as a
 * route spec; it is the counterpart of `_shot.mjs`, run by hand:
 *
 *   node tools/browser-verify/_themes-shape-pixels.mjs [--shots <dir>]
 *
 * WHY IT IS NOT A SPEC. Three of the questions the mockup has to answer are
 * about what was PAINTED, and every check in `checks.mjs` reads the DOM:
 *
 *   1. DOES THE FOCUS RING SURVIVE THE CHAMFER? A `clip-path` clips the
 *      element's own outline; `corner-shape` is meant not to. Each control is
 *      focused for real (a key press first, so `:focus-visible` matches), a
 *      screenshot of its neighbourhood is taken focused and unfocused, and the
 *      pixels that changed are counted -- all of them, and those inside the
 *      top-left corner box, which is where a chamfer would lose the ring.
 *   2. IS THE DIAGONAL BORDER STILL A BOUNDARY? A 1px line at 45 degrees is
 *      anti-aliased across two pixels, so its darkest pixel is lighter than a
 *      straight edge's. The darkest pixel on each row of the corner box is
 *      taken as the line, and its ratio against the ground outside the shape
 *      is reported beside the straight top edge's, on a monitor and under
 *      `PROJECTOR_MODEL`.
 *   3. WHAT IS REALLY BEHIND TEXT ON GLASS? `contrast` walks ancestors and
 *      cannot see a `::before` tint or content scrolled underneath. Here the
 *      glass stage is scrolled so a dark island sits under the header, the
 *      class menu is opened over it, each menu label's text is made
 *      transparent, its box is screenshotted, and the label colour is scored
 *      against the DARKEST ground pixel found there. The analytic floor --
 *      the tint composited over pure black -- is reported beside it.
 *
 * And one it can only estimate: the frame cost of the blur, as rAF intervals
 * while the stage scrolls, glass on against glass off (the same page with
 * `prefers-reduced-transparency: reduce` emulated). This Chromium has no GPU,
 * so the number is a software-raster reading and is reported as that.
 *
 * Every figure is printed; nothing here passes or fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openPage, waitForApp, settle, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';
import { PROJECTOR_MODEL, washedRatio } from './checks.mjs';

const shotsIdx = process.argv.indexOf('--shots');
const shotsDir = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const ROUTE = '/dev/themes-shape?state=space-white';

const lum = (c) => {
	const f = (v) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const wcag = (a, b) => {
	const x = lum(a);
	const y = lum(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const rgb = (c) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;

/* A screenshot's pixels, decoded in the page (the page has a canvas; node has
   no PNG decoder in this tree beyond a transitive one). */
async function pixelsOf(page, buf) {
	return page.evaluate(async (b64) => {
		const img = new Image();
		img.src = 'data:image/png;base64,' + b64;
		await img.decode();
		const c = document.createElement('canvas');
		c.width = img.width;
		c.height = img.height;
		const x = c.getContext('2d', { willReadFrequently: true });
		x.drawImage(img, 0, 0);
		return { w: img.width, h: img.height, data: Array.from(x.getImageData(0, 0, img.width, img.height).data) };
	}, buf.toString('base64'));
}
const at = (px, x, y) => {
	const i = (y * px.w + x) * 4;
	return { r: px.data[i], g: px.data[i + 1], b: px.data[i + 2] };
};
const colourOf = (page, css) =>
	page.evaluate((css) => {
		const c = document.createElement('canvas');
		c.width = c.height = 1;
		const x = c.getContext('2d');
		x.fillStyle = '#000';
		x.fillStyle = css;
		x.fillRect(0, 0, 1, 1);
		const d = x.getImageData(0, 0, 1, 1).data;
		return { r: d[0], g: d[1], b: d[2] };
	}, css);

/* The FIRST VISIBLE match, marked so a later step can find the same node:
   below the header's fold breakpoint the tools are folded into the Menu and a
   bare first match would be a zero box. */
const rectOf = (page, sel) =>
	page.evaluate((sel) => {
		const el = [...document.querySelectorAll(sel)].find((n) => {
			const b = n.getBoundingClientRect();
			return b.width > 0 && b.height > 0 && getComputedStyle(n).visibility !== 'hidden';
		});
		if (!el) return null;
		document.querySelectorAll('[data-px-target]').forEach((n) => n.removeAttribute('data-px-target'));
		el.setAttribute('data-px-target', '');
		el.scrollIntoView({ block: 'center', behavior: 'instant' });
		const r = el.getBoundingClientRect();
		return { x: r.left, y: r.top, w: r.width, h: r.height };
	}, sel);

async function focusRing(page, sel) {
	const r = await rectOf(page, sel);
	if (!r) return `${sel}: MISSING`;
	const pad = 8;
	const clip = { x: Math.max(0, Math.floor(r.x - pad)), y: Math.max(0, Math.floor(r.y - pad)), width: Math.ceil(r.w + 2 * pad), height: Math.ceil(r.h + 2 * pad) };
	await page.evaluate(() => document.activeElement?.blur());
	const off = await pixelsOf(page, await page.screenshot({ clip }));
	await page.keyboard.press('Shift');
	const visible = await page.evaluate(() => {
		const el = document.querySelector('[data-px-target]');
		el.focus();
		return el.matches(':focus-visible');
	});
	const on = await pixelsOf(page, await page.screenshot({ clip }));
	await page.evaluate(() => document.activeElement?.blur());
	let changed = 0;
	let corner = 0;
	/* The corner box: the element's top-left 12x12 plus the ring's own reach
	   outside it (outline 2px at a 2px offset is 4px), in clip coordinates. */
	const cx0 = pad - 4;
	const cy0 = pad - 4;
	for (let y = 0; y < on.h; y++)
		for (let x = 0; x < on.w; x++) {
			const a = at(on, x, y);
			const b = at(off, x, y);
			if (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 24) {
				changed++;
				if (x >= cx0 && x < cx0 + 16 && y >= cy0 && y < cy0 + 16) corner++;
			}
		}
	/* The ideal ring: 2px wide around a box grown by the 2px offset. */
	const ideal = Math.round(2 * (2 * (r.w + 4) + 2 * (r.h + 4)));
	return `${sel}: :focus-visible=${visible}, ${changed} px changed of ~${ideal} for a full 2px ring (${f2((100 * changed) / ideal)}%), ${corner} of them in the top-left corner box`;
}

/* The line along the top-left cut, against the straight top edge. The ground
   OUTSIDE the shape is read from the pixel diagonally beyond the corner. */
async function diagonal(page, sel, cut) {
	const r = await rectOf(page, sel);
	if (!r) return `${sel}: MISSING`;
	const pad = 6;
	const clip = { x: Math.floor(r.x - pad), y: Math.floor(r.y - pad), width: Math.ceil(r.w + 2 * pad), height: Math.ceil(r.h + 2 * pad) };
	await page.evaluate(() => document.activeElement?.blur());
	const px = await pixelsOf(page, await page.screenshot({ clip }));
	const ground = at(px, 1, 1);
	const x0 = Math.round(r.x - clip.x);
	const y0 = Math.round(r.y - clip.y);
	/* Straight edge: the darkest pixel within 2px of the top edge, mid-width. */
	let edge = null;
	const mx = x0 + Math.round(r.w / 2);
	for (let dy = -1; dy <= 2; dy++) {
		const p = at(px, mx, y0 + dy);
		if (!edge || lum(p) < lum(edge)) edge = p;
	}
	/* Diagonal: for each row inside the cut, the darkest pixel in that row
	   between the left edge and the cut's reach. */
	const rows = [];
	for (let dy = 1; dy < cut - 1; dy++) {
		let best = null;
		for (let dx = 0; dx <= cut + 1; dx++) {
			const p = at(px, x0 + dx, y0 + dy);
			if (!best || lum(p) < lum(best)) best = p;
		}
		rows.push(best);
	}
	const ratios = rows.map((p) => wcag(p, ground)).sort((a, b) => a - b);
	const washed = rows.map((p) => washedRatio(p, ground)).sort((a, b) => a - b);
	const med = (a) => a[Math.floor(a.length / 2)];
	return (
		`${sel}: ground ${rgb(ground)}; straight edge ${rgb(edge)} ${f2(wcag(edge, ground))}:1 (washed ${f2(washedRatio(edge, ground))}); ` +
		`diagonal over ${rows.length} rows: worst ${f2(ratios[0])}:1, median ${f2(med(ratios))}:1 (washed worst ${f2(washed[0])}, median ${f2(med(washed))})`
	);
}

/* DOES A CHIP'S OWN EDGE CROSS ITS LETTERS? Three screenshots of one chip --
   text only, edge only, neither -- and the pixels that differ from the empty
   ground in the first two are the glyphs and the edge. Reported: how many
   pixels are both (an edge drawn through a letter), and the smallest gap
   between the two sets. Found necessary on the first render of this page,
   where a two-corner cut on a pill made a slant that ran through "Draft". */
async function chipClearance(page, sel, extra = '') {
	const r = await rectOf(page, sel);
	if (!r) return `${sel}: MISSING`;
	const clip = { x: Math.floor(r.x - 2), y: Math.floor(r.y - 2), width: Math.ceil(r.w + 4), height: Math.ceil(r.h + 4) };
	const shot = async (css) => {
		await page.evaluate((css) => {
			const el = document.querySelector('[data-px-target]');
			el.style.cssText = css;
		}, extra + css);
		const px = await pixelsOf(page, await page.screenshot({ clip }));
		await page.evaluate(() => (document.querySelector('[data-px-target]').style.cssText = ''));
		return px;
	};
	const ground = await shot('color: transparent !important; border-color: transparent !important;');
	const glyphs = await shot('border-color: transparent !important;');
	const edge = await shot('color: transparent !important;');
	const differs = (a, b, x, y) => {
		const p = at(a, x, y);
		const q = at(b, x, y);
		return Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b) > 24;
	};
	const G = [];
	const E = [];
	let both = 0;
	for (let y = 0; y < ground.h; y++)
		for (let x = 0; x < ground.w; x++) {
			const g = differs(glyphs, ground, x, y);
			const e = differs(edge, ground, x, y);
			if (g) G.push([x, y]);
			if (e) E.push([x, y]);
			if (g && e) both++;
		}
	let gap = Infinity;
	for (const [gx, gy] of G) for (const [ex, ey] of E) gap = Math.min(gap, Math.max(Math.abs(gx - ex), Math.abs(gy - ey)));
	return `${sel}${extra ? ' [' + extra.trim() + ']' : ''}: ${G.length} glyph px, ${E.length} edge px, ${both} px where the edge crosses a letter, nearest letter-to-edge gap ${gap === Infinity ? 'n/a' : gap + 'px'}`;
}

async function glassText(page, width) {
	const out = [];
	/* Scroll the stage so the dark island's top meets the header's top, then
	   open the class menu over it. */
	const opened = await page.evaluate(() => {
		const stage = document.querySelector('[data-testid="glass-stage"]');
		const dark = stage.querySelector('[data-ts="under-dark"]');
		stage.scrollIntoView({ block: 'start', behavior: 'instant' });
		stage.scrollTop = dark.offsetTop + 16;
		return stage.scrollTop;
	});
	out.push(`stage scrollTop ${opened}px (the header sits wholly over the dark island)`);
	const trigger = width < 1366 ? '[data-col="glass"] [data-testid="shell-menu"]' : '[data-col="glass"] [data-testid="section-switcher"]';
	await page.click(trigger);
	await waitUntil(page, `() => !!document.querySelector('[data-col="glass"] [data-testid="section-switcher-menu"]')`, { timeoutMs: 5000 });
	await settle(page);
	const filter = await page.evaluate(() => {
		const m = document.querySelector('[data-col="glass"] [data-testid="section-switcher-menu"]');
		const h = document.querySelector('[data-col="glass"] .cr-header');
		return `menu backdrop-filter: ${getComputedStyle(m).backdropFilter}; header::before backdrop-filter: ${getComputedStyle(h, '::before').backdropFilter}; menu background: ${getComputedStyle(m).backgroundColor}`;
	});
	out.push(filter);
	if (shotsDir) {
		const stage = await rectOf(page, '[data-testid="glass-stage"]');
		const buf = await page.screenshot({ clip: { x: Math.max(0, stage.x), y: Math.max(0, stage.y), width: Math.min(stage.w, width), height: stage.h } });
		writeFileSync(`${shotsDir}/glass-${width}.png`, buf);
	}
	const labels = await page.evaluate(() =>
		[...document.querySelectorAll('[data-col="glass"] [data-testid="section-switcher-menu"] :is(.sw-item-code, .sw-item-name)')].map((el, i) => {
			el.setAttribute('data-glass-i', String(i));
			return { i, color: getComputedStyle(el).color, text: el.textContent.trim() };
		})
	);
	let worst = null;
	let measured = 0;
	for (const l of labels) {
		const sel = `[data-glass-i="${l.i}"]`;
		/* Only a label wholly inside the stage's visible box: the panel is
		   taller than the stage at phone width, and a label scrolled out of it
		   would be screenshotted over whatever the page has there instead. */
		const r = await page.evaluate((sel) => {
			const el = document.querySelector(sel);
			const b = el.getBoundingClientRect();
			const st = document.querySelector('[data-testid="glass-stage"]').getBoundingClientRect();
			const inside = b.width > 0 && b.height > 0 && b.top >= st.top && b.bottom <= st.bottom && b.left >= st.left && b.right <= st.right;
			return { x: b.left, y: b.top, w: b.width, h: b.height, inside };
		}, sel);
		if (!r.inside) continue;
		measured++;
		await page.evaluate((sel) => document.querySelector(sel).style.setProperty('color', 'transparent', 'important'), sel);
		const px = await pixelsOf(page, await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } }));
		await page.evaluate((sel) => document.querySelector(sel).style.removeProperty('color'), sel);
		let dark = null;
		for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) { const p = at(px, x, y); if (!dark || lum(p) < lum(dark)) dark = p; }
		const ink = await colourOf(page, l.color);
		const w = wcag(ink, dark);
		const wa = washedRatio(ink, dark);
		if (!worst || w < worst.w) worst = { w, wa, label: l.text, ground: dark, ink };
	}
	out.push(
		worst
			? `menu labels on glass (${measured} of ${labels.length} labels inside the stage): worst "${worst.label}" ${rgb(worst.ink)} on darkest ground pixel ${rgb(worst.ground)} = ${f2(worst.w)}:1, washed ${f2(worst.wa)}`
			: 'menu labels: NONE MEASURED'
	);
	/* The analytic floor: the tint composited over pure black and over the
	   island's own ground, scored against --text-1. */
	const floor = await page.evaluate(() => {
		const glass = getComputedStyle(document.querySelector('[data-col="glass"]')).getPropertyValue('--surface-glass').trim();
		const island = getComputedStyle(document.querySelector('[data-ts="under-dark"]')).backgroundColor;
		const text1 = getComputedStyle(document.documentElement).getPropertyValue('--text-1').trim();
		const c = document.createElement('canvas');
		c.width = c.height = 1;
		const x = c.getContext('2d', { willReadFrequently: true });
		const over = (under) => {
			x.globalCompositeOperation = 'source-over';
			x.fillStyle = under;
			x.fillRect(0, 0, 1, 1);
			x.fillStyle = glass;
			x.fillRect(0, 0, 1, 1);
			return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3));
		};
		x.fillStyle = text1;
		x.fillRect(0, 0, 1, 1);
		const t = Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3));
		return { glass, island, black: over('#000'), onIsland: over(island), text1: t };
	});
	const t1 = { r: floor.text1[0], g: floor.text1[1], b: floor.text1[2] };
	const blk = { r: floor.black[0], g: floor.black[1], b: floor.black[2] };
	const isl = { r: floor.onIsland[0], g: floor.onIsland[1], b: floor.onIsland[2] };
	out.push(
		`analytic floor: --surface-glass (${floor.glass}) over pure black = ${rgb(blk)}, --text-1 on it ${f2(wcag(t1, blk))}:1 (washed ${f2(washedRatio(t1, blk))}); over the island ground ${floor.island} = ${rgb(isl)}, ${f2(wcag(t1, isl))}:1 (washed ${f2(washedRatio(t1, isl))})`
	);
	return out;
}

/* THE BLUR'S COST. rAF intervals alone cannot see it -- raster and the
   compositor's draw run off the main thread, and a headless compositor
   presents at a fixed cadence -- so the scroll is also TRACED, and the
   compositor's own draw events are summed. Both are reported; neither is a
   school desktop, and the note says so. */
const TRACE_CATEGORIES = ['viz', 'cc', 'gpu', 'benchmark', 'disabled-by-default-devtools.timeline'];
async function frameCost(browser, page, cdp, reduce) {
	await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: reduce ? 'reduce' : 'no-preference' }] });
	await settle(page);
	let traced = true;
	try {
		await browser.startTracing(page, { categories: TRACE_CATEGORIES });
	} catch (e) {
		traced = `tracing unavailable: ${e.message}`;
	}
	const raf = await page.evaluate(
		() =>
			new Promise((resolve) => {
				const stage = document.querySelector('[data-testid="glass-stage"]');
				const filt = getComputedStyle(document.querySelector('[data-col="glass"] .cr-header'), '::before').backdropFilter;
				const max = stage.scrollHeight - stage.clientHeight;
				const times = [];
				let last = performance.now();
				let n = 0;
				const step = (t) => {
					times.push(t - last);
					last = t;
					stage.scrollTop = (n * 7) % Math.max(1, max);
					n++;
					if (n < 180) requestAnimationFrame(step);
					else {
						const s = times.slice(5).sort((a, b) => a - b);
						const mean = s.reduce((a, b) => a + b, 0) / s.length;
						resolve({ filt, frames: s.length, mean, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] });
					}
				};
				requestAnimationFrame(step);
			})
	);
	const byName = new Map();
	if (traced === true) {
		const buf = await browser.stopTracing();
		const trace = JSON.parse(buf.toString());
		for (const e of trace.traceEvents ?? trace) {
			if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
			const k = byName.get(e.name) ?? { n: 0, us: 0 };
			k.n++;
			k.us += e.dur;
			byName.set(e.name, k);
		}
	}
	return { raf, traced, byName };
}

const server = await startDevServer({ cwd: process.cwd() });
const { browser, executablePath } = await launch();
console.log(`chromium: ${executablePath}`);
console.log(`projector model: ${JSON.stringify(PROJECTOR_MODEL)}`);
try {
	for (const width of [1440, 375]) {
		const { context, page } = await openPage(browser, { width, height: width < 500 ? 780 : 900 });
		await page.goto(`${server.origin}${ROUTE}`, { waitUntil: 'domcontentloaded' });
		await waitForApp(page);
		const ok = await waitUntil(page, `() => document.documentElement.getAttribute('data-theme') === 'space-white' && document.querySelectorAll('.cr-header').length === 3`, { timeoutMs: 30_000 });
		console.log(`\n=== ${width}px: theme ${ok.ok ? 'space-white, 3 headers' : 'DID NOT REACH SPACE WHITE'} ===`);
		await settle(page);
		/* THE ROOT LAYOUT'S FLOATING REPORT AND VOICE PILLS ARE HIDDEN FOR THE
		   WHOLE RUN. They are not part of the proposal (the header's own docked
		   pair is left alone), and a fixed pill over a measured control would
		   hide ring pixels from the focus diff. */
		await page.addStyleTag({ content: '.sfb:not(.sfb-relocated), .vnav:not(.vnav-header) { visibility: hidden !important; }' });
		if (shotsDir) {
			writeFileSync(`${shotsDir}/page-${width}.png`, await page.screenshot({ fullPage: true }));
			if (width === 1440) {
				await page.click('[data-cut-set="four"]');
				await settle(page);
				const h = await page.evaluate(() => Math.ceil(document.getElementById('ts-h-glass').getBoundingClientRect().top + window.scrollY - 8));
				writeFileSync(`${shotsDir}/page-${width}-four.png`, await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width, height: h } }));
				await page.click('[data-cut-set="two"]');
				await settle(page);
			}
		}
		/* Measure the real `:focus-visible` ring, so the held demo ring on the
		   two construction specimens comes off first. */
		await page.evaluate(() => document.querySelectorAll('.ts-demo-focus').forEach((el) => el.classList.remove('ts-demo-focus')));
		console.log('-- focus ring (real :focus-visible, 2px --cyan at 2px offset) --');
		for (const sel of [
			'[data-col="before"] [data-ts="btn-primary"]',
			'[data-col="after"] [data-ts="btn-primary"]',
			'[data-col="after"] [data-ts="btn-secondary"]',
			'[data-col="after"] .cr-header :is(.shell-tool, .menu-trigger)',
			'[data-ts="build-bevel"]',
			'[data-ts="build-clip"]'
		])
			console.log('  ' + (await focusRing(page, sel)));
		console.log('-- boundary along the cut against the straight edge --');
		for (const [sel, cut] of [
			['[data-col="before"] [data-ts="card"]', 12],
			['[data-col="after"] [data-ts="card"]', 12],
			['[data-col="after"] [data-ts="btn-secondary"]', 8],
			['[data-col="after"] [data-ts="btn-primary"]', 8],
			['[data-col="after"] .cr-header :is(.shell-tool, .menu-trigger)', 8],
			['[data-ts="build-clip"]', 8]
		])
			console.log('  ' + (await diagonal(page, sel, cut)));
		console.log('-- chip letters against the chip edge --');
		for (const sel of [
			'[data-col="before"] [data-ts="chip-status"]',
			'[data-col="after"] [data-ts="chip-status"]',
			'[data-col="before"] [data-ts="chip-kind"]',
			'[data-col="after"] [data-ts="chip-kind"]'
		])
			console.log('  ' + (await chipClearance(page, sel)));
		/* THE POSITIVE CONTROL: the construction this page first shipped with
		   and rejected -- the two-corner cut on a pill at today's padding --
		   which must come back with a crossing, or a zero above says nothing. */
		console.log(
			'  control: ' +
				(await chipClearance(page, '[data-col="after"] [data-ts="chip-status"]', 'corner-shape: bevel square !important; padding-inline: 0.45rem !important; '))
		);
		console.log('-- glass --');
		for (const line of await glassText(page, width)) console.log('  ' + line);
		if (width === 1440) {
			const cdp = await context.newCDPSession(page);
			const on = await frameCost(browser, page, cdp, false);
			const off = await frameCost(browser, page, cdp, true);
			await cdp.send('Emulation.setEmulatedMedia', { features: [] });
			console.log('-- the blur while the glass stage scrolls under an open class menu (software compositing, no GPU) --');
			for (const [tag, r] of [['glass on ', on], ['glass off', off]])
				console.log(`  ${tag} (${r.raf.filt}): rAF ${r.raf.frames} frames, mean ${f2(r.raf.mean)}ms, p95 ${f2(r.raf.p95)}ms, max ${f2(r.raf.max)}ms${r.traced === true ? '' : '; ' + r.traced}`);
			/* The trace events whose total moved most between the two runs. */
			const names = new Set([...on.byName.keys(), ...off.byName.keys()]);
			const rows = [...names]
				.map((n) => ({ n, on: on.byName.get(n) ?? { n: 0, us: 0 }, off: off.byName.get(n) ?? { n: 0, us: 0 } }))
				.sort((a, b) => Math.abs(b.on.us - b.off.us) - Math.abs(a.on.us - a.off.us))
				.slice(0, 10);
			for (const r of rows)
				console.log(`  trace ${r.n}: on ${f2(r.on.us / 1000)}ms over ${r.on.n}, off ${f2(r.off.us / 1000)}ms over ${r.off.n}`);
		}
		await page.keyboard.press('Escape');
		await context.close();
	}
} finally {
	await browser.close();
	await server.stop();
}
