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
		`export { HX_SANDBOX_FLAGS } from ${JSON.stringify(join(REPO, 'src/lib/classroom/html-assignment/bridge.ts'))};`
	].join('\n'));
	await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, alias: { $lib: join(REPO, 'src/lib') }, logLevel: 'error', tsconfigRaw: '{}' });
	return import(bundle + '?t=' + Date.now());
}

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
const hueFrom = Number((html.match(/data-hue-from="(\d+(?:\.\d+)?)"/) || [])[1]);
const hueTo = Number((html.match(/data-hue-to="(\d+(?:\.\d+)?)"/) || [])[1]);

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
const shots = [];

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
	(required > 20 ? WARN : PASS)('post size', 'About 15 required blocks, 20 at most (Part C)', `${required} required blocks${required > 20 ? ': the measured posts this size left most blocks unfilled; split at the next hand-in' : ''}`);
	if (size) {
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
		const near = (a) => a && greens.some((g) => Math.abs(a[0] - g[0]) + Math.abs(a[1] - g[1]) + Math.abs(a[2] - g[2]) < 40);
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

	/* The subject palette: actually applied, clear of the site's green, not the
	   old blanket cyan-to-violet, and readable in both themes. */
	if (Number.isFinite(hueFrom) && Number.isFinite(hueTo)) {
		const applied = await frame.evaluate(() => {
			const cs = getComputedStyle(document.documentElement);
			return [cs.getPropertyValue('--hx-from').trim(), cs.getPropertyValue('--hx-to').trim()];
		});
		(Number(applied[0]) === hueFrom && Number(applied[1]) === hueTo ? PASS : FAIL)(
			'look', 'The palette on <html> is the palette on the page',
			`declared ${hueFrom} to ${hueTo}, rendered ${applied[0] || 'nothing'} to ${applied[1] || 'nothing'}`
		);
		const n = (await frame.evaluate(() => (typeof KIT !== 'undefined' && KIT.plan ? KIT.plan.phases.length : 3))) || 3;
		const hues = Array.from({ length: n }, (_, i) => hueFrom + ((hueTo - hueFrom) * (n > 1 ? i / (n - 1) : 0)));
		const wrap = (h) => ((h % 360) + 360) % 360;
		const green = hues.filter((h) => { const x = wrap(h); return x >= 120 && x <= 160; });
		(green.length ? FAIL : PASS)('look', "Subject palette stays clear of the site's green (done)", `phase hues ${hues.map((h) => Math.round(wrap(h))).join(', ')}${green.length ? `; inside green: ${green.map((h) => Math.round(wrap(h))).join(', ')}` : ''}`);
		const cool = hues.every((h) => { const x = wrap(h); return x >= 185 && x <= 305; });
		(cool ? WARN : PASS)('look', 'Not the old blanket cyan, blue and violet', cool ? 'Every phase sits in cyan to violet. Mr. Pina rejected that as a default (2026-10-26): use it only when the subject itself is that color, and say so in the brief.' : 'palette leaves the cyan-to-violet band');
	} else FAIL('look', 'Subject palette set', 'No data-hue-from/data-hue-to on <html>. There is no default; pick it from the subject.');

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
			const inks = [...document.querySelectorAll('.hx-hue')].map((el) => {
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
		(low.length ? FAIL : PASS)('look', `Phase colors readable on panels, ${theme} theme (4.5:1)`, c.length ? `ratios ${c.join(', ')}` : 'no phase colors in use');
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
				return { title: KIT.steps[KIT.cur].title, h: Math.round(step.bottom - bar.top), inner: document.documentElement.scrollHeight - innerHeight };
			});
			sizes.push(`${i + 1} ${m.title}: ${m.h}px`);
			if (m.h > PANE) over.push(`${i + 1} ${m.title} (${m.h}px)`);
			if (m.inner > 1) FAIL('layout', 'No scrollbar inside the frame', `step ${i + 1}: the document is ${m.inner}px taller than its frame`);
			shots.push(await docShot(frame, `10-step-${String(i + 1).padStart(2, '0')}.png`));
		}
		const bare = await frame.evaluate(() => KIT.steps.map((st, i) => (kitRequired(st.el).length ? null : `${i + 1} ${st.title}`)).filter(Boolean));
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
			await frame.click(sel);
			await frame.type(sel, phrase(field), { delay: 12 });
			expected[field] = phrase(field);
		} else if (b.type === 'radio') {
			const v = await frame.evaluate((s2) => { const r = document.querySelector(s2 + ' input[type="radio"]'); r.closest('label') ? r.closest('label').click() : r.click(); return r.value; }, sel);
			expected[field] = v;
		} else if (b.type === 'checkbox') {
			await frame.click(sel);
			expected[field] = true;
		} else if (b.type === 'table') {
			const cells = await frame.$$(`${sel} tbody tr:first-child input, ${sel} tbody tr:first-child textarea`);
			const vals = [];
			for (let i = 0; i < cells.length; i++) { const v = `cell ${i + 1} with spaces`; await cells[i].click(); await cells[i].type(v, { delay: 8 }); vals.push(v); }
			/* A table with more than one row stores every row; the rows not typed in stay empty strings. */
			const shape = await frame.evaluate((s2) => Array.prototype.map.call(document.querySelectorAll(s2 + ' tbody tr'), (tr) => tr.querySelectorAll('input, textarea, select').length), sel);
			expected[field] = JSON.stringify(shape.map((n, r) => (r === 0 ? vals : Array.from({ length: n }, () => ''))));
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
	const imageFields = Object.entries(fieldInfo).filter(([, b]) => b.type === 'image' && !b.optional).map(([f]) => f);
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

/* ---- 5. other widths, both ends -------------------------------------- */
for (const [w, h, label] of [[1440, 900, 'laptop'], [960, 900, 'half screen'], [375, 812, 'phone']]) {
	const v = await openHost(w, h);
	try {
		const over = await v.frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		(over > 1 ? FAIL : PASS)('layout', `No sideways scroll at ${w}px (${label})`, over > 1 ? `${over}px too wide` : '');
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
			await v.frame.evaluate((fd) => { const el = document.querySelector(`[data-field="${CSS.escape(fd)}"]`); if (typeof KIT !== 'undefined') { const i = KIT.steps.findIndex((s2) => s2.el.contains(el)); if (i >= 0) kitShow(i); } }, f);
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
				const chooserP = v.page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
				await (await v.frame.$(`[data-capture="${f}"]`)).tap();
				const chooser = await chooserP;
				const cap = chooser ? await chooser.element().getAttribute('capture') : null;
				((chooser && cap === 'environment') ? PASS : FAIL)('phone', 'Take photo opens the camera', chooser ? `file chooser opened, capture=${cap}` : 'no file chooser opened');
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
