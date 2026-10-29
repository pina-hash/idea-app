#!/usr/bin/env node
/**
 * IDEA HTML assignment kit: the automatic test, run the way a student meets it.
 *
 *   node tools/hx-kit/test.mjs <assignment.html> [--out <dir>] [--pane 830] [--today 2026-10-28]
 *
 * WHAT IT IS. An outside judge for a built assignment, so a chat never grades its
 * own file. It runs the REAL importer check (`validateHtmlManifest`) and the
 * authoring validator, then serves the document from a second origin under the
 * REAL served policy (`hxDocumentCsp`, `HX_SANDBOX_FLAGS`, bundled from src/ on
 * every run so it cannot drift) inside a host page laid out like the classroom
 * item page at 1024px and up: masthead, breadcrumb row, post header, progress
 * rail, then the frame in a pane that scrolls on its own. The host plays the
 * portal's part of the bridge the way `HtmlAssignmentFrame.svelte` does,
 * including the echo after every change, one echo in three stale, the 800 ms
 * save, read-only, theme and the picture boxes.
 *
 * WHAT IT IS NOT. It is not the portal. The real frame and gate are exercised by
 * `npm run verify:browser` and `/dev/html-assignment`; this mirrors their
 * documented behavior (IDEA_HTML_ASSIGNMENT_SPEC.md 6) to judge a NEW document.
 * The pane height default (830px at 1920x1080) is the classroom measured on
 * 2026-10-20 (AUTHORING 2.0, "Judge it where students see it"); pass --pane to
 * use a fresher measurement.
 *
 * OUTPUT: <out>/report.md (read this), report.json, and screenshots of the
 * assignment inside the classroom layout and alone, at 1920x1080, 1440, 960 and
 * 375, both themes. Exit 1 on any FAIL. WARN never fails the run; it is read.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launch } from '../browser-verify/browser.mjs';
import { squeezedText } from '../browser-verify/checks-floor.mjs';
import * as C from './color.mjs';
import { themes as kitThemes } from './build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

/* ---- arguments -------------------------------------------------------- */
const argv = process.argv.slice(2);
const file = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
if (!file) { console.error('usage: node tools/hx-kit/test.mjs <assignment.html> [--out dir] [--pane 830] [--today YYYY-MM-DD]'); process.exit(2); }
const OUT = resolve(opt('out', file.replace(/\.html$/, '') + '-test'));
const PANE = Number(opt('pane', 830));
const TODAY = opt('today', null);
mkdirSync(OUT, { recursive: true });
const html = readFileSync(file, 'utf8');

const results = [];
const add = (status, area, check, detail = '') => results.push({ status, area, check, detail: String(detail) });
const PASS = (a, c, d) => add('PASS', a, c, d);
const FAIL = (a, c, d) => add('FAIL', a, c, d);
const WARN = (a, c, d) => add('WARN', a, c, d);
const INFO = (a, c, d) => add('INFO', a, c, d);

/* ---- 1. the real importer check, bundled from src/ --------------------- */
async function realChecks() {
	const esbuild = await import('esbuild');
	const entry = join(OUT, '.entry.mjs');
	const bundle = join(OUT, '.real.mjs');
	writeFileSync(entry, [
		`export { validateHtmlManifest, fieldBlockMap } from ${JSON.stringify(join(REPO, 'src/lib/classroom/html-assignment/manifest.ts'))};`,
		`export { hxDocumentCsp } from ${JSON.stringify(join(REPO, 'src/routes/hx/_headers.ts'))};`,
		`export { HX_SANDBOX_FLAGS } from ${JSON.stringify(join(REPO, 'src/lib/classroom/html-assignment/bridge.ts'))};`,
		`export { thumbnailDocument, manifestThumbnail } from ${JSON.stringify(join(REPO, 'src/lib/classroom/html-assignment/thumbnail.ts'))};`
	].join('\n'));
	await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, alias: { $lib: join(REPO, 'src/lib') }, logLevel: 'error', tsconfigRaw: '{}' });
	return import(bundle + '?t=' + Date.now());
}

/* Declared before the first early finish(), which lists them. */
const shots = [];
const real = await realChecks();
const validation = real.validateHtmlManifest(html);
if (validation.errors.length) FAIL('import', 'The importer accepts the file', validation.errors.join(' | '));
else PASS('import', 'The importer accepts the file', 'validateHtmlManifest: 0 errors');
for (const w of validation.warnings) WARN('import', 'Importer warning', w);
const manifest = validation.manifest;
if (!manifest) { finish(); process.exit(1); }

try {
	const out = execFileSync('python3', [join(REPO, 'tools/validate-assignment-spec.py'), file], { encoding: 'utf8' });
	PASS('import', 'Authoring validator', out.trim().split('\n').pop());
} catch (e) {
	FAIL('import', 'Authoring validator', (e.stdout || e.message).trim().split('\n').slice(-6).join(' | '));
}
const bytes = Buffer.byteLength(html);
(bytes > 2 * 1024 * 1024 ? FAIL : PASS)('import', 'Under the 2 MB cap', `${(bytes / 1024).toFixed(0)} KB`);

/* Fields, from the manifest (header first, then modules). */
const blocks = [...(manifest.header || []), ...manifest.modules.flatMap((m) => m.blocks)];
const fieldInfo = Object.fromEntries(blocks.map((b) => [b.field, b]));

/* ---- static reads of the file ---------------------------------------- */
const visibleText = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
(/—/.test(visibleText) ? FAIL : PASS)('copy', 'No em dashes in student text', /—/.test(visibleText) ? 'found an em dash' : '');
const kitBuilt = /id="hx-kit-js"/.test(html);
(kitBuilt ? PASS : WARN)('kit', 'Built on the kit (plumbing inlined by build.mjs)', kitBuilt ? '' : 'Hand-rolled plumbing: every rule in AUTHORING 6 is now this file\'s to get right.');
/* The author's own CSS (AUTHORING D1): a part the kit or the live Plate
   already has, redrawn by hand, is what made assignments look homemade
   (geometry audit, 2026-10-26). Stripes, washes and dark-trough boxes. */
{
	const own = [...html.matchAll(/<style(?![^>]*id="hx-(?:kit-css|palette)")[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
	const hits = [];
	const stripe = own.match(/border-(?:left|right|top)\s*:\s*[3-9]px[^;]*/g) || [];
	if (stripe.length) hits.push(`${stripe.length} thick side stripe${stripe.length > 1 ? 's' : ''} (use a section with an eyebrow, or a lamp)`);
	const wells = (own.match(/background(?:-color)?\s*:\s*var\(--well-face\)/g) || []).length;
	if (wells) hits.push(`${wells} box${wells > 1 ? 'es' : ''} on the dark well face (a well is for typing into; use .hx-tile or .hx-list)`);
	const rules = (own.match(/border-(?:top|bottom)\s*:\s*1px solid var\(--hair\)/g) || []).length;
	if (rules) hits.push(`${rules} flat 1px rule${rules > 1 ? 's' : ''} between rows (use .hx-table or .hx-list, whose rows are etched)`);
	(hits.length ? WARN : PASS)('look', "The page draws the site's parts, not its own copies", hits.length ? hits.join('; ') : 'no stripes, well-face boxes or flat row rules in the author CSS');
}

/* Content colors (AUTHORING D3): build.mjs writes every used color, solved for
   each theme, into hx-palette-data. Judge each value here against the real
   grounds; the browser pass below checks the page applies them. */
const paletteData = (() => {
	const m = html.match(/<script type="application\/json" id="hx-palette-data">([\s\S]*?)<\/script>/);
	try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
})();
const kitTokens = JSON.parse(readFileSync(join(HERE, 'kit', 'tokens.json'), 'utf8'));
const TH = kitThemes(kitTokens);
const plateInk = { dark: C.hex(kitTokens.color.tokens.find((t) => t.name === 'plate-ink').value.idea), light: C.hex(kitTokens.color.tokens.find((t) => t.name === 'plate-ink').value['space-white']) };
if (!paletteData) (kitBuilt ? FAIL : INFO)('color', 'Content colors built per theme', kitBuilt ? 'No hx-palette-data: rebuild with the current kit (node tools/hx-kit/build.mjs).' : 'A hand-built page has no kit colors. Move it onto the kit before it is reused (AUTHORING Part I); until then the checks a student feels (saving, fitting, squeezing, phones) still apply.');
else {
	const entries = Object.entries(paletteData.colors);
	for (const theme of ['dark', 'light']) {
		const g = TH[theme].panels;
		const worst = (hexv) => Math.min(...g.map((x) => C.contrast(C.hex(hexv), x)));
		const bad = [];
		const mud = [];
		for (const [n, c] of entries) {
			const s = c[theme];
			if (worst(s.ink) < 4.5) bad.push(`${n} text ${worst(s.ink).toFixed(2)}`);
			if (C.contrast(C.hex(s.on), C.hex(s.fill)) < 4.5) bad.push(`${n} text on fill ${C.contrast(C.hex(s.on), C.hex(s.fill)).toFixed(2)}`);
			if (worst(s.line) < 3) bad.push(`${n} edge ${worst(s.line).toFixed(2)}`);
			if (C.contrast(plateInk[theme], C.hex(s.washOver)) < 4.5) bad.push(`${n} body text on its tint`);
			if (C.isMuddy(C.hex(s.fill))) mud.push(`${n} ${s.fill}`);
		}
		(bad.length ? FAIL : PASS)('color', `Every color readable as text, on its fill and as an edge, ${theme} theme`, bad.length ? bad.join(', ') : `${entries.length} colors: text 4.5:1 on every ground, on-fill 4.5:1, edges 3:1, body text on tints 4.5:1`);
		(mud.length ? FAIL : PASS)('color', `No muddy fills (dark yellow to brown), ${theme} theme`, mud.length ? mud.join(', ') : 'none');
	}
	const unexplained = entries.filter(([, c]) => !c.means);
	(unexplained.length ? FAIL : PASS)('color', 'Every color says what it stands for', unexplained.length ? unexplained.map(([n]) => n).join(', ') : entries.map(([n, c]) => `${n}: ${c.means}`).slice(0, 8).join('; '));
	if (paletteData.arc) WARN('color', 'Phases colored from named colors, not the older data-hue arc', `data-hue ${paletteData.arc.from} to ${paletteData.arc.to}: the arc's neighbours are hard to tell apart. Give each phase a "color" (AUTHORING D3).`);
}

/* ---- 2. serve the document and the host -------------------------------- */
const HOST_PORT = 5301 + Math.floor(Math.random() * 300);
const DOC_PORT = HOST_PORT + 400;
const hostOrigin = `http://127.0.0.1:${HOST_PORT}`;
const docOrigin = `http://127.0.0.1:${DOC_PORT}`;
const csp = real.hxDocumentCsp(hostOrigin);
const docServer = createServer((req, res) => {
	res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });
	res.end(html);
});
const hostHtml = readFileSync(join(HERE, 'host.html'), 'utf8')
	.replaceAll('__DOC__', `${docOrigin}/doc`)
	.replaceAll('__FLAGS__', real.HX_SANDBOX_FLAGS)
	.replaceAll('__FIELDS__', JSON.stringify(Object.keys(fieldInfo)))
	.replaceAll('__TITLE__', manifest.title.replace(/</g, '&lt;'))
	.replaceAll('__POINTS__', String(manifest.points));
const hostServer = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(hostHtml); });
await new Promise((r) => docServer.listen(DOC_PORT, '127.0.0.1', r));
await new Promise((r) => hostServer.listen(HOST_PORT, '127.0.0.1', r));

const { browser } = await launch();
const consoleErrors = [];
async function openHost(width, height, extra = {}, ctx = {}) {
	const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', ...ctx });
	await context.addInitScript(() => {
		window.__hxErrors = [];
		addEventListener('error', (e) => window.__hxErrors.push(String(e.message || e)));
		addEventListener('unhandledrejection', (e) => window.__hxErrors.push('unhandled: ' + String(e.reason)));
	});
	const page = await context.newPage();
	page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${width}px: ${m.text()}`); });
	page.on('pageerror', (e) => consoleErrors.push(`${width}px pageerror: ${e.message}`));
	const q = new URLSearchParams({ pane: String(PANE), ...extra });
	await page.goto(`${hostOrigin}/?${q}`);
	await page.waitForFunction(() => window.__host && window.__host.ready && window.__host.seeded, null, { timeout: 15000 });
	const frame = page.frames().find((f) => f.url().startsWith(docOrigin));
	if (TODAY) await frame.evaluate((d) => { document.documentElement.dataset.today = d; }, TODAY);
	await page.waitForTimeout(400);
	return { context, page, frame };
}
const host = (page, fn, arg) => page.evaluate(([f, a]) => window.__host[f](a), [fn, arg]);
const shot = async (page, name) => { await page.screenshot({ path: join(OUT, name), fullPage: false }); return name; };
/* The whole document as the student scrolls through it: grow the viewport so the
   pane shows all of it, shoot the frame, put the viewport back. */
const docShot = async (frame, name) => {
	const page = frame.page();
	const vp = page.viewportSize();
	const need = await page.evaluate(() => { const f = document.getElementById('frame'); const p = document.getElementById('pane'); return Math.ceil(f.getBoundingClientRect().top + (p ? p.scrollTop : 0) + f.offsetHeight + 40); });
	await page.evaluate(() => { const p = document.getElementById('pane'); if (p) p.scrollTop = 0; scrollTo(0, 0); });
	await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, need) });
	await page.waitForTimeout(150);
	await (await page.$('#frame')).screenshot({ path: join(OUT, name) });
	await page.setViewportSize(vp);
	await page.waitForTimeout(100);
	return name;
};

/* ---- 3. the student, at the classroom's own size ---------------------- */
const W = 1920, H = 1080;
const s = await openHost(W, H);
try {
	const { page, frame } = s;
	const k = await frame.evaluate(() => ({ kit: typeof KIT !== 'undefined', steps: typeof KIT !== 'undefined' ? KIT.steps.length : 0 }));
	INFO('layout', 'Steps', k.kit ? `${k.steps} steps, one on screen at a time` : 'no kit navigator: one long page');
	/* Post size (AUTHORING Part C): one deliverable, a few classes, a few phases. */
	const size = await frame.evaluate(() => (typeof KIT !== 'undefined' && KIT.plan
		? { phases: KIT.plan.phases.length, classes: KIT.plan.phases.reduce((n, p) => n + (p.days || []).filter((d) => !d.off).length, 0), steps: KIT.steps.length }
		: null));
	const required = blocks.filter((b) => !b.optional && !(manifest.header || []).includes(b)).length;
	/* A library (a set of separate modules a student works through at their own pace, like the
	   FRC Training Library tracks) declares data-post="library" on <html>: Part C sizes one
	   deliverable, so it does not apply. */
	const library = /<html\b[^>]*\bdata-post="library"/i.test(html);
	if (library) INFO('post size', 'A library of separate modules (data-post="library")', `${required} required blocks${size ? `, ${size.classes} classes, ${size.steps} steps` : ''}; Part C sizing does not apply`);
	else (required > 20 ? WARN : PASS)('post size', 'About 15 required blocks, 20 at most (Part C)', `${required} required blocks${required > 20 ? ': the measured posts this size left most blocks unfilled; split at the next hand-in' : ''}`);
	/* A phase in the plan with no step behind it (Launcher: Design showed Prototype
	   tabs with nothing to open). A phase whose every day is off is a preview of a
	   later post and only warned on. */
	const empty = await frame.evaluate(() => {
		if (typeof KIT === 'undefined' || !KIT.plan) return [];
		const used = new Set(KIT.steps.map((st) => st.el.dataset.phase));
		return KIT.plan.phases.filter((p) => !used.has(p.id)).map((p) => ({ name: p.name, allOff: (p.days || []).length > 0 && (p.days || []).every((d) => d.off === true) }));
	});
	if (empty.some((p) => !p.allOff)) FAIL('post size', 'Every phase in the plan has a step in this post', `no steps: ${empty.filter((p) => !p.allOff).map((p) => p.name).join(', ')}. Mark its days "off" if a later post holds it, or remove it.`);
	else if (empty.length) WARN('post size', 'Every phase in the plan has a step in this post', `${empty.map((p) => p.name).join(', ')}: only off days here, so a later post holds it. Say which post on the page.`);
	if (size && !library) {
		const big = [size.phases > 4 && `${size.phases} phases (4 at most)`, size.classes > 4 && `${size.classes} classes (4 at most)`, size.steps > 12 && `${size.steps} steps (about 12 at most)`].filter(Boolean);
		(big.length ? WARN : PASS)('post size', 'One post, one deliverable (Part C)', big.length ? `consider splitting at the next hand-in: ${big.join(', ')}` : `${size.classes} classes, ${size.phases} phases, ${size.steps} steps`);
	}

	shots.push(await shot(page, '01-in-classroom-1920x1080-first-screen.png'));

	/* First screen: the one obvious next action. */
	const first = await page.evaluate(() => window.__host.firstScreen());
	const firstAction = await frame.evaluate(() => {
		const keys = [...document.querySelectorAll('.idea-key--primary, [data-field], button')].filter((el) => el.getClientRects().length && !el.closest('[hidden]'));
		const top = keys.map((el) => el.getBoundingClientRect().top + scrollY).sort((a, b) => a - b)[0];
		const primaries = [...document.querySelectorAll('.idea-key--primary')].filter((el) => el.getClientRects().length && !el.disabled);
		return { firstControlY: top, primaryCount: primaries.length, primaryYs: primaries.map((p) => Math.round(p.getBoundingClientRect().top + scrollY)) };
	});
	const visibleInDoc = first.paneBottomInDoc;
	if (firstAction.firstControlY != null && firstAction.firstControlY < visibleInDoc) PASS('first screen', 'Something to do is on the first screen', `first control at ${Math.round(firstAction.firstControlY)}px; the pane shows the document down to ${Math.round(visibleInDoc)}px`);
	else FAIL('first screen', 'Something to do is on the first screen', `first control at ${Math.round(firstAction.firstControlY)}px, below the first screen (${Math.round(visibleInDoc)}px)`);

	/* Green ration on the first screen (AUTHORING: more than three is the defect). */
	const green = await frame.evaluate((bottom) => {
		const probe = document.createElement('canvas').getContext('2d');
		const rgb = (c) => { probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#000'; probe.fillStyle = c; probe.fillRect(0, 0, 1, 1); const d = probe.getImageData(0, 0, 1, 1).data; return d[3] < 20 ? null : [d[0], d[1], d[2]]; };
		const root = getComputedStyle(document.documentElement);
		const greens = ['--accent', '--primary-face', '--led-green'].map((v) => rgb(root.getPropertyValue(v).trim())).filter(Boolean);
		/* Close to a green token AND green itself: a neutral key face (#2f3431) sits within 40 of the dark primary face (#2f4b2c) and is not green. */
		const near = (a) => a && a[1] - Math.max(a[0], a[2]) > 12 && greens.some((g) => Math.abs(a[0] - g[0]) + Math.abs(a[1] - g[1]) + Math.abs(a[2] - g[2]) < 40);
		const hits = [];
		for (const el of document.querySelectorAll('body *')) {
			const r = el.getBoundingClientRect();
			if (!r.width || !r.height || r.top + scrollY > bottom) continue;
			if (el.closest('[hidden]')) continue;
			const cs = getComputedStyle(el);
			const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
			if (near(rgb(cs.backgroundColor)) || (ownText && near(rgb(cs.color))) || near(rgb(cs.borderTopColor)) && cs.borderTopWidth !== '0px' && cs.borderTopColor !== cs.borderBottomColor) hits.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
		}
		return hits;
	}, visibleInDoc);
	(green.length > 3 ? WARN : PASS)('look', 'Green is rationed on the first screen (3 or fewer)', `${green.length}: ${green.slice(0, 8).join(', ')}`);

	/* Content colors on the page: which names are drawn, kept apart from each
	   other (also for colorblind students), and clear of the site's green on
	   phases and steps. */
	const drawn = await frame.evaluate(() => {
		const phase = new Set([...document.querySelectorAll('.hx-phase[data-color], .hx-step[data-color]')].map((e) => e.getAttribute('data-color')));
		const all = new Set([...document.querySelectorAll('[data-color]')].map((e) => e.getAttribute('data-color')));
		return { phase: [...phase], all: [...all] };
	});
	if (paletteData) {
		const missing = drawn.all.filter((n) => !paletteData.colors[n]);
		(missing.length ? FAIL : PASS)('color', 'Every color on the page was solved by the build', missing.length ? `not built: ${missing.join(', ')}` : drawn.all.join(', ') || 'no colors drawn');
		const greenPhase = drawn.phase.filter((n) => { const c = paletteData.colors[n]; if (!c) return false; const o = C.rgbToOklch(C.hex(c.dark.fill)); return o.C > 0.04 && o.H >= 120 && o.H <= 160; });
		(greenPhase.length ? FAIL : PASS)('color', "Phases and steps stay clear of the site's green (done)", greenPhase.length ? greenPhase.join(', ') : `phase colors ${drawn.phase.join(', ') || 'none'}`);
		const names = drawn.all.filter((n) => paletteData.colors[n]);
		/* A pair the page says never needs telling apart (two real colors that are close in
		   life, each beside its own word): <html data-color-pairs="steel/black-oxide, ..."> */
		const okPairs = new Set(((html.match(/<html\b[^>]*\bdata-color-pairs="([^"]*)"/i) || [])[1] || '').split(',').map((x) => x.trim().split('/').map((y) => y.trim()).sort().join('/')).filter((x) => x.includes('/')));
		const close = [];
		for (const theme of ['dark', 'light']) for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
			const A = C.hex(paletteData.colors[names[i]][theme].fill), B = C.hex(paletteData.colors[names[j]][theme].fill);
			const n0 = C.deltaE2000(A, B), d = C.deltaE2000(C.simulate(A, 'deutan'), C.simulate(B, 'deutan')), p = C.deltaE2000(C.simulate(A, 'protan'), C.simulate(B, 'protan'));
			if (okPairs.has([names[i], names[j]].sort().join('/'))) continue;
			if (n0 < 12 || d < 8 || p < 8) close.push(`${names[i]}/${names[j]} ${theme} ${n0.toFixed(0)}, deutan ${d.toFixed(0)}, protan ${p.toFixed(0)}`);
		}
		(close.length ? WARN : PASS)('color', 'Colors on the page tell apart, also for colorblind students (fills: dE00 12, simulated 8)', close.length ? close.slice(0, 6).join('; ') + '. A pair that must be told apart needs another color; otherwise give each its word or icon.' : `${names.length} colors, every pair apart`);
	}

	for (const theme of ['dark', 'light']) {
		await host(page, 'theme', theme);
		await page.waitForTimeout(150);
		const c = await frame.evaluate(() => {
			const probe = document.createElement('canvas').getContext('2d');
			const rgb = (col) => { probe.clearRect(0, 0, 1, 1); probe.fillStyle = col; probe.fillRect(0, 0, 1, 1); const d = probe.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
			const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
			const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
			const ground = rgb(getComputedStyle(document.documentElement).getPropertyValue('--panel-top').trim());
			/* A custom property reads back unresolved, so resolve each phase ink through a real color. */
			const inks = [...document.querySelectorAll('[data-color]')].map((el) => {
				const probeEl = document.createElement('span');
				probeEl.style.color = 'var(--hx-ink)';
				el.appendChild(probeEl);
				const col = getComputedStyle(probeEl).color;
				probeEl.remove();
				return col;
			}).filter(Boolean);
			const uniq = [...new Set(inks)];
			return uniq.map((ink) => Math.round(ratio(rgb(ink), ground) * 100) / 100);
		});
		const low = c.filter((r) => r < 4.5);
		(low.length ? FAIL : PASS)('color', `Colors as drawn are readable on panels, ${theme} theme (4.5:1)`, c.length ? `ratios ${c.join(', ')}` : 'no colors in use');
		shots.push(await shot(page, `02-in-classroom-1920x1080-${theme}.png`));
	}
	await host(page, 'theme', 'dark');

	/* Each step fits the pane: pages, not one long scroll. */
	if (k.kit && k.steps) {
		const over = [];
		const sizes = [];
		for (let i = 0; i < k.steps; i++) {
			await frame.evaluate((n) => kitShow(n), i);
			await page.waitForTimeout(250);
			const m = await frame.evaluate(() => {
				const bar = document.getElementById('hx-bar').getBoundingClientRect();
				const step = KIT.steps[KIT.cur].el.getBoundingClientRect();
				/* Each column's height, so a step too tall says which column to move things out of. */
				const cols = [...KIT.steps[KIT.cur].el.querySelectorAll(':scope > .hx-step-body > *')].map((c) => Math.round(c.getBoundingClientRect().height));
				return { title: KIT.steps[KIT.cur].title, h: Math.round(step.bottom - bar.top), inner: document.documentElement.scrollHeight - innerHeight, cols };
			});
			sizes.push(`${i + 1} ${m.title}: ${m.h}px`);
			if (m.h > PANE) over.push(`${i + 1} ${m.title} (${m.h}px; columns ${m.cols.join(' / ')}px)`);
			if (m.inner > 1) FAIL('layout', 'No scrollbar inside the frame', `step ${i + 1}: the document is ${m.inner}px taller than its frame`);
			shots.push(await docShot(frame, `10-step-${String(i + 1).padStart(2, '0')}.png`));
		}
		const bare = await frame.evaluate(() => KIT.steps.map((st, i) => (st.el.hasAttribute('data-optional') || kitRequired(st.el).length + (typeof kitAnyGroups === 'function' ? kitAnyGroups(st.el).length : 0) ? null : `${i + 1} ${st.title}`)).filter(Boolean));
		(bare.length ? WARN : PASS)('learning', 'Every step asks for evidence of its own (a step done on a visit proves nothing)', bare.length ? `no evidence: ${bare.join('; ')}` : `${k.steps} steps`);
		(over.length ? FAIL : PASS)('layout', `Every step fits one screen of the classroom pane (${PANE}px, bar to step bottom)`, over.length ? `split or trim: ${over.join('; ')}` : sizes.join('; '));

		/* Moving between steps does not move the page (Mr. Pina, 2026-10-26: "the
		   document shouldn't move up and down"). Real clicks on the step track, in the
		   classroom stand-in, with the bar on screen: every segment must stay where it
		   was. A shrinking frame or a landing scroll moves them. */
		await frame.evaluate(() => kitShow(0));
		await page.waitForTimeout(300);
		await frame.locator('#hx-bar').scrollIntoViewIfNeeded();
		await page.mouse.wheel(0, -120);
		await page.waitForTimeout(400);
		const drift = [];
		const order = [...Array(k.steps).keys()].slice(1).concat([0, k.steps - 1, 1]);
		for (const i of order) {
			const seg = frame.locator('#hx-track .hx-seg').nth(i);
			const before = await seg.boundingBox();
			await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
			await page.waitForTimeout(700);
			const after = await seg.boundingBox();
			drift.push(Math.round(Math.abs(after.y - before.y)));
		}
		const worst = Math.max(...drift);
		const empty = await frame.evaluate(() => Math.round(document.getElementById('hx-page').getBoundingClientRect().bottom - KIT.steps[KIT.cur].el.getBoundingClientRect().bottom));
		(empty > 240 ? FAIL : PASS)('layout', 'Holding the height leaves no dead space under a step', `${empty}px between the current step and the end of the page`);
		(worst > 2 ? FAIL : PASS)('layout', 'Clicking through the steps does not move the page', `${drift.length} clicks on the step track, largest move ${worst}px (${drift.join(', ')})`);
	} else {
		const hgt = await frame.evaluate(() => document.getElementById('hx-page').getBoundingClientRect().height);
		const screens = hgt / PANE;
		(screens > 3 ? FAIL : screens > 1.5 ? WARN : PASS)('layout', 'Scroll budget', `${Math.round(hgt)}px tall, ${screens.toFixed(1)} screens of a ${PANE}px pane. Use the kit's steps.`);
	}

	/* A team post (spec 16): one shared page per team. Driven through the stand-in
	   as the portal drives it: a box a teammate holds is drawn read only with their
	   name and every other box stays writable; focusing a box asks for its lock;
	   a teammate's saved answer replaces a box the student already typed in once
	   that save has landed, and never the box the student is in. */
	if (manifest.team && k.kit) {
		const shared = new Set((manifest.modules || []).filter((m) => m.audience === 'team' || m.audience === 'role').flatMap((m) => (m.blocks || []).filter((b) => b.type === 'text' || b.type === 'longText').map((b) => b.field)));
		const fields = await frame.evaluate((sh) => sh.filter((f) => { const r = hxRoot(f); return r && /^(INPUT|TEXTAREA)$/.test(r.tagName); }), [...shared]);
		if (fields.length < 3) WARN('team', 'A team page has three shared text boxes to drive', `found ${fields.length}`);
		else {
			const [held, mine, live] = fields;
			const show = (f) => frame.evaluate((x) => { const i = KIT.steps.findIndex((s) => s.el.contains(hxRoot(x))); if (i >= 0) kitShow(i); }, f);
			const states = Object.fromEntries(fields.map((f) => [f, { state: 'free' }]));
			states[held] = { state: 'held', by: 'Alex' };
			await host(page, 'teamState', { team: 'Team 3', me: 'Sam', roles: [], fields: states });
			await page.waitForTimeout(200);
			const paint = await frame.evaluate(([fs, h]) => ({
				lockedHeld: hxRoot(h).disabled, words: (document.querySelector('[data-who="' + h + '"]') || {}).textContent || '',
				lockedOthers: fs.filter((f) => f !== h && hxRoot(f).disabled).length,
				labels: [...document.querySelectorAll('.hx-who')].filter((w) => w.textContent.trim()).length
			}), [fields, held]);
			(paint.lockedHeld && /Alex is editing/.test(paint.words) && paint.lockedOthers === 0 && paint.labels === 1 ? PASS : FAIL)('team', 'A box a teammate holds is read only with their name; every other box stays writable',
				`held box read only: ${paint.lockedHeld}, says "${paint.words}"; other shared boxes read only: ${paint.lockedOthers} of ${fields.length - 1}; boxes with words beside them: ${paint.labels}`);
			await host(page, 'teamState', { team: 'Team 3', me: 'Sam', roles: [], fields: Object.fromEntries(fields.map((f) => [f, { state: 'free' }])) });
			await show(mine);
			await frame.locator(`[data-field="${mine}"]`).click();
			await page.keyboard.type('ours');
			await show(live);
			await frame.locator(`[data-field="${live}"]`).click();
			await page.waitForTimeout(1200);
			await page.keyboard.type('typing');
			await host(page, 'teammate', [mine, 'from a teammate']);
			await host(page, 'teammate', [live, 'overwritten']);
			await page.waitForTimeout(300);
			const after = await frame.evaluate(([a, b]) => [hxRoot(a).value, hxRoot(b).value], [mine, live]);
			const log = await host(page, 'focusLog');
			const asked = log.includes('focus ' + mine) && log.includes('blur ' + mine) && log.includes('focus ' + live);
			(after[0] === 'from a teammate' && after[1] === 'typing' && asked ? PASS : FAIL)('team', "A teammate's saved answer arrives, never over the box the student is in, and focus asks for the lock",
				`left box now "${after[0]}" (want "from a teammate"); box in use "${after[1]}" (want "typing"); lock messages: ${log.join(', ') || 'none'}`);
			/* Put both boxes back as they were, so the save checks below start clean. */
			await frame.evaluate(() => document.activeElement && document.activeElement.blur());
			await page.waitForTimeout(1000);
			await frame.evaluate((fs) => fs.forEach((f) => { delete HX.owned[f]; }), [mine, live]);
			await host(page, 'teammate', [mine, '']);
			await host(page, 'teammate', [live, '']);
			await page.waitForTimeout(300);
		}
	}

	/* Tap targets: every control a student presses is 44px. */
	const small = await frame.evaluate(() => {
		const out = [];
		const all = [...document.querySelectorAll('button, summary, select, input[type="text"], textarea, .hx-pick, [data-go]')];
		for (const el of all) {
			if (!el.getClientRects().length || el.closest('[hidden]')) continue;
			const r = el.getBoundingClientRect();
			const hit = el.classList.contains('hx-seg') ? r.height + 36 : r.height;
			if (hit < 43.5) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.height)}px`);
		}
		return out;
	});
	await frame.evaluate(() => { if (typeof kitSetView === 'function') kitSetView('list'); });
	await page.waitForTimeout(200);
	const smallAll = await frame.evaluate(() => [...document.querySelectorAll('button, summary, select, input[type="text"], textarea, .hx-pick')].filter((el) => el.getClientRects().length && !el.closest('[hidden]') && !el.closest('details:not([open])') && el.getBoundingClientRect().height + (el.classList.contains('hx-seg') ? 36 : 0) < 43.5).map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().height)}px`));
	const allSmall = [...new Set([...small, ...smallAll])];
	(allSmall.length ? FAIL : PASS)('people', 'Every control is 44px or taller', allSmall.slice(0, 10).join('; '));
	await frame.evaluate(() => { if (typeof kitSetView === 'function') kitSetView('step'); });

	/* "Any one of these": every box in a group must be optional in the manifest,
	   or the portal still counts each one as owed. */
	const anyBad = await frame.evaluate(() => [...document.querySelectorAll('[data-any-one] [data-field]')].map((e) => e.dataset.field));
	if (anyBad.length) {
		const owed = [...new Set(anyBad)].filter((f) => fieldInfo[f] && !fieldInfo[f].optional);
		(owed.length ? FAIL : PASS)('grading', 'Every box in an "any one of these" group is optional in the manifest', owed.length ? `still required there: ${owed.join(', ')}` : `${new Set(anyBad).size} boxes in ${await frame.evaluate(() => document.querySelectorAll('[data-any-one]').length)} groups`);
	}

	/* The last step's key with work still missing (2026-10-28): never the green
	   Next look, and it says what is missing. Checked before anything is filled. */
	if (k.kit && k.steps > 1) {
		const lastKey = await frame.evaluate(() => {
			kitShow(KIT.steps.length - 1);
			const b = KIT.steps[KIT.steps.length - 1].el.querySelector('[data-kit-next]');
			const r = b && !b.hidden ? { text: b.textContent.trim(), primary: b.classList.contains('idea-key--primary') } : null;
			kitShow(0);
			return r;
		});
		if (lastKey) ((!lastKey.primary && /^Not finished/.test(lastKey.text)) ? PASS : FAIL)('navigation', 'On the last step, unfinished work is a plain key that says what is missing, never a green Next', `"${lastKey.text}"${lastKey.primary ? ', drawn as the green primary key' : ''}`);
	}

	/* ---- 4. type like a student, against an echoing, sometimes stale parent. */
	const phrase = (f) => `the ${f} reads 0.501 in on two edges`;
	const expected = {};
	const missing = [];
	for (const [field, b] of Object.entries(fieldInfo)) {
		if (b.type === 'image') continue;
		const found = await frame.evaluate((fd) => {
			const el = document.querySelector(`[data-field="${CSS.escape(fd)}"]`);
			if (!el) return false;
			if (typeof KIT !== 'undefined') { const i = KIT.steps.findIndex((s) => s.el.contains(el)); if (i >= 0 && KIT.cur !== i) kitShow(i); }
			const d = el.closest('details'); if (d) d.open = true;
			el.scrollIntoView({ block: 'center' });
			return true;
		}, field);
		if (!found) { missing.push(field); continue; }
		await page.waitForTimeout(120);
		const sel = `[data-field="${field}"]`;
		if (b.type === 'text' || b.type === 'longText') {
			/* Type what the box asks for: as many sentences as data-min-sentences,
			   a number where data-number. A box students cannot type into (read only
			   or hidden, set by keys) is driven by its [data-keys-for] keys. */
			const box = await frame.evaluate((s2) => {
				const el = document.querySelector(s2);
				const st = getComputedStyle(el);
				return { min: Number(el.dataset.minSentences || 1), number: el.dataset.number !== undefined || /^(decimal|numeric)$/.test(el.inputMode || ''), typable: !el.readOnly && !el.disabled && el.type !== 'hidden' && st.display !== 'none' && st.visibility !== 'hidden' && !!el.getClientRects().length, keys: document.querySelectorAll(`[data-keys-for="${CSS.escape(el.dataset.field)}"] button, button[data-keys-for="${CSS.escape(el.dataset.field)}"]`).length };
			}, sel);
			if (await frame.evaluate((s2) => document.querySelector(s2).tagName === 'SELECT', sel)) {
				expected[field] = await frame.evaluate((s2) => { const c = document.querySelector(s2); const o = [...c.options].find((x) => x.value); c.value = o ? o.value : ''; c.dispatchEvent(new Event('change', { bubbles: true })); return c.value; }, sel);
				continue;
			}
			if (!box.typable) {
				if (box.keys) {
					expected[field] = await frame.evaluate((fd) => { const k = document.querySelector(`[data-keys-for="${CSS.escape(fd)}"] button, button[data-keys-for="${CSS.escape(fd)}"]`); k.click(); return hxRead(hxRoot(fd)); }, field);
				} else FAIL('save', 'A box a student cannot type into is set by its keys', `${field} is read only or hidden and has no [data-keys-for="${field}"] keys: give it keys, or make it a radio (.hx-picks or .hx-scale)`);
				continue;
			}
			const text = box.number ? '12' : Array.from({ length: Math.max(1, box.min) }, (_, i) => (i ? `Sentence ${i + 1} about ${field} names a number.` : phrase(field) + '.')).join(' ');
			await frame.click(sel);
			await frame.type(sel, text, { delay: 6 });
			expected[field] = text;
		} else if (b.type === 'radio') {
			const v = await frame.evaluate((s2) => { const r = document.querySelector(s2 + ' input[type="radio"]'); r.closest('label') ? r.closest('label').click() : r.click(); return r.value; }, sel);
			expected[field] = v;
		} else if (b.type === 'checkbox') {
			await frame.click(sel);
			expected[field] = true;
		} else if (b.type === 'table') {
			/* Every row, as a student finishing the page would: numbers where the cell asks for one. */
			const rows = await frame.$$(`${sel} tbody tr`);
			const out = [];
			for (let r = 0; r < rows.length; r++) {
				const cells = await rows[r].$$('input, textarea, select');
				const vals = [];
				for (let i = 0; i < cells.length; i++) {
					const kind = await cells[i].evaluate((c) => (c.tagName === 'SELECT' ? 'select' : c.readOnly || c.disabled ? 'fixed' : c.type === 'number' || /^(decimal|numeric)$/.test(c.inputMode || '') ? 'number' : 'text'));
					if (kind === 'select') { vals.push(await cells[i].evaluate((c) => { const o = [...c.options].find((x) => x.value); if (o) { c.value = o.value; c.dispatchEvent(new Event('change', { bubbles: true })); } return c.value; })); continue; }
					if (kind === 'fixed') { vals.push(await cells[i].evaluate((c) => c.value)); continue; }
					const v = kind === 'number' ? String(1 + ((r + i) % 5)) : `cell ${r + 1}.${i + 1} with spaces`;
					await cells[i].click(); await cells[i].type(v, { delay: 4 }); vals.push(v);
				}
				out.push(vals);
			}
			expected[field] = JSON.stringify(out);
		}
	}
	(missing.length ? FAIL : PASS)('save', 'Every declared field has a box on the page', missing.join(', '));
	await page.waitForTimeout(1500);
	const stored = await page.evaluate(() => window.__host.values());
	const lost = Object.entries(expected).filter(([f, v]) => stored[f] !== v).map(([f, v]) => `${f}: sent ${JSON.stringify(stored[f])} expected ${JSON.stringify(v)}`);
	const echoes = await page.evaluate(() => window.__host.stats());
	(lost.length ? FAIL : PASS)('save', 'Every typed answer reaches the portal exactly, through stale echoes', lost.length ? lost.join(' | ') : `${Object.keys(expected).length} fields, ${echoes.echoes} echoes (${echoes.stale} stale)`);
	if (echoes.dropped.length) FAIL('save', 'Nothing the document sends is dropped by the gate', echoes.dropped.slice(0, 6).join(' | '));
	else PASS('save', 'Nothing the document sends is dropped by the gate', `${echoes.messages} messages`);

	/* A picture: choose, upload, the box reported. */
	/* Required pictures, and the first picture of any "any one of these" group, so the finish line sees a complete page. */
	const anyImages = await frame.evaluate((imgs) => [...document.querySelectorAll('[data-any-one]')].map((g) => [...g.querySelectorAll('[data-field]')].map((e) => e.dataset.field).find((f) => imgs.includes(f))).filter(Boolean), Object.entries(fieldInfo).filter(([, b]) => b.type === 'image').map(([f]) => f));
	const imageFields = [...new Set([...Object.entries(fieldInfo).filter(([, b]) => b.type === 'image' && !b.optional).map(([f]) => f), ...anyImages])];
	if (imageFields.length) {
		const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAIAAAD38zoCAAAAEUlEQVR4nGOIWpCHFTHQQQIAucA4QbqkH88AAAAASUVORK5CYII=', 'base64');
		/* Every required picture hands in, so the finish line below sees a complete page; the first one is reported. */
		for (const g of imageFields.slice(1)) {
			await frame.evaluate((fd) => { const el = document.querySelector(`[data-field="${CSS.escape(fd)}"]`); if (typeof KIT !== 'undefined') { const i = KIT.steps.findIndex((s) => s.el.contains(el)); if (i >= 0) kitShow(i); } }, g);
			await page.waitForTimeout(150);
			await (await frame.$(`input[type="file"][data-field="${g}"]`)).setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: png });
			await page.waitForTimeout(900);
		}
		const f = imageFields[0];
		await frame.evaluate((fd) => { const el = document.querySelector(`[data-field="${CSS.escape(fd)}"]`); if (typeof KIT !== 'undefined') { const i = KIT.steps.findIndex((s) => s.el.contains(el)); if (i >= 0) kitShow(i); } }, f);
		await page.waitForTimeout(150);
		await (await frame.$(`input[type="file"][data-field="${f}"]`)).setInputFiles({ name: 'jaws-on-part.png', mimeType: 'image/png', buffer: png });
		await page.waitForTimeout(1200);
		const img = await page.evaluate((fd) => ({ stored: !!window.__host.images()[fd], box: window.__host.boxes()[fd] || null }), f);
		(img.stored ? PASS : FAIL)('save', 'A picture hands in', img.stored ? `${f} stored` : `${f} never reached the portal`);
		(img.box ? PASS : WARN)('save', 'The picture box is reported so the portal draws it in place', img.box ? JSON.stringify(img.box) : 'no idea:image-box for ' + f + ': the picture shows under the frame instead');
	}

	/* The finished page, as a student sees it with everything in. */
	await frame.evaluate(() => { if (typeof KIT !== 'undefined') kitShow(KIT.steps.length - 1); });
	await page.waitForTimeout(300);
	const fin = await frame.evaluate(() => { const f = document.querySelector('.hx-finish'); return f ? !f.hidden : null; });
	if (fin !== null) (fin ? PASS : WARN)('navigation', 'A finished student is told it is all in and nothing is left to turn in', fin ? '' : 'the finish line did not show with every field filled');

	/* A team pass (2026-10-28: Launcher: Design shipped with steps no student could
	   finish, because teammates' role boxes held every step open). One member owns the
	   first role, other members own the rest but the last, nobody owns the last; the
	   teammates have not filled their boxes. This member must be able to finish every
	   step, see the finish line, and see every box that is not theirs read only, with
	   words. */
	if (manifest.team && Array.isArray(manifest.team.roles) && manifest.team.roles.length && fin !== null) {
		const roles = manifest.team.roles.map((r) => r.id);
		const mineRole = roles[0];
		const unownedRole = roles.length > 2 ? roles[roles.length - 1] : null;
		const states = {};
		const others = [];
		for (const m of manifest.modules || []) {
			for (const b of m.blocks || []) {
				if (m.audience === 'team') states[b.field] = { state: 'free' };
				else if (m.audience === 'role') {
					if (m.role === mineRole) states[b.field] = { state: 'free' };
					else if (m.role === unownedRole) { states[b.field] = { state: 'unowned' }; others.push(b.field); }
					else { states[b.field] = { state: 'owned', by: 'Alex' }; others.push(b.field); }
				}
			}
		}
		const roleList = roles.map((id) => ({ id, mine: id === mineRole, owner: id === mineRole ? 'Sam' : id === unownedRole ? null : 'Alex' }));
		await host(page, 'teamState', { team: 'Team 3', me: 'Sam', roles: roleList, fields: states });
		const kept = await page.evaluate(() => Object.assign({}, window.__host.values()));
		for (const f of others) await host(page, 'teammate', [f, '']);
		await page.waitForTimeout(400);
		const tp = await frame.evaluate((oth) => {
			kitShow(KIT.steps.length - 1);
			const open = KIT.steps.map((st, i) => (st.el.hasAttribute('data-optional') || kitStepDone(i) ? null : `${i + 1} ${st.title}`)).filter(Boolean);
			const f = document.querySelector('.hx-finish');
			const bad = oth.filter((fd) => { const r = hxRoot(fd); if (!r) return false; const c = r.matches('input,textarea,select') ? r : r.querySelector('input,textarea,select'); const w = document.querySelector(`[data-who="${CSS.escape(fd)}"]`); return (c && !c.disabled) || !(w && w.textContent.trim()); });
			return { open, finish: f ? !f.hidden : null, bad };
		}, others);
		(tp.open.length ? FAIL : PASS)('team', 'A member can finish every step with teammates\' role boxes still empty', tp.open.length ? `held open by boxes that are not theirs: ${tp.open.join('; ')}` : `${roles.length} roles: one theirs, ${others.length} boxes belong to others or nobody`);
		if (tp.finish !== null) (tp.finish ? PASS : FAIL)('team', 'The finish line shows for a member who has done their part', tp.finish ? '' : 'hidden while only teammates\' boxes are empty');
		(tp.bad.length ? FAIL : PASS)('team', 'Every box that is not theirs is read only, with words', tp.bad.length ? tp.bad.slice(0, 6).join(', ') : `${others.length} boxes`);
		await host(page, 'teamState', { team: 'Team 3', me: 'Sam', roles: roleList, fields: Object.fromEntries(Object.keys(states).map((f) => [f, { state: 'free' }])) });
		/* Put the teammates' answers back, so the reload check below sees the page it filled. */
		for (const f of others) if (kept[f] !== undefined) await host(page, 'teammate', [f, kept[f]]);
		await page.waitForTimeout(200);
	}
	/* What the page SAYS once its styling has added its words (2026-10-28: three FRC
	   reading pages read "not graded · counts toward your grade" for an hour, and an
	   all-caps label turned the micro sign into an M). */
	const said = await frame.evaluate(() => {
		if (typeof kitSetView === 'function') kitSetView('list');
		const words = (el) => {
			const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
			const pseudo = (w) => { const c = getComputedStyle(el, w).content; return c && c !== 'none' && c !== 'normal' ? c.replace(/^"|"$/g, '') : ''; };
			return (pseudo('::before') + ' ' + own + ' ' + pseudo('::after')).replace(/\s+/g, ' ').trim();
		};
		const both = [], caps = [];
		const unit = /µ|\d\s?(mm|ms|mA|mV|mW|mN|mL|mg|nm|kg|kN|kPa|MPa|GPa|mph|psi)\b/;
		for (const el of document.querySelectorAll('#hx-page *')) {
			if (!el.getClientRects().length || el.closest('[hidden]') || el.closest('svg')) continue;
			const w = words(el);
			if (!w) continue;
			if (/not graded/i.test(w) && /counts toward your grade/i.test(w)) both.push(w.slice(0, 80));
			const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
			if (getComputedStyle(el).textTransform === 'uppercase' && unit.test(own)) caps.push(own.trim().slice(0, 40));
		}
		if (typeof kitSetView === 'function') kitSetView('step');
		return { both, caps };
	});
	(said.both.length ? FAIL : PASS)('copy', 'No label says both "not graded" and "counts toward your grade"', said.both.length ? said.both.slice(0, 4).join(' | ') + '. The kit writes "counts toward your grade" itself; mark an ungraded section data-graded="no".' : 'rendered labels read, styling included');
	(said.caps.length ? FAIL : PASS)('copy', 'No unit changes meaning in capitals', said.caps.length ? `${said.caps.slice(0, 5).join(' | ')}: an all-caps label turns mm into MM and µ into M. Wrap the unit in <span class="hx-keep-case">.` : '');

	/* Team-post shapes that read as broken in class (2026-10-28). */
	if (manifest.team) {
		const mods = manifest.modules || [];
		const img = mods.filter((m) => m.audience !== 'individual' && m.audience).flatMap((m) => (m.blocks || []).filter((b) => b.type === 'image').map((b) => b.field));
		if (img.length) WARN('team', 'Pictures in team or role boxes are seen only by the teacher', `${img.join(', ')}: teammates cannot see these pictures (gap 36d0596c). Say so on the page in words, or make them individual.`);
		const tbl = mods.filter((m) => m.audience === 'team').flatMap((m) => (m.blocks || []).filter((b) => b.type === 'table').map((b) => b.field));
		if (tbl.length) WARN('team', 'A team table locks as one box', `${tbl.join(', ')}: one student in one cell locks the whole table (gap 2d621bcc). Name one typist on the page, or split it into a block per row.`);
		const autos = JSON.stringify(manifest.team.checkpoints || []).match(/"check"\s*:\s*"(plan-owners|plan-balanced)"/g) || [];
		if (autos.length) WARN('team', 'Sign-off checks that cannot pass yet', `${[...new Set(autos.map((a) => a.match(/"(plan-[a-z]+)"$/)[1]))].join(', ')}: plan-owners needs due dates the seeded tasks do not have, and plan-balanced fails a team of three by design. Leave them out until the site fixes them.`);
		/* What a member is graded out of: the team modules, the individual ones, and one role. */
		const sum = (aud) => mods.filter((m) => (m.audience || 'individual') === aud).reduce((n, m) => n + (m.points || 0), 0);
		const roleMax = Math.max(0, ...mods.filter((m) => m.audience === 'role').map((m) => m.points || 0));
		const member = sum('team') + sum('individual') + roleMax;
		INFO('team', 'Points: what one member is graded out of', `${member} (team ${sum('team')} + individual ${sum('individual')} + one role ${roleMax}); the manifest totals ${manifest.points}. Set the post's points to ${member}.`);
	}
	shots.push(await docShot(frame, '06-finished.png'));

	/* Reload: everything comes back, and arrival lands on the next thing to do. */
	await host(page, 'reload');
	await page.waitForFunction(() => window.__host.seeded, null, { timeout: 10000 });
	await page.waitForTimeout(600);
	const f2 = page.frames().find((fr) => fr.url().startsWith(docOrigin));
	const back = await f2.evaluate((exp) => Object.entries(exp).filter(([fd, v]) => { const el = document.querySelector(`[data-field="${CSS.escape(fd)}"]`); return !el || hxRead(el) !== v; }).map(([fd]) => fd), expected);
	(back.length ? FAIL : PASS)('save', 'A reload restores every answer', back.length ? 'not restored: ' + back.join(', ') : `${Object.keys(expected).length} fields`);
	const arrival = await f2.evaluate(() => (typeof KIT !== 'undefined' ? { cur: KIT.cur, title: KIT.steps[KIT.cur].title, open: kitFirstOpen(0) } : null));
	if (arrival) INFO('navigation', 'Arrival after reload', `opens step ${arrival.cur + 1} (${arrival.title}); first step not done: ${arrival.open < 0 ? 'none, all done' : arrival.open + 1}`);

	/* Read-only, the grader's view: every graded control disabled, everything shown. */
	await host(page, 'readOnly', true);
	await page.waitForTimeout(400);
	const ro = await f2.evaluate(() => {
		const ctl = [...document.querySelectorAll('[data-field], [data-field] input, [data-field] textarea, [data-edits]')];
		const live = ctl.filter((el) => 'disabled' in el && !el.disabled && el.type !== 'hidden' && !(el.dataset.kind));
		const hiddenSteps = [...document.querySelectorAll('.hx-step')].filter((s2) => s2.hidden).length;
		return { controls: ctl.length, live: live.map((el) => el.dataset.field || el.getAttribute('aria-label') || el.tagName), hiddenSteps };
	});
	(ro.live.length ? FAIL : PASS)('grading', 'Read-only disables every answer and hand-in control', ro.live.length ? `still live: ${ro.live.slice(0, 6).join(', ')}` : `${ro.controls} controls disabled`);
	(ro.hiddenSteps ? FAIL : PASS)('grading', 'A grader sees every step at once', ro.hiddenSteps ? `${ro.hiddenSteps} steps hidden in read-only` : 'List view in read-only');
	shots.push(await shot(page, '03-grader-read-only-1920x1080.png'));
	await host(page, 'readOnly', false);

	/* Console. */
	const frameErrors = await f2.evaluate(() => window.__hxErrors || []);
	const all = [...consoleErrors, ...frameErrors];
	(all.length ? FAIL : PASS)('console', 'Clean console (a page error is a lost answer)', all.slice(0, 5).join(' | '));
} finally {
	await s.context.close();
}

/* ---- 4b. the thumbnail, in every slot the classroom draws it ----------
   (2026-10-28: thumbnails sized to the window put text too small to read in the
   56px banner, and nothing checked.) The real shell from thumbnail.ts, at the
   classroom's own slot sizes (PostThumbnail.svelte: a 48px tile, 34px on a phone, a
   56px banner, a 16:9 wide card), in both schemes. Text must be 11px or more, sit
   inside its slot, and not stack three lines in a narrow column. */
{
	const tpl = (html.match(/<template id="([^"]+)">([\s\S]*?)<\/template>/g) || []).map((t) => t.match(/<template id="([^"]+)">([\s\S]*?)<\/template>/));
	const wantId = (manifest.thumbnail && manifest.thumbnail.template) || 'idea-thumbnail';
	const t = tpl.find((m) => m[1] === wantId);
	if (!manifest.thumbnail) INFO('thumbnail', 'Thumbnail', 'no thumbnail key: posts show the generated look');
	else if (!t) FAIL('thumbnail', 'The thumbnail template is in the file', `no <template id="${wantId}">`);
	else {
		const slots = [['tile', 48, 48], ['tile', 34, 34], ['banner', 600, 56], ['banner', 340, 56], ['wide', 320, 180]];
		const { browser } = await launch();
		const ctx = await browser.newContext({ viewport: { width: 700, height: 300 } });
		const pg = await ctx.newPage();
		const bad = [];
		for (const scheme of ['dark', 'light']) {
			for (const [shape, w, h] of slots) {
				const doc = real.thumbnailDocument(t[2], { interactive: false, shape }).replace('<html ', `<html data-idea-scheme="${scheme}" data-idea-theme="${scheme === 'light' ? 'space-white' : 'idea'}" `);
				await pg.setViewportSize({ width: w, height: h });
				await pg.setContent(doc);
				await pg.waitForTimeout(150);
				const r = await pg.evaluate(() => {
					const out = [];
					for (const el of document.querySelectorAll('body *')) {
						if (!el.getClientRects().length || el.closest('svg')) continue;
						const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
						if (!own) continue;
						const cs = getComputedStyle(el);
						if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
						const fs = parseFloat(cs.fontSize);
						const b = el.getBoundingClientRect();
						const rg = document.createRange(); const tops = new Set();
						for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width >= 1) tops.add(Math.round(q.top / 4)); }
						if (fs < 11) out.push(`"${own.slice(0, 20)}" at ${fs.toFixed(1)}px`);
						if (b.right > innerWidth + 1 || b.bottom > innerHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push(`"${own.slice(0, 20)}" runs outside the slot`);
						if (tops.size >= 3 && own.split(/\s+/).length >= 3) out.push(`"${own.slice(0, 20)}" stacks ${tops.size} lines`);
					}
					return out;
				});
				r.forEach((x) => bad.push(`${shape} ${w}x${h} ${scheme}: ${x}`));
				const name = `07-thumb-${shape}-${w}x${h}-${scheme}.png`;
				await pg.screenshot({ path: join(OUT, name) });
				shots.push(join(OUT, name));
			}
		}
		await browser.close();
		(bad.length ? FAIL : PASS)('thumbnail', 'The thumbnail reads in every classroom slot, both themes (text 11px or more, inside the slot)', bad.length ? bad.slice(0, 6).join('; ') + (bad.length > 6 ? `; ${bad.length - 6} more` : '') : `${slots.length} slots x 2 themes; look at the 07-thumb screenshots`);
	}
}

/* ---- 5. other widths, both ends -------------------------------------- */
/* 1152 is a 1440 laptop zoomed to 125% (Mr. Pina's own setting, 2026-10-27:
   resource cards squeezed their words into a column one word wide there). */
for (const [w, h, label] of [[1440, 900, 'laptop'], [1152, 720, 'laptop at 125% zoom'], [960, 900, 'half screen'], [375, 812, 'phone']]) {
	const v = await openHost(w, h);
	try {
		const over = await v.frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		(over > 1 ? FAIL : PASS)('layout', `No sideways scroll at ${w}px (${label})`, over > 1 ? `${over}px too wide` : '');
		/* Text squeezed into a column a few words wide: every step shown, any block
		   of three or more words narrower than 9 of its own letters' em and three
		   lines or taller. Layout keyed on the page width instead of the box's own
		   width is the usual cause; the fix is a container query or a stack. The
		   rule is `squeezedText` in tools/browser-verify/checks-floor.mjs, which
		   `npm run verify:browser` runs on every site page too (ledger 0469). */
		const squeezed = await v.frame.evaluate(() => {
			if (typeof kitSetView === 'function') kitSetView('list');
			document.querySelectorAll('details').forEach((d) => { d.open = true; });
		}).then(() => v.frame.evaluate(squeezedText, { root: '#hx-page' })).then((r) => r.found.map((x) => x.line));
		await v.frame.evaluate(() => { if (typeof kitSetView === 'function') kitSetView('step'); });
		(squeezed.length ? FAIL : PASS)('layout', `No text squeezed into a narrow column at ${w}px (${label})`, squeezed.length ? squeezed.slice(0, 5).join('; ') + (squeezed.length > 5 ? `; ${squeezed.length - 5} more` : '') : '');
		shots.push(await shot(v.page, `04-in-classroom-${w}.png`));
		shots.push(await docShot(v.frame, `05-document-${w}.png`));
	} finally { await v.context.close(); }
}

/* ---- 6. a phone's camera (kit/camera.js) ------------------------------- */
const camFields = Object.entries(fieldInfo).filter(([, b]) => b.type === 'image').map(([f]) => f);
if (camFields.length) {
	const v = await openHost(390, 844, {}, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
	try {
		const coarse = await v.frame.evaluate(() => matchMedia('(pointer: coarse)').matches);
		const keys = await v.frame.evaluate((fs) => fs.map((fd) => {
			const k = document.querySelector(`[data-capture="${CSS.escape(fd)}"]`);
			const c = document.querySelector(`[data-choose="${CSS.escape(fd)}"]`);
			return { field: fd, key: !!k, shown: !!k && getComputedStyle(k).display !== 'none', choose: !!c };
		}), camFields);
		const missing = keys.filter((k) => k.choose && !k.shown).map((k) => k.field);
		const withChoose = keys.filter((k) => k.choose).length;
		((coarse && !missing.length && withChoose) ? PASS : FAIL)('phone', 'Every picture box shows Take photo on a phone', coarse ? (missing.length ? 'no Take photo on: ' + missing.join(', ') : `${withChoose} of ${camFields.length} picture boxes`) : 'the emulated phone did not report pointer: coarse');
		const desk = await openHost(1440, 900);
		try {
			const shownOnDesk = await desk.frame.evaluate(() => [...document.querySelectorAll('[data-capture]')].filter((k) => getComputedStyle(k).display !== 'none').length);
			(shownOnDesk ? FAIL : PASS)('phone', 'Take photo stays hidden on a computer', shownOnDesk ? `${shownOnDesk} shown at 1440px with a mouse` : '0 shown at 1440px');
		} finally { await desk.context.close(); }

		const f = camFields.find((fd) => keys.find((k) => k.field === fd && k.shown));
		if (f) {
			/* Bring the box's step into view and open every disclosure around its Take photo key
			   (a box inside a closed "Show it" timed the tap out and crashed the run, 2026-10-27). */
			await v.frame.evaluate((fd) => {
				const el = document.querySelector(`[data-field="${CSS.escape(fd)}"]`);
				if (typeof KIT !== 'undefined') { const i = KIT.steps.findIndex((s2) => s2.el.contains(el)); if (i >= 0) kitShow(i); }
				const keyEl = document.querySelector(`[data-capture="${CSS.escape(fd)}"]`);
				for (const n of [el, keyEl]) for (let d = n && n.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
				if (keyEl) keyEl.scrollIntoView({ block: 'center' });
			}, f);
			await v.page.waitForTimeout(200);
			/* A 10 MB photo: a big, mildly noisy picture saved at full quality, made in the browser. */
			const big = await v.page.evaluate(async () => {
				for (const [w, h, q] of [[8000, 6000, 1], [9000, 6750, 1], [10000, 7500, 1]]) {
					const c = document.createElement('canvas'); c.width = w; c.height = h;
					const g = c.getContext('2d');
					const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#e8e2d4'); grad.addColorStop(1, '#9aa4b1'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
					const tile = g.createImageData(512, 512);
					for (let i = 0; i < tile.data.length; i += 4) { const n = (Math.random() * 90) | 0; tile.data[i] = n; tile.data[i + 1] = n; tile.data[i + 2] = n; tile.data[i + 3] = 60; }
					const t = document.createElement('canvas'); t.width = 512; t.height = 512; t.getContext('2d').putImageData(tile, 0, 0);
					g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, w, h);
					const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
					if (blob.size >= 10 * 1048576) { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return { size: blob.size, b64: btoa(s) }; }
				}
				return null;
			});
			if (!big) WARN('phone', 'A 10 MB photo goes in under 2 MB', 'could not make a 10 MB test photo in this browser');
			else {
				/* A tap first, as a phone sends it; some Chromium builds deliver the touch but never
				   the click a tap makes (Playwright 1.56's stock Chromium, 2026-10-26), so a click
				   follows when the tap opened nothing. HX_TEST_CAMERA_PRESS=click skips the tap, which
				   is how the fallback is proved on a browser whose tap does work. */
				const key = await v.frame.$(`[data-capture="${f}"]`);
				const presses = process.env.HX_TEST_CAMERA_PRESS === 'click' ? ['click'] : ['tap', 'click'];
				let chooser = null, pressed = null;
				for (const how of presses) {
					const chooserP = v.page.waitForEvent('filechooser', { timeout: how === 'tap' ? 2000 : 5000 }).catch(() => null);
					await (how === 'tap' ? key.tap() : key.click());
					chooser = await chooserP;
					if (chooser) { pressed = how; break; }
				}
				const cap = chooser ? await chooser.element().getAttribute('capture') : null;
				((chooser && cap === 'environment') ? PASS : FAIL)('phone', 'Take photo opens the camera', chooser ? `file chooser opened on ${pressed}, capture=${cap}` : `no file chooser opened (tried ${presses.join(' then ')})`);
				if (chooser) {
					await chooser.setFiles({ name: 'sketch.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(big.b64, 'base64') });
					await v.page.waitForFunction((fd) => window.__host.images()[fd], f, { timeout: 30000 }).catch(() => null);
					const got = await v.page.evaluate((fd) => window.__host.images()[fd] || null, f);
					const ok = got && got.bytes < 2 * 1048576;
					(ok ? PASS : FAIL)('phone', 'A 10 MB photo goes in under 2 MB', got ? `${(big.size / 1048576).toFixed(1)} MB in, ${(got.bytes / 1048576).toFixed(2)} MB sent as ${got.name}` : 'the photo never reached the portal');
				}
			}
		}
	} finally { await v.context.close(); }
}

await browser.close();
docServer.close();
hostServer.close();
finish();

function finish() {
	const n = (st) => results.filter((r) => r.status === st).length;
	const lines = [
		`# HTML assignment test: ${basename(file)}`,
		'',
		`Run ${new Date().toISOString()} by tools/hx-kit/test.mjs. Classroom pane ${PANE}px at 1920x1080.`,
		'',
		`**${n('FAIL')} FAIL, ${n('WARN')} WARN, ${n('PASS')} PASS.** Fix every FAIL before delivery; read every WARN.`,
		'',
		'| Result | Area | Check | Detail |',
		'|---|---|---|---|',
		...results.map((r) => `| ${r.status} | ${r.area} | ${r.check} | ${r.detail.replace(/\|/g, '/').replace(/\n/g, ' ')} |`),
		'',
		'## Screenshots',
		'',
		...shots.map((p) => `- ${p}`),
		'',
		'## Not checked here',
		'',
		'- The real portal frame and gate (run `npm run verify:browser`, or post it to a test class).',
		'- Whether a student understands it cold. That is the cold-open test in the idea-html-test skill: a fresh agent and then Mr. Pina open it with no explanation.',
		'- Facts. Every lab and course fact is confirmed with Mr. Pina, never by this run.'
	];
	writeFileSync(join(OUT, 'report.md'), lines.join('\n') + '\n');
	writeFileSync(join(OUT, 'report.json'), JSON.stringify({ file: basename(file), pane: PANE, results, shots }, null, 2));
	for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.area.padEnd(12)} ${r.check}${r.detail ? '  :: ' + r.detail.slice(0, 220) : ''}`);
	console.log(`\n${n('FAIL')} FAIL, ${n('WARN')} WARN, ${n('PASS')} PASS.  Report: ${join(OUT, 'report.md')}`);
	process.exitCode = n('FAIL') ? 1 : 0;
}
