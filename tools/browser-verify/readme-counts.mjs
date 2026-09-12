#!/usr/bin/env node
/**
 * tools/browser-verify/readme-counts.mjs -- the ONE writer of the counts
 * regions in README.md. There are TWO of them, with two costs and two
 * freshness rules, and keeping them apart is the whole point of this file.
 *
 *   npm run verify:counts                     STATIC half. A tree read: no
 *                                             browser, no dev server, under a
 *                                             second. Run it after adding or
 *                                             removing a route spec.
 *   npm run verify:counts -- --check          exit 1 if the static half
 *                                             disagrees with this tree
 *
 *   npm run verify:readme                     MEASURED half. Runs the harness
 *                                             (~17 minutes, needs a browser),
 *                                             writes one file per spec under
 *                                             `measured/`, then rewrites BOTH
 *                                             regions from the tree.
 *   npm run verify:readme -- --route marks    the same for the specs matching
 *                                             `marks` alone. Seconds, and it
 *                                             leaves every other spec's file
 *                                             untouched.
 *   npm run verify:readme -- --check          run the harness, exit 1 if the
 *                                             committed measured half
 *                                             disagrees with it
 *   npm run verify:readme -- --from out.json  reuse a `run.mjs --json out.json`
 *                                             report instead of running again
 *   npm run verify:readme -- --no-selftest    skip the ~30s `--selftest` count
 *
 * A HAND-WRITTEN FILE NEVER HOLDS A COMPUTED VALUE (IDEA_instructions.md 4.17).
 * README.md carried a spec count, a route count, a run count, a measurement
 * count, a findings count and a wall clock by hand, and every one of them was
 * wrong on every tree checked on 2026-08-31. So the harness writes them.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BLOCK IS TWO BLOCKS (prompt 0019, decision 12).
 *
 * It used to be ONE region, written by ONE all-or-nothing run: `main()`
 * demanded a measured report before it would write anything, so moving a
 * STATIC count -- which is a directory listing and an array length -- cost a
 * six-minute browser run. On 2026-09-03 five finished, CI-green branches all
 * failed to merge, every one of them on this file: each had regenerated the
 * single block against its own tree, each wrote different numbers into the
 * same lines, and the automation correctly refused five mutually exclusive
 * edits to one generated file. Unpicking it took a bundle of its own (0017),
 * whose resolution was to discard four of the six blocks unread and regenerate
 * once at the end -- with a browser, because there was no other way to write
 * the file at all.
 *
 * So: two regions, two generators, two freshness rules.
 *
 *   STATIC   specs, distinct routes, /dev pages, widths, runs = specs x widths.
 *            Derived from the tree. Written by `--static`. Checked against the
 *            tree on EVERY test run, so a spec added without regenerating
 *            reddens `npm test` -- with no browser anywhere in the path.
 *
 *   MEASURED runs the report carried, measurements, measurements outside
 *            threshold and their rows, wall clock, `--selftest` controls.
 *            TAKING the measurement needs a browser and ~17 minutes, which
 *            README.md says at length must stay outside `npm test` and outside
 *            CI. RENDERING it does not: since prompt 0168 the region is a pure
 *            function of `measured/`, one committed file per route spec, so
 *            `--static` rewrites it too and `npm test` checks it against that
 *            directory on every run with no browser in the path.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MEASUREMENT IS A DIRECTORY AND NOT A LINE (prompt 0168).
 *
 * The measured region used to be one JSON blob on one line in README.md,
 * written only by a report covering every spec in the tree -- `main()` threw
 * on anything narrower. Two consequences, and both were measured rather than
 * argued.
 *
 * ADDING ONE SPEC COST A FULL PASS. The narrowest thing that could write this
 * region was ~17 minutes of browser time over 194 routes, to record a number
 * about one of them. On 2026-09-11 two sessions each spent that pass on the
 * same staleness and one was discarded as redundant when the other landed
 * mid-run.
 *
 * AND THE ONE LINE LOST RACES, in the shape nothing warns about. Two lanes
 * that each add a route spec and each regenerate CORRECTLY for their own tree
 * write the same static number; git takes the identical edit on both sides
 * with no conflict at all, and the merged tree holds one more spec than the
 * region claims. Green parents, red merge. When both lanes also re-measure,
 * the date, the sha and the covered list differ, the line conflicts, and
 * `integrate.yml`'s resolver takes the TARGET's side inside the markers --
 * which throws one lane's seventeen minutes away. Ledger 0147 named that
 * second one: `integration` sat at a measurement claiming zero outside
 * threshold over a set missing first one spec and then two.
 *
 * So the measurement is `measured/<spec file>.json`, ONE FILE PER SPEC, keyed
 * on the filename `routes.mjs` already derives from the spec's own `path` and
 * already refuses to let two specs share. Two lanes measuring two different
 * specs write two different files and share no line, so the merge is ADDITIVE
 * and the merged store describes the merged tree by construction. It is the
 * answer `docs/history/` reached for one 35,000-line record and `routes/`
 * reached for one array's closing bracket, applied to the third shared write
 * point in this directory.
 *
 * WHAT THAT DOES NOT FIX, stated here rather than discovered later: the
 * RENDERED block is still one region and is still stale on the merged tree
 * until somebody regenerates it. What changed is the cost and the loudness.
 * Regenerating is now `npm run verify:counts` -- a tree read, under a second,
 * no browser -- for BOTH halves rather than a browser pass for one of them,
 * which is what `integrate.yml`'s `counts_refresh` already runs on every
 * merged tree; and `verifyMeasured` compares the block against the directory
 * on every `npm test`, so a block that drifted from its own store is red on
 * the branch rather than invisible until a reader quotes it.
 *
 * THE STATIC REGION CARRIES NO TIMESTAMP AND NO SHA, DELIBERATELY. A tree read
 * has no measurement instant; a date in it would be a value that changes on
 * every regeneration, so two branches regenerating an UNCHANGED count would
 * still conflict on it. Without one, the static region is a pure function of
 * the tree: regenerating on a tree whose counts have not moved rewrites the
 * bytes that were already there and produces no diff at all. That is what
 * makes `npm run verify:counts` a safe merge resolution -- run it on the
 * merged tree and the answer is the merged tree's own, whatever either side
 * had written.
 *
 * THE OUTER `counts:begin`/`counts:end` MARKERS ARE KEPT, AND THEY ARE NOT
 * DECORATION: `tools/idea-status.py` (out of this bundle's scope) finds them by
 * exact string and prints everything between them as the known-red harness
 * findings. The two new regions nest INSIDE that envelope, which is why they
 * are spelled `counts:static:*` and `counts:measured:*` -- neither contains
 * `<!-- counts:begin -->` or `<!-- counts:end -->` as a substring, so that
 * tool's `find()` still lands on the envelope and still prints both halves.
 *
 * WHAT THE HARNESS WRITES ON ITS OWN: nothing. `run.mjs` prints a summary and
 * persists a report only when handed `--json <file>`; there is no last-run
 * file to read. So this script runs it (or takes a report via `--from`).
 *
 * The wall clock is recorded and deliberately NOT compared by `--check`: it
 * moves on every run and a comparison on it would never pass twice.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MEASURED REGION RECORDS THE SPEC FILES IT COVERED (prompt 0046).
 *
 * The measured half is allowed to be stale -- that is the whole point of the
 * split -- but on 2026-09-05 it was found being stale in a way that LIED. The
 * spec measuring the classroom spec table's four row-action glyphs landed at
 * `700a56d`; the block on `origin/main` was measured at `4dc9df8`, which
 * predates it, and so printed `Measurements outside threshold: 0` for a
 * finding that was recorded in a code comment, in the route file's own prose
 * and in a ledger entry. The one place a reader consults said there was
 * nothing there.
 *
 * THE SHA WAS ALREADY RECORDED AND DID NOT HELP, WHICH IS THE POINT. On a
 * history this merge-heavy a stale measurement's commit is still an ANCESTOR
 * of HEAD and reads as entirely plausible; `4dc9df8` and `5aa1e22` both are.
 * A reader cannot tell an ancestor that measured everything from an ancestor
 * that measured two routes fewer.
 *
 * So the region records `covered`: the sorted basenames of the route specs the
 * run actually measured. A spec present in `routes/` and absent from that list
 * is a route the numbers never saw, and finding one is a `readdirSync` --
 * milliseconds, no browser, no dev server. `tests/derived-numbers.test.ts`
 * does it on every `npm test`.
 *
 * WHAT IT DOES ABOUT IT IS DELIBERATELY NARROW (see `verifyMeasured`): it
 * fails ONLY when the unmeasured set is non-empty AND the block claims zero
 * findings, because that conjunction is exactly the shape that tells a reader
 * nothing is there. A hard failure on any gap would make every route-adding
 * bundle spend six minutes and a browser, which is what the split exists to
 * avoid; a warning nobody must act on is how this became invisible in the
 * first place.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * TYPES ARE REQUIRED IN THIS FILE, unlike its neighbours in this directory.
 * `tests/derived-numbers.test.ts` imports it, `tsconfig.json` sets `checkJs`
 * and `strict`, and an import from a checked `.ts` pulls this module into the
 * program -- so `npx svelte-check` reports every implicit `any` here against a
 * 0-error baseline. `run.mjs` and the rest have no `.ts` importer and are not
 * checked at all. Keep the JSDoc accurate rather than loosening it: the test
 * reads these shapes.
 *
 * @typedef {{ specs: number, routes: number, devPages: number, widths: number[], runs: number }} StaticCounts
 * @typedef {StaticCounts & { schema: number }} StaticData
 * @typedef {{ path: string, width: number, check: string, label: string }} OutsideRow
 * @typedef {{ runsMeasured: number, measurements: number, outside: number, outsideRows: OutsideRow[], totalMs: number }} MeasuredCounts
 * @typedef {{ controls: number, negative: number, positive: number, failures: number }} SelfTest
 * @typedef {{ sha: string, dirty: boolean }} Head
 * @typedef {{ schema: number, spec: string, date: string, sha: string, dirty: boolean, widths: number[], runs: number, measurements: number, outsideRows: OutsideRow[], ms: number }} SpecMeasurement
 * @typedef {{ specs: SpecMeasurement[], selftest: SelfTest | null, orphans: string[] }} Store
 * @typedef {MeasuredCounts & { schema: number, date: string, sha: string, dirty: boolean, oldest: string, covered: string[], selftest: SelfTest | null }} MeasuredData
 * @typedef {{ runs: { path: string, width: number, results: { check: string, label?: string, withinThreshold: boolean }[] }[], totalMs: number }} Report
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../..');
export const README_PATH = join(HERE, 'README.md');

/** The envelope `tools/idea-status.py` reads. Neither region marker contains it. */
export const COUNTS_BEGIN = '<!-- counts:begin -->';
export const COUNTS_END = '<!-- counts:end -->';

export const STATIC_BEGIN = '<!-- counts:static:begin -->';
export const STATIC_END = '<!-- counts:static:end -->';
const STATIC_DATA_PREFIX = '<!-- counts:static:data ';

export const MEASURED_BEGIN = '<!-- counts:measured:begin -->';
export const MEASURED_END = '<!-- counts:measured:end -->';
const MEASURED_DATA_PREFIX = '<!-- counts:measured:data ';

const DATA_SUFFIX = ' -->';

export const STATIC_SCHEMA = 1;
export const MEASURED_SCHEMA = 3;
export const SPEC_SCHEMA = 1;

/**
 * The measurement store: one file per route spec, named exactly as its spec
 * file under `routes/` is. `_`-prefixed entries are metadata and not specs,
 * the same escape hatch `routes/_shared.mjs` uses; `_selftest.json` is the
 * one of them, and it carries no clock and no sha so that two lanes running
 * an unchanged instrument write byte-identical files.
 */
export const MEASURED_DIRNAME = 'measured';
export const SELFTEST_FILE = '_selftest.json';

/** @param {string} [root] */
export const measuredDir = (root = REPO_ROOT) => join(root, 'tools', 'browser-verify', MEASURED_DIRNAME);

/** The store file a spec file's measurement lives in. `foo.mjs` -> `foo.json`. */
export const measurementFileFor = (/** @type {string} */ specFile) => `${specFile.replace(/\.mjs$/, '')}.json`;

/** The command that rewrites each region. Quoted in every failure message. */
export const STATIC_SCRIPT = 'npm run verify:counts';
export const MEASURED_SCRIPT = 'npm run verify:readme';

/* ------------------------------------------------------------------------ */
/* Static counts: read from the tree, no browser.                            */
/* ------------------------------------------------------------------------ */

/**
 * Directories under src/routes/dev that carry a +page.svelte, recursively.
 * @param {string} [root]
 * @returns {number}
 */
export function countDevPages(root = REPO_ROOT) {
	const base = join(root, 'src', 'routes', 'dev');
	let n = 0;
	/** @param {string} dir */
	const walk = (dir) => {
		let entries;
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		if (entries.includes('+page.svelte')) n += 1;
		for (const e of entries) {
			const p = join(dir, e);
			if (statSync(p).isDirectory()) walk(p);
		}
	};
	walk(base);
	return n;
}

/**
 * The route spec FILES on disk: `routes/*.mjs`, `_`-prefixed excluded, sorted.
 * The same filter `routes.mjs`'s own loader applies.
 *
 * A `readdirSync` rather than an import of the route table, deliberately. This
 * is the cheap staleness signal (see the header): it must cost milliseconds,
 * it must not need a browser or a dev server, and it must still answer on a
 * tree where some spec file throws on import -- a broken spec is exactly when
 * you want to know which routes went unmeasured. A filename IS a spec's
 * identity here: `routes.mjs` derives it from the spec's own `path` and
 * refuses a file whose name does not match, so two specs can never share one.
 *
 * @param {string} [root]
 * @returns {string[]}
 */
export function deriveSpecFiles(root = REPO_ROOT) {
	return readdirSync(join(root, 'tools', 'browser-verify', 'routes'))
		.filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
		.sort();
}

/**
 * Imports the REAL route table, the way run.mjs does, and counts it.
 * @param {string} [root]
 * @returns {Promise<StaticCounts>}
 */
export async function deriveStatic(root = REPO_ROOT) {
	const mod = await import(new URL('./routes.mjs', import.meta.url).href);
	const { ROUTES, WIDTHS, urlFor } = mod;
	const distinct = new Set(ROUTES.map((/** @type {{ path: string, aliasOf?: string }} */ r) => urlFor(r).split('?')[0]));
	return {
		specs: ROUTES.length,
		routes: distinct.size,
		devPages: countDevPages(root),
		widths: [...WIDTHS],
		runs: ROUTES.length * WIDTHS.length
	};
}

/* ------------------------------------------------------------------------ */
/* Measured counts: from a `run.mjs --json` report and a `--selftest` run.   */
/* ------------------------------------------------------------------------ */

/**
 * @param {Report} report
 * @returns {MeasuredCounts}
 */
export function summarizeReport(report) {
	const all = report.runs.flatMap((r) => r.results);
	/** @type {OutsideRow[]} */
	const outside = [];
	for (const run of report.runs) {
		for (const r of run.results) {
			if (!r.withinThreshold) {
				outside.push({ path: run.path, width: run.width, check: r.check, label: r.label ?? '' });
			}
		}
	}
	return {
		runsMeasured: report.runs.length,
		measurements: all.length,
		outside: outside.length,
		outsideRows: outside,
		totalMs: report.totalMs
	};
}

/* ------------------------------------------------------------------------ */
/* The measurement store: one committed file per route spec.                 */
/* ------------------------------------------------------------------------ */

/**
 * A report's runs, grouped by the SPEC FILE each belongs to.
 *
 * The mapping is `routes.mjs`'s own `slugify`, imported rather than copied:
 * a spec's filename is derived from its `path` and `routes.mjs` refuses a
 * file whose name does not match, so `slugify(run.path) + '.json'` names
 * exactly one store file and a second implementation of that rule is the pair
 * that stops matching.
 *
 * @param {Report} report
 * @returns {Promise<Map<string, { runs: Report['runs'], widths: number[], measurements: number, outsideRows: OutsideRow[] }>>}
 */
export async function groupReportBySpec(report) {
	const { slugify } = await import(new URL('./routes.mjs', import.meta.url).href);
	/** @type {Map<string, { runs: Report['runs'], widths: number[], measurements: number, outsideRows: OutsideRow[] }>} */
	const bySpec = new Map();
	for (const run of report.runs) {
		const file = `${slugify(run.path)}.mjs`;
		let e = bySpec.get(file);
		if (!e) {
			e = { runs: [], widths: [], measurements: 0, outsideRows: [] };
			bySpec.set(file, e);
		}
		e.runs.push(run);
		if (!e.widths.includes(run.width)) e.widths.push(run.width);
		e.measurements += run.results.length;
		for (const r of run.results) {
			if (!r.withinThreshold) {
				e.outsideRows.push({ path: run.path, width: run.width, check: r.check, label: r.label ?? '' });
			}
		}
	}
	for (const e of bySpec.values()) e.widths.sort((a, b) => a - b);
	return bySpec;
}

/**
 * The store as it is on disk: every spec measurement, the selftest record,
 * and the store files naming a spec this tree no longer has.
 *
 * A `readdirSync` and a `JSON.parse`, for `deriveSpecFiles`'s reasons: this is
 * what `npm test` compares the rendered block against, so it must cost
 * milliseconds and must not need a browser, a dev server or the route table.
 *
 * @param {string} [root]
 * @returns {Store}
 */
export function readStore(root = REPO_ROOT) {
	const dir = measuredDir(root);
	/** @type {string[]} */
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return { specs: [], selftest: null, orphans: [] };
	}
	const tree = new Set(deriveSpecFiles(root));
	/** @type {SpecMeasurement[]} */
	const specs = [];
	/** @type {string[]} */
	const orphans = [];
	for (const entry of entries.filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
		/** @type {SpecMeasurement} */
		const m = JSON.parse(readFileSync(join(dir, entry), 'utf8'));
		// THE FILENAME IS THE KEY AND THE `spec` FIELD MUST AGREE WITH IT. A
		// file that disagrees was hand-edited or renamed, and a rename is how
		// one spec's numbers would quietly start standing for another's.
		if (measurementFileFor(m.spec) !== entry) {
			throw new Error(
				`${MEASURED_DIRNAME}/${entry} says it measures ${m.spec}, which belongs in ${measurementFileFor(m.spec)}. A measurement file is named after the spec it measures; rerun \`${MEASURED_SCRIPT} -- --route <that spec>\` rather than renaming one.`
			);
		}
		if (tree.has(m.spec)) specs.push(m);
		else orphans.push(m.spec);
	}
	/** @type {SelfTest | null} */
	let selftest = null;
	if (entries.includes(SELFTEST_FILE)) {
		const raw = JSON.parse(readFileSync(join(dir, SELFTEST_FILE), 'utf8'));
		selftest = { controls: raw.controls, negative: raw.negative, positive: raw.positive, failures: raw.failures };
	}
	return { specs, selftest, orphans };
}

/**
 * The measured region's data, derived from the store. A PURE FUNCTION OF THE
 * TREE, exactly as `deriveStatic` is -- which is what makes `verify:counts`
 * able to write this region, what makes `npm test` able to check it with no
 * browser, and what makes regenerating on a merged tree produce the merged
 * tree's own answer whatever either side had written.
 *
 * `date`/`sha` are the NEWEST measurement in the store and `oldest` is the
 * other end, because a store assembled from a full pass plus two later
 * single-spec runs has no single measurement instant and claiming one would
 * be the lie this file exists to prevent.
 *
 * @param {string} [root]
 * @returns {MeasuredData}
 */
export function deriveMeasured(root = REPO_ROOT) {
	const { specs, selftest } = readStore(root);
	const dates = specs.map((m) => m.date).sort();
	const newest = specs.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).at(-1);
	return {
		schema: MEASURED_SCHEMA,
		date: dates.at(-1) ?? '',
		sha: newest?.sha ?? '',
		dirty: specs.some((m) => m.dirty),
		oldest: dates[0] ?? '',
		covered: specs.map((m) => m.spec).sort(),
		runsMeasured: specs.reduce((n, m) => n + m.runs, 0),
		measurements: specs.reduce((n, m) => n + m.measurements, 0),
		outside: specs.reduce((n, m) => n + m.outsideRows.length, 0),
		outsideRows: specs.flatMap((m) => m.outsideRows),
		totalMs: specs.reduce((n, m) => n + m.ms, 0),
		selftest
	};
}

/**
 * Writes one store file per spec the report covered, and NOTHING for any spec
 * it did not. That is the whole of what makes a partial re-measure a
 * first-class operation and a merge additive.
 *
 * WHAT IT REFUSES is a spec measured at only SOME of the widths. A file
 * claiming both widths from a one-width run is the same lie the old
 * full-pass guard existed to refuse, in a smaller costume, so the check moved
 * from "is this report the whole tree" to "is every spec in it whole".
 *
 * `ms` is an ATTRIBUTION and says so in `measured/README.md`: `run.mjs`
 * reports one wall clock for the pass, so an equal share is the only honest
 * per-spec number derivable from it, and the sum over a store written by one
 * full pass is that pass's wall clock exactly.
 *
 * @param {Report} report
 * @param {{ head: Head, date: string, widths: number[], root?: string }} ctx
 * @returns {Promise<string[]>} the spec files written, sorted
 */
export async function writeStore(report, { head, date, widths, root = REPO_ROOT }) {
	const bySpec = await groupReportBySpec(report);
	const dir = measuredDir(root);
	mkdirSync(dir, { recursive: true });
	const perSpecMs = bySpec.size ? report.totalMs / bySpec.size : 0;
	/** @type {string[]} */
	const written = [];
	for (const [specFile, e] of [...bySpec].sort(([a], [b]) => a.localeCompare(b))) {
		const missing = widths.filter((w) => !e.widths.includes(w));
		if (missing.length) {
			throw new Error(
				`the report measured ${specFile} at ${e.widths.join(', ')} but this tree runs ${widths.join(', ')}; a store file claiming a width the run never visited is the same claim the old full-pass guard refused. Rerun \`${MEASURED_SCRIPT}\` without a --width filter.`
			);
		}
		/** @type {SpecMeasurement} */
		const m = {
			schema: SPEC_SCHEMA,
			spec: specFile,
			date,
			sha: head.sha,
			dirty: head.dirty,
			widths: e.widths,
			runs: e.runs.length,
			measurements: e.measurements,
			outsideRows: e.outsideRows,
			ms: Math.round(perSpecMs)
		};
		writeFileSync(join(dir, measurementFileFor(specFile)), `${JSON.stringify(m, null, '\t')}\n`);
		written.push(specFile);
	}
	return written;
}

/**
 * The selftest record. No clock and no sha, for the static region's reason:
 * an unchanged instrument regenerates to the same bytes, so two lanes that
 * both ran `--selftest` cannot conflict on it.
 *
 * @param {SelfTest} selftest
 * @param {string} [root]
 */
export function writeSelftest(selftest, root = REPO_ROOT) {
	const dir = measuredDir(root);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, SELFTEST_FILE),
		`${JSON.stringify({ schema: SPEC_SCHEMA, ...selftest }, null, '\t')}\n`
	);
}

const SELFTEST_RE = /(\d+) controls run \((\d+) negative, (\d+) positive\), (\d+) instrument failure\(s\)/;

/**
 * @param {string} stdout
 * @returns {SelfTest | null}
 */
export function parseSelftest(stdout) {
	const m = SELFTEST_RE.exec(stdout);
	if (!m) return null;
	return { controls: +m[1], negative: +m[2], positive: +m[3], failures: +m[4] };
}

/**
 * @param {string[]} [routes] `run.mjs --route` filters; empty is the whole tree
 * @returns {Report}
 */
function runHarnessJson(routes = []) {
	const dir = mkdtempSync(join(tmpdir(), 'readme-counts-'));
	const out = join(dir, 'report.json');
	try {
		const args = [join(HERE, 'run.mjs'), '--json', out];
		for (const f of routes) args.push('--route', f);
		const r = spawnSync(process.execPath, args, {
			cwd: REPO_ROOT,
			stdio: ['ignore', 'inherit', 'inherit'],
			env: process.env
		});
		if (r.status !== 0) throw new Error(`run.mjs exited ${r.status}`);
		return JSON.parse(readFileSync(out, 'utf8'));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** @returns {SelfTest} */
function runSelftest() {
	const r = spawnSync(process.execPath, [join(HERE, 'run.mjs'), '--selftest'], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		env: process.env
	});
	const parsed = parseSelftest((r.stdout ?? '') + (r.stderr ?? ''));
	if (!parsed) throw new Error('could not read the controls line from `run.mjs --selftest`');
	return parsed;
}

/**
 * @param {string} [root]
 * @returns {Head}
 */
function gitHead(root = REPO_ROOT) {
	const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], {
		encoding: 'utf8'
	})
		.split('\n')
		.filter((l) => l.trim() && !l.includes('tools/browser-verify/README.md')).length > 0;
	return { sha, dirty };
}

/* ------------------------------------------------------------------------ */
/* The two regions.                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Everything the static region carries. Keys stable: it is committed. NOTHING
 * here may be a clock, a sha or anything else that moves without the tree
 * moving -- see the header.
 * @param {StaticCounts} stat
 * @returns {StaticData}
 */
export function assembleStatic(stat) {
	return {
		schema: STATIC_SCHEMA,
		specs: stat.specs,
		routes: stat.routes,
		devPages: stat.devPages,
		widths: stat.widths,
		runs: stat.runs
	};
}

/**
 * Everything the measured region carries. `deriveMeasured` is the only
 * producer now -- the region is a pure function of `measured/` -- so this is
 * kept as the ONE place that names the region's keys, for the round trip
 * `tests/derived-numbers.test.ts` drives and for a caller assembling a
 * hypothetical region without a store on disk.
 *
 * @param {{ measured: MeasuredCounts, selftest: SelfTest | null, head: Head, date: string, oldest?: string, covered: string[] }} parts
 * @returns {MeasuredData}
 */
export function assembleMeasured({ measured, selftest, head, date, oldest, covered }) {
	return {
		schema: MEASURED_SCHEMA,
		date,
		sha: head.sha,
		dirty: head.dirty,
		oldest: oldest ?? date,
		covered: [...covered].sort(),
		runsMeasured: measured.runsMeasured,
		measurements: measured.measurements,
		outside: measured.outside,
		outsideRows: measured.outsideRows,
		totalMs: measured.totalMs,
		selftest
	};
}

/**
 * @param {StaticData} c
 * @returns {string}
 */
export function renderStatic(c) {
	return [
		STATIC_BEGIN,
		`**Generated by \`${STATIC_SCRIPT}\`; do not edit by hand.** Derived from this tree alone: no browser, no dev server, under a second. Rerun it after adding or removing a route spec or a \`/dev\` page, and after resolving a merge that touched this region. It carries no date and no commit on purpose, so an unchanged tree regenerates to the same bytes. \`tests/derived-numbers.test.ts\` reddens when it disagrees with the tree.`,
		'',
		'| Count | Value |',
		'| --- | --- |',
		`| Route specs (\`routes/*.mjs\`, \`_\`-prefixed excluded) | ${c.specs} |`,
		`| Distinct routes those specs drive (alias-resolved, query string stripped) | ${c.routes} |`,
		`| Directories under \`src/routes/dev\` with a page (the candidate set) | ${c.devPages} |`,
		`| Widths | ${c.widths.length} (${c.widths.join(', ')}) |`,
		`| Route/width runs a full pass makes (specs x widths) | ${c.runs} |`,
		'',
		`${STATIC_DATA_PREFIX}${JSON.stringify(c)}${DATA_SUFFIX}`,
		STATIC_END
	].join('\n');
}

/** @param {OutsideRow} o */
const outsideLine = (o) => `- \`${o.path}\` @${o.width} \`${o.check}\`${o.label ? ` ${o.label}` : ''}`;

/**
 * @param {MeasuredData} c
 * @returns {string}
 */
export function renderMeasured(c) {
	const span =
		c.oldest && c.oldest !== c.date
			? `between ${c.oldest} and ${c.date}`
			: `at ${c.date}`;
	const lines = [
		MEASURED_BEGIN,
		`**Generated by \`${STATIC_SCRIPT}\` from \`${MEASURED_DIRNAME}/\`; do not edit by hand.** Every route spec carries its OWN measurement file there, written by \`${MEASURED_SCRIPT}\` -- which needs a browser and about seventeen minutes for the whole tree, and seconds for one spec with \`-- --route <spec>\`. This table is the sum over those files, so it is a tree read like the static region above and costs nothing to regenerate on a merged tree. The newest measurement here was taken on commit \`${(c.sha || '').slice(0, 7)}\`${c.dirty ? ' (a working tree was dirty at measurement)' : ''}; measurements were taken ${span}. A stale-but-honest measured half is a supported state.`,
		'',
		`**Is this measured against this tree? Compare \`Route specs measured\` below against \`Route specs\` in the static region above.** If they differ, every number here -- the outside-threshold count included -- was measured over a different set of routes than this tree has, and a zero is a zero for that set and not for this one. The commit is recorded too, but on its own it is a WEAK signal: a stale measurement's commit is still an ancestor of HEAD and reads as perfectly plausible. \`tests/derived-numbers.test.ts\` names the unmeasured specs.`,
		'',
		'| Count | Value |',
		'| --- | --- |',
		`| Route specs measured (one file each under \`${MEASURED_DIRNAME}/\`) | ${c.covered.length} |`,
		`| Route/width runs those measurements cover | ${c.runsMeasured} |`,
		`| Measurements | ${c.measurements} |`,
		`| Measurements outside threshold | ${c.outside} |`,
		`| Wall clock, summed from each spec's attributed share | ${(c.totalMs / 1000).toFixed(1)}s |`,
		`| \`--selftest\` controls | ${c.selftest ? `${c.selftest.controls} (${c.selftest.negative} negative, ${c.selftest.positive} positive), ${c.selftest.failures} instrument failure(s)` : 'not run'} |`,
		'',
		c.outsideRows.length
			? 'Measurements outside threshold, by the spec whose file records them:'
			: 'No measurement in this store was outside its threshold.',
		...(c.outsideRows.length ? ['', ...c.outsideRows.map(outsideLine)] : []),
		'',
		`${MEASURED_DATA_PREFIX}${JSON.stringify(c)}${DATA_SUFFIX}`,
		MEASURED_END
	];
	return lines.join('\n');
}

/**
 * One region out of a README, with its parsed data line. Throws when the
 * markers are missing or doubled, or when the data line is gone -- which is
 * what a merge conflict that swallowed a marker looks like.
 *
 * @param {string} readme
 * @param {{ begin: string, end: string, prefix: string, script: string }} region
 * @returns {{ block: string, data: any }}
 */
export function parseRegion(readme, region) {
	const begins = readme.split(region.begin).length - 1;
	const ends = readme.split(region.end).length - 1;
	if (begins !== 1 || ends !== 1) {
		throw new Error(
			`README carries ${begins} ${region.begin} and ${ends} ${region.end} markers; exactly one of each is required. If a merge removed one, restore the pair and rerun \`${region.script}\`.`
		);
	}
	const a = readme.indexOf(region.begin);
	const b = readme.indexOf(region.end) + region.end.length;
	if (b < a) throw new Error(`${region.end} precedes ${region.begin}`);
	const block = readme.slice(a, b);
	const dl = block.split('\n').find((/** @type {string} */ l) => l.startsWith(region.prefix));
	if (!dl) throw new Error(`the region between ${region.begin} and ${region.end} carries no data line; rerun \`${region.script}\``);
	return { block, data: JSON.parse(dl.slice(region.prefix.length, -DATA_SUFFIX.length)) };
}

/** @type {{ begin: string, end: string, prefix: string, script: string }} */
export const STATIC_REGION = { begin: STATIC_BEGIN, end: STATIC_END, prefix: STATIC_DATA_PREFIX, script: STATIC_SCRIPT };
/** @type {{ begin: string, end: string, prefix: string, script: string }} */
export const MEASURED_REGION = { begin: MEASURED_BEGIN, end: MEASURED_END, prefix: MEASURED_DATA_PREFIX, script: MEASURED_SCRIPT };

/**
 * @param {string} readme
 * @returns {{ block: string, data: StaticData }}
 */
export function parseStatic(readme) {
	return parseRegion(readme, STATIC_REGION);
}

/**
 * @param {string} readme
 * @returns {{ block: string, data: MeasuredData }}
 */
export function parseMeasured(readme) {
	return parseRegion(readme, MEASURED_REGION);
}

/**
 * Replaces one region wholesale, WHATEVER is between its markers -- conflict
 * markers included. That is what makes regenerating the correct way to resolve
 * a merge here rather than choosing a side.
 *
 * The replacement is a FUNCTION, not a string: `String.prototype.replace`
 * interprets `$&`, `$'` and friends in a replacement string, and the data line
 * is JSON carrying arbitrary check labels.
 *
 * @param {string} readme
 * @param {{ begin: string, end: string, prefix: string, script: string }} region
 * @param {string} block
 * @returns {string}
 */
export function spliceRegion(readme, region, block) {
	const begins = readme.split(region.begin).length - 1;
	const ends = readme.split(region.end).length - 1;
	if (begins !== 1 || ends !== 1) {
		throw new Error(
			`README carries ${begins} ${region.begin} and ${ends} ${region.end} markers; exactly one of each is required before this region can be rewritten.`
		);
	}
	const a = readme.indexOf(region.begin);
	const b = readme.indexOf(region.end) + region.end.length;
	if (b < a) throw new Error(`${region.end} precedes ${region.begin}`);
	return readme.slice(0, a) + block + readme.slice(b);
}

/**
 * The route specs this tree has that the recorded measurement never covered,
 * and the ones it covered that this tree no longer has. A set difference over
 * two `readdirSync`-cheap lists.
 *
 * `missing` IS THE ONE THAT CAN HIDE A FINDING: a spec the run never visited
 * contributes no measurement, so it cannot contribute an outside-threshold
 * row either, and the block's count is a count over a smaller set than the
 * reader is looking at.
 *
 * `removed` CANNOT, and is reported rather than failed on: a measurement that
 * covered a route since deleted covered a SUPERSET of this tree, so its zero
 * is still a zero here. It is worth printing because it says the block is old,
 * and worth keeping out of the failure because refusing it would block a
 * bundle that only deleted a spec.
 *
 * A schema-1 region carries no `covered` list at all; both sets come back
 * empty and the schema check is what reddens instead.
 *
 * @param {MeasuredData} data
 * @param {string[]} specFiles the tree's own spec files, from `deriveSpecFiles`
 * @returns {{ missing: string[], removed: string[] }}
 */
export function unmeasuredSpecs(data, specFiles) {
	if (!Array.isArray(data?.covered)) return { missing: [], removed: [] };
	const covered = new Set(data.covered);
	const tree = new Set(specFiles);
	return {
		missing: specFiles.filter((f) => !covered.has(f)).sort(),
		removed: data.covered.filter((f) => !tree.has(f)).sort()
	};
}

/**
 * The measured keys `--check` compares. Not the date, the sha, the dirty flag
 * or the wall clock.
 * @param {MeasuredData} c
 */
export function comparableMeasured(c) {
	return {
		runsMeasured: c.runsMeasured,
		measurements: c.measurements,
		outside: c.outside,
		outsideRows: c.outsideRows,
		covered: c.covered,
		selftest: c.selftest
	};
}

/* ------------------------------------------------------------------------ */
/* Verification. One definition of "the region agrees", shared by --check and */
/* by tests/derived-numbers.test.ts.                                          */
/* ------------------------------------------------------------------------ */

/**
 * The static region against the tree. Cheap: no browser, no report, always
 * available. Every message NAMES THE SCRIPT rather than printing a diff of
 * numbers -- a message that shows the right number invites the hand edit the
 * render check then refuses.
 *
 * @param {string} readme
 * @param {StaticCounts} [live] the derivation from the current tree
 * @returns {string[]}
 */
export function verifyStatic(readme, live) {
	/** @type {string[]} */
	const problems = [];
	/** @type {{ block: string, data: StaticData }} */
	let parsed;
	try {
		parsed = parseStatic(readme);
	} catch (/** @type {any} */ e) {
		return [String(e?.message ?? e)];
	}
	const { block, data } = parsed;
	if (data.schema !== STATIC_SCHEMA) {
		// AND NOTHING BELOW RUNS. A region of another schema is not this
		// renderer's to re-render: `renderStatic` reads keys this version
		// defines, so putting an older or newer shape through it THROWS out of
		// a function whose whole job is to report problems rather than raise
		// them. Measured on the schema-1 -> 2 bump this file's header
		// describes: three assertions died with `Cannot read properties of
		// undefined` instead of one saying to rerun the script.
		problems.push(`the static counts region is schema ${data.schema} and this script writes ${STATIC_SCHEMA}; rerun \`${STATIC_SCRIPT}\``);
		return problems;
	}
	if (renderStatic(data) !== block) {
		problems.push(
			`a value in the static counts table was edited by hand (it no longer renders from its own data line). Do not correct it by hand: rerun \`${STATIC_SCRIPT}\`.`
		);
	}
	if (data.runs !== data.specs * data.widths.length) {
		problems.push(`the static counts region is internally inconsistent (runs is not specs x widths); rerun \`${STATIC_SCRIPT}\``);
	}
	if (live) {
		/** @type {[('specs' | 'routes' | 'devPages' | 'runs'), string][]} */
		const NUMERIC = [
			['specs', 'route specs'],
			['routes', 'distinct routes'],
			['devPages', '/dev pages'],
			['runs', 'route/width runs']
		];
		/** @type {string[]} */
		const moved = [];
		for (const [k, label] of NUMERIC) {
			if (live[k] !== data[k]) moved.push(label);
		}
		if (JSON.stringify(live.widths) !== JSON.stringify(data.widths)) moved.push('widths');
		if (moved.length) {
			problems.push(
				`the static counts region is out of date with this tree (${moved.join(', ')}). Regenerate it: \`${STATIC_SCRIPT}\` -- a tree read, under a second, no browser and no dev server.`
			);
		}
	}
	return problems;
}

/**
 * The measured region. Against its own data line always; against the tree's
 * SPEC FILE LIST when one is handed in (cheap, no browser); and against a
 * fresh run only when one was handed in, which needs a browser and ~6 minutes.
 *
 * THE COVERAGE RULE IS A CONJUNCTION AND THAT IS THE ARGUMENT, NOT AN
 * OVERSIGHT. It refuses `unmeasured specs AND the block claims zero findings`,
 * because that pair is exactly what tells a reader consulting the one
 * generated place that there is nothing to see. It deliberately does NOT
 * refuse:
 *
 *   * unmeasured specs beside a NON-EMPTY findings list -- the list may be
 *     incomplete, but the block is no longer claiming nothing is there, and
 *     failing here would make every route-adding bundle spend six minutes and
 *     a browser, which is the coupling the two-region split exists to remove;
 *   * a spec FILE EDITED since the measurement -- a new check added to an
 *     existing spec moves no filename, so this signal is blind to it. Hashing
 *     the files would catch it and would also redden on a whitespace change,
 *     which is the hard-fail-on-everything rule wearing a different hat;
 *   * a spec REMOVED since the measurement (see `unmeasuredSpecs`);
 *   * the APP changing under an unchanged spec set. Nothing cheap can see
 *     that, and it is what the recorded commit is for -- weakly.
 *
 * @param {string} readme
 * @param {{ fresh?: MeasuredData, specFiles?: string[], widths?: number, store?: MeasuredData }} [against]
 * @returns {string[]}
 */
export function verifyMeasured(readme, { fresh, specFiles, widths, store } = {}) {
	/** @type {string[]} */
	const problems = [];
	/** @type {{ block: string, data: MeasuredData }} */
	let parsed;
	try {
		parsed = parseMeasured(readme);
	} catch (/** @type {any} */ e) {
		return [String(e?.message ?? e)];
	}
	const { block, data } = parsed;
	if (data.schema !== MEASURED_SCHEMA) {
		// Early, for the reason spelled out in `verifyStatic`: a region of
		// another schema cannot be put through this version's renderer.
		problems.push(`the measured counts region is schema ${data.schema} and this script writes ${MEASURED_SCHEMA}; rerun \`${MEASURED_SCRIPT}\` (needs a browser, about six minutes).`);
		return problems;
	}
	// AND THE SAME EARLY RETURN FOR A MISSING FIELD, for the same reason: every
	// one of these is dereferenced by `renderMeasured`, so a data line a merge
	// or a hand edit truncated would raise out of the render check below
	// instead of being reported. The schema guard does not cover it -- a data
	// line can say `"schema":2` and be missing everything after it.
	const shape = /** @type {const} */ (['covered', 'outsideRows', 'sha', 'date']).filter(
		(k) => data[k] === undefined || data[k] === null
	);
	if (shape.length) {
		problems.push(`the measured counts region's data line is missing ${shape.join(', ')}; rerun \`${MEASURED_SCRIPT}\` (needs a browser, about six minutes).`);
		return problems;
	}
	if (renderMeasured(data) !== block) {
		problems.push(
			`a value in the measured counts table was edited by hand (it no longer renders from its own data line). Do not correct it by hand: rerun \`${STATIC_SCRIPT}\`, which rewrites this region from \`${MEASURED_DIRNAME}/\` in under a second.`
		);
	}
	// THE REGION AGAINST ITS OWN STORE (prompt 0168). The block is a pure
	// function of `measured/`, so this is the merged-tree check the measured
	// half never had: two lanes that each add a spec and each measure it write
	// two different store files, git merges both, and the rendered block still
	// describes whichever side it came from until somebody regenerates. It is
	// a `readdirSync` and a `JSON.parse` -- no browser anywhere in this path,
	// which is what lets it run on every `npm test` beside the static check.
	//
	// It is a SECOND check and not a replacement: the covered-set rule below
	// is about the store against the TREE (a spec nobody has measured) and
	// stays exactly as narrow as it was.
	if (store) {
		const a = JSON.stringify(data);
		const b = JSON.stringify(store);
		if (a !== b) {
			problems.push(
				`the measured counts region disagrees with \`${MEASURED_DIRNAME}/\`, which is what it is derived from. That is what a merge looks like: each side regenerated correctly for its own tree and the union is neither. Rerun \`${STATIC_SCRIPT}\` -- a tree read, under a second, no browser -- and commit the result.`
			);
		}
	}
	if (!/^[0-9a-f]{7,40}$/.test(data.sha ?? '')) {
		problems.push(`the measured counts region does not name the commit it was measured on; rerun \`${MEASURED_SCRIPT}\``);
	}
	if (Number.isNaN(Date.parse(data.date ?? ''))) {
		problems.push(`the measured counts region does not name the instant it was measured at; rerun \`${MEASURED_SCRIPT}\``);
	}
	if (data.outsideRows.length !== data.outside) {
		problems.push(`the measured counts region lists a different number of outside-threshold rows than it counts; rerun \`${MEASURED_SCRIPT}\``);
	}
	if (widths && Array.isArray(data.covered) && data.covered.length * widths !== data.runsMeasured) {
		// The harness runs every selected spec at every width, unconditionally
		// (`run.mjs` pushes one run per spec per width with no branch), so this
		// product is structural. A region that fails it was written from a
		// FILTERED report (`run.mjs --only`), which must never write this
		// block. The width count is the CALLER's -- taken from the same static
		// derivation it already has -- and never a literal here: two spellings
		// of how many widths a pass runs is the pair that stops matching.
		problems.push(`the measured counts region covers ${data.covered.length} specs at ${widths} widths but carries ${data.runsMeasured} route/width runs; that report was not a full pass. Rerun \`${MEASURED_SCRIPT}\` with no route filter.`);
	}
	if (specFiles) {
		const { missing } = unmeasuredSpecs(data, specFiles);
		if (missing.length && data.outside === 0) {
			problems.push(
				`the measured counts region reports no measurement outside its threshold, but ${missing.length} route spec${missing.length === 1 ? '' : 's'} in this tree ${missing.length === 1 ? 'was' : 'were'} never measured by that run: ${missing.join(', ')}. A zero over a set that is missing ${missing.length === 1 ? 'it' : 'them'} is not a zero for this tree, and it is the sentence a reader consults. Rerun \`${MEASURED_SCRIPT}\` (needs a browser, about six minutes) and let the block say what that run actually found.`
			);
		}
	}
	if (fresh) {
		const a = JSON.stringify(comparableMeasured(data));
		const b = JSON.stringify(comparableMeasured(fresh));
		if (a !== b) problems.push(`the committed measured region disagrees with a fresh run:\n  committed ${a}\n  fresh     ${b}`);
	}
	return problems;
}

/**
 * Both regions, plus the envelope. The union predicate, so `--check`, the test
 * and any future caller cannot disagree about what "the block agrees" means.
 *
 * @param {string} readme
 * @param {{ live?: StaticCounts, fresh?: MeasuredData, specFiles?: string[], store?: MeasuredData }} [against]
 * @returns {string[]}
 */
export function verifyBlock(readme, { live, fresh, specFiles, store } = {}) {
	/** @type {string[]} */
	const problems = [];
	const begins = readme.split(COUNTS_BEGIN).length - 1;
	const ends = readme.split(COUNTS_END).length - 1;
	if (begins !== 1 || ends !== 1) {
		problems.push(`README carries ${begins} ${COUNTS_BEGIN} and ${ends} ${COUNTS_END} markers; exactly one of each is required (tools/idea-status.py reads that envelope)`);
	}
	problems.push(...verifyStatic(readme, live));
	problems.push(...verifyMeasured(readme, { fresh, specFiles, widths: live?.widths.length, store }));
	return problems;
}

/* ------------------------------------------------------------------------ */

/**
 * @param {string[]} argv
 * @returns {{ mode: 'static' | 'measured', check: boolean, from: string | null, selftest: boolean, routes: string[] }}
 */
export function parseArgs(argv) {
	/** @type {{ mode: 'static' | 'measured', check: boolean, from: string | null, selftest: boolean, routes: string[] }} */
	const o = { mode: 'measured', check: false, from: null, selftest: true, routes: [] };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--static') o.mode = 'static';
		else if (a === '--check') o.check = true;
		else if (a === '--from') o.from = argv[++i];
		else if (a === '--route') o.routes.push(argv[++i]);
		else if (a === '--no-selftest') o.selftest = false;
		else throw new Error(`unknown argument ${a}`);
	}
	if (o.mode === 'static' && (o.from || !o.selftest || o.routes.length)) {
		throw new Error('--from, --route and --no-selftest are measured-half options; --static runs no harness at all');
	}
	// A ROUTE FILTER AND `--check` DO NOT COMPOSE, and refusing is the whole
	// of it: `--check` compares the committed region against a FRESH run, and
	// a fresh run of two routes is not a thing the region ever claims to be.
	if (o.check && o.routes.length) {
		throw new Error('--check compares the committed region against a full fresh run; it does not take --route');
	}
	return o;
}

/** @param {string[]} problems */
function reportProblems(problems) {
	for (const p of problems) console.error(`  - ${p}`);
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const stat = await deriveStatic();
	const specFiles = deriveSpecFiles();
	const readme = readFileSync(README_PATH, 'utf8');

	/* --------------------------------------------------------------- */
	/* The tree read. No browser, no dev server, no report -- and since  */
	/* prompt 0168 it writes BOTH regions, because the measured one is   */
	/* now a pure function of `measured/` exactly as the static one is a */
	/* pure function of `routes/`. That is what makes ONE sub-second     */
	/* command the correct resolution for a merge conflict here, for     */
	/* both halves rather than one, and it is what `integrate.yml`'s     */
	/* `counts_refresh` already runs on every merged tree.               */
	/* --------------------------------------------------------------- */
	if (opts.mode === 'static') {
		const store = deriveMeasured();
		if (opts.check) {
			const problems = verifyBlock(readme, { live: stat, specFiles, store });
			if (problems.length) {
				console.error('verify:counts --check: the counts regions are stale or edited:');
				reportProblems(problems);
				return 1;
			}
			console.log('verify:counts --check: both counts regions agree with this tree.');
			return 0;
		}
		const next = spliceRegion(
			spliceRegion(readme, STATIC_REGION, renderStatic(assembleStatic(stat))),
			MEASURED_REGION,
			renderMeasured(store)
		);
		if (next !== readme) {
			writeFileSync(README_PATH, next);
			console.log(`readme-counts --static: counts regions rewritten in ${README_PATH}`);
		} else {
			console.log('readme-counts --static: both counts regions were already this tree\'s own answer. Nothing written.');
		}
		console.log(`  static:   ${stat.specs} specs over ${stat.routes} routes, ${stat.devPages} /dev pages, ${stat.widths.length} widths, ${stat.runs} runs`);
		console.log(`  measured: ${store.covered.length} spec(s) measured, ${store.measurements} measurement(s), ${store.outside} outside threshold`);
		// THIS COMMAND IS EXACTLY WHAT A BUNDLE THAT ADDED A SPEC RUNS, which
		// is the moment the measured half goes stale. It cannot fix that -- a
		// spec with no store file has never been measured and no tree read can
		// invent one -- so it says which, rather than letting `npm test` be the
		// first to mention it.
		reportCoverage(next);
		return 0;
	}

	/* --------------------------------------------------------------- */
	/* The measured half. The browser one: it takes the measurement and  */
	/* writes one store file per spec it covered, then derives.          */
	/* --------------------------------------------------------------- */
	const report = opts.from ? JSON.parse(readFileSync(opts.from, 'utf8')) : runHarnessJson(opts.routes);
	if (!report?.runs?.length) throw new Error('that report carries no runs at all; there is nothing to record.');

	// A FULL PASS IS NO LONGER REQUIRED AND A PARTIAL ONE IS NOT A LIE. The
	// guard that used to stand here refused any report that was not the whole
	// tree, because the one-line region it wrote claimed full coverage
	// whatever it had been handed. The store claims coverage FILE BY FILE, so
	// a two-route report writes two files and the coverage claim stays true;
	// what `writeStore` still refuses is a spec measured at only some of the
	// widths, which is that same lie in a smaller costume.
	const head = gitHead();
	const date = new Date().toISOString();
	const written = await writeStore(report, { head, date, widths: stat.widths });

	const selftest = opts.selftest ? runSelftest() : null;
	if (selftest) writeSelftest(selftest);

	const fresh = deriveMeasured();

	if (opts.check) {
		const problems = verifyBlock(readme, { live: stat, fresh, specFiles, store: fresh });
		if (problems.length) {
			console.error('readme-counts --check: the committed counts are stale or edited:');
			reportProblems(problems);
			return 1;
		}
		console.log('readme-counts --check: both counts regions agree with this tree and a fresh run.');
		return 0;
	}

	// BOTH REGIONS, FROM ONE PLACE. The old split had the measured run
	// deliberately NOT write the static half, so a browser session's commit
	// carried no static-count diff. That reason is gone: the static half is
	// now regenerated by the same tree read that renders the measured one, so
	// writing one without the other would leave the file in a state this
	// script's own `--check` refuses.
	const next = spliceRegion(
		spliceRegion(readme, STATIC_REGION, renderStatic(assembleStatic(stat))),
		MEASURED_REGION,
		renderMeasured(fresh)
	);
	writeFileSync(README_PATH, next);
	console.log(`readme-counts: ${written.length} measurement file(s) written under ${MEASURED_DIRNAME}/, both counts regions rewritten in ${README_PATH}`);
	console.log(
		written.length > 6
			? `  this run measured ${written.length} spec(s): ${written.slice(0, 3).join(', ')} ... ${written.slice(-2).join(', ')}`
			: `  this run measured: ${written.join(', ')}`
	);
	console.log(`  the store now holds ${fresh.covered.length} spec(s), ${fresh.runsMeasured} runs, ${fresh.measurements} measurements, ${fresh.outside} outside threshold, ${(fresh.totalMs / 1000).toFixed(1)}s, newest on ${(fresh.sha || '').slice(0, 7)}`);
	reportCoverage(next);
	return 0;
}

/**
 * Prints what the committed measured region did and did not cover, against
 * this tree. Says nothing when it covered all of it.
 * @param {string} readme
 */
function reportCoverage(readme) {
	/** @type {{ data: MeasuredData }} */
	let parsed;
	try {
		parsed = parseMeasured(readme);
	} catch {
		return;
	}
	const { missing } = unmeasuredSpecs(parsed.data, deriveSpecFiles());
	if (missing.length) {
		console.log(`  note: ${missing.length} spec(s) in this tree have no measurement under ${MEASURED_DIRNAME}/: ${missing.join(', ')}`);
		console.log(`        \`${MEASURED_SCRIPT} -- ${missing.map((f) => `--route ${f.replace(/\.mjs$/, '')}`).join(' ')}\` measures just those; it needs a browser and leaves every other spec's file alone.`);
		if (parsed.data.outside === 0) {
			console.log(`        The region reports no measurement outside its threshold, which is a claim about a set that is missing them. \`npm test\` reddens on that pair.`);
		}
	}
	// AN ORPHAN IS REPORTED AND NEVER FAILED ON, which is the `removed` rule
	// the one-line region already had, now expressed as a file nobody deleted:
	// a store covering a SUPERSET of this tree still has a valid zero here, so
	// refusing would block a bundle that only deleted a spec.
	const { orphans } = readStore();
	if (orphans.length) {
		console.log(`  note: ${MEASURED_DIRNAME}/ holds ${orphans.length} measurement(s) for spec(s) this tree no longer has: ${orphans.join(', ')}`);
		console.log(`        They are excluded from every number above and are safe to delete.`);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().then(
		(code) => process.exit(code),
		(err) => {
			console.error(err?.stack ?? err);
			process.exit(2);
		}
	);
}
