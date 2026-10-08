/**
 * WHETHER A PORTED HTML DOCUMENT CAN START A DOWNLOAD, COUNTED IN A REAL
 * CHROMIUM, UNDER `HX_SANDBOX_FLAGS` AND UNDER THE SAME SET WITHOUT
 * `allow-downloads` (ledger 0368).
 *
 *   node tools/browser-verify/_hx-downloads.mjs
 *
 * WHY IT EXISTS. Mr. Pina, 2026-10-06, on the grading page: "download button to
 * download a file from an html is not working". The document's button opened
 * the stored proxy URL in a new tab, which answers 302 to an attachment, and
 * Chromium refuses every download whose INITIATOR is a document sandboxed
 * without `allow-downloads` -- including the FIRST navigation of a popup that
 * document opens. `allow-downloads` joined the set on that report. This counts
 * real `download` events, so the claim is a number and not a reading of a spec.
 *
 * IT READS THE CONSTANT, IT DOES NOT RESTATE IT. The flag string is taken out of
 * `src/lib/classroom/html-assignment/bridge.ts` by pattern, and the "without"
 * row is that string with the one token removed, so a change to the constant
 * changes what is measured. The flags go on the `<iframe>` AND into the
 * document's CSP `sandbox` directive, beside the served policy's other
 * directives, which is how `/hx/` serves a document (`hxDocumentCsp`).
 *
 * TWO HALVES, AND THE SECOND IS THE COST:
 *
 *   clicked   a trusted click inside the frame on: a popup link to a URL that
 *             302s to an attachment (the AUTHORING 9b button), window.open of
 *             it, window.open with noopener, a same-frame download link, a
 *             data: download link, and a pre-built blob: anchor.
 *   no click  a document that downloads on its own: an anchor clicked from
 *             script on load, a same-frame download link clicked on load,
 *             location.href to an attachment, and an anchor clicked from a
 *             timer. THIS IS WHAT THE WIDENING COSTS: with the flag, a document
 *             can put a file on a viewer's disk without being asked.
 *
 * EXPECTED: every clicked control 0 without the flag and 1 with it; every
 * no-click case the same. It exits 1 when a row reads otherwise, or when the
 * constant cannot be read, so it can be re-run as a check.
 *
 * WHAT IT CANNOT SAY. Chromium only (no WebKit or Gecko here). Playwright
 * launches with `--disable-popup-blocking`, which is why the no-click half uses
 * no popup: a real Chrome refuses `window.open` without a gesture. Chrome's own
 * prompt before a SECOND automatic download from one page is not exercised.
 *
 * `_`-PREFIXED, so `routes.mjs` does not load it as a route spec. Run it alone:
 * it holds its own server and its own browser.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const BRIDGE = new URL('../../src/lib/classroom/html-assignment/bridge.ts', import.meta.url);
const match = readFileSync(BRIDGE, 'utf8').match(/export const HX_SANDBOX_FLAGS =\s*'([^']+)'/);
if (!match) {
	console.error('could not read HX_SANDBOX_FLAGS out of bridge.ts; the pattern needs updating');
	process.exit(1);
}
const WITH = match[1].trim();
const WITHOUT = WITH.split(/\s+/)
	.filter((t) => t !== 'allow-downloads')
	.join(' ');

/** The controls a person presses, each one id in the document. */
const CLICKED = {
	'popup link to a 302 attachment': `<a id="c" href="ORIGIN/file" target="_blank">x</a>`,
	'window.open(url)': `<button id="c" onclick="window.open('ORIGIN/file', '_blank')">x</button>`,
	'window.open(url, noopener)': `<button id="c" onclick="window.open('ORIGIN/file', '_blank', 'noopener')">x</button>`,
	'same-frame download link': `<a id="c" href="/file" download="part.SLDPRT">x</a>`,
	'data: download link': `<a id="c" href="data:text/plain,hello" download="hello.txt">x</a>`,
	'pre-built blob: anchor': `<a id="c" download="blob.txt">x</a><script>document.getElementById('c').href = URL.createObjectURL(new Blob(['hi'], { type: 'text/plain' }));</script>`
};

/** A document that downloads on its own, with nobody pressing anything. */
const UNASKED = {
	'anchor clicked from script on load': `<a id="a" href="data:text/plain,hi" download="auto.txt">x</a><script>document.getElementById('a').click();</script>`,
	'same-frame download clicked on load': `<a id="a" href="/file2" download="auto.bin">x</a><script>document.getElementById('a').click();</script>`,
	'location.href to an attachment': `<script>location.href = '/file2';</script>`,
	'anchor clicked from a timer': `<a id="a" href="data:text/plain,hi" download="t.txt">x</a><script>setTimeout(function () { document.getElementById('a').click(); }, 300);</script>`
};

let origin = '';
const docs = new Map();
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x');
	const flags = u.searchParams.get('flags') ?? '';
	const doc = u.searchParams.get('doc') ?? '';
	if (u.pathname === '/parent') {
		res.writeHead(200, { 'content-type': 'text/html' });
		res.end(
			`<!doctype html><body><iframe id="f" sandbox="${flags}" src="/doc?flags=${encodeURIComponent(flags)}&doc=${encodeURIComponent(doc)}" style="width:600px;height:300px"></iframe></body>`
		);
		return;
	}
	if (u.pathname === '/doc') {
		res.writeHead(200, {
			'content-type': 'text/html',
			'content-security-policy': `sandbox ${flags}; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'`
		});
		res.end(`<!doctype html><meta charset="utf-8"><body>${(docs.get(doc) ?? '').replaceAll('ORIGIN', origin)}</body>`);
		return;
	}
	if (u.pathname === '/file') {
		res.writeHead(302, { location: '/file2' });
		res.end();
		return;
	}
	if (u.pathname === '/file2') {
		res.writeHead(200, {
			'content-type': 'application/octet-stream',
			'content-disposition': 'attachment; filename="part.SLDPRT"'
		});
		res.end('BYTES');
		return;
	}
	res.writeHead(404);
	res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
origin = `http://127.0.0.1:${server.address().port}`;
for (const [k, v] of [...Object.entries(CLICKED), ...Object.entries(UNASKED)]) docs.set(k, v);

const { browser } = await launch();

/** One document under one flag set: how many downloads fired, in this page or any popup it opened. */
async function count(flags, doc, click) {
	const context = await browser.newContext({ acceptDownloads: true });
	let n = 0;
	// ONE listener, on the context: its `page` event fires for the page opened
	// below as well as for every popup, so a second listener on the page would
	// count each download twice (measured: every row read 2).
	context.on('page', (p) => p.on('download', () => n++));
	const page = await context.newPage();
	await page.goto(`${origin}/parent?flags=${encodeURIComponent(flags)}&doc=${encodeURIComponent(doc)}`);
	if (click) await page.frameLocator('#f').locator('#c').click();
	await page.waitForTimeout(click ? 2000 : 1500);
	await context.close();
	return n;
}

console.log(`Chromium ${browser.version()}`);
console.log(`with:    ${WITH}`);
console.log(`without: ${WITHOUT}\n`);
let wrong = 0;
for (const [half, set, click] of [
	['clicked', CLICKED, true],
	['no click', UNASKED, false]
]) {
	console.log(`-- ${half} --`);
	for (const doc of Object.keys(set)) {
		const without = await count(WITHOUT, doc, click);
		const withFlag = await count(WITH, doc, click);
		const ok = without === 0 && withFlag === 1;
		if (!ok) wrong++;
		console.log(`${ok ? 'ok ' : 'BAD'}  without ${without}  with ${withFlag}   ${doc}`);
	}
}
await browser.close();
server.close();
console.log(wrong === 0 ? '\nevery row as expected' : `\n${wrong} row(s) not as expected`);
process.exit(wrong === 0 ? 0 : 1);
