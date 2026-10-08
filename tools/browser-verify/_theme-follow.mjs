/**
 * EVERY OPEN WINDOW FOLLOWS A THEME CHANGE (bug 145c0352, "When I change light
 * theme projector view theme should change with. When the projector view is
 * live."), driven with FOUR PAGES OF ONE BROWSER CONTEXT -- one origin, one
 * `localStorage`, so a press in one page fires a real `storage` event in the
 * others, exactly as the classroom's control view and its projector window do.
 *
 * IT IS `_`-PREFIXED, so `routes.mjs` does not pick it up as a route spec: a
 * route spec opens ONE page per width, and this question needs several pages
 * sharing a store.
 *
 *   node tools/browser-verify/_theme-follow.mjs [--port 5287] [--expect follow]
 *
 * THE PAGES:
 *   A  /dev/theme-switch                                the real one-tap switch, signed in
 *   B  /dev/classroom-projector?demo=clock&session=1    the projector, signed in
 *   C  /dev/classroom-projector?demo=clock              the projector, signed OUT
 *   D  /dev/theme-switch                                a second control window
 *
 * THE STEPS, each a real action in one page and a read of every page after it:
 *   0  at load: no theme anywhere
 *   1  A presses Light (the shipping `toggleLightTheme`): B and D follow to
 *      Space White, C stays unthemed (the session gate)
 *   2  D presses Light off: A and B follow back (the other direction: a change
 *      made in a window that was itself following)
 *   3  A writes an unrelated key (the projector's frame slot): nothing moves
 *   4  A's profile store gets Matrix (the same write ProfileMenu's row makes):
 *      B follows to Matrix, C stays unthemed
 *   5  A removes the key (how turning a theme off is stored): B follows off
 *
 * Every row prints each page's `data-theme` and how long the follower took.
 * `--expect follow` makes it exit 1 on any row that is not the expected one,
 * which is how a mutation (the listener removed) is shown to redden it.
 *
 * RUN IT ALONE, through the one browser slot.
 */
import { launch, waitForApp } from './browser.mjs';
import { startDevServer } from './server.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const port = Number(flag('--port', '5287'));
const expect = flag('--expect', '');

const PAGES = {
	A: '/dev/theme-switch',
	B: '/dev/classroom-projector?demo=clock&session=1',
	C: '/dev/classroom-projector?demo=clock',
	D: '/dev/theme-switch'
};

const server = await startDevServer({ port, cwd: process.cwd() });
if (server.alreadyRunning) {
	console.error(`port ${port} already has a server, which may be another checkout's: refusing to measure it`);
	process.exit(2);
}
const { browser, executablePath } = await launch();
let exitCode = 0;
let context;
try {
	console.log(`browser ${executablePath}, server ${server.origin}`);
	context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
	const pages = {};
	for (const [name, path] of Object.entries(PAGES)) {
		const page = await context.newPage();
		await page.route(
			(url) => !(url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
			(r) => r.abort()
		);
		await page.goto(`${server.origin}${path}`, { waitUntil: 'domcontentloaded' });
		await waitForApp(page);
		pages[name] = page;
	}
	/* Hydration: the switch is a hydrated button, and the projector has painted
	   its clock. Waited for explicitly rather than on a timer. */
	await pages.A.waitForFunction(() => !!document.querySelector('[data-testid="theme-switch"]'), null, { timeout: 30000 });
	await pages.D.waitForFunction(() => !!document.querySelector('[data-testid="theme-switch"]'), null, { timeout: 30000 });
	for (const p of [pages.B, pages.C]) {
		await p.waitForFunction(() => /\d:\d\d/.test(document.querySelector('[data-testid="projector-clock"]')?.textContent || ''), null, { timeout: 30000 });
	}
	await new Promise((r) => setTimeout(r, 1500));

	const attrOf = (p) => p.evaluate(() => document.documentElement.getAttribute('data-theme') || 'none');
	const readAll = async () => {
		const out = {};
		for (const [name, p] of Object.entries(pages)) out[name] = await attrOf(p);
		return out;
	};
	/** Wait up to 5s for each named page to reach its attribute, and time it. */
	const settleTo = async (want) => {
		const t0 = Date.now();
		const times = {};
		for (const [name, value] of Object.entries(want)) {
			try {
				await pages[name].waitForFunction(
					(v) => (document.documentElement.getAttribute('data-theme') || 'none') === v,
					value,
					{ timeout: 5000 }
				);
				times[name] = Date.now() - t0;
			} catch {
				times[name] = null;
			}
		}
		/* The signed-out page is EXPECTED to stay put, so it is given the same
		   wait as the slowest follower before it is read. */
		await new Promise((r) => setTimeout(r, 800));
		return times;
	};

	const rows = [];
	const step = async (n, what, act, want) => {
		await act();
		const times = await settleTo(want);
		const got = await readAll();
		const ok = Object.entries(want).every(([k, v]) => got[k] === v);
		rows.push({ n, what, got, want, ok, times });
		const cell = (k) => `${k}=${got[k]}${times[k] != null && k !== 'C' ? ` (${times[k]}ms)` : ''}`;
		console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}  ${what.padEnd(58)} ${['A', 'B', 'C', 'D'].map(cell).join('  ')}`);
	};

	const press = (p) => () => p.click('[data-testid="theme-switch"]');
	const write = (p, op) => () => p.evaluate(op);

	await step(0, 'at load', async () => {}, { A: 'none', B: 'none', C: 'none', D: 'none' });
	await step(1, 'A presses Light', press(pages.A), { A: 'space-white', B: 'space-white', C: 'none', D: 'space-white' });
	await step(2, 'D presses Light off', press(pages.D), { A: 'none', B: 'none', C: 'none', D: 'none' });
	await step(
		3,
		'A writes an unrelated key (NEGATIVE CONTROL)',
		write(pages.A, () => localStorage.setItem('idea_live_projector:harness-teacher:s-live:follow', String(Date.now()))),
		{ A: 'none', B: 'none', C: 'none', D: 'none' }
	);
	await step(
		4,
		"A's store gets Matrix (ProfileMenu's write)",
		write(pages.A, () => localStorage.setItem('idea_site_theme', 'matrix')),
		/* A itself made the write, so A hears no event: only the others follow. */
		{ A: 'none', B: 'matrix', C: 'none', D: 'matrix' }
	);
	await step(5, 'A removes the key (turned off)', write(pages.A, () => localStorage.removeItem('idea_site_theme')), {
		A: 'none',
		B: 'none',
		C: 'none',
		D: 'none'
	});

	const passed = rows.filter((r) => r.ok).length;
	console.log('');
	console.log(`${passed} of ${rows.length} steps as expected`);
	const followed = rows.flatMap((r) => ['B', 'D'].map((k) => r.times[k])).filter((t) => typeof t === 'number');
	if (followed.length) console.log(`follow latency (B and D, incl. polling): max ${Math.max(...followed)}ms`);
	if (expect === 'follow' && passed !== rows.length) {
		console.log('EXPECTED every step');
		exitCode = 1;
	}
} finally {
	await context?.close().catch(() => {});
	await browser.close();
	await server.stop();
}
process.exit(exitCode);
