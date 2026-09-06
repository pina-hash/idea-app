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
	motionSweep,
	prepareClickResult,
	prepareWaitResult,
	prepareEvalResult
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
	/* A FAILED `until` PRINTS THE PREDICATE, not only the step it sat on. The
	   step's own source is in the label; the predicate is the half that did not
	   hold, and it is what the author has to read to fix it. It is truncated in
	   the label line and never truncated here. */
	if (r.check === 'prepare-eval' && r.data?.until) {
		console.log(`${indent}until: ${r.data.until}`);
	}
	if (r.check === 'console-errors') {
		for (const e of r.data.errors) console.log(`${indent}[${e.type}] ${e.text.split('\n')[0].slice(0, 200)}`);
		for (const e of r.data.ignored) console.log(`${indent}(ignored) ${e.text.split('\n')[0].slice(0, 140)}`);
	}
}

/** The action keys a `prepare` step can carry, and whether each reads `until`. */
const PREPARE_ACTIONS = { click: true, evaluate: true, waitFor: false };

/**
 * Run an `evaluate` prepare step until its own `until` predicate holds.
 *
 * THE SHAPE IS `clickUntil`'s, DELIBERATELY, because the question is the same
 * one: did the thing this step does actually reach the state the spec says it
 * reaches. It re-runs the evaluate and re-checks the predicate, up to
 * `attempts` times, and reports the attempt count and the elapsed time -- so a
 * step that needed nine tries says nine rather than reading identically to one
 * that landed first go.
 *
 * THE PREDICATE IS INVOKED THROUGH `waitUntil`, NOT THROUGH A SECOND POLL LOOP
 * WRITTEN HERE. `waitUntil` already carries the `page.evaluate(string)`
 * expression workaround -- an arrow-function source handed over bare becomes a
 * function OBJECT and is never `=== true` -- and a second copy of that is
 * precisely the thing that stops matching. Each attempt gets `gapMs` of it,
 * which is the gap and the poll in one primitive.
 *
 * A THROW IS STILL A THROW AND STOPS IMMEDIATELY. Retrying a step that raised
 * measures the same exception `attempts` times and buys nothing; the author
 * needs the message, not the count.
 */
export async function evaluateUntil(page, step, { attempts = step.attempts ?? 12, gapMs = step.gapMs ?? 300 } = {}) {
	const started = Date.now();
	const run = () =>
		page
			.evaluate(`(${step.evaluate})()`)
			.then((v) => ({ ok: true, v }))
			.catch((e) => ({ ok: false, err: e.message.split('\n')[0] }));

	/* Asked ONCE, before anything runs, and it is an annotation rather than a
	   verdict. A click whose predicate already held never fired and reached no
	   state, which is why `prepareClickResult` fails it; an evaluate DID run,
	   so the step happened. What the reader still needs to know is that the
	   predicate could not have told the difference. */
	const heldBefore = (await waitUntil(page, step.until, { timeoutMs: 0 })).ok;

	let last = { ok: false };
	for (let i = 1; i <= attempts; i++) {
		last = await run();
		if (!last.ok) return { ...last, attempts: i, elapsedMs: Date.now() - started, heldBefore, reason: 'THREW' };
		const s = await waitUntil(page, step.until, { timeoutMs: gapMs, pollMs: Math.min(100, Math.max(1, gapMs)) });
		if (s.ok) {
			return {
				ok: true,
				v: last.v,
				attempts: i,
				elapsedMs: Date.now() - started,
				heldBefore,
				reason: 'predicate satisfied'
			};
		}
	}
	return {
		ok: false,
		v: last.v,
		attempts,
		elapsedMs: Date.now() - started,
		heldBefore,
		reason: `predicate never satisfied in ${attempts} attempt(s)`
	};
}

/**
 * The result row for an `evaluate` step that carries an `until`.
 *
 * It is built here rather than in `checks.mjs` because it is a DIFFERENT claim
 * from `prepareEvalResult`'s, not a wider spelling of it: that row's threshold
 * is "the step runs without throwing", which is exactly the sentence this
 * bundle exists to stop being the whole of what an `until`-carrying step
 * promises. A step with no `until` still takes that row, unchanged.
 */
export function prepareEvalUntilResult(step, r) {
	const said = typeof r.v === 'string' || typeof r.v === 'number' ? ` -- ${r.v}` : '';
	const src = String(step.evaluate).replace(/\s+/g, ' ').slice(0, 70);
	const held = r.heldBefore ? '  [the predicate ALREADY HELD before the step ran -- it does not discriminate]' : '';
	const measured =
		r.reason === 'THREW'
			? `THREW: ${r.err}  (attempt ${r.attempts}, ${r.elapsedMs}ms)`
			: `${r.attempts} attempt(s), ${r.elapsedMs}ms, ${r.reason}${said}${held}`;
	return {
		check: 'prepare-eval',
		label: src,
		measured,
		threshold: 'the step runs without throwing AND its `until` then holds',
		withinThreshold: r.ok,
		data: { ...r, until: String(step.until).replace(/\s+/g, ' ') }
	};
}

/**
 * A step whose SHAPE cannot do what it says. Two cases, both silent until now:
 *
 *  - an `until` on a step no branch reads one from. `waitFor`'s predicate is
 *    its own `waitFor`, so an `until` beside it is discarded; a step with no
 *    action key at all discards everything.
 *  - a step carrying no action key, which today is a 200ms wait wearing a
 *    spec's clothes. A mistyped `evaulate:` is exactly this and type-checks
 *    nowhere, because a route spec is a plain object literal.
 *
 * Returned as rows rather than thrown, for the reason the prepare loop's own
 * header gives: a red row above the numbers it invalidates is what makes the
 * report read in the order the run happened.
 */
export function prepareStepShapeResults(step) {
	const out = [];
	const actions = Object.keys(PREPARE_ACTIONS).filter((k) => step[k] !== undefined);
	const readsUntil = actions.filter((k) => PREPARE_ACTIONS[k]);
	if (!actions.length) {
		out.push({
			check: 'prepare-step',
			label: Object.keys(step).join(', ') || '(empty step)',
			measured: `no action key (${Object.keys(PREPARE_ACTIONS).join(' | ')}) -- this step ran nothing`,
			threshold: 'a prepare step names exactly one action',
			withinThreshold: false,
			data: { keys: Object.keys(step) }
		});
	}
	if (step.until !== undefined && !readsUntil.length) {
		out.push({
			check: 'prepare-step',
			label: String(step.until).replace(/\s+/g, ' ').slice(0, 70),
			measured: `\`until\` written on a step that reads none (keys: ${Object.keys(step).join(', ')}) -- it was DISCARDED`,
			threshold: '`until` sits on a `click` or an `evaluate`',
			withinThreshold: false,
			data: { keys: Object.keys(step), until: String(step.until).replace(/\s+/g, ' ') }
		});
	}
	return out;
}

async function runRoute(browser, origin, spec, width, opts) {
	const { context, page, consoleErrors: errs, requestFailures, blockedExternal } = await openPage(browser, { width });
	const results = [];
	const url = `${origin}${urlFor(spec)}`;
	let navStatus = null;
	let hydration = { hydrated: false, waitedMs: 0 };
	/* `--break` is the one thing still narrated rather than measured: it is a
	   deliberate defect the operator asked for, not a step that can fail. */
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
		   a true reading of the wrong thing.
		 *
		 * EVERY STEP IS A MEASUREMENT, NOT A NARRATION, AND THAT IS THE FIX FOR
		 * A WHOLE CLASS OF SILENT PASS. These used to be strings pushed onto
		 * `prepared` and printed above the results -- so a step that failed
		 * outright was invisible to the summary count and to `--strict`.
		 * MEASURED rather than reasoned: a spec given three broken steps at
		 * once (an `evaluate` that throws, a `click` whose selector matches
		 * nothing, a `waitFor` that times out) reported "4 measurement(s), 0
		 * outside threshold" and `--strict` EXITED 0. Every check after such a
		 * step is an honest reading of a state the run never reached, which is
		 * the most expensive kind of green there is.
		 *
		 * They are pushed into `results` FIRST, so the report reads in the
		 * order the run happened and a red step sits above the numbers it
		 * invalidates. */
		for (const step of spec.prepare ?? []) {
			if (step.click) {
				const r = await clickUntil(page, step.click, step.until, {
					attempts: step.attempts ?? 12,
					gapMs: step.gapMs ?? 300,
					force: step.force ?? false
				});
				results.push(prepareClickResult(step, r));
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
				results.push(prepareWaitResult(step, r));
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
				/* AN `until` ON THIS STEP IS HONOURED, AND USED NOT TO BE. The branch
				   judged the step on whether it THREW and read `step.until` nowhere,
				   so a predicate an author wrote as a guarantee was discarded in
				   silence and the step reported success without waiting for
				   anything -- the exact shape of a green check proving nothing. A
				   step with no `until` takes the unchanged path below, byte for
				   byte. */
				if (step.until) {
					results.push(prepareEvalUntilResult(step, await evaluateUntil(page, step)));
				} else {
					const out = await page
						.evaluate(`(${step.evaluate})()`)
						.then((v) => ({ ok: true, v }))
						.catch((e) => ({ ok: false, err: e.message.split('\n')[0] }));
					results.push(prepareEvalResult(step, out));
				}
			}
			/* AN `until` NO BRANCH ABOVE CONSUMED IS A MEASUREMENT, NOT A SHRUG.
			   Only `click` and `evaluate` read one; a `waitFor` step's predicate
			   IS its `waitFor`, and a step with neither key runs nothing at all.
			   Either way an author has written a guarantee the run cannot keep,
			   and the whole cost of this defect was that saying nothing looks
			   exactly like honouring it. */
			results.push(...prepareStepShapeResults(step));
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
				for (const note of run.prepared) console.log(`         note: ${note}`);
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

/* RUN ONLY WHEN THIS FILE IS THE ENTRY POINT. It used to call `main()` at
   module scope, so merely IMPORTING it -- which is what a test asserting any
   of the exports above has to do -- booted a vite dev server and a Chromium
   and started a full pass. `tests/browser-verify-prepare-until.test.ts` is
   what needs this; the CLI behaves identically either way. */
const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry)
	main().then(
		(code) => process.exit(code),
		(err) => {
			console.error('\nbrowser-verify failed to run:\n' + (err?.stack ?? err));
			console.error('\nIf this is a missing browser, run: node tools/browser-verify/run.mjs --probe');
			process.exit(2);
		}
	);
