/**
 * IDEA ARMORY v2 (ledger 0366): SCREENSHOT EVERY STATE at 1440 and 375, in the
 * IDEA theme and in Space White, into docs/armory/screens/v2/, and HIT-TEST the
 * open profile dropdown over the Armory page. `_`-prefixed, so routes.mjs does
 * not take it for a route spec.
 *
 *   node tools/browser-verify/_armory-v2-shots.mjs [outdir]
 *   node tools/browser-verify/_armory-v2-shots.mjs --dropdown-only
 *
 * THE HIT TEST is the measurement for Mr. Pina's "things on the Armory page
 * overlap the profile dropdown": with the header's menu open over a full
 * project page, every control in the panel whose centre is on screen is asked
 * `elementFromPoint` at its centre, and the answer must be inside the panel.
 * It runs twice: as shipped, and with `.ar-header` taken off the header (the
 * pre-fix stacking, `main` and the header tied at z-index 1) as the NEGATIVE
 * CONTROL, which must fail, or the instrument proves nothing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openPage, waitForApp, settle, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';

const args = process.argv.slice(2);
const dropdownOnly = args.includes('--dropdown-only');
const outDir = args.find((a) => !a.startsWith('--')) ?? 'docs/armory/screens/v2';
const STATES = [
	'start', 'start-connected', 'start-mentor', 'start-flash',
	'projects', 'projects-connected', 'projects-empty',
	'empty', 'editing', 'synced', 'offline', 'side', 'storage-off',
	'filter-out', 'filter-mine', 'search', 'archived', 'no-computer',
	'devices', 'how', 'file-side', 'file-no-storage',
	'connect', 'connect-bad', 'download', 'download-none'
];
/** States that need a press before the picture: the armed Take back and the armed Archive. */
const ACTIONS = {
	'editing-take-back': { state: 'editing', click: '[data-testid="armory-checkouts"] [data-testid="armory-take-back"]' },
	'editing-archive': { state: 'editing', click: '[data-testid="armory-archive"]' }
};
const WIDTHS = [1440, 375];
const THEMES = ['idea', 'space-white'];

const pin = (theme) =>
	`(() => { const t = ${JSON.stringify(theme)}; const apply = () => { const h = document.documentElement; if (!h) return; if (t === 'idea') { if (h.hasAttribute('data-theme')) h.removeAttribute('data-theme'); } else if (h.getAttribute('data-theme') !== t) h.setAttribute('data-theme', t); }; const iv = setInterval(apply, 40); setTimeout(() => clearInterval(iv), 60000); apply(); })()`;

async function open(browser, server, width, theme, query) {
	const { context, page } = await openPage(browser, { width, height: width < 500 ? 780 : 900 });
	await context.addInitScript(pin(theme));
	await page.goto(`${server.origin}/dev/armory?${query}`, { waitUntil: 'domcontentloaded' });
	await waitForApp(page);
	await waitUntil(page, '() => !!document.querySelector("[data-armory-hydrated]")', { timeoutMs: 30_000 });
	await settle(page);
	return { context, page };
}

const HIT_TEST = `(() => {
	const panel = document.querySelector('.pm-panel');
	if (!panel) return { open: false };
	const items = [...panel.querySelectorAll('a, button, input, select, textarea, [role="button"]')];
	let onScreen = 0, inside = 0;
	const misses = [];
	for (const el of items) {
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) continue;
		const x = r.left + r.width / 2, y = r.top + r.height / 2;
		if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
		onScreen++;
		const hit = document.elementFromPoint(x, y);
		if (hit && panel.contains(hit)) inside++;
		else misses.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30) + ' -> ' + (hit ? hit.tagName.toLowerCase() + '.' + [...hit.classList].join('.') : 'nothing'));
	}
	return { open: true, items: items.length, onScreen, inside, misses: misses.slice(0, 6) };
})()`;

async function dropdown(browser, server, width, theme, control) {
	const { context, page } = await open(browser, server, width, theme, 'state=editing&signed=1');
	try {
		if (control) await page.evaluate(`document.querySelector('.ar-header')?.classList.remove('ar-header')`);
		await page.click('.pm-trigger');
		await waitUntil(page, '() => !!document.querySelector(".pm-panel")', { timeoutMs: 10_000 });
		await settle(page, { settleMs: 400 });
		const result = await page.evaluate(HIT_TEST);
		if (!control) {
			const w = width === 1440 ? '' : `-${width}`;
			writeFileSync(`${outDir}/dropdown-${theme}${w}.png`, await page.screenshot({ fullPage: false }));
		}
		return result;
	} finally {
		await context.close().catch(() => {});
	}
}

mkdirSync(outDir, { recursive: true });
const server = await startDevServer({ cwd: process.cwd() });
const { browser } = await launch();
try {
	for (const width of WIDTHS) {
		for (const theme of THEMES) {
			const shipped = await dropdown(browser, server, width, theme, false);
			const control = await dropdown(browser, server, width, theme, true);
			console.log(`DROPDOWN ${width} ${theme} shipped ${JSON.stringify(shipped)}`);
			console.log(`DROPDOWN ${width} ${theme} control(no .ar-header) ${JSON.stringify(control)}`);
		}
	}
	if (!dropdownOnly) {
		for (const width of WIDTHS) {
			for (const theme of THEMES) {
				const jobs = [...STATES.map((s) => [s, { state: s }]), ...Object.entries(ACTIONS)];
				for (const [name, job] of jobs) {
					const { context, page } = await open(browser, server, width, theme, `state=${job.state}`);
					try {
						if (job.click) {
							await page.click(job.click);
							await settle(page, { settleMs: 300 });
						}
						const seen = await page.evaluate(`(() => ({
							h1: document.querySelector('h1')?.textContent?.trim(),
							rows: document.querySelectorAll('[data-testid="armory-file-row"]').length,
							scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth
						}))()`);
						const w = width === 1440 ? '' : `-${width}`;
						const file = `${outDir}/${name}-${theme}${w}.png`;
						writeFileSync(file, await page.screenshot({ fullPage: true }));
						console.log(`${file}  ${JSON.stringify(seen)}`);
					} catch (e) {
						console.log(`FAILED ${name} ${theme} ${width}: ${e.message.split('\n')[0]}`);
					} finally {
						await context.close().catch(() => {});
					}
				}
			}
		}
	}
} finally {
	await browser.close();
	await server.stop();
}
