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
 *
 * Each check names its state, a selector scoped to the view it reads, and a
 * floor: 4.5 for words, 3 for a glyph that only marks a state beside its word.
 * A check that MATCHES NOTHING is a failure of this probe, printed as one and
 * counted, never a silent pass: after the project page became views (round
 * of 2026-10-07) half of the old checks matched 0 nodes and still printed a
 * line that read like a measurement.
 *
 *   node tools/browser-verify/_armory-theme-contrast.mjs
 */
import { launch, openPage, waitForApp, settle, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';

const CHECKS = [
	// The Files view: the state words sit on the well's etched rows.
	['editing', '[data-testid="armory-files"] .ar-state.ar-tone-editing', 'checked-out word, on the well', 4.5],
	['synced', '[data-testid="armory-files"] .ar-state.ar-tone-synced', 'available word, on the well', 4.5],
	['offline', '[data-testid="armory-files"] .ar-state.ar-tone-quiet', 'quiet word, on the well', 4.5],
	['editing', '[data-testid="armory-files"] .ar-file-line', 'who and when', 4.5],
	['many', '.ar-folder-meta', 'folder counts', 4.5],
	// The header: tabs, readouts and the live line.
	['editing', '.ar-tab', 'tabs', 4.5],
	['editing', '.ar-readouts .ar-readout', 'header readouts', 4.5],
	['editing', '.ar-live', 'the live line', 4.5],
	// Checked out: the table's columns, the glyph and the armed warning.
	['editing-out', '.ar-out-who', 'checkout holder', 4.5],
	['editing-out', '.ar-out-since', 'checked out since', 4.5],
	['editing-out', '.ar-out-folder', 'checkout folder', 4.5],
	['editing-out', '.ar-out-file .ar-tone-editing', 'checked-out glyph', 3],
	['editing-out-force', '[data-testid="armory-take-back-warning"]', 'the Force check in warning', 4.5],
	// Team, Activity and Project.
	['team', '.ar-person-name', 'member names', 4.5],
	['team', '.ar-presence-line', 'presence lines', 4.5],
	['team', '.ar-member-email', 'member addresses', 4.5],
	['team', '.ar-team .ar-readout', 'role and checkout readouts', 4.5],
	['people', '.ar-member-note', 'the last-mentor guard', 4.5],
	['activity', '.ar-activity li', 'activity lines', 4.5],
	['purge', '.ar-purge-cost', 'what Delete forever costs', 4.5],
	['purge-blocked', '[data-testid="armory-purge-blocked"]', 'why Delete forever is held', 4.5],
	// Setup, the index and file history.
	['start-connected', '.ar-step-status', 'a ticked step status', 4.5],
	['start', '.ar-step-status', 'an open step status', 4.5],
	['start', '.ar-howto li', 'install steps', 4.5],
	['how', '.ar-how-list dd', 'how it works', 4.5],
	['file-side', '.ar-entry-why', 'why a side version exists', 4.5],
	['projects', '.ar-project-chips .ar-readout', 'project card role', 4.5],
	['projects', '.ar-project-readouts .ar-readout', 'project card counts', 4.5]
];
const ACTIONS = { 'editing-out-force': ['editing-out', '[data-testid="armory-checkouts"] [data-testid="armory-take-back"]'] };
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
let below = 0;
let empty = 0;
try {
	for (const theme of ['idea', 'matrix', 'space-white']) {
		for (const [state, sel, label, floor] of CHECKS) {
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
				if (r.min === null) {
					empty++;
					console.log(`!!! ${theme.padEnd(11)} ${label.padEnd(34)} MATCHED NOTHING (${sel} on ${state}): the probe is not looking`);
					continue;
				}
				worst = Math.min(worst, r.min);
				if (r.min < floor) below++;
				console.log(`${r.min < floor ? '>>>' : 'ok '} ${theme.padEnd(11)} ${label.padEnd(34)} ${r.n} node(s), min ${r.min.toFixed(2)}:1 (floor ${floor})`);
			} finally {
				await context.close().catch(() => {});
			}
		}
	}
} finally {
	await browser.close();
	await server.stop();
}
console.log(`worst ${worst.toFixed(2)}:1; ${below} below their floor; ${empty} matched nothing; ${CHECKS.length * 3} checks`);
if (below > 0 || empty > 0) process.exitCode = 1;
