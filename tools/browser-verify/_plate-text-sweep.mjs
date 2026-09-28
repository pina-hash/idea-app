/**
 * EVERY WORD ON A PAGE, AGAINST THE GROUND IT ACTUALLY SITS ON (ledger 0346).
 * `_`-prefixed, so `routes.mjs` does not load it as a route spec. It starts a
 * dev server or reuses one on the harness port.
 *
 *   node tools/browser-verify/_plate-text-sweep.mjs <list.json> [--themes idea,matrix,space-white] [--widths 1440,375] [--show 6]
 *
 * `<list.json>` is an array of `/dev` paths (or `{ "path": ... }`). For each
 * path, theme and width it reads every VISIBLE element that directly holds
 * text, takes its ground with the harness's own `groundOf` (the same walk the
 * `contrast` check uses, so a plate face's stated `background-color` is the
 * ground), and scores it at the WCAG floor for its size: 3:1 for large text
 * (24px, or 18.66px at 700), 4.5:1 otherwise. It also scores the same pair
 * under the projector model (PROJECTOR_MODEL in ./checks.mjs) against 3:1.
 *
 * It PRINTS; nothing here passes or fails. The worst `--show` failures per
 * page are listed with their path, so a finding can be located. Text inside
 * a disabled control is reported separately (WCAG exempts it) and is not
 * counted as a failure.
 *
 * THE THEME IS PINNED exactly as `_classroom-plate-boxes.mjs` pins it.
 */
import { readFileSync } from 'node:fs';
import { launch, openPage, waitForApp, settle, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';
import { ensureHelpers, washedRatio } from './checks.mjs';

const [, , listFile, ...flags] = process.argv;
const flag = (name, d) => {
	const i = flags.indexOf(name);
	return i >= 0 ? flags[i + 1] : d;
};
const themes = flag('--themes', 'idea,matrix,space-white').split(',');
const widths = flag('--widths', '1440,375').split(',').map(Number);
const show = Number(flag('--show', '6'));
const list = JSON.parse(readFileSync(listFile, 'utf8')).map((x) => (typeof x === 'string' ? { path: x } : x));

const pin = (theme) =>
	`(() => { const t = ${JSON.stringify(theme)}; const apply = () => { const h = document.documentElement; if (!h) return; if (t === 'idea') { if (h.hasAttribute('data-theme')) h.removeAttribute('data-theme'); } else if (h.getAttribute('data-theme') !== t) h.setAttribute('data-theme', t); }; const iv = setInterval(apply, 40); setTimeout(() => clearInterval(iv), 60000); apply(); })()`;

const SWEEP = `(() => {
	const h = window.__bvHelpers;
	const out = [];
	for (const el of document.querySelectorAll('body *')) {
		if (el.closest('script, style, svg, canvas, iframe, noscript, [aria-hidden="true"], .bg-fx')) continue;
		let own = '';
		for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
		own = own.trim();
		if (!own) continue;
		const r = el.getBoundingClientRect();
		if (r.width < 1 || r.height < 1) continue;
		const vis = h.isVisible(el);
		if (!vis.visible) continue;
		const cs = getComputedStyle(el);
		if (parseFloat(cs.opacity) === 0) continue;
		const g = h.groundOf(el);
		const fg = h.over(h.toRGBA(cs.color), g.ground);
		const px = parseFloat(cs.fontSize);
		const bold = parseInt(cs.fontWeight, 10) >= 700;
		const large = px >= 24 || (bold && px >= 18.66);
		const disabled = !!el.closest(':disabled, [aria-disabled="true"], .disabled');
		out.push({ path: h.cssPath(el), text: own.slice(0, 40), fg, ground: g.ground, source: g.source, image: g.backgroundImage, ratio: h.ratio(fg, g.ground), floor: large ? 3 : 4.5, disabled, px });
	}
	return out;
})()`;

const server = await startDevServer({ cwd: process.cwd() });
const { browser } = await launch();
let worstAll = null;
try {
	for (const item of list) {
		for (const width of widths) {
			for (const theme of themes) {
				const { context, page } = await openPage(browser, { width, height: width < 500 ? 780 : 900 });
				try {
					await context.addInitScript(pin(theme));
					await page.goto(`${server.origin}${item.path}`, { waitUntil: 'domcontentloaded' });
					await waitForApp(page);
					await settle(page, { settleMs: 800 });
					await waitUntil(
						page,
						`() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity).length === 0`,
						{ timeoutMs: 6_000 }
					);
					await ensureHelpers(page);
					const rows = await page.evaluate(SWEEP);
					for (const r of rows) r.washed = washedRatio(r.fg, r.ground);
					const live = rows.filter((r) => !r.disabled);
					const fails = live.filter((r) => r.ratio < r.floor).sort((a, b) => a.ratio - b.ratio);
					const washFails = live.filter((r) => r.washed < 3).sort((a, b) => a.washed - b.washed);
					const worst = live.reduce((a, r) => (a === null || r.ratio / r.floor < a.ratio / a.floor ? r : a), null);
					const disabledLow = rows.filter((r) => r.disabled && r.ratio < r.floor).length;
					if (worst && (worstAll === null || worst.ratio / worst.floor < worstAll.r.ratio / worstAll.r.floor)) worstAll = { r: worst, where: `${item.path} ${theme} ${width}` };
					console.log(
						`${item.path} ${theme} @${width}: ${live.length} text elements, ${fails.length} under floor, ${washFails.length} under 3:1 washed, worst ${worst ? worst.ratio.toFixed(2) + ':1 (floor ' + worst.floor + ') "' + worst.text + '"' : 'n/a'}${disabledLow ? `, ${disabledLow} disabled (exempt)` : ''}`
					);
					for (const f of fails.slice(0, show)) console.log(`    ${f.ratio.toFixed(2)}:1 < ${f.floor}  ${f.px}px "${f.text}"  ${f.path}  fg ${JSON.stringify(f.fg)} on ${JSON.stringify(f.ground)} (${f.source})`);
				} catch (e) {
					console.log(`FAILED ${item.path} ${theme} ${width}: ${e.message.split('\n')[0]}`);
				} finally {
					await context.close().catch(() => {});
				}
			}
		}
	}
	if (worstAll) console.log(`WORST OVERALL: ${worstAll.r.ratio.toFixed(2)}:1 (floor ${worstAll.r.floor}) "${worstAll.r.text}" at ${worstAll.where}`);
} finally {
	await browser.close();
	await server.stop();
}
