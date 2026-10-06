/**
 * SCREENSHOT EVERY IDEA ARMORY STATE at 1440 and 375 into docs/armory/screens/,
 * from /dev/armory?state=<name>, so the pages can be LOOKED at rather than only
 * measured. `_`-prefixed, so routes.mjs does not take it for a route spec.
 *
 *   node tools/browser-verify/_armory-shots.mjs [outdir]
 *
 * Each picture is full-page, of the real components in their real frame, and
 * the script prints what it saw (the [data-state] marks and the h1) so a
 * picture of the wrong state says so in the log.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openPage, waitForApp, settle, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';

const outDir = process.argv[2] ?? 'docs/armory/screens';
const STATES = [
	'empty', 'editing', 'synced', 'offline', 'side', 'storage-off',
	'projects', 'projects-empty', 'file-side', 'connect', 'connect-bad', 'download', 'download-none'
];
const WIDTHS = [1440, 375];

mkdirSync(outDir, { recursive: true });
const server = await startDevServer({ cwd: process.cwd() });
const { browser } = await launch();
try {
	for (const width of WIDTHS) {
		const { context, page } = await openPage(browser, { width, height: width < 500 ? 780 : 900 });
		try {
			for (const state of STATES) {
				await page.goto(`${server.origin}/dev/armory?state=${state}`, { waitUntil: 'domcontentloaded' });
				await waitForApp(page);
				await waitUntil(page, '() => !!document.querySelector("[data-armory-hydrated]")', { timeoutMs: 30_000 });
				await settle(page);
				const seen = await page.evaluate(`(() => ({
					h1: document.querySelector('h1')?.textContent?.trim(),
					states: [...document.querySelectorAll('[data-state]')].map((e) => e.getAttribute('data-state')),
					scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth
				}))()`);
				const file = `${outDir}/${state}-${width}.png`;
				writeFileSync(file, await page.screenshot({ fullPage: true }));
				console.log(`${file}  ${JSON.stringify(seen)}`);
			}
		} finally {
			await context.close().catch(() => {});
		}
	}
} finally {
	await browser.close();
	await server.stop();
}
