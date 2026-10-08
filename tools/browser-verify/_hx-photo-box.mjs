/**
 * THE STUDENT SIDE OF A PICTURE BOX, DRIVEN FROM INSIDE THE DOCUMENT (ledger
 * 0368), AND THE FIXTURE'S OWN DOWNLOAD BUTTON THROUGH THE REAL `/hx/` ROUTE.
 *
 *   node tools/browser-verify/_hx-photo-box.mjs
 *
 * WHY IT IS AN INSTRUMENT AND NOT A ROUTE SPEC. Everything below needs a press
 * INSIDE the sandboxed frame (the fixture's Hide control, its Download link)
 * or a read of the document's own text (the note it writes when the parent
 * answers `idea:image-box-state`), and a route spec's `evaluate` runs in the
 * parent page, which by design cannot reach into an opaque-origin document.
 * Playwright's frame locator can, with a trusted click. The grading-console
 * half (`html-assignment-grading-state-boxed*.mjs`) is a route spec, because
 * it needs nothing from inside the frame.
 *
 * WHAT IT MEASURES, at 375 and 1440, on `/dev/html-assignment?doc=photo`
 * (the REAL `HtmlAssignmentFrame` pointed at the REAL `/hx/photo`):
 *
 *   1. The pair: one picture drawn over the box, no list under the frame, and
 *      the overlay at the rectangle the document asked for, to the pixel.
 *   2. The parent's answer reached the document: its note reads
 *      `answer photo shown=true`.
 *   3. WITHDRAWAL. A trusted press on the document's Hide control sends a null
 *      rect; the picture leaves the box and appears in the list under the
 *      frame (never in neither, never in both), and the document hears
 *      `shown=false`. Show puts it back.
 *   4. A REAL DOWNLOAD through the product path: the fixture's own
 *      `<a download>` pressed inside the frame, under `HX_SANDBOX_FLAGS` as the
 *      component sets them and as `/hx/` serves them, counts 1 download event.
 *      THE NEGATIVE CONTROL removes `allow-downloads` from the frame's
 *      attribute (the sandbox in force is the intersection of the attribute
 *      and the CSP directive, so removing it from either is enough), reloads
 *      the frame, and the same press counts 0.
 *
 * EXPECTED: every row as written beside it; exit 1 otherwise. Chromium only.
 * `_`-PREFIXED, so `routes.mjs` does not load it as a route spec. Run it alone
 * (it holds its own dev server and its own browser), on a port of its own so it
 * never reuses another tree's server.
 */
import { launch, openPage, waitForApp } from './browser.mjs';
import { startDevServer } from './server.mjs';

const server = await startDevServer({ cwd: process.cwd(), port: 5287 });
if (server.alreadyRunning) {
	console.error('something already answers on 5287; refusing to measure a server this run did not start');
	process.exit(1);
}
const { browser } = await launch();
let wrong = 0;
const check = (label, got, want) => {
	const ok = got === want;
	if (!ok) wrong++;
	console.log(`${ok ? 'ok ' : 'BAD'}  ${label}: ${got}${ok ? '' : `   (expected ${want})`}`);
};

const FRAME = 'iframe[data-hx-frame]';

try {
	console.log(`Chromium ${browser.version()}  server ${server.origin}`);
	for (const width of [375, 1440]) {
		console.log(`\n-- ${width}px --`);
		const { page, context } = await openPage(browser, { width });
		await page.goto(`${server.origin}/dev/html-assignment?doc=photo`, { waitUntil: 'domcontentloaded' });
		await waitForApp(page);
		await page.waitForFunction(() => !!document.querySelector('[data-hx-image-box]'), null, { timeout: 30000 });
		const doc = page.frameLocator(FRAME);

		const read = () =>
			page.evaluate(() => {
				const over = document.querySelector('.hx-image-over');
				const host = document.querySelector('.hx-frame-box');
				let matches = 'absent';
				if (over && host) {
					const asked = over.getAttribute('data-hx-image-box').split(',').map(Number);
					const o = over.getBoundingClientRect();
					const h = host.getBoundingClientRect();
					const drawn = [o.left - h.left - host.clientLeft, o.top - h.top - host.clientTop, o.width, o.height];
					matches = String(drawn.every((v, i) => Math.abs(v - asked[i]) <= 0.5)) + ' ' + asked.join(',');
				}
				return {
					over: document.querySelectorAll('[data-testid="hx-image-over"]').length,
					strip: document.querySelectorAll('.hx-images').length,
					thumbs: document.querySelectorAll('.hx-image-thumb').length,
					matches,
					scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth
				};
			});
		const note = () => doc.locator('#box-state').textContent();

		let r = await read();
		check('picture over the box', r.over, 1);
		check('list under the frame', r.strip, 0);
		check('drawn at the asked rectangle', r.matches.split(' ')[0], 'true');
		console.log(`     asked rectangle ${r.matches.split(' ')[1] ?? '-'}`);
		check('horizontal overflow px', r.scrollX, 0);
		await doc.locator('#box-state').filter({ hasText: 'shown=true' }).waitFor({ timeout: 10000 }).catch(() => {});
		check('the document heard', (await note()).trim(), 'answer photo shown=true');

		/* WITHDRAWAL: a trusted press inside the document. */
		await doc.locator('#hide').click();
		await page.waitForFunction(() => document.querySelectorAll('[data-testid="hx-image-over"]').length === 0, null, { timeout: 10000 }).catch(() => {});
		r = await read();
		check('after Hide: picture over the box', r.over, 0);
		check('after Hide: list under the frame', r.strip, 1);
		check('after Hide: thumbnails in the list', r.thumbs, 1);
		await doc.locator('#box-state').filter({ hasText: 'shown=false' }).waitFor({ timeout: 10000 }).catch(() => {});
		check('after Hide: the document heard', (await note()).trim(), 'answer photo shown=false');

		await doc.locator('#hide').click();
		await page.waitForFunction(() => document.querySelectorAll('[data-testid="hx-image-over"]').length === 1, null, { timeout: 10000 }).catch(() => {});
		r = await read();
		check('after Show: picture over the box', r.over, 1);
		check('after Show: list under the frame', r.strip, 0);
		check('after Show: drawn at the asked rectangle', r.matches.split(' ')[0], 'true');

		/* THE FIXTURE'S OWN DOWNLOAD BUTTON, under the constant. */
		const attr = await page.locator(FRAME).getAttribute('sandbox');
		console.log(`     frame sandbox: ${attr}`);
		let downloads = 0;
		const onDownload = () => downloads++;
		page.on('download', onDownload);
		await doc.locator('#download').click();
		await page.waitForTimeout(1500);
		check('in-document Download, under HX_SANDBOX_FLAGS', downloads, 1);

		/* THE NEGATIVE CONTROL: the same set without allow-downloads, frame reloaded. */
		downloads = 0;
		await page.evaluate((sel) => {
			const f = document.querySelector(sel);
			f.setAttribute('sandbox', f.getAttribute('sandbox').split(/\s+/).filter((t) => t !== 'allow-downloads').join(' '));
			f.setAttribute('src', f.getAttribute('src'));
		}, FRAME);
		await doc.locator('#download').waitFor({ timeout: 15000 });
		await page.waitForTimeout(500);
		await doc.locator('#download').click();
		await page.waitForTimeout(1500);
		check('in-document Download, allow-downloads removed', downloads, 0);
		page.off('download', onDownload);
		await context.close();
	}
} finally {
	await browser.close();
	await server.stop();
}
console.log(wrong === 0 ? '\nevery row as expected' : `\n${wrong} row(s) not as expected`);
process.exit(wrong === 0 ? 0 : 1);
