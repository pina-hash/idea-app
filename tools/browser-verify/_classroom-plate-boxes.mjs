/**
 * THE CLASSROOM PLATE'S TWO PROOFS (ledger 0345). `_`-prefixed, so
 * `routes.mjs` does not load it as a route spec; run by hand against a dev
 * server (it starts one, or reuses one already on the harness port):
 *
 *   node tools/browser-verify/_classroom-plate-boxes.mjs boxes
 *   node tools/browser-verify/_classroom-plate-boxes.mjs fingerprint <out.json>
 *   node tools/browser-verify/_classroom-plate-boxes.mjs compare <a.json> <b.json>
 *
 * `boxes` IS THE ONE RULE, MEASURED: geometry is identical in every theme. For
 * each classroom route below, at 1440 and 375, it reads the bounding box of
 * every element under `.cr-root` in IDEA, Matrix and Space White and reports
 * how many differ from IDEA's by more than 0.01px. A boxless element (display
 * none, or zero-sized) is recorded as boxless, never as a zero rect at the
 * viewport origin, which is round 3's instrument bug. The logo's spinning gear
 * and the emblem's dark/light twin are skipped, as round 3 skipped them: one
 * animates its box and the theme picks which twin is displayed. The theme is
 * forced by pinning `data-theme` on `<html>` from an init script, because a
 * harness holds no session and `ThemeRoot` clears the attribute on hydration.
 *
 * `fingerprint` / `compare` ARE THE SCOPE PROOF: nothing outside the classroom
 * may change. For each non-classroom route below it records every element's
 * box and its computed paint (colour, background, border, radius, shadow,
 * font, text transform) and `compare` diffs two such files. A screenshot
 * cannot answer this here: the rain, the logos and the pulse animations move
 * pixels between two captures of the same tree (measured: 17 of 22 pairs
 * differ byte-for-byte with no code change at all). A computed style does not,
 * once every element under a RUNNING animation is left out (`getAnimations`):
 * with them in, two captures of one tree still differed in 139 of 8746.
 *
 * `--route <substring>` measures only the matching routes.
 *
 * `--planted` plants one length in Matrix's colour block, the positive control
 * that says `boxes` can see a difference.
 *
 * Every figure is printed; nothing here passes or fails.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { launch, openPage, waitForApp, settle, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';

const THEMES = ['idea', 'matrix', 'space-white'];
const WIDTHS = [1440, 375];

/** Every classroom harness with a theme-able surface, and one state each. */
export const CLASSROOM_ROUTES = [
	'/dev/classroom-split/s-1?manage=0',
	'/dev/classroom-split/s-1?manage=1',
	'/dev/classroom-split/s-1/item/i-crowded?manage=1',
	'/dev/item-returned',
	'/dev/classroom-todo',
	'/dev/classroom-todo/todo',
	'/dev/grading',
	'/dev/grading-bulk',
	'/dev/notebook?scope=class',
	'/dev/notebook-review',
	'/dev/classroom-live',
	'/dev/classroom-tools?open=hall-pass',
	'/dev/classroom?view=people',
	'/dev/classroom?view=admin',
	'/dev/classroom?view=feedback',
	'/dev/classroom-palette/s-1?manage=1',
	'/dev/themes-shape'
];

/** The scope proof's routes: nothing here is a classroom surface. */
export const OUTSIDE_ROUTES = [
	'/dev/gauntlet-shell',
	'/dev/ideacad-tree',
	'/dev/foundry-gallery',
	'/dev/coins',
	'/dev/maps-viewer',
	'/dev/coin-desk',
	'/dev/home-order?role=student&classes=1&rows=3'
];

const pin = (theme) =>
	`(() => { const t = ${JSON.stringify(theme)}; const apply = () => { const h = document.documentElement; if (!h) return; if (t === 'idea') { if (h.hasAttribute('data-theme')) h.removeAttribute('data-theme'); } else if (h.getAttribute('data-theme') !== t) h.setAttribute('data-theme', t); }; const iv = setInterval(apply, 40); setTimeout(() => clearInterval(iv), 60000); apply(); })()`;

const READ = (root, withStyle) => `(() => {
	window.scrollTo(0, 0);
	const root = document.querySelector(${JSON.stringify(root)}) || document.body;
	const SKIP = '.bg-fx, .idea-logo, .wordmark img, .wordmark picture, .spin, canvas, [data-plate-skip]';
	const out = [];
	const moving = new Set(document.getAnimations().map((a) => a.effect && a.effect.target).filter(Boolean));
	const animated = (el) => { for (let e = el; e; e = e.parentElement) if (moving.has(e)) return true; return false; };
	const props = ['color','background-color','background-image','border-top-color','border-top-width','border-radius','box-shadow','font-family','font-size','letter-spacing','text-transform','outline-color'];
	const walk = (el, path) => {
		if (el.closest(SKIP) || animated(el)) return;
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		const boxless = cs.display === 'none' || (r.width === 0 && r.height === 0);
		const rec = { p: path, b: boxless ? 'boxless' : [r.left, r.top + window.scrollY, r.width, r.height].map((v) => Math.round(v * 100) / 100).join(',') };
		if (${withStyle ? 'true' : 'false'}) rec.s = props.map((k) => cs.getPropertyValue(k)).join('|') + '|' + ['::before','::after'].map((pe) => { const s = getComputedStyle(el, pe); return s.content === 'none' ? '' : props.map((k) => s.getPropertyValue(k)).join('|'); }).join('|');
		out.push(rec);
		let i = 0;
		for (const c of el.children) walk(c, path + '>' + c.tagName.toLowerCase() + ':' + i++);
	};
	walk(root, root.tagName.toLowerCase());
	return { page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight].join('x'), els: out };
})()`;

async function capture(browser, origin, path, theme, width, { root = 'body', withStyle = false, planted = false } = {}) {
	const { context, page } = await openPage(browser, { width, height: width < 500 ? 780 : 900 });
	try {
		await context.addInitScript(pin(theme));
		if (planted && theme === 'matrix') {
			await context.addInitScript(`document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ":root[data-theme='matrix'] .cr-plate { --plate-r-control: 3px; --plate-chip-h: 26px; }"; document.head.append(s); });`);
		}
		await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
		await waitForApp(page);
		await waitUntil(page, `() => ${theme === 'idea' ? "!document.documentElement.hasAttribute('data-theme')" : `document.documentElement.getAttribute('data-theme') === '${theme}'`}`, { timeoutMs: 10_000 });
		await settle(page, { settleMs: 900 });
		// One-shot animations (a launcher entrance, a mark's single play) must
		// FINISH before the read; only an infinite loop is left running.
		await waitUntil(page, `() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity).length === 0`, { timeoutMs: 8_000 });
		return await page.evaluate(READ(root, withStyle));
	} finally {
		await context.close().catch(() => {});
	}
}

const [, , mode, a1, a2] = process.argv;
const planted = process.argv.includes('--planted');
const only = process.argv.includes('--route') ? process.argv[process.argv.indexOf('--route') + 1] : null;

if (mode === 'compare') {
	const A = JSON.parse(readFileSync(a1, 'utf8'));
	const B = JSON.parse(readFileSync(a2, 'utf8'));
	let total = 0;
	let differing = 0;
	for (const key of Object.keys(A)) {
		const a = A[key];
		const b = B[key];
		if (!b) {
			console.log(`${key}: missing from the second file`);
			continue;
		}
		const bm = new Map(b.els.map((e) => [e.p, e]));
		let d = 0;
		const first = [];
		for (const e of a.els) {
			total++;
			const o = bm.get(e.p);
			if (!o || o.b !== e.b || o.s !== e.s) {
				d++;
				if (first.length < 3) first.push(`${e.p} ${!o ? 'gone' : o.b !== e.b ? `box ${e.b} -> ${o.b}` : 'paint'}`);
			}
		}
		const added = b.els.length - a.els.length;
		differing += d;
		console.log(`${key}: ${a.els.length} elements, ${d} differing, ${added} added, page ${a.page} -> ${b.page}${first.length ? '\n    ' + first.join('\n    ') : ''}`);
	}
	console.log(`TOTAL: ${total} elements compared, ${differing} differing`);
	process.exit(0);
}

const server = await startDevServer({ cwd: process.cwd() });
const { browser } = await launch();
try {
	if (mode === 'fingerprint') {
		const out = {};
		for (const path of OUTSIDE_ROUTES) {
			for (const theme of ['idea', 'matrix']) {
				for (const width of WIDTHS) {
					const key = `${path} ${theme} ${width}`;
					out[key] = await capture(browser, server.origin, path, theme, width, { withStyle: true });
					console.log(`${key}: ${out[key].els.length} elements, page ${out[key].page}`);
				}
			}
		}
		writeFileSync(a1, JSON.stringify(out));
		console.log(`wrote ${a1}`);
	} else {
		let controls = 0;
		let differing = 0;
		for (const path of CLASSROOM_ROUTES.filter((r) => !only || r.includes(only))) {
			for (const width of WIDTHS) {
				const byTheme = {};
				for (const theme of THEMES) byTheme[theme] = await capture(browser, server.origin, path, theme, width, { root: '.cr-root', planted });
				const base = new Map(byTheme.idea.els.map((e) => [e.p, e.b]));
				const parts = [];
				for (const theme of ['matrix', 'space-white']) {
					let d = 0;
					let max = 0;
					const first = [];
					for (const e of byTheme[theme].els) {
						const b = base.get(e.p);
						if (b === e.b) continue;
						d++;
						if (b && b !== 'boxless' && e.b !== 'boxless') {
							const x = b.split(',').map(Number);
							const y = e.b.split(',').map(Number);
							max = Math.max(max, ...x.map((v, i) => Math.abs(v - y[i])));
						}
						if (first.length < 2) first.push(`${e.p} ${b} -> ${e.b}`);
					}
					differing += d;
					parts.push(`${theme} ${d} differing (max ${max.toFixed(2)}px)${first.length ? ' [' + first.join('; ') + ']' : ''}`);
				}
				controls += byTheme.idea.els.length;
				const pages = THEMES.map((t) => byTheme[t].page).join(' / ');
				console.log(`${path} @${width}: ${byTheme.idea.els.length} elements; ${parts.join('; ')}; page ${pages}`);
			}
		}
		console.log(`TOTAL: ${controls} elements per theme across ${CLASSROOM_ROUTES.length} routes x ${WIDTHS.length} widths, ${differing} differing boxes`);
	}
} finally {
	await browser.close();
	await server.stop();
}
