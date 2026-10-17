/**
 * THE HOME HEADER GIVES WAY ONCE, AND ONLY WHERE IT DOES NOT FIT (ledger 0396,
 * review round 2 and review polish D): as the window narrows, the
 * lines-of-code readout goes first, then the Install app key's word, neither
 * ever comes back at a narrower width, and neither goes at a width where it
 * fits there and at every wider width.
 *
 * IT IS `_`-PREFIXED, so `routes.mjs` does not pick it up as a route spec: a
 * route spec opens one page per width, and this question is about every width
 * one page passes through. It resizes ONE page from 1440 to 320 in 10px steps
 * (and back up, with `--up`), on the real home page (`/dev/home-order`), with
 * the browser's offer made so the key is in the row, for a student with one
 * class, a student with two (the chip reads "2 classes"), a teacher, a teacher
 * who is an admin, and a signed-out visitor.
 *
 *   node tools/browser-verify/_home-header-sweep.mjs [--port 5288] [--up] [--step 10] [--case teacher,student]
 *
 * Each case prints its widths as runs, `W`/`i` for the key's word or icon and
 * `L`/`-` for the readout drawn or not: a student reads
 * `1440-1040:WL 1030-800:W- 790-320:i-`. At every width it also lays the REAL
 * header out (wrapping allowed, as a reader sees it) with the word and with
 * the icon, and with the readout and without, and reads whether each costs
 * the header anything (taller, sideways overflow, more of the chip cut, two
 * controls overlapping). It exits 1 when any case has
 *   - the word or the readout back at a narrower width than one it was gone at,
 *   - the key's icon beside a drawn readout (the readout goes first),
 *   - the word (or the readout) drawn where it costs the real header something,
 *   - the icon (or no readout) where the word (or the readout) costs nothing
 *     at that width AND at every wider width the sweep read,
 *   - a control running past the header's content box, or the page scrolling
 *     sideways, at any width.
 *
 * Measured before round 2, a student's case read `1440-1040:WL 1030-970:iL
 * 960-900:W- 890-870:iL 860-800:W- 790-770:i- 760-750:W- 740-680:i- 670-630:W-
 * 620-530:i- 520-510:W- 500-320:i-`; after round 2 (every width read against
 * the desktop row squeezed to the window) a teacher's key was its icon from
 * 660px down although the word fits on a phone's second row.
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
const port = Number(flag('--port', '5288'));
const step = Number(flag('--step', '10'));
const up = args.includes('--up');
const only = flag('--case', '')
	.split(',')
	.map((c) => c.trim())
	.filter(Boolean);

const CASES = {
	student: '/dev/home-order?role=student&classes=1&rows=3',
	'student x2': '/dev/home-order?role=student&classes=2&rows=3',
	teacher: '/dev/home-order?role=teacher&classes=1&rows=3',
	admin: '/dev/home-order?role=teacher&classes=1&rows=3&admin=1',
	'signed out': '/dev/home-order?signedout=1'
};

/** Chromium's offer, as the install specs make it (routes/_install-key.mjs). */
const OFFER = `() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve({ outcome: 'dismissed', platform: 'web' }); e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' }); window.dispatchEvent(e); return e.defaultPrevented; }`;

const READ = `() => {
	const h = document.querySelector('.legacy-index header');
	const key = h.querySelector('.install-key');
	const word = key && key.querySelector('.ia-word');
	const loc = h.querySelector('.header-left .loc');
	const box = () => {
		const cs = getComputedStyle(h);
		const b = h.getBoundingClientRect();
		const left = b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
		const right = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
		let over = h.scrollWidth - h.clientWidth;
		const els = [...h.querySelectorAll('.header-left, .header-tools > *, .auth-block')].filter((el) => el.getClientRects().length);
		const rects = els.map((el) => ({ el, r: el.getBoundingClientRect() }));
		for (const { r } of rects) over = Math.max(over, r.right - right, left - r.left);
		let overlap = false;
		for (let i = 0; i < rects.length; i++)
			for (let j = i + 1; j < rects.length; j++) {
				const a = rects[i], c = rects[j];
				if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
				const x = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left);
				const y = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
				if (x > 0.5 && y > 0.5) overlap = true;
			}
		const chip = h.querySelector('.class-chip-text');
		return { height: b.height, over: Math.max(0, over), clipped: chip ? chip.scrollWidth - chip.clientWidth : 0, overlap };
	};
	const shown = {
		w: innerWidth,
		key: !!key,
		word: !!word && word.getBoundingClientRect().width > 2,
		loc: !!loc && loc.getClientRects().length > 0
	};
	const now = box();
	/* The real header, wrapping allowed, in each arrangement: set and put back in this one task. */
	const fit = key ? key.dataset.fit : undefined;
	const ro = h.dataset.readout;
	const lay = (w, l) => {
		if (key) key.dataset.fit = w ? 'full' : 'compact';
		h.dataset.readout = l ? 'shown' : 'hidden';
		return box();
	};
	const compact = lay(false, false);
	const costs = (r) => !(r.height <= compact.height + 0.5 && r.over <= compact.over + 0.5 && r.clipped <= compact.clipped + 0.5 && (!r.overlap || compact.overlap));
	const wordCosts = key ? costs(lay(true, false)) : false;
	const readoutDrawsHere = !!loc && (lay(true, true), loc.getClientRects().length > 0);
	const readoutCosts = readoutDrawsHere ? costs(lay(!!key, true)) : true;
	if (key) key.dataset.fit = fit;
	h.dataset.readout = ro;
	return {
		...shown,
		wordCosts,
		readoutDraws: readoutDrawsHere,
		readoutCosts,
		over: +now.over.toFixed(1),
		doc: document.documentElement.scrollWidth - innerWidth
	};
}`;

const server = await startDevServer({ port, cwd: process.cwd() });
if (server.alreadyRunning) {
	console.error(`port ${port} already has a server, which may be another checkout's: refusing to measure it`);
	process.exit(2);
}
const { browser, executablePath } = await launch();
let exitCode = 0;
try {
	console.log(`browser ${executablePath}, server ${server.origin}, ${up ? '320 up to 1440' : '1440 down to 320'} in ${step}px steps`);
	for (const [name, path] of Object.entries(CASES).filter(([n]) => !only.length || only.includes(n))) {
		const first = up ? 320 : 1440;
		const context = await browser.newContext({ viewport: { width: first, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
		await context.addInitScript(() => {
			try {
				localStorage.setItem('idea_tour_seen', 'skip');
			} catch {}
		});
		const page = await context.newPage();
		await page.route(
			(url) => !(url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
			(r) => r.abort()
		);
		await page.goto(`${server.origin}${path}`, { waitUntil: 'domcontentloaded' });
		await waitForApp(page);
		await page.waitForFunction(() => typeof window.__ideaInstall?.notify === 'function', null, { timeout: 45000 });
		await page.addStyleTag({ content: '.harness-strip { display: none !important; }' });
		/* A first visit may still get the orientation tour; close it as a visitor would. */
		for (let i = 0; i < 20; i++) {
			const x = await page.$('[data-testid="tour-close"]');
			if (x) await x.click().catch(() => {});
			await page.waitForTimeout(100);
		}
		await page.evaluate(`(${OFFER})()`);
		await page.waitForSelector('.legacy-index header .install-key', { timeout: 10000 });
		if (name !== 'signed out') await page.waitForSelector('.legacy-index header .qn-home', { state: 'attached', timeout: 10000 }).catch(() => {});
		await page.waitForTimeout(400);

		const widths = [];
		for (let w = 1440; w >= 320; w -= step) widths.push(w);
		if (up) widths.reverse();
		const rows = [];
		for (const w of widths) {
			await page.setViewportSize({ width: w, height: 800 });
			await page.waitForTimeout(120);
			rows.push(await page.evaluate(`(${READ})()`));
		}

		const sym = (r) => (r.word ? 'W' : 'i') + (r.loc ? 'L' : '-');
		const runs = [];
		for (const r of rows) {
			const s = sym(r);
			const last = runs[runs.length - 1];
			if (last && last.s === s) last.to = r.w;
			else runs.push({ s, from: r.w, to: r.w });
		}
		const problems = [];
		let wordGone = false;
		let locGone = false;
		/* Walking down from 1440: has the word (the readout) cost the real header something at this width or any wider one? */
		let wordCostAbove = false;
		let readoutCostAbove = false;
		for (const r of [...rows].sort((a, b) => b.w - a.w)) {
			wordCostAbove ||= r.wordCosts;
			readoutCostAbove ||= r.readoutDraws && r.readoutCosts;
			if (!r.key) problems.push(`no key at ${r.w}`);
			if (wordGone && r.word) problems.push(`word back at ${r.w}`);
			if (locGone && r.loc) problems.push(`readout back at ${r.w}`);
			if (!r.word && r.loc) problems.push(`icon beside the readout at ${r.w}`);
			if (r.word && r.wordCosts) problems.push(`the word drawn at ${r.w}, where it costs the header something`);
			if (r.loc && r.readoutCosts) problems.push(`the readout drawn at ${r.w}, where it costs the header something`);
			if (!r.word && !wordCostAbove) problems.push(`the icon at ${r.w}, where the word fits here and at every wider width`);
			if (r.readoutDraws && !r.loc && !readoutCostAbove) problems.push(`no readout at ${r.w}, where it fits here and at every wider width`);
			if (r.over > 0.5) problems.push(`a control ${r.over}px past the header's content box at ${r.w}`);
			if (r.doc > 0) problems.push(`the page scrolls ${r.doc}px sideways at ${r.w}`);
			if (!r.word) wordGone = true;
			if (!r.loc) locGone = true;
		}
		const ok = problems.length === 0;
		if (!ok) exitCode = 1;
		console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(11)} ${runs.map((r) => `${r.from}-${r.to}:${r.s}`).join('  ')}`);
		for (const p of problems.slice(0, 12)) console.log(`       ${p}`);
		if (problems.length > 12) console.log(`       ... and ${problems.length - 12} more`);
		await context.close();
	}
} finally {
	await browser.close();
	await server.stop();
}
process.exit(exitCode);
