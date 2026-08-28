#!/usr/bin/env node
/**
 * tools/browser-verify -- the repeatable visual pass.
 *
 *   npm run verify:browser                 both widths, every listed dev route
 *   npm run verify:browser -- --probe      environment capability probe only
 *   npm run verify:browser -- --selftest   negative controls (exits 1 if a check is broken)
 *   npm run verify:browser -- --break overflow|tiny-taps|low-contrast|invisible|console-error
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
import { launch, openPage, settle, waitForApp, clickUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';
import {
	horizontalScroll,
	contrast,
	tapTargets,
	presence,
	domOrder,
	orderResult,
	datalistOrder,
	consoleErrors,
	statePairContrast
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
	/* Something wider than the viewport that cannot wrap. */
	overflow: '.harness, main, body > div { min-width: 1600px !important; }',
	/* Drop every control below the 44px floor. */
	'tiny-taps': 'button, [role="button"], a.btn { min-height: 0 !important; height: 18px !important; min-width: 0 !important; padding: 0 !important; line-height: 18px !important; }',
	/* Wash the ink out until it cannot clear 4.5:1 on its own ground. */
	'low-contrast': '* { color: color-mix(in srgb, currentColor 22%, transparent) !important; }',
	/* Present in the DOM, painted nowhere -- the case the presence check exists for. */
	invisible: '.harness, main, h1, table, .chip-grid, .idea-logo, .note { opacity: 0 !important; }',
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
	if (r.check === 'presence') {
		for (const x of r.data.results.filter((v) => !v.visible).slice(0, 8)) {
			console.log(`${indent}present but NOT visible (${x.reasons.join(', ')}) box=${x.box}  ${x.path}`);
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
					gapMs: step.gapMs ?? 300
				});
				prepared.push(
					`${r.ok ? 'clicked' : 'FAILED'} ${step.click} -- ${r.matched} matched, ${r.attempts} attempt(s), ${r.reason}`
				);
			}
			if (step.evaluate) {
				/* `page.evaluate(string)` treats the string as an EXPRESSION -- the
				   same trap `clickUntil`'s "until" already works around (see
				   browser.mjs). An arrow-function source handed to `evaluate` bare
				   evaluates to a FUNCTION OBJECT and is never called, so the step
				   reports success while doing nothing. Invoke it. */
				const ok = await page
					.evaluate(`(${step.evaluate})()`)
					.then(() => true)
					.catch((e) => {
						prepared.push(`evaluate FAILED: ${e.message.split('\n')[0]}`);
						return false;
					});
				if (ok) prepared.push(`evaluated: ${String(step.evaluate).slice(0, 70)}`);
			}
			await page.waitForTimeout(step.waitMs ?? 200);
		}

		await settle(page, { settleMs: spec.settleMs ?? opts.settleMs });

		results.push(await horizontalScroll(page));
		for (const c of spec.contrast ?? []) results.push(await contrast(page, { ...c, all: true }));
		for (const t of spec.tapTargets ?? []) results.push(await tapTargets(page, t));
		for (const p of spec.presence ?? []) results.push(await presence(page, p));
		for (const o of spec.domOrder ?? []) results.push(await domOrder(page, o));
		for (const o of spec.orderResult ?? []) results.push(await orderResult(page, o));
		for (const d of spec.datalistOrder ?? []) results.push(await datalistOrder(page, d));
		for (const s of spec.statePairs ?? []) results.push(await statePairContrast(page, s));
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
