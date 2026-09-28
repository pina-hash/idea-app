/**
 * THE MATRIX RAIN ON AN EMULATED PHONE (report R09, "Matrix theme not animated
 * on mobile"), read off the canvas rather than guessed.
 *
 * IT IS `_`-PREFIXED, so `routes.mjs` does not pick it up as a route spec --
 * the same rule the README states for helper modules under `routes/`. A route
 * spec runs every page at 375 and 1440 in a DESKTOP context, which is the right
 * instrument for layout and the wrong one for this question: what a phone
 * does to the rain is its frame rate, its device pixel ratio and its CPU, and
 * none of those is a width.
 *
 *   node tools/browser-verify/_rain-mobile.mjs [--route <path>] [--seconds 12]
 *        [--fps native|30] [--cpu 1|4|6] [--expect running]
 *
 * WHAT IT EMULATES. A 390x844 viewport at device pixel ratio 3 with
 * `isMobile` and `hasTouch` (Playwright's phone context), reduced motion OFF
 * (with it on the rain is SUPPOSED to hold a still, which is a different
 * report), the Matrix theme stored before the first paint, and optionally:
 *
 *   --fps 30   a 30 Hz display. `requestAnimationFrame` is wrapped so every
 *              callback lands one native frame late, which on the harness's
 *              60 Hz is a 33.3 ms interval with the browser's own vsync
 *              timestamps -- the cadence a phone in power saving delivers.
 *   --cpu N    Chromium's own CPU throttle (`Emulation.setCPUThrottlingRate`),
 *              N times slower, which is how DevTools emulates a mid-range phone.
 *
 * WHAT IT PRINTS, once a second: the canvas's `data-motion` (running, half,
 * still-slow, reduced, idle), `data-frames` (paints so far), `data-frame-ms`
 * (the mean frame the component's own slow-device judge holds), the frame
 * interval the page itself measured over that second, and how much of the
 * canvas is lit -- the fraction of pixels with alpha over 8, which is the
 * number that says whether a running field is also a VISIBLE one. Every value
 * is a measurement; there is no pass line unless `--expect` asks for one.
 *
 * DEFAULT ROUTE: `/dev/home-order?role=student&classes=1&rows=3`, the real
 * home page with a faked session. It is one of `THEME_BOOT_HARNESSES`, so the
 * theme stored by the init script below is applied before first paint exactly
 * as it is for a signed-in student.
 *
 * RUN IT ALONE. Two browsers and two dev servers on this container starve each
 * other's frames, and a frame-rate reading is the first thing that moves.
 */
import { launch, waitForApp } from './browser.mjs';
import { startDevServer } from './server.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const route = flag('--route', '/dev/home-order?role=student&classes=1&rows=3');
const seconds = Number(flag('--seconds', '12'));
const fps = flag('--fps', 'native');
const cpu = Number(flag('--cpu', '1'));
const expect = flag('--expect', '');

const server = await startDevServer({ cwd: process.cwd() });
const { browser, executablePath } = await launch();
let context;
let exitCode = 0;
try {
	context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
		reducedMotion: 'no-preference',
		userAgent:
			'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
	});
	const page = await context.newPage();
	/* Every non-loopback request is refused, exactly as `openPage` does it:
	   the proxy resets Google Fonts and an unanswered request stalls a load. */
	let blocked = 0;
	await page.route(
		(url) => !(url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
		(r) => {
			blocked++;
			return r.abort();
		}
	);
	await page.addInitScript(() => {
		try {
			localStorage.setItem('idea_site_theme', 'matrix');
		} catch {
			/* storage blocked: the theme will not apply and the read says so */
		}
	});
	if (fps === '30') {
		await page.addInitScript(() => {
			const raf = window.requestAnimationFrame.bind(window);
			const caf = window.cancelAnimationFrame.bind(window);
			const live = new Map();
			let next = 0;
			window.requestAnimationFrame = (cb) => {
				const id = ++next;
				live.set(
					id,
					raf(() => {
						live.set(
							id,
							raf((t) => {
								live.delete(id);
								cb(t);
							})
						);
					})
				);
				return id;
			};
			window.cancelAnimationFrame = (id) => {
				const inner = live.get(id);
				if (inner !== undefined) caf(inner);
				live.delete(id);
			};
		});
	}
	if (cpu > 1) {
		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
	}

	await page.goto(`${server.origin}${route}`, { waitUntil: 'domcontentloaded' });
	const ready = await waitForApp(page);

	/* The page measures its own frame interval, through the same (possibly
	   wrapped) requestAnimationFrame the rain uses. */
	await page.evaluate(() => {
		const w = window;
		w.__rainFrames = [];
		let last = 0;
		const tick = (t) => {
			if (last) w.__rainFrames.push(t - last);
			last = t;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});

	const env = await page.evaluate(() => ({
		theme: document.documentElement.getAttribute('data-theme'),
		dpr: window.devicePixelRatio,
		width: window.innerWidth,
		height: window.innerHeight,
		reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
		coarse: matchMedia('(pointer: coarse)').matches,
		bgFx: (() => {
			const fx = document.querySelector('.bg-fx');
			return fx ? getComputedStyle(fx).display : 'ABSENT';
		})()
	}));
	console.log(`chromium ${executablePath}`);
	console.log(`route ${route}  app ready ${ready.hydrated} in ${ready.waitedMs}ms  external requests blocked ${blocked}`);
	console.log(
		`emulated: ${env.width}x${env.height} dpr ${env.dpr} coarse pointer ${env.coarse} reduced motion ${env.reduce}  fps ${fps}  cpu x${cpu}`
	);
	console.log(`theme ${env.theme ?? '(none)'}  .bg-fx display ${env.bgFx}`);
	console.log('');
	console.log(' t(s)  data-motion   frames  frame-ms(judge)  frame-ms(page)  lit px   canvas');

	let last = null;
	for (let s = 1; s <= seconds; s++) {
		await page.waitForTimeout(1000);
		const row = await page.evaluate(() => {
			const w = window;
			const frames = w.__rainFrames.splice(0);
			const mean = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : NaN;
			const c = document.querySelector('.bg-fx canvas.matrix-rain');
			if (!c) return { motion: 'NO CANVAS', frames: '-', judge: '-', page: mean, lit: NaN, size: '-' };
			let lit = NaN;
			try {
				const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
				let n = 0;
				for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
				lit = (100 * n) / (d.length / 4);
			} catch {
				/* a context lost mid-read reads as NaN, never as zero */
			}
			return {
				motion: c.dataset.motion ?? '(none)',
				frames: c.dataset.frames ?? '0',
				judge: c.dataset.frameMs ?? '-',
				page: mean,
				lit,
				size: `${c.width}x${c.height}`
			};
		});
		last = row;
		console.log(
			`${String(s).padStart(5)}  ${row.motion.padEnd(12)} ${String(row.frames).padStart(7)}  ${String(row.judge).padStart(15)}  ${
				Number.isFinite(row.page) ? row.page.toFixed(1).padStart(14) : '             -'
			}  ${Number.isFinite(row.lit) ? (row.lit.toFixed(2) + '%').padStart(7) : '      -'}   ${row.size}`
		);
	}
	console.log('');
	console.log(`final data-motion: ${last?.motion ?? '(no reading)'}`);
	if (expect && last?.motion !== expect) {
		console.log(`EXPECTED ${expect}`);
		exitCode = 1;
	}
} finally {
	await context?.close().catch(() => {});
	await browser.close();
	await server.stop();
}
process.exit(exitCode);
