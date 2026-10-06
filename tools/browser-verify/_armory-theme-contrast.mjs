/**
 * IDEA ARMORY v2 (ledger 0366): text contrast of the Armory words in EVERY site
 * theme the room is in (IDEA, Matrix, Space White). The route spec measures
 * the default theme only; this pins the theme the way _plate-shots does and
 * reads each selector's colour against its painted ground (every ancestor's
 * background-color composited up to the first opaque one), by painting each to
 * a CLEARED canvas and reading the pixels back; a canvas pre-filled black reads
 * every transparent ancestor as opaque black, which is how this probe's first
 * draft reported 1.12:1 for text the screenshots show is plainly readable (CLAUDE.md: a `color(srgb ...)`
 * or `color-mix(...)` value is not parsed by a regex).
 *
 *   node tools/browser-verify/_armory-theme-contrast.mjs
 */
import { launch, openPage, waitForApp, settle, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';

const CHECKS = [
	['editing', '.ar-state.ar-tone-editing', 'the checked-out word'],
	['synced', '.ar-state.ar-tone-synced', 'the available word'],
	['offline', '.ar-state.ar-tone-quiet', 'the quiet word'],
	['editing', '.ar-file-line', 'who and when'],
	['editing', '.ar-list-sub', 'checkout holder lines'],
	['editing', '.ar-activity li', 'activity lines'],
	['editing', '.ar-member-note', 'the last-mentor guard'],
	['editing', '.ar-message', 'messages'],
	['editing-take-back', '.ar-message.bad', 'the Take back warning'],
	['start-connected', '.ar-step-status', 'a ticked step status'],
	['start', '.ar-step-status', 'an open step status'],
	['start', '.ar-howto li', 'install steps'],
	['how', '.ar-how-list dd', 'how it works'],
	['file-side', '.ar-entry-why', 'why a side version exists'],
	['projects', '.ar-project-meta', 'project card role']
];
const ACTIONS = { 'editing-take-back': ['editing', '[data-testid="armory-checkouts"] [data-testid="armory-take-back"]'] };
const pin = (theme) =>
	`(() => { const t = ${JSON.stringify(theme)}; const apply = () => { const h = document.documentElement; if (!h) return; if (t === 'idea') { if (h.hasAttribute('data-theme')) h.removeAttribute('data-theme'); } else if (h.getAttribute('data-theme') !== t) h.setAttribute('data-theme', t); }; const iv = setInterval(apply, 40); setTimeout(() => clearInterval(iv), 60000); apply(); })()`;

const MEASURE = (sel) => `(() => {
	const px = (css) => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.clearRect(0,0,1,1); x.fillStyle = css; x.fillRect(0,0,1,1); return [...x.getImageData(0,0,1,1).data]; };
	const over = (fg, bg) => { const a = fg[3] / 255; return [0,1,2].map((i) => fg[i] * a + bg[i] * (1 - a)); };
	const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
	const ground = (el) => { const stack = []; for (let n = el; n; n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; const p = px(b); if (p[3] > 0) { stack.push(p); if (p[3] === 255) break; } } let g = [255,255,255]; const body = px(getComputedStyle(document.body).backgroundColor); if (body[3] === 255) g = body.slice(0,3); for (const p of stack.reverse()) g = over(p, g); return g; };
	const out = [];
	for (const el of document.querySelectorAll(${JSON.stringify(sel)})) {
		const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
		const bg = ground(el); const fg = over(px(getComputedStyle(el).color), bg);
		const a = lum(fg), b = lum(bg); out.push((Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05));
	}
	return { n: out.length, min: out.length ? Math.min(...out) : null };
})()`;

const server = await startDevServer({ cwd: process.cwd() });
const { browser } = await launch();
let worst = Infinity;
try {
	for (const theme of ['idea', 'matrix', 'space-white']) {
		for (const [state, sel, label] of CHECKS) {
			const [real, click] = ACTIONS[state] ?? [state, null];
			const { context, page } = await openPage(browser, { width: 1440, height: 900 });
			try {
				await context.addInitScript(pin(theme));
				await page.goto(`${server.origin}/dev/armory?state=${real}`, { waitUntil: 'domcontentloaded' });
				await waitForApp(page);
				await waitUntil(page, '() => !!document.querySelector("[data-armory-hydrated]")', { timeoutMs: 30_000 });
				await settle(page);
				if (click) { await page.click(click); await settle(page, { settleMs: 300 }); }
				const r = await page.evaluate(MEASURE(sel));
				if (r.min !== null) worst = Math.min(worst, r.min);
				console.log(`${r.min !== null && r.min < 4.5 ? '>>>' : 'ok '} ${theme.padEnd(11)} ${label.padEnd(28)} ${r.n} node(s), min ${r.min?.toFixed(2)}:1`);
			} finally {
				await context.close().catch(() => {});
			}
		}
	}
} finally {
	await browser.close();
	await server.stop();
}
console.log(`worst ${worst.toFixed(2)}:1`);
