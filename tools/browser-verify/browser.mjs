/**
 * Browser launch + page setup for the verification harness.
 *
 * The container ships a Chromium that playwright-core resolves through
 * PLAYWRIGHT_BROWSERS_PATH. It is NOT downloadable here (the agent proxy
 * answers 403 to CONNECT for cdn.playwright.dev), so the resolution order
 * below ends at an explicit path rather than at an install step.
 */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

/** Fallbacks in order. The first that exists wins; all are reported. */
export const EXECUTABLE_CANDIDATES = [
	() => {
		try {
			return chromium.executablePath();
		} catch {
			return null;
		}
	},
	() => process.env.CHROMIUM_PATH || null,
	() => '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
	() => '/opt/pw-browsers/chromium/chrome-linux/chrome',
	() => '/usr/bin/chromium',
	() => '/usr/bin/google-chrome'
];

export function resolveExecutable() {
	const tried = [];
	for (const get of EXECUTABLE_CANDIDATES) {
		const p = get();
		if (!p) continue;
		const ok = existsSync(p);
		tried.push({ path: p, exists: ok });
		if (ok) return { path: p, tried };
	}
	return { path: null, tried };
}

/**
 * Chromium here has no dbus and no GPU. --no-sandbox is required because the
 * container runs as root; --disable-dev-shm-usage avoids a 64MB /dev/shm.
 */
export const LAUNCH_ARGS = [
	'--no-sandbox',
	'--disable-dev-shm-usage',
	'--disable-gpu',
	'--no-first-run',
	'--no-default-browser-check',
	'--disable-features=Translate,MediaRouter'
];

export async function launch() {
	const { path, tried } = resolveExecutable();
	if (!path) {
		const lines = tried.map((t) => `  ${t.exists ? 'present' : 'missing'}  ${t.path}`).join('\n');
		throw new Error(`No Chromium binary found. Candidates tried:\n${lines}`);
	}
	const browser = await chromium.launch({ executablePath: path, args: LAUNCH_ARGS });
	return { browser, executablePath: path };
}

/**
 * Freeze TRANSITIONS only.
 *
 * CLAUDE.md: a transitioned property reports its pre-transition value forever
 * in a non-compositing pane, and a transitioned layout property leaves the
 * layout stuck at the old value. Killing `animation` as well is the documented
 * mistake -- it freezes entrance animations at frame 0, so six real elements
 * come back at opacity 0 and read as six failures. Animations are left to run
 * and the page is settled on a timeout instead.
 */
export const FREEZE_TRANSITIONS_CSS = '*, *::before, *::after { transition: none !important; }';

export async function openPage(browser, { width, height = 900, freezeTransitions = true, blockExternal = true }) {
	const context = await browser.newContext({
		viewport: { width, height },
		deviceScaleFactor: 1,
		reducedMotion: 'no-preference'
	});
	const page = await context.newPage();

	/* Block every non-loopback request.
	 *
	 * The agent proxy resets fonts.googleapis.com, and an unanswered request
	 * hangs the page's load state until it does -- 8s per page, measured. It
	 * also makes the run non-deterministic: whether a webfont arrived changes
	 * text metrics, and this harness reports tap-target GEOMETRY. Blocking is
	 * both faster and more honest, and every block is COUNTED and reported so
	 * "the type here is the fallback stack" is never a silent condition. */
	const blockedExternal = [];
	if (blockExternal) {
		/* A PREDICATE, not a match-everything glob. Globbing every URL sends
		   each vite dev module request out to this Node handler and back; the
		   predicate form lets Chromium serve loopback on its own fast path. */
		await page.route(
			(url) => !(url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
			(route) => {
				blockedExternal.push(route.request().url());
				return route.abort();
			}
		);
	}

	/** Console + uncaught errors, collected for the whole page lifetime. */
	const consoleErrors = [];
	const consoleWarnings = [];
	page.on('console', (msg) => {
		const entry = { type: msg.type(), text: msg.text(), url: page.url() };
		if (msg.type() === 'error') consoleErrors.push(entry);
		else if (msg.type() === 'warning') consoleWarnings.push(entry);
	});
	page.on('pageerror', (err) => {
		consoleErrors.push({ type: 'pageerror', text: `${err.name}: ${err.message}`, url: page.url() });
	});
	/* A request the harness itself aborted is not a page defect. It is counted
	   in blockedExternal and reported there; repeating it as a failure (and as
	   a console error) manufactures a finding out of our own policy. */
	const requestFailures = [];
	page.on('requestfailed', (req) => {
		if (blockedExternal.includes(req.url())) return;
		requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? 'unknown' });
	});

	return { context, page, consoleErrors, consoleWarnings, requestFailures, blockedExternal, freezeTransitions };
}

/**
 * Wait for the SvelteKit app to actually be on screen.
 *
 * `domcontentloaded` is not enough and the failure is SILENT: /dev/pathways
 * answered HTTP 200 with a 1099-byte shell, every selector matched 0 nodes,
 * and the console was clean -- which reads exactly like a page whose markup
 * changed. Vite dev compiles the module graph on first request, so the first
 * visit to a route is far slower than the rest of the run.
 *
 * PAINT IS NOT INTERACTIVITY, AND NO WINDOW MARKER SEPARATES THEM. The
 * server-rendered markup is on screen before hydration attaches a single
 * handler, and the `__SVELTEKIT_*` globals are set by the client entry module
 * BEFORE that too -- measured: every global present at 600ms on /dev/spec-table
 * while two clicks in a row still did nothing, and the same single click taking
 * effect at 2500ms. So this function reports READABILITY, which is all a
 * measurement needs, and anything that CLICKS retries against its own effect
 * (see `clickUntil`) rather than trusting a timer.
 */
export async function waitForApp(page, { timeoutMs = 45_000 } = {}) {
	const started = Date.now();
	try {
		await page.waitForFunction(
			() => {
				const body = document.body;
				if (!body) return false;
				const el = body.querySelector('main, h1, [data-testid], .harness') || body.firstElementChild;
				if (!el) return false;
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.height > 0 && (body.innerText || '').trim().length > 0;
			},
			{ timeout: timeoutMs, polling: 100 }
		);
		/* Then wait for the DOM to STOP CHANGING, which is what hydration
		   finishing actually looks like from outside. `networkidle` was the
		   first attempt and was wrong twice over: vite keeps an HMR socket
		   open, and the blocked Google Fonts request hangs until it resets,
		   so every page paid the full 8s cap and one run took 305 SECONDS. */
		const stable = await page
			.waitForFunction(
				({ polls }) => {
					const w = window;
					const sig =
						document.getElementsByTagName('*').length +
						':' +
						(document.body.innerText || '').length +
						':' +
						document.querySelectorAll('[aria-expanded="true"]').length +
						':' +
						Math.round(document.body.getBoundingClientRect().height);
					if (w.__bvSig === sig) w.__bvSigCount = (w.__bvSigCount || 0) + 1;
					else { w.__bvSig = sig; w.__bvSigCount = 0; }
					return w.__bvSigCount >= polls;
				},
				{ polls: 3 },
				{ timeout: 12_000, polling: 120 }
			)
			.then(() => true)
			.catch(() => false);
		return { hydrated: true, domStable: stable, waitedMs: Date.now() - started };
	} catch {
		return { hydrated: false, domStable: false, waitedMs: Date.now() - started };
	}
}

/**
 * Click something and keep clicking until it demonstrably worked.
 *
 * There is no reliable "hydration finished" signal to wait on (see above), so
 * the effect is the signal. `until` is a predicate evaluated in the page; the
 * ATTEMPT COUNT is returned and printed, because a step that needed four tries
 * is telling you something about the surface that a silent success would not.
 */
export async function clickUntil(page, selector, until, { attempts = 12, gapMs = 300 } = {}) {
	const matched = await page.locator(selector).count();
	if (matched === 0) return { ok: false, matched: 0, attempts: 0, reason: 'no match' };

	/* `page.evaluate(string)` treats the string as an EXPRESSION, so the arrow
	   function source handed in here evaluated to a FUNCTION OBJECT and was
	   never `=== true`. Every prepare step reported twelve failed attempts
	   while the clicks underneath were working perfectly. Invoke it. */
	const satisfied = async () => {
		if (!until) return null;
		try {
			return (await page.evaluate(`(${until})()`)) === true;
		} catch {
			return false;
		}
	};
	if ((await satisfied()) === true) return { ok: true, matched, attempts: 0, reason: 'already satisfied' };

	for (let i = 1; i <= attempts; i++) {
		try {
			await page.locator(selector).first().click({ timeout: 5000 });
		} catch (e) {
			await page.waitForTimeout(gapMs);
			continue;
		}
		await page.waitForTimeout(gapMs);
		const s = await satisfied();
		if (s === null) return { ok: true, matched, attempts: i, reason: 'clicked (no predicate given)' };
		if (s === true) return { ok: true, matched, attempts: i, reason: 'predicate satisfied' };
	}
	return { ok: false, matched, attempts, reason: 'predicate never satisfied' };
}

/**
 * Wait for a page-side predicate to hold, and REPORT HOW LONG IT TOOK.
 *
 * `clickUntil` covers a state reached by pressing something. This covers the
 * other case, which the harness had no answer for: a state reached by an ASYNC
 * PAYLOAD LANDING, where there is nothing to press and pressing something
 * arbitrary to get a retry loop is a lie about what the step is doing.
 *
 * IT IS NOT A LONGER `settleMs`, AND THE DIFFERENCE IS THE WHOLE POINT. A fixed
 * timeout that happens to be long enough today measures an empty page the day
 * the payload gets slower, silently, because every selector simply matches
 * nothing and the checks report honest zeros about a surface that had not
 * finished loading. MEASURED on /dev/notebook-review: the FIRST visit to a
 * route pays vite's module-graph compile, and the compliance grid's transport
 * had not resolved 700ms after `waitForApp` returned -- 30 cells at 1440px
 * (the warm second visit) against 0 cells at 375px (the cold first one), which
 * reads exactly like a surface that renders no grid at phone width and is
 * nothing of the kind. Warm, both widths render the identical 30 cells.
 *
 * A predicate that never holds returns `ok: false` and the caller PRINTS
 * FAILED, so the measurements that follow are read as describing a state the
 * run never reached, rather than as a finding about the surface.
 */
export async function waitUntil(page, until, { timeoutMs = 15_000, pollMs = 100 } = {}) {
	const started = Date.now();
	/* Same expression trap as `clickUntil`: `page.evaluate(string)` evaluates
	   its argument as an EXPRESSION, so an arrow-function source handed over
	   bare becomes a function OBJECT and is never `=== true`. Invoke it. */
	const satisfied = async () => {
		try {
			return (await page.evaluate(`(${until})()`)) === true;
		} catch {
			return false;
		}
	};
	if (await satisfied()) return { ok: true, waitedMs: 0, reason: 'already satisfied' };
	while (Date.now() - started < timeoutMs) {
		await page.waitForTimeout(pollMs);
		if (await satisfied()) return { ok: true, waitedMs: Date.now() - started, reason: 'predicate satisfied' };
	}
	return { ok: false, waitedMs: Date.now() - started, reason: `predicate never satisfied within ${timeoutMs}ms` };
}

/** Settle on a TIMEOUT, never on rAF -- see the harness README. */
export async function settle(page, { freezeTransitions = true, settleMs = 700 } = {}) {
	if (freezeTransitions) await page.addStyleTag({ content: FREEZE_TRANSITIONS_CSS });
	await page.waitForTimeout(settleMs);
}
