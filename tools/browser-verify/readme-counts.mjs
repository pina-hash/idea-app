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
 *                                             (~6 minutes, needs a browser)
 *                                             and rewrites that region.
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
 *            Needs a browser and ~6 minutes, which README.md says at length
 *            must stay outside `npm test` and outside CI. Checked only against
 *            the machine-readable data line the same run wrote beside it, so a
 *            hand-edited digit reddens and a stale-but-honest half does not.
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
 * @typedef {StaticCounts & { schema: number }} StaticData
 * @typedef {{ path: string, width: number, check: string, label: string }} OutsideRow
 * @typedef {{ runsMeasured: number, measurements: number, outside: number, outsideRows: OutsideRow[], totalMs: number }} MeasuredCounts
 * @typedef {{ controls: number, negative: number, positive: number, failures: number }} SelfTest
 * @typedef {{ sha: string, dirty: boolean }} Head
 * @typedef {MeasuredCounts & { schema: number, date: string, sha: string, dirty: boolean, covered: string[], selftest: SelfTest | null }} MeasuredData
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
export const MEASURED_SCHEMA = 2;

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
 * Everything the measured region carries, in one object.
 * @param {{ measured: MeasuredCounts, selftest: SelfTest | null, head: Head, date: string, covered: string[] }} parts
 * @returns {MeasuredData}
 */
export function assembleMeasured({ measured, selftest, head, date, covered }) {
	return {
		schema: MEASURED_SCHEMA,
		date,
		sha: head.sha,
		dirty: head.dirty,
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
	const lines = [
		MEASURED_BEGIN,
		`**Generated by \`${MEASURED_SCRIPT}\`; do not edit by hand.** Measured ${c.date} on commit \`${c.sha.slice(0, 7)}\`${c.dirty ? ' (working tree dirty at measurement)' : ''} by a full run of \`tools/browser-verify/run.mjs\` in this container. It needs a browser and about six minutes, so it is regenerated deliberately and not on every branch; a stale-but-honest measured half is a supported state.`,
		'',
		`**Is this measured against this tree? Compare \`Route specs the run covered\` below against \`Route specs\` in the static region above.** If they differ, every number here -- the outside-threshold count included -- was measured over a different set of routes than this tree has, and a zero is a zero for that set and not for this one. The commit is recorded too, but on its own it is a WEAK signal: a stale measurement's commit is still an ancestor of HEAD and reads as perfectly plausible. \`tests/derived-numbers.test.ts\` names the unmeasured specs.`,
		'',
		'| Count | Value |',
		'| --- | --- |',
		`| Route specs the run covered | ${c.covered.length} |`,
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
 * @param {{ fresh?: MeasuredData, specFiles?: string[], widths?: number }} [against]
 * @returns {string[]}
 */
export function verifyMeasured(readme, { fresh, specFiles, widths } = {}) {
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
			`a value in the measured counts table was edited by hand (it no longer renders from its own data line). Do not correct it by hand: rerun \`${MEASURED_SCRIPT}\` (needs a browser, about six minutes).`
		);
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
 * @param {{ live?: StaticCounts, fresh?: MeasuredData, specFiles?: string[] }} [against]
 * @returns {string[]}
 */
export function verifyBlock(readme, { live, fresh, specFiles } = {}) {
	/** @type {string[]} */
	const problems = [];
	const begins = readme.split(COUNTS_BEGIN).length - 1;
	const ends = readme.split(COUNTS_END).length - 1;
	if (begins !== 1 || ends !== 1) {
		problems.push(`README carries ${begins} ${COUNTS_BEGIN} and ${ends} ${COUNTS_END} markers; exactly one of each is required (tools/idea-status.py reads that envelope)`);
	}
	problems.push(...verifyStatic(readme, live));
	problems.push(...verifyMeasured(readme, { fresh, specFiles, widths: live?.widths.length }));
	return problems;
}

/* ------------------------------------------------------------------------ */

/**
 * @param {string[]} argv
 * @returns {{ mode: 'static' | 'measured', check: boolean, from: string | null, selftest: boolean }}
 */
export function parseArgs(argv) {
	/** @type {{ mode: 'static' | 'measured', check: boolean, from: string | null, selftest: boolean }} */
	const o = { mode: 'measured', check: false, from: null, selftest: true };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--static') o.mode = 'static';
		else if (a === '--check') o.check = true;
		else if (a === '--from') o.from = argv[++i];
		else if (a === '--no-selftest') o.selftest = false;
		else throw new Error(`unknown argument ${a}`);
	}
	if (o.mode === 'static' && (o.from || !o.selftest)) {
		throw new Error('--from and --no-selftest are measured-half options; --static runs no harness at all');
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
	/* The static half. No browser, no dev server, no report.           */
	/* --------------------------------------------------------------- */
	if (opts.mode === 'static') {
		if (opts.check) {
			const problems = verifyStatic(readme, stat);
			if (problems.length) {
				console.error('verify:counts --check: the static counts region is stale or edited:');
				reportProblems(problems);
				return 1;
			}
			console.log('verify:counts --check: the static counts region agrees with this tree.');
			return 0;
		}
		const next = spliceRegion(readme, STATIC_REGION, renderStatic(assembleStatic(stat)));
		const wrote = next !== readme;
		if (wrote) {
			writeFileSync(README_PATH, next);
			console.log(`readme-counts --static: static counts region rewritten in ${README_PATH}`);
			console.log(`  ${stat.specs} specs over ${stat.routes} routes, ${stat.devPages} /dev pages, ${stat.widths.length} widths, ${stat.runs} runs`);
		} else {
			console.log(`readme-counts --static: the static counts region was already current (${stat.specs} specs over ${stat.routes} routes, ${stat.devPages} /dev pages, ${stat.runs} runs). Nothing written.`);
		}
		// THE STATIC RUN NEVER WRITES THE MEASURED REGION either -- it has no
		// report and no browser. But this command is exactly what a bundle that
		// ADDED a spec runs, which is the moment the measured half goes stale,
		// so it says so here rather than letting `npm test` be the first to
		// mention it. The mirror of the note at the end of the measured path.
		reportCoverage(next);
		return 0;
	}

	/* --------------------------------------------------------------- */
	/* The measured half. This is the six-minute one.                   */
	/* --------------------------------------------------------------- */
	const report = opts.from ? JSON.parse(readFileSync(opts.from, 'utf8')) : runHarnessJson();
	const measured = summarizeReport(report);

	// WHAT THE RUN COVERED IS DERIVED HERE, FROM THE TREE THE HARNESS JUST RAN
	// ON, and then checked against the report's own shape. `run.mjs` pushes one
	// run per spec per width with no branch, so a report whose run count is not
	// that product came from a FILTERED pass (`--only`) or from a `--from` file
	// recorded against a different tree. Either way it must not write this
	// region: a partial report under a full-coverage claim is the same lie in a
	// smaller costume.
	const covered = specFiles;
	const expectedRuns = covered.length * stat.widths.length;
	if (measured.runsMeasured !== expectedRuns) {
		throw new Error(
			`the report carries ${measured.runsMeasured} route/width runs; this tree has ${covered.length} route specs at ${stat.widths.length} widths, which is ${expectedRuns}. That report is not a full pass of this tree, so it must not write the measured region. Rerun \`${MEASURED_SCRIPT}\` with no route filter${opts.from ? ', or drop --from' : ''}.`
		);
	}

	const selftest = opts.selftest ? runSelftest() : null;
	const fresh = assembleMeasured({ measured, selftest, head: gitHead(), date: new Date().toISOString(), covered });

	if (opts.check) {
		const problems = verifyBlock(readme, { live: stat, fresh, specFiles });
		if (problems.length) {
			console.error('readme-counts --check: the committed counts are stale or edited:');
			reportProblems(problems);
			return 1;
		}
		console.log('readme-counts --check: both counts regions agree with this tree and a fresh run.');
		return 0;
	}

	const next = spliceRegion(readme, MEASURED_REGION, renderMeasured(fresh));
	writeFileSync(README_PATH, next);
	console.log(`readme-counts: measured counts region rewritten in ${README_PATH}`);
	console.log(`  ${fresh.runsMeasured} runs, ${fresh.measurements} measurements, ${fresh.outside} outside threshold, ${(fresh.totalMs / 1000).toFixed(1)}s, measured on ${fresh.sha.slice(0, 7)}`);

	// THE MEASURED RUN NEVER WRITES THE STATIC REGION. Two generators, two
	// regions: a measured run that also rewrote the static half would put a
	// static-count diff into every browser session's commit, which is the
	// coupling this split exists to remove. It only says so.
	const stale = verifyStatic(next, stat);
	if (stale.length) {
		console.log('  note: the static counts region is stale on this tree. It is not this run\'s to write:');
		for (const p of stale) console.log(`    - ${p}`);
	}
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
	const { missing, removed } = unmeasuredSpecs(parsed.data, deriveSpecFiles());
	if (missing.length) {
		console.log(`  note: the measured counts region never measured ${missing.length} spec(s) in this tree: ${missing.join(', ')}`);
		if (parsed.data.outside === 0) {
			console.log(`        and it reports no measurement outside its threshold, which is a claim about a set that is missing them. \`npm test\` reddens on that pair; rerun \`${MEASURED_SCRIPT}\`.`);
		}
	}
	if (removed.length) {
		console.log(`  note: the measured counts region covered ${removed.length} spec(s) this tree no longer has: ${removed.join(', ')}`);
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
