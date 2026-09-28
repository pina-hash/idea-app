/**
 * WHAT ON A PAGE IS STILL FLAT (ledger 0346). `_`-prefixed, so `routes.mjs`
 * does not load it as a route spec.
 *
 *   node tools/browser-verify/_plate-census.mjs <list.json> [--width 1440]
 *
 * For each `/dev` path in `<list.json>` (IDEA theme) it lists, grouped by the
 * element's own class list, every visible box that DRAWS ITSELF -- a border
 * or a non-transparent background -- and is not wearing Plate material. The
 * test for "wearing it" is the plate's own signature: a raised key, a panel,
 * a well and a recessed tag all carry an INSET band in their `box-shadow`, and
 * a flat box carries none. It sorts them into three kinds by what the element
 * is: PRESS (a button, a link styled as a box, a tab), TAG (a short inline
 * box holding a word) and PANEL (anything larger that holds other things).
 *
 * It PRINTS a worklist; nothing here passes or fails. A content island (the
 * same lower bound plate.css scopes to) is skipped, because it is meant to
 * stay as it is.
 */
import { readFileSync } from 'node:fs';
import { launch, openPage, waitForApp, settle } from './browser.mjs';
import { startDevServer } from './server.mjs';

const [, , listFile, ...flags] = process.argv;
const width = Number(flags.includes('--width') ? flags[flags.indexOf('--width') + 1] : 1440);
const list = JSON.parse(readFileSync(listFile, 'utf8')).map((x) => (typeof x === 'string' ? x : x.path));

const ISLANDS =
	'.ic-root, .deck-stage, .nb-island, .item-body, .md, .ProseMirror, .hx-frame-box, .note-content, .lb-stage, .grid-card, .tnm-root.tv, .mv-plan, .mv-elev-sheet, .fdy-frame-wrap, svg, canvas, iframe, img, video, [aria-hidden="true"], .harness-bar, .dev-banner';

const CENSUS = `(() => {
	const out = {};
	const clear = (c) => !c || c === 'transparent' || /rgba\\([^)]*,\\s*0\\)$/.test(c);
	for (const el of document.querySelectorAll('body *')) {
		if (el.closest(${JSON.stringify(ISLANDS)})) continue;
		const r = el.getBoundingClientRect();
		if (r.width < 8 || r.height < 8) continue;
		const cs = getComputedStyle(el);
		if (cs.visibility === 'hidden' || cs.display === 'contents') continue;
		const bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
		const bordered = bw > 0 && !clear(cs.borderTopColor);
		const filled = !clear(cs.backgroundColor) || cs.backgroundImage !== 'none';
		if (!bordered && !filled) continue;
		if (el === document.body || el.matches('html, body, main, .site-plate')) continue;
		const plated = /inset/.test(cs.boxShadow);
		if (plated) continue;
		const tag = el.tagName.toLowerCase();
		const press = tag === 'button' || tag === 'select' || (tag === 'a' && (bordered || filled)) || el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'button';
		const kind = press ? 'PRESS' : r.height <= 28 && r.width < 240 && el.children.length <= 2 ? 'TAG' : r.width * r.height > 12000 ? 'PANEL' : 'OTHER';
		if (kind === 'OTHER') continue;
		const cls = (typeof el.className === 'string' ? el.className : '').split(/\\s+/).filter((c) => c && !c.startsWith('svelte-')).join('.');
		const key = kind + ' ' + tag + (cls ? '.' + cls : '') + '  <' + ((el.parentElement && typeof el.parentElement.className === 'string' ? el.parentElement.className : '').split(/\\s+/).filter((c) => c && !c.startsWith('svelte-')).slice(0, 2).join('.')) + '>';
		out[key] = out[key] || { n: 0, text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28) };
		out[key].n++;
	}
	return out;
})()`;

const server = await startDevServer({ cwd: process.cwd() });
const { browser } = await launch();
try {
	for (const path of list) {
		const { context, page } = await openPage(browser, { width, height: 900 });
		try {
			await page.goto(`${server.origin}${path}`, { waitUntil: 'domcontentloaded' });
			await waitForApp(page);
			await settle(page, { settleMs: 900 });
			const res = await page.evaluate(CENSUS);
			const keys = Object.keys(res).sort();
			console.log(`== ${path} @${width}: ${keys.length} flat kinds`);
			for (const k of keys) console.log(`   ${k}  x${res[k].n}  "${res[k].text}"`);
		} catch (e) {
			console.log(`FAILED ${path}: ${e.message.split('\n')[0]}`);
		} finally {
			await context.close().catch(() => {});
		}
	}
} finally {
	await browser.close();
	await server.stop();
}
