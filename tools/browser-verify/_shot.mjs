/**
 * RASTERIZE A /dev ROUTE AND WRITE A PNG, so a session can LOOK at the surface
 * rather than only measure it.
 *
 * IT IS `_`-PREFIXED, so `routes.mjs` does not pick it up as a route spec --
 * the same rule the README states for helper modules under `routes/`.
 *
 * WHY IT EXISTS. Ledger 0196 reported 60 measurements and 0 outside threshold
 * on this very surface and then found THREE real defects by rasterizing it and
 * looking: a stored id printed as a value, a list hanging below its pane, and
 * two labels flush against their own border. A green check is a claim about the
 * question it asked, and none of those three questions had been asked. This
 * makes the looking one command instead of a scratch script each time.
 *
 * THE PREPARE STEPS ARE THE SPEC'S OWN, passed as JSON, so the picture is of
 * the state the spec measured rather than of a state reached some other way. A
 * screenshot of a surface the checks never saw proves nothing about them.
 *
 *   node tools/browser-verify/_shot.mjs <spec-filename> <width> <out.png>
 *
 * The spec is read from `routes/`, and its own `path` and `prepare` are used --
 * so the picture cannot be of a state reached some other way than the one the
 * checks ran against.
 */
import { writeFileSync } from 'node:fs';
import { launch, openPage, waitForApp, settle, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';

const [, , specName, widthArg, out, ...flags] = process.argv;
const fullPage = flags.includes('--full');
const scrollTo = (flags.find((f) => f.startsWith('--scroll=')) ?? '').slice(9);
const width = Number(widthArg);
const spec = (await import(`./routes/${specName.replace(/\.mjs$/, '')}.mjs`)).default;
const routePath = spec.path;
const prepare = spec.prepare ?? [];

const server = await startDevServer({ cwd: process.cwd() });
const { browser } = await launch();
let context;
try {
	const opened = await openPage(browser, { width, height: width < 500 ? 780 : 900 });
	context = opened.context;
	const page = opened.page;
	await page.goto(`${server.origin}${routePath}`, { waitUntil: 'domcontentloaded' });
	await waitForApp(page);
	/* THE `(${expr})()` WRAPPING IS THE HARNESS'S OWN, and `waitUntil` already
	   carries it: `page.evaluate(string)` evaluates its argument as an
	   EXPRESSION, so an arrow-function source handed over bare becomes a
	   function OBJECT that is never called and never `=== true`. Writing a
	   second copy of that workaround here is exactly how one stops matching --
	   and it cost this script two silent screenshots of the wrong state, which
	   is the failure it was written to prevent. */
	for (const step of prepare) {
		if (step.waitFor) {
			const r = await waitUntil(page, step.waitFor, { timeoutMs: 30_000 });
			if (!r.ok) throw new Error(`prepare waitFor never held: ${step.waitFor}`);
		}
		if (step.evaluate) await page.evaluate(`(${step.evaluate})()`);
	}
	await settle(page);
	// SAY WHAT IS ON SCREEN. A screenshot of the wrong state is the one failure
	// this script cannot report by looking like it worked.
	const seen = await page.evaluate(`(() => ({
		timeline: !!document.querySelector('[data-testid="ideacad-timeline"]'),
		rows: document.querySelectorAll('[data-testid="ideacad-timeline-row"]').length,
		whos: [...document.querySelectorAll('.who')].map((w) => w.textContent.trim())
	}))()`);
	console.log('  state:', JSON.stringify(seen));
	if (scrollTo) {
		await page.evaluate(
			`(() => document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView({ block: 'start', behavior: 'instant' }))()`
		);
		await settle(page);
	}
	const buf = await page.screenshot({ fullPage });
	writeFileSync(out, buf);
	console.log(`${out}: ${buf.length} bytes at ${width}px  (${routePath})`);
} finally {
	await context?.close().catch(() => {});
	await browser.close();
	await server.stop();
}
