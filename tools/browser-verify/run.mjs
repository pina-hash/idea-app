#!/usr/bin/env node
/**
 * tools/browser-verify -- the repeatable visual pass.
 *
 *   npm run verify:browser                 both widths, every listed dev route
 *   npm run verify:browser -- --probe      environment capability probe only
 *   npm run verify:browser -- --selftest   negative controls (exits 1 if a check is broken)
 *   npm run verify:browser -- --break overflow|tiny-taps|low-contrast|invisible|console-error|blank-text|motion
 *                                          inject that defect into the REAL page and confirm the
 *                                          matching check reddens on this surface
 *   npm run verify:browser -- --route pathways --route spec-table
 *   npm run verify:browser -- --width 375
 *   npm run verify:browser -- --json out.json
 *   npm run verify:browser -- --strict     exit 1 when a measurement is outside its threshold
 *
 * Default exit code is 0 even with findings: this is a MEASURING instrument,
 * not a gate. See README.md for why it is deliberately outside `npm test`.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { launch, openPage, settle, waitForApp, clickUntil, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';
import {
	horizontalScroll,
	contrast,
	tapTargets,
	tapReach,
	presence,
	textContains,
	domOrder,
	orderResult,
	datalistOrder,
	consoleErrors,
	statePairContrast,
	motionSweep
} from './checks.mjs';
import { probeEnvironment } from './probe.mjs';
import { runSelfTest } from './selftest.mjs';
import { WIDTHS, selectRoutes, urlFor } from './routes.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Defects injected by --break, for proving a check bites on a real surface.
 * Each is the smallest thing that should move exactly one measurement.
 */
export const BREAKAGE = {
	/* Something wider than the viewport that cannot wrap.
	   THE SELECTOR NAMES EVERY ROOM WRAPPER, not just `.harness` and `main`.
	   Measured: `--break overflow` came back GREEN on /dev/hall-pass, because
	   that route's root is `div.cr-root.wrap` and the only `body > div` above it
	   is `display: contents`, which `min-width` cannot inflate. A preset that
	   silently fails to inject its defect is a live control that proves nothing
	   -- and it proves nothing in exactly the reassuring direction. */
	overflow:
		'.harness, main, .cr-root, .fg-root, .nb-root, .frc-root, .glb, .tnm-root, .gt-root, body > div { min-width: 1600px !important; }',
	/* Drop every control below the 44px floor. */
	'tiny-taps': 'button, [role="button"], a.btn { min-height: 0 !important; height: 18px !important; min-width: 0 !important; padding: 0 !important; line-height: 18px !important; }',
	/* Wash the ink out until it cannot clear 4.5:1 on its own ground. */
	'low-contrast': '* { color: color-mix(in srgb, currentColor 22%, transparent) !important; }',
	/* Present in the DOM, painted nowhere -- the case the presence check exists
	   for. Same widening as `overflow` above and for the same measured reason:
	   a preset that matches nothing on the surface being driven reports a clean
	   run and is indistinguishable from a working check. */
	invisible:
		'.harness, main, h1, table, .chip-grid, .idea-logo, .note, .cr-root, .fg-root, .nb-root, .gt-root { opacity: 0 !important; }',
	/* The compliance control for `textContains`. Every other preset here leaves
	   an element saying exactly what it said; this one empties the words and
	   leaves the box, which is the shape of the regression that check exists
	   for -- a trademark footer still present, still visible, still clearing
	   4.5:1, and no longer attributing anything to anybody. It NAMES the
	   footers rather than sweeping every element, because blanking the whole
	   document would redden `contrast` and `tap-target` too and a control that
	   reddens everything proves nothing about the one check under test. */
	'blank-text': { js: 'for (const el of document.querySelectorAll(".gt-tm p, footer p")) el.textContent = "";' },
	/* The live control for `motion`. It NAMES the mark cells rather than
	   sweeping the document, for `blank-text`'s reason and one of its own: an
	   `!important` rotate on every element moves every tap-target box and every
	   contrast ground with it, and a preset that reddens everything proves
	   nothing about the one check under test. Declared OUTSIDE any media query
	   on purpose -- that is the defect, an animation reduced motion does not
	   switch off, and it lands on the FRC image in the same stroke, which is
	   the OTHER direction the check measures. */
	motion: {
		css:
			'@keyframes bv-break-spin { to { transform: rotate(360deg); } }' +
			'[data-mark] svg *, [data-mark] img { animation: bv-break-spin 2s linear infinite !important; }'
	},
	/* Not CSS: a thrown error, which is how the notebook bundle's real
	   state_unsafe_mutation surfaced -- silently, with dead click handlers. */
	'console-error': { js: 'throw new Error("state_unsafe_mutation (injected by --break console-error)")' }
};

function parseArgs(argv) {
	const out = { routes: [], widths: [], probe: false, selftest: false, brk: null, strict: false, json: null, port: 5199, settleMs: 700, verbose: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--probe') out.probe = true;
		else if (a === '--selftest') out.selftest = true;
		else if (a === '--strict') out.strict = true;
		else if (a === '--verbose') out.verbose = true;
		else if (a === '--route') out.routes.push(argv[++i]);
		else if (a === '--width') out.widths.push(Number(argv[++i]));
		else if (a === '--port') out.port = Number(argv[++i]);
		else if (a === '--settle') out.settleMs = Number(argv[++i]);
		else if (a === '--json') out.json = argv[++i];
		else if (a === '--break') out.brk = argv[++i];
	}
	return out;
}

const pad = (s, n) => String(s).padEnd(n);
const mark = (ok) => (ok ? '  ok ' : ' >>> ');

function printResult(r, indent = '    ') {
	const head = r.label ? `${r.check} [${r.label}]` : r.check;
	console.log(`${indent}${mark(r.withinThreshold)} ${pad(head, 34)} ${r.measured}   (threshold ${r.threshold})`);
}

function printDetail(r, indent = '        ') {
	if (r.check === 'horizontal-scroll' && r.data.offenders.length) {
		for (const o of r.data.offenders) console.log(`${indent}overhang ${o.overhangPx}px  right=${o.right}  ${o.path}`);
	}
	if (r.check === 'contrast') {
		for (const x of r.data.results) {
			console.log(`${indent}${x.ratio}:1  ${x.fontSizePx}px/${x.fontWeight}  ground from ${x.groundSource}${x.groundHasImage ? ' [background-image present: number is the colour under it]' : ''}${x.landedOnCanvas ? ' [landed on canvas]' : ''}  ${x.path}`);
		}
	}
	if (r.check === 'tap-target') {
		for (const x of r.data.results.filter((v) => v.visible && v.minDim < 44).slice(0, 8)) {
			console.log(`${indent}${x.w}x${x.h} (min ${x.minDim}px, measured at ${x.measuredAt}${x.measuredAt === 'label' ? `, own box ${x.ownW}x${x.ownH}` : ''}) hit=${x.centreHitsSelf ? 'self' : x.hitPath}  ${x.path}`);
		}
	}
	if (r.check === 'tap-reach') {
		for (const x of r.data.results.filter((v) => v.visible && (v.minDim < 44 || v.stolen > 0)).slice(0, 8)) {
			console.log(`${indent}reach ${x.reachW}x${x.reachH} (min ${x.minDim}px, own box ${x.ownW}x${x.ownH}) ${x.stolen} stolen, ${x.offscreenCount} offscreen  ${x.path}`);
			if (x.stolen > 0) {
				for (const p of x.hits.filter((p) => !p.offscreen && !p.hitsSelf)) {
					console.log(`${indent}    (${p.x},${p.y}) hit=${p.hitPath}`);
				}
			}
		}
	}
	if (r.check === 'presence') {
		for (const x of r.data.results.filter((v) => !v.visible).slice(0, 8)) {
			console.log(`${indent}present but NOT visible (${x.reasons.join(', ')}) box=${x.box}  ${x.path}`);
		}
	}
	if (r.check === 'motion') {
		for (const o of r.data.offenders) {
			console.log(`${indent}NOT SETTLED under reduce: ${o.why.join('; ')}  (rest opacity ${o.opacity})  ${o.path}`);
		}
		for (const p of r.data.unexpected) console.log(`${indent}animated where it must never be: ${p}`);
		for (const e of r.data.elements) {
			console.log(`${indent}${e.running} -> rest opacity ${e.restOpacity}, transform ${e.restTransform}, ${e.restAnimations} animation(s)  ${e.path}`);
		}
	}
	if (r.check === 'console-errors') {
		for (const e of r.data.errors) console.log(`${indent}[${e.type}] ${e.text.split('\n')[0].slice(0, 200)}`);
		for (const e of r.data.ignored) console.log(`${indent}(ignored) ${e.text.split('\n')[0].slice(0, 140)}`);
	}
}

async function runRoute(browser, origin, spec, width, opts) {
	const { context, page, consoleErrors: errs, requestFailures, blockedExternal } = await openPage(browser, { width });
	const results = [];
	const url = `${origin}${urlFor(spec)}`;
	let navStatus = null;
	let hydration = { hydrated: false, waitedMs: 0 };
	const prepared = [];
	try {
		const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
		navStatus = res ? res.status() : null;
		hydration = await waitForApp(page);

		/* LIVE NEGATIVE CONTROL. `--break <preset>` injects a defect into the
		   real page before measuring, so a session can prove a check would
		   catch that defect ON THIS SURFACE rather than only on a fixture --
		   and prove it without editing src/ and having to restore it. */
		if (opts.brk) {
			const defect = BREAKAGE[opts.brk];
			if (!defect) throw new Error(`Unknown --break preset "${opts.brk}". Known: ${Object.keys(BREAKAGE).join(', ')}`);
			if (typeof defect === 'string') await page.addStyleTag({ content: defect });
			else if (defect.css) await page.addStyleTag({ content: defect.css });
			else await page.addScriptTag({ content: defect.js }).catch(() => {});
			prepared.push(`INJECTED DEFECT "${opts.brk}" -- this run is a negative control, not a reading of the real surface`);
		}

		/* Reach the state the spec means to measure. A surface can load with
		   something on top of it -- /dev/pathways mounts the real first-login
		   picker, whose overlay covers the page -- and measuring through it is
		   a true reading of the wrong thing. Every step is REPORTED, attempt
		   count included, so the report says which state the numbers describe
		   and how hard it was to get there. */
		for (const step of spec.prepare ?? []) {
			if (step.click) {
				const r = await clickUntil(page, step.click, step.until, {
					attempts: step.attempts ?? 12,
					gapMs: step.gapMs ?? 300,
					force: step.force ?? false
				});
				prepared.push(
					`${r.ok ? 'clicked' : 'FAILED'} ${step.click} -- ${r.matched} matched, ${r.attempts} attempt(s), ${r.reason}`
				);
			}
			if (step.waitFor) {
				/* A state reached by an ASYNC PAYLOAD LANDING rather than by a
				   press. See `waitUntil` in browser.mjs for why this is not a
				   longer `settleMs`: a fixed timeout measures an empty page the
				   day the payload gets slower, and reports honest zeros about a
				   surface that had not finished loading. The wait is REPORTED in
				   milliseconds, so a step that suddenly needs 4s says so. */
				const r = await waitUntil(page, step.waitFor, {
					timeoutMs: step.timeoutMs ?? 15_000
				});
				prepared.push(
					`${r.ok ? 'waited' : 'FAILED'} for ${String(step.waitFor).slice(0, 60)} -- ${r.waitedMs}ms, ${r.reason}`
				);
			}
			if (step.evaluate) {
				/* `page.evaluate(string)` treats the string as an EXPRESSION -- the
				   same trap `clickUntil`'s "until" already works around (see
				   browser.mjs). An arrow-function source handed to `evaluate` bare
				   evaluates to a FUNCTION OBJECT and is never called, so the step
				   reports success while doing nothing. Invoke it. */
				/* THE RETURN VALUE IS PRINTED WHEN THERE IS ONE. A settling step that
				   reports "settled 0 card(s)" is a silent no-op made visible --
				   which is what happens the day a class name moves and the step
				   goes on succeeding while doing nothing. */
				const out = await page
					.evaluate(`(${step.evaluate})()`)
					.then((v) => ({ ok: true, v }))
					.catch((e) => {
						prepared.push(`evaluate FAILED: ${e.message.split('\n')[0]}`);
						return { ok: false };
					});
				if (out.ok) {
					const said = typeof out.v === 'string' || typeof out.v === 'number' ? ` -- ${out.v}` : '';
					/* Collapse the source before slicing: a multi-line step
					   otherwise prints "evaluated: () => {" and takes its own
					   return value off the end of the line with it. */
					const src = String(step.evaluate).replace(/\s+/g, ' ').slice(0, 70);
					prepared.push(`evaluated: ${src}${said}`);
				}
			}
			await page.waitForTimeout(step.waitMs ?? 200);
		}

		await settle(page, { settleMs: spec.settleMs ?? opts.settleMs });

		results.push(await horizontalScroll(page));
		for (const c of spec.contrast ?? []) results.push(await contrast(page, { ...c, all: true }));
		for (const t of spec.tapTargets ?? []) results.push(await tapTargets(page, t));
		for (const t of spec.tapReach ?? []) results.push(await tapReach(page, t));
		for (const p of spec.presence ?? []) results.push(await presence(page, p));
		for (const t of spec.textContains ?? []) results.push(await textContains(page, t));
		for (const o of spec.domOrder ?? []) results.push(await domOrder(page, o));
		for (const o of spec.orderResult ?? []) results.push(await orderResult(page, o));
		for (const d of spec.datalistOrder ?? []) results.push(await datalistOrder(page, d));
		for (const s of spec.statePairs ?? []) results.push(await statePairContrast(page, s));
		/* ONE call for every motion entry, not one per entry: the check flips
		   Chromium's `prefers-reduced-motion` emulation and settles twice, and
		   eleven marks measured separately would pay twenty-two settles per
		   route/width. It restores `no-preference` before returning, so
		   `consoleErrors` below and anything a later spec measures still
		   describe the state every other check in this file assumes. */
		results.push(...(await motionSweep(page, spec.motion ?? [])));
		results.push(consoleErrors(errs, { ignore: spec.ignoreConsole ?? [], blockedCount: blockedExternal.length }));
	} finally {
		await context.close();
	}
	return { path: spec.path, label: spec.label, width, navStatus, hydration, prepared, results, requestFailures, blockedExternal };
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	if (opts.selftest) {
		const failures = await runSelfTest({ width: opts.widths[0] ?? 375 });
		return failures === 0 ? 0 : 1;
	}

	if (opts.probe) {
		const p = await probeEnvironment();
		console.log('\n=== browser-verify environment probe ===\n');
		for (const [k, v] of Object.entries(p)) {
			console.log(`  ${pad(k, 28)} ${Array.isArray(v) ? v.join(' ') : v}`);
		}
		console.log('');
		if (opts.json) writeFileSync(opts.json, JSON.stringify(p, null, 2));
		return 0;
	}

	const widths = opts.widths.length ? opts.widths : WIDTHS;
	const specs = selectRoutes(opts.routes);
	if (!specs.length) {
		console.error('No routes matched. Known routes are listed in tools/browser-verify/routes.mjs.');
		return 2;
	}

	const t0 = Date.now();
	console.log('booting vite dev ...');
	const server = await startDevServer({ port: opts.port, cwd: REPO_ROOT, quiet: !opts.verbose });
	const tServer = Date.now();
	console.log(
		server.alreadyRunning
			? `  reused a server already on ${server.origin}`
			: `  ${server.origin} answered in ${server.bootMs}ms (first probe HTTP ${server.firstProbeStatus})`
	);

	const { browser, executablePath } = await launch();
	console.log(`  chromium ${browser.version()} at ${executablePath}\n`);

	const runs = [];
	try {
		for (const spec of specs) {
			for (const width of widths) {
				const run = await runRoute(browser, server.origin, spec, width, opts);
				runs.push(run);
				console.log(
					`${spec.path}  @${width}px   HTTP ${run.navStatus}   ` +
						`app ${run.hydration.hydrated ? 'rendered' : 'DID NOT RENDER'}${run.hydration.domStable ? '' : ' (DOM never settled)'} in ${run.hydration.waitedMs}ms   ${spec.label ?? ''}`
				);
				for (const step of run.prepared) console.log(`         prepare: ${step}`);
				for (const r of run.results) {
					printResult(r);
					if (!r.withinThreshold || opts.verbose) printDetail(r);
				}
				if (run.blockedExternal.length) {
					const hosts = [...new Set(run.blockedExternal.map((u) => new URL(u).host))];
					console.log(`         ${run.blockedExternal.length} external request(s) blocked by the harness: ${hosts.join(', ')}`);
					console.log('         (web fonts do not load; text is measured in the fallback stack)');
				}
				if (run.requestFailures.length) {
					console.log(`         ${run.requestFailures.length} failed request(s):`);
					for (const f of run.requestFailures.slice(0, 5)) console.log(`           ${f.failure}  ${f.url}`);
				}
				console.log('');
			}
		}
	} finally {
		await browser.close();
		await server.stop();
	}

	const all = runs.flatMap((r) => r.results);
	const outside = all.filter((r) => !r.withinThreshold);
	const totalMs = Date.now() - t0;
	console.log('---');
	console.log(`${runs.length} route/width run(s), ${all.length} measurement(s), ${outside.length} outside threshold`);
	console.log(`server boot ${tServer - t0}ms; total wall clock ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s)`);
	if (!opts.strict) console.log('exit 0: this is a measuring instrument, not a gate (pass --strict to change that)');

	if (opts.json) {
		writeFileSync(opts.json, JSON.stringify({ runs, totalMs, executablePath }, null, 2));
		console.log(`json written to ${opts.json}`);
	}
	return opts.strict && outside.length ? 1 : 0;
}

main().then(
	(code) => process.exit(code),
	(err) => {
		console.error('\nbrowser-verify failed to run:\n' + (err?.stack ?? err));
		console.error('\nIf this is a missing browser, run: node tools/browser-verify/run.mjs --probe');
		process.exit(2);
	}
);
