/**
 * A LIVE THUMBNAIL UNDER REDUCED MOTION SHOWS A STILL FRAME OF ITSELF, AT THE
 * CURRENT SIZE AND THEME (ledger 0396, report a6a037f3, review round 1). The
 * shim in `$lib/classroom/html-assignment/thumbnail.ts` holds a thumbnail's
 * `requestAnimationFrame` callbacks under reduced motion, and lets them run for
 * `HX_THUMB_STILL_FRAMES` display frames after it loads and after every change
 * a still frame has to show. Held for good after the first two frames instead,
 * a canvas that sized itself to the slot after drawing was left blank, and a
 * theme or shape change could never repaint it.
 *
 * IT IS `_`-PREFIXED, so `routes.mjs` does not pick it up as a route spec: a
 * route spec runs with `prefers-reduced-motion: no-preference`, and this
 * question is about the other state.
 *
 *   node tools/browser-verify/_post-thumbnails-still.mjs [--port 5306] [--expect still]
 *
 * WHAT IT READS, from inside the sandboxed canvas frame (`thumb-canvas`, the
 * harness's requestAnimationFrame fixture), on `/dev/post-thumbnails`:
 *   1  every shape (Tile, Wide, Banner) at 1440 and 375, in IDEA and Space
 *      White: the share of the canvas a spoke covers (anything that is neither
 *      background), its pixel size against the frame's own, and whether two
 *      reads 1.2s apart differ (they must not: still);
 *   2  a theme change under reduced motion (IDEA to Space White on `<html>`):
 *      the canvas background flips from dark to light;
 *   3  a resize under reduced motion (the tile slots grown to 96px by a
 *      stylesheet): the canvas is 96 wide and still has its spokes;
 *   4  the positive control, `no-preference`: two reads 1.2s apart DO differ,
 *      so "still" above is a measurement and not a canvas that never drew.
 *
 * `--expect still` exits 1 on any row that is not as expected, which is how the
 * old gating put back is shown to redden it. Run it alone: it starts its own
 * dev server and refuses a port another checkout is already serving.
 */
import { launch } from './browser.mjs';
import { startDevServer } from './server.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const port = Number(flag('--port', '5306'));
const expect = flag('--expect', '');

const server = await startDevServer({ port, cwd: process.cwd() });
if (server.alreadyRunning) {
	console.error(`port ${port} already has a server, which may be another checkout's: refusing to measure it`);
	process.exit(2);
}
const { browser } = await launch();

const SLOT = '[data-item-id="as-spokes"] [data-testid="post-thumb"]';

/** What the canvas holds, read inside the frame: spoke coverage, its size, the background's lightness. */
async function readCanvas(page) {
	const frame = page.frames().find((f) => /\/hx\/thumb-canvas\/thumbnail/.test(f.url()));
	if (!frame) return null;
	return frame.evaluate(() => {
		const c = document.getElementById('tc');
		const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
		let spoke = 0;
		let corner = null;
		for (let i = 0; i < d.length; i += 4) {
			const r = d[i];
			const g = d[i + 1];
			const b = d[i + 2];
			const a = d[i + 3];
			if (i === 0) corner = a === 0 ? 'transparent' : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? 'light' : 'dark';
			const dark = Math.abs(r - 14) + Math.abs(g - 23) + Math.abs(b - 38) < 30;
			const light = Math.abs(r - 238) + Math.abs(g - 243) + Math.abs(b - 251) < 30;
			if (a > 0 && !dark && !light) spoke++;
		}
		/* A cheap digest of every byte, so two reads tell a still canvas from a moving one. */
		let sum = 0;
		for (let i = 0; i < d.length; i++) sum = (sum * 31 + d[i]) >>> 0;
		return { w: c.width, h: c.height, frameW: innerWidth, spokes: Math.round((1000 * spoke) / (d.length / 4)) / 10, ground: corner, digest: sum };
	});
}

async function openSlot(width, motion, query) {
	const mobile = width <= 400;
	const ctx = await browser.newContext({
		viewport: { width, height: mobile ? 800 : 1000 },
		deviceScaleFactor: 1,
		isMobile: mobile,
		hasTouch: mobile,
		reducedMotion: motion
	});
	const page = await ctx.newPage();
	await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
	await page.goto(`${server.origin}/dev/post-thumbnails?${query}`, { waitUntil: 'load' });
	await page.waitForFunction(() => document.documentElement.getAttribute('data-thumb-hydrated') === 'true', null, { timeout: 60000 });
	await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center', behavior: 'instant' }), SLOT);
	await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-ready') === 'true', SLOT, { timeout: 30000 });
	await page.waitForTimeout(1500);
	return { ctx, page };
}

/* Read off the canvas's own bytes, never a screenshot: two screenshots of an
   unchanged sandboxed frame were measured to differ here (no draw, no message,
   different bytes), so a screenshot cannot tell still from moving. */
async function moving(page) {
	const a = await readCanvas(page);
	await page.waitForTimeout(1200);
	const b = await readCanvas(page);
	return !a || !b || a.digest !== b.digest;
}

const rows = [];
const row = (label, ok, facts) => {
	rows.push({ label, ok });
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(facts)}`);
};

try {
	// 1. Every shape, two widths, two themes, under reduced motion.
	for (const width of [1440, 375]) {
		for (const shape of ['tile', 'wide', 'banner']) {
			for (const theme of ['idea', 'space-white']) {
				const { ctx, page } = await openSlot(width, 'reduce', `mine=${shape}${theme === 'idea' ? '' : '&theme=' + theme}`);
				const c = await readCanvas(page);
				const m = await moving(page);
				const want = theme === 'space-white' ? 'light' : 'dark';
				row(`reduce ${theme} ${shape} ${width}`, !!c && c.spokes >= 2 && c.w === c.frameW && c.ground === want && !m, { ...c, moving: m });
				await ctx.close();
			}
		}
	}

	// 2. A theme change under reduced motion repaints the still frame.
	{
		const { ctx, page } = await openSlot(1440, 'reduce', 'mine=wide');
		const before = await readCanvas(page);
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'space-white'));
		await page.waitForTimeout(800);
		const after = await readCanvas(page);
		row('reduce theme change repaints', before?.ground === 'dark' && after?.ground === 'light' && after.spokes >= 2, { before, after });
		await ctx.close();
	}

	// 3. A resize under reduced motion redraws at the new size.
	{
		const { ctx, page } = await openSlot(1440, 'reduce', 'mine=tile');
		const before = await readCanvas(page);
		await page.evaluate(() => {
			const st = document.createElement('style');
			st.textContent = '.stream .row-wrap { --thumb-tile: 96px !important; }';
			document.head.append(st);
		});
		await page.waitForTimeout(800);
		const after = await readCanvas(page);
		row('reduce resize redraws', before?.w === 48 && after?.w === 96 && after.spokes >= 2, { before, after });
		await ctx.close();
	}

	// 4. Positive control: with no preference the same slot moves.
	for (const shape of ['tile', 'wide']) {
		const { ctx, page } = await openSlot(1440, 'no-preference', `mine=${shape}`);
		const c = await readCanvas(page);
		const m = await moving(page);
		row(`no-preference ${shape} 1440 moves (control)`, !!c && c.spokes >= 2 && m, { ...c, moving: m });
		await ctx.close();
	}
} finally {
	await browser.close();
	await server.stop();
}

const failed = rows.filter((r) => !r.ok).length;
console.log(`${rows.length - failed} of ${rows.length} as expected`);
if (expect === 'still' && failed) process.exit(1);
