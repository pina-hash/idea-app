#!/usr/bin/env node
/**
 * tools/browser-verify/readme-counts.mjs -- the ONE writer of the counts block
 * in README.md.
 *
 *   npm run verify:readme                     run the harness, rewrite the block
 *   npm run verify:readme -- --check          run the harness, exit 1 if the
 *                                             committed block disagrees with it
 *   npm run verify:readme -- --from out.json  reuse a `run.mjs --json out.json`
 *                                             report instead of running again
 *   npm run verify:readme -- --no-selftest    skip the ~30s `--selftest` count
 *
 * A HAND-WRITTEN FILE NEVER HOLDS A COMPUTED VALUE (IDEA_instructions.md 4.17).
 * README.md carried a spec count, a route count, a run count, a measurement
 * count, a findings count and a wall clock, and every one of them was wrong on
 * every tree checked on 2026-08-31, because the file was being asked to be
 * right by hand about numbers the harness computes on every run. So the
 * harness writes them: this script runs `run.mjs --json`, reads the report,
 * and rewrites ONE block between `<!-- counts:begin -->` and
 * `<!-- counts:end -->`, carrying the numbers, the sha they were measured on
 * and the ISO date. `tests/derived-numbers.test.ts` fails CI when the block
 * has been edited by hand or when a spec was added without regenerating it.
 *
 * WHAT THE HARNESS WRITES ON ITS OWN: nothing. `run.mjs` prints a summary and
 * persists a report only when handed `--json <file>`; there is no last-run
 * file to read. So this script runs it (or takes a report via `--from`).
 *
 * TWO KINDS OF NUMBER, AND THE TEST TREATS THEM DIFFERENTLY. The STATIC counts
 * (route specs, distinct routes, /dev pages, widths, and runs = specs x widths)
 * are derived from the tree with no browser, so the test re-derives them live
 * and fails the moment a spec lands without a regeneration. The MEASURED
 * counts (measurements, findings, wall clock, self-test controls) need a
 * browser and ~5 minutes, which is too slow and too browser-shaped for CI
 * (README.md, "Why it is not in npm test and not in CI"); for those the test
 * checks the rendered table against the machine-readable `counts:data` line
 * the same run wrote, so a digit edited by hand reddens and a stale-but-honest
 * block does not. `--check` is the full comparison against a fresh run, for a
 * session that has the browser.
 *
 * The wall clock is recorded and deliberately NOT compared by `--check`: it
 * moves on every run and a comparison on it would never pass twice.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
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
 * @typedef {{ path: string, width: number, check: string, label: string }} OutsideRow
 * @typedef {{ runsMeasured: number, measurements: number, outside: number, outsideRows: OutsideRow[], totalMs: number }} MeasuredCounts
 * @typedef {{ controls: number, negative: number, positive: number, failures: number }} SelfTest
 * @typedef {{ sha: string, dirty: boolean }} Head
 * @typedef {StaticCounts & MeasuredCounts & { schema: number, date: string, sha: string, dirty: boolean, selftest: SelfTest | null }} Counts
 * @typedef {{ runs: { path: string, width: number, results: { check: string, label?: string, withinThreshold: boolean }[] }[], totalMs: number }} Report
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../..');
export const README_PATH = join(HERE, 'README.md');
export const COUNTS_BEGIN = '<!-- counts:begin -->';
export const COUNTS_END = '<!-- counts:end -->';
const DATA_PREFIX = '<!-- counts:data ';
const DATA_SUFFIX = ' -->';
export const SCHEMA = 1;

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

/** @returns {Report} */
function runHarnessJson() {
	const dir = mkdtempSync(join(tmpdir(), 'readme-counts-'));
	const out = join(dir, 'report.json');
	try {
		const r = spawnSync(process.execPath, [join(HERE, 'run.mjs'), '--json', out], {
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
/* The block.                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Everything the block carries, in one object. Keep keys stable: it is committed.
 * @param {{ stat: StaticCounts, measured: MeasuredCounts, selftest: SelfTest | null, head: Head, date: string }} parts
 * @returns {Counts}
 */
export function assembleCounts({ stat, measured, selftest, head, date }) {
	return {
		schema: SCHEMA,
		date,
		sha: head.sha,
		dirty: head.dirty,
		specs: stat.specs,
		routes: stat.routes,
		devPages: stat.devPages,
		widths: stat.widths,
		runs: stat.runs,
		runsMeasured: measured.runsMeasured,
		measurements: measured.measurements,
		outside: measured.outside,
		outsideRows: measured.outsideRows,
		totalMs: measured.totalMs,
		selftest
	};
}

/** @param {OutsideRow} o */
const outsideLine = (o) => `- \`${o.path}\` @${o.width} \`${o.check}\`${o.label ? ` ${o.label}` : ''}`;

/**
 * @param {Counts} c
 * @returns {string}
 */
export function renderBlock(c) {
	const lines = [
		COUNTS_BEGIN,
		`**Generated by \`npm run verify:readme\`; do not edit by hand.** Measured ${c.date} on commit \`${c.sha.slice(0, 7)}\`${c.dirty ? ' (working tree dirty at measurement)' : ''} by a full run of \`tools/browser-verify/run.mjs\` in this container. \`tests/derived-numbers.test.ts\` reddens on a hand edit or on a spec added without regenerating.`,
		'',
		'| Count | Value |',
		'| --- | --- |',
		`| Route specs (\`routes/*.mjs\`, \`_\`-prefixed excluded) | ${c.specs} |`,
		`| Distinct routes those specs drive (alias-resolved, query string stripped) | ${c.routes} |`,
		`| Directories under \`src/routes/dev\` with a page (the candidate set) | ${c.devPages} |`,
		`| Widths | ${c.widths.length} (${c.widths.join(', ')}) |`,
		`| Route/width runs (specs x widths) | ${c.runs} |`,
		`| Route/width runs the report carried | ${c.runsMeasured} |`,
		`| Measurements | ${c.measurements} |`,
		`| Measurements outside threshold | ${c.outside} |`,
		`| Full-run wall clock | ${(c.totalMs / 1000).toFixed(1)}s |`,
		`| \`--selftest\` controls | ${c.selftest ? `${c.selftest.controls} (${c.selftest.negative} negative, ${c.selftest.positive} positive), ${c.selftest.failures} instrument failure(s)` : 'not run'} |`,
		'',
		c.outsideRows.length
			? 'Measurements outside threshold on that run:'
			: 'No measurement was outside its threshold on that run.',
		...(c.outsideRows.length ? ['', ...c.outsideRows.map(outsideLine)] : []),
		'',
		`${DATA_PREFIX}${JSON.stringify(c)}${DATA_SUFFIX}`,
		COUNTS_END
	];
	return lines.join('\n');
}

/**
 * { block, data } from a README, or throws when the block is missing or doubled.
 * @param {string} readme
 * @returns {{ block: string, data: Counts }}
 */
export function parseBlock(readme) {
	const begins = readme.split(COUNTS_BEGIN).length - 1;
	const ends = readme.split(COUNTS_END).length - 1;
	if (begins !== 1 || ends !== 1) {
		throw new Error(`README carries ${begins} begin and ${ends} end markers; exactly one of each is required`);
	}
	const a = readme.indexOf(COUNTS_BEGIN);
	const b = readme.indexOf(COUNTS_END) + COUNTS_END.length;
	if (b < a) throw new Error('counts:end precedes counts:begin');
	const block = readme.slice(a, b);
	const dl = block.split('\n').find((/** @type {string} */ l) => l.startsWith(DATA_PREFIX));
	if (!dl) throw new Error('the counts block carries no counts:data line');
	const data = JSON.parse(dl.slice(DATA_PREFIX.length, -DATA_SUFFIX.length));
	return { block, data };
}

/**
 * @param {string} readme
 * @param {string} block
 * @returns {string}
 */
export function spliceBlock(readme, block) {
	const { block: old } = parseBlock(readme);
	return readme.replace(old, block);
}

/**
 * The keys `--check` compares. Not the date, the sha, the dirty flag or the wall clock.
 * @param {Counts} c
 */
export function comparable(c) {
	return {
		specs: c.specs,
		routes: c.routes,
		devPages: c.devPages,
		widths: c.widths,
		runs: c.runs,
		runsMeasured: c.runsMeasured,
		measurements: c.measurements,
		outside: c.outside,
		outsideRows: c.outsideRows,
		selftest: c.selftest
	};
}

/**
 * Every way the committed block can be wrong, as sentences. `live` is the
 * static derivation from the current tree (always available); `fresh` is a
 * full measured set (only with a browser). Shared by --check and by the test
 * so there is one definition of "the block agrees".
 *
 * @param {string} readme
 * @param {{ live?: StaticCounts, fresh?: Counts }} [against]
 * @returns {string[]}
 */
export function verifyBlock(readme, { live, fresh } = {}) {
	/** @type {string[]} */
	const problems = [];
	/** @type {{ block: string, data: Counts }} */
	let parsed;
	try {
		parsed = parseBlock(readme);
	} catch (/** @type {any} */ e) {
		return [String(e?.message ?? e)];
	}
	const { block, data } = parsed;
	if (data.schema !== SCHEMA) problems.push(`counts:data schema is ${data.schema}, this script writes ${SCHEMA}`);
	if (renderBlock(data) !== block) {
		problems.push('the rendered block does not match its own counts:data line: a value in the table was edited by hand, or the block was written by a different version of this script');
	}
	if (!/^[0-9a-f]{7,40}$/.test(data.sha ?? '')) problems.push(`sha "${data.sha}" is not a commit id`);
	if (Number.isNaN(Date.parse(data.date ?? ''))) problems.push(`date "${data.date}" does not parse`);
	if (data.outsideRows.length !== data.outside) {
		problems.push(`outside is ${data.outside} but ${data.outsideRows.length} row(s) are listed`);
	}
	if (data.runs !== data.specs * data.widths.length) {
		problems.push(`runs ${data.runs} is not specs ${data.specs} x widths ${data.widths.length}`);
	}
	if (live) {
		/** @type {(keyof StaticCounts & keyof Counts)[]} */
		const NUMERIC = ['specs', 'routes', 'devPages', 'runs'];
		for (const k of NUMERIC) {
			if (live[k] !== data[k]) problems.push(`${k}: the tree derives ${live[k]}, the block says ${data[k]} (regenerate: npm run verify:readme)`);
		}
		if (JSON.stringify(live.widths) !== JSON.stringify(data.widths)) {
			problems.push(`widths: the tree says ${live.widths.join(',')}, the block says ${data.widths.join(',')}`);
		}
	}
	if (fresh) {
		const a = JSON.stringify(comparable(data));
		const b = JSON.stringify(comparable(fresh));
		if (a !== b) problems.push(`the committed block disagrees with a fresh run:\n  committed ${a}\n  fresh     ${b}`);
	}
	return problems;
}

/* ------------------------------------------------------------------------ */

/**
 * @param {string[]} argv
 * @returns {{ check: boolean, from: string | null, selftest: boolean }}
 */
function parseArgs(argv) {
	/** @type {{ check: boolean, from: string | null, selftest: boolean }} */
	const o = { check: false, from: null, selftest: true };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--check') o.check = true;
		else if (a === '--from') o.from = argv[++i];
		else if (a === '--no-selftest') o.selftest = false;
		else throw new Error(`unknown argument ${a}`);
	}
	return o;
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const stat = await deriveStatic();
	const report = opts.from ? JSON.parse(readFileSync(opts.from, 'utf8')) : runHarnessJson();
	const measured = summarizeReport(report);
	const selftest = opts.selftest ? runSelftest() : null;
	const fresh = assembleCounts({ stat, measured, selftest, head: gitHead(), date: new Date().toISOString() });
	const readme = readFileSync(README_PATH, 'utf8');

	if (opts.check) {
		const problems = verifyBlock(readme, { live: stat, fresh });
		if (problems.length) {
			console.error('readme-counts --check: the committed block is stale or edited:');
			for (const p of problems) console.error(`  - ${p}`);
			return 1;
		}
		console.log('readme-counts --check: the committed block agrees with a fresh run.');
		return 0;
	}

	const next = spliceBlock(readme, renderBlock(fresh));
	writeFileSync(README_PATH, next);
	console.log(`readme-counts: block rewritten in ${README_PATH}`);
	console.log(`  ${fresh.specs} specs over ${fresh.routes} routes, ${fresh.runsMeasured} runs, ${fresh.measurements} measurements, ${fresh.outside} outside threshold, ${(fresh.totalMs / 1000).toFixed(1)}s, measured on ${fresh.sha.slice(0, 7)}`);
	return 0;
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
