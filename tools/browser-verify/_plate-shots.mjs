/**
 * SCREENSHOT A LIST OF /dev ROUTES IN EVERY THEME (ledger 0346). `_`-prefixed,
 * so `routes.mjs` does not load it as a route spec. It starts a dev server or
 * reuses one on the harness port.
 *
 *   node tools/browser-verify/_plate-shots.mjs <list.json> <out-dir> <suffix> [--full] [--widths 1440,375] [--themes idea,matrix,space-white]
 *
 * `<list.json>` is an array of `{ "name": "home", "path": "/dev/home-order?..." }`,
 * optionally with `"scroll": "<css selector>"` to bring one element into view
 * before the picture. Files are written as `<name>-<theme>-<suffix>.png`, with
 * `-375` inserted before the suffix for the narrow width. `--port <n>` points
 * it at another dev server (0346 took its BEFORE pictures from a worktree of
 * `origin/main` served on a second port).
 *
 * The theme is PINNED on `<html>` from an init script, exactly as
 * `_classroom-plate-boxes.mjs` does, because a harness holds no session and
 * `ThemeRoot` clears the attribute on hydration. A scoped theme (Space White)
 * is therefore painted even on a route whose production twin is outside the
 * theme's scope; the history entry says which pictures that applies to.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { launch, openPage, waitForApp, settle, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';

const [, , listFile, outDir, suffix, ...flags] = process.argv;
const flag = (name) => {
	const i = flags.indexOf(name);
	return i >= 0 ? flags[i + 1] : null;
};
const full = flags.includes('--full');
const widths = (flag('--widths') ?? '1440').split(',').map(Number);
const themes = (flag('--themes') ?? 'idea,matrix,space-white').split(',');
const list = JSON.parse(readFileSync(listFile, 'utf8'));
mkdirSync(outDir, { recursive: true });

const pin = (theme) =>
	`(() => { const t = ${JSON.stringify(theme)}; const apply = () => { const h = document.documentElement; if (!h) return; if (t === 'idea') { if (h.hasAttribute('data-theme')) h.removeAttribute('data-theme'); } else if (h.getAttribute('data-theme') !== t) h.setAttribute('data-theme', t); }; const iv = setInterval(apply, 40); setTimeout(() => clearInterval(iv), 60000); apply(); })()`;

const port = Number(flag('--port') ?? 5199);
const server = await startDevServer({ cwd: process.cwd(), port });
const { browser } = await launch();
try {
	for (const item of list) {
		for (const width of widths) {
			for (const theme of themes) {
				const { context, page } = await openPage(browser, { width, height: width < 500 ? 780 : 900 });
				try {
					await context.addInitScript(pin(theme));
					await page.goto(`${server.origin}${item.path}`, { waitUntil: 'domcontentloaded' });
					await waitForApp(page);
					await settle(page, { settleMs: 700 });
					await waitUntil(
						page,
						`() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity).length === 0`,
						{ timeoutMs: 6_000 }
					);
					for (const step of item.prepare ?? []) {
						if (step.evaluate) await page.evaluate(`(${step.evaluate})()`);
						await settle(page, { settleMs: 400 });
					}
					if (item.scroll) {
						await page.evaluate(
							`(() => document.querySelector(${JSON.stringify(item.scroll)})?.scrollIntoView({ block: 'start', behavior: 'instant' }))()`
						);
						await settle(page, { settleMs: 300 });
					}
					const w = width === 1440 ? '' : `-${width}`;
					const file = `${outDir}/${item.name}-${theme}${w}-${suffix}.png`;
					const buf = await page.screenshot({ fullPage: full || !!item.full });
					writeFileSync(file, buf);
					console.log(`${file} (${item.path})`);
				} catch (e) {
					console.log(`FAILED ${item.name} ${theme} ${width}: ${e.message.split('\n')[0]}`);
				} finally {
					await context.close().catch(() => {});
				}
			}
		}
	}
} finally {
	await browser.close();
	await server.stop();
}
