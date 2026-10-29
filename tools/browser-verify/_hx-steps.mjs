/**
 * ONE HEADER AND ONE RAIL, MEASURED IN A REAL CHROMIUM (ledger 0458, report
 * 4930ba0e), on `/dev/html-assignment-live?doc=kit-starter`: the kit's own
 * starter built on the kit in this tree, framed by the real frame under the
 * real rail.
 *
 *   node tools/browser-verify/_hx-steps.mjs http://127.0.0.1:5458
 *
 * At 375 and 1440 it counts, in the page: the rail's steps panel, its step
 * keys and their size, the post title, horizontal scroll; and in the
 * document: whether its own step track, "You are here" line and title are
 * shown. Then it presses the rail's first step key and reads which step the
 * document shows. The control run is `host=0&title=0`, where the page asks
 * nothing of the document: the document keeps its track and title, and the
 * rail draws no steps. Exits 1 on any row that reads otherwise.
 *
 * `_`-PREFIXED, so `routes.mjs` does not load it as a route spec. It needs a
 * dev server already running at the address given.
 */
import { launch, openPage } from './browser.mjs';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
const { browser } = await launch();
let bad = 0;
const row = (ok, label, detail) => {
	if (!ok) bad += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  :: ${detail}`);
};

async function measure(width, query) {
	const { page } = await openPage(browser, { width, height: 900 });
	await page.goto(`${BASE}/dev/html-assignment-live?doc=kit-starter&spacer=0${query}`, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__hxLive?.ready === true, null, { timeout: 45_000 });
	await page.waitForTimeout(1500);
	const frame = page.frames().find((f) => /\/hx\/kit-starter/.test(f.url()));
	const inDoc = async () =>
		frame.evaluate(() => {
			const shown = (sel) => {
				const el = document.querySelector(sel);
				return !!el && getComputedStyle(el).display !== 'none';
			};
			return {
				track: shown('#hx-track'),
				where: shown('#hx-bar .hx-where'),
				title: shown('.hx-hero h1'),
				step: [...document.querySelectorAll('.hx-step')].findIndex((s) => !s.hidden)
			};
		});
	const top = await page.evaluate(() => {
		const keys = [...document.querySelectorAll('[data-testid="hxp-step"]')].map((k) => k.getBoundingClientRect());
		return {
			panel: document.querySelectorAll('[data-testid="hxp-steps"]').length,
			keys: keys.length,
			smallest: keys.length ? Math.min(...keys.map((r) => Math.min(r.width, r.height))) : 0,
			line: document.querySelector('[data-testid="hxp-steps-line"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
			titles: document.querySelectorAll('[data-testid="live-post-title"]').length,
			scroll: document.documentElement.scrollWidth - innerWidth
		};
	});
	const before = await inDoc();
	let after = null;
	if (top.keys) {
		await page.click('[data-testid="hxp-step"] >> nth=0');
		await page.waitForTimeout(500);
		after = await inDoc();
	}
	await page.context().close();
	return { top, before, after };
}

for (const width of [375, 1440]) {
	const on = await measure(width, '');
	row(on.top.panel === 1 && on.top.keys === 5, `${width}: the rail draws the document's steps`, `${on.top.panel} panel, ${on.top.keys} step keys, "${on.top.line}"`);
	row(on.top.smallest >= 44, `${width}: every step key is a 44px target`, `smallest ${on.top.smallest.toFixed(1)}px`);
	row(!on.before.track && !on.before.where, `${width}: the document hides its own step track`, `track ${on.before.track ? 'shown' : 'hidden'}, "You are here" ${on.before.where ? 'shown' : 'hidden'}`);
	row(on.top.titles === 1 && !on.before.title, `${width}: one title, the page's`, `${on.top.titles} page title, document title ${on.before.title ? 'shown' : 'hidden'}`);
	row(on.after?.step === 0, `${width}: a step key shows that step`, `step ${on.before.step + 1} before, ${on.after ? on.after.step + 1 : 'none'} after pressing step 1`);
	row(on.top.scroll <= 0, `${width}: no sideways scroll`, `${on.top.scroll}px over`);

	const off = await measure(width, '&host=0&title=0');
	row(off.top.panel === 0 && off.before.track && off.before.title, `${width} control: asked nothing, the document keeps its track and title`, `${off.top.panel} rail panels, track ${off.before.track ? 'shown' : 'hidden'}, title ${off.before.title ? 'shown' : 'hidden'}`);
}

await browser.close();
console.log(bad ? `${bad} FAIL` : '0 FAIL');
process.exit(bad ? 1 : 0);
